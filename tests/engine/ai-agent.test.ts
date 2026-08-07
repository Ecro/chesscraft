import fc from 'fast-check'
import { describe, expect, it, vi } from 'vitest'

vi.setConfig({ testTimeout: 120_000 })

import { BUNDLED_PRESET_ID } from '@content/sets/bundled'
import { search } from '@engine/ai/search'
import { chooseAction } from '@engine/agent'
import { PLY_CAP, apply, legalActions } from '@engine/engine'
import { createMatch, createPosition, currentState } from '@engine/match'
import type { Action, GameState } from '@engine/types'
import { shippedContent } from '../helpers/shipped'

/**
 * "Wide" for AC-004's purposes, counted in CARD PLAYS rather than in actions.
 *
 * The measured mean branching is ~22 and the measured maximum is 200 — and at
 * that maximum, 180 of the 200 are card plays, because `cardPlays` enumerates a
 * Cartesian product of target slots. Counting card plays rather than total
 * actions is what makes the threshold mean what the AC means: a root that is
 * merely wide in ordinary moves is a regime the walk-based tests already cover.
 */
const WIDE_ROOT_THRESHOLD = 60

/**
 * AC-002 and AC-004 — the two claims that must hold for ANY search, which is
 * why they are relations rather than expected moves.
 *
 * Membership in `legalActions` is decided by the engine's own generator, which
 * shares no code with the search's selection. So a search that merely agrees
 * with itself cannot satisfy this file. AC-004's biconditional matters more
 * than it looks: `apply` returns the INPUT state for an illegal action rather
 * than throwing, so a search that built an off-list action would produce a
 * silent no-op node — invisible to any test that only compares final states.
 */

const content = shippedContent()
const BUDGET = { nodeBudget: 1_500 }

function walk(seed: number, plies: number): GameState {
  let match = createMatch({ content, presetId: BUNDLED_PRESET_ID, seed })
  for (let i = 0; i < plies; i += 1) {
    const state = currentState(match)
    if (state.result) break
    const action = chooseAction(state, content, seed)
    if (!action) break
    match = { states: [...match.states, apply(state, action, content)] }
  }
  return currentState(match)
}

const sameAction = (a: Action, b: Action) => JSON.stringify(a) === JSON.stringify(b)

describe('AC-002 — the search acts only through the shared pipeline', () => {
  it('returns an action the generator produced, in every phase of a match', () => {
    const kinds = new Set<string>()
    for (let seed = 1; seed <= 10; seed += 1) {
      for (const plies of [0, 1, 2, 6, 11, 14, 20, 30]) {
        const state = walk(seed, plies)
        if (state.result) continue
        const legal = legalActions(state, content)
        const { best } = search(state, content, BUDGET)
        expect(best).not.toBeNull()
        expect(legal.some((a) => sameAction(a, best!))).toBe(true)
        kinds.add(best!.kind)
      }
    }
    // A run that only ever saw board moves would not have exercised the draft
    // or card paths at all, and would still pass every assertion above.
    expect(kinds).toContain('move')
    expect(kinds).toContain('draft_pick')
  })

  it('handles a card-play root — the third action kind, which a walk may never reach', () => {
    // AC-002 names three pending-action kinds. Whether the search PICKS a card
    // is its own judgement and not something to assert; whether it is offered
    // one and treats it as a first-class action is. A search that dropped
    // play_card from its internal candidate list would still return legal moves
    // and drafts, and would pass the walk-based test above untouched.
    const state = createPosition({
      content,
      presetId: BUNDLED_PRESET_ID,
      seed: 11,
      sideToMove: 'white',
      held: { white: ['skill.teleport'], black: ['skill.freeze'] },
      placements: [
        { square: 'a1', pieceId: 'piece.king', side: 'white' },
        { square: 'b1', pieceId: 'piece.rook', side: 'white' },
        { square: 'f6', pieceId: 'piece.king', side: 'black' },
        { square: 'e6', pieceId: 'piece.rook', side: 'black' },
      ],
    })
    const legal = legalActions(state, content)
    const cardPlays = legal.filter((a) => a.kind === 'play_card')
    // The premise. Without it this test silently degrades to another move test
    // the day the card or the position stops producing a playable card.
    expect(cardPlays.length).toBeGreaterThan(0)

    const { scored, best } = search(state, content, BUDGET)
    expect(scored).toHaveLength(legal.length)
    for (const play of cardPlays) {
      expect(scored.some((s) => sameAction(s.action, play))).toBe(true)
    }
    expect(legal.some((a) => sameAction(a, best!))).toBe(true)
  })

  it('commits through apply, adding no state transition of its own', () => {
    for (let seed = 3; seed <= 8; seed += 1) {
      const state = walk(seed, 9)
      if (state.result) continue
      const { best } = search(state, content, BUDGET)
      const committed = apply(state, best!, content)
      // Not a no-op: `apply` returns the input state for an action it rejects,
      // so an identical result would be the failure this asserts against.
      expect(committed).not.toBe(state)
      expect(committed.plyCount + committed.drafts.white.draftIndex + committed.drafts.black.draftIndex).toBeGreaterThan(
        state.plyCount + state.drafts.white.draftIndex + state.drafts.black.draftIndex,
      )
    }
  })

  it('scores every root action it was offered, and ranks them descending', () => {
    const state = walk(4, 10)
    const legal = legalActions(state, content)
    const { scored } = search(state, content, BUDGET)
    expect(scored).toHaveLength(legal.length)
    expect(scored.map((s) => s.score)).toEqual([...scored.map((s) => s.score)].sort((a, b) => b - a))
    for (const { action } of scored) expect(legal.some((a) => sameAction(a, action))).toBe(true)
  })
})

describe('AC-004 — null exactly when nothing is legal', () => {
  it('returns null on a finished match and only there', () => {
    let nulls = 0
    let nonNulls = 0
    for (let seed = 1; seed <= 30; seed += 1) {
      let match = createMatch({ content, presetId: BUNDLED_PRESET_ID, seed })
      for (let i = 0; i < PLY_CAP + 4; i += 1) {
        const state = currentState(match)
        const legal = legalActions(state, content)
        const { best } = search(state, content, { nodeBudget: 200 })
        expect(best === null).toBe(legal.length === 0)
        if (best === null) nulls += 1
        else nonNulls += 1
        if (legal.length === 0 || state.result) break
        match = { states: [...match.states, apply(state, chooseAction(state, content, seed)!, content)] }
      }
    }
    expect(nulls).toBeGreaterThan(0)
    expect(nonNulls).toBeGreaterThan(100)
  })

  it('holds over generated states, including draft-only and wide card nodes', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 2 ** 31 - 1 }), fc.integer({ min: 0, max: 40 }), (seed, plies) => {
        const state = walk(seed, plies)
        const legal = legalActions(state, content)
        const { best } = search(state, content, { nodeBudget: 300 })
        expect(best === null).toBe(legal.length === 0)
        if (best) expect(legal.some((a) => sameAction(a, best))).toBe(true)
        return true
      }),
      { numRuns: 80 },
    )
  })

  it('holds on a WIDE root — the card-target product AC-004 names, found and asserted', () => {
    // The measured worst case is 200 actions at one node, from `cardPlays`
    // enumerating a Cartesian product of target slots. A random walk reaches
    // such a state only incidentally, so this looks for one and refuses to
    // proceed without it: an implementation bug specific to large action lists
    // (a truncation, a bounded allocation) would otherwise have no test at all.
    // The search key is the CARD-PLAY count, not the raw action count. Ranking
    // by raw width would happily settle on a state that is wide because many
    // pieces have many moves — a regime the walk-based tests already cover —
    // and the file would then claim a card-target premise it never established.
    let widest: GameState | null = null
    let widestCardPlays = 0
    for (let seed = 1; seed <= 40 && widestCardPlays < WIDE_ROOT_THRESHOLD; seed += 1) {
      let match = createMatch({ content, presetId: BUNDLED_PRESET_ID, seed })
      for (let i = 0; i < 40; i += 1) {
        const state = currentState(match)
        if (state.result) break
        const cardPlays = legalActions(state, content).filter((a) => a.kind === 'play_card').length
        if (cardPlays > widestCardPlays) {
          widestCardPlays = cardPlays
          widest = state
        }
        const action = chooseAction(state, content, seed)
        if (!action) break
        match = { states: [...match.states, apply(state, action, content)] }
      }
    }
    // The premise, asserted rather than hoped for — and it is the premise the
    // test's name claims: the width comes from a card's target enumeration.
    expect(widestCardPlays).toBeGreaterThanOrEqual(WIDE_ROOT_THRESHOLD)

    const legal = legalActions(widest!, content)
    expect(legal.filter((a) => a.kind === 'play_card').length).toBe(widestCardPlays)
    const { best, scored } = search(widest!, content, BUDGET)
    expect(best).not.toBeNull()
    expect(legal.some((a) => sameAction(a, best!))).toBe(true)
    // Pruning is an EXPANSION policy (ADR-007); the root must still be scored in
    // full, or the AI is silently blind to options the player can see.
    expect(scored).toHaveLength(legal.length)
  })

  it('respects its node budget rather than running to completion', () => {
    const state = walk(2, 6)
    const small = search(state, content, { nodeBudget: 120 })
    const large = search(state, content, { nodeBudget: 4_000 })
    expect(small.nodes).toBeLessThanOrEqual(120 + legalActions(state, content).length)
    expect(large.nodes).toBeGreaterThan(small.nodes)
    expect(large.depthReached).toBeGreaterThanOrEqual(small.depthReached)
  })
})
