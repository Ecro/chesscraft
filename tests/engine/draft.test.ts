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
 * AC-006 — the second draft opens after five completed turns with no repeats.
 *
 * Disjointness is a set-theoretic invariant over arbitrary seeds; it holds for
 * every correct implementation and never names which cards are expected, so it
 * cannot be satisfied by reading the drawing code.
 */
describe('AC-006 second draft', () => {
  it('opens at the start of the sixth turn, offering cards the player does not hold', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 100_000 }), (seed) => {
        let match = startedMatch(content, seed)
        let state = currentState(match)
        const side = state.sideToMove
        const firstHeld = [...state.drafts[side].held]

        let sawSecondOffer: string[] | null = null
        for (let i = 0; i < 40 && !sawSecondOffer && !state.result; i += 1) {
          const picks = legalActions(state, content).filter((a) => a.kind === 'draft_pick')
          if (picks.length > 0 && state.sideToMove === side) {
            expect(state.drafts[side].completedTurns).toBe(5)
            sawSecondOffer = picks.map((p) => (p.kind === 'draft_pick' ? p.cardId : ''))
            break
          }
          const actions = legalActions(state, content)
          const chosen = picks[0] ?? actions.find((a) => a.kind === 'move')
          if (!chosen) break
          state = apply(state, chosen, content)
          match = { ...match, states: [...match.states, state] }
        }

        expect(sawSecondOffer, `no second offer for seed ${seed}`).not.toBeNull()
        expect(sawSecondOffer!).toHaveLength(3)
        expect(new Set(sawSecondOffer!).size).toBe(3)
        for (const id of sawSecondOffer!) expect(firstHeld).not.toContain(id)
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
