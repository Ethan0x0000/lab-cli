export interface SbatchOptions {
  partition?: string
  nodes?: number
  gpus?: number
  time?: string
  jobName?: string
  output?: string
  error?: string
}

export function buildSinfoCommand(jsonSupported: boolean): string {
  if (jsonSupported) {
    return 'sinfo --json'
  }

  return 'sinfo --format="%N %T %c %m %P" --noheader'
}

export function buildSqueueCommand(userId?: string, jsonSupported = true): string {
  const userFlag = userId ? `--user=${userId}` : ''

  if (jsonSupported) {
    return `squeue --json ${userFlag}`.trim()
  }

  return `squeue --format="%i %P %j %D %T %M %l" --noheader ${userFlag}`.trim()
}

export function buildSbatchCommand(scriptPath: string, options: SbatchOptions = {}): string {
  const parts = ['sbatch']

  if (options.partition) parts.push(`--partition=${options.partition}`)
  if (options.nodes) parts.push(`--nodes=${options.nodes}`)
  if (options.gpus) parts.push(`--gres=gpu:${options.gpus}`)
  if (options.time) parts.push(`--time=${options.time}`)
  if (options.jobName) parts.push(`--job-name=${options.jobName}`)
  if (options.output) parts.push(`--output=${options.output}`)
  if (options.error) parts.push(`--error=${options.error}`)

  parts.push(scriptPath)

  return parts.join(' ')
}

export function buildScancelCommand(jobId: string): string {
  return `scancel ${jobId}`
}
