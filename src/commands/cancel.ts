import type { Command } from 'commander'
import chalk from 'chalk'
import inquirer from 'inquirer'
import { getConfig } from '../config/loader.js'
import { SSHClient } from '../ssh/client.js'
import { buildScancelCommand } from '../slurm/commands.js'
import { parseSqueueJson } from '../slurm/parser.js'

export function registerCancelCommand(program: Command): void {
  program
    .command('cancel [jobId]')
    .description('取消 Slurm 任务')
    .option('--all', '取消当前用户的所有任务')
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

        if (options.all) {
          const squeueResult = await client.exec(`squeue --json --user=${config.username}`)
          let jobCount = 0

          try {
            const jobs = parseSqueueJson(squeueResult.stdout)
            jobCount = jobs.length

            if (jobCount === 0) {
              console.log(chalk.yellow('没有运行中的任务'))
              return
            }

            console.log(chalk.yellow(`将取消 ${jobCount} 个任务:`))
            jobs.forEach(job => {
              console.log(`  ${job.jobId}: ${job.name} (${job.state})`)
            })
          } catch {
            console.log(chalk.yellow('将取消所有任务'))
          }

          const { confirm } = await inquirer.prompt([
            {
              type: 'confirm',
              name: 'confirm',
              message: '确认取消所有任务？',
              default: false,
            },
          ])

          if (!confirm) {
            console.log(chalk.yellow('已取消操作'))
            return
          }

          const cancelResult = await client.exec(`scancel --user=${config.username} --ctld`)
          if (cancelResult.exitCode !== 0) {
            console.error(chalk.red(`取消失败: ${cancelResult.stderr}`))
            process.exit(1)
          }

          console.log(chalk.green('✓ 所有任务已取消'))
          return
        }

        if (jobId) {
          const cancelCmd = buildScancelCommand(jobId)
          const result = await client.exec(cancelCmd)

          if (result.exitCode !== 0) {
            console.error(chalk.red(`取消失败: ${result.stderr || 'Invalid job id'}`))
            process.exit(1)
          }

          console.log(chalk.green(`✓ 任务 ${jobId} 已取消`))
          return
        }

        console.error(chalk.red('请提供 jobId 或使用 --all 取消所有任务'))
        process.exit(1)
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error)
        console.error(chalk.red(`取消失败: ${msg}`))
        process.exit(1)
      } finally {
        client?.disconnect()
      }
    })
}
