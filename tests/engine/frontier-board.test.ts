import { describe, expect, it } from 'vitest'
import { loadBundledContent } from '@content/sets/bundled'
import { createMatch, currentState } from '@engine/match'

const content = loadBundledContent()

describe('10x10 frontier board', () => {
  it('ships a distinct mid-size room with live side-relative promotion bands', () => {
    const state = currentState(createMatch({ content, presetId: 'preset.frontier', seed: 103 }))
    const board = content.boards.get('board.frontier')!
    const bishops = [...state.board.values()].filter((piece) => piece.pieceId === 'piece.bishop')

    expect(board.width).toBe(10)
    expect(board.height).toBe(10)
    expect(board.territoryDepth).toBe(5)
    expect(board.promotionDepth).toBe(3)
    expect(board.placements).toHaveLength(40)
    expect(bishops).toHaveLength(4)
    expect(board.zones.white_promotion).toHaveLength(10)
    expect(board.zones.black_promotion).toHaveLength(10)
  })
})
