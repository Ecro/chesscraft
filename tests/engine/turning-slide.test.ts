import { describe, expect, it } from 'vitest'
import { legalActions, apply } from '@engine/engine'
import { createPosition } from '@engine/match'
import type { ContentSet } from '@content/load'
import type { MovePattern } from '@content/schema'
import type { GameState } from '@engine/types'
import { referenceContent } from '../helpers/content'

type TurningPattern = {
  kind: 'turning_slide'
  vectors: [[number, number], [number, number]]
  maxDistance?: number
  forward?: boolean
}

type AutomaticTurningPattern = {
  kind: 'turning_slide'
  vectors: [number, number][]
  turn: 'any'
  maxDistance?: number
  forward?: boolean
}

const turning = (overrides: Partial<TurningPattern> = {}): MovePattern =>
  ({
    kind: 'turning_slide',
    vectors: [[1, 0], [0, 1]],
    maxDistance: 4,
    ...overrides,
  } as unknown as MovePattern)

const automatic = (overrides: Partial<AutomaticTurningPattern> = {}): MovePattern =>
  ({
    kind: 'turning_slide',
    vectors: [[1, 0]],
    turn: 'any',
    maxDistance: 2,
    ...overrides,
  } as unknown as MovePattern)

function turningContent(pattern: MovePattern): ContentSet {
  const content = referenceContent()
  const base = content.pieces.get('piece.rook')
  if (!base) throw new Error('reference fixture has no rook')
  content.pieces.set('piece.turner', { ...base, id: 'piece.turner', movement: [pattern] })
  return content
}

function targetsFrom(state: GameState, content: ContentSet, from = 'c3'): string[] {
  return legalActions(state, content)
    .filter((action) => action.kind === 'move' && action.from === from)
    .map((action) => (action.kind === 'move' ? action.to : ''))
    .sort()
}

const kings = [
  { square: 'a1', pieceId: 'piece.king', side: 'white' as const },
  { square: 'f6', pieceId: 'piece.king', side: 'black' as const },
]

describe('turning_slide move generation', () => {
  it('automatically considers every legal second direction after the authored first leg', () => {
    const content = turningContent(automatic())
    const state = createPosition({
      content,
      presetId: 'preset.default',
      seed: 1,
      sideToMove: 'white',
      placements: [{ square: 'c3', pieceId: 'piece.turner', side: 'white' }, ...kings],
    })

    expect(targetsFrom(state, content)).toEqual(['c2', 'c4', 'd2', 'd3', 'd4', 'e2', 'e3', 'e4'])
  })

  it('keeps the automatic bend one-bend and respects blockers on either leg', () => {
    const content = turningContent(automatic({ maxDistance: 4 }))
    const state = createPosition({
      content,
      presetId: 'preset.default',
      seed: 1,
      sideToMove: 'white',
      placements: [
        { square: 'c3', pieceId: 'piece.turner', side: 'white' },
        { square: 'e4', pieceId: 'piece.pawn', side: 'white' },
        ...kings,
      ],
    })

    const targets = targetsFrom(state, content)
    expect(targets).toContain('d4')
    expect(targets).not.toContain('e4')
    expect(targets).not.toContain('f5')
  })

  it('supports multiple authored first-leg vectors without introducing a third leg', () => {
    const content = turningContent(automatic({ vectors: [[1, 0], [0, 1]], maxDistance: 2 }))
    const state = createPosition({
      content,
      presetId: 'preset.default',
      seed: 1,
      sideToMove: 'white',
      placements: [{ square: 'c3', pieceId: 'piece.turner', side: 'white' }, ...kings],
    })

    const targets = targetsFrom(state, content)
    expect(targets).toContain('e3')
    expect(targets).toContain('c5')
    expect(targets).not.toContain('e5')
  })

  it('keeps direct first-leg stops and enumerates every positive one-bend split', () => {
    const content = turningContent(turning())
    const state = createPosition({
      content,
      presetId: 'preset.default',
      seed: 1,
      sideToMove: 'white',
      placements: [{ square: 'c3', pieceId: 'piece.turner', side: 'white' }, ...kings],
    })

    expect(targetsFrom(state, content)).toEqual(['d3', 'd4', 'd5', 'd6', 'e3', 'e4', 'e5', 'f3', 'f4'])
  })

  it('uses ordered vectors and a total cap, so maxDistance 2 yields only 1+1', () => {
    const content = turningContent(turning({ maxDistance: 2, vectors: [[0, 1], [1, 0]] }))
    const state = createPosition({
      content,
      presetId: 'preset.default',
      seed: 1,
      sideToMove: 'white',
      placements: [{ square: 'c3', pieceId: 'piece.turner', side: 'white' }, ...kings],
    })

    expect(targetsFrom(state, content)).toEqual(['c4', 'c5', 'd4'])
  })

  it('enumerates the middle maxDistance 3 split rather than treating caps as binary', () => {
    const content = turningContent(turning({ maxDistance: 3 }))
    const state = createPosition({
      content,
      presetId: 'preset.default',
      seed: 1,
      sideToMove: 'white',
      placements: [{ square: 'c3', pieceId: 'piece.turner', side: 'white' }, ...kings],
    })

    expect(targetsFrom(state, content)).toEqual(['d3', 'd4', 'd5', 'e3', 'e4', 'f3'])
  })

  it('mirrors both legs for a black forward pattern', () => {
    const content = turningContent(turning({ maxDistance: 2, vectors: [[0, 1], [1, 0]], forward: true }))
    const state = createPosition({
      content,
      presetId: 'preset.default',
      seed: 1,
      sideToMove: 'black',
      placements: [
        { square: 'c3', pieceId: 'piece.turner', side: 'black' },
        { square: 'a1', pieceId: 'piece.king', side: 'white' },
        { square: 'f6', pieceId: 'piece.king', side: 'black' },
      ],
    })

    expect(
      legalActions(state, content)
        .filter((action) => action.kind === 'move' && action.from === 'c3')
        .map((action) => (action.kind === 'move' ? action.to : ''))
        .sort(),
    ).toEqual(['c1', 'c2', 'd2'])
  })

  it('stops at a friendly intermediate square and never turns around it', () => {
    const content = turningContent(turning())
    const state = createPosition({
      content,
      presetId: 'preset.default',
      seed: 1,
      sideToMove: 'white',
      placements: [
        { square: 'c3', pieceId: 'piece.turner', side: 'white' },
        { square: 'e4', pieceId: 'piece.pawn', side: 'white' },
        ...kings,
      ],
    })

    const targets = targetsFrom(state, content)
    expect(targets).toEqual(['d3', 'd4', 'd5', 'd6', 'e3', 'f3', 'f4'])
    expect(targets).not.toContain('e4')
    expect(targets).not.toContain('e5')
  })

  it('stops each leg at the board edge without emitting off-board destinations', () => {
    const content = turningContent(turning())
    const state = createPosition({
      content,
      presetId: 'preset.default',
      seed: 1,
      sideToMove: 'white',
      placements: [
        { square: 'e3', pieceId: 'piece.turner', side: 'white' },
        { square: 'a1', pieceId: 'piece.king', side: 'white' },
        { square: 'a6', pieceId: 'piece.king', side: 'black' },
      ],
    })

    expect(targetsFrom(state, content, 'e3')).toEqual(['f3', 'f4', 'f5', 'f6'])
  })

  it('captures a first-leg enemy but cannot continue past it', () => {
    const content = turningContent(turning())
    const state = createPosition({
      content,
      presetId: 'preset.default',
      seed: 1,
      sideToMove: 'white',
      placements: [
        { square: 'c3', pieceId: 'piece.turner', side: 'white' },
        { square: 'd3', pieceId: 'piece.pawn', side: 'black' },
        ...kings,
      ],
    })

    expect(targetsFrom(state, content)).toEqual(['d3'])
  })

  it('captures only the final enemy square and keeps the existing move action shape', () => {
    const content = turningContent(turning())
    const state = createPosition({
      content,
      presetId: 'preset.default',
      seed: 1,
      sideToMove: 'white',
      placements: [
        { square: 'c3', pieceId: 'piece.turner', side: 'white' },
        { square: 'e4', pieceId: 'piece.pawn', side: 'black' },
        ...kings,
      ],
    })

    const action = legalActions(state, content).find((candidate) => candidate.kind === 'move' && candidate.from === 'c3' && candidate.to === 'e4')
    expect(action).toEqual({ kind: 'move', from: 'c3', to: 'e4' })
    const after = apply(state, action!, content)
    expect(after.board.get('e4')?.side).toBe('white')
    expect(after.board.get('e4')?.pieceId).toBe('piece.turner')
  })
})
