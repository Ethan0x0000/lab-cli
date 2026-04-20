import type { Command } from 'commander'
import inquirer from 'inquirer'
import chalk from 'chalk'
import { checkGlobalConfig, checkProjectConfig } from '../utils/checks.js'
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
        console.log(chalk.bold('🚀 欢迎使用 lab-cli 快速上手向导'))
        console.log('lab-cli 将帮助你完成以下步骤：')
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
          console.log(chalk.blue('提示: 运行 lab-cli setup 创建远程环境'))
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
          console.log(chalk.blue('提示: 运行 lab-cli sync 同步代码'))
        } else {
          console.log(chalk.yellow('已跳过代码同步'))
        }
        console.log('')

        printSeparator()
        console.log(chalk.green('✓ 初始化完成！接下来：'))
        console.log('• lab-cli sync     同步代码')
        console.log('• lab-cli submit <script>  提交训练任务')
        console.log('• lab-cli status   查看任务状态')
        console.log('• lab-cli doctor   检查环境')
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error)
        console.error(chalk.red(`快速上手失败: ${msg}`))
        process.exit(1)
      }
    })
}
