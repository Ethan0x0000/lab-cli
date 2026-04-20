import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mockGetConfig = vi.fn()
const mockSyncToRemote = vi.fn()
const mockWatch = vi.fn()
const watchHandlers: Record<string, ((filePath: string) => void) | undefined> = {}

interface MockWatcher {
  on: ReturnType<typeof vi.fn>
  close: ReturnType<typeof vi.fn>
}

const mockWatcher: MockWatcher = {
  on: vi.fn(),
  close: vi.fn(),
}

mockWatcher.on.mockImplementation((event: string, handler: (filePath: string) => void) => {
  watchHandlers[event] = handler
  return mockWatcher
})
mockWatcher.close.mockResolvedValue(undefined)
mockWatch.mockReturnValue(mockWatcher)

vi.mock('../../config/loader.js', () => ({
  getConfig: mockGetConfig,
}))

vi.mock('../../transfer/rsync.js', () => ({
  syncToRemote: mockSyncToRemote,
}))

vi.mock('chokidar', () => ({
  default: {
    watch: mockWatch,
  },
}))

vi.mock('chalk', () => ({
  default: {
    green: (value: string) => value,
    red: (value: string) => value,
    blue: (value: string) => value,
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
    remotePath: '/remote/project',
    syncExclude: ['node_modules', '.git', '*.pyc'],
    defaultRemotePath: '/home/alice',
    name: 'test',
    condaPythonVersion: '3.10',
  }
}

describe('watch 命令', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useRealTimers()
    Object.keys(watchHandlers).forEach((key) => {
      delete watchHandlers[key]
    })
    mockWatch.mockReturnValue(mockWatcher)
    mockWatcher.on.mockImplementation((event: string, handler: (filePath: string) => void) => {
      watchHandlers[event] = handler
      return mockWatcher
    })
    mockWatcher.close.mockResolvedValue(undefined)
    mockGetConfig.mockResolvedValue(createMockConfig())
    mockSyncToRemote.mockResolvedValue({
      filesTransferred: 3,
      bytesTransferred: 1024,
      duration: 250,
      errors: [],
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('注册 watch 命令及其 --no-initial-sync 选项', async () => {
    const { Command } = await import('commander')
    const { registerWatchCommand } = await import('../watch.js')

    const program = new Command()
    registerWatchCommand(program)

    const cmd = program.commands.find((command) => command.name() === 'watch')
    expect(cmd).toBeDefined()
    expect(cmd?.description()).toContain('监听')
    expect(cmd?.options.map((option) => option.long)).toContain('--no-initial-sync')
  })

  it('默认会先执行初始同步并创建 chokidar 监听器', async () => {
    const cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue('E:/repo')
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const processOnSpy = vi.spyOn(process, 'on').mockImplementation(() => process)
    const { Command } = await import('commander')
    const { registerWatchCommand } = await import('../watch.js')

    const program = new Command()
    registerWatchCommand(program)

    await program.parseAsync(['node', 'test', 'watch'])

    expect(mockSyncToRemote).toHaveBeenCalledWith({
      localPath: 'E:/repo',
      remotePath: '/remote/project',
      host: '10.0.0.1',
      username: 'alice',
      excludePatterns: ['node_modules', '.git', '*.pyc'],
      privateKeyPath: '~/.ssh/id_rsa',
      port: 22,
    })
    expect(mockWatch).toHaveBeenCalledWith('E:/repo', expect.objectContaining({
      ignoreInitial: true,
      depth: 10,
      awaitWriteFinish: { stabilityThreshold: 300 },
    }))
    expect(logSpy.mock.calls.some(([line]) => String(line).includes('[watch] 监听 E:/repo 的文件变化'))).toBe(true)
    expect(processOnSpy).toHaveBeenCalledWith('SIGINT', expect.any(Function))
    expect(processOnSpy).toHaveBeenCalledWith('SIGTERM', expect.any(Function))

    cwdSpy.mockRestore()
    logSpy.mockRestore()
    processOnSpy.mockRestore()
  })

  it('传入 --no-initial-sync 时跳过启动同步', async () => {
    const cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue('E:/repo')
    const processOnSpy = vi.spyOn(process, 'on').mockImplementation(() => process)
    const { Command } = await import('commander')
    const { registerWatchCommand } = await import('../watch.js')

    const program = new Command()
    registerWatchCommand(program)

    await program.parseAsync(['node', 'test', 'watch', '--no-initial-sync'])

    expect(mockSyncToRemote).not.toHaveBeenCalled()
    expect(mockWatch).toHaveBeenCalled()

    cwdSpy.mockRestore()
    processOnSpy.mockRestore()
  })

  it('change 事件会经过 debounce 合并后触发一次同步', async () => {
    vi.useFakeTimers()
    const cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue('E:/repo')
    const processOnSpy = vi.spyOn(process, 'on').mockImplementation(() => process)
    const { Command } = await import('commander')
    const { registerWatchCommand } = await import('../watch.js')

    const program = new Command()
    registerWatchCommand(program)

    await program.parseAsync(['node', 'test', 'watch', '--no-initial-sync'])

    watchHandlers.change?.('src/a.ts')
    watchHandlers.change?.('src/b.ts')
    watchHandlers.change?.('src/c.ts')

    expect(mockSyncToRemote).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(500)

    expect(mockSyncToRemote).toHaveBeenCalledTimes(1)
    expect(mockSyncToRemote).toHaveBeenCalledWith(expect.objectContaining({
      localPath: 'E:/repo',
      remotePath: '/remote/project',
    }))

    cwdSpy.mockRestore()
    processOnSpy.mockRestore()
  })

  it('将 syncExclude 转成能正确匹配 glob 的 ignored 正则', async () => {
    const cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue('/repo')
    const processOnSpy = vi.spyOn(process, 'on').mockImplementation(() => process)
    const { Command } = await import('commander')
    const { registerWatchCommand } = await import('../watch.js')

    const program = new Command()
    registerWatchCommand(program)

    await program.parseAsync(['node', 'test', 'watch', '--no-initial-sync'])

    const [, options] = mockWatch.mock.calls[0] as [string, { ignored: RegExp[] }]
    const ignored = options.ignored
    const dotGitPattern = ignored.find(pattern => pattern.test('/repo/.git/config'))
    const pycPattern = ignored.find(pattern => pattern.test('/repo/build/output.pyc'))

    expect(dotGitPattern).toBeDefined()
    expect(dotGitPattern?.test('/repo/xgit/config')).toBe(false)
    expect(pycPattern).toBeDefined()
    expect(pycPattern?.test('/repo/build/output.pyc.tmp')).toBe(false)

    cwdSpy.mockRestore()
    processOnSpy.mockRestore()
  })

  it('SIGINT 清理时会 await watcher.close 后退出', async () => {
    const handlers = new Map<string, () => Promise<void>>()
    const cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue('E:/repo')
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never)
    const processOnSpy = vi.spyOn(process, 'on').mockImplementation(((event: NodeJS.Signals, handler: () => Promise<void>) => {
      handlers.set(event, handler)
      return process
    }) as typeof process.on)
    const { Command } = await import('commander')
    const { registerWatchCommand } = await import('../watch.js')

    const program = new Command()
    registerWatchCommand(program)

    await program.parseAsync(['node', 'test', 'watch', '--no-initial-sync'])

    await handlers.get('SIGINT')?.()

    expect(mockWatcher.close).toHaveBeenCalledTimes(1)
    expect(exitSpy).toHaveBeenCalledWith(0)

    cwdSpy.mockRestore()
    exitSpy.mockRestore()
    processOnSpy.mockRestore()
  })
})
