// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import React from 'react'
import { loadContentSet } from '@content/load'
import { BUNDLED_PRESET_ID, bundledContentSource } from '@content/sets/bundled'
import { legalActions } from '@engine/engine'
import { MatchHost } from '../../src/ui/MatchHost'
import { startedState } from '../helpers/match'

/**
 * PLAN Phase 3, the other half (ADR-004) — what the board SHOWS is what the engine offers.
 *
 * The engine half of Phase 3 lives in `tests/engine/capture-oracle.test.ts` and cleared move
 * generation over ~480 sampled positions. This is the half interview #8 asked for and the
 * first pass of that phase did not deliver: the report was that the capture MARKER never
 * appeared, which is an observation about the screen, so the screen has to be measured too. A
 * correct generator behind a highlight that drops squares looks exactly like a broken
 * generator from the player's side.
 *
 * The claim is an equality, deliberately, in both directions. A subset check would pass a
 * board that highlights nothing, and a superset check would pass one that highlights every
 * square — the two failure modes are opposite and a one-sided assertion misses one of them.
 */

const loaded = loadContentSet(bundledContentSource)
if (!loaded.ok) throw new Error('bundled content did not load')
const content = loaded.set

function pastDraft(container: HTMLElement) {
  for (let i = 0; i < 4; i += 1) {
    const offer = container.querySelector('[data-testid^="offer-"]')
    if (!offer) break
    fireEvent.click(offer)
  }
}

/** Squares the board is currently marking as reachable. */
function highlighted(): string[] {
  return [...document.querySelectorAll('[data-testid^="sq-"]')]
    .filter((el) => el.getAttribute('data-legal') === 'true')
    .map((el) => el.getAttribute('data-testid')!.slice(3))
    .sort()
}

afterEach(cleanup)

describe('the board highlights exactly what the engine offers (PLAN Phase 3)', () => {
  it('marks every square the selected piece can move to, and no others', () => {
    const { container } = render(<MatchHost content={content} presetId={BUNDLED_PRESET_ID} newSeed={() => 7} />)
    pastDraft(container)

    // Nothing selected: nothing marked. Stated first, so a board that marks squares
    // unconditionally cannot pass the comparison below by accident.
    expect(highlighted(), 'squares were marked with no piece selected').toEqual([])

    fireEvent.click(screen.getByTestId('sq-b1'))

    // The engine's answer for the same piece, from the same content, computed independently of
    // the component. `startedState` resolves the opening drafts the same way `pastDraft` does
    // above — same seed, same preset — so the two are looking at one position.
    const state = startedState(content, 7)
    const offered = legalActions(state, content)
      .filter((a) => a.kind === 'move' && a.from === 'b1')
      .map((a) => (a as { to: string }).to)
      .sort()

    // The premise: this piece HAS somewhere to go. A knight on the opening back rank does, and
    // without this the equality could hold at empty-versus-empty.
    expect(offered.length, 'the engine offered this piece no moves at all').toBeGreaterThan(0)
    expect(highlighted()).toEqual(offered)
  })

  it('marks a capture the engine offers, and drops the selection when told to', () => {
    const { container } = render(<MatchHost content={content} presetId={BUNDLED_PRESET_ID} newSeed={() => 7} />)
    pastDraft(container)

    fireEvent.click(screen.getByTestId('sq-b1'))
    expect(highlighted().length).toBeGreaterThan(0)

    // Selecting an empty square clears the selection, so the marks go with it. A highlight that
    // outlives its selection is a stale board, and a stale board showing capture squares is the
    // reported symptom from the other direction.
    fireEvent.click(screen.getByTestId('sq-c4'))
    expect(highlighted(), 'marks outlived the selection that owned them').toEqual([])
  })

  it('never marks a square whose occupant cannot be captured', () => {
    /*
     * The specific mechanism Phase 3 identified. The shipped board paints one square whose type
     * blocks capture of its occupant, so a piece standing there is highlighted by nobody — and
     * the engine and the board must agree about that, not merely each be self-consistent.
     *
     * Written as a sweep over every own piece rather than one hand-picked selection: which
     * piece can see the protected square depends on the position, and hard-coding one would make
     * this test a fixture about the opening rather than about the rule.
     */
    const { container } = render(<MatchHost content={content} presetId={BUNDLED_PRESET_ID} newSeed={() => 7} />)
    pastDraft(container)

    const state = startedState(content, 7)
    const own = [...state.board.entries()].filter(([, piece]) => piece.side === state.sideToMove)
    expect(own.length, 'the side to move has no pieces').toBeGreaterThan(0)

    for (const [square] of own) {
      fireEvent.click(screen.getByTestId(`sq-${square}`))
      const offered = legalActions(state, content)
        .filter((a) => a.kind === 'move' && a.from === square)
        .map((a) => (a as { to: string }).to)
        .sort()
      expect(highlighted(), `board and engine disagree for the piece on ${square}`).toEqual(offered)
    }
  })
})
