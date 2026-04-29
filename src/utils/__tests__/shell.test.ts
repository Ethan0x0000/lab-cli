import { describe, it, expect, afterEach } from 'vitest'
import { isWindows, isRsyncAvailable, expandTilde, shellQuote } from '../shell.js'

describe('shell utilities', () => {
  describe('isWindows', () => {
    const originalPlatform = process.platform

    afterEach(() => {
      Object.defineProperty(process, 'platform', { value: originalPlatform })
    })

    it('returns true on win32', () => {
      Object.defineProperty(process, 'platform', { value: 'win32' })
      expect(isWindows()).toBe(true)
    })

    it('returns false on linux', () => {
      Object.defineProperty(process, 'platform', { value: 'linux' })
      expect(isWindows()).toBe(false)
    })

    it('returns false on darwin', () => {
      Object.defineProperty(process, 'platform', { value: 'darwin' })
      expect(isWindows()).toBe(false)
    })
  })

  describe('isRsyncAvailable', () => {
    it('returns true when rsync is available', () => {
      expect(isRsyncAvailable()).toBe(true)
    })

    it('returns false when rsync is not available', () => {
      const originalPath = process.env.PATH
      process.env.PATH = ''
      expect(isRsyncAvailable()).toBe(false)
      process.env.PATH = originalPath
    })
  })

  describe('expandTilde', () => {
    it('expands ~ to homedir', () => {
      const result = expandTilde('~')
      expect(result).not.toBe('~')
      expect(result.length).toBeGreaterThan(1)
    })

    it('expands ~/path to homedir + path', () => {
      const result = expandTilde('~/foo')
      expect(result.startsWith('~')).toBe(false)
      expect(result).toContain('foo')
    })

    it('leaves non-tilde paths unchanged', () => {
      expect(expandTilde('/absolute/path')).toBe('/absolute/path')
      expect(expandTilde('relative/path')).toBe('relative/path')
    })
  })

  describe('shellQuote', () => {
    it('wraps value in single quotes', () => {
      expect(shellQuote('hello')).toBe("'hello'")
    })

    it('escapes single quotes inside value', () => {
      expect(shellQuote("it's")).toBe("'it'\\''s'")
    })
  })
})
