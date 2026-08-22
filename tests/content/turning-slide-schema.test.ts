import { describe, expect, it } from 'vitest'
import { movePattern, SCHEMA_VERSION } from '@content/schema'
import { exportContent, importContent } from '@editor/io'
import { cloneValid } from './fixtures/valid-set'

describe('turning_slide schema', () => {
  it('parses an ordered pair, total cap, and forward flag', () => {
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
    { vectors: [[1, 0]], maxDistance: 2 },
    { vectors: [[1, 0], [1, 0]], maxDistance: 2 },
    { vectors: [[1, 0], [-1, 0]], maxDistance: 2 },
    { vectors: [[2, 0], [0, 1]], maxDistance: 2 },
    { vectors: [[1, 0], [0, 1]], maxDistance: 1 },
  ])('rejects an invalid turning contract: %j', (fields) => {
    expect(movePattern.safeParse({ kind: 'turning_slide', ...fields }).success).toBe(false)
  })

  it('bumps the content vocabulary version for the new kind', () => {
    expect(SCHEMA_VERSION).toBe(14)
  })

  it('reads a v13 straight-only document and re-stamps it as v14 without changing content', () => {
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
    expect(imported.source.schemaVersion).toBe(14)
    expect(imported.source.pieces).toEqual(legacy.pieces)
    expect(JSON.parse(exportContent(imported.source)).schemaVersion).toBe(14)
  })
})
