/**
 * What one finished match says about the content it touched (ADR-008).
 *
 * Pure, and deliberately narrow: it reads `Match.states` and the board
 * definition, and nothing else. No engine file learns that a collection exists,
 * and the derivation is testable without a browser, a DOM, or storage.
 *
 * It is NOT given the `ContentSet`, which is a safety property rather than an
 * omission: an observer that cannot see the catalogue cannot credit a child
 * with content their match never contained.
 *
 * The result kind is consulted for the `won` rung and for nothing else. That is
 * what makes SPEC AC-002 structural — `seen` and `used` are computed from the
 * states the moves produced, so no implementation of them can depend on who won.
 */

import type { BoardDef } from '@content/schema'
import type { Match } from '@engine/match'
import type { GameState, Side } from '@engine/types'
import type { Observation } from './tiers'

const SIDES: readonly Side[] = ['white', 'black']

/** How many pieces of each `<side>:<pieceId>` a state has on the board. */
function population(state: GameState): Map<string, number> {
  const counts = new Map<string, number>()
  for (const piece of state.board.values()) {
    const key = `${piece.side}:${piece.pieceId}`
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return counts
}

/**
 * The pieces that MOVED between two consecutive states, each with its own side.
 *
 * Derived from ARRIVAL rather than from occupancy diffing, and that is the first
 * half of the correctness here. A piece captured in place also changes its
 * square's occupant, so a plain diff credits the victim with a move it never
 * made — AC-001 credits `used` to a piece that was *actually moved*, and a
 * captured victim was removed rather than moved. A victim vanishes; it never
 * arrives.
 *
 * The second half is that an arrival is not always a move. `spawn_piece` and
 * `revive_piece` put a piece onto the board that nobody moved, and it arrives
 * exactly like one that did. They are told apart by POPULATION: a real move
 * leaves the side's count of that id unchanged, while a creation raises it. So
 * each arrival is charged against that side's growth for its id first, and only
 * an arrival with no growth left to explain it counts as a move.
 *
 * Attributed by the arriving piece's OWN side, not by whoever was to move. A
 * card can relocate the opponent's piece — `skill.shove` ships doing exactly
 * that, `teleport_piece` at a `chosen_enemy` — and a mover-side filter would
 * drop it, so a piece the child visibly shoved across the board would never be
 * credited at all.
 *
 * Known limitation, and it under-credits rather than mis-credits: a promotion
 * rewrites the landed piece's id inside the same transition (`engine.ts`, via
 * `def.promotion.to`), so the promoted id's count grows and reads as a creation
 * while the original id's count falls and reads as a capture. Neither is
 * credited. Recovering it needs the action that produced the state, which
 * `Match` does not carry — see the REVIEW document for this task.
 */
function arrivals(before: GameState, after: GameState): { id: string; side: Side }[] {
  const grew = population(after)
  const had = population(before)
  const unexplained = new Map<string, number>()
  for (const [key, count] of grew) unexplained.set(key, Math.max(0, count - (had.get(key) ?? 0)))

  const moved: { id: string; side: Side }[] = []
  for (const [square, piece] of after.board) {
    const previous = before.board.get(square)
    if (previous?.pieceId === piece.pieceId && previous.side === piece.side) continue
    const key = `${piece.side}:${piece.pieceId}`
    const creations = unexplained.get(key) ?? 0
    if (creations > 0) {
      // This arrival is accounted for by a piece that came into existence.
      unexplained.set(key, creations - 1)
      continue
    }
    moved.push({ id: piece.pieceId, side: piece.side })
  }
  return moved
}

/** Everything one side did, as content ids. */
interface SideTouch {
  readonly moved: Set<string>
  readonly played: Set<string>
  readonly stoodOn: Set<string>
}

function emptyTouch(): SideTouch {
  return { moved: new Set(), played: new Set(), stoodOn: new Set() }
}

/**
 * Fold a finished (or abandoned) match into the three rungs.
 *
 * `humanSides` is what keeps ADR-004 honest: a child must never see 이걸로
 * 이겼다 on a card the computer beat them with, so `won` is gated on the winner
 * having been played by a person. In hot-seat both sides are people; against the
 * computer only one is.
 */
export function observe(match: Match, board: BoardDef, humanSides: readonly Side[]): Observation {
  const seen = new Set<string>()
  const used = new Set<string>()
  const touch: Record<Side, SideTouch> = { white: emptyTouch(), black: emptyTouch() }

  // Every painted square type is on the board in front of both children for the
  // whole match, whether or not anyone ever reaches it. Met is met.
  for (const square of board.squares) seen.add(square.typeId)

  for (let i = 0; i < match.states.length; i += 1) {
    const state = match.states[i] as GameState

    if (state.ruleCardId !== null) seen.add(state.ruleCardId)
    for (const piece of state.board.values()) seen.add(piece.pieceId)

    for (const side of SIDES) {
      const draft = state.drafts[side]
      // `everOffered` is the engine's own record of what the child was SHOWN,
      // and two of every three offered cards are declined (ADR-002). A card that
      // was read and turned down has been met.
      for (const id of draft.everOffered) seen.add(id)
      for (const id of draft.held) seen.add(id)
      for (const id of draft.used) {
        seen.add(id)
        used.add(id)
        touch[side].played.add(id)
      }
    }

    // A square type is used when a piece actually stands on it — either side's,
    // since the collection belongs to the device rather than to a player
    // (ADR-001).
    for (const square of board.squares) {
      const occupant = state.board.get(square.square)
      if (!occupant) continue
      used.add(square.typeId)
      touch[occupant.side].stoodOn.add(square.typeId)
    }

    const next = match.states[i + 1]
    if (!next) continue
    for (const { id, side } of arrivals(state, next)) {
      used.add(id)
      touch[side].moved.add(id)
    }
  }

  return { seen, used, won: promotions(match, touch, humanSides) }
}

/**
 * The rung that depends on the result — and the only one that may.
 *
 * A draw promotes nothing, an unfinished match promotes nothing, and a win by a
 * side no person was playing promotes nothing. What survives is exactly what the
 * winning person actually did, which is why `won` is always a subset of `used`.
 */
function promotions(match: Match, touch: Record<Side, SideTouch>, humanSides: readonly Side[]): Set<string> {
  const final = match.states[match.states.length - 1]
  const result = final?.result
  if (!result || result.kind !== 'win') return new Set()
  if (!humanSides.includes(result.winner)) return new Set()

  const winner = touch[result.winner]
  return new Set([...winner.moved, ...winner.played, ...winner.stoodOn])
}
