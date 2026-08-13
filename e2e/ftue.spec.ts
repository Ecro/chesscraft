import { expect, test } from '@playwright/test'
import { bundledContentSource } from '../src/content/sets/bundled'
import { startMatch } from './nav'

/**
 * A first visit is onboarded, a second is not.
 *
 * "Second visit" is the half that only exists out here — it depends on a real
 * `localStorage` surviving a real reload, which a component test cannot fake
 * without also faking the thing under test.
 *
 * The sequence assertions count VISIBLE cards rather than checking copy. The
 * documented way onboarding fails is showing everything at once, so what is
 * pinned is that exactly one card is on screen at a time and that the whole
 * thing can be dismissed in one action — not the wording, which will change.
 *
 * **This file opts OUT of the suite-wide storage state.** `playwright.config.ts`
 * marks every context as already onboarded so that fifteen other specs are not
 * each one tap away from the screen they are about; the same default would make
 * this file untestable, so it clears the flag first. Same shape as
 * `motion.spec.ts` opting back into animation: a suite-wide default must never
 * be the reason a path goes unexercised.
 */

/** A browser that has never been here. */
async function firstVisit(page: import('@playwright/test').Page) {
  await page.goto('/')
  await page.evaluate(() => window.localStorage.clear())
  await page.reload()
}

test('a first visit is onboarded one card at a time, and can be skipped', async ({ page }) => {
  await firstVisit(page)

  const steps = page.locator('[data-testid^="boot-step-"]')
  await expect(steps).toHaveCount(1)

  // Advancing shows the next card and never a second one alongside it.
  const seen = new Set<string>()
  for (let i = 0; i < 6; i++) {
    const id = await steps.first().getAttribute('data-testid')
    if (id) seen.add(id)
    const next = page.getByTestId('boot-next')
    if ((await next.count()) === 0) break
    await next.click()
    // Re-assert the invariant, not whatever just happened. An early draft read
    // `toHaveCount(await steps.count())`, which compares the locator to itself
    // and therefore passes for any implementation — including one that renders
    // every card at once after the first click, which is the exact failure this
    // suite exists to prevent.
    await expect(steps).toHaveCount(1)
  }
  expect(seen.size).toBeGreaterThan(1)
})

test('skipping ends the whole sequence, not just the current card', async ({ page }) => {
  await firstVisit(page)
  await expect(page.locator('[data-testid^="boot-step-"]')).toHaveCount(1)
  await page.getByTestId('boot-skip').click()
  await expect(page.locator('[data-testid^="boot-step-"]')).toHaveCount(0)
  await expect(page.getByTestId('home')).toBeVisible()
})

test('a second visit is silent', async ({ page }) => {
  await firstVisit(page)
  await page.getByTestId('boot-skip').click()

  await page.reload()
  await expect(page.getByTestId('home')).toBeVisible()
  await expect(page.locator('[data-testid^="boot-step-"]')).toHaveCount(0)
})

test('the first board explains itself, and the second does not', async ({ page }) => {
  /*
   * The in-match half of onboarding, which `Boot` cannot do.
   *
   * Out here rather than in a component test for the same reason "a second
   * visit is silent" is: it depends on a real `localStorage` surviving a real
   * navigation, which is the property under test. The unit suite injects a
   * `Storage` and can only prove the component honours what it is handed; this
   * proves the app actually hands it one — the wiring `[fail:design]
   * built-but-not-wired` is about.
   */
  await firstVisit(page)
  await page.getByTestId('boot-skip').click()
  await startMatch(page)

  const intro = page.getByTestId('match-intro')
  await expect(intro).toBeVisible()
  // The rule block is the half generated from content; asserting it is present
  // rather than asserting its WORDS, which belong to whatever set is loaded.
  await expect(page.getByTestId('match-intro-rule')).toBeVisible()
  // No unresolved key reaches a player. The component calls `t()` on six keys
  // and `ko.ts` is the only thing that makes them words; a missing entry
  // renders the dotted key itself, which no other e2e assertion would notice.
  expect(await intro.textContent()).not.toMatch(/ui\.intro\./)

  await page.getByTestId('match-intro-close').click()
  await expect(intro).toHaveCount(0)
  // The board is reachable behind it — a sheet that failed to unmount would
  // leave every other spec in the suite one tap from where it means to be.
  await expect(page.getByTestId('board')).toBeVisible()

  // A second board, in the same browser, says nothing. Home and back rather
  // than a reload, because that is the route a player takes between matches.
  await page.getByTestId('go-home').click()
  await startMatch(page)
  await expect(page.getByTestId('match-intro')).toHaveCount(0)
})

test('the dex is reachable and lists the content actually loaded', async ({ page }) => {
  await page.goto('/')
  // Reached from the tab bar now, from anywhere, rather than from one button on
  // the home screen — a child in the editor used to have to come back out to
  // look a piece up.
  await page.getByTestId('tab-dex').click()
  await expect(page.getByTestId('rules')).toBeVisible()

  // Per group, against the shipped set itself — no hard-coded totals, and no
  // floor a missing category could slip under. `> 20` did exactly that: pieces
  // + squares + rule cards alone clear it with all fifteen skill cards absent,
  // so an entire section could fail to render behind a green test. Counts come
  // from the source so the assertion follows the bundle when the bundle changes
  // (ADR-011 — this screen may not know a piece by name).
  //
  // The four groups are tabs rather than four lists on one scroll, so each one
  // has to be opened. That is also what makes the assertion stronger than it
  // was: a grid that ignored its tab and always drew the pieces would now fail.
  for (const [group, expected] of [
    ['piece', bundledContentSource.pieces.length],
    ['square', bundledContentSource.squareTypes.length],
    ['rule', bundledContentSource.ruleCards.length],
    ['skill', bundledContentSource.skillCards.length],
  ] as const) {
    await page.getByTestId(`rules-${group}`).click()
    expect(await page.locator('.dex-grid [data-entry]').count(), group).toBe(expected)
  }

  await page.getByTestId('rules-close').click()
  await expect(page.getByTestId('rules')).toHaveCount(0)
  await expect(page.getByTestId('home')).toBeVisible()
})
