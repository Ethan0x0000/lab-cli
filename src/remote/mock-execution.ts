import type { CommandResult, RemoteExecution } from './types.js'

export class MockExecution implements RemoteExecution {
  private responses = new Map<string, CommandResult>()
  private commandLog: string[] = []

  setResponse(commandPrefix: string, response: Partial<CommandResult>): void {
    this.responses.set(commandPrefix, {
      command: commandPrefix,
      stdout: response.stdout ?? '',
      stderr: response.stderr ?? '',
      exitCode: response.exitCode ?? 0,
      failed: response.failed ?? false,
    })
  }

  async run(command: string): Promise<CommandResult> {
    this.commandLog.push(command)
    for (const [prefix, response] of this.responses) {
      if (command.startsWith(prefix)) return { ...response, command }
    }
    return { command, stdout: '', stderr: '', exitCode: 0, failed: false }
  }

  getCommandLog(): string[] { return [...this.commandLog] }
  async uploadFolder(): Promise<void> {}
  async downloadFolder(): Promise<void> {}
  disconnect(): void {}
}
