// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { type ContentSource, loadContentSet } from '@content/load'
import { bundledContentSource } from '@content/sets/bundled'
import { stampOf } from '@content/merge'
import { type DraftKind, deleteRecord } from '@editor/draft'
import { roomsReferencing } from '@editor/references'
import { saveContent, saveStamp } from '@editor/storage'
import { initialSource } from '@ui/App'

/**
 * The field report, replayed (PLAN-bundled-content-merge Phase 4).
 *
 * Reported as: *"new maps show up on a fresh install but not on one I already
 * had."* This is the only test in the unit suite that would have FAILED before
 * the fix, and it is therefore the regression gate — everything else pins a
 * property of the merge, while this pins the symptom a person actually saw.
 *
 * "An install that already had it" is built the way one really exists: content
 * saved through `saveContent` under an EARLIER bundle, with the stamp that build
 * would have written, and then loaded through `initialSource` against the bundle
 * this build ships. Nothing is faked between those two ends.
 *
 * The mirror matters as much as the upgrade. A merge that delivers new rooms by
 * resurrecting deleted ones has not fixed anything — it has traded a complaint
 * about missing content for one about content the child threw away coming back.
 */

const KINDS: Array<[DraftKind, keyof ContentSource & ('pieces' | 'squareTypes' | 'ruleCards' | 'skillCards' | 'boards')]> =
  [
    ['piece', 'pieces'],
    ['squareType', 'squareTypes'],
    ['ruleCard', 'ruleCards'],
    ['skillCard', 'skillCards'],
    ['board', 'boards'],
  ]

/**
 * The bundle as of an earlier release: today's set minus some rooms, minus
 * everything only those rooms reached.
 *
 * The orphan prune is not tidiness, it is what makes the fixture a real earlier
 * release: a shipped set has no record no room can reach. Removing rooms and
 * leaving their cards behind would ALSO have worked for the assertions below, but
 * removing cards other rooms still name produces a document that does not
 * validate — and an invalid document takes `initialSource`'s `failedToLoad`
 * branch, which returns the whole bundle and makes every "the record is present"
 * assertion pass without any merge running at all. The first draft of this file
 * did exactly that and one test passed against the PRE-FIX code.
 */
function releaseWithoutRooms(rooms: string[]): { source: ContentSource; dropped: string[] } {
  const gone = new Set(rooms)
  const next = structuredClone(bundledContentSource) as ContentSource
  next.presets = next.presets.filter((r) => !gone.has((r as { id: string }).id))

  const dropped = [...rooms]
  for (const [kind, collection] of KINDS) {
    next[collection] = next[collection].filter((record) => {
      const id = (record as { id: string }).id
      if (roomsReferencing(next, kind, id).length > 0) return true
      dropped.push(id)
      return false
    })
  }
  // The guard the first draft lacked. A fixture that does not validate proves
  // nothing about the merge, because the merge never runs on it.
  expect(loadContentSet(next).ok).toBe(true)
  return { source: next, dropped }
}

/** What the author's browser holds after one save under `release`. */
function anInstallThatSavedUnder(release: ContentSource, saved: ContentSource = release) {
  expect(saveContent(localStorage, saved)).toEqual({ ok: true })
  saveStamp(localStorage, stampOf(release))
}

function ids(list: unknown[]): string[] {
  return list.map((r) => (r as { id: string }).id)
}

// Two rooms this release ships that the earlier one did not. Presets are the
// deliberate choice for the deletion mirror below — `roomsReferencing` returns []
// for presets alone, so every other kind is reachable from one of the shipped
// rooms and cannot be deleted in a single step.
const NEW_THIS_RELEASE = ['preset.covenant', 'preset.cavalry']

beforeEach(() => localStorage.clear())

describe('an install that already saved, upgrading', () => {
  it('receives the rooms this release added, and everything only they reach', () => {
    // A room is not playable on its own, so the upgrade has to deliver the whole
    // reachable set — the board it plays on, the pieces that stand on it, the
    // cards it offers — or the merged document would not validate at all.
    const { source: earlier, dropped } = releaseWithoutRooms(NEW_THIS_RELEASE)
    // The premise, asserted rather than assumed: the document in storage really
    // does lack all of it, so "present afterwards" cannot be vacuous. Its size is
    // asserted too, because a prune that removed nothing would satisfy the rest.
    expect(dropped.length).toBeGreaterThan(NEW_THIS_RELEASE.length)
    anInstallThatSavedUnder(earlier)

    const result = initialSource()

    const present = new Set(
      (['pieces', 'squareTypes', 'ruleCards', 'skillCards', 'boards', 'presets'] as const).flatMap((c) =>
        ids(result.source[c]),
      ),
    )
    for (const id of dropped) expect(present).toContain(id)
    expect(result.mergeFailed).toEqual([])
    expect(result.failedToLoad).toBe(false)
    expect(loadContentSet(result.source).ok).toBe(true)
  })

  it('leaves a room the author deleted deleted, while still adding the new ones', () => {
    // Both halves in one load, because that is the real state of a browser that
    // has been played in: something thrown away AND something not yet seen.
    const { source: earlier } = releaseWithoutRooms(NEW_THIS_RELEASE)
    const deleted = deleteRecord(earlier, 'preset', 'preset.bastion')
    if (!deleted.ok) {
      expect.fail(`the fixture cannot delete a room: ${deleted.reason}`)
      return
    }
    anInstallThatSavedUnder(earlier, deleted.source)

    const result = initialSource()

    expect(ids(result.source.presets)).not.toContain('preset.bastion')
    for (const id of NEW_THIS_RELEASE) expect(ids(result.source.presets)).toContain(id)
    expect(loadContentSet(result.source).ok).toBe(true)
  })

  it('stays put on a second load — the merge does not undo itself', () => {
    // R1, as a behaviour rather than an argument. A load-time stamp write would
    // put this release's additions in the stamp and not in the saved document, so
    // the NEXT load would read them as records the author had deleted and drop
    // them. The first version of this design shipped exactly that, and it worked
    // once per session.
    anInstallThatSavedUnder(releaseWithoutRooms(NEW_THIS_RELEASE).source)

    const first = initialSource()
    const second = initialSource()

    expect(ids(second.source.presets)).toEqual(ids(first.source.presets))
    for (const id of NEW_THIS_RELEASE) expect(ids(second.source.presets)).toContain(id)
  })

  it('adds nothing when the install is already current', () => {
    anInstallThatSavedUnder(bundledContentSource)
    const result = initialSource()
    expect(result.source).toEqual(bundledContentSource)
    expect(result.mergeFailed).toEqual([])
  })
})
