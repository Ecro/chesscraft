import type { Mark } from './resolve'
import { ImageMark } from './ImageMark'

/**
 * The mark's body, inside whichever wrapper the call site already had.
 *
 * The wrappers are untouched on purpose — they carry the layout, and the
 * board-render suite reads their text. Only what goes *inside* changes.
 *
 * **`alt=""` is safe for two different reasons, and the difference matters.**
 * The image itself is decorative, while `.square-mark`, `.card-icon`,
 * `.rule-icon` and `.legend-icon` are also `aria-hidden` wrappers. **`.piece`
 * is NOT `aria-hidden`** — it is safe only because `squareLabel`
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
  if (mark.kind === 'art') {
    // `alt=""`, not a name: the image is decorative, and the square's own
    // `aria-label` names the type in words when the wrapper is not hidden.
    return <ImageMark src={mark.src} />
  }
  return <>{mark.text}</>
}
