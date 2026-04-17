import type { SFTPWrapper } from 'ssh2'
import { createReadStream, readdirSync, statSync } from 'fs'
import { join } from 'path'

export async function uploadFile(
  sftp: SFTPWrapper,
  localPath: string,
  remotePath: string,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const readStream = createReadStream(localPath)
    const writeStream = sftp.createWriteStream(remotePath)

    writeStream.on('close', () => resolve())
    writeStream.on('error', (err: Error) => reject(err))
    readStream.on('error', (err: Error) => reject(err))

    readStream.pipe(writeStream)
  })
}

export async function uploadDirectory(
  sftp: SFTPWrapper,
  localDir: string,
  remoteDir: string,
  exclude: string[] = [],
): Promise<void> {
  const entries = readdirSync(localDir)

  for (const entry of entries) {
    if (exclude.some((pattern) => entry === pattern || entry.startsWith(pattern))) {
      continue
    }

    const localPath = join(localDir, entry)
    const remotePath = `${remoteDir}/${entry}`
    const stat = statSync(localPath)

    if (stat.isDirectory()) {
      await new Promise<void>((resolve, reject) => {
        sftp.mkdir(remotePath, (err) => {
          if (err && (err as NodeJS.ErrnoException).code !== 'EEXIST') {
            reject(err)
            return
          }

          resolve()
        })
      })

      await uploadDirectory(sftp, localPath, remotePath, exclude)
      continue
    }

    await uploadFile(sftp, localPath, remotePath)
  }
}
