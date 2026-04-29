import chalk from 'chalk'

export function handleCliError(
  error: unknown,
  context?: string,
  client?: { disconnect(): void } | null,
): void {
  const msg = error instanceof Error ? error.message : String(error)
  const prefix = context ? `${context}: ` : ''
  console.error(chalk.red(`${prefix}${msg}`))
  process.exitCode = 1
  client?.disconnect()
}
