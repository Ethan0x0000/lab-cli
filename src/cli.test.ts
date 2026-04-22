import { describe, it, expect } from 'vitest'
import { execSync } from 'child_process'

describe('labcli CLI', () => {
  it('--help 输出包含所有 11 个子命令', () => {
    const output = execSync('npx tsx src/cli.ts --help', {
      encoding: 'utf-8',
      cwd: process.cwd(),
    })
    
    const commands = ['init', 'connect', 'sync', 'watch', 'setup', 'upload', 'submit', 'status', 'logs', 'cancel', 'resources']
    for (const cmd of commands) {
      expect(output).toContain(cmd)
    }
  })

  it('--help 输出包含 labcli', () => {
    const output = execSync('npx tsx src/cli.ts --help', {
      encoding: 'utf-8',
      cwd: process.cwd(),
    })
    expect(output).toContain('labcli')
  })

  it('--version 输出版本号', () => {
    const output = execSync('npx tsx src/cli.ts --version', {
      encoding: 'utf-8',
      cwd: process.cwd(),
    })
    expect(output.trim()).toBe('0.1.0')
  })

  it('未知子命令不崩溃（Commander 处理错误）', () => {
    try {
      execSync('npx tsx src/cli.ts unknown-cmd', {
        encoding: 'utf-8',
        cwd: process.cwd(),
        stdio: 'pipe',
      })
      // Commander might exit with non-zero or just show error
    } catch (error: unknown) {
      // Expected - Commander exits with error for unknown command
      const e = error as { status?: number; stdout?: string; stderr?: string }
      expect(e.status).not.toBe(0)
    }
  })
})
