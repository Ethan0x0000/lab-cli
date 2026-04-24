import { basename } from 'path'
import { existsSync, statSync } from 'fs'
import type { Command } from 'commander'
import chalk from 'chalk'
import ora from 'ora'
import { getConfig } from '../config/loader.js'
import { SSHClient } from '../ssh/client.js'
import { syncToRemote } from '../transfer/rsync.js'
import { ensureRemoteDirectory, uploadFile } from '../transfer/sftp.js'
import { buildSSHOptions } from '../utils/ssh-helpers.js'
import type { SSHConnectionOptions } from '../types/index.js'

const SMALL_FILE_THRESHOLD = 100 * 1024 * 1024 // 100MB

export function registerUploadCommand(program: Command): void {
  program
    .command('upload <localPath> [remotePath]')
    .description('上传数据集到远程服务器')
    .action(async (localPath: string, remotePath: string | undefined) => {
      try {
        if (!existsSync(localPath)) {
          console.error(chalk.red(`路径不存在: ${localPath}`))
          process.exit(1)
        }

        const config = await getConfig()
        const targetPath = remotePath ?? `${config.remotePath}/data`
        const stat = statSync(localPath)
        const useSftpForSmallFile = !stat.isDirectory() && stat.size < SMALL_FILE_THRESHOLD
        let sshOptions: SSHConnectionOptions | undefined

        // Prompt password before spinner to avoid hidden interactive input in terminals.
        if (useSftpForSmallFile) {
          sshOptions = await buildSSHOptions(config)
        }

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
            const client = new SSHClient()
            try {
              spinner.text = '正在建立 SSH 连接...'
              await client.connect(sshOptions ?? await buildSSHOptions(config))
              spinner.text = '正在通过 SFTP 上传文件...'
              const sftp = await client.sftp()
              await ensureRemoteDirectory(sftp, targetPath)
              await uploadFile(sftp, localPath, `${targetPath}/${basename(localPath)}`)
            } finally {
              client.disconnect()
            }
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
        const msg = error instanceof Error ? error.message : String(error)
        console.error(chalk.red(`上传失败: ${msg}`))
        process.exit(1)
      }
    })
}
