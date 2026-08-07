import { describe, expect, it } from 'vitest'
import { checkLoadoutGrades, gradesFrom } from '@balance/legal'
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

type Slot = { pieceId: string; replaces: string; skillCardId: string }

/**
 * The loadout card is one the room does NOT deal, because a card in the shared
 * pool cannot also be a side's own — the loader refuses that overlap, since both
 * sides draw from `skillCardIds` and the card this side "brought" would be dealt
 * to the other one too.
 */
const OWN_CARD = 'skill.probe-own'
const GOOD: Slot = { pieceId: 'piece.archer', replaces: 'piece.knight', skillCardId: OWN_CARD }

function document(mutate: (preset: Record<string, unknown>, source: ContentSource) => void): ContentSource {
  const source = structuredClone(bundledContentSource) as ContentSource
  source.schemaVersion = SCHEMA_VERSION
  ;(source.skillCards as unknown[]).push({
    id: OWN_CARD,
    nameKey: 'skill.probe-own.name',
    textKey: 'skill.probe-own.text',
    uses: 1,
    effects: [
      { trigger: 'on_play', condition: { kind: 'always' }, actions: [{ kind: 'destroy_piece', target: { kind: 'chosen_enemy' } }] },
    ],
  })
  const preset = source.presets.find((p) => (p as { id: string }).id === BUNDLED_PRESET_ID) as Record<string, unknown>
  preset.loadoutBudget = 100
  preset.loadout = { white: { ...GOOD } }
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
    expect(errors.some((e) => e.path === `${AT}.pieceId` && e.message.includes('wins the match'))).toBe(true)
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
    const errors = errorsFor(document((preset) => ((preset.loadout as Record<string, Slot>).white!.pieceId = 'piece.king')))
    expect(errors.some((e) => e.path === `${AT}.pieceId` && e.message.includes('royal'))).toBe(true)
  })

  it('refuses replacing a royal piece — that would move the losing condition', () => {
    const errors = errorsFor(document((preset) => ((preset.loadout as Record<string, Slot>).white!.replaces = 'piece.king')))
    expect(errors.some((e) => e.path === `${AT}.replaces` && e.message.includes('cannot be replaced'))).toBe(true)
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
    expect(errors.some((e) => e.path === `${AT}.replaces` && e.message.includes('nothing to replace'))).toBe(true)
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

describe('PLAN Phase 4 — the grade-dependent refusals (ADR-011)', () => {
  const scale = { width: 5 }
  const loaded = loadContentSet(document(() => {}))
  if (!loaded.ok) throw new Error(`the Phase 4 fixture must load: ${JSON.stringify(loaded.errors.slice(0, 3))}`)
  const preset = loaded.set.presets.get(BUNDLED_PRESET_ID)!

  it('refuses a cross-band replacement', () => {
    const grades = gradesFrom(
      new Map([
        ['piece.archer', 21.5],
        ['piece.knight', 1.0],
        [OWN_CARD, 2.25],
      ]),
    )
    const errors = checkLoadoutGrades(preset, grades, scale)
    expect(errors.some((e) => e.path === `${AT}.pieceId` && e.message.includes('same grade'))).toBe(true)
  })

  it('accepts a same-band replacement', () => {
    const grades = gradesFrom(
      new Map([
        ['piece.archer', 1.4],
        ['piece.knight', 1.0],
        [OWN_CARD, 2.25],
      ]),
    )
    expect(checkLoadoutGrades(preset, grades, scale)).toEqual([])
  })

  it('refuses a loadout that costs more than the room allows', () => {
    const tight: PresetDef = { ...preset, loadoutBudget: 5 }
    const grades = gradesFrom(
      new Map([
        ['piece.archer', 11.0],
        ['piece.knight', 11.0],
        [OWN_CARD, 11.0],
      ]),
    )
    const errors = checkLoadoutGrades(tight, grades, scale)
    expect(errors.some((e) => e.message.includes("room's budget"))).toBe(true)
  })

  it('refuses an ungraded record rather than scoring it as harmless', () => {
    // The absent case. Treating "no grade yet" as zero is how a budget gets
    // bypassed by whatever the measurement has not caught up with.
    const grades = gradesFrom(new Map([['piece.knight', 1.0]]))
    const errors = checkLoadoutGrades(preset, grades, scale)
    expect(errors.some((e) => e.message.includes('not been graded'))).toBe(true)
  })

  it('charges the same for two deltas in the same band', () => {
    const tight: PresetDef = { ...preset, loadoutBudget: 9 }
    const cheap = gradesFrom(new Map([['piece.archer', 4.9], ['piece.knight', 4.9], [OWN_CARD, 4.9]]))
    const dear = gradesFrom(new Map([['piece.archer', 6.1], ['piece.knight', 6.1], [OWN_CARD, 6.1]]))
    // 4.9 and 6.1 both round to band 1 (representative 5), so both cost 10 > 9.
    expect(checkLoadoutGrades(tight, cheap, scale).length).toBe(checkLoadoutGrades(tight, dear, scale).length)
  })
})

describe('PLAN Phase 4 — a loadout card may not also be in the shared pool', () => {
  it('refuses the overlap, because both sides draw from the shared pool', () => {
    const source = document((preset) => {
      // `skill.volley` is one the bundled room already deals to everyone.
      ;(preset.loadout as Record<string, Slot>).white!.skillCardId = 'skill.volley'
    })
    const errors = errorsFor(source)
    expect(errors.some((e) => e.path === `${AT}.skillCardId` && e.message.includes('shared pool'))).toBe(true)
  })
})
