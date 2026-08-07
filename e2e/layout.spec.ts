import { type Page, expect, test } from '@playwright/test'
import { startMatch } from './nav'

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

/** Onboarding is dismissed suite-wide by the config's `storageState`. */
async function openBoard(page: Page) {
  await page.goto('/')
  await startMatch(page)
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
      await openBoard(page)

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
      await openBoard(page)
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

test('nothing below the board can reflow it (#16)', async ({ page }) => {
  /*
   * There is no tray toggle to click any more, and its absence is the fix
   * rather than a regression: the per-tray collapse is what made this property
   * fragile in the first place, and a player could shut their OWN tray and then
   * be unable to play a card. Both hands are now always condensed to marks and
   * always present.
   *
   * The property this test exists for survives and is worth more without the
   * toggle: a control that reshuffles the position under a player's thumb is
   * worse than the space it saves. So what is driven is the two things below
   * the board that DO change size — a rejection appearing, and the settings
   * drawer opening.
   */
  await openBoard(page)
  const before = await boardBox(page)

  // A rejection: the hint line is always in the DOM precisely so that filling it
  // cannot push the board.
  const foeCard = page.locator('[data-testid^="hand-black-"]').first()
  if (await foeCard.count()) {
    await foeCard.click()
    await expect(page.getByTestId('rejection')).toBeVisible()
    expect(await boardBox(page), 'a rejection moved the board').toEqual(before)
  }

  await page.getByTestId('match-settings').click()
  await expect(page.getByTestId('haptics-toggle').or(page.getByTestId('match-seed')).first()).toBeVisible()
  expect(await boardBox(page), 'the settings drawer moved the board').toEqual(before)
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
    await openBoard(page)
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
  await openBoard(page)
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

  // Condensed by DEFAULT now rather than behind a toggle — see the note on the
  // test above. What ADR-018 protects is unchanged and is what is asserted: the
  // cards are in the DOM, on screen, and each still says what it is.
  expect(await cards.count(), 'a condensed hand dropped its cards from the DOM').toBe(held)
  await expect(cards.first(), 'a condensed hand hid a card the opponent must see').toBeVisible()
  // Condensing costs the prose, never the identity. The mark inside is
  // aria-hidden, so without a label on the button itself a condensed hand
  // announces "button" and nothing else.
  const name = await cards.first().getAttribute('aria-label')
  expect(name?.trim(), 'a condensed card has no accessible name').toBeTruthy()
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
    await openBoard(page)

    const bounds = await page.evaluate(() => {
      const main = document.querySelector('main')
      if (!main) return null
      const box = main.getBoundingClientRect()
      const escapees: Array<{ label: string; right: number }> = []
      for (const el of document.querySelectorAll('.match-tools button, .turn-bar button')) {
        const r = el.getBoundingClientRect()
        if (r.right > box.right + 0.5 || r.left < box.left - 0.5) {
          escapees.push({ label: (el.textContent ?? '').trim().slice(0, 12), right: Math.round(r.right) })
        }
      }
      return { right: Math.round(box.right), escapees }
    })
    expect(bounds).not.toBeNull()
    expect(bounds?.escapees, `controls past main's edge (${bounds?.right}px)`).toEqual([])

    /*
     * The grouping, one rank lighter than it was.
     *
     * Sound came back OUT of the drawer: it is the control two children reach
     * for most on a shared phone, and burying the thing everyone touches to tidy
     * a row is the wrong trade. What stays behind the affordance is what a
     * player reaches for between matches at most — the seed (ADR-024's
     * reproducibility contract, moved and never deleted) and haptics.
     */
    const settings = page.getByTestId('match-settings')
    await expect(settings).toBeVisible()
    await expect(page.getByTestId('sound-toggle')).toBeVisible()
    await expect(page.getByTestId('match-seed')).toBeHidden()
    await settings.click()
    await expect(page.getByTestId('match-seed')).toBeVisible()
  })
})

/**
 * Desktop — the shell stops being a phone.
 *
 * A viewport this file did not have, and the reason it now does: `main` was
 * capped at `max-width: 480px` unconditionally, so a 1920x1080 window threw away
 * 1440px of width (75%) and still scrolled vertically. Nothing here could see
 * it — every viewport above is a phone or a tablet, where that cap is right.
 *
 * The gap assertion is the one worth having. The two-column layout puts the
 * board in a grid area spanning every row, so when the board is TALLER than the
 * stack beside it the browser hands the slack to the tracks it spans and blows a
 * ~590px hole between the rule card and the hands. It looks like a rendering
 * accident rather than a CSS mistake, no existing assertion touches it, and the
 * fix (a trailing flexible track) is exactly the kind of line a later cleanup
 * removes as redundant.
 */
test.describe('at desktop (1440x900)', () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test('uses the width instead of leaving a phone column in the middle', async ({ page }) => {
    await openBoard(page)

    const { mainWidth, boardWidth, horizontal } = await page.evaluate(() => ({
      mainWidth: Math.round(document.querySelector('main')!.getBoundingClientRect().width),
      boardWidth: Math.round(document.querySelector('[data-testid="board"]')!.getBoundingClientRect().width),
      horizontal: document.documentElement.scrollWidth > window.innerWidth,
    }))

    // Not an exact width — that would break on the first redesign. What is
    // pinned is that the phone cap no longer applies at all.
    expect(mainWidth, 'main is still capped at its phone width on a desktop').toBeGreaterThan(700)
    expect(boardWidth, 'the board did not grow with the room it was given').toBeGreaterThan(480)
    expect(horizontal, 'the page scrolls sideways').toBe(false)
  })

  test('the board stays square', async ({ page }) => {
    await openBoard(page)
    const box = await boardBox(page)
    expect(Math.abs(box.w - box.h), `board is ${box.w}x${box.h}`).toBeLessThanOrEqual(2)
  })

  test('leaves no hole in the side column beside a taller board', async ({ page }) => {
    await openBoard(page)

    const gaps = await page.evaluate(() => {
      const side = [...document.querySelectorAll('.play > *')].filter(
        (el) => !el.classList.contains('board-frame') && !el.classList.contains('draft-scrim'),
      )
      return side.slice(1).map((el, i) =>
        Math.round(el.getBoundingClientRect().top - side[i]!.getBoundingClientRect().bottom),
      )
    })

    expect(gaps.length, 'no side column to measure').toBeGreaterThan(1)
    // The row gap is 8px; anything near the board's height is the bug.
    expect(Math.max(...gaps), `side column gaps: ${gaps.join(', ')}`).toBeLessThan(40)
  })
})
