import type { Command } from 'commander'
import inquirer from 'inquirer'
import chalk from 'chalk'
import { getConfig } from '../config/loader.js'
import { SSHClient } from '../ssh/client.js'

export function registerConnectCommand(program: Command): void {
  program
    .command('connect')
    .description('建立 SSH 连接到计算节点')
    .action(async () => {
      let client: SSHClient | null = null

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

        client = new SSHClient()
        console.log(chalk.blue(`正在连接 ${config.username}@${config.host}...`))

        await client.connect({
          host: config.host,
          port: config.port,
          username: config.username,
          authMethod: config.authMethod,
          privateKeyPath: config.privateKeyPath,
          password,
        })

        console.log(chalk.green(`✓ 已连接到 ${config.username}@${config.host}`))

        const channel = await client.shell()

        process.stdin.setRawMode?.(true)
        channel.pipe(process.stdout)
        process.stdin.pipe(channel as unknown as NodeJS.WritableStream)

        channel.on('close', () => {
          console.log(chalk.yellow('\n连接已断开'))
          client?.disconnect()
          process.exit(0)
        })

        process.on('SIGINT', () => {
          client?.disconnect()
          process.exit(0)
        })
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error)

        if (msg.includes('Authentication failed') || msg.includes('auth')) {
          console.error(chalk.red('认证失败，请检查用户名和密钥/密码'))
        } else if (msg.includes('ETIMEDOUT') || msg.includes('timeout') || msg.includes('Timeout')) {
          console.error(chalk.red('连接超时，请检查服务器地址和网络'))
        } else if (msg.includes('ECONNREFUSED') || msg.includes('refused')) {
          console.error(chalk.red('无法连接到服务器，请检查 SSH 服务是否运行'))
        } else {
          console.error(chalk.red(`连接失败: ${msg}`))
        }

        client?.disconnect()
        process.exitCode = 1
      }
    })
}
