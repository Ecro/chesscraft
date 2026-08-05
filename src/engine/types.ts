import type { MovePattern } from '@content/schema'

export type Side = 'white' | 'black'

/**
 * A generation-time modifier that outlives the effect that created it (v3).
 *
 * Keyed by square rather than by piece identity, matching `frozenUntil` — the
 * board has no piece ids, so "the piece standing here" is the only handle the
 * engine has. A granted piece that walks away leaves the grant behind, which is
 * the same rule freezing already follows.
 */
export interface ActiveGrant {
  readonly kind: 'grant_movement' | 'forbid_movement' | 'block_capture'
  readonly square: SquareId
  readonly pattern?: MovePattern
  /** Exclusive: live while `plyCount < untilPly`. */
  readonly untilPly: number
}
export type SquareId = string

export interface PieceOnBoard {
  pieceId: string
  side: Side
}

export interface DraftState {
  /** Cards this side has picked. */
  held: string[]
  /** Cards already played (a card is one-shot per `uses`). */
  used: string[]
  /** Open offer, or null when nothing is pending. Board play is gated while non-null. */
  offers: string[] | null
  /** Every card ever offered to this side — the second offer must avoid these. */
  everOffered: string[]
  /** Board plies this side has completed. Drives the turn-6 second draft. */
  completedTurns: number
  /** How many drafts this side has resolved (0, 1 or 2). */
  draftIndex: number
}

export type MatchResult =
  | { kind: 'win'; winner: Side; reason: 'king_capture' | 'win_action' | 'material_cap' }
  | { kind: 'draw'; reason: 'material_cap' }

/**
 * Immutable game state (ADR-004). Every action produces a new value; the match
 * holds the history, which is what makes undo, replay and the AC-013 property
 * walk the same mechanism.
 */
export interface GameState {
  readonly width: number
  readonly height: number
  readonly plyCount: number
  readonly sideToMove: Side
  readonly board: ReadonlyMap<SquareId, PieceOnBoard>
  readonly presetId: string
  readonly boardId: string
  readonly seed: number
  readonly ruleCardId: string | null
  readonly drafts: Readonly<Record<Side, DraftState>>
  readonly result: MatchResult | null
  /** 0 when the ply was a card play — AC-007's "no board move" observable. */
  readonly movesMadeLastPly: number
  /** square -> ply index until which the occupant cannot act. */
  readonly frozenUntil: Readonly<Record<SquareId, number>>
  /**
   * How many times each side has left the opponent in check (schema v2).
   *
   * Base engine state, deliberately NOT owned by the rule card that reads it:
   * `check_count_at_least` is the condition, this is the fact. A second card
   * about checks needs no second counter.
   */
  readonly checkCount: Readonly<Record<Side, number>>
  /**
   * Pieces removed from the board, by the side that lost them. The engine used
   * to discard them, which made every comeback card unauthorable.
   */
  readonly captured: Readonly<Record<Side, readonly string[]>>
  /** Movement modifiers a card left behind, with their expiry ply. */
  readonly grants: readonly ActiveGrant[]
  /** Per-ply resolution trace: which (event, layer) fired, and what was dropped. */
  readonly log: readonly string[]
}

export type Action =
  | { kind: 'move'; from: SquareId; to: SquareId }
  | { kind: 'play_card'; cardId: string; targets: readonly SquareId[] }
  | { kind: 'draft_pick'; cardId: string }

export function otherSide(side: Side): Side {
  return side === 'white' ? 'black' : 'white'
}

export function squareId(file: number, rank: number): SquareId {
  return `${String.fromCharCode(97 + file)}${rank + 1}`
}

export function coords(square: SquareId): { file: number; rank: number } {
  return { file: square.charCodeAt(0) - 97, rank: Number(square.slice(1)) - 1 }
}
