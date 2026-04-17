import type { Command } from 'commander'
import chalk from 'chalk'
import { getConfig } from '../config/loader.js'
import { SSHClient } from '../ssh/client.js'
import { buildSbatchCommand } from '../slurm/commands.js'
import { syncToRemote } from '../transfer/rsync.js'

export function registerSubmitCommand(program: Command): void {
  program
    .command('submit <script>')
    .description('提交 Slurm 训练任务')
    .option('--partition <name>', '覆盖配置中的分区')
    .option('--gpus <n>', 'GPU 数量', Number.parseInt)
    .option('--nodes <n>', '节点数量', Number.parseInt)
    .option('--time <HH:MM:SS>', '时间限制')
    .option('--name <jobName>', '作业名称')
    .option('--output <path>', 'stdout 输出文件路径')
    .option('--error <path>', 'stderr 输出文件路径')
    .option('--sync', '提交前先同步代码')
    .option('--dry-run', '仅显示将要执行的命令')
    .action(async (script: string, options) => {
      let client: SSHClient | null = null

      try {
        const config = await getConfig()

        if (options.sync) {
          console.log(chalk.blue('正在同步代码...'))
          await syncToRemote({
            localPath: process.cwd(),
            remotePath: config.remotePath,
            host: config.host,
            username: config.username,
            excludePatterns: config.syncExclude,
            privateKeyPath: config.privateKeyPath,
            port: config.port,
          })
          console.log(chalk.green('✓ 代码同步完成'))
        }

        const sbatchCmd = buildSbatchCommand(script, {
          partition: options.partition ?? config.slurmPartition,
          gpus: options.gpus ?? config.slurmGpus,
          nodes: options.nodes ?? config.slurmNodes,
          time: options.time,
          jobName: options.name ?? config.name,
          output: options.output,
          error: options.error,
        })

        if (options.dryRun) {
          console.log(chalk.blue('将要执行:'), sbatchCmd)
          return
        }

        client = new SSHClient()
        await client.connect({
          host: config.host,
          port: config.port,
          username: config.username,
          authMethod: config.authMethod,
          privateKeyPath: config.privateKeyPath,
        })

        const result = await client.exec(sbatchCmd)

        if (result.exitCode !== 0) {
          console.error(chalk.red(`提交失败: ${result.stderr}`))
          process.exit(1)
        }

        const match = result.stdout.match(/Submitted batch job (\d+)/)
        const jobId = match?.[1] ?? 'unknown'

        console.log(chalk.green('✓ 任务已提交'))
        console.log(`  JobID: ${chalk.bold(jobId)}`)

        if (options.partition ?? config.slurmPartition) {
          console.log(`  分区: ${options.partition ?? config.slurmPartition}`)
        }

        if (options.gpus ?? config.slurmGpus) {
          console.log(`  GPU: ${options.gpus ?? config.slurmGpus}`)
        }
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error)
        console.error(chalk.red(`提交失败: ${msg}`))
        process.exit(1)
      } finally {
        client?.disconnect()
      }
    })
}
