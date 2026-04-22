import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Command } from 'commander'
import type { MergedConfig } from '../../types/index.js'

const mockGetConfig = vi.fn()
const mockConnect = vi.fn()
const mockExec = vi.fn()
const mockDisconnect = vi.fn()
const mockSyncToRemote = vi.fn()
const mockBuildSbatchCommand = vi.fn()
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

vi.mock('../../transfer/rsync.js', () => ({
  syncToRemote: mockSyncToRemote,
}))

vi.mock('../../slurm/commands.js', () => ({
  buildSbatchCommand: mockBuildSbatchCommand,
}))

vi.mock('inquirer', () => ({
  default: {
    prompt: mockPrompt,
  },
}))

vi.mock('chalk', () => ({
  default: {
    green: (value: string) => value,
    red: (value: string) => value,
    blue: (value: string) => value,
    bold: (value: string) => value,
    yellow: (value: string) => value,
  },
}))

class ExitCalled extends Error {
  constructor(readonly code: number) {
    super(`EXIT:${code}`)
  }
}

const baseConfig: MergedConfig = {
  host: '10.0.0.1',
  port: 22,
  username: 'alice',
  authMethod: 'key',
  privateKeyPath: '~/.ssh/id_rsa',
  defaultRemotePath: '/home/alice',
  name: 'demo-job',
  remotePath: '/data/demo',
  syncExclude: ['node_modules', '.git'],
  condaPythonVersion: '3.11',
  slurmPartition: 'gpu',
  slurmGpus: 2,
  slurmNodes: 1,
}

async function setupCommand(): Promise<Command> {
  const { registerSubmitCommand } = await import('../submit.js')
  const program = new Command()
  registerSubmitCommand(program)
  return program
}

describe('submit 命令', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.exitCode = undefined
    mockGetConfig.mockResolvedValue(baseConfig)
    mockBuildSbatchCommand.mockReturnValue('sbatch --partition=gpu train.sh')
    mockSyncToRemote.mockResolvedValue({
      filesTransferred: 3,
      bytesTransferred: 512,
      duration: 200,
      errors: [],
    })
    mockConnect.mockResolvedValue(undefined)
    mockExec.mockResolvedValue({
      stdout: 'Submitted batch job 12345',
      stderr: '',
      exitCode: 0,
    })
    mockDisconnect.mockReturnValue(undefined)
  })

  afterEach(() => {
    process.exitCode = undefined
    vi.restoreAllMocks()
  })

  it('submit 命令注册到 Commander', async () => {
    const program = await setupCommand()
    const cmd = program.commands.find((command) => command.name() === 'submit')

    expect(cmd).toBeDefined()
    expect(cmd?.description()).toContain('Slurm')
  })

  it('submit 命令包含所有必要选项', async () => {
    const program = await setupCommand()
    const cmd = program.commands.find((command) => command.name() === 'submit')

    expect(cmd?.options.map((option) => option.long)).toEqual(expect.arrayContaining([
      '--partition',
      '--gpus',
      '--nodes',
      '--time',
      '--name',
      '--output',
      '--error',
      '--preset',
      '--guide',
      '--sync',
      '--dry-run',
    ]))
  })

  it('未使用 --preset 或 --guide 时保持原有提交参数行为', async () => {
    const program = await setupCommand()

    await program.parseAsync(['node', 'labcli', 'submit', 'train.sh', '--dry-run'])

    expect(mockBuildSbatchCommand).toHaveBeenCalledWith('train.sh', {
      partition: 'gpu',
      gpus: 2,
      nodes: 1,
      time: undefined,
      jobName: 'demo-job',
      output: undefined,
      error: undefined,
    })
    expect(mockPrompt).not.toHaveBeenCalled()
  })

  it('--preset single-gpu 会把预设资源传给 buildSbatchCommand', async () => {
    const program = await setupCommand()

    await program.parseAsync(['node', 'labcli', 'submit', 'train.sh', '--preset', 'single-gpu', '--dry-run'])

    expect(mockBuildSbatchCommand).toHaveBeenCalledWith('train.sh', {
      partition: 'gpu',
      gpus: 1,
      nodes: 1,
      time: '24:00:00',
      jobName: 'demo-job',
      output: undefined,
      error: undefined,
    })
  })

  it('显式 CLI 参数优先级高于 --preset', async () => {
    const program = await setupCommand()

    await program.parseAsync(['node', 'labcli', 'submit', 'train.sh', '--preset', 'single-gpu', '--gpus', '8', '--dry-run'])

    expect(mockBuildSbatchCommand).toHaveBeenCalledWith('train.sh', {
      partition: 'gpu',
      gpus: 8,
      nodes: 1,
      time: '24:00:00',
      jobName: 'demo-job',
      output: undefined,
      error: undefined,
    })
  })

  it('--guide 会通过交互式选择预设', async () => {
    mockPrompt.mockResolvedValue({ selectedPreset: 'single-gpu' })
    const program = await setupCommand()

    await program.parseAsync(['node', 'labcli', 'submit', 'train.sh', '--guide', '--dry-run'])

    expect(mockPrompt).toHaveBeenCalledWith([
      {
        type: 'list',
        name: 'selectedPreset',
        message: '选择资源预设:',
        choices: expect.arrayContaining([
          { name: '[debug] — 调试用（1 GPU，1小时）', value: 'debug' },
          { name: '[single-gpu] — 单 GPU 训练（1 GPU，24小时）', value: 'single-gpu' },
          { name: '[multi-gpu] — 多 GPU 训练（4 GPU，48小时）', value: 'multi-gpu' },
          { name: '[full-node] — 整节点训练（8 GPU，72小时）', value: 'full-node' },
        ]),
      },
    ])
    expect(mockBuildSbatchCommand).toHaveBeenCalledWith('train.sh', {
      partition: 'gpu',
      gpus: 1,
      nodes: 1,
      time: '24:00:00',
      jobName: 'demo-job',
      output: undefined,
      error: undefined,
    })
  })

  it('--preset 不存在时输出可用预设并退出', async () => {
    mockGetConfig.mockRejectedValue(new Error('全局配置不存在。请先运行 labcli init --global 初始化配置'))
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code?: string | number | null) => {
      throw new ExitCalled(typeof code === 'number' ? code : 0)
    }) as typeof process.exit)
    const program = await setupCommand()

    await program.parseAsync(['node', 'labcli', 'submit', 'train.sh', '--preset', 'nonexistent'])

    expect(errorSpy).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('可用预设: debug, single-gpu, multi-gpu, full-node')
    )
    expect(errorSpy).toHaveBeenNthCalledWith(2, '提交失败: EXIT:1')
    expect(exitSpy).toHaveBeenCalledWith(1)
    expect(process.exitCode).toBe(1)
    expect(mockGetConfig).not.toHaveBeenCalled()
    expect(mockBuildSbatchCommand).not.toHaveBeenCalled()
  })

  it('dry-run 模式仅打印将要执行的命令', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    const program = await setupCommand()

    await program.parseAsync(['node', 'labcli', 'submit', 'train.sh', '--dry-run'])

    expect(mockBuildSbatchCommand).toHaveBeenCalledWith('train.sh', {
      partition: 'gpu',
      gpus: 2,
      nodes: 1,
      time: undefined,
      jobName: 'demo-job',
      output: undefined,
      error: undefined,
    })
    expect(logSpy).toHaveBeenCalledWith('将要执行:', 'sbatch --partition=gpu train.sh')
    expect(mockConnect).not.toHaveBeenCalled()
  })

  it('开启 --sync 时会先同步代码再提交任务', async () => {
    const cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue('E:/repo')
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    const program = await setupCommand()

    await program.parseAsync(['node', 'labcli', 'submit', 'train.sh', '--sync'])

    expect(mockSyncToRemote).toHaveBeenCalledWith({
      localPath: 'E:/repo',
      remotePath: '/data/demo',
      host: '10.0.0.1',
      username: 'alice',
      excludePatterns: ['node_modules', '.git'],
      privateKeyPath: '~/.ssh/id_rsa',
      port: 22,
    })
    expect(mockConnect).toHaveBeenCalledTimes(1)
    expect(logSpy).toHaveBeenCalledWith('正在同步代码...')
    expect(logSpy).toHaveBeenCalledWith('✓ 代码同步完成')

    cwdSpy.mockRestore()
  })

  it('任务提交成功时解析 jobId 并输出关键信息', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    const program = await setupCommand()

    await program.parseAsync(['node', 'labcli', 'submit', 'train.sh'])

    expect(mockConnect).toHaveBeenCalledWith({
      host: '10.0.0.1',
      port: 22,
      username: 'alice',
      authMethod: 'key',
      privateKeyPath: '~/.ssh/id_rsa',
    })
    expect(mockExec).toHaveBeenCalledWith('sbatch --partition=gpu train.sh')
    expect(logSpy).toHaveBeenCalledWith('✓ 任务已提交')
    expect(logSpy).toHaveBeenCalledWith('  JobID: 12345')
    expect(logSpy).toHaveBeenCalledWith('  分区: gpu')
    expect(logSpy).toHaveBeenCalledWith('  GPU: 2')
    expect(mockDisconnect).toHaveBeenCalledTimes(1)
  })

  it('sbatch 执行失败时输出错误并退出', async () => {
    mockExec.mockResolvedValue({
      stdout: '',
      stderr: 'Invalid partition: gpu',
      exitCode: 1,
    })
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code?: string | number | null) => {
      throw new ExitCalled(typeof code === 'number' ? code : 0)
    }) as typeof process.exit)
    const program = await setupCommand()

    await program.parseAsync(['node', 'labcli', 'submit', 'train.sh'])

    expect(errorSpy).toHaveBeenNthCalledWith(1, '提交失败: Invalid partition: gpu')
    expect(errorSpy).toHaveBeenNthCalledWith(2, '提交失败: Invalid partition: gpu')
    expect(mockDisconnect).toHaveBeenCalledTimes(1)
    expect(process.exitCode).toBe(1)
    expect(exitSpy).not.toHaveBeenCalled()
  })
})
