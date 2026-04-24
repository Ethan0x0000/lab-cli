import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Command } from 'commander'
import type { MergedConfig } from '../../types/index.js'

const mockExistsSync = vi.fn()
const mockStatSync = vi.fn()
const mockGetConfig = vi.fn()
const mockSyncToRemote = vi.fn()
const mockUploadFile = vi.fn()
const mockEnsureRemoteDirectory = vi.fn()
const mockConnect = vi.fn()
const mockSftp = vi.fn()
const mockDisconnect = vi.fn()
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
  ensureRemoteDirectory: mockEnsureRemoteDirectory,
}))

vi.mock('../../ssh/client.js', () => ({
  SSHClient: vi.fn(function MockSSHClient() {
    return {
    connect: mockConnect,
    sftp: mockSftp,
    disconnect: mockDisconnect,
    }
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
    mockConnect.mockResolvedValue(undefined)
    mockSftp.mockResolvedValue('mock-sftp')
    mockDisconnect.mockReturnValue(undefined)
    mockUploadFile.mockResolvedValue(undefined)
    mockEnsureRemoteDirectory.mockResolvedValue(undefined)
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

    expect(mockConnect).toHaveBeenCalledWith({
      host: '10.0.0.1',
      port: 22,
      username: 'alice',
      authMethod: 'key',
      privateKeyPath: '~/.ssh/id_rsa',
    })
    expect(mockSftp).toHaveBeenCalledTimes(1)
    expect(mockEnsureRemoteDirectory).toHaveBeenCalledWith('mock-sftp', '/remote/files')
    expect(mockUploadFile).toHaveBeenCalledWith('mock-sftp', 'artifacts/model.bin', '/remote/files/model.bin')
    expect(mockDisconnect).toHaveBeenCalledTimes(1)
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
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code?: string | number | null) => {
      throw new ExitCalled(typeof code === 'number' ? code : 0)
    }) as typeof process.exit)
    const program = await setupCommand()

    await expect(program.parseAsync(['node', 'labcli', 'upload', 'missing-path'])).rejects.toMatchObject({ code: 1 })

    expect(errorSpy).toHaveBeenNthCalledWith(1, '路径不存在: missing-path')
    expect(errorSpy).toHaveBeenNthCalledWith(2, '上传失败: EXIT:1')
    expect(exitSpy).toHaveBeenCalledWith(1)
  })
})
