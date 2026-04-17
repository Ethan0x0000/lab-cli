import type { Command } from 'commander'
import chalk from 'chalk'
import { getConfig } from '../config/loader.js'
import { SSHClient } from '../ssh/client.js'
import { parseSqueueFormat, parseSqueueJson } from '../slurm/parser.js'

function colorizeState(state: string): string {
  switch (state.toUpperCase()) {
    case 'RUNNING':
      return chalk.green(state)
    case 'PENDING':
      return chalk.yellow(state)
    case 'FAILED':
    case 'TIMEOUT':
      return chalk.red(state)
    default:
      return chalk.gray(state)
  }
}

export function registerStatusCommand(program: Command): void {
  program
    .command('status')
    .description('查看 Slurm 任务状态')
    .option('--job-id <id>', '查看特定任务详情')
    .option('--all', '查看所有用户的任务')
    .action(async (options) => {
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

        let squeueCmd = 'squeue --json'
        if (!options.all) squeueCmd += ` --user=${config.username}`
        if (options.jobId) squeueCmd += ` --jobs=${options.jobId}`

        const result = await client.exec(squeueCmd)
        let jobs = []

        try {
          jobs = parseSqueueJson(result.stdout)
        } catch {
          jobs = parseSqueueFormat(result.stdout)
        }

        if (jobs.length === 0) {
          console.log(chalk.yellow('当前没有运行中的任务'))
          return
        }

        const header = `${'JobID'.padEnd(10)} ${'Name'.padEnd(20)} ${'State'.padEnd(12)} ${'Partition'.padEnd(12)} ${'Nodes'.padEnd(6)} ${'GPUs'.padEnd(6)} ${'Time'}`
        console.log(chalk.bold(header))
        console.log('─'.repeat(header.length))

        for (const job of jobs) {
          const row = `${job.jobId.padEnd(10)} ${job.name.padEnd(20).slice(0, 20)} ${colorizeState(job.state).padEnd(12)} ${job.partition.padEnd(12)} ${String(job.nodes).padEnd(6)} ${String(job.gpus).padEnd(6)} ${job.timeUsed}`
          console.log(row)
        }
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error)
        console.error(chalk.red(`获取状态失败: ${msg}`))
        process.exit(1)
      } finally {
        client?.disconnect()
      }
    })
}
