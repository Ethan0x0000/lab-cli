import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    passWithNoTests: true,
    exclude: ['node_modules', 'dist', 'coverage', '.worktrees'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      exclude: ['node_modules', 'dist', 'coverage', '**/__tests__/**', '.worktrees'],
    },
  },
})
