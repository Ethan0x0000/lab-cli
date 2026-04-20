import { homedir } from 'node:os'
import { describe, expect, it } from 'vitest'
import { buildRsyncArgs } from '../rsync.js'
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
  })
})
