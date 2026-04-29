import type { Command } from 'commander'
import chalk from 'chalk'
import { getConfig } from '../config/loader.js'
import { parseSqueueFormat, parseSqueueJson } from '../slurm/parser.js'
import { shellQuote } from '../utils/shell.js'
import { sshManager } from '../ssh/manager.js'
import { handleCliError } from '../utils/errors.js'
import type { SlurmJobInfo } from '../types/index.js'

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
      try {
        const config = await getConfig()
        const client = await sshManager.getConnection(config)

        let squeueCmd = 'squeue --json'
        if (!options.all) squeueCmd += ` --user=${shellQuote(config.username)}`
        if (options.jobId) squeueCmd += ` --jobs=${shellQuote(options.jobId)}`

        let jobs: SlurmJobInfo[] = []
        let jsonParsed = false

        const result = await client.exec(squeueCmd)

        if (result.exitCode === 0 && result.stdout.trim()) {
          try {
            jobs = parseSqueueJson(result.stdout)
            jsonParsed = true
          } catch {
            // JSON parse failed, fall through to text format
          }
        }

        if (!jsonParsed) {
          let textCmd = 'squeue --format="%i %P %j %D %T %M %l" --noheader'
          if (!options.all) textCmd += ` --user=${shellQuote(config.username)}`
          if (options.jobId) textCmd += ` --jobs=${shellQuote(options.jobId)}`

          const fallbackResult = await client.exec(textCmd)

          if (fallbackResult.exitCode !== 0 && !fallbackResult.stdout.trim()) {
            if (fallbackResult.stderr?.includes('Invalid job id')) {
              throw new Error(`squeue 命令失败: ${fallbackResult.stderr || '未知错误'}`)
            }
          }

          if (fallbackResult.stdout.trim()) {
            jobs = parseSqueueFormat(fallbackResult.stdout)
            console.log(chalk.dim('ℹ Slurm --json 不可用，已使用文本格式解析'))
          }
        }

        if (jobs.length === 0) {
        console.log(chalk.yellow(`${config.username} 当前没有活跃任务 — 用 labcli submit <script> 提交新任务`))
          return
        }

        // Count job states
        const stateCounts = {
          running: 0,
          pending: 0,
          completed: 0,
          failed: 0,
        }
        for (const job of jobs) {
          const state = job.state.toUpperCase()
          if (state === 'RUNNING') stateCounts.running++
          else if (state === 'PENDING') stateCounts.pending++
          else if (state === 'COMPLETED') stateCounts.completed++
          else if (state === 'FAILED' || state === 'TIMEOUT') stateCounts.failed++
        }

        // Print summary header
        const separator = '─'.repeat(50)
        console.log(chalk.dim(separator))
        console.log(`查询时间: ${new Date().toLocaleString('zh-CN')}`)
        console.log(`用户: ${config.username}`)
        console.log(`运行中: ${stateCounts.running} | 等待中: ${stateCounts.pending} | 已完成: ${stateCounts.completed} | 失败: ${stateCounts.failed}`)
        console.log(chalk.dim(separator))

        const header = `${'JobID'.padEnd(10)} ${'Name'.padEnd(20)} ${'State'.padEnd(12)} ${'Partition'.padEnd(12)} ${'Nodes'.padEnd(6)} ${'GPUs'.padEnd(6)} ${'Time'}`
        console.log(chalk.bold(header))
        console.log('─'.repeat(header.length))

        for (const job of jobs) {
          const row = `${job.jobId.padEnd(10)} ${job.name.padEnd(20).slice(0, 20)} ${colorizeState(job.state).padEnd(12)} ${job.partition.padEnd(12)} ${String(job.nodes).padEnd(6)} ${String(job.gpus).padEnd(6)} ${job.timeUsed}`
          console.log(row)
        }

        // Print footer
        console.log(chalk.dim(`共 ${jobs.length} 个任务 | 查询于 ${new Date().toLocaleTimeString('zh-CN')}`))
      } catch (error) {
        handleCliError(error, '获取状态失败')
      }
    })
}
