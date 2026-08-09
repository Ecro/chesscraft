// @vitest-environment jsdom
/**
 * AC-003 — what an unpainted capture grid means, and when `attack` appears.
 *
 * The schema says it by omission: no `attack` means captures use the movement
 * patterns. That is not a blank state and the maker must not draw it as one —
 * `readGrid` promotes every move square to "both", so the capture grid opens
 * already showing the squares this record takes on, which is the truth.
 *
 * The PLAN expected the opposite and budgeted a mitigation for it (ADR-003
 * called the first tap a "semantic cliff" that silently narrows capture to one
 * square, and specified ghost cells plus a seed button to soften it). Building
 * it showed there is no cliff: because of the promotion, a tap in capture mode
 * ADDS a square to a set that already holds the movement squares. The ghosts
 * were removed rather than shipped, because drawing the movement axis while a
 * tap edited the capture axis made the picture disagree with the control.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import React from 'react'
import { bundledContentSource } from '@content/sets/bundled'
import { Edit } from '../../src/ui/Edit'

afterEach(cleanup)

function blankPiece() {
  render(React.createElement(Edit, { source: structuredClone(bundledContentSource), onCommit: () => {} }))
  fireEvent.change(screen.getByTestId('editor-kind'), { target: { value: 'piece' } })
  fireEvent.click(screen.getByTestId('gallery-blank'))
}

const draft = () => JSON.parse(screen.getByTestId('editor-draft-json').textContent ?? 'null')
const cell = (k: string) => screen.getByTestId(`piece-cell-${k}`)
const painted = () =>
  [...document.querySelectorAll('[data-testid^="piece-cell-"]')]
    .filter((el) => (el.getAttribute('data-paint') ?? 'none') !== 'none')
    .map((el) => el.getAttribute('aria-label'))
    .sort()

describe('AC-003 — an unpainted capture grid omits attack', () => {
  it('starts with no attack at all, rather than a duplicate of movement', () => {
    blankPiece()
    expect(draft().movement).toEqual([{ kind: 'step', vectors: [[0, 1]] }])
    expect('attack' in draft(), 'the field is omitted, not written out').toBe(false)
  })

  it('shows the movement squares on the capture grid, because that is what it captures on', () => {
    blankPiece()
    const move = painted()
    fireEvent.click(screen.getByTestId('piece-mode-capture'))
    expect(screen.getByTestId('piece-capture-follows'), 'the screen must say why these are lit').toBeTruthy()
    expect(painted(), 'the capture grid must not open blank').toEqual(move)
  })

  it('writes attack the moment the capture set stops matching the movement set', () => {
    blankPiece()
    fireEvent.click(screen.getByTestId('piece-mode-capture'))
    fireEvent.click(cell('1,2'))
    expect(draft().attack).toEqual([{ kind: 'step', vectors: [[0, 1], [1, 2]] }])
    expect(draft().movement, 'the movement half must not move').toEqual([{ kind: 'step', vectors: [[0, 1]] }])
  })

  it('drops attack again once the two sets match', () => {
    blankPiece()
    fireEvent.click(screen.getByTestId('piece-mode-capture'))
    fireEvent.click(cell('1,2'))
    expect('attack' in draft()).toBe(true)
    // Off again: leap -> ray -> none. Two taps, because (1,2) is not on a ray —
    // it goes straight back to nothing.
    fireEvent.click(cell('1,2'))
    expect('attack' in draft(), 'an equal capture set must omit the field, not duplicate it').toBe(false)
  })

  it('a capture-only square is expressible, and does not become a move square', () => {
    blankPiece()
    fireEvent.click(screen.getByTestId('piece-mode-capture'))
    fireEvent.click(cell('1,1')) // on a ray: one tap is a leap
    const d = draft()
    expect(d.attack).toEqual([{ kind: 'step', vectors: [[0, 1], [1, 1]] }])
    expect(d.movement, 'the capture tap leaked into movement').toEqual([{ kind: 'step', vectors: [[0, 1]] }])

    fireEvent.click(screen.getByTestId('piece-mode-move'))
    expect(painted(), 'the movement grid gained a square it was never told about').toEqual(['0,1'])
  })

  it('the note appears only while captures actually follow the movement', () => {
    blankPiece()
    fireEvent.click(screen.getByTestId('piece-mode-capture'))
    expect(screen.queryByTestId('piece-capture-follows')).toBeTruthy()
    fireEvent.click(cell('1,2'))
    expect(
      screen.queryByTestId('piece-capture-follows'),
      'the note claims captures follow the movement after they stopped doing so',
    ).toBeNull()
  })
})

describe('clear empties the question on screen, not both of them', () => {
  it('in movement mode it leaves the piece with nowhere to walk, and says so', () => {
    blankPiece()
    fireEvent.click(cell('1,2')) // a second move square
    fireEvent.click(screen.getByTestId('piece-clear'))
    expect(draft().movement).toEqual([])
    expect(screen.getByTestId('piece-no-moves'), 'an empty grid must be a state you can see').toBeTruthy()
  })

  it('in capture mode it restores "captures wherever it walks" rather than emptying the piece', () => {
    blankPiece()
    fireEvent.click(screen.getByTestId('piece-mode-capture'))
    fireEvent.click(cell('1,2'))
    expect('attack' in draft(), 'the fixture never diverged, so the clear proves nothing').toBe(true)

    fireEvent.click(screen.getByTestId('piece-clear'))
    expect('attack' in draft(), 'clearing the capture grid must omit the field, not empty the piece').toBe(false)
    expect(draft().movement, 'the movement half was cleared by the capture mode button').toEqual([
      { kind: 'step', vectors: [[0, 1]] },
    ])
    expect(screen.queryByTestId('piece-no-moves')).toBeNull()
  })

  it('clearing an axis that was SLIDING leaves no cap behind to resurface', () => {
    // The reviewer's one noted gap: every other clear test uses leap cells, so
    // the dead-cap argument for slides rested on code inspection alone. A stale
    // `reach` is inert only while nothing reads it without the matching slide
    // bit — this drives the sequence that would expose it if that stopped being
    // true.
    blankPiece()
    fireEvent.click(cell('0,2')) // the seed is at (0,1), so (0,2) starts empty
    fireEvent.click(cell('0,2')) // ...leap, then a two-square ray north
    expect(draft().movement).toContainEqual({ kind: 'slide', vectors: [[0, 1]], maxDistance: 2 })

    fireEvent.click(screen.getByTestId('piece-clear'))
    expect(draft().movement, 'the ray survived a clear').toEqual([])

    // Re-paint the SAME direction at a different distance. Had the cleared cap
    // survived, this would come back capped at 2 rather than at 1.
    fireEvent.click(cell('0,1'))
    fireEvent.click(cell('0,1'))
    expect(draft().movement).toEqual([{ kind: 'slide', vectors: [[0, 1]], maxDistance: 1 }])
  })

  it('the axis mask holds while there is still a movement square to hold it against', () => {
    // The axis mask asserted from the other side: clearing one question must not
    // take the other's answers with it — for as long as the record is still
    // expressible at all.
    blankPiece()
    fireEvent.click(screen.getByTestId('piece-mode-capture'))
    fireEvent.click(cell('2,0'))
    fireEvent.click(screen.getByTestId('piece-mode-move'))
    fireEvent.click(cell('1,2')) // a second move square, so clearing one leaves one
    fireEvent.click(cell('1,2'))
    expect(draft().attack, 'the capture square was lost while movement still existed').toEqual([
      { kind: 'step', vectors: [[0, 1], [2, 0]] },
    ])
  })

  it('emptying the movement half drops the capture half too, and that is deliberate', () => {
    // Keeping it was tried and reverted. Once the two axes diverge the promotion
    // is materialised, so a leftover `attack` cannot be told apart from an
    // artefact — and holding an artefact would suppress the promotion for every
    // square painted afterwards, giving a piece that quietly stopped capturing
    // where it walks. The reason lives at the branch in `RecordForm`; this pins
    // the behaviour so the next attempt meets the argument first.
    blankPiece()
    fireEvent.click(screen.getByTestId('piece-mode-capture'))
    fireEvent.click(cell('2,0'))
    fireEvent.click(screen.getByTestId('piece-mode-move'))
    fireEvent.click(screen.getByTestId('piece-clear'))
    expect(draft().movement).toEqual([])
    expect('attack' in draft()).toBe(false)
    expect(screen.getByTestId('piece-no-moves'), 'and the empty state is visible').toBeTruthy()
  })
})

describe('a tap never moves a ray on the mode you are not looking at', () => {
  /**
   * The round-2 review finding, asserted where a child would meet it.
   *
   * The model-level version lives in `movement-cell-cycle.test.ts`; this drives
   * the real form, because the defect was about what the SCREEN shows after a
   * tap and both of its earlier repairs passed model-level checks.
   */
  it('the capture ray takes the tapped distance and the movement ray keeps its own', () => {
    blankPiece()
    // Movement: north, one square. The seed is already at (0,1), so one more tap
    // takes that cell from leap to a one-square ray.
    fireEvent.click(cell('0,1'))
    expect(cell('0,1').getAttribute('data-paint')).toBe('ray')
    expect(draft().movement).toEqual([{ kind: 'slide', vectors: [[0, 1]], maxDistance: 1 }])

    // Capture: north, all the way out.
    fireEvent.click(screen.getByTestId('piece-mode-capture'))
    fireEvent.click(cell('0,3'))
    fireEvent.click(cell('0,3'))

    // The square that was tapped is the one that lit. This is the assertion the
    // adopt-rule repair failed: it drew (0,3) as untouched and quietly made
    // (0,1) the tip.
    expect(cell('0,3').getAttribute('data-paint'), 'the tapped square drew as untouched').toBe('ray')
    expect(cell('0,3').getAttribute('data-endless')).toBe('true')

    // And the movement half is exactly where it was left.
    fireEvent.click(screen.getByTestId('piece-mode-move'))
    expect(cell('0,3').getAttribute('data-paint'), 'the movement ray grew on a mode nobody was editing').toBe('none')
    expect(draft().movement).toEqual([{ kind: 'slide', vectors: [[0, 1]], maxDistance: 1 }])

    // The capture half carries the ray AND a leap at (0,1). That leap is the
    // seed's promoted capture bit, left behind when the movement half of that
    // same square became a ray: an omitted `attack` had made (0,1) a capture
    // square, and turning its MOVEMENT into a ray is not a statement about
    // capturing. Asserted rather than trimmed out of the fixture, because it is
    // the promotion's stickiness and a reader meeting it later should find it
    // pinned rather than surprising.
    expect(draft().attack).toEqual([
      { kind: 'slide', vectors: [[0, 1]] },
      { kind: 'step', vectors: [[0, 1]] },
    ])
  })
})
