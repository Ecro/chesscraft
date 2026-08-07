import type { ContentSet } from '@content/load'
import { BUNDLED_PRESET_ID } from '@content/sets/bundled'
import { type Difficulty, chooseMove } from '@engine/ai/difficulty'
import { SURROGATE_NODE_BUDGET } from '@engine/ai/search'
import { chooseAction } from '@engine/agent'
import { PLY_CAP, apply } from '@engine/engine'
import { createMatch, currentState } from '@engine/match'
import type { Action, GameState, Side } from '@engine/types'

/**
 * The paired-reciprocal tournament AC-005 is measured with.
 *
 * Shared by the full run (`npm run test:strength`) and the smoke subset inside
 * `npm run verify`, deliberately: two tournament implementations over one
 * vocabulary is the failure this repo has recorded twice, and the smoke would
 * be the copy nobody maintained.
 *
 * **Paired reciprocal, not alternating.** Every seed is played twice with the
 * colours swapped, so first-move advantage cancels INSIDE each pair. Alternating
 * by seed parity — the first draft of AC-005 — cancels it only in expectation,
 * and leaves parity free to correlate with the deterministic content and draft
 * streams that the same seed also drives.
 */

export type Player =
  | { kind: 'ai'; difficulty: Difficulty }
  /** The pre-existing uniform-random fixture — the floor the ladder stands on. */
  | { kind: 'random' }

export interface GameResult {
  /** White's score: 1 win, 0.5 draw, 0 loss. */
  white: number
  plies: number
  finished: boolean
}

function act(player: Player, state: GameState, content: ContentSet, seed: number): Action | null {
  if (player.kind === 'random') return chooseAction(state, content, seed)
  return chooseMove(state, content, { difficulty: player.difficulty, seed, nodeBudget: SURROGATE_NODE_BUDGET })
}

/** One match. Both players draw from the same match seed, as a real match does. */
export function playGame(content: ContentSet, seed: number, white: Player, black: Player): GameResult {
  const DRAFT_ACTIONS = 4
  let match = createMatch({ content, presetId: BUNDLED_PRESET_ID, seed })

  for (let step = 0; step < PLY_CAP + DRAFT_ACTIONS; step += 1) {
    const state = currentState(match)
    if (state.result) break
    const action = act(state.sideToMove === 'white' ? white : black, state, content, seed)
    if (!action) break
    match = { states: [...match.states, apply(state, action, content)] }
  }

  const final = currentState(match)
  const result = final.result
  const score = !result ? 0.5 : result.kind === 'draw' ? 0.5 : result.winner === 'white' ? 1 : 0
  return { white: score, plies: final.plyCount, finished: result !== null }
}

export interface Tally {
  /** `subject`'s mean score per game, in [0, 1]. */
  score: number
  games: number
  /** Lower bound of the 95% confidence interval on `score`. */
  ciLow: number
  ciHigh: number
  draws: number
  /** Games that hit the ply cap without a result — a silent-degeneracy signal. */
  unfinished: number
}

/**
 * Plays `seeds` pairs and tallies `subject`'s score against `reference`.
 *
 * The interval is a normal approximation over the per-game scores, using the
 * SAMPLE standard deviation rather than the worst-case 0.5. With paired
 * colours the per-game variance is genuinely lower than worst case, and using
 * the worst case would demand more games than the effect needs.
 */
export function tally(
  content: ContentSet,
  subject: Player,
  reference: Player,
  seeds: readonly number[],
): Tally {
  const scores: number[] = []
  let draws = 0
  let unfinished = 0

  for (const seed of seeds) {
    // The subject plays each seed from both sides. `1 - white` converts the
    // second game's white-relative score to the subject's.
    const asWhite = playGame(content, seed, subject, reference)
    const asBlack = playGame(content, seed, reference, subject)
    scores.push(asWhite.white, 1 - asBlack.white)
    for (const game of [asWhite, asBlack]) {
      // A ply-capped game also scores 0.5, so `finished` is what separates
      // "agreed to a draw" from "neither side got anywhere in sixty plies".
      // Counting both as draws would make the two diagnostics say the same
      // thing, and the one that matters — a search that stopped searching —
      // would be the one hidden.
      if (game.finished && game.white === 0.5) draws += 1
      if (!game.finished) unfinished += 1
    }
  }

  const n = scores.length
  const mean = scores.reduce((a, b) => a + b, 0) / n
  const variance = n > 1 ? scores.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1) : 0
  const halfWidth = 1.96 * Math.sqrt(variance / n)
  return {
    score: mean,
    games: n,
    ciLow: mean - halfWidth,
    ciHigh: mean + halfWidth,
    draws,
    unfinished,
  }
}

export const seedRange = (count: number, from = 1): number[] =>
  Array.from({ length: count }, (_, i) => from + i)

export const SIDES: readonly Side[] = ['white', 'black']
