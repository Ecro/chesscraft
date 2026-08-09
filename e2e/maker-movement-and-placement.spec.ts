import { type Page, expect, test } from '@playwright/test'
import { useSliceContent } from './content'
import { goEditor, startBlank } from './nav'

/**
 * The maker, in a real browser.
 *
 * jsdom cannot answer either of the two questions this file asks. `fireEvent`
 * does not enforce visibility, so a control moved behind a collapsed container
 * keeps every unit test green while being unreachable — four regressions shipped
 * through a green 71-test gate for exactly that reason. And jsdom has no layout
 * at all, so the one thing the ray drawing had to prove (that a diagonal trail
 * survives being laid out at a phone's width, with a tap target a child can
 * actually hit) is only answerable here.
 */

async function openBlankPiece(page: Page) {
  await useSliceContent(page)
  await goEditor(page)
  await page.getByTestId('editor-tab-library').click()
  await page.getByTestId('editor-kind').selectOption('piece')
  await startBlank(page)
}

test('the movement grid is reachable, and its cells are big enough to hit', async ({ page }) => {
  await openBlankPiece(page)

  const grid = page.getByTestId('editor-moves')
  await expect(grid).toBeVisible()

  // Every control this task names, in the state a child first meets it.
  for (const id of ['piece-mode-move', 'piece-mode-capture', 'piece-cell-1,2', 'piece-cell-0,3']) {
    await expect(page.getByTestId(id), `${id} is not reachable`).toBeEnabled()
  }

  /*
   * The Phase 3 spike measured 45.1px on a bare page and this is that
   * measurement re-made against what ships — which is the whole reason the plan
   * asked for it twice. On an iPhone 13 the editor's chrome takes 112px before
   * the grid is reached, so the spike's number was never available here.
   *
   * What IS asserted is the floor this change actually reached: 38px, up from
   * the 36.3px that shipped before it. The 44px touch target is NOT met, and
   * that is recorded rather than quietly rounded away — closing the remaining
   * 5px means restructuring padding that `.editor`, `.library` and
   * `.record-form` all share, which is a different change with a different blast
   * radius. The regression guard is what matters here: this must not shrink.
   */
  const cell = await page.getByTestId('piece-cell-1,2').boundingBox()
  expect(cell, 'the cell has no box at all').not.toBeNull()
  expect(cell!.width, `cell is ${cell!.width}px wide; it must not shrink below 38`).toBeGreaterThanOrEqual(38)
  expect(cell!.height).toBeGreaterThanOrEqual(38)
  expect(cell!.width, 'the cell grew past the container — re-measure the chrome').toBeLessThan(60)

  // And the page does not scroll sideways to afford it.
  const overflows = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)
  expect(overflows, 'the grid pushed the page wider than the viewport').toBe(false)
})

test('a ray is drawn through the squares it reaches, diagonals included', async ({ page }) => {
  await openBlankPiece(page)

  // Two taps puts a ray on the ring cell: leap, then ray.
  for (const cell of ['piece-cell-0,3', 'piece-cell-3,3']) {
    await page.getByTestId(cell).click()
    await page.getByTestId(cell).click()
  }

  // The orthogonal ray, and the diagonal one — the diagonal is the case the
  // Phase 3 spike was gated on, because the twice-reverted 9x9 attempt died on
  // exactly this geometry.
  await expect(page.getByTestId('piece-cell-0,3')).toHaveAttribute('data-endless', 'true')
  await expect(page.getByTestId('piece-cell-3,3')).toHaveAttribute('data-endless', 'true')
  for (const through of ['piece-cell-0,1', 'piece-cell-0,2', 'piece-cell-1,1', 'piece-cell-2,2']) {
    await expect(page.getByTestId(through), `${through} is not drawn as part of its ray`).toHaveAttribute(
      'data-paint',
      'ray',
    )
  }

  // The trail is actually painted, not merely attributed. `::before` is what
  // draws it, so its computed width is the thing that would be zero if the CSS
  // never landed.
  const barWidth = await page
    .getByTestId('piece-cell-2,2')
    .evaluate((el) => getComputedStyle(el, '::before').width)
  expect(barWidth, 'the diagonal trail has no bar').not.toBe('auto')
  expect(Number.parseFloat(barWidth), 'the diagonal bar has zero width').toBeGreaterThan(0)
})

test('the board record places pieces without ever showing a coordinate', async ({ page }) => {
  await useSliceContent(page)
  await goEditor(page)
  await page.getByTestId('editor-tab-library').click()
  await page.getByTestId('editor-kind').selectOption('board')
  await page.getByTestId('library-open-board.slice').click()

  await page.getByTestId('board-mode-place').click()
  await expect(page.getByTestId('board-place-a1')).toBeVisible()

  // No square name is readable anywhere on the form — the painter keeps it in
  // `aria-label`, where a screen reader needs it and a child never meets it.
  const visible = await page.getByTestId('record-form').innerText()
  expect(visible, `a coordinate is on screen: ${visible.match(/\b[a-z][1-9][0-9]*\b/)?.[0]}`).not.toMatch(
    /(^|\s)[a-z][1-9][0-9]*(\s|$)/,
  )
  await expect(page.getByTestId('record-form').locator('select')).toHaveCount(0)

  // And placing works by tapping, twice to take it away.
  const pick = page.locator('[data-testid^="board-place-pick-"]').first()
  await pick.click()
  const square = page.getByTestId('board-place-c3')
  await square.click()
  await expect(square).not.toHaveAttribute('data-side', '')
  await square.click()
  await expect(square).toHaveAttribute('data-side', '')
})
