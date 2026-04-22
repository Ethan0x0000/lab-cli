import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { Command } from 'commander'

const mockState = vi.hoisted(() => ({
  prompt: vi.fn(),
  writeGlobalConfig: vi.fn(),
  writeProjectConfig: vi.fn(),
  homeDir: '',
}))

vi.mock('inquirer', () => ({
  default: {
    prompt: mockState.prompt,
  },
}))

vi.mock('chalk', () => ({
  default: {
    green: (value: string) => value,
    yellow: (value: string) => value,
    red: (value: string) => value,
  },
}))

vi.mock('os', async () => {
  const actual = await vi.importActual<typeof import('os')>('os')
  return {
    ...actual,
    homedir: () => mockState.homeDir,
  }
})

vi.mock('../../config/writer.js', () => ({
  writeGlobalConfig: mockState.writeGlobalConfig,
  writeProjectConfig: mockState.writeProjectConfig,
}))

describe('init 命令', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'lab-cli-init-'))
    mockState.homeDir = join(tmpDir, 'home')

    mkdirSync(mockState.homeDir, { recursive: true })
    vi.clearAllMocks()
    vi.resetModules()
    vi.spyOn(process, 'cwd').mockReturnValue(tmpDir)
    vi.spyOn(console, 'log').mockImplementation(() => undefined)
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    rmSync(tmpDir, { recursive: true, force: true })
  })

  async function createProgram(): Promise<Command> {
    const { registerInitCommand } = await import('../init.js')
    const program = new Command()
    registerInitCommand(program)
    return program
  }

  async function runInit(args: string[] = []): Promise<void> {
    const program = await createProgram()
    await program.parseAsync(['node', 'labcli', 'init', ...args])
  }

  it('注册 init 子命令及 --global 选项', async () => {
    const program = await createProgram()
    const initCommand = program.commands.find((command) => command.name() === 'init')

    expect(initCommand).toBeDefined()
    expect(initCommand?.description()).toBe('初始化 LabCLI 配置')
    expect(initCommand?.options.some((option) => option.long === '--global')).toBe(true)
  })

  it('项目初始化时写入解析后的项目配置', async () => {
    mockState.prompt.mockResolvedValueOnce({
      name: ' demo-project ',
      remotePath: ' /remote/demo ',
      condaEnvName: ' ml ',
      condaPythonVersion: '3.11',
      slurmPartition: ' gpu ',
      slurmGpus: 2,
    })

    await runInit()

    expect(mockState.writeProjectConfig).toHaveBeenCalledTimes(1)
    expect(mockState.writeProjectConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'demo-project',
        remotePath: '/remote/demo',
        condaEnvName: 'ml',
        condaPythonVersion: '3.11',
        slurmPartition: 'gpu',
        slurmGpus: 2,
      }),
    )
    expect(mockState.writeProjectConfig.mock.calls[0]?.[0].syncExclude).toContain('.sisyphus')
    expect(console.log).toHaveBeenCalledWith(`✓ 项目配置已写入 ${join(tmpDir, '.labrc')}`)
  })

  it('项目配置已存在且用户拒绝覆盖时取消写入', async () => {
    writeFileSync(join(tmpDir, '.labrc'), 'name: old\nremotePath: /old\n', 'utf-8')
    mockState.prompt.mockResolvedValueOnce({ overwrite: false })

    await runInit()

    expect(mockState.writeProjectConfig).not.toHaveBeenCalled()
    expect(mockState.prompt).toHaveBeenCalledTimes(1)
    expect(console.log).toHaveBeenCalledWith('已取消')
  })

  it('全局初始化时写入解析后的全局配置', async () => {
    mockState.prompt.mockResolvedValueOnce({
      host: ' 10.0.0.1 ',
      port: 2200,
      username: ' alice ',
      authMethod: 'key',
      privateKeyPath: ' ~/.ssh/id_ed25519 ',
      defaultRemotePath: ' /home/alice ',
      defaultPartition: ' gpu ',
    })

    await runInit(['--global'])

    expect(mockState.writeGlobalConfig).toHaveBeenCalledTimes(1)
    expect(mockState.writeGlobalConfig).toHaveBeenCalledWith({
      host: '10.0.0.1',
      port: 2200,
      username: 'alice',
      authMethod: 'key',
      privateKeyPath: '~/.ssh/id_ed25519',
      defaultRemotePath: '/home/alice',
      defaultPartition: 'gpu',
    })
    expect(console.log).toHaveBeenCalledWith(
      `✓ 全局配置已写入 ${join(mockState.homeDir, '.lab-cli', 'config.yaml')}`,
    )
  })

  it('全局配置已存在且用户拒绝覆盖时取消写入', async () => {
    mkdirSync(join(mockState.homeDir, '.lab-cli'), { recursive: true })
    writeFileSync(join(mockState.homeDir, '.lab-cli', 'config.yaml'), 'host: old\n', 'utf-8')
    mockState.prompt.mockResolvedValueOnce({ overwrite: false })

    await runInit(['--global'])

    expect(mockState.writeGlobalConfig).not.toHaveBeenCalled()
    expect(mockState.prompt).toHaveBeenCalledTimes(1)
    expect(console.log).toHaveBeenCalledWith('已取消')
  })
})
