import { describe, expect, it } from 'vitest'
import { loadContentSet, type ContentSource } from '@content/load'
import { bundledContentSource } from '@content/sets/bundled'
import { SCHEMA_VERSION } from '@content/schema'
import { exportContent, importContent } from '@editor/io'
import { VOCABULARY_CONTROLS } from '@editor/controls'
import { enumerateVocabulary } from '@editor/vocabulary'
import { commitDraft, editorContext, openDraft } from '@editor/draft'

function byId(records: unknown[], id: string): Record<string, any> {
  const record = records.find((candidate) => (candidate as { id?: string }).id === id)
  if (!record || typeof record !== 'object') throw new Error(`missing ${id}`)
  return record as Record<string, any>
}

function sourceCopy(): ContentSource {
  return structuredClone(bundledContentSource) as ContentSource
}

describe('schema v13 regions and constrained targets', () => {
  it('S1 migrates v12 boards to canonical relative defaults and is import-export idempotent', () => {
    const legacy = sourceCopy()
    legacy.schemaVersion = 12
    expect(legacy.schemaVersion).toBe(12)
    expect(SCHEMA_VERSION).toBe(14)

    const imported = importContent(exportContent(legacy))
    expect(imported.ok).toBe(true)
    if (!imported.ok) return

    expect(imported.source.schemaVersion).toBe(SCHEMA_VERSION)
    const expectedDefaults: Record<string, { territoryDepth: number; promotionDepth: number }> = {
      'board.los-alamos': { territoryDepth: 3, promotionDepth: 1 },
      'board.bastion': { territoryDepth: 3, promotionDepth: 1 },
      'board.cavalry': { territoryDepth: 3, promotionDepth: 1 },
      'board.covenant': { territoryDepth: 3, promotionDepth: 1 },
      'board.grand': { territoryDepth: 4, promotionDepth: 1 },
    }
    for (const [id, defaults] of Object.entries(expectedDefaults)) {
      const board = byId(imported.source.boards, id)
      expect(board.territoryDepth).toBe(defaults.territoryDepth)
      expect(board.promotionDepth).toBe(defaults.promotionDepth)
      expect(board.zones).toEqual({})
    }

    const roundTrip = importContent(exportContent(imported.source))
    expect(roundTrip.ok).toBe(true)
    if (!roundTrip.ok) return
    expect(roundTrip.source).toEqual(imported.source)
  })

  it('S2 round-trips v13 zones, target filters, relations, scoped destinations, and promotion conditions', () => {
    const source = sourceCopy()
    source.schemaVersion = SCHEMA_VERSION
    const board = byId(source.boards, 'board.los-alamos')
    board.territoryDepth = 3
    board.promotionDepth = 1
    board.zones = { shrine_lane: ['a3', 'b3'] }

    const card = byId(source.skillCards, 'skill.teleport')
    card.effects = [
      {
        trigger: 'on_play',
        condition: { kind: 'in_promotion_zone' },
        actions: [
          {
            kind: 'teleport_piece',
            target: {
              kind: 'chosen_friendly',
              filter: { kind: 'non_royal' },
              relation: { kind: 'adjacent_to_choice', choiceIndex: 0 },
            },
            to: { kind: 'chosen_empty', region: 'own_territory' },
          },
        ],
      },
    ]

    const imported = importContent(exportContent(source))
    expect(imported.ok).toBe(true)
    if (!imported.ok) return
    expect(byId(imported.source.boards, 'board.los-alamos').zones).toEqual({ shrine_lane: ['a3', 'b3'] })
    expect(byId(imported.source.skillCards, 'skill.teleport').effects[0]).toEqual(card.effects[0])

    const loaded = loadContentSet(imported.source)
    expect(loaded.ok).toBe(true)
    expect(enumerateVocabulary()).toEqual(
      expect.arrayContaining([
        { axis: 'targetFilter', kind: 'non_royal' },
        { axis: 'relation', kind: 'adjacent_to_choice' },
        { axis: 'destinationRegion', kind: 'own_territory' },
        { axis: 'condition', kind: 'in_promotion_zone' },
      ]),
    )
    expect(VOCABULARY_CONTROLS.map((control) => `${control.axis}:${control.kind}`)).toEqual(
      expect.arrayContaining(['targetFilter:non_royal', 'relation:adjacent_to_choice', 'destinationRegion:own_territory']),
    )

    const roundTrip = importContent(exportContent(imported.source))
    expect(roundTrip.ok).toBe(true)
    if (!roundTrip.ok) return
    expect(roundTrip.source).toEqual(imported.source)
  })

  it('S3 drives each new editor control through commit and reopen', () => {
    const source = sourceCopy()
    source.schemaVersion = SCHEMA_VERSION
    const context = editorContext(source)
    const control = (axis: string, kind: string) => {
      const found = VOCABULARY_CONTROLS.find((entry) => entry.axis === axis && entry.kind === kind)
      expect(found, `${axis}:${kind} must have an editor control`).toBeDefined()
      return found!
    }

    const expectedFilter = { kind: 'non_royal' }
    const expectedRelation = { kind: 'adjacent_to_choice', choiceIndex: 0 }
    const expectedRegion = 'own_territory'
    const expectedPromotion = { kind: 'in_promotion_zone' }
    expect(control('targetFilter', 'non_royal').make(context)).toEqual(expectedFilter)
    expect(control('relation', 'adjacent_to_choice').make(context)).toEqual(expectedRelation)
    expect(control('destinationRegion', 'own_territory').make(context)).toBe(expectedRegion)
    expect(control('condition', 'in_promotion_zone').make(context)).toEqual(expectedPromotion)
    const draft = openDraft(source, 'skillCard', 'skill.teleport')
    expect(draft).not.toBeNull()
    if (!draft) return
    draft.effects = [
      {
        trigger: 'on_play',
        condition: expectedPromotion,
        actions: [
          {
            kind: 'teleport_piece',
            target: { kind: 'chosen_friendly', filter: expectedFilter, relation: expectedRelation },
            to: { kind: 'chosen_empty', region: expectedRegion },
          },
        ],
      },
    ]

    const committed = commitDraft(source, 'skillCard', draft, 'skill.teleport')
    expect(committed.ok).toBe(true)
    if (!committed.ok) return
    const imported = importContent(exportContent(committed.source))
    expect(imported.ok).toBe(true)
    if (!imported.ok) return
    const reopened = openDraft(imported.source, 'skillCard', 'skill.teleport')
    expect(reopened?.effects).toEqual([
      {
        trigger: 'on_play',
        condition: expectedPromotion,
        actions: [
          {
            kind: 'teleport_piece',
            target: { kind: 'chosen_friendly', filter: expectedFilter, relation: expectedRelation },
            to: { kind: 'chosen_empty', region: expectedRegion },
          },
        ],
      },
    ])
  })

  it('S4 rejects invalid depth, out-of-bounds zone squares, and duplicate zone squares', () => {
    const source = sourceCopy()
    source.schemaVersion = SCHEMA_VERSION
    const board = byId(source.boards, 'board.los-alamos')
    board.territoryDepth = 4
    board.promotionDepth = 5
    board.zones = { broken: ['a3', 'a3', 'z99'] }

    const result = importContent(exportContent(source))
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(
      result.errors.some(
        (error) => error.path.includes('territoryDepth') && error.message.includes('territoryDepth must be at most'),
      ),
    ).toBe(true)
    expect(
      result.errors.some(
        (error) => error.path.includes('promotionDepth') && error.message.includes('promotionDepth must be at most'),
      ),
    ).toBe(true)
    expect(
      result.errors.some((error) => error.path.includes('zones.broken.1') && error.message.includes('duplicate square')),
    ).toBe(true)
    expect(
      result.errors.some((error) => error.path.includes('zones.broken.2') && error.message.includes('outside the')),
    ).toBe(true)
  })

  it('S5 rejects unknown destination regions and impossible relation choices', () => {
    const source = sourceCopy()
    source.schemaVersion = SCHEMA_VERSION
    const card = byId(source.skillCards, 'skill.teleport')
    card.effects = [
      {
        trigger: 'on_play',
        condition: { kind: 'always' },
        actions: [
          {
            kind: 'teleport_piece',
            target: {
              kind: 'chosen_friendly',
              relation: { kind: 'adjacent_to_choice', choiceIndex: 1 },
            },
            to: { kind: 'chosen_empty', region: 'unknown_zone' },
          },
        ],
      },
    ]

    const result = importContent(exportContent(source))
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(
      result.errors.some((error) => error.path.includes('effects.0.actions.0.target.relation.choiceIndex') && error.message.includes('choiceIndex')),
    ).toBe(true)
    expect(
      result.errors.some((error) => error.path.includes('effects.0.actions.0.to.region') && error.message.includes('Invalid enum value')),
    ).toBe(true)
  })
})
