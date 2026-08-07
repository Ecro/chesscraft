import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { PIXEL_PALETTE, PIXEL_SPRITES, type PixelSprite } from '@ui/art/pixels'
import { artRegistry } from '@ui/art/registry'

/**
 * The gate every mark in the app has to clear.
 *
 * The two armies separate by hue AND lightness AND position, and `tokens.css`
 * records the measurements that justify the palette on that basis. Art inherits
 * none of it: once a piece is a picture, the whole safeguard lives in what the
 * picture happens to look like. Roughly one in twelve boys reads red/green
 * poorly, and a chess board is the worst possible place to learn that about
 * yourself — so "the two sides differ in LUMINANCE, not only in hue" stops being
 * a palette property and becomes a property of the sprite sheet.
 *
 * ## Why this is no longer a browser test
 *
 * It used to be `e2e/art-contrast.spec.ts`, and it ran in a browser for one
 * reason: the art was WebP, and the browser is the only thing in this repo that
 * decodes WebP. A sprite is 12 rows of characters and a palette, so the pixels
 * are already numbers — and a static check is strictly better than a screenshot
 * probe here. It cannot be flaky, it names the sprite and the surface in the
 * failure, and it runs on every `vitest` rather than only when a dev server is
 * up.
 *
 * Both thresholds are carried over from that file rather than re-invented. The
 * pair figure is the 2.75:1 the pre-redesign palette achieved between the two
 * sides; the board figure is the 3.30:1 it achieved for the checker. 3.30 rather
 * than WCAG's 3:1 non-text floor on purpose: art scoring 3.1:1 would pass WCAG
 * and still be worse than what shipped, and the standing rule for this area is
 * that neither number may be improved by regressing the other.
 */

const PAIR_MIN = 2.75
const BOARD_MIN = 3.3

const TOKENS = readFileSync(join(__dirname, '../../src/ui/tokens.css'), 'utf8')

/** One token's value, as authored. Read rather than duplicated. */
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

/**
 * Which surfaces a mark of each kind can actually land on.
 *
 * This is the correction to the obvious version of this gate, and it is not a
 * detail. Measuring every sprite against every board tone looks stricter and is
 * simply wrong: a square-type mark is only ever drawn on a PAINTED square, so
 * gating it against the plain checker rejects art for failing on a background it
 * never touches. Being wrong in the strict direction is still wrong — it teaches
 * everyone to add exceptions rather than contrast.
 *
 * Pieces are the case that needs all of them: a piece stands wherever it is
 * moved, so it meets the checker AND the painted stripe.
 */
const SURFACES: Record<'piece' | 'square' | 'card', string[]> = {
  piece: ['color-board-light', 'color-board-dark', 'color-board-painted'],
  square: ['color-board-painted'],
  // A card face, a dex tile, a hotbar slot and the rule bar. The recessed slot
  // and the raised panel are the two extremes of that set.
  card: ['color-sunken', 'color-surface', 'color-note'],
}

/** Every distinct colour a sprite draws, with `$` resolved to a side's tint. */
function tonesOf(sprite: PixelSprite, tint: string): string[] {
  const chars = new Set(sprite.join('').replace(/\./g, ''))
  return [...chars].map((ch) => (ch === '$' ? tint : (PIXEL_PALETTE[ch] ?? '#ff00ff')))
}

/**
 * The best separation a sprite achieves against one background.
 *
 * EITHER end may carry it, and that is the cue-sandwich rule rather than a
 * loophole: a mark with a dark ring and a light body reads on both a dark and a
 * light background precisely because only one tone has to separate. Requiring
 * every tone to clear the bar would reject every drawing with shading in it.
 */
function bestEdge(sprite: PixelSprite, tint: string, background: string): number {
  return Math.max(...tonesOf(sprite, tint).map((tone) => ratio(tone, background)))
}

const pixelEntries = [...artRegistry.entries()].flatMap(([id, entry]) =>
  entry.kind === 'pixel' ? [[id, entry] as const] : [],
)

describe('every sprite separates from every surface it can land on', () => {
  it('registers something to gate', () => {
    // A vacuous green here would read as "the art was checked" for as long as
    // there is none, which is the entire window in which someone might add some.
    expect(pixelEntries.length).toBeGreaterThan(0)
  })

  it('clears the board floor on each of its own surfaces', () => {
    const tints = [token('pix-tint-white'), token('pix-tint-black')]
    const failures: string[] = []
    for (const [id, entry] of pixelEntries) {
      const sprite = PIXEL_SPRITES[entry.sprite]
      for (const name of SURFACES[entry.surface]) {
        const background = token(name)
        // A piece is drawn in either tint, so it has to clear the bar in both.
        const candidates = entry.surface === 'piece' ? tints : [token('pix-tint')]
        for (const tint of candidates) {
          const best = bestEdge(sprite, tint, background)
          if (best < BOARD_MIN) {
            failures.push(`${id} on --${name} (tint ${tint}): best edge ${best.toFixed(2)}:1, needs ${BOARD_MIN}:1`)
          }
        }
      }
    }
    expect(failures, failures.join('\n')).toEqual([])
  })
})

describe('the two sides separate by luminance, not only hue', () => {
  it('keeps the tints apart', () => {
    const separation = ratio(token('pix-tint-white'), token('pix-tint-black'))
    expect(separation, `the two side tints are ${separation.toFixed(2)}:1 apart`).toBeGreaterThanOrEqual(PAIR_MIN)
  })

  it('keeps each tint off the outline it is drawn against', () => {
    // A tint as dark as the sprite's own outline turns the piece into a
    // silhouette — the cheapest way to satisfy the assertion above and the one
    // that makes the drawing unreadable. The design mock's red pair failed the
    // separation test; the obvious fix fails this one.
    for (const name of ['pix-tint-white', 'pix-tint-black']) {
      const against = ratio(token(name), token('color-outline'))
      expect(against, `--${name} is ${against.toFixed(2)}:1 against the sprite outline`).toBeGreaterThanOrEqual(2)
    }
  })

  it('rejects a pair that differs in hue alone — proving it can fail', () => {
    /*
     * The failure mode this whole file exists for, made concrete: two fills a
     * generator would happily produce as "a red army and a green army", equally
     * bright. They look like two armies to most people and like one army to a
     * red/green-deficient player. If the gate cannot reject THIS, it cannot
     * reject anything.
     */
    expect(ratio('#c14b4b', '#4b8f4b')).toBeLessThan(PAIR_MIN)
    // And the surface rule rejects them too: a flat fill has no edge, so there
    // is no second tone to rescue it against a background of similar lightness.
    const flat: PixelSprite = Array<string>(12).fill('cccccccccccc')
    const painted = token('color-board-painted')
    expect(
      Math.max(...['#c14b4b', '#4b8f4b'].map((fill) => ratio(fill, painted))),
      'the fixture fills are not actually close to the painted square — pick better ones',
    ).toBeLessThan(BOARD_MIN)
    // The sprite form of the same point, so the helper is exercised too.
    expect(bestEdge(flat, '#c14b4b', painted)).toBeGreaterThan(0)
  })
})
