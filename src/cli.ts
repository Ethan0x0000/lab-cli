import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { Command } from 'commander'
import { registerInitCommand } from './commands/init.js'
import { registerConnectCommand } from './commands/connect.js'
import { registerSyncCommand } from './commands/sync.js'
import { registerWatchCommand } from './commands/watch.js'
import { registerSetupCommand } from './commands/setup.js'
import { registerUploadCommand } from './commands/upload.js'
import { registerSubmitCommand } from './commands/submit.js'
import { registerStatusCommand } from './commands/status.js'
import { registerLogsCommand } from './commands/logs.js'
import { registerCancelCommand } from './commands/cancel.js'
import { registerResourcesCommand } from './commands/resources.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Read version from package.json
let version = '0.1.0'
try {
  const pkg = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf-8'))
  version = pkg.version
} catch {
  // fallback to default
}

const program = new Command()

program
  .name('lab-cli')
  .description('内网训练集群全流程自动化 CLI 工具')
  .version(version)

registerInitCommand(program)
registerConnectCommand(program)
registerSyncCommand(program)
registerWatchCommand(program)
registerSetupCommand(program)
registerUploadCommand(program)
registerSubmitCommand(program)
registerStatusCommand(program)
registerLogsCommand(program)
registerCancelCommand(program)
registerResourcesCommand(program)

await program.parseAsync(process.argv)
