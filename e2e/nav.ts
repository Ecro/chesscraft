import { type Page, expect } from '@playwright/test'

/**
 * Getting around the app, in one place.
 *
 * The Chess Craft redesign put two new screens on the way to the board — a
 * lobby where the two players name themselves, and a five-step room builder —
 * and turned the home screen's room `<select>` into a carousel. Fifteen spec
 * files walked those paths by hand, and encoding each route once here is what
 * keeps the next layout change a one-file edit rather than a fifteen-file one.
 *
 * These are the paths a PLAYER takes. Nothing here reaches past the UI: the one
 * test-only affordance in this suite is the storage state that marks onboarding
 * as seen, and even that is a value the app itself writes.
 */

/**
 * Home -> lobby -> board.
 *
 * The lobby is a real step, not a splash: it is where the players' names come
 * from, and skipping it in a helper would mean no spec ever loaded that screen.
 * `e2e/hotseat.spec.ts` goes through it by hand for exactly that reason.
 */
export async function startMatch(page: Page) {
  await page.getByTestId('start-match').click()
  await expect(page.getByTestId('lobby')).toBeVisible()
  await page.getByTestId('lobby-start').click()
  await expect(page.getByTestId('board')).toBeVisible()
}

/**
 * Starts a match against the computer at the given difficulty.
 *
 * Separate from `startMatch` rather than a parameter on it, because the lobby
 * genuinely has a different shape in this mode — the difficulty picker only
 * exists once the computer is chosen — and a helper that silently skipped it
 * when the picker was missing would hide exactly the AC-011 refusal it should
 * fail on.
 */
export async function startAiMatch(page: Page, difficulty: 'easy' | 'medium' | 'hard' = 'hard') {
  await page.getByTestId('start-match').click()
  await expect(page.getByTestId('lobby')).toBeVisible()
  await page.getByTestId('mode-ai').check()
  await page.getByTestId(`difficulty-${difficulty}`).check()
  await page.getByTestId('lobby-start').click()
  await expect(page.getByTestId('board')).toBeVisible()
}

/**
 * Waits for the computer to answer.
 *
 * `move()` returns after two taps, and in single-player the position is not
 * settled at that point — the reply arrives from a worker. A spec that read the
 * board straight after `move()` would be asserting on a half-finished turn, and
 * would do it flakily rather than consistently.
 */
export async function awaitAiReply(page: Page) {
  await expect(page.getByTestId('ai-thinking')).toHaveCount(0, { timeout: 15_000 })
}

/**
 * Steps the title screen's carousel until the given room is the one on screen.
 *
 * Bounded rather than `while`: a room id that is not in the document should
 * fail with a sentence naming it, not spin until the test times out.
 */
export async function chooseRoom(page: Page, roomId: string) {
  const card = page.getByTestId('room-card')
  await expect(card).toBeVisible()
  for (let i = 0; i < 20; i++) {
    if ((await card.getAttribute('data-room')) === roomId) return
    await page.getByTestId('room-next').click()
  }
  throw new Error(`no room ${roomId} in the carousel`)
}

/** The room builder's five steps, by the tab that opens each. */
export type BuildStep = 'board' | 'pieces' | 'place' | 'cards' | 'name'

/** Opens a room in the builder and lands on one of its steps. */
export async function openRoom(page: Page, roomId: string, step: BuildStep = 'board') {
  await page.getByTestId('tab-edit').click()
  await page.getByTestId(`room-open-${roomId}`).click()
  await page.getByTestId(`room-step-${step}`).click()
}

/** Moves between steps in an already-open room. */
export async function buildStep(page: Page, step: BuildStep) {
  await page.getByTestId(`room-step-${step}`).click()
}

/**
 * One move.
 *
 * There used to be a `liftCurtain` step here, because a completed ply raised a
 * full-screen cover the player had to tap through. That is gone — the hand-off
 * is a banner that takes no pointer events and dismisses itself — so a move is
 * just the two taps it always was. Kept as a helper because every spec that
 * plays a line used to carry its own copy, and the last change to this shape
 * broke all of them at once.
 */
export async function move(page: Page, from: string, to: string) {
  await page.getByTestId(`sq-${from}`).click()
  await page.getByTestId(`sq-${to}`).click()
}

/**
 * Into the editor, from wherever the test happens to be.
 *
 * The tab bar is deliberately absent during a match — a bar under the board is
 * an invitation to lose the position by accident — so leaving the board means
 * going home first, and the specs that were mid-match when they reached for
 * `tab-edit` all broke the same way. Accepts the confirm, because a spec that
 * asked to go to the editor has already decided.
 */
export async function goEditor(page: Page) {
  const home = page.getByTestId('go-home')
  if (await home.isVisible().catch(() => false)) {
    /*
     * Armed and disarmed around the one click that can raise a dialog.
     *
     * `page.once` that never fires STAYS ARMED, and the next `page.once` a spec
     * registers for its own confirm ends up second in line — the first handler
     * accepts, and the spec's throws "already handled". Leaving a listener
     * behind is a per-test landmine, so this one is removed either way.
     */
    const accept = (d: import('@playwright/test').Dialog) => void d.accept()
    page.on('dialog', accept)
    await home.click()
    page.off('dialog', accept)
  }
  await page.getByTestId('tab-edit').click()
}

/**
 * Fills in a room across the builder's five steps.
 *
 * The room form used to be one screen of tick-lists and a `<select>` for the
 * board, so every spec that made a room did it in six lines. It is five steps
 * now — paint, pieces, place, cards, name — and the board is edited in place
 * rather than chosen, so a new room starts on a copy of the document's first
 * board rather than on one the caller names.
 *
 * Assumes the builder is already open on a room.
 */
export async function fillRoom(
  page: Page,
  room: { name?: string; pieces?: string[]; rules?: string[]; skills?: string[] },
) {
  if (room.pieces?.length) {
    await buildStep(page, 'pieces')
    for (const id of room.pieces) await page.getByTestId(`room-piece-${id}`).click()
  }
  if (room.rules?.length || room.skills?.length) {
    await buildStep(page, 'cards')
    for (const id of room.rules ?? []) await page.getByTestId(`room-rule-${id}`).click()
    for (const id of room.skills ?? []) await page.getByTestId(`room-skill-${id}`).click()
  }
  if (room.name !== undefined) {
    await buildStep(page, 'name')
    await page.getByTestId('room-name').fill(room.name)
  }
  await page.getByTestId('room-save').click()
  await expect(page.getByTestId('room-errors')).toHaveCount(0)
}

/** How many rooms the title screen's carousel is offering. */
export async function roomCount(page: Page): Promise<number> {
  return page.locator('.room-dots li').count()
}

/**
 * Answer the maker gallery, if it is asking (AC-009).
 *
 * A record that does not exist yet opens on "what do you want to start from",
 * and the form is `hidden` until that is answered — so every spec that fills a
 * field on a fresh record has to make the choice a child would make. "Start
 * from nothing" is the choice that keeps these specs about what they were
 * already about.
 *
 * Guarded by `isVisible`, so it is a no-op when a record is already open. Call
 * it where a form is OPENED — after `editor-new`, after an `editor-kind`
 * switch — and never mid-flow: answering the gallery REPLACES the draft, so a
 * call after fields are filled throws that work away.
 */
export async function startBlank(page: Page) {
  const blank = page.getByTestId('gallery-blank')
  if (await blank.isVisible()) await blank.click()
}
