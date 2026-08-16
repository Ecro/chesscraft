import { describe, expect, it } from 'vitest'
import { royalSquaresInCheck, sideInCheck } from '@engine/engine'
import { createPosition } from '@engine/match'
import { shippedContent } from '../helpers/shipped'

const content = shippedContent()

function position(blocker = false) {
  return createPosition({
    content,
    presetId: 'preset.default',
    seed: 41,
    sideToMove: 'white',
    placements: [
      { square: 'a1', pieceId: 'piece.king', side: 'white' },
      ...(blocker ? [{ square: 'a3', pieceId: 'piece.pawn', side: 'white' as const }] : []),
      { square: 'a6', pieceId: 'piece.rook', side: 'black' },
      { square: 'f6', pieceId: 'piece.king', side: 'black' },
    ],
  })
}

describe('royal check indicators', () => {
  it('reports the exact royal square that an enemy line can capture', () => {
    const state = position()
    expect(sideInCheck(state, content, 'white')).toBe(true)
    expect(royalSquaresInCheck(state, content, 'white')).toEqual(['a1'])
    expect(sideInCheck(state, content, 'black')).toBe(false)
  })

  it('does not report a check through a blocking piece', () => {
    const state = position(true)
    expect(royalSquaresInCheck(state, content, 'white')).toEqual([])
    expect(sideInCheck(state, content, 'white')).toBe(false)
  })
})
