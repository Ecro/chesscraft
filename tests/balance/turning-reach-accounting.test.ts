import { describe, expect, it } from 'vitest'
import { loadContentSet } from '@content/load'
import { automaticTurningEndpointUpperBound, boardTurnDistanceFromMax, turningEndpointUpperBound } from '@content/movement'
import { patternReach, pieceCost } from '@balance/cost'
import { pieceValue } from '@engine/ai/evaluate'
import { complexityOf } from '@engine/ai/complexity'
import type { ContentSource } from '@content/load'
import type { MovePattern } from '@content/schema'
import { BUNDLED_BOARD_ID, BUNDLED_PRESET_ID, bundledContentSource } from '@content/sets/bundled'

const turning = (maxDistance?: number): MovePattern => ({
  kind: 'turning_slide',
  vectors: [
    [1, 0],
    [0, 1],
  ],
  ...(maxDistance === undefined ? {} : { maxDistance }),
})

const automatic = (maxDistance?: number): MovePattern => ({
  kind: 'turning_slide',
  vectors: [[1, 0]],
  turn: 'any',
  ...(maxDistance === undefined ? {} : { maxDistance }),
})

function contentWith(pattern: MovePattern) {
  const source: ContentSource = {
    schemaVersion: 16,
    pieces: [
      {
        id: 'piece.turner',
        nameKey: 'piece.turner.name',
        textKey: 'piece.turner.text',
        movement: [pattern],
        effects: [],
      },
    ],
    squareTypes: [],
    ruleCards: [],
    skillCards: [],
    boards: [
      {
        id: 'board.turner',
        nameKey: 'board.turner.name',
        width: 4,
        height: 4,
        territoryDepth: 2,
        promotionDepth: 1,
        zones: {},
        placements: [],
        squares: [],
      },
    ],
    presets: [
      {
        id: 'preset.turner',
        nameKey: 'preset.turner.name',
        boardId: 'board.turner',
        pieceIds: ['piece.turner'],
        ruleCardIds: [],
        skillCardIds: [],
      },
    ],
  }
  const result = loadContentSet(source)
  if (!result.ok) throw new Error(JSON.stringify(result.errors))
  return result.set
}

describe('turning movement accounting uses one triangular upper bound', () => {
  it('matches the direct-plus-positive-splits table and boardMax conversion', () => {
    expect([2, 3, 4].map(turningEndpointUpperBound)).toEqual([3, 6, 10])
    expect(boardTurnDistanceFromMax(1)).toBe(2)
    expect(boardTurnDistanceFromMax(3)).toBe(4)
    expect(patternReach([turning(2)], 8)).toBe(3)
    expect(patternReach([turning(3)], 8)).toBe(6)
    expect(patternReach([turning(4)], 8)).toBe(10)
    expect(patternReach([turning()], 3)).toBe(10)

    const uncapped = contentWith(turning())
    expect(pieceValue(uncapped, 'piece.turner', 4)).toBe(turningEndpointUpperBound(6) * 25)
    expect(complexityOf(uncapped, 'preset.turner').maxPieceReach).toBe(turningEndpointUpperBound(6))
  })

  it('uses the six-way automatic bound and authored first-vector count', () => {
    expect(patternReach([automatic(2)], 8)).toBe(8)
    expect(patternReach([{ ...automatic(2), vectors: [[1, 0], [0, 1]] }], 8)).toBe(16)
    const content = contentWith(automatic(2))
    expect(pieceValue(content, 'piece.turner', 4)).toBe(automaticTurningEndpointUpperBound(2) * 25)
    expect(complexityOf(content, 'preset.turner').maxPieceReach).toBe(automaticTurningEndpointUpperBound(2))
  })

  it('keeps cost, AI value, and complexity on the same cap table', () => {
    const shipped = loadContentSet(bundledContentSource)
    expect(shipped.ok).toBe(true)
    if (!shipped.ok) return
    const shippedBoard = shipped.set.boards.get(BUNDLED_BOARD_ID)!
    expect(pieceCost(shipped.set.pieces.get('piece.queen')!, shippedBoard)).toBe(120)
    expect(pieceValue(shipped.set, 'piece.queen', 6)).toBe(1200)
    expect(complexityOf(shipped.set, BUNDLED_PRESET_ID).maxPieceReach).toBe(48)

    const straightContent = contentWith({ kind: 'slide', vectors: [[0, 1]], maxDistance: 2 })
    expect(patternReach([{ kind: 'slide', vectors: [[0, 1]], maxDistance: 2 }], 8)).toBe(2)
    expect(pieceValue(straightContent, 'piece.turner', 4)).toBe(2 * 25)
    expect(complexityOf(straightContent, 'preset.turner').maxPieceReach).toBe(2)

    for (const [cap, expected] of [
      [2, 3],
      [3, 6],
      [4, 10],
    ] as const) {
      const content = contentWith(turning(cap))
      expect(patternReach([turning(cap)], 8)).toBe(expected)
      expect(pieceValue(content, 'piece.turner', 4)).toBe(expected * 25)
      expect(complexityOf(content, 'preset.turner').maxPieceReach).toBe(expected)
    }

    expect(pieceValue(contentWith(turning(2)), 'piece.turner', 4)).toBeLessThan(
      pieceValue(contentWith(turning(3)), 'piece.turner', 4),
    )
    expect(complexityOf(contentWith(turning(3)), 'preset.turner').maxPieceReach).toBeLessThan(
      complexityOf(contentWith(turning(4)), 'preset.turner').maxPieceReach,
    )
  })
})
