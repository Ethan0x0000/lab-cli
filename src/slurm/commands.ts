import { shellQuote } from '../utils/shell.js'

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

  return 'sinfo --format="%N %T %c %m %G %P" --noheader'
}

export function buildSqueueCommand(userId?: string, jsonSupported = true): string {
  const userFlag = userId ? `--user=${shellQuote(userId)}` : ''

  if (jsonSupported) {
    return `squeue --json ${userFlag}`.trim()
  }

  return `squeue --format="%i %P %j %D %T %M %l" --noheader ${userFlag}`.trim()
}

export function buildSbatchCommand(scriptPath: string, options: SbatchOptions = {}): string {
  const parts = ['sbatch']

  if (options.partition) parts.push(`--partition=${shellQuote(options.partition)}`)
  if (options.nodes) parts.push(`--nodes=${options.nodes}`)
  if (options.gpus) parts.push(`--gres=gpu:${options.gpus}`)
  if (options.time) parts.push(`--time=${shellQuote(options.time)}`)
  if (options.jobName) parts.push(`--job-name=${shellQuote(options.jobName)}`)
  if (options.output) parts.push(`--output=${shellQuote(options.output)}`)
  if (options.error) parts.push(`--error=${shellQuote(options.error)}`)

  parts.push(shellQuote(scriptPath))

  return parts.join(' ')
}

export function buildScancelCommand(jobId: string): string {
  return `scancel ${shellQuote(jobId)}`
}
