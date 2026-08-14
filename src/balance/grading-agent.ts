import type { ContentSet } from '@content/load'
import { MAX_MATCH_ACTIONS, apply, legalActions } from '@engine/engine'
import { createMatch, currentState } from '@engine/match'
import { rngFor } from '@engine/rng'
import type { Action, GameState, MatchResult, Side } from '@engine/types'

/**
 * The agent a grade is measured with, and the one thing it is not allowed to know.
 *
 * Uniform-random play measured the wrong thing. It never takes material that is
 * free and never declines to hang its own, so a piece was graded on how many
 * squares it happened to wander onto: the archer scored +20.1 against the
 * queen's +8.5 on the bundled board, which is the reverse of what any person
 * experiences. The grade was honest about what it measured and what it measured
 * was not strength.
 *
 * The obvious fix is the production AI, and it is a trap. `ai/evaluate.ts` scores
 * a position with `pieceValue`, which is `vectors × distance` — it already
 * BELIEVES a queen is worth four archers. Grading with it would put the queen on
 * top for the reason the answer was wanted, and the number would be `reachOf`
 * laundered through a search rather than a measurement of anything. That is
 * exactly the circularity `agent.ts` chose randomness to avoid.
 *
 * So this agent evaluates a leaf by the ONE thing the game itself already uses
 * to decide a match that reaches the ply cap: **how many pieces each side has**,
 * every piece counting one (`materialResult`). It holds no opinion about which
 * piece is better — that is the question being measured, and an agent that
 * answered it would be answering it for the measurement. What it adds over
 * randomness is only tactics: it sees one move ahead, so free material is taken
 * and hung material is not offered.
 *
 * Deterministic, and ties are broken from the same seeded substream the random
 * agent uses. Without that, equal-scoring actions would resolve by generation
 * order, which is a bias with a preferred direction — and a measurement rig is
 * the last place to accept one.
 */

/** White's piece count minus black's, which is `materialResult`'s own question. */
function materialLead(state: GameState, side: Side): number {
  let mine = 0
  let theirs = 0
  for (const piece of state.board.values()) (piece.side === side ? (mine += 1) : (theirs += 1))
  return mine - theirs
}

const DECIDED = 1_000_000

function leafScore(state: GameState, side: Side): number {
  if (state.result) {
    if (state.result.kind === 'draw') return 0
    return state.result.winner === side ? DECIDED : -DECIDED
  }
  return materialLead(state, side)
}

/**
 * The value of a position after the opponent gets one reply.
 *
 * One reply and no further: the point is to stop a piece being graded on moves
 * no player would make, not to play well. Depth also costs — every extra ply
 * multiplies the work by the branching factor, and a grade is 2 x N matches.
 */
function afterReply(state: GameState, content: ContentSet, side: Side): number {
  if (state.result) return leafScore(state, side)
  const here = leafScore(state, side)

  // Only replies that can TAKE something are examined, and that is not a
  // shortcut — it is the question. The reply search exists to answer "does this
  // hang material?", material only changes when something is removed, and a
  // quiet reply leaves the count exactly where this node already found it. The
  // filter runs before `apply`, which is the expensive half: searching every
  // reply cost ~1.9s per match against ~1.9ms for random play, and a grade is
  // 2 x N matches.
  //
  // Card plays are included whatever they do, because an effect can destroy a
  // piece without any square being entered — the one way material moves that a
  // destination square cannot show.
  let worst = here
  for (const reply of legalActions(state, content)) {
    const takes =
      reply.kind === 'play_card' ||
      (reply.kind === 'move' && state.board.get(reply.to)?.side === side)
    if (!takes) continue
    const score = leafScore(apply(state, reply, content), side)
    if (score < worst) worst = score
  }
  return worst
}

/**
 * The action this agent plays, or null when nothing is legal.
 *
 * Draft picks are scored like anything else. They cannot be looked past — the
 * offer is random and the reply is the opponent's own draft — so they resolve on
 * the tie-break, which is the honest answer for a choice this agent has no way
 * to evaluate.
 */
export function chooseGradingAction(state: GameState, content: ContentSet, seed: number): Action | null {
  const actions = legalActions(state, content)
  if (actions.length === 0) return null

  const side = state.sideToMove
  const drafted = state.drafts.white.draftIndex + state.drafts.black.draftIndex
  const roll = rngFor(seed, 'grading-agent', state.plyCount, drafted, side)

  let best: Action | null = null
  let bestScore = -Number.POSITIVE_INFINITY
  let seen = 0
  for (const action of actions) {
    const score = afterReply(apply(state, action, content), content, side)
    if (score > bestScore) {
      bestScore = score
      best = action
      seen = 1
      continue
    }
    if (score === bestScore) {
      // Reservoir sampling over the ties, so an equal-scoring action is picked
      // uniformly rather than by whichever the generator emitted first.
      seen += 1
      if (roll() < 1 / seen) best = action
    }
  }
  return best
}

export interface GradingPlayOut {
  state: GameState
  plies: number
  result: MatchResult | null
}

/** One match, played to its conclusion by this agent on both sides. */
export function playOutGrading(content: ContentSet, presetId: string, seed: number): GradingPlayOut {
  let match = createMatch({ content, presetId, seed })

  for (let step = 0; step < MAX_MATCH_ACTIONS; step += 1) {
    const state = currentState(match)
    if (state.result) break
    const action = chooseGradingAction(state, content, seed)
    if (!action) break
    match = { ...match, states: [...match.states, apply(state, action, content)] }
  }

  const final = currentState(match)
  return { state: final, plies: final.plyCount, result: final.result }
}
