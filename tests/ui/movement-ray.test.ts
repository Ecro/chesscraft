/**
 * The representability matrix — one row per shape the grid must be able to say.
 *
 * This is PLAN Phase 5's exit, and it is written as an enumeration rather than
 * as "the new controls author everything the old ones could" because that claim
 * is both unfalsifiable and false: the old controls could author a slide capped
 * at exactly 3 and the new ones deliberately cannot (ADR-002). A matrix can
 * carry an EXCLUSION with its reason; a slogan cannot.
 *
 * Every row is built by tapping, not by hand-assembling a `PieceGrid`. Driving
 * the cycle is the point — the compiler was never the thing that was wrong.
 */
import { describe, expect, it } from 'vitest'
import { Cell, blankGrid, cycleAt, paintAt, readGrid, writeGrid, type PieceGrid } from '@ui/PieceMoves'

/** Taps a cell n times for one axis. */
const tap = (grid: PieceGrid, df: number, dr: number, times = 1, axis: Cell.Move | Cell.Capture = Cell.Move) => {
  let g = grid
  for (let i = 0; i < times; i += 1) g = cycleAt(g, axis, df, dr)
  return g
}

/** Build → write → read back → write again. Returns the emitted movement/attack. */
function emit(grid: PieceGrid) {
  const out = writeGrid(grid)
  expect(out.ok, 'the grid refused to compile').toBe(true)
  if (!out.ok) throw new Error('unreachable')
  const back = readGrid({ movement: out.movement, attack: out.attack } as Record<string, unknown>)
  expect(back, 'what the grid wrote, the grid could not read').not.toBeNull()
  const again = writeGrid(back!)
  expect(again.ok).toBe(true)
  if (!again.ok) throw new Error('unreachable')
  expect(again.movement, 'the round-trip is not stable').toEqual(out.movement)
  expect(again.attack).toEqual(out.attack)
  return out
}

describe('the matrix — every shape the grid claims to say', () => {
  it('leap only', () => {
    const g = tap(tap(blankGrid(), 1, 2), -1, 2)
    expect(emit(g).movement).toEqual([{ kind: 'step', vectors: [[-1, 2], [1, 2]] }])
  })

  it.each([
    [1, 1, { maxDistance: 1 }],
    [2, 2, { maxDistance: 2 }],
    [3, 3, {}],
  ])('slide north, tip at distance %i', (distance, _d, extra) => {
    const g = tap(blankGrid(), 0, distance, 2)
    expect(emit(g).movement).toEqual([{ kind: 'slide', vectors: [[0, 1]], ...extra }])
  })

  it('two directions at different caps', () => {
    let g = tap(blankGrid(), 0, 2, 2) // north, capped at 2
    g = tap(g, 3, 0, 2) // east, to the edge
    expect(emit(g).movement).toEqual([
      { kind: 'slide', vectors: [[0, 1]], maxDistance: 2 },
      { kind: 'slide', vectors: [[1, 0]] },
    ])
  })

  it('mixed move and capture on different squares', () => {
    let g = tap(blankGrid(), 0, 1) // move-only leap north
    g = tap(g, 1, 1, 1, Cell.Capture) // capture-only leap north-east
    const out = emit(g)
    expect(out.movement).toEqual([{ kind: 'step', vectors: [[0, 1]] }])
    expect(out.attack).toEqual([{ kind: 'step', vectors: [[1, 1]] }])
  })

  it('the same square for both, which omits attack entirely', () => {
    let g = tap(blankGrid(), 0, 1)
    g = tap(g, 0, 1, 1, Cell.Capture)
    const out = emit(g)
    expect(out.movement).toEqual([{ kind: 'step', vectors: [[0, 1]] }])
    expect(out.attack, 'identical reach means the field is omitted, not duplicated').toBeUndefined()
  })

  it.each([
    [true, { forward: true }],
    [false, {}],
  ])('forward mirroring %s', (forward, extra) => {
    const g = { ...tap(blankGrid(), 0, 1), forward }
    expect(emit(g).movement).toEqual([{ kind: 'step', vectors: [[0, 1]], ...extra }])
  })

  it('an empty capture grid omits attack', () => {
    const g = tap(blankGrid(), 0, 1)
    expect(emit(g).attack).toBeUndefined()
  })

  it('a cleared grid is refused with a reason rather than written empty', () => {
    const g = tap(blankGrid(), 0, 1, 2) // to a ray
    const cleared = tap(g, 0, 1) // and off again
    const out = writeGrid(cleared)
    expect(out.ok).toBe(false)
    if (out.ok) return
    expect(out.reason).toBe('no-move')
  })

  /**
   * EXCLUDED, with the reason, rather than omitted.
   *
   * The outermost ring cell means "and keeps going" (ADR-002), so there is no
   * cell that says "three squares and stop". `piece.charger` ships this shape
   * and stays read-only; AC-006 pins it as the only shipped record in that
   * state, so this exclusion has a live witness rather than being a note.
   */
  it('EXCLUDED — a slide capped at exactly three', () => {
    const g = tap(blankGrid(), 0, 3, 2)
    expect(emit(g).movement, 'the ring cell must mean unbounded, not three').toEqual([
      { kind: 'slide', vectors: [[0, 1]] },
    ])
    expect(readGrid({ movement: [{ kind: 'slide', vectors: [[0, 1]], maxDistance: 3 }] })).toBeNull()
  })
})

describe('AC-004 — a slide cell owns its ray, and the cap is per direction', () => {
  it('draws every square between the centre and the tip', () => {
    const g = tap(blankGrid(), 0, 3, 2)
    expect(paintAt(g, Cell.Move, 0, 1).kind).toBe('ray')
    expect(paintAt(g, Cell.Move, 0, 2).kind).toBe('ray')
    expect(paintAt(g, Cell.Move, 0, 3)).toEqual({ kind: 'ray', tip: true, endless: true })
  })

  it('leaves squares beyond a capped tip dark', () => {
    const g = tap(blankGrid(), 0, 2, 2)
    expect(paintAt(g, Cell.Move, 0, 2)).toEqual({ kind: 'ray', tip: true, endless: false })
    expect(paintAt(g, Cell.Move, 0, 3).kind, 'the ray stops where the child put its tip').toBe('none')
  })

  it('caps one direction without touching another', () => {
    let g = tap(blankGrid(), 0, 2, 2)
    g = tap(g, 3, 0, 2)
    expect(g.reach.move.n).toBe(2)
    expect(g.reach.move.e).toBe('edge')
  })
})

describe('AC-005 — the ring cell writes no maxDistance', () => {
  it.each(['n', 'e', 's', 'w', 'ne', 'se', 'sw', 'nw'] as const)('%s', (dir) => {
    const at = { n: [0, 3], s: [0, -3], e: [3, 0], w: [-3, 0], ne: [3, 3], se: [3, -3], sw: [-3, -3], nw: [-3, 3] }[
      dir
    ] as [number, number]
    const g = tap(blankGrid(), at[0], at[1], 2)
    const slide = (emit(g).movement as Array<{ maxDistance?: number }>)[0]!
    expect('maxDistance' in slide, `${dir} wrote a cap where it should have written none`).toBe(false)
  })
})

describe('an axis may slide a direction at a cap the other axis does not share', () => {
  it('opens a document the schema always permitted', () => {
    // `readGrid` used to refuse this: the grid held one cap per direction, so a
    // record whose movement slid north one square while its attack slid two was
    // undrawable even though `movePattern` gives each array its own
    // `maxDistance`. The editor was the narrower of the two, and this is the
    // widening that closes the gap.
    const doc = {
      movement: [{ kind: 'slide', vectors: [[0, 1]], maxDistance: 1 }],
      attack: [{ kind: 'slide', vectors: [[0, 1]], maxDistance: 2 }],
    }
    const grid = readGrid(doc as unknown as Record<string, unknown>)
    expect(grid, 'a per-axis cap must now open').not.toBeNull()
    expect(grid!.reach.move.n).toBe(1)
    expect(grid!.reach.capture.n).toBe(2)

    const out = writeGrid(grid!)
    expect(out.ok).toBe(true)
    if (!out.ok) return
    expect(out.movement).toEqual(doc.movement)
    expect(out.attack).toEqual(doc.attack)
  })

  it('draws each axis to its own length', () => {
    const grid = readGrid({
      movement: [{ kind: 'slide', vectors: [[0, 1]], maxDistance: 1 }],
      attack: [{ kind: 'slide', vectors: [[0, 1]] }],
    } as unknown as Record<string, unknown>)!
    expect(paintAt(grid, Cell.Move, 0, 2).kind, 'movement stops at one square').toBe('none')
    expect(paintAt(grid, Cell.Capture, 0, 2).kind).toBe('ray')
    expect(paintAt(grid, Cell.Capture, 0, 3)).toEqual({ kind: 'ray', tip: true, endless: true })
  })

  it('still refuses ONE axis claiming a direction twice at two caps', () => {
    // The widening is per axis, not a licence for a direction to hold two caps
    // on the SAME axis — the grid has one cell per direction there, so there is
    // nowhere to put the second answer.
    expect(
      readGrid({
        movement: [
          { kind: 'slide', vectors: [[0, 1]], maxDistance: 1 },
          { kind: 'slide', vectors: [[0, 1]], maxDistance: 2 },
        ],
      } as unknown as Record<string, unknown>),
    ).toBeNull()
  })
})
