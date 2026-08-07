import fc from 'fast-check'
import { describe, expect, it, vi } from 'vitest'

vi.setConfig({ testTimeout: 60_000 })

import { BUNDLED_PRESET_ID } from '@content/sets/bundled'
import { chooseAction } from '@engine/agent'
import { PLY_CAP, apply, applyTrusted, legalActions } from '@engine/engine'
import { createMatch, currentState } from '@engine/match'
import type { GameState } from '@engine/types'
import { shippedContent } from '../helpers/shipped'

/**
 * ADR-004's guard, moved from every runtime call to one exhaustive test.
 *
 * `apply` opens by re-deriving `legalActions` to reject an illegal action. The
 * search has already chosen from that list, so it pays the check twice —
 * measured ~32us per apply, of which roughly half is the duplicate. The fast
 * path drops it, and the whole argument for dropping it is this file: for every
 * action the generator produced, the two functions agree exactly.
 *
 * The brand is the other half. `applyTrusted` takes a `TrustedAction`, which
 * only `legalActions` mints, so an action the generator never produced cannot
 * reach the fast path at compile time. That is what makes this a moved guard
 * rather than a discarded one — a debug-build assertion would be absent from
 * the shipped artifact, which is where the corruption would happen.
 */

const content = shippedContent()

/** Walks a match forward to `plies`, returning every state along the way. */
function walk(seed: number, plies: number): GameState[] {
  let match = createMatch({ content, presetId: BUNDLED_PRESET_ID, seed })
  const seen: GameState[] = [currentState(match)]
  for (let i = 0; i < plies; i += 1) {
    const state = currentState(match)
    if (state.result) break
    const action = chooseAction(state, content, seed)
    if (!action) break
    match = { states: [...match.states, apply(state, action, content)] }
    seen.push(currentState(match))
  }
  return seen
}

/**
 * States are compared by value, not by identity: both functions build a fresh
 * object, so `toBe` would fail on two correct results. The board is a Map,
 * which `toEqual` compares by entry, and entry ORDER matters to it — that is
 * deliberate here, because the two paths must agree on insertion order too or a
 * transposition key computed over the map would diverge between them.
 */
describe('applyTrusted is apply, minus a check the caller already made', () => {
  it('agrees with apply on every legal action of every reachable state', () => {
    let compared = 0
    for (let seed = 1; seed <= 12; seed += 1) {
      for (const state of walk(seed, 24)) {
        if (state.result) continue
        for (const action of legalActions(state, content)) {
          expect(applyTrusted(state, action, content)).toEqual(apply(state, action, content))
          compared += 1
        }
      }
    }
    // The premise of the loop above, asserted rather than assumed: a run that
    // silently compared nothing would pass every expectation in it.
    expect(compared).toBeGreaterThan(2_000)
  })

  it('agrees across generated seeds and depths, not only the hand-picked ones', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 2 ** 31 - 1 }), fc.integer({ min: 0, max: PLY_CAP }), (seed, plies) => {
        const states = walk(seed, plies)
        const state = states[states.length - 1]!
        if (state.result) return true
        for (const action of legalActions(state, content)) {
          expect(applyTrusted(state, action, content)).toEqual(apply(state, action, content))
        }
        return true
      }),
      { numRuns: 60 },
    )
  })

  it('leaves the input state untouched, exactly as apply does', () => {
    const state = walk(5, 8).at(-1)!
    const before = structuredClone({ board: [...state.board], drafts: state.drafts, plyCount: state.plyCount })
    for (const action of legalActions(state, content)) applyTrusted(state, action, content)
    expect({ board: [...state.board], drafts: state.drafts, plyCount: state.plyCount }).toEqual(before)
  })
})
