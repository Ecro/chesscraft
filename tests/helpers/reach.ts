/**
 * Reach fixtures for the piece-maker tests.
 *
 * These build a scratch board and ask the ENGINE where a piece can go. The
 * point is that no test in this area computes reachability itself — a test that
 * re-derived the destination set from the same grid model it is checking would
 * agree with a broken compiler (SPEC AC-001/AC-004/AC-005 oracles).
 *
 * Deliberately NOT shared with `src/ui/PiecePreview.tsx`, which builds its own
 * scratch state. AC-006 compares the preview's rendered marks against a
 * separately-constructed engine call; one shared builder would make that
 * comparison circular.
 */
import { legalActions } from '@engine/engine'
import { squareId, type GameState, type PieceOnBoard, type Side, type SquareId } from '@engine/types'
import type { ContentSet } from '@content/load'
import { contentWith } from './content'

/** A piece record as the maker emits it, before it reaches the schema. */
export interface PieceLike {
  movement: unknown[]
  attack?: unknown[] | undefined
}

export interface ReachOptions {
  /** Board dimensions. Default 9x9 so a radius-3 offset never clips. */
  width?: number
  height?: number
  /** Where the subject stands. Default is the centre of the board. */
  origin?: SquareId
  /** Which side owns it — matters for `forward` mirroring. Default white. */
  side?: Side
  /** Extra occupants, e.g. a blocker on a slide ray or a capturable enemy. */
  occupants?: ReadonlyArray<{ square: SquareId; side: Side }>
}

export interface Reach {
  /** Destinations onto an empty square. */
  quiet: SquareId[]
  /** Destinations onto an enemy piece. */
  captures: SquareId[]
  /** Every destination, sorted — the union the grid claims to depict. */
  all: SquareId[]
}

const SUBJECT = 'piece.subject'
const FILLER = 'piece.filler'

/**
 * Loads a content set carrying `def` as `piece.subject` on a bare board.
 *
 * The reference fixture is the base because it is the only source already known
 * to satisfy every cross-reference the loader checks; the board is then widened
 * and stripped of special squares so nothing but the piece's own patterns can
 * affect where it may go.
 */
export function reachContent(def: PieceLike, width: number, height: number): ContentSet {
  return contentWith((src) => {
    src.pieces.push({
      id: SUBJECT,
      nameKey: 'piece.king.name',
      textKey: 'piece.king.text',
      artKey: 'art.king',
      movement: def.movement,
      ...(def.attack === undefined ? {} : { attack: def.attack }),
      effects: [],
    })
    src.pieces.push({
      id: FILLER,
      nameKey: 'piece.king.name',
      textKey: 'piece.king.text',
      artKey: 'art.king',
      movement: [{ kind: 'step', vectors: [[0, 1]] }],
      effects: [],
    })
    src.boards[0].width = width
    src.boards[0].height = height
    // No portals, no painted squares: a destination the piece cannot reach must
    // be the pattern's fault, not a square effect's.
    src.boards[0].squares = []
    src.presets[0].pieceIds = [...src.presets[0].pieceIds, SUBJECT, FILLER]
  })
}

function firstKey(map: ReadonlyMap<string, unknown>, what: string): string {
  const first = [...map.keys()][0]
  if (first === undefined) throw new Error(`the reach fixture loaded no ${what}`)
  return first
}

function bareState(
  content: ContentSet,
  width: number,
  height: number,
  origin: SquareId,
  side: Side,
  occupants: ReadonlyArray<{ square: SquareId; side: Side }>,
): GameState {
  const board = new Map<SquareId, PieceOnBoard>([[origin, { pieceId: SUBJECT, side }]])
  for (const o of occupants) board.set(o.square, { pieceId: FILLER, side: o.side })
  const emptyDraft = { held: [], used: [], offers: null, everOffered: [], completedTurns: 0, draftIndex: 2 }
  return {
    width,
    height,
    plyCount: 0,
    sideToMove: side,
    board,
    presetId: firstKey(content.presets, 'presets'),
    boardId: firstKey(content.boards, 'boards'),
    seed: 1,
    ruleCardId: null,
    // No card is mid-resolution: this is a scratch position built to ask where
    // one piece may go, not a turn anybody is taking.
    turnCard: null,
    royalCaptureBaseline: null,
    drafts: { white: { ...emptyDraft }, black: { ...emptyDraft } },
    result: null,
    movesMadeLastPly: 0,
    frozenUntil: {},
    checkCount: { white: 0, black: 0 },
    captured: { white: [], black: [] },
    grants: [],
    log: [],
  }
}

/** The centre square of a board, which is where a radius-3 pattern fits. */
export function centreOf(width: number, height: number): SquareId {
  return squareId(Math.floor(width / 2), Math.floor(height / 2))
}

/**
 * Where the engine says a piece carrying `def` may go from `origin`.
 *
 * Throws when the record is not schema-valid — a silent empty reach would make
 * every property in this area vacuously true, which is the failure mode these
 * oracles exist to avoid.
 */
export function reachOf(def: PieceLike, opts: ReachOptions = {}): Reach {
  const width = opts.width ?? 9
  const height = opts.height ?? 9
  const origin = opts.origin ?? centreOf(width, height)
  const side = opts.side ?? 'white'
  const occupants = opts.occupants ?? []

  const content = reachContent(def, width, height)
  const state = bareState(content, width, height, origin, side, occupants)
  const enemies = new Set(occupants.filter((o) => o.side !== side).map((o) => o.square))

  const quiet: SquareId[] = []
  const captures: SquareId[] = []
  for (const action of legalActions(state, content)) {
    if (action.kind !== 'move' || action.from !== origin) continue
    if (enemies.has(action.to)) captures.push(action.to)
    else quiet.push(action.to)
  }
  quiet.sort()
  captures.sort()
  return { quiet, captures, all: [...quiet, ...captures].sort() }
}

/** `"df,dr"` offsets of `squares` relative to `origin`, sorted for comparison. */
export function offsetsFrom(origin: SquareId, squares: readonly SquareId[]): string[] {
  const o = { file: origin.charCodeAt(0) - 97, rank: Number(origin.slice(1)) - 1 }
  return squares
    .map((sq) => `${sq.charCodeAt(0) - 97 - o.file},${Number(sq.slice(1)) - 1 - o.rank}`)
    .sort()
}
