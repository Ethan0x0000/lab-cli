import { homedir } from 'node:os'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildRsyncArgs } from '../rsync.js'
import { ensureRemoteDirectory } from '../sftp.js'
import * as transfer from '../index.js'

describe('rsync 参数构建', () => {
  it('buildRsyncArgs 构建基本参数', () => {
    const args = buildRsyncArgs({
      localPath: './src',
      remotePath: '/data/project/src',
      host: '10.0.0.1',
      username: 'user',
      excludePatterns: ['node_modules', '.git'],
      port: 22,
      privateKeyPath: '~/.ssh/id_rsa',
    })

    expect(args).toContain('-avz')
    expect(args).toContain('--delete')
    expect(args).toContain('--out-format=%n')
    expect(args).toContain('--exclude=node_modules')
    expect(args).toContain('--exclude=.git')
    expect(args).toContain('./src')
    expect(args).toContain('user@10.0.0.1:/data/project/src')
  })

  it('buildRsyncArgs 包含 SSH 参数', () => {
    const args = buildRsyncArgs({
      localPath: './src',
      remotePath: '/data/project',
      host: '10.0.0.1',
      username: 'user',
      excludePatterns: [],
      port: 2222,
      privateKeyPath: '~/.ssh/id_rsa',
    })

    const sshArgIdx = args.indexOf('-e')
    expect(sshArgIdx).toBeGreaterThan(-1)
    const sshArg = args[sshArgIdx + 1]
    expect(sshArg).toContain('ssh')
    expect(sshArg).toContain('-p 2222')
    expect(sshArg).toContain(`-i "${homedir()}/.ssh/id_rsa"`)
  })

  it('dryRun 模式添加 --dry-run 参数', () => {
    const args = buildRsyncArgs({
      localPath: './src',
      remotePath: '/data/project',
      host: '10.0.0.1',
      username: 'user',
      excludePatterns: [],
      dryRun: true,
    })

    expect(args).toContain('--dry-run')
  })

  it('无 privateKeyPath 时 SSH 参数不包含 -i', () => {
    const args = buildRsyncArgs({
      localPath: './src',
      remotePath: '/data/project',
      host: '10.0.0.1',
      username: 'user',
      excludePatterns: [],
      port: 22,
    })

    const sshArgIdx = args.indexOf('-e')
    expect(sshArgIdx).toBeGreaterThan(-1)
    const sshArg = args[sshArgIdx + 1]
    expect(sshArg).not.toContain('-i')
  })

  it('多个排除模式都被添加', () => {
    const patterns = ['node_modules', '.git', '__pycache__', 'dist']
    const args = buildRsyncArgs({
      localPath: './src',
      remotePath: '/data/project',
      host: '10.0.0.1',
      username: 'user',
      excludePatterns: patterns,
    })

    for (const pattern of patterns) {
      expect(args).toContain(`--exclude=${pattern}`)
    }
  })

  it('默认端口为 22', () => {
    const args = buildRsyncArgs({
      localPath: './src',
      remotePath: '/data/project',
      host: '10.0.0.1',
      username: 'user',
      excludePatterns: [],
    })

    const sshArgIdx = args.indexOf('-e')
    const sshArg = args[sshArgIdx + 1]
    expect(sshArg).toContain('-p 22')
  })
})

describe('transfer 导出', () => {
  it('index 统一导出 transfer API', () => {
    expect(transfer.buildRsyncArgs).toBeTypeOf('function')
    expect(transfer.syncToRemote).toBeTypeOf('function')
    expect(transfer.uploadFile).toBeTypeOf('function')
    expect(transfer.uploadDirectory).toBeTypeOf('function')
    expect(transfer.ensureRemoteDirectory).toBeTypeOf('function')
  })
})

describe('ensureRemoteDirectory', () => {
  const mockStat = vi.fn()
  const mockMkdir = vi.fn()

  function createMockSftp(): any {
    return {
      stat: mockStat,
      mkdir: mockMkdir,
    }
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('目录已存在时不创建', async () => {
    mockStat.mockImplementation((_path: string, cb: (err?: Error | null) => void) => {
      cb(null)
    })

    await ensureRemoteDirectory(createMockSftp(), '/data/project')

    expect(mockStat).toHaveBeenCalledWith('/data/project', expect.any(Function))
    expect(mockMkdir).not.toHaveBeenCalled()
  })

  it('目录不存在时逐级创建', async () => {
    let callCount = 0
    mockStat.mockImplementation((_path: string, cb: (err?: Error | null) => void) => {
      callCount++
      if (callCount <= 2) {
        cb(new Error('No such file'))
      } else {
        cb(null)
      }
    })
    mockMkdir.mockImplementation((_path: string, cb: (err?: Error | null) => void) => {
      cb(null)
    })

    await ensureRemoteDirectory(createMockSftp(), '/data/project')

    expect(mockMkdir).toHaveBeenCalledTimes(2)
    expect(mockMkdir).toHaveBeenNthCalledWith(1, '/data', expect.any(Function))
    expect(mockMkdir).toHaveBeenNthCalledWith(2, '/data/project', expect.any(Function))
  })

  it('EEXIST 错误视为成功', async () => {
    mockStat.mockImplementation((_path: string, cb: (err?: Error | null) => void) => {
      cb(new Error('No such file'))
    })
    mockMkdir.mockImplementation((_path: string, cb: (err?: Error | null) => void) => {
      const err = new Error('File exists') as NodeJS.ErrnoException
      err.code = 'EEXIST'
      cb(err)
    })

    await expect(ensureRemoteDirectory(createMockSftp(), '/data')).resolves.not.toThrow()
  })

  it('非 EEXIST 错误抛出异常', async () => {
    mockStat.mockImplementation((_path: string, cb: (err?: Error | null) => void) => {
      cb(new Error('No such file'))
    })
    mockMkdir.mockImplementation((_path: string, cb: (err?: Error | null) => void) => {
      const err = new Error('Permission denied') as NodeJS.ErrnoException
      err.code = 'EACCES'
      cb(err)
    })

    await expect(ensureRemoteDirectory(createMockSftp(), '/data')).rejects.toThrow('Permission denied')
  })

  it('空路径和根路径直接返回', async () => {
    await ensureRemoteDirectory(createMockSftp(), '')
    await ensureRemoteDirectory(createMockSftp(), '/')
    await ensureRemoteDirectory(createMockSftp(), '///')

    expect(mockStat).not.toHaveBeenCalled()
    expect(mockMkdir).not.toHaveBeenCalled()
  })

  it('相对路径正确解析', async () => {
    mockStat.mockImplementation((_path: string, cb: (err?: Error | null) => void) => {
      cb(new Error('No such file'))
    })
    mockMkdir.mockImplementation((_path: string, cb: (err?: Error | null) => void) => {
      cb(null)
    })

    await ensureRemoteDirectory(createMockSftp(), 'data/project')

    expect(mockMkdir).toHaveBeenCalledTimes(2)
    expect(mockMkdir).toHaveBeenNthCalledWith(1, 'data', expect.any(Function))
    expect(mockMkdir).toHaveBeenNthCalledWith(2, 'data/project', expect.any(Function))
  })
})
