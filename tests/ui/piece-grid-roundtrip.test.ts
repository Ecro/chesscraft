/**
 * AC-004 — opening and re-saving never changes what a piece does.
 *
 * Quantified over every piece in the three shipped content sets that the reader
 * accepts, plus a synthesised record whose move and capture sets differ in BOTH
 * buckets at once. The both-bucket case is required (PLAN Phase 1): with only
 * one bucket differing, an `attack`-omission check that compares by array order
 * instead of by kind still passes.
 *
 * The oracle is the engine, which shares no code with the grid compiler — a
 * compiler that silently drops a pattern, a `forward` flag or a reach cap
 * cannot satisfy this by agreeing with itself.
 */
import { describe, expect, it } from 'vitest'
import { readGrid, writeGrid } from '@ui/PieceMoves'
import { bundledContentSource } from '@content/sets/bundled'
import { sliceContentSource } from '@content/sets/slice'
import { gate6aContentSource } from '@content/sets/gate6a'
import { reachOf, type PieceLike } from '../helpers/reach'

type Rec = Record<string, unknown>

/** Every distinct piece record across the shipped sets, by id. */
function shippedPieces(): Array<{ id: string; rec: Rec }> {
  const seen = new Map<string, Rec>()
  for (const src of [bundledContentSource, sliceContentSource, gate6aContentSource]) {
    for (const p of src.pieces as Rec[]) {
      const id = String(p.id)
      if (!seen.has(id)) seen.set(id, p)
    }
  }
  return [...seen].map(([id, rec]) => ({ id, rec }))
}

/**
 * A piece whose move and capture squares differ in the slide bucket AND the
 * step bucket simultaneously — walks north/east, takes south/west, hops
 * forward-left, takes forward-right.
 */
const BOTH_BUCKETS: Rec = {
  movement: [
    { kind: 'slide', vectors: [[0, 1], [1, 0]], maxDistance: 2 },
    { kind: 'step', vectors: [[-1, 2]] },
  ],
  attack: [
    { kind: 'slide', vectors: [[0, -1], [-1, 0]], maxDistance: 2 },
    { kind: 'step', vectors: [[1, 2]] },
  ],
}

/** Occupancy that makes blocking, capturing and empty-square moves all live. */
const OCCUPANTS = [
  { square: 'e7', side: 'black' as const },
  { square: 'c5', side: 'black' as const },
  { square: 'e3', side: 'white' as const },
  { square: 'g5', side: 'white' as const },
  { square: 'f7', side: 'black' as const },
]

function sameReach(before: PieceLike, after: PieceLike): void {
  for (const side of ['white', 'black'] as const) {
    for (const origin of ['e5', 'c3', 'g7']) {
      const a = reachOf(before, { origin, side, occupants: OCCUPANTS })
      const b = reachOf(after, { origin, side, occupants: OCCUPANTS })
      expect({ origin, side, ...b }).toEqual({ origin, side, ...a })
    }
  }
}

describe('AC-004 — read then write preserves legal destinations', () => {
  const cases = [...shippedPieces(), { id: 'synthetic.both-buckets', rec: BOTH_BUCKETS }]
  const accepted = cases.filter((c) => readGrid(c.rec) !== null)

  it('accepts a meaningful share of the shipped pieces', () => {
    // Guards against the property below going vacuous: if the reader started
    // refusing everything, every case would be filtered out and the suite would
    // still be green.
    expect(accepted.length).toBeGreaterThanOrEqual(cases.length - 1)
    expect(accepted.map((c) => c.id)).toContain('synthetic.both-buckets')
  })

  it.each(accepted)('$id survives a no-op edit', ({ rec }) => {
    const grid = readGrid(rec)
    expect(grid).not.toBeNull()
    if (!grid) return
    const written = writeGrid(grid)
    expect(written.ok).toBe(true)
    if (!written.ok) return
    sameReach(rec as unknown as PieceLike, { movement: written.movement, attack: written.attack })
  })

  it('is idempotent — a second no-op edit changes nothing either', () => {
    const grid = readGrid(BOTH_BUCKETS)
    if (!grid) throw new Error('the both-bucket fixture must be readable')
    const once = writeGrid(grid)
    if (!once.ok) throw new Error('the both-bucket fixture must be writable')
    const twice = writeGrid(readGrid({ movement: once.movement, attack: once.attack })!)
    if (!twice.ok) throw new Error('a written record must be re-readable')
    expect(twice).toEqual(once)
  })
})
