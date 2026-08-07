import type { Mark } from './resolve'
import { Pix } from './Pix'

/**
 * The mark's body, inside whichever wrapper the call site already had.
 *
 * The wrappers are untouched on purpose — they carry the layout, and the
 * board-render suite reads their text. Only what goes *inside* changes.
 *
 * **`alt=""` is safe for two different reasons, and the difference matters.**
 * `.square-mark`, `.card-icon`, `.rule-icon` and `.legend-icon` are themselves
 * `aria-hidden`, so nothing inside them was ever in the accessibility tree.
 * **`.piece` is NOT `aria-hidden`** — it is safe only because `squareLabel`
 * puts the piece's identity into the enclosing `<button>`'s `aria-label`. That
 * is a different and more fragile guarantee: it lives in another function, and
 * an edit there would silently take piece identity away from screen readers
 * once art is what renders. `tests/ui/board-a11y.test.tsx` pins it.
 *
 * Sized in `em`, and inline rather than in a stylesheet: every one of those
 * wrappers already has a font-size tuned for the glyph the art replaces, so
 * `em` puts the picture exactly where the glyph sat, at every call site, with
 * no new rule to keep in step with five different wrappers. An unstyled `<img>`
 * would render at its intrinsic size and burst the fixed-aspect square.
 */
export function MarkBody({ mark }: { mark: Mark }) {
  if (mark.kind === 'none') return null
  // Sized in `em` by `Pix` itself, for the same reason the `<img>` below is:
  // the wrapper's font-size is what already positions the mark correctly on
  // five different surfaces.
  if (mark.kind === 'pixel') return <Pix sprite={mark.sprite} tint={mark.tint} />
  if (mark.kind === 'art') {
    // `alt=""`, not a name: every wrapper is already `aria-hidden`, and the
    // square's own `aria-label` names the type in words.
    return <img src={mark.src} alt="" style={{ width: '1.15em', height: '1.15em', objectFit: 'contain', verticalAlign: 'middle' }} />
  }
  return <>{mark.text}</>
}
