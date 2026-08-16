import type { ContentSet } from '@content/load'
import type {
  Condition,
  DestinationRegion,
  Effect,
  PieceDef,
  SquareTypeDef,
  Target,
  TargetFilter,
} from '@content/schema'
import { type GameState, type PieceOnBoard, type Side, type SquareId, coords, otherSide, squareId } from './types'

/**
 * Effect collection and evaluation for the ADR-002 pipeline.
 *
 * Resolution is a total order over (lifecycle event x owner layer). This module
 * owns the *layer* half: for a given event it yields effects in the fixed order
 * board square -> piece passive -> rule card -> skill card, and within a layer
 * in content-declaration order.
 */

export type Layer = 'square' | 'piece' | 'rule' | 'skill'

export interface BoundEffect {
  layer: Layer
  /** Square the effect's owner sits on, when it has one. */
  ownerSquare: SquareId | null
  ownerSide: Side | null
  effect: Effect
  sourceId: string
  /**
   * Subject this binding forces, set only by a `forEach` expansion. Without it
   * a quantified effect would be evaluated against the event's global subject,
   * which is the piece that moved — not the piece the quantifier bound.
   */
  boundSubject?: { square: SquareId; piece: PieceOnBoard }
}

export interface EvalCtx {
  state: GameState
  content: ContentSet
  mover: Side
  /** The piece the current event is about, and where it stands. */
  subject: { square: SquareId; piece: PieceOnBoard } | null
  /** Squares the player picked for a card play. */
  chosen: readonly SquareId[]
  /**
   * Where the piece making this ply stands RIGHT NOW, which is not always where
   * the event's subject is.
   *
   * At `on_capture` the two come apart, and that gap is what made "the piece
   * that captured dies too" unauthorable: the victim has been removed and the
   * capturer has not been placed, so the subject square is empty and every
   * target resolving through the subject names nothing. Null for events with no
   * board move behind them, where `mover` falls back to the subject.
   */
  moverSquare?: SquareId | null
}

/** Board-relative rank, counted from a piece's own home side. */
export function rankFromSide(state: GameState, square: SquareId, side: Side): number {
  const { rank } = coords(square)
  return side === 'white' ? rank + 1 : state.height - rank
}

/** A board half-band whose depth is authored by the board, not by a card. */
export function inTerritory(
  state: GameState,
  content: ContentSet,
  square: SquareId,
  side: Side,
  region: 'own_territory' | 'opponent_territory',
): boolean {
  const board = content.boards.get(state.boardId)
  if (!board) return false
  const relativeSide = region === 'own_territory' ? side : otherSide(side)
  return rankFromSide(state, square, relativeSide) <= board.territoryDepth
}

/** `local` is the eight-square neighborhood around the selected piece. */
export function inLocalRegion(state: GameState, anchor: SquareId, destination: SquareId): boolean {
  const from = coords(anchor)
  const to = coords(destination)
  return Math.max(Math.abs(from.file - to.file), Math.abs(from.rank - to.rank)) <= 1
}

function matchesTargetFilter(piece: PieceOnBoard, filter: TargetFilter | undefined, content: ContentSet): boolean {
  if (!filter) return true
  if (filter.kind === 'non_royal') return content.pieces.get(piece.pieceId)?.royal !== true
  if (filter.kind === 'exclude_piece_ids') return !filter.pieceIds.includes(piece.pieceId)
  return filter.pieceIds.includes(piece.pieceId)
}

/** Shared target validation used by candidate generation and effect execution. */
export function isChosenTargetAllowed(
  target: Target,
  square: SquareId,
  state: GameState,
  content: ContentSet,
  mover: Side,
  chosen: readonly SquareId[],
  layer: Layer,
): boolean {
  if (target.kind !== 'chosen_friendly' && target.kind !== 'chosen_enemy') return false
  const piece = state.board.get(square)
  if (!piece) return false
  const expectedSide = target.kind === 'chosen_friendly' ? mover : otherSide(mover)
  if (piece.side !== expectedSide) return false
  if (layer === 'skill' && content.pieces.get(piece.pieceId)?.royal === true) return false
  if (!matchesTargetFilter(piece, target.filter, content)) return false
  const relation = target.relation
  if (relation?.kind === 'adjacent_to_choice') {
    const anchor = chosen[relation.choiceIndex]
    if (!anchor || !inLocalRegion(state, anchor, square) || anchor === square) return false
  }
  return true
}

/** Shared destination validation used by candidate generation and apply. */
export function isDestinationAllowed(
  state: GameState,
  content: ContentSet,
  destination: SquareId,
  region: DestinationRegion | undefined,
  relativeSide: Side,
  anchor: SquareId | null,
): boolean {
  if (!region || region === 'any') return true
  if (region === 'local') return anchor !== null && inLocalRegion(state, anchor, destination)
  return inTerritory(state, content, destination, relativeSide, region)
}

/** Square types painted on the active board, keyed by square. */
export function paintedSquares(state: GameState, content: ContentSet): Map<SquareId, { type: SquareTypeDef; pairedWith?: string }> {
  const board = content.boards.get(state.boardId)
  const out = new Map<SquareId, { type: SquareTypeDef; pairedWith?: string }>()
  if (!board) return out
  for (const s of board.squares) {
    const type = content.squareTypes.get(s.typeId)
    if (type) out.set(s.square, s.pairedWith === undefined ? { type } : { type, pairedWith: s.pairedWith })
  }
  return out
}

/**
 * Collects every effect bound to `trigger`, in ADR-002 layer order.
 *
 * `focusSquares` limits the square layer to the squares this event is about
 * (the origin for on_leave, the destination for on_enter); pass null for a
 * board-wide sweep, which is what generate_moves needs.
 */
/**
 * Expands one effect into its bindings, in board order.
 *
 * ADR-002 (amended in Phase 6a): a piece-layer effect fires **once per owning
 * piece**, and owner-relative targets bind to that piece — so four archers make
 * four firings, not one. The `forEach` quantifier gives an ownerless effect the
 * same shape, which is what lets a rule card say "for each king" without the
 * engine knowing what a king is.
 */
export function bindEffect(state: GameState, mover: Side, base: BoundEffect): BoundEffect[] {
  const selector = base.effect.forEach
  if (!selector) return [base]

  const out: BoundEffect[] = []
  for (const [square, piece] of state.board) {
    if (selector.pieceId !== undefined && piece.pieceId !== selector.pieceId) continue
    if (selector.side === 'mover' && piece.side !== mover) continue
    if (selector.side === 'opponent' && piece.side !== otherSide(mover)) continue
    out.push({ ...base, ownerSquare: square, ownerSide: piece.side, boundSubject: { square, piece } })
  }
  return out
}

export function collectEffects(
  state: GameState,
  content: ContentSet,
  trigger: string,
  focusSquares: readonly SquareId[] | null,
  mover: Side = state.sideToMove,
): BoundEffect[] {
  const out: BoundEffect[] = []
  const push = (bound: BoundEffect) => out.push(...bindEffect(state, mover, bound))

  // Layer 1 — board squares.
  const painted = paintedSquares(state, content)
  for (const [square, { type }] of painted) {
    if (focusSquares && !focusSquares.includes(square)) continue
    for (const effect of type.effects) {
      if (effect.trigger === trigger) {
        push({ layer: 'square', ownerSquare: square, ownerSide: null, effect, sourceId: type.id })
      }
    }
  }

  // Layer 2 — piece passives.
  for (const [square, piece] of state.board) {
    const def = content.pieces.get(piece.pieceId)
    if (!def) continue
    for (const effect of def.effects) {
      if (effect.trigger === trigger) {
        push({ layer: 'piece', ownerSquare: square, ownerSide: piece.side, effect, sourceId: def.id })
      }
    }
  }

  // Layer 3 — the drawn rule card.
  const rule = state.ruleCardId ? content.ruleCards.get(state.ruleCardId) : undefined
  if (rule) {
    for (const effect of rule.effects) {
      if (effect.trigger === trigger) {
        push({ layer: 'rule', ownerSquare: null, ownerSide: null, effect, sourceId: rule.id })
      }
    }
  }

  // Layer 4 — skill cards resolve only on their own play, handled by `apply`.
  return out
}

export function evalCondition(cond: Condition, bound: BoundEffect, ctx: EvalCtx): boolean {
  switch (cond.kind) {
    case 'always':
      return true
    case 'piece_is':
      return ctx.subject?.piece.pieceId === cond.pieceId
    case 'piece_side':
      return ctx.subject?.piece.side === (cond.side === 'mover' ? ctx.mover : otherSide(ctx.mover))
    case 'in_promotion_zone': {
      if (!ctx.subject) return false
      const board = ctx.content.boards.get(ctx.state.boardId)
      if (!board) return false
      return rankFromSide(ctx.state, ctx.subject.square, ctx.subject.piece.side) >= ctx.state.height - board.promotionDepth + 1
    }
    case 'on_square':
      return ctx.subject !== null && cond.squares.includes(ctx.subject.square)
    case 'on_own_rank': {
      // Counted from the subject's OWN home rank, 1-based, so the same `n`
      // means mirrored ranks for the two sides. Same arithmetic the engine
      // already uses to decide a promotion rank.
      if (!ctx.subject) return false
      const { rank } = coords(ctx.subject.square)
      const fromOwnSide = ctx.subject.piece.side === 'white' ? rank + 1 : ctx.state.height - rank
      return fromOwnSide === cond.n
    }
    case 'piece_count_at_most': {
      const side = cond.side === 'mover' ? ctx.mover : otherSide(ctx.mover)
      let count = 0
      for (const piece of ctx.state.board.values()) if (piece.side === side) count += 1
      return count <= cond.n
    }
    case 'piece_kind_count_at_most': {
      // Reads the live board rather than `state.captured`: a revive puts a
      // piece back, and a count of what was LOST would then disagree with
      // what is standing there.
      const side = cond.side === 'mover' ? ctx.mover : otherSide(ctx.mover)
      let count = 0
      for (const piece of ctx.state.board.values()) {
        if (piece.side === side && piece.pieceId === cond.pieceId) count += 1
      }
      return count <= cond.n
    }
    case 'check_count_at_least':
      // Reads the mover's own tally — "I have checked you N times", which is
      // what every three-check variant means by it.
      return (ctx.state.checkCount[ctx.mover] ?? 0) >= cond.n
    case 'not':
      return !evalCondition(cond.of, bound, ctx)
    case 'all':
      return cond.of.every((c) => evalCondition(c, bound, ctx))
    case 'any':
      return cond.of.some((c) => evalCondition(c, bound, ctx))
  }
}

/** Squares an action's `target` resolves to, given who owns the effect. */
export function resolveTarget(
  target: Target,
  bound: BoundEffect,
  ctx: EvalCtx,
  chosenCursor: { i: number },
): SquareId[] {
  switch (target.kind) {
    case 'self':
      return bound.ownerSquare ? [bound.ownerSquare] : []
    case 'occupant':
      return bound.ownerSquare && ctx.state.board.has(bound.ownerSquare) ? [bound.ownerSquare] : []
    case 'entering':
      return ctx.subject ? [ctx.subject.square] : []
    case 'mover':
      // `entering` is about the event's subject; `mover` is about the piece
      // making the ply. They agree everywhere except a capture, which is the
      // one place the distinction is worth anything — and while these two were
      // the same expression, no card could name the capturing piece.
      if (ctx.moverSquare) return ctx.state.board.has(ctx.moverSquare) ? [ctx.moverSquare] : []
      // Guarded the same way the branch above is. `ctx.subject` on the card
      // `on_play` path is a SNAPSHOT taken before the actions ran, so after a
      // relocation in the same effect its `.square` names the vacated origin —
      // "teleport this piece and freeze it there" wrote the freeze onto the
      // square the piece had just left, and square-keyed state then immobilised
      // whatever stood there next. Found in review.
      return ctx.subject && ctx.state.board.has(ctx.subject.square) ? [ctx.subject.square] : []
    case 'adjacent_friendly': {
      if (!bound.ownerSquare || !bound.ownerSide) return []
      const { file, rank } = coords(bound.ownerSquare)
      const out: SquareId[] = []
      for (let df = -1; df <= 1; df += 1) {
        for (let dr = -1; dr <= 1; dr += 1) {
          if (df === 0 && dr === 0) continue
          const sq = squareId(file + df, rank + dr)
          const occupant = ctx.state.board.get(sq)
          if (occupant && occupant.side === bound.ownerSide) out.push(sq)
        }
      }
      return out
    }
    case 'chosen_friendly':
    case 'chosen_enemy': {
      const sq = ctx.chosen[chosenCursor.i]
      chosenCursor.i += 1
      return sq && isChosenTargetAllowed(target, sq, ctx.state, ctx.content, ctx.mover, ctx.chosen, bound.layer) ? [sq] : []
    }
    default:
      return []
  }
}

/** Piece definition lookup that fails loudly rather than silently no-op'ing. */
export function pieceDefOf(content: ContentSet, piece: PieceOnBoard): PieceDef {
  const def = content.pieces.get(piece.pieceId)
  if (!def) throw new Error(`content set has no piece ${piece.pieceId}`)
  return def
}
