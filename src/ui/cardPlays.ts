import type { GameState, Side, SquareId } from '@engine/types'
import { type LiveEffect, liveEffects } from './liveEffects'

/**
 * Was a card played between these two states, and what did it touch.
 *
 * Read off the HISTORY, never raised from the click (ADR-002). Four routes
 * reach "a card was played" — the human commit path, the commit button for a
 * card that names no square, the computer's `push(move.action)`, and `undo`
 * stepping back across one — and `[fail:design] rule-keyed-to-event-not-state`
 * is at count:3 in this repo, once in the very component that will call this.
 * Every recorded instance failed the same way: behaviour attached to the input
 * that USUALLY produces a state, and then a second route to that state was
 * added and nothing fired. Deriving from the pair of states covers the routes
 * nobody enumerated, including the ones not written yet.
 *
 * Pure, and outside React on purpose: two `GameState`s in, a value out.
 */
export interface CardPlay {
  readonly cardId: string
  readonly side: Side
  /** Squares this card changed. Empty is a legal answer — see below. */
  readonly impacted: ReadonlySet<SquareId>
}

/**
 * The identity of one live effect, at a given ply.
 *
 * The last component is the ABSOLUTE ply the effect ends on, never the
 * countdown: `remaining` ticks down every ply, so a key built on it changes for
 * an effect that is merely surviving, and every live effect then reads as newly
 * arrived on every single ply. A board that flashes constantly says nothing.
 *
 * That property is invisible from `cardPlayBetween` — a card play does not
 * advance `plyCount` (`engine.ts`'s `play_card` branch leaves it alone; only a
 * move raises it), so the two encodings agree on every pair that function is
 * ever handed. Exported for that reason and no other: it is the only way the
 * encoding can be pinned by a test instead of by a comment. `MatchHost`'s
 * `arrived` derivation is where the rule actually bites, and it diffs across
 * moves.
 *
 * All four descriptive fields are in the key, and each earns its place: two
 * squares frozen by one card differ only in `square`, two cards landing the
 * same effect on one square differ only in `sourceId`, a freeze and a shield
 * differ only in `kind`, and `layer` is what separates a card's freeze from a
 * square's. Drop any one and two distinct effects collide under a single key,
 * and the second one is never reported.
 */
export function effectKey(effect: LiveEffect, plyCount: number): string {
  return `${effect.square}:${effect.kind}:${effect.layer}:${effect.sourceId}:${effect.remaining + plyCount}`
}

export function cardPlayBetween(prev: GameState, next: GameState): CardPlay | null {
  /*
   * `next.turnCard !== null` is the load-bearing half of this test.
   *
   * Without it, the move that CLOSES a card turn — which clears `turnCard` back
   * to null — reads as a change and the same card is announced twice: once when
   * it fired and once when the turn ended.
   */
  if (next.turnCard === null || next.turnCard === prev.turnCard) return null

  return {
    cardId: next.turnCard,
    /*
     * The side to move BEFORE the play. A card does not hand the board over —
     * the move that follows does — so the two are equal today. Reading it from
     * `prev` is what keeps this true of the side that actually spent the card
     * rather than of whoever happens to be on strike afterwards.
     */
    side: prev.sideToMove,
    impacted: impactedBetween(prev, next),
  }
}

/**
 * Every square this transition changed (ADR-003).
 *
 * Two sources, unioned, because neither sees the other's half. `liveEffects`
 * knows about freezes, grants, forbids and shields — and knows nothing about a
 * card that destroys, spawns or relocates a piece, which writes no effect state
 * at all. The board map knows the opposite. A derivation built on either alone
 * draws nothing for a third of the shipped deck, which reads to a player as the
 * feature being broken rather than absent.
 *
 * The effect half is a SYMMETRIC difference: an effect that appeared and an
 * effect that was lifted are both news about the card that did it. The occupancy
 * half compares the piece standing on each square in either state.
 *
 * Over-inclusive by design — a cascading card marks every square it moved a
 * piece through. Preferred to under-reporting, which is the behaviour this whole
 * feature exists to replace. An empty result is legal and means exactly what it
 * says: the card resolved and changed nothing a player can see, which is what a
 * skill refused on a royal looks like.
 */
function impactedBetween(prev: GameState, next: GameState): ReadonlySet<SquareId> {
  const out = new Set<SquareId>()

  const before = liveEffects(prev)
  const after = liveEffects(next)
  const beforeKeys = new Set(before.map((e) => effectKey(e, prev.plyCount)))
  const afterKeys = new Set(after.map((e) => effectKey(e, next.plyCount)))
  for (const e of after) if (!beforeKeys.has(effectKey(e, next.plyCount))) out.add(e.square)
  for (const e of before) if (!afterKeys.has(effectKey(e, prev.plyCount))) out.add(e.square)

  for (const square of new Set([...prev.board.keys(), ...next.board.keys()])) {
    const was = prev.board.get(square)
    const now = next.board.get(square)
    if (was?.pieceId !== now?.pieceId || was?.side !== now?.side) out.add(square)
  }

  return out
}
