import type { ContentSet } from '@content/load'
import type { PieceDef } from '@content/schema'
import { sideInCheck } from '../engine'
import type { GameState, Side } from '../types'
import { otherSide } from '../types'

/**
 * Evaluation derived from content, never tuned per piece or per card (ADR-005).
 *
 * The pieces, rule cards and skill cards here are authored by players. A table
 * mapping a piece id to a number would be correct for exactly the content that
 * shipped the day it was written, and silently wrong for everything authored
 * afterwards — which is the objection `RESEARCH-variant-chess-6x6-cards.md`
 * raised about an AI at all and that no ADR ever closed. It would also break
 * the engine's own rule that no source under `src/engine` names content, which
 * `tests/structure/no-content-in-engine.test.ts` enforces on every run.
 *
 * So a piece is worth what it can DO: the reach of its declared movement and
 * attack patterns. That number comes out of the same schema the editor writes,
 * so a new piece is priced the moment it exists and the AI needs no change.
 *
 * The scale is fixed and documented because ADR-006's temperature sampling is
 * a softmax over these numbers — a score scale that drifts would silently turn
 * every difficulty into argmax (saturated gaps) or into uniform noise (tied
 * gaps), and the difficulty ladder would stop meaning anything.
 */

/** A win, and the ceiling of the scale. Kept well clear of any material sum. */
export const MATE_SCORE = 1_000_000

/**
 * One centipawn-equivalent, so `evaluate` returns numbers of familiar size: a
 * piece reaching ~20 squares lands near 500. Stated in reach rather than by
 * naming a piece, because naming one here is the very thing this file exists
 * not to do.
 */
const REACH_TO_SCORE = 25

/**
 * A royal piece is worth more than any assembly of non-royals, because losing
 * it ends the match outright. It is not `MATE_SCORE`: an evaluation that large
 * would swamp every other term and make the search indifferent to everything
 * else while both kings stand.
 */
const ROYAL_SCORE = 20_000

/** Being in check is a real cost, but a recoverable one — not a lost piece. */
const CHECK_PENALTY = 60

/**
 * Cached per content set. Piece values depend only on declarations, so they are
 * computed once and reused for every node of every search — this sits on the
 * hot path and recomputing it per node would dominate the node cost it is
 * meant to inform.
 */
const valueCache = new WeakMap<ContentSet, Map<string, number>>()

function reachOf(def: PieceDef, boardMax: number): number {
  let reach = 0
  // Movement and attack both count. A piece with a separate attack set can do
  // two different things, and the pair is what it is worth.
  for (const pattern of [...def.movement, ...(def.attack ?? [])]) {
    const steps = pattern.kind === 'slide' ? (pattern.maxDistance ?? boardMax) : 1
    reach += pattern.vectors.length * steps
  }
  return reach
}

/**
 * What one piece is worth, from its declaration alone.
 *
 * `boardMax` enters because an unbounded slide is worth more on a wider board,
 * and boards are authored too. It is the only board-dependent input; the value
 * is otherwise a property of the piece.
 */
export function pieceValue(content: ContentSet, pieceId: string, boardMax: number): number {
  let cache = valueCache.get(content)
  if (!cache) {
    cache = new Map()
    valueCache.set(content, cache)
  }
  const key = `${pieceId}@${boardMax}`
  const hit = cache.get(key)
  if (hit !== undefined) return hit

  const def = content.pieces.get(pieceId)
  // An unknown piece scores zero rather than throwing: the search must never be
  // the thing that crashes a match, and content validation is not its job.
  const value = !def ? 0 : def.royal === true ? ROYAL_SCORE : reachOf(def, boardMax) * REACH_TO_SCORE
  cache.set(key, value)
  return value
}

/**
 * The position from `side`'s point of view, in the fixed scale above.
 *
 * Reads only what a player can see: pieces, whose turn it is, and the check
 * counters the engine already keeps. It never reads `state.seed`, and never
 * reads draft offers — both are how the future would leak into a score
 * (ADR-008), and the AC-009 property test is what holds this honest.
 */
export function evaluate(state: GameState, content: ContentSet, side: Side): number {
  if (state.result) {
    if (state.result.kind === 'draw') return 0
    return state.result.winner === side ? MATE_SCORE : -MATE_SCORE
  }

  const boardMax = Math.max(state.width, state.height)
  let score = 0
  for (const piece of state.board.values()) {
    const value = pieceValue(content, piece.pieceId, boardMax)
    score += piece.side === side ? value : -value
  }

  // King safety, read off the engine's own facts rather than recomputed here.
  if (sideInCheck(state, content, side)) score -= CHECK_PENALTY
  if (sideInCheck(state, content, otherSide(side))) score += CHECK_PENALTY

  return score
}
