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
  ['art.bishop', { kind: 'pixel', sprite: 'bishop', surface: 'piece' }],
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

  // --- the spare pool + this expansion's own record art (Phase 3).
  // A registry entry claimed by NO record is legal and deliberate: the record
  // form builds its picker straight off this map, so an unclaimed entry is
  // exactly what an author sees when they make something new.
  ['art.helm', { kind: 'pixel', sprite: 'helm', surface: 'piece' }],
  ['art.spear', { kind: 'pixel', sprite: 'spear', surface: 'piece' }],
  ['art.shield', { kind: 'pixel', sprite: 'shield', surface: 'piece' }],
  ['art.cannon', { kind: 'pixel', sprite: 'cannon', surface: 'piece' }],
  ['art.banner', { kind: 'pixel', sprite: 'banner', surface: 'piece' }],
  ['art.orb', { kind: 'pixel', sprite: 'orb', surface: 'piece' }],
  ['art.axe', { kind: 'pixel', sprite: 'axe', surface: 'piece' }],
  ['art.hammer', { kind: 'pixel', sprite: 'hammer', surface: 'piece' }],
  ['art.bow', { kind: 'pixel', sprite: 'bow', surface: 'piece' }],
  ['art.staff', { kind: 'pixel', sprite: 'staff', surface: 'piece' }],
  ['art.lantern', { kind: 'pixel', sprite: 'lantern', surface: 'piece' }],
  ['art.anvil', { kind: 'pixel', sprite: 'anvil', surface: 'piece' }],
  ['art.bell', { kind: 'pixel', sprite: 'bell', surface: 'piece' }],
  ['art.chalice', { kind: 'pixel', sprite: 'chalice', surface: 'piece' }],
  ['art.urn', { kind: 'pixel', sprite: 'urn', surface: 'piece' }],
  ['art.gate', { kind: 'pixel', sprite: 'gate', surface: 'piece' }],
  ['art.obelisk', { kind: 'pixel', sprite: 'obelisk', surface: 'piece' }],
  ['art.wheel', { kind: 'pixel', sprite: 'wheel', surface: 'piece' }],
  ['art.talon', { kind: 'pixel', sprite: 'talon', surface: 'piece' }],
  ['art.fang', { kind: 'pixel', sprite: 'fang', surface: 'piece' }],
  ['art.pit', { kind: 'pixel', sprite: 'pit', surface: 'square' }],
  ['art.spikes', { kind: 'pixel', sprite: 'spikes', surface: 'square' }],
  ['art.water', { kind: 'pixel', sprite: 'water', surface: 'square' }],
  ['art.brambles', { kind: 'pixel', sprite: 'brambles', surface: 'square' }],
  ['art.rune', { kind: 'pixel', sprite: 'rune', surface: 'square' }],
  ['art.ember', { kind: 'pixel', sprite: 'ember', surface: 'square' }],
  ['art.vine', { kind: 'pixel', sprite: 'vine', surface: 'square' }],
  ['art.crack', { kind: 'pixel', sprite: 'crack', surface: 'square' }],
  ['art.moss', { kind: 'pixel', sprite: 'moss', surface: 'square' }],
  ['art.dune', { kind: 'pixel', sprite: 'dune', surface: 'square' }],
  ['art.reed', { kind: 'pixel', sprite: 'reed', surface: 'square' }],
  ['art.ash', { kind: 'pixel', sprite: 'ash', surface: 'square' }],
  ['art.clay', { kind: 'pixel', sprite: 'clay', surface: 'square' }],
  ['art.crystal', { kind: 'pixel', sprite: 'crystal', surface: 'square' }],
  ['art.fog', { kind: 'pixel', sprite: 'fog', surface: 'square' }],
  ['art.cairn', { kind: 'pixel', sprite: 'cairn', surface: 'square' }],
  ['art.comet', { kind: 'pixel', sprite: 'comet', surface: 'card' }],
  ['art.flail', { kind: 'pixel', sprite: 'flail', surface: 'card' }],
  ['art.ring', { kind: 'pixel', sprite: 'ring', surface: 'card' }],
  ['art.lens', { kind: 'pixel', sprite: 'lens', surface: 'card' }],
  ['art.sigil', { kind: 'pixel', sprite: 'sigil', surface: 'card' }],
  ['art.card-beacon', { kind: 'pixel', sprite: 'card-beacon', surface: 'card' }],
  ['art.raven', { kind: 'pixel', sprite: 'raven', surface: 'card' }],
  ['art.cog', { kind: 'pixel', sprite: 'cog', surface: 'card' }],
  ['art.river', { kind: 'pixel', sprite: 'river', surface: 'card' }],
  ['art.camp', { kind: 'pixel', sprite: 'camp', surface: 'card' }],
  ['art.crownlet', { kind: 'pixel', sprite: 'crownlet', surface: 'card' }],
  ['art.rose', { kind: 'pixel', sprite: 'rose', surface: 'card' }],
  ['art.shell', { kind: 'pixel', sprite: 'shell', surface: 'card' }],
  ['art.road', { kind: 'pixel', sprite: 'road', surface: 'card' }],
  ['art.tower', { kind: 'pixel', sprite: 'tower', surface: 'card' }],
  ['art.whistle', { kind: 'pixel', sprite: 'whistle', surface: 'card' }],
  ['art.card-token', { kind: 'pixel', sprite: 'card-token', surface: 'card' }],
  ['art.eye', { kind: 'pixel', sprite: 'eye', surface: 'card' }],
  ['art.moon', { kind: 'pixel', sprite: 'moon', surface: 'card' }],
  ['art.sun', { kind: 'pixel', sprite: 'sun', surface: 'card' }],
  ['art.star', { kind: 'pixel', sprite: 'star', surface: 'card' }],
  ['art.key', { kind: 'pixel', sprite: 'key', surface: 'card' }],
  ['art.lock', { kind: 'pixel', sprite: 'lock', surface: 'card' }],
  ['art.book', { kind: 'pixel', sprite: 'book', surface: 'card' }],
  ['art.scroll', { kind: 'pixel', sprite: 'scroll', surface: 'card' }],
  ['art.hourglass', { kind: 'pixel', sprite: 'hourglass', surface: 'card' }],
  ['art.scales', { kind: 'pixel', sprite: 'scales', surface: 'card' }],
  ['art.feather', { kind: 'pixel', sprite: 'feather', surface: 'card' }],
  ['art.drum', { kind: 'pixel', sprite: 'drum', surface: 'card' }],
  ['art.mask', { kind: 'pixel', sprite: 'mask', surface: 'card' }],
  ['art.mirror', { kind: 'pixel', sprite: 'mirror', surface: 'card' }],
  ['art.coin', { kind: 'pixel', sprite: 'coin', surface: 'card' }],
  ['art.gem', { kind: 'pixel', sprite: 'gem', surface: 'card' }],
  ['art.rope', { kind: 'pixel', sprite: 'rope', surface: 'card' }],
  ['art.net', { kind: 'pixel', sprite: 'net', surface: 'card' }],
  ['art.torch', { kind: 'pixel', sprite: 'torch', surface: 'card' }],
  ['art.cauldron', { kind: 'pixel', sprite: 'cauldron', surface: 'card' }],
  ['art.potion', { kind: 'pixel', sprite: 'potion', surface: 'card' }],
  ['art.seed', { kind: 'pixel', sprite: 'seed', surface: 'card' }],
  ['art.root', { kind: 'pixel', sprite: 'root', surface: 'card' }],
  ['art.storm', { kind: 'pixel', sprite: 'storm', surface: 'card' }],
  ['art.wave', { kind: 'pixel', sprite: 'wave', surface: 'card' }],
  ['art.mountain', { kind: 'pixel', sprite: 'mountain', surface: 'card' }],
  ['art.bridge', { kind: 'pixel', sprite: 'bridge', surface: 'card' }],
  ['art.ladder', { kind: 'pixel', sprite: 'ladder', surface: 'card' }],
  ['art.compass', { kind: 'pixel', sprite: 'compass', surface: 'card' }],
  ['art.candle', { kind: 'pixel', sprite: 'candle', surface: 'card' }],
  ['art.lance', { kind: 'pixel', sprite: 'lance', surface: 'piece' }],
  ['art.crossbow', { kind: 'pixel', sprite: 'crossbow', surface: 'piece' }],
  ['art.warhorse', { kind: 'pixel', sprite: 'warhorse', surface: 'piece' }],
  ['art.watchtower', { kind: 'pixel', sprite: 'watchtower', surface: 'piece' }],
  ['art.censer', { kind: 'pixel', sprite: 'censer', surface: 'piece' }],
  ['art.cloak', { kind: 'pixel', sprite: 'cloak', surface: 'piece' }],
  ['art.geyser', { kind: 'pixel', sprite: 'geyser', surface: 'square' }],
  ['art.thorns', { kind: 'pixel', sprite: 'thorns', surface: 'square' }],
  ['art.mist', { kind: 'pixel', sprite: 'mist', surface: 'square' }],
  ['art.springboard', { kind: 'pixel', sprite: 'springboard', surface: 'square' }],
  ['art.levy', { kind: 'pixel', sprite: 'levy', surface: 'square' }],
  ['art.altar', { kind: 'pixel', sprite: 'altar', surface: 'square' }],
  ['art.recoil', { kind: 'pixel', sprite: 'recoil', surface: 'card' }],
  ['art.democracy', { kind: 'pixel', sprite: 'democracy', surface: 'card' }],
  ['art.beacon', { kind: 'pixel', sprite: 'beacon', surface: 'card' }],
  ['art.tribute', { kind: 'pixel', sprite: 'tribute', surface: 'card' }],
  ['art.eclipse', { kind: 'pixel', sprite: 'eclipse', surface: 'card' }],
  ['art.oath', { kind: 'pixel', sprite: 'oath', surface: 'card' }],
  ['art.siege', { kind: 'pixel', sprite: 'siege', surface: 'card' }],
  ['art.harvest', { kind: 'pixel', sprite: 'harvest', surface: 'card' }],
  ['art.leash', { kind: 'pixel', sprite: 'leash', surface: 'card' }],
  ['art.blink', { kind: 'pixel', sprite: 'blink', surface: 'card' }],
  ['art.mend', { kind: 'pixel', sprite: 'mend', surface: 'card' }],
  ['art.quake', { kind: 'pixel', sprite: 'quake', surface: 'card' }],
  ['art.veil', { kind: 'pixel', sprite: 'veil', surface: 'card' }],
  ['art.dart', { kind: 'pixel', sprite: 'dart', surface: 'card' }],
  ['art.tide', { kind: 'pixel', sprite: 'tide', surface: 'card' }],
  ['art.brand', { kind: 'pixel', sprite: 'brand', surface: 'card' }],
  ['art.echo', { kind: 'pixel', sprite: 'echo', surface: 'card' }],
])
