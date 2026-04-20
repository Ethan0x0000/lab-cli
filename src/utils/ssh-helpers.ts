import inquirer from 'inquirer'
import type { MergedConfig, SSHConnectionOptions } from '../types/index.js'

export async function buildSSHOptions(config: MergedConfig): Promise<SSHConnectionOptions> {
  const options: SSHConnectionOptions = {
    host: config.host,
    port: config.port,
    username: config.username,
    authMethod: config.authMethod,
    privateKeyPath: config.privateKeyPath,
  }

  if (config.authMethod === 'password') {
    const { password } = await inquirer.prompt<{ password: string }>([
      {
        type: 'password',
        name: 'password',
        message: '请输入 SSH 密码:',
        mask: '*',
      },
    ])

    options.password = password
  }

  return options
}
