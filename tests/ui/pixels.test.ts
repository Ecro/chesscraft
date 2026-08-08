import { describe, expect, it } from 'vitest'
import { SHEET_DIVISOR, sheetCompression, spriteErrors } from '@ui/art/gates'
import { PIXEL_PALETTE, PIXEL_SPRITES, type PixelSprite, runsOf } from '@ui/art/pixels'

/**
 * The sprite sheet's own invariants (Chess Craft redesign).
 *
 * Every mark in the app is 12 rows of 12 characters in a table, which is the
 * cheapest possible art pipeline and the easiest one to break by eye: a row with
 * eleven characters shifts every pixel after it, and a typo'd palette character
 * silently paints magenta. Neither shows up in a typecheck.
 *
 * **The rules themselves live in `@ui/art/gates`** (ADR-005 of
 * PLAN-preset-content-expansion) so the generator can refuse exactly what this
 * file refuses. This file applies them to the SHIPPED sheet; `art-gates.test.ts`
 * checks the predicates against fixtures.
 */

const sprites = Object.entries(PIXEL_SPRITES) as [string, PixelSprite][]

describe('the sprite sheet', () => {
  it('obeys every per-sprite rule', () => {
    // Size, row length, palette-only characters, draws-something, and the rect
    // cap — one call, because they are one contract and a sprite that breaks two
    // of them should say so in one failure.
    const offences = sprites.flatMap(([name, rows]) => spriteErrors(name, rows))
    expect(offences, offences.join('\n')).toEqual([])
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

  it('halves the pixel count across the sheet', () => {
    // The comparison against the design prototype's one-shadow-per-pixel stack.
    // Aggregate, not per-sprite: a batch of individually-legal noisy sprites
    // breaks this while each one passes its own rect cap, which is exactly the
    // failure mode a mass-generated sheet walks into.
    const { runs, pixels, ok } = sheetCompression(sprites.map(([, rows]) => rows))
    expect(ok, `${runs} runs for ${pixels} pixels, needs under ${(pixels / SHEET_DIVISOR).toFixed(0)}`).toBe(true)
  })
})
