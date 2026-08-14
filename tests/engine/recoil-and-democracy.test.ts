import { describe, expect, it } from 'vitest'
import { loadBundledContent } from '@content/sets/bundled'
import { apply, legalActions } from '@engine/engine'
import { createPosition } from '@engine/match'
import type { GameState, Side, SquareId } from '@engine/types'

/**
 * PLAN Phase 5 — SPEC AC-006 and AC-008, against the SHIPPED bundle.
 *
 * `card-liveness.test.ts` proves both cards change state; these prove they
 * change the RIGHT state. The two questions are different and the survey
 * deliberately does not answer the second one — three of the four defects it
 * once found were cards that changed state, just the wrong state.
 */

const content = loadBundledContent()

type Place = { square: SquareId; pieceId: string; side: Side }
const at = (square: SquareId, pieceId: string, side: Side = 'white'): Place => ({ square, pieceId, side })

function position(placements: Place[], ruleCardId: string | null, presetId = 'preset.covenant'): GameState {
  return createPosition({
    content,
    presetId,
    seed: 1,
    sideToMove: 'white',
    placements,
    ruleCardId,
    held: { white: [] },
    captured: { white: [] },
  })
}

function move(state: GameState, from: SquareId, to: SquareId): GameState {
  const action = legalActions(state, content).find((a) => a.kind === 'move' && a.from === from && a.to === to)
  if (!action) throw new Error(`${from}->${to} is not legal — the fixture is wrong, not the engine`)
  return apply(state, action, content)
}

// ---------------------------------------------------------------------------
// AC-006 — the capture tax keeps the piece
// ---------------------------------------------------------------------------

describe('AC-006: capturing freezes the capturer instead of destroying it', () => {
  const board: Place[] = [at('a1', 'piece.king'), at('d1', 'piece.rook'), at('d5', 'piece.knight', 'black'), at('f6', 'piece.king', 'black')]

  it('leaves the capturer standing, frozen, on the square it took', () => {
    const after = move(position(board, 'rule.blood-toll'), 'd1', 'd5')

    expect(after.board.get('d5')?.pieceId, 'the rook completed the capture and stayed').toBe('piece.rook')
    expect(after.captured.white, 'and was NOT destroyed — the old card is what did that').toEqual([])
    expect(after.frozenUntil['d5']?.untilPly, 'frozen past the capturer’s own next turn').toBe(after.plyCount + 2)
    expect(after.frozenUntil['d1'], 'not at the square it left — that was the inert version').toBeUndefined()
  })

  it('actually stops the piece moving on the next turn', () => {
    // The freeze has to bite, not merely be recorded. A `frozenUntil` entry that
    // move generation never reads would satisfy the assertion above.
    const after = move(position(board, 'rule.blood-toll'), 'd1', 'd5')
    const black = move(after, 'f6', 'e6')
    const stuck = legalActions(black, content).filter((a) => a.kind === 'move' && a.from === 'd5')

    expect(stuck, 'the frozen rook owes nothing on white’s next turn').toEqual([])
  })

  it('does not leave a fully frozen side with no action at all', () => {
    /*
     * The deadlock this card created, and the cap raise exposed.
     *
     * `rule.blood-toll` freezes the capturer, so a side down to a couple of
     * pieces can end up with every one of them frozen. Before v12 the generator
     * returned an EMPTY action list there: `chooseAction` handed back null,
     * `playOut` reported the match unfinished, and a human would have been
     * looking at a board that accepts no input. Three of a thousand self-play
     * seeds hit it once `PLY_CAP` stopped killing those matches at ply 60.
     *
     * ADR-003 offered the forced pass only while a card was pending; it now also
     * covers "no move and no playable card", which is not a way to skip a turn
     * because there is nothing to skip.
     */
    const stuck = createPosition({
      content,
      presetId: 'preset.covenant',
      seed: 1,
      sideToMove: 'white',
      placements: [at('a1', 'piece.king'), at('f6', 'piece.king', 'black')],
      ruleCardId: 'rule.blood-toll',
      held: { white: [] },
      captured: { white: [] },
      plyCount: 4,
    })
    // Freeze white's only piece by hand: the position this reproduces is a long
    // game's tail, and building it by playing to it would pin the seed rather
    // than the rule.
    const frozen: GameState = {
      ...stuck,
      frozenUntil: { a1: { untilPly: 99, sourceId: 'rule.blood-toll', layer: 'rule' } },
    }

    const actions = legalActions(frozen, content)
    expect(actions, 'the forced pass, and nothing else').toEqual([{ kind: 'end_turn' }])
    const after = apply(frozen, { kind: 'end_turn' }, content)
    expect(after.plyCount, 'and it actually advances the ply rather than being refused').toBe(frozen.plyCount + 1)
  })

  it('does none of that without the card', () => {
    // The control. Same position, same capture, no rule card.
    const after = move(position(board, null), 'd1', 'd5')
    expect(after.board.get('d5')?.pieceId).toBe('piece.rook')
    expect(after.frozenUntil['d5'], 'nothing freezes a capture on its own').toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// AC-008 — the match ends when a side runs out of pawns
// ---------------------------------------------------------------------------

describe('AC-008: democracy ends the match on the last pawn', () => {
  const WIN = { kind: 'win', winner: 'white', reason: 'win_action' }

  it('ends it when white takes black’s last pawn', () => {
    const after = move(
      position(
        [at('a1', 'piece.king'), at('b2', 'piece.pawn'), at('c3', 'piece.pawn', 'black'), at('f6', 'piece.king', 'black')],
        'rule.democracy',
      ),
      'b2',
      'c3',
    )
    expect(after.result).toEqual(WIN)
  })

  it('does NOT end it while a second pawn stands', () => {
    // The boundary. Without this arm a clause that fires unconditionally passes.
    const after = move(
      position(
        [
          at('a1', 'piece.king'),
          at('b2', 'piece.pawn'),
          at('c3', 'piece.pawn', 'black'),
          at('e5', 'piece.pawn', 'black'),
          at('f6', 'piece.king', 'black'),
        ],
        'rule.democracy',
      ),
      'b2',
      'c3',
    )
    expect(after.result, 'one pawn left is not none').toBeNull()
  })

  it('fires when the last pawn dies to something other than a pawn trade', () => {
    // A second route into the same clause, so the win is not an artifact of the
    // capture being pawn-takes-pawn.
    //
    // NOT a symmetry test: the card has ONE clause, read from the mover's side,
    // so the mirror case (a side losing its OWN last pawn) is decided one ply
    // later when the opponent's ply evaluates the same clause. That delay is
    // recorded on the record itself.
    const after = move(
      position(
        [at('a1', 'piece.king'), at('b2', 'piece.pawn'), at('c3', 'piece.knight', 'black'), at('f6', 'piece.king', 'black')],
        'rule.democracy',
      ),
      'b2',
      'c3',
    )
    expect(after.result, 'black held no pawns once its knight fell').toEqual(WIN)
  })

  it('leaves king capture alone as a way to end the match', () => {
    // ADR: this is an ADDITIONAL loss condition, not a replacement.
    const after = move(
      position(
        [at('a1', 'piece.king'), at('d1', 'piece.rook'), at('c3', 'piece.pawn', 'black'), at('d5', 'piece.king', 'black')],
        'rule.democracy',
      ),
      'd1',
      'd5',
    )
    expect(after.result).toEqual({ kind: 'win', winner: 'white', reason: 'king_capture' })
  })
})
