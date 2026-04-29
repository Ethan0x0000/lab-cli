import { spawn, type ChildProcess } from 'child_process'
import { writeFileSync, unlinkSync } from 'fs'
import { join } from 'path'

interface MockJob {
  id: string
  process: ChildProcess | null
  startTime: Date
  state: 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED'
  exitCode: number | null
}

export class MockSlurm {
  private jobs = new Map<string, MockJob>()
  private nextId = 1000

  reset(): void {
    for (const job of this.jobs.values()) job.process?.kill('SIGKILL')
    this.jobs.clear()
  }

  async sbatch(scriptContent: string, cwd?: string): Promise<number> {
    const id = this.nextId++
    const job: MockJob = {
      id: String(id), process: null, startTime: new Date(),
      state: 'RUNNING', exitCode: null,
    }
    const workDir = cwd ?? process.cwd()
    const scriptPath = join(workDir, `.mock-slurm-${id}.sh`)
    writeFileSync(scriptPath, scriptContent, { mode: 0o755 })
    const proc = spawn('bash', [scriptPath], { cwd: workDir, stdio: 'ignore' })
    job.process = proc
    proc.on('close', (code) => {
      job.exitCode = code
      if (code === null || code < 0) job.state = 'CANCELLED'
      else if (code === 0) job.state = 'COMPLETED'
      else job.state = 'FAILED'
     job.process = null
       try { unlinkSync(scriptPath) } catch {
         // ignore cleanup errors
       }
    })
    this.jobs.set(String(id), job)
    return id
  }

  scancel(jobid: number | string): void {
    const job = this.jobs.get(String(jobid))
    if (!job) throw new Error(`未知作业ID: ${jobid}`)
    job.process?.kill('SIGTERM')
  }

  sacct(jobIds: Array<number | string>): string {
    const header = 'JobID|Elapsed|Start|State|NodeList|'
    const lines = [header]
    for (const jid of jobIds) {
      const job = this.jobs.get(String(jid))
      if (!job) continue
      const elapsed = ((Date.now() - job.startTime.getTime()) / 1000).toFixed(0)
      const start = job.startTime.toISOString().replace('T', ' ').slice(0, 19)
      lines.push(`${job.id}|${elapsed}|${start}|${job.state}|localhost|`)
    }
    return lines.join('\n')
  }

  async wait(jobid: number | string, timeout = 10000): Promise<number> {
    const job = this.jobs.get(String(jobid))
    if (!job) throw new Error(`未知作业ID: ${jobid}`)
    if (!job.process) return job.exitCode ?? 0
    return new Promise<number>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`等待超时: ${jobid}`)), timeout)
      const check = setInterval(() => {
        if (!job.process || job.state !== 'RUNNING') {
          clearTimeout(timer); clearInterval(check); resolve(job.exitCode ?? 0)
        }
      }, 100)
    })
  }
}
