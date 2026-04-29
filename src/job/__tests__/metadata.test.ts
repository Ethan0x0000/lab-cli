import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import { JobMetadata, listMetadatas } from '../metadata.js'

describe('JobMetadata', () => {
  it('should serialize to JSON', () => {
    const meta = new JobMetadata({ jobname: 'test-job', cluster: 'local', date: '2026-01-01T00:00:00Z' })
    const json = meta.toJson()
    expect(json).toContain('"jobname":"test-job"')
  })

  it('should deserialize from JSON', () => {
    const json = '{"jobname":"test","cluster":"local","date":"2026-01-01"}'
    const meta = JobMetadata.fromJson(json)
    expect(meta.jobname).toBe('test')
  })
})

describe('listMetadatas', () => {
  let tmpDir = ''

  afterEach(() => {
    if (tmpDir) rmSync(tmpDir, { recursive: true, force: true })
  })

  it('should find metadata in nested job dirs', () => {
    tmpDir = mkdtempSync('/tmp/labcli-test-')
    const jobDir = join(tmpDir, 'jobs', 'exp-1')
    mkdirSync(jobDir, { recursive: true })
    writeFileSync(join(jobDir, 'metadata.json'), '{"jobname":"exp-1","cluster":"local","date":"2026-01-01T10:00:00Z"}')
    const metadatas = listMetadatas(tmpDir)
    expect(metadatas).toHaveLength(1)
    expect(metadatas[0].jobname).toBe('exp-1')
  })
})
