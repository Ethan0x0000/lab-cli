import { spawn } from 'child_process'

export interface SyncOptions {
  localPath: string
  remotePath: string
  host: string
  username: string
  excludePatterns: string[]
  dryRun?: boolean
  privateKeyPath?: string
  port?: number
}

export interface SyncResult {
  filesTransferred: number
  bytesTransferred: number
  duration: number
  errors: string[]
}

export function buildRsyncArgs(options: SyncOptions): string[] {
  const args: string[] = ['-avz', '--delete']

  for (const pattern of options.excludePatterns) {
    args.push(`--exclude=${pattern}`)
  }

  if (options.dryRun) {
    args.push('--dry-run')
  }

  const port = options.port ?? 22
  const sshArgs = options.privateKeyPath
    ? `ssh -p ${port} -i ${options.privateKeyPath} -o StrictHostKeyChecking=no`
    : `ssh -p ${port} -o StrictHostKeyChecking=no`

  args.push('-e', sshArgs)
  args.push(options.localPath)
  args.push(`${options.username}@${options.host}:${options.remotePath}`)

  return args
}

export async function syncToRemote(options: SyncOptions): Promise<SyncResult> {
  const args = buildRsyncArgs(options)
  const startTime = Date.now()

  return new Promise((resolve, reject) => {
    const proc = spawn('rsync', args, { stdio: ['ignore', 'pipe', 'pipe'] })

    let stdout = ''
    let stderr = ''

    proc.stdout.on('data', (data: Buffer) => {
      stdout += data.toString()
    })

    proc.stderr.on('data', (data: Buffer) => {
      stderr += data.toString()
    })

    proc.on('close', (code: number | null) => {
      const duration = Date.now() - startTime

      if (code !== 0) {
        reject(new Error(`rsync 失败 (exit ${code}): ${stderr}`))
        return
      }

      const filesMatch = stdout.match(/Number of regular files transferred: (\d+)/)
      const bytesMatch = stdout.match(/Total transferred file size: ([\d,]+)/)

      resolve({
        filesTransferred: filesMatch ? parseInt(filesMatch[1], 10) : 0,
        bytesTransferred: bytesMatch ? parseInt(bytesMatch[1].replace(/,/g, ''), 10) : 0,
        duration,
        errors: stderr ? [stderr] : [],
      })
    })

    proc.on('error', (err: Error) => {
      reject(new Error(`rsync 启动失败: ${err.message}`))
    })
  })
}
