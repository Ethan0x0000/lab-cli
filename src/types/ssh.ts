export interface SSHConnectionOptions {
  host: string
  port: number
  username: string
  authMethod: 'key' | 'password'
  privateKeyPath?: string
  password?: string
}

export interface SSHExecResult {
  stdout: string
  stderr: string
  exitCode: number
}
