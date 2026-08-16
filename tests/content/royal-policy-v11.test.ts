import { describe, expect, it } from 'vitest'
import { SCHEMA_VERSION } from '@content/schema'
import { type ContentSource, loadContentSet } from '@content/load'
import { bundledContentSource } from '@content/sets/bundled'
import { exportContent, importContent } from '@editor/io'

function bundled(): ContentSource {
  return structuredClone(bundledContentSource) as ContentSource
}

function card(source: ContentSource, id = 'skill.quake'): Record<string, unknown> {
  return source.skillCards.find((entry) => (entry as { id?: string }).id === id) as Record<string, unknown>
}

describe('schema v11 royal policy migration', () => {
  it.each([1, 10])('normalizes every v%s skill before strict parsing', (schemaVersion) => {
    const source = bundled()
    source.schemaVersion = schemaVersion
    for (const entry of source.skillCards as Array<Record<string, unknown>>) {
      delete entry.royalFollowUp
      delete entry.protectRelocatedAfterPlay
    }

    const loaded = loadContentSet(source)
    expect(loaded.ok).toBe(true)
    if (!loaded.ok) return
    for (const entry of loaded.set.skillCards.values()) {
      expect(entry.royalFollowUp).toBe('preserve')
      expect(entry.protectRelocatedAfterPlay).toBe(false)
    }
  })

  it.each(['royalFollowUp', 'protectRelocatedAfterPlay'])('rejects a v11 card missing %s', (field) => {
    const source = bundled()
    delete card(source)[field]
    const loaded = loadContentSet(source)
    expect(loaded.ok).toBe(false)
    if (loaded.ok) return
    expect(loaded.errors.some((error) => error.path.endsWith(field))).toBe(true)
  })

  it('upgrades old imports and writes both declarations at v11', () => {
    const source = bundled()
    source.schemaVersion = 10
    for (const entry of source.skillCards as Array<Record<string, unknown>>) {
      delete entry.royalFollowUp
      delete entry.protectRelocatedAfterPlay
    }
    const imported = importContent(exportContent(source))
    expect(imported.ok).toBe(true)
    if (!imported.ok) return
    expect(imported.source.schemaVersion).toBe(SCHEMA_VERSION)
    expect(imported.source.skillCards.every((entry) => (entry as Record<string, unknown>).royalFollowUp === 'preserve')).toBe(true)
    expect(imported.source.skillCards.every((entry) => (entry as Record<string, unknown>).protectRelocatedAfterPlay === false)).toBe(true)
  })

  it('round-trips authored non-default v11 declarations unchanged', () => {
    const source = bundled()
    // Quake is deliberately unprotected in the shipped balance pass. Author a
    // non-default declaration here so this migration test still covers the
    // schema's ability to preserve an explicit opt-in.
    card(source, 'skill.quake').protectRelocatedAfterPlay = true
    const imported = importContent(exportContent(source))
    expect(imported.ok).toBe(true)
    if (!imported.ok) return
    expect(card(imported.source, 'skill.quake').royalFollowUp).toBe('preserve-existing')
    expect(card(imported.source, 'skill.quake').protectRelocatedAfterPlay).toBe(true)
    expect(card(imported.source, 'skill.freeze').royalFollowUp).toBe('preserve')
  })
})

describe('protected relocation authoring grammar', () => {
  it.each([
    ['zero relocation', (entry: Record<string, unknown>) => {
      const effect = (entry.effects as Array<Record<string, unknown>>)[0]!
      effect.actions = [{ kind: 'destroy_piece', target: { kind: 'chosen_enemy' } }]
    }],
    ['conditional', (entry: Record<string, unknown>) => {
      const effect = (entry.effects as Array<Record<string, unknown>>)[0]!
      effect.condition = { kind: 'piece_is', pieceId: 'piece.rook' }
    }],
    ['quantified', (entry: Record<string, unknown>) => {
      const effect = (entry.effects as Array<Record<string, unknown>>)[0]!
      effect.forEach = { kind: 'piece', side: 'opponent' }
    }],
    ['multiple relocation', (entry: Record<string, unknown>) => {
      const effect = (entry.effects as Array<Record<string, unknown>>)[0]!
      ;(effect.actions as unknown[]).push({ kind: 'teleport_piece', target: { kind: 'chosen_enemy' }, to: { kind: 'chosen_empty' } })
    }],
    ['multi-subject target', (entry: Record<string, unknown>) => {
      const effect = (entry.effects as Array<Record<string, unknown>>)[0]!
      ;(effect.actions as Array<Record<string, unknown>>)[0]!.target = { kind: 'adjacent_friendly' }
    }],
  ] as const)('rejects %s protected relocation', (_name, mutate) => {
    const source = bundled()
    // The bundled Quake card now opts out of universal relocation protection;
    // turn the grammar fixture back into an explicit protected declaration.
    card(source).protectRelocatedAfterPlay = true
    mutate(card(source))
    const loaded = loadContentSet(source)
    expect(loaded.ok).toBe(false)
    if (loaded.ok) return
    expect(loaded.errors.some((error) => error.path.endsWith('protectRelocatedAfterPlay'))).toBe(true)
  })
})
