// @vitest-environment jsdom
import { useState } from 'react'
import { fireEvent, render, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { type ContentSource, loadContentSet } from '@content/load'
import { HIDDEN_KEY } from '@editor/hidden'
import { Edit } from '../../src/ui/Edit'

/**
 * PLAN-content-provenance-and-room-delete Phase 9 / ADR-005 surfaces 4-6 —
 * hidden records leave the PICKERS too, with one exemption.
 *
 * The exemption is the whole risk. `RoomDetail` decides "this reference is
 * broken" by asking whether the id is in the array it just rendered
 * (`VanishedRows`, `ChipList`'s tail), so filtering that array without the
 * exemption does not merely hide a checkbox — it tells the child their own piece
 * is gone, and the next save drops it.
 */

function officialBundle(): ContentSource {
  return {
    schemaVersion: 10,
    strings: {
      ko: {
        'piece.ours.name': '우리 기물',
        'piece.ours.text': '한 칸 간다.',
        'piece.spare.name': '남는 기물',
        'piece.spare.text': '한 칸 간다.',
        'skill.ours.name': '우리 재주',
        'skill.ours.text': '무언가 한다.',
        'rule.ours.name': '우리 규칙',
        'rule.ours.text': '무언가 정한다.',
        'preset.ours.name': '우리 방',
        'preset.other.name': '다른 방',
        'board.ours.name': '우리 판',
      },
    },
    pieces: [
      { id: 'piece.ours', nameKey: 'piece.ours.name', textKey: 'piece.ours.text', effects: [], movement: [{ kind: 'step', vectors: [[0, 1]] }] },
      { id: 'piece.spare', nameKey: 'piece.spare.name', textKey: 'piece.spare.text', effects: [], movement: [{ kind: 'step', vectors: [[0, 1]] }] },
    ],
    squareTypes: [],
    ruleCards: [{ id: 'rule.ours', nameKey: 'rule.ours.name', textKey: 'rule.ours.text', effects: [] }],
    skillCards: [{ id: 'skill.ours', nameKey: 'skill.ours.name', textKey: 'skill.ours.text', effects: [], uses: 1 }],
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
      { id: 'preset.ours', nameKey: 'preset.ours.name', boardId: 'board.ours', pieceIds: ['piece.ours', 'piece.spare'], ruleCardIds: ['rule.ours'], skillCardIds: ['skill.ours'] },
      { id: 'preset.other', nameKey: 'preset.other.name', boardId: 'board.ours', pieceIds: ['piece.ours'], ruleCardIds: [], skillCardIds: [] },
    ],
  }
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

function mount(source: ContentSource) {
  const seen = { current: source }
  const result = render(<Host initial={source} seen={seen} />)
  return { ...result, current: () => seen.current }
}

/**
 * The base fixture with a loadout on `preset.other`.
 *
 * `loadoutBudget` is NOT decoration: `load.ts` refuses a preset that declares a
 * `loadout` without one. The first version of this fixture omitted it, so the
 * document could not load and the test was asserting against a state no room
 * can reach — the recorded `[fail:test] fixture-invalid-so-fallback-satisfies`,
 * found here by a cross-model reviewer. `describe('the fixtures')` below now
 * validates EVERY builder in this file rather than only the base one, which is
 * the half that would have caught it.
 */
function withLoadout(): ContentSource {
  const source = officialBundle()
  const room = source.presets[1] as Record<string, unknown>
  room['loadout'] = { white: { pieceId: 'piece.spare', replaces: 'piece.ours', skillCardId: 'skill.ours' } }
  room['loadoutBudget'] = 99
  room['pieceIds'] = ['piece.ours', 'piece.spare']
  return source
}

/**
 * The base fixture plus a piece the child made, used by no room.
 *
 * The vehicle for reaching a DANGLING reference the way a child can. Putting the
 * dangling id straight into the saved document — which the first version of this
 * file did — builds a document `loadContentSet` refuses, and `initialSource()`
 * discards such a document wholesale, so no child ever meets that room. The
 * reachable state is a dangling reference in the open DRAFT: the room adds a
 * piece without saving, the piece is deleted from the library (allowed, because
 * the SAVED room does not reference it), and the draft is left naming something
 * that is gone.
 */
function withAuthoredPiece(): ContentSource {
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

/** Hide a record before mounting — the state a returning child is in. */
const preHide = (...ids: string[]) => localStorage.setItem(HIDDEN_KEY, JSON.stringify({ ids }))

beforeEach(() => {
  localStorage.clear()
  vi.spyOn(window, 'confirm').mockReturnValue(true)
})
afterEach(() => {
  vi.restoreAllMocks()
  localStorage.clear()
})

describe('the fixtures', () => {
  /*
   * EVERY builder, not just the base one. A guard that covers the base fixture
   * and not the mutations makes the file LOOK audited while the mutation — which
   * is the one carrying the interesting state — goes unchecked. That is exactly
   * how the loadout fixture below shipped as a document the loader refuses.
   */
  it.each([
    ['officialBundle', officialBundle],
    ['withLoadout', withLoadout],
    ['withAuthoredPiece', withAuthoredPiece],
  ])('%s produces a document the loader accepts', (_name, build) => {
    const result = loadContentSet(build())
    expect(result.ok, result.ok ? '' : JSON.stringify(result.errors.slice(0, 2))).toBe(true)
  })
})

describe('the room builder hides what the child tucked away', () => {
  it('drops a hidden piece from the piece grid', () => {
    // `piece.spare` is hidden and `preset.other` does not use it, so nothing
    // exempts it here.
    preHide('piece.spare')
    const { container } = mount(officialBundle())
    fireEvent.click(within(container).getByTestId('room-open-preset.other'))
    fireEvent.click(within(container).getByTestId('room-step-pieces'))
    expect(within(container).queryByTestId('room-piece-piece.spare')).toBeNull()
    expect(within(container).queryByTestId('room-piece-piece.ours')).not.toBeNull()
  })

  it('KEEPS a hidden piece this room already uses, as a normal tile', () => {
    // The exemption, and the assertion that separates it from a broken
    // reference: the tile must NOT carry the `vanished` class, which is how the
    // screen says "this points at nothing".
    preHide('piece.spare')
    const { container } = mount(officialBundle())
    fireEvent.click(within(container).getByTestId('room-open-preset.ours'))
    fireEvent.click(within(container).getByTestId('room-step-pieces'))

    const tile = within(container).getByTestId('room-piece-piece.spare')
    expect(tile.className).not.toContain('vanished')
    expect(tile.getAttribute('data-selected')).toBe('true')
  })

  it('still reports a genuinely dangling reference as vanished', () => {
    /*
     * The exemption must not swallow the real case — and the real case has to be
     * REACHED, not fabricated. A saved document carrying a dangling reference is
     * refused by `loadContentSet` and discarded by `initialSource`, so no child
     * ever opens that room; asserting against it would be asserting against a
     * state the product cannot be in.
     *
     * So it is reached the way a child reaches it: add a piece to the room
     * without saving, delete that piece from the library (allowed — the SAVED
     * room does not reference it), and come back to a draft naming something
     * gone. Both panels stay mounted, so the draft survives the trip.
     */
    preHide('piece.spare')
    const { container } = mount(withAuthoredPiece())
    const q = within(container)

    q.getByTestId('room-open-preset.ours')
    fireEvent.click(q.getByTestId('room-open-preset.ours'))
    fireEvent.click(q.getByTestId('room-step-pieces'))
    fireEvent.click(q.getByTestId('room-piece-piece.mine'))
    expect(q.getByTestId('room-piece-piece.mine').getAttribute('data-selected')).toBe('true')

    fireEvent.click(q.getByTestId('editor-tab-library'))
    fireEvent.click(q.getByTestId('library-delete-piece.mine'))
    fireEvent.click(q.getByTestId('editor-tab-rooms'))

    const tile = q.getByTestId('room-piece-piece.mine')
    expect(tile.className, 'a reference to a record that is gone reads as broken').toContain('vanished')
  })

  it('does not DROP a hidden-but-used record on the next save', () => {
    // The failure the exemption exists for, asserted end to end. Without it the
    // record is absent from the rendered list, its checkbox unchecked, and the
    // save writes the room back without it.
    preHide('piece.spare', 'skill.ours')
    const { container, current } = mount(officialBundle())
    fireEvent.click(within(container).getByTestId('room-open-preset.ours'))
    fireEvent.click(within(container).getByTestId('room-save'))

    const room = current().presets.find((r) => (r as { id: string }).id === 'preset.ours') as
      | { pieceIds: string[]; skillCardIds: string[] }
      | undefined
    expect(room?.pieceIds).toContain('piece.spare')
    expect(room?.skillCardIds).toContain('skill.ours')
  })

  it('drops a hidden card from the card chips, and keeps one the room deals', () => {
    preHide('skill.ours')
    const { container } = mount(officialBundle())
    fireEvent.click(within(container).getByTestId('room-open-preset.other'))
    fireEvent.click(within(container).getByTestId('room-step-cards'))
    expect(within(container).queryByTestId('room-skill-skill.ours')).toBeNull()

    fireEvent.click(within(container).getByTestId('room-back'))
    fireEvent.click(within(container).getByTestId('room-open-preset.ours'))
    fireEvent.click(within(container).getByTestId('room-step-cards'))
    const chip = within(container).getByTestId('room-skill-skill.ours')
    expect(chip.className).not.toContain('vanished')
  })
})

describe('the loadout selects hide it too (ADR-005 surface 5)', () => {
  // The last unfiltered list in `RoomDetail`, and the gap was invisible from
  // outside: the piece GRID stopped offering a hidden piece two steps earlier
  // while these selects went on offering it.
  const optionValues = (container: HTMLElement, testid: string) =>
    [...(within(container).getByTestId(testid) as HTMLSelectElement).options].map((o) => o.value)

  it('drops a hidden piece from the loadout piece select', () => {
    preHide('piece.spare')
    const { container } = mount(officialBundle())
    fireEvent.click(within(container).getByTestId('room-open-preset.other'))
    fireEvent.click(within(container).getByTestId('room-step-cards'))
    expect(optionValues(container, 'loadout-piece')).not.toContain('piece.spare')
    expect(optionValues(container, 'loadout-piece')).toContain('piece.ours')
  })

  it('drops a hidden card from the loadout skill select', () => {
    // `skill.ours` is not in `preset.other`'s pool, so it is ownable there.
    preHide('skill.ours')
    const { container } = mount(officialBundle())
    fireEvent.click(within(container).getByTestId('room-open-preset.other'))
    fireEvent.click(within(container).getByTestId('room-step-cards'))
    expect(optionValues(container, 'loadout-skill')).not.toContain('skill.ours')
  })

  it('KEEPS a hidden piece a saved slot already names', () => {
    // Without the exemption, opening a room whose loadout names a hidden piece
    // would offer a select that cannot represent its own current value.
    const source = withLoadout()
    preHide('piece.spare')
    const { container } = mount(source)
    fireEvent.click(within(container).getByTestId('room-open-preset.other'))
    fireEvent.click(within(container).getByTestId('room-step-cards'))
    expect(optionValues(container, 'loadout-piece')).toContain('piece.spare')
  })
})

describe('the rule-card chips hide it too', () => {
  it('drops a hidden rule card, and keeps one the room deals', () => {
    preHide('rule.ours')
    const { container } = mount(officialBundle())
    fireEvent.click(within(container).getByTestId('room-open-preset.other'))
    fireEvent.click(within(container).getByTestId('room-step-cards'))
    expect(within(container).queryByTestId('room-rule-rule.ours')).toBeNull()

    fireEvent.click(within(container).getByTestId('room-back'))
    fireEvent.click(within(container).getByTestId('room-open-preset.ours'))
    fireEvent.click(within(container).getByTestId('room-step-cards'))
    const chip = within(container).getByTestId('room-rule-rule.ours')
    expect(chip.className).not.toContain('vanished')
  })
})

describe('the library form and the remix gallery hide it too', () => {
  it('drops a hidden piece from the room composition checklist', () => {
    preHide('piece.spare')
    const { container } = mount(officialBundle())
    fireEvent.click(within(container).getByTestId('editor-tab-library'))
    fireEvent.change(within(container).getByTestId('editor-kind'), { target: { value: 'preset' } })
    fireEvent.click(within(container).getByTestId('library-open-preset.other'))
    expect(within(container).queryByTestId('preset-piece-piece.spare')).toBeNull()
    expect(within(container).queryByTestId('preset-piece-piece.ours')).not.toBeNull()
  })

  it('keeps a hidden piece the OPEN room already selects', () => {
    preHide('piece.spare')
    const { container } = mount(officialBundle())
    fireEvent.click(within(container).getByTestId('editor-tab-library'))
    fireEvent.change(within(container).getByTestId('editor-kind'), { target: { value: 'preset' } })
    fireEvent.click(within(container).getByTestId('library-open-preset.ours'))
    const box = within(container).getByTestId('preset-piece-piece.spare') as HTMLInputElement
    expect(box.checked).toBe(true)
  })

  it('drops a hidden record from the remix gallery', () => {
    preHide('piece.spare')
    const { container } = mount(officialBundle())
    fireEvent.click(within(container).getByTestId('editor-tab-library'))
    // A blank form opens on the gallery.
    fireEvent.change(within(container).getByTestId('editor-kind'), { target: { value: 'piece' } })
    expect(within(container).queryByTestId('gallery-remix-piece.spare')).toBeNull()
    expect(within(container).queryByTestId('gallery-remix-piece.ours')).not.toBeNull()
  })
})
