import { describe, expect, it } from 'vitest'
import { loadBundledContent } from '@content/sets/bundled'
import { legalActions } from '@engine/engine'
import { createMatch, createPosition, currentState } from '@engine/match'

const content = loadBundledContent()
const PRESET = 'preset.colossus'

describe('12x12 colossus board', () => {
  it('ships a full 12-file army with two bishops per side', () => {
    const state = currentState(createMatch({ content, presetId: PRESET, seed: 101 }))
    const board = content.boards.get('board.colossus')!
    const bishops = [...state.board.values()].filter((piece) => piece.pieceId === 'piece.bishop')

    expect(board.width).toBe(12)
    expect(board.height).toBe(12)
    expect(board.territoryDepth).toBe(6)
    expect(board.placements).toHaveLength(48)
    expect(bishops).toHaveLength(4)
    expect(board.zones.white_promotion).toHaveLength(12)
    expect(board.zones.black_promotion).toHaveLength(12)
  })

  it('uses board-relative bounds and diagonal bishop movement', () => {
    const state = createPosition({
      content,
      presetId: PRESET,
      seed: 102,
      sideToMove: 'white',
      placements: [
        { square: 'a1', pieceId: 'piece.king', side: 'white' },
        { square: 'c3', pieceId: 'piece.bishop', side: 'white' },
        { square: 'l12', pieceId: 'piece.king', side: 'black' },
      ],
    })
    const moves = legalActions(state, content).filter((action) => action.kind === 'move' && action.from === 'c3')

    expect(moves.some((action) => action.kind === 'move' && action.to === 'd4')).toBe(true)
    expect(moves.some((action) => action.kind === 'move' && action.to === 'b4')).toBe(true)
    expect(moves.some((action) => action.kind === 'move' && action.to === 'c4')).toBe(false)
  })
})
