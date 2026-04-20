import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import { execSync } from 'child_process'
import { parse as parseYaml } from 'yaml'
import { SSHClient } from '../ssh/client.js'
import type { SSHConnectionOptions } from '../types/index.js'

export interface CheckResult {
  ok: boolean
  message: string
  detail?: string
}

export async function checkGlobalConfig(): Promise<CheckResult> {
  try {
    const configPath = join(homedir(), '.lab-cli', 'config.yaml')

    if (!existsSync(configPath)) {
      return {
        ok: false,
        message: '全局配置不存在',
        detail: `预期路径: ${configPath}`,
      }
    }

    const content = readFileSync(configPath, 'utf-8')
    try {
      parseYaml(content)
    } catch {
      return {
        ok: false,
        message: '全局配置 YAML 格式无效',
        detail: configPath,
      }
    }

    return {
      ok: true,
      message: '全局配置正常',
      detail: configPath,
    }
  } catch (error) {
    return {
      ok: false,
      message: '检查全局配置时出错',
      detail: error instanceof Error ? error.message : String(error),
    }
  }
}

export async function checkProjectConfig(): Promise<CheckResult> {
  try {
    const cwd = process.cwd()
    const configNames = ['.labrc', '.labrc.yaml', '.labrc.yml']
    const found = configNames.find(name => existsSync(join(cwd, name)))

    if (!found) {
      return {
        ok: false,
        message: '项目配置不存在',
        detail: `预期路径: ${configNames.map(name => join(cwd, name)).join(' 或 ')}`,
      }
    }

    return {
      ok: true,
      message: '项目配置正常',
      detail: join(cwd, found),
    }
  } catch (error) {
    return {
      ok: false,
      message: '检查项目配置时出错',
      detail: error instanceof Error ? error.message : String(error),
    }
  }
}

export async function checkRsync(): Promise<CheckResult> {
  try {
    execSync('rsync --version', { stdio: 'pipe' })
    return {
      ok: true,
      message: 'rsync 可用',
    }
  } catch (error) {
    return {
      ok: false,
      message: 'rsync 不可用',
      detail: error instanceof Error ? error.message : String(error),
    }
  }
}

export async function checkSshConnection(
  options: SSHConnectionOptions,
): Promise<CheckResult> {
  const client = new SSHClient()

  try {
    await client.connect(options)
    client.disconnect()

    return {
      ok: true,
      message: 'SSH 连接成功',
      detail: `${options.username}@${options.host}:${options.port}`,
    }
  } catch (error) {
    return {
      ok: false,
      message: 'SSH 连接失败',
      detail: error instanceof Error ? error.message : String(error),
    }
  }
}

export async function checkSlurmAvailable(client: SSHClient): Promise<CheckResult> {
  try {
    const result = await client.exec('squeue --version')

    if (result.exitCode === 0) {
      return {
        ok: true,
        message: 'Slurm 可用',
        detail: result.stdout.trim(),
      }
    }

    return {
      ok: false,
      message: 'Slurm 不可用',
      detail: result.stderr || result.stdout,
    }
  } catch (error) {
    return {
      ok: false,
      message: 'Slurm 检查失败',
      detail: error instanceof Error ? error.message : String(error),
    }
  }
}

export async function checkSlurmJsonSupport(client: SSHClient): Promise<CheckResult> {
  try {
    const result = await client.exec('squeue --json --help')

    if (result.exitCode === 0) {
      return {
        ok: true,
        message: 'Slurm JSON 支持可用',
      }
    }

    return {
      ok: false,
      message: 'Slurm JSON 支持不可用',
      detail: result.stderr || result.stdout,
    }
  } catch (error) {
    return {
      ok: false,
      message: 'Slurm JSON 支持检查失败',
      detail: error instanceof Error ? error.message : String(error),
    }
  }
}

export interface RunAllChecksOptions {
  sshOptions?: SSHConnectionOptions
}

export async function runAllChecks(options?: RunAllChecksOptions): Promise<CheckResult[]> {
  const results: CheckResult[] = []

  // Basic checks
  results.push(await checkGlobalConfig())
  results.push(await checkProjectConfig())
  results.push(await checkRsync())

  // SSH and Slurm checks (if SSH options provided)
  if (options?.sshOptions) {
    const sshResult = await checkSshConnection(options.sshOptions)
    results.push(sshResult)

    if (sshResult.ok) {
      const client = new SSHClient()
      try {
        await client.connect(options.sshOptions)
        results.push(await checkSlurmAvailable(client))
        results.push(await checkSlurmJsonSupport(client))
        client.disconnect()
      } catch (error) {
        results.push({
          ok: false,
          message: 'Slurm 检查失败',
          detail: error instanceof Error ? error.message : String(error),
        })
      }
    }
  }

  return results
}
