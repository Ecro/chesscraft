// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import React from 'react'
import type { ContentSource } from '@content/load'
import { sliceContentSource } from '@content/sets/slice'
import { Edit } from '../../src/ui/Edit'

/**
 * PLAN Phase 9a, Phase D.5 — the window the rename repair newly opened.
 *
 * Before this phase nothing in the editor could change a record's id, so
 * `commitDraft`'s `openedId` had no caller and the whole rename path was
 * unreachable. Wiring the form to it makes a new class of input reachable for
 * the first time: **a save whose draft id differs from the id the form opened
 * on.** The e2e proves the headline case (one record survives, its text
 * follows). Two cases inside that window it cannot see are here, and the second
 * is the absent-case this repo keeps rediscovering.
 *
 * 1. A record whose keys ARE derived from its id must have them re-derived —
 *    `rekeyStrings` moves the overlay, and a `nameKey` left pointing at the old
 *    key renders a dotted key on every square the piece stands on.
 * 2. A record whose keys are NOT derived from its id — an imported set, a
 *    shipped record, anything keyed in its own namespace — must be left alone.
 *    A repair that re-derives unconditionally passes case 1 and silently
 *    re-homes case 2's text, stranding the author's original entry in the
 *    overlay where nothing can reach it. That is the same shape as
 *    `[fail:design] fix-scoped-to-the-cited-evidence`: the fix works on the
 *    input that motivated it and quietly changes the one that did not.
 */

function withForeignKeyedPiece(): ContentSource {
  const source = structuredClone(sliceContentSource) as ContentSource
  // A piece no board places and no room lists, because renaming a REFERENCED
  // record is a broken cross-reference the validator is right to refuse — that
  // is 9b's guard, and letting it fire here would hide the claim under it.
  //
  // Its keys sit in a namespace that has nothing to do with its id, which is
  // exactly what an imported set from another author looks like.
  source.pieces.push({
    id: 'piece.archer-legacy',
    nameKey: 'legacy.bowman.title',
    textKey: 'legacy.bowman.blurb',
    movement: [{ kind: 'step', vectors: [[0, 1]] }],
    effects: [],
  })
  source.strings = {
    ko: { 'legacy.bowman.title': '활잡이', 'legacy.bowman.blurb': '두 칸 떨어진 적을 쏜다' },
  }
  return source
}

/**
 * `Edit` is a CONTROLLED component — `App` feeds every committed document back
 * in as the `source` prop. The harness has to do the same, or a second save
 * from the same form runs against a document that never received the first,
 * which is not a state production can reach. (An uncontrolled mount here read
 * as passing until the stale-document guard started comparing against `source`;
 * the assertions below are unchanged.)
 */
function Host({ initial, seen }: { initial: ContentSource; seen: { value: ContentSource | null } }) {
  const [source, setSource] = React.useState(initial)
  return React.createElement(Edit, {
    source,
    onCommit: (next: ContentSource) => {
      seen.value = next
      setSource(next)
    },
  })
}

function mount(source: ContentSource) {
  const committed: { value: ContentSource | null } = { value: null }
  render(React.createElement(Host, { initial: structuredClone(source), seen: committed }))
  fireEvent.click(screen.getByTestId('editor-tab-library'))
  return committed
}

function pieceById(source: ContentSource, id: string): Record<string, unknown> | undefined {
  return source.pieces.find((p) => (p as { id?: unknown }).id === id) as Record<string, unknown> | undefined
}

afterEach(cleanup)

describe('renaming a record through the form', () => {
  it('re-derives the keys that belonged to the old id, and moves the text with them', () => {
    const committed = mount(sliceContentSource)
    fireEvent.click(screen.getByTestId('editor-new'))
    fireEvent.change(screen.getByTestId('editor-id'), { target: { value: 'piece.rabbit' } })
    fireEvent.change(screen.getByTestId('editor-name'), { target: { value: '토끼' } })
    fireEvent.change(screen.getByTestId('editor-text'), { target: { value: '콩콩 뛴다' } })
    fireEvent.click(screen.getByTestId('editor-save'))

    expect(pieceById(committed.value!, 'piece.rabbit')?.nameKey).toBe('piece.rabbit.name')

    fireEvent.change(screen.getByTestId('editor-id'), { target: { value: 'piece.bunny' } })
    fireEvent.click(screen.getByTestId('editor-save'))

    const renamed = pieceById(committed.value!, 'piece.bunny')
    expect(pieceById(committed.value!, 'piece.rabbit'), 'the old record was left behind').toBeUndefined()
    expect(renamed?.nameKey).toBe('piece.bunny.name')
    expect(renamed?.textKey).toBe('piece.bunny.text')
    // The key the record now points at is the key the text is actually under —
    // asserting the two separately is what makes this more than a string check.
    expect(committed.value!.strings?.ko?.['piece.bunny.name']).toBe('토끼')
    expect(committed.value!.strings?.ko?.['piece.bunny.text']).toBe('콩콩 뛴다')
    expect(committed.value!.strings?.ko?.['piece.rabbit.name']).toBeUndefined()
  })

  it('leaves keys that never belonged to the old id exactly where they were', () => {
    const committed = mount(withForeignKeyedPiece())
    fireEvent.click(screen.getByTestId('library-open-piece.archer-legacy'))
    // The form found the text through the record's own key, not by guessing.
    expect((screen.getByTestId('editor-name') as HTMLInputElement).value).toBe('활잡이')

    fireEvent.change(screen.getByTestId('editor-id'), { target: { value: 'piece.bowman' } })
    fireEvent.click(screen.getByTestId('editor-save'))

    const renamed = pieceById(committed.value!, 'piece.bowman')
    expect(renamed, 'the rename itself still has to work').toBeDefined()
    expect(renamed?.nameKey).toBe('legacy.bowman.title')
    expect(renamed?.textKey).toBe('legacy.bowman.blurb')
    expect(committed.value!.strings?.ko?.['legacy.bowman.title']).toBe('활잡이')
    // And nothing was stranded under a freshly-invented key.
    expect(committed.value!.strings?.ko?.['piece.bowman.name']).toBeUndefined()
  })

  it('writes a shipped record name onto the key the record already carries', () => {
    // The absent-case's twin, and the whole point of ADR-020: renaming a
    // BUNDLED piece has to override the shipped text at the shipped key, not
    // shadow it from a parallel one — otherwise `missingKeys` would see a set
    // whose records point at keys nothing in the overlay answers.
    const committed = mount(sliceContentSource)
    fireEvent.click(screen.getByTestId('library-open-piece.king'))
    fireEvent.change(screen.getByTestId('editor-name'), { target: { value: '임금님' } })
    fireEvent.click(screen.getByTestId('editor-save'))

    expect(pieceById(committed.value!, 'piece.king')?.nameKey).toBe('piece.king.name')
    expect(committed.value!.strings?.ko?.['piece.king.name']).toBe('임금님')
  })
})
