import { describe, expect, it } from 'vitest'
import { describeRejection, legalActions } from '@engine/engine'
import { createPosition } from '@engine/match'
import { BUNDLED_PRESET_ID } from '@content/sets/bundled'
import type { GameState, Side } from '@engine/types'
import { shippedContent } from '../helpers/shipped'

/**
 * PLAN Phase 4 (ADR-010) — a refusal names what refused.
 *
 * The report behind this: a piece is plainly able to take something, no capture marker
 * appears, and tapping does nothing. Phase 3's oracle proved move generation is correct over
 * ~480 sampled positions, so the defect was never the rule — it was that every refusal
 * answered "그 칸까지 갈 수 없어요", including the ones where the piece could reach the square
 * perfectly well and a painted square, a passive or a blockade is what stopped it.
 *
 * `a4` is `square.sanctuary` in the shipped board and its `generate_moves` effect is
 * `block_capture: { target: occupant }`. That is not a fixture invented for this test; it is
 * the content the game ships, and it is what a player runs into.
 *
 * The negative case at the end is the one that keeps the new code honest. Reporting
 * "protected" about a square the piece could never have reached would swap one wrong answer
 * for another, and it is the easy mistake to make when adding a reason for a square that
 * happens to be protected.
 */

const content = shippedContent()
const at = (square: string, pieceId: string, side: Side) => ({ square, pieceId, side })

function position(sideToMove: Side, placements: Array<{ square: string; pieceId: string; side: Side }>): GameState {
  return createPosition({ content, presetId: BUNDLED_PRESET_ID, seed: 11, sideToMove, placements, ruleCardId: null })
}

const SANCTUARY = 'a4'

describe('describeRejection names the cause (PLAN Phase 4)', () => {
  it('says the target is protected when a reachable capture is blocked by the board', () => {
    const state = position('white', [
      at('a1', 'piece.rook', 'white'),
      at(SANCTUARY, 'piece.rook', 'black'),
      at('f1', 'piece.king', 'white'),
      at('f6', 'piece.king', 'black'),
    ])
    // The premise, asserted rather than assumed: the engine really does refuse this move.
    // Without it a passing reason code could be describing a legal move.
    const offered = legalActions(state, content).some((a) => a.kind === 'move' && a.from === 'a1' && a.to === SANCTUARY)
    expect(offered, 'the engine offered the capture, so there is no refusal to describe').toBe(false)

    expect(describeRejection(state, { kind: 'move', from: 'a1', to: SANCTUARY }, content)).toBe('target-protected')
  })

  it('says protected for a jump onto the same square, not only for a slide', () => {
    const state = position('white', [
      at('b2', 'piece.knight', 'white'),
      at(SANCTUARY, 'piece.rook', 'black'),
      at('f1', 'piece.king', 'white'),
      at('f6', 'piece.king', 'black'),
    ])
    expect(describeRejection(state, { kind: 'move', from: 'b2', to: SANCTUARY }, content)).toBe('target-protected')
  })

  it('does NOT say protected about a protected square the piece cannot reach', () => {
    // A pawn on d2 has no business on a4 by any pattern it owns. The square is protected all
    // the same, so a reason keyed on protection alone would answer "protected" here — and
    // send the player looking for a way around a rule that was never the obstacle.
    const state = position('white', [
      at('d2', 'piece.pawn', 'white'),
      at(SANCTUARY, 'piece.rook', 'black'),
      at('f1', 'piece.king', 'white'),
      at('f6', 'piece.king', 'black'),
    ])
    expect(describeRejection(state, { kind: 'move', from: 'd2', to: SANCTUARY }, content)).toBe('unreachable')
  })

  it('says the mover is frozen before it says anything about the destination', () => {
    const base = position('white', [
      at('d1', 'piece.rook', 'white'),
      at('d4', 'piece.rook', 'black'),
      at('f1', 'piece.king', 'white'),
      at('f6', 'piece.king', 'black'),
    ])
    // The capture is legal in the base position — so the only thing the freeze changes is the
    // answer, which is what makes this a measurement of the freeze.
    expect(describeRejection(base, { kind: 'move', from: 'd1', to: 'd4' }, content)).toBeNull()

    const frozen: GameState = {
      ...base,
      frozenUntil: { d1: { untilPly: base.plyCount + 2, sourceId: 'skill.freeze', layer: 'skill' } },
    }
    expect(describeRejection(frozen, { kind: 'move', from: 'd1', to: 'd4' }, content)).toBe('piece-frozen')
  })

  it('says the mover is blockaded when a grant forbids its square', () => {
    const base = position('white', [
      at('d1', 'piece.rook', 'white'),
      at('d4', 'piece.rook', 'black'),
      at('f1', 'piece.king', 'white'),
      at('f6', 'piece.king', 'black'),
    ])
    const blocked: GameState = {
      ...base,
      grants: [
        { kind: 'forbid_movement', square: 'd1', untilPly: base.plyCount + 2, sourceId: 'skill.shackle', layer: 'skill' },
      ],
    }
    expect(describeRejection(blocked, { kind: 'move', from: 'd1', to: 'd4' }, content)).toBe('piece-forbidden')
  })

  it('still names the ordinary refusals, and stays null for a legal action', () => {
    const state = position('white', [
      at('d1', 'piece.rook', 'white'),
      at('d4', 'piece.rook', 'black'),
      at('f1', 'piece.king', 'white'),
      at('f6', 'piece.king', 'black'),
    ])
    expect(describeRejection(state, { kind: 'move', from: 'c3', to: 'c4' }, content)).toBe('empty-square')
    expect(describeRejection(state, { kind: 'move', from: 'd4', to: 'd3' }, content)).toBe('not-your-piece')
    expect(describeRejection(state, { kind: 'move', from: 'd1', to: 'd4' }, content)).toBeNull()
  })
})
