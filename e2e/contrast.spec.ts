import { expect, test } from '@playwright/test'
import { startMatch } from './nav'

/**
 * Runtime image gate for the board.
 *
 * The rendered-pixel contrast gate lives in `art-rendered-contrast.spec.ts`.
 * This companion checks the browser contract that makes that measurement
 * meaningful: every visible piece is a loaded, natural-size bundled WebP and
 * side-specific files have not collapsed to one source.
 */
test('the board uses loaded side-specific raster pieces', async ({ page }) => {
  await page.goto('/')
  await startMatch(page)
  await page.getByTestId('board').waitFor()

  await expect
    .poll(
      async () =>
        page.locator('.piece img.image-mark').evaluateAll((els) => {
          if (els.length !== 24) return false
          return els.every((el) => {
            const image = el as HTMLImageElement
            return image.complete && image.naturalWidth >= 128 && image.naturalHeight >= 128
          })
        }),
      { timeout: 15_000 },
    )
    .toBe(true)

  const marks = await page.locator('.piece img.image-mark').evaluateAll((els) =>
    els.map((el) => {
      const image = el as HTMLImageElement
      return {
        complete: image.complete,
        naturalWidth: image.naturalWidth,
        naturalHeight: image.naturalHeight,
        src: image.currentSrc || image.src,
      }
    }),
  )

  expect(marks.length).toBe(24)
  expect(marks.every((mark) => mark.complete && mark.naturalWidth >= 128 && mark.naturalHeight >= 128)).toBe(true)
  expect(marks.every((mark) => /piece-.+-(white|black)\.webp/.test(mark.src))).toBe(true)
  expect(new Set(marks.map((mark) => mark.src)).size).toBeGreaterThan(1)
  expect(await page.locator('.piece svg.pix').count()).toBe(0)
})

test('cards and special squares use loaded raster marks', async ({ page }) => {
  await page.goto('/')
  await startMatch(page)
  await page.getByTestId('board').waitFor()

  const surfaces = page.locator('.rule-icon img.image-mark, .card-icon img.image-mark, .square-mark img.image-mark')
  await expect(page.locator('.rule-icon img.image-mark')).toHaveCount(1)
  await expect(page.locator('.card-icon img.image-mark')).not.toHaveCount(0)
  await expect(page.locator('.square-mark img.image-mark')).not.toHaveCount(0)

  await expect
    .poll(
      async () =>
        surfaces.evaluateAll((els) =>
          els.every((el) => {
            const image = el as HTMLImageElement
            return image.complete && image.naturalWidth >= 128 && image.naturalHeight >= 128
          }),
        ),
      { timeout: 15_000 },
    )
    .toBe(true)
  const decoded = await surfaces.evaluateAll((els) =>
    els.map((el) => {
      const image = el as HTMLImageElement
      return { complete: image.complete, naturalWidth: image.naturalWidth, naturalHeight: image.naturalHeight }
    }),
  )
  expect(decoded.every((image) => image.complete && image.naturalWidth >= 128 && image.naturalHeight >= 128)).toBe(true)
  expect(await page.locator('svg').count()).toBe(0)
})
