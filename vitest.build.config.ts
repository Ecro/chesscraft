import { defineConfig, mergeConfig } from 'vitest/config'
import viteConfig from './vite.config.ts'

/**
 * Tests that assert over the BUILD OUTPUT, not over source.
 *
 * Separate from `vitest.config.ts` because these have a precondition the rest
 * of the suite does not: `dist/` must exist. Including them in the default run
 * would fail `npm run test` on a fresh checkout, and making them skip when
 * `dist/` is missing would be worse — a check that silently disappears is how
 * the thing it guards ships broken. So they are opt-in via `npm run test:build`,
 * and `npm run verify` is where `build` and this are ordered.
 */
export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      globals: true,
      environment: 'node',
      include: ['tests/build/**/*.test.ts'],
    },
  }),
)
