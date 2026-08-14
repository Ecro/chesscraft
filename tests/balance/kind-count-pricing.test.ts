import { describe, expect, it } from 'vitest'
import { explainSkillCardCost, replayExplanation, skillCardCost } from '@balance/cost'
import type { SkillCardDef } from '@content/schema'

/**
 * PLAN Phase 4, exit criterion arm 2 — the new condition is actually PRICED.
 *
 * `conditionBreadth` is the only consumer of the condition axis in `cost.ts`, and
 * it is reachable from the skill-card path alone: `cost.ts` exports no rule-card
 * pricing entry point. The editor coverage suite authors the condition on a RULE
 * card, so it drives the schema and the controls but never touches this. Without
 * this file the new `cost.ts` case would be a branch nothing evaluates — the
 * declared-but-inert shape one level down.
 *
 * (`effectCost` at `cost.ts:208` is card-kind-agnostic and would reach
 * `conditionBreadth` for any effect; `explainSkillCardCost` is simply the shipped
 * path that gets there, so it is the one used.)
 */

function cardWith(condition: SkillCardDef['effects'][number]['condition']): SkillCardDef {
  return {
    id: 'skill.price-probe',
    nameKey: 'skill.price-probe.name',
    textKey: 'skill.price-probe.text',
    uses: 1,
    royalFollowUp: 'preserve',
    protectRelocatedAfterPlay: false,
    lockRelocatedAfterPlay: false,
    effects: [
      {
        trigger: 'on_play',
        condition,
        actions: [{ kind: 'destroy_piece', target: { kind: 'chosen_enemy' } }],
      },
    ],
  } as SkillCardDef
}

describe('piece_kind_count_at_most is priced', () => {
  it('prices without throwing, and its explanation replays to the same number', () => {
    const card = cardWith({ kind: 'piece_kind_count_at_most', side: 'opponent', pieceId: 'piece.pawn', n: 0 })
    const explanation = explainSkillCardCost(card)

    expect(skillCardCost(card), 'a priced card has a price').toBeGreaterThan(0)
    expect(
      replayExplanation(explanation),
      'and the explanation the badge shows arrives at that same number',
    ).toBe(skillCardCost(card))
  })

  it('prices NARROWER than the whole-army count it sits beside', () => {
    // The discriminator for the `cost.ts` case actually being its own. Dropping
    // the new label into the `piece_count_at_most` arm — the obvious edit —
    // would make these equal, and a "does not throw" assertion alone would not
    // notice.
    const kindCount = skillCardCost(
      cardWith({ kind: 'piece_kind_count_at_most', side: 'opponent', pieceId: 'piece.pawn', n: 0 }),
    )
    const armyCount = skillCardCost(cardWith({ kind: 'piece_count_at_most', side: 'opponent', n: 1 }))

    expect(kindCount, 'a condition that also filters by kind fires less often, so it costs less').toBeLessThan(
      armyCount,
    )
  })
})
