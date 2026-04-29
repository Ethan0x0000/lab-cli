import { existsSync, readdirSync, readFileSync } from 'fs'
import { join } from 'path'

export interface JobMetadataData {
  jobname: string
  cluster: string
  date: string
  remotePath?: string
}

export class JobMetadata {
  jobname: string
  cluster: string
  date: string
  remotePath?: string

  constructor(data: JobMetadataData) {
    this.jobname = data.jobname
    this.cluster = data.cluster
    this.date = data.date
    this.remotePath = data.remotePath
  }

  toJson(): string {
    return JSON.stringify({
      jobname: this.jobname, cluster: this.cluster, date: this.date,
      remotePath: this.remotePath,
    })
  }

  static fromJson(json: string): JobMetadata {
    const data = JSON.parse(json)
    if (!data.jobname && data.job_creation_info) {
      data.jobname = data.job_creation_info.jobname
    }
    return new JobMetadata({
      jobname: data.jobname, cluster: data.cluster, date: data.date,
      remotePath: data.remote_path,
    })
  }
}

export function listMetadatas(jobsRoot: string): JobMetadata[] {
  if (!existsSync(jobsRoot)) return []
  const metadatas: JobMetadata[] = []
  const stack: string[] = [jobsRoot]
  while (stack.length > 0) {
    const cur = stack.pop()!
    const candidate = join(cur, 'metadata.json')
    if (existsSync(candidate)) {
      try { metadatas.push(JobMetadata.fromJson(readFileSync(candidate, 'utf-8'))) } catch {}
    } else {
      try {
        for (const child of readdirSync(cur, { withFileTypes: true })) {
          if (child.isDirectory()) stack.push(join(cur, child.name))
        }
      } catch {}
    }
  }
  return metadatas.sort((a, b) => b.date.localeCompare(a.date))
}
