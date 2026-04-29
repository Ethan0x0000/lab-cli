import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Command } from 'commander'
import type { MergedConfig, SSHExecResult } from '../../types/index.js'

const {
  mockGetConfig,
  mockPrompt,
  mockExec,
  mockSshManagerGetConnection,
  mockOra,
} = vi.hoisted(() => ({
  mockGetConfig: vi.fn(),
  mockPrompt: vi.fn(),
  mockExec: vi.fn(),
  mockSshManagerGetConnection: vi.fn(),
  mockOra: vi.fn((text: string) => ({
    text,
    start: vi.fn().mockReturnThis(),
    succeed: vi.fn().mockReturnThis(),
    fail: vi.fn().mockReturnThis(),
  })),
}))

vi.mock('../../config/loader.js', () => ({
  getConfig: mockGetConfig,
}))

vi.mock('../../ssh/manager.js', () => ({
  sshManager: {
    getConnection: mockSshManagerGetConnection,
  },
}))

vi.mock('../../utils/errors.js', () => ({
  handleCliError: vi.fn((error, context) => {
    throw new Error(`${context}: ${error instanceof Error ? error.message : String(error)}`)
  }),
}))

vi.mock('inquirer', () => ({
  default: {
    prompt: mockPrompt,
  },
}))

vi.mock('ora', () => ({
  default: mockOra,
}))

vi.mock('chalk', () => ({
  default: {
    green: (value: string) => value,
    red: (value: string) => value,
    yellow: (value: string) => value,
    blue: (value: string) => value,
  },
}))

const baseConfig: MergedConfig = {
  host: '10.0.0.1',
  port: 22,
  username: 'user',
  authMethod: 'key',
  privateKeyPath: '~/.ssh/id_rsa',
  defaultRemotePath: '/home/user',
  name: 'demo',
  remotePath: '/data/training/demo',
  syncExclude: [],
  condaEnvName: 'demo-env',
  condaPythonVersion: '3.10',
}

const execResult = (overrides: Partial<SSHExecResult> = {}): SSHExecResult => ({
  stdout: '',
  stderr: '',
  exitCode: 0,
  ...overrides,
})

async function createProgram(): Promise<Command> {
  const { registerSetupCommand } = await import('../setup.js')
  const program = new Command()
  registerSetupCommand(program)
  return program
}

async function runSetup(args: string[] = []): Promise<void> {
  const program = await createProgram()
  await program.parseAsync(['node', 'test', 'setup', ...args])
}

describe('setup 命令', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.exitCode = undefined
    mockGetConfig.mockResolvedValue(baseConfig)
    mockSshManagerGetConnection.mockResolvedValue({
      exec: mockExec,
    })
    mockPrompt.mockResolvedValue({ rebuild: false })
    vi.spyOn(console, 'log').mockImplementation(() => undefined)
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`process.exit:${code ?? 0}`)
    }) as never)
  })

  afterEach(() => {
    process.exitCode = undefined
    vi.restoreAllMocks()
  })

  it('注册 setup 子命令和 --skip-conda 选项', async () => {
    const program = await createProgram()

    const cmd = program.commands.find(command => command.name() === 'setup')

    expect(cmd).toBeDefined()
    expect(cmd?.description()).toContain('conda')
    expect(cmd?.options.map(option => option.long)).toContain('--skip-conda')
  })

  it('完整初始化时执行 mkdir 校验和 conda 创建', async () => {
    mockExec
      .mockResolvedValueOnce(execResult())
      .mockResolvedValueOnce(execResult({ stdout: 'drwxr-xr-x demo\n' }))
      .mockResolvedValueOnce(execResult({ exitCode: 1 }))
      .mockResolvedValueOnce(execResult())

    await runSetup()

    expect(mockSshManagerGetConnection).toHaveBeenCalledWith(baseConfig)
    expect(mockExec).toHaveBeenNthCalledWith(1, `mkdir -p '${baseConfig.remotePath}'`)
    expect(mockExec).toHaveBeenNthCalledWith(2, `ls -la '${baseConfig.remotePath}'`)
    expect(mockExec).toHaveBeenNthCalledWith(3, `conda env list 2>/dev/null | grep -F '${baseConfig.condaEnvName} '`)
    expect(mockExec).toHaveBeenNthCalledWith(4, `conda create -n '${baseConfig.condaEnvName}' python='${baseConfig.condaPythonVersion}' -y`)
    expect(console.log).toHaveBeenCalledWith('\n✓ 初始化完成')
  })

  it('传入 --skip-conda 时只创建目录', async () => {
    mockExec
      .mockResolvedValueOnce(execResult())
      .mockResolvedValueOnce(execResult())

    await runSetup(['--skip-conda'])

    expect(mockExec).toHaveBeenCalledTimes(2)
    expect(mockExec).toHaveBeenNthCalledWith(1, `mkdir -p '${baseConfig.remotePath}'`)
    expect(mockExec).toHaveBeenNthCalledWith(2, `ls -la '${baseConfig.remotePath}'`)
  })

  it('conda 环境已存在且用户不重建时跳过 conda create', async () => {
    mockExec
      .mockResolvedValueOnce(execResult())
      .mockResolvedValueOnce(execResult())
      .mockResolvedValueOnce(execResult({ stdout: `${baseConfig.condaEnvName} * /opt/conda/envs/${baseConfig.condaEnvName}\n` }))

    await runSetup()

     expect(mockPrompt).toHaveBeenCalledTimes(1)
     expect(mockExec).toHaveBeenCalledTimes(3)
     expect(console.log).toHaveBeenCalledWith(`跳过 conda 环境创建（已存在: ${baseConfig.condaEnvName}）`)
   })

   it('目录创建失败时输出错误并退出', async () => {
     mockExec.mockResolvedValueOnce(execResult({ exitCode: 1, stderr: 'Permission denied' }))

     await expect(runSetup()).rejects.toThrow('初始化失败: Permission denied')

     expect(mockExec).toHaveBeenCalledTimes(1)
     expect(console.error).toHaveBeenCalledWith('Permission denied')
   })
})
