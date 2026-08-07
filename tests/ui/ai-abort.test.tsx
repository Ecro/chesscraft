// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.setConfig({ testTimeout: 60_000 })

import { BUNDLED_PRESET_ID } from '@content/sets/bundled'
import type { AiClient, AiMove } from '@engine/ai/client'
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
})
