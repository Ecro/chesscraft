/**
 * The collection ladder (ADR-004 of PLAN-nonfunctional-polish-benchmark).
 *
 * Four rungs, strictly ordered. The ordering is the whole contract: SPEC AC-005
 * says an entry never regresses, and "regress" is only meaningful against a
 * rank. Everything else in this module exists to make that rank the single
 * place the order is written down.
 *
 * `unencountered` is a rung rather than an absence so that `tierOf` is total —
 * a caller never has to distinguish "not in the collection" from "in it at the
 * bottom", and the render path has one value to switch on instead of a
 * value-or-null.
 *
 * Why `won` is here at all, and why it is separate from `used`: it is the one
 * rung that depends on the match RESULT rather than on what was played, which
 * is why SPEC AC-002 is scoped to `seen`/`used` and excludes this rung by name.
 * Keeping it on the same ladder rather than in a parallel structure is what
 * lets the monotonic guarantee cover it too.
 */

export type Tier = 'unencountered' | 'seen' | 'used' | 'won'

/** Low to high. Index is the rank; see `rankOf`. */
export const TIER_ORDER = ['unencountered', 'seen', 'used', 'won'] as const satisfies readonly Tier[]

/** Tiers that are actually stored. `unencountered` is the absence of all three. */
export const STORED_TIERS = ['seen', 'used', 'won'] as const

export type StoredTier = (typeof STORED_TIERS)[number]

/**
 * Where a tier sits on the ladder. Higher is further along.
 *
 * Derived from `TIER_ORDER` rather than hand-written, so the order cannot drift
 * from the list — a second literal is exactly how a ladder acquires two
 * disagreeing definitions.
 */
export function rankOf(tier: Tier): number {
  return TIER_ORDER.indexOf(tier)
}

/**
 * What one finished match says about the content it used.
 *
 * Three sets rather than a map, because a single match can legitimately place
 * one id in more than one — a card that was offered, taken, played and then won
 * with belongs in all three, and the merge reads the highest.
 */
export interface Observation {
  readonly seen: ReadonlySet<string>
  readonly used: ReadonlySet<string>
  readonly won: ReadonlySet<string>
}
