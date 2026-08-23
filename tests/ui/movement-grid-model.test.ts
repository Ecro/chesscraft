import { describe, expect, it } from 'vitest'
import {
  Cell,
  DIRECTION_VECTORS,
  blankGrid,
  cycleAt,
  isTurningAt,
  paintAt,
  rayOf,
  readGrid,
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

  it('S6 every non-compass perimeter cell creates a drawable automatic first vector', () => {
    const perimeter = [
      ...Array.from({ length: 7 }, (_, i) => [-3, 3 - i]),
      ...Array.from({ length: 6 }, (_, i) => [-2 + i, -3]),
      ...Array.from({ length: 5 }, (_, i) => [3, -2 + i]),
      ...Array.from({ length: 6 }, (_, i) => [-2 + i, 3]),
    ] as Array<[number, number]>
    let grid = blankGrid()
    for (const [df, dr] of perimeter) {
      grid = turnAt(grid, Cell.Move, df, dr)
      expect(isTurningAt(grid, Cell.Move, df, dr)).toBe(true)
      expect(paintAt(grid, Cell.Move, df, dr)).toEqual({ kind: 'ray', tip: true, endless: true })
      expect(grid.cells[`${df},${dr}`]).toBeUndefined()
    }

    const written = writeMovementEditor({ grid, preservedPatterns: { movement: [] } })
    expect(written.ok).toBe(true)
    if (written.ok) {
      const canonical = ([df, dr]: [number, number]): [number, number] => {
        const ray = rayOf(df, dr)
        return ray ? [...DIRECTION_VECTORS[ray.dir]] as [number, number] : [df, dr]
      }
      const sortVectors = (vectors: Array<[number, number]>) => vectors.sort((a, b) => a[0] - b[0] || a[1] - b[1])
      const actual = (written.movement as Array<{ kind?: unknown; vectors?: Array<[number, number]> }>)
        .filter((pattern) => pattern.kind === 'turning_slide')
        .flatMap((pattern) => pattern.vectors ?? [])
        .map((vector) => canonical(vector as [number, number]))
      expect(sortVectors(actual)).toEqual(sortVectors(perimeter.map(canonical)))
    }
  })

  it('S7 isolates, clears, and round-trips a representative off-axis capture turn', () => {
    const movement = turnAt(blankGrid(), Cell.Move, -3, 1)
    const both = turnAt(movement, Cell.Capture, 3, -1)
    expect(isTurningAt(both, Cell.Move, -3, 1)).toBe(true)
    expect(isTurningAt(both, Cell.Capture, -3, 1)).toBe(false)
    expect(isTurningAt(both, Cell.Capture, 3, -1)).toBe(true)

    const cleared = cycleAt(both, Cell.Capture, 3, -1)
    expect(isTurningAt(cleared, Cell.Capture, 3, -1)).toBe(false)
    expect(isTurningAt(cleared, Cell.Move, -3, 1)).toBe(true)
  })

  it('S8 keeps an automatic row with an out-of-grid vector opaque instead of splitting it', () => {
    const external = { kind: 'turning_slide', vectors: [[-3, 1], [4, 1]], turn: 'any' }
    const editor = readMovementEditor({ movement: [external] })

    expect(editor).not.toBeNull()
    expect(editor!.preservedPatterns.movement).toEqual([external])
    expect(writeMovementEditor(editor!)).toEqual({ ok: true, movement: [external], attack: undefined })
  })

  it('preserves an automatic row when compass canonicalization would collide', () => {
    const external = { kind: 'turning_slide', vectors: [[0, 1], [0, 3]], turn: 'any' }
    expect(readGrid({ movement: [external] })).toBeNull()

    const editor = readMovementEditor({ movement: [external] })
    expect(editor).not.toBeNull()
    expect(editor!.preservedPatterns.movement).toEqual([external])
    expect(writeMovementEditor(editor!)).toEqual({ ok: true, movement: [external], attack: undefined })
  })

  it('preserves omitted attack fallback when legacy movement is mixed with drawable movement', () => {
    const legacy = { kind: 'turning_slide', vectors: [[0, 1], [1, 0]], maxDistance: 4 }
    const step = { kind: 'step', vectors: [[1, 1]] }
    const editor = readMovementEditor({ movement: [legacy, step] })
    expect(editor?.captureFollowsMovement).toBe(true)
    expect(writeMovementEditor(editor!)).toEqual({ ok: true, movement: [legacy, step], attack: undefined })
  })

  it('S9 keeps omitted attack fallback for an off-axis turn until capture is edited separately', () => {
    const editor = readMovementEditor({ movement: [{ kind: 'turning_slide', vectors: [[-3, 1]], turn: 'any' }] })
    expect(editor).not.toBeNull()
    expect(writeMovementEditor(editor!)).toEqual({
      ok: true,
      movement: [{ kind: 'turning_slide', vectors: [[-3, 1]], turn: 'any' }],
      attack: undefined,
    })

    const captureEdit = cycleAt(editor!.grid, Cell.Capture, 3, 0)
    expect(writeMovementEditor({ ...editor!, grid: captureEdit, captureFollowsMovement: false })).toEqual({
      ok: true,
      movement: [{ kind: 'turning_slide', vectors: [[-3, 1]], turn: 'any' }],
      attack: [
        { kind: 'turning_slide', vectors: [[-3, 1]], turn: 'any' },
        { kind: 'step', vectors: [[3, 0]] },
      ],
    })
  })
})
