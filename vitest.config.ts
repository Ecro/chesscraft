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
      // The jsdom screen tests render the whole record form, and the content set
      // roughly doubled with PLAN-preset-content-expansion — 12 pieces, 24 skill
      // cards and 121 catalogue entries where there were 26 and 37. Four of them
      // then failed the DEFAULT 5s under a full parallel run while passing in
      // isolation, which reads as "the screen broke" and is really scheduling.
      // Raised rather than hidden: a test that exceeds this is slow for a reason
      // worth finding, not for load.
      testTimeout: 20_000,
      // e2e/ belongs to Playwright, not Vitest.
      //
      // `tests/build/` asserts over `dist/`, which does not exist on a fresh
      // checkout — leaving it here would make `npm run test` fail for anyone
      // who has not just built. It runs from `vitest.build.config.ts` behind
      // `npm run test:build`, which `verify` orders after `build`.
      //
      // `tests/strength/` plays hundreds of full matches to measure the AI
      // difficulty ladder (AC-005). It is tens of minutes at the reduced
      // surrogate budget, so it runs from `vitest.strength.config.ts` behind
      // `npm run test:strength`. The sign-only smoke that guards against a
      // collapsed ladder stays in the default run.
      exclude: ['e2e/**', 'tests/build/**', 'tests/strength/**', 'node_modules/**'],
    },
  }),
)
