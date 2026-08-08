import { describe, expect, it } from 'vitest'
import { BUNDLED_PRESET_ID } from '@content/sets/bundled'
import { PRODUCTION_NODE_BUDGET, positionKey, search, wouldRevealDraft } from '@engine/ai/search'
import { SECOND_DRAFT_AFTER_TURNS, apply, legalActions } from '@engine/engine'
import { createPosition } from '@engine/match'
import type { GameState } from '@engine/types'
import { shippedContent } from '../helpers/shipped'

/**
 * The search under the two-action turn (ADR-001).
 *
 * Three things break silently when a ply stops being one action, and none of
 * them shows up as a crash: the negamax sign, the transposition key, and the
 * draft boundary. Each is pinned here by the observable it corrupts.
 */

const content = shippedContent()
const BUDGET = { nodeBudget: PRODUCTION_NODE_BUDGET }

function position(opts: {
  sideToMove?: 'white' | 'black'
  held?: Partial<Record<'white' | 'black', string[]>>
  placements: ReadonlyArray<{ square: string; pieceId: string; side: 'white' | 'black' }>
}): GameState {
  return createPosition({
    content,
    presetId: BUNDLED_PRESET_ID,
    seed: 9,
    sideToMove: opts.sideToMove ?? 'white',
    placements: opts.placements,
    ...(opts.held ? { held: opts.held } : {}),
  })
}

describe('the negamax sign follows the side to move, not the action count', () => {
  it('credits the mover with choosing their own follow-up move', () => {
    /*
     * A card play does not hand the board over, so its child is the SAME
     * player's node and must be MAXIMISED for them. Negate it — as every other
     * child is negated — and the search reads the card's follow-up as the
     * OPPONENT's choice, so it assumes the worst move white has and prices the
     * card accordingly.
     *
     * The fixture has to make that difference visible, which a winning card
     * cannot: `evaluate` is antisymmetric, so for a TERMINAL child the buggy
     * negate-and-flip and the correct same-side call produce the identical
     * number, and a test built on a mate would pass against the bug it names.
     *
     * So: the card wins nothing by itself. It grants the rook a knight's leap,
     * and the only thing that leap is good for is taking the undefended queen on
     * d5 — a capture no white piece can otherwise reach. White choosing the
     * follow-up wins a queen; the opponent choosing it wins nothing at all.
     */
    const state = position({
      held: { white: ['skill.knight-leap'] },
      placements: [
        { square: 'a1', pieceId: 'piece.king', side: 'white' },
        { square: 'c3', pieceId: 'piece.rook', side: 'white' },
        { square: 'd5', pieceId: 'piece.queen', side: 'black' },
        { square: 'f6', pieceId: 'piece.king', side: 'black' },
      ],
    })
    const leap = legalActions(state, content).find(
      (a) => a.kind === 'play_card' && a.cardId === 'skill.knight-leap' && a.targets[0] === 'c3',
    )
    expect(leap, 'the leap should be playable on the rook').toBeDefined()

    // The fixture verifies its own premise: nothing reaches the queen now, and
    // exactly one thing reaches her after the card.
    expect(legalActions(state, content).some((a) => a.kind === 'move' && a.to === 'd5')).toBe(false)
    const mid = apply(state, leap!, content)
    expect(mid.result, 'the card must not end the match — a mate hides the sign bug').toBeNull()
    expect(mid.sideToMove, 'the card must not hand the board over').toBe('white')
    expect(legalActions(mid, content).some((a) => a.kind === 'move' && a.from === 'c3' && a.to === 'd5')).toBe(true)

    const { best } = search(state, content, BUDGET)
    expect(best, 'the card that wins a queen must be the search’s choice').toEqual(leap)
  })

  /*
   * KNOWN COVERAGE GAP — the same sign rule inside `negamax` is not pinned.
   *
   * `search` scores its root children itself, so the test above passes with the
   * root fixed and the recursion still negating. A fixture was written to reach
   * a card node one level down (black threatening a queen with a granted leap)
   * and it passed with the bug REINTRODUCED — the search never reached the card
   * node inside its budget, so it discriminated nothing. It was deleted rather
   * than kept: a test that cannot fail is worse than a named gap, because it
   * reads as coverage.
   *
   * The inner branch is the identical one-line rule as the root, verified there.
   * Recorded in the PLAN for review.
   */
})

describe('the transposition key separates a pending turn from a fresh one', () => {
  it('gives two states that differ only in the pending card different keys', () => {
    const base = position({
      held: { white: ['skill.bulwark'] },
      placements: [
        { square: 'a1', pieceId: 'piece.king', side: 'white' },
        { square: 'c3', pieceId: 'piece.rook', side: 'white' },
        { square: 'f6', pieceId: 'piece.king', side: 'black' },
      ],
    })
    /*
     * Constructed, not played out. Applying a real card play would ALSO append
     * to `drafts.used`, which the key has folded since before this phase — so
     * the two keys would differ whether or not `turnCard` is folded at all, and
     * the test would report GREEN against an unimplemented fold.
     *
     * These two states differ in exactly one field. Every other fold input —
     * board, side, ply, held, used, offers, completedTurns, draftIndex,
     * checkCount, captured, frozenUntil, grants — is the same object.
     */
    const fresh: GameState = { ...base, turnCard: null }
    const pending: GameState = { ...base, turnCard: 'skill.bulwark' }

    // What differs is that `fresh` may still play a card and `pending` may not.
    // Two different legal-action sets behind one key is a table that answers the
    // wrong question, and which entries collide depends on traversal order — so
    // the damage is nondeterministic, which is the worst kind to debug.
    expect(legalActions(fresh, content).some((a) => a.kind === 'play_card')).toBe(true)
    expect(legalActions(pending, content).some((a) => a.kind === 'play_card')).toBe(false)
    expect(positionKey(pending)).not.toBe(positionKey(fresh))
  })
})

describe('the draft boundary follows the turn, not the action', () => {
  /** A state one completed turn short of the second draft, with a card in hand. */
  function atTheBoundary(): GameState {
    const state = position({
      held: { white: ['skill.bulwark'], black: [] },
      placements: [
        { square: 'a1', pieceId: 'piece.king', side: 'white' },
        { square: 'c3', pieceId: 'piece.rook', side: 'white' },
        { square: 'f6', pieceId: 'piece.king', side: 'black' },
      ],
    })
    return {
      ...state,
      drafts: {
        ...state.drafts,
        white: { ...state.drafts.white, completedTurns: SECOND_DRAFT_AFTER_TURNS - 1, draftIndex: 1, offers: null },
      },
    }
  }

  it('does not treat a card play as revealing — it completes no turn', () => {
    const state = atTheBoundary()
    const play = legalActions(state, content).find((a) => a.kind === 'play_card')!
    // `wouldRevealDraft` is documented as mirroring `bumpTurns` exactly, and
    // `bumpTurns` no longer runs on a card. Left as it was, the search would
    // truncate the subtree of the very card it just played and score it
    // statically — blind to the move that card was bought for.
    expect(wouldRevealDraft(state, play, content)).toBe(false)
  })

  it('does treat the move that closes the turn as revealing', () => {
    const state = atTheBoundary()
    const move = legalActions(state, content).find((a) => a.kind === 'move')!
    expect(wouldRevealDraft(state, move, content)).toBe(true)
  })

  it('does treat the forced pass as revealing — it closes a turn like any move', () => {
    /*
     * The other half of the pin, and the one a `move` cannot stand in for.
     * `end_turn` closes a turn, so it draws the second offer exactly as a move
     * does; classified as non-revealing, the search would expand a child holding
     * cards nobody has seen, which is the ADR-008 leak this predicate exists to
     * stop.
     *
     * Reached, not asserted into existence: white is frozen down to one king by
     * black's own card, plays a card that moves nothing, and `end_turn` is what
     * `legalActions` then offers.
     */
    const start = position({
      sideToMove: 'black',
      held: { white: ['skill.bulwark'], black: ['skill.freeze'] },
      placements: [
        { square: 'a1', pieceId: 'piece.king', side: 'white' },
        { square: 'f6', pieceId: 'piece.king', side: 'black' },
        { square: 'e6', pieceId: 'piece.rook', side: 'black' },
      ],
    })
    const freeze = legalActions(start, content).find(
      (a) => a.kind === 'play_card' && a.cardId === 'skill.freeze' && a.targets[0] === 'a1',
    )!
    const frozen = apply(start, freeze, content)
    const blackClose = legalActions(frozen, content).find((a) => a.kind === 'move' && a.from === 'e6')!
    const blackMoved = apply(frozen, blackClose, content)

    // Put white one completed turn short of its second draft, then let it spend
    // the card it cannot follow with a move.
    const boundary: GameState = {
      ...blackMoved,
      drafts: {
        ...blackMoved.drafts,
        white: {
          ...blackMoved.drafts.white,
          completedTurns: SECOND_DRAFT_AFTER_TURNS - 1,
          draftIndex: 1,
          offers: null,
        },
      },
    }
    const card = legalActions(boundary, content).find((a) => a.kind === 'play_card')!
    const pending = apply(boundary, card, content)
    const pass = legalActions(pending, content).find((a) => a.kind === 'end_turn')
    expect(pass, 'a frozen mover with a spent card should be offered the pass').toBeDefined()

    expect(wouldRevealDraft(pending, pass!, content)).toBe(true)
  })
})
