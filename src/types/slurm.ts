export interface SlurmJobInfo {
  jobId: string
  name: string
  state: string
  partition: string
  nodes: number
  gpus: number
  timeUsed: string
  timeLimit: string
}

export interface SlurmNodeInfo {
  nodeName: string
  state: string
  cpuTotal: number
  cpuUsed: number
  memTotal: number
  memUsed: number
  gpuTotal: number
  gpuUsed: number
  partitions: string[]
}

export interface SlurmAccountQuota {
  account: string
  maxJobs: number
  runningJobs: number
  maxCpus: number
  usedCpus: number
  maxGpus: number
  usedGpus: number
}

export interface SlurmPartitionInfo {
  name: string
  state: string
  totalNodes: number
  idleNodes: number
  allocNodes: number
}
