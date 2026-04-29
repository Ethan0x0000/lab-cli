import { join } from 'path'

export class JobPath {
  readonly jobname: string
  readonly root: string

  constructor(jobname: string, root: string) {
    this.jobname = jobname
    this.root = root
  }

  get jobDir(): string { return join(this.root, 'jobs', this.jobname) }
  get slurmScript(): string { return join(this.jobDir, 'slurm_script.sh') }
  get metadata(): string { return join(this.jobDir, 'metadata.json') }
  get jobidFile(): string { return join(this.jobDir, 'jobid.json') }
  get logDir(): string { return join(this.jobDir, 'logs') }
  get stdout(): string { return join(this.logDir, 'stdout') }
  get stderr(): string { return join(this.logDir, 'stderr') }
}
