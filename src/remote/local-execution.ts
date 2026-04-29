import { execSync } from 'child_process'
import { existsSync, mkdirSync, cpSync } from 'fs'
import { join, basename } from 'path'
import type { CommandResult, RemoteExecution } from './types.js'

export class LocalExecution implements RemoteExecution {
  async run(command: string, env?: Record<string, string>): Promise<CommandResult> {
    try {
      const stdout = execSync(command, {
        encoding: 'utf-8',
        env: env ? { ...process.env, ...env } as Record<string, string> : process.env,
        timeout: 300_000,
        shell: process.platform === 'win32' ? 'cmd.exe' : '/bin/sh',
      })
      return { command, stdout: stdout.trim(), stderr: '', exitCode: 0, failed: false }
    } catch (error: any) {
      return { command, stdout: error.stdout?.toString() ?? '', stderr: error.stderr?.toString() ?? '', exitCode: error.status ?? 1, failed: true }
    }
  }

  async uploadFolder(localPath: string, remotePath: string): Promise<void> {
    if (!existsSync(remotePath)) mkdirSync(remotePath, { recursive: true })
    cpSync(localPath, join(remotePath, basename(localPath)), { recursive: true })
  }

  async downloadFolder(remotePath: string, localPath: string): Promise<void> {
    if (!existsSync(localPath)) mkdirSync(localPath, { recursive: true })
    cpSync(remotePath, join(localPath, basename(remotePath)), { recursive: true })
  }

  disconnect(): void {}
}
