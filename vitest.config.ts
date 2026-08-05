import { defineConfig, mergeConfig } from 'vitest/config'
import viteConfig from './vite.config.ts'

// The engine is framework-free (SPEC constraint), so the default environment is
// `node`. UI tests, when they arrive, opt into jsdom per-file with
// `// @vitest-environment jsdom`.
export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      globals: true,
      environment: 'node',
      include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
      // e2e/ belongs to Playwright, not Vitest.
      exclude: ['e2e/**', 'node_modules/**'],
    },
  }),
)
