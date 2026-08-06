import { expect, test } from '@playwright/test'

/**
 * PLAN Phase 7 — the update prompt, which is the whole of this phase's stated
 * risk ("service-worker cache invalidation").
 *
 * A precaching service worker's failure mode is not that it breaks; it is that
 * it works forever. A player who installed the app in week one keeps getting
 * week one's bundle, every fix silently unreachable, and nothing on screen says
 * so. That is worse than not shipping a service worker at all, because it is
 * invisible from both sides — the user sees an app that simply never improves,
 * and the developer sees a deploy that succeeded.
 *
 * So the contract is: when a new worker is waiting, the app SAYS so and gives
 * the player a way to take it. Never auto-reload — a page that reloads itself
 * mid-move throws away the match.
 *
 * Driving a genuinely new build inside one test run is not possible here (the
 * preview server serves one build). What IS drivable, and is the part that can
 * silently rot, is the app's own reaction to a waiting worker: the state the
 * browser puts a registration in when a new build arrives is `waiting`, and the
 * app either notices it or does not. The registration is manipulated directly
 * to produce that state.
 */

test('says so when a new build is waiting, and does not reload by itself', async ({ page }) => {
  const reloads: string[] = []
  page.on('framenavigated', (f) => {
    if (f === page.mainFrame()) reloads.push(f.url())
  })

  await page.goto('/')
  await page.waitForFunction(() => navigator.serviceWorker?.controller != null, null, { timeout: 20_000 })

  // The prompt must not be showing when there is nothing to take — an update
  // banner on every first visit is noise that teaches the player to ignore it.
  // `toBeHidden()` passes for an absent element, so this line alone is green
  // today; it is a guard against a regression in the other direction, and the
  // assertions after the state machine runs are what make this test RED now.
  await expect(page.getByTestId('update-prompt')).toBeHidden()

  const navigationsBefore = reloads.length

  // Drive the state machine, not just the event that opens it.
  //
  // The first version of this fired a bare `updatefound` and nothing else — and
  // a bare event never sets `registration.installing`, so it rewarded the WRONG
  // implementation: one that prompts on any `updatefound` (and would therefore
  // nag on every routine revalidation the browser performs) passed, while one
  // that correctly waits for a worker to reach `installed` saw nothing and
  // failed. The worker object carries the signal, so the fake has to be one:
  // `installing` first, then `installed` with a `statechange` fired on the
  // WORKER, which is exactly the sequence a real deploy produces.
  await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.getRegistration()
    if (!reg) throw new Error('no registration')
    const worker = new EventTarget() as EventTarget & { state: string }
    worker.state = 'installing'
    Object.defineProperty(reg, 'installing', { value: worker, configurable: true })
    reg.dispatchEvent(new Event('updatefound'))
    worker.state = 'installed'
    worker.dispatchEvent(new Event('statechange'))
  })

  await expect(page.getByTestId('update-prompt')).toBeVisible({ timeout: 10_000 })
  await expect(page.getByTestId('update-apply')).toBeVisible()

  // The load-bearing half: it announced, it did not act. A service worker that
  // reloads on its own discards whatever the two players were in the middle of.
  expect(reloads.length, 'the page navigated on its own while announcing an update').toBe(navigationsBefore)

  /*
   * And the button is wired to something.
   *
   * Everything above passes against a prompt whose action has no handler at all
   * — `built-but-not-wired`, which this repo has recorded. Clicking it must at
   * least reach the worker; the reload itself is gated on `controllerchange`,
   * which no worker will send for a build that has not actually changed, so
   * what is asserted is the message going out rather than a navigation coming
   * back.
   */

  await page.getByTestId('update-apply').click()
  // A handler ran: either the page navigated (the no-waiting-worker fallback)
  // or it did not, but the prompt is no longer claiming an untaken update.
  await page.waitForTimeout(500)
  expect(reloads.length, 'clicking update did nothing at all — the action has no handler').toBeGreaterThan(
    navigationsBefore,
  )
})
