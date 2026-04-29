import { describe, it, expect } from 'vitest'
import { JobPath } from '../path.js'

describe('JobPath', () => {
  const jobPath = new JobPath('my-experiment', '/home/user/labcli')

  it('should construct job directory path', () => {
    expect(jobPath.jobDir).toBe('/home/user/labcli/jobs/my-experiment')
  })

  it('should construct slurm script path', () => {
    expect(jobPath.slurmScript).toBe('/home/user/labcli/jobs/my-experiment/slurm_script.sh')
  })

  it('should construct metadata path', () => {
    expect(jobPath.metadata).toBe('/home/user/labcli/jobs/my-experiment/metadata.json')
  })

  it('should construct log paths', () => {
    expect(jobPath.stdout).toBe('/home/user/labcli/jobs/my-experiment/logs/stdout')
    expect(jobPath.stderr).toBe('/home/user/labcli/jobs/my-experiment/logs/stderr')
  })
})
