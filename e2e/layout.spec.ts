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

  test('gives the shell the width, with no frame around it', async ({ page }) => {
    /*
     * Replaces an assertion that could not fail. It read `mainWidth > 700`, and `main` is
     * `width: 100%` unconditionally (`styles.css` shell rule) — so on a 1440px viewport it
     * was true whatever the layout did, including the phone column this whole band exists
     * to retire. Its companion, `boardWidth > 480`, was satisfied by the board's own
     * `calc(100dvh - 200px)` at any desktop height.
     *
     * What is pinned instead is the two things ADR-006 actually decides at this boundary:
     * the shell is no longer capped at the phone width, and it is no longer wearing the
     * 390x844 device frame. Both are read off `.phone` itself rather than off `main`,
     * because `.phone` is the element either rule applies to.
     */
    await openBoard(page)

    const shell = await page.evaluate(() => {
      const el = document.querySelector('.phone')!
      const style = getComputedStyle(el)
      return {
        width: Math.round(el.getBoundingClientRect().width),
        borderTop: Math.round(parseFloat(style.borderTopWidth)),
        horizontal: document.documentElement.scrollWidth > window.innerWidth,
      }
    })

    expect(shell.width, 'the shell is still at or near its phone width on a desktop').toBeGreaterThan(900)
    expect(shell.borderTop, 'the device frame is still drawn at desktop width').toBe(0)
    expect(shell.horizontal, 'the page scrolls sideways').toBe(false)
  })

  test('the board stays square', async ({ page }) => {
    await openBoard(page)
    const box = await boardBox(page)
    expect(Math.abs(box.w - box.h), `board is ${box.w}x${box.h}`).toBeLessThanOrEqual(2)
  })

  test('leaves no hole in the side column beside a taller board', async ({ page }) => {
    /*
     * Skipped at Phase 5, re-enabled here — Phase 7 built the column it measures.
     *
     * It was written for a two-column play layout the Chess Craft redesign removed, and
     * between then and Phase 7 it passed vacuously: `.play` was a single flex column, so
     * there was no side column for a board to leave a hole beside. It is a real assertion
     * again now, and the failure it names is specific — a board spanning every row hands
     * its surplus height to the tracks it spans, opening a gap between the rule card and
     * the hands that looks like a rendering accident rather than a CSS mistake.
     */
    await openBoard(page)

    const gaps = await page.evaluate(() => {
      /*
       * `display: contents` wrappers are expanded rather than measured.
       *
       * The subject here is the RENDERED column beside the board; `.play > *`
       * was a proxy for it, and the proxy broke when `.play-cover` was added —
       * a wrapper that exists purely to carry one `hidden`/`inert` decision for
       * the six siblings underneath, and which generates no box at all. Its
       * `getBoundingClientRect()` is a zero rect, so measuring it as a column
       * member produced gaps of 804 and -738 against a layout that was fine.
       * A transparent wrapper has to be transparent to the measurement too, or
       * this test reports on the DOM rather than on what a player sees.
       */
      const flatten = (el: Element): Element[] =>
        getComputedStyle(el).display === 'contents' ? [...el.children].flatMap(flatten) : [el]
      /*
       * Excluded by column, not by name.
       *
       * The earlier version filtered out `.board-frame`. That was right when the board was
       * a direct member of the same vertical stack; Phase 7's split puts the board inside
       * `.play-body`, which is itself the whole of column 1. Keeping the old filter left
       * `.play-body` in the list and measured the vertical distance between elements in
       * DIFFERENT columns — which produced -813 and -796, numbers that describe nothing.
       *
       * So the members are taken by their grid column instead: whatever is not in column 1
       * and is not the overlay. That survives another reshuffle of which element holds the
       * board, which is the thing this test has now been wrong about twice.
       */
      const side = [...document.querySelectorAll('.play > *')]
        .flatMap(flatten)
        .filter((el) => !el.classList.contains('draft-scrim'))
        .filter((el) => getComputedStyle(el).gridColumnStart !== '1')
      return side.slice(1).map((el, i) =>
        Math.round(el.getBoundingClientRect().top - side[i]!.getBoundingClientRect().bottom),
      )
    })

    expect(gaps.length, 'no side column to measure').toBeGreaterThan(1)
    // The row gap is 8px; anything near the board's height is the bug.
    expect(Math.max(...gaps), `side column gaps: ${gaps.join(', ')}`).toBeLessThan(40)
  })
})

/**
 * The boundary itself, from both sides (ADR-006).
 *
 * Two-sided on purpose. A one-sided assertion — "the desktop shell is there at 1280" —
 * passes just as well against a layout that applies the desktop rules at EVERY width,
 * which is a worse bug than not having them: it hands a phone the two-column shell. The
 * pair is what makes the media query's bounds the subject, rather than its contents.
 *
 * This is also the countermeasure to `[fail:design] condition-narrower-than-its-case`,
 * the failure recorded in this repo where a complete desktop layout never rendered because
 * its query said `(orientation: landscape) and (max-height: 560px)`. The lesson taken was
 * that a widened bound must be checked for what ELSE it now matches, so 915x412 — a
 * landscape phone, the viewport that failure turned on — is asserted here explicitly.
 */
const FRAME_EDGE = { width: 1279, height: 900 }
const DESKTOP_EDGE = { width: 1280, height: 900 }
const LANDSCAPE_PHONE = { width: 915, height: 412 }

/** The shell's two tells: how wide it is, and whether it is wearing the device frame. */
async function shellShape(page: Page) {
  return page.evaluate(() => {
    const el = document.querySelector('.phone')!
    return {
      width: Math.round(el.getBoundingClientRect().width),
      framed: Math.round(parseFloat(getComputedStyle(el).borderTopWidth)) > 0,
    }
  })
}

test.describe('at the desktop boundary', () => {
  test.describe(`one pixel below it (${FRAME_EDGE.width}x${FRAME_EDGE.height})`, () => {
    test.use({ viewport: FRAME_EDGE })

    test('is still the phone in its frame', async ({ page }) => {
      await page.goto('/')
      const shell = await shellShape(page)

      expect(shell.framed, 'the device frame is gone one pixel below the desktop band').toBe(true)
      expect(shell.width, `shell is ${shell.width}px — the phone cap is not holding`).toBeLessThanOrEqual(420)
    })
  })

  test.describe(`at it (${DESKTOP_EDGE.width}x${DESKTOP_EDGE.height})`, () => {
    test.use({ viewport: DESKTOP_EDGE })

    test('has become the desktop shell', async ({ page }) => {
      await page.goto('/')
      const shell = await shellShape(page)

      expect(shell.framed, 'the device frame is still drawn at the desktop band').toBe(false)
      expect(shell.width, `shell is ${shell.width}px — it did not take the width`).toBeGreaterThan(900)
    })
  })

  test.describe('the screens that are not the board', () => {
    test.use({ viewport: { width: 1440, height: 900 } })

    test('a sheet is a centred dialog over the whole window, not a slab pinned to the bottom', async ({ page }) => {
      /*
       * Two defects in one assertion, and neither shows on a phone.
       *
       * `.sheet-scrim` is `position: absolute`, so it covers its containing screen — which
       * on desktop is the grid area beside the navigation rail, leaving the rail lit and
       * clickable behind a dialog that is supposed to have taken over. And `.sheet` carries
       * no `max-width` and `justify-content: flex-end`, so at 1440px it renders as a
       * 1344px-wide slab welded to the bottom edge. Both are right for a phone: the scrim
       * IS the screen there, and a bottom sheet is the native idiom.
       */
      await page.goto('/dex')
      await page.getByTestId('dex-sheet').waitFor({ state: 'detached' })
      // Any entry in the grid opens its detail sheet; the first is as good as any.
      await page.locator('.dex-grid li button').first().click()
      await expect(page.getByTestId('dex-sheet')).toBeVisible()

      const seen = await page.evaluate(() => {
        const scrim = document.querySelector('.sheet-scrim')
        const sheet = document.querySelector('.sheet')
        if (!scrim || !sheet) return null
        const sc = scrim.getBoundingClientRect()
        const sh = sheet.getBoundingClientRect()
        return {
          scrimCoversWindow: Math.round(sc.width) >= window.innerWidth - 1 && Math.round(sc.left) <= 1,
          sheetWidth: Math.round(sh.width),
          windowWidth: window.innerWidth,
          leftGap: Math.round(sh.left),
          rightGap: Math.round(window.innerWidth - sh.right),
          bottomGap: Math.round(window.innerHeight - sh.bottom),
        }
      })

      expect(seen, 'no sheet opened').not.toBeNull()
      expect(seen!.scrimCoversWindow, 'the scrim stops short of the window — the nav rail stays lit').toBe(true)
      expect(seen!.sheetWidth, `sheet is ${seen!.sheetWidth}px of ${seen!.windowWidth}px`).toBeLessThan(760)
      expect(Math.abs(seen!.leftGap - seen!.rightGap), 'the sheet is not centred').toBeLessThanOrEqual(2)
      expect(seen!.bottomGap, 'the sheet is still welded to the bottom edge').toBeGreaterThan(0)
    })

    for (const screen of [
      { path: '/', testid: 'home' },
      { path: '/dex', testid: 'rules' },
    ]) {
      test(`${screen.testid} keeps its content to a readable measure`, async ({ page }) => {
        /*
         * A single column of controls stretched to 1344px is not a desktop layout, it is a
         * phone layout that stopped resisting. What is pinned is a bound, not a number: the
         * content stays narrower than the room it was given, and does not scroll sideways.
         */
        await page.goto(screen.path)
        const el = page.getByTestId(screen.testid)
        await expect(el).toBeVisible()

        const seen = await el.evaluate((node) => ({
          width: Math.round(node.getBoundingClientRect().width),
          /*
           * The BODY, not the widest child. The header, the tab strip and the step rail
           * are deliberately full-bleed (see the `max-width: none` exception in
           * `desktop.css`), so a max-over-all-children reads them as violations of a
           * measure they were exempted from — which is exactly what happened when the
           * exception landed. The paired test below asserts the header IS full width, so
           * between them both halves are pinned rather than averaged.
           */
          inner: Math.round(
            (node.querySelector('.screen-body') ?? node.children[node.children.length - 1]!).getBoundingClientRect()
              .width,
          ),
          sideways: document.documentElement.scrollWidth > window.innerWidth,
        }))

        expect(seen.inner, `content runs to ${seen.inner}px inside a ${seen.width}px screen`).toBeLessThan(1100)
        expect(seen.sideways, 'the page scrolls sideways').toBe(false)
      })
    }
  })

  test.describe('what the broad selectors nearly caught', () => {
    test.use({ viewport: { width: 1440, height: 900 } })

    test('the match banner is not confined to the side column', async ({ page }) => {
      /*
       * A review finding said `.play-cover > * { grid-column: 2 }` was catching the rule
       * banner and the hand-off toast and squeezing them into the side rail. Measured, it
       * was not: both are children of `.play` itself, not of `.play-cover`, so that rule
       * never reached them — with the desktop override removed entirely the banner sits at
       * the same place, 720px, the centre of the match area. The finding was a false
       * positive and the "fix" for it was reverted.
       *
       * The test stays, retargeted at the claim that is actually true and actually at risk.
       * The banner is an absolutely-positioned child of a grid container with no placement,
       * so its containing block is the container's padding box; the moment someone gives
       * `.play > *` a `grid-column`, that silently becomes a cell instead and the banner
       * lands on the rail for real. What is pinned is therefore overlap with the board, not
       * a centre: it survives the banner being positioned in any reasonable way and fails
       * the one way that matters.
       *
       * Note what is NOT claimed: that the banner is centred on the BOARD. `styles.css`
       * says it sits "where the eye already is", which on a phone is the same point as the
       * screen centre and on a desktop is not. Making those agree is a design decision
       * nobody has taken, and asserting it here would invent one.
       */
      await openBoard(page)
      await expect(page.getByTestId('rule-banner')).toBeVisible()

      const seen = await page.evaluate(() => {
        const t = document.querySelector('[data-testid="rule-banner"]')!.getBoundingClientRect()
        const b = document.querySelector('[data-testid="board"]')!.getBoundingClientRect()
        const overlap = Math.max(0, Math.min(t.right, b.right) - Math.max(t.left, b.left))
        return { overlap: Math.round(overlap), boardWidth: Math.round(b.width) }
      })

      expect(
        seen.overlap / seen.boardWidth,
        `banner overlaps the board by ${seen.overlap}px of ${seen.boardWidth}px`,
      ).toBeGreaterThan(0.8)
    })

    test('the screen header spans the screen, and the content under it does not', async ({ page }) => {
      /*
       * Two claims that only mean something together. The measure rule caps every direct
       * child of `.lobby`/`.dex`, and `.screen-head` is one — so the masthead shrank to
       * 900px and its background and bottom border shrank with it, leaving a floating bar
       * with gutters. Asserting only "content is narrow" passes on that layout; asserting
       * only "header is wide" passes on a layout with no measure at all.
       */
      await page.goto('/dex')
      const seen = await page.evaluate(() => {
        const screen = document.querySelector('[data-testid="rules"]')!.getBoundingClientRect()
        const head = document.querySelector('.screen-head')!.getBoundingClientRect()
        const body = document.querySelector('.screen-body')!.getBoundingClientRect()
        return { screen: Math.round(screen.width), head: Math.round(head.width), body: Math.round(body.width) }
      })

      expect(seen.head, `header is ${seen.head}px of a ${seen.screen}px screen`).toBeGreaterThanOrEqual(
        seen.screen - 1,
      )
      expect(seen.body, `content is ${seen.body}px — the measure is not holding`).toBeLessThanOrEqual(900)
    })

    test('the art picker gets desktop-sized cells, not phone-sized ones', async ({ page }) => {
      /*
       * `.palette.wrap` is (0,2,0) in `styles.css` and the desktop rule was a bare
       * `.palette` at (0,1,0) — it lost on specificity, which loading later cannot fix, so
       * the sprite grid shipped at `minmax(48px, 1fr)`. The failure is invisible in every
       * sense except looking at it: no error, no layout break, just a phone-sized grid.
       *
       * The wrapped palette lives in the RECORD form (`RecordForm.tsx`), reached through the
       * library, not in the room builder — a first version of this test opened the builder's
       * board step, found nothing, and measured 0px. A locator that matches nothing is not a
       * passing test, so the path is walked explicitly here.
       */
      await page.goto('/edit')
      await page.getByTestId('editor-tab-library').click()
      await page.locator('[data-testid^="library-open-"]').first().click()
      const palette = page.locator('.palette.wrap button').first()
      await expect(palette).toBeVisible()

      const cell = await palette.evaluate((el) => Math.round(el.getBoundingClientRect().width))
      expect(cell, `art picker cell is ${cell}px`).toBeGreaterThan(80)
    })
  })

  test.describe('pointer affordances (ADR-007)', () => {
    test.use({ viewport: { width: 1440, height: 900 } })

    test('a hovered control changes its bevel and nothing else', async ({ page }, testInfo) => {
      /*
       * ADR-007 reopened a recorded decision — `styles.css` says "a block that lights up on
       * hover would look like glass" — and the reopening is narrow. Feedback yes; a
       * different visual language no. So the assertion is about what must NOT change:
       * `filter` and `opacity` are the two properties a glow is usually built from, and the
       * box size is the one that would reflow the page under the cursor.
       */
      await page.goto('/')
      const target = page.getByTestId('start-match')
      await expect(target).toBeVisible()

      const before = await target.evaluate((el) => {
        const s = getComputedStyle(el)
        const r = el.getBoundingClientRect()
        return { shadow: s.boxShadow, filter: s.filter, opacity: s.opacity, w: Math.round(r.width), h: Math.round(r.height) }
      })
      await target.hover()
      const after = await target.evaluate((el) => {
        const s = getComputedStyle(el)
        const r = el.getBoundingClientRect()
        return { shadow: s.boxShadow, filter: s.filter, opacity: s.opacity, w: Math.round(r.width), h: Math.round(r.height) }
      })

      /*
       * Two-sided, across the two projects rather than across two viewports.
       *
       * `@media (hover: hover)` is a CAPABILITY query, so the thing that decides whether it
       * applies is the device, not the width — and Playwright's `Desktop Chrome` and
       * `Pixel 7` differ in exactly that. Running the same test under both is what pins the
       * gate: a rule written without the capability query would give a phone a hover state
       * it can never clear (tap, and it stays lit until you tap elsewhere), and a
       * desktop-only test could never see it.
       */
      if (testInfo.project.name === 'desktop') {
        expect(after.shadow, 'hover changed nothing — a desktop user cannot tell this is interactive').not.toBe(
          before.shadow,
        )
      } else {
        expect(after.shadow, 'a touch device got a hover state it cannot clear').toBe(before.shadow)
      }
      expect(after.filter, 'hover applied a filter — that is the glass look ADR-007 forbids').toBe(before.filter)
      expect(after.opacity, 'hover changed opacity').toBe(before.opacity)
      expect([after.w, after.h], 'hover resized the control, which reflows the page under the cursor').toEqual([
        before.w,
        before.h,
      ])
    })

    test('a hovered board square does not change its box', async ({ page }) => {
      /*
       * Squares opt out of the 44px minimum (`min-height: 0`) and sit in a grid whose
       * columns are `1fr`. Anything that changes a square's box on hover reflows the whole
       * board as the pointer crosses it — the one place where the general rule above has a
       * specific and very visible failure.
       */
      await openBoard(page)
      const square = page.getByTestId('sq-c1')

      const before = await square.evaluate((el) => {
        const r = el.getBoundingClientRect()
        return [Math.round(r.width), Math.round(r.height)]
      })
      await square.hover()
      const after = await square.evaluate((el) => {
        const r = el.getBoundingClientRect()
        return [Math.round(r.width), Math.round(r.height)]
      })

      expect(after, `square went from ${before.join('x')} to ${after.join('x')} on hover`).toEqual(before)
    })
  })

  test.describe('the editor', () => {
    test.use({ viewport: { width: 1440, height: 900 } })

    test('the rooms list and the library both render inside the measure', async ({ page }) => {
      await page.goto('/edit')
      await expect(page.getByTestId('editor')).toBeVisible()

      for (const tab of ['editor-tab-rooms', 'editor-tab-library'] as const) {
        const control = page.getByTestId(tab)
        if (await control.count()) await control.click()
        // Same exemption as the list screens: `.editor-tabs` and `.build-top` are the
        // editor's masthead and are meant to span. What must hold the measure is the panel
        // under them.
        const widest = await page.getByTestId('editor').evaluate((node) =>
          Math.max(
            ...[...node.querySelectorAll('.screen-body, .library-list, .rooms-list')].map((c) =>
              Math.round(c.getBoundingClientRect().width),
            ),
            0,
          ),
        )
        expect(widest, `${tab} panel runs to ${widest}px`).toBeLessThanOrEqual(900)
      }
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth),
        'the editor scrolls sideways',
      ).toBe(false)
    })

    test('the board painter uses more than its phone width', async ({ page }) => {
      /*
       * `.build-grid` is `width: 300px` — a size chosen so a 6x6 board of tappable cells
       * fits a 390px phone. On a desktop it is the one thing in the editor that is doing
       * real spatial work, and 300px of it in the middle of 1440 is the phone layout
       * showing through. Asserted as "bigger than the phone value" rather than as a number,
       * so a later spacing change does not have to come back here.
       */
      await page.goto('/edit')
      // Whichever room the bundled set ships first — this is about the painter's size, not
      // about a particular room, and naming one couples the test to the content set.
      await page.locator('[data-testid^="room-open-"]').first().click()
      await page.getByTestId('room-step-board').click()

      const width = await page
        .locator('.build-grid')
        .evaluate((el) => Math.round(el.getBoundingClientRect().width))
      expect(width, `board painter is ${width}px`).toBeGreaterThan(300)
    })
  })

  test.describe('the play screen, at three desktop widths', () => {
    /*
     * The board's own size rule is the subtle part of this phase, so it is asserted at
     * three widths rather than one. On a phone the board is sized off `calc(100dvh - 200px)`
     * — 200px being the chrome stacked ABOVE it. In the two-column layout nothing is
     * stacked above it: the turn bar, the rule card, the hands and the tools all moved
     * beside it. A rule that kept subtracting 200px would waste a fifth of the height at
     * every desktop size, and one that subtracted nothing would push the board off the
     * bottom on a short window. Neither shows up at a single viewport.
     */
    for (const size of [
      { width: 1280, height: 900 },
      { width: 1440, height: 900 },
      { width: 1920, height: 1080 },
    ]) {
      test.describe(`${size.width}x${size.height}`, () => {
        test.use({ viewport: size })

        test('puts the board beside the side column, square and fully visible', async ({ page }) => {
          await openBoard(page)

          const seen = await page.evaluate(() => {
            const board = document.querySelector('[data-testid="board"]')!.getBoundingClientRect()
            const turn = document.querySelector('.turn-bar')!.getBoundingClientRect()
            const play = document.querySelector('.play')!
            return {
              w: Math.round(board.width),
              h: Math.round(board.height),
              top: Math.round(board.top),
              bottom: Math.round(board.bottom),
              viewportH: window.innerHeight,
              boardLeftOfTurnBar: Math.round(board.right) <= Math.round(turn.left) + 1,
              playScrolls: play.scrollHeight > play.clientHeight + 1,
              documentScrollsSideways: document.documentElement.scrollWidth > window.innerWidth,
            }
          })

          expect(Math.abs(seen.w - seen.h), `board is ${seen.w}x${seen.h}`).toBeLessThanOrEqual(2)
          expect(seen.boardLeftOfTurnBar, 'the turn bar is not beside the board').toBe(true)
          expect(seen.top, `board starts ${seen.top}px from the top`).toBeGreaterThanOrEqual(0)
          expect(
            seen.bottom,
            `board runs to ${seen.bottom}px in a ${seen.viewportH}px window`,
          ).toBeLessThanOrEqual(seen.viewportH)
          expect(seen.playScrolls, 'the play screen scrolls — the board did not fit its column').toBe(false)
          expect(seen.documentScrollsSideways, 'the page scrolls sideways').toBe(false)
        })
      })
    }

    test.describe('grows with the window', () => {
      test.use({ viewport: { width: 1920, height: 1080 } })

      test('is a bigger board at 1080px tall than at 700px tall', async ({ page }) => {
        /*
         * The claim the phone's `calc(100dvh - 200px)` would satisfy by accident and a
         * hard-coded desktop size would not satisfy at all. Measured as a comparison
         * rather than against a number, so it survives the next spacing change.
         */
        await openBoard(page)
        const tall = await page.getByTestId('board').evaluate((el) => Math.round(el.getBoundingClientRect().width))

        await page.setViewportSize({ width: 1920, height: 700 })
        const short = await page.getByTestId('board').evaluate((el) => Math.round(el.getBoundingClientRect().width))

        expect(tall, `board was ${tall}px at 1080px tall and ${short}px at 700px tall`).toBeGreaterThan(short)
      })
    })
  })

  test.describe('the navigation, at 1440x900 and at 1279x900', () => {
    /**
     * Where the nav sits, measured geometrically rather than by class name.
     *
     * `.tabbar` is the same element and the same component in both bands (ADR-005 — the
     * rail is a CSS presentation change, not a second nav), so asserting it exists proves
     * nothing about where it went. What distinguishes a left rail from a bottom bar is the
     * relationship between two boxes: a rail ends before the screen begins horizontally, a
     * bar begins after the screen ends vertically. Either assertion alone is satisfied by
     * a layout that stacks them wrongly.
     */
    async function navVsScreen(page: Page) {
      return page.evaluate(() => {
        const nav = document.querySelector('.tabbar')
        const screen = document.querySelector('.phone > section')
        if (!nav || !screen) return null
        const n = nav.getBoundingClientRect()
        const s = screen.getBoundingClientRect()
        return {
          leftOfScreen: Math.round(n.right) <= Math.round(s.left) + 1,
          belowScreen: Math.round(n.top) >= Math.round(s.bottom) - 1,
        }
      })
    }

    test.describe('at 1440x900', () => {
      test.use({ viewport: { width: 1440, height: 900 } })

      test('is a rail beside the screen, not a bar under it', async ({ page }) => {
        await page.goto('/')
        const nav = await navVsScreen(page)

        expect(nav, 'no tab bar and no screen to compare').not.toBeNull()
        expect(nav!.leftOfScreen, 'the nav is not beside the screen').toBe(true)
        expect(nav!.belowScreen, 'the nav is still stacked under the screen').toBe(false)
      })

      test('is absent during a match, exactly as on a phone', async ({ page }) => {
        /*
         * The rail must not become a reason to put navigation next to a board. The bar is
         * deliberately absent on `play` (a match is a thing you are IN, and leaving it goes
         * through a confirm), and moving it to the side does not change that argument —
         * a wider screen makes a mis-click easier to reach, not harder.
         */
        await openBoard(page)
        expect(await page.locator('.tabbar').count()).toBe(0)
      })
    })

    test.describe('at 1279x900', () => {
      test.use({ viewport: { width: 1279, height: 900 } })

      test('is still a bar under the screen', async ({ page }) => {
        await page.goto('/')
        const nav = await navVsScreen(page)

        expect(nav!.belowScreen, 'the nav left the bottom one pixel below the desktop band').toBe(true)
        expect(nav!.leftOfScreen, 'the nav became a rail below the desktop band').toBe(false)
      })
    })
  })

  test.describe('inside the frame band, on a window shorter than the device (674x800)', () => {
    test.use({ viewport: { width: 674, height: 800 } })

    test('keeps the whole tab bar on screen', async ({ page }) => {
      /*
       * The hole the frame band left, and the reason no existing test saw it.
       *
       * The band floors at 700px of height and draws an 844px device with `flex: none`.
       * Every viewport in 700-843 therefore got a shell TALLER than its `main`, which
       * clips — so the tab bar sat past the bottom edge, and because nothing in this app
       * scrolls the document there was no way to reach it. Three of the app's
       * destinations were simply gone. The band's other tests all render at 900px tall,
       * which is above the hole; 674x800 is an unfolded foldable, and a small tablet or
       * an Android split-screen pane lands in the same range.
       *
       * Measured against the viewport rather than against `main`, because "clipped by its
       * parent" and "off the screen" are the same defect here and only the second is what
       * the child experiences.
       */
      await page.goto('/')

      const bar = await page.evaluate(() => {
        const el = document.querySelector('.tabbar')
        if (!el) return null
        const r = el.getBoundingClientRect()
        return { top: Math.round(r.top), bottom: Math.round(r.bottom), viewport: window.innerHeight }
      })

      expect(bar, 'there is no tab bar on the title screen').not.toBeNull()
      expect(bar!.bottom, `the tab bar ends ${bar!.bottom - bar!.viewport}px below a ${bar!.viewport}px window`).toBeLessThanOrEqual(
        bar!.viewport,
      )
      expect(bar!.top, 'the tab bar starts above the top of the window').toBeGreaterThanOrEqual(0)
    })

    test('the bar stays put when the screen above it scrolls', async ({ page }) => {
      /*
       * What "the bar is fixed" means in this layout, pinned as a behaviour rather than
       * as a `position` value. The bar is NOT `position: fixed` on purpose — inside the
       * frame band it belongs to a 390px device drawn in the middle of the window, and a
       * fixed bar would leave that device and stick to the window's bottom edge instead.
       * It is pinned by being a `flex: none` child of a height-bounded shell, with the
       * screen above it owning the scroll. This asserts the outcome both approaches claim.
       */
      await page.goto('/')
      const before = await page.evaluate(() => Math.round(document.querySelector('.tabbar')!.getBoundingClientRect().top))

      await page.evaluate(() => {
        const screen = document.querySelector('.phone > section')!
        screen.scrollTop = screen.scrollHeight
        window.scrollTo(0, document.documentElement.scrollHeight)
      })

      const after = await page.evaluate(() => Math.round(document.querySelector('.tabbar')!.getBoundingClientRect().top))
      expect(after, `the tab bar moved ${after - before}px when the page scrolled`).toBe(before)
    })
  })

  test.describe('on a short laptop window (1366x640)', () => {
    test.use({ viewport: { width: 1366, height: 640 } })

    test('takes the desktop shell, because the height floor is not the frame band’s', async ({ page }) => {
      /*
       * A regression this band introduced and nearly shipped. The desktop query's height
       * floor started at 700px, copied from the frame band — where 700 is right, since that
       * band draws an 844px device. A maximized browser on a 1366x768 laptop has roughly
       * 630px of viewport height, so it satisfied neither band and fell to the base rules:
       * a 390px phone column on a 1366px window. Worse than what it replaced, since the
       * deleted `min-width: 900px` block had no height term and had been covering exactly
       * these machines.
       *
       * Paired with the landscape-phone test below. One says the floor must not be too
       * high, the other that it must not be too low; either alone justifies moving it in
       * the direction that breaks the other.
       */
      await page.goto('/')
      const shell = await shellShape(page)

      expect(shell.framed, 'a laptop window is wearing the phone frame').toBe(false)
      expect(shell.width, `shell is ${shell.width}px on a 1366px window`).toBeGreaterThan(900)
    })
  })

  test.describe(`on a landscape phone (${LANDSCAPE_PHONE.width}x${LANDSCAPE_PHONE.height})`, () => {
    test.use({ viewport: LANDSCAPE_PHONE })

    test('stays a phone, because the desktop band has a height floor', async ({ page }) => {
      /*
       * 915px wide is past several plausible desktop breakpoints and 412px tall is a
       * handset held sideways. Without `min-height: 700px` on the desktop query this
       * viewport takes the desktop layout, and `e2e/layout.spec.ts`'s landscape block —
       * which pins the whole board being on screen at this exact size — starts failing
       * for a reason that has nothing to do with what it is testing.
       */
      await page.goto('/')
      expect((await shellShape(page)).width).toBeLessThanOrEqual(420)
    })
  })
})
