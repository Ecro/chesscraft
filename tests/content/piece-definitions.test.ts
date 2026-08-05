import { describe, expect, it } from 'vitest'
import { apply, legalActions } from '@engine/engine'
import { createPosition } from '@engine/match'
import { contentWith, referenceContent } from '../helpers/content'

const content = referenceContent()

/** Squares a piece standing alone on c3 can move to. */
function targetsFrom(pieceId: string, square: string, set = content, extra: Parameters<typeof createPosition>[0]['placements'] = []) {
  const state = createPosition({
    content: set,
    presetId: 'preset.default',
    seed: 1,
    sideToMove: 'white',
    placements: [
      { square, pieceId, side: 'white' },
      { square: 'f1', pieceId: 'piece.king', side: 'white' },
      { square: 'f6', pieceId: 'piece.king', side: 'black' },
      ...extra,
    ],
  })
  return {
    state,
    targets: legalActions(state, set)
      .filter((a) => a.kind === 'move' && a.from === square)
      .map((a) => (a.kind === 'move' ? a.to : ''))
      .sort(),
  }
}

const sorted = (s: string) => s.split(' ').sort()

/**
 * AC-009 — a piece is fully defined by content data.
 *
 * Target lists are computed by hand from 6x6 geometry and written here before
 * the generator exists. No engine source names any of these pieces.
 */
describe('AC-009 piece definitions drive move generation', () => {
  it('rook on c3', () => {
    expect(targetsFrom('piece.rook', 'c3').targets).toEqual(sorted('c1 c2 c4 c5 c6 a3 b3 d3 e3 f3'))
  })

  it('knight on c3', () => {
    expect(targetsFrom('piece.knight', 'c3').targets).toEqual(sorted('a2 a4 b1 b5 d1 d5 e2 e4'))
  })

  it('queen on c3', () => {
    // Orthogonals plus all four diagonals; f6 is the black king, a legal
    // capture that also stops the slide.
    expect(targetsFrom('piece.queen', 'c3').targets).toEqual(
      sorted('c1 c2 c4 c5 c6 a3 b3 d3 e3 f3 a1 b2 d4 e5 f6 a5 b4 d2 e1'),
    )
  })

  it('white pawn on c3 moves one rank forward', () => {
    expect(targetsFrom('piece.pawn', 'c3').targets).toEqual(['c4'])
  })

  it('archer moves as a king but captures at orthogonal distance 2', () => {
    // Movement pattern: the eight adjacent squares.
    expect(targetsFrom('piece.archer', 'c3').targets).toEqual(sorted('b2 b3 b4 c2 c4 d2 d3 d4'))

    // Attack pattern differs: a2 is not a movement target, but it is capturable.
    const { state } = targetsFrom('piece.archer', 'c3', content, [
      { square: 'a3', pieceId: 'piece.rook', side: 'black' },
      { square: 'b3', pieceId: 'piece.rook', side: 'black' },
    ])
    const moves = legalActions(state, content).filter((a) => a.kind === 'move' && a.from === 'c3')
    const captures = moves.filter((a) => a.kind === 'move' && state.board.has(a.to))
    expect(captures.map((c) => (c.kind === 'move' ? c.to : ''))).toContain('a3')
    // b3 is adjacent, so it is a movement target — but movement cannot capture.
    expect(captures.map((c) => (c.kind === 'move' ? c.to : ''))).not.toContain('b3')
  })

  it('honours a passive that blocks capture of adjacent friendly pieces', () => {
    const state = createPosition({
      content,
      presetId: 'preset.default',
      seed: 1,
      sideToMove: 'black',
      placements: [
        { square: 'c3', pieceId: 'piece.archer', side: 'white' },
        { square: 'c4', pieceId: 'piece.pawn', side: 'white' },
        { square: 'c6', pieceId: 'piece.rook', side: 'black' },
        { square: 'a1', pieceId: 'piece.king', side: 'white' },
        { square: 'f6', pieceId: 'piece.king', side: 'black' },
      ],
    })
    const rookTargets = legalActions(state, content)
      .filter((a) => a.kind === 'move' && a.from === 'c6')
      .map((a) => (a.kind === 'move' ? a.to : ''))
    // c4 is adjacent to the archer on c3, so it cannot be captured.
    expect(rookTargets).not.toContain('c4')
    expect(rookTargets).toContain('c5')
  })
})

/**
 * Promotion is a distinct interpreter path and a common place for built-in pawn
 * assumptions to leak into engine code, so a *custom* promotion rule is tested.
 */
describe('AC-009 promotion comes from the definition, not the engine', () => {
  const withCustomPromotion = contentWith((src) => {
    src.pieces.push({
      id: 'piece.scout',
      nameKey: 'piece.scout.name',
      textKey: 'piece.scout.text',
      movement: [{ kind: 'step', vectors: [[0, 1]], forward: true }],
      // Promotes early — on rank 4 of 6 — and into a knight, not a queen.
      promotion: { onRank: 4, to: 'piece.knight' },
      effects: [],
    } as never)
    src.presets[0]!.pieceIds.push('piece.scout')
  })

  it('promotes on the declared rank into the declared piece', () => {
    const state = createPosition({
      content: withCustomPromotion,
      presetId: 'preset.default',
      seed: 1,
      sideToMove: 'white',
      placements: [
        { square: 'c3', pieceId: 'piece.scout', side: 'white' },
        { square: 'a1', pieceId: 'piece.king', side: 'white' },
        { square: 'f6', pieceId: 'piece.king', side: 'black' },
      ],
    })
    const step = legalActions(state, withCustomPromotion).find((a) => a.kind === 'move' && a.to === 'c4')!
    const after = apply(state, step, withCustomPromotion)
    expect(after.board.get('c4')?.pieceId).toBe('piece.knight')
  })

  it('does not promote a piece whose definition declares no promotion', () => {
    const { state } = targetsFrom('piece.rook', 'c5')
    const toLastRank = legalActions(state, content).find((a) => a.kind === 'move' && a.to === 'c6')!
    expect(apply(state, toLastRank, content).board.get('c6')?.pieceId).toBe('piece.rook')
  })
})
