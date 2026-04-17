import type { Command } from 'commander'
import chalk from 'chalk'
import ora from 'ora'
import { getConfig } from '../config/loader.js'
import { syncToRemote } from '../transfer/rsync.js'

export function registerSyncCommand(program: Command): void {
  program
    .command('sync')
    .description('同步本地代码到远程服务器')
    .option('--dry-run', '仅显示将要同步的文件，不实际传输')
    .option('--exclude <patterns...>', '追加额外排除模式')
    .action(async (options) => {
      try {
        const config = await getConfig()

        const excludePatterns = [
          ...config.syncExclude,
          ...(options.exclude ?? []),
        ]

        const spinner = ora('正在同步代码...').start()

        if (options.dryRun) {
          spinner.text = '正在预览将要同步的文件（dry-run）...'
        }

        try {
          const result = await syncToRemote({
            localPath: process.cwd(),
            remotePath: config.remotePath,
            host: config.host,
            username: config.username,
            excludePatterns,
            dryRun: options.dryRun ?? false,
            privateKeyPath: config.privateKeyPath,
            port: config.port,
          })

          if (options.dryRun) {
            spinner.succeed(chalk.blue('dry-run 完成'))
          } else {
            spinner.succeed(
              chalk.green(
                `同步完成 (${result.filesTransferred} 个文件, ${(result.duration / 1000).toFixed(1)}s)`,
              ),
            )
          }
        } catch (error) {
          spinner.fail(chalk.red('同步失败'))
          throw error
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        console.error(chalk.red(`同步失败: ${message}`))
        process.exit(1)
      }
    })
}
