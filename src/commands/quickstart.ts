import type { Command } from 'commander'
import inquirer from 'inquirer'
import chalk from 'chalk'
import ora from 'ora'
import { getConfig } from '../config/loader.js'
import { SSHClient } from '../ssh/client.js'
import { syncToRemote } from '../transfer/rsync.js'
import { checkGlobalConfig, checkProjectConfig } from '../utils/checks.js'
import { buildSSHOptions } from '../utils/ssh-helpers.js'
import { shellQuote } from '../utils/shell.js'
import { initGlobal, initProject } from './init.js'

function printSeparator(): void {
  console.log(chalk.dim('─'.repeat(40)))
}

function printCheckResult(label: string, ok: boolean, message: string, detail?: string): void {
  console.log(`${ok ? '✓' : '✗'} ${label}: ${message}`)

  if (detail) {
    console.log(chalk.dim(detail))
  }
}

export function registerQuickstartCommand(program: Command): void {
  program
    .command('quickstart')
    .description('交互式引导完成项目初始化和首次同步')
    .action(async () => {
      try {
      console.log(chalk.bold('🚀 欢迎使用 LabCLI 快速上手向导'))
      console.log('LabCLI 将帮助你完成以下步骤：')
        console.log('1. 检查环境 · 2. 全局配置 · 3. 项目配置 · 4. 远程环境 · 5. 代码同步')
        console.log('')

        printSeparator()
        console.log('步骤 1/5：环境检查')

        const globalCheck = await checkGlobalConfig()
        const projectCheck = await checkProjectConfig()

        printCheckResult('全局配置', globalCheck.ok, globalCheck.message, globalCheck.detail)
        printCheckResult('项目配置', projectCheck.ok, projectCheck.message, projectCheck.detail)
        console.log('')

        printSeparator()
        console.log('步骤 2/5：全局配置')

        if (!globalCheck.ok) {
          const { confirm } = await inquirer.prompt<{ confirm: boolean }>([
            {
              type: 'confirm',
              name: 'confirm',
              message: '全局配置未找到，现在初始化？',
              default: true,
            },
          ])

          if (confirm) {
            await initGlobal()
          } else {
            console.log(chalk.yellow('已跳过全局配置初始化'))
          }
        } else {
          console.log('✓ 全局配置已就绪，跳过')
        }
        console.log('')

        printSeparator()
        console.log('步骤 3/5：项目配置')

        if (!projectCheck.ok) {
          const { confirm } = await inquirer.prompt<{ confirm: boolean }>([
            {
              type: 'confirm',
              name: 'confirm',
              message: '项目配置未找到，现在初始化？',
              default: true,
            },
          ])

          if (confirm) {
            await initProject()
          } else {
            console.log(chalk.yellow('已跳过项目配置初始化'))
          }
        } else {
          console.log('✓ 项目配置已就绪，跳过')
        }
        console.log('')

        printSeparator()
        console.log('步骤 4/5：远程环境')

        const { confirm: setupConfirm } = await inquirer.prompt<{ confirm: boolean }>([
          {
            type: 'confirm',
            name: 'confirm',
            message: '是否现在创建远程目录和 conda 环境？',
            default: false,
          },
        ])

        if (setupConfirm) {
          try {
            const config = await getConfig()
            let client: SSHClient | null = new SSHClient()
            try {
              await client.connect(await buildSSHOptions(config))
              const spinner = ora('正在创建远程目录...').start()
              await client.exec(`mkdir -p ${shellQuote(config.remotePath)}`)
              spinner.succeed(chalk.green('✓ 远程目录已创建'))
            } finally {
              client?.disconnect()
              client = null
            }
          } catch (error) {
            console.log(chalk.yellow(`远程环境创建跳过: ${error instanceof Error ? error.message : String(error)}`))
      console.log(chalk.dim('可稍后运行 labcli setup'))
          }
        } else {
          console.log(chalk.yellow('已跳过远程环境创建'))
        }
        console.log('')

        printSeparator()
        console.log('步骤 5/5：代码同步')

        const { confirm: syncConfirm } = await inquirer.prompt<{ confirm: boolean }>([
          {
            type: 'confirm',
            name: 'confirm',
            message: '是否现在同步代码?',
            default: false,
          },
        ])

        if (syncConfirm) {
          try {
            const config = await getConfig()
            const spinner = ora('正在同步代码...').start()
            await syncToRemote({
              localPath: process.cwd(),
              remotePath: config.remotePath,
              host: config.host,
              username: config.username,
              excludePatterns: config.syncExclude,
              privateKeyPath: config.privateKeyPath,
              port: config.port,
            })
            spinner.succeed(chalk.green('✓ 代码同步完成'))
          } catch (error) {
            console.log(chalk.yellow(`同步跳过: ${error instanceof Error ? error.message : String(error)}`))
      console.log(chalk.dim('可稍后运行 labcli sync'))
          }
        } else {
          console.log(chalk.yellow('已跳过代码同步'))
        }
        console.log('')

        printSeparator()
        console.log(chalk.green('✓ 初始化完成！接下来：'))
      console.log('• labcli sync     同步代码')
      console.log('• labcli submit <script>  提交训练任务')
      console.log('• labcli status   查看任务状态')
       console.log('• labcli doctor   检查环境')
       } catch (error) {
         const msg = error instanceof Error ? error.message : String(error)
         console.error(chalk.red(`快速上手失败: ${msg}`))
         process.exitCode = 1
       }
    })
}
