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
    /*
     * Desktop, as a PROJECT rather than as per-describe overrides.
     *
     * The distinction is the whole point. `e2e/layout.spec.ts` had a 1440x900 describe
     * block, which meant desktop coverage was three tests that someone remembered to opt
     * in — Home, Lobby, the editor, the dex, the result screen and every sheet had none,
     * and 1920 had none at all. A project makes the wide viewport a default the whole
     * suite runs under, so a screen added later is covered by not being excluded rather
     * than by being remembered.
     *
     * 1280x900 is the floor of the desktop band (ADR-006) rather than a comfortable
     * middle: bugs live at the edge of a range, and the specs that care about a
     * particular width state it themselves.
     */
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 900 } },
    },
  ],
  webServer: {
    /*
     * `--host 127.0.0.1`, matching `ORIGIN` exactly rather than relying on a name.
     *
     * Vite's default host is `localhost`, and `localhost` is a NAME — on a machine whose
     * resolver answers `::1` first, the server binds to IPv6 only while Playwright polls
     * the IPv4 literal above and never connects. From outside the two are
     * indistinguishable from a server that has not finished starting: the process is
     * alive, the port never answers, and the run ends on `Timed out waiting … from
     * config.webServer` with no error from Vite at all.
     *
     * That is exactly what two GitHub runs did, and raising the bound to 180s did not
     * change it — which is what ruled out a slow start and left the address. Binding to
     * the same literal Playwright asks for removes the resolver from the question.
     */
    command: `npm run dev -- --host 127.0.0.1 --port ${PORT} --strictPort`,
    url: ORIGIN,
    reuseExistingServer: !process.env.CI,
    /*
     * 60s locally, 180s in CI.
     *
     * The dev server starts in well under a second on a developer machine and did not
     * become ready inside 60s on a GitHub runner — twice, on unrelated commits, with the
     * suite reporting `Timed out waiting 60000ms from config.webServer` and Vite having
     * printed its config banner but never its ready line.
     *
     * Two explanations fit that evidence: a cold start slower than the bound (two vCPUs,
     * no optimizer cache, immediately after the unit suite has saturated the machine), or
     * a server that IS listening somewhere Playwright is not polling. Raising only this
     * number tells them apart — if CI goes green, it was the former and this is the fix;
     * if it still times out at 180s, it is the latter and the binding is the thing to
     * change. One variable, because fixing both at once would leave neither confirmed.
     *
     * The local bound stays at 60s: a dev server that takes a minute on a laptop is a
     * problem worth being told about, and inheriting CI's patience would hide it.
     */
    timeout: process.env.CI ? 180_000 : 60_000,
  },
})
