import { describe, expect, it } from 'vitest'
import {
  Cell,
  blankGrid,
  cycleAt,
  isTurningAt,
  readMovementEditor,
  turnAt,
  writeMovementEditor,
} from '@ui/PieceMoves'

const automatic = {
  kind: 'turning_slide',
  vectors: [[0, 1]],
  turn: 'any',
} as const

describe('unified movement grid turning model', () => {
  it('S1 double-clicking only an outermost compass cell produces an automatic bend', () => {
    const oneClick = cycleAt(blankGrid(), Cell.Move, 0, 3)
    const grid = turnAt(oneClick, Cell.Move, 0, 3)

    expect(isTurningAt(grid, Cell.Move, 0, 3)).toBe(true)
    expect(grid.turning.move.n).toBe(true)
    expect(grid.cells['0,3']).toBeUndefined()
    expect(turnAt(blankGrid(), Cell.Move, 0, 2)).toEqual(blankGrid())
  })

  it('S2 keeps movement and capture turning flags independent', () => {
    const movement = turnAt(blankGrid(), Cell.Move, 0, 3)
    const both = turnAt(movement, Cell.Capture, 3, 0)

    expect(isTurningAt(both, Cell.Move, 0, 3)).toBe(true)
    expect(isTurningAt(both, Cell.Capture, 3, 0)).toBe(true)
    expect(isTurningAt(both, Cell.Move, 3, 0)).toBe(false)
    expect(isTurningAt(both, Cell.Capture, 0, 3)).toBe(false)
  })

  it('S3 clears an automatic turning ray with the same cell interaction used by straight rays', () => {
    const turned = turnAt(blankGrid(), Cell.Move, 0, 3)
    const cleared = cycleAt(turned, Cell.Move, 0, 3)

    expect(isTurningAt(cleared, Cell.Move, 0, 3)).toBe(false)
    expect(cleared.slides.n).toBe(Cell.None)
  })

  it('S4 reads and writes the compact automatic contract through the same editor state', () => {
    const attack = { kind: 'step', vectors: [[1, 0]] } as const
    const editor = readMovementEditor({ movement: [automatic], attack: [attack] })
    expect(editor).not.toBeNull()
    expect(isTurningAt(editor!.grid, Cell.Move, 0, 3)).toBe(true)
    expect(isTurningAt(editor!.grid, Cell.Capture, 0, 3)).toBe(false)
    expect(writeMovementEditor(editor!)).toEqual({ movement: [automatic], attack: [attack], ok: true })
  })

  it('S5 preserves legacy ordered pairs and non-drawable automatic patterns instead of widening them', () => {
    const legacy = {
      kind: 'turning_slide',
      vectors: [[0, 1], [1, 0]],
      maxDistance: 3,
    }
    const opaqueAutomatic = {
      kind: 'turning_slide',
      vectors: [[0, 1], [1, 0]],
      turn: 'any',
      maxDistance: 4,
    }
    const editor = readMovementEditor({ movement: [legacy, opaqueAutomatic] })

    expect(editor).not.toBeNull()
    expect(editor!.preservedPatterns.movement).toEqual([legacy, opaqueAutomatic])
    expect(writeMovementEditor(editor!)).toEqual({
      ok: true,
      movement: [legacy, opaqueAutomatic],
      attack: undefined,
    })
  })

  it('preserves omitted attack fallback when legacy movement is mixed with drawable movement', () => {
    const legacy = { kind: 'turning_slide', vectors: [[0, 1], [1, 0]], maxDistance: 4 }
    const step = { kind: 'step', vectors: [[1, 1]] }
    const editor = readMovementEditor({ movement: [legacy, step] })
    expect(editor?.captureFollowsMovement).toBe(true)
    expect(writeMovementEditor(editor!)).toEqual({ ok: true, movement: [legacy, step], attack: undefined })
  })
})
