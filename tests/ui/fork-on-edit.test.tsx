// @vitest-environment jsdom
import { useState } from 'react'
import { fireEvent, render, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { type ContentSource, loadContentSet } from '@content/load'
import { Edit } from '../../src/ui/Edit'

/**
 * PLAN-content-provenance-and-room-delete Phase 6 — ADR-001 (fork on a rule
 * edit, never on a rename) and ADR-007 (an official record's id is read-only)
 * as the child meets them.
 *
 * `tests/editor/fork.test.ts` pins the rule; this pins the WIRING. The two are
 * different claims and this project has a recorded habit of the second one
 * being the missing half (`[fail:design] built-but-not-wired`,
 * `phase-scope-omits-wiring`).
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

function withAuthored(): ContentSource {
  const source = officialBundle()
  source.strings!['ko']!['piece.mine.name'] = '내 기물'
  source.strings!['ko']!['piece.mine.text'] = '한 칸 간다.'
  source.pieces.push({
    id: 'piece.mine',
    nameKey: 'piece.mine.name',
    textKey: 'piece.mine.text',
    effects: [],
    movement: [{ kind: 'step', vectors: [[0, 1]] }],
  })
  return source
}

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

function mountLibrary(source: ContentSource) {
  const seen = { current: source }
  const result = render(<Host initial={source} seen={seen} />)
  fireEvent.click(within(result.container).getByTestId('editor-tab-library'))
  return { ...result, current: () => seen.current }
}

const pieceById = (source: ContentSource, id: string) =>
  source.pieces.find((p) => (p as { id: string }).id === id) as Record<string, unknown> | undefined

beforeEach(() => {
  localStorage.clear()
  vi.spyOn(window, 'confirm').mockReturnValue(true)
})
afterEach(() => {
  vi.restoreAllMocks()
  localStorage.clear()
})

describe('the fixtures', () => {
  it('load, so a refused save in these tests is about the rule', () => {
    expect(loadContentSet(officialBundle()).ok).toBe(true)
    expect(loadContentSet(withAuthored()).ok).toBe(true)
  })
})

describe('ADR-007 — an official record\'s id is read-only', () => {
  it('locks the id field for a record we ship and leaves it open for the child\'s own', () => {
    const { container } = mountLibrary(withAuthored())
    const lib = within(container)

    fireEvent.click(lib.getByTestId('library-open-piece.ours'))
    expect((lib.getByTestId('editor-id') as HTMLInputElement).readOnly).toBe(true)

    fireEvent.click(lib.getByTestId('library-open-piece.mine'))
    expect((lib.getByTestId('editor-id') as HTMLInputElement).readOnly).toBe(false)
  })

  it('closes the overwrite path: the shipped record survives an attempt on its id', () => {
    // This was live in the shipped build. Typing in the id field re-derives the
    // key fields and `commitDraft` REPLACES the record at `openedId`, so the
    // shipped piece was overwritten and gone.
    const { container, current } = mountLibrary(withAuthored())
    const lib = within(container)
    fireEvent.click(lib.getByTestId('library-open-piece.ours'))
    fireEvent.change(lib.getByTestId('editor-id'), { target: { value: 'piece.stolen' } })
    fireEvent.click(lib.getByTestId('editor-save'))

    expect(pieceById(current(), 'piece.ours')).toBeDefined()
    expect(pieceById(current(), 'piece.stolen')).toBeUndefined()
  })
})

describe('ADR-001 — a rule edit forks, a rename does not', () => {
  it('renaming a record we ship leaves ONE record and overrides its text', () => {
    const { container, current } = mountLibrary(withAuthored())
    const lib = within(container)
    fireEvent.click(lib.getByTestId('library-open-piece.ours'))
    fireEvent.change(lib.getByTestId('editor-name'), { target: { value: '임금님' } })
    fireEvent.click(lib.getByTestId('editor-save'))

    const after = current()
    expect(after.pieces).toHaveLength(2)
    expect(pieceById(after, 'piece.ours-2')).toBeUndefined()
    expect(after.strings?.['ko']?.['piece.ours.name']).toBe('임금님')
  })

  it('changing a RULE produces the child\'s own copy and leaves ours intact', () => {
    const { container, current } = mountLibrary(withAuthored())
    const lib = within(container)
    fireEvent.click(lib.getByTestId('library-open-piece.ours'))
    // Driven through the real movement grid, which is the rule surface a child
    // actually touches — not by writing a field the form does not expose.
    fireEvent.click(lib.getByTestId('piece-cell-1,1'))
    fireEvent.click(lib.getByTestId('editor-save'))

    const after = current()
    const original = pieceById(after, 'piece.ours')
    const copy = pieceById(after, 'piece.ours-2')
    expect(original, 'the record we ship must survive').toBeDefined()
    expect(copy, 'the edit must land on a copy').toBeDefined()
    // The original is byte-identical to what we ship.
    expect(original).toEqual(officialBundle().pieces[0])
    // And the copy carries its OWN keys, so renaming it cannot rename ours.
    expect(copy?.['nameKey']).toBe('piece.ours-2.name')
    expect(after.strings?.['ko']?.['piece.ours-2.name']).toBe('우리 기물')
  })

  it('renaming the COPY does not rename the original (the ADR-001 amendment)', () => {
    // The failure the amendment exists for. A copy sharing the original's
    // `nameKey` would send this rename to the shipped record, everywhere it is
    // used.
    const { container, current } = mountLibrary(withAuthored())
    const lib = within(container)
    fireEvent.click(lib.getByTestId('library-open-piece.ours'))
    fireEvent.click(lib.getByTestId('piece-cell-1,1'))
    fireEvent.click(lib.getByTestId('editor-save'))
    expect(pieceById(current(), 'piece.ours-2'), 'the fork must have happened').toBeDefined()

    // The form must now be holding the COPY, not the original — otherwise the
    // rename below would go to the shipped record, and the child could never
    // tidy the copy's id either.
    expect(
      (lib.getByTestId('editor-id') as HTMLInputElement).readOnly,
      'the id unlocks once the record is the child\'s own',
    ).toBe(false)
    expect((lib.getByTestId('editor-id') as HTMLInputElement).value).toBe('piece.ours-2')

    fireEvent.change(lib.getByTestId('editor-name'), { target: { value: '내 왕' } })
    fireEvent.click(lib.getByTestId('editor-save'))

    const after = current()
    expect(after.strings?.['ko']?.['piece.ours-2.name']).toBe('내 왕')
    expect(after.strings?.['ko']?.['piece.ours.name']).toBe('우리 기물')
  })

  it('forks a ROOM we ship when its composition changes, and leaves ours intact', () => {
    // ADR-004 is "all six kinds", and rooms are edited on a different screen
    // with its own save path (`RoomDetail`). A fork wired into one form and not
    // the other is `[fail:design] shared-vocabulary-unshared-code-path`.
    const seen = { current: withAuthored() }
    const { container } = render(<Host initial={withAuthored()} seen={seen} />)
    const rooms = within(container)
    fireEvent.click(rooms.getByTestId('room-open-preset.ours'))
    fireEvent.click(rooms.getByTestId('room-step-pieces'))
    // Drop a piece from the room: a composition change, which is a rule change.
    fireEvent.click(rooms.getByTestId('room-piece-piece.ours'))
    fireEvent.click(rooms.getByTestId('room-save'))

    const after = seen.current
    const ids = after.presets.map((r) => (r as { id: string }).id)
    expect(ids, 'the room we ship must survive').toContain('preset.ours')
    expect(ids, 'the edit must land on a copy').toContain('preset.ours-2')
    expect(after.presets.find((r) => (r as { id: string }).id === 'preset.ours')).toEqual(
      officialBundle().presets[0],
    )
  })

  it('forks the BOARD we ship when a piece is placed on it, independently of the room', () => {
    /*
     * `RoomDetail` calls `forkOnEdit` TWICE — once for the board, once for the
     * room — and the two are separate branches with separate failure modes. The
     * composition test above exercises only the room half, so a board fork that
     * never fires (our board silently repainted) or that fires on every save
     * (a fresh orphan board each time) would both pass it.
     *
     * Placing a piece edits the BOARD record and leaves `preset.pieceIds` alone,
     * so this isolates the board half.
     */
    const seen = { current: withAuthored() }
    const { container } = render(<Host initial={withAuthored()} seen={seen} />)
    const rooms = within(container)
    fireEvent.click(rooms.getByTestId('room-open-preset.ours'))
    fireEvent.click(rooms.getByTestId('room-step-place'))
    fireEvent.click(rooms.getByTestId('place-pick-piece.ours'))
    fireEvent.click(rooms.getByTestId('place-c3'))
    fireEvent.click(rooms.getByTestId('room-save'))

    const after = seen.current
    const boardIds = after.boards.map((b) => (b as { id: string }).id)
    expect(boardIds, 'the board we ship must survive untouched').toContain('board.ours')
    expect(after.boards.find((b) => (b as { id: string }).id === 'board.ours')).toEqual(
      officialBundle().boards[0],
    )
    expect(boardIds.length, 'the edit must land on a copy of the board').toBe(2)

    // Changing the board changes the room's `boardId`, so the room forks too —
    // and the COPY is what must point at the new board. If it still pointed at
    // ours, the fork would be an orphan and the child's placement invisible.
    const original = after.presets.find((r) => (r as { id: string }).id === 'preset.ours') as
      | { boardId: string }
      | undefined
    const copy = after.presets.find((r) => (r as { id: string }).id === 'preset.ours-2') as
      | { boardId: string }
      | undefined
    expect(original?.boardId, 'the room we ship keeps its own board').toBe('board.ours')
    expect(copy, 'the room forks with its board').toBeDefined()
    expect(copy?.boardId).not.toBe('board.ours')
    expect(boardIds).toContain(copy?.boardId)
  })

  it('renaming an official room AND changing its rules in one save leaves the original\'s name alone', () => {
    /*
     * A cross-model reviewer found this and an oracle confirmed it: the room's
     * typed name was folded into `strings` at the ORIGINAL's key BEFORE the fork
     * ran, and the fork then copied that already-overwritten value onto the
     * copy's key. Both rooms ended up called the same thing, and the shipped
     * room's name was gone.
     *
     * The room fork test above changes composition WITHOUT renaming, and the
     * rename test does not change any rule — so the combination of the two, in
     * one save, was reachable by a child and by nothing in the suite.
     */
    const seen = { current: withAuthored() }
    const { container } = render(<Host initial={withAuthored()} seen={seen} />)
    const rooms = within(container)

    fireEvent.click(rooms.getByTestId('room-open-preset.ours'))
    fireEvent.click(rooms.getByTestId('room-step-pieces'))
    fireEvent.click(rooms.getByTestId('room-piece-piece.ours'))
    fireEvent.click(rooms.getByTestId('room-step-name'))
    fireEvent.change(rooms.getByTestId('room-name'), { target: { value: '내 방' } })
    fireEvent.click(rooms.getByTestId('room-save'))

    const after = seen.current
    expect(
      after.presets.map((r) => (r as { id: string }).id),
      'the fork must still happen',
    ).toContain('preset.ours-2')
    expect(after.strings?.['ko']?.['preset.ours.name'], 'the shipped room keeps its name').toBe('우리 방')
    expect(after.strings?.['ko']?.['preset.ours-2.name'], 'the copy carries the typed name').toBe('내 방')
  })

  it('editing the child\'s own record replaces it in place, as before', () => {
    const { container, current } = mountLibrary(withAuthored())
    const lib = within(container)
    fireEvent.click(lib.getByTestId('library-open-piece.mine'))
    fireEvent.click(lib.getByTestId('piece-cell-1,1'))
    fireEvent.click(lib.getByTestId('editor-save'))

    const after = current()
    expect(after.pieces).toHaveLength(2)
    expect(pieceById(after, 'piece.mine-2')).toBeUndefined()
  })
})
