import type { ContentSet } from '@content/load'
import { PLY_CAP, apply, legalActions } from './engine'
import { createMatch, currentState } from './match'
import { rngFor } from './rng'
import type { Action, GameState, MatchResult } from './types'

/**
 * The uniform-random legal-action agent — AC-012's differential oracle.
 *
 * Three properties make the measurement it produces mean anything, and all
 * three are structural rather than aspirational:
 *
 * 1. **It shares no code with move generation or evaluation.** It calls
 *    `legalActions` and picks. There is no heuristic, no ordering preference
 *    and no knowledge of what a piece is worth — so the match lengths it
 *    produces are a property of the CONTENT, not of an evaluator that happens
 *    to agree with the engine it is measuring.
 * 2. **It draws from its own PRNG substream** (ADR-014). With one shared
 *    stream, every agent draw would advance the stream the draft offers come
 *    from, so a longer line would silently change the next offer — bias
 *    arriving through the back door, and AC-006's no-bias clause broken by the
 *    test harness itself.
 * 3. **It is stateless.** The substream is keyed by `(seed, ply, side)` rather
 *    than carried, so replaying a match re-derives the same choices without
 *    the agent having to be rewound. That is what lets AC-004's replay test
 *    compare two independent runs.
 *
 * It is a test fixture, not a playable opponent — the SPEC lists an AI opponent
 * as a non-goal.
 */

/**
 * Picks uniformly among the legal actions, or null when there are none.
 *
 * Null rather than a fallback action: "nothing is legal" is a real state (a
 * finished match), and an agent that returned a default here would hand the
 * caller an action the engine never offered.
 */
export function chooseAction(state: GameState, content: ContentSet, seed: number): Action | null {
  const actions = legalActions(state, content)
  if (actions.length === 0) return null

  // Keyed by ply AND by the number of picks made, because a draft pick does not
  // advance the ply count — without the second key both sides' opening drafts
  // would draw the same number from the same substream.
  const drafted = state.drafts.white.draftIndex + state.drafts.black.draftIndex
  const roll = rngFor(seed, 'agent', state.plyCount, drafted, state.sideToMove)()
  // `roll` is in [0, 1); the min guards the boundary rather than trusting it,
  // since an index of `actions.length` would be an off-by-one that biases the
  // last action.
  return actions[Math.min(actions.length - 1, Math.floor(roll * actions.length))]!
}

export interface PlayOut {
  state: GameState
  /** Plies completed — draft picks are actions but not plies. */
  plies: number
  result: MatchResult | null
}

/**
 * Plays one match to its conclusion and reports what happened.
 *
 * The action budget is the ply cap plus the four draft picks, which are actions
 * that do not advance the ply count. Bounding by plies alone would abandon a
 * cap-reaching match four actions early and report it as unfinished.
 */
export function playOut(content: ContentSet, presetId: string, seed: number): PlayOut {
  const DRAFT_ACTIONS = 4
  let match = createMatch({ content, presetId, seed })

  for (let step = 0; step < PLY_CAP + DRAFT_ACTIONS; step += 1) {
    const state = currentState(match)
    if (state.result) break
    const action = chooseAction(state, content, seed)
    if (!action) break
    match = { ...match, states: [...match.states, apply(state, action, content)] }
  }

  const final = currentState(match)
  return { state: final, plies: final.plyCount, result: final.result }
}
