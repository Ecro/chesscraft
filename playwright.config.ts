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
    /*
     * Every context starts as a browser that has already been onboarded.
     *
     * The app opens on its onboarding screen for anyone whose storage has no
     * record of a previous visit, so without this every spec in the suite would
     * begin one tap away from the screen it is about — and each would have to
     * remember to dismiss it, which is the kind of setup that is forgotten in
     * exactly one spec and then debugged for an hour.
     *
     * `e2e/ftue.spec.ts` clears the flag itself, which is the same shape as
     * `motion.spec.ts` opting back into animation: the suite-wide default must
     * never be the reason a path is untested.
     *
     * Built from `ORIGIN` rather than read from a committed JSON file, and that
     * is not tidiness. `storageState` is keyed BY ORIGIN, so a file pinning
     * `http://127.0.0.1:5173` silently applies to nothing the moment `E2E_PORT`
     * moves the server — which is the whole reason that variable exists (two
     * worktrees, two dev servers). The failure is maximally confusing: every
     * spec lands on the onboarding screen and times out looking for a control
     * one tap away, with nothing pointing at the port.
     */
    storageState: {
      cookies: [],
      origins: [{ origin: ORIGIN, localStorage: [{ name: 'strange-chess.coach.seen.v1', value: '1' }] }],
    },
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
