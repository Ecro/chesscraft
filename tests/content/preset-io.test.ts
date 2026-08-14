import { describe, expect, it } from 'vitest'
import { loadContentSet } from '@content/load'
import { bundledContentSource } from '@content/sets/bundled'
import { SLICE_PRESET_ID, sliceContentSource } from '@content/sets/slice'
import { exportContent, importContent } from '@editor/io'
import { commitDraft } from '@editor/draft'
import { SCHEMA_VERSION } from '@content/schema'
import { createMatch, currentState } from '@engine/match'

/**
 * AC-015 — a content set survives leaving the app and coming back.
 *
 * The load-bearing question is not "does JSON.parse invert JSON.stringify"; it
 * is whether the thing that comes back is the same *content*, so the round trip
 * is checked at three levels: the document, the loaded set, and a match started
 * from it. A serializer that drops an optional field (`royal`, `forward`,
 * `duration`, `except`) passes a shallow document comparison of the fields it
 * kept, and produces a different game.
 */

function idsOf(records: unknown[]): string[] {
  return records.map((r) => (r as { id: string }).id)
}

describe('preset export / import', () => {
  it('export import round trip', () => {
    const original = structuredClone(sliceContentSource)
    const result = importContent(exportContent(original))

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.source.schemaVersion).toBe(SCHEMA_VERSION)
    expect(result.source.skillCards).toEqual(
      original.skillCards.map((card) => ({ ...(card as object), royalFollowUp: 'preserve', protectRelocatedAfterPlay: false, lockRelocatedAfterPlay: false })),
    )
  })

  it('round-trips the bundled set, which is the largest thing an author can export', () => {
    const original = structuredClone(bundledContentSource)
    const result = importContent(exportContent(original))
    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.source).toEqual(original)
    for (const collection of ['pieces', 'squareTypes', 'ruleCards', 'skillCards', 'boards', 'presets'] as const) {
      expect(idsOf(result.source[collection])).toEqual(idsOf(original[collection]))
    }
  })

  it('round-trips optional fields rather than dropping them to defaults', () => {
    const original = structuredClone(bundledContentSource)
    const imported = importContent(exportContent(original))
    expect(imported.ok).toBe(true)
    if (!imported.ok) return

    const before = loadContentSet(original)
    const after = loadContentSet(imported.source)
    expect(before.ok && after.ok).toBe(true)
    if (!before.ok || !after.ok) return

    // `royal` decides what ends a match; if the round trip loses it, every one
    // of these pieces silently stops being a king.
    const royalBefore = [...before.set.pieces.values()].filter((p) => p.royal).map((p) => p.id)
    expect(royalBefore.length).toBeGreaterThan(0)
    expect([...after.set.pieces.values()].filter((p) => p.royal).map((p) => p.id)).toEqual(royalBefore)

    expect(JSON.stringify([...after.set.skillCards.values()])).toBe(
      JSON.stringify([...before.set.skillCards.values()]),
    )
  })

  it('produces a set an identical match can be played from', () => {
    const imported = importContent(exportContent(structuredClone(sliceContentSource)))
    expect(imported.ok).toBe(true)
    if (!imported.ok) return

    const loaded = loadContentSet(imported.source)
    const reference = loadContentSet(sliceContentSource)
    expect(loaded.ok && reference.ok).toBe(true)
    if (!loaded.ok || !reference.ok) return

    const fromImport = currentState(createMatch({ content: loaded.set, presetId: SLICE_PRESET_ID, seed: 11 }))
    const fromBundle = currentState(createMatch({ content: reference.set, presetId: SLICE_PRESET_ID, seed: 11 }))
    expect(JSON.stringify(fromImport)).toBe(JSON.stringify(fromBundle))
  })

  it('carries content authored in this session through the round trip', () => {
    const draft = {
      id: 'skill.smokescreen',
      nameKey: 'skill.smokescreen.name',
      textKey: 'skill.smokescreen.text',
      cost: 2,
      uses: 1,
      effects: [
        {
          trigger: 'on_play',
          condition: { kind: 'always' },
          actions: [{ kind: 'freeze_piece', target: { kind: 'chosen_enemy' }, plies: 1 }],
        },
      ],
    }
    const committed = commitDraft(structuredClone(sliceContentSource), 'skillCard', draft)
    expect(committed.ok).toBe(true)
    if (!committed.ok) return

    const imported = importContent(exportContent(committed.source))
    expect(imported.ok).toBe(true)
    if (!imported.ok) return

    const loaded = loadContentSet(imported.source)
    expect(loaded.ok).toBe(true)
    if (!loaded.ok) return
    expect(loaded.set.skillCards.get('skill.smokescreen')).toEqual({
      ...draft,
      royalFollowUp: 'preserve',
      protectRelocatedAfterPlay: false,
      lockRelocatedAfterPlay: false,
    })
  })

  it('refuses an import that is not valid content, naming the offending field', () => {
    const broken = structuredClone(sliceContentSource) as unknown as { skillCards: { nameKey: string }[] }
    broken.skillCards[0]!.nameKey = 'Warp'

    const result = importContent(JSON.stringify(broken))
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.errors.some((e) => e.path.endsWith('nameKey'))).toBe(true)
  })

  it('refuses text that is not JSON at all without throwing', () => {
    const result = importContent('{ this is not json')
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.errors.length).toBeGreaterThan(0)
  })

  it('refuses a document whose schemaVersion the app cannot interpret', () => {
    const future = { ...structuredClone(sliceContentSource), schemaVersion: 99 }
    const result = importContent(JSON.stringify(future))
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.errors.some((e) => e.path === 'schemaVersion')).toBe(true)
  })
})
