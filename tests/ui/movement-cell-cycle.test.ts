/**
 * What one tap does, and the two places the "exactly three states" rule bends.
 *
 * AC-002 was written as "a cell tap cycles exactly three states and three taps
 * restore the draft", over every non-centre cell in either mode. Building it
 * showed the domain was two steps too wide, and both narrowings are properties
 * of the MODEL rather than choices this control made:
 *
 * 1. **Half the cells cannot slide.** A slide vector must be one of the eight
 *    compass units, so a knight-shaped offset has no third state to visit. Those
 *    cells cycle in two, and two taps restore them.
 * 2. **A cap belongs to a direction, not to a square.** Tapping any square of an
 *    existing ray clears the whole ray, because there is no way to keep squares
 *    1 and 3 while dropping 2. So three taps restore a cell only when its
 *    direction carried no ray to begin with — otherwise the third tap installs a
 *    ray whose cap is this square's distance, which is not where it started.
 *
 * Both are asserted here rather than left as prose, so a later reader meets the
 * rule instead of rediscovering it.
 */
import { describe, expect, it } from 'vitest'
import { Cell, DIRECTIONS, GRID_RANGE, blankGrid, cycleAt, paintAt, rayOf, type PieceGrid } from '@ui/PieceMoves'

const AXES = [
  ['movement', Cell.Move],
  ['capture', Cell.Capture],
] as const

/** Every non-centre cell of the 7x7. */
const CELLS: Array<[number, number]> = GRID_RANGE.flatMap((dr) =>
  GRID_RANGE.map((df) => [df, dr] as [number, number]),
).filter(([df, dr]) => !(df === 0 && dr === 0))

/**
 * The model itself, not `writeGrid`'s output.
 *
 * `writeGrid` was the first choice and it is DEGENERATE in capture mode: a grid
 * with capture squares and no movement squares compiles to
 * `{ok:false,reason:'no-move'}` both before and after the taps, so every restore
 * assertion in that half passed by comparing one refusal to another. The grid is
 * the thing the taps change, so the grid is what gets compared.
 */
const state = (g: PieceGrid) => JSON.stringify({ cells: g.cells, slides: g.slides, reach: g.reach, forward: g.forward })

describe('the grid is half rays and half not, and the counts are pinned', () => {
  it('has 48 cells, 24 of them on a compass ray', () => {
    expect(CELLS.length).toBe(48)
    expect(CELLS.filter(([df, dr]) => rayOf(df, dr) !== null).length).toBe(24)
  })
})

describe.each(AXES)('AC-002 — in %s mode', (_name, axis) => {
  const onRay = CELLS.filter(([df, dr]) => rayOf(df, dr) !== null)
  const offRay = CELLS.filter(([df, dr]) => rayOf(df, dr) === null)

  it.each(onRay)('a ray cell at (%i,%i) visits leap then ray then nothing', (df, dr) => {
    const start = blankGrid()
    const before = state(start)

    const one = cycleAt(start, axis, df, dr)
    expect(paintAt(one, axis, df, dr).kind).toBe('leap')

    const two = cycleAt(one, axis, df, dr)
    expect(paintAt(two, axis, df, dr)).toMatchObject({ kind: 'ray', tip: true })

    const three = cycleAt(two, axis, df, dr)
    expect(paintAt(three, axis, df, dr).kind).toBe('none')
    expect(state(three), 'three taps did not restore the draft').toBe(before)
  })

  it.each(offRay)('an off-ray cell at (%i,%i) has two states, not three', (df, dr) => {
    const start = blankGrid()
    const before = state(start)

    const one = cycleAt(start, axis, df, dr)
    expect(paintAt(one, axis, df, dr).kind).toBe('leap')

    const two = cycleAt(one, axis, df, dr)
    expect(paintAt(two, axis, df, dr).kind, 'there is no ray to visit here').toBe('none')
    expect(state(two), 'two taps did not restore the draft').toBe(before)
  })

  it('tapping any square of a ray clears the whole ray, not just that square', () => {
    // North to the edge, then tap the square nearest the centre.
    let g = blankGrid()
    g = cycleAt(g, axis, 0, 3)
    g = cycleAt(g, axis, 0, 3)
    expect(paintAt(g, axis, 0, 1).kind).toBe('ray')

    g = cycleAt(g, axis, 0, 1)
    for (const d of [1, 2, 3]) {
      expect(paintAt(g, axis, 0, d).kind, `(0,${d}) survived the clear`).toBe('none')
    }
  })

  it('the third tap on a cell whose direction already slides is NOT a restore', () => {
    // The precondition AC-002 needs, stated as a test so it cannot be forgotten.
    let g = blankGrid()
    g = cycleAt(g, axis, 0, 3)
    g = cycleAt(g, axis, 0, 3) // north, unbounded
    const before = state(g)

    let after = g
    for (let i = 0; i < 3; i += 1) after = cycleAt(after, axis, 0, 1)
    expect(state(after), 'a ray is per-direction, so this cannot round-trip').not.toBe(before)
    expect(
      after.reach[axis === Cell.Move ? 'move' : 'capture'].n,
      'the third tap re-tips the ray at the tapped square',
    ).toBe(1)
  })
})

describe('the two axes do not disturb each other', () => {
  it('painting a capture square leaves the movement half alone', () => {
    const moveOnly = cycleAt(blankGrid(), Cell.Move, 1, 2)
    const withCapture = cycleAt(moveOnly, Cell.Capture, -1, 2)
    expect(paintAt(withCapture, Cell.Move, 1, 2).kind).toBe('leap')
    expect(paintAt(withCapture, Cell.Move, -1, 2).kind, 'the capture tap leaked into movement').toBe('none')
    expect(paintAt(withCapture, Cell.Capture, -1, 2).kind).toBe('leap')
    expect(paintAt(withCapture, Cell.Capture, 1, 2).kind, 'the movement tap leaked into capture').toBe('none')
    // The bits themselves, so a renderer that agreed with itself cannot pass.
    expect(withCapture.cells['1,2']).toBe(Cell.Move)
    expect(withCapture.cells['-1,2']).toBe(Cell.Capture)
  })

  it('each axis keeps its own cap for the same direction', () => {
    // Round-2 review finding (P1), and the second attempt at this rule. The cap
    // was per DIRECTION, which forced a choice between two wrong answers: let
    // the later tap win (it silently lengthened a ray on the mode you were NOT
    // looking at) or adopt the existing cap (the square you DID tap then drew as
    // untouched while a square you never tapped became the tip). Both are edits a
    // child cannot see.
    //
    // The cap is per direction AND axis now, which is what the persisted schema
    // has said all along: `movement` and `attack` are separate pattern arrays,
    // each carrying its own `maxDistance`.
    let g = blankGrid()
    g = cycleAt(g, Cell.Move, 0, 1)
    g = cycleAt(g, Cell.Move, 0, 1) // movement slides north one square
    expect(g.reach.move.n).toBe(1)

    g = cycleAt(g, Cell.Capture, 0, 3)
    g = cycleAt(g, Cell.Capture, 0, 3) // capture slides north to the edge
    expect(g.reach.capture.n, 'the tapped distance must be the capture cap').toBe('edge')
    expect(g.reach.move.n, 'the movement ray was changed by a tap in the other mode').toBe(1)

    // And the drawing agrees with the tap on BOTH axes — the half the round-2
    // finding was about.
    expect(paintAt(g, Cell.Capture, 0, 3), 'the tapped square drew as untouched').toEqual({
      kind: 'ray',
      tip: true,
      endless: true,
    })
    expect(paintAt(g, Cell.Move, 0, 3).kind, 'the movement ray grew to the tapped square').toBe('none')
    expect(paintAt(g, Cell.Move, 0, 1)).toEqual({ kind: 'ray', tip: true, endless: false })
  })

  it('clearing one axis leaves the other axis cap alone', () => {
    let g = blankGrid()
    g = cycleAt(g, Cell.Move, 0, 2)
    g = cycleAt(g, Cell.Move, 0, 2)
    g = cycleAt(g, Cell.Capture, 0, 3)
    g = cycleAt(g, Cell.Capture, 0, 3)
    expect([g.reach.move.n, g.reach.capture.n]).toEqual([2, 'edge'])

    g = cycleAt(g, Cell.Move, 0, 1) // clears the movement ray
    expect(g.slides.n, 'capture must still slide north').toBe(Cell.Capture)
    expect(g.reach.capture.n, 'clearing movement released the capture cap').toBe('edge')
    expect(g.reach.move.n, 'a released axis returns to the default').toBe('edge')
  })

  it('painting a capture square leaves the movement half alone', () => {
    const moveOnly = cycleAt(blankGrid(), Cell.Move, 1, 2)
    const withCapture = cycleAt(moveOnly, Cell.Capture, -1, 2)
    expect(paintAt(withCapture, Cell.Move, 1, 2).kind).toBe('leap')
    expect(paintAt(withCapture, Cell.Move, -1, 2).kind, 'the capture tap leaked into movement').toBe('none')
    expect(paintAt(withCapture, Cell.Capture, -1, 2).kind).toBe('leap')
    expect(paintAt(withCapture, Cell.Capture, 1, 2).kind, 'the movement tap leaked into capture').toBe('none')
    // The bits themselves, so a renderer that agreed with itself cannot pass.
    expect(withCapture.cells['1,2']).toBe(Cell.Move)
    expect(withCapture.cells['-1,2']).toBe(Cell.Capture)
  })

})
