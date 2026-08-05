import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import { apply, describeRejection, legalActions } from '@engine/engine'
import { createPosition } from '@engine/match'
import { referenceContent } from '../helpers/content'

const content = referenceContent()

function positionHolding(cardId: string, sideToMove: 'white' | 'black' = 'white') {
  return createPosition({
    content,
    presetId: 'preset.default',
    seed: 1,
    sideToMove,
    held: { white: [cardId], black: ['skill.freeze'] },
    placements: [
      { square: 'a1', pieceId: 'piece.king', side: 'white' },
      { square: 'b1', pieceId: 'piece.rook', side: 'white' },
      { square: 'f6', pieceId: 'piece.king', side: 'black' },
      { square: 'e6', pieceId: 'piece.rook', side: 'black' },
    ],
  })
}

/**
 * AC-007 — playing a skill card consumes the entire turn.
 *
 * The relation compares before/after: side-to-move flips, the card is marked
 * used, and the mover made no board move. It holds for every card and is not
 * derived from any card's implementation.
 */
describe('AC-007 card play consumes the turn', () => {
  it('flips the side to move, marks the card used, and makes no board move', () => {
    const before = positionHolding('skill.teleport')
    const play = legalActions(before, content).find((a) => a.kind === 'play_card')
    expect(play, 'a held card should be playable').toBeDefined()

    const after = apply(before, play!, content)
    expect(after.sideToMove).not.toBe(before.sideToMove)
    expect(after.drafts[before.sideToMove].used).toContain('skill.teleport')
    expect(after.movesMadeLastPly).toBe(0)
  })

  it('cannot play the same card twice', () => {
    const before = positionHolding('skill.teleport')
    const play = legalActions(before, content).find((a) => a.kind === 'play_card')!
    const after = apply(before, play, content)
    // Back to white after black moves.
    const blackMove = legalActions(after, content).find((a) => a.kind === 'move')!
    const whiteAgain = apply(after, blackMove, content)
    expect(legalActions(whiteAgain, content).some((a) => a.kind === 'play_card')).toBe(false)
  })

  it('holds for every active card in the pool', () => {
    fc.assert(
      fc.property(fc.constantFrom(...[...content.skillCards.keys()]), (cardId) => {
        const before = positionHolding(cardId)
        const play = legalActions(before, content).find((a) => a.kind === 'play_card' && a.cardId === cardId)
        if (!play) return // not legal from this position — nothing to assert
        const after = apply(before, play, content)
        expect(after.sideToMove).not.toBe(before.sideToMove)
        expect(after.movesMadeLastPly).toBe(0)
      }),
      { numRuns: 20 },
    )
  })
})

/**
 * AC-008 — skill cards cannot be played out of turn or in response.
 *
 * Rejection plus state-unchanged is fixed by the SPEC's timing constraint (no
 * response cards), not observed from the engine.
 */
describe('AC-008 out-of-turn card play', () => {
  it('never offers the opponent a card play', () => {
    const state = positionHolding('skill.teleport', 'white')
    const plays = legalActions(state, content).filter((a) => a.kind === 'play_card')
    for (const p of plays) {
      if (p.kind !== 'play_card') continue
      expect(content.skillCards.has(p.cardId)).toBe(true)
      expect(state.drafts[state.sideToMove].held).toContain(p.cardId)
    }
    // Black holds skill.freeze, but it is white's turn.
    expect(plays.some((p) => p.kind === 'play_card' && p.cardId === 'skill.freeze')).toBe(false)
  })

  it('rejects the action and leaves the state unchanged', () => {
    const state = positionHolding('skill.teleport', 'white')
    const illegal = { kind: 'play_card', cardId: 'skill.freeze', targets: [] } as const
    // Identity, not a copy: no new state is produced for an illegal action.
    expect(apply(state, illegal, content)).toBe(state)
  })

  it('explains the rejection instead of failing silently', () => {
    const state = positionHolding('skill.teleport', 'white')
    const illegal = { kind: 'play_card', cardId: 'skill.freeze', targets: [] } as const
    // The UI needs a reason to show (AC-008's surfaced-rejection clause).
    const reason = describeRejection(state, illegal, content)
    expect(reason).toBeTruthy()
    expect(describeRejection(state, legalActions(state, content)[0]!, content)).toBeNull()
  })
})
