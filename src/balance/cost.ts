import type { Action, BoardDef, Condition, Effect, MovePattern, PieceDef, SkillCardDef, Target } from '@content/schema'

/**
 * What a record costs, read off its declaration (ADR-012).
 *
 * The grade used to be a measured win-rate delta. That was defensible and it was
 * also unusable as a price: it produced zeros and negatives, so a budget could
 * not add it up; it cost hundreds of self-play matches per record; and it said
 * things a player would call wrong — under random play the archer beat the queen
 * two to one, and even under a tactical agent the two came out level.
 *
 * So a cost is now computed from what the record SAYS: how far it moves, how far
 * it takes, and for an ability, how broad its condition and its reach are. Three
 * properties follow and all three were missing before. It is always at least 1,
 * so every record has a price. It is instant, so no worker, no cache and no
 * shipped table stand between an author and the number. And it is explainable —
 * "this one costs more because it reaches further" is a sentence a nine-year-old
 * can act on, where "it won 4.58 percentage points more often" is not.
 *
 * **What is given up, stated plainly.** These weights are chosen, not measured,
 * so this is no longer an objective index in the strict sense — it is a designed
 * one. The measurement rig is kept for exactly that reason: it still runs in CI
 * as a check on the ORDER this model produces, and where the two disagree the
 * disagreement is recorded rather than smoothed over. The archer is the standing
 * example: play says it rivals the queen, structure says it cannot, and structure
 * is what the price uses.
 */

/** Every cost is a positive integer, so a record can never be free. */
export const MINIMUM_COST = 1

/**
 * How much cheaper a card is than a piece of the same raw weight.
 *
 * Not a taste. A piece is on the board every ply it survives; a card fires
 * `uses` times and is gone. Measured play put the gap at roughly eight to one —
 * swapping a piece moved the win rate by five to twenty-five points, while the
 * strongest bundled card moved it under three — and without the divisor the
 * model disagreed with that badly enough to be obviously wrong: `skill.sacrifice`
 * priced above the queen.
 */
const CARD_TO_PIECE = 8

/** Stars, and there are five of them. */
export const MAX_STARS = 5

/**
 * The dearest thing a loadout may carry, derived rather than picked.
 *
 * Twice the priciest piece the room itself plays. Deriving it matters more than
 * the factor does: a constant here would be a number somebody chose that every
 * authored piece is then judged against, and it would not move when the room
 * does. Two is the headroom — a player may build something meaningfully above
 * anything shipped, and not ten times above it.
 *
 * This ceiling is what makes a five-level scale safe. Bands compress, and an
 * open-ended top band would put the queen and a monster ten times her price at
 * the same five stars — which the same-grade replacement rule would then read as
 * interchangeable. Closing the top is what stops a coarser display from becoming
 * a looser rule.
 */
export function costCeiling(pieces: Iterable<PieceDef>, board: Pick<BoardDef, 'width' | 'height'>): number {
  let dearest = 0
  for (const piece of pieces) {
    if (piece.royal === true) continue
    dearest = Math.max(dearest, pieceCost(piece, board))
  }
  return Math.max(MINIMUM_COST * 2, dearest * 2)
}

/**
 * How many stars a cost earns, one to five, against a ceiling.
 *
 * Geometric, not linear: each star is twice the one below, so the top band is
 * half the ceiling rather than a fifth of it. Linear bands would put the pawn,
 * the knight, the archer and the rook all in the first star and leave four for
 * the queen alone, because the shipped pieces span an eight-fold range and
 * strength is not felt in equal steps.
 *
 * A cost ABOVE the ceiling still returns five — this reports what a thing looks
 * like, and refusing it is `checkLoadoutGrades`'s job. A display that silently
 * showed six stars would be inventing a band the rules do not have.
 */
export function starsOf(cost: number, ceiling: number): number {
  for (let star = 1; star < MAX_STARS; star += 1) {
    if (cost <= ceiling / 2 ** (MAX_STARS - star)) return star
  }
  return MAX_STARS
}

/** Whether a record is simply too dear to be brought at all. */
export function exceedsCeiling(cost: number, ceiling: number): boolean {
  return cost > ceiling
}

/**
 * Squares a pattern set covers, from the declaration alone.
 *
 * A slide with no `maxDistance` is capped at the board's longest side minus one,
 * which is the furthest it could ever travel; that is the only place the board
 * enters, and it enters because a board is authored too — an unbounded slide is
 * worth more on a wider board.
 */
export function patternReach(patterns: readonly MovePattern[], boardMax: number): number {
  let reach = 0
  for (const pattern of patterns) {
    const steps = pattern.kind === 'slide' ? Math.min(pattern.maxDistance ?? boardMax - 1, boardMax - 1) : 1
    reach += pattern.vectors.length * steps
  }
  return reach
}

/**
 * How much of the board a target can pick from, as a small breadth factor.
 *
 * The axis the user named: an ability that may hit ANY enemy is worth more than
 * one that may only hit the piece that just moved, whatever the two do
 * afterwards.
 */
function targetBreadth(target: Target): number {
  switch (target.kind) {
    case 'chosen_enemy':
      return 4
    case 'chosen_friendly':
      return 3
    case 'adjacent_friendly':
      return 2
    case 'occupant':
    case 'entering':
    case 'mover':
      return 2
    case 'self':
      return 1
  }
}

/**
 * How often a condition lets its effect fire, as a small breadth factor.
 *
 * `always` is the broadest thing the grammar can say and is priced as such; every
 * narrowing divides. `not` is deliberately NOT treated as a narrowing — the
 * negation of a narrow condition is a broad one, and pricing it as narrow would
 * make `not: { piece_is: pawn }` the cheapest way to say "nearly always".
 */
function conditionBreadth(condition: Condition): number {
  switch (condition.kind) {
    case 'always':
      return 4
    case 'piece_side':
      return 3
    case 'piece_count_at_most':
    case 'check_count_at_least':
      return 2
    case 'piece_is':
    case 'on_square':
    case 'on_own_rank':
      return 1
    case 'not':
      // Broad by construction: it is everything the inner condition excludes.
      return 4
    case 'all':
      // Every extra clause narrows, so the narrowest clause bounds the whole.
      return Math.min(...condition.of.map(conditionBreadth))
    case 'any':
      return Math.max(...condition.of.map(conditionBreadth))
  }
}

/**
 * What one action is worth before its condition and target are applied.
 *
 * Ordered by what the action does to the board rather than by taste: removing a
 * piece outright and winning the match are the two things nothing recovers from,
 * creating material is next, and moving something around is last.
 */
function actionWeight(action: Action): number {
  switch (action.kind) {
    case 'win':
      return 40
    case 'destroy_piece':
      return 8
    case 'revive_piece':
    case 'spawn_piece':
      return 7
    case 'promote_piece':
      return 6
    case 'freeze_piece':
      return 3 * action.plies
    case 'swap_pieces':
      return 4
    case 'teleport_piece':
      return 3
    case 'grant_movement':
      return 2 * (action.duration ?? 1)
    case 'block_capture':
      return 2 * (action.duration ?? 1)
    case 'forbid_movement':
      return 2 * (action.duration ?? 1)
  }
}

/** An action's own target, where it has one — the breadth its reach is priced by. */
function actionTarget(action: Action): Target | null {
  return 'target' in action ? action.target : 'a' in action ? action.a : null
}

/** What one effect costs: what it does, how widely it may pick, how often it fires. */
export function effectCost(effect: Effect): number {
  const breadth = conditionBreadth(effect.condition)
  let total = 0
  for (const action of effect.actions) {
    const target = actionTarget(action)
    total += actionWeight(action) * (target ? targetBreadth(target) : 2)
  }
  // A quantifier makes the effect fire once per matching piece, so its reach is
  // the board rather than one square.
  const quantified = effect.forEach ? 2 : 1
  return total * breadth * quantified
}

/**
 * What a piece costs.
 *
 * Taking is weighted above walking because the game is decided on material —
 * `materialResult` counts pieces and nothing else — so the squares a piece can
 * take on are the ones that decide matches. A piece with no separate `attack`
 * takes where it moves, and is priced on that same reach rather than on nothing.
 */
export function pieceCost(piece: PieceDef, board: Pick<BoardDef, 'width' | 'height'>): number {
  const boardMax = Math.max(board.width, board.height)
  const move = patternReach(piece.movement, boardMax)
  const attack = patternReach(piece.attack ?? piece.movement, boardMax)

  let total = move + attack * 2
  // A separate attack is a capability, not just a number of squares: the piece
  // can threaten squares it cannot walk to.
  if (piece.attack !== undefined) total += 4
  if (piece.promotion !== undefined) total += 6
  for (const effect of piece.effects) total += effectCost(effect)

  return Math.max(MINIMUM_COST, Math.round(total))
}

/**
 * What a skill card costs.
 *
 * `uses` multiplies, because a card that fires three times is three cards that
 * happen to share a name.
 */
export function skillCardCost(card: SkillCardDef): number {
  let total = 0
  for (const effect of card.effects) total += effectCost(effect)
  return Math.max(MINIMUM_COST, Math.round((total * card.uses) / CARD_TO_PIECE))
}

/** The stars a piece is offered at. */
export function pieceStars(piece: PieceDef, board: Pick<BoardDef, 'width' | 'height'>, ceiling: number): number {
  return starsOf(pieceCost(piece, board), ceiling)
}

/** The stars a card is offered at. */
export function skillCardStars(card: SkillCardDef, ceiling: number): number {
  return starsOf(skillCardCost(card), ceiling)
}
