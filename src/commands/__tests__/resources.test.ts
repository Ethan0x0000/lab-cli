import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockGetConfig = vi.fn()
const mockExec = vi.fn()
const mockSshManagerGetConnection = vi.fn()
const mockParseSinfoJson = vi.fn()
const mockParseSinfoFormat = vi.fn()
const mockDim = vi.fn((value: string) => `[DIM]${value}[/DIM]`)

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
    dim: mockDim,
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
    mockExec.mockResolvedValue({ stdout: '{}', stderr: '', exitCode: 0 })
    mockParseSinfoJson.mockReturnValue(createNodes())
    mockParseSinfoFormat.mockReturnValue(createNodes())
    mockSshManagerGetConnection.mockResolvedValue({
      exec: mockExec,
    })
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
    expect(logSpy.mock.calls.some(([line]) => String(line).includes('空闲 GPU 总计: 3'))).toBe(true)

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
    expect(mockExec).toHaveBeenNthCalledWith(2, 'sinfo --format="%N %T %c %m %G %P" --noheader')
    expect(mockParseSinfoFormat).toHaveBeenCalledWith('fallback')
    expect(logSpy.mock.calls.some(([line]) => String(line).includes('node01'))).toBe(true)

    logSpy.mockRestore()
  })

  it('fallback 提示', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    const { Command } = await import('commander')
    const { registerResourcesCommand } = await import('../resources.js')

    mockParseSinfoJson.mockImplementation(() => {
      throw new Error('bad json')
    })
    mockExec
      .mockResolvedValueOnce({ stdout: 'bad', stderr: '', exitCode: 0 })
      .mockResolvedValueOnce({ stdout: 'fallback', stderr: '', exitCode: 0 })

    const program = new Command()
    registerResourcesCommand(program)

    await program.parseAsync(['node', 'test', 'resources'])

    expect(mockDim).toHaveBeenCalledWith('ℹ Slurm --json 不可用，已使用文本格式解析')
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

    expect(logSpy).toHaveBeenCalledWith('没有找到匹配的节点 — 用 labcli resources 查看所有节点，或检查 --node/--partition 参数')

    logSpy.mockRestore()
  })

  it('集群概览: 显示查询时间、节点数、GPU 统计和分区信息', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const { Command } = await import('commander')
    const { registerResourcesCommand } = await import('../resources.js')

    const program = new Command()
    registerResourcesCommand(program)

    await program.parseAsync(['node', 'test', 'resources', '--partition', 'gpu'])

    const calls = logSpy.mock.calls.map(([line]) => String(line))
    expect(calls.some(line => line.includes('查询时间:'))).toBe(true)
    expect(calls.some(line => line.includes('节点: 1 个'))).toBe(true)
    expect(calls.some(line => line.includes('空闲 GPU: 3'))).toBe(true)
    expect(calls.some(line => line.includes('总 GPU: 4'))).toBe(true)
    expect(calls.some(line => line.includes('分区: gpu'))).toBe(true)

    logSpy.mockRestore()
  })

  it('down 节点: 整行使用 chalk.dim 进行暗化处理', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const { Command } = await import('commander')
    const { registerResourcesCommand } = await import('../resources.js')

    mockParseSinfoJson.mockReturnValue([
      {
        nodeName: 'node01',
        state: 'down',
        cpuTotal: 64,
        cpuUsed: 0,
        memTotal: 262144,
        memUsed: 0,
        gpuTotal: 4,
        gpuUsed: 0,
        partitions: ['gpu'],
      },
      {
        nodeName: 'node02',
        state: 'idle',
        cpuTotal: 64,
        cpuUsed: 8,
        memTotal: 262144,
        memUsed: 65536,
        gpuTotal: 4,
        gpuUsed: 1,
        partitions: ['gpu'],
      },
    ])

    const program = new Command()
    registerResourcesCommand(program)

    await program.parseAsync(['node', 'test', 'resources'])

    const calls = logSpy.mock.calls.map(([line]) => String(line))
    const downNodeLine = calls.find(line => line.includes('node01'))
    const idleNodeLine = calls.find(line => line.includes('node02'))

    expect(downNodeLine).toContain('[DIM]')
    expect(idleNodeLine).not.toContain('[DIM]')

    logSpy.mockRestore()
  })

  it('drain 节点: 整行使用 chalk.dim 进行暗化处理', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const { Command } = await import('commander')
    const { registerResourcesCommand } = await import('../resources.js')

    mockParseSinfoJson.mockReturnValue([
      {
        nodeName: 'node01',
        state: 'drain',
        cpuTotal: 64,
        cpuUsed: 0,
        memTotal: 262144,
        memUsed: 0,
        gpuTotal: 4,
        gpuUsed: 0,
        partitions: ['gpu'],
      },
    ])

    const program = new Command()
    registerResourcesCommand(program)

    await program.parseAsync(['node', 'test', 'resources'])

    const calls = logSpy.mock.calls.map(([line]) => String(line))
    const drainNodeLine = calls.find(line => line.includes('node01'))

    expect(drainNodeLine).toContain('[DIM]')

    logSpy.mockRestore()
  })
})
