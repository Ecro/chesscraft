// @vitest-environment jsdom
/**
 * Clearing the last move square must be an EDIT, not a swallowed click.
 *
 * Review finding (round 1, P1). `commit` refused to write a grid `writeGrid`
 * rejected, on the reasoning that the draft should keep its last valid
 * movement. The consequence was the opposite of what the comment claimed: the
 * draft never changed, so `readGrid` returned the same grid, so the cell
 * re-rendered lit and `piece-no-moves` — the hint the comment says explains the
 * refusal — never rendered at all. The very first thing a child does with a
 * blank piece is tap its one seeded cell, and nothing happened.
 *
 * These tests drive the CLICK HANDLER rather than `writeGrid` directly, which
 * is the gap that let the bug through: every existing grid test exercises the
 * compiler, and the compiler was never wrong.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import React from 'react'
import { bundledContentSource } from '@content/sets/bundled'
import { Edit } from '../../src/ui/Edit'

afterEach(cleanup)

/** A brand-new piece, past the gallery, with its one seeded cell showing. */
function blankPiece() {
  render(React.createElement(Edit, { source: structuredClone(bundledContentSource), onCommit: () => {} }))
  fireEvent.change(screen.getByTestId('editor-kind'), { target: { value: 'piece' } })
  fireEvent.click(screen.getByTestId('gallery-blank'))
}

const seeded = () => screen.getByTestId('piece-cell-0,1')
const draft = () => JSON.parse(screen.getByTestId('editor-draft-json').textContent ?? 'null')

describe('emptying the grid from the UI', () => {
  it('starts from a single lit cell, painted for the question on screen', () => {
    // Not vacuous: if the seed ever changes, the tap counts below are wrong and
    // this names why rather than failing somewhere confusing.
    //
    // `data-value` became axis-scoped when the grid gained its movement/capture
    // mode: it says "painted for THIS question", so a seeded cell reads 1 in
    // movement mode rather than 3. The record still means "both" — an omitted
    // `attack` makes every move square a capture square — and that is what
    // `data-cells` carries and what the capture mode ghosts.
    blankPiece()
    expect(seeded().getAttribute('data-value')).toBe('1')
    expect(seeded().getAttribute('data-cells'), 'the record still captures where it walks').toBe('3')
    expect(screen.queryByTestId('piece-no-moves')).toBeNull()
  })

  it('turning the only lit cell off actually turns it off', () => {
    // Two taps, not one: a cell on a compass ray now visits leap and then ray
    // before going dark. The bug this guards is unchanged — the clear has to be
    // an EDIT rather than a swallowed click.
    blankPiece()
    fireEvent.click(seeded())
    expect(seeded().getAttribute('data-paint'), 'the first tap must reach the ray state').toBe('ray')
    fireEvent.click(seeded())
    expect(seeded().getAttribute('data-paint'), 'the click was swallowed').toBe('none')
  })

  it('says what is missing once nothing is left to walk on', () => {
    blankPiece()
    fireEvent.click(seeded())
    fireEvent.click(seeded())
    expect(screen.getByTestId('piece-no-moves')).toBeTruthy()
  })

  it('reports the empty movement through the same validator the save uses', () => {
    blankPiece()
    fireEvent.click(seeded())
    fireEvent.click(seeded())
    expect(draft().movement).toEqual([])
    // ADR-033: the live list is the save's own complaint, arriving earlier.
    expect(screen.queryByTestId('editor-live-errors')?.textContent ?? '').not.toBe('')
  })

  it('lets the author draw a different piece afterwards', () => {
    // The recovery path. An empty grid must be a state you can leave, or the
    // fix above would just trade a silent no-op for a dead end.
    blankPiece()
    fireEvent.click(seeded())
    fireEvent.click(seeded())
    fireEvent.click(screen.getByTestId('piece-cell-1,2'))
    // `data-cells` reads back as "both" after ONE tap. That is the schema's own
    // default surfacing, not a miscount: an omitted `attack` means captures use
    // the movement patterns, so a move square IS a capture square until the
    // author gives the piece a separate capture set. `readGrid` shows what the
    // record means rather than what was tapped; `data-value` shows which
    // question the cell is painted for.
    expect(screen.getByTestId('piece-cell-1,2').getAttribute('data-cells')).toBe('3')
    expect(screen.getByTestId('piece-cell-1,2').getAttribute('data-value')).toBe('1')
    expect(draft().movement).toEqual([{ kind: 'step', vectors: [[1, 2]] }])
    expect(screen.queryByTestId('piece-no-moves')).toBeNull()
  })

  it('the same holds for the last ray', () => {
    // Was "the last slide direction", driven through the dial. The dial is gone
    // and a ray is now a cell, so the claim is re-pointed rather than dropped:
    // taking the last ray off must reach the empty state and say so, exactly as
    // taking the last leap off does.
    blankPiece()
    const ring = () => screen.getByTestId('piece-cell-0,3')
    // From the seed: clear it, then put a ray on the ring cell.
    fireEvent.click(seeded())
    fireEvent.click(seeded())
    fireEvent.click(ring())
    fireEvent.click(ring())
    expect(draft().movement).toEqual([{ kind: 'slide', vectors: [[0, 1]] }])

    fireEvent.click(ring())
    expect(ring().getAttribute('data-paint')).toBe('none')
    expect(draft().movement).toEqual([])
    expect(screen.getByTestId('piece-no-moves')).toBeTruthy()
  })
})
