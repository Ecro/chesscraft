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

/**
 * The sprite gates, as a module rather than as assertions inside a test file.
 *
 * They moved here for one reason (ADR-005): the generator has to refuse exactly
 * what the suite refuses, and a generator carrying its own copy of "12x12,
 * palette-only, at most 60 rects" drifts from this one silently — the drift only
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

describe('spriteErrors', () => {
  it('accepts a well-formed sprite', () => {
    expect(spriteErrors('ok', rows('oooo........'))).toEqual([])
  })

  it('rejects the wrong number of rows', () => {
    const short = blankRows().slice(0, 11)
    short[0] = 'oooo........'
    expect(spriteErrors('short', short).join(' ')).toContain('11 rows')
  })

  it('rejects a row of the wrong length', () => {
    const bad = rows('ooo')
    expect(spriteErrors('ragged', bad).join(' ')).toContain('row 0')
  })

  it('rejects a character the palette does not know', () => {
    // `runsOf` paints an unknown character magenta rather than dropping it, so
    // without this the sprite ships loud instead of failing.
    expect(spriteErrors('typo', rows('oQoo........')).join(' ')).toContain('Q')
  })

  it('rejects a sprite that draws nothing', () => {
    // An all-transparent sprite type-checks, registers, resolves and renders an
    // empty box — the failure mode that looks exactly like a layout bug.
    expect(spriteErrors('blank', blankRows()).join(' ')).toContain('draws nothing')
  })

  it('rejects a sprite over the rect cap', () => {
    // Alternating characters defeat run-merging: 6 runs per row, 12 rows = 72.
    const dither = Array<string>(SPRITE_SIZE).fill('oyoyoyoyoyoy')
    expect(rectCount(dither)).toBeGreaterThan(RECT_CAP)
    expect(spriteErrors('dither', dither).join(' ')).toContain('rects')
  })

  it('treats `.` and `$` as known without putting them in the palette', () => {
    expect(spriteErrors('tinted', rows('$$$$........'))).toEqual([])
  })
})

describe('isBlank / drawnPixels / rectCount', () => {
  it('counts only non-transparent cells', () => {
    expect(drawnPixels(rows('oooo........'))).toBe(4)
    expect(drawnPixels(blankRows())).toBe(0)
  })

  it('calls an all-transparent sprite blank', () => {
    expect(isBlank(blankRows())).toBe(true)
    expect(isBlank(rows('...o........'))).toBe(false)
  })

  it('merges a span of identical pixels into one rect', () => {
    expect(rectCount(rows('oooooo......'))).toBe(1)
    expect(rectCount(rows('ooo...ooo...'))).toBe(2)
  })
})

describe('sheetCompression', () => {
  it('passes a sheet of solid runs', () => {
    const sheet = [rows('oooooooooooo'), rows('oooooooooooo')]
    const result = sheetCompression(sheet)
    expect(result.runs).toBe(2)
    expect(result.pixels).toBe(24)
    expect(result.ok).toBe(true)
  })

  it('fails a sheet that is mostly single pixels', () => {
    // The gate is an aggregate over the WHOLE sheet, which is why a batch of
    // noisy sprites can break it while each one passes its own rect cap.
    const noisy = [Array<string>(SPRITE_SIZE).fill('o.o.o.o.o.o.')]
    const result = sheetCompression(noisy)
    expect(result.ok).toBe(false)
    expect(result.runs).toBeGreaterThanOrEqual(result.pixels / SHEET_DIVISOR)
  })
})

describe('contrast', () => {
  it('scores a black-on-white pair near the maximum', () => {
    expect(ratio('#000000', '#ffffff')).toBeCloseTo(21, 0)
  })

  it('lets either end of the sprite carry the separation', () => {
    // The cue-sandwich rule: a dark ring around a light body reads on both a
    // dark and a light background because only ONE tone has to clear the bar.
    const sandwich = rows('oooo........', 'oSSo........')
    expect(bestEdge(sandwich, '#8ab4ff', '#ffffff')).toBeGreaterThan(BOARD_MIN)
    expect(bestEdge(sandwich, '#8ab4ff', '#000000')).toBeGreaterThan(BOARD_MIN)
  })

  it('rejects a flat fill that sits close to its background', () => {
    // Two fills a generator would happily call "a red army and a green army":
    // equally bright, so neither separates from a mid-tone background.
    const flat = Array<string>(SPRITE_SIZE).fill('cccccccccccc')
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
