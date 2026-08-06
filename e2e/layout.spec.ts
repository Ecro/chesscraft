import { type Page, expect, test } from '@playwright/test'

/**
 * PLAN Phase 6b — layout, measured at viewports the default project never uses.
 *
 * The suite runs one project (Pixel 7 portrait), so every layout assertion the
 * project has ever made is an assertion about 412x915. #33 is the claim that the
 * app is not broken outside that one box, and the only honest way to check it is
 * to render at other boxes. `test.use({ viewport })` overrides per-describe
 * rather than adding projects — adding a project would re-run all 56 specs at a
 * viewport none of them were written for, which reports failures that are about
 * the test rather than about the app.
 *
 * What is pinned is deliberately narrow: the board stays SQUARE and the page
 * never scrolls sideways. Those two survive any visual redesign; "the tray is
 * 60px tall" would not, and pinning it would make this file an obstacle the
 * first time someone improves the layout.
 */

const VIEWPORTS = {
  'small phone': { width: 360, height: 640 },
  tablet: { width: 768, height: 1024 },
  landscape: { width: 915, height: 412 },
} as const

async function startMatch(page: Page) {
  await page.goto('/')
  await page.getByTestId('coach-skip').click()
  await page.getByTestId('start-match').click()
  await expect(page.getByTestId('board')).toBeVisible()
}

/** Document-relative, so a scrolled-into-view element is not read as a shift. */
async function boardBox(page: Page) {
  return page.getByTestId('board').evaluate((el) => {
    const r = el.getBoundingClientRect()
    return {
      x: Math.round(r.x + window.scrollX),
      y: Math.round(r.y + window.scrollY),
      w: Math.round(r.width),
      h: Math.round(r.height),
    }
  })
}

for (const [label, viewport] of Object.entries(VIEWPORTS)) {
  test.describe(`at ${label} (${viewport.width}x${viewport.height})`, () => {
    test.use({ viewport })

    test('the board stays square and the page never scrolls sideways (#33)', async ({ page }) => {
      await startMatch(page)

      const box = await boardBox(page)
      // Two CSS pixels of slack. The columns are `1fr` tracks and each row's
      // height comes from its own `aspect-ratio: 1` squares, so the two axes
      // round independently — at a wider viewport that can diverge by more than
      // the single device pixel a tighter bound would allow, for reasons that
      // have nothing to do with the board being square.
      expect(Math.abs(box.w - box.h), `board ${box.w}x${box.h} is not square`).toBeLessThanOrEqual(2)

      const overflow = await page.evaluate(() => ({
        scroll: document.documentElement.scrollWidth,
        client: document.documentElement.clientWidth,
      }))
      expect(overflow.scroll, `document scrolls sideways by ${overflow.scroll - overflow.client}px`).toBeLessThanOrEqual(
        overflow.client,
      )
    })

    /**
     * The assertion that actually makes #33 mean something.
     *
     * The two above were measured before a line of this phase was written and
     * were already green at all three viewports — "square" and "no sideways
     * scroll" are both true of a 480px column centred on a tablet, so the
     * criterion as written could be satisfied by doing nothing. Measured, the
     * real defect is landscape: the board is sized off WIDTH, which at 915x412
     * makes it 441px tall in a 412px-tall window, so the bottom two ranks are
     * off screen. Two children looking at one phone cannot play that.
     *
     * So the property is the one a player has: the whole board is on screen at
     * once. Sizing the board off the smaller axis is one way to satisfy it and
     * this does not require that one — it requires the outcome.
     */
    test('the whole board is on screen without scrolling (#33)', async ({ page }) => {
      await startMatch(page)
      const fit = await page.evaluate(() => {
        const r = document.querySelector('[data-testid="board"]')!.getBoundingClientRect()
        return {
          bottom: Math.round(r.bottom + window.scrollY),
          top: Math.round(r.top + window.scrollY),
          viewport: window.innerHeight,
        }
      })
      expect(
        fit.bottom,
        `board spans ${fit.top}-${fit.bottom}px in a ${fit.viewport}px window — ${fit.bottom - fit.viewport}px of it is off screen`,
      ).toBeLessThanOrEqual(fit.viewport)
    })
  })
}

test('collapsing a tray does not move the board (#16)', async ({ page }) => {
  await startMatch(page)

  const before = await boardBox(page)
  const toggle = page.getByTestId('tray-toggle-white')
  await expect(toggle).toBeVisible()

  await toggle.click()
  await expect(page.getByTestId('hand-white')).toHaveAttribute('data-open', 'false')
  // The trays sit BELOW the board, so collapsing one must not reflow it. This is
  // the same property the rejection toast was fixed for in 6a: a control that
  // reshuffles the position under a player's thumb is worse than the space it
  // saves.
  expect(await boardBox(page)).toEqual(before)

  await toggle.click()
  await expect(page.getByTestId('hand-white')).toHaveAttribute('data-open', 'true')
  expect(await boardBox(page)).toEqual(before)
})

/**
 * ADR-018 keeps AC-017's model: "both hands, one board, both trays always
 * visible". The first version of the collapse unmounted the cards, so a tap on
 * the opponent's label hid their hand — and a player who left their own tray
 * shut could not play a card on their own turn, because the button they needed
 * did not exist. A collapse may condense; it may not take information away.
 */
test.describe('landscape, with a match actually under way', () => {
  test.use({ viewport: VIEWPORTS.landscape })

  /**
   * The board-fit assertion above measures the moment after `startMatch`, when
   * both hands are empty and no legend has appeared — a positive-only fixture
   * that cannot reach the state where the right-hand column is tall enough to
   * grow the document past the window. This one drafts first, then scrolls to
   * the very bottom, which is where the board used to leave the screen entirely
   * (measured at -293px before the fix) even though it "fit" on load.
   */
  test('the board stays on screen even scrolled to the bottom (#33)', async ({ page }) => {
    await startMatch(page)
    for (let i = 0; i < 6; i += 1) {
      const offer = page.locator('[data-testid^="offer-"]').first()
      if (await offer.count()) await offer.click()
      else break
    }
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
    const seen = await page.evaluate(() => {
      const r = document.querySelector('[data-testid="board"]')!.getBoundingClientRect()
      return { top: Math.round(r.top), bottom: Math.round(r.bottom), viewport: window.innerHeight }
    })
    expect(
      seen.top >= 0 && seen.bottom <= seen.viewport,
      `board spans ${seen.top}-${seen.bottom} in a ${seen.viewport}px window after scrolling to the bottom`,
    ).toBe(true)
  })
})

test('a collapsed tray still shows the cards it holds (ADR-018)', async ({ page }) => {
  await startMatch(page)
  // Drain the draft rather than clicking a fixed number of times. The seed is
  // random (`MatchHost` defaults to `Math.random()`), so a fixed count left the
  // outcome to chance — and the `test.skip` that guarded it would have reported
  // "skipped" rather than "failed" on a run where no card reached the hand,
  // quietly removing this ADR-018 regression check from that run's signal.
  for (let i = 0; i < 12; i += 1) {
    const offer = page.locator('[data-testid^="offer-"]').first()
    if (!(await offer.count())) break
    await offer.click()
  }
  const cards = page.locator('[data-testid^="hand-white-"]')
  const held = await cards.count()
  expect(held, 'draining the draft left white with no cards — the fixture is broken, not skippable').toBeGreaterThan(0)

  await page.getByTestId('tray-toggle-white').click()
  await expect(page.getByTestId('hand-white')).toHaveAttribute('data-open', 'false')
  expect(await cards.count(), 'collapsing removed the cards from the DOM').toBe(held)
  await expect(cards.first(), 'a collapsed tray hid a card the opponent must see').toBeVisible()
  // Condensing costs the prose, never the identity. `.card-body` goes
  // `display: none` when collapsed, which takes it out of the accessibility
  // tree — and the icon beside it is aria-hidden, so without a label on the
  // button itself a collapsed tray announced "button" and nothing else.
  const name = await cards.first().getAttribute('aria-label')
  expect(name?.trim(), 'a collapsed card has no accessible name').toBeTruthy()
})

/**
 * The control row (PLAN 6b scope, deferred by both Phase 4's and Phase 5's
 * reviews). What is pinned is the property those reviews were worried about —
 * that the row stays usable on the narrowest supported phone — not a particular
 * arrangement, which the next layout change would invalidate.
 *
 * `main` sets `overflow-x: hidden`, so an overflowing control is CLIPPED rather
 * than scrolled: the no-horizontal-scroll assertion above cannot see it. That is
 * how 한 수 무르기 shipped half off-screen in the previous phase. This measures
 * each control against the container instead.
 */
test.describe('at the narrowest supported phone', () => {
  test.use({ viewport: VIEWPORTS['small phone'] })

  test('every match control is fully on screen, and the toggles are grouped', async ({ page }) => {
    await startMatch(page)

    const bounds = await page.evaluate(() => {
      const main = document.querySelector('main')
      if (!main) return null
      const box = main.getBoundingClientRect()
      const escapees: Array<{ label: string; right: number }> = []
      for (const el of document.querySelectorAll('.match-tools button, .status button')) {
        const r = el.getBoundingClientRect()
        if (r.right > box.right + 0.5 || r.left < box.left - 0.5) {
          escapees.push({ label: (el.textContent ?? '').trim().slice(0, 12), right: Math.round(r.right) })
        }
      }
      return { right: Math.round(box.right), escapees }
    })
    expect(bounds).not.toBeNull()
    expect(bounds?.escapees, `controls past main's edge (${bounds?.right}px)`).toEqual([])

    // The grouping itself: the two settings toggles are behind one affordance
    // rather than sitting in the row as two more buttons.
    const settings = page.getByTestId('match-settings')
    await expect(settings).toBeVisible()
    await expect(page.getByTestId('sound-toggle')).toBeHidden()
    await settings.click()
    await expect(page.getByTestId('sound-toggle')).toBeVisible()
    await expect(page.getByTestId('haptics-toggle')).toBeVisible()
  })
})
