import type { MovePattern } from '@content/schema'

export type Side = 'white' | 'black'

/** Which kind of content owns an effect — the ADR-002 resolution layers. */
export type EffectLayer = 'square' | 'piece' | 'rule' | 'skill'

/**
 * What created a lasting effect (ADR-004).
 *
 * Carried by every structure that outlives the ply that made it, because "which
 * skill did this?" is otherwise unanswerable: by the time a player looks at a
 * frozen piece, the card that froze it may be four turns spent and gone from
 * the hand. The layer is as load-bearing as the id — a freeze from a SQUARE and
 * a freeze from a CARD are identical on the board, and which one it was decides
 * whether the player should walk away or wait it out.
 */
export interface EffectSource {
  /** Record id: a card, a piece, a square type — whatever the layer names. */
  readonly sourceId: string
  readonly layer: EffectLayer
}

/** A frozen square: until when, and what did it. */
export interface FrozenEntry extends EffectSource {
  /** Exclusive: the occupant cannot act while `plyCount < untilPly`. */
  readonly untilPly: number
}

/**
 * A generation-time modifier that outlives the effect that created it (v3).
 *
 * Keyed by square rather than by piece identity, matching `frozenUntil` — the
 * board has no piece ids, so "the piece standing here" is the only handle the
 * engine has. A granted piece that walks away leaves the grant behind, which is
 * the same rule freezing already follows.
 */
export interface ActiveGrant extends EffectSource {
  readonly kind: 'grant_movement' | 'forbid_movement' | 'block_capture'
  readonly square: SquareId
  readonly pattern?: MovePattern
  /** Exclusive: live while `plyCount < untilPly`. */
  readonly untilPly: number
  /**
   * The side this grant is FOR (ADR-004 of PLAN-movement-lock-8x8-and-rule-cards).
   *
   * Grants are keyed by square, not by piece, and that is right for a penalty:
   * a freeze the next occupant inherits is a hazard the board carries. For
   * `block_capture` it inverts — protection outliving the piece it was granted
   * to hands cover to whoever walks in next, including the opponent. Read off
   * the OCCUPANT at creation rather than off the caster, so a card written to
   * shield an enemy piece keeps working.
   *
   * Required on every grant; only `block_capture` reads it today
   * (`forbid_movement` and `grant_movement` carry it unread — Risk 6).
   */
  readonly beneficiarySide: Side
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
  /** Board turns this side has completed. Drives recurring skill awards. */
  completedTurns: number
  /** Next completed-turn boundary at which this side receives one skill card. */
  nextSkillTurn: number
  /** Number of automatic skill awards already attempted for this side. */
  awardCount: number
  /** How many opening drafts this side has resolved (0 or 1). */
  draftIndex: number
}

export type MatchResult =
  | { kind: 'win'; winner: Side; reason: 'king_capture' | 'win_action' | 'material_cap' }
  /**
   * `king_capture` as a DRAW reason is reachable: a single card that destroys
   * one friendly and one enemy piece can name both royals, leaving
   * neither side with a king. Declaring one of them the winner would be a coin
   * flip dressed up as a rule.
   */
  | { kind: 'draw'; reason: 'material_cap' | 'king_capture' }

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
  /**
   * The skill card played THIS turn, or null when none has been (ADR-001).
   *
   * A turn is `[play_card?] → move`: the card resolves without handing the board
   * over, and the move that follows closes the ply. One field answers both
   * questions that shape depends on — "may I still play a card?" (only while
   * this is null) and "am I awaiting a move?" (only while it is not) — and it is
   * what the end-turn escape hatch, the UI and the AI's position key all read.
   *
   * Cleared by every close-out, including the royal-capture short-circuit: a
   * terminal state with a pending card would describe a turn nobody can finish.
   */
  readonly turnCard: string | null
  /** Exact `from>to` royal captures legal before the pending card, if guarded. */
  readonly royalCaptureBaseline: readonly string[] | null
  readonly drafts: Readonly<Record<Side, DraftState>>
  readonly result: MatchResult | null
  /** 0 when the ply was a card play — AC-007's "no board move" observable. */
  readonly movesMadeLastPly: number
  /**
   * square -> until when the occupant cannot act, and what froze it.
   *
   * A bare ply number until ADR-004. Keyed by square rather than by piece
   * identity, matching `grants` — the board has no piece ids, so "the piece
   * standing here" is the only handle the engine has.
   */
  readonly frozenUntil: Readonly<Record<SquareId, FrozenEntry>>
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
  /**
   * The forced pass (ADR-003).
   *
   * Legal only while a card has been played this turn AND no move exists — a
   * card can immobilise the mover's own last piece, and the turn still has to
   * end. Deliberately not a voluntary pass: offering it whenever a card is
   * pending would let a player spend a card and skip their move.
   */
  | { kind: 'end_turn' }

export function otherSide(side: Side): Side {
  return side === 'white' ? 'black' : 'white'
}

export function squareId(file: number, rank: number): SquareId {
  return `${String.fromCharCode(97 + file)}${rank + 1}`
}

export function coords(square: SquareId): { file: number; rank: number } {
  return { file: square.charCodeAt(0) - 97, rank: Number(square.slice(1)) - 1 }
}
