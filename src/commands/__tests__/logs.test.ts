import { EventEmitter } from 'node:events'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Command } from 'commander'
import type { MergedConfig } from '../../types/index.js'

const mockGetConfig = vi.fn()
const mockConnect = vi.fn()
const mockExec = vi.fn()
const mockExecStream = vi.fn()
const mockDisconnect = vi.fn()

vi.mock('../../config/loader.js', () => ({
  getConfig: mockGetConfig,
}))

vi.mock('../../ssh/client.js', () => ({
  SSHClient: vi.fn(function MockSSHClient() {
    return {
    connect: mockConnect,
    exec: mockExec,
    execStream: mockExecStream,
    disconnect: mockDisconnect,
    }
  }),
}))

vi.mock('chalk', () => ({
  default: {
    green: (value: string) => value,
    red: (value: string) => value,
    yellow: (value: string) => value,
    blue: (value: string) => value,
  },
}))

class MockChannel extends EventEmitter {
  pipe = vi.fn().mockReturnThis()
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

async function setupCommand(): Promise<Command> {
  const { registerLogsCommand } = await import('../logs.js')
  const program = new Command()
  registerLogsCommand(program)
  return program
}

describe('logs 命令', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.exitCode = undefined
    mockGetConfig.mockResolvedValue(baseConfig)
    mockConnect.mockResolvedValue(undefined)
    mockExec.mockResolvedValueOnce({
      stdout: 'JobId=12345 Name=train StdOut=/tmp/slurm/12345.out StdErr=/tmp/slurm/12345.err',
      stderr: '',
      exitCode: 0,
    }).mockResolvedValueOnce({
      stdout: 'line1\nline2\n',
      stderr: '',
      exitCode: 0,
    })
    mockExecStream.mockResolvedValue(new MockChannel())
    mockDisconnect.mockReturnValue(undefined)
  })

  afterEach(() => {
    process.exitCode = undefined
    vi.restoreAllMocks()
  })

  it('logs 命令注册到 Commander', async () => {
    const program = await setupCommand()
    const cmd = program.commands.find((command) => command.name() === 'logs')

    expect(cmd).toBeDefined()
    expect(cmd?.description()).toContain('日志')
  })

  it('logs 命令包含 --follow 和 --tail 选项', async () => {
    const program = await setupCommand()
    const cmd = program.commands.find((command) => command.name() === 'logs')

    expect(cmd?.options.map((option) => option.long)).toEqual(expect.arrayContaining([
      '--follow',
      '--tail',
      '--output',
      '--error',
    ]))
  })

  it('读取 stdout 日志时先解析 scontrol 再执行 tail', async () => {
    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    const program = await setupCommand()

    await program.parseAsync(['node', 'lab-cli', 'logs', '12345', '--tail', '20'])

    expect(mockExec).toHaveBeenNthCalledWith(1, "scontrol show job '12345'")
    expect(mockExec).toHaveBeenNthCalledWith(2, "tail -n '20' '/tmp/slurm/12345.out'")
    expect(writeSpy).toHaveBeenCalledWith('line1\nline2\n')
  })

  it('读取 stderr 日志时解析 StdErr 路径', async () => {
    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    const program = await setupCommand()

    await program.parseAsync(['node', 'lab-cli', 'logs', '12345', '--error'])

    expect(mockExec).toHaveBeenNthCalledWith(2, "tail -n '50' '/tmp/slurm/12345.err'")
    expect(writeSpy).toHaveBeenCalled()
  })

  it('follow 模式通过 execStream 跟踪日志', async () => {
    const channel = new MockChannel()
    mockExecStream.mockResolvedValue(channel)
    let resolveSigintReady: (() => void) | undefined
    const sigintReady = new Promise<void>((resolve) => {
      resolveSigintReady = resolve
    })
    const processOnSpy = vi.spyOn(process, 'on').mockImplementation((((event, listener) => {
      void listener
      if (event === 'SIGINT') {
        resolveSigintReady?.()
      }
      return process
    }) as typeof process.on))
    const program = await setupCommand()

    const parsePromise = program.parseAsync(['node', 'lab-cli', 'logs', '12345', '--follow'])
    await sigintReady
    channel.emit('close')
    await parsePromise

    expect(mockExecStream).toHaveBeenCalledWith("tail -n '50' -f '/tmp/slurm/12345.out'")
    expect(channel.pipe).toHaveBeenCalledWith(process.stdout)
    expect(processOnSpy).toHaveBeenCalledWith('SIGINT', expect.any(Function))
  })

  it('缺少 jobId 时输出错误并退出', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const program = await setupCommand()

    await program.parseAsync(['node', 'lab-cli', 'logs'])

    expect(errorSpy).toHaveBeenNthCalledWith(1, '请指定 jobId')
    expect(errorSpy).toHaveBeenNthCalledWith(2, '查看日志失败: 请指定 jobId')
    expect(process.exitCode).toBe(1)
  })
})
