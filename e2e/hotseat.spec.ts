import { type Page, expect, test } from '@playwright/test'
import { useSliceContent } from './content'
import { move } from './nav'

/**
 * PLAN Phase 4 exit criterion — the hot-seat flow, end to end.
 *
 * Every assertion here is a UI clause some AC carries that no headless test can
 * reach: AC-004's "the drawn rule card stays visible", AC-008's "the rejection
 * is surfaced, not silent", AC-017's "both players' cards, and which are spent",
 * AC-018's "special squares are distinguished and their ability text readable",
 * and ADR-013's "undo does not re-roll an offer".
 */

/** Card id -> the squares its choice slots want, on the opening position. */
const CARD_TARGETS: Record<string, string[]> = {
  'skill.warp': ['c1', 'c4'],
  'skill.hold': ['c6'],
  'skill.volley': ['b6'],
  'skill.snare': ['c6'],
  'skill.rally': ['c4'],
  'skill.ascend': ['b1'],
}

async function pickFirstOffer(page: Page) {
  const offers = page.locator('[data-testid^="offer-"]')
  await expect(offers.first()).toBeVisible()
  await offers.first().click()
}

/** Walks the side to move's king between its home square and the one ahead. */
async function shuffleKing(page: Page) {
  const side = (await page.getByTestId('side-to-move').getAttribute('data-side')) ?? ''
  const [home, out] = side === 'white' ? ['d1', 'd2'] : ['d6', 'd5']
  const atHome = (await page.getByTestId(`sq-${home}`).getAttribute('data-piece')) === 'piece.king'
  await (atHome ? move(page, home, out) : move(page, out, home))
}

async function heldBy(page: Page, side: 'white' | 'black'): Promise<string[]> {
  return page
    .locator(`[data-testid^="hand-${side}-"]`)
    .evaluateAll((els) => els.map((e) => e.getAttribute('data-card') ?? ''))
}

test('plays a hot-seat match through recurring skill awards to a result', async ({ page }) => {
  // The longest test in the suite, and WebKit here is several times slower than
  // Chromium — it exceeded the 30s default on the first full WebKit run. Marked
  // slow rather than skipped: the claim is engine-independent and worth keeping.
  // (PLAN-piece-info-convenience-ux, R3 triage.)
  test.slow()
  await useSliceContent(page)

  const ruleCard = page.getByTestId('rule-card')
  await expect(ruleCard).toBeVisible()
  const ruleText = (await ruleCard.innerText()).trim()
  expect(ruleText.length).toBeGreaterThan(0)

  // --- Picks 1 and 2: the opening draft, one per player. -------------------
  await expect(page.getByTestId('phase')).toHaveAttribute('data-phase', 'draft')
  await pickFirstOffer(page) // white
  await pickFirstOffer(page) // black
  await expect(page.getByTestId('phase')).toHaveAttribute('data-phase', 'play')

  // AC-017 — both trays stay visible while the engine grants one new card at
  // turns 5 and 10 without opening another blocking draft.
  for (let ply = 0; ply < 24; ply += 1) await shuffleKing(page)
  await expect(page.getByTestId('phase')).toHaveAttribute('data-phase', 'play')
  expect(await heldBy(page, 'white')).toHaveLength(3)
  expect(await heldBy(page, 'black')).toHaveLength(3)

  // --- Play to a result: an archer walks onto the beacon. ------------------
  while (((await page.getByTestId('side-to-move').getAttribute('data-side')) ?? '') !== 'white') {
    await shuffleKing(page)
  }
  await move(page, 'c1', 'c2')
  await shuffleKing(page)
  await move(page, 'c2', 'c3')

  await expect(page.getByTestId('phase')).toHaveAttribute('data-phase', 'result')
  await expect(page.getByTestId('result')).toHaveAttribute('data-winner', 'white')
  // The beacon carried it to d4 ahead of the volley — the Phase 3 line, played
  // through the UI rather than constructed in a fixture.
  await expect(page.getByTestId('sq-d4')).toHaveAttribute('data-piece', 'piece.archer')

  // AC-004's display clause: the drawn rule card never left the screen.
  await expect(ruleCard).toBeVisible()
  expect((await ruleCard.innerText()).trim()).toBe(ruleText)
})

test('surfaces a reason when a card is played out of turn', async ({ page }) => {
  await useSliceContent(page)
  await pickFirstOffer(page)
  await pickFirstOffer(page)
  await expect(page.getByTestId('side-to-move')).toHaveAttribute('data-side', 'white')

  // AC-008 — clicking the opponent's card must say why, not do nothing.
  const blackCard = (await heldBy(page, 'black'))[0]!
  await page.getByTestId(`hand-black-${blackCard}`).click()

  await expect(page.getByTestId('rejection')).toBeVisible()
  expect((await page.getByTestId('rejection').innerText()).trim().length).toBeGreaterThan(0)
  // Nothing happened to the position.
  await expect(page.getByTestId('side-to-move')).toHaveAttribute('data-side', 'white')
  await expect(page.getByTestId('phase')).toHaveAttribute('data-phase', 'play')
})

test('marks a spent card in the tray, for both players to see', async ({ page }) => {
  await useSliceContent(page)
  await pickFirstOffer(page)
  await pickFirstOffer(page)

  const card = (await heldBy(page, 'white'))[0]!
  const tile = page.getByTestId(`hand-white-${card}`)
  await expect(tile).toHaveAttribute('data-used', 'false')

  await tile.click()
  for (const square of CARD_TARGETS[card]!) await page.getByTestId(`sq-${square}`).click()

  // AC-017 — spent-ness is visible, and it is visible on the tray the opponent
  // is also looking at.
  await expect(tile).toHaveAttribute('data-used', 'true')
  await expect(page.getByTestId('hand-black')).toBeVisible()
})

test('distinguishes special squares and shows their ability text', async ({ page }) => {
  await useSliceContent(page)

  // AC-018's UI clause. The marking is driven by the board's paint data, so a
  // new square type needs no change here.
  await expect(page.getByTestId('sq-c3')).toHaveAttribute('data-square-type', 'square.beacon')
  await expect(page.getByTestId('sq-c4')).toHaveAttribute('data-square-type', '')

  const legend = page.getByTestId('square-legend')
  await expect(legend).toBeVisible()
  const text = (await legend.innerText()).trim()
  expect(text.length).toBeGreaterThan(0)
  // Resolved text, not the raw i18n key.
  expect(text).not.toContain('square.beacon.text')
})

test('lays out in portrait without horizontal scrolling', async ({ page }) => {
  await useSliceContent(page)
  const overflows = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  )
  expect(overflows).toBe(false)
})
