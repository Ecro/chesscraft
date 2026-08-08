import { expect, test } from '@playwright/test'
import { useSliceContent } from './content'
import { goEditor } from './nav'

/**
 * AC-007 — the half this screen cannot draw is shown, read-only, and left alone.
 *
 * This replaces `editor-refusal.spec.ts`, whose subject was the refusal → tab
 * handoff: the note named the `자세히` tab and the test proved that tab opened from
 * there. PLAN Phase 6 removed the tab, so that spec could not be edited into truth.
 *
 * The subject is a SHIPPED record, not a constructed one. `piece.archer` in the
 * slice set carries two effects, which the sentence caps at one — so it arrived in
 * exactly the state AC-007 is about, and it is the record whose existence corrected
 * this criterion: the earlier version of the code disabled saving for it, which made
 * a shipped piece uneditable. Reaching the state through the UI is no longer
 * possible at all (Phase 7 deleted the only controls that could author it), which is
 * why an existing record is the honest route rather than a convenience.
 *
 * Playwright rather than jsdom for the reason that has not changed: `fireEvent`
 * ignores visibility, so a note rendered but not visible passes there and is
 * invisible to a child.
 */

async function openArcher(page: import('@playwright/test').Page) {
  await useSliceContent(page)
  await goEditor(page)
  await page.getByTestId('editor-tab-library').click()
  await page.getByTestId('editor-kind').selectOption('piece')
  await page.getByTestId('library-open-piece.archer').click()
}

test('the undrawable half is read-only and says what it holds', async ({ page }) => {
  await openArcher(page)

  const readOnly = page.getByTestId('editor-readonly')
  await expect(readOnly).toBeVisible()
  await expect(page.getByTestId('editor-sentence')).toHaveCount(0)

  // It says what the record DOES rather than naming a destination — one line per
  // effect, so a count that collapsed would read as "this record does less than it
  // does" — and it must not name the tab that no longer exists.
  await expect(readOnly).not.toContainText('자세히')
  await expect(page.getByTestId('editor-readonly-lines').locator('li')).toHaveCount(2)
})

test('only that half yields — the movement grid stays editable', async ({ page }) => {
  await openArcher(page)

  // The two halves are independent. An earlier version OR-ed them, which took the
  // grid away from a piece whose EFFECTS were the unreadable part.
  await expect(page.getByTestId('editor-moves')).toBeVisible()
  await expect(page.getByTestId('piece-cell-1,2')).toBeEnabled()
  await expect(page.getByTestId('piece-forward')).toBeEnabled()
})

test('saving stays enabled, and writes the undrawable half back unchanged', async ({ page }) => {
  await openArcher(page)

  const before = JSON.parse((await page.getByTestId('editor-draft-json').textContent()) ?? 'null')
  await expect(page.getByTestId('editor-save')).toBeEnabled()

  // Edit the half that IS editable, save, and re-open: the effects the screen could
  // not draw must survive byte-for-byte. This is AC-007's oracle after the
  // amendment — a save is allowed, so what it writes has to be proved rather than
  // prevented.
  await page.getByTestId('piece-cell-2,2').click()
  await page.getByTestId('editor-save').click()
  await expect(page.getByTestId('editor-saved')).toBeVisible()

  await page.getByTestId('editor-tab-library').click()
  await page.getByTestId('library-open-piece.archer').click()
  const after = JSON.parse((await page.getByTestId('editor-draft-json').textContent()) ?? 'null')

  expect(after.effects).toEqual(before.effects)
  // And the edit really landed, so this is not a test of a save that did nothing.
  expect(JSON.stringify(after.movement)).not.toBe(JSON.stringify(before.movement))
})
