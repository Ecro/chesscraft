import type { ContentSet } from '@content/load'
import { apply, legalActions } from '../engine'
import { rngFor } from '../rng'
import type { Action, GameState } from '../types'
import { otherSide } from '../types'
import { PRODUCTION_NODE_BUDGET, type ScoredAction, search } from './search'

/**
 * Difficulty as sampling temperature over a ranked list (ADR-006).
 *
 * The obvious knob is search depth, and it is the wrong one. A depth-limited
 * engine does not play *weakly*, it plays *strangely* — the documented
 * complaint about nerfed engines is that they "make the occasional silly move
 * in order to play down", which reads as broken rather than beatable to the
 * elementary and middle-school players this game is for. Sampling from the
 * ranked list keeps every choice inside the plausible set and degrades strength
 * on one continuous knob instead.
 *
 * Three things here are load-bearing and each exists because leaving it out
 * produces a specific, named failure:
 *
 * - **Temperature is the primary knob, budget the secondary one.** The original
 *   decision was temperature ALONE — difficulty as selection, not sight — and
 *   measurement overruled it: sharing one search, the levels never separated by
 *   more than ~0.58, because this evaluator scores many candidates identically
 *   and a softmax over equal numbers is uniform at any temperature. See
 *   `BUDGET_SHARE` for what that cost and what holds the cost in check.
 * - **Scores are normalized before the softmax.** Temperature is meaningless
 *   against an unbounded scale: saturated gaps make every level argmax, tied
 *   gaps make every level uniform, and the ladder AC-005 measures would be
 *   noise either way.
 * - **The safety clamp applies at every level, not only the easiest.** Clamping
 *   one level alone can invert the ladder — clamped-easy beating unclamped-
 *   medium in exactly the tactically decisive positions the ladder is supposed
 *   to be measured on.
 */

export type Difficulty = 'easy' | 'medium' | 'hard'

export const DIFFICULTIES = ['easy', 'medium', 'hard'] as const satisfies readonly Difficulty[]

/**
 * Hard is exactly 0 — argmax, and it draws no random number at all.
 *
 * That is not a rounding of "very small". It is what lets AC-009 assert on the
 * hardest level's CHOSEN action rather than only on its scores: the two
 * positions that property compares necessarily differ in seed, so any level
 * that consulted the seed would differ for a reason unrelated to the property.
 */
export const TEMPERATURES: Record<Difficulty, number> = {
  hard: 0,
  medium: 0.4,
  easy: 1.2,
}

/**
 * The second knob, and it was not the first choice (ADR-006 as amended).
 *
 * Temperature alone was supposed to carry the whole ladder — difficulty as
 * selection, not sight — and measurement said it cannot. Sharing one search,
 * the best separation temperature reached was `hard vs medium 0.579` at
 * `T = 0.5`, and pushing medium hotter to clear that immediately collapsed
 * `medium vs easy` to 0.538: making the middle weaker moves it away from the
 * top and toward the bottom at the same time.
 *
 * The reason is in the evaluator, not the sampler. It scores material and check
 * and nothing else, so in a great many positions every candidate scores
 * IDENTICALLY — and a softmax over equal numbers is uniform at any temperature.
 * Temperature only bites where the evaluation already discriminates.
 *
 * A reduced budget bites everywhere, because it changes what the level SEES.
 * The cost is the thing ADR-006 originally rejected depth-limiting for: a
 * shallower search can miss a tactic in a way that looks alien rather than
 * weak. Two things hold that in check — the safety clamp runs at every level,
 * so the catastrophic version (hanging the king in one) cannot happen, and the
 * reduction is a fraction of the budget rather than a depth cap, so the easier
 * levels still complete a real search.
 */
export const BUDGET_SHARE: Record<Difficulty, number> = {
  hard: 1,
  medium: 0.45,
  easy: 0.15,
}

/** How many ranked actions the sampler may draw from. Calibrated in Phase 5. */
export const CANDIDATE_SUPPORT_K = 6

/**
 * How far down the ranking the safety scan will look before giving up.
 *
 * The scan is not free and it is not counted against the node budget: each
 * candidate costs one `apply`, one `legalActions` on the child, and one `apply`
 * per reply — about 740us at the measured branching of 21.6. Unbounded, the
 * worst case in this engine is 200 candidates with none safe, which is ~148ms
 * added to a move that already measured a p95 of 1,142ms against a 1,500ms
 * budget: 41% of the remaining slack, spent in exactly the tactically lost
 * positions where the search is already working hardest.
 *
 * The cap costs almost nothing in correctness because the LIST IS RANKED and
 * the search scores a hung king at -MATE. A safe action, when one exists, sorts
 * above every king-losing one, so it is found in the first handful — the deep
 * scan only ever happens when the position is lost anyway. AC-006 conditions
 * its guarantee on a safe action existing; this bounds the search for it at 32
 * rather than at the whole list.
 */
const CLAMP_SCAN_CAP = 32

/**
 * The score difference that counts as "one unit" for the softmax.
 *
 * `evaluate` returns a centipawn-like scale where a modest piece is worth a few
 * hundred. Dividing by this before exponentiating is what gives temperature a
 * stable meaning across positions: at T = 1 an action this far behind the best
 * keeps about `1/e` of its weight, whatever the absolute numbers happen to be.
 */
export const SCORE_SCALE = 200

export interface ChooseOptions {
  difficulty: Difficulty
  /** The match seed. The sampler derives its own substream from it (ADR-014). */
  seed: number
  nodeBudget?: number
  cardExpansionCap?: number
  /** Absolute `Date.now()` cut-off (ADR-010). Omitted = the clock is not read. */
  deadline?: number
}

export interface Choice {
  action: Action | null
  /** Every legal root action, scored, best first. */
  scored: ScoredAction[]
  /** The support actually drawn from: clamped, then truncated to K. */
  candidates: ScoredAction[]
  /** Whether the chosen action was the search's own top pick. */
  wasTopRanked: boolean
  /** The search's own accounting, carried out so callers need not re-run it. */
  nodes: number
  depthReached: number
  /** The wall-clock valve cut the search short (ADR-010, AC-011). */
  valveTripped: boolean
}

/**
 * Whether `action` lets the opponent take the mover's royal on the very reply.
 *
 * Deliberately decided by the ENGINE — push every reply through `apply` and ask
 * what happened — rather than by reading the search's score. A clamp that
 * trusted the evaluator would be satisfied exactly when the evaluator was
 * already right, and useless in the cases it exists for: the ones where the
 * search's bounded view (ADR-001's depth is an estimate, ADR-007 prunes some
 * replies) never saw the refutation.
 */
export function losesKingImmediately(state: GameState, action: Action, content: ContentSet): boolean {
  const mover = state.sideToMove
  const child = apply(state, action, content)

  if (child.result) {
    if (child.result.kind === 'draw') return child.result.reason === 'king_capture'
    return child.result.winner !== mover
  }

  for (const reply of legalActions(child, content)) {
    const after = apply(child, reply, content)
    if (after.result?.kind === 'win' && after.result.winner === otherSide(mover)) return true
    if (after.result?.kind === 'draw' && after.result.reason === 'king_capture') return true
  }
  return false
}

/**
 * The support to sample from: the best `K` actions that do not hang the king.
 *
 * Scans top-down and stops as soon as it has `K` safe actions, so the expensive
 * reply-enumeration is paid for a handful of actions rather than for all of
 * them — which matters at the measured worst case of 200 legal actions.
 *
 * When NOTHING is safe the clamp yields rather than refusing to move: AC-006
 * conditions on "a safe action exists", and a position where none does is one
 * the AI has already lost. Returning the top K there keeps it playing the least
 * bad line instead of picking arbitrarily.
 */
function support(state: GameState, scored: readonly ScoredAction[], content: ContentSet): ScoredAction[] {
  const safe: ScoredAction[] = []
  const limit = Math.min(scored.length, CLAMP_SCAN_CAP)
  for (let i = 0; i < limit; i += 1) {
    if (safe.length >= CANDIDATE_SUPPORT_K) break
    const entry = scored[i]!
    if (!losesKingImmediately(state, entry.action, content)) safe.push(entry)
  }
  return safe.length > 0 ? safe : scored.slice(0, CANDIDATE_SUPPORT_K)
}

/** Softmax over normalized deltas from the best score. */
function sample(candidates: readonly ScoredAction[], temperature: number, roll: number): ScoredAction {
  const best = candidates[0]!.score
  const weights = candidates.map((c) => Math.exp((c.score - best) / (temperature * SCORE_SCALE)))
  const total = weights.reduce((a, b) => a + b, 0)
  // A degenerate total (every weight underflowed to 0) means every candidate is
  // hopelessly far behind the best one — which is the case where argmax is also
  // the right answer, so falling back to it is not a silent failure.
  if (!Number.isFinite(total) || total <= 0) return candidates[0]!

  let cursor = roll * total
  for (let i = 0; i < candidates.length; i += 1) {
    cursor -= weights[i]!
    if (cursor <= 0) return candidates[i]!
  }
  // Guards the floating-point boundary rather than trusting it, the same way
  // the uniform-random fixture guards its index.
  return candidates[candidates.length - 1]!
}

/**
 * Chooses an action, and reports what it chose from.
 *
 * The detail is not debug output: AC-006 measures how often the easiest level
 * lands on the top-ranked action, and that claim is unobservable from the
 * action alone.
 */
export function chooseWithDetail(state: GameState, content: ContentSet, options: ChooseOptions): Choice {
  // The level's share of the budget (ADR-006 as amended). Floored so the
  // easiest level still expands something: a share that rounded to zero would
  // rank by static evaluation alone, which is a different opponent, not a
  // weaker one.
  const fullBudget = options.nodeBudget ?? PRODUCTION_NODE_BUDGET
  const levelBudget = Math.max(24, Math.round(fullBudget * BUDGET_SHARE[options.difficulty]))

  const { scored, nodes, depthReached, valveTripped } = search(state, content, {
    nodeBudget: levelBudget,
    // Spread rather than assign `undefined`: `exactOptionalPropertyTypes` treats
    // "absent" and "present but undefined" as different, and the second is not
    // what "use the default" means.
    ...(options.cardExpansionCap === undefined ? {} : { cardExpansionCap: options.cardExpansionCap }),
    ...(options.deadline === undefined ? {} : { deadline: options.deadline }),
  })
  if (scored.length === 0) {
    return { action: null, scored, candidates: [], wasTopRanked: false, nodes, depthReached, valveTripped }
  }

  const candidates = support(state, scored, content)
  const temperature = TEMPERATURES[options.difficulty]

  let chosen: ScoredAction
  if (temperature <= 0) {
    chosen = candidates[0]!
  } else {
    // Keyed like the uniform-random fixture's substream (ADR-014), including
    // the draft counter — a draft pick is an action that does not advance the
    // ply, so without it both sides' opening picks would draw the same number.
    const drafted = state.drafts.white.draftIndex + state.drafts.black.draftIndex
    const roll = rngFor(options.seed, 'ai', state.plyCount, drafted, state.sideToMove)()
    chosen = sample(candidates, temperature, roll)
  }

  return {
    action: chosen.action,
    scored,
    candidates,
    wasTopRanked: chosen.action === scored[0]!.action,
    nodes,
    depthReached,
    valveTripped,
  }
}

/** The playable surface: an action, or null when nothing is legal. */
export function chooseMove(state: GameState, content: ContentSet, options: ChooseOptions): Action | null {
  return chooseWithDetail(state, content, options).action
}
