import { expect, test } from '@playwright/test'
import { startMatch } from './nav'

/**
 * PLAN Phase 5 — the spec that runs with motion ON.
 *
 * The rest of the suite runs under `reducedMotion: 'reduce'` so that 41 specs
 * driving a board by clicking are not racing a transition. That stabilises them
 * and, on its own, would mean the animation path is never executed by any test
 * at all — which is `[fail:test] test-setup-hides-the-failure-path`, recorded in
 * this repo after a clipboard e2e granted the permission whose absence was the
 * whole risk. This file is the other half of that arrangement: it opts back in.
 *
 * What it can honestly assert is that the machinery is live and that it settles
 * — not that the easing is tasteful. A test cannot hold an opinion about how a
 * move feels, and one pretending to would be worse than none.
 */

// This project's Playwright typings expose `reducedMotion` through
// `contextOptions` rather than as a top-level test option, so the opt-in is
// spelled the way the types accept — the effect is the same.
test.use({ contextOptions: { reducedMotion: 'no-preference' } })

/** Onboarding is dismissed suite-wide by the config's `storageState`. */
async function openBoard(page: import('@playwright/test').Page) {
  await page.goto('/')
  await startMatch(page)
  for (let i = 0; i < 4; i++) {
    const offer = page.locator('[data-testid^="offer-"]').first()
    if ((await offer.count()) === 0) break
    await offer.click()
  }
}

test('motion is actually declared once it is allowed', async ({ page }) => {
  /*
   * This used to read `transitionDuration` off a square. The redesign animates
   * the PIECE — a stepped slide from where it came from, because a sprite eased
   * smoothly renders at sub-pixel offsets and antialiases the very edges
   * `crispEdges` exists to keep hard — so the duration to probe moved with it.
   *
   * Probed on the element that carries the animation rather than on the token,
   * because `--motion-move-duration: 0ms` under `reduce` and a rule that forgot
   * to reference the token look identical from the token's side.
   */
  await openBoard(page)
  await page.getByTestId('sq-d2').click()
  await page.getByTestId('sq-d3').click()
  const duration = await page
    .locator('[data-last="to"] .piece')
    .evaluate((el) => getComputedStyle(el).animationDuration)
  // Under `reduce` this resolves to 0s; here it must not.
  expect(duration).not.toBe('0s')
  expect(duration).not.toBe('')
})

test('the board settles after a move and the highlight lands on the right two squares', async ({ page }) => {
  await openBoard(page)
  await page.getByTestId('sq-d2').click()
  await page.getByTestId('sq-d3').click()

  // Playwright auto-waits for actionability, so reaching here already means the
  // board accepted input during/after the animation rather than deadlocking.
  await expect(page.getByTestId('sq-d2')).toHaveAttribute('data-last', 'from')
  await expect(page.getByTestId('sq-d3')).toHaveAttribute('data-last', 'to')
  await expect(page.locator('[data-last]')).toHaveCount(2)
})

test('a move can still be made by tap while motion is on', async ({ page }) => {
  // Drag is added this phase ALONGSIDE tap, and every pre-existing spec drives
  // the board by clicking. If motion made tap unreliable the whole suite would
  // go flaky at once, so it is asserted here deliberately rather than inferred
  // from the other specs passing under `reduce`.
  await openBoard(page)
  await page.getByTestId('sq-d2').click()
  await page.getByTestId('sq-d3').click()
  await expect(page.getByTestId('sq-d3')).not.toHaveAttribute('data-piece', '')

  const undone = page.getByTestId('undo')
  await undone.click()
  await expect(page.locator('[data-last]')).toHaveCount(0)
})

test('a piece can be dragged to its destination (#12)', async ({ page }) => {
  await openBoard(page)

  // Driven with pointer-producing mouse primitives, NOT `dragTo`. The first
  // implementation used HTML5 drag-and-drop and `dragTo` passed against it —
  // while iOS Safari never dispatches those events for a finger, so the gesture
  // was dead on the only platform this product targets and the test said
  // otherwise. `mouse.down/move/up` raise the same pointer events a touch does,
  // so this exercises the path a player actually takes.
  const from = await page.getByTestId('sq-e2').boundingBox()
  const to = await page.getByTestId('sq-e3').boundingBox()
  expect(from && to, 'both squares must be laid out').toBeTruthy()

  await page.mouse.move(from!.x + from!.width / 2, from!.y + from!.height / 2)
  await page.mouse.down()
  await page.mouse.move(to!.x + to!.width / 2, to!.y + to!.height / 2, { steps: 8 })
  await page.mouse.up()

  await expect(page.getByTestId('sq-e3')).not.toHaveAttribute('data-piece', '')
  await expect(page.getByTestId('sq-e2')).toHaveAttribute('data-piece', '')
})
