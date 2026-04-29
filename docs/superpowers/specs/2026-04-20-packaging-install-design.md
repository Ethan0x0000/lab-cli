# lab-cli 打包与安装流程优化设计

> 在未收到额外偏好反馈前，本设计默认同时优化源码仓库安装体验与打包产物一致性。

## 目标

- 让 fresh clone 后的 `npm install` 为 `npm link` 准备好可执行产物，避免用户先链接后发现 `dist/cli.js` 不存在。
- 让 npm 打包产物只包含运行 CLI 所需的文件，减少发布噪音并提高可预期性。
- 让包元数据表达真实意图：这是一个 CLI 包，而不是一个带稳定库入口的 SDK。
- 在当前用户环境完成实际安装验证，而不只停留在静态配置修正。

## 当前问题

1. `README.md` 声称 `npm install && npm link` 即可使用，但 `package.json` 的 `bin` 指向 `dist/cli.js`，当前没有任何 lifecycle hook 自动构建它。
2. `package.json` 声明了 `main: dist/index.js`，但 `tsup.config.ts` 只构建 `src/cli.ts`；现有 `src/index.ts` 还是空模块，导致包语义不一致。
3. 仓库没有限制 npm 打包内容，发布时会依赖默认包含规则，难以保证产物边界稳定。
4. 当前安装文档只覆盖本地 link，用途和发布/打包验证路径都不够清晰。

## 备选方案

### 方案 A：只补 README 文档

在 README 中补上 `npm run build`。

- 优点：改动最小。
- 缺点：用户仍然必须记住额外步骤；仓库安装体验没有真正优化；包元数据不一致的问题仍存在。

### 方案 B：保留 `main`，新增 `index` 构建产物

让 `tsup` 同时构建 `src/cli.ts` 与 `src/index.ts`。

- 优点：能让 `main` 指向的文件真实存在。
- 缺点：会把一个本来并未设计成库的 CLI 项目伪装成库包；`src/index.ts` 仍没有稳定 API，维护负担上升。

### 方案 C（采用）：把包收敛为 CLI-only，并补齐自动构建与打包边界

核心动作：去掉误导性的 `main`，在 `package.json` 中增加 `prepare`、`files`、`engines` 等元数据，保留 `bin -> dist/cli.js` 作为唯一入口，并重写 README 的安装说明与验证流程。

- 优点：语义最清晰，安装链路最短，未来 `npm pack` / 发布产物也更稳定。
- 缺点：如果未来要把项目扩展成可导入的库，需要单独设计公开 API。

## 设计方案

### 1. 包语义

- 将 `lab-cli` 明确定位为 CLI 包。
- 删除无实际意义的 `main` 声明，避免声明一个并不存在或不稳定的库入口。
- 保留 `bin.lab-cli = ./dist/cli.js` 作为唯一用户入口。
- 增加 `engines.node >= 18`，与现有 Node 18 构建目标对齐，让安装时更早暴露环境不匹配问题。

### 2. 构建与打包流程

- 在 `package.json` 中增加 `prepare: npm run build`，使源码仓库执行 `npm install` 后自动构建 CLI 产物，直接支持随后执行 `npm link`。
- 增加 `files` 白名单，仅发布 `dist/` 与 README 等必要说明文件，避免把 `src/`、测试和本地杂项一并打包出去。
- 保持 `tsup` 继续只构建 `src/cli.ts`，不额外制造一个没有稳定 API 的 `index` 产物。

### 3. 回归保护

- 新增一个面向包元数据的轻量测试，锁定以下行为：
  - 存在 `prepare` 自动构建脚本。
  - 打包白名单包含 `dist` 与 README。
  - 包不再声明误导性的 `main` 字段。
  - `bin` 仍指向构建后的 CLI 入口。

### 4. 文档与安装路径

- README 安装部分拆成“源码仓库安装”和“打包安装验证”两条路径。
- 明确说明 `npm install` 会自动构建，随后 `npm link` 即可把 `lab-cli` 暴露到当前用户环境。
- 补充 `npm pack` + 用户级 prefix 安装的验证路径，用于确认真正的 tarball 也可用。

## 测试与验证

实现完成后，验证顺序如下：

1. 新增的包元数据测试先红后绿。
2. 运行相关测试与全量测试，确保配置变更未破坏现有 CLI 行为。
3. 运行 `npm run build`，确认 `dist/cli.js` 正常产出。
4. 运行 `npm pack`，检查 tarball 只包含预期文件。
5. 在当前用户环境执行 `npm link`，直接运行 `lab-cli --help` / `lab-cli --version`。
6. 使用用户级 `--prefix` 安装 tarball，并验证安装后的二进制可执行。

## 风险与边界

- `prepare` 会让本地 `npm install` 多一步构建，换来的好处是源码安装链路真正闭环；这比把构建责任留给用户更稳。
- 本次不设计可导入库 API；如果未来需要 SDK 形态，应单独新增稳定 `exports` 与对外入口。
- 当前任务不涉及发布到远程 npm registry，只验证本地打包和当前用户环境安装。
