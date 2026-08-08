import { expect, test } from '@playwright/test'
import { startMatch } from './nav'

/**
 * Piece info affordances — AC-001, AC-002, AC-004, AC-006, AC-007, AC-008, AC-010.
 *
 * Three routes reach one sheet, and the spec is organised by CLAIM rather than
 * by route, because the interesting failures are the ones a per-route file
 * would split in half: a press that also moves a piece, a tooltip that vanishes
 * as the pointer reaches it, an inspect that quietly disarms a card.
 *
 * Project sensitivity is explicit rather than ambient. Hover and the `i` key
 * only exist on `desktop`; the OS-callout claims only mean anything on
 * `mobile-webkit`, since Chromium has none of the behaviours they suppress.
 * A test that skipped silently on the wrong project would report coverage the
 * matrix does not have, so each states its reason.
 */

/** How long the arbiter holds before a press counts. Mirrors PRESS_HOLD_MS. */
const HOLD_MS = 450

/** Presses a square and holds, without moving — the gesture AC-002 is about. */
async function pressAndHold(page: import('@playwright/test').Page, testId: string) {
  // `hover()` rather than raw `mouse.move` to a `boundingBox()` centre, and the
  // difference is not cosmetic: the box is page coordinates read at one instant,
  // and this app moves things during the first seconds of a match (the rule
  // banner is on screen for 3.2s and the layout closes up when it goes). A
  // press aimed at a stale centre lands on nothing and looks exactly like an
  // arbiter that did not fire. `hover()` re-resolves and scrolls into view.
  const square = page.getByTestId(testId)
  await square.hover()
  await page.mouse.down()
  await page.waitForTimeout(HOLD_MS + 150)
  await page.mouse.up()
}

/** The square a white pawn starts on, and the one an enemy piece starts on. */
const OWN_PAWN = 'sq-a2'
const ENEMY_PIECE = 'sq-a6'

/**
 * A match opens in the DRAFT phase — one card per player before anyone moves —
 * and the board refuses square input until that is done. Every claim in this
 * file is about the play phase, so getting there is setup rather than subject.
 */
/**
 * Clears whatever draft is pending and lands in the play phase.
 *
 * Written as "while an offer is on screen" rather than "click twice", because
 * the two are not the same claim: a fresh match opens with one pick per player,
 * but a restarted one does not always, and a spec that hardcodes the count
 * fails on the shape of the draft rather than on anything it is testing.
 */
async function passDraft(page: import('@playwright/test').Page) {
  const offers = page.locator('[data-testid^="offer-"]')
  for (let i = 0; i < 6; i++) {
    if ((await offers.count()) === 0) break
    await offers.first().click()
  }
  await expect(page.getByTestId('phase')).toHaveAttribute('data-phase', 'play')
}

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await startMatch(page)
  await expect(page.getByTestId('phase')).toHaveAttribute('data-phase', 'draft')
  await passDraft(page)
})

test('selecting a piece fills the strip without reflowing the board', async ({ page }) => {
  const board = page.getByTestId('board')
  const hintBar = page.locator('.hint-bar')
  /*
   * The REGION's height, not only the board's position.
   *
   * Measuring the board alone passes for the wrong reason and this test did,
   * once: the hint bar sits BELOW the board, so a region that grows pushes the
   * legend and the hotbar down while the board sits perfectly still. The first
   * implementation reserved 72px for a strip that measured 85, and the board
   * assertion never noticed. What the criterion is actually about is that
   * nothing moves — so the region's own height is the measurement, and the
   * document not scrolling is the backstop.
   */
  const geometry = async () => ({
    boardY: (await board.boundingBox())?.y,
    boardH: (await board.boundingBox())?.height,
    hintH: (await hintBar.boundingBox())?.height,
    scrolls: await page.evaluate(() => document.documentElement.scrollHeight > document.documentElement.clientHeight),
  })

  const before = await geometry()
  expect(before.scrolls, 'the match screen does not scroll, before or after').toBe(false)

  await page.getByTestId(OWN_PAWN).click()

  const strip = page.getByTestId('piece-strip')
  await expect(strip).toBeVisible()
  // The name carries the side as a WORD (ADR-005): off the board there is no
  // corner marker, so a tint-only cue would make colour the sole channel.
  await expect(page.getByTestId('strip-name')).not.toBeEmpty()

  expect(await geometry()).toEqual(before)
})

test('the strip names the press-and-hold gesture', async ({ page }) => {
  await page.getByTestId(OWN_PAWN).click()
  const hint = page.getByTestId('press-hint')
  await expect(hint).toBeVisible()
  // A gesture nobody is told about is found by accident, if at all (AC-010).
  expect((await hint.innerText()).trim().length).toBeGreaterThan(0)
})

test('press and hold opens the piece sheet without moving', async ({ page }) => {
  const beforePly = await page.getByTestId('phase').innerText()

  await pressAndHold(page, OWN_PAWN)

  await expect(page.getByTestId('peek-sheet')).toBeVisible()
  // AC-002: reading a piece is not a move, and it is not a selection either.
  expect(await page.getByTestId('phase').innerText()).toBe(beforePly)
  await expect(page.getByTestId('piece-strip')).toHaveCount(0)
})

test('own piece, enemy piece and painted square each open; bare square does not', async ({ page }) => {
  // AC-004 row 1 — the mover's own piece.
  await pressAndHold(page, OWN_PAWN)
  await expect(page.getByTestId('peek-sheet')).toBeVisible()
  await page.getByTestId('peek-close').click()

  // AC-004 row 2 — the opponent's. This row is the whole reason the press does
  // not ride the drag path: `beginDrag` refuses a square that is not the
  // mover's own, so a press bolted onto it could never reach this piece.
  await pressAndHold(page, ENEMY_PIECE)
  await expect(page.getByTestId('peek-sheet')).toBeVisible()
  await expect(page.getByTestId('peek-sheet')).toContainText(/\S/)
  await page.getByTestId('peek-close').click()

  // AC-004 row 4 — a square with neither a piece nor paint opens nothing.
  const bare = page.locator('[data-testid^="sq-"][data-piece=""][data-square-type=""]').first()
  await expect(bare, 'the opening position must have a bare square to press').toBeVisible()
  const id = await bare.getAttribute('data-testid')
  expect(id).toBeTruthy()
  await pressAndHold(page, id as string)
  await expect(page.getByTestId('peek-sheet')).toHaveCount(0)
})

test('a piece sheet shows a move grid or says it cannot be drawn, never a blank', async ({ page }) => {
  await pressAndHold(page, OWN_PAWN)
  await expect(page.getByTestId('peek-sheet')).toBeVisible()
  // ADR-007: exactly one branch. Asserting the disjunction rather than the
  // grid alone is what makes an empty diagram a failure instead of a pass.
  const grid = await page.getByTestId('move-grid').count()
  const notice = await page.getByTestId('move-undrawable').count()
  expect(grid + notice).toBe(1)
})

test('inspecting while a card is armed preserves the arming', async ({ page }) => {
  const hintBar = page.locator('.hint-bar')

  /*
   * Finding a card that can actually be armed, rather than assuming the one
   * this match dealt can be.
   *
   * The draft is seeded at random and not every shipped skill card has a legal
   * target at the opening — some quantify over a home rank that is still full.
   * Arming such a card is REFUSED, which is correct behaviour and useless as a
   * precondition, and it is why this test failed on one project and passed on
   * another with the same code: the two runs drew different cards.
   *
   * So it redraws rather than skipping. A skip here would be indistinguishable
   * from coverage, and AC-006 is precisely the criterion a silent skip would
   * hide — the arming state is the one this feature had to be built around.
   */
  let armed = false
  for (let attempt = 0; attempt < 8 && !armed; attempt++) {
    const card = page.locator('[data-testid^="hand-white-"]').first()
    await expect(card).toBeVisible()
    await card.click()
    /*
     * Wait for ARMING specifically, and let the wait time out when it does not
     * happen. Two weaker versions failed first, both instructively:
     *
     *   - reading `data-pending` straight after the click passed on an idle
     *     machine and burned all eight draws under load, because React had not
     *     re-rendered yet;
     *   - waiting for `data-state` to be `card` OR `rejection` was no better,
     *     since a rejection from the PREVIOUS attempt is still on screen and
     *     the wait resolved instantly against a stale value.
     *
     * Waiting for the one state that means success has neither problem: it is
     * satisfied only by this click, and its timeout IS the "not armable"
     * answer. The catch is therefore load-bearing rather than defensive.
     */
    armed = await hintBar
      .evaluate((el) => el.getAttribute('data-pending') === 'true')
      .then(async (already) => {
        if (already) return true
        try {
          await expect(hintBar).toHaveAttribute('data-pending', 'true', { timeout: 3_000 })
          return true
        } catch {
          return false
        }
      })
    if (armed) break
    /*
     * Redraw. The confirm is NOT optional bookkeeping — `startNew` guards a
     * match in progress with `window.confirm` (`MatchHost.tsx`), and Playwright
     * auto-DISMISSES an unhandled dialog. Without this line all eight restarts
     * silently no-op, the same unarmable hand is clicked eight times, and the
     * test fails on its own precondition while looking like a product bug.
     * That is exactly how this test failed before the guard was found.
     */
    page.once('dialog', (dialog) => dialog.accept())
    await page.getByTestId('new-match').click()
    await passDraft(page)
  }
  expect(armed, 'no armable skill card after 8 draws — the precondition, not the claim, failed').toBe(true)
  const hintBefore = await hintBar.innerText()

  // The enemy piece specifically: `beginDrag` refuses it AND refuses everything
  // while a card is armed, so this single press exercises both of the guards
  // the inspect route had to be built around.
  await pressAndHold(page, ENEMY_PIECE)
  await expect(page.getByTestId('peek-sheet')).toBeVisible()
  await page.getByTestId('peek-close').click()

  // AC-006 — the card is still armed and still asking for the same thing.
  await expect(hintBar).toHaveAttribute('data-pending', 'true')
  expect(await hintBar.innerText()).toBe(hintBefore)
})

test('hover tooltip is dismissible, hoverable and persistent; focus plus i opens the sheet', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'hover and physical keys exist on the desktop project only')

  const square = page.getByTestId(OWN_PAWN)
  await square.hover()
  const tip = page.getByTestId('square-tip')
  await expect(tip).toBeVisible()

  // PERSISTENT — nothing times it out. If a timer were added this would flake,
  // which is the point of waiting rather than asserting immediately.
  await page.waitForTimeout(1_200)
  await expect(tip).toBeVisible()

  // HOVERABLE — the pointer moves onto the tooltip itself and it survives.
  // It is a DOM child of the square, so `mouseleave` never fires; a tooltip
  // rendered as a sibling would disappear exactly here.
  const tipBox = await tip.boundingBox()
  if (tipBox) await page.mouse.move(tipBox.x + tipBox.width / 2, tipBox.y + tipBox.height / 2)
  await expect(tip).toBeVisible()

  // DISMISSIBLE — Escape, without moving the pointer.
  await page.keyboard.press('Escape')
  await expect(tip).toHaveCount(0)

  // The keyboard route reaches the SAME sheet the pointer route opens, which
  // is what makes this a comparison rather than a restatement.
  await square.focus()
  await page.keyboard.press('i')
  await expect(page.getByTestId('peek-sheet')).toBeVisible()
})

test('square hover changes bevel only', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'there is no hover state on a touch project, by design')

  const square = page.getByTestId(OWN_PAWN)
  const read = () =>
    square.evaluate((el) => {
      const s = getComputedStyle(el)
      const r = el.getBoundingClientRect()
      return { filter: s.filter, opacity: s.opacity, w: Math.round(r.width), h: Math.round(r.height) }
    })

  const idle = await read()
  await square.hover()
  const hovered = await read()

  // AC-009's second clause and the recorded rule behind it: a block that lights
  // up on hover looks like glass, and a control that grows reflows the board
  // while the pointer is crossing it.
  expect(hovered.filter).toBe(idle.filter)
  expect(hovered.opacity).toBe(idle.opacity)
  expect(hovered.w).toBe(idle.w)
  expect(hovered.h).toBe(idle.h)
})

test('a long press raises no system menu and leaves scrolling intact', async ({ page }, testInfo) => {
  test.skip(
    testInfo.project.name !== 'mobile-webkit',
    'AC-008 is about WebKit callouts; asserting it on Chromium certifies a remedy against an engine that never needed it',
  )

  const square = page.getByTestId(OWN_PAWN)
  const style = await square.evaluate((el) => {
    const s = getComputedStyle(el)
    return {
      select: s.userSelect || s.webkitUserSelect,
      touch: s.touchAction,
    }
  })
  expect(style.select).toBe('none')

  /*
   * `-webkit-touch-callout` is NOT asserted here, and the omission is the
   * honest half of ADR-006 rather than an oversight.
   *
   * The property is iOS-only. Playwright's WebKit is the same engine built for
   * Linux, where it is not implemented — so it is dropped at parse time and is
   * absent from `getComputedStyle`, from `cssText`, and from the CSSOM
   * entirely. An assertion on it here would fail against a CORRECT
   * implementation and could never pass, which is worse than no assertion:
   * it would be removed by the next person and remembered by nobody.
   *
   * What this project CAN establish is split in two, both real:
   *   - here, on the engine: `user-select`, `touch-action`, and that a long
   *     press raises no context menu — all evaluated by WebKit itself;
   *   - in `tests/ui/touch-hardening.test.ts`, on the source: that the
   *     declaration shipped and is scoped to the board's squares.
   * And that iOS honours it at runtime, given the open WebKit regression
   * 231161 on the magnifier, is R4 in the PLAN — detected by the manual pass
   * on a real device, recorded rather than quietly claimed.
   */
  // `manipulation` drops the double-tap delay WITHOUT disabling panning —
  // `none` would have passed a naive check while breaking the board's scroll.
  expect(style.touch).toBe('manipulation')

  let contextMenus = 0
  await page.exposeFunction('__ctx', () => { contextMenus += 1 })
  await page.evaluate(() => window.addEventListener('contextmenu', () => (window as unknown as { __ctx: () => void }).__ctx()))
  await pressAndHold(page, OWN_PAWN)
  expect(contextMenus).toBe(0)
})
