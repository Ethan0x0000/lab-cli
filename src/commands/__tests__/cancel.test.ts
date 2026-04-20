import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockGetConfig = vi.fn()
const mockConnect = vi.fn()
const mockExec = vi.fn()
const mockDisconnect = vi.fn()
const mockBuildScancelCommand = vi.fn((jobId: string) => `scancel ${jobId}`)
const mockParseSqueueJson = vi.fn()
const mockPrompt = vi.fn()

vi.mock('../../config/loader.js', () => ({
  getConfig: mockGetConfig,
}))

vi.mock('../../ssh/client.js', () => ({
  SSHClient: vi.fn(function MockSSHClient() {
    return {
    connect: mockConnect,
    exec: mockExec,
    disconnect: mockDisconnect,
    }
  }),
}))

vi.mock('../../slurm/commands.js', () => ({
  buildScancelCommand: mockBuildScancelCommand,
}))

vi.mock('../../slurm/parser.js', () => ({
  parseSqueueJson: mockParseSqueueJson,
}))

vi.mock('inquirer', () => ({
  default: { prompt: mockPrompt },
}))

vi.mock('chalk', () => ({
  default: {
    green: (value: string) => value,
    red: (value: string) => value,
    yellow: (value: string) => value,
  },
}))

function createMockConfig() {
  return {
    host: '10.0.0.1',
    port: 22,
    username: 'alice',
    authMethod: 'key' as const,
    privateKeyPath: '~/.ssh/id_rsa',
    remotePath: '/remote',
    syncExclude: [],
    defaultRemotePath: '/home/alice',
    name: 'test',
    condaPythonVersion: '3.10',
  }
}

describe('cancel 命令', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetConfig.mockResolvedValue(createMockConfig())
    mockConnect.mockResolvedValue(undefined)
    mockExec.mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 })
    mockParseSqueueJson.mockReturnValue([])
    mockPrompt.mockResolvedValue({ confirm: true })
  })

  it('注册 cancel 命令及其 --all 选项', async () => {
    const { Command } = await import('commander')
    const { registerCancelCommand } = await import('../cancel.js')

    const program = new Command()
    registerCancelCommand(program)

    const cmd = program.commands.find((command) => command.name() === 'cancel')
    expect(cmd).toBeDefined()
    expect(cmd?.description()).toContain('取消')
    expect(cmd?.options.map((option) => option.long)).toContain('--all')
  })

  it('取消单个任务时会连接 SSH 并执行 buildScancelCommand 结果', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const { Command } = await import('commander')
    const { registerCancelCommand } = await import('../cancel.js')

    const program = new Command()
    registerCancelCommand(program)

    await program.parseAsync(['node', 'test', 'cancel', '12345'])

    expect(mockConnect).toHaveBeenCalledWith({
      host: '10.0.0.1',
      port: 22,
      username: 'alice',
      authMethod: 'key',
      privateKeyPath: '~/.ssh/id_rsa',
    })
    expect(mockBuildScancelCommand).toHaveBeenCalledWith('12345')
    expect(mockExec).toHaveBeenCalledWith('scancel 12345')
    expect(logSpy).toHaveBeenCalledWith('✓ 任务 12345 已取消')
    expect(mockDisconnect).toHaveBeenCalled()

    logSpy.mockRestore()
  })

  it('使用 --all 且没有运行中任务时输出提示并返回', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const { Command } = await import('commander')
    const { registerCancelCommand } = await import('../cancel.js')

    mockExec.mockResolvedValueOnce({ stdout: '{"jobs":[]}', stderr: '', exitCode: 0 })
    mockParseSqueueJson.mockReturnValue([])

    const program = new Command()
    registerCancelCommand(program)

    await program.parseAsync(['node', 'test', 'cancel', '--all'])

    expect(mockExec).toHaveBeenCalledWith('squeue --json --user=alice')
    expect(mockPrompt).not.toHaveBeenCalled()
    expect(logSpy).toHaveBeenCalledWith('没有运行中的任务')
    expect(mockDisconnect).toHaveBeenCalled()

    logSpy.mockRestore()
  })

  it('缺少 jobId 且未使用 --all 时输出错误并退出', async () => {
    const exitError = new Error('process.exit')
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code?: string | number | null) => {
      throw Object.assign(exitError, { code })
    }) as never)
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { Command } = await import('commander')
    const { registerCancelCommand } = await import('../cancel.js')

    const program = new Command()
    registerCancelCommand(program)

    await expect(program.parseAsync(['node', 'test', 'cancel'])).rejects.toMatchObject({
      message: 'process.exit',
      code: 1,
    })

    expect(errorSpy).toHaveBeenCalledWith('请提供 jobId 或使用 --all 取消所有任务')
    expect(mockDisconnect).toHaveBeenCalled()

    exitSpy.mockRestore()
    errorSpy.mockRestore()
  })
})
