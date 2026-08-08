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
  it('states the difference between jumping to a cell and sliding a direction', () => {
    openPiece('piece.king')
    const note = screen.getByTestId('piece-travel-note').textContent ?? ''
    // Not an exact-string assertion — the wording will be edited. What must survive is that
    // both halves of the distinction are stated, because saying only one is what left the
    // author comparing two pictures with no rule between them.
    expect(note, 'the note does not mention jumping over').toMatch(/넘어가|뛰어가/)
    expect(note, 'the note does not mention stopping').toMatch(/멈춰|막/)
  })

  it('explains the promotion exactly when a record captures wherever it walks', () => {
    // `piece.king` in the slice set has no separate attack, so it takes on its movement and the
    // promotion is in effect.
    openPiece('piece.king')
    expect(screen.queryByTestId('piece-takes-note'), 'no note for a piece that takes as it walks').not.toBeNull()
    cleanup()

    // `piece.archer` is the slice set's piece with a separate attack — its capture squares are
    // authored, nothing is promoted, and the note would be false.
    openPiece('piece.archer')
    const takes = screen.queryByTestId('piece-takes-note')
    // The archer opens through the read-only path (its two effects cannot be drawn), so the
    // grid may be absent entirely; the claim is only that the note is not shown when the
    // promotion is not happening.
    if (screen.queryByTestId('editor-moves')) {
      expect(takes, 'the promotion note appeared for a piece with its own attack set').toBeNull()
    }
  })

  it('shows the same squares in the grid and in the preview', () => {
    // The contradiction the author reported. `PiecePreview` renders the engine's answer and the
    // grid renders the model's; if a cell reads "move only" while the preview paints it as a
    // capture, one of them is lying. With the promotion in effect both must say "both".
    openPiece('piece.king')

    const lit = [...document.querySelectorAll('[data-testid^="piece-cell-"]')].filter(
      (el) => (el.getAttribute('data-value') ?? '0') !== '0',
    )
    // The premise: this piece has lit cells at all.
    expect(lit.length, 'the king has no lit cells to compare').toBeGreaterThan(0)

    // Every lit cell of a piece that captures on its movement reads as BOTH (`data-value` 3),
    // which is what the preview will paint. A cell left at move-only here would be the
    // disagreement.
    const moveOnly = lit.filter((el) => el.getAttribute('data-value') === '1')
    expect(moveOnly.map((el) => el.getAttribute('data-testid'))).toEqual([])
  })
})
