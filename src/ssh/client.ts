import { readFileSync } from 'fs'
import { Client, type ClientChannel, type ConnectConfig, type SFTPWrapper } from 'ssh2'
import type { SSHConnectionOptions, SSHExecResult } from '../types/index.js'
import { expandTilde } from '../utils/shell.js'

export class SSHClient {
  private readonly client: Client
  private connected = false

  constructor() {
    this.client = new Client()
    this.client.on('close', () => {
      this.connected = false
    })
    this.client.on('error', () => {
      // Keep a default listener registered to avoid unhandled errors.
    })
  }

  connect(options: SSHConnectionOptions): Promise<void> {
    return new Promise((resolve, reject) => {
      const config: ConnectConfig = {
        host: options.host,
        port: options.port,
        username: options.username,
        readyTimeout: 10000,
      }

      if (options.authMethod === 'key') {
        if (!options.privateKeyPath) {
          reject(new Error('密钥认证需要指定 privateKeyPath'))
          return
        }

        try {
          const resolvedKeyPath = expandTilde(options.privateKeyPath)
          config.privateKey = readFileSync(resolvedKeyPath)
        } catch {
          reject(new Error(`无法读取密钥文件: ${options.privateKeyPath}`))
          return
        }
      } else {
        config.password = options.password
      }

      const onReady = (): void => {
        cleanup()
        this.connected = true
        resolve()
      }

      const onError = (error: Error): void => {
        cleanup()
        this.connected = false
        reject(error)
      }

      const cleanup = (): void => {
        this.client.removeListener('ready', onReady)
        this.client.removeListener('error', onError)
      }

      this.client.on('ready', onReady)
      this.client.on('error', onError)
      this.client.connect(config)
    })
  }

  exec(command: string): Promise<SSHExecResult> {
    return new Promise((resolve, reject) => {
      if (!this.connected) {
        reject(new Error('SSH 未连接'))
        return
      }

      this.client.exec(command, (error, stream) => {
        if (error) {
          reject(error)
          return
        }

        let stdout = ''
        let stderr = ''
        let exitCode = 0

        stream.on('data', (data: Buffer | string) => {
          stdout += data.toString()
        })

        stream.stderr.on('data', (data: Buffer | string) => {
          stderr += data.toString()
        })

        stream.on('exit', (code: number | null) => {
          exitCode = code ?? 0
        })

        stream.on('close', () => {
          resolve({ stdout, stderr, exitCode })
        })

        stream.on('error', (streamError: Error) => {
          reject(streamError)
        })
      })
    })
  }

  execStream(command: string): Promise<ClientChannel> {
    return new Promise((resolve, reject) => {
      if (!this.connected) {
        reject(new Error('SSH 未连接'))
        return
      }

      this.client.exec(command, (error, stream) => {
        if (error) {
          reject(error)
          return
        }

        resolve(stream)
      })
    })
  }

  shell(): Promise<ClientChannel> {
    return new Promise((resolve, reject) => {
      if (!this.connected) {
        reject(new Error('SSH 未连接'))
        return
      }

      this.client.shell((error, stream) => {
        if (error) {
          reject(error)
          return
        }

        resolve(stream)
      })
    })
  }

  sftp(): Promise<SFTPWrapper> {
    return new Promise((resolve, reject) => {
      if (!this.connected) {
        reject(new Error('SSH 未连接'))
        return
      }

      this.client.sftp((error, sftp) => {
        if (error) {
          reject(error)
          return
        }

        resolve(sftp)
      })
    })
  }

  disconnect(): void {
    this.connected = false
    this.client.end()
  }

  isConnected(): boolean {
    return this.connected
  }
}
