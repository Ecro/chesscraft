/**
 * The paint reducer, shared — the second time this exact defect was found.
 *
 * `togglePlacement` was unified when a reviewer noticed the room and the board
 * record disagreed about what a tap on an occupied square does. The PAINT half
 * was left duplicated in that same change, and a round-1 review finding
 * (cross-model, P1) caught what the two copies had drifted into. Both drifts
 * produced documents the loader refuses, from ordinary taps:
 *
 * 1. Painting over one half of a portal pair REPLACED that entry in place, so
 *    the other half kept pointing at a square that no longer paired back.
 * 2. Tapping the same square twice while arming a pair wrote two entries for one
 *    square, each paired with itself.
 *
 * These are unit tests on the reducer rather than on either screen, because the
 * point is that there is now only one answer to test.
 */
import { describe, expect, it } from 'vitest'
import { type PaintedSquare, erasePaint, paintSquare } from '@ui/PlacementPainter'

const PAIRED = 'square.portal'
const PLAIN = 'square.lava'
const isPaired = (id: string) => id === PAIRED

/** a1 and a6 as a portal pair, the shape the schema requires. */
const pair = (): PaintedSquare[] => [
  { square: 'a1', typeId: PAIRED, pairedWith: 'a6' },
  { square: 'a6', typeId: PAIRED, pairedWith: 'a1' },
]

/** Every `pairedWith` points at a square that points back. */
function pairsAreWhole(list: readonly PaintedSquare[]) {
  const by = new Map(list.map((s) => [s.square, s]))
  return list
    .filter((s) => s.pairedWith !== undefined)
    .every((s) => by.get(s.pairedWith!)?.pairedWith === s.square)
}

describe('painting over half a pair takes the other half with it', () => {
  it('leaves no square pointing at a partner that does not point back', () => {
    const out = paintSquare(pair(), 'a1', PLAIN, isPaired, null).squares!
    expect(pairsAreWhole(out), `orphan left behind: ${JSON.stringify(out)}`).toBe(true)
    expect(out.find((s) => s.square === 'a1')).toEqual({ square: 'a1', typeId: PLAIN })
    expect(out.find((s) => s.square === 'a6'), 'the widowed half must go').toBeUndefined()
  })

  it('the same holds for the erase tool', () => {
    const out = paintSquare(pair(), 'a6', '', isPaired, null).squares!
    expect(out).toEqual([])
  })

  it('and for tapping a square that already holds the selected type', () => {
    const out = paintSquare(pair(), 'a1', PAIRED, isPaired, null).squares!
    expect(out).toEqual([])
  })
})

describe('arming a pair', () => {
  it('the first tap only arms; nothing is written yet', () => {
    const result = paintSquare([], 'c3', PAIRED, isPaired, null)
    expect(result.pendingPair).toBe('c3')
    expect(result.squares, 'a half-declared pair must not reach the document').toBeUndefined()
  })

  it('tapping the same square again cancels rather than pairing it with itself', () => {
    const result = paintSquare([], 'c3', PAIRED, isPaired, 'c3')
    expect(result.pendingPair).toBeNull()
    expect(result.squares, 'the cancel must write nothing at all').toBeUndefined()
  })

  it('a second, different square completes the pair both ways', () => {
    const out = paintSquare([], 'd4', PAIRED, isPaired, 'c3').squares!
    expect(out).toEqual([
      { square: 'c3', typeId: PAIRED, pairedWith: 'd4' },
      { square: 'd4', typeId: PAIRED, pairedWith: 'c3' },
    ])
    expect(pairsAreWhole(out)).toBe(true)
  })

  it('completing a pair onto a square that held a DIFFERENT pair clears that one first', () => {
    const out = paintSquare(pair(), 'd4', PAIRED, isPaired, 'e5').squares!
    expect(pairsAreWhole(out), `orphan left behind: ${JSON.stringify(out)}`).toBe(true)
    expect(out.map((s) => s.square).sort()).toEqual(['a1', 'a6', 'd4', 'e5'])
  })

  it('tapping a square that already holds the armed type erases it, and drops the arm', () => {
    // Faithful to the room, which is the reference implementation: the
    // "tap the same type again to remove it" rule is checked BEFORE the pairing
    // protocol, so this erases rather than completing the pair. Asserted rather
    // than left implicit, because the ordering is the surprising part and a
    // future reader is likelier to change it by accident than on purpose.
    const result = paintSquare(pair(), 'a1', PAIRED, isPaired, 'd4')
    expect(result.squares).toEqual([])
    expect(result.pendingPair).toBeNull()
  })
})

describe('erasePaint', () => {
  it('never mutates the list it is given', () => {
    const input = pair()
    const copy = JSON.stringify(input)
    erasePaint(input, 'a1')
    expect(JSON.stringify(input)).toBe(copy)
  })

  it('is a no-op on a square that holds nothing', () => {
    expect(erasePaint(pair(), 'h8')).toEqual(pair())
  })
})
