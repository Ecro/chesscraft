import { describe, expect, it, vi } from 'vitest'

vi.setConfig({ testTimeout: 300_000 })

import type { ContentSet } from '@content/load'
import { BUNDLED_PRESET_ID } from '@content/sets/bundled'
import { DIFFICULTIES, TEMPERATURES, chooseWithDetail } from '@engine/ai/difficulty'
import { SURROGATE_NODE_BUDGET } from '@engine/ai/search'
import { apply, legalActions } from '@engine/engine'
import { createMatch, createPosition, currentState } from '@engine/match'
import type { Action, GameState } from '@engine/types'
import { otherSide } from '@engine/types'
import { shippedContent } from '../helpers/shipped'

/**
 * AC-006 — the easiest level plays weakly, not brokenly.
 *
 * Two independent claims, and they fail in opposite directions:
 *
 * **The clamp.** No level hands its king away in one, when it had a choice.
 * The predicate is computed HERE, by pushing the opponent's replies through the
 * engine — not by asking the search what it thought. A clamp implemented by
 * agreeing with the evaluator would satisfy a score-based check and still lose
 * kings, so the oracle has to be independent of the thing it judges.
 *
 * **The sampling.** The easiest level must still be sampling from a RANKED list
 * rather than throwing the search away. A uniform-random agent at the measured
 * mean branching of ~22 would pick the top-ranked action about 4% of the time;
 * requiring 25% separates "weak because the temperature is high" from "weak
 * because nothing is being searched" — which is the `declared-but-inert-
 * vocabulary` failure this repo has recorded four times.
 */

const content = shippedContent()

/**
 * Whether `action` lets the opponent capture the mover's royal on the reply.
 *
 * Deliberately expensive and deliberately naive: it applies every reply and
 * asks the ENGINE what happened. That is the whole point — no shared logic with
 * whatever the implementation does to reach the same conclusion.
 */
function losesKingOnReply(state: GameState, action: Action, set: ContentSet): boolean {
  const mover = state.sideToMove
  const child = apply(state, action, set)
  if (child.result) {
    if (child.result.kind === 'draw') return child.result.reason === 'king_capture'
    return child.result.winner !== mover
  }
  for (const reply of legalActions(child, set)) {
    const after = apply(child, reply, set)
    if (after.result?.kind === 'win' && after.result.winner === otherSide(mover)) return true
    if (after.result?.kind === 'draw' && after.result.reason === 'king_capture') return true
  }
  return false
}

/**
 * A position where a king-losing action and a safe one both exist.
 *
 * White king on c1 behind its own rook on c3; a black rook stares down the
 * c-file from c6. Stepping the rook off the file opens it and the king falls on
 * the reply; sliding it along the file, or moving the king aside, does not.
 */
function forkedPosition(): GameState {
  return createPosition({
    content,
    presetId: BUNDLED_PRESET_ID,
    seed: 4_242,
    sideToMove: 'white',
    placements: [
      { square: 'c1', pieceId: 'piece.king', side: 'white' },
      { square: 'c3', pieceId: 'piece.rook', side: 'white' },
      { square: 'c6', pieceId: 'piece.rook', side: 'black' },
      { square: 'f6', pieceId: 'piece.king', side: 'black' },
    ],
  })
}

describe('AC-006 — the clamp, at every level', () => {
  const state = forkedPosition()

  it('the position really does fork into losing and safe actions', () => {
    // The premise. A position where every action is safe would let a search
    // with no clamp at all pass every assertion below it.
    const legal = legalActions(state, content)
    const losing = legal.filter((a) => losesKingOnReply(state, a, content))
    const safe = legal.filter((a) => !losesKingOnReply(state, a, content))
    expect(losing.length).toBeGreaterThan(0)
    expect(safe.length).toBeGreaterThan(0)
  })

  it('no difficulty chooses a king-losing action when a safe one exists', () => {
    for (const difficulty of DIFFICULTIES) {
      // Several seeds, because the two sampled levels draw and a single seed
      // would test one draw rather than the clamp.
      for (let seed = 1; seed <= 25; seed += 1) {
        const { action } = chooseWithDetail(state, content, {
          difficulty,
          seed,
          nodeBudget: SURROGATE_NODE_BUDGET,
        })
        expect(action).not.toBeNull()
        expect(losesKingOnReply(state, action!, content)).toBe(false)
      }
    }
  })

  it('clamps the hardest level too, not only the easiest', () => {
    // ADR-006 widened the clamp to every level because an easy-only clamp can
    // invert the ladder: clamped-easy beats unclamped-medium in exactly the
    // tactically decisive positions the ladder is supposed to be measured on.
    expect(TEMPERATURES.hard).toBe(0)
    const { action } = chooseWithDetail(state, content, {
      difficulty: 'hard',
      seed: 1,
      nodeBudget: SURROGATE_NODE_BUDGET,
    })
    expect(losesKingOnReply(state, action!, content)).toBe(false)
  })
})

describe('AC-006 — the easiest level samples a ranking, it does not discard it', () => {
  it('picks the top-ranked action far more often than random would', () => {
    let turns = 0
    let topRanked = 0
    let multiCandidate = 0

    for (let seed = 1; seed <= 40; seed += 1) {
      let match = createMatch({ content, presetId: BUNDLED_PRESET_ID, seed })
      for (let step = 0; step < 30; step += 1) {
        const state = currentState(match)
        if (state.result) break
        const detail = chooseWithDetail(state, content, {
          difficulty: 'easy',
          seed,
          nodeBudget: SURROGATE_NODE_BUDGET,
        })
        if (!detail.action) break
        // Turns with a single candidate are excluded from the rate: picking the
        // only option is not evidence of ranking, and including them would let
        // a forced sequence inflate the number.
        if (detail.candidates.length > 1) {
          multiCandidate += 1
          if (detail.wasTopRanked) topRanked += 1
        }
        turns += 1
        match = { states: [...match.states, apply(state, detail.action, content)] }
      }
    }

    // Premises, asserted: enough turns, and enough of them with a real choice.
    expect(turns).toBeGreaterThan(200)
    expect(multiCandidate).toBeGreaterThan(150)

    const rate = topRanked / multiCandidate
    console.log(`[ai-clamp] easy top-rank rate ${rate.toFixed(3)} over ${multiCandidate} choices`)
    expect(rate).toBeGreaterThan(0.25)
    // And it must NOT be argmax — that would be the hardest level wearing the
    // easiest level's name, which is the same inert-vocabulary failure seen
    // from the other side.
    expect(rate).toBeLessThan(0.95)
  })

  it('the hardest level is argmax and draws no random number', () => {
    const state = currentState(createMatch({ content, presetId: BUNDLED_PRESET_ID, seed: 12 }))
    const first = chooseWithDetail(state, content, { difficulty: 'hard', seed: 1, nodeBudget: 900 })
    const second = chooseWithDetail(state, content, { difficulty: 'hard', seed: 999_983, nodeBudget: 900 })
    // Same position, wildly different agent seeds, same answer: the seed cannot
    // be reaching the selection at all. This is what lets AC-009 assert on the
    // hardest level's chosen action rather than only on its scores.
    expect(first.action).toEqual(second.action)
    expect(first.wasTopRanked).toBe(true)
  })
})
