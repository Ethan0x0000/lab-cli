import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import { cosmiconfig } from 'cosmiconfig'
import { parse as parseYaml } from 'yaml'
import { globalConfigSchema, projectConfigSchema } from './schema.js'
import type { GlobalConfig, MergedConfig, ProjectConfig } from '../types/index.js'

function getGlobalConfigPath(): string {
  return join(homedir(), '.lab-cli', 'config.yaml')
}

export async function loadGlobalConfig(): Promise<GlobalConfig> {
  const globalConfigPath = getGlobalConfigPath()

  if (!existsSync(globalConfigPath)) {
    throw new Error('全局配置不存在。请先运行 labcli init --global 初始化配置')
  }

  const content = readFileSync(globalConfigPath, 'utf-8')
  let raw: unknown
  try {
    raw = parseYaml(content)
  } catch {
    throw new Error(`全局配置文件格式无效，请检查 YAML 语法: ${globalConfigPath}`)
  }
  const result = globalConfigSchema.safeParse(raw)

  if (!result.success) {
    throw new Error(`全局配置无效: ${result.error.message}`)
  }

  return result.data as GlobalConfig
}

export async function loadProjectConfig(): Promise<ProjectConfig | null> {
  const explorer = cosmiconfig('lab', {
    searchPlaces: ['.labrc', '.labrc.yaml', '.labrc.yml'],
  })

  const result = await explorer.search(process.cwd())
  if (!result || result.isEmpty) {
    return null
  }

  const parsed = projectConfigSchema.safeParse(result.config)
  if (!parsed.success) {
    throw new Error(`项目配置无效: ${parsed.error.message}`)
  }

  return parsed.data as ProjectConfig
}

export async function mergeConfig(
  globalConfig: GlobalConfig,
  projectConfig: ProjectConfig | null,
): Promise<MergedConfig> {
  if (!projectConfig) {
      throw new Error('项目配置不存在。请先运行 labcli init 初始化项目配置')
  }

  return {
    ...globalConfig,
    ...projectConfig,
  } as MergedConfig
}

export async function getConfig(): Promise<MergedConfig> {
  const globalConfig = await loadGlobalConfig()
  const projectConfig = await loadProjectConfig()

  return mergeConfig(globalConfig, projectConfig)
}
