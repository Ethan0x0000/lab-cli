import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Command } from 'commander'
import type { MergedConfig, SlurmJobInfo } from '../../types/index.js'

const mockGetConfig = vi.fn()
const mockExec = vi.fn()
const mockParseSqueueJson = vi.fn()
const mockParseSqueueFormat = vi.fn()
const mockDim = vi.fn((value: string) => value)
const mockGetConnection = vi.fn()
const mockHandleCliError = vi.fn()

vi.mock('../../config/loader.js', () => ({
  getConfig: mockGetConfig,
}))

vi.mock('../../ssh/manager.js', () => ({
  sshManager: {
    getConnection: mockGetConnection,
  },
}))

vi.mock('../../slurm/parser.js', () => ({
  parseSqueueJson: mockParseSqueueJson,
  parseSqueueFormat: mockParseSqueueFormat,
}))

vi.mock('../../utils/errors.js', () => ({
  handleCliError: mockHandleCliError,
}))

vi.mock('chalk', () => ({
  default: {
    green: (value: string) => value,
    yellow: (value: string) => value,
    red: (value: string) => value,
    gray: (value: string) => value,
    bold: (value: string) => value,
    blue: (value: string) => value,
    dim: mockDim,
  },
}))

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

const sampleJobs: SlurmJobInfo[] = [
  {
    jobId: '12345',
    name: 'train_bert',
    state: 'RUNNING',
    partition: 'gpu',
    nodes: 2,
    gpus: 4,
    timeUsed: '01:30:00',
    timeLimit: '24:00:00',
  },
  {
    jobId: '12346',
    name: 'eval_job',
    state: 'PENDING',
    partition: 'gpu',
    nodes: 1,
    gpus: 2,
    timeUsed: '00:00:00',
    timeLimit: '02:00:00',
  },
]

async function setupCommand(): Promise<Command> {
  const { registerStatusCommand } = await import('../status.js')
  const program = new Command()
  registerStatusCommand(program)
  return program
}

describe('status 命令', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetConfig.mockResolvedValue(baseConfig)
    mockGetConnection.mockResolvedValue({
      exec: mockExec,
    })
    mockExec.mockResolvedValue({
      stdout: '{"jobs":[]}',
      stderr: '',
      exitCode: 0,
    })
    mockParseSqueueJson.mockReturnValue(sampleJobs)
    mockParseSqueueFormat.mockReturnValue(sampleJobs)
  })

  it('status 命令注册到 Commander', async () => {
    const program = await setupCommand()
    const cmd = program.commands.find((command) => command.name() === 'status')

    expect(cmd).toBeDefined()
    expect(cmd?.description()).toContain('Slurm')
    expect(cmd?.options.map((option) => option.long)).toEqual(expect.arrayContaining(['--job-id', '--all']))
  })

  it('默认只查询当前用户任务并打印列表', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    const program = await setupCommand()

    await program.parseAsync(['node', 'labcli', 'status'])

    expect(mockExec).toHaveBeenCalledWith("squeue --json --user='alice'")
    expect(mockParseSqueueJson).toHaveBeenCalledWith('{"jobs":[]}')
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('JobID'))
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('12345'))
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('RUNNING'))
  })

  it('JSON 解析失败时回退到格式化解析', async () => {
    mockParseSqueueJson.mockImplementation(() => {
      throw new Error('invalid json')
    })
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    const program = await setupCommand()

    await program.parseAsync(['node', 'labcli', 'status', '--all', '--job-id', '12345'])

    expect(mockExec).toHaveBeenCalledWith("squeue --json --jobs='12345'")
    expect(mockParseSqueueFormat).toHaveBeenCalledWith('{"jobs":[]}')
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('12345'))
  })

  it('fallback 提示', async () => {
    mockParseSqueueJson.mockImplementation(() => {
      throw new Error('invalid json')
    })
    vi.spyOn(console, 'log').mockImplementation(() => undefined)
    const program = await setupCommand()

    await program.parseAsync(['node', 'labcli', 'status'])

    expect(mockDim).toHaveBeenCalledWith('ℹ Slurm --json 不可用，已使用文本格式解析')
  })

  it('空任务列表时输出无任务提示', async () => {
    mockParseSqueueJson.mockReturnValue([])
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    const program = await setupCommand()

    await program.parseAsync(['node', 'labcli', 'status'])

    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('当前没有活跃任务'))
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('submit'))
  })

  it('摘要头显示查询时间、用户和任务统计', async () => {
    const jobsWithStates: SlurmJobInfo[] = [
      {
        jobId: '12345',
        name: 'train_bert',
        state: 'RUNNING',
        partition: 'gpu',
        nodes: 2,
        gpus: 4,
        timeUsed: '01:30:00',
        timeLimit: '24:00:00',
      },
      {
        jobId: '12346',
        name: 'eval_job',
        state: 'PENDING',
        partition: 'gpu',
        nodes: 1,
        gpus: 2,
        timeUsed: '00:00:00',
        timeLimit: '02:00:00',
      },
    ]
    mockParseSqueueJson.mockReturnValue(jobsWithStates)
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    const program = await setupCommand()

    await program.parseAsync(['node', 'labcli', 'status'])

    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('查询时间:'))
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('用户: alice'))
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('运行中: 1'))
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('等待中: 1'))
  })

  it('页脚显示任务总数和查询时间', async () => {
    mockParseSqueueJson.mockReturnValue(sampleJobs)
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    const program = await setupCommand()

    await program.parseAsync(['node', 'labcli', 'status'])

    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('共 2 个任务'))
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('查询于'))
  })
})
