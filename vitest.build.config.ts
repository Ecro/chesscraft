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
 *
 * `verify` runs this LAST, after `e2e:pwa`, and the order is load-bearing rather than
 * arbitrary. `playwright.pwa.config.ts` serves a real build and rebuilds `dist/` from
 * scratch to do it, so a `test:build` placed earlier asserts against a `dist/` that a
 * later step then overwrites. That is harmless when the two builds are identical and
 * silently wrong when they are not — and CI publishes whatever `dist/` survives the run
 * (`.github/workflows/deploy.yml` uploads it rather than rebuilding). Running last is what
 * makes "the bytes that shipped are the bytes this asserted" true by construction instead
 * of by an unstated determinism assumption.
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
