import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Command } from 'commander'

const mockState = vi.hoisted(() => ({
  prompt: vi.fn(),
  checkGlobalConfig: vi.fn(),
  checkProjectConfig: vi.fn(),
  initGlobal: vi.fn(),
  initProject: vi.fn(),
}))

vi.mock('inquirer', () => ({
  default: {
    prompt: mockState.prompt,
  },
}))

vi.mock('../../utils/checks.js', () => ({
  checkGlobalConfig: mockState.checkGlobalConfig,
  checkProjectConfig: mockState.checkProjectConfig,
}))

vi.mock('../init.js', () => ({
  initGlobal: mockState.initGlobal,
  initProject: mockState.initProject,
}))

vi.mock('chalk', () => ({
  default: {
    green: (value: string) => value,
    blue: (value: string) => value,
    dim: (value: string) => value,
    bold: (value: string) => value,
    yellow: (value: string) => value,
    red: (value: string) => value,
  },
}))

vi.mock('ora', () => ({
  default: vi.fn(),
}))

async function createProgram(): Promise<Command> {
  const { registerQuickstartCommand } = await import('../quickstart.js')
  const program = new Command()
  registerQuickstartCommand(program)
  return program
}

async function runQuickstart(args: string[] = []): Promise<void> {
  const program = await createProgram()
  await program.parseAsync(['node', 'lab-cli', 'quickstart', ...args])
}

describe('quickstart 命令', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockState.checkGlobalConfig.mockResolvedValue({ ok: true, message: '全局配置正常' })
    mockState.checkProjectConfig.mockResolvedValue({ ok: true, message: '项目配置正常' })
    mockState.prompt.mockResolvedValue({ confirm: false })
    vi.spyOn(console, 'log').mockImplementation(() => undefined)
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`process.exit:${code ?? 0}`)
    }) as never)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('已有全局和项目配置时跳过初始化', async () => {
    await runQuickstart()

    expect(mockState.checkGlobalConfig).toHaveBeenCalledTimes(1)
    expect(mockState.checkProjectConfig).toHaveBeenCalledTimes(1)
    expect(mockState.initGlobal).not.toHaveBeenCalled()
    expect(mockState.initProject).not.toHaveBeenCalled()
  })

  it('全局配置缺失时调用 initGlobal', async () => {
    mockState.checkGlobalConfig.mockResolvedValue({ ok: false, message: '全局配置不存在' })
    mockState.prompt
      .mockResolvedValueOnce({ confirm: true })
      .mockResolvedValueOnce({ confirm: false })
      .mockResolvedValueOnce({ confirm: false })

    await runQuickstart()

    expect(mockState.initGlobal).toHaveBeenCalledTimes(1)
  })

  it('用户拒绝时不调用 initGlobal', async () => {
    mockState.checkGlobalConfig.mockResolvedValue({ ok: false, message: '全局配置不存在' })
    mockState.prompt
      .mockResolvedValueOnce({ confirm: false })
      .mockResolvedValueOnce({ confirm: false })
      .mockResolvedValueOnce({ confirm: false })

    await runQuickstart()

    expect(mockState.initGlobal).not.toHaveBeenCalled()
  })

  it('--help displays description', async () => {
    const stdoutWrite = vi.spyOn(process.stdout, 'write').mockReturnValue(true)

    await expect(runQuickstart(['--help'])).rejects.toThrow('process.exit:0')

    expect(stdoutWrite).toHaveBeenCalled()
    expect(stdoutWrite.mock.calls.map(([chunk]) => String(chunk)).join('')).toContain(
      '交互式引导完成项目初始化和首次同步',
    )
  })
})
