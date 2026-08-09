import { describe, expect, it } from 'vitest'
import type { ContentSource } from '@content/load'
import { bundledContentSource } from '@content/sets/bundled'
import {
  bundledRecord,
  differsFromBundled,
  forkId,
  isOfficial,
  officialIds,
} from '@content/provenance'

/**
 * PLAN-content-provenance-and-room-delete Phase 1 — provenance is DERIVED from
 * the bundled id set (ADR-003), never stored on a record.
 *
 * The module is pure on purpose: no storage, no DOM, no clock. That is what
 * makes "is this ours or theirs?" answerable in a unit test with a fixture
 * bundle, and it is why ADR-003 could reject a schema field — a derived answer
 * has no absent case to define, which is the trap
 * `[fail:design] saved-blob-forks-shipped-content` records this project falling
 * into once already.
 */

/** A two-record bundle — small enough that every assertion names its own data. */
function fixtureBundle(): ContentSource {
  return {
    schemaVersion: 10,
    pieces: [{ id: 'piece.king', nameKey: 'piece.king.name', movement: [{ kind: 'step', vectors: [[0, 1]] }] }],
    squareTypes: [],
    ruleCards: [],
    skillCards: [],
    boards: [],
    presets: [{ id: 'preset.default', nameKey: 'preset.default.name', boardId: 'board.a' }],
  }
}

describe('officialIds / isOfficial', () => {
  it('reports every id the bundle ships, across all six collections', () => {
    const ids = officialIds(fixtureBundle())
    expect([...ids].sort()).toEqual(['piece.king', 'preset.default'])
  })

  it('calls a bundled id official and an authored id not', () => {
    const official = officialIds(fixtureBundle())
    expect(isOfficial('piece.king', official)).toBe(true)
    // The id a child's own piece would carry. Nothing was written to say so —
    // absence from the bundle IS the answer, which is the whole of ADR-003.
    expect(isOfficial('piece.dragon', official)).toBe(false)
  })

  it('answers for the SHIPPED bundle, not only a fixture', () => {
    // The fixture above proves the rule; this proves the rule is pointed at the
    // real catalogue. A test that only ever ran on a hand-built bundle would
    // pass with `officialIds` reading the wrong module.
    const official = officialIds(bundledContentSource)
    expect(official.size).toBeGreaterThan(0)
    expect(isOfficial('piece.king', official)).toBe(true)
    expect(isOfficial('piece.definitely-not-shipped', official)).toBe(false)
  })

  it('skips records carrying no usable id rather than admitting an empty one', () => {
    const bundle = fixtureBundle()
    bundle.pieces.push({ nameKey: 'piece.nameless.name' }, { id: '' })
    const ids = officialIds(bundle)
    expect(ids.has('')).toBe(false)
    expect(ids.size).toBe(2)
  })
})

describe('forkId', () => {
  it('suffixes the original and keeps walking while the suffix is taken', () => {
    expect(forkId('piece.king', new Set())).toBe('piece.king-2')
    expect(forkId('piece.king', new Set(['piece.king']))).toBe('piece.king-2')
    expect(forkId('piece.king', new Set(['piece.king', 'piece.king-2']))).toBe('piece.king-3')
    expect(forkId('piece.king', new Set(['piece.king', 'piece.king-2', 'piece.king-3']))).toBe(
      'piece.king-4',
    )
  })

  it('produces an id the schema accepts', () => {
    // `contentId` is `^[a-z]+\.[a-z0-9-]+$` (src/content/schema.ts). A fork that
    // produced an id the loader refuses would turn "edit an official piece" into
    // a save that cannot happen at all.
    const contentId = /^[a-z]+\.[a-z0-9-]+$/
    expect(forkId('piece.king', new Set())).toMatch(contentId)
    expect(forkId('skill.smoke-screen', new Set())).toMatch(contentId)
    // Forking a fork, which is the second edit of the same authored copy.
    expect(forkId('piece.king-2', new Set(['piece.king-2']))).toMatch(contentId)
  })
})

describe('bundledRecord', () => {
  it('finds the shipped record of the same id in the named collection', () => {
    const found = bundledRecord(fixtureBundle(), 'pieces', 'piece.king')
    expect(found).toMatchObject({ id: 'piece.king' })
  })

  it('is undefined for an authored id, and for an id in the wrong collection', () => {
    expect(bundledRecord(fixtureBundle(), 'pieces', 'piece.dragon')).toBeUndefined()
    expect(bundledRecord(fixtureBundle(), 'presets', 'piece.king')).toBeUndefined()
  })
})

describe('differsFromBundled', () => {
  const bundled = () => fixtureBundle().pieces[0]

  it('is false for an untouched clone — a rename must NOT fork (ADR-001)', () => {
    // The load-bearing case. A rename writes into `source.strings`, never into
    // the record, so the record handed back on save is structurally identical to
    // the shipped one and this must answer false. If it ever answers true,
    // calling the king 임금님 grows the catalogue by one piece every time.
    expect(differsFromBundled(structuredClone(bundled()), bundled())).toBe(false)
  })

  it('is true when a RULE changes', () => {
    const draft = structuredClone(bundled()) as { movement: Array<{ vectors: number[][] }> }
    draft.movement[0]!.vectors = [
      [0, 1],
      [1, 1],
    ]
    expect(differsFromBundled(draft, bundled())).toBe(true)
  })

  it('is true when a key field is repointed at different text', () => {
    // ADR-001 accepts this: repointing a record at different text IS a change to
    // the record. It is not what a child means by "rename" — that path never
    // reaches here — so the correct answer is the structural one.
    const draft = structuredClone(bundled()) as { nameKey: string }
    draft.nameKey = 'piece.king.other-name'
    expect(differsFromBundled(draft, bundled())).toBe(true)
  })

  it('ignores key ORDER but not key presence', () => {
    // The form rebuilds a draft field by field, so key order is not stable
    // across a round trip. A `JSON.stringify` comparison would call a reordered
    // but identical record different, and fork on every single save.
    const original = bundled() as Record<string, unknown>
    const reordered: Record<string, unknown> = {}
    for (const key of Object.keys(original).reverse()) reordered[key] = structuredClone(original[key])
    expect(differsFromBundled(reordered, bundled())).toBe(false)

    const extra = { ...structuredClone(original), royal: true }
    expect(differsFromBundled(extra, bundled())).toBe(true)

    const missing = structuredClone(original)
    delete missing['nameKey']
    expect(differsFromBundled(missing, bundled())).toBe(true)
  })

  it('treats an absent bundled record as a difference', () => {
    // The absent case, stated rather than left to fall out of a comparison with
    // `undefined`. Nothing bundled to match means the record is not an unchanged
    // copy of anything we ship.
    expect(differsFromBundled(bundled(), undefined)).toBe(true)
  })

  it('compares arrays by order, not as sets — at equal length', () => {
    // Same length, same elements, different order. A comparator that only
    // checked length, or that compared arrays as sets, passes a
    // different-length case and fails this one — which is why the reordering is
    // the assertion and a length change would not be.
    const twoStep = {
      id: 'piece.walker',
      nameKey: 'piece.walker.name',
      movement: [
        {
          kind: 'step',
          vectors: [
            [0, 1],
            [1, 0],
          ],
        },
      ],
    }
    const swapped = structuredClone(twoStep)
    swapped.movement[0]!.vectors = [
      [1, 0],
      [0, 1],
    ]
    expect(differsFromBundled(swapped, twoStep)).toBe(true)
    // And the control: the same array, same order, is not a difference.
    expect(differsFromBundled(structuredClone(twoStep), twoStep)).toBe(false)
  })
})
