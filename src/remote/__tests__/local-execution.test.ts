import { describe, it, expect } from 'vitest'
import { LocalExecution } from '../local-execution.js'

describe('LocalExecution', () => {
  it('should run simple commands', async () => {
    const exec = new LocalExecution()
    const result = await exec.run('echo hello')
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain('hello')
    expect(result.failed).toBe(false)
  })

  it('should report failed commands', async () => {
    const exec = new LocalExecution()
    const result = await exec.run('nonexistent_command_xyz')
    expect(result.failed).toBe(true)
    expect(result.exitCode).not.toBe(0)
  })
})
