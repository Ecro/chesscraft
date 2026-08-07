import { type Dialog, expect, test } from '@playwright/test'
import { startMatch } from './nav'

/**
 * Real URLs, and the one interaction that makes them dangerous.
 *
 * The app navigated by `useState` alone until ADR-003 — one URL, no Back button, nothing
 * linkable. Adding History-API routing is mostly mechanical, with a single sharp edge:
 * `go()` can REFUSE a navigation, and `popstate` cannot. By the time the handler runs the
 * URL has already changed, so "cancel" is not a matter of returning early — it means
 * pushing the entry back and leaving the screen where it was. Getting that wrong loses a
 * match to a stray Back gesture, which on a phone is a swipe.
 *
 * Every test here is at the default (phone) viewport. Routing is not a layout concern and
 * the desktop project would only run the same assertions in a wider window.
 */

/**
 * Answers the discard confirm, counts it, and stays armed only across the gesture that
 * raises it.
 *
 * The count is what keeps these tests honest. Both of the outcomes asserted below — board
 * gone at `/lobby`, board kept at `/play` — are also reachable with no guard in the code at
 * all, so a test that only checks the outcome cannot tell "the player was asked and
 * answered" from "nothing asked anything". `seen()` is the assertion that the prompt
 * existed.
 */
function answerConfirm(page: import('@playwright/test').Page, answer: 'accept' | 'dismiss') {
  let count = 0
  const handler = (d: Dialog) => {
    count += 1
    void (answer === 'accept' ? d.accept() : d.dismiss())
  }
  page.on('dialog', handler)
  return {
    disarm: () => page.off('dialog', handler),
    seen: () => count,
  }
}

test.describe('URLs', () => {
  test('opens the editor from a direct link, without passing through home', async ({ page }) => {
    /*
     * The claim the edge config exists for. `wrangler.jsonc`'s single-page-application
     * handling is what makes this request reach the app at all; this asserts the app then
     * renders the right screen rather than falling back to home. Under `vite dev` the
     * fallback is Vite's, so what is actually pinned here is the client half — but it is
     * the half that would silently regress, and `e2e-pwa/` covers the served-build half.
     */
    await page.goto('/edit')
    /*
     * The editor itself, not the tab that points at it. `aria-current` comes from
     * `TAB_OF[route]`, which is downstream of the same `route` value the render branch
     * reads — so a broken branch that never mounts `<Edit>` would still light the tab, and
     * a test that only checked the tab would certify "opens the editor" on the strength of
     * a highlight over an empty screen.
     */
    await expect(page.getByTestId('editor')).toBeVisible()
    await expect(page.getByTestId('tab-edit')).toHaveAttribute('aria-current', 'page')
  })

  test('opens a playable board from a direct link, with no match to resume', async ({ page }) => {
    /*
     * The absent case of the feature, and the one no other test enters. Every other route
     * is reached by walking to it, so the state it needs was built on the way; `/play` typed
     * or shared cold has no lobby behind it and no names entered. `MatchHost` has always
     * started its own match from the active preset, so this should work — "should" being
     * the word that made it worth one test. Without it the first person to bookmark the
     * board is the one who finds out.
     */
    await page.goto('/play')
    await expect(page.getByTestId('board')).toBeVisible()
    expect(new URL(page.url()).pathname).toBe('/play')
  })

  test('writes a path when moving between screens, and Back returns', async ({ page }) => {
    await page.goto('/')
    expect(new URL(page.url()).pathname).toBe('/')

    await page.getByTestId('tab-edit').click()
    await expect(page.getByTestId('tab-edit')).toHaveAttribute('aria-current', 'page')
    expect(new URL(page.url()).pathname).toBe('/edit')

    await page.goBack()
    expect(new URL(page.url()).pathname).toBe('/')
    await expect(page.getByTestId('tab-play')).toHaveAttribute('aria-current', 'page')
  })

  test('normalizes an unknown path instead of leaving it in the address bar', async ({ page }) => {
    /*
     * `/room/ABC123` is the shape the multiplayer room link will take and the route does
     * not exist yet. The edge serves the shell for it regardless, so the app must land
     * somewhere — home — and must not leave a URL that promises a screen it did not show.
     * A visitor who reloads should get the same thing they are looking at.
     */
    await page.goto('/room/ABC123')
    await expect(page.getByTestId('tab-play')).toHaveAttribute('aria-current', 'page')
    expect(new URL(page.url()).pathname).toBe('/')
  })
})

/**
 * Starts a match and puts something in it worth not losing.
 *
 * The draft pick is not decoration. `MatchHost` measures risk as
 * `match.states.length > 1 && !state.result` — applied actions, not plies — so a match
 * that has only been STARTED has nothing to discard and the confirm correctly never
 * appears. Both tests below were written without this step and both went green: the
 * cancel test because no dialog fired and the navigation simply happened, the accept
 * test because its handler was never called and the outcome it asserts is what happens
 * with no guard at all. Two tests about a prompt, neither of which had ever seen one —
 * `[fail:test] test-setup-hides-the-failure-path`, from the setup side.
 */
async function startMatchWorthKeeping(page: import('@playwright/test').Page) {
  await startMatch(page)
  const offers = page.locator('[data-testid^="offer-"]')
  await expect(offers.first()).toBeVisible()
  await offers.first().click()
}

test.describe('Back out of a match', () => {
  test('asks first, and cancelling keeps both the board and the URL', async ({ page }) => {
    /*
     * The reason this file exists. `go()` returns early on cancel and nothing has moved;
     * `popstate` fires AFTER the browser has already changed the URL, so the same cancel
     * has to undo a navigation rather than prevent one. If the push-back is missing, the
     * board stays on screen under a URL that says `/`, and the next reload silently throws
     * the match away — a failure that looks like nothing at all until someone reloads.
     */
    await page.goto('/')
    await startMatchWorthKeeping(page)
    expect(new URL(page.url()).pathname).toBe('/play')

    const confirm = answerConfirm(page, 'dismiss')
    await page.goBack()
    /*
     * Polled, not read straight after `goBack()`. A pushState entry is a SAME-DOCUMENT
     * traversal: the browser updates `location` synchronously and `goBack()` resolves,
     * but `popstate` — and therefore React's handler, and therefore the confirm — arrives
     * after that. Reading the counter immediately reports 0 on a perfectly working guard.
     */
    await expect.poll(() => confirm.seen(), { message: 'Back left the match without asking' }).toBe(1)
    confirm.disarm()

    await expect(page.getByTestId('board')).toBeVisible()
    expect(new URL(page.url()).pathname, 'the URL moved even though the player cancelled').toBe('/play')
  })

  test('leaves when the player accepts', async ({ page }) => {
    /*
     * The other side of the same branch. Without this, a push-back that fires
     * unconditionally would pass the test above and make Back permanently inert — the
     * match would become impossible to leave with the browser's own control.
     */
    await page.goto('/')
    await startMatchWorthKeeping(page)

    const confirm = answerConfirm(page, 'accept')
    await page.goBack()
    // Same-document traversal — see the note in the cancel test above.
    await expect.poll(() => confirm.seen(), { message: 'Back left the match without asking' }).toBe(1)
    confirm.disarm()

    await expect(page.getByTestId('board')).toBeHidden()
    expect(new URL(page.url()).pathname).toBe('/lobby')
  })
})
