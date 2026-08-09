import { SPRITE_SIZE } from './gates'
import { type PixelSprite, DEFAULT_TINT } from './pixels'
import { layersOf } from './smooth'

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
 * **Rounded outlines, not rects (PLAN Phase 7).** Each colour's cells are traced into one
 * closed path per region and its corners are rounded (`smooth.ts`), so the mark keeps its
 * shape and loses the staircase. `shape-rendering` is left at its default because
 * antialiasing is now the point — `crispEdges` was correct for the rect renderer it replaced,
 * where it stopped a half-pixel of grey appearing on every one of ~60 axis-aligned boundaries.
 *
 * Approach A for this report was to drop `crispEdges` and keep the rects. It was built,
 * photographed at 26px and eliminated: the rects are axis-aligned and a 12x12 cell lands on
 * very nearly whole device pixels, so there was almost nothing to antialias. The blockiness
 * was the geometry.
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
      // Derived from `SPRITE_SIZE`, never a literal. Nothing about the RENDERED size
      // depends on this — the `1em` below owns that — so a stale viewBox is invisible to
      // every geometric assertion in the suite and shows up only as each mark being drawn
      // as its own top-left quadrant, scaled up. `tests/ui/pix-render.test.tsx` overrides
      // the constant to a value the source could not have hardcoded, which is the only
      // way to tell a derived box from a literal that happens to agree.
      viewBox={`0 0 ${SPRITE_SIZE} ${SPRITE_SIZE}`}
      width="1em"
      height="1em"
      aria-hidden="true"
      focusable="false"
      // `color`, not a fill on each rect: a `$` cell renders `currentColor`, so
      // one property tints the whole sprite and CSS can override it per surface
      // without this component knowing the surfaces exist.
      style={{ color: tint ?? DEFAULT_TINT }}
    >
      {layersOf(sprite).map((layer, i) => (
        // `fillRule="evenodd"` is what makes a hole a hole: `loopsOf` winds an outer boundary
        // and an enclosed one in opposite directions, so a ring draws as a ring without this
        // component knowing which of its paths is which.
        <path key={`${layer.fill ?? 'tint'}-${i}`} d={layer.d} fill={layer.fill ?? 'currentColor'} fillRule="evenodd" />
      ))}
    </svg>
  )
}
