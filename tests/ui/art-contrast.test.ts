import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { BOARD_MIN, PAIR_MIN, SURFACES, bestEdge, contrastErrors, ratio } from '@ui/art/gates'
import { PIXEL_SPRITES, type PixelSprite } from '@ui/art/pixels'
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
 * Both thresholds are carried over from the browser test this replaced rather
 * than re-invented. The pair figure is the 2.75:1 the pre-redesign palette
 * achieved between the two sides; the board figure is the 3.30:1 it achieved for
 * the checker. 3.30 rather than WCAG's 3:1 non-text floor on purpose: art
 * scoring 3.1:1 would pass WCAG and still be worse than what shipped, and the
 * standing rule for this area is that neither number may be improved by
 * regressing the other.
 *
 * **The measurements themselves live in `@ui/art/gates`** (ADR-005 of
 * PLAN-preset-content-expansion) so the sprite generator refuses exactly what
 * this file refuses. Reading `tokens.css` stays here — the gate module never
 * touches the filesystem, and ADR-021 keeps `tokens.css` the only place a colour
 * is named.
 *
 * **What this file does NOT measure, since PLAN Phase 7.** It reads the sprite's CHARACTERS: the
 * set of palette tones present in twelve rows of text. That was the whole measurement while the
 * renderer drew axis-aligned rects with `crispEdges`, because then a rendered pixel WAS one of
 * those tones. Marks are rounded outline paths now, antialiased on purpose, so a rendered pixel
 * can be a blend that appears nowhere in the grid — thinner at every corner than the tone credited
 * here. A render change cannot make this file fail, which is the point and also the trap:
 * `e2e/art-rendered-contrast.spec.ts` measures the rasterised, composited result at the board's
 * real size, and the two files together are the gate. Do not delete that one on the grounds that
 * this one covers contrast.
 */

const TOKENS = readFileSync(join(__dirname, '../../src/ui/tokens.css'), 'utf8')

/** One token's value, as authored. Read rather than duplicated. */
function token(name: string): string {
  const m = new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`).exec(TOKENS)
  if (!m) throw new Error(`no --${name} in tokens.css — the token names changed`)
  return m[1]!.toLowerCase()
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
    const failures = pixelEntries.flatMap(([id, entry]) => {
      const sprite = PIXEL_SPRITES[entry.sprite]
      const backgrounds = SURFACES[entry.surface].map(token)
      // A piece is drawn in either tint, so it has to clear the bar in both.
      const candidates = entry.surface === 'piece' ? tints : [token('pix-tint')]
      return contrastErrors(id, sprite, backgrounds, candidates)
    })
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
