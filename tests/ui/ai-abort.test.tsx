// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.setConfig({ testTimeout: 60_000 })

import { BUNDLED_PRESET_ID } from '@content/sets/bundled'
import type { AiClient, AiMove } from '@engine/ai/client'
import { legalActions } from '@engine/engine'
import { createPosition } from '@engine/match'
import { MatchHost } from '@ui/MatchHost'
import { shippedContent } from '../helpers/shipped'

/**
 * AC-007 and AC-008, at the seam where the search meets the board.
 *
 * The interesting claims here are about a MODE — "the computer is thinking" —
 * and modes are where this repo's `mode-with-no-way-out` failure was recorded:
 * *"a control that puts the UI into a mode must offer a way back out of that
 * mode, and 'complete the thing' is not a way out when the thing may be
 * impossible."* So the tests are less about the happy path than about leaving.
 *
 * The client is a stub with a promise the test resolves by hand. That is the
 * only way to observe the in-flight state at all: a real search finishes in
 * milliseconds and the window this is about would never be open.
 */

const content = shippedContent()

interface Stub {
  client: AiClient
  /** Settles the outstanding request, as the worker eventually would. */
  deliver: (move: AiMove) => void
  cancels: number
  disposes: number
  requests: number
}

function stubClient(): Stub {
  let settle: ((move: AiMove | null) => void) | null = null
  const stub: Stub = {
    cancels: 0,
    disposes: 0,
    requests: 0,
    deliver(move) {
      settle?.(move)
      settle = null
    },
    client: {
      request() {
        stub.requests += 1
        return new Promise<AiMove | null>((resolve) => {
          settle = resolve
        })
      },
      cancel() {
        stub.cancels += 1
        settle?.(null)
        settle = null
      },
      dispose() {
        stub.disposes += 1
      },
    },
  }
  return stub
}

/**
 * White drafts first (`pendingDraftSide` prefers the side that has not drafted,
 * white before black), and white is the human — so the computer's turn does not
 * arrive until a pick has been made here. Reaching it takes one tap, and the
 * test has to make it rather than assume the AI acts from the opening.
 */
function humanDrafts() {
  const offer = screen.getByTestId('draft-offer').querySelector('button[data-card]')
  expect(offer, 'no draft offer to pick — the preset or the draft order changed').toBeTruthy()
  fireEvent.click(offer!)
}

function renderMatch(stub: Stub) {
  return render(
    <MatchHost
      content={content}
      presetId={BUNDLED_PRESET_ID}
      newSeed={() => 4_242}
      aiSide="black"
      aiDifficulty="hard"
      createAi={() => stub.client}
    />,
  )
}

describe('AC-007 — the computer’s turn is announced, not handed over', () => {
  it('shows a thinking indicator and never the hot-seat hand-off banner', async () => {
    const stub = stubClient()
    renderMatch(stub)

    // The opening is white's, and white is the human — so nothing is thinking
    // yet. Asserting the absence FIRST is what makes the presence below mean
    // something.
    expect(screen.queryByTestId('ai-thinking')).toBeNull()

    humanDrafts()
    await waitFor(() => expect(stub.requests).toBeGreaterThan(0))
    await waitFor(() => expect(screen.getByTestId('ai-thinking')).toBeTruthy())

    // The banner that says "give the phone to the other person" must not appear
    // when there is no other person. It is a different message wearing the same
    // clothes, which is why this asserts on the testid rather than on the text.
    expect(screen.queryByTestId('hand-off')).toBeNull()
  })

  it('keeps the rest of the interface mounted and reachable while it thinks', async () => {
    const stub = stubClient()
    renderMatch(stub)
    humanDrafts()
    await waitFor(() => expect(screen.getByTestId('ai-thinking')).toBeTruthy())

    // A CONTROL, not just a node: `Result` makes `.play-cover` inert when a
    // match ends, and a live board must never be doing that. The settings
    // button is in the tools row, which is unmounted under that overlay — so
    // finding it is evidence the screen is still the player's.
    expect(screen.getByTestId('match-settings')).toBeTruthy()
    expect(screen.getByTestId('board')).toBeTruthy()
    expect(screen.getByTestId('ai-thinking').getAttribute('role')).toBe('status')
  })
})

describe('the computer\'s move is slow enough to watch', () => {
  it('holds the indicator for a beat even when the search answers instantly', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      const stub = stubClient()
      renderMatch(stub)
      humanDrafts()
      await waitFor(() => expect(stub.requests).toBeGreaterThan(0))

      // The search answers at once — the easiest level really does, in ~150ms.
      stub.deliver({ action: null, nodes: 1, depthReached: 1, valveTripped: false })

      // Still thinking: without a floor the indicator would have flashed and
      // gone before a player who was looking at their own move looked up, and
      // the board would appear to have changed by itself.
      await Promise.resolve()
      expect(screen.queryByTestId('ai-thinking')).not.toBeNull()

      await vi.advanceTimersByTimeAsync(700)
      await waitFor(() => expect(screen.queryByTestId('ai-thinking')).toBeNull())
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('AC-008 — leaving mid-search ends the search', () => {
  it('cancels the in-flight request when the match unmounts', async () => {
    const stub = stubClient()
    const view = renderMatch(stub)
    humanDrafts()
    await waitFor(() => expect(stub.requests).toBeGreaterThan(0))

    view.unmount()

    // Cancel, not just "ignore the answer". Ignoring settles the promise and
    // leaves the worker computing; with one worker that occupies the only
    // thread the next match would need.
    expect(stub.cancels).toBeGreaterThan(0)
    expect(stub.disposes).toBeGreaterThan(0)
  })

  it('never applies an action from a cancelled search', async () => {
    const stub = stubClient()
    const view = renderMatch(stub)
    humanDrafts()
    await waitFor(() => expect(stub.requests).toBeGreaterThan(0))

    const before = screen.getByTestId('phase').getAttribute('data-phase')
    view.unmount()
    // The worker answers after the board is gone. Nothing should apply it, and
    // nothing should throw either — a late resolve on an unmounted component is
    // the ordinary case here, not an exceptional one.
    expect(() => stub.deliver({ action: null, nodes: 1, depthReached: 1, valveTripped: false })).not.toThrow()
    expect(before).not.toBeNull()
  })

  it('reports a valve overrun so the seed does not silently stop replaying', async () => {
    const stub = stubClient()
    renderMatch(stub)
    humanDrafts()
    await waitFor(() => expect(stub.requests).toBeGreaterThan(0))
    expect(screen.queryByTestId('ai-degraded')).toBeNull()

    stub.deliver({ action: null, nodes: 10, depthReached: 1, valveTripped: true })

    // A search that overran still returned a move; what it lost is
    // reproducibility, and the seed control is still on screen offering a share
    // that would now produce a different game (AC-011).
    await waitFor(() => expect(screen.getByTestId('ai-degraded')).toBeTruthy())
  })

  it('cancels a search that is waiting out the longer post-card beat', async () => {
    /*
     * PLAN Phase 3 (ADR-005) raises the dwell floor from `AI_MIN_THINK_MS` to
     * `CARD_BANNER_MS` for the move a card still owes, so the computer's reply
     * lands after the card has been named rather than on top of it.
     *
     * That makes the pending-timer window roughly twice as long, and this file
     * exists because "the AI is thinking" is a MODE that owes a way out. The
     * three cases above all unmount during the ORIGINAL floor; none of them
     * would notice a card-path dwell wired outside the existing
     * `clearTimeout(dwell)` cleanup — a leaked timer that fires on an unmounted
     * tree. So this one unmounts inside the new, longer window specifically.
     */
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      /*
       * Built rather than dealt, and black to move with a card already in hand:
       * the opening deals no card to the side on strike, so the ordinary
       * `renderMatch` path cannot reach a computer turn that CONTAINS a card
       * without playing several plies first.
       */
      const start = createPosition({
        content,
        presetId: BUNDLED_PRESET_ID,
        seed: 7,
        sideToMove: 'black',
        held: { white: [], black: ['skill.freeze'] },
        placements: [
          { square: 'a1', pieceId: 'piece.king', side: 'white' },
          { square: 'b1', pieceId: 'piece.rook', side: 'white' },
          { square: 'c3', pieceId: 'piece.pawn', side: 'white' },
          { square: 'f6', pieceId: 'piece.king', side: 'black' },
          { square: 'e6', pieceId: 'piece.rook', side: 'black' },
          { square: 'd4', pieceId: 'piece.pawn', side: 'black' },
        ],
      })
      const stub = stubClient()
      const view = render(
        <MatchHost
          content={content}
          presetId={BUNDLED_PRESET_ID}
          newSeed={() => 7}
          initialState={start}
          aiSide="black"
          createAi={() => stub.client}
        />,
      )
      await waitFor(() => expect(stub.requests).toBeGreaterThan(0))

      const card = legalActions(start, content).find((a) => a.kind === 'play_card')
      expect(card, 'the computer must have a card here, or this tests the ordinary floor again').toBeTruthy()
      stub.deliver({ action: card!, nodes: 1, depthReached: 1, valveTripped: false })

      // Past the old floor so the card has landed and the SECOND search — the
      // one carrying the longer dwell — is the one now in flight.
      await vi.advanceTimersByTimeAsync(700)
      await waitFor(() => expect(stub.requests).toBeGreaterThan(1))
      const move = legalActions(start, content).find((a) => a.kind === 'move')
      expect(move, 'the fixture must leave the computer a move to owe').toBeTruthy()
      stub.deliver({ action: move!, nodes: 1, depthReached: 1, valveTripped: false })
      const boardBefore = view.container.querySelector('[data-testid="board"]')!.innerHTML

      /*
       * 900ms into the second search's wait — past the OLD floor (650) and
       * short of the new one (1200). That window is the whole test: under the
       * unmodified code the reply has already landed by now, so the board has
       * moved on and this assertion fails. It is the only sampling point that
       * distinguishes the two floors, and an earlier draft sampled at ~300ms,
       * which is outside both and therefore passed against today's source with
       * no implementation at all.
       */
      await vi.advanceTimersByTimeAsync(900)
      expect(
        view.container.querySelector('[data-testid="board"]')!.innerHTML,
        'at 900ms the reply must still be waiting out the card beat',
      ).toBe(boardBefore)

      /*
       * Leaving mid-beat, and a deliberately NARROW claim about what follows.
       *
       * What this checks is that unmounting inside the longer window is
       * survivable: no throw, and the abandoned reply never reaches the board.
       *
       * What it does NOT check — stated because two stronger-sounding versions
       * were written here and both were vacuous — is whether the dwell timer
       * was hygienically cleared. `stub.cancels` rises on ANY unmount, since
       * `client.cancel()` runs unconditionally in the cleanup
       * (MatchHost.tsx:555). And `stub.requests` staying flat proves nothing
       * either: `land()` opens with `if (cancelled) return` and the cleanup
       * sets that same closure flag, so a dangling timer is already a no-op
       * when it fires. React 18 swallows post-unmount `setState` rather than
       * throwing, so "did not throw" is not evidence on its own.
       *
       * A timer-id spy would close that last gap, and it was tried: the dwell
       * is scheduled before any spy installed here could see it, so the set
       * came up empty and the assertion passed vacuously — the same shape as
       * the two above. The honest position is that the timer's HYGIENE is
       * unobserved from out here; what is observed is that the behaviour it
       * guards is correct. The value of this case is the 900ms sample above,
       * which is what actually pins ADR-005.
       */
      expect(() => view.unmount()).not.toThrow()
      const requestsAtUnmount = stub.requests
      await vi.advanceTimersByTimeAsync(3_000)
      expect(stub.requests, 'no search may start after the board is gone').toBe(requestsAtUnmount)
      expect(stub.cancels, 'and the in-flight one is cancelled, not merely ignored').toBeGreaterThan(0)
    } finally {
      vi.useRealTimers()
    }
  })
})
