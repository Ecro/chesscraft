/**
 * AC-003 (model half) — a piece that both slides and hops opens in the simple maker.
 *
 * `movement.length > 1` is the single largest refusal cause in the shipped
 * reader (RESEARCH F3). The archer case is the stronger one: it is a BUNDLED
 * record, authored long before this change, that today's reader rejects because
 * its movement and attack use different kinds.
 */
import { describe, expect, it } from 'vitest'
import { DIRECTIONS, Cell, readGrid } from '@ui/PieceMoves'
import { bundledContentSource } from '@content/sets/bundled'

const ORTHOGONAL = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
]
const KNIGHT = [
  [1, 2],
  [2, 1],
  [2, -1],
  [1, -2],
  [-1, -2],
  [-2, -1],
  [-2, 1],
  [-1, 2],
]

function bundledPiece(id: string): Record<string, unknown> {
  const found = (bundledContentSource.pieces as Array<Record<string, unknown>>).find((p) => p.id === id)
  if (!found) throw new Error(`bundled fixture no longer defines ${id}`)
  return found
}

describe('AC-003 — slide-plus-leap records open', () => {
  it('opens a rook-slide plus knight-jump piece', () => {
    const grid = readGrid({
      movement: [
        { kind: 'slide', vectors: ORTHOGONAL },
        { kind: 'jump', vectors: KNIGHT },
      ],
    })
    expect(grid).not.toBeNull()
    if (!grid) return
    expect(grid.slides.n).toBe(Cell.Both)
    expect(grid.slides.e).toBe(Cell.Both)
    expect(grid.slides.ne).toBe(Cell.None)
    // Per-direction since ADR-001; every sliding direction of a rook is unbounded,
    // so the assertion is about the four that slide rather than one scalar.
    expect(DIRECTIONS.filter((d) => grid.slides[d] !== Cell.None).map((d) => grid.reach.move[d])).toEqual([
      'edge',
      'edge',
      'edge',
      'edge',
    ])
    expect(grid.cells['1,2']).toBe(Cell.Both)
    expect(grid.cells['-2,1']).toBe(Cell.Both)
  })

  it('opens the bundled archer, whose movement and attack use different kinds', () => {
    const grid = readGrid(bundledPiece('piece.archer'))
    expect(grid).not.toBeNull()
    if (!grid) return
    // Steps one square in every direction, shoots two squares orthogonally.
    expect(grid.cells['1,0']).toBe(Cell.Move)
    expect(grid.cells['1,1']).toBe(Cell.Move)
    expect(grid.cells['2,0']).toBe(Cell.Capture)
    expect(grid.cells['0,-2']).toBe(Cell.Capture)
  })

  it('opens the bundled pawn, whose move and capture squares are disjoint', () => {
    const grid = readGrid(bundledPiece('piece.pawn'))
    expect(grid).not.toBeNull()
    if (!grid) return
    expect(grid.forward).toBe(true)
    expect(grid.cells['0,1']).toBe(Cell.Move)
    expect(grid.cells['1,1']).toBe(Cell.Capture)
    expect(grid.cells['-1,1']).toBe(Cell.Capture)
  })
})
