// @vitest-environment jsdom
import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { PieceMoveRegion } from '@ui/PieceDetail'
import { makeTranslate } from '@ui/i18n'
import { shippedContent } from '../helpers/shipped'

/**
 * AC-005 — the move region renders EXACTLY ONE of {grid, undrawable notice}.
 *
 * This is a totality property over the whole shipped bundle rather than a
 * sample, and the reason is recorded rather than stylistic. `readGrid` returns
 * `null` for any piece it cannot round-trip — more than one pattern, two travel
 * kinds, a distance cap, an off-grid offset. A renderer that simply maps over
 * the returned grid draws NOTHING for those pieces and reports no error, which
 * is this repo's most-recurring failure class (absent-case = feature black
 * hole, count:8): the feature silently never fires for the inputs that
 * motivated it.
 *
 * So the assertion is deliberately not "the grid renders". It is that neither
 * branch can be skipped and neither can fire twice — a rendered-but-empty grid
 * satisfies NEITHER, which is what makes the empty case a failure instead of a
 * display state.
 */
describe('AC-005: the move region is total', () => {
  const t = makeTranslate()
  const pieces = [...shippedContent().pieces.values()]

  it('has pieces to check at all', () => {
    // Guards the vacuous pass: an empty bundle would make every case below
    // trivially true and the suite would report coverage it does not have.
    expect(pieces.length).toBeGreaterThan(0)
  })

  it.each(pieces.map((p) => [p.id, p] as const))(
    'renders exactly one of grid or notice for %s',
    (_id, piece) => {
      const { container } = render(<PieceMoveRegion piece={piece} t={t} />)

      const grid = container.querySelector('[data-testid="move-grid"]')
      const notice = container.querySelector('[data-testid="move-undrawable"]')

      // Exactly one branch fired.
      expect([grid, notice].filter(Boolean)).toHaveLength(1)

      if (grid) {
        // A drawing that claims nothing is the silent-blank outcome this test
        // exists to forbid — but "nothing" has to be asked of BOTH controls.
        // Sliding lives in its own row rather than in the grid (a finite grid
        // has no cell meaning "and keep going"), so a rook marks zero cells and
        // is still fully described. Requiring a lit cell would have failed
        // every sliding piece.
        const marked = grid.querySelectorAll('.move-cell[data-value]:not([data-value="0"])')
        const slides = container.querySelector('[data-testid="move-slides"]')
        expect(marked.length > 0 || slides !== null).toBe(true)
        if (slides) expect(slides.textContent?.trim()).toBeTruthy()
      } else {
        // The notice must say something — falling back to the raw key would
        // render the key itself, which reads as a content bug on screen.
        expect(notice?.textContent?.trim()).toBeTruthy()
        expect(notice?.textContent).not.toContain('ui.piece-info')
      }
    },
  )

  /*
   * The undrawable branch needs its own fixture, and the reason is a lesson
   * rather than a convenience.
   *
   * It used to be covered by real content: `piece.archer` was the shipped piece
   * `readGrid` could not round-trip. Then the editor's grid model grew slides
   * and a shared reach, `readGrid` learned to express more shapes, and every
   * bundled piece became drawable — so the enumeration above silently stopped
   * exercising the branch while still passing. A totality property that can
   * only ever take one of its two branches is half a test.
   *
   * The fixture is therefore deliberate: an offset outside the 7x7 the control
   * draws is something the detailed form can author and this grid cannot show.
   */
  it('shows the notice for a piece the grid cannot round-trip', () => {
    const offGrid = {
      id: 'piece.test-offgrid',
      nameKey: 'ui.side.white',
      textKey: 'ui.side.black',
      movement: [{ kind: 'jump', vectors: [[5, 0]] }],
    } as unknown as Parameters<typeof PieceMoveRegion>[0]['piece']

    const { container } = render(<PieceMoveRegion piece={offGrid} t={t} />)

    expect(container.querySelector('[data-testid="move-grid"]')).toBeNull()
    const notice = container.querySelector('[data-testid="move-undrawable"]')
    expect(notice?.textContent?.trim()).toBeTruthy()
    expect(notice?.textContent).not.toContain('ui.piece-info')
  })

  it('renders an automatic turning ray with a visible bend marker', () => {
    const turning = {
      id: 'piece.test-turning',
      nameKey: 'piece.test-turning.name',
      textKey: 'piece.test-turning.text',
      movement: [{ kind: 'turning_slide', vectors: [[1, 0]], turn: 'any' }],
    }

    const { container } = render(<PieceMoveRegion piece={turning as never} t={t} />)

    expect(container.querySelector('[data-testid="move-undrawable"]')).toBeNull()
    expect(container.querySelector('[data-testid="move-grid"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="move-turning-auto"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="move-turning-auto-row"]')?.textContent).toContain(
      t('ui.editor.piece.dir.e'),
    )
    expect(container.querySelector('[data-turning="true"]')).toBeTruthy()
  })
})

/**
 * A piece may now slide a different distance in each direction (ADR-001), and
 * this card is where a player finds that out mid-match.
 *
 * The previous renderer printed ONE reach word for the whole slide list, which
 * was true only while the model held one shared cap. Under a per-direction cap
 * it would have printed one of the two facts over the other — on the surface a
 * player consults precisely to decide whether a move is legal. That is a wrong
 * answer, not a missing one, which is why this is asserted here rather than left
 * to the editor's own tests.
 */
describe('a piece whose directions have different caps', () => {
  const t = makeTranslate()

  const mixed = {
    id: 'piece.probe-mixed',
    nameKey: 'piece.probe-mixed.name',
    textKey: 'piece.probe-mixed.text',
    movement: [
      { kind: 'slide', vectors: [[0, 1]], maxDistance: 2 },
      { kind: 'slide', vectors: [[1, 0]] },
    ],
  }

  it('says both caps rather than one of them', () => {
    const { queryAllByTestId } = render(<PieceMoveRegion piece={mixed as never} t={t} />)
    const lines = queryAllByTestId('move-slides')
    expect(lines.length, 'two different caps must produce two clauses').toBe(2)

    const caps = lines.map((el) => el.getAttribute('data-reach'))
    expect(caps, 'capped first, unbounded last').toEqual(['2', 'edge'])

    // Not a count check dressed up: the WORDS must differ, because two clauses
    // that read identically would be the same failure with extra markup.
    const said = lines.map((el) => el.textContent ?? '')
    expect(said[0]).not.toBe(said[1])
    expect(said[0]).toContain(t('ui.piece-info.reach.2'))
    expect(said[1]).toContain(t('ui.piece-info.reach.edge'))
  })

  it('still renders the grid, not the undrawable notice', () => {
    const { queryByTestId } = render(<PieceMoveRegion piece={mixed as never} t={t} />)
    expect(queryByTestId('move-undrawable'), 'a mixed-cap piece is drawable now').toBeNull()
    expect(queryByTestId('move-grid')).toBeTruthy()
  })
})
