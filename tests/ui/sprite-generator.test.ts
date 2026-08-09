import { describe, expect, it } from 'vitest'
import * as gates from '@ui/art/gates'
import { GATES, generate, mirror } from '../../scripts/gen-sprites.ts'
import { upscale } from '../../scripts/upscale-sprites.ts'

/**
 * The generator refuses exactly what the suite refuses (AC-012, ADR-005).
 *
 * The assertion that matters here is **module identity**, not equivalent
 * behaviour. A generator that reimplements "a fixed grid, palette-only, a fixed rect
 * rects" passes a behavioural test on the day it is written and drifts from the
 * suite silently afterwards; the first sign is a committed sprite failing CI.
 * Sharing the module makes the drift impossible, so that is what is pinned.
 *
 * Lives beside the other art tests rather than in `tests/build/` (where the PLAN
 * first put it) because `tests/build/**` is excluded from the default vitest
 * config — it holds tests that need a built `dist/`. This one must run on every
 * `npm test`, since it guards the pipeline that produces committed source.
 */

const SOLID = (ch: string) => Array<string>(GATES.SPRITE_SIZE).fill(ch.repeat(GATES.SPRITE_SIZE))

/**
 * A stand-in for `tokens.css`, so the SURFACE decides what a candidate is
 * measured against rather than the caller.
 *
 * Every name resolves dark except the one a `card` never touches, which is
 * white — so a sprite that would pass by being checked against the wrong
 * background is separable from one that passes honestly.
 */
const DARK = '#1b1e27'
const token = (name: string) => (name === 'color-board-light' ? '#ffffff' : DARK)
const CTX = { sheet: [] as readonly (readonly string[])[], token }

/** A candidate that clears every gate on its own. */
const good = { name: 'block', surface: 'card' as const, rows: SOLID('S') }

describe('the generator and the suite share one gate module', () => {
  it('imports the very module the tests import', () => {
    expect(GATES).toBe(gates)
  })

  it('exposes the thresholds through that module rather than its own copies', () => {
    expect(GATES.RECT_CAP).toBe(gates.RECT_CAP)
    expect(GATES.SHEET_DIVISOR).toBe(gates.SHEET_DIVISOR)
    expect(GATES.BOARD_MIN).toBe(gates.BOARD_MIN)
  })
})

describe('generate', () => {
  it('emits a candidate that clears every gate', () => {
    const out = generate([good], CTX)
    expect(out.accepted.map((c) => c.name)).toEqual(['block'])
    expect(out.rejected).toEqual([])
  })

  it('emits nothing from a batch of invalid candidates', () => {
    // One of each failure mode the gates know about. The point of the assertion
    // is the EMPTY accepted list: a generator that emits its best-effort output
    // and warns is how a broken sprite reaches a commit.
    const batch = [
      { name: 'short', surface: 'card' as const, rows: SOLID('S').slice(0, GATES.SPRITE_SIZE - 1) },
      { name: 'ragged', surface: 'card' as const, rows: [...SOLID('S').slice(0, 11), 'SSS'] },
      { name: 'typo', surface: 'card' as const, rows: SOLID('Q') },
      { name: 'blank', surface: 'card' as const, rows: SOLID('.') },
      { name: 'dither', surface: 'card' as const, rows: upscale(Array<string>(12).fill('oyoyoyoyoyoy'), GATES.SPRITE_SIZE / 12) },
    ]
    const out = generate(batch, CTX)
    expect(out.accepted).toEqual([])
    expect(out.rejected.map((r) => r.name).sort()).toEqual(['blank', 'dither', 'ragged', 'short', 'typo'])
  })

  it('rejects a candidate that cannot separate from its own background', () => {
    // Clears every structural gate and is still unusable: a flat mid-tone fill
    // on a mid-tone surface. Contrast is not a structural property, so a
    // generator checking only shape would emit this.
    const out = generate([{ name: 'murk', surface: 'card', rows: SOLID('H') }], {
      sheet: [],
      token: () => '#5b6273',
    })
    expect(out.accepted).toEqual([])
    expect(out.rejected[0]?.errors.join(' ')).toContain('best edge')
  })

  it('rejects a candidate that pushes the SHEET aggregate over, not just its own cost', () => {
    /*
     * The failure this whole check exists for. `noisy` costs 48 rects, well
     * under the per-sprite cap of 60 — so a generator scoring candidates one at
     * a time accepts it. Against a sheet that is already near the compression
     * floor it is what breaks the build, and it breaks it globally, at commit
     * time, after 60 sprites have been drawn.
     */
    const noisy = {
      name: 'noisy',
      surface: 'card' as const,
      // UPSCALED, not re-authored at 24. This fixture's whole point is line 97 below: it must
      // sit UNDER the per-sprite rect cap while breaking the sheet aggregate in bulk. A native
      // rebuild at 24 wide is 12 runs per row x 24 rows = 288 against a cap of 120, so line 97
      // fails and the test's premise inverts. Upscaled it is 96 runs — still under — and the
      // crowded case still trips the floor.
      rows: upscale([...Array<string>(8).fill('S.S.S.S.S.S.'), ...Array<string>(4).fill('............')], GATES.SPRITE_SIZE / 12),
    }
    expect(GATES.rectCount(noisy.rows)).toBeLessThanOrEqual(GATES.RECT_CAP)

    const alone = generate([noisy], { sheet: [SOLID('S')], token })
    expect(alone.accepted, 'a lone noisy sprite against a solid sheet still compresses').toHaveLength(1)

    const crowded = generate([noisy, noisy, noisy, noisy], CTX)
    expect(crowded.accepted.length).toBeLessThan(4)
    expect(crowded.rejected.some((r) => r.errors.join(' ').includes('sheet'))).toBe(true)
  })

  it('counts an accepted candidate into the running sheet', () => {
    // Otherwise the aggregate is measured against the sheet as it was BEFORE
    // this batch, and a batch can only ever fail on its first member.
    const out = generate([good, good], CTX)
    expect(out.sheet).toHaveLength(2)
  })
})

describe('mirror', () => {
  it('turns a half-width column into a symmetric full width', () => {
    // Half the authoring, and symmetry that reads as intentional rather than as
    // a wobble — most of what this sheet depicts (shields, crowns, gates, urns)
    // is symmetric anyway.
    const half = upscale(Array<string>(12).fill('oSS...'), GATES.SPRITE_SIZE / 12)
    const full = mirror(half)
    expect(full).toHaveLength(GATES.SPRITE_SIZE)
    expect(full[0]).toBe(half[0] + [...half[0]!].reverse().join(''))
    expect(GATES.spriteErrors('mirrored', full)).toEqual([])
  })

  it('refuses a half that is not half the grid wide', () => {
    const wrong = 'oS$'.repeat(GATES.SPRITE_SIZE / 2 - 1)
    expect(() => mirror(Array<string>(GATES.SPRITE_SIZE).fill(wrong))).toThrow(String(GATES.SPRITE_SIZE / 2))
  })
})

describe('the surface decides what a candidate is measured against', () => {
  /*
   * The gap a second-opinion review found: `generate` took the colours from its
   * caller and never read `candidate.surface`, so every rule the surface encodes
   * — which backgrounds a mark can land on, and that a PIECE is drawn in both
   * army tints — was a convention the caller could get wrong rather than an
   * invariant the generator held. Both tests below fail against that version.
   */
  it('measures a card against the card surfaces, not against a background it never touches', () => {
    // Legible on the light board tone and invisible on all three card panels.
    // A generator taking `color-board-light` from its caller accepts it.
    const paleOnDark = { name: 'pale', surface: 'card' as const, rows: SOLID('K') }
    const out = generate([paleOnDark], CTX)
    expect(out.accepted).toEqual([])
    expect(out.rejected[0]?.errors.join(' ')).toContain('best edge')
  })

  it('measures a piece against BOTH side tints', () => {
    // The sprite is nothing but `$`, so its only tone IS the tint: it clears the
    // board tones in the light tint and fails in the dark one. Checked against a
    // single tint it passes, which is how one army ends up unreadable.
    const tintOnly = { name: 'tinted', surface: 'piece' as const, rows: SOLID('$') }
    const pieceToken = (name: string) =>
      name === 'pix-tint-white' ? '#ffffff' : name === 'pix-tint-black' ? '#1b1e27' : DARK
    const out = generate([tintOnly], { sheet: [], token: pieceToken })
    expect(out.accepted, 'the dark tint cannot separate from a dark board').toEqual([])
  })
})
