import { chromium, type FullConfig } from '@playwright/test'

/**
 * Pull the app's module graph through Vite once, before any worker starts.
 *
 * ## The failure this removes
 *
 * The suite ran flaky at the default worker count: one or two specs failed per
 * run, a DIFFERENT pair each time, always at a navigation click and always in
 * the `useSliceContent` → editor path, and every one passed in isolation. That
 * is the signature this config already records for `mobile-webkit` — "the
 * failures land on whichever test happened to be long, a different one each
 * run" — and the remedy there was a longer budget for that project.
 *
 * It is NOT the same cause here, and the difference is measured rather than
 * argued. Two runs at `--workers=4` were green and the default (7 on a 14-core
 * machine) was not, which looks like CPU contention. But a run at the DEFAULT
 * worker count against a server that had already served one spec was green in
 * 5.8 minutes — faster than every capped run. So the machine was never short of
 * cores. What it was short of was a warm dev server.
 *
 * `npm run dev` transforms modules on demand. Playwright starts it, then starts
 * every worker at once, and N browsers request the whole module graph
 * simultaneously from a Vite that has compiled nothing yet. The first requests
 * queue behind that work; a spec unlucky enough to be first waits past its
 * budget for an element that is only late, not missing. Lowering the worker
 * count helped only by making the herd smaller, at the cost of a slower suite.
 *
 * ## Why a browser and not a `fetch`
 *
 * Requesting `/` returns `index.html` and warms nothing — the module graph is
 * pulled by the browser's module loader, one import at a time. So this loads
 * the page the way a test does and waits for the app to actually render.
 *
 * ## Why it never fails the run
 *
 * This is an optimisation, not a gate. A warm-up that could fail would turn a
 * slow first request into a red suite, which is strictly worse than the flake
 * it replaces. Every error is caught and reported as a warning; the tests then
 * run against a cold server exactly as they did before.
 */
export default async function globalSetup(config: FullConfig) {
  const baseURL = config.projects[0]?.use?.baseURL
  if (!baseURL) {
    console.warn('[warm-up] no baseURL in the config — skipping (tests will start cold)')
    return
  }

  const browser = await chromium.launch()
  try {
    /*
     * The suite's own `storageState`, so the warm-up walks the route the tests
     * walk. Without it this browser has never been here, lands on the
     * onboarding screen, and waits out its whole budget for a control that
     * screen does not render — burning a minute and warming the wrong path.
     */
    const storageState = config.projects[0]?.use?.storageState
    const page = await browser.newPage(storageState ? { storageState } : {})
    /*
     * `domcontentloaded` plus an explicit wait for a rendered control, rather
     * than `networkidle`: the app registers a service worker and opens an HMR
     * socket, so the network is never idle and this would sit until it timed
     * out. What "warm" means is that Vite has transformed enough of the graph
     * for the shell to paint, and the home screen is the proof of that.
     */
    await page.goto(baseURL, { waitUntil: 'domcontentloaded', timeout: 60_000 })
    await page.getByTestId('home').waitFor({ state: 'attached', timeout: 60_000 })
  } catch (error) {
    console.warn(`[warm-up] could not pre-warm ${baseURL}, tests will start cold: ${String(error)}`)
  } finally {
    await browser.close()
  }
}
