import type { ContentSource, ValidationError } from '@content/load'
import { loadContentSet } from '@content/load'
import { legalActions } from '@engine/engine'
import { squareId, type GameState, type PieceOnBoard, type Side, type SquareId } from '@engine/types'
import { useMemo } from 'react'
import type { Translate } from './i18n'

/**
 * Where the piece the child is drawing can actually go.
 *
 * The whole point is that this asks the ENGINE (ADR-032). Computing
 * destinations from the grid model here would be simpler and faster, and it
 * would drift from the engine's own generator the first time either side
 * changed — and it would make AC-006's oracle circular, since the preview would
 * then be checked against the same arithmetic it performs. So the draft is
 * spliced into a scratch document, run through the same validator the save path
 * runs, and handed to `legalActions`.
 *
 * Phase 3's exit criterion greps this file for the generator's own vocabulary
 * and expects nothing. Keep it that way: if a term from it belongs in a comment
 * here, say it in words instead.
 *
 * The board here is a fixed 7x7 with the piece at the centre, NOT the room's
 * board. A radius-3 grid does not fit on 6x6 from most squares, and a preview
 * that clipped half of what the child drew would teach them their piece is
 * broken when it is the frame that is small.
 */

export const PREVIEW_SIZE = 7
/**
 * Stem of the probe's id, resolved to a FREE id per document.
 *
 * Two rules the loader enforces, and the second was learned the expensive way:
 * an id must read `<kind>.<slug>` (a decorated name like `piece.__preview__` is
 * refused, and the refusal arrives as a validation error about a field the child
 * never touched), and no two records may share one. A fixed probe id satisfies
 * the first and silently violates the second: an imported document that happens
 * to carry a piece with this id makes the scratch set fail to load, so the
 * preview shows its "cannot show this" refusal for every piece in that document,
 * forever. Rare, invisible, and permanent — so the id is derived instead.
 */
const PROBE_STEM = 'piece.preview-probe'

/** The probe id this document leaves free. Exported for tests, not for callers. */
export function probeIdFor(source: ContentSource): string {
  const taken = new Set(
    (source.pieces as unknown[]).flatMap((r) => {
      const id = (r as { id?: unknown }).id
      return typeof id === 'string' ? [id] : []
    }),
  )
  if (!taken.has(PROBE_STEM)) return PROBE_STEM
  for (let n = 2; ; n += 1) {
    const candidate = `${PROBE_STEM}-${n}`
    if (!taken.has(candidate)) return candidate
  }
}

/** Centre of the preview board — d4. */
export const PREVIEW_ORIGIN: SquareId = squareId(3, 3)
/** An enemy two squares north: a slide that way stops here and takes. */
export const PREVIEW_ENEMY: SquareId = squareId(3, 5)
/** A friendly two squares east: a slide that way stops BEFORE it. */
export const PREVIEW_FRIEND: SquareId = squareId(5, 3)

export interface PreviewResult {
  /** Destinations onto an empty square. */
  move: SquareId[]
  /** Destinations onto the enemy. */
  capture: SquareId[]
  /** Why there is nothing to show, when there is nothing to show. */
  errors: ValidationError[]
}

const EMPTY: PreviewResult = { move: [], capture: [], errors: [] }

/**
 * A document carrying nothing of the draft but its movement.
 *
 * Deliberately narrow. A preview built from the whole draft would light up with
 * "nameKey is required" while the child is halfway through typing a name — an
 * error about the record, surfaced by the control for its movement. Phase 4's
 * live validation is the place that reports the draft as a whole.
 */
function previewSource(
  source: ContentSource,
  draft: Record<string, unknown>,
): { scratch: ContentSource; partner: string; probe: string } | null {
  const scratch = structuredClone(source) as ContentSource & {
    pieces: unknown[]
    boards: Array<Record<string, unknown>>
    presets: Array<Record<string, unknown>>
  }
  const board = scratch.boards[0]
  const preset = scratch.presets[0]
  if (!board || !preset) return null

  const donor = (scratch.pieces as Array<Record<string, unknown>>)[0]
  if (!donor) return null

  const probeId = probeIdFor(source)
  const probe: Record<string, unknown> = {
    id: probeId,
    nameKey: donor.nameKey,
    textKey: donor.textKey,
    artKey: donor.artKey,
    movement: draft.movement,
    effects: [],
  }
  if (draft.attack !== undefined) probe.attack = draft.attack

  scratch.pieces.push(probe)

  // The two neighbours are an EXISTING piece from the document rather than a
  // synthesised one. They never move — only the subject's actions are read — so
  // they need no movement of their own, and not writing one keeps every
  // reachability primitive out of this file (ADR-032).
  const partner = String(donor.id)

  // A bare frame: no portals, no painted squares. A destination the piece
  // cannot reach must be its own pattern's doing, not a square effect's.
  board.width = PREVIEW_SIZE
  board.height = PREVIEW_SIZE
  board.squares = []
  preset.pieceIds = [...(preset.pieceIds as string[]), probeId]
  return { scratch: scratch as ContentSource, partner, probe: probeId }
}

function previewState(
  width: number,
  height: number,
  side: Side,
  presetId: string,
  boardId: string,
  partner: string,
  probe: string,
): GameState {
  const board = new Map<SquareId, PieceOnBoard>([
    [PREVIEW_ORIGIN, { pieceId: probe, side }],
    [PREVIEW_ENEMY, { pieceId: partner, side: side === 'white' ? 'black' : 'white' }],
    [PREVIEW_FRIEND, { pieceId: partner, side }],
  ])
  const noDraft = { held: [], used: [], offers: null, everOffered: [], completedTurns: 0, draftIndex: 2 }
  return {
    width,
    height,
    plyCount: 0,
    sideToMove: side,
    board,
    presetId,
    boardId,
    seed: 1,
    ruleCardId: null,
    // No card is mid-resolution: this is a scratch position built to ask where
    // one piece may go, not a turn anybody is taking.
    turnCard: null,
    drafts: { white: { ...noDraft }, black: { ...noDraft } },
    result: null,
    movesMadeLastPly: 0,
    frozenUntil: {},
    checkCount: { white: 0, black: 0 },
    captured: { white: [], black: [] },
    grants: [],
    log: [],
  }
}

/** What the engine says the draft piece may do, from the centre of a bare 7x7. */
export function previewReach(source: ContentSource, draft: Record<string, unknown>): PreviewResult {
  const built = previewSource(source, draft)
  if (!built) return EMPTY
  const { scratch, partner, probe } = built

  const loaded = loadContentSet(scratch)
  if (!loaded.ok) {
    // The probe's own complaints come first, because those are the ones the
    // grid can act on. But a failure elsewhere in the document still has to
    // surface SOMETHING: returning empty marks and an empty error list would
    // render as "your piece goes nowhere", which is a different claim and a
    // false one. An empty board with no explanation is the failure this branch
    // exists to refuse.
    const own = loaded.errors.filter((e) => e.contentId === probe)
    return { ...EMPTY, errors: own.length > 0 ? own : loaded.errors }
  }

  const presetId = [...loaded.set.presets.keys()][0]
  const boardId = [...loaded.set.boards.keys()][0]
  if (presetId === undefined || boardId === undefined) return EMPTY

  const state = previewState(PREVIEW_SIZE, PREVIEW_SIZE, 'white', presetId, boardId, partner, probe)
  const move: SquareId[] = []
  const capture: SquareId[] = []
  for (const action of legalActions(state, loaded.set)) {
    if (action.kind !== 'move' || action.from !== PREVIEW_ORIGIN) continue
    if (action.to === PREVIEW_ENEMY) capture.push(action.to)
    else move.push(action.to)
  }
  return { move: move.sort(), capture: capture.sort(), errors: [] }
}

export interface PiecePreviewProps {
  source: ContentSource
  draft: Record<string, unknown>
  t: Translate
}

export function PiecePreview({ source, draft, t }: PiecePreviewProps) {
  // Keyed on the two fields the probe actually reads. Without this the whole
  // document is cloned and revalidated on every render — including renders
  // caused by typing in the NAME field, which the preview does not depend on at
  // all. That showed up as real latency, not theory: under a parallel e2e run
  // the editor became slow enough that an assertion five seconds after a content
  // import timed out.
  const key = JSON.stringify([draft.movement, draft.attack])
  const reach = useMemo(
    () => previewReach(source, draft),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [source, key],
  )
  const moves = new Set(reach.move)
  const captures = new Set(reach.capture)

  const ranks = [...Array(PREVIEW_SIZE).keys()].reverse()
  const files = [...Array(PREVIEW_SIZE).keys()]

  return (
    <div className="piece-preview" data-testid="piece-preview">
      <span className="kicker">{t('ui.editor.piece.preview')}</span>
      <p className="hint">{t('ui.editor.piece.preview-hint')}</p>
      <div className="preview-board">
        {ranks.map((rank) =>
          files.map((file) => {
            const sq = squareId(file, rank)
            const mark = captures.has(sq) ? 'capture' : moves.has(sq) ? 'move' : 'none'
            const occupant =
              sq === PREVIEW_ORIGIN ? 'subject' : sq === PREVIEW_ENEMY ? 'enemy' : sq === PREVIEW_FRIEND ? 'friend' : ''
            return (
              <span
                key={sq}
                className="preview-square"
                data-testid={`preview-square-${sq}`}
                data-mark={mark}
                data-occupant={occupant || undefined}
                aria-label={`${sq} ${t(`ui.editor.piece.preview.${mark}`)}`}
              />
            )
          }),
        )}
      </div>
      {reach.errors.length > 0 && (
        <p className="refusal" data-testid="preview-error">
          {t('ui.editor.piece.preview-broken')}
        </p>
      )}
    </div>
  )
}
