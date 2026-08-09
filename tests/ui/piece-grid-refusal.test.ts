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
    // Was 'two slide patterns disagreeing on reach cap' — that document OPENS
    // now, because a cap is a property of each direction (ADR-001) and two
    // directions capped differently is the ordinary case the widening exists
    // for. What is still refused is the same direction claimed TWICE at two
    // caps: the grid has one cell per direction, so it has nowhere to put the
    // second answer, and the engine would settle it by pattern order rather
    // than by anything a child could see.
    why: 'one direction claimed twice, at two different caps',
    rec: {
      movement: [
        { kind: 'slide', vectors: [[0, 1]] },
        { kind: 'slide', vectors: [[0, 1]], maxDistance: 2 },
      ],
    },
  },
  {
    why: 'a slide cap the grid has no cell for',
    rec: { movement: [{ kind: 'slide', vectors: [[0, 1]], maxDistance: 3 }] },
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
  // 'slide caps disagreeing between movement and attack' was here, and it OPENS
  // now. A cap belongs to a direction AND an axis — which is what `movePattern`
  // always said, since `movement` and `attack` are separate arrays each carrying
  // its own `maxDistance`. The editor was the narrower of the two, and a review
  // finding showed what that narrowness cost: with one cap per direction, a tap
  // on one axis had to either move the other axis's ray or be drawn on a square
  // the child never tapped. The fixture moved to the OPENS list below rather
  // than being deleted, so the boundary shift is visible rather than implied.
]

/** Documents that used to be refused and now open, with the reason they moved. */
const NOW_OPENS: Array<{ why: string; rec: Rec }> = [
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

describe('the boundary that moved', () => {
  it.each(NOW_OPENS)('opens, and round-trips: $why', ({ rec }) => {
    const grid = readGrid(rec)
    expect(grid, 'this document is supposed to open now').not.toBeNull()
    const out = writeGrid(grid!)
    expect(out.ok).toBe(true)
    if (!out.ok) return
    // Byte-identical, not merely equivalent: a widening that quietly rewrote the
    // document on the way through would be a worse outcome than the refusal it
    // replaced.
    expect(out.movement).toEqual(rec.movement)
    expect(out.attack).toEqual(rec.attack)
  })
})
