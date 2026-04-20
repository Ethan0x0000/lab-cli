import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockGetConfig = vi.fn()
const mockSyncToRemote = vi.fn()
const mockSpinner = {
  start: vi.fn(),
  succeed: vi.fn(),
  fail: vi.fn(),
  text: '',
}
const mockOra = vi.fn(() => mockSpinner)
const mockDim = vi.fn((value: string) => value)

vi.mock('../../config/loader.js', () => ({
  getConfig: mockGetConfig,
}))

vi.mock('../../transfer/rsync.js', () => ({
  syncToRemote: mockSyncToRemote,
}))

vi.mock('ora', () => ({
  default: mockOra,
}))

vi.mock('chalk', () => ({
  default: {
    green: (value: string) => value,
    red: (value: string) => value,
    blue: (value: string) => value,
    dim: mockDim,
  },
}))

function createMockConfig() {
  return {
    host: '10.0.0.1',
    port: 22,
    username: 'user',
    authMethod: 'key' as const,
    remotePath: '/data/project',
    syncExclude: ['node_modules', '.git'],
    privateKeyPath: '~/.ssh/id_rsa',
    defaultRemotePath: '/home/user',
    name: 'test',
    condaPythonVersion: '3.10',
  }
}

describe('sync 命令', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSpinner.start.mockReturnValue(mockSpinner)
    mockSpinner.succeed.mockReturnValue(mockSpinner)
    mockSpinner.fail.mockReturnValue(mockSpinner)
    mockSpinner.text = ''
  })

  it('注册 sync 命令及其选项', async () => {
    const { Command } = await import('commander')
    const { registerSyncCommand } = await import('../sync.js')

    const program = new Command()
    registerSyncCommand(program)

    const cmd = program.commands.find((command) => command.name() === 'sync')
    expect(cmd).toBeDefined()
    expect(cmd?.description()).toContain('同步')
    expect(cmd?.options.map((option) => option.long)).toEqual(
      expect.arrayContaining(['--dry-run', '--exclude']),
    )
  })

  it('执行同步时会将配置和额外 exclude 传给 syncToRemote', async () => {
    const cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue('E:/repo')
    const { Command } = await import('commander')
    const { registerSyncCommand } = await import('../sync.js')

    mockGetConfig.mockResolvedValue(createMockConfig())
    mockSyncToRemote.mockResolvedValue({
      filesTransferred: 5,
      bytesTransferred: 1024,
      duration: 300,
      errors: [],
    })

    const program = new Command()
    registerSyncCommand(program)

    await program.parseAsync(['node', 'test', 'sync', '--exclude', 'dist', '__pycache__'])

    expect(mockOra).toHaveBeenCalledWith('正在同步代码...')
    expect(mockSpinner.start).toHaveBeenCalled()
    expect(mockSyncToRemote).toHaveBeenCalledWith({
      localPath: 'E:/repo',
      remotePath: '/data/project',
      host: '10.0.0.1',
      username: 'user',
      excludePatterns: ['node_modules', '.git', 'dist', '__pycache__'],
      dryRun: false,
      privateKeyPath: '~/.ssh/id_rsa',
      port: 22,
    })
    expect(mockSpinner.succeed).toHaveBeenCalledWith('同步完成 (5 个文件, 0.3s)')

    cwdSpy.mockRestore()
  })

  it('dry-run 模式会更新 spinner 并传递 dryRun 选项', async () => {
    const cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue('E:/repo')
    const { Command } = await import('commander')
    const { registerSyncCommand } = await import('../sync.js')

    mockGetConfig.mockResolvedValue(createMockConfig())
    mockSyncToRemote.mockResolvedValue({
      filesTransferred: 0,
      bytesTransferred: 0,
      duration: 100,
      errors: [],
    })

    const program = new Command()
    registerSyncCommand(program)

    await program.parseAsync(['node', 'test', 'sync', '--dry-run'])

    expect(mockSpinner.text).toBe('正在预览将要同步的文件（dry-run）...')
    expect(mockSyncToRemote).toHaveBeenCalledWith(
      expect.objectContaining({
        dryRun: true,
        excludePatterns: ['node_modules', '.git'],
      }),
    )
    expect(mockSpinner.succeed).toHaveBeenCalledWith('dry-run 完成')

    cwdSpy.mockRestore()
  })

  it('同步失败时输出错误并退出', async () => {
    const exitError = new Error('process.exit')
    const cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue('E:/repo')
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code?: string | number | null) => {
      throw Object.assign(exitError, { code })
    }) as never)
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const { Command } = await import('commander')
    const { registerSyncCommand } = await import('../sync.js')

    mockGetConfig.mockResolvedValue(createMockConfig())
    mockSyncToRemote.mockRejectedValue(new Error('rsync exploded'))

    const program = new Command()
    registerSyncCommand(program)

    await expect(program.parseAsync(['node', 'test', 'sync'])).rejects.toMatchObject({
      message: 'process.exit',
      code: 1,
    })

    expect(mockSpinner.fail).toHaveBeenCalledWith('同步失败')
    expect(errorSpy).toHaveBeenCalledWith('同步失败: rsync exploded')
    expect(mockDim).toHaveBeenCalledWith('提示: 确认本机已安装 rsync')
    expect(logSpy).toHaveBeenCalledWith('提示: 确认本机已安装 rsync')

    cwdSpy.mockRestore()
    exitSpy.mockRestore()
    errorSpy.mockRestore()
    logSpy.mockRestore()
  })
})
