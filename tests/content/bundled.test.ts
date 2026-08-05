import { describe, expect, it } from 'vitest'
import { loadContentSet } from '@content/load'
import { BUNDLED_PRESET_ID, bundledContentSource, loadBundledContent } from '@content/sets/bundled'
import { createMatch, currentState } from '@engine/match'
import { missingKeys, textKeysOf, translate } from '@ui/i18n'

/**
 * PLAN Phase 6b exit criterion — AC-010 and AC-016 over the shipped set.
 *
 * These are counting-and-coverage tests on purpose. Whether each card *plays*
 * correctly is Phase 6a's gate for the risky ones and the engine suite for the
 * vocabulary they are built from; what this file pins is that the bundle a
 * player actually receives is complete, valid, and fully translated.
 */

describe('AC-010 — the bundled content set', () => {
  it('loads with zero validation errors', () => {
    const result = loadContentSet(bundledContentSource)
    if (!result.ok) {
      throw new Error(`bundled content is invalid:\n${JSON.stringify(result.errors, null, 2)}`)
    }
    expect(result.set.schemaVersion).toBe(3)
  })

  it('ships at least 10 rule cards, 14 skill cards and 4 square types', () => {
    const set = loadBundledContent()
    expect(set.ruleCards.size).toBeGreaterThanOrEqual(10)
    expect(set.skillCards.size).toBeGreaterThanOrEqual(14)
    expect(set.squareTypes.size).toBeGreaterThanOrEqual(4)
  })

  it('offers every bundled card through the default preset', () => {
    // A card that validates but is in no preset is not shipped — it is dead
    // content that AC-010's count would still happily include.
    const set = loadBundledContent()
    const preset = set.presets.get(BUNDLED_PRESET_ID)
    expect(preset).toBeDefined()
    expect(new Set(preset!.ruleCardIds)).toEqual(new Set(set.ruleCards.keys()))
    expect(new Set(preset!.skillCardIds)).toEqual(new Set(set.skillCards.keys()))
  })

  it('paints every bundled square type onto the default board', () => {
    const set = loadBundledContent()
    const board = set.boards.get(set.presets.get(BUNDLED_PRESET_ID)!.boardId)!
    const painted = new Set(board.squares.map((s) => s.typeId))
    expect(painted).toEqual(new Set(set.squareTypes.keys()))
  })

  it('starts a match from the bundled preset', () => {
    const set = loadBundledContent()
    const state = currentState(createMatch({ content: set, presetId: BUNDLED_PRESET_ID, seed: 1 }))
    expect(state.board.size).toBeGreaterThan(0)
    expect(state.ruleCardId).not.toBeNull()
    expect(state.drafts.white.offers).toHaveLength(3)
  })

  it('holds a skill pool large enough for both draft rounds', () => {
    // Phase 3's G-8: fewer than six and the sixth-turn draft can never open.
    const preset = loadBundledContent().presets.get(BUNDLED_PRESET_ID)!
    expect(preset.skillCardIds.length).toBeGreaterThanOrEqual(6)
  })
})

describe('AC-016 — player-facing text', () => {
  it('declares every text field as an i18n key, never a literal', () => {
    // The schema's key regex already refuses literals, so this asserts the
    // stronger thing: no field slipped through as a key-shaped English phrase.
    const keys = textKeysOf(loadBundledContent())
    expect(keys.length).toBeGreaterThan(0)
    for (const key of keys) {
      expect(key, `${key} is not a dotted lowercase key`).toMatch(/^[a-z][a-z0-9]*(?:\.[a-z0-9-]+)+$/)
      expect(key).not.toContain(' ')
    }
  })

  it('resolves every declared key in the ko bundle', () => {
    expect(missingKeys(loadBundledContent(), 'ko')).toEqual([])
  })

  it('gives every card a name and an ability line that are actually different', () => {
    // A bundle can resolve every key and still ship the name pasted into the
    // description, which reads as translated and teaches the player nothing.
    const set = loadBundledContent()
    for (const card of [...set.ruleCards.values(), ...set.skillCards.values(), ...set.squareTypes.values()]) {
      const name = translate(card.nameKey, 'ko')
      const text = translate(card.textKey, 'ko')
      expect(name, `${card.id} name is untranslated`).not.toBe(card.nameKey)
      expect(text, `${card.id} text is untranslated`).not.toBe(card.textKey)
      expect(text, `${card.id} text is just its name`).not.toBe(name)
      expect(text.length, `${card.id} text is too short to explain anything`).toBeGreaterThan(name.length)
    }
  })

  it('translates every piece as well', () => {
    const set = loadBundledContent()
    for (const piece of set.pieces.values()) {
      expect(translate(piece.nameKey, 'ko')).not.toBe(piece.nameKey)
      expect(translate(piece.textKey, 'ko')).not.toBe(piece.textKey)
    }
  })
})
