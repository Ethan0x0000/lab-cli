# LabCLI

> 内网训练集群全流程自动化 CLI 工具

把手动的 6 步训练工作流，收敛成一套命令行操作，面向 Slurm 集群使用。

## 安装

> 需要 Node.js 20 或更高版本。

### 从源码仓库安装（推荐给开发或本地试用）

```bash
git clone <repository>
cd labcli
npm install
npm link
```

`npm install` 会通过 `prepare` 自动构建 `dist/cli.js`，所以紧接着执行 `npm link` 就能把 `labcli` 暴露到当前用户环境。

如果你的 npm 全局目录是系统路径，例如 `/usr/lib/node_modules`，并且当前用户没有写权限，可以把当前源码目录直接安装到用户级 prefix：

```bash
npm install -g --prefix "$HOME/.local" .
"$HOME/.local/bin/labcli" --help
```

如果你希望直接用 `labcli` 命令名调用，再把 `$HOME/.local/bin` 加入 `PATH` 即可。

### 验证打包产物

```bash
npm pack
npm install -g --prefix "$HOME/.local/share/labcli-test" ./labcli-0.1.0.tgz
"$HOME/.local/share/labcli-test/bin/labcli" --help
```

如果你只是想在当前仓库里开发和试用，使用上面的源码安装流程即可，只有在验证打包结果或准备发布时，才需要走 `npm pack` 这条路径。

## 按角色使用

### 新用户，初次配置
1. `labcli quickstart`，交互式全流程引导
2. `labcli doctor`，检查环境是否就绪
3. `labcli init --global`，手动配置服务器信息
4. `labcli setup`，创建远程目录和 conda 环境

### 日常训练工作流
1. `labcli sync` / `labcli watch`，同步最新代码
2. `labcli submit train.sh`，提交训练任务
3. `labcli status`，查看任务进度
4. `labcli logs <jobId>`，查看训练日志

### 排障
- `labcli doctor`，一键诊断环境问题
- `labcli connect`，直接 SSH 到服务器
- `labcli logs <jobId> --error`，查看错误日志

### 资源管理
- `labcli resources`，查看集群空闲 GPU
- `labcli cancel <jobId>`，取消任务

## 典型场景

### 场景一，首次开始新项目
```bash
labcli quickstart        # 一键引导完成初始化
# 或者手动操作：
labcli init --global     # 配置服务器信息，首次使用
labcli init              # 配置项目，每个新项目都要做
labcli setup             # 创建远程环境
labcli sync              # 同步代码
labcli submit train.sh   # 提交第一个训练任务
```

### 场景二，日常提交训练
```bash
labcli sync                                # 同步最新代码
labcli submit train.sh --sync              # 同步并提交，合一步
labcli submit train.sh --preset multi-gpu  # 使用 4 GPU 预设
labcli status                              # 查看任务状态
```

### 场景三，换机器后恢复
```bash
labcli init --global     # 重新配置服务器信息
labcli doctor            # 验证环境是否正常
```

### 场景四，只同步不提交
```bash
labcli sync              # 一次性同步
labcli watch             # 持续监听并自动同步
```

### 场景五，使用预设快速提交
```bash
labcli submit --help                     # 查看可用选项
labcli submit train.sh --preset debug    # 调试，1 GPU，1 小时
labcli submit train.sh --preset single-gpu  # 单 GPU，1 GPU，24 小时
labcli submit train.sh --preset multi-gpu   # 多 GPU，4 GPU，48 小时
labcli submit train.sh --preset full-node   # 整节点，8 GPU，72 小时
labcli submit train.sh --guide              # 交互式选择预设
```

## 命令速查

| 命令 | 说明 | 常用参数 |
|------|------|---------|
| `labcli init` | 初始化配置 | `--global`，全局配置 |
| `labcli quickstart` | 交互式新手引导 | 无 |
| `labcli doctor` | 环境诊断 | 无 |
| `labcli connect` | SSH 到服务器 | 无 |
| `labcli sync` | 同步代码 | `--dry-run`，`--exclude` |
| `labcli watch` | 监听并自动同步 | `--no-initial-sync` |
| `labcli setup` | 创建远程环境 | `--skip-conda` |
| `labcli upload` | 上传文件或目录 | `<localPath> [remotePath]` |
| `labcli submit` | 提交训练任务 | `--preset`，`--guide`，`--sync`，`--dry-run`，`--output`，`--error` |
| `labcli status` | 查看任务状态 | `--job-id`，`--all` |
| `labcli logs` | 查看训练日志 | `-f`，`--tail`，`--error` |
| `labcli cancel` | 取消任务 | `--all` |
| `labcli resources` | 查看集群资源 | `--node`，`--partition` |

## 快速开始

```bash
# 1. 初始化全局配置，填写服务器信息
labcli init --global

# 2. 初始化项目配置
labcli init

# 3. 创建远程目录和 conda 环境
labcli setup

# 4. 同步代码到远程服务器
labcli sync

# 5. 提交训练任务
labcli submit train.sh

# 6. 查看训练日志
labcli logs <jobId>
```

## 命令参考

### `labcli init [--global]`

初始化配置。

- `--global`，初始化全局配置，写入 `~/.lab-cli/config.yaml`
- 不带选项时，初始化项目配置，写入当前目录 `.labrc`

```bash
labcli init --global
labcli init
```

### `labcli doctor`

检查运行环境，诊断潜在问题。

```bash
labcli doctor
```

### `labcli quickstart`

交互式引导完成项目初始化和首次同步。

```bash
labcli quickstart
```

### `labcli connect`

建立 SSH 连接，进入交互式 shell。

```bash
labcli connect
```

### `labcli sync [--dry-run] [--exclude <patterns...>]`

将本地代码同步到远程服务器，底层使用 rsync。

- `--dry-run`，只预览，不实际传输
- `--exclude <patterns>`，追加排除规则

```bash
labcli sync
labcli sync --dry-run
labcli sync --exclude "*.log" "tmp/"
```

### `labcli watch [--no-initial-sync]`

监听文件变化，自动同步。

- `--no-initial-sync`，跳过启动时的初始全量同步

```bash
labcli watch
```

### `labcli setup [--skip-conda]`

在远程创建训练目录和 conda 环境。

- `--skip-conda`，只创建目录，不创建 conda 环境

```bash
labcli setup
labcli setup --skip-conda
```

### `labcli upload <localPath> [remotePath]`

上传文件或目录到远程服务器。

```bash
labcli upload ./data/dataset.zip
labcli upload ./data /home/user/training/data
```

### `labcli submit <script> [options]`

提交 Slurm 训练任务。

- `--partition <name>`，指定分区
- `--gpus <n>`，GPU 数量
- `--nodes <n>`，节点数量
- `--time <HH:MM:SS>`，时间限制
- `--name <jobName>`，作业名称
- `--output <path>`，stdout 日志路径
- `--error <path>`，stderr 日志路径
- `--sync`，提交前先同步代码
- `--dry-run`，只预览命令
- `--preset <name>`，使用预设资源配置
- `--guide`，交互式选择预设

```bash
labcli submit train.sh
labcli submit train.sh --partition gpu --gpus 4 --time 24:00:00
labcli submit train.sh --sync --name my_training
labcli submit train.sh --preset single-gpu
labcli submit train.sh --guide
```

### `labcli status [--job-id <id>] [--all]`

查看 Slurm 任务状态。

```bash
labcli status
labcli status --job-id 12345
labcli status --all
```

### `labcli logs [jobId] [-f] [--tail <n>]`

查看训练日志。

- `-f, --follow`，实时跟踪日志
- `--tail <n>`，显示最后 n 行，默认 50
- `--error`，查看 stderr 日志

```bash
labcli logs 12345
labcli logs 12345 --follow
labcli logs 12345 --tail 100
```

### `labcli cancel [jobId] [--all]`

取消 Slurm 任务。

```bash
labcli cancel 12345
labcli cancel --all
```

### `labcli resources [--node <name>] [--partition <name>]`

查看集群资源和节点状态。

```bash
labcli resources
labcli resources --partition gpu
labcli resources --node node01
```

## 配置文件

### 全局配置 `~/.lab-cli/config.yaml`

参见 [`config.example.yaml`](./config.example.yaml) 获取带注释的完整示例。

```yaml
# LabCLI 全局配置示例文件
# 将此文件复制到 ~/.lab-cli/config.yaml 并填入实际的服务器信息
# 或运行 `labcli init --global` 进行交互式初始化

# 服务器地址，必填，可以是地址或域名
host: your-server-host

# SSH 端口，可选，默认 22
port: 22

# 服务器用户名，必填
username: yourname

# 认证方式，必填，可选值为 key 或 password
authMethod: key

# 私钥路径，可选，当 authMethod 为 key 时使用
privateKeyPath: ~/.ssh/id_rsa

# 默认远程路径，必填
defaultRemotePath: /home/yourname

# 默认 Slurm 分区，可选
defaultPartition: gpu
```

### 项目配置 `.labrc`

参见 [`.labrc.example`](./.labrc.example) 获取带注释的完整示例。

```yaml
# LabCLI 项目配置示例文件
# 将此文件复制到项目根目录并重命名为 .labrc 或 .labrc.yaml
# 或运行 `labcli init` 进行交互式初始化

# 项目名称，必填
name: my-training-project

# 远程路径，必填
remotePath: /home/yourname/projects/my-project

# 同步排除规则，可选
syncExclude:
  - node_modules
  - .git
  - __pycache__
  - "*.pyc"
  - .env
  - dist
  - coverage
  - .sisyphus

# Slurm 分区，可选
slurmPartition: gpu

# GPU 数量，可选
slurmGpus: 4

# 节点数量，可选
slurmNodes: 1

# Conda 环境名称，可选
condaEnvName: myenv

# Python 版本，可选，默认 3.10
condaPythonVersion: "3.10"
```

## 常见问题

**Q: 连接时提示 Authentication failed？**

A: 检查 `~/.lab-cli/config.yaml` 里的认证方式和私钥路径，确认服务器用户名也正确。

**Q: rsync 不可用怎么办？**

A: `upload` 会自动降级到 SFTP 传输；`sync` 需要本地安装 rsync。

**Q: Slurm 的 `--json` 不可用怎么办？**

A: 工具会自动检测版本，旧版本会降级为文本格式解析。

**Q: watch 命令会不会很耗资源？**

A: 默认使用文件事件监听，不是轮询，CPU 占用很低。

**Q: 如何更新配置？**

A: 重新运行 `labcli init --global` 或 `labcli init`，按提示覆盖即可。

**Q: 环境诊断怎么用？**

A: 直接运行 `labcli doctor`。

**Q: 如何快速上手？**

A: 直接运行 `labcli quickstart`。

**Q: 有没有预设的资源配置？**

A: 可以用 `labcli submit --preset single-gpu`，或者运行 `labcli submit --guide` 交互选择。
