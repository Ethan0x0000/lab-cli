import { SSHClient } from './client.js'
import type { MergedConfig, SSHConnectionOptions } from '../types/index.js'

export class SSHManager {
  private readonly connections = new Map<string, SSHClient>()

  private getKey(config: MergedConfig): string {
    return `${config.username}@${config.host}:${config.port}`
  }

  async getConnection(config: MergedConfig): Promise<SSHClient> {
    const key = this.getKey(config)
    const existing = this.connections.get(key)

    if (existing?.isConnected()) {
      return existing
    }

    const client = new SSHClient()
    const options: SSHConnectionOptions = {
      host: config.host,
      port: config.port,
      username: config.username,
      authMethod: config.authMethod,
      privateKeyPath: config.privateKeyPath,
      password: config.password,
    }

    await client.connect(options)
    this.connections.set(key, client)
    return client
  }

  async closeAll(): Promise<void> {
    for (const client of this.connections.values()) {
      client.disconnect()
    }

    this.connections.clear()
  }
}

export const sshManager = new SSHManager()

process.on('exit', () => {
  void sshManager.closeAll()
})

process.on('SIGINT', () => {
  sshManager.closeAll()
    .then(() => {
      process.exit(0)
    })
    .catch(() => {
      process.exit(1)
    })
})
