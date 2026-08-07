import { defineConfig, mergeConfig } from 'vitest/config'
import viteConfig from './vite.config.ts'

/**
 * The difficulty-ladder tournament (AC-005, ADR-011).
 *
 * Separate from `vitest.config.ts` for the same reason `vitest.build.config.ts`
 * is: a precondition the rest of the suite does not share. Here it is runtime —
 * hundreds of full matches, tens of minutes even at the reduced surrogate node
 * budget, and hours if it ever ran at the production one.
 *
 * Putting it in the default run would make `npm run test` unusable, and making
 * it sample fewer games until it fit would leave the gate too underpowered to
 * detect the ladder inversion it exists for. So it is opt-in via
 * `npm run test:strength`, and `npm run verify` keeps the sign-only smoke in
 * `tests/engine/ai-strength-smoke.test.ts` instead.
 */
export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      globals: true,
      environment: 'node',
      include: ['tests/strength/**/*.test.ts'],
    },
  }),
)
