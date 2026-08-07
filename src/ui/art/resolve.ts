import type { Side } from '@engine/types'
import type { Translate } from '../i18n'
import { type PixelSprite, type SpriteName, PIXEL_SPRITES } from './pixels'

/**
 * What a record renders as (schema v7, PLAN-mobile-grade-graphics ADR-006).
 *
 * One function for all four content kinds, because the chain below is the same
 * everywhere and the only thing that varies is where it bottoms out: a piece
 * must always show SOMETHING (an empty square with a piece on it is a lie),
 * while a card that declares no icon must show nothing (inventing a glyph for
 * content that did not ask for one makes every unmarked card look alike).
 * That is the `fallback` option, and it is the whole of the difference between
 * what used to be `pieceGlyph` and `iconOf`.
 */

/**
 * An entry in the art catalogue.
 *
 * Sided for pieces — ADR-007: the two armies separate by hue AND weight AND
 * lightness today, a raster illustration inherits none of those tokens, so the
 * separation has to be drawn into two assets. Neutral for square types and
 * cards, which have no side.
 */
export type ArtEntry =
  | { kind: 'sided'; white: string; black: string }
  | { kind: 'neutral'; src: string }
  /**
   * A sprite from the app's own sheet (Chess Craft redesign).
   *
   * No side pair, unlike a raster entry: a sprite carries `$` cells that take
   * whatever tint the caller hands it, so ONE sprite covers both armies and
   * ADR-007's separation is a property of the render rather than of the asset.
   * That is why the sided/neutral split does not extend here.
   *
   * `surface` is the one thing that must be declared rather than derived. It
   * says where this picture is meant to appear, and `art-key.test.ts` uses it to
   * keep a rule card from pointing at a square's art — a mismatch that renders
   * fine and is contrast-checked against the wrong background. Raster entries
   * carry the same fact in the asset's filename prefix.
   */
  | { kind: 'pixel'; sprite: SpriteName; surface: 'piece' | 'square' | 'card' }

export type Mark =
  | { kind: 'art'; src: string }
  | { kind: 'pixel'; sprite: PixelSprite; tint: string | undefined }
  | { kind: 'glyph'; text: string }
  | { kind: 'monogram'; text: string }
  | { kind: 'none' }

/**
 * The tint a sprite's `$` cells take, per side.
 *
 * Custom properties rather than colours, so ADR-021's rule — `tokens.css` is
 * the only place a colour is named — survives art that is drawn in code. A
 * sprite with no `$` cells ignores this entirely.
 */
const SIDE_TINT: Readonly<Record<Side, string>> = {
  white: 'var(--pix-tint-white)',
  black: 'var(--pix-tint-black)',
}

type MarkDef = {
  artKey?: string | undefined
  iconKey?: string | undefined
  nameKey?: string | undefined
}

type Options = {
  registry: ReadonlyMap<string, ArtEntry>
  /** Omitted for cards and square types, which have no side. */
  side?: Side | undefined
  /** Where the chain bottoms out when nothing resolves. */
  fallback: 'monogram' | 'none'
}

/**
 * Art, if the catalogue has it in the shape this caller needs; else the glyph;
 * else the caller's floor.
 *
 * The three DEGENERATE art cases all fall through rather than failing loudly,
 * and that is deliberate. `artKey` is a plain string in the schema — nothing
 * validates it against the catalogue, and nothing stops a piece and a square
 * type from sharing one id — so an unknown id, a wrong-shaped entry, and an
 * entry carrying an empty url are all reachable. Rendering any of them as an
 * `<img>` would put a broken image on the board; falling through puts the
 * glyph there, which is what the record would have shown anyway. `artKeysOf`
 * plus a registry-coverage check is where such an id is meant to be caught —
 * loudly, in a test, rather than silently, on a child's board.
 */
export function resolveMark(t: Translate, def: MarkDef | undefined, opts: Options): Mark {
  const art = def?.artKey ? opts.registry.get(def.artKey) : undefined
  if (art?.kind === 'pixel') {
    // Registered under a name the sheet does not have is the pixel equivalent
    // of the empty-url case below: fall through to the glyph rather than draw a
    // blank box. `pixels.test.ts` makes it unreachable for anything bundled.
    const sprite = PIXEL_SPRITES[art.sprite] as PixelSprite | undefined
    // A sided read with no side does NOT fall through here, and that is the one
    // deliberate difference from a raster entry. There is only ever one sprite,
    // so "no side" is a question about the tint and not about which asset —
    // `Pix` answers it with the neutral default, which is what the reference
    // screens want anyway.
    if (sprite) return { kind: 'pixel', sprite, tint: opts.side ? SIDE_TINT[opts.side] : undefined }
  } else if (art) {
    // A sided entry read with no side, or a neutral entry read for a side, is
    // the shape mismatch above — not an error, just not usable here.
    const src = opts.side ? (art.kind === 'sided' ? art[opts.side] : '') : art.kind === 'neutral' ? art.src : ''
    // An EMPTY src is the third degenerate case, and the one that would still
    // reach the DOM: `<img src="">` resolves against the document URL, so the
    // browser either draws a broken image or re-fetches the page. A registry
    // entry can carry one the moment an asset import is removed without its
    // entry, which is a one-line edit. Treated exactly like the other two —
    // fall through to the glyph.
    if (src) return { kind: 'art', src }
  }

  if (def?.iconKey) {
    const icon = t(def.iconKey)
    // `translate` echoes a key it cannot resolve, so the bare version of this
    // branch painted `piece.foo.icon` across the square.
    if (icon !== def.iconKey) return { kind: 'glyph', text: icon }
  }

  if (opts.fallback === 'none') return { kind: 'none' }

  // `translate` returns the KEY when it cannot resolve one, so a piece with no
  // locale entry would otherwise put the first letter of `piece.foo.name` — a
  // bare `p` — on the board, indistinguishable from a real glyph.
  const name = def?.nameKey ? t(def.nameKey) : undefined
  if (!name || name === def?.nameKey) return { kind: 'monogram', text: '?' }
  return { kind: 'monogram', text: [...name][0] ?? '?' }
}
