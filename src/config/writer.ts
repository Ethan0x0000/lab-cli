import { existsSync, mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import { stringify as stringifyYaml } from 'yaml'
import type { GlobalConfig, ProjectConfig } from '../types/index.js'

function getGlobalConfigDir(): string {
  return join(homedir(), '.lab-cli')
}

function getGlobalConfigPath(): string {
  return join(getGlobalConfigDir(), 'config.yaml')
}

export function writeGlobalConfig(config: GlobalConfig): void {
  const globalConfigDir = getGlobalConfigDir()

  if (!existsSync(globalConfigDir)) {
    mkdirSync(globalConfigDir, { recursive: true, mode: 0o700 })
  }

  writeFileSync(getGlobalConfigPath(), stringifyYaml(config), { encoding: 'utf-8', mode: 0o600 })
}

export function writeProjectConfig(config: ProjectConfig): void {
  writeFileSync(join(process.cwd(), '.labrc'), stringifyYaml(config), 'utf-8')
}
