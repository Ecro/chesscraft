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
      // One `window` serves a whole jsdom test file, so the URL a test leaves behind is
      // the URL the next one starts on — and `App` now reads it. See the file's header.
      setupFiles: ['tests/helpers/fresh-url.ts'],
      include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
      // e2e/ belongs to Playwright, not Vitest.
      //
      // `tests/build/` asserts over `dist/`, which does not exist on a fresh
      // checkout — leaving it here would make `npm run test` fail for anyone
      // who has not just built. It runs from `vitest.build.config.ts` behind
      // `npm run test:build`, which `verify` orders after `build`.
      exclude: ['e2e/**', 'tests/build/**', 'node_modules/**'],
    },
  }),
)
