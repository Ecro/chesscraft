import { defineConfig, devices } from '@playwright/test'

/**
 * A second config, because a service worker that precaches THE BUILD cannot be
 * exercised against the dev server.
 *
 * The main config's `webServer` runs `npm run dev`, which serves unbundled ES
 * modules that no precache manifest can name — every asset the SW was told to
 * cache is a hashed filename that only exists after `vite build`. Pointing the
 * offline specs at the dev server would produce a test that either passes for
 * the wrong reason (the dev server's own module graph is still reachable) or
 * fails for one (nothing matches the manifest). So these specs get their own
 * runner against `vite preview` over a real build.
 *
 * `e2e-pwa/` is a separate directory rather than a filter on `e2e/`: the main
 * suite's 64 specs have no business running twice, and a directory split makes
 * "which config owns this spec" a fact about where the file lives.
 *
 * Reduced motion is NOT set here. The main config sets it to stop 60-odd specs
 * racing the board animation; nothing in this directory clicks a piece, and
 * inheriting the setting would quietly widen what "the app works offline" was
 * checked under.
 */
export default defineConfig({
  testDir: './e2e-pwa',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? 'line' : 'list',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'on-first-retry',
  },
  projects: [{ name: 'mobile-portrait', use: { ...devices['Pixel 7'] } }],
  webServer: {
    // `--strictPort` so a stale server on 4173 fails loudly instead of silently
    // serving a build from a previous run — which is the exact confusion a
    // stale-cache test cannot afford.
    command: 'npm run build && npm run preview -- --port 4173 --strictPort',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: false,
    timeout: 120_000,
  },
})
