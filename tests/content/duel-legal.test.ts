import { describe, expect, it } from 'vitest'
import { checkLoadoutGrades } from '@balance/legal'
import { type ContentSource, loadContentSet } from '@content/load'
import { SCHEMA_VERSION, type PresetDef } from '@content/schema'
import { BUNDLED_PRESET_ID, bundledContentSource } from '@content/sets/bundled'

/**
 * PLAN Phase 4 — the duel-legal profile.
 *
 * Seven refusals and two acceptances. The second acceptance is the one that is
 * easy to leave out and expensive to get wrong: a room with NO loadout and no
 * budget must still load, because that is every document written before this
 * feature and every room nobody has customised. A gate that only ever refuses is
 * indistinguishable from a gate that refuses everything.
 */

type Slot = { piece: { pieceId: string; replaces: string; square: string }; skillCardId: string }

/**
 * The loadout card is one the room does NOT deal, because a card in the shared
 * pool cannot also be a side's own — the loader refuses that overlap, since both
 * sides draw from `skillCardIds` and the card this side "brought" would be dealt
 * to the other one too.
 */
const OWN_CARD = 'skill.probe-own'
const GOOD: Slot = {
  piece: { pieceId: 'piece.archer', replaces: 'piece.knight', square: 'b1' },
  skillCardId: OWN_CARD,
}

function document(mutate: (preset: Record<string, unknown>, source: ContentSource) => void): ContentSource {
  const source = structuredClone(bundledContentSource) as ContentSource
  source.schemaVersion = SCHEMA_VERSION
  ;(source.skillCards as unknown[]).push({
    id: OWN_CARD,
    nameKey: 'skill.probe-own.name',
    textKey: 'skill.probe-own.text',
    uses: 1,
    royalFollowUp: 'preserve',
    protectRelocatedAfterPlay: false,
    lockRelocatedAfterPlay: false,
    effects: [
      { trigger: 'on_play', condition: { kind: 'always' }, actions: [{ kind: 'destroy_piece', target: { kind: 'chosen_enemy' } }] },
    ],
  })
  const preset = source.presets.find((p) => (p as { id: string }).id === BUNDLED_PRESET_ID) as Record<string, unknown>
  preset.loadoutBudget = 100
  preset.loadout = { white: structuredClone(GOOD) }
  mutate(preset, source)
  return source
}

function errorsFor(source: ContentSource): Array<{ path: string; message: string }> {
  const result = loadContentSet(source)
  return result.ok ? [] : result.errors
}

const AT = `presets.${BUNDLED_PRESET_ID}.loadout.white`

describe('PLAN Phase 4 — structural refusals, each with a located error', () => {
  it('refuses a loadout with no budget declared (ADR-010 absent case)', () => {
    const errors = errorsFor(document((preset) => delete preset.loadoutBudget))
    const hit = errors.find((e) => e.path === `presets.${BUNDLED_PRESET_ID}.loadoutBudget`)
    expect(hit, JSON.stringify(errors.slice(0, 3), null, 2)).toBeDefined()
  })

  it('refuses a piece that wins the match outright', () => {
    const errors = errorsFor(
      document((preset, source) => {
        const piece = (source.pieces as Array<Record<string, unknown>>).find((p) => p.id === 'piece.archer')!
        piece.effects = [
          { trigger: 'end_of_ply', condition: { kind: 'always' }, actions: [{ kind: 'win', side: 'mover' }] },
        ]
        void preset
      }),
    )
    expect(errors.some((e) => e.path === `${AT}.piece.pieceId` && e.message.includes('wins the match'))).toBe(true)
  })

  it('refuses a skill card that wins the match outright', () => {
    const errors = errorsFor(
      document((_preset, source) => {
        const card = (source.skillCards as Array<Record<string, unknown>>).find((c) => c.id === OWN_CARD)!
        card.effects = [{ trigger: 'on_play', condition: { kind: 'always' }, actions: [{ kind: 'win', side: 'mover' }] }]
      }),
    )
    expect(errors.some((e) => e.path === `${AT}.skillCardId` && e.message.includes('wins the match'))).toBe(true)
  })

  it('refuses a royal piece in the slot', () => {
    const errors = errorsFor(document((preset) => ((preset.loadout as Record<string, Slot>).white!.piece.pieceId = 'piece.king')))
    expect(errors.some((e) => e.path === `${AT}.piece.pieceId` && e.message.includes('royal'))).toBe(true)
  })

  it('refuses replacing a royal piece — that would move the losing condition', () => {
    const errors = errorsFor(document((preset) => ((preset.loadout as Record<string, Slot>).white!.piece.replaces = 'piece.king')))
    expect(errors.some((e) => e.path === `${AT}.piece.replaces` && e.message.includes('cannot be replaced'))).toBe(true)
  })

  it("refuses replacing a piece that does not stand on that side's board", () => {
    const errors = errorsFor(
      document((preset, source) => {
        // Black's knights exist; white's are removed, so white has nothing to replace.
        const board = (source.boards as Array<Record<string, unknown>>)[0]!
        board.placements = (board.placements as Array<Record<string, unknown>>).filter(
          (p) => !(p.side === 'white' && p.pieceId === 'piece.knight'),
        )
        void preset
      }),
    )
    expect(errors.some((e) => e.path === `${AT}.piece.square` && e.message.includes('requested'))).toBe(true)
  })
})

describe('PLAN Phase 4 — the two documents that must load', () => {
  it('accepts a complete, legal loadout', () => {
    const result = loadContentSet(document(() => {}))
    expect(result.ok, result.ok ? '' : JSON.stringify(result.errors.slice(0, 5), null, 2)).toBe(true)
  })

  it('accepts a room with no loadout and no budget — the common case', () => {
    const source = structuredClone(bundledContentSource) as ContentSource
    const result = loadContentSet(source)
    expect(result.ok, result.ok ? '' : JSON.stringify(result.errors.slice(0, 5), null, 2)).toBe(true)
  })
})

describe('the price-dependent refusals', () => {
  const loaded = loadContentSet(document(() => {}))
  if (!loaded.ok) throw new Error(`the fixture must load: ${JSON.stringify(loaded.errors.slice(0, 3))}`)
  const preset = loaded.set.presets.get(BUNDLED_PRESET_ID)!

  it('refuses a piece standing in for one of a different grade', () => {
    const errors = checkLoadoutGrades({ ...preset, loadout: { white: { ...GOOD, piece: { pieceId: 'piece.queen', replaces: 'piece.pawn', square: 'a2' } } } }, loaded.set)
    expect(errors.some((e) => e.message.includes('cannot replace it'))).toBe(true)
  })

  it('accepts a piece of the same grade', () => {
    const errors = checkLoadoutGrades({ ...preset, loadout: { white: { ...GOOD, piece: { pieceId: 'piece.knight', replaces: 'piece.knight', square: 'b1' } } } }, loaded.set)
    expect(errors).toEqual([])
  })

  it("refuses a pair that costs more than the room allows", () => {
    const tight: PresetDef = { ...preset, loadoutBudget: 1, loadout: { white: { ...GOOD, piece: { pieceId: 'piece.knight', replaces: 'piece.knight', square: 'b1' } } } }
    expect(checkLoadoutGrades(tight, loaded.set).some((e) => e.message.includes("room's budget"))).toBe(true)
  })

  it('reports nothing for a room with no loadout', () => {
    expect(checkLoadoutGrades({ ...preset, loadout: undefined }, loaded.set)).toEqual([])
  })
})
