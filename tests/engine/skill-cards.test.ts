import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import { PLY_CAP, apply, describeRejection, legalActions } from '@engine/engine'
import { createPosition } from '@engine/match'
import { BUNDLED_PRESET_ID } from '@content/sets/bundled'
import { referenceContent } from '../helpers/content'
import { shippedContent } from '../helpers/shipped'

const content = referenceContent()

/**
 * The shipped set, for the three cards this file's turn-shape tests need.
 *
 * `referenceContent()` is the hand-built fixture and carries none of
 * `skill.knight-leap` (grant_movement), `skill.volley` (destroy_piece on a
 * chosen enemy) — and `cardPlays` skips a held id the content set does not
 * define, so a test written against the fixture would produce no `play_card`
 * and fail identically before and after the implementation lands. A false RED
 * that no Phase C can turn green is worse than no test.
 */
const shipped = shippedContent()

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
 * The turn is `[play_card?] → move` (ADR-001, replacing the retired AC-007).
 *
 * AC-007 used to promise that a card play consumed the whole turn. It no longer
 * does: the card resolves, the board stays with the same player, and the move
 * that follows is what closes the ply. Two clauses of the old criterion survive
 * unchanged and are pinned here rather than deleted with it — the card is marked
 * used and cannot be played again, and a card play still makes no board move.
 */
describe('turn shape — a card does not end the turn', () => {
  it('keeps the side and the ply, and records the card as this turn’s', () => {
    const before = positionHolding('skill.teleport')
    const play = legalActions(before, content).find((a) => a.kind === 'play_card')
    expect(play, 'a held card should be playable').toBeDefined()

    const after = apply(before, play!, content)
    expect(after.sideToMove, 'the card does not hand the board over').toBe(before.sideToMove)
    expect(after.plyCount, 'the card does not advance the ply').toBe(before.plyCount)
    expect(after.turnCard).toBe('skill.teleport')
    expect(after.movesMadeLastPly).toBe(0)
  })

  it('marks the card used the moment it resolves, exactly once', () => {
    const before = positionHolding('skill.teleport')
    const play = legalActions(before, content).find((a) => a.kind === 'play_card')!
    const after = apply(before, play, content)
    // Consumption is the surviving half of AC-007, and it is recorded by the
    // card branch — not by the close-out, which no longer sees a card id.
    expect(after.drafts[before.sideToMove].used.filter((c) => c === 'skill.teleport')).toHaveLength(1)
  })

  it('offers no second card in the same turn', () => {
    const before = createPosition({
      content,
      presetId: 'preset.default',
      seed: 1,
      sideToMove: 'white',
      held: { white: ['skill.teleport', 'skill.freeze'], black: [] },
      placements: [
        { square: 'a1', pieceId: 'piece.king', side: 'white' },
        { square: 'b1', pieceId: 'piece.rook', side: 'white' },
        { square: 'f6', pieceId: 'piece.king', side: 'black' },
        { square: 'e6', pieceId: 'piece.rook', side: 'black' },
      ],
    })
    const play = legalActions(before, content).find((a) => a.kind === 'play_card')!
    const after = apply(before, play, content)
    // The side clause is load-bearing: under the OLD turn model this assertion
    // passes for the wrong reason — the board has been handed to black, who
    // holds nothing, so "no card play" is true without the one-card rule
    // existing at all. Pinning that it is still WHITE's turn is what makes this
    // a test of the rule rather than of the hand-off.
    expect(after.sideToMove).toBe('white')
    const legal = legalActions(after, content)
    expect(legal.some((a) => a.kind === 'play_card')).toBe(false)
    const moves = legal.filter((a) => a.kind === 'move')
    expect(moves.length).toBeGreaterThan(0)
    for (const m of moves) {
      expect(after.board.get(m.from)?.side, 'the follow-up move belongs to the card’s owner').toBe('white')
    }
  })

  it('closes the ply on the follow-up move, bumping the turn count once', () => {
    const before = positionHolding('skill.teleport')
    const play = legalActions(before, content).find((a) => a.kind === 'play_card')!
    const mid = apply(before, play, content)
    const move = legalActions(mid, content).find((a) => a.kind === 'move')!
    const after = apply(mid, move, content)

    expect(after.sideToMove).not.toBe(before.sideToMove)
    expect(after.plyCount).toBe(before.plyCount + 1)
    expect(after.turnCard).toBeNull()
    expect(after.movesMadeLastPly).toBe(1)
    // Once per TURN, not once per action — the AC-006 second-draft trigger
    // counts completed turns, and double-counting opens it a turn early.
    expect(after.drafts[before.sideToMove].completedTurns).toBe(
      before.drafts[before.sideToMove].completedTurns + 1,
    )
  })

  it('never offers a spent card again', () => {
    const before = positionHolding('skill.teleport')
    const play = legalActions(before, content).find((a) => a.kind === 'play_card')!
    const mid = apply(before, play, content)
    const whiteMove = legalActions(mid, content).find((a) => a.kind === 'move')!
    const afterWhite = apply(mid, whiteMove, content)
    const blackMove = legalActions(afterWhite, content).find((a) => a.kind === 'move')!
    const whiteAgain = apply(afterWhite, blackMove, content)
    expect(legalActions(whiteAgain, content).some((a) => a.kind === 'play_card')).toBe(false)
  })

  it('holds for every active card in the pool', () => {
    fc.assert(
      fc.property(fc.constantFrom(...[...content.skillCards.keys()]), (cardId) => {
        const before = positionHolding(cardId)
        const play = legalActions(before, content).find((a) => a.kind === 'play_card' && a.cardId === cardId)
        if (!play) return // not legal from this position — nothing to assert
        const after = apply(before, play, content)
        if (after.result) return // a card that ends the match closes the ply itself
        expect(after.sideToMove).toBe(before.sideToMove)
        expect(after.plyCount).toBe(before.plyCount)
        expect(after.movesMadeLastPly).toBe(0)
      }),
      { numRuns: 20 },
    )
  })
})

/**
 * The effect a card creates is live for that same turn's move (ADR-002).
 *
 * This is the whole point of counting the turn as one ply: "grant it a leap,
 * then leap" has to be one turn, or the card is still a turn you did not get.
 */
describe('same-turn effect application', () => {
  it('lets the granted piece use the pattern the card just gave it', () => {
    const before = createPosition({
      content: shipped,
      presetId: BUNDLED_PRESET_ID,
      seed: 1,
      sideToMove: 'white',
      held: { white: ['skill.knight-leap'], black: [] },
      placements: [
        { square: 'a1', pieceId: 'piece.king', side: 'white' },
        { square: 'c3', pieceId: 'piece.rook', side: 'white' },
        { square: 'f6', pieceId: 'piece.king', side: 'black' },
      ],
    })
    // A rook cannot reach d5; a knight leap from c3 can.
    expect(legalActions(before, shipped).some((a) => a.kind === 'move' && a.from === 'c3' && a.to === 'd5')).toBe(false)

    const play = legalActions(before, shipped).find(
      (a) => a.kind === 'play_card' && a.cardId === 'skill.knight-leap' && a.targets[0] === 'c3',
    )
    expect(play, 'the leap should be playable on the rook').toBeDefined()
    const mid = apply(before, play!, shipped)
    expect(legalActions(mid, shipped).some((a) => a.kind === 'move' && a.from === 'c3' && a.to === 'd5')).toBe(true)
  })
})

/**
 * A card can end the match on its own, and the close-out must not be lost.
 *
 * `engine.ts` used to compute the result once per ply, at the end of a block the
 * card branch also passed through. With the card no longer closing the ply, the
 * royal-transition check has to run per ACTION — it is judged against the board
 * at the start of the action, and after a card destroys a king the follow-up
 * move's "before" board is already royal-less.
 */
describe('a card that ends the match', () => {
  it('returns a terminal state from the card branch itself', () => {
    const before = createPosition({
      content: shipped,
      presetId: BUNDLED_PRESET_ID,
      seed: 1,
      sideToMove: 'white',
      held: { white: ['skill.volley'], black: [] },
      placements: [
        { square: 'a1', pieceId: 'piece.king', side: 'white' },
        { square: 'b1', pieceId: 'piece.rook', side: 'white' },
        { square: 'f6', pieceId: 'piece.king', side: 'black' },
      ],
    })
    const play = legalActions(before, shipped).find(
      (a) => a.kind === 'play_card' && a.cardId === 'skill.volley' && a.targets[0] === 'f6',
    )
    expect(play, 'volley should be able to name the enemy king').toBeDefined()

    const after = apply(before, play!, shipped)
    expect(after.result, 'destroying the last royal ends the match immediately').toEqual({
      kind: 'win',
      winner: 'white',
      reason: 'king_capture',
    })
    expect(after.turnCard, 'a terminal state carries no pending turn').toBeNull()
    expect(legalActions(after, shipped)).toHaveLength(0)
  })

  it('clears the pending turn when the follow-up move captures a royal', () => {
    const before = createPosition({
      content: shipped,
      presetId: BUNDLED_PRESET_ID,
      seed: 1,
      sideToMove: 'white',
      held: { white: ['skill.knight-leap'], black: [] },
      placements: [
        { square: 'a1', pieceId: 'piece.king', side: 'white' },
        { square: 'c3', pieceId: 'piece.rook', side: 'white' },
        { square: 'd5', pieceId: 'piece.king', side: 'black' },
      ],
    })
    const play = legalActions(before, shipped).find(
      (a) => a.kind === 'play_card' && a.cardId === 'skill.knight-leap' && a.targets[0] === 'c3',
    )
    expect(play, 'the leap should be playable on the rook').toBeDefined()
    const mid = apply(before, play!, shipped)
    const capture = legalActions(mid, shipped).find((a) => a.kind === 'move' && a.from === 'c3' && a.to === 'd5')
    expect(capture, 'the granted leap should reach the enemy king').toBeDefined()
    const after = apply(mid, capture!, shipped)

    // The royal-capture short-circuit returns early and enumerates its own
    // overrides, so it is the one close-out that can ship a stale turnCard.
    expect(after.result).toEqual({ kind: 'win', winner: 'white', reason: 'king_capture' })
    expect(after.turnCard).toBeNull()
    expect(after.drafts.white.used).toContain('skill.knight-leap')
  })
})

/**
 * The forced pass (ADR-003).
 *
 * "A card, then a move" has an absent case: the card may leave the mover with
 * nothing that can move. `end_turn` is the escape hatch, and it is deliberately
 * narrow — legal only while a card is pending AND no move exists — so it can
 * never be used to skip a turn voluntarily.
 */
describe('end_turn — the forced pass', () => {
  /** White reduced to one king, frozen by black, holding a card that moves nothing. */
  function whiteFrozenToMove(opts: { plyCount?: number; ruleCardId?: string | null } = {}) {
    const before = createPosition({
      content: shipped,
      presetId: BUNDLED_PRESET_ID,
      seed: 3,
      sideToMove: 'black',
      held: { white: ['skill.bulwark'], black: ['skill.freeze'] },
      placements: [
        { square: 'a1', pieceId: 'piece.king', side: 'white' },
        { square: 'f6', pieceId: 'piece.king', side: 'black' },
        { square: 'e6', pieceId: 'piece.rook', side: 'black' },
      ],
      ...(opts.plyCount !== undefined ? { plyCount: opts.plyCount } : {}),
      ...(opts.ruleCardId !== undefined ? { ruleCardId: opts.ruleCardId } : {}),
    })
    const freeze = legalActions(before, shipped).find(
      (a) => a.kind === 'play_card' && a.cardId === 'skill.freeze' && a.targets[0] === 'a1',
    )
    expect(freeze, 'black should be able to freeze the white king').toBeDefined()
    const frozen = apply(before, freeze!, shipped)
    const blackMove = legalActions(frozen, shipped).find((a) => a.kind === 'move' && a.from === 'e6')
    expect(blackMove, 'black should have a rook move to close its turn').toBeDefined()
    const white = apply(frozen, blackMove!, shipped)
    // The fixture spends one ply of its own closing black's turn. A caller that
    // gets the arithmetic wrong would otherwise hand this back already finished,
    // and every assertion downstream would fail on an unrelated crash three
    // lines later instead of here, where the mistake is.
    expect(white.result, 'the fixture must hand back a live match').toBeNull()
    expect(white.sideToMove).toBe('white')
    expect(legalActions(white, shipped).some((a) => a.kind === 'move'), 'the white king should be frozen').toBe(false)
    return white
  }

  it('is not offered before a card is played, however stuck the mover is', () => {
    const white = whiteFrozenToMove()
    // The escape hatch is for a turn a card has already begun. Offering it here
    // would be a voluntary pass, which is a different game.
    expect(legalActions(white, shipped).some((a) => a.kind === 'end_turn')).toBe(false)
    expect(legalActions(white, shipped).every((a) => a.kind === 'play_card')).toBe(true)
  })

  it('is the only action left once the card leaves nothing to move', () => {
    const white = whiteFrozenToMove()
    const play = legalActions(white, shipped).find((a) => a.kind === 'play_card')!
    const mid = apply(white, play, shipped)
    expect(legalActions(mid, shipped).map((a) => a.kind)).toEqual(['end_turn'])
  })

  it('closes the ply with no move made, and bumps the turn once', () => {
    const white = whiteFrozenToMove()
    const play = legalActions(white, shipped).find((a) => a.kind === 'play_card')!
    const mid = apply(white, play, shipped)
    const pass = legalActions(mid, shipped).find((a) => a.kind === 'end_turn')!
    const after = apply(mid, pass, shipped)

    expect(after.plyCount).toBe(mid.plyCount + 1)
    expect(after.sideToMove).toBe('black')
    expect(after.turnCard).toBeNull()
    expect(after.movesMadeLastPly).toBe(0)
    expect(after.drafts.white.completedTurns).toBe(mid.drafts.white.completedTurns + 1)
  })

  it('is never offered while a move exists', () => {
    const before = positionHolding('skill.teleport')
    const play = legalActions(before, content).find((a) => a.kind === 'play_card')!
    const mid = apply(before, play, content)
    expect(legalActions(mid, content).some((a) => a.kind === 'move')).toBe(true)
    expect(legalActions(mid, content).some((a) => a.kind === 'end_turn')).toBe(false)
  })

  it('runs the end-of-ply layer, so a rule card still fires on a passed turn', () => {
    // `rule.conscription` spawns a pawn on the mover's back rank at end_of_ply
    // while they hold three pieces or fewer. White holds exactly one. A close-out
    // that skipped E7 would make a forced pass the one ply on which no rule card
    // in the game can act, and nothing else would say so.
    const white = whiteFrozenToMove({ ruleCardId: 'rule.conscription' })
    const play = legalActions(white, shipped).find((a) => a.kind === 'play_card')!
    const mid = apply(white, play, shipped)
    const pass = legalActions(mid, shipped).find((a) => a.kind === 'end_turn')!
    const after = apply(mid, pass, shipped)

    expect(after.log.some((entry) => entry.startsWith('end_of_ply:rule:rule.conscription'))).toBe(true)
    expect(after.board.size, 'the rule should have put a pawn on the board').toBe(mid.board.size + 1)
  })

  it('reaches the cap like any other ply, and takes the material result with it', () => {
    // The cap is evaluated in the close-out. A forced pass that skipped it would
    // let a match walk past PLY_CAP with no result — AC-003's bound, broken by
    // the one ply nobody scripts.
    // Two ply-closing actions stand between here and the cap: black's move
    // inside the fixture, then white's own forced pass. `PLY_CAP - 2` is what
    // makes the SECOND of them the one that crosses it — at `PLY_CAP - 1` the
    // match ends during setup and the pass under test never happens.
    const white = whiteFrozenToMove({ plyCount: PLY_CAP - 2 })
    expect(white.plyCount).toBe(PLY_CAP - 1)
    const play = legalActions(white, shipped).find((a) => a.kind === 'play_card')!
    const mid = apply(white, play, shipped)
    const pass = legalActions(mid, shipped).find((a) => a.kind === 'end_turn')!
    const after = apply(mid, pass, shipped)

    expect(after.plyCount).toBe(PLY_CAP)
    // The concrete shape, not merely "something": white is down to a lone king
    // against a king and a rook, and `materialResult` counts pieces. A non-null
    // check here would pass for a cap that named the wrong winner or reported
    // `king_capture` — which is the bug this ply exists to catch.
    expect(after.result).toEqual({ kind: 'win', winner: 'black', reason: 'material_cap' })
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
