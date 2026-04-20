type ExecFn = (command: string) => Promise<{ stdout: string; stderr: string; exitCode: number }>

let cachedResult: boolean | null = null

export async function detectSlurmJsonSupport(exec: ExecFn): Promise<boolean> {
  if (cachedResult !== null) {
    return cachedResult
  }

  try {
    const result = await exec('sinfo --json')
    cachedResult = result.exitCode === 0 && result.stdout.trim().startsWith('{')
  } catch {
    cachedResult = false
  }

  return cachedResult
}

export function resetJsonSupportCache(): void {
  cachedResult = null
}
