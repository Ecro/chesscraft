---
type: spike
task_slug: capture-rules-and-art-fixes
phase: 1
created: 2026-08-09
status: one-of-three-eliminated
summary: "Render-only smoothing cannot work — the blockiness is geometry, not rasterisation"
---

# Art smoothing spike (PLAN Phase 1, ADR-001 / ADR-006)

The report: "기물 그래픽을 조금만 더 매끄럽게. 너무 픽셀아트 느낌." ADR-001 refused to pick an
approach on paper and put three in front of the author's eye instead. This records what the
first one turned out to be worth.

## The three candidates

| | Approach | Cost | What it can change |
|---|----------|------|--------------------|
| **A** | Render-only: drop `shape-rendering="crispEdges"`, let the rasteriser antialias | One attribute | Edge softness only |
| **B** | Vector outline: `smooth.ts` turns the cell map into a marching-squares path with rounded corners | New module + contrast re-measure | The silhouette |
| **C** | Raise the grid to 16×16 or 24×24 | 125 sprites regenerated + every gate constant re-derived | The silhouette and the detail budget |

## A — measured, and eliminated

`shapeRendering` was switched from `crispEdges` to `geometricPrecision` and the sprite sheet was
photographed in the maker's art picker at its real rendered size (26px, `scale: device`).

**The difference is barely perceptible, and it could not have been otherwise.**
`shape-rendering` governs how rect EDGES are rasterised. The rects here are axis-aligned, and at
26px across a 12×12 sprite each cell is ~2.2 device pixels — the edges land on very nearly whole
pixels, so there is almost nothing for antialiasing to soften. **The pixel-art look is the
geometry, not the rasterisation.**

ADR-001 listed this as A's suspected trade-off ("cheapest, but it cannot remove the 12×12
silhouette"). It is now measured rather than suspected, and the change was reverted rather than
kept for looking like progress. `git diff src/ui/art/Pix.tsx` is empty.

## What that leaves

Both remaining options alter the silhouette, and both are larger than a phase:

- **B** needs the new render module plus a contrast re-measure at rendered CSS size, composited,
  over every surface a mark can land on. That is the whole of
  `[fail:test] measured-the-artifact-not-the-rendering`: smoothing MOVES the edge, and this
  board's legibility strategy puts the contrast ON the edge, so the gate has to be re-run rather
  than assumed to still hold.
- **C** is `[wiki] spare-art-pool-and-sprite-gates` in full: `RECT_CAP` and the sheet-wide
  compression floor re-derived **in `gates.ts` itself** (so `sprite-generator.test.ts`'s
  module-identity assertion still holds), `tests/ui/art-gates.test.ts`'s fixtures updated with
  them — it is pinned to the current 60 / 1.8 — and `scripts/run-spare-sprites.ts` re-run.
  ADR-006 already names this a re-plan trigger.

**Recommendation: B.** It keeps the authoring format, the 125 committed sprites and the
spare-pool census untouched, and it is the only option that changes what the author objected to
without regenerating the catalogue.

## B — built (PLAN Phase 7)

`src/ui/art/smooth.ts` traces each colour's cells into closed loops and rounds every corner with
a quadratic whose control point IS the corner, so the curve hugs the shape it replaces. `Pix.tsx`
draws one path per colour instead of ~40 rects, with `shape-rendering` back at its default
because antialiasing is now the point.

Per colour, not per sprite: a sprite is characters indexing a 25-entry palette, so there is no
single silhouette — there are up to 25 regions that happen to tile. `pixels.ts` is untouched, so
the 125 committed sprites, the spare-pool census and every constant in `gates.ts` still describe
exactly the data they were derived from.

**Radius 0.3 of a cell, and the number is measured rather than chosen by eye.** See the gate
section below: at 0.3 the worst rendered mark clears the contrast floor by 0.86; at 0.49 a new
worse case appears at 3.55:1, leaving 0.25. The visible softening between those two is small and
the margin difference is not.

## The gate this change broke, and the one that replaced it

`tests/ui/art-contrast.test.ts` measures a sprite's CHARACTERS. That was a complete measurement
while the renderer drew axis-aligned rects with `crispEdges` — `e2e/art-contrast.spec.ts` says so
in its own header, that the browser gate could move into a unit test "because the pixels are
already numbers". Rounded, antialiased outlines make that false: a rendered pixel is now a blend
the character grid never contained, thinner at every corner than the tone the unit gate credits.
The unit gate still passes, because a render change cannot make it fail — which is
`[fail:test] measured-the-artifact-not-the-rendering` exactly.

So `e2e/art-rendered-contrast.spec.ts` was written to measure the real thing, following that
failure's four rules: at the rendered CSS size, composited over the backdrop read from the DOM,
every visible pixel including partial alpha, and percentiles rather than the mean, passing when
either end separates.

Measured on the opening board at 34px, against a 3.30:1 floor:

| corner radius | worst rendered mark | margin |
|---------------|---------------------|--------|
| 0.3 (shipped) | **4.16:1** | +0.86 |
| 0.49 (max before clamping) | **3.55:1** | +0.25 |

Both figures come from the probe itself, by temporarily raising its floor to an unreachable value
and reading what it reported — the same method used to confirm it can fail at all.

## What the change also broke, and what that says

Two tests asserted on `rect` elements rather than on the property they were about, and both went
red: `e2e/contrast.spec.ts` looked for the outline tone among `querySelectorAll('rect')` and
concluded the glyph had no outline, and `e2e-pwa/offline.spec.ts` counted rects and reported "the
marks did not render offline". Neither was a contrast or an offline regression; both were a query
naming an element instead of a shape. Both now match `rect, path`. The first grep for this missed
the second one because it did not include `e2e-pwa/` in its search path.

## Still open

`work-docs/ART-SPIKE-smoothing.md` records that C (raising the grid to 16×16 or 24×24) remains
unbuilt and is a re-plan trigger under ADR-006. B changes the silhouette; C would change the
detail budget, which is a different request from the one that was made.
