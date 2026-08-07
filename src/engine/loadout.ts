import type { BoardDef, PresetDef } from '@content/schema'
import type { Side } from './types'

/**
 * What a side's loadout does to a match's setup (ADR-001, ADR-008).
 *
 * This module exists so the two questions a loadout answers — "which pieces
 * start on the board?" and "which skill cards can this side be offered?" — have
 * exactly one implementation each. The draft pool in particular is read from two
 * places (`createMatch`'s opening offer and `engine.ts`'s second draft on turn
 * six), and the repo already records `shared-vocabulary-unshared-code-path` at
 * count:2: one vocabulary read through two code paths is how half of a feature
 * silently keeps the old behaviour. Neither call site is allowed to build the
 * pool itself.
 *
 * It lives beside the engine rather than inside `match.ts` because `match.ts`
 * imports from `engine.ts` and `engine.ts` needs the pool too; a helper in
 * either one would be a cycle.
 */

/**
 * The skill cards `side` may be offered: the room's shared pool, plus its own
 * loadout card when it brought one.
 *
 * Appended rather than substituted — a loadout card is something a side brings
 * IN ADDITION to what the room deals, and the ban on the other side ever seeing
 * it is the whole point of the per-side split.
 */
export function skillPoolFor(preset: PresetDef, side: Side): string[] {
  const own = preset.loadout?.[side]?.skillCardId
  if (own === undefined) return preset.skillCardIds
  // Guarded against a room that ALSO lists the loadout card in its shared pool:
  // without this the card would sit in the pool twice and be twice as likely to
  // be offered, which is a silent bias in a system whose draft is meant to be
  // unbiased (AC-006).
  return preset.skillCardIds.includes(own) ? preset.skillCardIds : [...preset.skillCardIds, own]
}

/**
 * The board's placements with each side's loadout substitution applied.
 *
 * EVERY placement of the replaced piece on that side is substituted, not just
 * the first: the replaced piece may stand on several squares (a pawn line), and
 * replacing one of them would produce a position no author asked for and no rule
 * describes. Returns the board's own array untouched when no loadout applies, so
 * the common case allocates nothing.
 */
export function placementsFor(board: BoardDef, preset: PresetDef): BoardDef['placements'] {
  const loadout = preset.loadout
  if (!loadout?.white && !loadout?.black) return board.placements
  return board.placements.map((placement) => {
    const slot = loadout?.[placement.side]
    if (!slot || slot.replaces !== placement.pieceId) return placement
    return { ...placement, pieceId: slot.pieceId }
  })
}
