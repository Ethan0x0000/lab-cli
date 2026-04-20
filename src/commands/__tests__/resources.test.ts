import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockGetConfig = vi.fn()
const mockConnect = vi.fn()
const mockExec = vi.fn()
const mockDisconnect = vi.fn()
const mockParseSinfoJson = vi.fn()
const mockParseSinfoFormat = vi.fn()

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

vi.mock('../../slurm/parser.js', () => ({
  parseSinfoJson: mockParseSinfoJson,
  parseSinfoFormat: mockParseSinfoFormat,
}))

vi.mock('chalk', () => ({
  default: {
    green: (value: string) => value,
    yellow: (value: string) => value,
    red: (value: string) => value,
    gray: (value: string) => value,
    bold: (value: string) => value,
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

function createNodes() {
  return [
    {
      nodeName: 'node01',
      state: 'idle',
      cpuTotal: 64,
      cpuUsed: 8,
      memTotal: 262144,
      memUsed: 65536,
      gpuTotal: 4,
      gpuUsed: 1,
      partitions: ['gpu', 'main'],
    },
    {
      nodeName: 'node02',
      state: 'allocated',
      cpuTotal: 32,
      cpuUsed: 32,
      memTotal: 131072,
      memUsed: 131072,
      gpuTotal: 2,
      gpuUsed: 2,
      partitions: ['cpu'],
    },
  ]
}

describe('resources 命令', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetConfig.mockResolvedValue(createMockConfig())
    mockConnect.mockResolvedValue(undefined)
    mockExec.mockResolvedValue({ stdout: '{}', stderr: '', exitCode: 0 })
    mockParseSinfoJson.mockReturnValue(createNodes())
    mockParseSinfoFormat.mockReturnValue(createNodes())
  })

  it('注册 resources 命令及其过滤选项', async () => {
    const { Command } = await import('commander')
    const { registerResourcesCommand } = await import('../resources.js')

    const program = new Command()
    registerResourcesCommand(program)

    const cmd = program.commands.find((command) => command.name() === 'resources')
    expect(cmd).toBeDefined()
    expect(cmd?.description()).toContain('资源')
    expect(cmd?.options.map((option) => option.long)).toEqual(
      expect.arrayContaining(['--node', '--partition']),
    )
  })

  it('优先解析 sinfo JSON 并输出资源表格与空闲 GPU 总计', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const { Command } = await import('commander')
    const { registerResourcesCommand } = await import('../resources.js')

    const program = new Command()
    registerResourcesCommand(program)

    await program.parseAsync(['node', 'test', 'resources'])

    expect(mockExec).toHaveBeenCalledWith('sinfo --json')
    expect(mockParseSinfoJson).toHaveBeenCalledWith('{}')
    expect(mockParseSinfoFormat).not.toHaveBeenCalled()
    expect(logSpy.mock.calls.some(([line]) => String(line).includes('CPU(用/总)'))).toBe(true)
    expect(logSpy.mock.calls.some(([line]) => String(line).includes('node01'))).toBe(true)
    expect(logSpy).toHaveBeenCalledWith('空闲 GPU 总计: 3')
    expect(mockDisconnect).toHaveBeenCalled()

    logSpy.mockRestore()
  })

  it('JSON 解析失败时回退到格式化输出解析', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const { Command } = await import('commander')
    const { registerResourcesCommand } = await import('../resources.js')

    mockParseSinfoJson.mockImplementation(() => {
      throw new Error('bad json')
    })
    mockExec
      .mockResolvedValueOnce({ stdout: 'bad', stderr: '', exitCode: 0 })
      .mockResolvedValueOnce({ stdout: 'fallback', stderr: '', exitCode: 0 })
    mockParseSinfoFormat.mockReturnValue([createNodes()[0]])

    const program = new Command()
    registerResourcesCommand(program)

    await program.parseAsync(['node', 'test', 'resources'])

    expect(mockExec).toHaveBeenNthCalledWith(1, 'sinfo --json')
    expect(mockExec).toHaveBeenNthCalledWith(2, 'sinfo --format="%N %T %c %m %P" --noheader')
    expect(mockParseSinfoFormat).toHaveBeenCalledWith('fallback')
    expect(logSpy.mock.calls.some(([line]) => String(line).includes('node01'))).toBe(true)

    logSpy.mockRestore()
  })

  it('支持按节点和分区过滤资源结果', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const { Command } = await import('commander')
    const { registerResourcesCommand } = await import('../resources.js')

    const program = new Command()
    registerResourcesCommand(program)

    await program.parseAsync(['node', 'test', 'resources', '--node', 'node01', '--partition', 'gpu'])

    expect(logSpy.mock.calls.some(([line]) => String(line).includes('node01'))).toBe(true)
    expect(logSpy.mock.calls.some(([line]) => String(line).includes('node02'))).toBe(false)

    logSpy.mockRestore()
  })

  it('没有匹配节点时输出提示并返回', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const { Command } = await import('commander')
    const { registerResourcesCommand } = await import('../resources.js')

    mockParseSinfoJson.mockReturnValue([])

    const program = new Command()
    registerResourcesCommand(program)

    await program.parseAsync(['node', 'test', 'resources', '--partition', 'gpu'])

    expect(logSpy).toHaveBeenCalledWith('没有找到匹配的节点')
    expect(mockDisconnect).toHaveBeenCalled()

    logSpy.mockRestore()
  })
})
