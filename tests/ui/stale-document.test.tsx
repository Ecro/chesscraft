// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import React, { useState } from 'react'
import type { ContentSource } from '@content/load'
import { sliceContentSource } from '@content/sets/slice'
import { Edit } from '../../src/ui/Edit'

/**
 * Phase 9a review, P0 — a form that outlived the document it was opened against.
 *
 * The editor's transfer controls exist for the export → edit → re-import round
 * trip, and an import replaces the WHOLE document. Nothing remounts an already-
 * open form when that happens: the form snapshots its draft at mount but reads
 * `source` live at save time, so `commitDraft` matched the stale `openedId`
 * against the new list and overwrote a record this form had never seen — while
 * both the import and the save reported success. The imported edit vanished
 * with no error anywhere, and the whole suite stayed green because nothing
 * exercised "import while a form is open".
 *
 * The guard compares the record against the snapshot the form opened with and
 * refuses. Refusing rather than remounting is deliberate: remounting on every
 * document change would throw away a half-typed edit, trading one silent loss
 * for another.
 */

/** `App`'s half of the contract: `Edit` is controlled, so the test must own the source. */
function Host({ initial }: { initial: ContentSource }) {
  const [source, setSource] = useState(initial)
  return <Edit source={source} onCommit={setSource} />
}

/** A document identical to the slice except for one piece's name key. */
function importedSource(): ContentSource {
  const next = structuredClone(sliceContentSource) as ContentSource
  next.strings = { ko: { 'piece.king.name': '가져온 임금님' } }
  return next
}

function mount(initial: ContentSource) {
  render(<Host initial={initial} />)
  fireEvent.click(screen.getByTestId('editor-tab-library'))
}

afterEach(cleanup)

describe('a form that outlived its document', () => {
  it('refuses to save an open record over a document that was imported under it', () => {
    mount(sliceContentSource)
    fireEvent.click(screen.getByTestId('library-open-piece.king'))
    expect((screen.getByTestId('editor-name') as HTMLInputElement).value).toBe('')

    // The round trip the transfer controls are for. Nothing remounts the form.
    fireEvent.change(screen.getByTestId('editor-json'), {
      target: { value: JSON.stringify(importedSource()) },
    })
    fireEvent.click(screen.getByTestId('editor-import'))
    expect(screen.queryByTestId('editor-errors')).toBeNull()

    fireEvent.click(screen.getByTestId('editor-save'))

    // Refused, and said so. Before the guard this save reported success.
    expect(screen.getByTestId('editor-errors').textContent ?? '').not.toBe('')
    expect(screen.queryByTestId('editor-saved')).toBeNull()
    // And the assertion that actually matters: the imported text survived.
    // A guard that merely showed a message while still committing would pass
    // the two above and fail this one.
    fireEvent.click(screen.getByTestId('library-open-piece.king'))
    expect((screen.getByTestId('editor-name') as HTMLInputElement).value).toBe('가져온 임금님')
  })

  it('refuses a room whose document was replaced under it', () => {
    render(<Host initial={structuredClone(sliceContentSource)} />)
    fireEvent.click(screen.getByTestId('room-open-preset.slice'))

    const replaced = structuredClone(sliceContentSource) as ContentSource
    ;(replaced.presets[0] as Record<string, unknown>).ruleCardIds = []
    fireEvent.change(screen.getByTestId('editor-json'), {
      target: { value: JSON.stringify(replaced) },
    })
    fireEvent.click(screen.getByTestId('editor-import'))

    fireEvent.click(screen.getByTestId('room-save'))
    expect(screen.getByTestId('room-errors').textContent ?? '').not.toBe('')
    expect(screen.queryByTestId('room-saved')).toBeNull()
  })

  it('still allows two saves in a row from the same form', () => {
    // The snapshot has to move forward with each save, or the guard fires on a
    // form's own second save and the editor becomes unusable — the obvious way
    // to get this fix wrong, and one no import-shaped test would catch.
    mount(sliceContentSource)
    fireEvent.click(screen.getByTestId('editor-new'))
    fireEvent.change(screen.getByTestId('editor-id'), { target: { value: 'piece.rabbit' } })
    fireEvent.change(screen.getByTestId('editor-name'), { target: { value: '토끼' } })
    fireEvent.change(screen.getByTestId('editor-text'), { target: { value: '콩콩 뛴다' } })
    fireEvent.click(screen.getByTestId('editor-save'))
    expect(screen.queryByTestId('editor-errors')).toBeNull()

    fireEvent.change(screen.getByTestId('editor-name'), { target: { value: '토끼 두번째' } })
    fireEvent.click(screen.getByTestId('editor-save'))
    expect(screen.queryByTestId('editor-errors')).toBeNull()
    expect(screen.getByTestId('editor-saved')).toBeTruthy()
  })
})
