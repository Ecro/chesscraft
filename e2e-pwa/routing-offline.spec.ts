import { expect, test } from '@playwright/test'

/**
 * Client-side routes, with the network gone.
 *
 * ADR-003 gave the screens real URLs, and that put a second consumer on a branch of the
 * service worker that had only ever had one. `/` was the only address the app had, so the
 * navigate branch's fallback — `caches.match('/')` — was always asked for the same URL it
 * was given. Now a navigation can ask for `/edit`, which is precached under no key at all,
 * and the fallback has to answer the SHELL rather than the URL.
 *
 * The worker already does this: it keys the fallback on `'/'` literally rather than on the
 * request, and it takes the navigate branch on `request.mode`, not on the path. So nothing
 * here required a change to `vite-plugin-sw.ts` — which is the reason this file exists.
 * A branch that is correct by construction and exercised by nothing is one refactor away
 * from being correct by accident, and the refactor that breaks it (matching the request
 * instead of the string) is the same one the file's own comments record having been made
 * once already, in the other branch, for the same reason.
 *
 * Run against a real build through `vite preview` — the dev server has no worker at all.
 */

/**
 * A browser that has the worker installed AND has been through onboarding.
 *
 * Both halves are load-bearing and the second is easy to miss. A first visitor gets `boot`
 * whatever the URL says — the coach flag decides that, deliberately, so a shared link
 * cannot skip the tutorial — and `App` then rewrites the address bar to `/` so it stops
 * claiming a screen it did not open. So a deep-link test that has not onboarded is not
 * testing deep links: it lands on home either way, and would pass with the routing removed
 * entirely. Onboarding here, before the network is cut, is what makes the navigation that
 * follows about the URL.
 *
 * This suite seeds nothing (`playwright.pwa.config.ts` has no `storageState`), which is
 * right for it — its subject is a real second visit — so the flag is set the way a player
 * sets it, by dismissing the screen.
 */
async function returningVisitor(page: import('@playwright/test').Page) {
  await page.goto('/')
  await page.waitForFunction(() => navigator.serviceWorker?.controller != null, null, { timeout: 20_000 })
  await page.getByTestId('boot-skip').click()
  await expect(page.getByTestId('start-match')).toBeVisible()
}

test('a deep link still opens its screen with the network switched off', async ({ page, context }) => {
  await returningVisitor(page)
  await context.setOffline(true)

  /*
   * A fresh navigation to a path that is in NO cache, not a reload of one that is. This is
   * the case the edge's single-page-application handling covers when the network is there,
   * and the case that has nothing behind it when the network is not — the browser asks the
   * worker for `/edit`, the worker has never stored anything under that key, and what it
   * must not do is return `Response.error()` and show the offline dinosaur.
   */
  await page.goto('/edit')

  // The editor itself, not the document. A shell that loads with dead scripts satisfies a
  // title check while showing nothing at all — the reason `offline.spec.ts` reaches the
  // board rather than asserting the page responded.
  await expect(page.getByTestId('editor')).toBeVisible()
  expect(new URL(page.url()).pathname).toBe('/edit')
})

test('an unknown path offline lands on home rather than an error page', async ({ page, context }) => {
  /*
   * The absent case of the same branch. `/room/ABC123` is the shape the multiplayer room
   * link will take; today no route claims it. Online the edge serves the shell and the app
   * normalizes the URL to `/`. Offline there is no edge — the worker is the only thing that
   * answers — so this asserts the fallback covers paths the app itself does not know,
   * which is a strictly larger set than the routes it does.
   *
   * Onboarded first for the same reason as the test above, and here it is the difference
   * between two claims: a first visitor is rewritten to `/` because they got `boot`, which
   * would make this pass whether or not unknown-path normalization exists at all.
   */
  await returningVisitor(page)
  await context.setOffline(true)
  await page.goto('/room/ABC123')

  await expect(page.getByTestId('start-match')).toBeVisible()
  expect(new URL(page.url()).pathname).toBe('/')
})
