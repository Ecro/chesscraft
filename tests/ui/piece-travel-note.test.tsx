// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import React, { useState } from 'react'
import type { ContentSource } from '@content/load'
import { sliceContentSource } from '@content/sets/slice'
import { Edit } from '../../src/ui/Edit'
import { TranslateContext, makeTranslate } from '../../src/ui/i18n'

/**
 * PLAN Phase 8 (ADR-007, ADR-008) — the two things the maker never said.
 *
 * The author's question was why the jump grid, the slide dial and the preview all exist, and
 * why "어떤 것들은 '이렇게 움직여요'랑 안 맞는 것들도 보여". Reading the code gave two answers
 * and neither was a rendering problem:
 *
 * 1. A lit cell compiles to `step` and JUMPS OVER whatever is in the way; a slide direction
 *    compiles to `slide` and STOPS at the first piece. At distance 1 the two are identical, at
 *    distance 2 they are not, and the screen said nothing about it — so with the preview's
 *    blocker in the path the same-looking setting produced different squares.
 * 2. A record with no capture cells takes wherever it walks (the schema's meaning for an
 *    absent `attack`), so `readGrid` promotes every move cell to "both". Correct, already
 *    implemented, and unexplained: tapping 이동 and watching the cell show 둘 다 looked like
 *    the tap had misfired.
 *
 * Both are now sentences on the form. This file pins that they are there, that the promotion
 * note appears exactly when the promotion is in effect, and — the part that matters — that the
 * grid's own marks and the preview's do not contradict each other in either state.
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

function openPiece(id: string) {
  render(<Host initial={structuredClone(sliceContentSource)} />)
  fireEvent.click(screen.getByTestId('editor-tab-library'))
  fireEvent.change(screen.getByTestId('editor-kind'), { target: { value: 'piece' } })
  fireEvent.click(screen.getByTestId(`library-open-${id}`))
}

afterEach(cleanup)

describe('the maker says how travel works (PLAN Phase 8)', () => {
  /**
   * The leap-versus-slide sentence is GONE, and its removal is the point.
   *
   * It existed because the two were drawn as separate pictures with no rule
   * between them, so the difference had to be said in words. The drawing now
   * says it: a leap is a mark on one square, a slide is a trail through the
   * squares it passes and an arrow where it keeps going. A sentence explaining a
   * distinction the picture already makes is the eighth surface, not the fix.
   *
   * What survives is the half the picture CANNOT make on its own — that an
   * unpainted capture grid means "captures wherever it walks" — and that moved
   * onto the capture mode itself, where the author is when the question arises.
   */
  it('the leap-versus-slide sentence is gone, because the drawing makes the distinction', () => {
    openPiece('piece.king')
    expect(screen.queryByTestId('piece-travel-note')).toBeNull()
    expect(screen.queryByTestId('piece-takes-note')).toBeNull()
  })

  it('says captures follow the movement exactly while they do', () => {
    // `piece.king` in the slice set has no separate attack, so it takes on its
    // movement and the note belongs.
    openPiece('piece.king')
    fireEvent.click(screen.getByTestId('piece-mode-capture'))
    expect(screen.queryByTestId('piece-capture-follows'), 'no note for a piece that takes as it walks').not.toBeNull()

    // One tap makes the capture set differ, and the claim stops being true.
    fireEvent.click(screen.getByTestId('piece-cell-2,0'))
    expect(
      screen.queryByTestId('piece-capture-follows'),
      'the note outlived the condition it asserts',
    ).toBeNull()
  })

  it('shows the same squares in the grid and in the preview', () => {
    // The contradiction the author reported. `PiecePreview` renders the engine's answer and the
    // grid renders the model's; if a cell reads "move only" while the preview paints it as a
    // capture, one of them is lying. With the promotion in effect both must say "both".
    openPiece('piece.king')

    const painted = () =>
      [...document.querySelectorAll('[data-testid^="piece-cell-"]')].filter(
        (el) => (el.getAttribute('data-paint') ?? 'none') !== 'none',
      )

    const inMovement = painted()
    // The premise: this piece has lit cells at all.
    expect(inMovement.length, 'the king has no lit cells to compare').toBeGreaterThan(0)

    // The record still means BOTH on every one of them — an omitted `attack` is
    // the schema saying captures follow the movement, and `data-cells` carries
    // what the record means as opposed to which question is on screen.
    expect(
      inMovement.filter((el) => el.getAttribute('data-cells') !== '3').map((el) => el.getAttribute('data-testid')),
      'a cell reads move-only while the preview will paint it as a capture',
    ).toEqual([])

    // And the capture side lights the SAME squares, with a line saying why —
    // which is where a child finds out that not painting anything there does not
    // mean "cannot capture". A blank capture grid would be the disagreement this
    // test exists to catch, wearing the mode toggle's clothes.
    fireEvent.click(screen.getByTestId('piece-mode-capture'))
    expect(screen.getByTestId('piece-capture-follows')).toBeTruthy()
    expect(painted().map((el) => el.getAttribute('data-testid')).sort()).toEqual(
      inMovement.map((el) => el.getAttribute('data-testid')).sort(),
    )
  })
})
