import { describe, expect, it } from 'vitest'
import {
  BOARD_MIN,
  RECT_CAP,
  SHEET_DIVISOR,
  SPRITE_SIZE,
  SURFACES,
  bestEdge,
  contrastErrors,
  drawnPixels,
  isBlank,
  ratio,
  rectCount,
  sheetCompression,
  spriteErrors,
} from '@ui/art/gates'
import { upscale } from '../../scripts/upscale-sprites.ts'

/**
 * The sprite gates, as a module rather than as assertions inside a test file.
 *
 * They moved here for one reason (ADR-005): the generator has to refuse exactly
 * what the suite refuses, and a generator carrying its own copy of "a fixed grid,
 * palette-only, a fixed rect cap" drifts from this one silently — the drift only
 * shows up when a sprite that the generator accepted fails CI. Sharing the module
 * makes the drift impossible instead of unlikely.
 *
 * These tests check the predicates themselves. `pixels.test.ts` and
 * `art-contrast.test.ts` apply them to the shipped sheet; `sprite-generator.test.ts`
 * pins that the generator imports this very module.
 */

const blankRows = () => Array<string>(SPRITE_SIZE).fill('.'.repeat(SPRITE_SIZE))

function rows(...drawn: string[]): string[] {
  const out = blankRows()
  drawn.forEach((row, i) => {
    out[i] = row
  })
  return out
}

/**
 * A drawn row of the CURRENT grid width, from however much of it you want to name.
 *
 * The fixtures here used to spell twelve characters out, which stopped being a row the
 * moment `SPRITE_SIZE` moved and quietly turned several of these tests into assertions
 * about a ragged sprite — `sheetCompression` does not validate widths, so "a sheet of
 * solid runs" went on passing while measuring half the pixels it claimed to.
 */
const drawn = (head: string) => head + '.'.repeat(SPRITE_SIZE - head.length)

/** A full-width run of one character. */
const solid = (ch: string) => ch.repeat(SPRITE_SIZE)

describe('spriteErrors', () => {
  it('accepts a well-formed sprite', () => {
    expect(spriteErrors('ok', rows(drawn('oooo')))).toEqual([])
  })

  it('rejects the wrong number of rows', () => {
    const short = blankRows().slice(0, SPRITE_SIZE - 1)
    short[0] = drawn('oooo')
    expect(spriteErrors('short', short).join(' ')).toContain(`${SPRITE_SIZE - 1} rows`)
  })

  it('rejects a row of the wrong length', () => {
    const bad = rows('ooo')
    expect(spriteErrors('ragged', bad).join(' ')).toContain('row 0')
  })

  it('rejects a character the palette does not know', () => {
    // `runsOf` paints an unknown character magenta rather than dropping it, so
    // without this the sprite ships loud instead of failing.
    expect(spriteErrors('typo', rows(drawn('oQoo'))).join(' ')).toContain('Q')
  })

  it('rejects a sprite that draws nothing', () => {
    // An all-transparent sprite type-checks, registers, resolves and renders an
    // empty box — the failure mode that looks exactly like a layout bug.
    expect(spriteErrors('blank', blankRows()).join(' ')).toContain('draws nothing')
  })

  it('rejects a sprite over the rect cap', () => {
    // UPSCALED from the original 12-wide fixture, not re-authored at 24 — its assertion
    // encodes a run count relative to RECT_CAP, and the two are not the same sprite.
    //
    // `oyoy...` has NO transparent cell, so every character starts a new run: 12 runs per
    // row, not 6. Upscaled that is 12 x 24 = 288 against a cap of 120. The "6 runs per row"
    // this comment used to claim was inherited from the 12x12 era and was wrong there too —
    // it is the arithmetic of the SHEET-FLOOR fixture below (`o.o.o...`, where `.` breaks
    // the runs), copied onto a fixture it does not describe.
    const dither = upscale(Array<string>(12).fill('oyoyoyoyoyoy'), SPRITE_SIZE / 12)
    expect(rectCount(dither)).toBeGreaterThan(RECT_CAP)
    expect(spriteErrors('dither', dither).join(' ')).toContain('rects')
  })

  it('treats `.` and `$` as known without putting them in the palette', () => {
    expect(spriteErrors('tinted', rows(drawn('$$$$')))).toEqual([])
  })
})

describe('isBlank / drawnPixels / rectCount', () => {
  it('counts only non-transparent cells', () => {
    expect(drawnPixels(rows(drawn('oooo')))).toBe(4)
    expect(drawnPixels(blankRows())).toBe(0)
  })

  it('calls an all-transparent sprite blank', () => {
    expect(isBlank(blankRows())).toBe(true)
    expect(isBlank(rows(drawn('...o')))).toBe(false)
  })

  it('merges a span of identical pixels into one rect', () => {
    expect(rectCount(rows(drawn('oooooo')))).toBe(1)
    expect(rectCount(rows(drawn('ooo...ooo')))).toBe(2)
  })
})

describe('sheetCompression', () => {
  it('passes a sheet of solid runs', () => {
    const sheet = [rows(solid('o')), rows(solid('o'))]
    const result = sheetCompression(sheet)
    expect(result.runs).toBe(2)
    expect(result.pixels).toBe(2 * SPRITE_SIZE)
    expect(result.ok).toBe(true)
  })

  it('fails a sheet that is mostly single pixels', () => {
    // The gate is an aggregate over the WHOLE sheet, which is why a batch of
    // noisy sprites can break it while each one passes its own rect cap.
    //
    // UPSCALED from the 12-wide original rather than re-authored, for the reason the
    // next test spells out: only the upscaled form can tell the two divisors apart.
    const noisy = [upscale(Array<string>(12).fill('o.o.o.o.o.o.'), SPRITE_SIZE / 12)]
    const result = sheetCompression(noisy)
    expect(result.ok).toBe(false)
    expect(result.runs).toBeGreaterThanOrEqual(result.pixels / SHEET_DIVISOR)
  })

  it('rejects at the derived divisor what the OLD one would have admitted', () => {
    /*
     * The one assertion standing between this repo and a dead compression gate.
     *
     * `SHEET_DIVISOR` is derived from `SPRITE_SIZE` because a k-upscale takes runs to k
     * times and pixels to k squared, so the pixels-per-run ratio scales by k. If someone
     * "simplifies" that back to a literal 1.8, this gate stops rejecting anything at 24x24
     * — and every other test here would stay green, because they only ever ask for
     * rejection and the sheet has 1.21x headroom under either number.
     *
     * The discriminating fixture is the UPSCALE of the 12-wide dither, and only that:
     *   upscaled   144 runs / 288 px -> admitted under 1.8 (floor 160), rejected under 3.6 (floor 80)
     *   re-authored 288 runs / 288 px -> rejected under BOTH, so it proves nothing
     * Asserting both polarities is what makes the test fail when the derivation is lost,
     * rather than merely pass when it is kept.
     */
    const upscaled = upscale(Array<string>(12).fill('o.o.o.o.o.o.'), SPRITE_SIZE / 12)
    const { runs, pixels, ok } = sheetCompression([upscaled])

    expect(ok, `${runs} runs / ${pixels} px must fail the derived floor`).toBe(false)
    expect(runs < pixels / 1.8, `${runs} runs / ${pixels} px must PASS the pre-migration 1.8`).toBe(true)
  })
})

describe('contrast', () => {
  it('scores a black-on-white pair near the maximum', () => {
    expect(ratio('#000000', '#ffffff')).toBeCloseTo(21, 0)
  })

  it('lets either end of the sprite carry the separation', () => {
    // The cue-sandwich rule: a dark ring around a light body reads on both a
    // dark and a light background because only ONE tone has to clear the bar.
    const sandwich = rows(drawn('oooo'), drawn('oSSo'))
    expect(bestEdge(sandwich, '#8ab4ff', '#ffffff')).toBeGreaterThan(BOARD_MIN)
    expect(bestEdge(sandwich, '#8ab4ff', '#000000')).toBeGreaterThan(BOARD_MIN)
  })

  it('rejects a flat fill that sits close to its background', () => {
    // Two fills a generator would happily call "a red army and a green army":
    // equally bright, so neither separates from a mid-tone background.
    const flat = Array<string>(SPRITE_SIZE).fill(solid('c'))
    const errors = contrastErrors('flat', flat, ['#7b7b7b'], ['#c9a4ff'])
    expect(errors.length).toBeGreaterThan(0)
    expect(errors.join(' ')).toContain('flat')
  })

  it('names every surface a mark of each kind can land on', () => {
    // A piece moves anywhere, so it meets the checker AND the painted stripe; a
    // square-type mark only ever appears on a painted square. Gating a square
    // against the plain checker rejects art for failing on a background it never
    // touches — strict in the wrong direction is still wrong.
    expect(SURFACES.piece).toContain('color-board-painted')
    expect(SURFACES.piece.length).toBeGreaterThan(SURFACES.square.length)
    expect(SURFACES.square).toEqual(['color-board-painted'])
    expect(SURFACES.card.length).toBeGreaterThan(0)
  })
})
