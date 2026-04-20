# lab-cli

> 内网训练集群全流程自动化 CLI 工具

把手动的 6 步训练工作流，收敛成一套命令行操作，面向 Slurm 集群使用。

## 安装

### 从源码仓库安装（推荐给开发或本地试用）

```bash
git clone <repository>
cd lab-cli
npm install
npm link
```

`npm install` 会通过 `prepare` 自动构建 `dist/cli.js`，所以紧接着执行 `npm link` 就能把 `lab-cli` 暴露到当前用户环境。

如果你的 npm 全局目录是系统路径（例如 `/usr/lib/node_modules`）并且当前用户没有写权限，可以把当前源码目录直接安装到用户级 prefix：

```bash
npm install -g --prefix "$HOME/.local" .
"$HOME/.local/bin/lab-cli" --help
```

如果你希望直接用 `lab-cli` 命令名调用，再把 `$HOME/.local/bin` 加入 `PATH` 即可。

### 验证打包产物

```bash
npm pack
npm install -g --prefix "$HOME/.local/share/lab-cli-test" ./lab-cli-0.1.0.tgz
"$HOME/.local/share/lab-cli-test/bin/lab-cli" --help
```

如果你只是想在当前仓库里开发和试用，使用上面的源码安装流程即可；只有在验证打包结果或准备发布时，才需要走 `npm pack` 这条路径。

## 快速开始

```bash
# 1. 初始化全局配置，填写服务器信息
lab-cli init --global

# 2. 初始化项目配置
lab-cli init

# 3. 创建远程目录和 conda 环境
lab-cli setup

# 4. 同步代码到远程服务器
lab-cli sync

# 5. 提交训练任务
lab-cli submit train.sh

# 6. 查看训练日志
lab-cli logs <jobId>
```

## 命令参考

### `lab-cli init [--global]`

初始化配置。

- `--global`，初始化全局配置，写入 `~/.lab-cli/config.yaml`
- 不带选项时，初始化项目配置，写入当前目录 `.labrc`

```bash
lab-cli init --global
lab-cli init
```

### `lab-cli connect`

建立 SSH 连接，进入交互式 shell。

```bash
lab-cli connect
```

### `lab-cli sync [--dry-run] [--exclude <patterns...>]`

将本地代码同步到远程服务器，底层使用 rsync。

- `--dry-run`，只预览，不实际传输
- `--exclude <patterns>`，追加排除规则

```bash
lab-cli sync
lab-cli sync --dry-run
lab-cli sync --exclude "*.log" "tmp/"
```

### `lab-cli watch [--no-initial-sync]`

监听文件变化，自动同步。

- `--no-initial-sync`，跳过启动时的初始全量同步

```bash
lab-cli watch
```

### `lab-cli setup [--skip-conda]`

在远程创建训练目录和 conda 环境。

- `--skip-conda`，只创建目录，不创建 conda 环境

```bash
lab-cli setup
lab-cli setup --skip-conda
```

### `lab-cli upload <localPath> [remotePath]`

上传文件或目录到远程服务器。

```bash
lab-cli upload ./data/dataset.zip
lab-cli upload ./data /home/user/training/data
```

### `lab-cli submit <script> [options]`

提交 Slurm 训练任务。

- `--partition <name>`，指定分区
- `--gpus <n>`，GPU 数量
- `--nodes <n>`，节点数量
- `--time <HH:MM:SS>`，时间限制
- `--name <jobName>`，作业名称
- `--sync`，提交前先同步代码
- `--dry-run`，只预览命令

```bash
lab-cli submit train.sh
lab-cli submit train.sh --partition gpu --gpus 4 --time 24:00:00
lab-cli submit train.sh --sync --name my_training
```

### `lab-cli status [--job-id <id>] [--all]`

查看 Slurm 任务状态。

```bash
lab-cli status
lab-cli status --job-id 12345
lab-cli status --all
```

### `lab-cli logs [jobId] [-f] [--tail <n>]`

查看训练日志。

- `-f, --follow`，实时跟踪日志
- `--tail <n>`，显示最后 n 行，默认 50
- `--error`，查看 stderr 日志

```bash
lab-cli logs 12345
lab-cli logs 12345 --follow
lab-cli logs 12345 --tail 100
```

### `lab-cli cancel [jobId] [--all]`

取消 Slurm 任务。

```bash
lab-cli cancel 12345
lab-cli cancel --all
```

### `lab-cli resources [--node <name>] [--partition <name>]`

查看集群资源和节点状态。

```bash
lab-cli resources
lab-cli resources --partition gpu
lab-cli resources --node node01
```

## 配置文件

### 全局配置 `~/.lab-cli/config.yaml`

```yaml
host: 10.0.0.1
port: 22
username: yourname
authMethod: key
privateKeyPath: ~/.ssh/id_rsa
defaultRemotePath: /home/yourname
defaultPartition: gpu
```

### 项目配置 `.labrc`

放在项目根目录，用来描述当前项目的默认同步和 Slurm 参数。

```yaml
name: my-training-project
remotePath: /home/yourname/projects/my-project
condaEnvName: myenv
condaPythonVersion: "3.10"
slurmPartition: gpu
slurmGpus: 4
syncExclude:
  - node_modules
  - .git
  - __pycache__
  - "*.pyc"
  - dist
  - .sisyphus
```

## 常见问题

**Q: 连接时提示 Authentication failed？**

A: 检查 `~/.lab-cli/config.yaml` 里的认证方式和私钥路径，确认服务器用户名也正确。

**Q: rsync 不可用怎么办？**

A: `sync` 和 `upload` 会自动降级到 SFTP 传输。

**Q: Slurm 的 `--json` 不可用怎么办？**

A: 工具会自动检测版本，旧版本会降级为文本格式解析。

**Q: watch 命令会不会很耗资源？**

A: 默认使用文件事件监听，不是轮询，CPU 占用很低。

**Q: 如何更新配置？**

A: 重新运行 `lab-cli init --global` 或 `lab-cli init`，按提示覆盖即可。
