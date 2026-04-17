import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { existsSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { globalConfigSchema, projectConfigSchema } from '../schema.js'

describe('配置 Schema 验证', () => {
  it('有效全局配置通过验证并应用默认 port', () => {
    const result = globalConfigSchema.safeParse({
      host: '10.0.0.1',
      username: 'user',
      authMethod: 'key',
      defaultRemotePath: '/home/user',
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.port).toBe(22)
    }
  })

  it('无效全局配置（缺少 host）拒绝', () => {
    const result = globalConfigSchema.safeParse({
      port: 22,
      username: 'user',
      authMethod: 'key',
      defaultRemotePath: '/home/user',
    })

    expect(result.success).toBe(false)
  })

  it('有效项目配置通过验证并应用默认值', () => {
    const result = projectConfigSchema.safeParse({
      name: 'my-project',
      remotePath: '/data/project',
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.condaPythonVersion).toBe('3.10')
      expect(result.data.syncExclude).toContain('node_modules')
      expect(result.data.syncExclude).toContain('.sisyphus')
    }
  })

  it('无效项目配置（缺少 remotePath）拒绝', () => {
    const result = projectConfigSchema.safeParse({
      name: 'my-project',
    })

    expect(result.success).toBe(false)
  })
})

describe('配置加载与写入', () => {
  let sandboxDir: string

  beforeEach(() => {
    sandboxDir = mkdtempSync(join(tmpdir(), 'lab-cli-config-'))
    vi.resetModules()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.resetModules()
    vi.doUnmock('os')
    rmSync(sandboxDir, { recursive: true, force: true })
  })

  it('mergeConfig 在缺少项目配置时抛错', async () => {
    const { mergeConfig } = await import('../loader.js')

    await expect(
      mergeConfig(
        {
          host: '10.0.0.1',
          port: 22,
          username: 'user',
          authMethod: 'key',
          defaultRemotePath: '/home/user',
        },
        null,
      ),
    ).rejects.toThrow('项目配置不存在')
  })

  it('loadProjectConfig 从 .labrc 读取并验证项目配置', async () => {
    vi.spyOn(process, 'cwd').mockReturnValue(sandboxDir)
    writeFileSync(
      join(sandboxDir, '.labrc'),
      ['name: demo', 'remotePath: /data/demo', 'slurmGpus: 2'].join('\n'),
      'utf-8',
    )

    const { loadProjectConfig } = await import('../loader.js')
    const config = await loadProjectConfig()

    expect(config).not.toBeNull()
    expect(config).toMatchObject({
      name: 'demo',
      remotePath: '/data/demo',
      slurmGpus: 2,
      condaPythonVersion: '3.10',
    })
  })

  it('writeProjectConfig 写入 .labrc 文件', async () => {
    vi.spyOn(process, 'cwd').mockReturnValue(sandboxDir)

    const { writeProjectConfig } = await import('../writer.js')

    writeProjectConfig({
      name: 'demo',
      remotePath: '/data/demo',
      syncExclude: ['node_modules'],
      condaPythonVersion: '3.11',
    })

    expect(existsSync(join(sandboxDir, '.labrc'))).toBe(true)
    const { loadProjectConfig } = await import('../loader.js')
    await expect(loadProjectConfig()).resolves.toMatchObject({
      name: 'demo',
      remotePath: '/data/demo',
      condaPythonVersion: '3.11',
    })
  })

  it('writeGlobalConfig 与 loadGlobalConfig 使用用户目录配置文件', async () => {
    const fakeHome = join(sandboxDir, 'home')
    mkdirSync(fakeHome, { recursive: true })

    vi.doMock('os', async () => {
      const actual = await vi.importActual<typeof import('os')>('os')
      return {
        ...actual,
        homedir: () => fakeHome,
      }
    })

    const { writeGlobalConfig } = await import('../writer.js')
    const { loadGlobalConfig } = await import('../loader.js')

    writeGlobalConfig({
      host: '10.0.0.1',
      port: 2200,
      username: 'user',
      authMethod: 'key',
      defaultRemotePath: '/home/user',
    })

    await expect(loadGlobalConfig()).resolves.toMatchObject({
      host: '10.0.0.1',
      port: 2200,
      username: 'user',
      authMethod: 'key',
      defaultRemotePath: '/home/user',
    })
    expect(existsSync(join(fakeHome, '.lab-cli', 'config.yaml'))).toBe(true)
  })

  it('getConfig 合并全局与项目配置', async () => {
    const fakeHome = join(sandboxDir, 'home')
    mkdirSync(fakeHome, { recursive: true })
    vi.spyOn(process, 'cwd').mockReturnValue(sandboxDir)

    writeFileSync(
      join(sandboxDir, '.labrc.yml'),
      ['name: demo', 'remotePath: /data/demo', 'condaEnvName: ml'].join('\n'),
      'utf-8',
    )

    vi.doMock('os', async () => {
      const actual = await vi.importActual<typeof import('os')>('os')
      return {
        ...actual,
        homedir: () => fakeHome,
      }
    })

    mkdirSync(join(fakeHome, '.lab-cli'), { recursive: true })
    writeFileSync(
      join(fakeHome, '.lab-cli', 'config.yaml'),
      ['host: 10.0.0.1', 'username: user', 'authMethod: key', 'defaultRemotePath: /home/user'].join('\n'),
      'utf-8',
    )

    const { getConfig } = await import('../loader.js')

    await expect(getConfig()).resolves.toMatchObject({
      host: '10.0.0.1',
      port: 22,
      username: 'user',
      authMethod: 'key',
      defaultRemotePath: '/home/user',
      name: 'demo',
      remotePath: '/data/demo',
      condaEnvName: 'ml',
      condaPythonVersion: '3.10',
    })
  })
})
