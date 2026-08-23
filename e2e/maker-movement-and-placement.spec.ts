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

  /*
   * The trail is painted, AND it is painted inside its cell.
   *
   * The first version of this check asserted only that the bar's computed width
   * was greater than zero, and that passed while the bar spanned the entire
   * page: `.move-cell` had no `position`, so the absolutely-positioned
   * `::before` resolved against the initial containing block and
   * `calc((100% + 2px) * 1.4143)` measured 1.41x the VIEWPORT. A non-zero width
   * is exactly what a full-screen blue bar has. The bar's size relative to its
   * CELL is the thing that distinguishes the two.
   */
  const cell = page.getByTestId('piece-cell-2,2')
  const box = await cell.boundingBox()
  expect(box, 'the cell has no box').not.toBeNull()
  const bar = await cell.evaluate((el) => ({
    width: getComputedStyle(el, '::before').width,
    height: getComputedStyle(el, '::before').height,
  }))
  expect(bar.width, 'the diagonal trail has no bar').not.toBe('auto')

  const w = Number.parseFloat(bar.width)
  expect(w, 'the diagonal bar has zero width').toBeGreaterThan(0)
  // A diagonal spans its cell corner to corner plus the gap: about 1.41x the
  // cell. Two cell-widths is generous for rounding and still an order of
  // magnitude below a viewport-wide bar.
  expect(w, `bar is ${w}px against a ${box!.width}px cell — it is not inside the cell`).toBeLessThan(box!.width * 2)
  expect(Number.parseFloat(bar.height), 'the bar is thicker than its own cell').toBeLessThan(box!.height)
})

test('a one-bend slide is authorable and survives a save and reopen', async ({ page }) => {
  await openBlankPiece(page)

  // The outermost compass cell is the single discoverable entry point for an
  // automatic bend. The same gesture is used by the movement and capture
  // halves of the shared grid; this test pins the movement-side contract.
  await page.getByTestId('piece-clear').click()
  const outer = page.getByTestId('piece-cell-0,3')
  await outer.dblclick()
  await expect(outer).toHaveAttribute('data-turning', 'true')
  await page.getByTestId('editor-id').fill('piece.turning-e2e')
  await page.getByTestId('editor-name').fill('꺾이개')
  await page.getByTestId('editor-text').fill('한 번 꺾여서 미끄러져요.')
  await page.getByTestId('editor-save').click()
  await expect(page.getByTestId('editor-saved')).toBeVisible()

  await page.getByTestId('editor-tab-library').click()
  await page.getByTestId('library-open-piece.turning-e2e').click()
  const draft = JSON.parse((await page.getByTestId('editor-draft-json').textContent()) ?? 'null')
  expect(draft.movement).toEqual([
    {
      kind: 'turning_slide',
      vectors: [[0, 1]],
      turn: 'any',
    },
  ])
})

test('every perimeter cell can author an automatic one-bend slide', async ({ page }) => {
  await openBlankPiece(page)

  await page.getByTestId('piece-clear').click()
  const perimeter = [
    ...Array.from({ length: 7 }, (_, i) => [-3, 3 - i]),
    ...Array.from({ length: 6 }, (_, i) => [-2 + i, -3]),
    ...Array.from({ length: 5 }, (_, i) => [3, -2 + i]),
    ...Array.from({ length: 6 }, (_, i) => [-2 + i, 3]),
  ] as Array<[number, number]>
  for (const [df, dr] of perimeter) {
    const outer = page.getByTestId(`piece-cell-${df},${dr}`)
    await outer.dblclick()
    await expect(outer).toHaveAttribute('data-turning', 'true')
    await expect(outer).toHaveAttribute('data-paint', 'ray')
  }

  await page.getByTestId('editor-id').fill('piece.turning-perimeter-e2e')
  await page.getByTestId('editor-name').fill('비스듬 꺾이개')
  await page.getByTestId('editor-text').fill('바깥 어느 칸에서도 꺾여요.')
  await page.getByTestId('editor-save').click()
  await expect(page.getByTestId('editor-saved')).toBeVisible()

  await page.getByTestId('editor-tab-library').click()
  await page.getByTestId('library-open-piece.turning-perimeter-e2e').click()
  const draft = JSON.parse((await page.getByTestId('editor-draft-json').textContent()) ?? 'null')
  const canonical = ([df, dr]: [number, number]): [number, number] => {
    const compass = Math.max(Math.abs(df), Math.abs(dr)) === 3 && (df === 0 || dr === 0 || Math.abs(df) === Math.abs(dr))
    if (!compass) return [df, dr]
    return [Math.sign(df), Math.sign(dr)]
  }
  const vectors = draft.movement
    .filter((pattern: { kind?: string }) => pattern.kind === 'turning_slide')
    .flatMap((pattern: { vectors: number[][] }) => pattern.vectors)
    .map((vector: number[]) => canonical(vector as [number, number]))
    .sort((a: number[], b: number[]) => (a[0] ?? 0) - (b[0] ?? 0) || (a[1] ?? 0) - (b[1] ?? 0))
  expect(vectors).toEqual(perimeter.map(canonical).sort((a, b) => a[0] - b[0] || a[1] - b[1]))
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
