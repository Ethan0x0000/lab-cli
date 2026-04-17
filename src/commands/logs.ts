import type { Command } from 'commander'
import chalk from 'chalk'
import { getConfig } from '../config/loader.js'
import { SSHClient } from '../ssh/client.js'

export function registerLogsCommand(program: Command): void {
  program
    .command('logs [jobId]')
    .description('查看训练日志')
    .option('-f, --follow', '实时跟踪日志')
    .option('--tail <n>', '显示最后 n 行', '50')
    .option('--output', '查看 stdout 日志（默认）')
    .option('--error', '查看 stderr 日志')
    .action(async (jobId: string | undefined, options) => {
      let client: SSHClient | null = null

      try {
        const config = await getConfig()
        client = new SSHClient()
        await client.connect({
          host: config.host,
          port: config.port,
          username: config.username,
          authMethod: config.authMethod,
          privateKeyPath: config.privateKeyPath,
        })

        let logPath: string
        if (jobId) {
          const scontrolResult = await client.exec(`scontrol show job ${jobId}`)
          if (scontrolResult.exitCode !== 0) {
            console.error(chalk.red(`无法获取任务信息: ${scontrolResult.stderr}`))
            process.exit(1)
          }

          const pathKey = options.error ? 'StdErr' : 'StdOut'
          const match = scontrolResult.stdout.match(new RegExp(`${pathKey}=([^\\s]+)`))
          if (!match) {
            console.error(chalk.red('无法找到日志文件路径'))
            process.exit(1)
          }

          logPath = match[1]
        } else {
          console.error(chalk.red('请指定 jobId'))
          process.exit(1)
          return
        }

        if (options.follow) {
          const channel = await client.execStream(`tail -f ${logPath}`)
          channel.pipe(process.stdout)
          channel.on('close', () => {
            client?.disconnect()
            process.exit(0)
          })
          process.on('SIGINT', () => {
            client?.disconnect()
            process.exit(0)
          })
        } else {
          const tailLines = options.tail ?? '50'
          const result = await client.exec(`tail -n ${tailLines} ${logPath}`)

          if (result.exitCode !== 0) {
            if (result.stderr.includes('No such file')) {
              console.error(chalk.red(`日志文件不存在: ${logPath}`))
            } else {
              console.error(chalk.red(`读取日志失败: ${result.stderr}`))
            }
            process.exit(1)
          }

          process.stdout.write(result.stdout)
        }
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error)
        console.error(chalk.red(`查看日志失败: ${msg}`))
        client?.disconnect()
        process.exit(1)
      }
    })
}
