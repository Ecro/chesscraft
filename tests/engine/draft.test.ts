import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import { apply, legalActions } from '@engine/engine'
import { createMatch, currentState } from '@engine/match'
import { referenceContent } from '../helpers/content'
import { startedMatch, startedState } from '../helpers/match'

const content = referenceContent()

/** AC-005 — the first skill draft offers 3 distinct cards and gates board play. */
describe('AC-005 opening draft', () => {
  it('offers exactly 3 distinct skill cards to the side on turn', () => {
    const state = currentState(createMatch({ content, presetId: 'preset.default', seed: 42 }))
    const picks = legalActions(state, content).filter((a) => a.kind === 'draft_pick')
    expect(picks).toHaveLength(3)
    const ids = picks.map((p) => (p.kind === 'draft_pick' ? p.cardId : ''))
    expect(new Set(ids).size).toBe(3)
  })

  it('accepts no board action until the pick is made', () => {
    const state = currentState(createMatch({ content, presetId: 'preset.default', seed: 42 }))
    expect(legalActions(state, content).some((a) => a.kind === 'move')).toBe(false)
  })

  it('holds exactly the picked card afterwards', () => {
    const state = currentState(createMatch({ content, presetId: 'preset.default', seed: 42 }))
    const pick = legalActions(state, content).find((a) => a.kind === 'draft_pick')!
    const after = apply(state, pick, content)
    const side = state.sideToMove
    expect(after.drafts[side].held).toEqual([pick.kind === 'draft_pick' ? pick.cardId : ''])
  })
})

/**
 * Recurring awards replace the old second-draft gate. The boundary is still
 * five completed turns, but it grants one card immediately and never blocks
 * board play with another offer.
 */
describe('recurring skill awards', () => {
  it('awards one card after five completed turns without opening another draft', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 100_000 }), (seed) => {
        let match = startedMatch(content, seed)
        let state = currentState(match)
        const side = state.sideToMove
        const firstHeld = [...state.drafts[side].held]

        for (let i = 0; i < 40 && state.drafts[side].completedTurns < 5 && !state.result; i += 1) {
          const actions = legalActions(state, content)
          const chosen = actions.find((a) => a.kind === 'move')
          if (!chosen) break
          state = apply(state, chosen, content)
          match = { ...match, states: [...match.states, state] }
        }

        expect(state.drafts[side].completedTurns, `seed ${seed} did not reach five turns`).toBeGreaterThanOrEqual(5)
        expect(state.drafts[side].awardCount).toBe(1)
        expect(state.drafts[side].nextSkillTurn).toBe(10)
        expect(state.drafts[side].held).toHaveLength(firstHeld.length + 1)
        expect(state.drafts[side].offers).toBeNull()
        expect(legalActions(state, content).some((a) => a.kind === 'draft_pick')).toBe(false)
        expect(state.drafts[side].held.filter((id) => firstHeld.includes(id))).toHaveLength(firstHeld.length)
      }),
      { numRuns: 25 },
    )
  })
})

/**
 * AC-006 no-bias clause — offers depend only on (seed, pool, player, draftIndex).
 *
 * A deterministic algorithm can still be biased: determinism and disjointness
 * both pass on a position-dependent implementation, so neither covers this.
 */
describe('AC-006 offers are independent of board position', () => {
  it('produces the same opening offer regardless of the board it is drawn against', () => {
    const shuffled = referenceContent()
    // Same seed and pool, different starting board: drop two pawns so the
    // material balance and legal-move count differ from the reference.
    const board = shuffled.boards.get('board.los-alamos')!
    const thinned = {
      ...board,
      placements: board.placements.filter((p) => !(p.pieceId === 'piece.pawn' && p.square.startsWith('a'))),
    }
    shuffled.boards.set('board.los-alamos', thinned)

    for (const seed of [1, 2, 3, 99]) {
      const a = currentState(createMatch({ content, presetId: 'preset.default', seed }))
      const b = currentState(createMatch({ content: shuffled, presetId: 'preset.default', seed }))
      expect(b.board.size).not.toBe(a.board.size) // the boards really do differ
      expect(b.drafts[b.sideToMove].offers).toEqual(a.drafts[a.sideToMove].offers)
    }
  })
})

/** AC-004 — rule card and offers derive deterministically from the match seed. */
describe('AC-004 seed determinism', () => {
  it('draws the same rule card and the same offers for the same seed', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 2 ** 31 - 1 }), (seed) => {
        const a = currentState(createMatch({ content, presetId: 'preset.default', seed }))
        const b = currentState(createMatch({ content, presetId: 'preset.default', seed }))
        expect(b.ruleCardId).toBe(a.ruleCardId)
        expect(b.drafts.white.offers).toEqual(a.drafts.white.offers)
        expect(b.drafts.black.offers).toEqual(a.drafts.black.offers)
      }),
      { numRuns: 30 },
    )
  })

  it('keeps the drawn rule card visible for the whole match', () => {
    const state = startedState(content, 5)
    expect(state.ruleCardId).not.toBeNull()
    expect(content.ruleCards.has(state.ruleCardId!)).toBe(true)
  })
})
