import type { Command } from 'commander'
import inquirer from 'inquirer'
import chalk from 'chalk'
import { getConfig } from '../config/loader.js'
import { sshManager } from '../ssh/manager.js'
import { handleCliError } from '../utils/errors.js'

export function registerConnectCommand(program: Command): void {
  program
    .command('connect')
    .description('建立 SSH 连接到计算节点')
    .action(async () => {
      try {
        const config = await getConfig()

        let password: string | undefined
        if (config.authMethod === 'password') {
          const { pwd } = await inquirer.prompt([
            {
              type: 'password',
              name: 'pwd',
              message: '请输入 SSH 密码:',
              mask: '*',
            },
          ])
          password = pwd
        }

        console.log(chalk.blue(`正在连接 ${config.username}@${config.host}...`))

        const configWithPassword = { ...config, password }
        const client = await sshManager.getConnection(configWithPassword)

        console.log(chalk.green(`✓ 已连接到 ${config.username}@${config.host}`))

        const channel = await client.shell()

        process.stdin.setRawMode?.(true)
        channel.pipe(process.stdout)
        process.stdin.pipe(channel as unknown as NodeJS.WritableStream)

        channel.on('close', () => {
          console.log(chalk.yellow('\n连接已断开'))
          client.disconnect()
          process.exit(0)
        })

        process.on('SIGINT', () => {
          client.disconnect()
          process.exit(0)
        })
      } catch (error) {
        handleCliError(error, '连接失败')
        process.exit(1)
      }
    })
}
