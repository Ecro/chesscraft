// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import React, { useState } from 'react'
import type { ContentSource } from '@content/load'
import { sliceContentSource } from '@content/sets/slice'
import { bundledContentSource } from '@content/sets/bundled'
import { stampOf } from '@content/merge'
import { importContent } from '@editor/io'
import { STAMP_KEY, STORAGE_KEY, loadStamp } from '@editor/storage'
import { Edit } from '../../src/ui/Edit'
import { initialSource } from '../../src/ui/App'

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

/**
 * The reset — the one control here that is not an inference.
 *
 * Everything else on this screen decides what a device shows from a saved
 * document and a stamp, and both are guesses about what the author meant. When
 * a guess is wrong, or a device is stuck on a catalogue that will not move,
 * there has to be one action a person can take without a developer.
 *
 * The two claims that matter are that it clears BOTH keys, and that it leaves
 * storage EMPTY rather than writing the bundle back. Writing the bundle back
 * looks identical today and diverges on the next release: a saved copy of this
 * build's bundle, carrying a stamp, receives nothing new — which is the exact
 * defect this whole feature exists to fix, re-created by its own escape hatch.
 */
describe('resetting a device to the shipped set', () => {
  function openTransfer(initial: ContentSource = sliceContentSource) {
    render(<Host initial={initial} />)
  }

  it('clears both keys and leaves storage EMPTY, not rewritten', () => {
    saveARename('임금')
    expect(localStorage.getItem(STORAGE_KEY)).not.toBeNull()
    expect(localStorage.getItem(STAMP_KEY)).not.toBeNull()
    cleanup()

    vi.spyOn(window, 'confirm').mockReturnValue(true)
    openTransfer()
    fireEvent.click(screen.getByTestId('editor-reset'))

    expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
    expect(localStorage.getItem(STAMP_KEY)).toBeNull()
  })

  it('puts the shipped set back on screen, not the document it replaced', () => {
    // The slice is a strict subset of the bundle, so "the app now holds the
    // bundle" is a claim the fixture cannot satisfy by accident.
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    openTransfer(sliceContentSource)
    fireEvent.click(screen.getByTestId('editor-reset'))

    fireEvent.click(screen.getByTestId('editor-export'))
    const shown = importContent((screen.getByTestId('editor-json') as HTMLTextAreaElement).value)
    expect(shown.ok).toBe(true)
    if (!shown.ok) return
    expect(shown.source.presets.length).toBe(bundledContentSource.presets.length)
    expect(shown.source.presets.length).toBeGreaterThan(sliceContentSource.presets.length)
  })

  it('does nothing at all when the confirm is declined', () => {
    // It destroys work a child may have spent hours on, and the export button is
    // two rows up. A mis-tap must cost nothing.
    saveARename('임금')
    const content = localStorage.getItem(STORAGE_KEY)
    const stamp = localStorage.getItem(STAMP_KEY)
    cleanup()

    vi.spyOn(window, 'confirm').mockReturnValue(false)
    openTransfer()
    fireEvent.click(screen.getByTestId('editor-reset'))

    expect(localStorage.getItem(STORAGE_KEY)).toBe(content)
    expect(localStorage.getItem(STAMP_KEY)).toBe(stamp)
  })

  it('leaves the device on the genuine first-run path afterwards', () => {
    // The point of clearing rather than rewriting: the next load must take the
    // `absent` branch. A device that reset and then reloaded gets the current
    // bundle whole, and the release after that reaches it too.
    saveARename('임금')
    cleanup()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    openTransfer()
    fireEvent.click(screen.getByTestId('editor-reset'))
    cleanup()

    const result = initialSource()
    expect(result.source).toEqual(bundledContentSource)
    expect(result.failedToLoad).toBe(false)
    expect(result.mergeFailed).toEqual([])
  })
})
