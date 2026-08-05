import type { ContentSet } from '@content/load'
import type { Action as EffectAction, MovePattern } from '@content/schema'
import { type BoundEffect, type EvalCtx, collectEffects, evalCondition, paintedSquares, pieceDefOf, resolveTarget } from './effects'
import { pickDistinct, rngFor } from './rng'
import {
  type ActiveGrant,
  type Action,
  type GameState,
  type MatchResult,
  type PieceOnBoard,
  type Side,
  type SquareId,
  coords,
  otherSide,
  squareId,
} from './types'

export const PLY_CAP = 60
export const DRAFT_OFFER_SIZE = 3
export const SECOND_DRAFT_AFTER_TURNS = 5
const MAX_CASCADE_DEPTH = 8

// ---------------------------------------------------------------------------
// Move generation (event E1)
// ---------------------------------------------------------------------------

interface GenerationModifiers {
  /** Squares whose occupant cannot be captured. */
  protectedSquares: Set<SquareId>
  /** Squares whose occupant cannot move at all. */
  forbidden: Set<SquareId>
  granted: Map<SquareId, MovePattern[]>
}

function generationModifiers(state: GameState, content: ContentSet): GenerationModifiers {
  const mods: GenerationModifiers = { protectedSquares: new Set(), forbidden: new Set(), granted: new Map() }

  // Modifiers a card left behind, still inside their window. Merged before the
  // E1 sweep so a live grant and a passive that grants the same thing compose
  // rather than one silently replacing the other.
  for (const grant of state.grants) {
    if (grant.untilPly <= state.plyCount) continue
    if (grant.kind === 'block_capture') mods.protectedSquares.add(grant.square)
    else if (grant.kind === 'forbid_movement') mods.forbidden.add(grant.square)
    else if (grant.pattern) mods.granted.set(grant.square, [...(mods.granted.get(grant.square) ?? []), grant.pattern])
  }

  for (const bound of collectEffects(state, content, 'generate_moves', null)) {
    const ownerPiece = bound.ownerSquare ? state.board.get(bound.ownerSquare) : undefined
    const ctx: EvalCtx = {
      state,
      content,
      mover: state.sideToMove,
      subject:
        bound.boundSubject ??
        (bound.ownerSquare && ownerPiece ? { square: bound.ownerSquare, piece: ownerPiece } : null),
      chosen: [],
    }
    if (!evalCondition(bound.effect.condition, bound, ctx)) continue

    for (const act of bound.effect.actions) {
      const cursor = { i: 0 }
      switch (act.kind) {
        case 'block_capture':
          for (const sq of resolveTarget(act.target, bound, ctx, cursor)) mods.protectedSquares.add(sq)
          break
        case 'forbid_movement':
          for (const sq of resolveTarget(act.target, bound, ctx, cursor)) mods.forbidden.add(sq)
          break
        case 'grant_movement':
          for (const sq of resolveTarget(act.target, bound, ctx, cursor)) {
            mods.granted.set(sq, [...(mods.granted.get(sq) ?? []), act.pattern])
          }
          break
        default:
          break // non-generation actions belong to later events
      }
    }
  }
  return mods
}

/** Applies a side's forward orientation to a pattern's vectors. */
function orient(pattern: MovePattern, side: Side): Array<[number, number]> {
  const flip = pattern.forward === true && side === 'black' ? -1 : 1
  return pattern.vectors.map(([df, dr]) => [df, dr * flip] as [number, number])
}

function inBounds(state: GameState, file: number, rank: number): boolean {
  return file >= 0 && rank >= 0 && file < state.width && rank < state.height
}

interface Reach {
  quiet: SquareId[]
  captures: SquareId[]
}

function reachFrom(
  state: GameState,
  from: SquareId,
  piece: PieceOnBoard,
  patterns: readonly MovePattern[],
  allowCapture: boolean,
  allowQuiet: boolean,
): Reach {
  const origin = coords(from)
  const out: Reach = { quiet: [], captures: [] }

  for (const pattern of patterns) {
    for (const [df, dr] of orient(pattern, piece.side)) {
      const maxSteps = pattern.kind === 'slide' ? (pattern.maxDistance ?? Math.max(state.width, state.height)) : 1
      for (let step = 1; step <= maxSteps; step += 1) {
        const file = origin.file + df * step
        const rank = origin.rank + dr * step
        if (!inBounds(state, file, rank)) break
        const sq = squareId(file, rank)
        const occupant = state.board.get(sq)
        if (!occupant) {
          if (allowQuiet) out.quiet.push(sq)
          continue
        }
        if (occupant.side !== piece.side && allowCapture) out.captures.push(sq)
        break // a slide stops at the first occupied square; steps/jumps end anyway
      }
    }
  }
  return out
}

function movesFor(state: GameState, content: ContentSet, mods: GenerationModifiers): Action[] {
  const actions: Action[] = []

  for (const [from, piece] of state.board) {
    if (piece.side !== state.sideToMove) continue
    if (mods.forbidden.has(from)) continue
    if ((state.frozenUntil[from] ?? -1) > state.plyCount) continue

    const def = pieceDefOf(content, piece)
    const granted = mods.granted.get(from) ?? []
    const movement = [...def.movement, ...granted]
    const hasSeparateAttack = def.attack !== undefined

    const targets = new Set<SquareId>()
    // Movement patterns: quiet always; captures too when no separate attack set.
    const byMovement = reachFrom(state, from, piece, movement, !hasSeparateAttack, true)
    for (const sq of byMovement.quiet) targets.add(sq)
    for (const sq of byMovement.captures) if (!mods.protectedSquares.has(sq)) targets.add(sq)

    if (hasSeparateAttack) {
      const byAttack = reachFrom(state, from, piece, def.attack!, true, false)
      for (const sq of byAttack.captures) if (!mods.protectedSquares.has(sq)) targets.add(sq)
    }

    for (const to of [...targets].sort()) actions.push({ kind: 'move', from, to })
  }
  return actions
}

// ---------------------------------------------------------------------------
// Check detection (schema v2 — the capability `check_count_at_least` needed)
// ---------------------------------------------------------------------------

/** Empty squares on a side's home rank, in file order. */
function backRankVacancies(state: GameState, side: Side): SquareId[] {
  const rank = side === 'white' ? 0 : state.height - 1
  const out: SquareId[] = []
  for (let file = 0; file < state.width; file += 1) {
    const sq = squareId(file, rank)
    if (!state.board.has(sq)) out.push(sq)
  }
  return out
}

/** Whether `side` still has a royal piece anywhere on the board. */
function hasRoyal(board: ReadonlyMap<SquareId, PieceOnBoard>, content: ContentSet, side: Side): boolean {
  for (const piece of board.values()) {
    if (piece.side === side && content.pieces.get(piece.pieceId)?.royal === true) return true
  }
  return false
}

/**
 * Whether `side` has a royal piece an enemy could capture right now.
 *
 * Protection counts: a royal standing where `block_capture` applies is not in
 * check, because check means "capturable next", and that capture is not
 * generated. Reading it any other way would let a rule card that makes a king
 * safe still lose the match to a check counter.
 */
export function sideInCheck(state: GameState, content: ContentSet, side: Side): boolean {
  const royals: SquareId[] = []
  for (const [sq, piece] of state.board) {
    if (piece.side === side && content.pieces.get(piece.pieceId)?.royal === true) royals.push(sq)
  }
  if (royals.length === 0) return false

  const mods = generationModifiers({ ...state, sideToMove: otherSide(side) }, content)
  const exposed = royals.filter((sq) => !mods.protectedSquares.has(sq))
  if (exposed.length === 0) return false

  for (const [from, piece] of state.board) {
    if (piece.side === side) continue
    if (mods.forbidden.has(from)) continue
    const def = content.pieces.get(piece.pieceId)
    if (!def) continue
    const patterns = def.attack ?? def.movement
    const reach = reachFrom(state, from, piece, patterns, true, false)
    if (reach.captures.some((sq) => exposed.includes(sq))) return true
  }
  return false
}

// ---------------------------------------------------------------------------
// Card plays
// ---------------------------------------------------------------------------

/** Ordered choice slots a card requires, derived from its actions. */
function choiceSlots(content: ContentSet, cardId: string): Array<'friendly' | 'enemy' | 'empty'> {
  const card = content.skillCards.get(cardId)
  if (!card) return []
  const slots: Array<'friendly' | 'enemy' | 'empty'> = []
  for (const effect of card.effects) {
    for (const act of effect.actions) {
      if ('target' in act) {
        if (act.target.kind === 'chosen_friendly') slots.push('friendly')
        if (act.target.kind === 'chosen_enemy') slots.push('enemy')
      }
      if (act.kind === 'swap_pieces') {
        for (const side of [act.a, act.b]) {
          if (side.kind === 'chosen_friendly') slots.push('friendly')
          if (side.kind === 'chosen_enemy') slots.push('enemy')
        }
      }
      if ('to' in act && typeof act.to === 'object' && act.to.kind === 'chosen_empty') slots.push('empty')
      if ('at' in act && typeof act.at === 'object' && act.at.kind === 'chosen_empty') slots.push('empty')
    }
  }
  return slots
}

function candidatesFor(state: GameState, slot: 'friendly' | 'enemy' | 'empty'): SquareId[] {
  const out: SquareId[] = []
  if (slot === 'empty') {
    for (let f = 0; f < state.width; f += 1) {
      for (let r = 0; r < state.height; r += 1) {
        const sq = squareId(f, r)
        if (!state.board.has(sq)) out.push(sq)
      }
    }
    return out.sort()
  }
  for (const [sq, piece] of state.board) {
    const wanted = slot === 'friendly' ? state.sideToMove : otherSide(state.sideToMove)
    if (piece.side === wanted) out.push(sq)
  }
  return out.sort()
}

/**
 * Whether a card can actually do something from this position.
 *
 * A card that resolves to nothing must not be offered. Spending your whole turn
 * on a card that quietly does nothing is the same failure as an action that
 * validates and never fires — the player cannot tell the difference from the
 * outside, and the vocabulary is what promised otherwise.
 */
function cardResolves(state: GameState, content: ContentSet, cardId: string): boolean {
  const card = content.skillCards.get(cardId)
  if (!card) return false
  const mover = state.sideToMove

  for (const effect of card.effects) {
    for (const act of effect.actions) {
      if (act.kind === 'revive_piece') {
        const side = act.side === 'mover' ? mover : otherSide(mover)
        const pool = state.captured[side].filter((id) => !(act.except ?? []).includes(id))
        if (pool.length === 0) return false
        if (act.at.kind === 'own_back_rank' && backRankVacancies(state, side).length === 0) return false
      }
      if (act.kind === 'teleport_piece' && act.to.kind === 'own_back_rank') {
        // Whose home rank depends on who the card can target. A friendly-only
        // card always means the mover's; a card that can grab an enemy piece
        // stays playable while either rank has room.
        const sides: Side[] =
          act.target.kind === 'chosen_friendly' || act.target.kind === 'adjacent_friendly' || act.target.kind === 'self'
            ? [mover]
            : act.target.kind === 'chosen_enemy'
              ? [otherSide(mover)]
              : ['white', 'black']
        if (sides.every((side) => backRankVacancies(state, side).length === 0)) return false
      }
      if (act.kind === 'spawn_piece' && act.at.kind === 'own_back_rank') {
        const side = act.side === 'mover' ? mover : otherSide(mover)
        if (backRankVacancies(state, side).length === 0) return false
      }
    }
  }
  return true
}

function cardPlays(state: GameState, content: ContentSet): Action[] {
  const draft = state.drafts[state.sideToMove]
  const actions: Action[] = []

  for (const cardId of draft.held) {
    const card = content.skillCards.get(cardId)
    if (!card) continue
    const usedCount = draft.used.filter((c) => c === cardId).length
    if (usedCount >= card.uses) continue
    if (!cardResolves(state, content, cardId)) continue

    const slots = choiceSlots(content, cardId)
    let combos: SquareId[][] = [[]]
    for (const slot of slots) {
      const options = candidatesFor(state, slot)
      combos = combos.flatMap((prefix) => options.filter((o) => !prefix.includes(o)).map((o) => [...prefix, o]))
      if (combos.length === 0) break
    }
    for (const targets of combos) actions.push({ kind: 'play_card', cardId, targets })
  }
  return actions
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * An offer is only open when it has cards in it. An empty array gates board play
 * exactly as a real offer would, while yielding no `draft_pick` to satisfy it —
 * a match in that state has no legal action and no result. Treating the absent
 * case as "no offer" is what keeps that unreachable.
 */
function hasOpenOffer(state: GameState, side: Side): boolean {
  return (state.drafts[side].offers?.length ?? 0) > 0
}

/** The side that must resolve a draft before any board action, if any. */
export function pendingDraftSide(state: GameState): Side | null {
  if (state.drafts.white.draftIndex === 0 && hasOpenOffer(state, 'white')) return 'white'
  if (state.drafts.black.draftIndex === 0 && hasOpenOffer(state, 'black')) return 'black'
  return hasOpenOffer(state, state.sideToMove) ? state.sideToMove : null
}

export function legalActions(state: GameState, content: ContentSet): Action[] {
  if (state.result) return []

  const drafting = pendingDraftSide(state)
  if (drafting) {
    // AC-005: no board action is accepted until the pick is made.
    return (state.drafts[drafting].offers ?? []).map((cardId) => ({ kind: 'draft_pick', cardId }))
  }

  const mods = generationModifiers(state, content)
  return [...movesFor(state, content, mods), ...cardPlays(state, content)]
}

function sameAction(a: Action, b: Action): boolean {
  if (a.kind !== b.kind) return false
  if (a.kind === 'move' && b.kind === 'move') return a.from === b.from && a.to === b.to
  if (a.kind === 'draft_pick' && b.kind === 'draft_pick') return a.cardId === b.cardId
  if (a.kind === 'play_card' && b.kind === 'play_card') {
    return a.cardId === b.cardId && a.targets.length === b.targets.length && a.targets.every((t, i) => t === b.targets[i])
  }
  return false
}

/** Why an action is illegal, or null when it is legal. AC-008's UI clause. */
export function describeRejection(state: GameState, action: Action, content: ContentSet): string | null {
  if (state.result) return 'the match is already over'
  const legal = legalActions(state, content)
  if (legal.some((a) => sameAction(a, action))) return null

  const drafting = pendingDraftSide(state)
  if (drafting && action.kind !== 'draft_pick') return 'pick a skill card first'
  if (action.kind === 'play_card') {
    const draft = state.drafts[state.sideToMove]
    if (!draft.held.includes(action.cardId)) return 'that card belongs to the other player, or you do not hold it'
    if (draft.used.includes(action.cardId)) return 'that card has already been used'
    return 'that card cannot target those squares'
  }
  if (action.kind === 'move') {
    const piece = state.board.get(action.from)
    if (!piece) return 'there is no piece on that square'
    if (piece.side !== state.sideToMove) return 'that piece belongs to the other player'
    return 'that piece cannot reach that square'
  }
  return 'that card is not on offer'
}

// ---------------------------------------------------------------------------
// apply — the E1..E7 pipeline (ADR-002)
// ---------------------------------------------------------------------------

interface Mutable {
  board: Map<SquareId, PieceOnBoard>
  /** Squares the acting piece has occupied this ply — see the teleport rule. */
  visited: Set<SquareId>
  frozenUntil: Record<SquareId, number>
  log: string[]
  result: MatchResult | null
  captured: Record<Side, string[]>
  /** Squares a piece appeared on this ply and has yet to enter (G-6). */
  arrived: SquareId[]
  grants: ActiveGrant[]
}

/** Removes a piece and remembers it, so a comeback card has something to read. */
function removePiece(m: Mutable, square: SquareId): void {
  const piece = m.board.get(square)
  if (!piece) return
  m.board.delete(square)
  m.captured[piece.side].push(piece.pieceId)
}

function runEvent(
  state: GameState,
  content: ContentSet,
  m: Mutable,
  trigger: string,
  focus: SquareId[] | null,
  subject: { square: SquareId; piece: PieceOnBoard } | null,
  mover: Side,
  chosen: readonly SquareId[] = [],
): { movedTo: SquareId | null } {
  let movedTo: SquareId | null = null
  const working: GameState = { ...state, board: m.board, frozenUntil: m.frozenUntil }

  for (const bound of collectEffects(working, content, trigger, focus)) {
    const ctx: EvalCtx = { state: working, content, mover, subject, chosen }
    if (!evalCondition(bound.effect.condition, bound, ctx)) continue
    m.log.push(`${trigger}:${bound.layer}:${bound.sourceId}`)
    const moved = executeActions(bound.effect.actions, bound, ctx, m, mover, chosen, working, content, state.plyCount)
    if (moved) movedTo = moved
  }
  return { movedTo }
}

/**
 * Executes one effect's actions against the mutable ply state.
 *
 * Shared by the lifecycle events and by the skill-card path, so a `destroy` on
 * a square and a `destroy` on a card behave identically — that sameness is what
 * ADR-003's single vocabulary is worth.
 */
function executeActions(
  actions: readonly EffectAction[],
  bound: BoundEffect,
  ctx: EvalCtx,
  m: Mutable,
  mover: Side,
  chosen: readonly SquareId[],
  working: GameState,
  content: ContentSet,
  plyCount: number,
): SquareId | null {
  let movedTo: SquareId | null = null
  {
    const cursor = { i: 0 }
    /** First vacancy on `side`'s home rank, reading the live board. */
    const homeRankVacancy = (side: Side): SquareId | null => {
      const rank = side === 'white' ? 0 : working.height - 1
      for (let file = 0; file < working.width; file += 1) {
        const sq = squareId(file, rank)
        if (!m.board.has(sq)) return sq
      }
      return null
    }

    for (const act of actions) {
      switch (act.kind) {
        case 'destroy_piece':
          for (const sq of resolveTarget(act.target, bound, ctx, cursor)) removePiece(m, sq)
          break
        case 'teleport_piece': {
          for (const sq of resolveTarget(act.target, bound, ctx, cursor)) {
            const piece = m.board.get(sq)
            if (!piece) continue
            let dest: SquareId | null = null
            if (act.to.kind === 'paired_square') {
              dest = paintedSquares(working, content).get(sq)?.pairedWith ?? null
            } else if (act.to.kind === 'square') {
              dest = act.to.square
            } else if (act.to.kind === 'offset') {
              const { file, rank } = coords(sq)
              const dr = act.to.forward === true && piece.side === 'black' ? -act.to.dr : act.to.dr
              const f = file + act.to.df
              const r = rank + dr
              dest = f >= 0 && r >= 0 && f < working.width && r < working.height ? squareId(f, r) : null
            } else if (act.to.kind === 'own_back_rank') {
              // The moved piece's own rank, not the mover's. A card that pulled
              // an enemy piece into your camp would look plausible and be wrong.
              dest = homeRankVacancy(piece.side)
            } else if (act.to.kind === 'chosen_empty') {
              dest = chosen[cursor.i] ?? null
              cursor.i += 1
            }
            // A teleport never returns a piece to a square it already occupied
            // this ply. Two portals pointing at each other would otherwise
            // bounce it until the depth cap, and where it landed would be
            // decided by parity rather than by the content. Chained effects
            // that are not teleports (portal into a bomb square) still resolve.
            if (!dest || m.board.has(dest) || m.visited.has(dest)) continue
            // The square just vacated counts as occupied-this-ply, so nothing
            // can throw the piece back onto it later in the same cascade.
            m.visited.add(sq)
            m.board.delete(sq)
            m.board.set(dest, piece)
            movedTo = dest
          }
          break
        }
        case 'promote_piece':
          for (const sq of resolveTarget(act.target, bound, ctx, cursor)) {
            const piece = m.board.get(sq)
            if (piece) m.board.set(sq, { ...piece, pieceId: act.to })
          }
          break
        case 'spawn_piece': {
          const side = act.side === 'mover' ? mover : otherSide(mover)
          let dest: SquareId | null = null
          if (act.at.kind === 'chosen_empty') {
            dest = chosen[cursor.i] ?? null
            cursor.i += 1
          } else if (act.at.kind === 'square') {
            dest = act.at.square
          } else if (act.at.kind === 'own_back_rank') {
            dest = homeRankVacancy(side)
          }
          if (dest && !m.board.has(dest)) {
            m.board.set(dest, { pieceId: act.pieceId, side })
            m.arrived.push(dest)
          }
          break
        }
        case 'revive_piece': {
          const side = act.side === 'mover' ? mover : otherSide(mover)
          const pool = m.captured[side]
          // Last lost, first back — the piece the player is still smarting over.
          const index = [...pool].reverse().findIndex((id) => !(act.except ?? []).includes(id))
          if (index < 0) break
          const at = pool.length - 1 - index

          let dest: SquareId | null = null
          if (act.at.kind === 'own_back_rank') dest = homeRankVacancy(side)
          else if (act.at.kind === 'square') dest = act.at.square
          else if (act.at.kind === 'chosen_empty') {
            dest = chosen[cursor.i] ?? null
            cursor.i += 1
          }
          if (!dest || m.board.has(dest)) break

          const [pieceId] = pool.splice(at, 1)
          m.board.set(dest, { pieceId: pieceId!, side })
          m.arrived.push(dest)
          break
        }
        case 'swap_pieces': {
          const [a] = resolveTarget(act.a, bound, ctx, cursor)
          const [b] = resolveTarget(act.b, bound, ctx, cursor)
          if (!a || !b || a === b) break
          const pa = m.board.get(a)
          const pb = m.board.get(b)
          if (!pa || !pb) break
          m.board.set(a, pb)
          m.board.set(b, pa)
          break
        }
        case 'block_capture':
        case 'forbid_movement':
        case 'grant_movement': {
          // Without a duration these belong to the generation pass that read
          // them, and E1 already consumed them there.
          if (act.duration === undefined) break
          for (const sq of resolveTarget(act.target, bound, ctx, cursor)) {
            m.grants.push({
              kind: act.kind,
              square: sq,
              untilPly: plyCount + act.duration,
              ...(act.kind === 'grant_movement' ? { pattern: act.pattern } : {}),
            })
          }
          break
        }
        case 'freeze_piece':
          for (const sq of resolveTarget(act.target, bound, ctx, cursor)) {
            m.frozenUntil[sq] = plyCount + act.plies
          }
          break
        case 'win':
          if (!m.result) {
            m.result = { kind: 'win', winner: act.side === 'mover' ? mover : otherSide(mover), reason: 'win_action' }
          }
          break
        default:
          break // generation-time actions were consumed at E1
      }
    }
  }
  return movedTo
}

/**
 * E4 — walks a piece through `on_enter` at the square it arrived on, following
 * any relocation an effect performs, and returns where it finally stands.
 *
 * Each square's `on_enter` fires at most once per ply. Without that, a pair of
 * squares that throw pieces at each other would bounce one until the depth cap,
 * landing it wherever parity happened to pick rather than where the content
 * said. Once-per-square is what a player would expect, and it makes the cap a
 * backstop rather than the thing that decides the outcome.
 *
 * Board moves and card-driven moves both come through here. A `destroy` on a
 * square has to mean the same thing whether a move or a card put the piece
 * there — the single shared vocabulary (ADR-003) is worth nothing if the
 * pipeline behind it depends on which content kind caused the movement.
 */
function cascadeEnter(
  state: GameState,
  content: ContentSet,
  m: Mutable,
  start: SquareId,
  mover: Side,
): SquareId | null {
  let square = start
  for (let depth = 0; depth < MAX_CASCADE_DEPTH; depth += 1) {
    const here = m.board.get(square)
    if (!here || m.visited.has(square)) break
    m.visited.add(square)
    // The cascade deliberately carries no `chosen` squares: the card's choices
    // were consumed by the card's own actions, and letting a square or piece
    // effect re-read them would silently retarget somebody else's picks.
    const { movedTo } = runEvent(state, content, m, 'on_enter', [square], { square, piece: here }, mover)
    if (!movedTo || movedTo === square) break
    square = movedTo
  }
  return m.board.has(square) ? square : null
}

function materialResult(board: ReadonlyMap<SquareId, PieceOnBoard>): MatchResult {
  let white = 0
  let black = 0
  for (const piece of board.values()) (piece.side === 'white' ? (white += 1) : (black += 1))
  if (white === black) return { kind: 'draw', reason: 'material_cap' }
  return { kind: 'win', winner: white > black ? 'white' : 'black', reason: 'material_cap' }
}

export function apply(state: GameState, action: Action, content: ContentSet): GameState {
  if (describeRejection(state, action, content) !== null) return state

  if (action.kind === 'draft_pick') {
    const side = pendingDraftSide(state)!
    const draft = state.drafts[side]
    return {
      ...state,
      drafts: {
        ...state.drafts,
        [side]: { ...draft, held: [...draft.held, action.cardId], offers: null, draftIndex: draft.draftIndex + 1 },
      },
    }
  }

  const mover = state.sideToMove
  const m: Mutable = {
    board: new Map(state.board),
    visited: new Set<SquareId>(),
    frozenUntil: { ...state.frozenUntil },
    log: [],
    result: null,
    captured: { white: [...state.captured.white], black: [...state.captured.black] },
    arrived: [],
    // Expired entries are dropped here rather than accumulating for the match.
    grants: state.grants.filter((g) => g.untilPly > state.plyCount),
  }
  let movesMade = 0
  let subjectSquare: SquareId | null = null

  if (action.kind === 'move') {
    const piece = m.board.get(action.from)!

    // E2 — origin vacated.
    runEvent(state, content, m, 'on_leave', [action.from], { square: action.from, piece }, mover)

    // E3 — capture. A royal capture short-circuits the whole ply (ADR-012):
    // no later event or layer can resurrect the king, destroy the capturing
    // piece, or award a competing win.
    const occupant = m.board.get(action.to)
    if (occupant) {
      const occupantDef = content.pieces.get(occupant.pieceId)
      removePiece(m, action.to)
      if (occupantDef?.royal === true) {
        m.board.delete(action.from)
        m.board.set(action.to, piece)
        return {
          ...state,
          board: m.board,
          frozenUntil: m.frozenUntil,
          captured: m.captured,
          grants: m.grants,
          plyCount: state.plyCount + 1,
          movesMadeLastPly: 1,
          log: [...m.log, 'on_capture:royal:short-circuit'],
          result: { kind: 'win', winner: mover, reason: 'king_capture' },
          drafts: bumpTurns(state, content, mover),
        }
      }
      runEvent(state, content, m, 'on_capture', [action.to], { square: action.to, piece: occupant }, mover)
    }

    m.board.delete(action.from)
    m.board.set(action.to, piece)
    movesMade = 1
    subjectSquare = action.to

    // E4 — destination entered, cascading through relocations.
    m.visited.add(action.from)
    subjectSquare = cascadeEnter(state, content, m, action.to, mover)
  } else {
    // A card play consumes the whole turn and makes no board move (AC-007) —
    // `movesMadeLastPly` stays 0 even when the card relocates a piece, because
    // what the rules count is a move, not a displacement.
    const card = content.skillCards.get(action.cardId)!
    const working: GameState = { ...state, board: m.board, frozenUntil: m.frozenUntil }
    let relocatedTo: SquareId | null = null
    for (const effect of card.effects) {
      const bound: BoundEffect = { layer: 'skill', ownerSquare: null, ownerSide: mover, effect, sourceId: card.id }
      const first = action.targets[0]
      const occupant = first ? m.board.get(first) : undefined
      const subject = first && occupant ? { square: first, piece: occupant } : null
      const ctx: EvalCtx = { state: working, content, mover, subject, chosen: action.targets }
      if (!evalCondition(effect.condition, bound, ctx)) continue
      m.log.push(`on_play:skill:${card.id}`)
      const moved = executeActions(effect.actions, bound, ctx, m, mover, action.targets, working, content, state.plyCount)
      if (moved) relocatedTo = moved
    }
    // A card that puts a piece on a square enters that square, with everything
    // entering a square entails. Skipping this made a warp the one way to walk
    // onto a hostile square unharmed — a hole in the content vocabulary that
    // no card author could see, and one no rule card could patch.
    if (relocatedTo) subjectSquare = cascadeEnter(state, content, m, relocatedTo, mover)
  }

  // Anything that APPEARED this ply enters its square too (G-6). A revived or
  // spawned piece that skipped this would make creation the one safe way onto a
  // hostile square, which is the same hole card-driven movement had.
  for (const square of m.arrived) {
    if (!m.visited.has(square)) cascadeEnter(state, content, m, square, mover)
  }

  // E5 — promotion, from the piece's own definition. Reached the same way from
  // either branch: landing on the promotion rank is a fact about the square, not
  // about how the piece got there.
  if (subjectSquare) {
    const landed = m.board.get(subjectSquare)!
    const def = content.pieces.get(landed.pieceId)
    if (def?.promotion) {
      const { rank } = coords(subjectSquare)
      const fromMover = landed.side === 'white' ? rank : state.height - 1 - rank
      const target = def.promotion.onRank === 'last' ? state.height - 1 : def.promotion.onRank - 1
      if (fromMover === target) m.board.set(subjectSquare, { ...landed, pieceId: def.promotion.to })
    }
    runEvent(state, content, m, 'on_promote', [subjectSquare], { square: subjectSquare, piece: m.board.get(subjectSquare)! }, mover)
  }

  // E6 — deferred removals (none produced yet; the hook keeps the order fixed).
  runEvent(state, content, m, 'on_remove', null, null, mover)

  // The check tally is settled BEFORE E7 runs, so a rule card reading
  // `check_count_at_least` on the ply that delivers the third check sees three,
  // not two. A counter updated after the event it gates is always one late.
  const settled: GameState = { ...state, board: m.board, frozenUntil: m.frozenUntil }
  const delivered = sideInCheck(settled, content, otherSide(mover))
  const checkCount = delivered
    ? { ...state.checkCount, [mover]: state.checkCount[mover] + 1 }
    : state.checkCount

  // E7 — end of ply. Win actions resolve here; the ply cap is evaluated last and
  // therefore always loses to a `win` action on the same ply.
  const subject = subjectSquare && m.board.get(subjectSquare) ? { square: subjectSquare, piece: m.board.get(subjectSquare)! } : null
  runEvent({ ...state, checkCount }, content, m, 'end_of_ply', null, subject, mover)

  const plyCount = state.plyCount + 1
  let result = m.result
  // ADR-012 amendment 4 — a side with no royal has lost, however it lost it.
  //
  // The short-circuit at E3 covers CAPTURE, which is the only way a king could
  // leave the board when that rule was written. It is not any more: any content
  // carrying `destroy_piece` can name a royal, and a card in the shipped set
  // does exactly that. Removed rather than captured, the king left
  // no result behind — so the match continued with one side unable to lose by
  // king capture and the other unable to win by it, all the way to the ply cap.
  // Found by the AC-013 invariant walk, which is the only thing that plays the
  // line where a card destroys a king.
  //
  // Evaluated after effects resolve and before the cap, so a `win` action on
  // the same ply keeps its precedence and the cap still loses to both.
  //
  // Judged as a TRANSITION — had a royal at the start of the ply, has none at
  // the end — rather than against the board definition. Content may ship a
  // royal-less side (a puzzle position, and `createPosition` builds exactly
  // those for the editor preview), and such a side must not lose at ply one for
  // a king it never had. Reading the board definition got that wrong; reading
  // the ply's own before/after cannot.
  if (!result) {
    const lost = (['white', 'black'] as const).filter(
      (side) => hasRoyal(state.board, content, side) && !hasRoyal(m.board, content, side),
    )
    if (lost.length === 2) result = { kind: 'draw', reason: 'king_capture' }
    else if (lost.length === 1) result = { kind: 'win', winner: otherSide(lost[0]!), reason: 'king_capture' }
  }
  if (!result && plyCount >= PLY_CAP) result = materialResult(m.board)

  return {
    ...state,
    board: m.board,
    frozenUntil: m.frozenUntil,
    captured: m.captured,
    grants: m.grants,
    checkCount,
    plyCount,
    sideToMove: otherSide(mover),
    movesMadeLastPly: movesMade,
    log: m.log,
    result,
    drafts: bumpTurns(state, content, mover, action.kind === 'play_card' ? action.cardId : null),
  }
}

/**
 * Records the completed turn and opens the second draft on turn six (AC-006).
 *
 * The offer excludes every card this side already holds AND every card it was
 * ever offered, so a re-roll cannot resurface a card the player passed on.
 * It is drawn from the (seed, player, draftIndex) substream, never from board
 * state — that independence is what the AC-006 bias test pins.
 */
function bumpTurns(state: GameState, content: ContentSet, mover: Side, usedCard: string | null = null): GameState['drafts'] {
  const draft = state.drafts[mover]
  const completedTurns = draft.completedTurns + 1

  let offers = draft.offers
  let everOffered = draft.everOffered
  if (completedTurns === SECOND_DRAFT_AFTER_TURNS && draft.draftIndex === 1 && offers === null) {
    const preset = content.presets.get(state.presetId)
    const pool = (preset?.skillCardIds ?? []).filter((id) => !draft.everOffered.includes(id) && !draft.held.includes(id))
    const drawn = pickDistinct(rngFor(state.seed, 'draft', mover, draft.draftIndex), pool, DRAFT_OFFER_SIZE)
    // AC-005 fixes an offer at three distinct cards, so a pool that cannot fill
    // one yields NO second offer. Not a short offer, and above all not an empty
    // one: an empty offer still gates board play, which leaves the match with no
    // legal action and no result. A preset with a small card pool is legal
    // content, so this absent case is reachable from valid input, not a bug in
    // the caller.
    if (drawn.length === DRAFT_OFFER_SIZE) {
      offers = drawn
      everOffered = [...draft.everOffered, ...drawn]
    }
  }

  return {
    ...state.drafts,
    [mover]: {
      ...draft,
      completedTurns,
      offers,
      everOffered,
      used: usedCard ? [...draft.used, usedCard] : draft.used,
    },
  }
}

// ---------------------------------------------------------------------------
// Serialization (AC-013)
// ---------------------------------------------------------------------------

export function serializeState(state: GameState): string {
  return JSON.stringify({ ...state, board: [...state.board.entries()] })
}

export function deserializeState(json: string): GameState {
  const raw = JSON.parse(json) as Omit<GameState, 'board'> & { board: Array<[SquareId, PieceOnBoard]> }
  return { ...raw, board: new Map(raw.board) }
}

/** Per-player view (ADR-004) — the seam a future fog rule needs. */
export function viewFor(state: GameState, _side: Side): GameState {
  return state
}
