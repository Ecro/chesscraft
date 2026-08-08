import { expect, test } from '@playwright/test'
import { startMatch } from './nav'

/**
 * The contrast gate, restored at the size a player sees (PLAN Phase 7).
 *
 * `tests/ui/art-contrast.test.ts` measures a sprite's CHARACTERS — the palette tones present in
 * twelve rows of text — and that was a complete measurement for as long as the renderer drew
 * axis-aligned rects with `shape-rendering: crispEdges`. The sibling e2e says so in its own
 * header: the browser gate could move into a unit test "because the pixels are already numbers".
 *
 * Phase 7 made that false. Marks are now rounded outline paths, antialiased on purpose, so the
 * pixels a player sees are blends the character grid never contained — thinner at every corner
 * than the tone the unit gate credits. The unit gate still passes, because a render change cannot
 * make it fail, which is exactly the shape of
 * `[fail:test] measured-the-artifact-not-the-rendering` (recorded in this repo): a gate that
 * measures the author's intent, the one thing never in doubt.
 *
 * So this measures the rendering, and follows that failure's four rules verbatim:
 *
 * 1. **At the rendered CSS size**, not the sprite's native 12px — a corner softened at 160px is
 *    a different pixel from the same corner at 28px, and the small one is what ships.
 * 2. **Composited over the specific background** the mark actually lands on, read from the DOM
 *    rather than assumed, so a half-opacity edge is measured as what it becomes.
 * 3. **Every visible pixel**, including partial alpha, blended rather than discarded — throwing
 *    away sub-50% pixels is throwing away precisely the antialiasing under test.
 * 4. **Percentiles, not the mean**, passing when EITHER end separates: this board's legibility
 *    strategy is that the glyph's EDGE carries contrast while its fill carries hue, and a mean
 *    over a cream mark with a near-black ring reads as "cream".
 */

/** Same floor the character-level gate uses (`BOARD_MIN` in src/ui/art/gates.ts). */
const BOARD_MIN = 3.3

test('every mark on the board still separates from the square it stands on, as rendered', async ({ page }) => {
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

    /** The nearest ancestor background that is not transparent — what the mark really sits on. */
    const backdropOf = (el: Element): [number, number, number] => {
      for (let node: Element | null = el; node; node = node.parentElement) {
        const bg = getComputedStyle(node).backgroundColor
        const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/.exec(bg)
        if (m && (m[4] === undefined || Number(m[4]) > 0.99)) {
          return [Number(m[1]), Number(m[2]), Number(m[3])]
        }
      }
      return [0, 0, 0]
    }

    const results: Array<{ where: string; size: number; best: number; samples: number }> = []
    const marks = [...document.querySelectorAll('.square svg.pix')]

    for (const svg of marks) {
      const box = svg.getBoundingClientRect()
      if (box.width < 1) continue
      const [br, bg, bb] = backdropOf(svg.parentElement ?? svg)
      const bgLum = lum(br, bg, bb)

      // Rasterise the ACTUAL element at the ACTUAL size, including its resolved `color` so a
      // `$` cell is measured as the tint it inherits rather than as a placeholder.
      const clone = svg.cloneNode(true) as SVGElement
      clone.setAttribute('width', String(Math.round(box.width)))
      clone.setAttribute('height', String(Math.round(box.height)))
      clone.style.color = getComputedStyle(svg).color
      const blob = new Blob([new XMLSerializer().serializeToString(clone)], { type: 'image/svg+xml' })
      const url = URL.createObjectURL(blob)
      const img = new Image()
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve()
        img.onerror = () => reject(new Error('sprite did not rasterise'))
        img.src = url
      })

      const w = Math.max(1, Math.round(box.width))
      const h = Math.max(1, Math.round(box.height))
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d')!
      // Paint the real backdrop FIRST, then the mark over it, so every partial-alpha pixel is
      // read as the colour it composites to.
      ctx.fillStyle = `rgb(${br},${bg},${bb})`
      ctx.fillRect(0, 0, w, h)
      ctx.drawImage(img, 0, 0, w, h)
      URL.revokeObjectURL(url)

      const data = ctx.getImageData(0, 0, w, h).data
      const lums: number[] = []
      for (let i = 0; i < data.length; i += 4) {
        const l = lum(data[i]!, data[i + 1]!, data[i + 2]!)
        // Anything that differs from the bare backdrop is ink the mark put there.
        if (Math.abs(l - bgLum) > 0.001) lums.push(l)
      }
      if (lums.length === 0) continue

      lums.sort((a, b) => a - b)
      const p10 = lums[Math.floor(lums.length * 0.1)]!
      const p90 = lums[Math.min(lums.length - 1, Math.floor(lums.length * 0.9))]!
      results.push({
        // Nearest labelled ancestor, not the immediate parent — the mark sits inside a wrapper
        // span, so `parentElement` alone reports every failure as `?`.
        where: svg.closest('[data-testid]')?.getAttribute('data-testid') ?? '?',
        size: Math.round(box.width),
        best: Math.max(ratio(p10, bgLum), ratio(p90, bgLum)),
        samples: lums.length,
      })
    }
    return { results, floor }
  }, BOARD_MIN)

  // The premise, first: there ARE marks on the board and they DID rasterise. Without this the
  // failure list below is empty for the wrong reason — which is the whole family of defect this
  // file exists to close.
  expect(measured.results.length, 'no rendered marks were measured').toBeGreaterThan(6)
  expect(
    measured.results.every((r) => r.samples > 20),
    'a mark rasterised to almost no ink — the raster path is broken, not the art',
  ).toBe(true)
  expect(
    measured.results.every((r) => r.size >= 12 && r.size <= 80),
    'measured at a size the board does not actually use',
  ).toBe(true)

  const failures = measured.results
    .filter((r) => r.best < BOARD_MIN)
    .map((r) => `${r.where} at ${r.size}px: best composited edge ${r.best.toFixed(2)}:1, needs ${BOARD_MIN}:1`)

  expect(failures, 'a mark that clears the character gate does not clear it as rendered').toEqual([])
})
