# AGENTS.md

CLI tool for automating Slurm training cluster workflows. TypeScript, ESM, Commander.js.

## Commands

```bash
npm run build          # tsup → dist/cli.js
npm test               # vitest run (all tests)
npm run test:watch     # vitest watch mode
npm run dev            # tsx src/cli.ts (runs unbuilt source directly)
npm run lint           # eslint src

# Single test file
npx vitest run src/config/__tests__/config.test.ts

# Single test by name
npx vitest run -t "mergeConfig"
```

`npm install` auto-builds via `prepare` hook, so `npm link` works immediately after install.

## Architecture

- **Entry point**: `src/cli.ts` — creates Commander program, registers 13 commands, calls `parseAsync`. `src/index.ts` is empty — not the entry.
- **Build output**: `dist/cli.js` — single ESM bundle with shebang (tsup config in `tsup.config.ts`)
- **Commands**: `src/commands/*.ts` — each exports `registerXxxCommand(program: Command)`. Flat hierarchy, no subcommands.
- **Config**: `src/config/` — Zod schemas (`schema.ts`), cosmiconfig loader (`loader.ts`), YAML writer (`writer.ts`)
  - Global config: `~/.lab-cli/config.yaml`
  - Project config: `.labrc` / `.labrc.yaml` / `.labrc.yml` (cosmiconfig module name: `lab`)
  - `getConfig()` merges both; most commands call this
- **SSH**: `src/ssh/` — `SSHClient` wraps ssh2, `SSHManager` pools connections. Singleton `sshManager` with process exit/SIGINT cleanup.
- **Slurm**: `src/slurm/` — shell command builders, JSON + text fallback parsers, JSON support detector with caching
- **Transfer**: `src/transfer/` — rsync spawn wrapper, SFTP fallback for upload
- **Remote**: `src/remote/` — `RemoteExecution` interface with `SSHExecution`, `LocalExecution`, `MockExecution` implementations for abstracting remote command execution
- **Job**: `src/job/` — `JobMetadata` and `JobPath` for job directory structure and metadata management
- **Types**: `src/types/` — interfaces for config, SSH, Slurm. Re-exported from `types/index.ts`.

## Conventions

- **ESM only** (`"type": "module"`). All imports **must** use `.js` extension: `import { foo } from './bar.js'`
- **Strict TypeScript**: ES2022 target, NodeNext module resolution
- **Adding a command**: create `src/commands/foo.ts` exporting `registerFooCommand(program: Command)`, then register it in `src/cli.ts`
- **Barrel exports**: Each domain module (`config`, `ssh`, `slurm`, `transfer`, `remote`) has an `index.ts` that re-exports public APIs
- **Error messages and UI strings are in Chinese**
- Async command actions use `ora` spinners and `chalk` coloring
- Errors caught in command actions → `console.error` + `process.exit(1)`
- No abstract base classes. Shared logic lives in domain modules (`config`, `ssh`, `slurm`, `transfer`)

## Testing

- Tests live in `__tests__/` directories within each module, plus `src/cli.test.ts` and `src/package.test.ts` at src root
- **Mocking pattern**: `vi.mock('module-path')` at top of file with inline factory. Chalk and ora are typically mocked to passthrough strings.
- Config tests create temp directories with `mkdtempSync` and clean up in `afterEach`
- Tests that mock `os.homedir()` use `vi.doMock('os', ...)` + `vi.resetModules()` and re-import modules dynamically
- Command tests mock `process.exit` and `process.cwd`, catch the thrown exit as an assertion
- `cli.test.ts` is integration-style: spawns `npx tsx src/cli.ts` via `execSync`
- vitest config has `passWithNoTests: true`

## Lint

- ESLint with `@typescript-eslint/recommended`
- `no-console: warn` — expected to fire in command files (CLI needs console output)
- `@typescript-eslint/no-explicit-any: warn`

## Gotchas

- `rsync` must be installed on the host for `sync` command; `upload` falls back to SFTP when rsync is unavailable
- ssh2 library — not node-ssh. Connection config reads private key files directly.
- Slurm integration auto-detects `--json` flag support and falls back to text format parsing. The detection result is cached in-memory (`detector.ts`).
- `npm run build` must succeed before `npm link` or `npm pack` — the bin target is `dist/cli.js`
