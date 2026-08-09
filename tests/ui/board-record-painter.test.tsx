// @vitest-environment jsdom
/**
 * The board RECORD is edited the way `배치` is edited, because it is the same thing.
 *
 * Before this, the board record's editor was the only surface in the app that
 * showed a child a coordinate string: every square drew two tiny buttons, one
 * labelled `a6` and one labelled `·`/`w`/`b`, with `<select>` dropdowns for the
 * piece, the side and the square type. The room maker's placement step had been
 * a tap-to-place painter with real piece art the whole time, and both wrote the
 * IDENTICAL model — `boardDef.placements`, keyed by the same algebraic string.
 *
 * AC-010 is the one that matters and the reason the two surfaces now share a
 * component rather than merely resembling each other: it drives the same tap
 * sequence through both and compares what they wrote. It is also the test that
 * forced the test-id prefix. `Edit` keeps BOTH panels mounted and hides the
 * inactive one, so with a room on its placement step and a board record open in
 * the library, an unprefixed `place-a1` matches twice and `getByTestId` throws —
 * which is why the board record's ids carry `board-`.
 */
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import React from 'react'
import { bundledContentSource } from '@content/sets/bundled'
import { sliceContentSource } from '@content/sets/slice'
import { Edit } from '../../src/ui/Edit'

afterEach(cleanup)

const ALGEBRAIC = /^[a-z][1-9][0-9]*$/

function mount(source = bundledContentSource) {
  return render(React.createElement(Edit, { source: structuredClone(source), onCommit: () => {} }))
}

const draft = () => JSON.parse(screen.getByTestId('editor-draft-json').textContent ?? 'null')

/** Open the first board record the source ships, in the library panel. */
function openFirstBoard(source = bundledContentSource) {
  mount(source)
  fireEvent.click(screen.getByTestId('editor-tab-library'))
  fireEvent.change(screen.getByTestId('editor-kind'), { target: { value: 'board' } })
  const first = screen.getAllByTestId(/^library-open-/)[0]
  if (!first) throw new Error('the source ships no board record — this fixture is wrong, not the code')
  fireEvent.click(first)
  return String(first.getAttribute('data-testid')).replace('library-open-', '')
}

describe('AC-009 — the board record maker shows no coordinate text and no dropdown', () => {
  it('renders no text node that reads as a square name', () => {
    openFirstBoard()
    const editor = screen.getByTestId('record-form')
    const offenders = Array.from(editor.querySelectorAll('*'))
      .flatMap((el) => Array.from(el.childNodes))
      .filter((n) => n.nodeType === 3)
      .map((n) => (n.textContent ?? '').trim())
      .filter((text) => ALGEBRAIC.test(text))
    // Not `aria-label` — the painter deliberately keeps the square name there,
    // because a screen reader still has to be able to say which square this is.
    // What a CHILD reads is what this asserts about.
    expect(offenders, `visible square names: ${offenders.join(', ')}`).toEqual([])
  })

  it('offers the piece, the side and the square type as tiles rather than selects', () => {
    openFirstBoard()
    const editor = screen.getByTestId('record-form')
    expect(Array.from(editor.querySelectorAll('select')).map((s) => s.getAttribute('data-testid'))).toEqual([])
  })
})

describe('AC-011 — placing and painting are separate modes', () => {
  it('shows exactly one of the two painters at a time', () => {
    openFirstBoard()
    const active = () => [
      screen.queryAllByTestId(/^board-place-[a-z][1-9]/).length > 0,
      screen.queryAllByTestId(/^board-paint-[a-z][1-9]/).length > 0,
    ]
    expect(active().filter(Boolean)).toHaveLength(1)
    fireEvent.click(screen.getByTestId('board-mode-paint'))
    expect(active()).toEqual([false, true])
    fireEvent.click(screen.getByTestId('board-mode-place'))
    expect(active()).toEqual([true, false])
  })
})

describe('AC-010 — the board record and the room agree on placements', () => {
  /** The same three squares, tapped in the same order, on both surfaces. */
  const TAPS = ['a1', 'b2', 'c3']

  /** The board the first slice room plays on — so both surfaces edit the SAME record. */
  function roomBoardId() {
    const preset = (sliceContentSource.presets as Array<Record<string, unknown>>)[0]
    const id = String(preset?.boardId ?? '')
    expect(id, 'the slice fixture ships a room with no board — this fixture is wrong').not.toBe('')
    return id
  }

  /** Every square's rendered state, keyed by square, from one painter's grid. */
  function gridState(prefix: string) {
    const out: Record<string, string> = {}
    for (const cell of screen.queryAllByTestId(new RegExp(`^${prefix}place-[a-z][1-9]`))) {
      const square = String(cell.getAttribute('aria-label'))
      out[square] = [
        cell.getAttribute('data-side') ?? '',
        cell.getAttribute('data-painted') ?? '',
        cell.getAttribute('data-parity') ?? '',
        cell.innerHTML,
      ].join('|')
    }
    expect(Object.keys(out).length, `${prefix || '(room)'} painter drew no squares`).toBeGreaterThan(0)
    return out
  }

  it('draws and writes the same thing for the same taps', () => {
    const boardId = roomBoardId()
    mount(sliceContentSource)

    // --- the room's 배치 step -------------------------------------------------
    fireEvent.click(screen.getByTestId('editor-tab-rooms'))
    fireEvent.click(screen.getAllByTestId(/^room-open-/)[0]!)
    fireEvent.click(screen.getByTestId('room-step-place'))
    fireEvent.click(screen.getByTestId('place-side-white'))
    const roomPick = screen.getAllByTestId(/^place-pick-/)[0]!
    const pieceId = String(roomPick.getAttribute('data-testid')).replace('place-pick-', '')
    fireEvent.click(roomPick)
    for (const sq of TAPS) fireEvent.click(screen.getByTestId(`place-${sq}`))
    const roomGrid = gridState('')

    // --- the board record, on the SAME board ---------------------------------
    // Both panels are mounted right now and the room is still on its place step.
    // If the two surfaces shared one id namespace, the next line would throw
    // "found multiple elements" — which is the whole reason for the prefix.
    fireEvent.click(screen.getByTestId('editor-tab-library'))
    fireEvent.change(screen.getByTestId('editor-kind'), { target: { value: 'board' } })
    fireEvent.click(screen.getByTestId(`library-open-${boardId}`))
    fireEvent.click(screen.getByTestId('board-mode-place'))
    fireEvent.click(screen.getByTestId('board-place-side-white'))
    fireEvent.click(screen.getByTestId(`board-place-pick-${pieceId}`))
    for (const sq of TAPS) fireEvent.click(screen.getByTestId(`board-place-${sq}`))

    // The differential: same board, same taps, so every square must render
    // identically on both surfaces. A divergence in either one fails.
    expect(gridState('board-')).toEqual(roomGrid)

    // And the model each wrote agrees with what it drew.
    const wrote = (draft().placements ?? []).filter((p: { square: string }) => TAPS.includes(p.square))
    expect(wrote.map((p: { square: string }) => p.square).sort()).toEqual([...TAPS].sort())
    for (const p of wrote) {
      expect(p.pieceId).toBe(pieceId)
      expect(p.side).toBe('white')
    }
  })

  it('tapping an occupied square removes it, on both, whatever piece is held', () => {
    const boardId = roomBoardId()
    mount(sliceContentSource)

    // --- the board record ----------------------------------------------------
    fireEvent.click(screen.getByTestId('editor-tab-library'))
    fireEvent.change(screen.getByTestId('editor-kind'), { target: { value: 'board' } })
    fireEvent.click(screen.getByTestId(`library-open-${boardId}`))
    fireEvent.click(screen.getByTestId('board-mode-place'))
    fireEvent.click(screen.getByTestId('board-place-side-white'))
    const picks = screen.getAllByTestId(/^board-place-pick-/)
    expect(picks.length, 'this case needs two different pieces to hold').toBeGreaterThan(1)
    const [first, second] = picks as [HTMLElement, HTMLElement]
    const idOf = (el: HTMLElement) => String(el.getAttribute('data-testid')).replace('board-place-pick-', '')

    const at = (sq: string) => (draft().placements ?? []).find((p: { square: string }) => p.square === sq)
    const empty = screen
      .queryAllByTestId(/^board-place-[a-z][1-9]/)
      .find((c) => (c.getAttribute('data-side') ?? '') === '')
    expect(empty, 'the fixture board has no free square').toBeTruthy()
    const square = String(empty!.getAttribute('aria-label'))

    fireEvent.click(first)
    fireEvent.click(screen.getByTestId(`board-place-${square}`))
    expect(at(square)?.pieceId).toBe(idOf(first))
    // Now holding a DIFFERENT piece. The room clears here rather than swapping,
    // and the board record used to swap — that divergence is what `togglePlacement`
    // exists to remove, so this is the assertion that would have caught it.
    fireEvent.click(second)
    fireEvent.click(screen.getByTestId(`board-place-${square}`))
    expect(at(square), 'an occupied square clears whatever is held').toBeUndefined()

    // --- the room, same square, same two pieces ------------------------------
    fireEvent.click(screen.getByTestId('editor-tab-rooms'))
    fireEvent.click(screen.getAllByTestId(/^room-open-/)[0]!)
    fireEvent.click(screen.getByTestId('room-step-place'))
    fireEvent.click(screen.getByTestId('place-side-white'))
    const roomFirst = screen.queryByTestId(`place-pick-${idOf(first)}`)
    const roomSecond = screen.queryByTestId(`place-pick-${idOf(second)}`)
    expect(roomFirst && roomSecond, 'the room does not list both fixture pieces — pick another fixture').toBeTruthy()
    const sideOf = () => screen.getByTestId(`place-${square}`).getAttribute('data-side') ?? ''

    const started = sideOf()
    fireEvent.click(roomFirst!)
    fireEvent.click(screen.getByTestId(`place-${square}`))
    expect(sideOf(), 'the room did not place').not.toBe(started)
    fireEvent.click(roomSecond!)
    fireEvent.click(screen.getByTestId(`place-${square}`))
    expect(sideOf(), 'the room must clear on a re-tap too').toBe('')
  })
})

describe('the painter the room uses is the painter the board record uses', () => {
  it('draws a placed piece as art, not as a letter', () => {
    mount(sliceContentSource)
    fireEvent.click(screen.getByTestId('editor-tab-library'))
    fireEvent.change(screen.getByTestId('editor-kind'), { target: { value: 'board' } })
    fireEvent.click(screen.getAllByTestId(/^library-open-/)[0]!)
    fireEvent.click(screen.getByTestId('board-mode-place'))
    const cells = screen.queryAllByTestId(/^board-place-[a-z][1-9]/)
    const occupied = cells.filter((cell) => (cell.getAttribute('data-side') ?? '') !== '')
    expect(occupied.length, 'the fixture board ships no placements — pick another').toBeGreaterThan(0)

    // `·` for empty and `w` / `b` for occupied was the entire old rendering, and
    // it is what a child had to decode. Asserting its ABSENCE rather than the
    // presence of art is deliberate: whether a given fixture piece resolves to a
    // drawable mark belongs to the art registry's tests, not to this one, and an
    // `expect(children).toBeGreaterThan(0)` here fails for a piece whose art is
    // legitimately `none`.
    for (const cell of cells) expect(within(cell).queryByText(/^[·wb]$/), cell.getAttribute('aria-label') ?? '').toBeNull()

    // What replaced the letter has to be RIGHT, not merely present. This crosses
    // the rendering against the model: a square shows a side exactly when the
    // draft holds a placement there. (The first version of this line asserted
    // `occupied.every(c => c.dataset.side !== '')` over a list built by that same
    // predicate — true for every possible implementation, which is the repo's
    // most-repeated test defect and not a check at all.)
    const placedAt = new Set(
      ((draft().placements ?? []) as Array<{ square: string }>).map((p) => p.square),
    )
    for (const cell of cells) {
      const square = String(cell.getAttribute('aria-label'))
      expect((cell.getAttribute('data-side') ?? '') !== '', `${square} drew the wrong occupancy`).toBe(
        placedAt.has(square),
      )
    }
    expect(placedAt.size, 'the fixture board ships no placements to cross-check').toBeGreaterThan(0)
  })
})
