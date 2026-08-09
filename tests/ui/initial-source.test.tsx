// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import React from 'react'
import { type ContentSource, loadContentSet } from '@content/load'
import { BASELINE_STAMP_IDS } from '@content/sets/baseline-stamp'
import { bundledContentSource } from '@content/sets/bundled'
import { stampOf } from '@content/merge'
import { STAMP_KEY, STORAGE_KEY } from '@editor/storage'
import { App, initialSource, mergeWithRepair } from '../../src/ui/App'
import { skipOnboarding } from '../helpers/onboarding'

/**
 * The app's entry decision, after the merge (PLAN-bundled-content-merge Phase 3).
 *
 * `initialSource` used to be one branch: stored content wins whenever it
 * validates. That branch is the defect — the first editor save freezes a
 * browser's catalogue forever, so new presets and boards reach a fresh install
 * and nowhere else. It now consults the bundle on the OK path too, and the two
 * claims that have to hold together are:
 *
 *  - it adds what is new (ADR-001 row 4), and
 *  - **it writes nothing at all** (ADR-003).
 *
 * The second is not a nicety. A load-time stamp write would make the next load
 * see the additions in the stamp and not in the saved set — ADR-001 row 6, "the
 * author deleted it" — so the merge would classify its own additions as
 * deletions and drop them. It would have worked once per session and reverted on
 * reload. That is why "nothing is written" is asserted at the storage boundary
 * rather than reasoned about.
 *
 * Fixtures are built from the REAL `bundledContentSource` and run through
 * `loadContentSet`, because the interesting failures here are cross-reference
 * failures and a synthetic two-record document cannot have one.
 */

/** The bundle with some records removed — what an author's saved document looks like. */
function withoutIds(source: ContentSource, remove: string[]): ContentSource {
  const gone = new Set(remove)
  const next = structuredClone(source) as ContentSource
  for (const name of ['pieces', 'squareTypes', 'ruleCards', 'skillCards', 'boards', 'presets'] as const) {
    next[name] = next[name].filter((r) => !gone.has((r as { id: string }).id))
  }
  return next
}

/** A piece of the author's own, so "unchanged" is never the trivially right answer. */
function withAuthoredPiece(source: ContentSource): ContentSource {
  const next = structuredClone(source) as ContentSource
  const king = structuredClone(next.pieces.find((p) => (p as { id: string }).id === 'piece.king'))
  ;(king as { id: string }).id = 'piece.mine'
  next.pieces = [...next.pieces, king]
  return next
}

/**
 * The bundle restricted to the pinned baseline's ids — what an install that
 * saved before the three rooms shipped actually holds.
 *
 * Derived from `BASELINE_STAMP_IDS` rather than from a second hand-written list,
 * so a fixture cannot drift from the constant the production path reads. Its
 * validity is asserted here, once, for every test that builds on it: a fixture
 * that fails `loadContentSet` sends `initialSource` down its `failedToLoad`
 * branch, which returns the whole bundle and satisfies every "the record is
 * present" assertion with no merge running at all.
 */
function baselineDocument(): ContentSource {
  const keep = new Set(BASELINE_STAMP_IDS)
  const next = structuredClone(bundledContentSource) as ContentSource
  for (const name of ['pieces', 'squareTypes', 'ruleCards', 'skillCards', 'boards', 'presets'] as const) {
    next[name] = next[name].filter((r) => keep.has((r as { id: string }).id))
  }
  expect(loadContentSet(next).ok).toBe(true)
  return next
}

/** Every bundled id except these — the stamp of a build that had not shipped them yet. */
function stampWithout(remove: string[]): { ids: string[] } {
  const gone = new Set(remove)
  return { ids: stampOf(bundledContentSource).ids.filter((id) => !gone.has(id)) }
}

function seed(saved: ContentSource, stamp?: { ids: string[] }) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(saved))
  if (stamp) localStorage.setItem(STAMP_KEY, JSON.stringify(stamp))
}

function ids(list: unknown[]): string[] {
  return list.map((r) => (r as { id: string }).id)
}

beforeEach(() => {
  localStorage.clear()
  vi.restoreAllMocks()
})
afterEach(cleanup)

describe('initialSource — the paths that existed before', () => {
  it('hands a first run the bundle, unchanged', () => {
    const result = initialSource()
    expect(result.source).toEqual(bundledContentSource)
    expect(result.failedToLoad).toBe(false)
    expect(result.mergeFailed).toEqual([])
  })

  it('still reports content that no longer validates, without merging into it', () => {
    const broken = structuredClone(bundledContentSource) as unknown as { pieces: { movement: unknown }[] }
    broken.pieces[0]!.movement = []
    localStorage.setItem(STORAGE_KEY, JSON.stringify(broken))

    const result = initialSource()
    expect(result.failedToLoad).toBe(true)
    expect(result.source).toEqual(bundledContentSource)
  })
})

describe('initialSource — a saved install with no stamp (ADR-003, the absent case)', () => {
  // Every install that existed on the day the merge shipped. The synthesised
  // stamp is a PINNED PAST RELEASE, not the current bundle — the first version
  // used the current bundle, which made every record "already known" and left
  // the reported maps invisible on exactly the devices that reported them.
  const saved = () => withAuthoredPiece(withoutIds(bundledContentSource, ['preset.covenant']))

  it('delivers the backlog: records added since the baseline arrive', () => {
    // The field report, at the level the child sees it. This install saved back
    // when the bundle was the baseline; three rooms have shipped since.
    seed(withAuthoredPiece(structuredClone(baselineDocument())))

    const result = initialSource()

    for (const id of ['preset.bastion', 'preset.cavalry', 'preset.covenant']) {
      expect(ids(result.source.presets)).toContain(id)
    }
    expect(ids(result.source.pieces)).toContain('piece.mine')
    expect(result.mergeFailed).toEqual([])
    expect(loadContentSet(result.source).ok).toBe(true)
  })

  it('keeps a deletion of something the baseline already had', () => {
    // The half the backlog delivery must not break. `preset.default` is in the
    // baseline, so deleting it is unambiguously the author's doing and stays.
    const doc = withoutIds(baselineDocument(), ['preset.default'])
    expect(loadContentSet(doc).ok).toBe(true)
    seed(doc)

    const result = initialSource()

    expect(ids(result.source.presets)).not.toContain('preset.default')
    expect(ids(result.source.presets)).toContain('preset.cavalry')
    expect(loadContentSet(result.source).ok).toBe(true)
  })

  it('RESURRECTS a deletion of something added after the baseline — the accepted cost', () => {
    // Asserted rather than left implied, because it is the price of the choice
    // and a future reader will otherwise read it as a bug. With no stamp the
    // merge cannot tell "the author deleted it" from "it was never delivered",
    // and the baseline is what draws that line. Above the line, deletions hold;
    // below it, they do not. This only reaches an install created AFTER the
    // baseline that then deleted one of the thirty — an install that never
    // received a record cannot have deleted it.
    const doc = withoutIds(bundledContentSource, ['preset.cavalry'])
    expect(loadContentSet(doc).ok).toBe(true)
    seed(doc)

    const result = initialSource()

    expect(ids(result.source.presets)).toContain('preset.cavalry')
  })

  it('stops delivering once the install has saved under this build', () => {
    // The backlog is a ONE-TIME event. After an accepted save the stamp is real
    // and the baseline is never consulted on this device again — so a room the
    // author deletes from here on stays deleted.
    seed(withoutIds(bundledContentSource, ['preset.cavalry']), stampOf(bundledContentSource))

    const result = initialSource()

    expect(ids(result.source.presets)).not.toContain('preset.cavalry')
    expect(result.source).toEqual(withoutIds(bundledContentSource, ['preset.cavalry']))
  })

  it('writes nothing — not even the stamp it had to synthesise', () => {
    // Round-1 review, codex: the first version of this test SEEDED a stamp, inside
    // the block whose subject is the absent one. So it proved "no write when a
    // stamp exists" and left the branch that actually matters uncovered — a load
    // that wrote the stamp only when `loadStamp` returned null would have survived
    // it, and that write is R1 itself: the additions would land in the stamp and
    // not in the document, and the next load would read them as deletions.
    //
    // No stamp is seeded here. That is the whole point.
    seed(saved())
    expect(localStorage.getItem(STAMP_KEY)).toBeNull()
    const content = localStorage.getItem(STORAGE_KEY)
    const setItem = vi.spyOn(Storage.prototype, 'setItem')

    initialSource()

    expect(setItem).not.toHaveBeenCalled()
    expect(localStorage.getItem(STORAGE_KEY)).toBe(content)
    expect(localStorage.getItem(STAMP_KEY)).toBeNull()
  })

  it('writes nothing when a stamp IS present either', () => {
    seed(saved(), { ids: ['piece.king'] })
    const content = localStorage.getItem(STORAGE_KEY)
    const stamp = localStorage.getItem(STAMP_KEY)
    const setItem = vi.spyOn(Storage.prototype, 'setItem')

    initialSource()

    expect(setItem).not.toHaveBeenCalled()
    expect(localStorage.getItem(STORAGE_KEY)).toBe(content)
    expect(localStorage.getItem(STAMP_KEY)).toBe(stamp)
  })
})

describe('initialSource — a saved install with a stamp', () => {
  it('receives the records this release added', () => {
    seed(withoutIds(bundledContentSource, ['preset.covenant']), stampWithout(['preset.covenant']))

    const result = initialSource()
    expect(ids(result.source.presets)).toContain('preset.covenant')
    expect(result.mergeFailed).toEqual([])
    expect(loadContentSet(result.source).ok).toBe(true)
  })

  it('is safe when the stamp LAGS the saved document', () => {
    // The other half of ADR-003's invariant, and a window this repair newly makes
    // reachable: a refused stamp write (quota, private mode) leaves a stamp naming
    // fewer ids than the document holds. Every such id is ADR-001 row 5 — in the
    // saved set, not in the stamp — so the saved record, already the newer copy,
    // is kept and nothing is duplicated. Self-healing: the next accepted save
    // re-synchronises. The dangerous direction is a stamp that LEADS, which is
    // why `Edit.tsx` writes it only after `saveContent` returns ok.
    const saved = withAuthoredPiece(bundledContentSource)
    seed(saved, { ids: ['piece.king'] })

    const result = initialSource()

    expect(result.source).toEqual(saved)
    expect(result.mergeFailed).toEqual([])
    expect(ids(result.source.presets)).toHaveLength(bundledContentSource.presets.length)
    expect(new Set(ids(result.source.pieces)).size).toBe(result.source.pieces.length)
    expect(loadContentSet(result.source).ok).toBe(true)
  })

  it('handles mixed membership: adds the new, keeps the authored, honours the deleted', () => {
    // Neither equal to the bundle nor disjoint from it. `preset.bastion` is the
    // only bundled record deletable in one step (`roomsReferencing` returns []
    // for presets alone), and removing it is what lets `skill.veil` go with it.
    const saved = withAuthoredPiece(
      withoutIds(bundledContentSource, ['preset.covenant', 'preset.bastion', 'skill.veil']),
    )
    expect(loadContentSet(saved).ok).toBe(true)
    // `preset.covenant` is new this release; bastion and veil the author deleted.
    seed(saved, stampWithout(['preset.covenant']))

    const result = initialSource()
    expect(ids(result.source.presets)).toContain('preset.covenant')
    expect(ids(result.source.pieces)).toContain('piece.mine')
    expect(ids(result.source.presets)).not.toContain('preset.bastion')
    expect(ids(result.source.skillCards)).not.toContain('skill.veil')
    expect(result.mergeFailed).toEqual([])
    expect(loadContentSet(result.source).ok).toBe(true)
  })
})

describe('initialSource — an addition that dangles (ADR-004)', () => {
  /**
   * ADR-004's own example, built from the real bundle: `preset.bastion` is new
   * this release and references `skill.veil`, which this author deleted. Adding
   * it would make `loadContentSet` Pass 2 reject the whole document — and failing
   * to start is far worse than not merging.
   */
  function seedDanglingCase() {
    const saved = withoutIds(bundledContentSource, ['preset.bastion', 'skill.veil'])
    expect(loadContentSet(saved).ok).toBe(true)
    // veil IS in the stamp (row 6: the author deleted it, so it stays deleted).
    // bastion is NOT (row 4: new this release, so it is a candidate).
    seed(saved, stampWithout(['preset.bastion']))
    return saved
  }

  it('declines the addition, names it, and returns a document that validates', () => {
    const saved = seedDanglingCase()
    const result = initialSource()

    expect(result.mergeFailed).toEqual(['preset.bastion'])
    expect(result.failedToLoad).toBe(false)
    expect(result.source).toEqual(saved)
    expect(loadContentSet(result.source).ok).toBe(true)
  })

  it('keeps mergeFailed distinct from failedToLoad', () => {
    // Overloading one flag would make "your saved work did not load" and "one
    // new room could not be added" indistinguishable in a field report.
    seedDanglingCase()
    const result = initialSource()
    expect(result.mergeFailed.length).toBeGreaterThan(0)
    expect(result.failedToLoad).toBe(false)
  })

  it('surfaces the declined ids on the shell, without a notice the child must read', () => {
    seedDanglingCase()
    skipOnboarding()
    render(<App />)
    expect(screen.getByRole('main').getAttribute('data-merge-declined')).toBe('preset.bastion')
    // ADR-003: no in-app announcement. The content notice belongs to a failed LOAD.
    expect(screen.queryByTestId('content-notice')).toBeNull()
  })

  it('names every declined id, separately, when a release adds two that dangle', () => {
    // One id cannot show how a list is written down, and the attribute is the
    // whole of what a field report gets. `preset.cavalry` needs `skill.blink`
    // and `preset.bastion` needs `skill.veil`; this author has neither card.
    const saved = withoutIds(bundledContentSource, [
      'preset.bastion',
      'skill.veil',
      'preset.cavalry',
      'skill.blink',
    ])
    expect(loadContentSet(saved).ok).toBe(true)
    seed(saved, stampWithout(['preset.bastion', 'preset.cavalry']))
    skipOnboarding()

    const result = initialSource()
    expect([...result.mergeFailed].sort()).toEqual(['preset.bastion', 'preset.cavalry'])
    expect(result.source).toEqual(saved)

    render(<App />)
    const declared = screen.getByRole('main').getAttribute('data-merge-declined')!.split(' ')
    expect([...declared].sort()).toEqual(['preset.bastion', 'preset.cavalry'])
  })

  it('leaves the attribute off when nothing was declined', () => {
    skipOnboarding()
    render(<App />)
    expect(screen.getByRole('main').hasAttribute('data-merge-declined')).toBe(false)
  })
})

describe('mergeWithRepair — the progress rule (ADR-004)', () => {
  const saved = () => withoutIds(bundledContentSource, ['preset.bastion', 'skill.veil'])

  it('declines everything and converges on the saved document when attribution fails', () => {
    // The branch the progress rule exists for. Pass 2 has error classes whose
    // attribution does not name the record that changed — the loadout `replaces`
    // check reports against a preset, the paired-square check against a board —
    // so a loop that declines only "the candidate the error names" can find
    // nothing to decline and never make progress. Injected here rather than
    // provoked, because ADR-004 proves the worst fixed point is reachable only
    // through attribution failure, and no real bundle produces one.
    const alwaysBad = () =>
      ({ ok: false, errors: [{ contentId: 'board.default', path: 'squares', message: 'contrived' }] }) as ReturnType<
        typeof loadContentSet
      >

    const result = mergeWithRepair(saved(), bundledContentSource, stampWithout(['preset.bastion']), alwaysBad)

    expect(result.declined).toEqual(['preset.bastion'])
    expect(result.source).toEqual(saved())
  })

  it('never calls the validator when there is nothing to add', () => {
    // The common load. A set difference over the bundle's ids, and no Pass 2 at all.
    const validate = vi.fn(loadContentSet)
    const result = mergeWithRepair(saved(), bundledContentSource, stampOf(bundledContentSource), validate)
    expect(validate).not.toHaveBeenCalled()
    expect(result.declined).toEqual([])
    expect(result.source).toEqual(saved())
  })

  it('validates once and declines nothing when the addition is sound', () => {
    const validate = vi.fn(loadContentSet)
    const result = mergeWithRepair(
      withoutIds(bundledContentSource, ['preset.covenant']),
      bundledContentSource,
      stampWithout(['preset.covenant']),
      validate,
    )
    expect(validate).toHaveBeenCalledTimes(1)
    expect(result.declined).toEqual([])
    expect(ids(result.source.presets)).toContain('preset.covenant')
  })
})
