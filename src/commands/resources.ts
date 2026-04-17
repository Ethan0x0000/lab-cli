import type { Command } from 'commander'
import chalk from 'chalk'
import { getConfig } from '../config/loader.js'
import { SSHClient } from '../ssh/client.js'
import { parseSinfoFormat, parseSinfoJson } from '../slurm/parser.js'
import type { SlurmNodeInfo } from '../types/index.js'

function colorizeNodeState(state: string): string {
  const normalizedState = state.toLowerCase()

  if (normalizedState === 'idle') {
    return chalk.green(state)
  }

  if (normalizedState.includes('alloc') || normalizedState.includes('mix')) {
    return chalk.yellow(state)
  }

  if (normalizedState.includes('down') || normalizedState.includes('drain')) {
    return chalk.gray(state)
  }

  return chalk.red(state)
}

export function registerResourcesCommand(program: Command): void {
  program
    .command('resources')
    .description('查看集群资源和账户配额')
    .option('--node <name>', '查看特定节点详情')
    .option('--partition <name>', '按分区过滤')
    .action(async (options) => {
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

        const sinfoResult = await client.exec('sinfo --json')
        let nodes: SlurmNodeInfo[] = []

        try {
          nodes = parseSinfoJson(sinfoResult.stdout)
        } catch {
          const fallbackResult = await client.exec('sinfo --format="%N %T %c %m %P" --noheader')
          nodes = parseSinfoFormat(fallbackResult.stdout)
        }

        if (options.node) {
          nodes = nodes.filter(node => node.nodeName === options.node)
        }

        if (options.partition) {
          nodes = nodes.filter(node => node.partitions.includes(options.partition))
        }

        if (nodes.length === 0) {
          console.log(chalk.yellow('没有找到匹配的节点'))
          return
        }

        const header = `${'节点'.padEnd(12)} ${'状态'.padEnd(12)} ${'CPU(用/总)'.padEnd(12)} ${'内存(用/总)'.padEnd(16)} ${'GPU(用/总)'.padEnd(12)} 分区`
        console.log(chalk.bold(header))
        console.log('─'.repeat(header.length + 10))

        let totalIdleGpus = 0

        for (const node of nodes) {
          const gpuIdle = node.gpuTotal - node.gpuUsed
          totalIdleGpus += gpuIdle

          const row = [
            node.nodeName.padEnd(12),
            colorizeNodeState(node.state).padEnd(12),
            `${node.cpuUsed}/${node.cpuTotal}`.padEnd(12),
            `${Math.round(node.memUsed / 1024)}G/${Math.round(node.memTotal / 1024)}G`.padEnd(16),
            `${node.gpuUsed}/${node.gpuTotal}`.padEnd(12),
            node.partitions.join(','),
          ].join(' ')

          console.log(row)
        }

        console.log('─'.repeat(header.length + 10))
        console.log(`空闲 GPU 总计: ${chalk.green(String(totalIdleGpus))}`)
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error)
        console.error(chalk.red(`获取资源信息失败: ${msg}`))
        process.exit(1)
      } finally {
        client?.disconnect()
      }
    })
}
