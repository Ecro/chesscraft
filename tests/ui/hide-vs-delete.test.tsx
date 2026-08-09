// @vitest-environment jsdom
import { useState } from 'react'
import { fireEvent, render, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { type ContentSource, loadContentSet } from '@content/load'
import { HIDDEN_KEY, loadHidden } from '@editor/hidden'
import { Edit } from '../../src/ui/Edit'

/**
 * PLAN-content-provenance-and-room-delete Phase 4 / ADR-004 — official content
 * is hidden, never deleted; authored content is deleted, never hidden.
 *
 * Mounted through `Edit` rather than through the panels, because the thing under
 * test is a decision that spans three files: the shell owns the hidden set, the
 * panels choose which control to draw, and `canHide` owns the rule. A test that
 * mounted `EditorRooms` with a hand-passed `hidden` prop would prove the panel
 * renders what it is told and nothing about what it is told.
 *
 * The bundle is INJECTED rather than imported, so "official" means the two
 * records this fixture calls official — not whatever the shipped catalogue
 * happens to contain today. A test keyed to the real bundle would change
 * meaning every time content ships.
 */

function officialBundle(): ContentSource {
  return {
    schemaVersion: 10,
    strings: {
      ko: {
        'piece.ours.name': '우리 기물',
        'piece.ours.text': '한 칸 간다.',
        'preset.ours.name': '우리 방',
        'preset.spare.name': '남는 방',
        'board.ours.name': '우리 판',
      },
    },
    pieces: [
      {
        id: 'piece.ours',
        nameKey: 'piece.ours.name',
        textKey: 'piece.ours.text',
        effects: [],
        movement: [{ kind: 'step', vectors: [[0, 1]] }],
      },
    ],
    squareTypes: [],
    ruleCards: [],
    skillCards: [],
    boards: [
      {
        id: 'board.ours',
        nameKey: 'board.ours.name',
        width: 4,
        height: 4,
        placements: [{ square: 'a1', pieceId: 'piece.ours', side: 'white' }],
        squares: [],
      },
    ],
    presets: [
      { id: 'preset.ours', nameKey: 'preset.ours.name', boardId: 'board.ours', pieceIds: ['piece.ours'], ruleCardIds: [], skillCardIds: [] },
      { id: 'preset.spare', nameKey: 'preset.spare.name', boardId: 'board.ours', pieceIds: ['piece.ours'], ruleCardIds: [], skillCardIds: [] },
    ],
  }
}

/** The bundle plus a room and a piece the child made. */
function authoredSource(): ContentSource {
  const source = officialBundle()
  source.strings!['ko']!['piece.mine.name'] = '내 기물'
  source.strings!['ko']!['piece.mine.text'] = '한 칸 간다.'
  source.strings!['ko']!['preset.mine.name'] = '내 방'
  source.pieces.push({
    id: 'piece.mine',
    nameKey: 'piece.mine.name',
    textKey: 'piece.mine.text',
    effects: [],
    movement: [{ kind: 'step', vectors: [[0, 1]] }],
  })
  source.presets.push({
    id: 'preset.mine',
    nameKey: 'preset.mine.name',
    boardId: 'board.ours',
    pieceIds: ['piece.ours'],
    ruleCardIds: [],
    skillCardIds: [],
  })
  return source
}

/**
 * A stateful host, because `Edit` does not own its document.
 *
 * `App` holds the source and feeds each commit back down; a harness that only
 * RECORDED the commit would leave `Edit` rendering the pre-delete document while
 * the assertions read the post-delete one. That gap is not hypothetical — it
 * made the last-room refusal look broken when the refusal was correct and the
 * harness was one render behind.
 */
function Host({ initial, seen }: { initial: ContentSource; seen: { current: ContentSource } }) {
  const [source, setSource] = useState(initial)
  return (
    <Edit
      source={source}
      bundle={officialBundle()}
      onCommit={(next) => {
        seen.current = next
        setSource(next)
      }}
    />
  )
}

function mount(source: ContentSource) {
  const seen = { current: source }
  const result = render(<Host initial={source} seen={seen} />)
  return { ...result, current: () => seen.current }
}

/**
 * The fixture's own premise, asserted.
 *
 * `deleteRecord`'s third gate runs the whole document through `loadContentSet`,
 * so a fixture that does not validate makes every delete in this file refuse
 * with `invalid` — and the tests then pass or fail for a reason that has nothing
 * to do with what they claim to check. That is not hypothetical: the first
 * version of this fixture omitted `textKey` on its pieces, every delete was
 * silently refused, and the last-room test failed while the product was correct.
 */
describe('the fixtures', () => {
  it('load, so a refusal in these tests is about the rule and not the fixture', () => {
    expect(loadContentSet(officialBundle()).ok).toBe(true)
    expect(loadContentSet(authoredSource()).ok).toBe(true)
  })
})

beforeEach(() => {
  localStorage.clear()
  vi.spyOn(window, 'confirm').mockReturnValue(true)
})
afterEach(() => {
  vi.restoreAllMocks()
  localStorage.clear()
})

describe('the room list offers hide for ours, delete for theirs', () => {
  it('an official room has a hide control and NO delete control', () => {
    const { container } = mount(authoredSource())
    const rooms = within(container)
    expect(rooms.queryByTestId('room-hide-preset.ours')).not.toBeNull()
    expect(rooms.queryByTestId('room-delete-preset.ours')).toBeNull()
  })

  it('an authored room has a delete control and NO hide control', () => {
    const { container } = mount(authoredSource())
    const rooms = within(container)
    expect(rooms.queryByTestId('room-delete-preset.mine')).not.toBeNull()
    expect(rooms.queryByTestId('room-hide-preset.mine')).toBeNull()
  })

  it('hiding a room removes it from the list and persists', () => {
    const { container } = mount(authoredSource())
    fireEvent.click(within(container).getByTestId('room-hide-preset.spare'))
    expect(within(container).queryByTestId('room-open-preset.spare')).toBeNull()
    // Persisted, not merely stateful: the child closes the tab and it stays hidden.
    expect([...loadHidden(localStorage)]).toEqual(['preset.spare'])
  })

  it('hiding does NOT remove the record from the document (ADR-005)', () => {
    // The whole separation between hiding and deleting. If this ever mutates the
    // source, a hidden piece a room uses would break that room.
    const { container, current } = mount(authoredSource())
    fireEvent.click(within(container).getByTestId('room-hide-preset.spare'))
    expect(current().presets.map((p) => (p as { id: string }).id)).toContain('preset.spare')
    expect(localStorage.getItem(HIDDEN_KEY)).not.toBeNull()
  })

  it('refuses to hide the last VISIBLE room, with the same sentence a refused delete uses', () => {
    const { container } = mount(authoredSource())
    const rooms = within(container)
    // Three rooms: preset.ours, preset.spare (official), preset.mine (authored).
    fireEvent.click(rooms.getByTestId('room-hide-preset.spare'))
    fireEvent.click(rooms.getByTestId('room-delete-preset.mine'))
    // One room left. Hiding it must be refused.
    fireEvent.click(rooms.getByTestId('room-hide-preset.ours'))
    expect(rooms.queryByTestId('room-open-preset.ours')).not.toBeNull()
    const refusal = rooms.getByTestId('room-delete-refusal')
    expect(refusal.textContent).toContain('마지막')
  })
})

describe('the library applies the same rule to every kind (ADR-004)', () => {
  it('an official piece is hidden, not deleted', () => {
    const { container, current } = mount(authoredSource())
    fireEvent.click(within(container).getByTestId('editor-tab-library'))
    const lib = within(container)
    expect(lib.queryByTestId('library-hide-piece.ours')).not.toBeNull()
    expect(lib.queryByTestId('library-delete-piece.ours')).toBeNull()
    fireEvent.click(lib.getByTestId('library-hide-piece.ours'))
    expect(lib.queryByTestId('library-open-piece.ours')).toBeNull()
    expect(current().pieces.map((p) => (p as { id: string }).id)).toContain('piece.ours')
  })

  it('an authored piece is deleted, not hidden', () => {
    const { container } = mount(authoredSource())
    fireEvent.click(within(container).getByTestId('editor-tab-library'))
    const lib = within(container)
    expect(lib.queryByTestId('library-delete-piece.mine')).not.toBeNull()
    expect(lib.queryByTestId('library-hide-piece.mine')).toBeNull()
  })

  it('hides a piece a room still uses, and the room keeps working', () => {
    // The consequence ADR-005 buys: no reference gate, because nothing in the
    // document changed. `deleteRecord` would refuse this and name the rooms.
    const { container, current } = mount(authoredSource())
    fireEvent.click(within(container).getByTestId('editor-tab-library'))
    fireEvent.click(within(container).getByTestId('library-hide-piece.ours'))
    const lib = within(container)

    // FIRST: the click did something. Both document assertions below hold in the
    // fixture's untouched state — `piece.ours` starts in `pieces` and in
    // `preset.ours.pieceIds` — so on their own they cannot tell a working hide
    // from a handler that silently refused. These two can.
    expect(lib.queryByTestId('library-open-piece.ours')).toBeNull()
    expect([...loadHidden(localStorage)]).toContain('piece.ours')

    // THEN: and it changed nothing in the document.
    const after = current()
    expect(after.pieces.map((p) => (p as { id: string }).id)).toContain('piece.ours')
    expect((after.presets[0] as { pieceIds: string[] }).pieceIds).toContain('piece.ours')

    // "The room keeps working" as an assertion rather than an inference from
    // array containment: the document still passes the validator the game loads
    // with, and the room opens and draws its board.
    expect(loadContentSet(after).ok).toBe(true)
    fireEvent.click(lib.getByTestId('editor-tab-rooms'))
    fireEvent.click(lib.getByTestId('room-open-preset.ours'))
    expect(lib.queryByTestId('room-detail')).not.toBeNull()
  })
})
