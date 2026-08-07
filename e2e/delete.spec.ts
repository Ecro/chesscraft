import { type Page, expect, test } from '@playwright/test'
import { useSliceContent } from './content'
import { buildStep, chooseRoom, fillRoom, goEditor, roomCount, startMatch } from './nav'

/**
 * PLAN Phase 9b exit criterion — deleting, and being refused, from the screens.
 *
 * The unit tests own `deleteRecord`'s five refusals. What only an e2e can show
 * is the half that matters to the child: that a deleted room actually leaves the
 * place they pick rooms from, that the rooms they kept still play, and that a
 * refusal names the room in words they can act on rather than reporting that
 * something is referenced.
 */

async function openEditor(page: Page) {
  await useSliceContent(page)
  await goEditor(page)
}

test('a deleted room leaves the picker, and the rooms that remain still play', async ({ page }) => {
  await openEditor(page)

  // A second room, because the shipped slice has exactly one and the last room
  // cannot be deleted — that refusal is its own case below.
  await page.getByTestId('room-new').click()
  await fillRoom(page, { name: '버릴 방', pieces: ['piece.king'] })
  await page.getByTestId('room-back').click()

  await page.getByTestId('tab-play').click()
  // Counted off the carousel's dots — one per room — since the `<select>` went.
  expect(await roomCount(page)).toBe(2)

  await goEditor(page)
  page.once('dialog', (d) => void d.accept())
  await page.getByTestId('room-delete-preset.room-1').click()
  await expect(page.getByTestId('room-open-preset.room-1')).toHaveCount(0)

  // Gone from the one control the whole product funnels through — asserting it
  // left the editor's own list would not have shown that.
  await page.getByTestId('tab-play').click()
  expect(await roomCount(page)).toBe(1)
  await expect(page.getByTestId('room-card')).toHaveAttribute('data-room', 'preset.slice')

  // And what survived is still playable, which is the claim a delete most
  // plausibly breaks: the document has to come back through the loader intact.
  await startMatch(page)
  await expect(page.getByTestId('sq-d1')).toHaveAttribute('data-piece', 'piece.king')
})

test('the last room cannot be deleted', async ({ page }) => {
  // No schema rule stands behind this one — `presets` has no array minimum, so
  // an empty document validates and leaves nothing to play.
  await openEditor(page)
  page.once('dialog', (d) => void d.accept())
  await page.getByTestId('room-delete-preset.slice').click()

  await expect(page.getByTestId('room-delete-refusal')).toBeVisible()
  await expect(page.getByTestId('room-open-preset.slice')).toBeVisible()

  // Asserted from the Play tab too, not only from the editor's own list: a guard
  // that failed while the list happened to be stale would satisfy the two lines
  // above and leave the child with nothing to play — which is the entire reason
  // this guard exists.
  await page.getByTestId('tab-play').click()
  expect(await roomCount(page)).toBe(1)
  await startMatch(page)
  await expect(page.getByTestId('sq-d1')).toHaveAttribute('data-piece', 'piece.king')
})

test('deleting a piece a room uses is refused by naming that room, and works once it is freed', async ({ page }) => {
  await openEditor(page)

  // A piece of the child's own, so the refusal is about THEIR room rather than
  // about the shipped board's opening position.
  await page.getByTestId('editor-tab-library').click()
  await page.getByTestId('editor-kind').selectOption('piece')
  await page.getByTestId('editor-new').click()
  await page.getByTestId('editor-id').fill('piece.rabbit')
  await page.getByTestId('editor-name').fill('토끼')
  await page.getByTestId('editor-text').fill('한 칸씩 콩콩 뛰어요')
  await page.getByTestId('editor-save').click()
  await expect(page.getByTestId('editor-errors')).toHaveCount(0)

  // Give the room a Korean name, so the refusal has a name to say back.
  await page.getByTestId('editor-tab-rooms').click()
  await page.getByTestId('room-open-preset.slice').click()
  await fillRoom(page, { name: '토끼네 방', pieces: ['piece.rabbit'] })
  await page.getByTestId('room-back').click()

  await page.getByTestId('editor-tab-library').click()
  page.once('dialog', (d) => void d.accept())
  await page.getByTestId('library-delete-piece.rabbit').click()

  // The room by NAME. "이 기물은 참조되고 있습니다" would be true and useless.
  await expect(page.getByTestId('library-delete-refusal')).toContainText('토끼네 방')
  await expect(page.getByTestId('library-open-piece.rabbit')).toBeVisible()

  // Free it where the refusal said it was held, and the same delete goes through.
  await page.getByTestId('editor-tab-rooms').click()
  await page.getByTestId('room-open-preset.slice').click()
  await buildStep(page, 'pieces')
  // A toggle button since the rebuild, so a plain click rather than `uncheck`.
  await page.getByTestId('room-piece-piece.rabbit').click()
  await page.getByTestId('room-save').click()
  await expect(page.getByTestId('room-errors')).toHaveCount(0)

  await page.getByTestId('editor-tab-library').click()
  page.once('dialog', (d) => void d.accept())
  await page.getByTestId('library-delete-piece.rabbit').click()
  await expect(page.getByTestId('library-open-piece.rabbit')).toHaveCount(0)
  await expect(page.getByTestId('library-delete-refusal')).toHaveCount(0)

  // The room still plays afterwards — a delete that leaves a document the loader
  // refuses would take the whole app down, not one record.
  await page.getByTestId('tab-play').click()
  await startMatch(page)
  await expect(page.getByTestId('sq-d1')).toHaveAttribute('data-piece', 'piece.king')
})
