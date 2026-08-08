import { expect, test } from '@playwright/test'
import { startMatch } from './nav'

/**
 * What is left of the art gate once the art stopped being files.
 *
 * This file used to decode every WebP in `src/ui/art` in a browser and measure
 * its luminance profile against each surface it could land on, because the
 * browser is the only thing in this repo that decodes WebP. Every mark is a
 * sprite now — twelve rows of characters and a palette — so the pixels were
 * already numbers and that whole gate moved to `tests/ui/art-contrast.test.ts`,
 * where it cannot be flaky, names the sprite and the surface in its failure, and
 * runs on every `vitest` rather than only when a dev server is up. It caught the
 * design mock's two side tints being 1.02:1 apart, its brick wall being
 * invisible in a card slot, and its note surface being 3.08:1 against every mark
 * drawn on it.
 *
 * **"The pixels are already numbers" stopped being true in PLAN Phase 7.** Marks are rounded
 * outline paths now, antialiased deliberately, so a rendered pixel is a blend the character grid
 * never contained. The unit gate still measures the characters — it cannot fail on a render
 * change — so it no longer measures what ships on its own. `e2e/art-rendered-contrast.spec.ts`
 * is the half that came back: rasterised at the board's real size, composited over the real
 * square, percentile separation. The two together are the gate; neither is on its own.
 *
 * What CANNOT move is the claim below, because it is about a CSS rule matching
 * in a real cascade rather than about a colour.
 */

test('the occupied corner badge keeps a ring the mark cannot carry at that size', async ({ page }) => {
  /*
   * A painted square with a piece standing on it shrinks its type mark into the
   * corner, at roughly 40% size. A sprite carries its own outline — that is what
   * makes it legible everywhere else — but one pixel of outline at 40% is a
   * sub-pixel of outline, and it disappears into whatever is behind it.
   *
   * The ring used to be declared with `text-shadow`, which is a TEXT property
   * and did nothing at all once the mark became an element rather than a glyph:
   * the badge shipped with no ring in the most common state there is. This
   * asserts the replacement is live rather than trusting a stylesheet to have
   * been loaded and matched.
   *
   * The state is forced rather than played into: reaching it for real needs a
   * specific move onto a specific square, and what is under test is the CSS
   * rule, not the route to it.
   */
  await page.goto('/')
  await startMatch(page)
  await page.getByTestId('board').waitFor()

  const mark = page.locator('.square-mark').first()
  await expect(mark, 'no painted square on the opening board — the fixture is broken').toHaveCount(1)

  const filter = await mark.evaluate((el) => {
    el.setAttribute('data-occupied', 'true')
    return getComputedStyle(el).filter
  })

  expect(filter, 'the corner badge has no ring').not.toBe('none')
  expect(filter).toContain('drop-shadow')
})
