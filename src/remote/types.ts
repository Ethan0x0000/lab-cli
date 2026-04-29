export interface CommandResult {
  command: string
  stdout: string
  stderr: string
  exitCode: number
  failed: boolean
}

export interface RemoteExecution {
  run(command: string, env?: Record<string, string>): Promise<CommandResult>
  uploadFolder(localPath: string, remotePath: string): Promise<void>
  downloadFolder(remotePath: string, localPath: string): Promise<void>
  disconnect(): void
}
