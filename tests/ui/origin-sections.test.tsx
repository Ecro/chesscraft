// @vitest-environment jsdom
import { useState } from 'react'
import { fireEvent, render, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { type ContentSource, loadContentSet } from '@content/load'
import { ko } from '../../src/i18n/ko'
import { Edit } from '../../src/ui/Edit'

/**
 * PLAN-content-provenance-and-room-delete Phase 5 — the lists split into what we
 * shipped and what the child made (interview round 2, question 6).
 *
 * A section split rather than a per-item badge: the reader is a child, and two
 * headings say the thing a badge only implies. Sorting follows for free.
 *
 * The case that must not be lost is the EMPTY one. A child who has made nothing
 * is the common case on day one, and a split that renders only the non-empty
 * side would make the authored heading appear the first time they save — which
 * reads as the screen changing shape rather than as their work arriving.
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

function Host({ initial }: { initial: ContentSource }) {
  const [source, setSource] = useState(initial)
  return <Edit source={source} bundle={officialBundle()} onCommit={setSource} />
}

const mount = (source: ContentSource) => render(<Host initial={source} />)

/** The ids rendered inside one section, in document order. */
function idsIn(container: HTMLElement, section: 'official' | 'authored', prefix: string): string[] {
  const node = container.querySelector(`[data-testid="${prefix}-section-${section}"]`)
  if (node === null) return []
  return [...node.querySelectorAll(`[data-testid^="${prefix}-open-"]`)].map((el) =>
    (el.getAttribute('data-testid') ?? '').replace(`${prefix}-open-`, ''),
  )
}

beforeEach(() => {
  localStorage.clear()
  vi.spyOn(window, 'confirm').mockReturnValue(true)
})
afterEach(() => {
  vi.restoreAllMocks()
  localStorage.clear()
})

describe('the fixtures', () => {
  it('load, so a missing row is about the split and not about validation', () => {
    expect(loadContentSet(officialBundle()).ok).toBe(true)
    expect(loadContentSet(withAuthored()).ok).toBe(true)
  })
})

describe('the room list splits by origin', () => {
  it('puts our rooms in one section and theirs in the other', () => {
    const { container } = mount(withAuthored())
    expect(idsIn(container, 'official', 'room')).toEqual(['preset.ours', 'preset.spare'])
    expect(idsIn(container, 'authored', 'room')).toEqual(['preset.mine'])
  })

  it('renders BOTH headings when the child has made nothing', () => {
    // The case a fixture with authored records deletes. On day one every child
    // is here, and a section that vanishes when empty makes the screen change
    // shape the first time they save.
    const { container } = mount(officialBundle())
    const rooms = within(container)
    expect(rooms.queryByTestId('room-section-official')).not.toBeNull()
    expect(rooms.queryByTestId('room-section-authored')).not.toBeNull()
    expect(idsIn(container, 'authored', 'room')).toEqual([])
    // And it SAYS it is empty, in the actual words — a placeholder or a raw
    // translation key would satisfy a non-empty check and read as breakage.
    const empty = container.querySelector('[data-testid="room-section-authored"] .empty')
    expect(empty?.textContent).toBe(ko['ui.editor.section.authored-empty'])
  })

  it('renders both headings when everything is the child\'s own', () => {
    // The mirror case: an imported document, or one where every shipped room has
    // been hidden. The official side must say it is empty, not disappear.
    const source = withAuthored()
    const { container } = mount(source)
    fireEvent.click(within(container).getByTestId('room-hide-preset.ours'))
    fireEvent.click(within(container).getByTestId('room-hide-preset.spare'))
    expect(within(container).queryByTestId('room-section-official')).not.toBeNull()
    expect(idsIn(container, 'official', 'room')).toEqual([])
    expect(idsIn(container, 'authored', 'room')).toEqual(['preset.mine'])
  })

  it('moves a room between sections when its origin changes, without reordering the rest', () => {
    // `preset.spare` is official; a document where it is NOT in the bundle puts
    // it on the authored side. This is ADR-003's derived provenance observed
    // from the screen: nothing about the record changed, only the bundle.
    const narrow = officialBundle()
    narrow.presets = narrow.presets.filter((p) => (p as { id: string }).id !== 'preset.spare')
    const { container } = render(
      <Edit source={withAuthored()} bundle={narrow} onCommit={() => {}} />,
    )
    expect(idsIn(container, 'official', 'room')).toEqual(['preset.ours'])
    expect(idsIn(container, 'authored', 'room')).toEqual(['preset.spare', 'preset.mine'])
  })
})

describe('the library splits by origin too', () => {
  it('separates our pieces from theirs', () => {
    const { container } = mount(withAuthored())
    fireEvent.click(within(container).getByTestId('editor-tab-library'))
    expect(idsIn(container, 'official', 'library')).toEqual(['piece.ours'])
    expect(idsIn(container, 'authored', 'library')).toEqual(['piece.mine'])
  })

  it('shows both headings for a kind the child has never touched', () => {
    const { container } = mount(withAuthored())
    fireEvent.click(within(container).getByTestId('editor-tab-library'))
    // Rule cards: the fixture has none at all, of either origin.
    fireEvent.change(within(container).getByTestId('editor-kind'), { target: { value: 'ruleCard' } })
    const lib = within(container)
    expect(lib.queryByTestId('library-section-official')).not.toBeNull()
    expect(lib.queryByTestId('library-section-authored')).not.toBeNull()
    // Parity with the room list: both sides say they are empty, in words.
    for (const side of ['official', 'authored'] as const) {
      const empty = container.querySelector(`[data-testid="library-section-${side}"] .empty`)
      expect(empty?.textContent, side).toBe(ko[`ui.editor.section.${side}-empty`])
    }
  })
})
