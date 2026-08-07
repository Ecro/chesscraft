import { expect, test } from '@playwright/test'
import { bundledContentSource } from '../src/content/sets/bundled'

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
