import { type Page, expect, test } from '@playwright/test'

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

async function move(page: Page, from: string, to: string) {
  await page.getByTestId(`sq-${from}`).click()
  await page.getByTestId(`sq-${to}`).click()
}

async function pickFirstOffer(page: Page) {
  const offers = page.locator('[data-testid^="offer-"]')
  await expect(offers.first()).toBeVisible()
  await offers.first().click()
}

async function offerIds(page: Page): Promise<string[]> {
  return page.locator('[data-testid^="offer-"]').evaluateAll((els) =>
    els.map((e) => e.getAttribute('data-card') ?? ''),
  )
}

/** Walks the side to move's king between its home square and the one ahead. */
async function shuffleKing(page: Page) {
  const side = (await page.getByTestId('side-to-move').innerText()).trim()
  const [home, out] = side === 'white' ? ['d1', 'd2'] : ['d6', 'd5']
  const atHome = (await page.getByTestId(`sq-${home}`).getAttribute('data-piece')) === 'piece.king'
  await (atHome ? move(page, home, out) : move(page, out, home))
}

async function heldBy(page: Page, side: 'white' | 'black'): Promise<string[]> {
  return page
    .locator(`[data-testid^="hand-${side}-"]`)
    .evaluateAll((els) => els.map((e) => e.getAttribute('data-card') ?? ''))
}

test('plays a hot-seat match through all four draft picks to a result', async ({ page }) => {
  await page.goto('/')

  const ruleCard = page.getByTestId('rule-card')
  await expect(ruleCard).toBeVisible()
  const ruleText = (await ruleCard.innerText()).trim()
  expect(ruleText.length).toBeGreaterThan(0)

  // --- Picks 1 and 2: the opening draft, one per player. -------------------
  await expect(page.getByTestId('phase')).toHaveText('draft')
  await pickFirstOffer(page) // white
  await pickFirstOffer(page) // black
  await expect(page.getByTestId('phase')).toHaveText('play')

  // AC-017 — both trays are on screen, each holding one card.
  expect(await heldBy(page, 'white')).toHaveLength(1)
  expect(await heldBy(page, 'black')).toHaveLength(1)

  // --- Play on until the sixth-turn offer opens. ---------------------------
  for (let ply = 0; ply < 24; ply += 1) {
    if ((await page.locator('[data-testid^="offer-"]').count()) > 0) break
    await shuffleKing(page)
  }
  await expect(page.getByTestId('phase')).toHaveText('draft')

  // --- Pick 3, with ADR-013's undo clause in the middle of it. -------------
  const beforeUndo = await offerIds(page)
  expect(beforeUndo).toHaveLength(3)
  await pickFirstOffer(page)
  await page.getByTestId('undo').click()

  // The offer came back from history, not from a fresh draw. Re-rolling here
  // would let a player undo their way to a better hand.
  await expect(page.locator('[data-testid^="offer-"]')).toHaveCount(3)
  expect(await offerIds(page)).toEqual(beforeUndo)
  await pickFirstOffer(page)

  // --- Pick 4: the other player's sixth-turn offer. ------------------------
  for (let ply = 0; ply < 24; ply += 1) {
    if ((await page.locator('[data-testid^="offer-"]').count()) > 0) break
    await shuffleKing(page)
  }
  await pickFirstOffer(page)

  expect(await heldBy(page, 'white')).toHaveLength(2)
  expect(await heldBy(page, 'black')).toHaveLength(2)

  // --- Play to a result: an archer walks onto the beacon. ------------------
  while ((await page.getByTestId('side-to-move').innerText()).trim() !== 'white') {
    await shuffleKing(page)
  }
  await move(page, 'c1', 'c2')
  await shuffleKing(page)
  await move(page, 'c2', 'c3')

  await expect(page.getByTestId('phase')).toHaveText('result')
  await expect(page.getByTestId('result')).toContainText('white')
  // The beacon carried it to d4 ahead of the volley — the Phase 3 line, played
  // through the UI rather than constructed in a fixture.
  await expect(page.getByTestId('sq-d4')).toHaveAttribute('data-piece', 'piece.archer')

  // AC-004's display clause: the drawn rule card never left the screen.
  await expect(ruleCard).toBeVisible()
  expect((await ruleCard.innerText()).trim()).toBe(ruleText)
})

test('surfaces a reason when a card is played out of turn', async ({ page }) => {
  await page.goto('/')
  await pickFirstOffer(page)
  await pickFirstOffer(page)
  await expect(page.getByTestId('side-to-move')).toHaveText('white')

  // AC-008 — clicking the opponent's card must say why, not do nothing.
  const blackCard = (await heldBy(page, 'black'))[0]!
  await page.getByTestId(`hand-black-${blackCard}`).click()

  await expect(page.getByTestId('rejection')).toBeVisible()
  expect((await page.getByTestId('rejection').innerText()).trim().length).toBeGreaterThan(0)
  // Nothing happened to the position.
  await expect(page.getByTestId('side-to-move')).toHaveText('white')
  await expect(page.getByTestId('phase')).toHaveText('play')
})

test('marks a spent card in the tray, for both players to see', async ({ page }) => {
  await page.goto('/')
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
  await page.goto('/')

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
  await page.goto('/')
  const overflows = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  )
  expect(overflows).toBe(false)
})
