import { expect, test } from '@playwright/test'
import { useSliceContent } from './content'
import { buildStep, goEditor } from './nav'

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

/**
 * The art picker's option boxes, and the mechanism that inflated them.
 *
 * Measured before the fix, at this viewport, with a piece open: 32 option buttons of
 * 49x265px each, holding a 26x26px sprite — 225px of blank BELOW every picture — and a
 * 1926px `.art-picker` inside an 844px screen. The rows were 264.7px where their content
 * is 54px.
 *
 * The cause is not the button's padding and not the number of options. `.art-picker` is a
 * `fieldset`, the base rule gives every fieldset `flex-wrap: wrap`, and this one is
 * `flex-direction: column`. A column-direction MULTI-LINE flex container sizes each flex
 * line's main axis from the container's own content-box height, so `.palette` — the only
 * item in its line — receives a DEFINITE block size, and a grid with a definite block size
 * and `align-content: normal` distributes that height across its auto rows. Every
 * ingredient is individually correct; the row height is the product.
 *
 * Both assertions below are geometric and both are made in a real browser on purpose.
 * jsdom computes no grid layout at all, so a unit test of this would assert zero against
 * zero and pass in the broken state — `[fail:test] jsdom-visibility-blind-spot`, recorded
 * in this repo, is the same blind spot from the visibility side.
 *
 * The second test is the class-level one, and it is the reason this is not scoped to
 * `.art-picker` alone: `[fail:design] fix-scoped-to-the-cited-evidence` is at count:6 here.
 * Every column-direction fieldset in the form carries the same latent defect; the other two
 * merely happen to hold content that does not stretch today.
 */
test('no art option is taller than its picture needs, and the picker fits the screen', async ({ page }) => {
  await openTallestRecord(page)

  const boxes = await page.evaluate(() => {
    const buttons = [...document.querySelectorAll('[data-testid^="editor-art-"]')]
    const picker = document.querySelector('.art-picker')
    return {
      count: buttons.length,
      tallest: Math.max(...buttons.map((b) => b.getBoundingClientRect().height)),
      sprite: Math.max(...buttons.map((b) => b.querySelector('svg')?.getBoundingClientRect().height ?? 0)),
      picker: picker ? picker.getBoundingClientRect().height : 0,
    }
  })

  // The premise: there ARE options to measure. Without this the maxima below are -Infinity
  // and every comparison passes on an empty set.
  expect(boxes.count, 'the art picker offered nothing to measure').toBeGreaterThan(8)
  expect(boxes.sprite, 'the sprites have no box').toBeGreaterThan(0)

  // A button is its sprite plus its own padding and border — nowhere near 265px.
  expect(boxes.tallest, 'an art option is taller than its picture needs').toBeLessThanOrEqual(60)
  // And the picker as a whole fits within a screen's worth rather than five.
  expect(boxes.picker, 'the art picker is taller than the screen it lives on').toBeLessThanOrEqual(PHONE.height)
})

test('no column-direction fieldset in the form wraps, so no grid child inherits a definite height', async ({ page }) => {
  await openTallestRecord(page)

  const offenders = await page.evaluate(() => {
    const form = document.querySelector('.record-form')
    if (!form) return ['no .record-form on screen']
    return [...form.querySelectorAll('fieldset')]
      .map((el) => ({ el, style: getComputedStyle(el) }))
      .filter(({ style }) => style.display.includes('flex') && style.flexDirection === 'column')
      .filter(({ style }) => style.flexWrap !== 'nowrap')
      .map(({ el, style }) => `${el.className || el.tagName}: flex-wrap is ${style.flexWrap}`)
  })

  // The vacuity guard its unit-test sibling already has: with no column-direction fieldset
  // on screen the offender list is empty for the wrong reason.
  const columns = await page.evaluate(() => {
    const form = document.querySelector('.record-form')
    return form
      ? [...form.querySelectorAll('fieldset')].filter((el) => {
          const s = getComputedStyle(el)
          return s.display.includes('flex') && s.flexDirection === 'column'
        }).length
      : 0
  })
  expect(columns, 'no column-direction fieldset on screen — this test is measuring nothing').toBeGreaterThan(0)

  expect(offenders, 'a column fieldset still wraps — its grid children can be stretched').toEqual([])
})

/**
 * The shared rule the fix had to leave alone (Phase 2 exit criterion c).
 *
 * `.palette button` and `.tile` are ONE rule block in `styles.css`: the icon-above-label
 * column, its vertical padding and its 26px mark size. The art picker's options are the
 * label-less half of that pair, so it was tempting to fix their blank space by splitting the
 * padding — and the measurement said the padding was 22px of a 265px box, which is why the
 * fix went to the grid track instead and this rule was not touched at all.
 *
 * "Not touched" is a claim about a file, and files change. This measures the rendered
 * consequence on the surface that NEEDS the padding: a room's piece tiles, which stack a
 * mark over a word. Two regressions to the shared rule are caught here — dropping the
 * vertical padding, and collapsing the icon-over-label column.
 *
 * A third was in this note and has been removed rather than asserted: "if a later edit pulls
 * `.tile` into the nowrap selector list". `.tile` renders inside a plain `.tile-grid` div
 * with no `fieldset` ancestor at all, so the definite-block-size mechanism the Phase 2 fix
 * targets cannot reach it, and `.tile` is already `flex-wrap: nowrap` by default — an
 * assertion on that could not fail. A claim a test cannot check does not belong in the test.
 */
test('a room tile still stacks its picture over its label, with the shared padding intact', async ({ page }) => {
  await page.setViewportSize(PHONE)
  await useSliceContent(page)
  await goEditor(page)
  await page.getByTestId('room-open-preset.slice').click()
  // The room builder is five steps and the piece tiles live on one of them.
  await buildStep(page, 'pieces')

  const tile = await page.evaluate(() => {
    const el = document.querySelector('[data-testid^="room-piece-"]')
    if (!el) return null
    const s = getComputedStyle(el)
    const label = el.querySelector('span')
    const mark = el.querySelector('svg')
    const box = el.getBoundingClientRect()
    return {
      flexDirection: s.flexDirection,
      padTop: parseFloat(s.paddingTop),
      padBottom: parseFloat(s.paddingBottom),
      gap: parseFloat(s.rowGap) || 0,
      height: box.height,
      labelText: (label?.textContent ?? '').trim(),
      labelHeight: label ? label.getBoundingClientRect().height : 0,
      markHeight: mark ? mark.getBoundingClientRect().height : 0,
    }
  })

  expect(tile, 'no room tile on screen').not.toBeNull()
  // The premise: this really is the label-bearing surface. A tile with no word is the art
  // picker's shape, not this one, and would make the assertions below about nothing.
  expect(tile!.labelText, 'the room tile has no label').not.toBe('')
  expect(tile!.labelHeight, 'the room tile label has no box').toBeGreaterThan(0)

  // The shared rule, as rendered: a column, with symmetric vertical padding that exists.
  expect(tile!.flexDirection).toBe('column')
  expect(tile!.padTop).toBeGreaterThan(0)
  expect(tile!.padTop).toBe(tile!.padBottom)
  // Tall enough to hold both parts stacked, and no taller than the rule's own composition:
  // the two paddings plus the column gap, and 6px for borders and sub-pixel rounding. An
  // arbitrary multiplier here would leave room for a partial regression — a doubled padding
  // or a gap applied twice — to land inside the budget and pass.
  expect(tile!.height).toBeGreaterThanOrEqual(tile!.labelHeight + tile!.markHeight)
  expect(tile!.height).toBeLessThanOrEqual(
    tile!.labelHeight + tile!.markHeight + tile!.padTop + tile!.padBottom + tile!.gap + 6,
  )
})

/**
 * The window the wrap fix newly makes reachable, on the form that is not a piece.
 *
 * Before the fix, a column fieldset handed its single child a definite block size and the
 * child's grid distributed that height evenly across its rows — so the layout was the same
 * whatever the rows contained. Afterwards a row is as tall as its own tallest item, which
 * means item COUNT and item CONTENT now decide the geometry. `.sentence` and `.card-recipe`
 * were changed by the same rule as `.art-picker` and show no difference on a piece (measured:
 * 445px before and after), so the piece form cannot exercise them — a card can, and a card
 * is the record those two fieldsets exist for.
 *
 * This is the `[fail:code] fix-introduced-defect-passes-all-gates` guard (count:4 here): the
 * three tests above were all authored against the piece form, which is the evidence that
 * prompted the fix rather than the surface the fix covers.
 */
test('a card record still lays its sentence out, now that its fieldsets no longer wrap', async ({ page }) => {
  await page.setViewportSize(PHONE)
  await useSliceContent(page)
  await goEditor(page)
  await page.getByTestId('editor-tab-library').click()
  await page.getByTestId('editor-kind').selectOption('skillCard')
  await page.getByTestId('library-open-skill.warp').click()

  const shape = await page.evaluate(() => {
    const form = document.querySelector('.record-form')
    if (!form) return null
    const rows = [...form.querySelectorAll('.sentence-row')]
    const wrapping = [...form.querySelectorAll('fieldset')]
      .map((el) => ({ el, style: getComputedStyle(el) }))
      .filter(({ style }) => style.display.includes('flex') && style.flexDirection === 'column')
      .filter(({ style }) => style.flexWrap !== 'nowrap')
      .map(({ el }) => el.className || el.tagName)
    return {
      rows: rows.length,
      tallestRow: rows.length > 0 ? Math.max(...rows.map((r) => r.getBoundingClientRect().height)) : 0,
      wrapping,
      formHeight: form.getBoundingClientRect().height,
    }
  })

  expect(shape, 'no record form on screen').not.toBeNull()
  // The premise: the card's sentence really did render slots. Without this the height
  // assertion below is comparing zero against a ceiling and passes on an empty form.
  expect(shape!.rows, 'the card sentence rendered no rows').toBeGreaterThan(0)
  expect(shape!.wrapping, 'a column fieldset on the card form still wraps').toEqual([])
  // A sentence row holds one line of controls. Stretched rows were 5x their content on the
  // art picker; anything of that order here would be the same defect on a different surface.
  expect(shape!.tallestRow, 'a sentence row is far taller than one row of controls').toBeLessThanOrEqual(120)
})
