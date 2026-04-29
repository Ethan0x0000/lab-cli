import { SSHClient } from '../ssh/client.js'
import { syncToRemote } from '../transfer/rsync.js'
import { shellQuote } from '../utils/shell.js'
import { buildSSHOptions } from '../utils/ssh-helpers.js'
import type { CommandResult, RemoteExecution } from './types.js'
import type { MergedConfig } from '../types/index.js'

export class SSHExecution implements RemoteExecution {
  private client: SSHClient | null = null
  private config: MergedConfig

  constructor(config: MergedConfig) {
    this.config = config
  }

  private async getClient(): Promise<SSHClient> {
    if (this.client?.isConnected()) {
      return this.client
    }
    this.client = new SSHClient()
    await this.client.connect(await buildSSHOptions(this.config))
    return this.client
  }

  async run(command: string, env?: Record<string, string>): Promise<CommandResult> {
    const client = await this.getClient()
    let remoteCommand = command
    if (env) {
      const envPrefix = Object.entries(env)
        .map(([k, v]) => `${k}=${shellQuote(String(v))}`)
        .join(' ')
      remoteCommand = `env ${envPrefix} ${command}`
    }
    const result = await client.exec(remoteCommand)
    return { command, stdout: result.stdout, stderr: result.stderr, exitCode: result.exitCode, failed: result.exitCode !== 0 }
  }

  async uploadFolder(localPath: string, remotePath: string): Promise<void> {
    await syncToRemote({
      localPath,
      remotePath,
      host: this.config.host,
      username: this.config.username,
      excludePatterns: this.config.syncExclude,
      privateKeyPath: this.config.privateKeyPath,
      port: this.config.port,
    })
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async downloadFolder(remotePath: string, localPath: string): Promise<void> {
    throw new Error('下载文件夹功能尚未实现')
  }

  disconnect(): void {
    this.client?.disconnect()
    this.client = null
  }
}
