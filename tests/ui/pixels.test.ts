import { describe, expect, it } from 'vitest'
import { PIXEL_PALETTE, PIXEL_SPRITES, type PixelSprite, runsOf } from '@ui/art/pixels'

/**
 * The sprite sheet's own invariants (Chess Craft redesign).
 *
 * Every mark in the app is now 12 rows of 12 characters in a hand-edited table,
 * which is the cheapest possible art pipeline and the easiest one to break by
 * eye: a row with eleven characters shifts every pixel after it, and a typo'd
 * palette character silently paints magenta. Neither shows up in a typecheck.
 */

const sprites = Object.entries(PIXEL_SPRITES) as [string, PixelSprite][]

describe('the sprite sheet', () => {
  it('draws every sprite on a 12x12 grid', () => {
    const wrong = sprites.flatMap(([name, rows]) => {
      if (rows.length !== 12) return [`${name}: ${rows.length} rows`]
      return rows.flatMap((row, y) => (row.length === 12 ? [] : [`${name} row ${y}: ${row.length} chars`]))
    })
    expect(wrong, wrong.join('\n')).toEqual([])
  })

  it('uses only characters the palette knows', () => {
    // `runsOf` paints an unknown character magenta rather than skipping it, so
    // this is the test that turns a loud colour into a failing build.
    const known = new Set([...Object.keys(PIXEL_PALETTE), '.', '$'])
    const unknown = sprites.flatMap(([name, rows]) =>
      [...new Set(rows.join(''))].filter((ch) => !known.has(ch)).map((ch) => `${name} uses \`${ch}\``),
    )
    expect(unknown, unknown.join('\n')).toEqual([])
  })

  it('draws something in every sprite', () => {
    // An all-transparent sprite type-checks, registers, resolves and renders an
    // empty box — the one failure mode that looks exactly like a layout bug.
    const blank = sprites.filter(([, rows]) => !rows.join('').replace(/\./g, ''))
    expect(blank.map(([name]) => name)).toEqual([])
  })
})

describe('run-length encoding', () => {
  it('merges a row into one run per span of identical pixels', () => {
    const sprite: PixelSprite = ['ooo...oooooo', ...Array<string>(11).fill('............')]
    expect(runsOf(sprite)).toEqual([
      { x: 0, y: 0, w: 3, fill: PIXEL_PALETTE.o },
      { x: 6, y: 0, w: 6, fill: PIXEL_PALETTE.o },
    ])
  })

  it('leaves `$` for the caller to tint', () => {
    // `fill: null` is what `Pix` turns into `currentColor`. Baking a colour in
    // here would make one sprite serve one army, which is the whole thing the
    // tint exists to avoid.
    const sprite: PixelSprite = ['$$..........', ...Array<string>(11).fill('............')]
    expect(runsOf(sprite)).toEqual([{ x: 0, y: 0, w: 2, fill: null }])
  })

  it('does not merge across different colours', () => {
    const sprite: PixelSprite = ['oy..........', ...Array<string>(11).fill('............')]
    expect(runsOf(sprite)).toHaveLength(2)
  })

  it('returns the same frozen array for a repeated read', () => {
    // The board reads up to 36 sprites per repaint; re-encoding each one every
    // time is the reason this is memoised, so the memo is worth pinning.
    const first = runsOf(PIXEL_SPRITES.king)
    expect(runsOf(PIXEL_SPRITES.king)).toBe(first)
    expect(Object.isFrozen(first)).toBe(true)
  })

  it('keeps every sprite under a bounded number of rects', () => {
    // What `pixels.ts` actually promises is a DOM cost per sprite, not a
    // compression ratio: the board draws up to 36 of these at once. 60 is the
    // ceiling the current worst sprite (a bow, mostly single pixels) sits under
    // with room to spare — a future sprite drawn as dither would blow past it
    // and should have to argue for itself rather than quietly triple the cost.
    for (const [name, rows] of sprites) {
      expect(runsOf(rows).length, `${name} needs too many rects`).toBeLessThanOrEqual(60)
    }
  })

  it('halves the pixel count across the sheet', () => {
    // The comparison against the design prototype's one-shadow-per-pixel stack.
    const runs = sprites.reduce((n, [, rows]) => n + runsOf(rows).length, 0)
    const pixels = sprites.reduce((n, [, rows]) => n + rows.join('').replace(/\./g, '').length, 0)
    expect(runs).toBeLessThan(pixels / 1.8)
  })
})
