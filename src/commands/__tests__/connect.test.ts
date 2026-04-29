import { EventEmitter } from 'node:events'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Command } from 'commander'
import type { MergedConfig } from '../../types/index.js'

vi.mock('../../config/loader.js', () => ({
  getConfig: vi.fn(),
}))

vi.mock('../../ssh/manager.js', () => {
  const manager = {
    getConnection: vi.fn(),
    closeAll: vi.fn(),
  }
  return {
    sshManager: manager,
  }
})

vi.mock('inquirer', () => ({
  default: { prompt: vi.fn() },
}))

vi.mock('chalk', () => ({
  default: {
    blue: (s: string) => s,
    green: (s: string) => s,
    yellow: (s: string) => s,
    red: (s: string) => s,
  },
}))

class ExitCalled extends Error {
  constructor(readonly code: number) {
    super(`EXIT:${code}`)
  }
}

class MockChannel extends EventEmitter {
  pipe = vi.fn().mockReturnThis()
}

type MockClientInstance = {
  connect: ReturnType<typeof vi.fn>
  shell: ReturnType<typeof vi.fn>
  disconnect: ReturnType<typeof vi.fn>
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

const originalSetRawMode = process.stdin.setRawMode

async function setupCommand(): Promise<Command> {
  const { registerConnectCommand } = await import('../connect.js')
  const program = new Command()
  registerConnectCommand(program)
  return program
}

async function runConnectCommand(program: Command): Promise<void> {
    await program.parseAsync(['node', 'labcli', 'connect'])
}

describe('connect 命令', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    Object.defineProperty(process.stdin, 'setRawMode', {
      value: vi.fn(),
      configurable: true,
    })
  })

  afterEach(() => {
    Object.defineProperty(process.stdin, 'setRawMode', {
      value: originalSetRawMode,
      configurable: true,
    })
  })

  it('connect 命令注册到 Commander', async () => {
    const program = await setupCommand()

    const cmd = program.commands.find((command) => command.name() === 'connect')

    expect(cmd).toBeDefined()
    expect(cmd?.description()).toContain('SSH')
  })

  it('连接成功流程 - 密钥认证', async () => {
    const { getConfig } = await import('../../config/loader.js')
    const { sshManager } = await import('../../ssh/manager.js')
    const inquirer = (await import('inquirer')).default
    const channel = new MockChannel()
    const client: MockClientInstance = {
      connect: vi.fn().mockResolvedValue(undefined),
      shell: vi.fn().mockResolvedValue(channel),
      disconnect: vi.fn(),
    }
    const stdoutPipeSpy = vi.spyOn(process.stdin, 'pipe').mockImplementation(((destination: NodeJS.WritableStream) => destination) as typeof process.stdin.pipe)
    const processOnSpy = vi.spyOn(process, 'on').mockImplementation((() => process) as typeof process.on)
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined)

    vi.mocked(getConfig).mockResolvedValue(baseConfig)
    vi.mocked(sshManager.getConnection).mockResolvedValue(client as never)

    const program = await setupCommand()
    await runConnectCommand(program)

    expect(inquirer.prompt).not.toHaveBeenCalled()
    expect(sshManager.getConnection).toHaveBeenCalledWith({
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
      password: undefined,
    })
    expect(client.shell).toHaveBeenCalledTimes(1)
    expect(process.stdin.setRawMode).toHaveBeenCalledWith(true)
    expect(channel.pipe).toHaveBeenCalledWith(process.stdout)
    expect(stdoutPipeSpy).toHaveBeenCalledWith(channel)
    expect(processOnSpy).toHaveBeenCalledWith('SIGINT', expect.any(Function))
    expect(logSpy).toHaveBeenCalledWith('正在连接 alice@10.0.0.1...')
    expect(logSpy).toHaveBeenCalledWith('✓ 已连接到 alice@10.0.0.1')
  })

  it('密码认证 - 通过 inquirer 获取密码并建立连接', async () => {
    const { getConfig } = await import('../../config/loader.js')
    const { sshManager } = await import('../../ssh/manager.js')
    const inquirer = (await import('inquirer')).default
    const client: MockClientInstance = {
      connect: vi.fn().mockResolvedValue(undefined),
      shell: vi.fn().mockResolvedValue(new MockChannel()),
      disconnect: vi.fn(),
    }

    vi.mocked(getConfig).mockResolvedValue({
      ...baseConfig,
      authMethod: 'password',
      privateKeyPath: undefined,
    })
    vi.mocked(sshManager.getConnection).mockResolvedValue(client as never)
    vi.mocked(inquirer.prompt).mockResolvedValue({ pwd: 'secret' })
    vi.spyOn(process.stdin, 'pipe').mockImplementation(((destination: NodeJS.WritableStream) => destination) as typeof process.stdin.pipe)
    vi.spyOn(process, 'on').mockImplementation((() => process) as typeof process.on)
    vi.spyOn(console, 'log').mockImplementation(() => undefined)

    const program = await setupCommand()
    await runConnectCommand(program)

    expect(inquirer.prompt).toHaveBeenCalledWith([
      {
        type: 'password',
        name: 'pwd',
        message: '请输入 SSH 密码:',
        mask: '*',
      },
    ])
    expect(sshManager.getConnection).toHaveBeenCalledWith({
      ...baseConfig,
      authMethod: 'password',
      privateKeyPath: undefined,
      password: 'secret',
    })
  })

  it('连接失败 - 认证错误处理', async () => {
    const { getConfig } = await import('../../config/loader.js')
    const { sshManager } = await import('../../ssh/manager.js')
    const client: MockClientInstance = {
      connect: vi.fn().mockResolvedValue(undefined),
      shell: vi.fn(),
      disconnect: vi.fn(),
    }
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code?: string | number | null) => {
      throw new ExitCalled(typeof code === 'number' ? code : 0)
    }) as typeof process.exit)

    vi.mocked(getConfig).mockResolvedValue(baseConfig)
    vi.mocked(sshManager.getConnection).mockRejectedValue(new Error('Authentication failed'))

    const program = await setupCommand()

    await expect(runConnectCommand(program)).rejects.toMatchObject({ code: 1 })

    expect(errorSpy).toHaveBeenCalled()
    expect(exitSpy).toHaveBeenCalledWith(1)
  })
})
