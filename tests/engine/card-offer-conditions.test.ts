import { describe, expect, it } from 'vitest'
import { loadBundledContent } from '@content/sets/bundled'
import { legalActions } from '@engine/engine'
import { createPosition } from '@engine/match'
import type { Side, SquareId } from '@engine/types'

/**
 * A card is offered only where it would actually fire.
 *
 * The gap this closes: choice candidates were derived from the action's TARGET
 * KIND alone — every friendly piece for a `chosen_friendly` — while the effect's
 * `condition` was evaluated later, at execution, against whichever piece the
 * player had by then already picked. So a card gated on `piece_is: piece.pawn`
 * was offered for rooks and queens, and choosing one consumed the card and did
 * nothing. The player cannot tell that apart from a card that is simply bad.
 *
 * That is the same contract `cardResolves` already enforces one level up — "a
 * card that resolves to nothing must not be offered" — applied to the choice
 * rather than to the card.
 *
 * The subject the filter evaluates against is the one execution uses: for an
 * unquantified effect, the piece on the FIRST chosen square (`engine.ts`'s
 * `played`). A `forEach` effect binds its own subject, so the player's choice
 * does not decide whether its condition holds — those are deliberately left
 * alone, and the last test here pins that.
 */

const content = loadBundledContent()

type Place = { square: SquareId; pieceId: string; side: Side }

const K_W: Place = { square: 'a1', pieceId: 'piece.king', side: 'white' }
const K_B: Place = { square: 'f6', pieceId: 'piece.king', side: 'black' }
const at = (square: SquareId, pieceId: string, side: Side = 'white'): Place => ({ square, pieceId, side })

function offers(card: string, placements: Place[]): SquareId[] {
  const state = createPosition({
    content,
    presetId: 'preset.default',
    seed: 1,
    sideToMove: 'white',
    placements,
    ruleCardId: null,
    held: { white: [card] },
    captured: { white: [] },
  })
  return legalActions(state, content)
    .flatMap((a) => (a.kind === 'play_card' && a.cardId === card ? [a.targets[0] as SquareId] : []))
    .filter((sq): sq is SquareId => sq !== undefined)
    .sort()
}

describe('a condition on the effect narrows what the card may be aimed at', () => {
  const mixed: Place[] = [K_W, at('c2', 'piece.pawn'), at('e2', 'piece.pawn'), at('b1', 'piece.rook'), K_B]

  it('skill.brand is offered on footmen only', () => {
    expect(offers('skill.brand', mixed)).toEqual(['c2', 'e2'])
  })

  it('skill.coronation is offered on footmen only — the same gap, in a card that has shipped all along', () => {
    // The reason this fix is worth making in the engine rather than in the new
    // card: `skill.coronation` has carried the identical shape since the
    // original set, so a content-level workaround would have left it broken.
    const promotionMixed: Place[] = [K_W, at('c6', 'piece.pawn'), at('e6', 'piece.pawn'), at('b5', 'piece.rook'), { square: 'f1', pieceId: 'piece.king', side: 'black' }]
    expect(offers('skill.coronation', promotionMixed)).toEqual(['c6', 'e6'])
  })

  it('offers the card not at all when nothing satisfies its condition', () => {
    // Not "offered and inert" — absent. A card that cannot fire from this
    // position must not cost the player a turn to discover that.
    expect(offers('skill.brand', [K_W, at('b1', 'piece.rook'), K_B])).toEqual([])
  })
})

describe('what the filter must NOT narrow', () => {
  const mixed: Place[] = [K_W, at('c2', 'piece.pawn'), at('b1', 'piece.rook'), K_B]

  it('an unconditional card still reaches every ordinary friendly piece', () => {
    // `skill.veil` is `condition: always`. Over-filtering here would be the
    // mirror-image defect: a card the player can no longer aim where it works.
    expect(offers('skill.veil', mixed)).toEqual(['b1', 'c2'])
  })

  it('a card aimed at the enemy is unaffected by a friendly-side condition', () => {
    expect(offers('skill.leash', [K_W, at('c2', 'piece.pawn'), at('e5', 'piece.rook', 'black'), K_B])).toEqual(['e5'])
  })

  it('a QUANTIFIED card keeps every offer — its subject is bound, not chosen', () => {
    /*
     * `skill.charge` carries a `forEach`, so the condition is evaluated against
     * the piece the quantifier bound rather than against the player's pick.
     * Filtering on the pick would silently drop legal plays.
     *
     * Counted as PLAYS rather than by first target: a quantified card whose
     * actions aim at `self` has no choice slot at all, so its play carries an
     * empty target list. The first version of this test read `targets[0]` and
     * reported zero, which looks exactly like the regression it is meant to
     * catch — a probe has to know the shape of what it is counting.
     */
    const state = createPosition({
      content,
      presetId: 'preset.default',
      seed: 1,
      sideToMove: 'white',
      placements: mixed,
      ruleCardId: null,
      held: { white: ['skill.charge'] },
      captured: { white: [] },
    })
    const plays = legalActions(state, content).filter((a) => a.kind === 'play_card' && a.cardId === 'skill.charge')
    expect(plays.length).toBeGreaterThan(0)
  })
})
