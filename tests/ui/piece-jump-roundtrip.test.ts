/**
 * AC-005 — a `jump` piece opens in the grid and re-saves behaviourally identically.
 *
 * `reachFrom` branches on `'slide'` only (`src/engine/engine.ts:121`), so
 * `'step'` and `'jump'` are provably indistinguishable — the maker is therefore
 * allowed to normalise one to the other. Byte equality is deliberately NOT the
 * oracle here; the pre-edit record is, compared through the engine.
 */
import { describe, expect, it } from 'vitest'
import { readGrid, writeGrid } from '@ui/PieceMoves'
import { bundledContentSource } from '@content/sets/bundled'
import { reachOf, type PieceLike } from '../helpers/reach'

type Rec = Record<string, unknown>

const knight = (bundledContentSource.pieces as Rec[]).find((p) => p.id === 'piece.knight')
if (!knight) throw new Error('bundled fixture no longer defines piece.knight')

const OCCUPANTS = [
  { square: 'f7', side: 'black' as const },
  { square: 'd7', side: 'white' as const },
]

describe('AC-005 — jump normalisation is behaviour-preserving', () => {
  it('opens the bundled knight in the grid rather than refusing', () => {
    const grid = readGrid(knight)
    expect(grid).not.toBeNull()
    if (!grid) return
    expect(grid.cells['1,2']).toBeDefined()
    expect(Object.values(grid.slides).every((v) => v === 0)).toBe(true)
  })

  it('re-saves to a record with identical legal destinations', () => {
    const grid = readGrid(knight)!
    const written = writeGrid(grid)
    expect(written.ok).toBe(true)
    if (!written.ok) return
    const resaved: PieceLike = { movement: written.movement, attack: written.attack }

    for (const side of ['white', 'black'] as const) {
      const before = reachOf(knight as unknown as PieceLike, { origin: 'e5', side, occupants: OCCUPANTS })
      const after = reachOf(resaved, { origin: 'e5', side, occupants: OCCUPANTS })
      expect(after).toEqual(before)
      // Not vacuous: the knight really does have somewhere to go from e5.
      expect(after.all.length).toBeGreaterThan(0)
    }
  })

  it('re-emits the leap bucket as step — the de facto per-record migration', () => {
    // Recorded deliberately (PLAN R-6): the simple maker has no path that
    // authors `jump`, so an open-and-save rewrites it. AC-005 sanctions the
    // rewrite; this pins that it is the only thing that changed.
    const written = writeGrid(readGrid(knight)!)
    expect(written.ok).toBe(true)
    if (!written.ok) return
    expect((written.movement as Array<{ kind: string }>).map((p) => p.kind)).toEqual(['step'])
  })
})
