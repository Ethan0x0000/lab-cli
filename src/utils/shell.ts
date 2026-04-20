import { homedir } from 'os'

export function expandTilde(filePath: string): string {
  if (filePath === '~') {
    return homedir()
  }

  if (filePath.startsWith('~/')) {
    return homedir() + filePath.slice(1)
  }

  return filePath
}

// Security-critical: single-quote wrapping prevents shell injection
// when interpolating user values into remote exec commands.
export function shellQuote(value: string): string {
  return "'" + value.replace(/'/g, "'\\''") + "'"
}
