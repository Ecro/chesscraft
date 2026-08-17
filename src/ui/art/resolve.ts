import type { Side } from '@engine/types'
import type { Translate } from '../i18n'

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
export type ArtSurface = 'piece' | 'square' | 'card'

export type ArtEntry =
  | { kind: 'sided'; white: string; black: string; surface: 'piece' }
  | { kind: 'neutral'; src: string; surface: 'square' | 'card' }

export type Mark =
  | { kind: 'art'; src: string }
  | { kind: 'glyph'; text: string }
  | { kind: 'monogram'; text: string }
  | { kind: 'none' }

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
  if (art) {
    // A sided entry read with no side, or a neutral entry read for a side, is
    // a shape mismatch — not an error, just not usable here.
    const src = opts.side ? (art.kind === 'sided' ? art[opts.side] : '') : art.kind === 'neutral' ? art.src : ''
    // An EMPTY src would make `<img src="">` re-fetch the document. Treat it
    // like an unknown id and preserve the safe text fallback.
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
