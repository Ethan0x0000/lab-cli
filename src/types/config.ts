export interface GlobalConfig {
  host: string
  port: number
  username: string
  authMethod: 'key' | 'password'
  password?: string
  privateKeyPath?: string
  defaultPartition?: string
  defaultRemotePath: string
}

export interface ProjectConfig {
  name: string
  remotePath: string
  syncExclude: string[]
  slurmPartition?: string
  slurmGpus?: number
  slurmNodes?: number
  condaEnvName?: string
  condaPythonVersion: string
}

export interface MergedConfig {
  host: string
  port: number
  username: string
  authMethod: 'key' | 'password'
  password?: string
  privateKeyPath?: string
  defaultPartition?: string
  defaultRemotePath: string
  name: string
  remotePath: string
  syncExclude: string[]
  slurmPartition?: string
  slurmGpus?: number
  slurmNodes?: number
  condaEnvName?: string
  condaPythonVersion: string
}
