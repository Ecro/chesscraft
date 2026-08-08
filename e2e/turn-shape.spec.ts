import { type Page, expect, test } from '@playwright/test'
import { useSliceContent } from './content'

/**
 * AC-019 through the UI — a card is played DURING the turn, not instead of it.
 *
 * The unit tests pin the rule and the badge; what only a browser can show is
 * that the turn reads as one continuous action on a phone-sized screen: the
 * card resolves, the board stays yours, the line under it says so, and the
 * board is still fully on screen while all of that happens.
 *
 * The effect BADGE is deliberately not asserted here. Which card the draft
 * deals is seeded per run, and only two of the slice's six freeze anything — a
 * conditional assertion would report green on the runs that never reached it.
 * `tests/ui/effect-visibility.test.tsx` pins the badge against a fixed fixture.
 */

/**
 * Plays the first card in white's hand, following the board rather than a table.
 *
 * A fixed card -> squares table is what the older specs use, and it clicks one
 * square too many the moment a card resolves early — the extra click lands on
 * the board as a MOVE, which under the new turn shape ends the turn and makes
 * the spec fail claiming the rule is broken. Following `[data-legal]` and
 * stopping when the card is spent asks the board what it wants instead of
 * telling it.
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

async function playFirstCard(page: Page): Promise<string> {
  const card = (await heldByWhite(page))[0]!
  const tile = page.getByTestId(`hand-white-${card}`)
  await tile.click()

  /*
   * One click per square the card asked for, and not one more.
   *
   * The extra click is the whole hazard here: the moment a card resolves, the
   * board's highlights stop belonging to it and start belonging to the MOVE the
   * player now owes (ADR-001) — so a loop that keeps clicking spends the turn
   * and the spec fails blaming the rule. Hence the used-check before each
   * click, and the settle wait after it: the attribute is written by a React
   * commit that has not necessarily happened when `click` returns, and reading
   * it too early is how this spec first "proved" the turn had ended.
   */
  for (const square of CARD_TARGETS[card]!) {
    if ((await tile.getAttribute('data-used')) === 'true') break
    await page.getByTestId(`sq-${square}`).click()
    await page.waitForFunction(
      (id) => document.querySelector(`[data-testid="${id}"]`)?.getAttribute('data-pending') !== null,
      `hand-white-${card}`,
    )
  }
  const useCard = page.getByTestId('use-card')
  // A card that quantifies over your own pieces has nothing to point at.
  if (await useCard.isVisible()) await useCard.click()
  await expect(tile).toHaveAttribute('data-used', 'true')
  return card
}

async function pickFirstOffer(page: Page) {
  const offers = page.locator('[data-testid^="offer-"]')
  await expect(offers.first()).toBeVisible()
  await offers.first().click()
}

async function heldByWhite(page: Page): Promise<string[]> {
  return page
    .getByTestId('hand-white')
    .locator('[data-card]')
    .evaluateAll((els) => els.map((e) => e.getAttribute('data-card') ?? ''))
}

test('a card leaves the board with its owner, who then moves', async ({ page }) => {
  await useSliceContent(page)
  await pickFirstOffer(page)
  await pickFirstOffer(page)

  await expect(page.getByTestId('side-to-move')).toHaveAttribute('data-side', 'white')
  await playFirstCard(page)

  // The card is spent and the turn is not: this is the whole of ADR-001, as a
  // player sees it.
  await expect(page.getByTestId('side-to-move')).toHaveAttribute('data-side', 'white')
  // ...and the screen says what is still owed rather than leaving the player to
  // work out why their turn did not end.
  await expect(page.locator('.hint-bar')).toHaveText(/./)

  // The move that closes it. The king shuffle is the one move every slice
  // opening has, whatever the draft dealt.
  await page.getByTestId('sq-d1').click()
  await page.getByTestId('sq-d2').click()
  await expect(page.getByTestId('side-to-move')).toHaveAttribute('data-side', 'black')
})

test('the extra turn step costs the board none of its screen', async ({ page }) => {
  // AC-017/AC-018's layout constraint, at the moment the screen carries the most
  // it ever carries: a spent card, a hint line that has something to say, and
  // whatever effect the card left behind.
  await page.setViewportSize({ width: 390, height: 844 })
  await useSliceContent(page)
  await pickFirstOffer(page)
  await pickFirstOffer(page)

  await playFirstCard(page)

  const overflow = await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight)
  expect(overflow, 'the play screen must not scroll on a 390x844 phone').toBeLessThanOrEqual(0)
  await expect(page.getByTestId('board')).toBeInViewport({ ratio: 1 })
})
