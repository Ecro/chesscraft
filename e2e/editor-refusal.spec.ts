import { type Page, expect, test } from '@playwright/test'
import { useSliceContent } from './content'
import { goEditor } from './nav'

/**
 * AC-011 — what the maker cannot hold, it refuses BY NAME.
 *
 * The model half of this criterion lives in `tests/ui/piece-grid-refusal.test.ts`,
 * which proves the reader rejects the right records and leaves them untouched.
 * What only a browser can prove is the other half: that the refusal is an
 * affordance rather than a dead end — the note is on screen, it names the tab
 * that can hold the record, and that tab really does open from there.
 *
 * Playwright rather than jsdom for exactly that reason. jsdom's `fireEvent`
 * ignores visibility, so a note rendered inside a hidden panel would pass there
 * and be invisible to a child.
 */

/**
 * An EXISTING piece, open in the form.
 *
 * Deliberately not a new record. This spec is about the refusal, not about how
 * a record gets opened, and a record the library already holds skips the
 * gallery — so the subject under test is reached by the shortest honest route.
 * A shipped piece is also a better starting point than a blank one: the grid
 * demonstrably holds it before the edit, so the refusal afterwards can only be
 * the edit's doing.
 */
async function openShippedPiece(page: Page) {
  await useSliceContent(page)
  await goEditor(page)
  await page.getByTestId('editor-tab-library').click()
  await page.getByTestId('editor-kind').selectOption('piece')
  await page.getByTestId('library-open-piece.king').click()
}

/**
 * A piece the redesigned grid genuinely cannot depict, authored through the
 * detailed form so the refusal is reached the way an author reaches it.
 *
 * A distance cap of 4: the reach control offers one square, two, or the board
 * edge (ADR-029), so no arrangement of it produces this record. Chosen over "a
 * leap outside the grid", which is unauthorable on a 6x6 board, and over a
 * second movement pattern, which the redesigned grid now HOLDS — that case
 * stopped being a refusal, which is the point of the change.
 */
test('a record the grid cannot hold refuses, names the expert tab, and that tab opens', async ({ page }) => {
  await openShippedPiece(page)

  // Start from a piece the simple maker DOES hold, so the refusal below is
  // caused by the edit and not by the state the form opened in.
  await expect(page.getByTestId('editor-moves')).toBeVisible()
  await expect(page.getByTestId('editor-moves-complex')).toHaveCount(0)

  // Author a distance cap the reach control has no value for.
  await page.getByTestId('form-tab-expert').click()
  await page.getByTestId('param-move-maxDistance').fill('4')

  // Back to the simple tab: the grid has stepped aside.
  await page.getByTestId('form-tab-simple').click()
  const note = page.getByTestId('editor-moves-complex')
  await expect(note).toBeVisible()
  await expect(page.getByTestId('editor-moves')).toHaveCount(0)

  // It names where the record CAN be edited, rather than only saying no.
  await expect(note).toContainText('자세히')

  // And that place is one click away and really opens.
  await page.getByTestId('form-tab-expert').click()
  await expect(page.getByTestId('form-panel-expert')).toBeVisible()
})

test('the refusal does not discard what the record already said', async ({ page }) => {
  await openShippedPiece(page)

  await page.getByTestId('form-tab-expert').click()
  const before = await page.getByTestId('editor-draft-json').textContent()
  await page.getByTestId('param-move-maxDistance').fill('4')
  const after = await page.getByTestId('editor-draft-json').textContent()

  // The cap is the only difference; the vectors were not flattened away.
  expect(before).not.toBe(after)
  const movementBefore = JSON.parse(before ?? 'null').movement
  const movementAfter = JSON.parse(after ?? 'null').movement
  expect(movementAfter[0].vectors).toEqual(movementBefore[0].vectors)
  expect(movementAfter[0].maxDistance).toBe(4)

  // And switching to the tab that refuses does not rewrite it.
  await page.getByTestId('form-tab-simple').click()
  await expect(page.getByTestId('editor-moves-complex')).toBeVisible()
  await page.getByTestId('form-tab-expert').click()
  expect(await page.getByTestId('editor-draft-json').textContent()).toBe(after)
})
