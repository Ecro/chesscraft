import type { ContentSet } from '@content/load'
import { DRAFT_OFFER_SIZE } from './engine'
import { placementsFor, skillPoolFor } from './loadout'
import { pickDistinct, rngFor } from './rng'
import type { DraftState, GameState, PieceOnBoard, Side, SquareId } from './types'

/**
 * A match is the immutable state history (ADR-004). Undo pops it; it is NOT a
 * member of `legalActions` (ADR-013), so the self-play agent can never select
 * it and the 60-ply termination bound always holds.
 */
export interface Match {
  readonly states: readonly GameState[]
}

export function currentState(match: Match): GameState {
  return match.states[match.states.length - 1]!
}

/**
 * UI-level history operation. Unavailable once the match has a result.
 *
 * Contextual since ADR-007. A turn is `[play_card?] → move`, so it pushes two
 * states, and a plain pop-one would make taking back a completed turn cost two
 * taps — with the first landing on the OPPONENT's intermediate state, a card
 * played and no move made, which is not a position anyone was ever looking at.
 *
 * So: mid-turn (a card of your own is pending) it retracts the card; otherwise
 * it retracts the whole preceding turn, intermediate state included. One tap is
 * one retraction, and the intermediate state is never a resting place.
 */
export function undo(match: Match): Match {
  const state = currentState(match)
  if (state.result || match.states.length < 2) return match
  const popped = { states: match.states.slice(0, -1) }
  // Mid-turn: one step is exactly the card, and the board is already yours.
  if (state.turnCard !== null) return popped
  // Otherwise step back over the turn — and over its card, if it had one. The
  // guard is `length >= 2` again rather than a blind second pop: a match whose
  // whole history is one turn must still leave its opening state standing.
  const previous = currentState(popped)
  if (previous.turnCard !== null && popped.states.length >= 2) {
    return { states: popped.states.slice(0, -1) }
  }
  return popped
}

function emptyDraft(offers: string[] | null): DraftState {
  return {
    held: [],
    used: [],
    offers,
    everOffered: offers ? [...offers] : [],
    completedTurns: 0,
    nextSkillTurn: 5,
    awardCount: 0,
    draftIndex: offers ? 0 : 1,
  }
}

export interface CreateMatchOptions {
  content: ContentSet
  presetId: string
  seed: number
}

export function createMatch({ content, presetId, seed }: CreateMatchOptions): Match {
  const preset = content.presets.get(presetId)
  if (!preset) throw new Error(`content set has no preset ${presetId}`)
  const board = content.boards.get(preset.boardId)
  if (!board) throw new Error(`content set has no board ${preset.boardId}`)

  // Each domain draws from its own substream (ADR-014), so the agent's choices
  // can never perturb the rule draw or either player's offers.
  const ruleCardId =
    preset.ruleCardIds.length > 0
      ? pickDistinct(rngFor(seed, 'rule-draw'), preset.ruleCardIds, 1)[0] ?? null
      : null

  // The pool is per side from here on (ADR-001) — the substream already was.
  const offersFor = (side: Side) =>
    pickDistinct(rngFor(seed, 'draft', side, 0), skillPoolFor(preset, side), DRAFT_OFFER_SIZE)

  const placed = new Map<SquareId, PieceOnBoard>()
  for (const p of placementsFor(board, preset)) placed.set(p.square, { pieceId: p.pieceId, side: p.side })

  const state: GameState = {
    width: board.width,
    height: board.height,
    plyCount: 0,
    sideToMove: 'white',
    board: placed,
    presetId,
    boardId: board.id,
    seed,
    ruleCardId,
    turnCard: null,
    royalCaptureBaseline: null,
    drafts: { white: emptyDraft(offersFor('white')), black: emptyDraft(offersFor('black')) },
    result: null,
    movesMadeLastPly: 0,
    frozenUntil: {},
    checkCount: { white: 0, black: 0 },
    captured: { white: [], black: [] },
    grants: [],
    log: [],
  }
  return { states: [state] }
}

export interface CreatePositionOptions {
  content: ContentSet
  presetId: string
  seed: number
  sideToMove: Side
  placements: ReadonlyArray<{ square: SquareId; pieceId: string; side: Side }>
  plyCount?: number
  ruleCardId?: string | null
  /** Cards each side already holds. Drafts are pre-resolved, so play is open. */
  held?: Partial<Record<Side, string[]>>
  /** Seeds the graveyard, so a comeback card can be driven without a capture. */
  captured?: Partial<Record<Side, string[]>>
}

/**
 * Builds an arbitrary position with drafts already resolved.
 *
 * This is not test-only scaffolding: the editor's preview needs exactly this —
 * "show me this board with this content, ready to play".
 */
export function createPosition(opts: CreatePositionOptions): GameState {
  const { content, presetId, seed, sideToMove, placements } = opts
  const preset = content.presets.get(presetId)
  if (!preset) throw new Error(`content set has no preset ${presetId}`)
  const board = content.boards.get(preset.boardId)
  if (!board) throw new Error(`content set has no board ${preset.boardId}`)

  const placed = new Map<SquareId, PieceOnBoard>()
  for (const p of placements) placed.set(p.square, { pieceId: p.pieceId, side: p.side })

  const draftFor = (side: Side): DraftState => ({
    ...emptyDraft(null),
    held: [...(opts.held?.[side] ?? [])],
    everOffered: [...(opts.held?.[side] ?? [])],
  })

  return {
    width: board.width,
    height: board.height,
    plyCount: opts.plyCount ?? 0,
    sideToMove,
    board: placed,
    presetId,
    boardId: board.id,
    seed,
    ruleCardId: opts.ruleCardId === undefined ? null : opts.ruleCardId,
    turnCard: null,
    royalCaptureBaseline: null,
    drafts: { white: draftFor('white'), black: draftFor('black') },
    result: null,
    movesMadeLastPly: 0,
    frozenUntil: {},
    checkCount: { white: 0, black: 0 },
    captured: { white: [...(opts.captured?.white ?? [])], black: [...(opts.captured?.black ?? [])] },
    grants: [],
    log: [],
  }
}
