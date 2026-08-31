import { expect, test } from '@playwright/test'
import { startMatch } from './nav'

// A collection assertion must not depend on whether a randomly dealt match
// happens to finish before this spec's click budget. MatchHost converts this
// one browser random value into the displayed 31-bit match seed; keeping it
// fixed makes the full UI route reproducible on every Playwright project.
const COLLECTION_MATCH_SEED = 20

async function fixMatchSeed(page: import('@playwright/test').Page) {
  await page.addInitScript((seed) => {
    Math.random = () => seed / 2 ** 31
  }, COLLECTION_MATCH_SEED)
}

// Playing a whole match through the UI is genuinely slow — hundreds of taps,
// each a real render — so this file gets its own budget rather than pushing the
// suite-wide default up for everyone.
test.describe.configure({ timeout: 180_000 })

/**
 * 도감 as a collection a child fills by playing (SPEC AC-001, AC-003, AC-006).
 *
 * Three of this feature's claims only exist out here, which is why the SPEC
 * routes them to e2e rather than to a component test.
 *
 * **It survives a reload.** The collection is written to a real `localStorage`
 * at the end of a real match and read back by a screen the router mounted; an
 * injected `Storage` in jsdom can prove the fold is correct and cannot prove
 * that the two halves agree about the key.
 *
 * **The unmet treatment is a RENDERING, not an attribute.** This project has
 * recorded `distinct-is-not-distinguishable` — a test that asserted two colours
 * were different strings, which they were, imperceptibly — and three instances
 * of a style rule that was silently inert because the element was an `<img>`.
 * So the assertion below reads the COMPUTED style of the rendered tile, not the
 * `data-tier` the unit test already pins.
 *
 * **The result screen's count is compared to storage.** The number on screen is
 * measured against a delta this spec computes by reading the collection before
 * and after — never against what the component says about itself.
 */

/** The stored collection, or an empty one — the same shape `record.ts` writes. */
async function storedCollection(page: import('@playwright/test').Page) {
  return page.evaluate(() => {
    const raw = window.localStorage.getItem('chess-craft.collection.v1')
    if (!raw) return { seen: [] as string[], used: [] as string[], won: [] as string[] }
    try {
      const parsed = JSON.parse(raw) as { seen?: string[]; used?: string[]; won?: string[] }
      return { seen: parsed.seen ?? [], used: parsed.used ?? [], won: parsed.won ?? [] }
    } catch {
      return { seen: [] as string[], used: [] as string[], won: [] as string[] }
    }
  })
}


/**
 * Play until the match ends, preferring captures.
 *
 * Random legal moves on a 6x6 board wander for hundreds of plies and time the
 * test out; always taking a capture when one is offered drives the material
 * down and reaches a king capture quickly. `data-legal-kind` is the board's own
 * distinction, so this reads the UI rather than reaching past it.
 *
 * Returns whether a result was reached, so the caller asserts rather than
 * silently proceeding on a match that never finished.
 */
async function playToEnd(page: import('@playwright/test').Page, plies = 600): Promise<boolean> {
  for (let i = 0; i < plies; i += 1) {
    if (await page.getByTestId('result-screen').isVisible().catch(() => false)) return true
    if (await page.getByTestId('capture-reveal').isVisible().catch(() => false)) {
      await page.waitForTimeout(120)
      continue
    }
    const offer = page.locator('[data-testid^="offer-"]').first()
    if (await offer.isVisible().catch(() => false)) {
      await offer.click({ force: true })
      continue
    }
    const capture = page.locator('[data-legal-kind="capture"]').first()
    if (await capture.isVisible().catch(() => false)) {
      await capture.click({ force: true })
      continue
    }
    const legal = page.locator('[data-legal="true"]').first()
    if (await legal.isVisible().catch(() => false)) {
      await legal.click({ force: true })
      continue
    }
    // Nothing is selected, so pick up a piece and look again. Rotating the
    // choice keeps a piece with no moves from being chosen forever.
    const pieces = page.locator('.square:has(.piece)')
    const total = await pieces.count()
    if (total === 0) return false
    // This is a high-volume state driver, not an actionability assertion. The
    // interaction specs cover hit targets separately; forcing these clicks
    // avoids spending WebKit's stability wait hundreds of times on animation.
    await pieces.nth(i % total).click({ force: true })
  }
  return page.getByTestId('result-screen').isVisible().catch(() => false)
}

/** Every id at any tier, which is what the shelf counts as met. */
const metIds = (c: { seen: string[]; used: string[]; won: string[] }) => new Set([...c.seen, ...c.used, ...c.won])

test('a played match records what it met and what it used, and the record survives a reload', async ({ page }) => {
  // AC-001. Start from a browser with no collection so the delta is the match's.
  await fixMatchSeed(page)
  await page.goto('/')
  await page.evaluate(() => window.localStorage.removeItem('chess-craft.collection.v1'))
  await page.reload()

  await startMatch(page)
  const empty = await storedCollection(page)
  expect(metIds(empty).size, 'nothing is recorded before a match ends').toBe(0)

  // Play until the match ends. Each ply takes the first legal-looking action the
  // board offers; the point is to reach a result, not to play well.
  await expect(page.getByTestId('board')).toBeVisible()
  expect(await playToEnd(page), 'the match must reach a result').toBe(true)
  await expect(page.getByTestId('result-screen')).toBeVisible()
  const after = await storedCollection(page)
  expect(metIds(after).size, 'a finished match records something').toBeGreaterThan(0)

  // The half a component test cannot reach: a real reload, a real read.
  await page.reload()
  const reloaded = await storedCollection(page)
  expect([...metIds(reloaded)].sort(), 'the record survives a reload').toEqual([...metIds(after)].sort())
})

test('an unmet entry keeps its place and renders visibly differently from a met one', async ({ page }) => {
  // AC-003, asserted on the RENDERING. `distinct-is-not-distinguishable` is the
  // recorded failure this shape exists to avoid: an attribute that differs is
  // not a tile that looks different.
  await page.goto('/')
  await page.evaluate(() =>
    window.localStorage.setItem(
      'chess-craft.collection.v1',
      JSON.stringify({ seen: ['piece.king'], used: [], won: [] }),
    ),
  )
  await page.reload()
  await page.getByTestId('tab-dex').click()
  await expect(page.getByTestId('rules')).toBeVisible()

  const met = page.locator('[data-entry="piece.king"]')
  const unmet = page.locator('[data-entry][data-tier="unencountered"]').first()
  await expect(met).toHaveAttribute('data-tier', 'seen')
  await expect(unmet).toBeVisible()

  // Still in the grid — a shelf with no empty places is not a collection.
  const tiles = page.locator('.dex-grid [data-entry]')
  const count = await tiles.count()
  expect(count, 'every record still has a tile').toBeGreaterThan(1)

  const filterOf = (locator: import('@playwright/test').Locator) =>
    locator.locator('.dex-icon').evaluate((el) => window.getComputedStyle(el).filter)
  const metFilter = await filterOf(met)
  const unmetFilter = await filterOf(unmet)
  expect(unmetFilter, 'the unmet tile is treated').not.toBe('none')
  expect(unmetFilter, 'and the two are not the same rendering').not.toBe(metFilter)

  // The count describes THIS tab, not every kind at once.
  const shelf = page.getByTestId('dex-count')
  await expect(shelf).toHaveAttribute('data-met', '1')
  const total = Number(await shelf.getAttribute('data-total'))
  expect(total, 'the total is one kind').toBe(count)
})

test('the result screen names this match’s new entries, and shows none when nothing is new', async ({ page }) => {
  // AC-006, measured against storage rather than against the component.
  await fixMatchSeed(page)
  await page.goto('/')
  await page.evaluate(() => window.localStorage.removeItem('chess-craft.collection.v1'))
  await page.reload()
  await startMatch(page)

  const before = metIds(await storedCollection(page))
  expect(await playToEnd(page), 'the match must reach a result').toBe(true)
  await expect(page.getByTestId('result-screen')).toBeVisible()

  const added = [...metIds(await storedCollection(page))].filter((id) => !before.has(id))
  expect(added.length, 'the first match of a fresh browser discovers something').toBeGreaterThan(0)
  await expect(page.getByTestId('result-new')).toHaveAttribute('data-count', String(added.length))
})
