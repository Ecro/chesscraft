import { expect, test } from '@playwright/test'
import { bundledContentSource } from '../src/content/sets/bundled'

/**
 * PLAN Phase 3's exit criterion: a first visit is coached, a second is not.
 *
 * "Second visit" is the half that only exists out here — it depends on a real
 * `localStorage` surviving a real reload, which a component test cannot fake
 * without also faking the thing under test.
 *
 * The sequence assertions count VISIBLE steps rather than checking copy. The
 * documented way onboarding fails is showing everything at once, so what is
 * pinned is that exactly one step is on screen at a time and that the whole
 * thing can be dismissed in one action — not the wording, which will change.
 */

test('a first visit is coached one step at a time, and can be skipped', async ({ page }) => {
  await page.goto('/')

  const steps = page.locator('[data-testid^="coach-step-"]')
  await expect(steps).toHaveCount(1)

  // Advancing shows the next step and never a second one alongside it.
  const seen = new Set<string>()
  for (let i = 0; i < 6; i++) {
    const id = await steps.first().getAttribute('data-testid')
    if (id) seen.add(id)
    const next = page.getByTestId('coach-next')
    if ((await next.count()) === 0) break
    await next.click()
    // Re-assert the invariant, not whatever just happened. The first draft read
    // `toHaveCount(await steps.count())`, which compares the locator to itself
    // and therefore passes for any implementation — including one that renders
    // all six steps at once after the first click, which is the exact failure
    // this suite exists to prevent.
    await expect(steps).toHaveCount(1)
  }
  expect(seen.size).toBeGreaterThan(1)
})

test('skipping ends the whole sequence, not just the current step', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('[data-testid^="coach-step-"]')).toHaveCount(1)
  await page.getByTestId('coach-skip').click()
  await expect(page.locator('[data-testid^="coach-step-"]')).toHaveCount(0)
})

test('a second visit is silent', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('coach-skip').click()

  await page.reload()
  await expect(page.getByTestId('home')).toBeVisible()
  await expect(page.locator('[data-testid^="coach-step-"]')).toHaveCount(0)
})

test('the rules screen is reachable and lists the content actually loaded', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('coach-skip').click()

  await page.getByTestId('open-rules').click()
  await expect(page.getByTestId('rules')).toBeVisible()

  // Per group, against the shipped set itself — no hard-coded totals, and no
  // floor a missing category could slip under. `> 20` did exactly that: pieces
  // + squares + rule cards alone clear it with all fifteen skill cards absent,
  // so an entire section could fail to render behind a green test. Counts come
  // from the source so the assertion follows the bundle when the bundle changes
  // (ADR-011 — this screen may not know a piece by name).
  for (const [group, expected] of [
    ['piece', bundledContentSource.pieces.length],
    ['square', bundledContentSource.squareTypes.length],
    ['rule', bundledContentSource.ruleCards.length],
    ['skill', bundledContentSource.skillCards.length],
  ] as const) {
    expect(await page.locator(`[data-testid="rules-${group}"] [data-entry]`).count(), group).toBe(expected)
  }

  await page.getByTestId('rules-close').click()
  await expect(page.getByTestId('rules')).toHaveCount(0)
  await expect(page.getByTestId('home')).toBeVisible()
})
