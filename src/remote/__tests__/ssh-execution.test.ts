import { describe, it, vi } from 'vitest'

vi.mock('../../ssh/client.js', () => ({
  SSHClient: vi.fn().mockImplementation(() => ({
    connect: vi.fn().mockResolvedValue(undefined),
    exec: vi.fn().mockResolvedValue({ stdout: 'mock', stderr: '', exitCode: 0 }),
    isConnected: vi.fn().mockReturnValue(true),
    disconnect: vi.fn(),
  })),
}))

vi.mock('../../utils/ssh-helpers.js', () => ({
  buildSSHOptions: vi.fn().mockResolvedValue({}),
}))

vi.mock('../../transfer/rsync.js', () => ({
  syncToRemote: vi.fn().mockResolvedValue({}),
}))

describe('SSHExecution', () => {
  it.todo('should execute commands via SSHClient')
  it.todo('should return CommandResult with exitCode')
  it.todo('should delegate upload to syncToRemote')
})
