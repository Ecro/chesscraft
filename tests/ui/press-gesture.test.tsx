// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { PRESS_HOLD_MS, PRESS_TOLERANCE_PX, usePressInspect } from '@ui/usePressInspect'

/**
 * AC-003 — one pointer sequence resolves to AT MOST ONE commit.
 *
 * This is a property over generated sequences rather than a handful of examples,
 * and the choice is not stylistic. The failure it guards against is recorded
 * twice in this repo (`[fail:design] rule-keyed-to-event-not-state`): an action
 * keyed to the input that usually triggers it, which then also fires by a route
 * nobody enumerated. Examples test the routes you thought of; the property
 * tests the ones you did not.
 *
 * The relation holds regardless of the threshold values and regardless of how
 * the arbiter is written, which is what keeps the oracle independent of the
 * implementation it judges — an arbiter that fires both cannot satisfy it by
 * being restructured.
 */

type Outcome = { inspect: number; tap: number; drag: number }

function harness() {
  const seen: Outcome & { cancel: number } = { inspect: 0, tap: 0, drag: 0, cancel: 0 }
  const hook = renderHook(() =>
    usePressInspect({
      onInspect: () => { seen.inspect += 1 },
      onTap: () => { seen.tap += 1 },
      onDrag: () => { seen.drag += 1 },
      onCancel: () => { seen.cancel += 1 },
    }),
  )
  return { seen, get h() { return hook.result.current }, unmount: hook.unmount }
}

const at = (x: number, y: number, pointerId?: number) => ({
  clientX: x,
  clientY: y,
  ...(pointerId === undefined ? {} : { pointerId }),
})

/** One generated sequence. `clickAfter` models the browser's trailing click. */
interface Seq {
  displacement: number
  holdMs: number
  endSquare: 'same' | 'other'
  cancel: boolean
  clickAfter: boolean
}

function drive(h: ReturnType<typeof harness>, s: Seq) {
  act(() => { h.h.onPointerDown('a1', at(0, 0)) })
  if (s.displacement > 0) act(() => { h.h.onPointerMove(at(s.displacement, 0)) })
  act(() => { vi.advanceTimersByTime(s.holdMs) })
  if (s.cancel) {
    act(() => { h.h.onPointerCancel() })
  } else {
    act(() => { h.h.onPointerUp(s.endSquare === 'same' ? 'a1' : 'b2') })
    // A real browser delivers `click` after `pointerup` on the same element.
    if (s.clickAfter && s.endSquare === 'same') act(() => { h.h.onClick('a1') })
  }
}

/** The generated domain: displacement and hold straddle both thresholds. */
const SEQUENCES: Seq[] = (() => {
  const out: Seq[] = []
  for (const displacement of [0, PRESS_TOLERANCE_PX - 1, PRESS_TOLERANCE_PX, PRESS_TOLERANCE_PX + 1, 200]) {
    for (const holdMs of [0, PRESS_HOLD_MS - 1, PRESS_HOLD_MS, PRESS_HOLD_MS + 1, 5_000]) {
      for (const endSquare of ['same', 'other'] as const) {
        for (const cancel of [false, true]) {
          for (const clickAfter of [false, true]) {
            out.push({ displacement, holdMs, endSquare, cancel, clickAfter })
          }
        }
      }
    }
  }
  return out
})()

describe('AC-003: press, tap and drag are mutually exclusive', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('generates a domain that straddles both thresholds', () => {
    // Guards the vacuous pass — a shrunk domain would make every case below
    // trivially true while reporting the same green.
    expect(SEQUENCES.length).toBe(200)
  })

  it('never produces more than one commit, for any sequence', () => {
    const offenders: Array<{ seq: Seq; seen: Outcome }> = []
    for (const seq of SEQUENCES) {
      const h = harness()
      drive(h, seq)
      const total = h.seen.inspect + h.seen.tap + h.seen.drag
      if (total > 1) offenders.push({ seq, seen: { ...h.seen } })
      h.unmount()
    }
    expect(offenders).toEqual([])
  })

  it('never inspects once the pointer has left the tolerance', () => {
    const offenders: Seq[] = []
    for (const seq of SEQUENCES.filter((s) => s.displacement > PRESS_TOLERANCE_PX)) {
      const h = harness()
      drive(h, seq)
      if (h.seen.inspect > 0) offenders.push(seq)
      h.unmount()
    }
    expect(offenders).toEqual([])
  })

  it('inspects when the hold completes inside the tolerance, and then commits nothing else', () => {
    const h = harness()
    drive(h, { displacement: 0, holdMs: PRESS_HOLD_MS, endSquare: 'same', cancel: false, clickAfter: true })
    expect(h.seen).toEqual({ inspect: 1, tap: 0, drag: 0, cancel: 0 })
  })

  it('taps when the finger lifts before the hold completes', () => {
    const h = harness()
    drive(h, { displacement: 0, holdMs: PRESS_HOLD_MS - 1, endSquare: 'same', cancel: false, clickAfter: true })
    expect(h.seen).toEqual({ inspect: 0, tap: 1, drag: 0, cancel: 0 })
  })

  it('drags when the finger lifts on another square', () => {
    const h = harness()
    drive(h, { displacement: 200, holdMs: 10, endSquare: 'other', cancel: false, clickAfter: false })
    expect(h.seen).toEqual({ inspect: 0, tap: 0, drag: 1, cancel: 0 })
  })

  it('still taps for a keyboard activation, which has no pointer sequence', () => {
    const h = harness()
    act(() => { h.h.onClick('a1') })
    expect(h.seen).toEqual({ inspect: 0, tap: 1, drag: 0, cancel: 0 })
  })

  it('commits nothing when the sequence is cancelled, and says so', () => {
    const h = harness()
    drive(h, { displacement: 0, holdMs: 10, endSquare: 'same', cancel: true, clickAfter: false })
    // `onCancel` is not decoration: the caller selects eagerly on pointerdown,
    // so a cancellation nobody reports leaves that selection behind.
    expect(h.seen).toEqual({ inspect: 0, tap: 0, drag: 0, cancel: 1 })
  })
})

/**
 * The windows the second-opinion review opened.
 *
 * Every case below was reachable before the fixes in this round and by nothing
 * in the suite above — which is the point of writing them here rather than
 * asserting the fixes exist. The generated domain covered ONE pointer sequence
 * at a time, so it could not see a keystroke arriving after a drag, a second
 * finger, or a release the board never saw.
 */
describe('AC-003 (round 2): sequences the first version could not see', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('still taps on a keyboard activation that FOLLOWS a drag', () => {
    const h = harness()
    // A drag ending on another square produces no `click` on either square —
    // the browser dispatches it to their common ancestor. The old guard was a
    // single boolean armed on every pointer-up, so nothing ever cleared it and
    // the next Enter/Space was eaten. One lost keystroke per drag.
    act(() => { h.h.onPointerDown('a1', at(0, 0, 1)) })
    act(() => { h.h.onPointerMove(at(200, 0, 1)) })
    act(() => { h.h.onPointerUp('b2', at(200, 0, 1)) })
    expect(h.seen.drag).toBe(1)

    act(() => { h.h.onClick('c3') })
    expect(h.seen.tap, 'the keyboard activation after a drag must not be swallowed').toBe(1)
  })

  it('swallows only the click on the square that produced it', () => {
    const h = harness()
    act(() => { h.h.onPointerDown('a1', at(0, 0, 1)) })
    act(() => { h.h.onPointerUp('a1', at(0, 0, 1)) })
    expect(h.seen.tap).toBe(1)
    // The trailing click on the SAME square is the duplicate.
    act(() => { h.h.onClick('a1') })
    expect(h.seen.tap).toBe(1)
    // A click on any other square is a fresh activation, not the trailing one.
    act(() => { h.h.onClick('d4') })
    expect(h.seen.tap).toBe(2)
  })

  it('ignores a second finger instead of letting it resolve the first gesture', () => {
    const h = harness()
    act(() => { h.h.onPointerDown('a1', at(0, 0, 1)) })
    // Second finger lands elsewhere and lifts. Before pointer identity was
    // tracked it replaced the stored sequence, and this lift committed a tap
    // for a gesture the first finger was still holding.
    act(() => { h.h.onPointerDown('f6', at(300, 300, 2)) })
    act(() => { h.h.onPointerUp('f6', at(300, 300, 2)) })
    expect(h.seen).toEqual({ inspect: 0, tap: 0, drag: 0, cancel: 0 })

    // The first finger still owns the board and still resolves normally.
    act(() => { vi.advanceTimersByTime(PRESS_HOLD_MS) })
    expect(h.seen.inspect).toBe(1)
  })

  it('sees movement that leaves the board, and does not inspect after it', () => {
    const h = harness()
    act(() => { h.h.onPointerDown('a1', at(0, 0, 7)) })
    // The finger slides off the board entirely. No square receives this move,
    // so before the window listeners existed the displacement was invisible:
    // the tolerance never tripped and the hold timer opened a sheet for a
    // gesture that had left the board.
    act(() => {
      window.dispatchEvent(new window.PointerEvent('pointermove', { clientX: 500, clientY: 500, pointerId: 7 }))
    })
    act(() => { vi.advanceTimersByTime(PRESS_HOLD_MS + 50) })
    expect(h.seen.inspect, 'a gesture that left the board must not inspect').toBe(0)
  })

  it('treats a release that no square claimed as a cancellation', () => {
    const h = harness()
    act(() => { h.h.onPointerDown('a1', at(0, 0, 7)) })
    act(() => {
      window.dispatchEvent(new window.PointerEvent('pointerup', { clientX: 500, clientY: 500, pointerId: 7 }))
    })
    // Nothing was committed, and the caller was told so it can undo the eager
    // selection `beginDrag` took on the way down.
    expect(h.seen).toEqual({ inspect: 0, tap: 0, drag: 0, cancel: 1 })
  })

  it('lets a square resolve its own release before the window listener sees it', () => {
    const h = harness()
    act(() => { h.h.onPointerDown('a1', at(0, 0, 7)) })
    // React's delegated handler runs first for a release over a square; the
    // window listener must then find nothing to do rather than cancelling a
    // gesture that already committed.
    act(() => { h.h.onPointerUp('a1', at(0, 0, 7)) })
    act(() => {
      window.dispatchEvent(new window.PointerEvent('pointerup', { clientX: 0, clientY: 0, pointerId: 7 }))
    })
    expect(h.seen).toEqual({ inspect: 0, tap: 1, drag: 0, cancel: 0 })
  })

  it('does not leak window listeners across sequences', () => {
    const h = harness()
    const added: string[] = []
    const removed: string[] = []
    const addSpy = vi.spyOn(window, 'addEventListener').mockImplementation(((type: string) => {
      added.push(type)
    }) as never)
    const removeSpy = vi.spyOn(window, 'removeEventListener').mockImplementation(((type: string) => {
      removed.push(type)
    }) as never)

    act(() => { h.h.onPointerDown('a1', at(0, 0, 1)) })
    act(() => { h.h.onPointerUp('a1', at(0, 0, 1)) })
    act(() => { h.h.onPointerDown('b2', at(0, 0, 2)) })
    act(() => { h.h.onPointerCancel() })

    addSpy.mockRestore()
    removeSpy.mockRestore()
    // Two sequences, two installs and two removals of each listener. A leak
    // here is silent: the board keeps working while every finished gesture
    // leaves another live handler behind it.
    expect(added.filter((t) => t === 'pointerup')).toHaveLength(2)
    expect(removed.filter((t) => t === 'pointerup')).toHaveLength(2)
  })
})
