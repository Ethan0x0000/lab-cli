import type { Command } from 'commander'
import chalk from 'chalk'
import ora from 'ora'
import { getConfig } from '../config/loader.js'
import { sshManager } from '../ssh/manager.js'
import { handleCliError } from '../utils/errors.js'
import type { SSHConnectionOptions } from '../types/index.js'
import {
  checkGlobalConfig,
  checkProjectConfig,
  checkRsync,
  checkSlurmAvailable,
  checkSlurmJsonSupport,
  checkSshConnection,
  type CheckResult,
} from '../utils/checks.js'

function isSkippedResult(result: CheckResult): boolean {
  return result.message.startsWith('跳过')
}

function printResult(result: CheckResult): void {
  const symbol = isSkippedResult(result)
    ? chalk.dim('○')
    : result.ok
      ? chalk.green('✓')
      : chalk.red('✗')
  console.log(`${symbol} ${result.message}`)

  if (!result.ok && result.detail) {
    console.log(chalk.dim(result.detail))
  }
}

function printSummary(results: CheckResult[]): void {
  const skippedCount = results.filter(isSkippedResult).length
  const passedCount = results.filter(result => result.ok).length
  const totalCount = results.length - skippedCount
  const suffix = skippedCount > 0 ? `（${skippedCount} 项跳过）` : ''

  console.log(chalk.blue(`\n诊断完成: ${passedCount}/${totalCount} 项通过${suffix}`))
}

function skippedCheck(message: string, detail?: string): CheckResult {
  return {
    ok: false,
    message,
    detail,
  }
}

async function runCheck(label: string, check: () => Promise<CheckResult>): Promise<CheckResult> {
  const spinner = ora(label).start()
  const result = await check()
  spinner.stop()
  printResult(result)
  return result
}

export function registerDoctorCommand(program: Command): void {
  program
    .command('doctor')
    .description('检查运行环境，诊断潜在问题')
    .action(async () => {
      const results: CheckResult[] = []

      try {
        const globalConfigResult = await runCheck('检查全局配置...', () => checkGlobalConfig())
        results.push(globalConfigResult)

        const projectConfigResult = await runCheck('检查项目配置...', () => checkProjectConfig())
        results.push(projectConfigResult)

        const rsyncResult = await runCheck('检查 rsync...', () => checkRsync())
        results.push(rsyncResult)

        if (!globalConfigResult.ok) {
          const skippedSshResult = skippedCheck('跳过 SSH 连接检查：全局配置未通过')
          const skippedSlurmResult = skippedCheck('跳过 Slurm 可用性检查：全局配置未通过')
          const skippedJsonResult = skippedCheck('跳过 Slurm JSON 支持检查：全局配置未通过')

          results.push(skippedSshResult, skippedSlurmResult, skippedJsonResult)
          printResult(skippedSshResult)
          printResult(skippedSlurmResult)
          printResult(skippedJsonResult)

          printSummary(results)
          return
        }

        let sshOptions: SSHConnectionOptions
        try {
          const config = await getConfig()
          sshOptions = {
            host: config.host,
            port: config.port,
            username: config.username,
            authMethod: config.authMethod,
            privateKeyPath: config.privateKeyPath,
          }
        } catch (error) {
          const detail = error instanceof Error ? error.message : String(error)
          const sshResult = skippedCheck('SSH 连接检查失败', detail)
          const skippedSlurmResult = skippedCheck('跳过 Slurm 可用性检查：SSH 连接未通过')
          const skippedJsonResult = skippedCheck('跳过 Slurm JSON 支持检查：SSH 连接未通过')

          results.push(sshResult, skippedSlurmResult, skippedJsonResult)
          printResult(sshResult)
          printResult(skippedSlurmResult)
          printResult(skippedJsonResult)

          printSummary(results)
          return
        }

        const sshResult = await runCheck('检查 SSH 连接...', () => checkSshConnection(sshOptions))
        results.push(sshResult)

        if (!sshResult.ok) {
          const skippedSlurmResult = skippedCheck('跳过 Slurm 可用性检查：SSH 连接未通过')
          const skippedJsonResult = skippedCheck('跳过 Slurm JSON 支持检查：SSH 连接未通过')

          results.push(skippedSlurmResult, skippedJsonResult)
          printResult(skippedSlurmResult)
          printResult(skippedJsonResult)

          printSummary(results)
          return
        }

        const config = await getConfig()
        const sshClient = await sshManager.getConnection(config)

        const slurmResult = await runCheck('检查 Slurm 可用性...', () => checkSlurmAvailable(sshClient!))
        results.push(slurmResult)

        const slurmJsonResult = await runCheck('检查 Slurm JSON 支持...', () => checkSlurmJsonSupport(sshClient!))
        results.push(slurmJsonResult)

        printSummary(results)
      } catch (error) {
        handleCliError(error, '诊断失败')
      }
    })
}
