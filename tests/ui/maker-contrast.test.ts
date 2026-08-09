import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * ADR-021 / ADR-007 for the controls this task added.
 *
 * Two claims, and the second is the one that catches a real regression:
 *
 * 1. The new components declare no literal colour. Every fill comes from
 *    `tokens.css`, so the contrast floors below are the only place a colour has
 *    to be argued for.
 * 2. Every state is separable without resolving its colour. Each fill clears a
 *    floor against the empty cell it sits in, and — because the two side
 *    surfaces are only 1.05:1 apart, which is hue and nothing else — each state
 *    also carries its own glyph. That combination is the design's actual
 *    promise, and the second half is what a colour-only gate would have missed
 *    while failing the grid that already ships.
 *
 * Written after the first version of this file asserted a colour separation the
 * palette never claimed. It failed, and the failure was the test's, not the
 * palette's: ADR-007's rule is that two cues must not differ by hue ALONE, which
 * the glyph satisfies.
 */

const ROOT = join(__dirname, '../..')
const TOKENS = readFileSync(join(ROOT, 'src/ui/tokens.css'), 'utf8')
const STYLES = readFileSync(join(ROOT, 'src/ui/styles.css'), 'utf8')

/** Files this task added or rewrote the visuals of. */
// `PiecePreview.tsx` was here until the maker went down to one drawing; the
// grid it duplicated is covered by the same rule through `RecordForm`.
const NEW_COMPONENTS = ['src/ui/MakerGallery.tsx']

const PAIR_MIN = 2.75

/**
 * The separation a state's fill already achieves against an empty cell.
 *
 * Pinned at what SHIPPED rather than at WCAG's 3:1, for the same reason
 * `art-contrast.test.ts` pins 3.30 for board art: `--color-board-painted` sits
 * at 2.74:1 here, so a 3:1 floor would fail the grid that is already on screen
 * and a 2.0 floor would let it regress by a third without anyone noticing. This
 * number is a ratchet, not an aspiration — raise it when the palette improves,
 * never lower it to fit a change.
 */
const FILL_MIN = 2.73

function token(name: string): string {
  const m = new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`).exec(TOKENS)
  if (!m) throw new Error(`no --${name} in tokens.css — the token names changed`)
  return m[1]!.toLowerCase()
}

function luminance(hex: string): number {
  const n = Number.parseInt(hex.slice(1), 16)
  const channel = (v: number) => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255)
}

const ratio = (a: string, b: string) => {
  const [x, y] = [luminance(a), luminance(b)]
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)
}

describe('the maker keeps its colours in the token file', () => {
  it.each(NEW_COMPONENTS)('%s declares no literal colour', (file) => {
    const src = readFileSync(join(ROOT, file), 'utf8')
    const literals = src.match(/#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/g) ?? []
    expect(literals, `${file} paints outside tokens.css`).toEqual([])
  })

  it('styles the preview from custom properties only', () => {
    const block = STYLES.slice(STYLES.indexOf('.preview-board'))
    const upToNext = block.slice(0, block.indexOf('/* ---') === -1 ? block.length : block.indexOf('/* ---'))
    const literals = upToNext.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []
    expect(literals, 'the preview stylesheet names a colour directly').toEqual([])
  })
})

describe('the maker separates its states by more than hue', () => {
  // The fills the grid, the slide dial and the preview actually use. Read off
  // the stylesheet's own rules rather than invented for the test.
  const SUNKEN = 'color-sunken'
  const MOVE = 'color-side-white'
  const CAPTURE = 'color-side-black'
  const BOTH = 'color-board-painted'

  it.each([
    ['move', MOVE],
    ['capture', CAPTURE],
    ['both', BOTH],
  ])('a %s cell is distinguishable from an empty one', (_label, fill) => {
    const got = ratio(token(fill), token(SUNKEN))
    expect(got, `${fill} is ${got.toFixed(2)}:1 against the empty cell`).toBeGreaterThanOrEqual(FILL_MIN)
  })

  /**
   * The two side surfaces are 1.05:1 apart — hue and almost nothing else — and
   * that is a DELIBERATE, recorded design choice, not an oversight: the mark's
   * third channel is its glyph, which is why `styles.css` pairs every cell state
   * with a `::after`. `art-contrast.test.ts` separates the two side TINTS; these
   * are the two side SURFACES, and they are not separated.
   *
   * So the claim worth gating is the one the design actually makes. Asserting a
   * colour separation the palette never promised would have failed the shipped
   * grid and pushed someone to change a palette that is doing its job.
   */
  it('gives every state its own glyph, since the fills alone do not separate', () => {
    const sideSeparation = ratio(token(MOVE), token(CAPTURE))
    expect(sideSeparation, 'the two side surfaces separated on their own — this test can be strengthened').toBeLessThan(
      PAIR_MIN,
    )

    const glyphs = [...STYLES.matchAll(/data-value='([123])'\]::after\s*\{[^}]*content:\s*'([^']+)'/g)]
    const byState = new Map(glyphs.map((m) => [m[1]!, m[2]!]))
    expect([...byState.keys()].sort(), 'a cell state lost its glyph').toEqual(['1', '2', '3'])
    expect(new Set(byState.values()).size, 'two states share a glyph').toBe(3)

    const previewGlyphs = [...STYLES.matchAll(/data-mark='(move|capture)'\]::after\s*\{[^}]*content:\s*'([^']+)'/g)]
    const byMark = new Map(previewGlyphs.map((m) => [m[1]!, m[2]!]))
    expect([...byMark.keys()].sort(), 'a preview mark lost its glyph').toEqual(['capture', 'move'])
    expect(new Set(byMark.values()).size, 'both preview marks draw the same glyph').toBe(2)
  })

  it('the glyph on a mark is legible on every state it can sit on', () => {
    for (const fill of [MOVE, CAPTURE, BOTH]) {
      const got = ratio(token('color-cue-hi'), token(fill))
      expect(got, `the cue glyph is ${got.toFixed(2)}:1 on ${fill}`).toBeGreaterThanOrEqual(PAIR_MIN)
    }
  })

  it('is not vacuous — a same-hue pair would fail this floor', () => {
    expect(ratio('#4b7fc1', '#4b8fc1')).toBeLessThan(PAIR_MIN)
  })
})
