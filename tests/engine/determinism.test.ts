import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import { BUNDLED_PRESET_ID } from '@content/sets/bundled'
import { chooseAction, playOut } from '@engine/agent'
import { apply, legalActions, serializeState } from '@engine/engine'
import { createMatch, currentState } from '@engine/match'
import { shippedContent } from '../helpers/shipped'

/**
 * AC-004 — the whole match replays from the seed, not just its opening.
 *
 * `tests/engine/draft.test.ts` already pins the opening: same seed, same rule
 * card, same offers. That is the easy half and it cannot fail on the thing
 * that actually breaks replay — state that leaks in from somewhere other than
 * (seed, action sequence). A single `Math.random()` anywhere in effect
 * resolution, or one iteration over a Map whose insertion order depends on a
 * previous match, passes every opening assertion and desynchronises at ply 20.
 *
 * So the property here is over the FULL sequence: two independent runs of the
 * same seed must agree at every ply, compared by serialization rather than by
 * outcome — two matches can reach the same result down different lines.
 */

const content = shippedContent()

/** Replays a seed and returns the serialized state after every ply. */
function trace(seed: number, plies = 40): string[] {
  const out: string[] = []
  let match = createMatch({ content, presetId: BUNDLED_PRESET_ID, seed })
  for (let i = 0; i < plies; i += 1) {
    const state = currentState(match)
    if (state.result) break
    const action = chooseAction(state, content, seed)
    if (!action) break
    match = { ...match, states: [...match.states, apply(state, action, content)] }
    out.push(serializeState(currentState(match)))
  }
  return out
}

describe('AC-004 seed determinism over a whole match', () => {
  it('replays a full match identically from the same seed', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 2 ** 31 - 1 }), (seed) => {
        expect(trace(seed)).toEqual(trace(seed))
      }),
      { numRuns: 25 },
    )
  })

  it('replays identically when the SAME action sequence is applied to a fresh match', () => {
    // Distinct from the property above: that one re-derives the actions, so an
    // engine that is deterministic only because the agent is deterministic
    // passes it. This one records the actions once and replays them, so the
    // determinism under test is the engine's.
    for (const seed of [7, 41, 1234]) {
      const first = createMatch({ content, presetId: BUNDLED_PRESET_ID, seed })
      const actions = []
      let match = first
      for (let i = 0; i < 30; i += 1) {
        const state = currentState(match)
        if (state.result) break
        const action = chooseAction(state, content, seed)
        if (!action) break
        actions.push(action)
        match = { ...match, states: [...match.states, apply(state, action, content)] }
      }
      expect(actions.length).toBeGreaterThan(0)

      let replay = createMatch({ content, presetId: BUNDLED_PRESET_ID, seed })
      for (const action of actions) {
        const state = currentState(replay)
        // The recorded action must still be legal at this point, or the replay
        // has already diverged in a way the state comparison would mask.
        expect(
          legalActions(state, content).some((a) => JSON.stringify(a) === JSON.stringify(action)),
          `replayed action became illegal at ply ${state.plyCount} on seed ${seed}`,
        ).toBe(true)
        replay = { ...replay, states: [...replay.states, apply(state, action, content)] }
      }
      expect(serializeState(currentState(replay))).toBe(serializeState(currentState(match)))
    }
  })

  it('produces different matches for different seeds, so determinism is not constancy', () => {
    // Without this, an engine that ignores the seed entirely passes everything
    // above. Not every pair need differ — two seeds may draw the same rule card
    // and the same opening — so the claim is over the population.
    const traces = new Set([1, 2, 3, 4, 5, 6, 7, 8].map((seed) => trace(seed, 12).join('|')))
    expect(traces.size).toBeGreaterThan(1)
  })

  it('reaches the same result from the same seed across independent play-outs', () => {
    for (const seed of [3, 77, 900]) {
      const a = playOut(content, BUNDLED_PRESET_ID, seed)
      const b = playOut(content, BUNDLED_PRESET_ID, seed)
      expect(b.plies).toBe(a.plies)
      expect(b.result).toEqual(a.result)
      expect(serializeState(b.state)).toBe(serializeState(a.state))
    }
  })
})
