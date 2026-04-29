import type { Command } from 'commander'
import chokidar from 'chokidar'
import chalk from 'chalk'
import { getConfig } from '../config/loader.js'
import { syncToRemote } from '../transfer/rsync.js'

function debounce<T extends unknown[]>(fn: (...args: T) => void, delay: number): (...args: T) => void {
  let timer: ReturnType<typeof setTimeout> | null = null

  return (...args: T) => {
    if (timer) {
      clearTimeout(timer)
    }

    timer = setTimeout(() => {
      timer = null
      fn(...args)
    }, delay)
  }
}

function globToRegex(pattern: string): RegExp {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*')

  return new RegExp(`(^|/)${escaped}($|/)`)
}

export function registerWatchCommand(program: Command): void {
  program
    .command('watch')
    .description('监听文件变化并自动同步')
    .option('--no-initial-sync', '跳过启动时的初始全量同步')
    .action(async (options) => {
      try {
        const config = await getConfig()
        const cwd = process.cwd()

        let syncing = false
        let pendingPath: string | undefined

        const doSync = async (changedFile?: string) => {
          if (syncing) {
            pendingPath = changedFile ?? pendingPath
            return
          }

          syncing = true
          const displayPath = changedFile ?? '(全量)'
          console.log(chalk.blue(`[watch] 同步中... (${displayPath})`))

          try {
            const result = await syncToRemote({
              localPath: cwd,
              remotePath: config.remotePath,
              host: config.host,
              username: config.username,
              excludePatterns: config.syncExclude,
              privateKeyPath: config.privateKeyPath,
              port: config.port,
            })
            console.log(chalk.green(`[watch] 同步完成 (${result.filesTransferred} files, ${(result.duration / 1000).toFixed(1)}s)`))
          } catch (err) {
            console.error(chalk.red(`[watch] 同步失败: ${err instanceof Error ? err.message : String(err)}`))
          } finally {
            syncing = false
            if (pendingPath !== undefined) {
              const path = pendingPath
              pendingPath = undefined
              doSync(path).catch(() => {})
            }
          }
        }

        const debouncedSync = debounce((changedFile?: string) => {
          doSync(changedFile).catch(() => {})
        }, 500)

        if (options.initialSync !== false) {
          await doSync()
        }

        const watcher = chokidar.watch(cwd, {
          ignored: config.syncExclude.map(globToRegex),
          ignoreInitial: true,
          awaitWriteFinish: { stabilityThreshold: 300 },
          depth: 10,
        })

        console.log(chalk.blue(`[watch] 监听 ${cwd} 的文件变化...`))

        watcher.on('change', (filePath: string) => {
          console.log(chalk.blue(`[watch] 检测到变化: ${filePath}`))
          debouncedSync(filePath)
        })

        watcher.on('add', (filePath: string) => {
          debouncedSync(filePath)
        })

        watcher.on('unlink', (filePath: string) => {
          debouncedSync(filePath)
        })

        const cleanup = async () => {
          console.log(chalk.yellow('\n[watch] 正在退出...'))
          await watcher.close()
          process.exit(0)
        }

        process.on('SIGINT', cleanup)
        process.on('SIGTERM', cleanup)
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error)
        console.error(chalk.red(`watch 失败: ${msg}`))
        process.exitCode = 1
      }
    })
}
