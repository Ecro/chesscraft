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
  it('starts from a single lit cell that says both', () => {
    // Not vacuous: if the seed ever changes, the cycle count below is wrong and
    // this names why rather than failing somewhere confusing.
    blankPiece()
    expect(seeded().getAttribute('data-value')).toBe('3')
    expect(screen.queryByTestId('piece-no-moves')).toBeNull()
  })

  it('turning the only lit cell off actually turns it off', () => {
    blankPiece()
    fireEvent.click(seeded())
    expect(seeded().getAttribute('data-value'), 'the click was swallowed').toBe('0')
  })

  it('says what is missing once nothing is left to walk on', () => {
    blankPiece()
    fireEvent.click(seeded())
    expect(screen.getByTestId('piece-no-moves')).toBeTruthy()
  })

  it('reports the empty movement through the same validator the save uses', () => {
    blankPiece()
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
    fireEvent.click(screen.getByTestId('piece-cell-1,2'))
    // Reads back as "both" after ONE tap, not "move". That is the schema's own
    // default surfacing, not a miscount: an omitted `attack` means captures use
    // the movement patterns, so a move square IS a capture square until the
    // author gives the piece a separate capture set. `readGrid` shows what the
    // record means rather than what was tapped.
    expect(screen.getByTestId('piece-cell-1,2').getAttribute('data-value')).toBe('3')
    expect(draft().movement).toEqual([{ kind: 'step', vectors: [[1, 2]] }])
    expect(screen.queryByTestId('piece-no-moves')).toBeNull()
  })

  it('the same holds for the last slide direction', () => {
    blankPiece()
    // Clear the seeded cell, put a slide on, then take the slide off again.
    fireEvent.click(seeded())
    fireEvent.click(screen.getByTestId('piece-slide-n'))
    expect(draft().movement).toEqual([{ kind: 'slide', vectors: [[0, 1]] }])
    fireEvent.click(screen.getByTestId('piece-slide-n'))
    fireEvent.click(screen.getByTestId('piece-slide-n'))
    fireEvent.click(screen.getByTestId('piece-slide-n'))
    expect(screen.getByTestId('piece-slide-n').getAttribute('data-value')).toBe('0')
    expect(screen.getByTestId('piece-no-moves')).toBeTruthy()
  })
})
