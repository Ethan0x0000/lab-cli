import type { Command } from 'commander'
import chalk from 'chalk'
import inquirer from 'inquirer'
import { getConfig } from '../config/loader.js'
import { SSHClient } from '../ssh/client.js'
import { buildSbatchCommand, type SbatchOptions } from '../slurm/commands.js'
import { getPreset, getPresetOptions, listPresets } from '../slurm/presets.js'
import { syncToRemote } from '../transfer/rsync.js'
import { buildSSHOptions } from '../utils/ssh-helpers.js'

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
    .option('--preset <name>', '使用资源预设 (debug/single-gpu/multi-gpu/full-node)')
    .option('--guide', '交互式选择资源配置')
    .option('--sync', '提交前先同步代码')
    .option('--dry-run', '仅显示将要执行的命令')
    .action(async (script: string, options) => {
      let client: SSHClient | null = null

      try {
        let selectedPreset = options.preset as string | undefined

        if (options.guide) {
          const answers = await inquirer.prompt<{ selectedPreset: string }>([
            {
              type: 'list',
              name: 'selectedPreset',
              message: '选择资源预设:',
              choices: listPresets().map((preset) => ({
                name: `[${preset.name}] — ${preset.description}`,
                value: preset.name,
              })),
            },
          ])

          selectedPreset = answers.selectedPreset
        }

        let presetOptions: SbatchOptions | undefined

        if (selectedPreset) {
          const preset = getPreset(selectedPreset)

          if (!preset) {
            const availablePresets = listPresets().map((item) => item.name).join(', ')
            console.error(chalk.red(`提交失败: 未知预设 ${selectedPreset}。可用预设: ${availablePresets}`))
            process.exit(1)
          }

          presetOptions = getPresetOptions(selectedPreset)
          console.log(chalk.blue(`使用预设 ${preset.name}: ${preset.description}`))
        }

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
          partition: options.partition ?? presetOptions?.partition ?? config.slurmPartition,
          gpus: options.gpus ?? presetOptions?.gpus ?? config.slurmGpus,
          nodes: options.nodes ?? presetOptions?.nodes ?? config.slurmNodes,
          time: options.time ?? presetOptions?.time,
          jobName: options.name ?? config.name,
          output: options.output,
          error: options.error,
        })

        if (options.dryRun) {
          console.log(chalk.blue('将要执行:'), sbatchCmd)
          return
        }

        client = new SSHClient()
        await client.connect(await buildSSHOptions(config))

        const result = await client.exec(sbatchCmd)

        if (result.exitCode !== 0) {
          console.error(chalk.red(`提交失败: ${result.stderr}`))
          throw new Error(result.stderr)
        }

        const match = result.stdout.match(/Submitted batch job (\d+)/)
        const jobId = match?.[1] ?? 'unknown'

        console.log(chalk.green('✓ 任务已提交'))
        console.log(`  JobID: ${chalk.bold(jobId)}`)

        const resolvedPartition = options.partition ?? presetOptions?.partition ?? config.slurmPartition
        const resolvedGpus = options.gpus ?? presetOptions?.gpus ?? config.slurmGpus

        if (resolvedPartition) {
          console.log(`  分区: ${resolvedPartition}`)
        }

        if (resolvedGpus) {
          console.log(`  GPU: ${resolvedGpus}`)
        }
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error)
        console.error(chalk.red(`提交失败: ${msg}`))
        process.exitCode = 1
      } finally {
        client?.disconnect()
      }
    })
}
