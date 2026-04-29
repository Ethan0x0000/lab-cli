import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mockGetConfig = vi.fn()
const mockExec = vi.fn()
const mockDisconnect = vi.fn()
const mockGetConnection = vi.fn()
const mockBuildScancelCommand = vi.fn((jobId: string) => `scancel ${jobId}`)
const mockParseSqueueJson = vi.fn()
const mockPrompt = vi.fn()

vi.mock('../../config/loader.js', () => ({
  getConfig: mockGetConfig,
}))

vi.mock('../../ssh/manager.js', () => ({
  sshManager: {
    getConnection: mockGetConnection,
  },
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
    process.exitCode = undefined
    mockGetConfig.mockResolvedValue(createMockConfig())
    mockExec.mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 })
    mockParseSqueueJson.mockReturnValue([])
    mockPrompt.mockResolvedValue({ confirm: true })
    mockGetConnection.mockResolvedValue({
      exec: mockExec,
      disconnect: mockDisconnect,
    })
  })

  afterEach(() => {
    process.exitCode = undefined
    vi.restoreAllMocks()
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

    expect(mockGetConnection).toHaveBeenCalledWith(createMockConfig())
    expect(mockBuildScancelCommand).toHaveBeenCalledWith('12345')
    expect(mockExec).toHaveBeenCalledWith('scancel 12345')
    expect(logSpy).toHaveBeenCalledWith('✓ 任务 12345 已取消')

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

    expect(mockExec).toHaveBeenCalledWith("squeue --json --user='alice'")
    expect(mockPrompt).not.toHaveBeenCalled()
    expect(logSpy).toHaveBeenCalledWith('没有运行中的任务')
    expect(mockDisconnect).not.toHaveBeenCalled()

    logSpy.mockRestore()
  })

  it('缺少 jobId 且未使用 --all 时输出错误并退出', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { Command } = await import('commander')
    const { registerCancelCommand } = await import('../cancel.js')

    const program = new Command()
    registerCancelCommand(program)

    await program.parseAsync(['node', 'test', 'cancel'])

    expect(errorSpy).toHaveBeenCalledWith('取消失败: 请提供 jobId 或使用 --all 取消所有任务')
    expect(process.exitCode).toBe(1)
  })
})
