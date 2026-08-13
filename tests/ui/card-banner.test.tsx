// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { loadContentSet } from '@content/load'
import { BUNDLED_PRESET_ID, bundledContentSource } from '@content/sets/bundled'
import type { AiClient, AiMove } from '@engine/ai/client'
import { legalActions } from '@engine/engine'
import { createPosition } from '@engine/match'
import type { GameState } from '@engine/types'
// Spied at the module boundary, so the sound assertion is "the component called
// this", not "the source file mentions it". `vi.hoisted` because `vi.mock` is
// lifted above every import — a factory closing over a plain `const` reads it
// before initialisation and the whole file fails to load.
const mockPlay = vi.hoisted(() => vi.fn())
vi.mock('../../src/ui/sound', async (orig) => {
  const real = (await orig()) as Record<string, unknown>
  return { ...real, play: mockPlay }
})

import { CARD_BANNER_MS, MatchHost, eventFor } from '../../src/ui/MatchHost'
import { makeTranslate } from '../../src/ui/i18n'
import { SOUND_EVENTS } from '../../src/ui/sound'

/**
 * PLAN Phase 3 — the board says which card just fired.
 *
 * The reported defect this closes: nothing on screen ever named a card. Four
 * notices existed (`rule-banner`, `hand-off`, `ai-thinking`, `ai-degraded`) and
 * none of them was about a card, so the only trace a played card left was a
 * dimmed tile in the opponent's hand and a badge that appeared in silence.
 *
 * Three properties are load-bearing and the rest is copy.
 *
 * **The banner lasts `CARD_BANNER_MS`, whatever the player does.** It is a
 * `useState` flag on a timer keyed to the derived play, not a render of the
 * derivation alone — a purely-derived banner would live exactly as long as the
 * player took to move next: gone in 200ms for a fast player, still up after
 * five seconds for a slow one. Both are covered below.
 *
 * **The human is never blocked by it.** You already know what you played.
 *
 * **The computer waits it out.** Its turn runs a card search and a move search
 * back to back, so without a beat between them both land in one perceptual
 * event and the position appears to change by itself — the exact symptom
 * `AI_MIN_THINK_MS` was introduced to fight for moves and never extended to
 * cards.
 */

afterEach(() => {
  cleanup()
  mockPlay.mockClear()
})

const content = (() => {
  const loaded = loadContentSet(bundledContentSource)
  if (!loaded.ok) throw new Error('bundled content must load')
  return loaded.set
})()

const t = makeTranslate()

/** One side to move holding a freeze, with enemy material to spend it on. */
function holdingFreeze(mover: 'white' | 'black' = 'white'): GameState {
  return createPosition({
    content,
    presetId: BUNDLED_PRESET_ID,
    seed: 7,
    sideToMove: mover,
    held: mover === 'white' ? { white: ['skill.freeze'], black: [] } : { white: [], black: ['skill.freeze'] },
    placements: [
      { square: 'a1', pieceId: 'piece.king', side: 'white' },
      { square: 'b1', pieceId: 'piece.rook', side: 'white' },
      { square: 'c3', pieceId: 'piece.pawn', side: 'white' },
      { square: 'f6', pieceId: 'piece.king', side: 'black' },
      { square: 'e6', pieceId: 'piece.rook', side: 'black' },
      { square: 'd4', pieceId: 'piece.pawn', side: 'black' },
    ],
  })
}

/**
 * Arms the freeze and commits it at the first square the board offers.
 *
 * Asserts the arming took, because a slot that silently refused would leave
 * every assertion below passing for the wrong reason — the banner would be
 * absent because no card was played, not because the code failed to show one.
 */
function playFreeze(container: HTMLElement) {
  const slot = container.querySelector<HTMLElement>('.hotbar .slot[data-card="skill.freeze"]')
  expect(slot, 'white must be holding the freeze').toBeTruthy()
  fireEvent.click(slot!)
  expect(slot!.getAttribute('data-pending'), 'the card must arm').toBe('true')
  const target = container.querySelector<HTMLElement>('[data-legal="true"]')
  expect(target, 'an armed freeze must highlight something').toBeTruthy()
  fireEvent.click(target!)
}

/**
 * A search client the test settles by hand.
 *
 * The only way to observe the in-flight window at all: a real search finishes
 * in milliseconds and the beat this file is about would never be open. Same
 * shape as `tests/ui/ai-abort.test.tsx`'s, at module scope here because two
 * describes need it.
 */
interface Stub {
  client: AiClient
  deliver: (move: AiMove) => void
  requests: number
}

function stubClient(): Stub {
  let settle: ((move: AiMove | null) => void) | null = null
  const stub: Stub = {
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
        settle?.(null)
        settle = null
      },
      dispose() {},
    },
  }
  return stub
}

/** The first legal board move on screen, played by two taps. */
function playAMove(container: HTMLElement, state: GameState) {
  const move = legalActions(state, content).find((a) => a.kind === 'move')
  expect(move, 'the fixture must leave a legal move').toBeTruthy()
  fireEvent.click(container.querySelector<HTMLElement>(`[data-testid="sq-${move!.from}"]`)!)
  fireEvent.click(container.querySelector<HTMLElement>(`[data-testid="sq-${move!.to}"]`)!)
}

describe('a card play is announced by name', () => {
  it('names the card, and never its id', () => {
    const view = render(
      <MatchHost content={content} presetId={BUNDLED_PRESET_ID} newSeed={() => 7} initialState={holdingFreeze()} />,
    )
    expect(screen.queryByTestId('card-banner'), 'nothing to announce before a card is played').toBeNull()

    playFreeze(view.container)

    const banner = screen.getByTestId('card-banner')
    const card = content.skillCards.get('skill.freeze')!
    expect(banner.textContent).toContain(t(card.nameKey))
    // AC-009: this screen may not name a record. An id on the banner would be
    // the one place the rule leaks, and it is the most visible place there is.
    expect(banner.textContent, 'a raw id must never reach the player').not.toContain('skill.freeze')
    /*
     * And no unresolved CHROME key either — the banner wraps the card's name in
     * its own `ui.card.played.*` label. `makeTranslate` returns the KEY on a
     * miss, so a label the bundle never defines renders as a dotted string in
     * front of a child, and the `toContain` above would still pass because the
     * card's own name resolves fine. Phase 1 learned this the same way
     * (`tests/ui/match-intro.test.tsx`); carrying the guard across is the point.
     */
    expect(banner.textContent, 'an unresolved key must never reach the screen').not.toMatch(/ui\.card\./)
  })

  // Both sides, because hot-seat shares one screen and "opponent" is not a
  // stable referent there. Run for each side rather than asserted once for
  // white: the two go through the same code only if someone wrote it that way,
  // and a white-only case cannot tell whether they did.
  for (const mover of ['white', 'black'] as const) {
    it(`announces a card played by ${mover}`, () => {
      // The side is on the node rather than in the words, because the words are
      // about the card. Reading the copy would be asserting the phrasing.
      const view = render(
        <MatchHost
          content={content}
          presetId={BUNDLED_PRESET_ID}
          newSeed={() => 7}
          initialState={holdingFreeze(mover)}
        />,
      )
      playFreeze(view.container)
      expect(screen.getByTestId('card-banner').getAttribute('data-side')).toBe(mover)
    })
  }
})

describe('a card play makes its own sound', () => {
  /*
   * `[fail:design] declared-but-inert-vocabulary` is at count:7 in this repo —
   * a schema or union entry that validates, ships, and is read by no code path.
   * A `card` added to `SOUND_EVENTS` and never emitted is that failure again,
   * and it is silent: the player hears the ordinary move blip and nothing looks
   * broken.
   *
   * Two halves, because either alone can be satisfied without the other.
   * `eventFor` is the pure routing function — asserted directly so the mapping
   * is pinned without a match — and the mocked `play` proves the component
   * actually calls it on the card path rather than only on moves.
   */
  it('is in the vocabulary', () => {
    expect(SOUND_EVENTS).toContain('card')
  })

  it('is what a card play routes to, and not what a move routes to', () => {
    const empty = { board: new Map<string, unknown>() }
    const ongoing = { result: null }
    expect(eventFor({ kind: 'play_card', cardId: 'skill.freeze', targets: [] }, empty, ongoing)).toBe('card')
    // The negative half: before this branch existed a card fell through to
    // 'move', so asserting only the positive would not notice a branch that
    // also swallowed ordinary moves.
    expect(eventFor({ kind: 'move', from: 'b1', to: 'b2' }, empty, ongoing)).toBe('move')
  })

  it('is played when a card resolves, and not when a piece merely moves', () => {
    const start = holdingFreeze()
    const view = render(
      <MatchHost content={content} presetId={BUNDLED_PRESET_ID} newSeed={() => 7} initialState={start} />,
    )
    playFreeze(view.container)
    expect(
      mockPlay.mock.calls.map((c) => c[0]),
      'the component must reach the event, not merely declare it',
    ).toContain('card')

    /*
     * And the negative half, through the COMPONENT rather than through
     * `eventFor`. The routing function is pinned above, but `push` calls
     * `play(eventFor(...), live)` and a version that passed a literal 'card'
     * instead would leave `eventFor` correct and every action sounding like a
     * card. Only driving a move through the mounted board can tell.
     */
    mockPlay.mockClear()
    playAMove(view.container, start)
    const afterMove = mockPlay.mock.calls.map((c) => c[0])
    expect(afterMove, 'the move must make a sound of its own').toContain('move')
    expect(afterMove, 'and it must not sound like a card').not.toContain('card')
  })
})

describe('the banner lasts its own time, not the player’s', () => {
  it('is still up when the player moves again straight away, and clears on schedule', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      const start = holdingFreeze()
      const view = render(
        <MatchHost content={content} presetId={BUNDLED_PRESET_ID} newSeed={() => 7} initialState={start} />,
      )
      playFreeze(view.container)
      expect(screen.getByTestId('card-banner')).toBeTruthy()

      // A fast player moves 200ms later. `match.states` advances past the pair
      // that shows the play — a purely-derived banner would vanish right here.
      await vi.advanceTimersByTimeAsync(200)
      playAMove(view.container, start)
      expect(screen.queryByTestId('card-banner'), 'moving must not cut the announcement short').not.toBeNull()

      /*
       * And it ends on time measured from the PLAY, not from the move.
       *
       * The arithmetic is the assertion. We are at t=200; advancing by
       * `CARD_BANNER_MS - 150` lands at t=1250, just past the deadline a timer
       * keyed to the play would hold (t=1200). A timer restarted by the move —
       * the shape `handOff` uses, `[handOff, state.plyCount]` at
       * MatchHost.tsx:397-401, which is the idiom most likely to be copied
       * here — would be counting from t=200 and would not fire until t=1400,
       * so it is still on screen at the moment this samples. An earlier draft
       * advanced by a full `CARD_BANNER_MS` and landed exactly on t=1400,
       * where both implementations have cleared and neither can be told from
       * the other.
       */
      await vi.advanceTimersByTimeAsync(CARD_BANNER_MS - 150)
      await waitFor(() =>
        expect(
          screen.queryByTestId('card-banner'),
          'the countdown runs from the card, so a later tap must not extend it',
        ).toBeNull(),
      )
    } finally {
      vi.useRealTimers()
    }
  })

  it('does not linger when the player sits still', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      const view = render(
        <MatchHost content={content} presetId={BUNDLED_PRESET_ID} newSeed={() => 7} initialState={holdingFreeze()} />,
      )
      playFreeze(view.container)
      expect(screen.getByTestId('card-banner')).toBeTruthy()

      // Nobody touches anything. A banner rendered straight off the derivation
      // would still be here at five seconds, because the history has not moved.
      await vi.advanceTimersByTimeAsync(CARD_BANNER_MS + 50)
      await waitFor(() => expect(screen.queryByTestId('card-banner')).toBeNull())
    } finally {
      vi.useRealTimers()
    }
  })

  it('stops naming a card that was taken back', () => {
    /*
     * Phase D.5 — the window the AI beat and the latch newly opened.
     *
     * The banner outlives the history pair that produced it, deliberately: that
     * is what keeps it on screen when a fast player moves straight away. The
     * cost is that it also outlives an UNDO, and an undo across a card play
     * un-plays the card. Left alone the board would go on announcing, for up to
     * a full second, a card nobody has played — which is the exact shape of the
     * bug that put `setLastMove(null)` into `doUndo` in the first place.
     *
     * Every gate in this phase was green before this case was written. It is
     * `[fail:design] fix-introduced-defect-passes-all-gates`, and the reason
     * that entry exists is that a suite which approved the feature will approve
     * its second defect too.
     */
    const view = render(
      <MatchHost content={content} presetId={BUNDLED_PRESET_ID} newSeed={() => 7} initialState={holdingFreeze()} />,
    )
    playFreeze(view.container)
    expect(screen.getByTestId('card-banner')).toBeTruthy()

    fireEvent.click(screen.getByTestId('undo'))
    expect(
      screen.queryByTestId('card-banner'),
      'an undone card must stop being announced at once, not on a timer',
    ).toBeNull()
  })

  it('never blocks the player who spent the card', () => {
    const start = holdingFreeze()
    const view = render(
      <MatchHost content={content} presetId={BUNDLED_PRESET_ID} newSeed={() => 7} initialState={start} />,
    )
    playFreeze(view.container)
    expect(screen.getByTestId('card-banner')).toBeTruthy()

    // The move the card still owes goes through while the banner is up.
    // Asserted on the BOARD, because every square carries `data-piece` (empty
    // string when vacant) — counting those nodes would count squares and would
    // be true of a board nobody could touch.
    const before = screen.getByTestId('board').innerHTML
    playAMove(view.container, start)
    expect(
      screen.getByTestId('board').innerHTML,
      'the move must land while the banner is still up',
    ).not.toBe(before)
    expect(screen.queryByTestId('card-banner'), 'and the banner must not have been dismissed by it').not.toBeNull()
  })
})

describe('the computer’s card is on screen before its move', () => {
  it('holds its move until the banner has been seen', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      const stub = stubClient()
      // The computer's turn, with a card in it and no draft pending — so the
      // AI effect fires on mount rather than waiting for a human pick.
      const start = holdingFreeze('black')
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
      const cardPlay = legalActions(start, content).find((a) => a.kind === 'play_card')
      expect(cardPlay, 'the computer must have a card it can play here').toBeTruthy()
      stub.deliver({ action: cardPlay!, nodes: 1, depthReached: 1, valveTripped: false })

      // The existing move floor elapses and the card lands.
      await vi.advanceTimersByTimeAsync(700)
      await waitFor(() => expect(screen.queryByTestId('card-banner')).not.toBeNull())

      // The second search — the move the card owes — answers instantly.
      await waitFor(() => expect(stub.requests).toBeGreaterThan(1))
      const boardAfterCard = view.container.querySelector('[data-testid="board"]')!.innerHTML
      const move = legalActions(start, content).find((a) => a.kind === 'move')
      expect(move, 'the fixture must leave the computer a move').toBeTruthy()
      stub.deliver({ action: move!, nodes: 1, depthReached: 1, valveTripped: false })

      /*
       * The beat. Past the OLD floor (700ms) but short of the banner's, the
       * board must still be the one the card left — otherwise cause and effect
       * arrive together and the position appears to change by itself, which is
       * the whole defect.
       */
      await vi.advanceTimersByTimeAsync(700)
      expect(
        view.container.querySelector('[data-testid="board"]')!.innerHTML,
        'the reply must not land while the card is still being announced',
      ).toBe(boardAfterCard)

      // And the thinking indicator does not stack on top of the banner while
      // that beat runs. The second search IS in flight here — `aiThinking` is
      // deliberately left on between the two searches (MatchHost.tsx:498) — so
      // without the ordered pick both notices would be on screen at once, at
      // the same coordinates, which is the bug ADR-004 exists for.
      /*
       * `aiThinking` is genuinely TRUE at this instant — MatchHost.tsx:498
       * deliberately holds it across the card→move hand-off so the indicator
       * does not blink off between the two searches — so the node is absent
       * only if the ordered pick suppressed it.
       *
       * There is no "banner cleared but still thinking" case to check
       * afterwards, and that is by construction rather than by omission:
       * ADR-005 makes the dwell exactly `CARD_BANNER_MS`, so the reply lands on
       * the same tick the banner clears and the window where the indicator
       * would reappear is zero-width. Asserting on it would be asserting on a
       * state the timings cannot produce.
       */
      expect(screen.queryByTestId('card-banner'), 'the banner is still up during the beat').not.toBeNull()
      expect(screen.queryByTestId('ai-thinking'), 'and nothing may stack on it').toBeNull()

      await vi.advanceTimersByTimeAsync(CARD_BANNER_MS)
      await waitFor(() =>
        expect(view.container.querySelector('[data-testid="board"]')!.innerHTML).not.toBe(boardAfterCard),
      )
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('the board reacts where the card landed', () => {
  /*
   * PLAN Phase 4. The banner says WHICH card; the ring says WHERE — and the
   * two are the same event, so they share the latch and clear together.
   *
   * The badge already had an arrival animation (`pop`), so nothing is added to
   * it: a second animation on the same element would be motion for its own
   * sake. What is genuinely missing is a mark on squares that carry no badge —
   * a swap moves two pieces and writes no effect state at all, so before this
   * the board's only reaction to it was the pieces being elsewhere.
   */
  it('marks the squares the card touched, and only those', () => {
    const start = holdingFreeze()
    const view = render(
      <MatchHost content={content} presetId={BUNDLED_PRESET_ID} newSeed={() => 7} initialState={start} />,
    )
    playFreeze(view.container)

    const marked = [...view.container.querySelectorAll<HTMLElement>('[data-impact="true"]')].map((n) =>
      n.getAttribute('data-testid')!.replace('sq-', ''),
    )
    expect(marked.length, 'the freeze must mark something').toBeGreaterThan(0)

    /*
     * Against the board's own answer, not a written-down square.
     *
     * A freeze writes effect state and moves nothing (verified against the
     * engine for this fixture), so the squares it impacted are exactly the ones
     * now carrying an effect badge — an oracle read from a different attribute,
     * rendered by different code, rather than a second copy of the derivation.
     */
    // Scoped to SQUARES: the legend chip and the badge pip carry `data-effect`
    // too, and an unscoped selector picked them up — an oracle that counts
    // furniture is not an oracle.
    const badged = [...view.container.querySelectorAll<HTMLElement>('[data-testid^="sq-"][data-effect]')].map((n) =>
      n.getAttribute('data-testid')!.replace('sq-', ''),
    )
    expect(badged.length, 'the freeze must leave a badge to compare against').toBeGreaterThan(0)
    expect(marked.sort()).toEqual(badged.sort())

    // And the rest of the board is untouched — a ring everywhere says nothing.
    const squares = view.container.querySelectorAll('[data-testid^="sq-"]').length
    expect(marked.length, 'the fixture must not mark the whole board').toBeLessThan(squares)
  })

  it('never draws a ring without the banner that explains it', async () => {
    /*
     * The invariant, asserted as an invariant.
     *
     * The ring and the banner are one event, and the code says so in three
     * places that can drift apart: the latch, the ordered notice pick, and the
     * `impacted` set. They DID drift — a review round found `impacted` reading
     * the latch alone after the banner had been made to depend on the card's
     * record too, so an unresolvable card would have ringed squares with no
     * words anywhere.
     *
     * That particular trigger cannot be reached through this component's own
     * API (the engine only ever stores a validated card id, and `App.tsx`
     * remounts on a content change), which is exactly why a scenario test for
     * it is not possible and this shape is used instead: sample the pair at
     * every point in a card's life and require them to agree at each one.
     */
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      const start = holdingFreeze()
      const view = render(
        <MatchHost content={content} presetId={BUNDLED_PRESET_ID} newSeed={() => 7} initialState={start} />,
      )
      const agree = (when: string) => {
        const banner = screen.queryByTestId('card-banner') !== null
        const rings = view.container.querySelectorAll('.impact-ring').length
        expect(rings > 0, `${when}: ring without banner`).toBe(banner && rings > 0)
        if (!banner) expect(rings, `${when}: no banner, so no ring`).toBe(0)
      }

      agree('before any card')
      playFreeze(view.container)
      expect(screen.queryByTestId('card-banner'), 'the fixture must raise a banner').not.toBeNull()
      agree('while the card is announced')
      await vi.advanceTimersByTimeAsync(CARD_BANNER_MS + 10)
      await waitFor(() => expect(screen.queryByTestId('card-banner')).toBeNull())
      agree('after it clears')
    } finally {
      vi.useRealTimers()
    }
  })

  it('stops marking them when the banner clears', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      const view = render(
        <MatchHost content={content} presetId={BUNDLED_PRESET_ID} newSeed={() => 7} initialState={holdingFreeze()} />,
      )
      playFreeze(view.container)
      expect(view.container.querySelectorAll('[data-impact="true"]').length).toBeGreaterThan(0)

      await vi.advanceTimersByTimeAsync(CARD_BANNER_MS + 10)
      await waitFor(() => expect(view.container.querySelectorAll('[data-impact="true"]').length).toBe(0))
    } finally {
      vi.useRealTimers()
    }
  })

  it('draws no ring for a reader who asked for less motion', () => {
    /*
     * Suppressed in the COMPONENT, not left to the stylesheet.
     *
     * `MatchHost` already reads the preference for the effect flourish and
     * documents why: a component that keeps emitting a one-shot attribute while
     * the CSS silently ignores it is behaviour nothing can test. The banner
     * itself is unaffected — the media query asks for less motion, not less
     * information, so the words stay.
     */
    const original = window.matchMedia
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: (query: string) => ({ matches: query.includes('reduce'), media: query, addEventListener() {}, removeEventListener() {} }),
    })
    try {
      const view = render(
        <MatchHost content={content} presetId={BUNDLED_PRESET_ID} newSeed={() => 7} initialState={holdingFreeze()} />,
      )
      playFreeze(view.container)
      expect(view.container.querySelectorAll('[data-impact="true"]').length, 'no ring under reduce').toBe(0)
      expect(screen.getByTestId('card-banner'), 'but the words stay').toBeTruthy()
    } finally {
      Object.defineProperty(window, 'matchMedia', { configurable: true, writable: true, value: original })
    }
  })
})

describe('the notice stack keeps every notice', () => {
  it('lets the seed warning stand beside a card banner, because it is not in the stack', () => {
    /*
     * The fifth notice. `ai-degraded` says the seed no longer replays this
     * match (AC-011) — a persistent line about the MATCH, not a transient one
     * about the ply — and it renders outside the notice stack's coordinates,
     * so it is deliberately NOT in ADR-004's ordered pick.
     *
     * Written down as a test rather than left silent, because "not in the
     * ordered list" and "forgotten from the ordered list" look identical from
     * outside, and the notice-stack bug this whole block exists for came from
     * exactly that ambiguity. If a later change moves the warning into the
     * stack's position, this is what says so.
     */
    return (async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true })
      try {
        const stub = stubClient()
        const start = holdingFreeze('black')
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

        // A card play whose search overran its wall-clock backstop: both
        // notices are then genuinely due at the same moment, which is the only
        // arrangement that can tell "not a stack member" from "absent".
        const card = legalActions(start, content).find((a) => a.kind === 'play_card')
        expect(card, 'the computer must have a card to play').toBeTruthy()
        stub.deliver({ action: card!, nodes: 10, depthReached: 1, valveTripped: true })
        await vi.advanceTimersByTimeAsync(700)

        await waitFor(() => expect(screen.queryByTestId('card-banner')).not.toBeNull())
        expect(screen.getByTestId('ai-degraded'), 'the seed warning must be up too').toBeTruthy()
        expect(
          view.container.querySelectorAll('.rule-banner, .card-banner, .turn-toast').length,
          'the warning coexists, but the stack itself still holds exactly one',
        ).toBe(1)
      } finally {
        vi.useRealTimers()
      }
    })()
  })

  it('replaces the rule banner rather than sitting beside it', () => {
    /*
     * Card versus rule banner. The pairing turns out to be unreachable — `push`
     * calls `setBanner(false)` on EVERY action (MatchHost.tsx:474), so by the
     * time a card has been played the rule banner is already dismissed — but
     * unreachable-by-argument and unreachable-in-fact are different claims, and
     * only one of them survives a refactor. Demonstrated rather than asserted
     * in a comment.
     */
    const withRule: GameState = { ...holdingFreeze(), ruleCardId: [...content.ruleCards.keys()][0]! }
    expect(withRule.ruleCardId, 'the bundled set must define a rule card').toBeTruthy()
    const view = render(
      <MatchHost content={content} presetId={BUNDLED_PRESET_ID} newSeed={() => 7} initialState={withRule} />,
    )
    // The rule banner is up at match start — the precondition, asserted so a
    // fixture that never raised it could not make the test pass by vacuity.
    expect(screen.getByTestId('rule-banner')).toBeTruthy()

    playFreeze(view.container)

    expect(screen.getByTestId('card-banner')).toBeTruthy()
    /*
     * The rule banner being gone is NOT by itself evidence of an ordered pick:
     * `push` already calls `setBanner(false)` on every action (MatchHost.tsx:474),
     * code that predates this work, so this half is true whatever Phase C does.
     * Kept because a refactor that removed that line would want to be caught
     * here — but the load-bearing assertion is the one below, which no
     * pre-existing code satisfies.
     */
    expect(screen.queryByTestId('rule-banner'), 'two notices must never share the spot').toBeNull()

    /*
     * And that is all this pairing can honestly claim.
     *
     * A `querySelectorAll(...).length === 1` was added here and then removed:
     * `setBanner(false)` and the card's own state update are both dispatched
     * inside `push`, so React batches them into one commit and there is no
     * render where both are observable. The count is therefore 1 whether or
     * not ADR-004's ordered pick exists — guaranteed by pre-existing code, not
     * by the behaviour under test.
     *
     * The hand-off pairing below is the real evidence for the ordered pick:
     * `handOff` is set unconditionally by code that predates this work, so its
     * ABSENCE while the banner is up can only come from the new resolution.
     */
  })


  it('shows the hand-off after the card banner, rather than instead of it', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      const start = holdingFreeze()
      const view = render(
        <MatchHost content={content} presetId={BUNDLED_PRESET_ID} newSeed={() => 7} initialState={start} />,
      )
      playFreeze(view.container)
      playAMove(view.container, start)

      /*
       * Both are due at once: the move handed the board over, and the card is
       * still being announced. Suppressing the hand-off outright — the shape
       * the other three notices use — would lose "whose turn is it" to a card
       * play, so it is queued behind the banner instead.
       */
      expect(screen.getByTestId('card-banner'), 'the card outranks the hand-off').toBeTruthy()
      expect(screen.queryByTestId('hand-off'), 'two notices must never stack').toBeNull()

      await vi.advanceTimersByTimeAsync(CARD_BANNER_MS + 10)
      await waitFor(() => expect(screen.queryByTestId('card-banner')).toBeNull())
      await waitFor(() => expect(screen.queryByTestId('hand-off'), 'the hand-off is queued, not dropped').not.toBeNull())
    } finally {
      vi.useRealTimers()
    }
  })
})
