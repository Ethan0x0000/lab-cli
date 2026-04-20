import type { Command } from 'commander'
import chalk from 'chalk'
import { getConfig } from '../config/loader.js'
import { SSHClient } from '../ssh/client.js'
import { buildSSHOptions } from '../utils/ssh-helpers.js'
import { shellQuote } from '../utils/shell.js'

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
        await client.connect(await buildSSHOptions(config))

        if (!jobId) {
          console.error(chalk.red('请指定 jobId'))
          throw new Error('请指定 jobId')
        }

        const scontrolResult = await client.exec(`scontrol show job ${shellQuote(jobId)}`)
        if (scontrolResult.exitCode !== 0) {
          console.error(chalk.red(`无法获取任务信息: ${scontrolResult.stderr}`))
          throw new Error(scontrolResult.stderr)
        }

        const pathKey = options.error ? 'StdErr' : 'StdOut'
        const match = scontrolResult.stdout.match(new RegExp(`${pathKey}=([^\\s]+)`))
        if (!match) {
          console.error(chalk.red('无法找到日志文件路径'))
          throw new Error('无法找到日志文件路径')
        }

        const logPath = match[1]

        const tailNum = parseInt(options.tail, 10)
        if (!Number.isFinite(tailNum) || tailNum < 1) {
          throw new Error('--tail 参数必须是正整数')
        }

        if (options.follow) {
          const channel = await client.execStream(`tail -n ${shellQuote(String(tailNum))} -f ${shellQuote(logPath)}`)
          channel.pipe(process.stdout)
          await new Promise<void>((resolve, reject) => {
            const cleanup = () => {
              process.off('SIGINT', onSigint)
              channel.off('close', onClose)
              channel.off('error', onError)
            }
            const onClose = () => {
              cleanup()
              resolve()
            }
            const onError = (error: Error) => {
              cleanup()
              reject(error)
            }
            const onSigint = () => {
              cleanup()
              resolve()
            }

            channel.on('close', onClose)
            channel.on('error', onError)
            process.on('SIGINT', onSigint)
          })
        } else {
          const result = await client.exec(`tail -n ${shellQuote(String(tailNum))} ${shellQuote(logPath)}`)

          if (result.exitCode !== 0) {
            if (result.stderr.includes('No such file')) {
              console.error(chalk.red(`日志文件不存在: ${logPath}`))
            } else {
              console.error(chalk.red(`读取日志失败: ${result.stderr}`))
            }
            throw new Error(result.stderr)
          }

          process.stdout.write(result.stdout)
        }
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error)
        console.error(chalk.red(`查看日志失败: ${msg}`))
        process.exitCode = 1
      } finally {
        client?.disconnect()
      }
    })
}
