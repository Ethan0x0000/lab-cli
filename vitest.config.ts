import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    passWithNoTests: true,
    coverage: {
      exclude: ['node_modules', 'dist', 'coverage'],
    },
  },
})
