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
    const envPassword = process.env.LABCLI_SSH_PASSWORD
    if (envPassword) {
      options.password = envPassword
      return options
    }

    const { password } = await inquirer.prompt<{ password: string }>([
      {
        type: 'password',
        name: 'password',
        message: '请输入 SSH 密码（或设置 LABCLI_SSH_PASSWORD）:',
        mask: '*',
      },
    ])

    options.password = password
  }

  return options
}
