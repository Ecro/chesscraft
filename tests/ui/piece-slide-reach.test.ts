/**
 * AC-002 — a slide direction with a reach cap produces exactly that many squares.
 *
 * The expected sets come from board geometry (a 6x6 board, subject at c3) and
 * were written down before the control existed — they are counted off a
 * diagram, not read out of the compiler.
 */
import { describe, expect, it } from 'vitest'
import { Cell, blankGrid, withAllReach, writeGrid, type Dir8, type PieceGrid, type Reach } from '@ui/PieceMoves'
import { reachOf } from '../helpers/reach'

const WIDTH = 6
const HEIGHT = 6
const ORIGIN = 'c3'

interface Row {
  direction: Dir8
  reach: Reach
  expected: string[]
}

/** SPEC AC-002 golden table, mirrored from SPEC-piece-skill-creation-ux.machine.yaml. */
const GOLDEN: Row[] = [
  { direction: 'n', reach: 1, expected: ['c4'] },
  { direction: 'n', reach: 2, expected: ['c4', 'c5'] },
  { direction: 'n', reach: 'edge', expected: ['c4', 'c5', 'c6'] },
  { direction: 'ne', reach: 1, expected: ['d4'] },
  { direction: 'ne', reach: 2, expected: ['d4', 'e5'] },
  { direction: 'ne', reach: 'edge', expected: ['d4', 'e5', 'f6'] },
  { direction: 'e', reach: 'edge', expected: ['d3', 'e3', 'f3'] },
  { direction: 's', reach: 'edge', expected: ['c2', 'c1'] },
]

function slideOnly(direction: Dir8, reach: Reach): PieceGrid {
  // `reach` became per-direction when the ray moved into the cell (ADR-001), so
  // a fixture that set one scalar now sets one map. The golden table above is
  // untouched, which is the point: what these rows assert about where a piece
  // can go did not change, only how the cap is spelled.
  const grid = withAllReach(blankGrid(), reach)
  grid.slides[direction] = Cell.Both
  return grid
}

describe('AC-002 — slide reach caps', () => {
  it.each(GOLDEN)('$direction at reach $reach reaches $expected', ({ direction, reach, expected }) => {
    const written = writeGrid(slideOnly(direction, reach))
    expect(written.ok).toBe(true)
    if (!written.ok) return
    const got = reachOf(
      { movement: written.movement, attack: written.attack },
      { width: WIDTH, height: HEIGHT, origin: ORIGIN },
    )
    expect(got.all.slice().sort()).toEqual(expected.slice().sort())
  })

  it('enabling a direction leaves every grid cell contributing exactly what it did', () => {
    const cellsOnly = blankGrid()
    cellsOnly.cells['1,2'] = Cell.Both
    cellsOnly.cells['-1,2'] = Cell.Both
    const before = writeGrid(cellsOnly)
    expect(before.ok).toBe(true)
    if (!before.ok) return
    const cellReach = reachOf(
      { movement: before.movement, attack: before.attack },
      { width: WIDTH, height: HEIGHT, origin: ORIGIN },
    )

    const withSlide: PieceGrid = withAllReach({ ...cellsOnly, slides: { ...cellsOnly.slides, e: Cell.Both } }, 'edge')
    const after = writeGrid(withSlide)
    expect(after.ok).toBe(true)
    if (!after.ok) return
    const bothReach = reachOf(
      { movement: after.movement, attack: after.attack },
      { width: WIDTH, height: HEIGHT, origin: ORIGIN },
    )

    // Every square the cells reached is still reached, and the only additions
    // are the slide's own ray.
    for (const sq of cellReach.all) expect(bothReach.all).toContain(sq)
    const added = bothReach.all.filter((sq) => !cellReach.all.includes(sq))
    expect(added.slice().sort()).toEqual(['d3', 'e3', 'f3'])
  })
})
