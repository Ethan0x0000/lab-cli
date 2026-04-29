import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Command } from 'commander'
import type { CheckResult } from '../../utils/checks.js'
import type { MergedConfig } from '../../types/index.js'

const {
  mockCheckGlobalConfig,
  mockCheckProjectConfig,
  mockCheckRsync,
  mockCheckSshConnection,
  mockCheckSlurmAvailable,
  mockCheckSlurmJsonSupport,
  mockGetConfig,
  mockSshManagerGetConnection,
  mockOra,
} = vi.hoisted(() => ({
  mockCheckGlobalConfig: vi.fn(),
  mockCheckProjectConfig: vi.fn(),
  mockCheckRsync: vi.fn(),
  mockCheckSshConnection: vi.fn(),
  mockCheckSlurmAvailable: vi.fn(),
  mockCheckSlurmJsonSupport: vi.fn(),
  mockGetConfig: vi.fn(),
  mockSshManagerGetConnection: vi.fn(),
  mockOra: vi.fn((text: string) => ({
    text,
    start: vi.fn().mockReturnThis(),
    stop: vi.fn().mockReturnThis(),
    succeed: vi.fn().mockReturnThis(),
    fail: vi.fn().mockReturnThis(),
  })),
}))

vi.mock('../../utils/checks.js', () => ({
  checkGlobalConfig: mockCheckGlobalConfig,
  checkProjectConfig: mockCheckProjectConfig,
  checkRsync: mockCheckRsync,
  checkSshConnection: mockCheckSshConnection,
  checkSlurmAvailable: mockCheckSlurmAvailable,
  checkSlurmJsonSupport: mockCheckSlurmJsonSupport,
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

vi.mock('ora', () => ({
  default: mockOra,
}))

vi.mock('chalk', () => ({
  default: {
    green: (value: string) => value,
    red: (value: string) => value,
    blue: (value: string) => value,
    dim: (value: string) => value,
    yellow: (value: string) => value,
    bold: (value: string) => value,
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

const ok = (message: string, detail?: string): CheckResult => ({ ok: true, message, detail })
const fail = (message: string, detail?: string): CheckResult => ({ ok: false, message, detail })

async function createProgram(): Promise<Command> {
  const { registerDoctorCommand } = await import('../doctor.js')
  const program = new Command()
  registerDoctorCommand(program)
  return program
}

async function runDoctor(): Promise<void> {
  const program = await createProgram()
  await program.parseAsync(['node', 'test', 'doctor'])
}

describe('doctor 命令', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCheckGlobalConfig.mockResolvedValue(ok('全局配置正常'))
    mockCheckProjectConfig.mockResolvedValue(ok('项目配置正常'))
    mockCheckRsync.mockResolvedValue(ok('rsync 可用'))
    mockCheckSshConnection.mockResolvedValue(ok('SSH 连接成功'))
    mockCheckSlurmAvailable.mockResolvedValue(ok('Slurm 可用'))
    mockCheckSlurmJsonSupport.mockResolvedValue(ok('Slurm JSON 支持可用'))
    mockGetConfig.mockResolvedValue(baseConfig)
    mockSshManagerGetConnection.mockResolvedValue({})
    vi.spyOn(console, 'log').mockImplementation(() => undefined)
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`process.exit:${code ?? 0}`)
    }) as never)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('所有检查通过时显示 6/6 汇总', async () => {
    await runDoctor()

    expect(mockCheckGlobalConfig).toHaveBeenCalledTimes(1)
    expect(mockCheckProjectConfig).toHaveBeenCalledTimes(1)
    expect(mockCheckRsync).toHaveBeenCalledTimes(1)
    expect(mockGetConfig).toHaveBeenCalledTimes(2)
    expect(mockCheckSshConnection).toHaveBeenCalledWith({
      host: baseConfig.host,
      port: baseConfig.port,
      username: baseConfig.username,
      authMethod: baseConfig.authMethod,
      privateKeyPath: baseConfig.privateKeyPath,
    })
    expect(mockCheckSlurmAvailable).toHaveBeenCalledTimes(1)
    expect(mockCheckSlurmJsonSupport).toHaveBeenCalledTimes(1)
    expect(mockSshManagerGetConnection).toHaveBeenCalledTimes(1)
    expect(console.log).toHaveBeenCalledWith('\n诊断完成: 6/6 项通过')
  })

  it('全局配置失败时跳过 SSH 和 Slurm 检查', async () => {
    mockCheckGlobalConfig.mockResolvedValue(fail('全局配置不存在', '请先初始化'))

    await runDoctor()

    expect(mockGetConfig).not.toHaveBeenCalled()
    expect(mockCheckSshConnection).not.toHaveBeenCalled()
    expect(mockCheckSlurmAvailable).not.toHaveBeenCalled()
    expect(mockCheckSlurmJsonSupport).not.toHaveBeenCalled()
    expect(console.log).toHaveBeenCalledWith('○ 跳过 SSH 连接检查：全局配置未通过')
    expect(console.log).toHaveBeenCalledWith('○ 跳过 Slurm 可用性检查：全局配置未通过')
    expect(console.log).toHaveBeenCalledWith('○ 跳过 Slurm JSON 支持检查：全局配置未通过')
    expect(console.log).toHaveBeenCalledWith('\n诊断完成: 2/3 项通过（3 项跳过）')
  })

  it('SSH 检查失败时跳过 Slurm 检查', async () => {
    mockCheckSshConnection.mockResolvedValue(fail('SSH 连接失败', '认证失败'))

    await runDoctor()

    expect(mockGetConfig).toHaveBeenCalledTimes(1)
    expect(mockCheckSshConnection).toHaveBeenCalledTimes(1)
    expect(mockCheckSlurmAvailable).not.toHaveBeenCalled()
    expect(mockCheckSlurmJsonSupport).not.toHaveBeenCalled()
    expect(console.log).toHaveBeenCalledWith('○ 跳过 Slurm 可用性检查：SSH 连接未通过')
    expect(console.log).toHaveBeenCalledWith('○ 跳过 Slurm JSON 支持检查：SSH 连接未通过')
    expect(console.log).toHaveBeenCalledWith('\n诊断完成: 3/4 项通过（2 项跳过）')
  })

  it('部分检查失败时汇总通过数量', async () => {
    mockCheckRsync.mockResolvedValue(fail('rsync 不可用', '未安装'))
    mockCheckSlurmJsonSupport.mockResolvedValue(fail('Slurm JSON 支持不可用', '版本过低'))

    await runDoctor()

    expect(console.log).toHaveBeenCalledWith('\n诊断完成: 4/6 项通过')
    expect(console.log).toHaveBeenCalledWith('未安装')
    expect(console.log).toHaveBeenCalledWith('版本过低')
  })
})
