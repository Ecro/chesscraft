import { describe, expect, it, vi } from 'vitest'
import { SPRITE_SIZE, drawnPixels, rectCount } from '@ui/art/gates'
import { PIXEL_SPRITES } from '@ui/art/pixels'
import { mirror } from '../../scripts/gen-sprites.ts'
import { upscale } from '../../scripts/upscale-sprites.ts'

/**
 * The migration's arithmetic, pinned before 209 sprite tables are rewritten by it
 * (PLAN-art-grid-resolution Phase 1, ADR-002 / ADR-005).
 *
 * `upscale` is the whole of the 12x12 -> 24x24 migration: every cell becomes a k-by-k
 * block, so the silhouette is bit-identical and only the resolution changes. Two
 * properties of that operation are load-bearing elsewhere and neither is obvious enough
 * to leave unasserted.
 *
 * **The scaling law (ADR-002).** `runsOf` is row-wise, so a k-upscale multiplies run count
 * by exactly k — the runs within a row are unchanged, there are just k times as many rows
 * — while drawn pixels multiply by k squared. That asymmetry is why `RECT_CAP` scales
 * linearly with `SPRITE_SIZE` and the sheet's pixels/runs floor scales linearly too. If
 * this law were wrong, both derived constants would be wrong, and the sheet-wide
 * compression gate would silently stop rejecting dither at the new resolution.
 *
 * **Commutation with `mirror` (ADR-005).** `scripts/spare-sprites.ts` authors symmetric
 * sprites as half-width columns and lets `mirror` expand them, so the migration upscales
 * the HALVES and leaves the mirroring alone. That is only safe because horizontal
 * duplication commutes with reverse-and-append. The proof is one line of algebra —
 * `dup(h) + reverse(dup(h)) = dup(h) + dup(reverse(h)) = dup(h + reverse(h))` — and an
 * argument in an ADR is not a guard, so it is asserted here.
 */

/** Run-heavy on purpose: a solid block satisfies the scaling law trivially. */
const STRIPED = ['o.', '.o', 'oo', '..'].map((pair) => pair.repeat(SPRITE_SIZE / 2))

/** A real committed sprite, so the law is not only tested against art invented to pass it. */
const KING = PIXEL_SPRITES.king as readonly string[]

describe('upscale is a pure block expansion', () => {
  it('multiplies both dimensions by k', () => {
    const out = upscale(STRIPED, 2)
    expect(out).toHaveLength(STRIPED.length * 2)
    for (const row of out) expect(row).toHaveLength(STRIPED[0]!.length * 2)
  })

  it('leaves its input untouched', () => {
    const before = [...STRIPED]
    upscale(STRIPED, 3)
    expect(STRIPED).toEqual(before)
  })

  it('is the identity at k = 1', () => {
    expect(upscale(KING, 1)).toEqual([...KING])
  })

  it('makes every k-by-k block uniform — the property that makes it lossless', () => {
    const k = 2
    const out = upscale(KING, k)
    for (let y = 0; y < out.length; y++) {
      for (let x = 0; x < out[y]!.length; x++) {
        // Every cell must equal the source cell it was expanded from. This is what
        // "bit-identical silhouette" means, stated per pixel rather than per sprite.
        expect(out[y]![x]).toBe(KING[Math.floor(y / k)]![Math.floor(x / k)])
      }
    }
  })

  it('preserves transparency and the tint marker rather than filling them', () => {
    // `.` is transparent and `$` takes the caller's tint. A resampler that treated the
    // grid as an image would smear both; a block expansion must not.
    const out = upscale(['.$', '$.'], 2)
    expect(out).toEqual(['..$$', '..$$', '$$..', '$$..'])
  })

  it('refuses a ragged sprite instead of silently squaring the damage', () => {
    expect(() => upscale(['ooo', 'oo'], 2)).toThrow(/ragged|length/i)
  })

  it('refuses a non-integer or non-positive factor', () => {
    expect(() => upscale(STRIPED, 0)).toThrow()
    expect(() => upscale(STRIPED, 1.5)).toThrow()
  })
})

describe('the scaling law ADR-002 derives the gate constants from', () => {
  // The two derived constants are `RECT_CAP = 5 * SPRITE_SIZE` and
  // `SHEET_DIVISOR = 0.15 * SPRITE_SIZE`. Both follow from exactly this pair of facts.
  for (const [label, sprite] of [
    ['a striped fixture', STRIPED],
    ['the committed king', KING],
  ] as const) {
    for (const k of [2, 3]) {
      it(`multiplies runs by ${k} and pixels by ${k * k} — ${label}`, () => {
        const out = upscale(sprite, k)
        expect(rectCount(out)).toBe(k * rectCount(sprite))
        expect(drawnPixels(out)).toBe(k * k * drawnPixels(sprite))
      })
    }
  }

  it('is not vacuous — the fixture actually has runs to multiply', () => {
    // Without this, a fixture that happened to be blank would satisfy every assertion
    // above by multiplying zero by two.
    expect(rectCount(STRIPED)).toBeGreaterThan(4)
    expect(drawnPixels(STRIPED)).toBeGreaterThan(0)
  })

  it('changes the pixels-per-run ratio by exactly k, which is why the floor must scale', () => {
    const before = drawnPixels(KING) / rectCount(KING)
    const after = drawnPixels(upscale(KING, 2)) / rectCount(upscale(KING, 2))
    expect(after).toBeCloseTo(2 * before, 10)
  })
})

describe('upscaling a half and mirroring it agree, in either order (ADR-005)', () => {
  /*
   * The property is stated in two halves, and the split is not a convenience.
   *
   * `mirror` accepts a half of exactly `SPRITE_SIZE / 2` characters and rejects every
   * other width — so `mirror(upscale(h, 2))` and `upscale(mirror(h), 2)` need halves of
   * DIFFERENT widths and cannot both be legal at one `SPRITE_SIZE`. The commutation
   * genuinely spans the pre- and post-migration regimes, which is exactly why Phase 2 can
   * upscale the halves and leave `mirror` untouched.
   *
   * Mocking `SPRITE_SIZE` to force both sides through one call would test the mock's
   * width check rather than the algebra. Instead: assert that `upscale` distributes over
   * horizontal reflection (the mathematical content, resolution-free), and separately that
   * `mirror` IS that reflection at the size it currently runs at. Together they are the
   * ADR's claim, and neither half needs a fake constant.
   */
  const reflect = (row: string) => row + [...row].reverse().join('')

  /**
   * A half of the CURRENT legal width, built rather than spelled.
   *
   * Spelling six characters out was itself the resolution baked into a fixture — the
   * mistake this whole plan is about — and `mirror` caught it the moment `SPRITE_SIZE`
   * moved, by rejecting a six-column half where twelve were now required.
   */
  const HALF = ['o$', '$.', 'oo', '..', '$$', 'o.'].map((pair) => pair.repeat(SPRITE_SIZE / 4))

  it('upscale distributes over horizontal reflection, at any factor', () => {
    for (const k of [2, 3]) {
      expect(upscale(HALF.map(reflect), k)).toEqual(upscale(HALF, k).map(reflect))
    }
  })

  it('and `mirror` is exactly that reflection', () => {
    // If this drifts — a mirror that trimmed a shared centre column, say — the
    // distribution proved above would stop applying to the thing Phase 2 actually runs.
    expect(mirror(HALF)).toEqual(HALF.map(reflect))
  })

  it('so the migrated half expands to a legal full-width row', () => {
    const upscaledHalf = upscale(HALF, 2)
    for (const row of upscaledHalf.map(reflect)) expect(row).toHaveLength(2 * SPRITE_SIZE)
  })
})
