import type { ContentSet } from '@content/load'
import type { EffectLayer, GameState, SquareId } from '@engine/types'

/**
 * The effects standing on the board right now, as the screen needs them.
 *
 * One derivation, three surfaces (ADR-005): the square badge, the legend chip
 * and the peek sheet all read this list. Deriving each separately is how the
 * chip row and the board come to disagree about what is live — and a badge on a
 * square with no chip beside it reads as a rendering bug to a player, which is
 * the one thing this feature exists to stop being.
 *
 * Only DURATIONED effects appear, which is a real limit and not an oversight: a
 * `grant_movement` with no duration is consumed by the move-generation sweep and
 * never reaches `state.grants`, so a piece passive's permanent grant leaves no
 * state to render. Recorded as a Non-Goal in the PLAN rather than papered over
 * with a second derivation that would have to re-run the generation pass.
 */

/** What a badge says. Kept English and machine-readable; the words are i18n. */
export type EffectKind = 'frozen' | 'granted' | 'forbidden' | 'shielded'

export interface LiveEffect {
  readonly square: SquareId
  readonly kind: EffectKind
  /** Plies still to run. Always at least 1 — an expired effect is not live. */
  readonly remaining: number
  /** The record that caused it, and which layer that record belongs to. */
  readonly sourceId: string
  readonly layer: EffectLayer
}

const GRANT_KIND: Record<string, EffectKind> = {
  grant_movement: 'granted',
  forbid_movement: 'forbidden',
  block_capture: 'shielded',
}

/**
 * Every live effect, in board order.
 *
 * Sorted by square so the chip row is stable between renders — an order that
 * followed insertion would reshuffle the row every time a card resolved, and a
 * row that moves under a thumb is a row that gets mis-tapped.
 */
export function liveEffects(state: GameState): LiveEffect[] {
  const out: LiveEffect[] = []

  for (const [square, entry] of Object.entries(state.frozenUntil)) {
    if (entry.untilPly <= state.plyCount) continue
    out.push({
      square,
      kind: 'frozen',
      remaining: entry.untilPly - state.plyCount,
      sourceId: entry.sourceId,
      layer: entry.layer,
    })
  }

  for (const grant of state.grants) {
    if (grant.untilPly <= state.plyCount) continue
    const kind = GRANT_KIND[grant.kind]
    if (!kind) continue
    out.push({
      square: grant.square,
      kind,
      remaining: grant.untilPly - state.plyCount,
      sourceId: grant.sourceId,
      layer: grant.layer,
    })
  }

  return out.sort((a, b) => a.square.localeCompare(b.square) || a.kind.localeCompare(b.kind))
}

/**
 * The one badge a square shows, when several effects sit on it.
 *
 * A square can carry a freeze AND a shield, and it has room for one pip. The
 * order is by how much it changes what the player may do: frozen (you cannot
 * act) beats forbidden (you cannot move) beats shielded (you cannot be taken)
 * beats granted (you can do more). Choosing by insertion order instead would
 * make the badge depend on which card happened to resolve first.
 */
const BADGE_PRIORITY: readonly EffectKind[] = ['frozen', 'forbidden', 'shielded', 'granted']

export function badgeFor(effects: readonly LiveEffect[], square: SquareId): LiveEffect | undefined {
  const here = effects.filter((e) => e.square === square)
  if (here.length === 0) return undefined
  return [...here].sort((a, b) => BADGE_PRIORITY.indexOf(a.kind) - BADGE_PRIORITY.indexOf(b.kind))[0]
}

/** The record an effect came from, whatever layer owns it. */
export function sourceRecord(
  effect: LiveEffect,
  content: ContentSet,
): { nameKey: string; textKey: string; artKey?: string | undefined; iconKey?: string | undefined } | undefined {
  switch (effect.layer) {
    case 'skill':
      return content.skillCards.get(effect.sourceId)
    case 'rule':
      return content.ruleCards.get(effect.sourceId)
    case 'square':
      return content.squareTypes.get(effect.sourceId)
    case 'piece':
      return content.pieces.get(effect.sourceId)
  }
}
