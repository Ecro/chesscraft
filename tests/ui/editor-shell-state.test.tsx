// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import React, { useState } from 'react'
import type { ContentSource } from '@content/load'
import { sliceContentSource } from '@content/sets/slice'
import { ko } from '../../src/i18n/ko'
import { Edit } from '../../src/ui/Edit'
import { TranslateContext, makeTranslate } from '../../src/ui/i18n'

/**
 * Phase 9a review, the four findings that survived round 2 as `manual-only`.
 *
 * Three of them are the same mistake at three scales: the editor treated an
 * absent or unchanged value as "nothing to do" and did it silently. A cleared
 * name was read as no name given; an untouched text field was read as text to
 * write; a tab switch was read as no reason to reconsider what is on screen.
 * The fourth — a room's shortcut discarding the library's buffer — is the
 * shell's own invariant applied to one panel and withheld from the other.
 *
 * Every case here was reachable before the fix and caught by nothing: the
 * `room-new-*` buttons had no test of any kind, and no test anywhere cleared an
 * editor text field.
 */

/**
 * `App`'s half of the contract, both halves of it: `Edit` is controlled, AND the
 * document's own `strings` overlay is what resolves every player-facing key
 * (ADR-020). A harness that skips the provider gets the bundle-only resolver, so
 * every authored name falls back to its id and an assertion about what the child
 * READS silently measures nothing.
 */
function Host({ initial }: { initial: ContentSource }) {
  const [source, setSource] = useState(initial)
  const t = makeTranslate(source.strings)
  return (
    <TranslateContext.Provider value={t}>
      <Edit source={source} onCommit={setSource} />
    </TranslateContext.Provider>
  )
}

function mount(initial: ContentSource = sliceContentSource) {
  render(<Host initial={structuredClone(initial)} />)
}

function library() {
  fireEvent.click(screen.getByTestId('editor-tab-library'))
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe("a room's shortcut and the library's unsaved buffer", () => {
  it('asks before discarding a dirty library form, and keeps it when refused', () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    mount()
    library()
    fireEvent.click(screen.getByTestId('library-open-piece.king'))
    fireEvent.change(screen.getByTestId('editor-name'), { target: { value: '반쯤 쓴 이름' } })

    fireEvent.click(screen.getByTestId('editor-tab-rooms'))
    fireEvent.click(screen.getByTestId('room-open-preset.slice'))
    // The room builder opens on the paint step now; the pieces this room
    // uses live behind the second one.
    fireEvent.click(screen.getByTestId('room-step-pieces'))
    fireEvent.click(screen.getByTestId('room-new-piece'))

    expect(confirm).toHaveBeenCalledOnce()
    // Refused, so nothing was destroyed AND nothing moved — the author is still
    // in the room they were in.
    expect(screen.getByTestId('editor-tab-rooms').getAttribute('data-selected')).toBe('true')
    library()
    expect((screen.getByTestId('editor-name') as HTMLInputElement).value).toBe('반쯤 쓴 이름')
  })

  it('discards it only when the author says so', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    mount()
    library()
    fireEvent.click(screen.getByTestId('library-open-piece.king'))
    fireEvent.change(screen.getByTestId('editor-name'), { target: { value: '반쯤 쓴 이름' } })

    fireEvent.click(screen.getByTestId('editor-tab-rooms'))
    fireEvent.click(screen.getByTestId('room-open-preset.slice'))
    // The room builder opens on the paint step now; the pieces this room
    // uses live behind the second one.
    fireEvent.click(screen.getByTestId('room-step-pieces'))
    fireEvent.click(screen.getByTestId('room-new-piece'))

    expect(screen.getByTestId('editor-tab-library').getAttribute('data-selected')).toBe('true')
    expect((screen.getByTestId('editor-name') as HTMLInputElement).value).toBe('')
  })

  it('stops asking once the form has been saved', () => {
    // The dirty flag has to fall as well as rise. A one-way latch passes every
    // discard test above and then prompts after every successful save, which is
    // how a guard teaches the author to click through it.
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    mount()
    library()
    fireEvent.click(screen.getByTestId('library-open-piece.king'))
    fireEvent.change(screen.getByTestId('editor-name'), { target: { value: '임금님' } })
    fireEvent.click(screen.getByTestId('editor-save'))
    expect(screen.queryByTestId('editor-errors')).toBeNull()

    fireEvent.click(screen.getByTestId('editor-tab-rooms'))
    fireEvent.click(screen.getByTestId('room-open-preset.slice'))
    // The room builder opens on the paint step now; the pieces this room
    // uses live behind the second one.
    fireEvent.click(screen.getByTestId('room-step-pieces'))
    // The rule and skill pools live behind the cards step.
    fireEvent.click(screen.getByTestId('room-step-cards'))
    fireEvent.click(screen.getByTestId('room-new-rule'))

    expect(confirm).not.toHaveBeenCalled()
  })

  it('gives the room a blank form even when the library saved a record through its own new button', () => {
    // The shell's `library.id` stays null after the library's own new-record
    // button, so a record created AND saved there still reads as "blank" to any
    // heuristic that trusts that field. A shortcut that skipped the remount on
    // that basis would hand the author their previous record back — and the
    // next save would overwrite it instead of creating what the room asked for.
    mount()
    library()
    fireEvent.change(screen.getByTestId('editor-kind'), { target: { value: 'ruleCard' } })
    fireEvent.click(screen.getByTestId('editor-new'))
    fireEvent.change(screen.getByTestId('editor-id'), { target: { value: 'rule.first' } })
    fireEvent.change(screen.getByTestId('editor-name'), { target: { value: '첫 규칙' } })
    fireEvent.change(screen.getByTestId('editor-text'), { target: { value: '설명' } })
    fireEvent.change(screen.getByTestId('editor-cost'), { target: { value: '1' } })
    fireEvent.click(screen.getByTestId('editor-add-effect'))
    fireEvent.click(screen.getByTestId('vocab-trigger-end_of_ply'))
    fireEvent.click(screen.getByTestId('vocab-action-win'))
    fireEvent.click(screen.getByTestId('editor-save'))
    expect(screen.queryByTestId('editor-errors')).toBeNull()

    fireEvent.click(screen.getByTestId('editor-tab-rooms'))
    fireEvent.click(screen.getByTestId('room-open-preset.slice'))
    // The room builder opens on the paint step now; the pieces this room
    // uses live behind the second one.
    fireEvent.click(screen.getByTestId('room-step-pieces'))
    // The rule and skill pools live behind the cards step.
    fireEvent.click(screen.getByTestId('room-step-cards'))
    fireEvent.click(screen.getByTestId('room-new-rule'))

    // Blank, not the record just saved.
    expect((screen.getByTestId('editor-id') as HTMLInputElement).value).toBe('')
    expect((screen.getByTestId('editor-name') as HTMLInputElement).value).toBe('')
    // And the saved one is still there, untouched.
    expect(screen.getByTestId('library-open-rule.first').textContent).toBe('첫 규칙')
  })

  it("guards the library's own navigation too, not just the room's shortcut", () => {
    // The author's ordinary way to leave a half-typed record is to click the
    // next one — the most travelled of the four remount paths, and the one a
    // guard bolted onto the room's shortcut leaves wide open.
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    mount()
    library()
    fireEvent.click(screen.getByTestId('library-open-piece.king'))
    fireEvent.change(screen.getByTestId('editor-name'), { target: { value: '반쯤 쓴 이름' } })

    fireEvent.click(screen.getByTestId('library-open-piece.archer'))
    expect(confirm).toHaveBeenCalledOnce()
    expect((screen.getByTestId('editor-name') as HTMLInputElement).value).toBe('반쯤 쓴 이름')

    fireEvent.change(screen.getByTestId('editor-kind'), { target: { value: 'ruleCard' } })
    expect(screen.getByTestId('editor-kind')).toHaveProperty('value', 'piece')
    expect((screen.getByTestId('editor-name') as HTMLInputElement).value).toBe('반쯤 쓴 이름')

    fireEvent.click(screen.getByTestId('editor-new'))
    expect((screen.getByTestId('editor-name') as HTMLInputElement).value).toBe('반쯤 쓴 이름')
    expect(confirm).toHaveBeenCalledTimes(3)
  })

  it('does not ask when the library form is untouched', () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    mount()
    fireEvent.click(screen.getByTestId('room-open-preset.slice'))
    // The room builder opens on the paint step now; the pieces this room
    // uses live behind the second one.
    fireEvent.click(screen.getByTestId('room-step-pieces'))
    // The rule and skill pools live behind the cards step.
    fireEvent.click(screen.getByTestId('room-step-cards'))
    fireEvent.click(screen.getByTestId('room-new-rule'))

    // Nothing was at stake, so nothing was asked. A guard that prompts on every
    // press teaches the author to click through it.
    expect(confirm).not.toHaveBeenCalled()
    expect(screen.getByTestId('editor-kind')).toHaveProperty('value', 'ruleCard')
  })
})

describe('the shared error channel', () => {
  it('does not follow the author to the other tab', () => {
    mount()
    library()
    fireEvent.click(screen.getByTestId('editor-new'))
    // A blank record cannot save: its id and keys are empty.
    fireEvent.click(screen.getByTestId('editor-save'))
    expect(screen.getByTestId('editor-errors')).toBeTruthy()

    fireEvent.click(screen.getByTestId('editor-tab-rooms'))
    // The list renders at shell level, outside both hidden panels, so leaving it
    // up would describe a field the Rooms tab does not contain.
    expect(screen.queryByTestId('editor-errors')).toBeNull()
  })
})

describe('clearing text an author typed', () => {
  it('takes back a name given to a shipped record, restoring the bundled one', () => {
    mount()
    library()
    fireEvent.click(screen.getByTestId('library-open-piece.king'))
    fireEvent.change(screen.getByTestId('editor-name'), { target: { value: '임금님' } })
    fireEvent.click(screen.getByTestId('editor-save'))
    expect(screen.queryByTestId('editor-errors')).toBeNull()

    fireEvent.change(screen.getByTestId('editor-name'), { target: { value: '' } })
    fireEvent.click(screen.getByTestId('editor-save'))
    expect(screen.queryByTestId('editor-errors')).toBeNull()

    // The overlay entry is gone, so the shipped text answers again — which is
    // what "clear the name I gave it" has to mean. Before the fix the save was
    // a silent no-op and the screen still said 임금님.
    fireEvent.click(screen.getByTestId('library-open-piece.king'))
    expect((screen.getByTestId('editor-name') as HTMLInputElement).value).toBe('')
    expect(screen.getByTestId('library-open-piece.king').textContent).toBe(ko['piece.king.name'])
  })

  it('refuses to leave a record the author invented with no name at all', () => {
    mount()
    library()
    fireEvent.click(screen.getByTestId('editor-new'))
    fireEvent.change(screen.getByTestId('editor-id'), { target: { value: 'piece.rabbit' } })
    fireEvent.change(screen.getByTestId('editor-name'), { target: { value: '토끼' } })
    fireEvent.change(screen.getByTestId('editor-text'), { target: { value: '콩콩 뛴다' } })
    fireEvent.click(screen.getByTestId('editor-save'))
    expect(screen.queryByTestId('editor-errors')).toBeNull()

    fireEvent.change(screen.getByTestId('editor-name'), { target: { value: '' } })
    fireEvent.click(screen.getByTestId('editor-save'))

    // Nothing underneath to fall back to: dropping the entry would paint
    // `piece.rabbit.name` across every square the piece stands on.
    expect(screen.getByTestId('editor-field-error-nameKey')).toBeTruthy()
    expect(screen.queryByTestId('editor-saved')).toBeNull()
    expect(screen.getByTestId('library-open-piece.rabbit').textContent).toBe('토끼')
  })
})

describe('editing a raw key under the advanced disclosure', () => {
  it('re-points the record without dragging its old text onto the destination', () => {
    // Two records deliberately share one key, which is the state an imported
    // set arrives in and the reason this path exists at all.
    const source = structuredClone(sliceContentSource) as ContentSource
    source.pieces.push(
      { id: 'piece.one', nameKey: 'shared.name', textKey: 'shared.text', movement: [{ kind: 'step', vectors: [[0, 1]] }], effects: [] },
      { id: 'piece.two', nameKey: 'other.name', textKey: 'other.text', movement: [{ kind: 'step', vectors: [[0, 1]] }], effects: [] },
    )
    source.strings = {
      ko: { 'shared.name': '하나', 'shared.text': '설명 하나', 'other.name': '둘', 'other.text': '설명 둘' },
    }
    mount(source)
    library()
    fireEvent.click(screen.getByTestId('library-open-piece.one'))
    expect((screen.getByTestId('editor-name') as HTMLInputElement).value).toBe('하나')

    // Change ONLY the key. The visible field still shows the old key's text —
    // which the save used to write straight over the destination.
    fireEvent.change(screen.getByTestId('editor-nameKey'), { target: { value: 'other.name' } })
    fireEvent.click(screen.getByTestId('editor-save'))
    expect(screen.queryByTestId('editor-errors')).toBeNull()

    // `piece.two` still says what it said. Before the fix it said 하나.
    expect(screen.getByTestId('library-open-piece.two').textContent).toBe('둘')
    expect(screen.getByTestId('library-open-piece.one').textContent).toBe('둘')
  })
})
