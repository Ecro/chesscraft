import { defineConfig, devices } from '@playwright/test'

// Portrait mobile web is the primary layout target (PLAN Constraints), so the
// default project is a portrait viewport rather than a desktop one.
/*
 * The dev-server port, overridable.
 *
 * Hard-coding it made the suite unrunnable whenever another checkout of this
 * repo already held 5173 — which the per-task worktree workflow makes routine,
 * since two tasks in two worktrees are two dev servers. Playwright then tries
 * to start its own, fails with EADDRINUSE, and the run dies before a single
 * test executes. The default is unchanged, so `npm run e2e` behaves as before;
 * a parallel worktree passes `E2E_PORT`.
 */
const PORT = process.env.E2E_PORT ?? '5173'
const ORIGIN = `http://127.0.0.1:${PORT}`

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'line' : 'list',
  use: {
    baseURL: ORIGIN,
    trace: 'on-first-retry',
    // Phase 5 put a transition on the board, and 41 specs drive it by clicking.
    // Reduced motion is the default so they are not racing an animation — with
    // ONE deliberate exception: `e2e/motion.spec.ts` opts back in. Without that
    // exception this setting would stabilise the suite while guaranteeing the
    // animation path is never executed by any test, which is
    // `[fail:test] test-setup-hides-the-failure-path`, already recorded here
    // after a clipboard spec granted the permission whose absence was the risk.
    contextOptions: { reducedMotion: 'reduce' },
  },
  projects: [
    {
      name: 'mobile-portrait',
      use: { ...devices['Pixel 7'] },
    },
  ],
  webServer: {
    command: `npm run dev -- --port ${PORT} --strictPort`,
    url: ORIGIN,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
})
