import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Command } from 'commander'
import type { MergedConfig } from '../../types/index.js'

const mockExistsSync = vi.fn()
const mockStatSync = vi.fn()
const mockGetConfig = vi.fn()
const mockSyncToRemote = vi.fn()
const mockUploadFile = vi.fn()
const mockSftp = vi.fn()
const mockSshManagerGetConnection = vi.fn()
const mockSpinner = {
  start: vi.fn(),
  succeed: vi.fn(),
  fail: vi.fn(),
}
const mockOra = vi.fn(() => mockSpinner)
const mockDim = vi.fn((value: string) => value)

vi.mock('fs', () => ({
  existsSync: mockExistsSync,
  statSync: mockStatSync,
}))

vi.mock('../../config/loader.js', () => ({
  getConfig: mockGetConfig,
}))

vi.mock('../../transfer/rsync.js', () => ({
  syncToRemote: mockSyncToRemote,
}))

vi.mock('../../transfer/sftp.js', () => ({
  uploadFile: mockUploadFile,
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
  syncExclude: ['node_modules', '.git'],
  condaPythonVersion: '3.11',
}

async function setupCommand(): Promise<Command> {
  const { registerUploadCommand } = await import('../upload.js')
  const program = new Command()
  registerUploadCommand(program)
  return program
}

describe('upload 命令', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSpinner.start.mockReturnValue(mockSpinner)
    mockSpinner.succeed.mockReturnValue(mockSpinner)
    mockSpinner.fail.mockReturnValue(mockSpinner)
    mockExistsSync.mockReturnValue(true)
    mockGetConfig.mockResolvedValue(baseConfig)
    mockSftp.mockResolvedValue('mock-sftp')
    mockUploadFile.mockResolvedValue(undefined)
    mockSshManagerGetConnection.mockResolvedValue({
      sftp: mockSftp,
    })
    mockSyncToRemote.mockResolvedValue({
      filesTransferred: 1,
      bytesTransferred: 128,
      duration: 100,
      errors: [],
    })
  })

  it('upload 命令注册到 Commander', async () => {
    const program = await setupCommand()
    const cmd = program.commands.find((command) => command.name() === 'upload')

    expect(cmd).toBeDefined()
    expect(cmd?.description()).toContain('上传')
  })

  it('目录上传时调用 syncToRemote 并使用默认目标路径', async () => {
    mockStatSync.mockReturnValue({
      isDirectory: () => true,
      size: 0,
    })

    const program = await setupCommand()
    await program.parseAsync(['node', 'labcli', 'upload', 'dataset'])

    expect(mockOra).toHaveBeenCalledWith('正在上传 dataset 到 /data/demo/data...')
    expect(mockSyncToRemote).toHaveBeenCalledWith({
      localPath: 'dataset',
      remotePath: '/data/demo/data',
      host: '10.0.0.1',
      username: 'alice',
      excludePatterns: ['node_modules', '.git'],
      privateKeyPath: '~/.ssh/id_rsa',
      port: 22,
    })
    expect(mockSpinner.succeed).toHaveBeenCalledWith('✓ 上传完成: dataset → /data/demo/data')
  })

  it('小文件上传时走 SFTP 流程', async () => {
    mockStatSync.mockReturnValue({
      isDirectory: () => false,
      size: 1024,
    })

    const program = await setupCommand()
    await program.parseAsync(['node', 'labcli', 'upload', 'artifacts/model.bin', '/remote/files'])

    expect(mockSshManagerGetConnection).toHaveBeenCalledWith(baseConfig)
    expect(mockSftp).toHaveBeenCalledTimes(1)
    expect(mockUploadFile).toHaveBeenCalledWith('mock-sftp', 'artifacts/model.bin', '/remote/files/model.bin')
    expect(mockSyncToRemote).not.toHaveBeenCalled()
  })

  it('SFTP 提示', async () => {
    mockStatSync.mockReturnValue({
      isDirectory: () => false,
      size: 1024,
    })

    const program = await setupCommand()
    await program.parseAsync(['node', 'labcli', 'upload', 'artifacts/model.bin'])

    expect(mockDim).toHaveBeenCalledWith('ℹ 使用 SFTP 传输（rsync 不可用或文件较小）')
  })

  it('大文件上传时走 rsync 且不带 excludePatterns', async () => {
    mockStatSync.mockReturnValue({
      isDirectory: () => false,
      size: 100 * 1024 * 1024,
    })

    const program = await setupCommand()
    await program.parseAsync(['node', 'labcli', 'upload', 'big-dataset.tar'])

    expect(mockSyncToRemote).toHaveBeenCalledWith({
      localPath: 'big-dataset.tar',
      remotePath: '/data/demo/data',
      host: '10.0.0.1',
      username: 'alice',
      excludePatterns: [],
      privateKeyPath: '~/.ssh/id_rsa',
      port: 22,
    })
    expect(mockUploadFile).not.toHaveBeenCalled()
  })

  it('本地路径不存在时输出友好错误并退出', async () => {
    mockExistsSync.mockReturnValue(false)
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const program = await setupCommand()

    process.exitCode = undefined
    await program.parseAsync(['node', 'labcli', 'upload', 'missing-path'])

    expect(errorSpy).toHaveBeenNthCalledWith(1, '路径不存在: missing-path')
    expect(process.exitCode).toBe(1)

    process.exitCode = undefined
    errorSpy.mockRestore()
  })
})
