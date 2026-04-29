import { basename } from 'path'
import { existsSync, statSync } from 'fs'
import type { Command } from 'commander'
import chalk from 'chalk'
import ora from 'ora'
import { getConfig } from '../config/loader.js'
import { sshManager } from '../ssh/manager.js'
import { handleCliError } from '../utils/errors.js'
import { syncToRemote } from '../transfer/rsync.js'
import { uploadFile } from '../transfer/sftp.js'

const SMALL_FILE_THRESHOLD = 100 * 1024 * 1024 // 100MB

export function registerUploadCommand(program: Command): void {
  program
    .command('upload <localPath> [remotePath]')
    .description('上传数据集到远程服务器')
    .action(async (localPath: string, remotePath: string | undefined) => {
      try {
        if (!existsSync(localPath)) {
          console.error(chalk.red(`路径不存在: ${localPath}`))
          process.exitCode = 1
          return
        }

        const config = await getConfig()
        const targetPath = remotePath ?? `${config.remotePath}/data`
        const stat = statSync(localPath)
        const spinner = ora(`正在上传 ${localPath} 到 ${targetPath}...`).start()

        try {
          if (stat.isDirectory()) {
            await syncToRemote({
              localPath,
              remotePath: targetPath,
              host: config.host,
              username: config.username,
              excludePatterns: config.syncExclude,
              privateKeyPath: config.privateKeyPath,
              port: config.port,
            })
          } else if (stat.size < SMALL_FILE_THRESHOLD) {
            const client = await sshManager.getConnection(config)
            const sftp = await client.sftp()
            await uploadFile(sftp, localPath, `${targetPath}/${basename(localPath)}`)
            console.log(chalk.dim('ℹ 使用 SFTP 传输（rsync 不可用或文件较小）'))
          } else {
            await syncToRemote({
              localPath,
              remotePath: targetPath,
              host: config.host,
              username: config.username,
              excludePatterns: [],
              privateKeyPath: config.privateKeyPath,
              port: config.port,
            })
          }

          spinner.succeed(chalk.green(`✓ 上传完成: ${localPath} → ${targetPath}`))
        } catch (error) {
          spinner.fail(chalk.red('上传失败'))
          throw error
        }
      } catch (error) {
        handleCliError(error, '上传失败')
      }
    })
}
