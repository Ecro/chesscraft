import { useEffect, useRef } from 'react'
import type { SquareId } from '@engine/types'

/** How long a finger must stay down before the press counts as an inspect. */
export const PRESS_HOLD_MS = 450

/** How far it may drift while doing so, in CSS pixels. */
export const PRESS_TOLERANCE_PX = 8

/**
 * A pointer position, plus what is needed to tell one finger from another.
 *
 * A React `PointerEvent` and a native `PointerEvent` both satisfy this
 * structurally, which is the point — the caller passes the event straight
 * through and the hook never learns about React. `pointerId` is optional so a
 * test can drive the arbiter with a bare coordinate pair.
 */
export interface Point {
  clientX: number
  clientY: number
  pointerId?: number
}

export interface PressInspectOptions {
  /** Opens the detail for a square. Fires at most once per pointer sequence. */
  onInspect: (sq: SquareId) => void
  /** The existing single-square action — select, place a card target, move. */
  onTap: (sq: SquareId) => void
  /** A drag that ended on a different square than it began. */
  onDrag: (from: SquareId, to: SquareId) => void
  /**
   * The sequence ended without reaching a square, or the browser took it away.
   *
   * Optional, but a caller that takes an eager side effect on pointerdown MUST
   * supply it — otherwise that side effect outlives a gesture the user never
   * completed.
   */
  onCancel?: () => void
  holdMs?: number
  tolerancePx?: number
}

export interface PressInspectHandlers {
  onPointerDown: (sq: SquareId, point: Point) => void
  onPointerMove: (point: Point) => void
  onPointerUp: (sq: SquareId, point?: Point) => void
  onPointerCancel: () => void
  /** Keyboard activation. Pointer-driven clicks are swallowed here. */
  onClick: (sq: SquareId) => void
}

/**
 * The board's pointer arbiter: at most one of inspect / tap / drag per sequence.
 *
 * ## Why this owns tap and drag too, rather than only the press
 *
 * The obvious shape is a press timer bolted onto the existing handlers, and it
 * is the wrong one. `[fail:design] rule-keyed-to-event-not-state` is recorded in
 * this repo twice, and both instances are the same mistake: an action attached
 * to the input that USUALLY produces it, which then fires by a second route
 * nobody enumerated. A press timer beside an untouched `onClick` is exactly
 * that — the press opens a sheet and the trailing click moves the piece, one
 * finger and two commits.
 *
 * So the mutual exclusion is not a guard bolted on afterwards; it is the whole
 * of what this module decides. One pointer sequence resolves to exactly one of
 * three outcomes, chosen here, and the caller supplies what each outcome means.
 * That is also what makes the invariant testable without a browser.
 *
 * ## Why it must not ride the drag path
 *
 * `MatchHost`'s `beginDrag` refuses a square that does not hold the mover's own
 * piece, and refuses everything while a card is armed. Those guards are correct
 * for dragging and fatal for inspecting: the opponent's pieces and the
 * armed-card turn are precisely when a player asks what something is. This hook
 * therefore starts its timer on every square and leaves those guards alone —
 * `onDrag` is still free to do nothing when the caller's own rules say so.
 *
 * ## Why window listeners rather than pointer capture
 *
 * The square handlers alone only ever see events that land on a square, so a
 * finger sliding off the board is invisible: no move reports the displacement,
 * the tolerance never trips, and the hold timer opens a sheet for a gesture
 * that left the board and was released somewhere else.
 *
 * `setPointerCapture` is the usual answer and it is wrong HERE, for a reason
 * worth recording: capture retargets every later event to the captured element,
 * so the release of a drag from a1 to b2 arrives at **a1**. Every drag would
 * resolve as a tap on its origin. The destination square is the one thing this
 * arbiter cannot afford to lose.
 *
 * So the sequence installs window listeners for its own lifetime instead. They
 * see the movement wherever it goes, and a release that no square claimed is
 * treated as a cancellation. React's handlers run first (they are delegated at
 * the root, inside `window`), so a release over a square has already resolved
 * the sequence by the time the window listener looks.
 *
 * ## The keyboard
 *
 * A square is a `button`, so Enter and Space arrive as `click` with no
 * preceding `pointerdown`. A pointer-driven click, by contrast, always follows
 * one — and its outcome has already been delivered by `onPointerUp`. The guard
 * therefore names the SQUARE whose click is spent rather than raising a bare
 * flag: a drag ends on a square that never receives a click, and a boolean left
 * armed there swallowed the next keystroke instead.
 */
export function usePressInspect(options: PressInspectOptions): PressInspectHandlers {
  const holdMs = options.holdMs ?? PRESS_HOLD_MS
  const tolerance = options.tolerancePx ?? PRESS_TOLERANCE_PX

  // Held in a ref rather than in state: none of it is rendered, and a setState
  // per pointermove would re-render the whole board while a finger is down.
  const seq = useRef<{
    from: SquareId
    origin: Point
    /**
     * Which physical pointer owns this sequence.
     *
     * Without it a second finger simply REPLACED the first, and the next up or
     * cancel — from either finger — resolved whichever sequence happened to be
     * stored. Two hands on a 6x6 board is not an exotic input for the player
     * this is built for.
     */
    pointerId: number | undefined
    timer: ReturnType<typeof setTimeout> | undefined
    /** The press already fired — nothing else may. */
    inspected: boolean
    /** Movement passed the tolerance — the press can no longer fire. */
    moved: boolean
  } | null>(null)

  /**
   * The square whose trailing `click` must be swallowed, or null.
   *
   * A plain boolean was wrong in a way the generated sequences could not catch,
   * because each of them was a single gesture. It was set on EVERY pointer-up,
   * including a drag — and a drag that ends on a different square produces no
   * `click` on any square (the browser dispatches it to the common ancestor).
   * Nothing then cleared the flag, so the next Enter or Space on a focused
   * square was silently discarded: one keystroke lost after every drag.
   */
  const swallowClickOn = useRef<SquareId | null>(null)

  /** Removes the window listeners installed for the sequence in flight. */
  const detach = useRef<(() => void) | null>(null)

  // Latest callbacks without restarting the timer when the parent re-renders.
  const cb = useRef(options)
  cb.current = options

  const clearTimer = () => {
    if (seq.current?.timer !== undefined) clearTimeout(seq.current.timer)
    if (seq.current) seq.current.timer = undefined
  }

  /** Tears the sequence down exactly once, whatever ended it. */
  const endSequence = () => {
    clearTimer()
    seq.current = null
    detach.current?.()
    detach.current = null
  }

  // A timer or a listener outliving the component would call into an unmounted
  // tree; a match that ends under a held finger is a real way to reach that.
  useEffect(() => () => endSequence(), [])

  /** Whether this event belongs to the sequence in flight. */
  const owns = (event: Point) =>
    seq.current !== null &&
    (seq.current.pointerId === undefined || event.pointerId === undefined || seq.current.pointerId === event.pointerId)

  const applyMovement = (point: Point) => {
    const live = seq.current
    if (!live || live.inspected || !owns(point)) return
    const dx = point.clientX - live.origin.clientX
    const dy = point.clientY - live.origin.clientY
    // Squared comparison — a hypot per pointermove is a cost with no readers.
    if (dx * dx + dy * dy > tolerance * tolerance) {
      live.moved = true
      clearTimer()
    }
  }

  const cancelSequence = () => {
    const had = seq.current !== null
    endSequence()
    // A cancelled sequence delivered nothing, so the click that will not come
    // must not be pre-swallowed either.
    swallowClickOn.current = null
    // The caller may have taken an eager side effect on pointerdown — the drag
    // highlight does — and cancellation has to undo it. Without this a touch
    // scroll that starts on your own piece leaves it selected.
    if (had) cb.current.onCancel?.()
  }

  const attachWindow = () => {
    if (typeof window === 'undefined') return
    const onMove = (event: PointerEvent) => applyMovement(event)
    const onUp = (event: PointerEvent) => {
      // A square already resolved this sequence — React's delegated handler
      // runs before the event reaches `window`. Nothing left to do.
      if (!seq.current) return
      if (!owns(event)) return
      // Released somewhere that is not a square of this board.
      cancelSequence()
    }
    const onCancelEvent = () => {
      if (seq.current) cancelSequence()
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onCancelEvent)
    detach.current = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onCancelEvent)
    }
  }

  const onPointerDown = (sq: SquareId, point: Point) => {
    // A second finger does not start a second sequence. The first one owns the
    // board until it resolves; ignoring the newcomer is what keeps an up from
    // either finger from resolving the wrong gesture.
    if (seq.current !== null && point.pointerId !== undefined && seq.current.pointerId !== point.pointerId) return

    endSequence()
    swallowClickOn.current = null
    const started = {
      from: sq,
      origin: point,
      pointerId: point.pointerId,
      timer: undefined as ReturnType<typeof setTimeout> | undefined,
      inspected: false,
      moved: false,
    }
    seq.current = started
    attachWindow()
    started.timer = setTimeout(() => {
      // Re-read through the ref: the sequence may have been replaced or
      // cancelled between scheduling and firing.
      const live = seq.current
      if (!live || live !== started || live.moved || live.inspected) return
      live.inspected = true
      live.timer = undefined
      // The press consumed the sequence; the click that follows the eventual
      // release on this square must not act on it again.
      swallowClickOn.current = live.from
      cb.current.onInspect(live.from)
    }, holdMs)
  }

  const onPointerMove = (point: Point) => applyMovement(point)

  const onPointerUp = (sq: SquareId, point?: Point) => {
    const live = seq.current
    if (!live) return
    if (point && !owns(point)) return
    endSequence()

    if (live.inspected) {
      // The press already spent this sequence. Deliberately silent: a player
      // who reads a piece has not asked to move it.
      swallowClickOn.current = live.from
      return
    }
    if (sq !== live.from) {
      // A drag produces no `click` on either square, so arming the guard here
      // would leave it armed for the next KEYBOARD activation instead.
      swallowClickOn.current = null
      cb.current.onDrag(live.from, sq)
    } else {
      swallowClickOn.current = sq
      cb.current.onTap(sq)
    }
  }

  const onPointerCancel = () => cancelSequence()

  const onClick = (sq: SquareId) => {
    if (swallowClickOn.current === sq) {
      swallowClickOn.current = null
      return
    }
    // Reaching here with a stale guard armed for some OTHER square means that
    // click never arrived; drop it rather than carrying it into the next
    // gesture.
    swallowClickOn.current = null
    cb.current.onTap(sq)
  }

  return { onPointerDown, onPointerMove, onPointerUp, onPointerCancel, onClick }
}
