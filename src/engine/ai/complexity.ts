import type { ContentSet } from '@content/load'
import type { BoardDef, MovePattern, PresetDef, TargetFilter } from '@content/schema'
import { boardTurnDistanceFromMax, turningEndpointUpperBound } from '@content/movement'
import { choiceSlotSpecs, type ChoiceSlotSpec } from '../engine'
import { placementsFor } from '../loadout'

/**
 * How expensive this content is to search, and whether that is affordable.
 *
 * Schema validity does not bound computation (ADR-010). A board, a movement
 * pattern or a card's target space can all be authored far past anything that
 * shipped, and a node budget bounds NODES, not TIME — so the response-time
 * constraint has no floor under authored content without something like this.
 *
 * The blow-up is not in the board and not in the pieces. It is in cards: every
 * chosen-target slot multiplies the action list by the number of candidate
 * squares, so a two-slot card on a 6x6 board is already ~1,300 actions at one
 * node and a three-slot card is ~47,000. That product is what this measures,
 * and it is why ADR-007's search-side pruning cannot substitute — pruning picks
 * from a list `legalActions` has already built.
 *
 * The score is a static walk over declarations. It never searches, never
 * applies an action, and never touches a `GameState`; an envelope that cost
 * what it is guarding against would be self-defeating.
 */

export interface ComplexityScore {
  boardArea: number
  /** The widest reach any single piece declares, in squares. */
  maxPieceReach: number
  /** Upper bound on one card's target combinations, over the preset's cards. */
  maxCardCombos: number
  /**
   * Effect ACTIONS declared across the preset's content, summed.
   *
   * The target product is not the only way to make a node expensive, and this
   * is the other one. `effects[].actions[]` is unbounded in the schema, and the
   * engine's effect pipeline walks every declaration on every applied action —
   * so a card with zero chosen targets and two thousand actions scores 1 on the
   * combination term while costing more per node than anything that ships.
   */
  declaredActions: number
  /** The number the envelope compares. */
  total: number
}

/**
 * The affordability bound, calibrated 2026-08-08.
 *
 * **Defined by time, not by the shipped content**: anchoring it to a multiple of
 * the bundled preset would be circular — calibrating the gate against the very
 * content the gate exists to admit.
 *
 * What the calibration actually found is that the cost is not a curve, it is a
 * CLIFF, and the cliff is the number of chosen-target slots on a card. Each slot
 * multiplies the action list by the board area, so on the shipped 6x6:
 *
 *   1 slot ->     36     2 slots ->  1,296     3 slots -> 46,656
 *
 * The shipped preset scores **3,024** (36 squares x 48 reach, plus a 2-slot
 * card's 1,296) and measures a p95 of **1,142 ms** per move at the hardest level
 * and the production node budget — inside the 1,500 ms SLO with room. A third
 * slot is a 15x jump from there in one edit, and nothing between the two is
 * reachable, so the bound sits in the gap rather than at a fitted point.
 *
 * At 20,500 the envelope admits every 2-slot card on boards up to about 10x10
 * (a 10x10 two-slot card scores ~14,800) and refuses the 3-slot cliff. It is
 * corroborated at ONE measured point, not fitted across many — which is exactly
 * why the wall-clock valve exists behind it (ADR-010): the envelope catches the
 * structural blow-up, the valve catches whatever the single point did not
 * predict.
 */
export const COMPLEXITY_BOUND = 20_500

/**
 * How many effect ACTIONS a record declares, across all of its effects.
 *
 * Counted rather than assumed bounded: `effects[].actions[]` has no schema
 * maximum, and the engine walks the whole array on every applied action.
 */
function countActions(record: { effects?: ReadonlyArray<{ actions: readonly unknown[] }> } | undefined): number {
  let total = 0
  for (const effect of record?.effects ?? []) total += effect.actions.length
  return total
}

function reachOfPatterns(patterns: readonly MovePattern[], boardMax: number): number {
  let reach = 0
  for (const pattern of patterns) {
    if (pattern.kind === 'turning_slide') {
      const bound = boardTurnDistanceFromMax(boardMax)
      reach += turningEndpointUpperBound(Math.min(pattern.maxDistance ?? bound, bound))
      continue
    }
    const steps = pattern.kind === 'slide' ? (pattern.maxDistance ?? boardMax) : 1
    reach += pattern.vectors.length * steps
  }
  return reach
}

function targetAcceptsPiece(content: ContentSet, pieceId: string, filter: TargetFilter | undefined): boolean {
  const piece = content.pieces.get(pieceId)
  if (!piece) return false
  if (!filter) return true
  if (filter.kind === 'non_royal') return piece.royal !== true
  if (filter.kind === 'exclude_piece_ids') return !filter.pieceIds.includes(pieceId)
  return filter.pieceIds.includes(pieceId)
}

/**
 * Count authored spawn capacity in the records this preset can reach.
 * Revive is deliberately not added: it returns a captured piece that was
 * already part of the board's material, while spawn is the operation that can
 * increase the simultaneous count beyond the opening position.
 */
function spawnedMaterialHeadroom(content: ContentSet, preset: PresetDef, board: BoardDef, filter: TargetFilter | undefined): number {
  const skillIds = new Set(preset.skillCardIds)
  for (const side of ['white', 'black'] as const) {
    const skillId = preset.loadout?.[side]?.skillCardId
    if (skillId) skillIds.add(skillId)
  }
  const inspect = (record: { effects?: ReadonlyArray<{ actions: readonly unknown[] }> } | undefined): number => {
    let count = 0
    for (const effect of record?.effects ?? []) {
      for (const action of effect.actions) {
        if (
          typeof action === 'object' &&
          action !== null &&
          'kind' in action &&
          action.kind === 'spawn_piece' &&
          'pieceId' in action &&
          typeof action.pieceId === 'string' &&
          targetAcceptsPiece(content, action.pieceId, filter)
        ) count += 1
      }
    }
    return count
  }

  let count = 0
  for (const id of skillIds) count += inspect(content.skillCards.get(id))
  for (const id of preset.ruleCardIds) count += inspect(content.ruleCards.get(id))
  for (const id of preset.pieceIds) count += inspect(content.pieces.get(id))
  for (const square of board.squares) count += inspect(content.squareTypes.get(square.typeId))
  return count
}

/** Largest conservative domain a constrained choice slot can expose on this board. */
function domainOfSlot(content: ContentSet, preset: PresetDef, board: BoardDef, slot: ChoiceSlotSpec): number {
  if (slot.kind === 'empty') {
    if (slot.region === 'local') return Math.min(board.width * board.height, 9)
    if (slot.region === 'own_territory' || slot.region === 'opponent_territory') {
      return Math.min(board.width * board.height, board.width * board.territoryDepth)
    }
    return board.width * board.height
  }

  const target = slot.target
  // An unrestricted chosen target remains board-sized. This preserves the
  // fail-closed behaviour for a newly authored multi-target card: only an
  // explicit schema filter/relation earns the narrower material domain.
  if (!target?.filter && !target?.relation) return board.width * board.height

  // Score every legal position, not only the opening setup. A friendly/enemy
  // slot may see either side's material after captures, spawns, revives, or
  // relocation. Revives restore opening material; authored spawns add the
  // extra simultaneous pieces, so the domain is the larger side's opening
  // material plus that preset's eligible spawn headroom, capped by the board.
  const eligibleForSide = (side: 'white' | 'black') => {
    const placements = placementsFor(board, preset).filter((placement) => placement.side === side)
    const filter = target.filter
    if (filter?.kind === 'non_royal') {
      return placements.filter((placement) => content.pieces.get(placement.pieceId)?.royal !== true).length
    }
    if (filter?.kind === 'exclude_piece_ids') {
      return placements.filter((placement) => !filter.pieceIds.includes(placement.pieceId)).length
    }
    if (filter?.kind === 'allowed_piece_ids') {
      return placements.filter((placement) => filter.pieceIds.includes(placement.pieceId)).length
    }
    return placements.length
  }
  const materialDomain = Math.min(
    board.width * board.height,
    Math.max(eligibleForSide('white'), eligibleForSide('black')) + spawnedMaterialHeadroom(content, preset, board, target.filter),
  )
  if (target.relation?.kind === 'adjacent_to_choice') return Math.min(8, materialDomain || 8)
  return materialDomain || 1
}

/**
 * Scores a preset's content.
 *
 * Every candidate slot is bounded by the board area, which is the worst case a
 * position can present — an upper bound rather than a sample, because the
 * envelope has to hold for every position the content can reach, not for the
 * opening one it was measured at.
 */
export function complexityOf(content: ContentSet, presetId: string): ComplexityScore {
  const preset = content.presets.get(presetId)
  const board = preset ? content.boards.get(preset.boardId) : undefined
  const boardArea = board ? board.width * board.height : 0
  const boardMax = board ? Math.max(board.width, board.height) : 0

  let maxPieceReach = 0
  const pieceIds = new Set(preset?.pieceIds ?? [...content.pieces.keys()])
  for (const slot of [preset?.loadout?.white, preset?.loadout?.black]) {
    if (slot) pieceIds.add(slot.pieceId)
  }
  for (const pieceId of pieceIds) {
    const def = content.pieces.get(pieceId)
    if (!def) continue
    const reach = reachOfPatterns(def.movement, boardMax) + reachOfPatterns(def.attack ?? [], boardMax)
    if (reach > maxPieceReach) maxPieceReach = reach
  }

  let maxCardCombos = 0
  let declaredActions = 0
  const skillIds = new Set(preset?.skillCardIds ?? [])
  if (preset) {
    for (const side of ['white', 'black'] as const) {
      const skillId = preset.loadout?.[side]?.skillCardId
      if (skillId) skillIds.add(skillId)
    }
  }
  for (const cardId of skillIds) {
    const slots = board && preset
      ? choiceSlotSpecs(content, cardId).map((slot) => domainOfSlot(content, preset, board, slot))
      : []
    const combos = slots.reduce((total, domain) => total * domain, 1)
    if (combos > maxCardCombos) maxCardCombos = combos
    declaredActions += countActions(content.skillCards.get(cardId))
  }
  for (const ruleId of preset?.ruleCardIds ?? []) declaredActions += countActions(content.ruleCards.get(ruleId))
  for (const pieceId of pieceIds) declaredActions += countActions(content.pieces.get(pieceId))

  return {
    boardArea,
    maxPieceReach,
    maxCardCombos,
    declaredActions,
    // Move generation scales with squares x reach; card generation with the
    // combination count; the effect pipeline with how much was declared. All
    // three are paid by one `legalActions` + `apply` pair, and the sum is what
    // the search multiplies by its node budget.
    total: boardArea * maxPieceReach + maxCardCombos + declaredActions * boardArea,
  }
}

export interface EnvelopeVerdict {
  ok: boolean
  score: ComplexityScore
  /** Machine-readable reason, or null when the content is admitted. */
  reason: 'card_target_product' | 'piece_reach' | 'board_area' | 'unscoreable' | null
}

/**
 * Whether this content may start a single-player match (AC-011).
 *
 * Refusal names WHICH of the three inputs blew the budget, because "too
 * complex" tells an author nothing about what to change — and this content is
 * theirs, written in an editor this app ships.
 */
export function withinEnvelope(content: ContentSet, presetId: string, bound = COMPLEXITY_BOUND): EnvelopeVerdict {
  const score = complexityOf(content, presetId)

  // A preset or board that does not resolve scores ZERO, and zero is under
  // every bound — so the naive comparison would call unscoreable content the
  // cheapest content there is and wave it through. `empty-collection-is-not-
  // absent`, recorded in this repo: a filter that empties is not the same as a
  // filter that passed. Nothing can be searched without a board, so refuse.
  if (score.boardArea === 0) return { ok: false, score, reason: 'unscoreable' }

  if (score.total <= bound) return { ok: true, score, reason: null }

  // Attribute the overrun to its largest single contributor, in the order a
  // player can act on: cards are editable per card, reach per piece, area only
  // by replacing the board.
  const cardShare = score.maxCardCombos
  const moveShare = score.boardArea * score.maxPieceReach
  if (cardShare >= moveShare) return { ok: false, score, reason: 'card_target_product' }
  if (score.maxPieceReach > score.boardArea) return { ok: false, score, reason: 'piece_reach' }
  return { ok: false, score, reason: 'board_area' }
}
