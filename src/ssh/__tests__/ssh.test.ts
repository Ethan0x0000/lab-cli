import { EventEmitter } from 'node:events'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SSHClient } from '../client.js'
import { SSHManager } from '../manager.js'
import type { MergedConfig, SSHExecResult } from '../../types/index.js'

type MockChannel = EventEmitter & {
  stderr: EventEmitter
}

type MockSSH2Client = EventEmitter & {
  lastConfig?: unknown
  nextConnectError?: Error
  nextExecError?: Error
  nextExecStream?: MockChannel
  nextShellError?: Error
  nextShellStream?: MockChannel
  nextSftpError?: Error
  nextSftpValue?: object
  connect: ReturnType<typeof vi.fn>
  exec: ReturnType<typeof vi.fn>
  shell: ReturnType<typeof vi.fn>
  sftp: ReturnType<typeof vi.fn>
  end: ReturnType<typeof vi.fn>
}

const createMockChannel = (): MockChannel => {
  const channel = new EventEmitter() as MockChannel
  channel.stderr = new EventEmitter()
  return channel
}

vi.mock('ssh2', async () => {
  const { EventEmitter } = await import('node:events')

  class MockClient extends EventEmitter {
    lastConfig?: unknown
    nextConnectError?: Error
    nextExecError?: Error
    nextExecStream?: MockChannel
    nextShellError?: Error
    nextShellStream?: MockChannel
    nextSftpError?: Error
    nextSftpValue?: object

    connect = vi.fn((config: unknown) => {
      this.lastConfig = config

      if (this.nextConnectError) {
        const error = this.nextConnectError
        this.nextConnectError = undefined
        this.emit('error', error)
        return this
      }

      this.emit('ready')
      return this
    })

    exec = vi.fn((command: string, callback: (error: Error | undefined, stream?: MockChannel) => void) => {
      if (this.nextExecError) {
        const error = this.nextExecError
        this.nextExecError = undefined
        callback(error)
        return this
      }

      callback(undefined, this.nextExecStream ?? createMockChannel())
      return this
    })

    shell = vi.fn((callback: (error: Error | undefined, stream?: MockChannel) => void) => {
      if (this.nextShellError) {
        const error = this.nextShellError
        this.nextShellError = undefined
        callback(error)
        return this
      }

      callback(undefined, this.nextShellStream ?? createMockChannel())
      return this
    })

    sftp = vi.fn((callback: (error: Error | undefined, sftp?: object) => void) => {
      if (this.nextSftpError) {
        const error = this.nextSftpError
        this.nextSftpError = undefined
        callback(error)
        return this
      }

      callback(undefined, this.nextSftpValue ?? { fastPut: vi.fn() })
      return this
    })

    end = vi.fn(() => {
      this.emit('close')
      return this
    })
  }

  return {
    Client: vi.fn(function MockSSH2ClientConstructor() {
      return new MockClient()
    }),
  }
})

vi.mock('fs', () => ({
  readFileSync: vi.fn((path: string) => {
    if (path.includes('missing')) {
      throw new Error('ENOENT')
    }

    return Buffer.from('mock-private-key')
  }),
}))

async function getLatestMockClient(): Promise<MockSSH2Client> {
  const ssh2Module = await import('ssh2')
  const instances = (ssh2Module.Client as unknown as ReturnType<typeof vi.fn>).mock.results
  const latest = instances[instances.length - 1]?.value as MockSSH2Client | undefined

  if (!latest) {
    throw new Error('未创建 mock ssh2 client')
  }

  return latest
}

const baseConfig: MergedConfig = {
  host: '10.0.0.1',
  port: 22,
  username: 'alice',
  authMethod: 'key',
  privateKeyPath: '~/.ssh/id_rsa',
  defaultRemotePath: '/home/alice',
  name: 'demo',
  remotePath: '/data/demo',
  syncExclude: [],
  condaPythonVersion: '3.11',
}

describe('SSHClient', () => {
  let client: SSHClient

  beforeEach(() => {
    vi.clearAllMocks()
    client = new SSHClient()
  })

  it('SSH 连接建立 - 密钥认证', async () => {
    await client.connect({
      host: '10.0.0.1',
      port: 22,
      username: 'user',
      authMethod: 'key',
      privateKeyPath: '~/.ssh/id_rsa',
    })

    const mockClient = await getLatestMockClient()

    expect(mockClient.connect).toHaveBeenCalledWith(
      expect.objectContaining({
        host: '10.0.0.1',
        port: 22,
        username: 'user',
        readyTimeout: 10000,
        privateKey: expect.any(Buffer),
      }),
    )
    expect(mockClient.listenerCount('error')).toBeGreaterThan(0)
    expect(client.isConnected()).toBe(true)
  })

  it('密钥认证缺少 privateKeyPath 时抛错', async () => {
    await expect(client.connect({
      host: '10.0.0.1',
      port: 22,
      username: 'user',
      authMethod: 'key',
    })).rejects.toThrow('密钥认证需要指定 privateKeyPath')
  })

  it('密码认证连接', async () => {
    await client.connect({
      host: '10.0.0.1',
      port: 22,
      username: 'user',
      authMethod: 'password',
      password: 'secret',
    })

    const mockClient = await getLatestMockClient()

    expect(mockClient.connect).toHaveBeenCalledWith(
      expect.objectContaining({
        password: 'secret',
      }),
    )
    expect(client.isConnected()).toBe(true)
  })

  it('SSH 命令执行 - 返回正确结果', async () => {
    await client.connect({
      host: '10.0.0.1',
      port: 22,
      username: 'user',
      authMethod: 'key',
      privateKeyPath: '~/.ssh/id_rsa',
    })

    const mockClient = await getLatestMockClient()
    const channel = createMockChannel()
    mockClient.nextExecStream = channel

    const resultPromise = client.exec('hostname')

    queueMicrotask(() => {
      channel.emit('data', Buffer.from('node01\n'))
      channel.stderr.emit('data', Buffer.from('warning\n'))
      channel.emit('close', 0)
    })

    const result: SSHExecResult = await resultPromise
    expect(result).toEqual({
      stdout: 'node01\n',
      stderr: 'warning\n',
      exitCode: 0,
    })
  })

  it('未连接时 exec 抛出错误', async () => {
    await expect(client.exec('hostname')).rejects.toThrow('SSH 未连接')
  })

  it('execStream 返回 ClientChannel', async () => {
    await client.connect({
      host: '10.0.0.1',
      port: 22,
      username: 'user',
      authMethod: 'key',
      privateKeyPath: '~/.ssh/id_rsa',
    })

    const mockClient = await getLatestMockClient()
    const channel = createMockChannel()
    mockClient.nextExecStream = channel

    await expect(client.execStream('tail -f /tmp/app.log')).resolves.toBe(channel)
  })

  it('shell 返回交互式 channel', async () => {
    await client.connect({
      host: '10.0.0.1',
      port: 22,
      username: 'user',
      authMethod: 'key',
      privateKeyPath: '~/.ssh/id_rsa',
    })

    const mockClient = await getLatestMockClient()
    const channel = createMockChannel()
    mockClient.nextShellStream = channel

    await expect(client.shell()).resolves.toBe(channel)
  })

  it('sftp 返回 SFTP 会话', async () => {
    await client.connect({
      host: '10.0.0.1',
      port: 22,
      username: 'user',
      authMethod: 'key',
      privateKeyPath: '~/.ssh/id_rsa',
    })

    const mockClient = await getLatestMockClient()
    const sftp = { fastPut: vi.fn() }
    mockClient.nextSftpValue = sftp

    await expect(client.sftp()).resolves.toBe(sftp)
  })

  it('SSH 连接清理 - disconnect 调用 client.end()', async () => {
    await client.connect({
      host: '10.0.0.1',
      port: 22,
      username: 'user',
      authMethod: 'key',
      privateKeyPath: '~/.ssh/id_rsa',
    })

    const mockClient = await getLatestMockClient()
    client.disconnect()

    expect(mockClient.end).toHaveBeenCalledTimes(1)
    expect(client.isConnected()).toBe(false)
  })

  it('连接错误会向上抛出', async () => {
    const mockClient = await getLatestMockClient()
    mockClient.nextConnectError = new Error('Timeout')

    await expect(client.connect({
      host: '10.0.0.1',
      port: 22,
      username: 'user',
      authMethod: 'key',
      privateKeyPath: '~/.ssh/id_rsa',
    })).rejects.toThrow('Timeout')
  })
})

describe('SSHManager', () => {
  let manager: SSHManager

  beforeEach(() => {
    vi.clearAllMocks()
    manager = new SSHManager()
  })

  afterEach(async () => {
    await manager.closeAll()
  })

  it('getConnection 复用已连接实例', async () => {
    const first = await manager.getConnection(baseConfig)
    const second = await manager.getConnection(baseConfig)

    expect(second).toBe(first)
  })

  it('closeAll 关闭并清空所有连接', async () => {
    const first = await manager.getConnection(baseConfig)
    const second = await manager.getConnection({
      ...baseConfig,
      host: '10.0.0.2',
    })

    await manager.closeAll()

    expect(first.isConnected()).toBe(false)
    expect(second.isConnected()).toBe(false)

    const reconnected = await manager.getConnection(baseConfig)
    expect(reconnected).not.toBe(first)
  })
})
