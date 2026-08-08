import { expect, test } from '@playwright/test'
import { useSliceContent } from './content'
import { goEditor } from './nav'

/**
 * AC-009 + AC-010 — the maker fits a phone, and it scrolls inside the shell.
 *
 * Both claims are geometric, so both are measured in a real browser at the design
 * viewport. jsdom reports zero-sized boxes and ignores visibility, which is why the
 * one control that shipped in the wrong panel got there.
 *
 * AC-010 is the sharper of the two. `[fail:render] unbounded-parent-defeats-inner-scroll`
 * is recorded in this repo: `overflow-y: auto` on a box whose ancestor has no DEFINITE
 * height is inert — the box grows to fit its content instead of scrolling, and nothing
 * about the declaration looks wrong. Its signature is two-sided: the inner box reports
 * a large `scrollHeight` while the document element's `scrollHeight` equals its
 * `clientHeight`. A one-sided assertion passes in exactly the broken state, so both
 * sides are asserted here. The maker is also the screen that surfaced it the first
 * time, and this work made the form taller still.
 */

const PHONE = { width: 390, height: 844 }

/** The tallest record the maker can open: a piece has the grid AND the sentence. */
async function openTallestRecord(page: import('@playwright/test').Page) {
  await page.setViewportSize(PHONE)
  await useSliceContent(page)
  await goEditor(page)
  await page.getByTestId('editor-tab-library').click()
  await page.getByTestId('editor-kind').selectOption('piece')
  await page.getByTestId('library-open-piece.king').click()
}

test('the longest record scrolls inside the shell, and the document does not grow', async ({ page }) => {
  await openTallestRecord(page)

  const box = await page.evaluate(() => {
    const scroller = document.querySelector('.editor')!
    return {
      scrollHeight: scroller.scrollHeight,
      clientHeight: scroller.clientHeight,
      docScrollHeight: document.documentElement.scrollHeight,
      docClientHeight: document.documentElement.clientHeight,
      viewport: window.innerHeight,
    }
  })

  // The form really is taller than its scrollport — otherwise the assertion below
  // would be measuring a form that never needed to scroll.
  expect(box.scrollHeight).toBeGreaterThan(box.clientHeight)
  // …and the shell clipped it rather than growing to fit, which is the half that
  // fails in the recorded bug.
  expect(box.docScrollHeight).toBeLessThanOrEqual(box.viewport + 1)
  expect(box.docClientHeight).toBeLessThanOrEqual(box.viewport + 1)
})

test('the summary, the errors and the save stay in view at the end of the form', async ({ page }) => {
  await openTallestRecord(page)

  // Force an error so the error region has something to show; an empty region has no
  // box to measure and the assertion would pass on nothing.
  await page.getByTestId('editor-id').fill('Broken')

  // Scroll the form to its end, which is where the anchors have to still be reachable.
  await page.evaluate(() => {
    const scroller = document.querySelector('.editor')!
    scroller.scrollTop = scroller.scrollHeight
  })

  for (const id of ['form-summary', 'editor-live-errors', 'editor-save']) {
    const box = await page.getByTestId(id).boundingBox()
    expect(box, `${id} has no box`).not.toBeNull()
    // Intersecting the viewport, not merely "visible": a sticky element that lost its
    // stickiness is still `visible`, just off screen.
    expect(box!.y + box!.height, `${id} is above the viewport`).toBeGreaterThan(0)
    expect(box!.y, `${id} is below the viewport`).toBeLessThan(PHONE.height)
  }
})

test('the summary says what the record currently is, and updates as it changes', async ({ page }) => {
  await openTallestRecord(page)

  const summary = page.getByTestId('form-summary-text')
  const before = await summary.textContent()
  expect(before?.trim()).not.toBe('')

  // A grid edit must reach the pinned line, or it is decoration rather than a preview.
  await page.getByTestId('piece-cell-1,2').click()
  await expect(summary).not.toHaveText(before ?? '')
})
