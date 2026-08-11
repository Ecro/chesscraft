import type { ContentSet } from '@content/load'
import { DRAFT_OFFER_SIZE, SECOND_DRAFT_AFTER_TURNS, type TrustedAction, applyTrusted, legalActions } from '../engine'
import { skillPoolFor } from '../loadout'
import type { Action, GameState, Side } from '../types'
import { otherSide } from '../types'
import { MATE_SCORE, evaluate } from './evaluate'

/**
 * Iterative-deepening negamax with alpha-beta (ADR-001).
 *
 * The literature's default for a game whose rules are authored at runtime is
 * MCTS, because minimax needs an evaluation function nobody can hand-tune. That
 * argument is conditional on simulator speed, and this engine's is measured:
 * ~47us per node expansion, so a one-second budget buys ~470 random playouts —
 * about twenty per root move, which is noise — or a full depth-4 alpha-beta
 * search. Hence this file.
 *
 * Four constraints shape it and are not negotiable by a later edit:
 *
 * - **The budget is nodes, never wall-clock** (ADR-003). Same seed and
 *   difficulty must replay to the same move on a fast laptop and a loaded one,
 *   because the parent SPEC's replay determinism is a contract this feature
 *   inherits rather than gets to reinterpret.
 * - **The search never expands past an unrevealed draft** (ADR-008), and it
 *   decides that from the PARENT, before transitioning. Deciding it from the
 *   child is too late: the child already carries the drawn offers by then.
 * - **Every root action is scored** even when the budget runs out, because the
 *   player can see all of them and the difficulty sampler ranks all of them.
 *   Pruning is an expansion policy, applied below the root only (ADR-007).
 * - **Nothing here reads `state.seed`**, including the transposition key.
 */

/** Calibrated in Phase 5 against median <= 1.0s / p95 <= 1.5s. */
export const PRODUCTION_NODE_BUDGET = 20_000

/**
 * The budget the strength tournament runs at (ADR-011).
 *
 * Proving the difficulty ladder at the production budget costs hours of CPU, so
 * the tournament runs here instead and `npm run verify` keeps a sign-only
 * smoke. Small enough to be affordable, large enough that every level still
 * sees a reply — a surrogate that searched one ply would rank by static
 * evaluation alone and the ladder it proved would say nothing about the
 * shipped one.
 *
 * The number is measured, not guessed. Share of roots that complete a real
 * (depth >= 2) search, over 31 positions spanning openings to endgames:
 *
 *   250 nodes -> 0.52   500 -> 0.77   1000 -> 1.00   2000 -> 1.00
 *
 * 250 was the first guess and it left HALF the roots ranking by static
 * evaluation, which is precisely the degenerate surrogate ADR-011 warns
 * against. 1000 is the smallest tested value at which every root searches;
 * 2000 buys a median depth of 3 for ~1.5x the time, which is not worth it for
 * a ladder the production budget re-checks once per release.
 */
export const SURROGATE_NODE_BUDGET = 1_000

/** Below the root, expand at most this many card plays per node (ADR-007). */
const CARD_EXPANSION_CAP = 8

/**
 * How many follow-up moves are expanded after a card play (ADR-001).
 *
 * A turn is `[play_card?] → move`, so a card node's children are moves by the
 * same player — and the turn's true branching is cards × moves. The mean move
 * count is ~22, so eight cards uncapped is ~176 nodes for one turn where the
 * search previously spent eight. Six keeps the best-ordered captures and the
 * moves the card was bought for (a grant's new destinations sort high, since
 * they are usually captures) while holding the product near the old cost.
 *
 * It is a WIDTH cap, not a depth cap: the chosen follow-up is still searched to
 * full depth, so a card whose point shows up three plies later is still valued.
 */
const FOLLOW_UP_MOVE_CAP = 6

/** Iterative deepening stops here regardless of budget; nothing is this deep. */
const MAX_DEPTH = 12

export interface SearchOptions {
  /** Hard bound on expansions. The PRIMARY termination condition (ADR-003). */
  nodeBudget: number
  maxDepth?: number
  cardExpansionCap?: number
  /**
   * The wall-clock backstop of ADR-010, as an absolute `Date.now()` deadline.
   *
   * **Omitted by default, and omitting it means the clock is never read.** That
   * is the determinism contract: with no deadline this search visits exactly
   * the same nodes on any machine under any load, which is what AC-003 asserts
   * and what every test relies on.
   *
   * When a deadline IS supplied and the search crosses it, the search stops and
   * reports `valveTripped`. The caller then knows the match is no longer
   * reproducible from its seed — which is precisely what AC-011 says happens,
   * and why the valve is a failure path rather than a budget.
   */
  deadline?: number
}

export interface ScoredAction {
  /**
   * Branded, so the root loop can hand it straight to `applyTrusted`.
   *
   * Typed as `Action` at first, which forced a second `as TrustedAction` cast in
   * the iterative-deepening loop — a second mint site, and ADR-004 sells the
   * brand on there being exactly one. The cast was safe by adjacency today and
   * would compile just as cleanly the day someone cached actions across two
   * different positions, which is the failure the brand exists to make
   * impossible.
   */
  action: TrustedAction
  score: number
}

export interface SearchResult {
  /** Every legal root action, scored, best first. Empty iff nothing is legal. */
  scored: ScoredAction[]
  /** The highest-scoring action, or null iff nothing is legal. */
  best: Action | null
  nodes: number
  depthReached: number
  /**
   * The wall-clock deadline cut this search short (ADR-010).
   *
   * Always `false` when no deadline was supplied, because then no clock was
   * read at all.
   */
  valveTripped: boolean
}

// ---------------------------------------------------------------------------
// Transposition table
// ---------------------------------------------------------------------------

const TT_BITS = 16
const TT_SIZE = 1 << TT_BITS

const EXACT = 0
const LOWER = 1
const UPPER = 2

/**
 * Preallocated and reused, never grown.
 *
 * A `Map` keyed by position is the obvious implementation and the reported
 * route to a killed tab on mobile: it grows for as long as the search runs and
 * nothing evicts. Fixed typed arrays with mask indexing cannot.
 *
 * `generation` is what makes each search see a clean table without reallocating
 * half a megabyte per move. It also matters for correctness of the AC-009
 * property: two searches must not see each other's entries, or the second would
 * answer from work done under a different position's history.
 */
const ttKey = new Float64Array(TT_SIZE)
const ttDepth = new Int8Array(TT_SIZE)
const ttFlag = new Int8Array(TT_SIZE)
const ttScore = new Float64Array(TT_SIZE)
const ttGen = new Int32Array(TT_SIZE)
let generation = 0

// ---------------------------------------------------------------------------
// Position key — the projection (ADR-008)
// ---------------------------------------------------------------------------

/**
 * A key over what a player can observe, and nothing else.
 *
 * The exclusions are the point, and each one is a leak that was reasoned about
 * rather than an oversight:
 *
 * - **`state.seed`.** Every draft offer derives from it. Two positions that are
 *   identical to look at but sit on different seeds must search identically, or
 *   the AI is answering a question about cards nobody has been dealt. Keying on
 *   the seed would diverge the exploration order between them all by itself,
 *   and under a fixed node budget a different order can exhaust the budget on
 *   different nodes and produce different scores — a failure that would look
 *   nothing like an information leak while being exactly one.
 * - **`everOffered`.** It constrains only which cards a FUTURE draw may pick.
 *
 * `offers` is included: an open offer is on screen, and it decides which
 * actions are legal right now.
 */
/*
 * Exported for the turn-model tests (ADR-001). The property they pin — two
 * states with different legal-action sets never share a key — has no observable
 * proxy: a collision here surfaces as a wrong score on some other line, on some
 * other seed, depending on traversal order.
 */
export function positionKey(state: GameState): number {
  // TWO independent FNV-1a hashes, folded into one 53-bit integer.
  //
  // One 32-bit hash is not enough, and the arithmetic says so rather than the
  // taste: a search stores up to ~20,000 positions, and by the birthday bound
  // two of them share a 32-bit key with probability ~20000^2 / 2 / 2^32, which
  // is about **4.7%** — several times per hour of play. The table verifies an
  // entry by comparing keys, so a collision hands one position's score to a
  // different position, and the visible symptom is an inexplicable move rather
  // than a crash. At 53 bits the same bound is ~2e-8.
  //
  // 53 rather than 64 because that is what a JS number holds exactly, and the
  // table stores keys in a `Float64Array`. `h1 * 2^21 + 21 bits of h2` is at
  // most 2^53 - 1, so every key round-trips without loss.
  //
  // The board is a Map and its iteration order is insertion order, which two
  // paths to the same position need not share — so the squares are sorted
  // before they are folded in.
  let h = 0x811c9dc5
  let h2 = 0x01000193
  const fold = (s: string) => {
    for (let i = 0; i < s.length; i += 1) {
      const c = s.charCodeAt(i)
      h ^= c
      h = Math.imul(h, 0x01000193)
      // A different prime and a rotate, so the two hashes are not the same
      // function of the input with a different seed — which would collide
      // together and buy nothing.
      h2 = Math.imul(h2 ^ c, 0x85ebca6b)
      h2 = (h2 << 13) | (h2 >>> 19)
    }
    h ^= 0x2f
    h = Math.imul(h, 0x01000193)
    h2 = Math.imul(h2 ^ 0x2f, 0xc2b2ae35)
  }

  const squares = [...state.board.keys()].sort()
  for (const square of squares) {
    const piece = state.board.get(square)!
    fold(`${square}${piece.pieceId}${piece.side === 'white' ? 'w' : 'b'}`)
  }
  fold(state.sideToMove)
  fold(String(state.plyCount))
  fold(state.ruleCardId ?? '-')
  // The pending card (ADR-001). Two states can share a board, a side and a ply
  // and still offer different actions — one may still play a card, the other
  // may only move. `used` distinguishes them for a card that was really played,
  // but not for a card whose effects changed nothing the key observes, and TT
  // hits depend on traversal order, so the corruption would be nondeterministic.
  fold(state.turnCard ?? '-')
  fold(state.royalCaptureBaseline?.join(',') ?? '-')
  for (const side of ['white', 'black'] as const) {
    const draft = state.drafts[side]
    fold(`${side}h${[...draft.held].sort().join(',')}`)
    fold(`u${[...draft.used].sort().join(',')}`)
    fold(`o${draft.offers ? [...draft.offers].sort().join(',') : '-'}`)
    fold(`c${draft.completedTurns}i${draft.draftIndex}`)
    fold(`x${state.checkCount[side]}`)
    fold(`p${[...state.captured[side]].sort().join(',')}`)
  }
  // The EXPIRY, not the entry. `frozenUntil` became a structure in ADR-004 and
  // interpolating it whole would stringify every entry to `[object Object]` —
  // every frozen square hashing identically, silently, with the compiler
  // perfectly happy about it. The source is deliberately not folded: it changes
  // what the UI can say, never what is legal, so two positions that differ only
  // in which card froze a piece are the same position to the search.
  for (const square of Object.keys(state.frozenUntil).sort()) fold(`f${square}:${state.frozenUntil[square]!.untilPly}`)
  for (const grant of [...state.grants].sort((a, b) => (a.square + a.kind).localeCompare(b.square + b.kind))) {
    fold(`g${grant.square}${grant.kind}${grant.untilPly}`)
  }
  // 2^21 * h1 + 21 bits of h2 — exact in a double, and exactly what the table
  // compares against.
  return (h >>> 0) * 0x200000 + (h2 >>> 11)
}

// ---------------------------------------------------------------------------
// The draft boundary (ADR-008)
// ---------------------------------------------------------------------------

/**
 * Whether applying `action` would draw draft offers nobody has seen yet.
 *
 * Computed from the PARENT, and it mirrors `bumpTurns` exactly — including the
 * pool-size test, because a pool too small to fill an offer draws nothing and
 * so reveals nothing. Reading the constants rather than the numbers 5 and 3 is
 * deliberate: if the engine moves the second draft, this moves with it instead
 * of silently opening the leak back up.
 *
 * A `draft_pick` never triggers it — that path returns before the turn is
 * recorded — which is what lets the AI still make its own picks. A `play_card`
 * does not trigger it either, since ADR-001: a card no longer completes a turn,
 * so `bumpTurns` does not run for it. Left in, the search would truncate the
 * subtree of the very card it just played and score it statically — blind to
 * the move that card was bought for. `end_turn` DOES complete a turn, and is
 * deliberately not excluded here.
 */
export function wouldRevealDraft(state: GameState, action: Action, content: ContentSet): boolean {
  if (action.kind === 'draft_pick' || action.kind === 'play_card') return false
  const draft = state.drafts[state.sideToMove]
  if (draft.completedTurns + 1 !== SECOND_DRAFT_AFTER_TURNS) return false
  if (draft.draftIndex !== 1 || draft.offers !== null) return false
  const preset = content.presets.get(state.presetId)
  if (!preset) return false
  // Through `skillPoolFor`, never `preset.skillCardIds` — the same rule
  // `bumpTurns` follows, and for the same reason. A room may give a side its own
  // loadout card, which `skillPoolFor` appends to that side's pool; reading the
  // shared list directly undercounts by one. That is enough to flip this
  // predicate at the boundary — a pool of exactly `DRAFT_OFFER_SIZE` reads as
  // one short — and the failure is in the unsafe direction: this returns false,
  // the search recurses into a child holding offers nobody has seen, and the
  // ADR-008 information boundary this predicate exists to hold is open.
  const pool = skillPoolFor(preset, state.sideToMove).filter(
    (id) => !draft.everOffered.includes(id) && !draft.held.includes(id),
  )
  return pool.length >= DRAFT_OFFER_SIZE
}

// ---------------------------------------------------------------------------
// Move ordering
// ---------------------------------------------------------------------------

interface Ctx {
  content: ContentSet
  budget: number
  nodes: number
  cardCap: number
  /** Absolute `Date.now()` cut-off, or 0 when the clock is not consulted. */
  deadline: number
  tripped: boolean
}

/**
 * How often the deadline is checked, in expanded nodes.
 *
 * `Date.now()` per node would be a measurable fraction of a ~47us node. Every
 * 512 expansions bounds the overrun to well under a millisecond of extra search
 * while costing effectively nothing — and the check runs only when a deadline
 * was supplied at all.
 */
const DEADLINE_CHECK_INTERVAL = 512

function outOfTime(ctx: Ctx): boolean {
  if (ctx.tripped) return true
  if (ctx.deadline === 0) return false
  if (ctx.nodes % DEADLINE_CHECK_INTERVAL !== 0) return false
  if (Date.now() < ctx.deadline) return false
  ctx.tripped = true
  return true
}

/**
 * Orders by what is cheap to know and usually right: captures first, by what
 * they take; then quiet moves; then card plays.
 *
 * Cards go last not because they are weak but because they are numerous — the
 * Cartesian product of their target slots reaches 200 actions at one node
 * against a mean of 22, and ordering them ahead of captures would spend the
 * budget enumerating them.
 */
function orderingScore(state: GameState, action: Action, content: ContentSet): number {
  if (action.kind === 'draft_pick') return 0
  if (action.kind === 'play_card') return -1_000
  // The forced pass is the only action at the node that offers it (ADR-003), so
  // its score never decides anything — it just must not be read as a move.
  if (action.kind === 'end_turn') return 0
  const victim = state.board.get(action.to)
  if (!victim) return 0
  const def = content.pieces.get(victim.pieceId)
  if (!def) return 1
  return def.royal === true ? 1_000_000 : 1_000
}

function orderChildren(
  state: GameState,
  actions: readonly TrustedAction[],
  content: ContentSet,
  cardCap: number,
): TrustedAction[] {
  const decorated = actions.map((action, index) => ({
    action,
    index,
    score: orderingScore(state, action, content),
  }))
  // Ties broken by generation order, so ordering is a total function of the
  // position — a comparator that left ties to the sort's implementation would
  // make the whole search non-reproducible across engines.
  decorated.sort((a, b) => b.score - a.score || a.index - b.index)

  const out: TrustedAction[] = []
  let cards = 0
  // A node with a card pending is a FOLLOW-UP node (ADR-001): the same player
  // moves again, so the turn's branching is the product of the cards tried and
  // the moves tried after each. Left uncapped that product is what the card cap
  // was introduced to avoid, one level down. Only the best few follow-ups are
  // expanded — the same trade the card cap already makes, for the same reason.
  const followUps = state.turnCard === null ? Number.POSITIVE_INFINITY : FOLLOW_UP_MOVE_CAP
  let moves = 0
  for (const entry of decorated) {
    if (entry.action.kind === 'play_card') {
      if (cards >= cardCap) continue
      cards += 1
    }
    if (entry.action.kind === 'move') {
      if (moves >= followUps) continue
      moves += 1
    }
    out.push(entry.action)
  }
  return out
}

// ---------------------------------------------------------------------------
// Negamax
// ---------------------------------------------------------------------------

function negamax(state: GameState, depth: number, alpha: number, beta: number, side: Side, ctx: Ctx): number {
  if (state.result) return evaluate(state, ctx.content, side)
  if (depth <= 0 || ctx.nodes >= ctx.budget) return evaluate(state, ctx.content, side)

  const key = positionKey(state)
  // The key is wider than 32 bits now, so `&` would silently truncate it to the
  // low half before masking — correct by accident here, and wrong the moment
  // TT_BITS grows. Modulo keeps the index a function of the whole key.
  const slot = key % TT_SIZE
  if (ttGen[slot] === generation && ttKey[slot] === key && ttDepth[slot]! >= depth) {
    const score = ttScore[slot]!
    const flag = ttFlag[slot]
    if (flag === EXACT) return score
    if (flag === LOWER && score >= beta) return score
    if (flag === UPPER && score <= alpha) return score
  }

  const legal = legalActions(state, ctx.content)
  if (legal.length === 0) return evaluate(state, ctx.content, side)

  const originalAlpha = alpha
  let best = -Number.POSITIVE_INFINITY

  for (const action of orderChildren(state, legal, ctx.content, ctx.cardCap)) {
    if (ctx.nodes >= ctx.budget || outOfTime(ctx)) break
    ctx.nodes += 1

    const child = applyTrusted(state, action, ctx.content)
    // The boundary: scored where it stands, never expanded (ADR-008). The child
    // carries offers that were just drawn, and evaluation does not read them —
    // but nothing below this line ever looks at the child again either.
    //
    /*
     * A card play keeps the board (ADR-001), so its child is the SAME player's
     * node: maximised for them, in the same window, with no negation. Negating
     * it — as every other child is negated — makes the search read the mover's
     * own follow-up move as the opponent's choice, so every card is priced at
     * the worst thing its owner could do next. Nothing about that looks wrong
     * from outside: the search still returns a legal move, promptly, and simply
     * never plays a card worth playing.
     *
     * It does not spend depth either, and that is the second half of the same
     * rule. Depth counts PLIES — ADR-002's unit — and a card is not a ply. Spent
     * as `depth - 1` (as it was), a turn cost two levels, so at the frontier a
     * card child landed on `depth <= 0` and was scored WITHOUT the move it
     * obliges: a card line judged one action deep against a move line judged a
     * full ply deep. The position after a card and before its owner's move is
     * not quiet — the effect has landed and the reply is not yet paid for — so
     * that comparison systematically mispriced every card at the horizon.
     * Recursion still terminates: `turnCard` forbids a second card, so at most
     * one non-decrementing step exists per ply, and the follow-up width is
     * capped below.
     */
    const score = wouldRevealDraft(state, action, ctx.content)
      ? evaluate(child, ctx.content, side)
      : action.kind === 'play_card'
        ? negamax(child, depth, alpha, beta, side, ctx)
        : -negamax(child, depth - 1, -beta, -alpha, otherSide(side), ctx)

    if (score > best) best = score
    if (best > alpha) alpha = best
    if (alpha >= beta) break
  }

  if (best === -Number.POSITIVE_INFINITY) return evaluate(state, ctx.content, side)

  ttKey[slot] = key
  ttDepth[slot] = depth
  ttScore[slot] = best
  ttFlag[slot] = best <= originalAlpha ? UPPER : best >= beta ? LOWER : EXACT
  ttGen[slot] = generation

  return best
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

/**
 * Scores every legal action from `state`, best first.
 *
 * Root children are searched with a FULL window rather than the narrowing one
 * alpha-beta would use on them. That gives up root-level pruning, and it buys
 * the thing the rest of the system needs: an exact score for every option
 * rather than a bound for the ones that were already losing. ADR-006's
 * temperature samples over these numbers, and AC-009 asserts they are equal
 * between two positions that differ only in cards nobody has seen — neither
 * claim survives if most of the vector is `<= alpha`.
 */
export function search(state: GameState, content: ContentSet, options: SearchOptions): SearchResult {
  const legal = legalActions(state, content)
  if (legal.length === 0) return { scored: [], best: null, nodes: 0, depthReached: 0, valveTripped: false }

  generation += 1
  const side = state.sideToMove
  const ctx: Ctx = {
    content,
    budget: options.nodeBudget,
    nodes: 0,
    cardCap: options.cardExpansionCap ?? CARD_EXPANSION_CAP,
    deadline: options.deadline ?? 0,
    tripped: false,
  }
  const maxDepth = options.maxDepth ?? MAX_DEPTH

  // Depth 0: the static answer. It is what `scored` holds if the budget is too
  // small for even one expansion, which keeps the "every root action is scored"
  // promise true at any budget rather than only at generous ones.
  let scored: ScoredAction[] = legal.map((action) => ({
    action,
    score: evaluate(applyTrusted(state, action, content), content, side),
  }))
  let depthReached = 0

  for (let depth = 1; depth <= maxDepth; depth += 1) {
    if (ctx.nodes >= ctx.budget || ctx.tripped) break

    // Previous iteration's ranking drives this one's order — the whole reason
    // iterative deepening is cheaper than jumping straight to the target depth.
    const order = [...scored].sort((a, b) => b.score - a.score)
    const next: ScoredAction[] = []
    let exhausted = false

    for (const { action } of order) {
      if (ctx.nodes >= ctx.budget || outOfTime(ctx)) {
        exhausted = true
        break
      }
      ctx.nodes += 1
      const child = applyTrusted(state, action, content)
      // Same rule as inside `negamax`: a card play does not hand the board over,
      // so its child is this player's node — not negated, and not charged a
      // level of depth, because a card is not a ply (see the note there).
      const score = wouldRevealDraft(state, action, content)
        ? evaluate(child, content, side)
        : action.kind === 'play_card'
          ? negamax(child, depth, -Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, side, ctx)
          : -negamax(child, depth - 1, -Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, otherSide(side), ctx)
      next.push({ action, score })
    }

    // A half-finished depth is discarded rather than merged. Mixing scores from
    // two depths would rank actions against each other on different evidence,
    // and the ranking is what the difficulty sampler consumes.
    if (exhausted) break
    scored = next
    depthReached = depth
  }

  scored.sort((a, b) => b.score - a.score)
  return { scored, best: scored[0]?.action ?? null, nodes: ctx.nodes, depthReached, valveTripped: ctx.tripped }
}
