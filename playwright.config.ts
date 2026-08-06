import { defineConfig, devices } from '@playwright/test'

// Portrait mobile web is the primary layout target (PLAN Constraints), so the
// default project is a portrait viewport rather than a desktop one.
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'line' : 'list',
  use: {
    baseURL: 'http://127.0.0.1:5173',
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
    command: 'npm run dev -- --port 5173 --strictPort',
    url: 'http://127.0.0.1:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
})
