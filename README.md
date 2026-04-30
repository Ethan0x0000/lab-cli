<h1 align="center">LabCLI</h1>
<p align="center">
  <b>Slurm 训练集群的全流程命令行工具</b><br>
  <sub>把 6 步手动操作收敛成一条命令 · 零学习成本的集群交互体验</sub>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/node-%3E%3D20-brightgreen?style=flat-square&logo=nodedotjs" alt="Node.js >= 20">
  <img src="https://img.shields.io/badge/license-ISC-blue?style=flat-square" alt="License: ISC">
  <img src="https://img.shields.io/badge/platform-windows%20%7C%20linux%20%7C%20macos-lightgrey?style=flat-square" alt="Platform:Windows | Linux | macOS">
  <img src="https://img.shields.io/badge/typescript-5.x-3178c6?style=flat-square&logo=typescript" alt="TypeScript 5.x">
</p>


## 为什么需要 LabCLI

在 Slurm 集群上做深度学习训练，通常需要在 Terminal 里反复执行：SSH 登录 → 手动 rsync 代码 → 写 Slurm 脚本 → sbatch 提交 → squeue 查看状态 → scp 拉日志。每一步都有出错空间，切换项目时又要重新来一遍。

LabCLI 把这个流程抽象成一套直觉式的命令行接口，让你在本地就能完成从代码同步到任务监控的全部操作——就像在用一台本地 GPU 工作站。

```bash
labcli submit train.sh --sync    # 同步代码 + 提交训练，一条命令
labcli logs 12345 --follow       # 实时查看远端训练日志
labcli resources                 # 看一眼集群 GPU 空闲情况
```

## 功能速览

| 能力 | 说明 |
|---|---|
| 🔗 **SSH 连接管理** | 连接池复用，断线自动重连，SIGINT 安全清理 |
| 🔄 **代码同步** | rsync 增量同步 + chokidar 文件监听自动同步 |
| 📤 **文件上传** | SFTP 自动降级（rsync 不可用时），支持文件/目录 |
| 📋 **任务提交** | 预设资源配置（debug / single-gpu / multi-gpu / full-node），交互式引导 |
| 📊 **状态监控** | Slurm 任务状态查询，集群 GPU 资源总览 |
| 📜 **日志查看** | 远端日志实时 tail，stdout / stderr 分离 |
| ⚙️ **环境初始化** | 一键创建远端目录 + conda 环境，Zod 配置校验 |
| 🩺 **环境诊断** | `doctor` 命令检查 SSH、rsync、Slurm、配置文件完整性 |
| 🚀 **新手引导** | `quickstart` 交互式全流程引导，5 分钟上手 |

## 目录

- [安装](#安装)
- [快速开始](#快速开始)
- [典型工作流](#典型工作流)
- [命令参考](#命令参考)
- [预设资源配置](#预设资源配置)
- [配置文件](#配置文件)
- [架构概览](#架构概览)
- [常见问题](#常见问题)
- [开发](#开发)

## 安装

> **前置条件**: Node.js ≥ 20，本地需安装 rsync（`sync` 命令依赖）。

### npm 全局安装（推荐）

```bash
npm install -g labcli
```

### 从源码安装

```bash
git clone <repository>
cd LabCLI
npm install && npm link
```

`npm install` 会通过 `prepare` 钩子自动构建 `dist/cli.js`，紧接着 `npm link` 即把 `labcli` 注册到当前用户环境。

如果你的 npm 全局目录是系统路径且无写权限，可以安装到用户级 prefix：

```bash
npm install -g --prefix "$HOME/.local" .
export PATH="$HOME/.local/bin:$PATH"
labcli --help
```

### 验证安装

```bash
labcli --help
labcli doctor
```

## 快速开始

从零到第一次提交训练任务，只需 4 条命令：

```bash
# 1. 配置服务器连接信息（仅首次）
labcli init --global

# 2. 初始化当前项目
labcli init

# 3. 在远端创建目录和 conda 环境
labcli setup

# 4. 同步代码并提交训练
labcli submit train.sh --sync
```

或者用交互式引导，一条命令完成全部初始化：

```bash
labcli quickstart
```

## 典型工作流

### 日常训练循环

```bash
labcli sync                              # 同步最新代码到远端
labcli submit train.sh --preset multi-gpu # 使用 4 GPU 预设提交
labcli status                            # 查看任务队列
labcli logs 12345 --follow               # 实时跟踪训练日志
```

### 调试模式

```bash
labcli submit train.sh --preset debug    # 1 GPU，1 小时，快速验证
labcli logs 12345 --tail 100 --error     # 只看最近的错误日志
```

### 纯同步（不提交）

```bash
labcli sync                              # 一次性同步
labcli watch                             # 持续监听文件变化，自动同步
```

### 换机器后的恢复流程

```bash
labcli init --global     # 重新配置 SSH
labcli doctor            # 一键诊断环境是否就绪
```

## 命令参考

### `labcli init [--global]`

初始化配置。`--global` 写入 `~/.lab-cli/config.yaml`；不带参数则写入项目根目录的 `.labrc`。

```bash
labcli init --global
labcli init
```

### `labcli quickstart`

交互式引导，包含全局配置 → 项目配置 → 环境初始化 → 首次同步的完整流程。

### `labcli doctor`

检查 Node.js 版本、SSH 连通性、rsync 可用性、Slurm 命令可用性、配置文件完整性。

### `labcli connect`

通过 SSH 进入远端服务器的交互式 shell。

### `labcli sync [--dry-run] [--exclude <patterns...>]`

基于 rsync 的增量同步。`--dry-run` 预览变更而不实际传输；`--exclude` 追加排除规则。

```bash
labcli sync --dry-run
labcli sync --exclude "*.log" "tmp/"
```

### `labcli watch [--no-initial-sync]`

基于 chokidar 的文件监听，变更时自动触发 rsync 同步。`--no-initial-sync` 跳过启动时的全量同步。

### `labcli setup [--skip-conda]`

在远端创建训练目录结构，并可选择创建 conda 虚拟环境。`--skip-conda` 仅创建目录。

### `labcli upload <localPath> [remotePath]`

上传文件或目录到远端。优先使用 rsync，不可用时自动降级到 SFTP。

```bash
labcli upload ./data/dataset.zip
labcli upload ./data /home/user/training/data
```

### `labcli submit <script> [options]`

提交 Slurm 训练任务。

| 参数 | 说明 |
|---|---|
| `--partition <name>` | Slurm 分区 |
| `--gpus <n>` | GPU 数量 |
| `--nodes <n>` | 节点数量 |
| `--time <HH:MM:SS>` | 时间限制 |
| `--name <jobName>` | 作业名称 |
| `--output <path>` | stdout 日志路径 |
| `--error <path>` | stderr 日志路径 |
| `--sync` | 提交前先同步代码 |
| `--dry-run` | 仅打印 sbatch 命令，不实际提交 |
| `--preset <name>` | 使用预设资源配置（见下方） |
| `--guide` | 交互式选择预设 |

```bash
labcli submit train.sh
labcli submit train.sh --partition gpu --gpus 4 --time 24:00:00
labcli submit train.sh --sync --name my_training
labcli submit train.sh --preset single-gpu
labcli submit train.sh --guide
```

### `labcli status [--job-id <id>] [--all]`

查看 Slurm 任务状态。无参数时显示当前用户的任务；`--job-id` 查看特定任务；`--all` 查看所有用户任务。

### `labcli logs <jobId> [-f] [--tail <n>] [--error]`

查看远端训练日志。`-f` / `--follow` 实时跟踪；`--tail` 控制行数（默认 50）；`--error` 查看 stderr。

```bash
labcli logs 12345
labcli logs 12345 --follow
labcli logs 12345 --tail 100 --error
```

### `labcli cancel <jobId> [--all]`

取消 Slurm 任务。`--all` 取消当前用户的所有任务。

### `labcli resources [--node <name>] [--partition <name>]`

查看集群资源和节点状态，包括 GPU 空闲/占用/总数。

```bash
labcli resources
labcli resources --partition gpu
labcli resources --node node01
```

## 预设资源配置

`submit` 命令内置 4 档预设，覆盖从调试到全量训练的典型场景：

| 预设名 | GPU | 节点 | 时间 | 适用场景 |
|---|---|---|---|---|
| `debug` | 1 | 1 | 1h | 快速验证脚本能跑通 |
| `single-gpu` | 1 | 1 | 24h | 单卡训练 |
| `multi-gpu` | 4 | 1 | 48h | 多卡训练 |
| `full-node` | 8 | 1 | 72h | 占满单节点 |

使用 `--guide` 可以在命令行交互式选择预设。

## 配置文件

LabCLI 使用两层配置：全局配置（跨项目共享）和项目配置（项目特定），运行时自动合并。

### 全局配置 `~/.lab-cli/config.yaml`

```yaml
host: your-server-host          # 服务器地址
port: 22                        # SSH 端口（默认 22）
username: yourname              # 服务器用户名
authMethod: key                 # 认证方式：key 或 password
privateKeyPath: ~/.ssh/id_rsa   # 私钥路径（authMethod=key 时）
defaultRemotePath: /home/yourname  # 默认远端路径
defaultPartition: gpu           # 默认 Slurm 分区
```

→ 完整示例：[`config.example.yaml`](./config.example.yaml)

### 项目配置 `.labrc`

```yaml
name: my-training-project                   # 项目名称
remotePath: /home/yourname/projects/my-project  # 远端路径
syncExclude:                                # 同步排除规则
  - node_modules
  - .git
  - __pycache__
  - "*.pyc"
  - .env
  - dist
  - coverage
slurmPartition: gpu          # Slurm 分区
slurmGpus: 4                 # GPU 数量
slurmNodes: 1                # 节点数量
condaEnvName: myenv          # Conda 环境名称
condaPythonVersion: "3.10"   # Python 版本
```

→ 完整示例：[`.labrc.example`](./.labrc.example)

配置文件由 Zod schema 校验，运行 `labcli init` 交互式生成，避免手写错误。

## 架构概览

```
┌──────────────────────────────────────────────┐
│                   CLI Layer                   │
│  src/cli.ts → Commander.js → 13 commands     │
├──────────┬──────────┬───────────┬────────────┤
│  Config  │   SSH    │  Transfer  │   Slurm    │
│  Zod +   │  ssh2    │  rsync +   │  JSON +    │
│  cosmi-  │  pool +  │  SFTP      │  text      │
│  config  │  reconnect│  fallback  │  fallback  │
├──────────┴──────────┴───────────┴────────────┤
│                  Remote Layer                 │
│    SSHExecution / LocalExecution / Mock       │
├──────────────────────────────────────────────┤
│              Slurm Cluster                    │
└──────────────────────────────────────────────┘
```

- **Config** — Zod schema 校验 + cosmiconfig 加载，全局与项目两层配置自动合并
- **SSH** — ssh2 封装，连接池复用，进程退出 / SIGINT 安全清理
- **Transfer** — rsync spawn 包装，SFTP 自动降级
- **Slurm** — `--json` 支持自动检测，无 JSON 时降级到文本解析，检测结果缓存
- **Remote** — `RemoteExecution` 接口，提供统一抽象便于测试和本地模拟
- **Job** — 任务路径和元数据管理

## 常见问题

**Q: 连接时提示 Authentication failed？**

A: 检查 `~/.lab-cli/config.yaml` 中的 `authMethod`、`privateKeyPath` 和 `username` 是否正确。运行 `labcli doctor` 可辅助诊断。

**Q: rsync 不可用怎么办？**

A: `upload` 命令会自动降级到 SFTP；`sync` 和 `watch` 命令依赖本地 rsync，请先安装。

**Q: Slurm 的 `--json` 不可用怎么办？**

A: LabCLI 会自动检测 Slurm 版本，旧版本无 JSON 输出时会降级为文本格式解析，无需手动配置。

**Q: `watch` 命令会占用很多资源吗？**

A: 基于 chokidar 的文件事件监听（非轮询），CPU 占用极低。

**Q: 怎么更新已有配置？**

A: 重新运行 `labcli init --global` 或 `labcli init`，按提示覆盖即可。配置文件为 YAML 格式，也可以直接编辑。

## 开发

```bash
git clone <repository>
cd LabCLI
npm install

# 常用命令
npm run dev           # tsx src/cli.ts，直接运行源码
npm test              # vitest 全量测试
npm run test:watch    # vitest 监听模式
npm run lint          # ESLint
npm run typecheck     # tsc --noEmit
npm run build         # tsup 构建 dist/cli.js
```

- **语言**: TypeScript (ESM, NodeNext module resolution)
- **构建**: tsup → 单文件 ESM bundle，带 shebang
- **测试**: Vitest，模块内有 `__tests__/` 目录
- **Lint**: ESLint + `@typescript-eslint/recommended`

## License

[ISC](https://opensource.org/licenses/ISC)
