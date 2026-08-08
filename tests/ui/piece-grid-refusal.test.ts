/**
 * AC-011 (model half) — what the maker cannot hold, it refuses without touching.
 *
 * The refused set is derived from the reader's own documented rejection causes
 * rather than hand-picked, and the invariant is non-mutation: a refused open
 * leaves the stored record exactly as it was. That is the property the
 * flatten-on-open regression would break.
 */
import { describe, expect, it } from 'vitest'
import { Cell, blankGrid, readGrid, writeGrid } from '@ui/PieceMoves'

type Rec = Record<string, unknown>

/** One record per documented rejection cause. */
const REFUSED: Array<{ why: string; rec: Rec }> = [
  {
    why: 'two slide patterns disagreeing on reach cap',
    rec: {
      movement: [
        { kind: 'slide', vectors: [[0, 1]] },
        { kind: 'slide', vectors: [[1, 0]], maxDistance: 2 },
      ],
    },
  },
  {
    why: 'a reach cap the control cannot express',
    rec: { movement: [{ kind: 'slide', vectors: [[0, 1]], maxDistance: 4 }] },
  },
  {
    why: 'a slide along a vector that is not one of the eight directions',
    rec: { movement: [{ kind: 'slide', vectors: [[1, 2]] }] },
  },
  {
    why: 'a leap offset outside the grid',
    rec: { movement: [{ kind: 'step', vectors: [[4, 0]] }] },
  },
  {
    why: 'movement and attack disagreeing about forward',
    rec: {
      movement: [{ kind: 'step', vectors: [[0, 1]], forward: true }],
      attack: [{ kind: 'step', vectors: [[1, 1]] }],
    },
  },
  {
    why: 'two leap patterns in one array',
    rec: {
      movement: [
        { kind: 'step', vectors: [[0, 1]] },
        { kind: 'jump', vectors: [[1, 2]] },
      ],
    },
  },
  {
    why: 'slide caps disagreeing between movement and attack',
    rec: {
      movement: [{ kind: 'slide', vectors: [[0, 1]], maxDistance: 1 }],
      attack: [{ kind: 'slide', vectors: [[0, 1]], maxDistance: 2 }],
    },
  },
]

describe('AC-011 — refusal is total and non-destructive', () => {
  it.each(REFUSED)('refuses: $why', ({ rec }) => {
    expect(readGrid(rec)).toBeNull()
  })

  it.each(REFUSED)('leaves the record untouched when refusing: $why', ({ rec }) => {
    const before = structuredClone(rec)
    readGrid(rec)
    expect(rec).toEqual(before)
  })

  it('refuses a grid with capture squares but nothing to walk on', () => {
    // `movement` carries `.min(1)`; the screen says so rather than pretending.
    const grid = blankGrid()
    grid.cells['0,1'] = Cell.Capture
    const written = writeGrid(grid)
    expect(written.ok).toBe(false)
    if (written.ok) return
    expect(written.reason).toBe('no-move')
  })
})
