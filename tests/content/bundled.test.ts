import { describe, expect, it } from 'vitest'
import { loadContentSet } from '@content/load'
import { BUNDLED_PRESET_ID, bundledContentSource, loadBundledContent } from '@content/sets/bundled'
import { createMatch, currentState } from '@engine/match'
import { makeTranslate, missingKeys, textKeysOf } from '@ui/i18n'
import { withinEnvelope } from '@engine/ai/complexity'

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
    // Bumped to 10 when `grading` was removed again, and deliberately still a LITERAL
    // rather than `SCHEMA_VERSION`: comparing the constant to itself would pass
    // for any future bump that forgot to move the shipped document with it,
    // which is the exact drift this line exists to catch.
    expect(result.set.schemaVersion).toBe(17)
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

  it('offers every bundled card through SOME preset', () => {
    // A card that validates but is in no preset is not shipped — it is dead
    // content that a record count would still happily include.
    //
    // Set-wide rather than per-preset since the expansion: with four rooms, a
    // room that had to list every card would have no character, and the point of
    // a room IS which cards it draws from. What must not exist is a card no room
    // offers at all.
    const set = loadBundledContent()
    const presets = [...set.presets.values()]
    expect(presets.length).toBeGreaterThan(0)
    expect(new Set(presets.flatMap((p) => p.ruleCardIds))).toEqual(new Set(set.ruleCards.keys()))
    expect(new Set(presets.flatMap((p) => p.skillCardIds))).toEqual(new Set(set.skillCards.keys()))
  })

  it('paints every bundled square type onto SOME board', () => {
    const set = loadBundledContent()
    const painted = new Set([...set.boards.values()].flatMap((b) => b.squares.map((s) => s.typeId)))
    expect(painted).toEqual(new Set(set.squareTypes.keys()))
  })

  it('gives every preset a board the AI can search and a skill pool both drafts can open', () => {
    // AC-004. G-8 of the vocabulary gaps: fewer than six skill cards and the
    // sixth-turn draft can never open, which is a deadlock rather than a
    // shortage.
    //
    // The board size used to be pinned at 6x6 here, and the comment said why:
    // "the AI's cost at other sizes is unmeasured, so no room may quietly
    // introduce one". That was a PROXY for the real requirement, and v12's 8x8
    // room replaces it with the requirement itself — `withinEnvelope` is the
    // measurement the proxy was standing in for (AC-011's complexity budget,
    // SPEC AC-009). A room of any size may ship; a room the AI cannot search
    // may not. Note which way this moved: the guard got STRICTER on the thing
    // it cared about, not looser.
    const set = loadBundledContent()
    for (const preset of set.presets.values()) {
      const board = set.boards.get(preset.boardId)
      expect(board, `${preset.id} points at a board that does not exist`).toBeDefined()
      const verdict = withinEnvelope(set, preset.id)
      expect(verdict.ok, `${preset.id} is outside the AI's complexity envelope (${verdict.reason}): ${JSON.stringify(verdict.score)}`).toBe(true)
      expect(preset.skillCardIds.length, `${preset.id} cannot open both drafts`).toBeGreaterThanOrEqual(6)
    }
  })

  it('gives every room a skill pool of its own', () => {
    // AC-005. Four rooms that draw the same cards are one room with four names.
    const set = loadBundledContent()
    const lists = [...set.presets.values()].map((p) => [...p.skillCardIds].sort().join(','))
    expect(new Set(lists).size, 'two presets ship the same skill list').toBe(lists.length)
  })

  it('paints only ranks that are empty at setup', () => {
    // ADR-003. The property the shipped board already had and nothing enforced:
    // a painted square under a starting piece is neither reachable nor visible,
    // so it reads to a player as art that does nothing.
    const set = loadBundledContent()
    for (const board of set.boards.values()) {
      const occupied = new Set(board.placements.map((p) => p.square))
      for (const painted of board.squares) {
        expect(occupied.has(painted.square), `${board.id} paints ${painted.square}, which starts occupied`).toBe(false)
      }
    }
  })

  it('counts the records this expansion committed to', () => {
    // AC-006, as a census rather than a floor: a count that only grows would
    // pass on a half-finished set.
    const set = loadBundledContent()
    expect({
      pieces: set.pieces.size,
      squareTypes: set.squareTypes.size,
      ruleCards: set.ruleCards.size,
      skillCards: set.skillCards.size,
      presets: set.presets.size,
    }).toEqual({ pieces: 17, squareTypes: 17, ruleCards: 24, skillCards: 36, presets: 7 })
  })

  it('starts a match from the bundled preset', () => {
    const set = loadBundledContent()
    const state = currentState(createMatch({ content: set, presetId: BUNDLED_PRESET_ID, seed: 1 }))
    expect(state.board.size).toBeGreaterThan(0)
    expect(state.ruleCardId).not.toBeNull()
    expect(state.drafts.white.offers).toHaveLength(3)
  })

  it('gives every selectable preset the recurring-award pool floor', () => {
    // Five-turn awards need a useful stream after the opening offers. Nineteen
    // distinct cards leaves room for the first two offers plus three later
    // awards without repeating a passed or already-held card.
    const set = loadBundledContent()
    for (const preset of set.presets.values()) {
      expect(new Set(preset.skillCardIds).size, `${preset.id} has too few distinct skills`).toBeGreaterThanOrEqual(19)
    }
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
