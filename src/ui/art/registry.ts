import type { ArtEntry } from './resolve'

/**
 * The art catalogue: art id -> the picture the app ships for it.
 *
 * Three rules, all load-bearing.
 *
 * **The UI owns art ids; content owns which one it wants.** ADR-011 forbids the
 * UI from naming a piece, card or square type, and an art id is the UI's own
 * vocabulary: a record points at an entry here, nothing here points back at a
 * record. So an art id names the PICTURE and must never echo a content id: ONE
 * segment after `art.`, the thing depicted, never the `<kind>.<slug>` form the
 * record itself uses.
 *
 * The obvious mistake is to mirror the content id under an `art.` prefix. It
 * looks harmless and is not — the mirrored id then CONTAINS the content id, so
 * `no-content-in-engine.test.ts`, which substring-scans this whole file, reads
 * the catalogue as naming that record. That scan does not distinguish code from
 * prose, so this comment cannot spell the bad ids out either. `art-key.test.ts`
 * generalises the rule to every entry.
 *
 * The names below are what each picture DEPICTS, which is why they do not read
 * as a translation of the record they serve: the card that ends a match when the
 * loser is down to two pieces gets a skull, and if that card is renamed the
 * skull is still a skull. That is the property the rule is protecting.
 *
 * **`surface` is not decoration.** It says where the picture is meant to appear,
 * and it is the only thing stopping a rule card from pointing at a square's art
 * — which renders perfectly and is then legibility-checked against the wrong
 * background. Raster entries carry the same fact in the asset's filename prefix.
 *
 * **Every entry is a sprite the app draws, not a file it loads** (Chess Craft
 * redesign). The raster path in `ArtEntry` is kept because the schema and the
 * resolver still support it, but nothing bundled uses it: a sprite costs the
 * bundler nothing to emit, the service worker nothing to precache, and
 * `vite-plugin-sw.ts` nothing to enumerate by hand — which its own comment
 * records going stale once already.
 */
export const artRegistry: ReadonlyMap<string, ArtEntry> = new Map<string, ArtEntry>([
  // --- pieces. `$` cells take the side tint, so one sprite serves both armies.
  ['art.king', { kind: 'pixel', sprite: 'king', surface: 'piece' }],
  ['art.queen', { kind: 'pixel', sprite: 'queen', surface: 'piece' }],
  ['art.rook', { kind: 'pixel', sprite: 'rook', surface: 'piece' }],
  ['art.knight', { kind: 'pixel', sprite: 'knight', surface: 'piece' }],
  ['art.pawn', { kind: 'pixel', sprite: 'pawn', surface: 'piece' }],
  ['art.archer', { kind: 'pixel', sprite: 'archer', surface: 'piece' }],

  // --- painted squares
  ['art.bomb', { kind: 'pixel', sprite: 'bomb', surface: 'square' }],
  ['art.portal', { kind: 'pixel', sprite: 'portal', surface: 'square' }],
  ['art.shrine', { kind: 'pixel', sprite: 'shrine', surface: 'square' }],
  ['art.sanctuary', { kind: 'pixel', sprite: 'sanctuary', surface: 'square' }],
  ['art.mire', { kind: 'pixel', sprite: 'mire', surface: 'square' }],

  // --- card faces. Rule cards and skill cards render on the same surfaces —
  // a badge, a sheet, a dex tile — so they share one `surface` value.
  ['art.hill', { kind: 'pixel', sprite: 'hill', surface: 'card' }],
  ['art.three', { kind: 'pixel', sprite: 'three', surface: 'card' }],
  ['art.skull', { kind: 'pixel', sprite: 'skull', surface: 'card' }],
  ['art.upgrade', { kind: 'pixel', sprite: 'upgrade', surface: 'card' }],
  ['art.crest', { kind: 'pixel', sprite: 'crest', surface: 'card' }],
  ['art.flame', { kind: 'pixel', sprite: 'flame', surface: 'card' }],
  ['art.ranks', { kind: 'pixel', sprite: 'ranks', surface: 'card' }],
  ['art.blood', { kind: 'pixel', sprite: 'blood', surface: 'card' }],
  ['art.bolt', { kind: 'pixel', sprite: 'bolt', surface: 'card' }],
  ['art.horse', { kind: 'pixel', sprite: 'horse', surface: 'card' }],
  ['art.swords', { kind: 'pixel', sprite: 'swords', surface: 'card' }],
  ['art.warp', { kind: 'pixel', sprite: 'warp', surface: 'card' }],
  ['art.arrows', { kind: 'pixel', sprite: 'arrows', surface: 'card' }],
  ['art.sprout', { kind: 'pixel', sprite: 'sprout', surface: 'card' }],
  ['art.ice', { kind: 'pixel', sprite: 'ice', surface: 'card' }],
  ['art.trap', { kind: 'pixel', sprite: 'trap', surface: 'card' }],
  ['art.crown', { kind: 'pixel', sprite: 'crown', surface: 'card' }],
  ['art.horse-leap', { kind: 'pixel', sprite: 'horse-leap', surface: 'card' }],
  ['art.horn', { kind: 'pixel', sprite: 'horn', surface: 'card' }],
  ['art.wall', { kind: 'pixel', sprite: 'wall', surface: 'card' }],
  ['art.chain', { kind: 'pixel', sprite: 'chain', surface: 'card' }],
  ['art.homeward', { kind: 'pixel', sprite: 'homeward', surface: 'card' }],
  ['art.fist', { kind: 'pixel', sprite: 'fist', surface: 'card' }],
  ['art.plus', { kind: 'pixel', sprite: 'plus', surface: 'card' }],
  ['art.arrow', { kind: 'pixel', sprite: 'arrow', surface: 'card' }],
  ['art.dagger', { kind: 'pixel', sprite: 'dagger', surface: 'card' }],
])
