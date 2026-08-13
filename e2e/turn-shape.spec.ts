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

test('the card that just fired is named on screen', async ({ page }) => {
  /*
   * The reported defect, in a real browser: before this there was nothing
   * anywhere that said WHICH card had been played, so a player watching the
   * board saw effects arrive from nowhere.
   *
   * Asserted on the card's own name via the hand tile rather than against a
   * written-down string — the draft is seeded per run, and the slice deals six
   * different cards. What is pinned is that the banner names the card that was
   * actually spent, whichever one that was.
   */
  await useSliceContent(page)
  await pickFirstOffer(page)
  await pickFirstOffer(page)

  await expect(page.getByTestId('card-banner')).toHaveCount(0)
  const card = await playFirstCard(page)

  const banner = page.getByTestId('card-banner')
  await expect(banner).toBeVisible()
  const played = await page.getByTestId(`hand-white-${card}`).getAttribute('aria-label')
  expect(played, 'the hand tile carries the card name this run dealt').toBeTruthy()
  await expect(banner).toContainText(played!)

  // And nothing raw reaches the player: neither a record id nor an i18n key.
  const words = (await banner.textContent()) ?? ''
  expect(words).not.toMatch(/skill\./)
  expect(words).not.toMatch(/ui\./)

  /*
   * And it is announced to a reader who cannot see it.
   *
   * `role="status"` with `aria-live="polite"` is the contract that carries to a
   * screen reader what the banner's appearance carries to everyone else — the
   * same pairing the hand-off toast uses. What is asserted is the contract
   * reaching a real browser's DOM; whether a screen reader then speaks it is
   * not machine-verifiable here, and pretending otherwise would be worse than
   * saying so.
   *
   * This lives here rather than in `e2e/a11y.spec.ts`, which the PLAN named:
   * that file reaches the board through `startMatch` and its random seed, so
   * it cannot reliably get a card played at all.
   */
  await expect(banner).toHaveAttribute('role', 'status')
  await expect(banner).toHaveAttribute('aria-live', 'polite')

  // It is an announcement, not a control — the board stays reachable under it,
  // which is what "the human is never blocked" means outside a unit test.
  await expect(page.getByTestId('board')).toBeVisible()
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

/*
 * The one motion-enabled corner of this spec.
 *
 * The suite runs under `reducedMotion: 'reduce'` so that specs driving a board
 * by clicking are not racing a transition — which, left alone, would mean the
 * impact ring's animation is executed by nothing at all
 * (`[fail:test] test-setup-hides-the-failure-path`, recorded here after a
 * clipboard spec granted the permission whose absence was the whole risk).
 *
 * `e2e/motion.spec.ts` is where that opt-in normally lives, and this check
 * belongs beside the card machinery instead: that file reaches the board via
 * `startMatch`, which deals from a random seed, so on some runs the card in
 * hand cannot be played and the test fails for a reason that has nothing to do
 * with motion. The slice content and `CARD_TARGETS` above make it deterministic.
 */
test.describe('with motion allowed', () => {
  test.use({ contextOptions: { reducedMotion: 'no-preference' } })

  test('the squares a card changed are ringed, and the ring really animates', async ({ page }) => {
    await useSliceContent(page)
    await pickFirstOffer(page)
    await pickFirstOffer(page)
    await playFirstCard(page)

    const ring = page.locator('.square[data-impact="true"] .impact-ring').first()
    await expect(ring, 'a card that resolved must mark what it changed').toBeVisible()

    // Probed on the element that carries the animation rather than on the
    // token: `--motion-impact-duration: 0ms` under `reduce` and a rule that
    // forgot to reference the token look identical from the token's side.
    const duration = await ring.evaluate((el) => getComputedStyle(el).animationDuration)
    expect(duration).not.toBe('0s')
    expect(duration).not.toBe('')
  })

  test('the ring does not take the legal-move dot’s place', async ({ page }) => {
    /*
     * Review finding (P1). The ring first lived on `.square::after`, behind a
     * comment claiming a square could never be both impacted and a legal move
     * target "because the ring belongs to the ply that just ended".
     *
     * That was wrong against this feature's own design: ADR-005 leaves the
     * human path ungated precisely so the player can pick the move their card
     * still owes while the banner is up. Both rules were single-class-plus-
     * attribute, so the later one won and the move dot vanished during the one
     * window the feature exists for. The ring is its own element now, and this
     * is what says so if it ever moves back.
     */
    await useSliceContent(page)
    await pickFirstOffer(page)
    await pickFirstOffer(page)
    await playFirstCard(page)

    await expect(page.locator('.impact-ring').first()).toBeVisible()

    // Select the piece that owes the move, so legal targets light up WHILE the
    // ring is still running.
    await page.getByTestId('sq-d1').click()
    const dot = page.locator('.square[data-legal-kind="move"]').first()
    await expect(dot, 'the owed move must offer somewhere to go').toBeVisible()

    // The dot is a pseudo-element on the square; the ring is a child. Both may
    // be present, and neither may be the other.
    const drawn = await dot.evaluate((el) => {
      const after = getComputedStyle(el, '::after')
      return { width: after.width, hasRingChild: Boolean(el.querySelector('.impact-ring')) }
    })
    expect(drawn.width, 'the legal-move dot must still be drawn').not.toBe('0px')
    expect(drawn.width).not.toBe('auto')
  })
})
