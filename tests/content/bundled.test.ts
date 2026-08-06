import { describe, expect, it } from 'vitest'
import { loadContentSet } from '@content/load'
import { BUNDLED_PRESET_ID, bundledContentSource, loadBundledContent } from '@content/sets/bundled'
import { createMatch, currentState } from '@engine/match'
import { makeTranslate, missingKeys, textKeysOf } from '@ui/i18n'

/** Bundle-only resolution — these assertions are about the SHIPPED text. */
const translate = (key: string, _locale?: 'ko') => makeTranslate()(key)

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
    // v4 added pieceDef.iconKey (ADR-017); v5 carried the same field to square
    // types, rule cards and skill cards, which is what lets the board and the
    // card faces say WHAT happens rather than only that something does; v6
    // added the document-level `strings` overlay (ADR-020).
    //
    // The shipped document declares the CURRENT version even though it carries
    // no overlay of its own — `strings` is optional, so an older declaration
    // would still load, but the export a child hands a friend is this document
    // plus their edits, and a v6 field inside a document that says v5 is the
    // lie `io.ts`'s version gate exists to catch.
    //
    // Bumped to 7 with the `artKey` axis, and deliberately still a LITERAL
    // rather than `SCHEMA_VERSION`: comparing the constant to itself would pass
    // for any future bump that forgot to move the shipped document with it,
    // which is the exact drift this line exists to catch.
    expect(result.set.schemaVersion).toBe(7)
    // Absent, not empty-but-declared: the shipped set names everything through
    // the built-in bundle, which is what ADR-020's absent case must keep working.
    expect(result.set.strings).toEqual({})
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
