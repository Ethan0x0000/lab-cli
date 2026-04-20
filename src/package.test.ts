import { readFileSync } from 'fs'
import { join } from 'path'
import { describe, expect, it } from 'vitest'

type PackageJson = {
  bin?: Record<string, string>
  files?: string[]
  scripts?: Record<string, string>
  engines?: Record<string, string>
  main?: string
}

const packageJson = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf-8')) as PackageJson

describe('package metadata', () => {
  it('builds the CLI during prepare so source installs are link-ready', () => {
    expect(packageJson.scripts?.prepare).toBe('npm run build')
  })

  it('publishes only runtime artifacts and docs', () => {
    expect(packageJson.files).toEqual(expect.arrayContaining(['dist', 'README.md']))
  })

  it('exposes only the built CLI entry instead of a library main', () => {
    expect(packageJson.bin).toEqual({ 'lab-cli': './dist/cli.js' })
    expect(packageJson.main).toBeUndefined()
  })

  it('declares the supported Node.js runtime', () => {
    expect(packageJson.engines?.node).toBe('>=18')
  })
})
