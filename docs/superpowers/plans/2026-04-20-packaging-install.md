# Packaging and Installation Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `lab-cli` install cleanly from a source checkout and from a packed tarball, with package metadata that matches its real CLI-only shape.

**Architecture:** Keep the build centered on `src/cli.ts`, remove the misleading library entry, and teach npm to build on `prepare` so `npm install` prepares `npm link`. Protect the behavior with a small metadata regression test and verify both link-based and tarball-based installation in the current user environment.

**Tech Stack:** Node.js 18+, npm, TypeScript, tsup, Vitest

---

### Task 1: Add a failing regression test for package metadata

**Files:**
- Create: `src/package.test.ts`
- Modify: `package.json`

- [ ] **Step 1: Write the failing test**

```ts
import { readFileSync } from 'fs'
import { join } from 'path'
import { describe, expect, it } from 'vitest'

type PackageJson = {
  bin?: Record<string, string>
  files?: string[]
  scripts?: Record<string, string>
  engines?: Record<string, string>
  main?: string
}

const packageJson = JSON.parse(
  readFileSync(join(process.cwd(), 'package.json'), 'utf-8'),
) as PackageJson

describe('package metadata', () => {
  it('builds the CLI during prepare so source installs are link-ready', () => {
    expect(packageJson.scripts?.prepare).toBe('npm run build')
  })

  it('publishes only runtime artifacts and docs', () => {
    expect(packageJson.files).toEqual(expect.arrayContaining(['dist', 'README.md']))
  })

  it('exposes only the built CLI entry instead of a library main', () => {
    expect(packageJson.bin).toEqual({ lab-cli: './dist/cli.js' })
    expect(packageJson.main).toBeUndefined()
  })

  it('declares the supported Node.js runtime', () => {
    expect(packageJson.engines?.node).toBe('>=18')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/package.test.ts`
Expected: FAIL because `prepare`, `files`, and `engines` are missing and `main` is still present.

- [ ] **Step 3: Write the minimal implementation**

Update `package.json` so the test can pass:

```json
{
  "type": "module",
  "bin": {
    "lab-cli": "./dist/cli.js"
  },
  "files": ["dist", "README.md"],
  "engines": {
    "node": ">=18"
  },
  "scripts": {
    "prepare": "npm run build",
    "build": "tsup",
    "test": "vitest run"
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/package.test.ts`
Expected: PASS

### Task 2: Rewrite installation docs around the real flow

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Update the source-install path**

Replace the install section with a source-checkout flow that explains automatic build-on-install:

```md
## 安装

### 从源码仓库安装（推荐给开发/本地试用）

```bash
git clone <repository>
cd lab-cli
npm install
npm link
```

`npm install` 会通过 `prepare` 自动构建 `dist/cli.js`，因此随后执行 `npm link` 即可直接得到可用的 `lab-cli` 命令。
```

- [ ] **Step 2: Add a package-verification path**

Document tarball verification explicitly:

```md
### 验证打包产物

```bash
npm pack
npm install -g --prefix "$HOME/.local/share/lab-cli-test" ./lab-cli-<version>.tgz
"$HOME/.local/share/lab-cli-test/bin/lab-cli" --help
```
```

- [ ] **Step 3: Re-read README for consistency**

Confirm the install section no longer mentions a manual `npm run build` prerequisite and that the later quick-start steps still start with `lab-cli init --global`.

### Task 3: Verify build, pack, and current-user installation

**Files:**
- Verify: `package.json`
- Verify: `README.md`
- Verify artifact: `dist/cli.js`

- [ ] **Step 1: Run focused and full tests**

Run: `npx vitest run src/package.test.ts`
Expected: PASS

Run: `npm test`
Expected: PASS

- [ ] **Step 2: Run the build and inspect the packaged tarball**

Run: `npm run build`
Expected: PASS and `dist/cli.js` exists

Run: `npm pack --json`
Expected: PASS and the tarball file list is centered on `dist/` plus README/package metadata

- [ ] **Step 3: Verify source-install behavior in the current user environment**

Run: `npm link`
Expected: PASS

Run: `lab-cli --version`
Expected: `0.1.0`

- [ ] **Step 4: Verify tarball installation with a user-owned prefix**

Run: `npm install -g --prefix "$HOME/.local/share/lab-cli-pack-test" ./lab-cli-0.1.0.tgz`
Expected: PASS

Run: `"$HOME/.local/share/lab-cli-pack-test/bin/lab-cli" --help`
Expected: PASS

- [ ] **Step 5: Clean up temporary install artifacts**

Run: `npm unlink -g lab-cli`

Run: `rm -rf "$HOME/.local/share/lab-cli-pack-test" ./lab-cli-0.1.0.tgz`

Expected: Local verification artifacts removed while repository changes remain intact.
