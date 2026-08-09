import { describe, expect, it } from 'vitest'
import type { ContentSource } from '@content/load'
import { bundledContentSource } from '@content/sets/bundled'
import { type BundleStamp, mergeBundled, stampOf } from '@content/merge'

/**
 * The additive merge, as algebra (PLAN-bundled-content-merge ADR-001).
 *
 * Records here are minimal `{ id }` objects on purpose. `ContentSource` types
 * its collections as `unknown[]` — the Zod schemas are the only thing allowed
 * to decide whether a record is well-formed — and the merge decides membership,
 * never shape. A fixture built from real pieces would make every one of these
 * assertions depend on content that has nothing to do with the rule under test.
 *
 * ADR-001's seven rows are exercised in ONE fixture rather than seven, and that
 * is a strengthening, not a shortcut: each row owns a distinct id, so no row can
 * explain another's verdict, and the single document additionally proves the
 * rows do not interfere. The rule the fixture must obey is the one
 * `[fail:test] assertion-equals-its-own-default` (count:5) names — the saved set
 * is neither equal to the bundle nor disjoint from it, so "unchanged" is never
 * the trivially correct answer.
 */

type Rec = { id: string; from?: string }

function doc(pieces: Rec[], rest: Partial<ContentSource> = {}): ContentSource {
  return {
    schemaVersion: 11,
    pieces,
    squareTypes: [],
    ruleCards: [],
    skillCards: [],
    boards: [],
    presets: [],
    ...rest,
  }
}

/** ids of a collection, in order. */
function ids(list: unknown[]): string[] {
  return list.map((r) => (r as Rec).id)
}

function pieceNamed(source: ContentSource, id: string): Rec | undefined {
  return source.pieces.find((r) => (r as Rec).id === id) as Rec | undefined
}

// --- The seven-row fixture ------------------------------------------------
//
//  row | B | T | S | id
//   1  | ✗ | ✗ | ✓ | piece.authored   the author created it
//   2  | ✗ | ✓ | ✓ | piece.retired    this release dropped it; author still has it
//   3  | ✗ | ✓ | ✗ | piece.gone       dropped, and already deleted by the author
//   4  | ✓ | ✗ | ✗ | piece.fresh      NEW THIS RELEASE — the only row that acts
//   5  | ✓ | ✗ | ✓ | piece.claimed    author took an id the bundle now ships
//   6  | ✓ | ✓ | ✗ | piece.deleted    the author deleted a bundled record
//   7  | ✓ | ✓ | ✓ | piece.shared     present everywhere

const BUNDLE = doc([
  { id: 'piece.fresh', from: 'bundle' },
  { id: 'piece.claimed', from: 'bundle' },
  { id: 'piece.deleted', from: 'bundle' },
  { id: 'piece.shared', from: 'bundle' },
])

const STAMP: BundleStamp = { ids: ['piece.retired', 'piece.gone', 'piece.deleted', 'piece.shared'] }

const SAVED = doc([
  { id: 'piece.authored', from: 'saved' },
  { id: 'piece.retired', from: 'saved' },
  { id: 'piece.claimed', from: 'saved' },
  { id: 'piece.shared', from: 'saved' },
])

function merged(): ContentSource {
  return mergeBundled(SAVED, BUNDLE, STAMP).source
}

describe('mergeBundled — the fixture itself', () => {
  it('is neither equal to nor disjoint from the bundle', () => {
    const savedIds = new Set(ids(SAVED.pieces))
    const bundleIds = new Set(ids(BUNDLE.pieces))
    const shared = [...savedIds].filter((id) => bundleIds.has(id))
    expect(shared.length).toBeGreaterThan(0)
    expect([...savedIds].some((id) => !bundleIds.has(id))).toBe(true)
    expect([...bundleIds].some((id) => !savedIds.has(id))).toBe(true)
  })
})

describe('mergeBundled — ADR-001, row by row', () => {
  it('row 1: an authored record survives the merge', () => {
    // Named because an implementation that iterates the BUNDLE instead of the
    // saved set would delete the child's entire catalogue and still pass every
    // other row here.
    expect(pieceNamed(merged(), 'piece.authored')).toEqual({ id: 'piece.authored', from: 'saved' })
  })

  it('row 2: a record this release dropped is kept when the author still has it', () => {
    expect(pieceNamed(merged(), 'piece.retired')).toEqual({ id: 'piece.retired', from: 'saved' })
  })

  it('row 3: a record dropped from the bundle and already deleted stays gone', () => {
    expect(pieceNamed(merged(), 'piece.gone')).toBeUndefined()
  })

  it('row 4: a record new this release is added from the bundle', () => {
    expect(pieceNamed(merged(), 'piece.fresh')).toEqual({ id: 'piece.fresh', from: 'bundle' })
  })

  it('row 5: an id the author took keeps the AUTHOR’s record, with no duplicate', () => {
    expect(pieceNamed(merged(), 'piece.claimed')).toEqual({ id: 'piece.claimed', from: 'saved' })
    expect(ids(merged().pieces).filter((id) => id === 'piece.claimed')).toHaveLength(1)
  })

  it('row 6: a bundled record the author deleted is not resurrected', () => {
    expect(pieceNamed(merged(), 'piece.deleted')).toBeUndefined()
  })

  it('row 7: a record present everywhere keeps the saved copy', () => {
    expect(pieceNamed(merged(), 'piece.shared')).toEqual({ id: 'piece.shared', from: 'saved' })
  })

  it('adds exactly the row-4 id, and reports it', () => {
    const result = mergeBundled(SAVED, BUNDLE, STAMP)
    expect(result.added).toEqual(['piece.fresh'])
    expect(ids(result.source.pieces)).toEqual([
      'piece.authored',
      'piece.retired',
      'piece.claimed',
      'piece.shared',
      'piece.fresh',
    ])
  })
})

describe('mergeBundled — collections and fields', () => {
  it('routes an addition into its own collection', () => {
    const bundle = doc([{ id: 'piece.fresh' }], {
      boards: [{ id: 'board.fresh' }],
      presets: [{ id: 'preset.fresh' }],
    })
    const saved = doc([{ id: 'piece.mine' }])
    const result = mergeBundled(saved, bundle, { ids: [] })
    expect(ids(result.source.pieces)).toEqual(['piece.mine', 'piece.fresh'])
    expect(ids(result.source.boards)).toEqual(['board.fresh'])
    expect(ids(result.source.presets)).toEqual(['preset.fresh'])
    expect(ids(result.source.squareTypes)).toEqual([])
  })

  it('keeps the author’s strings verbatim, including a rename of a BUNDLED record', () => {
    // The direction that matters. The bundle ships no `strings` at all — bundled
    // text lives in `src/i18n/ko.ts` — so there is nothing to merge in, and a
    // bundle-first merge would silently drop every rename the author typed.
    const saved = doc([{ id: 'piece.shared', from: 'saved' }], {
      strings: { ko: { 'piece.shared.name': '내 기사' } },
    })
    const result = mergeBundled(saved, BUNDLE, STAMP)
    expect(result.source.strings).toEqual({ ko: { 'piece.shared.name': '내 기사' } })
    expect(result.source.strings).toBe(saved.strings)
  })

  it('leaves strings absent when the author never typed any', () => {
    expect(mergeBundled(SAVED, BUNDLE, STAMP).source.strings).toBeUndefined()
  })

  it('declares max(saved, bundle) as the schema version', () => {
    const older = mergeBundled(doc([], { schemaVersion: 9 }), doc([], { schemaVersion: 11 }), { ids: [] })
    expect(older.source.schemaVersion).toBe(11)
    const newer = mergeBundled(doc([], { schemaVersion: 12 }), doc([], { schemaVersion: 11 }), { ids: [] })
    expect(newer.source.schemaVersion).toBe(12)
  })
})

describe('mergeBundled — the absent-stamp path (ADR-003)', () => {
  it('adds nothing, and preserves a deletion, when the stamp is synthesised from the current bundle', () => {
    // Every install that exists today has a saved document and no stamp. The
    // synthesised stamp is the whole of the absent case: nothing is new
    // relative to the bundle it was just derived from.
    const result = mergeBundled(SAVED, BUNDLE, stampOf(BUNDLE))
    expect(result.added).toEqual([])
    expect(ids(result.source.pieces)).toEqual(ids(SAVED.pieces))
    expect(pieceNamed(result.source, 'piece.deleted')).toBeUndefined()
  })
})

describe('mergeBundled — declined additions (ADR-004)', () => {
  it('omits a declined id and reports it as not added', () => {
    const result = mergeBundled(SAVED, BUNDLE, STAMP, new Set(['piece.fresh']))
    expect(result.added).toEqual([])
    expect(pieceNamed(result.source, 'piece.fresh')).toBeUndefined()
    expect(ids(result.source.pieces)).toEqual(ids(SAVED.pieces))
  })

  it('declining an id that was never a candidate changes nothing', () => {
    const result = mergeBundled(SAVED, BUNDLE, STAMP, new Set(['piece.authored', 'piece.shared']))
    expect(result.added).toEqual(['piece.fresh'])
  })
})

describe('mergeBundled — purity', () => {
  it('mutates none of its three inputs', () => {
    const saved = structuredClone(SAVED)
    const bundle = structuredClone(BUNDLE)
    const stamp = structuredClone(STAMP)
    mergeBundled(saved, bundle, stamp)
    expect(saved).toEqual(SAVED)
    expect(bundle).toEqual(BUNDLE)
    expect(stamp).toEqual(STAMP)
  })

  it('copies an added record rather than aliasing the bundle’s', () => {
    // `bundledContentSource` is a module-level singleton and the editor mutates
    // whatever `initialSource` hands it. An addition that shared identity with
    // the bundle would let a child’s edit rewrite the shipped catalogue for
    // every other screen in the session.
    const result = mergeBundled(SAVED, BUNDLE, STAMP)
    const added = pieceNamed(result.source, 'piece.fresh')!
    expect(added).not.toBe(BUNDLE.pieces[0])
    added.from = 'mutated'
    expect((BUNDLE.pieces[0] as Rec).from).toBe('bundle')
  })

  it('does not alias the saved collections either', () => {
    const result = mergeBundled(SAVED, BUNDLE, STAMP)
    expect(result.source.pieces).not.toBe(SAVED.pieces)
  })
})

describe('stampOf', () => {
  it('names every id the real bundle ships, across every collection', () => {
    const stamp = stampOf(bundledContentSource)
    const expected = [
      ...bundledContentSource.pieces,
      ...bundledContentSource.squareTypes,
      ...bundledContentSource.ruleCards,
      ...bundledContentSource.skillCards,
      ...bundledContentSource.boards,
      ...bundledContentSource.presets,
    ].map((r) => (r as Rec).id)
    expect([...stamp.ids].sort()).toEqual([...expected].sort())
    expect(new Set(stamp.ids).size).toBe(stamp.ids.length)
    expect(stamp.ids.length).toBeGreaterThan(0)
  })

  it('is what suppresses an addition — an empty stamp adds the same record', () => {
    // Round-1 review, codex: the first version of this test merged the bundle
    // into ITSELF, so every id was already in the saved set and `added` was empty
    // for ANY stamp — `stampOf` could have returned `{ ids: [] }` and it would
    // still have passed. That is `assertion-equals-its-own-default` (count:5 in
    // this repo), and the rule against it is written at the top of THIS file.
    //
    // The saved set must therefore be missing something, so that the stamp is the
    // only thing standing between the bundle and an addition. Two merges differing
    // ONLY in the stamp, with opposite outcomes, is what makes `stampOf` load-bearing.
    const absent = (bundledContentSource.presets.at(-1) as Rec).id
    const saved = {
      ...structuredClone(bundledContentSource),
      presets: bundledContentSource.presets.filter((p) => (p as Rec).id !== absent),
    } as ContentSource
    expect(ids(saved.presets)).not.toContain(absent)

    expect(mergeBundled(saved, bundledContentSource, stampOf(bundledContentSource)).added).toEqual([])
    expect(mergeBundled(saved, bundledContentSource, { ids: [] }).added).toEqual([absent])
  })
})
