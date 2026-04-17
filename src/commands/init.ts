import type { Command } from 'commander'
import inquirer from 'inquirer'
import { existsSync } from 'fs'
import { basename, join } from 'path'
import { homedir } from 'os'
import chalk from 'chalk'
import { globalConfigSchema, projectConfigSchema } from '../config/schema.js'
import { writeGlobalConfig, writeProjectConfig } from '../config/writer.js'

const GLOBAL_CONFIG_PATH = join(homedir(), '.lab-cli', 'config.yaml')

type OverwriteAnswer = { overwrite: boolean }

type GlobalAnswers = {
  host: string
  port: number
  username: string
  authMethod: 'key' | 'password'
  privateKeyPath?: string
  defaultRemotePath: string
  defaultPartition?: string
}

type ProjectAnswers = {
  name: string
  remotePath: string
  condaEnvName?: string
  condaPythonVersion: string
  slurmPartition?: string
  slurmGpus?: number
}

export function registerInitCommand(program: Command): void {
  program
    .command('init')
    .description('初始化 lab-cli 配置')
    .option('--global', '初始化全局配置')
    .action(async (options) => {
      try {
        if (options.global) {
          await initGlobal()
        } else {
          await initProject()
        }
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error)
        console.error(chalk.red(`初始化失败: ${msg}`))
        process.exit(1)
      }
    })
}

async function initGlobal(): Promise<void> {
  if (existsSync(GLOBAL_CONFIG_PATH)) {
    const { overwrite } = await inquirer.prompt<OverwriteAnswer>([
      {
        type: 'confirm',
        name: 'overwrite',
        message: '全局配置已存在，是否覆盖？',
        default: false,
      },
    ])

    if (!overwrite) {
      console.log(chalk.yellow('已取消'))
      return
    }
  }

  const answers = await inquirer.prompt<GlobalAnswers>([
    {
      type: 'input',
      name: 'host',
      message: '服务器地址:',
      validate: (value: string) => value.trim() !== '' || '不能为空',
    },
    { type: 'number', name: 'port', message: 'SSH 端口:', default: 22 },
    {
      type: 'input',
      name: 'username',
      message: '用户名:',
      validate: (value: string) => value.trim() !== '' || '不能为空',
    },
    { type: 'list', name: 'authMethod', message: '认证方式:', choices: ['key', 'password'] },
    {
      type: 'input',
      name: 'privateKeyPath',
      message: '私钥路径:',
      default: '~/.ssh/id_rsa',
      when: (answers: Record<string, unknown>) => answers.authMethod === 'key',
    },
    {
      type: 'input',
      name: 'defaultRemotePath',
      message: '默认远程根路径:',
      validate: (value: string) => value.trim() !== '' || '不能为空',
    },
    { type: 'input', name: 'defaultPartition', message: '默认 Slurm 分区（可选）:' },
  ])

  const config = globalConfigSchema.parse({
    host: answers.host.trim(),
    port: answers.port,
    username: answers.username.trim(),
    authMethod: answers.authMethod,
    privateKeyPath: answers.authMethod === 'key' ? answers.privateKeyPath?.trim() : undefined,
    defaultRemotePath: answers.defaultRemotePath.trim(),
    defaultPartition: answers.defaultPartition?.trim() || undefined,
  })

  writeGlobalConfig(config)
  console.log(chalk.green(`✓ 全局配置已写入 ${GLOBAL_CONFIG_PATH}`))
}

async function initProject(): Promise<void> {
  const cwd = process.cwd()
  const labrcPath = join(cwd, '.labrc')

  if (existsSync(labrcPath)) {
    const { overwrite } = await inquirer.prompt<OverwriteAnswer>([
      {
        type: 'confirm',
        name: 'overwrite',
        message: '项目配置 .labrc 已存在，是否覆盖？',
        default: false,
      },
    ])

    if (!overwrite) {
      console.log(chalk.yellow('已取消'))
      return
    }
  }

  const answers = await inquirer.prompt<ProjectAnswers>([
    { type: 'input', name: 'name', message: '项目名称:', default: basename(cwd) },
    {
      type: 'input',
      name: 'remotePath',
      message: '远程项目路径:',
      validate: (value: string) => value.trim() !== '' || '不能为空',
    },
    { type: 'input', name: 'condaEnvName', message: 'Conda 环境名称（可选）:' },
    { type: 'input', name: 'condaPythonVersion', message: 'Python 版本:', default: '3.10' },
    { type: 'input', name: 'slurmPartition', message: 'Slurm 分区（可选）:' },
    { type: 'number', name: 'slurmGpus', message: 'GPU 数量（可选）:' },
  ])

  const config = projectConfigSchema.parse({
    name: answers.name.trim(),
    remotePath: answers.remotePath.trim(),
    condaEnvName: answers.condaEnvName?.trim() || undefined,
    condaPythonVersion: answers.condaPythonVersion.trim(),
    slurmPartition: answers.slurmPartition?.trim() || undefined,
    slurmGpus: answers.slurmGpus || undefined,
  })

  writeProjectConfig(config)
  console.log(chalk.green(`✓ 项目配置已写入 ${labrcPath}`))
}
