import { type PixelSprite, DEFAULT_TINT, runsOf } from './pixels'

/**
 * One pixel sprite, drawn as SVG.
 *
 * Sized in `em` and nothing else. Every wrapper that used to hold a glyph — a
 * square, a card face, a tray tile, a legend bullet, a tab — already has a
 * `font-size` tuned for the mark that sits there, so `1em` puts the sprite
 * exactly where the glyph was at every call site with no new rule to keep in
 * step. A sprite with an intrinsic pixel size would burst the fixed-aspect
 * square the moment the board got narrower.
 *
 * `shape-rendering="crispEdges"` is what makes this a pixel sprite rather than
 * a blurry one: the default renderer antialiases rect edges, and at 12 pixels
 * across a half-pixel of grey on every boundary is most of the drawing.
 *
 * `aria-hidden` unconditionally, with no escape hatch. Every wrapper in this app
 * either sits inside an `aria-hidden` span already or has its identity named in
 * words by the enclosing control's `aria-label` (`squareLabel` is the one that
 * matters — see the note in `MarkBody`). Letting a caller pass a label here
 * would give a screen reader the same name twice on the surfaces that are
 * already correct, and would hide the fact that a NEW surface forgot to name
 * itself. The mark is decoration; the words are elsewhere, on purpose.
 */
export function Pix({ sprite, tint }: { sprite: PixelSprite; tint?: string | undefined }) {
  return (
    <svg
      className="pix"
      viewBox="0 0 12 12"
      width="1em"
      height="1em"
      shapeRendering="crispEdges"
      aria-hidden="true"
      focusable="false"
      // `color`, not a fill on each rect: a `$` cell renders `currentColor`, so
      // one property tints the whole sprite and CSS can override it per surface
      // without this component knowing the surfaces exist.
      style={{ color: tint ?? DEFAULT_TINT }}
    >
      {runsOf(sprite).map((run) => (
        <rect
          key={`${run.x},${run.y}`}
          x={run.x}
          y={run.y}
          width={run.w}
          height={1}
          fill={run.fill ?? 'currentColor'}
        />
      ))}
    </svg>
  )
}
