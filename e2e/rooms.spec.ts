import { type Page, expect, test } from '@playwright/test'
import { useSliceContent } from './content'

/**
 * PLAN Phase 9a exit criterion — the editor is a place a child assembles a
 * room, names it in their own words, keeps several, and plays one.
 *
 * Every assertion here is made from OUTSIDE the editor wherever it can be. A
 * room that saves is not the claim; a room that saves and then decides what the
 * match deals is. `built-but-not-wired` is a failure this project has shipped
 * once already, and the editor's own success message cannot see it.
 */

async function openEditor(page: Page) {
  await useSliceContent(page)
  await page.getByTestId('tab-edit').click()
}

async function openLibrary(page: Page, kind: string) {
  await page.getByTestId('editor-tab-library').click()
  await page.getByTestId('editor-kind').selectOption(kind)
}

test('a child builds a room, names it in Korean, and plays it from home', async ({ page }) => {
  await openEditor(page)

  await page.getByTestId('room-new').click()
  await page.getByTestId('room-name').fill('토끼네 방')
  await page.getByTestId('room-board').selectOption('board.slice')

  for (const id of ['piece.king', 'piece.archer']) {
    await page.getByTestId(`room-piece-${id}`).check()
  }
  await page.getByTestId('room-rule-rule.beacon-rush').check()
  // Exactly three skill cards, because an opening offer IS three distinct cards
  // (AC-005). A pool of three therefore forces the offer, with no seed to go
  // stale — and it makes the assertion below about THIS ROOM'S pool rather than
  // about the shipped one, which a room that saved but never reached the match
  // would still satisfy.
  for (const id of ['skill.warp', 'skill.hold', 'skill.rally']) {
    await page.getByTestId(`room-skill-${id}`).check()
  }
  await page.getByTestId('room-save').click()
  await expect(page.getByTestId('room-errors')).toHaveCount(0)

  await page.getByTestId('tab-play').click()
  // Chosen by the Korean name the child typed, not by an id — that the name
  // reached the picker at all is half of what ADR-020 bought.
  await page.getByTestId('preset-select').selectOption({ label: '토끼네 방' })
  await page.getByTestId('start-match').click()

  await expect(page.getByTestId('sq-d1')).toHaveAttribute('data-piece', 'piece.king')
  await expect(page.getByTestId('sq-b1')).toHaveAttribute('data-piece', 'piece.archer')

  await expect(page.locator('[data-testid^="offer-"]')).toHaveCount(3)
  const offered = await page
    .locator('[data-testid^="offer-"]')
    .evaluateAll((els) => els.map((e) => e.getAttribute('data-card') ?? ''))
  expect(offered.sort()).toEqual(['skill.hold', 'skill.rally', 'skill.warp'])
  await expect(page.getByTestId('rule-card')).toHaveAttribute('data-rule', 'rule.beacon-rush')
})

test('a room refuses to give up its last piece', async ({ page }) => {
  // `pieceIds` carries `.min(1)`, so an empty room is a document that will not
  // load. The form refuses BEFORE the save rather than after, because a
  // validator message about `pieceIds` is not something a child can act on.
  await openEditor(page)
  await page.getByTestId('room-open-preset.slice').click()

  await page.getByTestId('room-piece-piece.archer').uncheck()
  // `.click()` rather than `.uncheck()`: Playwright's `uncheck` FAILS when the
  // state does not change, and the state not changing is the whole assertion.
  await page.getByTestId('room-piece-piece.king').click()

  await expect(page.getByTestId('room-piece-piece.king')).toBeChecked()
  await expect(page.getByTestId('room-last-piece-notice')).toBeVisible()
})

test('the library lists a record no room uses, and says so', async ({ page }) => {
  await openEditor(page)
  await openLibrary(page, 'skillCard')

  await page.getByTestId('editor-new').click()
  await page.getByTestId('editor-id').fill('skill.orphan')
  await page.getByTestId('editor-name').fill('외톨이')
  await page.getByTestId('editor-text').fill('아무 방에도 없어요')
  await page.getByTestId('editor-cost').fill('1')
  await page.getByTestId('editor-uses').fill('1')
  await page.getByTestId('editor-add-effect').click()
  await page.getByTestId('vocab-trigger-on_play').click()
  await page.getByTestId('vocab-action-win').click()
  await page.getByTestId('editor-save').click()
  await expect(page.getByTestId('editor-errors')).toHaveCount(0)

  // Listed — the black hole ADR-026 guards against is a record that exists and
  // appears nowhere, which no error message would ever mention.
  await expect(page.getByTestId('library-open-skill.orphan')).toBeVisible()
  await expect(page.getByTestId('library-unused-skill.orphan')).toBeVisible()
  // And the badge discriminates: a card the shipped room draws from is not
  // badged, so the assertion above cannot pass on a badge painted on every row.
  await expect(page.getByTestId('library-unused-skill.warp')).toHaveCount(0)
})

test('renaming a record through the form leaves one record, with its text', async ({ page }) => {
  await openEditor(page)
  await openLibrary(page, 'piece')

  // A record nothing references yet, because renaming one that IS referenced is
  // a broken cross-reference and the validator is right to refuse it — that is
  // 9b's guard, not this claim.
  await page.getByTestId('editor-new').click()
  await page.getByTestId('editor-id').fill('piece.rabbit')
  await page.getByTestId('editor-name').fill('토끼')
  await page.getByTestId('editor-text').fill('한 칸씩 콩콩 뛰어요')
  await page.getByTestId('editor-save').click()
  await expect(page.getByTestId('editor-errors')).toHaveCount(0)

  await page.getByTestId('editor-id').fill('piece.bunny')
  await page.getByTestId('editor-save').click()
  await expect(page.getByTestId('editor-errors')).toHaveCount(0)

  // Exactly one record: before Phase 8's rename primitive was threaded through
  // this form, a changed id APPENDED and orphaned the original (R10).
  await expect(page.getByTestId('library-open-piece.bunny')).toBeVisible()
  await expect(page.getByTestId('library-open-piece.rabbit')).toHaveCount(0)

  // The text moved with it, and the assertion is made from the PLAYER'S screen.
  // A `rekeyStrings` unit test cannot see this half: the overlay keys move, and
  // the record's own `nameKey` has to be re-derived to match, or the piece
  // renders a dotted key everywhere it appears.
  await page.getByTestId('tab-play').click()
  await page.getByTestId('open-rules').click()
  await expect(page.getByTestId('rules')).toContainText('토끼')
  await expect(page.getByTestId('rules')).not.toContainText('piece.bunny.name')
})
