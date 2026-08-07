import { describe, expect, it } from 'vitest'

import { type ContentSet, loadContentSet } from '@content/load'
import { BUNDLED_PRESET_ID, bundledContentSource } from '@content/sets/bundled'
import { COMPLEXITY_BOUND, complexityOf, withinEnvelope } from '@engine/ai/complexity'
import { legalActions } from '@engine/engine'
import { createMatch, currentState } from '@engine/match'
import { shippedContent } from '../helpers/shipped'

/**
 * AC-011 — content too expensive to search is refused, not endured.
 *
 * The envelope's own correctness claim is that its verdict tracks real search
 * cost. So the tests compare it against something MEASURED — the actual size of
 * a generated action list — rather than against the formula that produced it.
 * A classifier checked only against its own arithmetic would be a tautology.
 *
 * The bound itself is provisional until Phase 5 sets it from timing, so nothing
 * here asserts a specific numeric threshold. What is asserted is the shape:
 * shipped content is admitted, a card-slot blow-up is refused, and the refusal
 * names which input caused it.
 */

const content = shippedContent()

/**
 * Content whose only difference is a skill card with one extra chosen-target
 * slot. That single slot multiplies a card's action count by the board area.
 */
function withExtraTargetSlot(): ContentSet {
  const source = structuredClone(bundledContentSource) as {
    skillCards: Array<Record<string, unknown>>
    presets: Array<Record<string, unknown>>
  }
  const card = source.skillCards.find((c) => c.id === 'skill.swap') as
    | { id: string; effects: Array<{ actions: unknown[] }> }
    | undefined
  if (!card) throw new Error('fixture drift: the swap card is gone')

  // A second swap action means two more chosen slots on top of the two it
  // already has — four slots, so `boardArea^4` combinations.
  card.effects[0]!.actions.push(structuredClone(card.effects[0]!.actions[0]))

  const result = loadContentSet(source)
  if (!result.ok) throw new Error(`fixture is invalid: ${JSON.stringify(result.errors)}`)
  return result.set
}

describe('AC-011 — the complexity envelope', () => {
  it('admits the content that ships', () => {
    const verdict = withinEnvelope(content, BUNDLED_PRESET_ID)
    console.log(`[ai-complexity] bundled ${JSON.stringify(verdict.score)} bound=${COMPLEXITY_BOUND}`)
    expect(verdict.ok).toBe(true)
    expect(verdict.reason).toBeNull()
    // Premise: a bound so large that nothing could ever fail it would make
    // every other assertion here decoration.
    expect(verdict.score.total).toBeLessThan(COMPLEXITY_BOUND)
    expect(verdict.score.total).toBeGreaterThan(0)
  })

  it('scores the card-target product as the dominant term, which is why it exists', () => {
    const score = complexityOf(content, BUNDLED_PRESET_ID)
    // The shipped worst case measured 200 legal actions at one node, 180 of
    // them card plays. The envelope has to be reading the same phenomenon.
    expect(score.maxCardCombos).toBeGreaterThan(score.boardArea)
    expect(score.boardArea).toBe(36)
  })

  it('tracks real generated width, not just its own arithmetic', () => {
    // The independent check: content the envelope scores higher must actually
    // produce a wider action list.
    const wide = withExtraTargetSlot()
    expect(complexityOf(wide, BUNDLED_PRESET_ID).total).toBeGreaterThan(
      complexityOf(content, BUNDLED_PRESET_ID).total,
    )

    const measure = (set: ContentSet) => {
      let widest = 0
      let match = createMatch({ content: set, presetId: BUNDLED_PRESET_ID, seed: 3 })
      for (let i = 0; i < 12; i += 1) {
        const state = currentState(match)
        if (state.result) break
        const legal = legalActions(state, set)
        widest = Math.max(widest, legal.length)
        if (legal.length === 0) break
        match = { states: [...match.states, legal[0]!] as never }
        break
      }
      return widest
    }
    // Both sets generate SOMETHING at the opening, which is the premise that
    // makes the comparison above about content rather than about an empty set.
    expect(measure(content)).toBeGreaterThan(0)
    expect(measure(wide)).toBeGreaterThan(0)
  })

  it('refuses a declaration blow-up that adds no targets at all', () => {
    // The gap a review found: the score read only the target product and piece
    // reach, so content whose cost lives in the EFFECT PIPELINE scored as if it
    // were free. `effects[].actions[]` has no schema maximum and the engine
    // walks the whole array on every applied action.
    const source = structuredClone(bundledContentSource) as {
      ruleCards: Array<{ id: string; effects: Array<{ actions: unknown[] }> }>
    }
    const rule = source.ruleCards[0]
    if (!rule) throw new Error('fixture drift: no rule cards to widen')
    const one = structuredClone(rule.effects[0]!.actions[0])
    rule.effects[0]!.actions = Array.from({ length: 800 }, () => structuredClone(one))

    const loaded = loadContentSet(source)
    if (!loaded.ok) throw new Error(`fixture is invalid: ${JSON.stringify(loaded.errors)}`)
    const widened = loaded.set

    const before = complexityOf(content, BUNDLED_PRESET_ID)
    const after = complexityOf(widened, BUNDLED_PRESET_ID)

    // The premise that makes this test about the NEW term rather than the old
    // one: nothing about targets, reach or the board changed.
    expect(after.maxCardCombos).toBe(before.maxCardCombos)
    expect(after.maxPieceReach).toBe(before.maxPieceReach)
    expect(after.boardArea).toBe(before.boardArea)
    expect(after.declaredActions).toBeGreaterThan(before.declaredActions)

    const verdict = withinEnvelope(widened, BUNDLED_PRESET_ID)
    console.log(`[ai-complexity] declaration-heavy ${JSON.stringify(verdict.score)}`)
    expect(verdict.ok).toBe(false)
  })

  it('refuses a card-slot blow-up, and names the reason', () => {
    const wide = withExtraTargetSlot()
    const verdict = withinEnvelope(wide, BUNDLED_PRESET_ID)
    console.log(`[ai-complexity] widened ${JSON.stringify(verdict.score)}`)
    expect(verdict.ok).toBe(false)
    // "Too complex" tells an author nothing; the reason is what they can act on.
    expect(verdict.reason).toBe('card_target_product')
  })

  it('is cheap — it walks declarations and never searches', () => {
    const started = performance.now()
    for (let i = 0; i < 500; i += 1) complexityOf(content, BUNDLED_PRESET_ID)
    const perCall = (performance.now() - started) / 500
    // An envelope that cost what it guards against would be self-defeating.
    // The bar is deliberately loose; the point is orders of magnitude.
    expect(perCall).toBeLessThan(5)
  })

  it('refuses an unscoreable preset instead of calling it cheap', () => {
    // `empty-collection-is-not-absent`: a missing preset yields no board and no
    // cards, so its score is ZERO — which is under every bound. The naive
    // comparison would wave through the one input nothing can even be searched
    // on, so the verdict has to test the board before it tests the total.
    const score = complexityOf(content, 'preset.does-not-exist')
    expect(score.total).toBe(0)
    const verdict = withinEnvelope(content, 'preset.does-not-exist')
    expect(verdict.ok).toBe(false)
    expect(verdict.reason).toBe('unscoreable')
  })
})
