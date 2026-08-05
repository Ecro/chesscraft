import { describe, expect, it, vi } from 'vitest'

// Whole matches are played inside these tests, which puts them near vitest's
// 5s default on an idle machine and past it on a loaded one. A timeout in the
// final acceptance gate reads as an engine failure, so the bound is explicit.
vi.setConfig({ testTimeout: 60_000 })
import { BUNDLED_PRESET_ID } from '@content/sets/bundled'
import { chooseAction, playOut } from '@engine/agent'
import { apply, legalActions } from '@engine/engine'
import { createMatch, currentState } from '@engine/match'
import type { GameState } from '@engine/types'
import { shippedContent } from '../helpers/shipped'

/**
 * The agent is the FIXTURE for AC-012, so its Given has to be checked.
 *
 * SPEC AC-012 reads "1000 self-play matches played by a uniform-random
 * legal-action agent". Nothing in `self-play.test.ts` constrains the
 * distribution — an agent written as `legalActions(state, content)[0]` is
 * deterministic, terminates, and satisfies every assertion in that file, in
 * `determinism.test.ts` and in the invariant walk. It would also measure a
 * completely different experiment: the first-legal-move line, not random play.
 * The headline claim "a match is short" would then rest on a degenerate agent.
 *
 * So this file tests the fixture. It is the same discipline the rest of the
 * suite applies to content: a premise that is stated and not asserted is a
 * premise that will eventually be false.
 */

const content = shippedContent()

/**
 * A mid-match state with a wide branching factor, past both opening drafts.
 *
 * Searched for rather than reached by a fixed number of steps: a hardcoded
 * walk lands wherever that seed happens to go, and the first version of this
 * fixture landed on a match that had already been won — a position with zero
 * legal actions, on which every uniformity assertion is vacuous.
 */
function openPosition(): GameState {
  const SEED = 7
  let match = createMatch({ content, presetId: BUNDLED_PRESET_ID, seed: SEED })
  let best: GameState | null = null
  for (let i = 0; i < 12; i += 1) {
    const state = currentState(match)
    if (state.result) break
    const count = legalActions(state, content).length
    if (count >= 10 && state.drafts.white.draftIndex > 0 && state.drafts.black.draftIndex > 0) {
      best = state
      break
    }
    const action = chooseAction(state, content, SEED)
    if (!action) break
    match = { ...match, states: [...match.states, apply(state, action, content)] }
  }
  if (!best) throw new Error('no position with a wide enough branching factor was reached')
  return best
}

describe('the self-play agent is uniform-random over legal actions', () => {
  const state = openPosition()
  const actions = legalActions(state, content)

  it('is measured on a position with enough choices to detect a bias', () => {
    // Guards the fixture itself: on a position with two legal moves, "uniform"
    // is unfalsifiable and the tests below would pass on anything.
    expect(actions.length).toBeGreaterThan(8)
    expect(state.result).toBeNull()
  })

  it('only ever returns an action the engine called legal', () => {
    const legal = new Set(actions.map((a) => JSON.stringify(a)))
    for (let seed = 0; seed < 200; seed += 1) {
      const chosen = chooseAction(state, content, seed)
      expect(chosen).not.toBeNull()
      expect(legal.has(JSON.stringify(chosen)), `the agent invented action ${JSON.stringify(chosen)}`).toBe(true)
    }
  })

  it('reaches every legal action across seeds, rather than favouring one', () => {
    // The first-legal-action agent fails here on the first assertion; an agent
    // that quietly prefers, say, captures fails on the second.
    const counts = new Map<string, number>()
    const RUNS = 200 * actions.length
    for (let seed = 0; seed < RUNS; seed += 1) {
      const key = JSON.stringify(chooseAction(state, content, seed))
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }

    expect(counts.size, 'some legal actions are unreachable for the agent').toBe(actions.length)

    const expected = RUNS / actions.length
    const worst = Math.max(...counts.values())
    const rarest = Math.min(...counts.values())
    expect(worst, `an action was chosen ${worst} times against an expected ${expected}`).toBeLessThan(expected * 2)
    expect(rarest, `an action was chosen only ${rarest} times against an expected ${expected}`).toBeGreaterThan(
      expected / 2,
    )
  })

  it('does not favour the first or the last action, which index bugs produce', () => {
    // The two failure shapes an off-by-one gives: `Math.floor(r * n)` with a
    // generator that can return 1.0 over-picks the last, and `|| actions[0]`
    // fallbacks over-pick the first.
    const RUNS = 200 * actions.length
    const first = JSON.stringify(actions[0])
    const last = JSON.stringify(actions[actions.length - 1])
    let firstCount = 0
    let lastCount = 0
    for (let seed = 0; seed < RUNS; seed += 1) {
      const key = JSON.stringify(chooseAction(state, content, seed))
      if (key === first) firstCount += 1
      if (key === last) lastCount += 1
    }
    const expected = RUNS / actions.length
    expect(firstCount).toBeLessThan(expected * 2)
    expect(lastCount).toBeLessThan(expected * 2)
  })

  it('is reproducible: the same state and seed always give the same action', () => {
    for (const seed of [0, 1, 77, 60000]) {
      const once = chooseAction(state, content, seed)
      expect(chooseAction(state, content, seed)).toEqual(once)
    }
  })

  it('returns null exactly when there is nothing legal to do', () => {
    // The empty-collection case this project has already been bitten by: an
    // agent that returned `actions[0]` on an empty list would hand back
    // `undefined` and the play-out loop would apply it.
    const finished = playOut(content, BUNDLED_PRESET_ID, 5)
    expect(finished.result).not.toBeNull()
    expect(legalActions(finished.state, content)).toEqual([])
    expect(chooseAction(finished.state, content, 5)).toBeNull()
  })
})

describe('playOut', () => {
  it('stops at a result and reports the ply count that produced it', () => {
    const out = playOut(content, BUNDLED_PRESET_ID, 31)
    expect(out.result).not.toBeNull()
    expect(out.plies).toBe(out.state.plyCount)
    expect(out.plies).toBeGreaterThan(0)
  })
})
