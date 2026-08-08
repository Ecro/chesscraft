/**
 * AC-006 — the preview shows the engine's own legal destinations.
 *
 * The oracle is `legalActions` run against a state this test builds ITSELF, not
 * the one `previewReach` builds. That separation is the whole value: if the
 * preview ever grew its own reachability arithmetic, it would have to agree with
 * the engine on a board it did not choose, and it would not.
 */
import { describe, expect, it } from 'vitest'
import { legalActions } from '@engine/engine'
import { squareId, type GameState, type PieceOnBoard, type SquareId } from '@engine/types'
import { loadContentSet } from '@content/load'
import { bundledContentSource } from '@content/sets/bundled'
import {
  PREVIEW_ENEMY,
  PREVIEW_FRIEND,
  PREVIEW_ORIGIN,
  PREVIEW_SIZE,
  previewReach,
  probeIdFor,
} from '@ui/PiecePreview'

type Rec = Record<string, unknown>

const ROOK: Rec = { movement: [{ kind: 'slide', vectors: [[1, 0], [-1, 0], [0, 1], [0, -1]] }] }
const KNIGHT: Rec = { movement: [{ kind: 'jump', vectors: [[1, 2], [2, 1], [-1, 2], [-2, 1]] }] }
const CAPPED: Rec = { movement: [{ kind: 'slide', vectors: [[0, 1], [1, 0]], maxDistance: 2 }] }
const DIVERGENT: Rec = {
  movement: [{ kind: 'step', vectors: [[0, 1], [0, 2]] }],
  attack: [{ kind: 'step', vectors: [[0, 2]] }],
}

/**
 * The same position, assembled independently of `PiecePreview`'s own builder.
 *
 * Only the three anchor squares are shared, because those ARE the contract —
 * the preview promises a subject at the centre with an enemy north and a friend
 * east, and a test that placed them elsewhere would be checking a different
 * claim.
 */
function oracle(def: Rec): { move: SquareId[]; capture: SquareId[] } {
  const src = structuredClone(bundledContentSource) as {
    pieces: Rec[]
    boards: Rec[]
    presets: Rec[]
    schemaVersion: number
  }
  const donor = src.pieces[0]!
  src.pieces.push({ id: 'piece.oracle', nameKey: donor.nameKey, textKey: donor.textKey, artKey: donor.artKey, ...def, effects: [] })
  src.boards[0]!.width = PREVIEW_SIZE
  src.boards[0]!.height = PREVIEW_SIZE
  src.boards[0]!.squares = []
  src.presets[0]!.pieceIds = [...(src.presets[0]!.pieceIds as string[]), 'piece.oracle']

  const loaded = loadContentSet(src as never)
  if (!loaded.ok) throw new Error(`oracle fixture is invalid: ${JSON.stringify(loaded.errors)}`)

  const board = new Map<SquareId, PieceOnBoard>([
    [PREVIEW_ORIGIN, { pieceId: 'piece.oracle', side: 'white' }],
    [PREVIEW_ENEMY, { pieceId: 'piece.rook', side: 'black' }],
    [PREVIEW_FRIEND, { pieceId: 'piece.rook', side: 'white' }],
  ])
  const noDraft = { held: [], used: [], offers: null, everOffered: [], completedTurns: 0, draftIndex: 2 }
  const state: GameState = {
    width: PREVIEW_SIZE,
    height: PREVIEW_SIZE,
    plyCount: 0,
    sideToMove: 'white',
    board,
    presetId: [...loaded.set.presets.keys()][0]!,
    boardId: [...loaded.set.boards.keys()][0]!,
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

  const move: SquareId[] = []
  const capture: SquareId[] = []
  for (const a of legalActions(state, loaded.set)) {
    if (a.kind !== 'move' || a.from !== PREVIEW_ORIGIN) continue
    if (a.to === PREVIEW_ENEMY) capture.push(a.to)
    else move.push(a.to)
  }
  return { move: move.sort(), capture: capture.sort() }
}

describe('AC-006 — preview marks match the engine', () => {
  it.each([
    ['a rook', ROOK],
    ['a knight', KNIGHT],
    ['a two-square slider', CAPPED],
    ['a divergent piece', DIVERGENT],
  ])('%s', (_label, def) => {
    const got = previewReach(bundledContentSource, def)
    const want = oracle(def)
    expect({ move: got.move, capture: got.capture }).toEqual(want)
    expect(got.errors).toEqual([])
  })

  it('is not vacuous — the rook really does reach and take on this board', () => {
    const rook = previewReach(bundledContentSource, ROOK)
    expect(rook.capture).toEqual([PREVIEW_ENEMY])
    // Blocked BEFORE the friendly two east, so f4 is not a destination.
    expect(rook.move).toContain(squareId(4, 3))
    expect(rook.move).not.toContain(PREVIEW_FRIEND)
    // And it stops AT the enemy rather than passing through it.
    expect(rook.move).not.toContain(squareId(3, 6))
  })

  it('still works on a document that already uses the probe id', () => {
    // Review finding (round 1, P1, cross-model). The probe used to carry a fixed
    // id, so a document that happened to contain a piece with that id made the
    // scratch set fail to load — and the preview then showed its "cannot show
    // this" refusal for EVERY piece in that document, permanently and with no
    // way for the author to discover why.
    const doc = structuredClone(bundledContentSource) as { pieces: Rec[] }
    const donor = doc.pieces[0]!
    const collide = probeIdFor(bundledContentSource)
    doc.pieces.push({ ...structuredClone(donor), id: collide })

    const got = previewReach(doc as never, ROOK)
    expect(got.errors, 'the preview refused a document it should have handled').toEqual([])
    expect(got.capture).toEqual([PREVIEW_ENEMY])
    expect(got.move.length).toBeGreaterThan(0)
    // And the id it picked is genuinely a different one.
    expect(probeIdFor(doc as never)).not.toBe(collide)
  })

  it('keeps stepping the probe id while the document keeps taking them', () => {
    const doc = structuredClone(bundledContentSource) as { pieces: Rec[] }
    const donor = doc.pieces[0]!
    const seen: string[] = []
    for (let n = 0; n < 3; n += 1) {
      const id = probeIdFor(doc as never)
      seen.push(id)
      doc.pieces.push({ ...structuredClone(donor), id })
    }
    expect(new Set(seen).size).toBe(3)
    expect(previewReach(doc as never, ROOK).errors).toEqual([])
  })

  it('reports the draft as unshowable rather than silently showing nothing', () => {
    const broken = previewReach(bundledContentSource, { movement: [] })
    expect(broken.errors.length).toBeGreaterThan(0)
    expect(broken.move).toEqual([])
  })
})
