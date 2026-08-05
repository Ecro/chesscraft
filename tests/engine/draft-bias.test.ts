import { describe, expect, it } from 'vitest'
import { BUNDLED_PRESET_ID } from '@content/sets/bundled'
import type { ContentSet } from '@content/load'
import { chooseAction } from '@engine/agent'
import { SECOND_DRAFT_AFTER_TURNS, apply, legalActions, serializeState } from '@engine/engine'
import { createMatch, currentState } from '@engine/match'
import type { Action, GameState, Side } from '@engine/types'
import { shippedContent } from '../helpers/shipped'

/**
 * AC-006's no-bias clause, at the draft that can actually be biased.
 *
 * `tests/engine/draft.test.ts` covers the OPENING offer against a changed
 * board. That is the case where bias is least likely, because at ply zero
 * there is barely any position to be biased by. The second draft opens after
 * five completed turns, by which point the players have a material balance, a
 * move history and a spent card — every ingredient a "help the player who is
 * behind" implementation would reach for, and none of it present at ply zero.
 *
 * The claim under test is the PLAN's: an offer is a pure function of
 * `(seed, cardPool, playerId, draftIndex)`. So the test fixes those four,
 * varies everything else, and asserts the offer does not move.
 *
 * The premise is asserted, not assumed. An earlier draft of this file compared
 * offers across "different lines" without ever checking that the lines differed
 * — and `pickVaried`'s modular arithmetic really can collapse two variants onto
 * the same choice, in which case the test compared a run to itself and passed
 * having proved nothing. `reachDraft` now returns the position it arrived at,
 * and every comparison below asserts the positions differ first.
 */

const content = shippedContent()

interface Arrival {
  offers: string[]
  /** The serialized state at the draft point — the premise, made checkable. */
  position: string
  /** How many actions were applied to get here. */
  steps: number
}

/**
 * Plays until `side` is looking at its `draftIndex`-th offer.
 *
 * `chooseBoard` picks among the non-draft actions and is what varies the line;
 * draft picks are taken as they come, since refusing one stalls the match.
 * `onStep` fires after every applied action, which the ADR-014 test uses to
 * inject extra agent draws into the middle of a real line.
 */
function reachDraft(
  seed: number,
  side: Side,
  draftIndex: number,
  chooseBoard: (actions: Action[], step: number) => Action,
  onStep?: (state: GameState) => void,
): Arrival | null {
  let match = createMatch({ content, presetId: BUNDLED_PRESET_ID, seed })
  for (let step = 0; step < 200; step += 1) {
    const state = currentState(match)
    const draft = state.drafts[side]
    if (draft.offers && draft.offers.length > 0 && draft.draftIndex === draftIndex) {
      return { offers: [...draft.offers], position: serializeState(state), steps: step }
    }
    if (state.result) break
    const actions = legalActions(state, content)
    if (actions.length === 0) break
    const picks = actions.filter((a) => a.kind === 'draft_pick')
    const action = picks.length > 0 ? picks[0]! : chooseBoard(actions, step)
    match = { ...match, states: [...match.states, apply(state, action, content)] }
    onStep?.(currentState(match))
  }
  // A line that ends the match before the draft opens is a legitimate line,
  // not a broken fixture — so this reports rather than throws, and the callers
  // assert that ENOUGH lines arrived. Throwing here would have made the test
  // pass or fail on whether a particular seed happened to survive ten plies.
  return null
}

/** A line that varies with `variant` but never touches the match seed. */
const line = (variant: number) => (actions: Action[], step: number) =>
  actions[(variant * 7 + step * 3 + variant * variant) % actions.length]!

describe('AC-006 offers are independent of how the match was played', () => {
  it('opens the second draft only after five completed turns', () => {
    // Anchors the fixture: if the second draft moved, the tests below would be
    // measuring the first one twice and would pass without proving anything.
    expect(SECOND_DRAFT_AFTER_TURNS).toBe(5)
  })

  it('offers the same second draft to a player who reached it from a different position', () => {
    let compared = 0
    for (const seed of [12, 345, 6789]) {
      // Search the variants rather than assuming any given one survives to the
      // second draft; a line that ends the match early simply does not vote.
      const arrivals = [0, 1, 2, 3, 4, 5, 6, 7]
        .map((variant) => reachDraft(seed, 'white', 1, line(variant)))
        .filter((a): a is Arrival => a !== null)
      if (arrivals.length < 2) continue

      const baseline = arrivals[0]!
      expect(baseline.offers).toHaveLength(3)
      for (const varied of arrivals.slice(1)) {
        // The premise, asserted rather than assumed: without this the loop can
        // compare a run to itself and pass having proved nothing.
        if (varied.position === baseline.position) continue
        compared += 1
        expect(varied.offers, `seed ${seed}: white's second offer moved with the position`).toEqual(baseline.offers)
      }
    }
    expect(compared, 'no two lines reached the second draft from different positions').toBeGreaterThan(2)
  })

  it('offers each player a different draft, so "unbiased" is not "identical"', () => {
    // The pure-function claim names playerId as an input. Without this, an
    // implementation that hands both players the same three cards satisfies
    // every independence assertion above.
    for (const seed of [12, 345, 6789]) {
      const state = currentState(createMatch({ content, presetId: BUNDLED_PRESET_ID, seed }))
      expect(state.drafts.white.offers).not.toEqual(state.drafts.black.offers)
    }
  })

  it('changes the offer when the seed changes, so independence is not constancy', () => {
    const offers = new Set(
      [1, 2, 3, 4, 5, 6].map((seed) => reachDraft(seed, 'white', 0, line(0))!.offers.join('|')),
    )
    expect(offers.size).toBeGreaterThan(1)
  })

  it('keeps the second offer disjoint from the first however the match was played', () => {
    let checked = 0
    for (const seed of [12, 345, 6789]) {
      for (const variant of [0, 1, 2, 3]) {
        const second = reachDraft(seed, 'white', 1, line(variant))
        if (!second) continue
        const first = reachDraft(seed, 'white', 0, line(variant))!
        checked += 1
        expect(second.offers.filter((id) => first.offers.includes(id))).toEqual([])
      }
    }
    expect(checked, 'no line reached the second draft').toBeGreaterThan(2)
  })
})

describe('the random agent draws from its own substream (ADR-014)', () => {
  it('leaves the second offer untouched when extra agent draws happen mid-match', () => {
    // The failure this pins: with ONE shared mutable PRNG, every agent draw
    // advances the stream the offers come from, so a line in which the agent
    // deliberated more silently changes the next offer — bias through the back
    // door. The draws must be interleaved with real play, not made against a
    // detached state, or nothing connects them to the offer under test.
    for (const seed of [21, 99]) {
      const quiet = reachDraft(seed, 'white', 1, line(1))
      const chatty = reachDraft(seed, 'white', 1, line(1), (state) => {
        for (let extra = 0; extra < 20; extra += 1) chooseAction(state, content, seed)
      })
      expect(quiet, `seed ${seed}: the line never reached the second draft`).not.toBeNull()
      expect(chatty).not.toBeNull()
      if (!quiet || !chatty) continue
      // Same line, so the same position — the only difference is how many
      // random numbers were drawn on the way there.
      expect(chatty.position).toBe(quiet.position)
      expect(chatty.offers, `seed ${seed}: agent draws perturbed the draft`).toEqual(quiet.offers)
    }
  })
})
