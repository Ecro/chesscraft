// @vitest-environment jsdom
import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { loadContentSet } from '../../src/content/load'
import { BUNDLED_PRESET_ID, bundledContentSource } from '../../src/content/sets/bundled'
import { MatchHost } from '../../src/ui/MatchHost'
import { makeTranslate } from '../../src/ui/i18n'

/**
 * The square's accessible name survives the mark becoming a picture.
 *
 * `.piece` is the ONE mark wrapper that is not `aria-hidden`, and the `alt=""`
 * on art inside it is safe for a different reason than everywhere else: the
 * enclosing `<button>` carries the piece's identity in its `aria-label`, built
 * by `squareLabel`. That is a guarantee living in another function, so an edit
 * there would take piece identity away from a screen-reader user with nothing
 * failing — and it would do so silently precisely when the glyph, which used to
 * carry the name as text, has been replaced by an image with an empty alt.
 *
 * Piece art does not exist yet (ADR-007's batch is a later phase), so this
 * pins the invariant the batch will depend on rather than the art itself.
 */

const translate = makeTranslate()

const load = () => {
  const r = loadContentSet(bundledContentSource)
  if (!r.ok) throw new Error(`content must load: ${JSON.stringify(r.errors)}`)
  return r.set
}

describe('a square announces what is standing on it', () => {
  it('names the occupying piece in the button’s accessible name, not only in the glyph', () => {
    const content = load()
    const { container } = render(<MatchHost content={content} presetId={BUNDLED_PRESET_ID} newSeed={() => 1} />)

    const occupied = [...container.querySelectorAll('[data-testid^="sq-"]')].filter(
      (s) => (s.getAttribute('data-piece') ?? '') !== '',
    )
    expect(occupied.length, 'no occupied squares to check').toBeGreaterThan(0)

    for (const square of occupied) {
      const pieceId = square.getAttribute('data-piece')!
      const def = content.pieces.get(pieceId)
      const name = translate(def!.nameKey)
      const label = square.getAttribute('aria-label') ?? ''

      // The NAME, not the glyph. A label built from the glyph would keep
      // passing while announcing "♚" to a screen reader.
      expect(label, `${square.getAttribute('data-testid')} does not name ${pieceId}`).toContain(name)
    }
  })

  it('keeps the mark wrappers that are decorative out of the accessibility tree', () => {
    const content = load()
    const { container } = render(<MatchHost content={content} presetId={BUNDLED_PRESET_ID} newSeed={() => 1} />)

    // `.square-mark` duplicates information `squareLabel` already puts in the
    // button's name, so it must stay hidden; `.piece` must NOT be hidden by
    // this rule, because it is a child of the labelled button rather than a
    // sibling of the label.
    for (const mark of container.querySelectorAll('.square-mark')) {
      expect(mark.getAttribute('aria-hidden')).toBe('true')
    }
  })
})
