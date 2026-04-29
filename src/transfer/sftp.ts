import type { SFTPWrapper } from 'ssh2'
import { createReadStream, readdirSync, statSync } from 'fs'
import { join } from 'path'

function statRemotePath(sftp: SFTPWrapper, remotePath: string): Promise<boolean> {
  return new Promise((resolve) => {
    sftp.stat(remotePath, (err) => {
      resolve(!err)
    })
  })
}

function mkdirRemotePath(sftp: SFTPWrapper, remotePath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    sftp.mkdir(remotePath, (err) => {
      if (!err) {
        resolve()
        return
      }

      const errno = err as NodeJS.ErrnoException
      if (errno.code === 'EEXIST') {
        resolve()
        return
      }

      reject(err)
    })
  })
}

export async function ensureRemoteDirectory(
  sftp: SFTPWrapper,
  remoteDir: string,
): Promise<void> {
  const normalized = remoteDir.replace(/\\/g, '/').replace(/\/+$/, '')
  if (!normalized || normalized === '/') {
    return
  }

  const isAbsolute = normalized.startsWith('/')
  const parts = normalized.split('/').filter(Boolean)
  let current = isAbsolute ? '/' : ''

  for (const part of parts) {
    current = current === '/' ? `/${part}` : (current ? `${current}/${part}` : part)
    const exists = await statRemotePath(sftp, current)
    if (!exists) {
      await mkdirRemotePath(sftp, current)
    }
  }
}

function matchesGlob(filename: string, pattern: string): boolean {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*')

  return new RegExp(`^${escaped}$`).test(filename)
}

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
    if (exclude.some((pattern) => matchesGlob(entry, pattern))) {
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
