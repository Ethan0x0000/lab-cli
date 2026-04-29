import { describe, it, expect, afterEach } from 'vitest'
import { MockSlurm } from '../mock.js'

describe('MockSlurm', () => {
  const slurm = new MockSlurm()

  afterEach(() => { slurm.reset() })

  it('should create a job and return jobid', async () => {
    const jobid = await slurm.sbatch('#!/bin/bash\necho hello')
    expect(jobid).toBeGreaterThan(0)
    const done = await slurm.wait(jobid, 5000)
    expect(done).toBe(0)
  })

  it('should return COMPLETED for successful jobs', async () => {
    const jobid = await slurm.sbatch('#!/bin/bash\nexit 0')
    await slurm.wait(jobid, 5000)
    const output = slurm.sacct([jobid])
    expect(output).toContain('COMPLETED')
  })

  it('should return FAILED for failed jobs', async () => {
    const jobid = await slurm.sbatch('#!/bin/bash\nexit 1')
    await slurm.wait(jobid, 5000)
    const output = slurm.sacct([jobid])
    expect(output).toContain('FAILED')
  })

  it('should cancel a job', async () => {
    const jobid = await slurm.sbatch('#!/bin/bash\nsleep 60')
    slurm.scancel(jobid)
    await slurm.wait(jobid, 5000)
    const output = slurm.sacct([jobid])
    expect(output).toContain('CANCELLED')
  })
})
