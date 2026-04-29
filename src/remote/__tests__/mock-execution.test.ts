import { describe, it, expect } from 'vitest'
import { MockExecution } from '../mock-execution.js'

describe('MockExecution', () => {
  it('should record commands in log', async () => {
    const mock = new MockExecution()
    await mock.run('squeue -j 123')
    await mock.run('sbatch job.sh')
    expect(mock.getCommandLog()).toEqual(['squeue -j 123', 'sbatch job.sh'])
  })

  it('should return mocked responses', async () => {
    const mock = new MockExecution()
    mock.setResponse('squeue', { stdout: 'JOBID STATUS', exitCode: 0, failed: false })
    const result = await mock.run('squeue -j 123')
    expect(result.stdout).toBe('JOBID STATUS')
    expect(result.exitCode).toBe(0)
  })

  it('should return default response for unmocked commands', async () => {
    const mock = new MockExecution()
    const result = await mock.run('unknown_cmd')
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toBe('')
  })
})
