import { describe, expect, it } from 'vitest'
import { loadBundledContent } from '@content/sets/bundled'
import { complexityOf, withinEnvelope, COMPLEXITY_BOUND } from '@engine/ai/complexity'
import { legalActions } from '@engine/engine'
import { createMatch, createPosition, currentState } from '@engine/match'

/**
 * PLAN Phase 6 — the 8x8 room (SPEC AC-009).
 *
 * The engine needed nothing for this. `inBounds` reads `state.width` and
 * `state.height` (`engine.ts:104`), slide distance defaults to
 * `Math.max(width, height)`, and the renderer sizes its grid from state — so a
 * bigger board is a CONTENT record, and the point of these tests is to prove
 * that claim rather than assert it.
 */

const content = loadBundledContent()
const GRAND = 'preset.grand'

describe('AC-009: the 8x8 preset is admitted for single-player', () => {
  it('loads as part of the shipped bundle', () => {
    const board = content.boards.get('board.grand')
    expect(board?.width).toBe(8)
    expect(board?.height).toBe(8)
    expect(board?.placements.length, 'eight behind eight, both sides').toBe(32)
  })

  it('scores inside the AI complexity envelope, with the numbers stated', () => {
    const verdict = withinEnvelope(content, GRAND)
    const score = complexityOf(content, GRAND)

    // Printed rather than merely asserted: the bound is what a future room has
    // to fit under, and "it passed" tells the next author nothing about how much
    // room is left. Measured 2026-08-13.
    expect(verdict.ok, `outside the envelope: ${verdict.reason}, score ${score.total}`).toBe(true)
    expect(score.boardArea, 'sixty-four squares').toBe(64)
    expect(score.total, `score ${score.total} of ${COMPLEXITY_BOUND}`).toBeLessThan(COMPLEXITY_BOUND)
  })

  it('starts a match with a full board and an open draft', () => {
    const state = currentState(createMatch({ content, presetId: GRAND, seed: 1 }))
    expect(state.width).toBe(8)
    expect(state.board.size, 'thirty-two pieces at the opening').toBe(32)
    expect(state.drafts.white.offers, 'the draft opens the same way it does at 6x6').toHaveLength(3)
  })

  it('generates moves off the eighth file, which a 6x6 board has no way to reach', () => {
    // The discriminator against a board that merely CLAIMS to be 8 wide: a
    // knight on g1 has moves on the h file, and `squareId`/`coords` have to
    // round-trip a letter no 6x6 room ever produces.
    // Built rather than dealt: `createMatch` opens a draft, and while one is
    // pending `legalActions` returns only `draft_pick` — so a move assertion on
    // the opening state would read zero for a reason that has nothing to do with
    // the board.
    const state = createPosition({
      content,
      presetId: GRAND,
      seed: 1,
      sideToMove: 'white',
      placements: [
        { square: 'a1', pieceId: 'piece.king', side: 'white' },
        { square: 'g1', pieceId: 'piece.knight', side: 'white' },
        { square: 'a8', pieceId: 'piece.king', side: 'black' },
      ],
      ruleCardId: null,
      held: { white: [] },
      captured: { white: [] },
    })
    const eighthFile = legalActions(state, content).filter((a) => a.kind === 'move' && a.to.startsWith('h'))
    expect(eighthFile.length, 'nothing can reach the h file').toBeGreaterThan(0)
  })

  it('deals no rule card that encodes 6x6 coordinates', () => {
    /*
     * Four shipped rule cards name squares or ranks that mean something else on
     * eight ranks — `CENTRE` (c3/c4/d3/d4) for the two hill cards, `on_own_rank`
     * 5 and 6 for the promotion and beacon cards. Each would still FIRE here,
     * just somewhere its own text does not describe, which is worse than not
     * firing at all.
     *
     * Pinned as an exclusion list rather than left to the room's author: the
     * next 8x8 room will be written by copying this one.
     */
    const BOARD_COUPLED = ['rule.king-of-the-hill', 'rule.harvest', 'rule.fast-promotion', 'rule.beacon']
    const dealt = content.presets.get(GRAND)!.ruleCardIds
    expect(dealt.filter((id) => BOARD_COUPLED.includes(id))).toEqual([])
  })
})
