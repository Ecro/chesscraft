import { describe, expect, it, vi } from 'vitest'

vi.setConfig({ testTimeout: 60_000 })

import { BUNDLED_PRESET_ID } from '@content/sets/bundled'
import { search } from '@engine/ai/search'
import { chooseAction } from '@engine/agent'
import { SECOND_DRAFT_AFTER_TURNS, apply, legalActions } from '@engine/engine'
import { createMatch, currentState } from '@engine/match'
import type { GameState } from '@engine/types'
import { shippedContent } from '../helpers/shipped'

/**
 * AC-009 — the AI must not see the future.
 *
 * Every draft offer is derived from `state.seed` through `rngFor`, and `apply`
 * draws the second draft as a SIDE EFFECT of ply completion. So a search that
 * expands past that boundary computes the human's future offers exactly. The
 * signature of having done so is that the search answers differently when only
 * the unrevealed stream changes.
 *
 * Two things about the shape of this test are load-bearing.
 *
 * It asserts SCORES, not the sampled action. The two matches necessarily differ
 * in seed — that is the only way to move the latent stream — which means the
 * temperature sampler's own substream differs too, so a differing action at a
 * sampled difficulty would prove nothing. Scoring draws no random number.
 *
 * And it asserts EXACT scores, not merely the same ranking. The projection
 * makes scoring a pure function of observable state, so a correct search
 * produces identical numbers; asserting only the order would admit a leak that
 * shifts magnitudes without swapping ranks, and magnitudes are not inert — the
 * two sampled difficulties draw from a softmax over them.
 */

const content = shippedContent()

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

/**
 * The same observable position, one draft-completing turn away from the second
 * draft, with only the latent stream changed.
 *
 * `completedTurns` is set to one below the trigger so the boundary sits
 * immediately beyond the root's children — a search that expands even one ply
 * past it reveals offers, which is what makes this sharp rather than
 * theoretical. Everything a player could look at is byte-identical between the
 * two; `seed` is the single difference.
 */
function twinsDifferingOnlyInLatentStream(base: GameState, seedA: number, seedB: number) {
  const armed = (seed: number): GameState => ({
    ...base,
    seed,
    drafts: {
      white: { ...base.drafts.white, completedTurns: SECOND_DRAFT_AFTER_TURNS - 1, offers: null, draftIndex: 1 },
      black: { ...base.drafts.black, completedTurns: SECOND_DRAFT_AFTER_TURNS - 1, offers: null, draftIndex: 1 },
    },
  })
  return [armed(seedA), armed(seedB)] as const
}

describe('AC-009 — the search does not read past an unrevealed draft boundary', () => {
  const base = walk(7, 10)
  const [a, b] = twinsDifferingOnlyInLatentStream(base, 1_001, 2_002)

  it('the two positions really are observably identical', () => {
    const observable = (s: GameState) => ({
      board: [...s.board].sort(),
      sideToMove: s.sideToMove,
      plyCount: s.plyCount,
      result: s.result,
      ruleCardId: s.ruleCardId,
      frozenUntil: s.frozenUntil,
      checkCount: s.checkCount,
      captured: s.captured,
      grants: s.grants,
      drafts: s.drafts,
    })
    expect(observable(a)).toEqual(observable(b))
    expect(a.seed).not.toBe(b.seed)
  })

  it('the latent streams really do differ — the premise, asserted', () => {
    // Without this the whole file could pass against a pool too small to draw a
    // second offer, measuring nothing at all. `unasserted-fixture-premise` is
    // the recorded name for exactly that mistake in this repo.
    const step = (s: GameState) => {
      const action = legalActions(s, content).find((x) => x.kind === 'move')
      expect(action).toBeDefined()
      return apply(s, action!, content)
    }
    const offersA = step(a).drafts[a.sideToMove].offers
    const offersB = step(b).drafts[b.sideToMove].offers
    expect(offersA).not.toBeNull()
    expect(offersB).not.toBeNull()
    expect(offersA).not.toEqual(offersB)
  })

  it('scores every root action identically despite the differing latent stream', () => {
    for (const nodeBudget of [200, 1_500, 6_000]) {
      const ra = search(a, content, { nodeBudget })
      const rb = search(b, content, { nodeBudget })
      expect(ra.scored).toEqual(rb.scored)
      expect(ra.nodes).toBe(rb.nodes)
      expect(ra.depthReached).toBe(rb.depthReached)
    }
  })

  it('chooses the same action at the level that draws no random number', () => {
    const ra = search(a, content, { nodeBudget: 3_000 })
    const rb = search(b, content, { nodeBudget: 3_000 })
    expect(ra.best).toEqual(rb.best)
    expect(ra.best).not.toBeNull()
  })

  it('holds across several base positions, not just one lucky one', () => {
    for (const seed of [3, 11, 19, 27]) {
      for (const plies of [6, 12]) {
        const origin = walk(seed, plies)
        if (origin.result) continue
        const [x, y] = twinsDifferingOnlyInLatentStream(origin, seed * 31 + 1, seed * 31 + 2)
        expect(search(x, content, { nodeBudget: 900 }).scored).toEqual(search(y, content, { nodeBudget: 900 }).scored)
      }
    }
  })
})
