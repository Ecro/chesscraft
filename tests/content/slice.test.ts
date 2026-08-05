import { describe, expect, it } from 'vitest'
import { loadContentSet } from '@content/load'
import { SLICE_PRESET_ID, loadSliceContent, sliceContentSource } from '@content/sets/slice'

/**
 * PLAN Phase 3 — the vertical slice's shipped content.
 *
 * This is not a fixture: it is the first real content set, and the phase exists
 * to prove the Phase 1 vocabulary can express a playable variant without a code
 * escape hatch (ADR-001). If the slice needed something the schema cannot say,
 * that shows up here as a load error, not as a workaround in the engine.
 */
describe('slice content set', () => {
  it('loads through the production validator with zero errors', () => {
    const result = loadContentSet(sliceContentSource)
    if (!result.ok) {
      throw new Error(`slice content is invalid:\n${JSON.stringify(result.errors, null, 2)}`)
    }
    expect(result.set.schemaVersion).toBe(1)
  })

  it('carries exactly the minimal set the phase scope names', () => {
    const set = loadSliceContent()
    // 2 pieces, 1 rule card, 1 square type — the PLAN's stated minimum. More
    // would stop being a slice.
    expect([...set.pieces.keys()].sort()).toEqual(['piece.archer', 'piece.king'])
    expect([...set.squareTypes.keys()]).toEqual(['square.beacon'])
    expect([...set.ruleCards.keys()]).toEqual(['rule.beacon-rush'])
  })

  it('carries the six skill cards both draft rounds require', () => {
    // Six, not three: AC-005 fixes an offer at three distinct cards and AC-006
    // requires the second offer disjoint from the first, so five or fewer means
    // the sixth-turn draft can never open (Phase 3 finding G-8).
    const set = loadSliceContent()
    expect([...set.skillCards.keys()].sort()).toEqual([
      'skill.ascend',
      'skill.hold',
      'skill.rally',
      'skill.snare',
      'skill.volley',
      'skill.warp',
    ])
  })

  it('spreads the four owner layers across the four content kinds', () => {
    const set = loadSliceContent()

    // Layer 1 — a square ability.
    expect(set.squareTypes.get('square.beacon')!.effects.length).toBeGreaterThan(0)
    // Layer 2 — a piece passive.
    expect(set.pieces.get('piece.archer')!.effects.length).toBeGreaterThan(0)
    // Layer 3 — the rule card.
    expect(set.ruleCards.get('rule.beacon-rush')!.effects.length).toBeGreaterThan(0)
    // Layer 4 — every skill card.
    for (const card of set.skillCards.values()) expect(card.effects.length).toBeGreaterThan(0)
  })

  it('gives the archer a movement/attack split so quiet moves and captures differ', () => {
    const archer = loadSliceContent().pieces.get('piece.archer')!
    expect(archer.attack).toBeDefined()
    expect(archer.attack).not.toEqual(archer.movement)
  })

  it('declares royalty on content rather than leaving the engine to name a piece', () => {
    const set = loadSliceContent()
    expect(set.pieces.get('piece.king')!.royal).toBe(true)
    expect(set.pieces.get('piece.archer')!.royal).toBeUndefined()
  })

  it('exposes a preset that references only slice content', () => {
    const set = loadSliceContent()
    const preset = set.presets.get(SLICE_PRESET_ID)
    expect(preset).toBeDefined()
    expect(preset!.skillCardIds).toHaveLength(6)
    for (const id of preset!.pieceIds) expect(set.pieces.has(id)).toBe(true)
    for (const id of preset!.ruleCardIds) expect(set.ruleCards.has(id)).toBe(true)
    for (const id of preset!.skillCardIds) expect(set.skillCards.has(id)).toBe(true)
  })
})
