import { describe, it, expect, vi, afterEach } from 'vitest'
import { handleCliError } from '../errors.js'

describe('handleCliError', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>

  afterEach(() => {
    consoleErrorSpy?.mockRestore()
    process.exitCode = 0
  })

  it('should set process.exitCode to 1', () => {
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    handleCliError(new Error('测试错误'))
    expect(process.exitCode).toBe(1)
  })

  it('should prefix message with context', () => {
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    handleCliError(new Error('详情'), '提交失败')
    expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('提交失败'))
  })

  it('should handle non-Error values', () => {
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    handleCliError('字符串错误')
    expect(consoleErrorSpy).toHaveBeenCalled()
  })

  it('should call disconnect on provided client', () => {
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const disconnect = vi.fn()
    const client = { disconnect }
    handleCliError(new Error('err'), '测试', client)
    expect(disconnect).toHaveBeenCalledOnce()
  })
})
