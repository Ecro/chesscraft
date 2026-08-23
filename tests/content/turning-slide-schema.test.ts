import { describe, expect, it } from 'vitest'
import { movePattern, SCHEMA_VERSION } from '@content/schema'
import { exportContent, importContent } from '@editor/io'
import { cloneValid } from './fixtures/valid-set'

describe('turning_slide schema', () => {
  it('S4 accepts an automatic one-bend slide in the v16 contract', () => {
    expect(
      movePattern.parse({
        kind: 'turning_slide',
        vectors: [[0, 1]],
        turn: 'any',
      }),
    ).toEqual({
      kind: 'turning_slide',
      vectors: [[0, 1]],
      turn: 'any',
    })
  })

  it('S4 accepts multiple distinct first-leg vectors for automatic turns', () => {
    expect(
      movePattern.safeParse({
        kind: 'turning_slide',
        vectors: [
          [0, 1],
          [1, 0],
        ],
        turn: 'any',
    }).success,
  ).toBe(true)
  })

  it('S4 accepts an off-axis perimeter vector and the full 24-cell perimeter', () => {
    const perimeter = [
      ...Array.from({ length: 7 }, (_, i) => [-3, 3 - i]),
      ...Array.from({ length: 6 }, (_, i) => [-2 + i, -3]),
      ...Array.from({ length: 5 }, (_, i) => [3, -2 + i]),
      ...Array.from({ length: 6 }, (_, i) => [-2 + i, 3]),
    ]
    expect(movePattern.safeParse({ kind: 'turning_slide', vectors: [[-3, 1]], turn: 'any' }).success).toBe(true)
    expect(movePattern.safeParse({ kind: 'turning_slide', vectors: perimeter, turn: 'any' }).success).toBe(true)
    expect(movePattern.safeParse({ kind: 'turning_slide', vectors: [...perimeter, [2, 2]], turn: 'any' }).success).toBe(false)
  })

  it('S5 parses a legacy ordered pair, total cap, and forward flag', () => {
    const result = movePattern.parse({
      kind: 'turning_slide',
      vectors: [[1, 0], [0, 1]],
      maxDistance: 2,
      forward: true,
    })
    expect(result).toEqual({
      kind: 'turning_slide',
      vectors: [[1, 0], [0, 1]],
      maxDistance: 2,
      forward: true,
    })
  })

  it.each([
    { vectors: [[0, 1]], turn: 'fixed' },
    { vectors: [[0, 1], [0, 1]], turn: 'any' },
    { vectors: [[0, 0]], turn: 'any' },
    { vectors: [[1, 0]], maxDistance: 2 },
    { vectors: [[1, 0], [1, 0]], maxDistance: 2 },
    { vectors: [[1, 0], [-1, 0]], maxDistance: 2 },
    { vectors: [[2, 0], [0, 1]], maxDistance: 2 },
    { vectors: [[1, 0], [0, 1]], maxDistance: 1 },
  ])('S4 rejects an invalid automatic or legacy turning contract: %j', (fields) => {
    expect(movePattern.safeParse({ kind: 'turning_slide', ...fields }).success).toBe(false)
  })

  it('S4 bumps the content vocabulary version for the perimeter contract', () => {
    expect(SCHEMA_VERSION).toBe(16)
  })

  it('S6 reads a v13 straight-only document and re-stamps it as v16 without changing content', () => {
    const legacy = cloneValid()
    legacy.schemaVersion = 13
    legacy.boards = legacy.boards.map((board) => ({
      ...board,
      territoryDepth: 3,
      promotionDepth: 1,
      zones: {},
    }))
    legacy.skillCards = legacy.skillCards.map((card) => ({
      ...card,
      royalFollowUp: 'preserve',
      protectRelocatedAfterPlay: false,
      lockRelocatedAfterPlay: false,
    }))
    const imported = importContent(JSON.stringify(legacy))
    expect(imported.ok).toBe(true)
    if (!imported.ok) return
    expect(imported.source.schemaVersion).toBe(16)
    expect(imported.source.pieces).toEqual(legacy.pieces)
    expect(JSON.parse(exportContent(imported.source)).schemaVersion).toBe(16)
  })
})
