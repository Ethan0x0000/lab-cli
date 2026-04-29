---
name: using-labcli
description: Use when working in LabCLI, invoking labcli for Slurm training workflows, configuring global or project settings, syncing code, submitting jobs, checking status/logs/resources, or verifying this TypeScript Commander CLI.
---

# Using LabCLI

## Overview

LabCLI automates Slurm training-cluster workflows: configure SSH/project settings, sync code, set up remote directories, submit jobs, and inspect Slurm status/logs/resources. Treat `src/cli.ts`, `README.md`, `config.example.yaml`, and `.labrc.example` as the authoritative starting points before calling commands.

## When to Use

Use this skill when an agent needs to:

- operate `labcli` safely for first-time setup or daily training workflows
- inspect or change LabCLI commands, config loading, Slurm integration, SSH, or transfer code
- choose safe flags such as `--dry-run`, `--skip-conda`, `--preset`, `--job-id`, `--tail`, or `--error`
- verify packaging, tests, build output, or command registration for this repo

Do not use it for unrelated Slurm tools or generic SSH troubleshooting outside LabCLI.

## Quick Reference

| Task | Command or file |
| --- | --- |
| CLI entry | `src/cli.ts` registers commands; `src/index.ts` is not the entry |
| Built binary | `dist/cli.js`; package bin is `labcli` |
| Develop locally | `npm run dev -- --help` or `npx tsx src/cli.ts --help` |
| Build | `npm run build` |
| Test | `npm test`; single file: `npx vitest run path/to/test.ts` |
| Lint | `npm run lint` |
| Global config | `~/.lab-cli/config.yaml`; template: `config.example.yaml` |
| Project config | `.labrc`, `.labrc.yaml`, `.labrc.yml`; template: `.labrc.example` |
| First-time guided setup | `labcli quickstart`, then verify with `labcli doctor` and run `labcli setup` if conda/env setup is still needed |
| Safe sync preview | `labcli sync --dry-run` |
| Safe submit preview | `labcli submit train.sh --dry-run` |
| Daily loop | `labcli sync` -> `labcli submit train.sh` -> `labcli status` -> `labcli logs <jobId>` |

## Command Surface

`src/cli.ts` registers 13 commands:

- `init [--global]`: writes global config or project `.labrc`; prompts before overwriting
- `quickstart`: guided onboarding; code creates the remote directory, but still points users to `labcli setup` for conda setup
- `doctor`: checks config, local tools, SSH, and Slurm readiness
- `connect`: opens an SSH shell using merged config
- `sync [--dry-run] [--exclude <patterns...>]`: rsync-backed project sync from `process.cwd()` to `remotePath`
- `watch [--no-initial-sync]`: watches file changes and triggers sync with debounce
- `setup [--skip-conda]`: creates remote training directory and optionally conda env
- `upload <localPath> [remotePath]`: uploads files/directories; small files use SFTP, directories/large files use rsync
- `submit <script>` with `--partition`, `--gpus`, `--nodes`, `--time`, `--name`, `--output`, `--error`, `--preset`, `--guide`, `--sync`, `--dry-run`
- `status [--job-id <id>] [--all]`: queries `squeue`, JSON first, text fallback
- `logs [jobId] [-f|--follow] [--tail <n>] [--output] [--error]`: resolves stdout/stderr path with `scontrol show job`, then tails it
- `cancel [jobId] [--all]`: cancels one job or current user's jobs
- `resources [--node <name>] [--partition <name>]`: queries node/GPU resources, JSON first, text fallback

## Safe Operating Workflow

1. Inspect `config.example.yaml`, `.labrc.example`, and existing config before running commands that connect or write files.
2. For a new machine, run `labcli init --global`, then `labcli doctor`.
3. For a new project, run `labcli init`, inspect `.labrc`, then run `labcli setup` or `labcli setup --skip-conda`.
4. Before real transfer, run `labcli sync --dry-run`.
5. Before real Slurm submission, run `labcli submit train.sh --dry-run`; then submit with explicit flags or a preset (`debug`, `single-gpu`, `multi-gpu`, `full-node`).
6. After submission, use `labcli status`, `labcli status --job-id <id>`, `labcli logs <jobId> --tail 100`, and `labcli logs <jobId> --error`.

## Repository Map for Code Work

| Area | Paths | Notes |
| --- | --- | --- |
| CLI registration | `src/cli.ts`, `src/commands/*.ts` | ESM imports use `.js` extensions |
| Config | `src/config/schema.ts`, `loader.ts`, `writer.ts` | Zod validation, cosmiconfig module name `lab`, YAML writing |
| SSH | `src/ssh/client.ts`, `manager.ts` | Uses `ssh2`, not `node-ssh`; manager caches connections and cleans up on exit/SIGINT |
| Slurm | `src/slurm/commands.ts`, `parser.ts`, `detector.ts`, `presets.ts` | JSON support detection is cached; parsers fall back to text |
| Transfer | `src/transfer/rsync.ts`, `sftp.ts` | `sync` requires local rsync; upload has SFTP path only for small files |
| Remote | `src/remote/types.ts`, `ssh-execution.ts`, `local-execution.ts`, `mock-execution.ts` | `RemoteExecution` interface with SSH, local, and mock implementations |
| Job | `src/job/metadata.ts`, `path.ts` | `JobMetadata` and `JobPath` for job directory structure and metadata management |
| Utils | `src/utils/checks.ts`, `ssh-helpers.ts`, `shell.ts`, `errors.ts` | Doctor checks, SSH option construction, tilde expansion/shell quoting, CLI error handling |
| Tests | `src/**/__tests__/*.test.ts`, `src/cli.test.ts`, `src/package.test.ts` | Commands use Vitest mocks for `ora`, `chalk`, SSH, config, transfer |

## Gotchas

- Error messages and CLI UI strings are Chinese by convention.
- `sync` is rsync-backed and prints a local-rsync-install hint on failure; do not promise SFTP fallback for `sync`.
- `README.md` says `quickstart` completes initialization and first sync, but code still tells users to run `labcli setup` afterward for conda environment setup.
- `src/cli.test.ts` spawns the CLI via `execSync` for integration-level verification.
- Config is merged from global and project sources; most commands call `getConfig()` before action.
- Never add `as any`, `@ts-ignore`, or `@ts-expect-error` when modifying TypeScript here.

## Verification Checklist

When changing LabCLI code or this skill:

1. Run `npm run lint` for source style checks.
2. Run targeted Vitest files for touched modules, for example `npx vitest run src/commands/__tests__/submit.test.ts`.
3. Run `npm test` for the full suite.
4. Run `npm run build` and confirm `dist/cli.js` builds successfully.
5. If command output changed, update `README.md` and relevant command tests together.
