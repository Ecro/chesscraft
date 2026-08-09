// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import React, { useState } from 'react'
import type { ContentSource } from '@content/load'
import { sliceContentSource } from '@content/sets/slice'
import { bundledContentSource } from '@content/sets/bundled'
import { stampOf } from '@content/merge'
import { STAMP_KEY, STORAGE_KEY, loadStamp } from '@editor/storage'
import { Edit } from '../../src/ui/Edit'

/**
 * The stamp advances with a save, and only with one that was accepted
 * (PLAN-bundled-content-merge ADR-003, R2).
 *
 * `storage.test.ts` proves `saveStamp` in isolation; this file proves the editor
 * actually calls it, and calls it on the right side of the `ok` branch. Both
 * halves are needed — a stamp writer nothing invokes is
 * `[fail:design] built-but-not-wired`, and a writer invoked unconditionally is
 * worse than none at all: `saveContent` REFUSES on quota rather than throwing, so
 * an unconditional write leaves the stamp ahead of content that was never
 * stored, and the very record the author is looking at becomes ADR-001 row 6 —
 * "the author deleted it" — and vanishes on the next load.
 *
 * `Edit` is controlled, so the host below reproduces `App`'s half of the
 * contract; a harness that only captured `onCommit` would be testing a component
 * that does not exist (`[fail:test] harness-omits-production-wiring`).
 */

function Host({ initial }: { initial: ContentSource }) {
  const [source, setSource] = useState(initial)
  return <Edit source={source} onCommit={setSource} />
}

/** Open a bundled piece in the library and rename it — the ordinary way to save. */
function saveARename(name: string) {
  render(<Host initial={sliceContentSource} />)
  fireEvent.click(screen.getByTestId('editor-tab-library'))
  fireEvent.click(screen.getByTestId('library-open-piece.king'))
  fireEvent.change(screen.getByTestId('editor-name'), { target: { value: name } })
  fireEvent.click(screen.getByTestId('editor-save'))
}

beforeEach(() => {
  localStorage.clear()
  vi.restoreAllMocks()
})
afterEach(cleanup)

describe('the stamp and the save it accompanies', () => {
  it('records the CURRENT bundle’s ids when the save is accepted', () => {
    saveARename('임금')

    expect(localStorage.getItem(STORAGE_KEY)).not.toBeNull()
    expect(loadStamp(localStorage)).toEqual(stampOf(bundledContentSource))
    // Not the ids of the document being edited — the slice is a strict subset,
    // so stamping what was saved instead of what shipped would mark every record
    // outside the slice as "new" on the next load and re-add all of them.
    expect(loadStamp(localStorage)!.ids.length).toBeGreaterThan(
      [...sliceContentSource.pieces, ...sliceContentSource.presets].length,
    )
  })

  it('leaves the stamp untouched when the content save is refused for quota', () => {
    const stale = { ids: ['piece.king'] }
    localStorage.setItem(STAMP_KEY, JSON.stringify(stale))

    const real = Storage.prototype.setItem
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (
      this: Storage,
      key: string,
      value: string,
    ) {
      if (key === STORAGE_KEY) {
        const err = new Error('quota') as Error & { name: string }
        err.name = 'QuotaExceededError'
        throw err
      }
      real.call(this, key, value)
    })

    saveARename('임금')

    // The content did not land, so the stamp must not move: it may lag, never lead.
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
    expect(loadStamp(localStorage)).toEqual(stale)
  })
})
