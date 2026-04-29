import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { join } from 'path'
import { tmpdir } from 'os'
import { mkdtempSync, rmSync, writeFileSync } from 'fs'

vi.mock('child_process')
vi.mock('../../ssh/client.js', () => {
  const mockClient = {
    connect: vi.fn(),
    disconnect: vi.fn(),
    exec: vi.fn(),
  }
  return {
    SSHClient: vi.fn(function () {
      return mockClient
    }),
    mockClient,
  }
})

describe('Environment Checks', () => {
  let sandboxDir: string

  beforeEach(() => {
    sandboxDir = mkdtempSync(join(tmpdir(), 'lab-cli-checks-'))
    vi.resetModules()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.resetModules()
    vi.doUnmock('os')
    rmSync(sandboxDir, { recursive: true, force: true })
  })

  describe('checkGlobalConfig', () => {
    it('returns ok=true when global config exists and is valid YAML', async () => {
      vi.doMock('os', () => ({
        homedir: () => sandboxDir,
      }))

      const configDir = join(sandboxDir, '.lab-cli')
      const fs = await import('fs')
      fs.mkdirSync(configDir, { recursive: true })
      writeFileSync(join(configDir, 'config.yaml'), 'host: 10.0.0.1\nport: 22\n', 'utf-8')

      const { checkGlobalConfig } = await import('../checks.js')
      const result = await checkGlobalConfig()

      expect(result.ok).toBe(true)
      expect(result.message).toContain('正常')
    })

    it('returns ok=false when global config does not exist', async () => {
      vi.doMock('os', () => ({
        homedir: () => sandboxDir,
      }))

      const { checkGlobalConfig } = await import('../checks.js')
      const result = await checkGlobalConfig()

      expect(result.ok).toBe(false)
      expect(result.message).toContain('不存在')
    })

    it('returns ok=false when global config has invalid YAML', async () => {
      vi.doMock('os', () => ({
        homedir: () => sandboxDir,
      }))

      const configDir = join(sandboxDir, '.lab-cli')
      const fs = await import('fs')
      fs.mkdirSync(configDir, { recursive: true })
      writeFileSync(join(configDir, 'config.yaml'), 'invalid: yaml: content: [', 'utf-8')

      const { checkGlobalConfig } = await import('../checks.js')
      const result = await checkGlobalConfig()

      expect(result.ok).toBe(false)
      expect(result.message).toContain('YAML')
    })
  })

  describe('checkProjectConfig', () => {
    it('returns ok=true when .labrc exists', async () => {
      vi.spyOn(process, 'cwd').mockReturnValue(sandboxDir)
      writeFileSync(join(sandboxDir, '.labrc'), 'name: test\nremotePath: /data\n', 'utf-8')

      const { checkProjectConfig } = await import('../checks.js')
      const result = await checkProjectConfig()

      expect(result.ok).toBe(true)
      expect(result.message).toContain('正常')
    })

    it('returns ok=false when .labrc does not exist', async () => {
      vi.spyOn(process, 'cwd').mockReturnValue(sandboxDir)

      const { checkProjectConfig } = await import('../checks.js')
      const result = await checkProjectConfig()

      expect(result.ok).toBe(false)
      expect(result.message).toContain('不存在')
    })
  })

  describe('checkRsync', () => {
    it('returns ok=true when rsync is available', async () => {
      const { execSync } = await import('child_process')
      vi.mocked(execSync).mockReturnValue('rsync version 3.1.3' as any)

      const { checkRsync } = await import('../checks.js')
      const result = await checkRsync()

      expect(result.ok).toBe(true)
      expect(result.message).toContain('可用')
    })

    it('returns ok=false when rsync is not available', async () => {
      const { execSync } = await import('child_process')
      vi.mocked(execSync).mockImplementation(() => {
        throw new Error('rsync: command not found')
      })

      const { checkRsync } = await import('../checks.js')
      const result = await checkRsync()

      expect(result.ok).toBe(false)
      expect(result.message).toContain('不可用')
    })

    it('returns Windows-specific hint on Windows when rsync is missing', async () => {
      const { execSync } = await import('child_process')
      vi.mocked(execSync).mockImplementation(() => {
        throw new Error('rsync: command not found')
      })

      const originalPlatform = process.platform
      Object.defineProperty(process, 'platform', { value: 'win32' })

      const { checkRsync } = await import('../checks.js')
      const result = await checkRsync()

      expect(result.ok).toBe(false)
      expect(result.detail).toContain('Windows')
      expect(result.detail).toContain('SFTP')

      Object.defineProperty(process, 'platform', { value: originalPlatform })
    })
  })

  describe('checkSshConnection', () => {
    it('returns ok=true when SSH connection succeeds', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { mockClient } = (await import('../../ssh/client.js')) as any
      mockClient.connect.mockResolvedValue(undefined)
      mockClient.disconnect.mockClear()

      const { checkSshConnection } = await import('../checks.js')
      const result = await checkSshConnection({
        host: '10.0.0.1',
        port: 22,
        username: 'user',
        authMethod: 'key',
        privateKeyPath: '/home/user/.ssh/id_rsa',
      })

      expect(result.ok).toBe(true)
      expect(result.message).toContain('成功')
      expect(mockClient.disconnect).toHaveBeenCalled()
    })

    it('returns ok=false when SSH connection fails', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { mockClient } = (await import('../../ssh/client.js')) as any
      mockClient.connect.mockRejectedValue(new Error('Connection refused'))
      mockClient.disconnect.mockClear()

      const { checkSshConnection } = await import('../checks.js')
      const result = await checkSshConnection({
        host: '10.0.0.1',
        port: 22,
        username: 'user',
        authMethod: 'key',
        privateKeyPath: '/home/user/.ssh/id_rsa',
      })

      expect(result.ok).toBe(false)
      expect(result.message).toContain('失败')
    })
  })

  describe('checkSlurmAvailable', () => {
    it('returns ok=true when squeue --version succeeds', async () => {
      const mockClient = {
        exec: vi.fn().mockResolvedValue({
          stdout: 'slurm 21.08.5',
          stderr: '',
          exitCode: 0,
        }),
      }

      const { checkSlurmAvailable } = await import('../checks.js')
      const result = await checkSlurmAvailable(mockClient as any)

      expect(result.ok).toBe(true)
      expect(result.message).toContain('可用')
    })

    it('returns ok=false when squeue --version fails', async () => {
      const mockClient = {
        exec: vi.fn().mockResolvedValue({
          stdout: '',
          stderr: 'squeue: command not found',
          exitCode: 127,
        }),
      }

      const { checkSlurmAvailable } = await import('../checks.js')
      const result = await checkSlurmAvailable(mockClient as any)

      expect(result.ok).toBe(false)
      expect(result.message).toContain('不可用')
    })

    it('returns ok=false when exec throws error', async () => {
      const mockClient = {
        exec: vi.fn().mockRejectedValue(new Error('SSH error')),
      }

      const { checkSlurmAvailable } = await import('../checks.js')
      const result = await checkSlurmAvailable(mockClient as any)

      expect(result.ok).toBe(false)
      expect(result.message).toContain('失败')
    })
  })

  describe('checkSlurmJsonSupport', () => {
    it('returns ok=true when squeue --json --help succeeds', async () => {
      const mockClient = {
        exec: vi.fn().mockResolvedValue({
          stdout: 'help text',
          stderr: '',
          exitCode: 0,
        }),
      }

      const { checkSlurmJsonSupport } = await import('../checks.js')
      const result = await checkSlurmJsonSupport(mockClient as any)

      expect(result.ok).toBe(true)
      expect(result.message).toContain('可用')
    })

    it('returns ok=false when squeue --json --help fails', async () => {
      const mockClient = {
        exec: vi.fn().mockResolvedValue({
          stdout: '',
          stderr: 'unrecognized option: --json',
          exitCode: 1,
        }),
      }

      const { checkSlurmJsonSupport } = await import('../checks.js')
      const result = await checkSlurmJsonSupport(mockClient as any)

      expect(result.ok).toBe(false)
      expect(result.message).toContain('不可用')
    })

    it('returns ok=false when exec throws error', async () => {
      const mockClient = {
        exec: vi.fn().mockRejectedValue(new Error('SSH error')),
      }

      const { checkSlurmJsonSupport } = await import('../checks.js')
      const result = await checkSlurmJsonSupport(mockClient as any)

      expect(result.ok).toBe(false)
      expect(result.message).toContain('失败')
    })
  })

  describe('runAllChecks', () => {
    it('runs basic checks without SSH options', async () => {
      vi.doMock('os', () => ({
        homedir: () => sandboxDir,
      }))
      vi.spyOn(process, 'cwd').mockReturnValue(sandboxDir)

      const { execSync } = await import('child_process')
      vi.mocked(execSync).mockReturnValue('rsync version 3.1.3' as any)

      const configDir = join(sandboxDir, '.lab-cli')
      const fs = await import('fs')
      fs.mkdirSync(configDir, { recursive: true })
      writeFileSync(join(configDir, 'config.yaml'), 'host: 10.0.0.1\n', 'utf-8')
      writeFileSync(join(sandboxDir, '.labrc'), 'name: test\nremotePath: /data\n', 'utf-8')

      const { runAllChecks } = await import('../checks.js')
      const results = await runAllChecks()

      expect(results).toHaveLength(3)
      expect(results[0].message).toContain('全局配置')
      expect(results[1].message).toContain('项目配置')
      expect(results[2].message).toContain('rsync')
    })

    it('runs all checks including SSH when options provided', async () => {
      vi.doMock('os', () => ({
        homedir: () => sandboxDir,
      }))
      vi.spyOn(process, 'cwd').mockReturnValue(sandboxDir)

      const { execSync } = await import('child_process')
      vi.mocked(execSync).mockReturnValue('rsync version 3.1.3' as any)

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { mockClient } = (await import('../../ssh/client.js')) as any
      mockClient.connect.mockResolvedValue(undefined)
      mockClient.disconnect.mockClear()
      mockClient.exec
        .mockResolvedValueOnce({
          stdout: 'slurm 21.08.5',
          stderr: '',
          exitCode: 0,
        })
        .mockResolvedValueOnce({
          stdout: 'help',
          stderr: '',
          exitCode: 0,
        })

      const configDir = join(sandboxDir, '.lab-cli')
      const fs = await import('fs')
      fs.mkdirSync(configDir, { recursive: true })
      writeFileSync(join(configDir, 'config.yaml'), 'host: 10.0.0.1\n', 'utf-8')
      writeFileSync(join(sandboxDir, '.labrc'), 'name: test\nremotePath: /data\n', 'utf-8')

      const { runAllChecks } = await import('../checks.js')
      const results = await runAllChecks({
        sshOptions: {
          host: '10.0.0.1',
          port: 22,
          username: 'user',
          authMethod: 'key',
          privateKeyPath: '/home/user/.ssh/id_rsa',
        },
      })

      expect(results.length).toBeGreaterThanOrEqual(5)
      expect(results.some(r => r.message.includes('SSH'))).toBe(true)
      expect(results.some(r => r.message.includes('Slurm'))).toBe(true)
    })
  })
})
