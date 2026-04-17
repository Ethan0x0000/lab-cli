import { describe, it, expectTypeOf } from 'vitest'
import type { GlobalConfig, ProjectConfig, MergedConfig, SlurmJobInfo, SlurmNodeInfo, SSHConnectionOptions, SSHExecResult } from '../index.js'

describe('TypeScript 类型定义', () => {
  it('GlobalConfig 类型正确导出', () => {
    const config: GlobalConfig = {
      host: '10.0.0.1',
      port: 22,
      username: 'user',
      authMethod: 'key',
      defaultRemotePath: '/home/user',
    }
    expectTypeOf(config.host).toBeString()
    expectTypeOf(config.port).toBeNumber()
    expectTypeOf(config.authMethod).toEqualTypeOf<'key' | 'password'>()
  })

  it('ProjectConfig 类型正确导出', () => {
    const config: ProjectConfig = {
      name: 'my-project',
      remotePath: '/data/project',
      syncExclude: ['node_modules'],
      condaPythonVersion: '3.10',
    }
    expectTypeOf(config.name).toBeString()
    expectTypeOf(config.syncExclude).toEqualTypeOf<string[]>()
  })

  it('MergedConfig 合并了 GlobalConfig 和 ProjectConfig', () => {
    const merged: MergedConfig = {
      host: '10.0.0.1',
      port: 22,
      username: 'user',
      authMethod: 'key',
      defaultRemotePath: '/home/user',
      name: 'project',
      remotePath: '/data/project',
      syncExclude: [],
      condaPythonVersion: '3.10',
    }
    expectTypeOf(merged.host).toBeString()
    expectTypeOf(merged.remotePath).toBeString()
  })

  it('SlurmJobInfo 类型正确导出', () => {
    const job: SlurmJobInfo = {
      jobId: '12345',
      name: 'train',
      state: 'RUNNING',
      partition: 'gpu',
      nodes: 1,
      gpus: 2,
      timeUsed: '01:00:00',
      timeLimit: '24:00:00',
    }
    expectTypeOf(job.jobId).toBeString()
  })

  it('SSHConnectionOptions 类型正确导出', () => {
    const opts: SSHConnectionOptions = {
      host: '10.0.0.1',
      port: 22,
      username: 'user',
      authMethod: 'key',
      privateKeyPath: '~/.ssh/id_rsa',
    }
    expectTypeOf(opts.authMethod).toEqualTypeOf<'key' | 'password'>()
  })

  it('SSHExecResult 类型正确导出', () => {
    const result: SSHExecResult = {
      stdout: 'output',
      stderr: '',
      exitCode: 0,
    }
    expectTypeOf(result.exitCode).toBeNumber()
  })
})
