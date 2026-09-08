import { type Page, expect, test } from '@playwright/test'
import { useSliceContent } from './content'
import { move, startMatch } from './nav'

/**
 * PLAN Phase 2's exit criterion, played rather than simulated.
 *
 * The component tests in `tests/ui/match-lifecycle.test.tsx` mount `MatchHost`
 * with props and can prove the seed plumbing; they cannot prove that a person
 * starting from the home screen reaches a match, plays it to an end, and finds
 * a way to start another. Three things only exist out here: the route from Home
 * into a match, a click dispatched after the match has genuinely reached
 * `result` through play, and a clipboard.
 */

async function sideToMove(page: Page): Promise<string> {
  return (await page.getByTestId('side-to-move').getAttribute('data-side')) ?? ''
}

/** Walks the side to move's king between its home square and the one ahead. */
async function shuffleKing(page: Page) {
  const [home, out] = (await sideToMove(page)) === 'white' ? ['d1', 'd2'] : ['d6', 'd5']
  const atHome = (await page.getByTestId(`sq-${home}`).getAttribute('data-piece')) === 'piece.king'
  await (atHome ? move(page, home, out) : move(page, out, home))
}

async function pickFirstOffer(page: Page) {
  const offers = page.locator('[data-testid^="offer-"]')
  await expect(offers.first()).toBeVisible()
  await offers.first().click()
}

test('a first visitor starts from home and lands in a playable match', async ({ page }) => {
  await page.goto('/')
  await startMatch(page)
  await expect(page.getByTestId('board')).toBeVisible()
  await expect(page.getByTestId('rule-card')).toHaveAttribute('data-rule', /.+/)
})

test('the seed in play is reachable and copyable (ADR-024)', async ({ page, context, browserName }) => {
  // Playwright cannot grant clipboard permission on WebKit — `grantPermissions`
  // throws `Unknown permission: clipboard-write` before the app is even loaded.
  // A harness limit, not a claim about the engine, so it is named here rather
  // than worked around. (PLAN-piece-info-convenience-ux, R3 triage.)
  test.skip(browserName === 'webkit', 'Playwright/WebKit cannot grant clipboard-write')
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.goto('/')
  await startMatch(page)

  // Behind the settings drawer rather than on the tools row: a ten-digit
  // number is developer output and this app's players are children. ADR-024
  // asks that a match be replayable and shareable, which needs the seed
  // REACHABLE — one tap, no scrolling, no hidden gesture — not permanently on
  // screen. The test name says `reachable` for that reason; it used to say
  // `on screen`, and leaving it would have described a contract that no longer
  // holds while still passing.
  await page.getByTestId('match-settings').click()
  const seed = page.getByTestId('match-seed')
  await expect(seed).toBeVisible()
  const shown = (await seed.innerText()).replace(/\D/g, '')
  expect(shown).not.toBe('')

  // "Copyable" has to mean a control a thumb can hit, not text a developer can
  // select — the criterion exists so a match can be shared, and a child cannot
  // select-and-copy a span on a phone reliably.
  await page.getByTestId('copy-seed').click()
  const clipboard = await page.evaluate(() => navigator.clipboard.readText())
  expect(clipboard.replace(/\D/g, '')).toBe(shown)
})

test('starting a new match re-draws the rule card', async ({ page }) => {
  await page.goto('/')
  await startMatch(page)

  const seen = new Set<string>()
  for (let i = 0; i < 10; i++) {
    seen.add((await page.getByTestId('rule-card').getAttribute('data-rule')) ?? '')
    await page.getByTestId('new-match').click()
  }
  // Before this phase every match drew the same card forever; one distinct
  // value across ten new matches IS that defect.
  expect(seen.size).toBeGreaterThan(1)
})

test('plays a match to a result and offers a rematch that starts a different one', async ({ page }) => {
  await useSliceContent(page)

  // --- Reach a result on the slice's scripted beacon line. -----------------
  // Same sequence `hotseat.spec.ts` walks, minus the assertions it owns: the
  // opening picks, recurring automatic awards, then an archer onto the beacon.
  await pickFirstOffer(page) // white, opening draft
  await pickFirstOffer(page) // black, opening draft
  for (let ply = 0; ply < 24; ply += 1) await shuffleKing(page)
  await expect(page.getByTestId('phase')).toHaveAttribute('data-phase', 'play')
  while ((await sideToMove(page)) !== 'white') {
    await shuffleKing(page)
  }
  await move(page, 'c1', 'c2')
  await shuffleKing(page)
  await move(page, 'c2', 'c3')

  await expect(page.getByTestId('phase')).toHaveAttribute('data-phase', 'result')
  const finished = (await page.getByTestId('rule-card').getAttribute('data-rule')) ?? ''

  // The banner is the one place an engine reason code reaches a player.
  const banner = (await page.getByTestId('result').innerText()).trim()
  expect(banner).not.toMatch(/king_capture|win_action|material_cap|white|black/)
  expect(banner).toMatch(/[가-힣]/)

  // --- The rematch control only exists here, and has to actually restart. --
  await page.getByTestId('rematch').click()
  await expect(page.getByTestId('phase')).not.toHaveAttribute('data-phase', 'result')
  await expect(page.getByTestId('rule-card')).toHaveAttribute('data-rule', /.+/)
  expect(finished).not.toBe('')
})

test('forges a named upgrade, equips one square, and uses it in the next match', async ({ page }) => {
  await page.goto('/dex')
  await page.evaluate(() => {
    window.localStorage.setItem(
      'chess-craft.progression.v1',
      JSON.stringify({
        version: 1,
        sparks: 5,
        ownedUpgradeIds: [],
        equipped: {},
        nextOfferNonce: 0,
        recentClaimIds: [],
      }),
    )
  })
  await page.reload()
  await page.locator('[data-entry="piece.pawn"] button').click()
  await page.getByTestId('upgrade-forge-piece.pawn-plus').click()
  await page.getByTestId('dex-close').click()
  await page.getByTestId('rules-close').click()
  await page.getByTestId('start-match').click()
  await page.getByTestId('equipment-white-upgrade').selectOption('piece.pawn-plus')
  await page.getByTestId('equipment-white-square').selectOption('b2')
  await page.getByTestId('lobby-start').click()
  await expect(page.getByTestId('sq-b2')).toHaveAttribute('data-piece', 'piece.pawn-plus')
  await expect(page.getByTestId('sq-a2')).toHaveAttribute('data-piece', 'piece.pawn')
})
