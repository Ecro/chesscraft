import { describe, expect, it } from 'vitest'
import { loadContentSet } from '@content/load'
import { BASELINE_STAMP_IDS } from '@content/sets/baseline-stamp'
import { bundledContentSource } from '@content/sets/bundled'
import { mergeBundled } from '@content/merge'

/**
 * The pinned baseline stamp, checked against the bundle it is a past snapshot of.
 *
 * This constant decides what an install with no stamp of its own receives —
 * every install that existed when the merge shipped — and it decides it ONCE per
 * device. There is no runtime signal when it is wrong: a baseline that is too
 * new silently delivers nothing (which is the bug this was written to fix, and
 * the shape the first implementation had), and a baseline naming an id the
 * bundle does not have silently hands one record back to an author who deleted
 * it. Neither shows up as an error anywhere. So the invariants are pinned here.
 */

const baseline = new Set(BASELINE_STAMP_IDS)

function bundleIds(): string[] {
  return (['pieces', 'squareTypes', 'ruleCards', 'skillCards', 'boards', 'presets'] as const).flatMap((c) =>
    bundledContentSource[c].map((r) => (r as { id: string }).id),
  )
}

describe('BASELINE_STAMP_IDS', () => {
  it('names only ids the bundle actually ships', () => {
    // A typo is invisible at runtime and costs an author a deletion: the id they
    // deleted is absent from the baseline, so the merge reads it as new and
    // hands it back.
    const unknown = [...baseline].filter((id) => !bundleIds().includes(id))
    expect(unknown).toEqual([])
  })

  it('has no duplicates', () => {
    expect(baseline.size).toBe(BASELINE_STAMP_IDS.length)
  })

  it('is a STRICT subset — a baseline equal to the bundle delivers nothing', () => {
    // The failure mode of the first implementation, as an assertion. Synthesising
    // the stamp from the current bundle is exactly `baseline === bundleIds()`, and
    // it makes every load a no-op while looking correct.
    const behind = bundleIds().filter((id) => !baseline.has(id))
    expect(behind.length).toBeGreaterThan(0)
    expect(baseline.size).toBeLessThan(bundleIds().length)
  })

  it('excludes the rooms whose absence was reported from the field', () => {
    // Named rather than counted. If any of these three ever enters this list the
    // reported bug is back, and no other test in this repo would say so.
    for (const id of ['preset.bastion', 'preset.cavalry', 'preset.covenant']) {
      expect(baseline.has(id)).toBe(false)
    }
  })

  it('is frozen at the size of the release it snapshots', () => {
    // A snapshot of a past release does not grow. This number changing means
    // either an id was added by hand — which would re-hide that record from every
    // install still on the baseline — or the baseline was deliberately moved
    // forward, which is a decision about resurrecting deletions and should not
    // pass silently.
    expect(BASELINE_STAMP_IDS.length).toBe(39)
  })

  it('describes a document that validates, so the merge is not skipped', () => {
    // If the baseline slice does not load, `initialSource` takes its
    // `failedToLoad` branch and returns the whole bundle — which satisfies every
    // "the record arrived" assertion without the merge ever running.
    const doc = structuredClone(bundledContentSource)
    for (const name of ['pieces', 'squareTypes', 'ruleCards', 'skillCards', 'boards', 'presets'] as const) {
      doc[name] = doc[name].filter((r) => baseline.has((r as { id: string }).id))
    }
    expect(loadContentSet(doc).ok).toBe(true)
  })

  it('delivers a backlog that is exactly the bundle minus the baseline', () => {
    // The end-to-end arithmetic, at the pure-function level: an install holding
    // the baseline and nothing else receives every record added since, and
    // nothing more.
    const doc = structuredClone(bundledContentSource)
    for (const name of ['pieces', 'squareTypes', 'ruleCards', 'skillCards', 'boards', 'presets'] as const) {
      doc[name] = doc[name].filter((r) => baseline.has((r as { id: string }).id))
    }
    const result = mergeBundled(doc, bundledContentSource, { ids: [...BASELINE_STAMP_IDS] })
    expect([...result.added].sort()).toEqual(bundleIds().filter((id) => !baseline.has(id)).sort())
    expect(loadContentSet(result.source).ok).toBe(true)
  })
})
