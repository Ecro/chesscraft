/**
 * AC-001 — a lit grid cell is exactly one reachable square.
 *
 * Metamorphic, not exemplary: the relation is stated over the grid's inputs and
 * the ENGINE's outputs, and holds for every lit-cell set the grid can express.
 * A compiler that emits an unbounded slide for a painted cell breaks the
 * containment half no matter how it is written, which is precisely the defect
 * this criterion exists to pin (RESEARCH F1).
 */
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { Cell, blankGrid, writeGrid, type PieceGrid } from '@ui/PieceMoves'
import { centreOf, offsetsFrom, reachOf } from '../helpers/reach'

const OFFSETS: Array<[number, number]> = []
for (let df = -3; df <= 3; df += 1) {
  for (let dr = -3; dr <= 3; dr += 1) {
    if (df !== 0 || dr !== 0) OFFSETS.push([df, dr])
  }
}

/** A grid with the given cells lit and no slide direction enabled. */
function cellsOnly(picks: ReadonlyArray<{ df: number; dr: number; value: Cell }>): PieceGrid {
  const grid = blankGrid()
  for (const p of picks) grid.cells[`${p.df},${p.dr}`] = p.value
  return grid
}

const litOffsets = (grid: PieceGrid): string[] =>
  Object.entries(grid.cells)
    .filter(([, v]) => v !== Cell.None)
    .map(([k]) => k)
    .sort()

const moveOffsets = (grid: PieceGrid): string[] =>
  Object.entries(grid.cells)
    .filter(([, v]) => v === Cell.Move || v === Cell.Both)
    .map(([k]) => k)
    .sort()

const captureOffsets = (grid: PieceGrid): string[] =>
  Object.entries(grid.cells)
    .filter(([, v]) => v === Cell.Capture || v === Cell.Both)
    .map(([k]) => k)
    .sort()

/** A non-empty selection of distinct offsets, at least one of them walkable. */
const gridArb = fc
  .uniqueArray(
    fc.record({
      index: fc.integer({ min: 0, max: OFFSETS.length - 1 }),
      value: fc.constantFrom(Cell.Move, Cell.Capture, Cell.Both),
    }),
    { minLength: 1, maxLength: 12, selector: (p) => p.index },
  )
  .map((picks) =>
    cellsOnly(
      picks.map((p) => {
        const offset = OFFSETS[p.index]
        if (!offset) throw new Error(`offset index ${p.index} is out of range`)
        return { df: offset[0], dr: offset[1], value: p.value }
      }),
    ),
  )
  .filter((grid) => moveOffsets(grid).length > 0)

const WIDTH = 9
const HEIGHT = 9
const ORIGIN = centreOf(WIDTH, HEIGHT)

/** An enemy on every square within radius 3, so capture squares are live. */
const surrounded = OFFSETS.map(([df, dr]) => ({
  square: `${String.fromCharCode(97 + 4 + df)}${5 + dr}`,
  side: 'black' as const,
}))

describe('AC-001 — a lit cell is exactly one reachable square', () => {
  it('reaches nothing outside the lit set, on an empty board or a crowded one', () => {
    fc.assert(
      fc.property(gridArb, (grid) => {
        const written = writeGrid(grid)
        expect(written.ok).toBe(true)
        if (!written.ok) return
        const def = { movement: written.movement, attack: written.attack }
        const lit = litOffsets(grid)

        const empty = reachOf(def, { width: WIDTH, height: HEIGHT, origin: ORIGIN })
        expect(offsetsFrom(ORIGIN, empty.all).every((o) => lit.includes(o))).toBe(true)

        const crowded = reachOf(def, { width: WIDTH, height: HEIGHT, origin: ORIGIN, occupants: surrounded })
        expect(offsetsFrom(ORIGIN, crowded.all).every((o) => lit.includes(o))).toBe(true)
      }),
      { numRuns: 40 },
    )
  })

  it('reaches every move-lit square on an empty board — no shortfall', () => {
    fc.assert(
      fc.property(gridArb, (grid) => {
        const written = writeGrid(grid)
        if (!written.ok) return
        const reach = reachOf(
          { movement: written.movement, attack: written.attack },
          { width: WIDTH, height: HEIGHT, origin: ORIGIN },
        )
        expect(offsetsFrom(ORIGIN, reach.quiet)).toEqual(moveOffsets(grid))
      }),
      { numRuns: 40 },
    )
  })

  it('captures on exactly the capture-lit squares — no shortfall on that axis either', () => {
    // The move axis alone leaves half the grid's vocabulary unchecked: a
    // compiler that silently drops capture-only offsets would still satisfy the
    // property above. The one wrinkle is a SCHEMA semantic, not this control's
    // choice — an omitted `attack` means captures follow the movement patterns,
    // so a grid painted with no capture squares at all still captures where it
    // moves. That is the frozen "move-only is not never-captures" behaviour.
    fc.assert(
      fc.property(gridArb, (grid) => {
        const written = writeGrid(grid)
        if (!written.ok) return
        const takes = captureOffsets(grid)
        const expected = takes.length > 0 ? takes : moveOffsets(grid)
        const crowded = reachOf(
          { movement: written.movement, attack: written.attack },
          { width: WIDTH, height: HEIGHT, origin: ORIGIN, occupants: surrounded },
        )
        expect(offsetsFrom(ORIGIN, crowded.captures)).toEqual(expected)
      }),
      { numRuns: 40 },
    )
  })

  it('one lit cell three squares out is one destination, not a ray', () => {
    // The concrete shape of RESEARCH F1: today this compiles to a slide and the
    // piece crosses the board. Kept as a named case so a regression reads clearly.
    const written = writeGrid(cellsOnly([{ df: 0, dr: 1, value: Cell.Both }]))
    expect(written.ok).toBe(true)
    if (!written.ok) return
    const reach = reachOf({ movement: written.movement, attack: written.attack }, { width: WIDTH, height: HEIGHT })
    expect(offsetsFrom(ORIGIN, reach.all)).toEqual(['0,1'])
  })
})
