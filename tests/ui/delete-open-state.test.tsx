// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import React, { useState } from 'react'
import type { ContentSource } from '@content/load'
import { sliceContentSource } from '@content/sets/slice'
import { Edit } from '../../src/ui/Edit'
import { TranslateContext, makeTranslate } from '../../src/ui/i18n'

/**
 * Phase 9b review — what an open editor screen does when the document loses the
 * thing it is showing.
 *
 * All seven findings of that review were faces of one question. Phase 9a had
 * already answered the SAVE half — a form whose record moved underneath it
 * refuses, and says the document moved — and 9b added an operation that can make
 * that true while answering nothing about the DISPLAY half. So a child could be
 * left editing a record they had just deleted, and learn about it from a
 * staleness message on their next save that described an import race rather than
 * their own deletion.
 *
 * These are the cases that answer the display half. Every one of them was
 * reachable and caught by nothing: the whole suite was green, and no test
 * anywhere had a form or a room open while a delete happened.
 */

function Host({ initial }: { initial: ContentSource }) {
  const [source, setSource] = useState(initial)
  return (
    <TranslateContext.Provider value={makeTranslate(source.strings)}>
      <Edit source={source} onCommit={setSource} />
    </TranslateContext.Provider>
  )
}

function mount(initial: ContentSource = sliceContentSource) {
  render(<Host initial={structuredClone(initial)} />)
}

/** A second room, so the last-room guard is not what refuses these deletes. */
function twoRooms(): ContentSource {
  const source = structuredClone(sliceContentSource) as ContentSource
  source.presets.push({
    id: 'preset.spare',
    nameKey: 'preset.spare.name',
    boardId: 'board.slice',
    pieceIds: ['piece.king'],
    ruleCardIds: [],
    skillCardIds: [],
  })
  source.strings = { ko: { 'preset.spare.name': '남는 방' } }
  return source
}

const accept = () => vi.spyOn(window, 'confirm').mockReturnValue(true)

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('deleting the record a form is holding', () => {
  it('closes the form even when it was created and saved without navigating', () => {
    // The shell's `open.id` stays null after the new-record button, so a check
    // against it reads a record created AND saved through that button as blank
    // and never closes the form. The id the FORM holds is what decides.
    accept()
    mount()
    fireEvent.click(screen.getByTestId('editor-tab-library'))
    fireEvent.click(screen.getByTestId('editor-new'))
    fireEvent.change(screen.getByTestId('editor-id'), { target: { value: 'piece.rabbit' } })
    fireEvent.change(screen.getByTestId('editor-name'), { target: { value: '토끼' } })
    fireEvent.change(screen.getByTestId('editor-text'), { target: { value: '콩콩' } })
    fireEvent.click(screen.getByTestId('editor-save'))
    expect(screen.queryByTestId('editor-errors')).toBeNull()

    fireEvent.click(screen.getByTestId('library-delete-piece.rabbit'))

    expect(screen.queryByTestId('library-open-piece.rabbit')).toBeNull()
    // A blank form, not the deleted record still sitting there editable.
    expect((screen.getByTestId('editor-id') as HTMLInputElement).value).toBe('')
    expect(screen.queryByTestId('editor-deleted-notice')).toBeNull()
  })

  it('does not ask about discarding the very edits it is deleting', () => {
    // "Yes, delete" followed by "no, keep my edits" used to delete the record AND
    // leave the form on it — the delete was committed before the question was
    // asked, and the answer was thrown away. There is nothing to discard when the
    // record itself is going, so the question must not be asked at all.
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    mount()
    fireEvent.click(screen.getByTestId('editor-tab-library'))
    // A record no room uses, so it is the DISCARD prompt under test here and not
    // the reference guard.
    fireEvent.click(screen.getByTestId('editor-new'))
    fireEvent.change(screen.getByTestId('editor-id'), { target: { value: 'piece.rabbit' } })
    fireEvent.change(screen.getByTestId('editor-name'), { target: { value: '토끼' } })
    fireEvent.change(screen.getByTestId('editor-text'), { target: { value: '콩콩' } })
    fireEvent.click(screen.getByTestId('editor-save'))
    confirm.mockClear()

    // Now make it dirty again, so a discard prompt WOULD fire on any other route.
    fireEvent.change(screen.getByTestId('editor-name'), { target: { value: '고치던 이름' } })
    fireEvent.click(screen.getByTestId('library-delete-piece.rabbit'))

    // Exactly one prompt: the delete confirm. Not a second one about the buffer.
    expect(confirm).toHaveBeenCalledOnce()
    expect(screen.queryByTestId('library-open-piece.rabbit')).toBeNull()
    expect((screen.getByTestId('editor-id') as HTMLInputElement).value).toBe('')
  })

  it('tells a form whose record was deleted from the other panel, and stops its save', () => {
    accept()
    mount(twoRooms())
    // Open a room in the Rooms tab, then delete it from the library's kind picker.
    fireEvent.click(screen.getByTestId('room-open-preset.spare'))
    // The room builder opens on the paint step now; the pieces this room
    // uses live behind the second one.
    fireEvent.click(screen.getByTestId('room-step-pieces'))
    fireEvent.click(screen.getByTestId('editor-tab-library'))
    fireEvent.change(screen.getByTestId('editor-kind'), { target: { value: 'preset' } })
    fireEvent.click(screen.getByTestId('library-delete-preset.spare'))

    fireEvent.click(screen.getByTestId('editor-tab-rooms'))
    // Said at the moment it became true, on the screen it is true of — not as a
    // generic staleness error on the next save.
    expect(screen.getByTestId('room-deleted-notice')).toBeTruthy()
    expect(screen.getByTestId('room-save')).toHaveProperty('disabled', true)
  })
})

describe('an unsaved room draft holding a record that was deleted', () => {
  it('keeps a control that can remove it, so the room is still saveable', () => {
    // The delete itself is correct — no COMMITTED room referenced the piece, and
    // `roomsReferencing` reads the committed document by design. What was wrong
    // is what the room was left with: an id in its draft, no checkbox for it, and
    // a save that fails validation with no way to act on it.
    accept()
    mount()
    fireEvent.click(screen.getByTestId('editor-tab-library'))
    fireEvent.click(screen.getByTestId('editor-new'))
    fireEvent.change(screen.getByTestId('editor-id'), { target: { value: 'piece.rabbit' } })
    fireEvent.change(screen.getByTestId('editor-name'), { target: { value: '토끼' } })
    fireEvent.change(screen.getByTestId('editor-text'), { target: { value: '콩콩' } })
    fireEvent.click(screen.getByTestId('editor-save'))

    // Tick it into a room WITHOUT saving the room.
    fireEvent.click(screen.getByTestId('editor-tab-rooms'))
    fireEvent.click(screen.getByTestId('room-open-preset.slice'))
    // The room builder opens on the paint step now; the pieces this room
    // uses live behind the second one.
    fireEvent.click(screen.getByTestId('room-step-pieces'))
    fireEvent.click(screen.getByTestId('room-piece-piece.rabbit'))

    // Delete it from the library. No committed room references it, so this is allowed.
    fireEvent.click(screen.getByTestId('editor-tab-library'))
    fireEvent.click(screen.getByTestId('library-delete-piece.rabbit'))
    expect(screen.queryByTestId('library-open-piece.rabbit')).toBeNull()

    // Back in the room, the row survives purely so it can be unticked.
    fireEvent.click(screen.getByTestId('editor-tab-rooms'))
    const ghost = screen.getByTestId('room-piece-piece.rabbit')
    // A pressed toggle rather than a checkbox since the builder was rebuilt.
    // Asserted through `aria-pressed`, which is what the state IS now — reading
    // `.checked` off a `<button>` yields undefined, and `toHaveProperty` would
    // happily have passed against `undefined` if this had been written loosely.
    expect(ghost.getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(ghost)
    fireEvent.click(screen.getByTestId('room-save'))
    expect(screen.queryByTestId('room-errors')).toBeNull()
    expect(screen.getByTestId('room-saved')).toBeTruthy()
  })
})

describe('a refusal that has stopped being true', () => {
  it('disappears once the room that was holding the record lets go', () => {
    // Stored as a SENTENCE, the refusal was a fact frozen when it was true; both
    // panels stay mounted, so freeing the record in the Rooms tab left the
    // library still naming a room that had already let go.
    accept()
    mount()
    fireEvent.click(screen.getByTestId('editor-tab-library'))
    fireEvent.click(screen.getByTestId('editor-new'))
    fireEvent.change(screen.getByTestId('editor-id'), { target: { value: 'piece.rabbit' } })
    fireEvent.change(screen.getByTestId('editor-name'), { target: { value: '토끼' } })
    fireEvent.change(screen.getByTestId('editor-text'), { target: { value: '콩콩' } })
    fireEvent.click(screen.getByTestId('editor-save'))

    fireEvent.click(screen.getByTestId('editor-tab-rooms'))
    fireEvent.click(screen.getByTestId('room-open-preset.slice'))
    // The room builder opens on the paint step now; the pieces this room
    // uses live behind the second one.
    fireEvent.click(screen.getByTestId('room-step-pieces'))
    fireEvent.click(screen.getByTestId('room-piece-piece.rabbit'))
    fireEvent.click(screen.getByTestId('room-save'))

    fireEvent.click(screen.getByTestId('editor-tab-library'))
    fireEvent.click(screen.getByTestId('library-delete-piece.rabbit'))
    expect(screen.getByTestId('library-delete-refusal').textContent ?? '').toContain('봉화 쟁탈전')

    // Free it where the refusal said it was held.
    fireEvent.click(screen.getByTestId('editor-tab-rooms'))
    fireEvent.click(screen.getByTestId('room-piece-piece.rabbit'))
    fireEvent.click(screen.getByTestId('room-save'))

    fireEvent.click(screen.getByTestId('editor-tab-library'))
    expect(screen.queryByTestId('library-delete-refusal')).toBeNull()
  })
})
