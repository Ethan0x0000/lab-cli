import type { Command } from 'commander'
import chalk from 'chalk'
import ora from 'ora'
import inquirer from 'inquirer'
import { getConfig } from '../config/loader.js'
import { SSHClient } from '../ssh/client.js'

export function registerSetupCommand(program: Command): void {
  program
    .command('setup')
    .description('创建远程训练目录和 conda 环境')
    .option('--skip-conda', '仅创建目录，跳过 conda 环境创建')
    .action(async (options: { skipConda?: boolean }) => {
      let client: SSHClient | null = null

      try {
        const config = await getConfig()

        client = new SSHClient()
        await client.connect({
          host: config.host,
          port: config.port,
          username: config.username,
          authMethod: config.authMethod,
          privateKeyPath: config.privateKeyPath,
        })

        const spinner = ora(`创建远程目录 ${config.remotePath}...`).start()
        const mkdirResult = await client.exec(`mkdir -p ${config.remotePath}`)

        if (mkdirResult.exitCode !== 0) {
          spinner.fail(chalk.red('目录创建失败'))
          console.error(chalk.red(mkdirResult.stderr))
          process.exit(1)
        }

        spinner.succeed(chalk.green(`✓ 目录已创建: ${config.remotePath}`))

        const lsResult = await client.exec(`ls -la ${config.remotePath}`)
        if (lsResult.exitCode !== 0) {
          console.warn(chalk.yellow('目录验证失败，但目录可能已创建'))
        }

        if (!options.skipConda && config.condaEnvName) {
          const checkResult = await client.exec(`conda env list 2>/dev/null | grep "^${config.condaEnvName} "`)

          if (checkResult.exitCode === 0 && checkResult.stdout.includes(config.condaEnvName)) {
            const { rebuild } = await inquirer.prompt([
              {
                type: 'confirm',
                name: 'rebuild',
                message: `Conda 环境 ${config.condaEnvName} 已存在，是否重建？`,
                default: false,
              },
            ])

            if (!rebuild) {
              console.log(chalk.yellow(`跳过 conda 环境创建（已存在: ${config.condaEnvName}）`))
              return
            }
          }

          const condaSpinner = ora(
            `创建 conda 环境 ${config.condaEnvName} (python=${config.condaPythonVersion})...`,
          ).start()
          const condaResult = await client.exec(
            `conda create -n ${config.condaEnvName} python=${config.condaPythonVersion} -y`,
          )

          if (condaResult.exitCode !== 0) {
            condaSpinner.fail(chalk.red('Conda 环境创建失败'))
            console.error(chalk.red(condaResult.stderr))
            process.exit(1)
          }

          condaSpinner.succeed(chalk.green(`✓ Conda 环境已创建: ${config.condaEnvName}`))
        }

        console.log(chalk.green('\n✓ 初始化完成'))
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error)
        console.error(chalk.red(`初始化失败: ${msg}`))
        process.exit(1)
      } finally {
        client?.disconnect()
      }
    })
}
