import type { SlurmAccountQuota, SlurmJobInfo, SlurmNodeInfo } from '../types/index.js'

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
}

function asString(value: unknown, fallback = ''): string {
  return value == null ? fallback : String(value)
}

function asNumber(value: unknown, fallback = 0): number {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : fallback
  }

  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : fallback
  }

  return fallback
}

function extractGpuCount(value: unknown, pattern: RegExp): number {
  const match = asString(value).match(pattern)
  return match?.[1] ? asNumber(match[1], 0) : 0
}

function parseJsonArray<T>(
  json: string,
  key: string,
  errorMessage: string,
  mapper: (entry: unknown) => T,
): T[] {
  let data: unknown

  try {
    data = JSON.parse(json)
  } catch {
    throw new Error(errorMessage)
  }

  const root = asRecord(data)
  const entries = root[key]
  if (!Array.isArray(entries)) {
    return []
  }

  return entries.map(mapper)
}

function splitDataLines(text: string, headerTokens: string[]): string[] {
  const lines = text
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)

  if (lines.length === 0) {
    return []
  }

  const firstTokens = lines[0].split(/\s+/).map(token => token.toUpperCase())
  const hasHeader = headerTokens.every((token, index) => firstTokens[index] === token)

  return hasHeader ? lines.slice(1) : lines
}

export function parseSinfoJson(json: string): SlurmNodeInfo[] {
  return parseJsonArray(json, 'nodes', 'sinfo JSON 解析失败：无效的 JSON 格式', node => {
    const n = asRecord(node)

    return {
      nodeName: asString(n.name ?? n.node_name),
      state: asString(n.state),
      cpuTotal: asNumber(n.cpus ?? n.cpu_tot),
      cpuUsed: asNumber(n.alloc_cpus ?? n.cpu_load),
      memTotal: asNumber(n.real_memory),
      memUsed: asNumber(n.alloc_memory),
      gpuTotal: extractGpuCount(n.gres, /gpu(?::[^:,()]+)*:(\d+)/),
      gpuUsed: extractGpuCount(n.gres_used, /gpu(?::[^:,()]+)*:(\d+)/),
      partitions: Array.isArray(n.partitions) ? n.partitions.map(partition => String(partition)) : [],
    }
  })
}

export function parseSqueueJson(json: string): SlurmJobInfo[] {
  return parseJsonArray(json, 'jobs', 'squeue JSON 解析失败：无效的 JSON 格式', job => {
    const j = asRecord(job)
    const nodeCount = asRecord(j.node_count)

    return {
      jobId: asString(j.job_id ?? j.id),
      name: asString(j.name),
      state: asString(j.job_state ?? j.state),
      partition: asString(j.partition),
      nodes: asNumber(nodeCount.number ?? j.num_nodes, 1),
      gpus: extractGpuCount(j.tres_req_str, /gres\/gpu(?::[^=,]+)?=(\d+)/),
      timeUsed: asString(j.run_time_str ?? j.run_time, '00:00:00'),
      timeLimit: asString(j.time_limit_str ?? j.time_limit, 'UNLIMITED'),
    }
  })
}

export function parseSacctJson(json: string): SlurmAccountQuota[] {
  return parseJsonArray(json, 'associations', 'sacct JSON 解析失败：无效的 JSON 格式', association => {
    const a = asRecord(association)
    const maxJobs = asRecord(a.max_jobs)
    const maxTresRunMins = asRecord(a.max_tres_run_mins)
    const usedTres = asRecord(a.used_tres)
    const maxTres = asRecord(a.max_tres)

    return {
      account: asString(a.account),
      maxJobs: asNumber(maxJobs.number, -1),
      runningJobs: asNumber(a.running_jobs),
      maxCpus: asNumber(maxTresRunMins.cpu, -1),
      usedCpus: asNumber(usedTres.cpu),
      maxGpus: asNumber(maxTres.gres_gpu, -1),
      usedGpus: asNumber(usedTres.gres_gpu),
    }
  })
}

export function parseSinfoFormat(text: string): SlurmNodeInfo[] {
  const lines = splitDataLines(text, ['NODELIST', 'STATE', 'CPU', 'MEMORY', 'GRES', 'PARTITION'])

  return lines.map(line => {
    const parts = line.split(/\s+/)
    const gres = parts[4] ?? ''
    const gpuMatch = gres.match(/gpu(?::[^:,()]+)*:(\d+)/)
    const gpuTotal = gpuMatch?.[1] ? Number.parseInt(gpuMatch[1], 10) || 0 : 0

    return {
      nodeName: parts[0] ?? '',
      state: parts[1] ?? '',
      cpuTotal: Number.parseInt(parts[2] ?? '0', 10) || 0,
      cpuUsed: 0,
      memTotal: Number.parseInt(parts[3] ?? '0', 10) || 0,
      memUsed: 0,
      gpuTotal,
      gpuUsed: 0,
      partitions: parts[5] ? [parts[5]] : [],
    }
  })
}

export function parseSqueueFormat(text: string): SlurmJobInfo[] {
  const lines = splitDataLines(text, ['JOBID', 'PARTITION', 'NAME', 'NODES', 'STATE', 'TIME', 'TIMELIMIT'])

  return lines.map(line => {
    const parts = line.split(/\s+/)

    return {
      jobId: parts[0] ?? '',
      name: parts[2] ?? '',
      state: parts[4] ?? '',
      partition: parts[1] ?? '',
      nodes: Number.parseInt(parts[3] ?? '1', 10) || 1,
      gpus: 0,
      timeUsed: parts[5] ?? '00:00:00',
      timeLimit: parts[6] ?? 'UNLIMITED',
    }
  })
}
