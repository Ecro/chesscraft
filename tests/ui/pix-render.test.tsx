// @vitest-environment jsdom
import { render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Pix } from '@ui/art/Pix'
import { PIXEL_SPRITES } from '@ui/art/pixels'

/**
 * The one claim about `Pix`'s output that nothing else in this repo can make
 * (PLAN-art-grid-resolution Phase 1).
 *
 * **Why a new file rather than an assertion added to an existing suite.** Before this,
 * NOTHING asserted `Pix`'s `viewBox` or its sizing — not one test in the repo read either
 * attribute. That gap is invisible in a green run and catastrophic on a resolution change:
 * `Pix` is sized in `em`, so raising the cell count moves no rendered box, and
 * `e2e/maker-anchors.spec.ts` (relational geometry, no absolute sprite dimension) stays
 * green whether or not the `viewBox` follows. If the grid went to 24 and the `viewBox`
 * stayed at 12, every mark on the board would render as its top-left quadrant scaled up
 * and every automated gate in the suite would still pass — `e2e/art-rendered-contrast`
 * measures the contrast of whatever ink it finds, and finds plenty.
 *
 * **Why the constant is mocked rather than asserted at its real value.** At
 * `SPRITE_SIZE = 12`, `viewBox="0 0 12 12"` is produced identically by a derived
 * expression and by a hardcoded literal — the assertion would equal its own default and
 * could never catch the regression it exists for. That is
 * `[fail:test] assertion-equals-its-own-default` (count:4) in this repo's memory, and it
 * is the reason this file overrides the constant instead of reading it: only a value the
 * source could not have hardcoded distinguishes the two.
 *
 * 7 is chosen because it is not the grid size before the migration (12) or after it (24),
 * so this test keeps discriminating once `SPRITE_SIZE` moves.
 */
vi.mock('@ui/art/gates', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@ui/art/gates')>()
  return { ...actual, SPRITE_SIZE: 7 }
})

function svgOf() {
  const { container } = render(<Pix sprite={PIXEL_SPRITES.king} />)
  const svg = container.querySelector('svg.pix')
  if (!svg) throw new Error('Pix rendered no svg.pix — the component or its class changed')
  return svg
}

describe('Pix derives its coordinate system from the grid size', () => {
  it('takes its viewBox from SPRITE_SIZE, not from a literal', () => {
    // The mock is the whole test. A hardcoded `0 0 12 12` fails here; an expression over
    // SPRITE_SIZE passes. Verify by reverting the component to a literal and watching
    // this go red — a green run against a hardcoded box means the mock stopped applying.
    expect(svgOf().getAttribute('viewBox')).toBe('0 0 7 7')
  })

  it('stays sized in em, so a resolution change moves no rendered box', () => {
    // Every wrapper that holds a mark — a square, a card face, a tray tile, a legend
    // bullet — has a font-size tuned for it. Sizing in `em` is what lets the cell count
    // change without a single one of those rules being touched, and it is the reason the
    // geometric e2e assertions cannot see this work at all.
    const svg = svgOf()
    expect(svg.getAttribute('width')).toBe('1em')
    expect(svg.getAttribute('height')).toBe('1em')
  })

  it('still draws the sprite it was handed', () => {
    // Guards the obvious failure of "derive the viewBox" done by emptying the component:
    // a viewBox is only correct if there is a mark inside it.
    expect(svgOf().querySelectorAll('path, rect').length).toBeGreaterThan(0)
  })
})
