import { homedir } from 'os'
import { execSync } from 'child_process'

export function expandTilde(filePath: string): string {
  if (filePath === '~') {
    return homedir()
  }

  if (filePath.startsWith('~/')) {
    return homedir() + filePath.slice(1)
  }

  return filePath
}

export function isWindows(): boolean {
  return process.platform === 'win32'
}

export function isRsyncAvailable(): boolean {
  try {
    execSync('rsync --version', { stdio: 'pipe' })
    return true
  } catch {
    return false
  }
}

export function shellQuote(value: string): string {
  return "'" + value.replace(/'/g, "'\\''") + "'"
}
