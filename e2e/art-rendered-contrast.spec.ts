import { expect, test } from '@playwright/test'
import { startMatch } from './nav'

/** The rendered graphical-object floor used by the board gate. */
const BOARD_MIN = 3.3

test('every game image separates from its actual surface after WebP compositing', async ({ page }) => {
  await page.goto('/')
  await startMatch(page)
  await page.getByTestId('board').waitFor()

  const measured = await page.evaluate(async (floor) => {
    const srgb = (c: number) => {
      const v = c / 255
      return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
    }
    const lum = (r: number, g: number, b: number) => 0.2126 * srgb(r) + 0.7152 * srgb(g) + 0.0722 * srgb(b)
    const ratio = (a: number, b: number) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
    const parse = (value: string): [number, number, number] | null => {
      const match = value.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/)
      if (!match || (match[4] !== undefined && Number(match[4]) < 0.99)) return null
      return [Number(match[1]), Number(match[2]), Number(match[3])]
    }

    const results: Array<{ where: string; size: number; best: number; samples: number; naturalWidth: number }> = []
    const marks = [
      ...document.querySelectorAll('.square img.image-mark'),
      ...document.querySelectorAll('.card-icon img.image-mark'),
      ...document.querySelectorAll('.rule-icon img.image-mark'),
    ] as HTMLImageElement[]

    for (const image of marks) {
      if (!image.complete || image.naturalWidth === 0) continue
      const surface = image.closest('.square, .card, .rule-bar')
      if (!surface) continue
      const background = parse(getComputedStyle(surface).backgroundColor)
      if (!background) continue

      const box = image.getBoundingClientRect()
      const w = Math.max(1, Math.round(box.width))
      const h = Math.max(1, Math.round(box.height))
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d')!
      ctx.fillStyle = `rgb(${background[0]},${background[1]},${background[2]})`
      ctx.fillRect(0, 0, w, h)
      const filterOwner = image.closest('.square-mark') ?? image
      const filter = getComputedStyle(filterOwner).filter
      if (filter !== 'none') ctx.filter = filter
      ctx.drawImage(image, 0, 0, w, h)

      const backgroundLum = lum(...background)
      const data = ctx.getImageData(0, 0, w, h).data
      const lums: number[] = []
      for (let i = 0; i < data.length; i += 4) {
        const current = lum(data[i]!, data[i + 1]!, data[i + 2]!)
        if (Math.abs(current - backgroundLum) > 0.001) lums.push(current)
      }
      if (lums.length === 0) continue

      lums.sort((a, b) => a - b)
      const p10 = lums[Math.floor(lums.length * 0.1)]!
      const p90 = lums[Math.min(lums.length - 1, Math.floor(lums.length * 0.9))]!
      results.push({
        where:
          surface.getAttribute('data-testid') ??
          surface.getAttribute('data-card') ??
          surface.getAttribute('data-rule') ??
          surface.className,
        size: Math.round(box.width),
        best: Math.max(ratio(p10, backgroundLum), ratio(p90, backgroundLum)),
        samples: lums.length,
        naturalWidth: image.naturalWidth,
      })
    }
    return { results, floor }
  }, BOARD_MIN)

  expect(measured.results.length, 'no loaded game images were measured').toBeGreaterThan(6)
  expect(measured.results.every((result) => result.naturalWidth >= 128), 'a source image is not high resolution').toBe(true)
  expect(measured.results.every((result) => result.samples > 20), 'a mark produced almost no visible pixels').toBe(true)
  expect(measured.results.every((result) => result.size >= 12 && result.size <= 80), 'measured outside board CSS size').toBe(true)

  const failures = measured.results
    .filter((result) => result.best < BOARD_MIN)
    .map((result) => `${result.where} at ${result.size}px: ${result.best.toFixed(2)}:1, needs ${BOARD_MIN}:1`)
  expect(failures, 'a loaded raster mark is unreadable on its actual surface').toEqual([])
})
