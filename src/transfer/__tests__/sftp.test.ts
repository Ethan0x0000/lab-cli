import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { Writable } from 'stream'
import { afterEach, describe, expect, it } from 'vitest'
import type { SFTPWrapper } from 'ssh2'
import { uploadDirectory } from '../sftp.js'

describe('SFTP 上传目录', () => {
  const tempDirs: string[] = []

  afterEach(() => {
    for (const dir of tempDirs) {
      rmSync(dir, { recursive: true, force: true })
    }
    tempDirs.length = 0
  })

  it('按 glob 排除匹配的文件', async () => {
    const localDir = mkdtempSync(join(tmpdir(), 'lab-cli-sftp-'))
    tempDirs.push(localDir)

    writeFileSync(join(localDir, 'keep.txt'), 'keep')
    writeFileSync(join(localDir, 'ignore.pyc'), 'ignore')
    mkdirSync(join(localDir, 'nested'))
    writeFileSync(join(localDir, 'nested', 'keep.py'), 'keep nested')
    writeFileSync(join(localDir, 'nested', 'ignore.pyc'), 'ignore nested')

    const uploadedPaths: string[] = []
    const createdDirs: string[] = []
    const sftp = {
      createWriteStream(remotePath: string) {
        uploadedPaths.push(remotePath)
        const stream = new Writable({
          write(_chunk, _encoding, callback) {
            callback()
          },
        })
        stream.on('finish', () => {
          stream.emit('close')
        })
        return stream
      },
      mkdir(remotePath: string, callback: (err?: Error | null) => void) {
        createdDirs.push(remotePath)
        callback(null)
      },
    } as unknown as SFTPWrapper

    await uploadDirectory(sftp, localDir, '/remote/project', ['*.pyc'])

    expect(createdDirs).toContain('/remote/project/nested')
    expect(uploadedPaths).toContain('/remote/project/keep.txt')
    expect(uploadedPaths).toContain('/remote/project/nested/keep.py')
    expect(uploadedPaths).not.toContain('/remote/project/ignore.pyc')
    expect(uploadedPaths).not.toContain('/remote/project/nested/ignore.pyc')
  })
})
