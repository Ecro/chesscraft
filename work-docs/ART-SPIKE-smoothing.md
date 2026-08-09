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

## C — built, shipped, and REVERTED (PLAN-art-grid-resolution)

> **Verdict: the author looked at the finished 24x24 board and rejected it** — *"이번에 고친
> 해상도 높힌 작업은 너무 별로다"*. The whole change was reverted from `master` in the commit
> that follows `f75dded`; the two images the decision was made on are kept at
> `work-docs/art-baseline/final-compare-{desktop,mobile-portrait}.png`.
>
> **What that settles.** All three approaches have now been measured against the actual
> report ("너무 픽셀아트 느낌"), and only **B** survived: A could not move the geometry, C
> moved it and the author liked the result less than what it replaced. The grid is 12x12 and
> should stay there unless something changes the size a mark is drawn at — which is the real
> constraint, spelled out below.
>
> **Do not re-attempt C without new information.** The reason it disappointed is measured,
> not aesthetic guesswork: at the size this board draws a mark, a 24-grid cell is **1.42
> device pixels**, so most of the extra resolution has to be spent thickening the outline
> just to hold the legibility floor. What is left over buys very little visible detail. The
> thing that would change that answer is a larger rendered mark, not a finer grid.
>
> The account below is kept as written, because the cost findings are what make the verdict
> reusable.

### The record of what was built

C was the re-plan ADR-006 called for, and it happened: the grid is **24×24**, reached by a
lossless 2× block expansion of all 209 committed tables, after which the 12 piece sprites a
player actually sees were redrawn by hand. 16 was rejected on evidence — 12→16 is 4/3 with no
lossless migration path, so nearest-neighbour would turn a one-cell outline into an
alternating one/two-cell edge and read as *more* staircase.

**Two premises in the framing were false and both were checked before planning.** There is no
sprite generator to "regenerate" with — `scripts/gen-sprites.ts` scores candidates, it does
not draw them, so all 209 tables are hand-authored and 84 of them exist twice. And a
mechanical 2× upscale is a visual **no-op**: it leaves the silhouette bit-identical, and
because `CORNER_RADIUS` is in cell units it actually makes marks *sharper* unless the constant
is doubled alongside. The migration is the enabling step; it is not the deliverable.

### What C actually cost, and what it actually bought

**Raising the grid halves the physical size of every feature.** A mark renders at 34px here,
so a 24-grid cell is **1.42 device pixels** where a 12-grid cell was 2.83. A one-cell outline
is thinner than the display can draw at strength, and it stops being a large enough share of
the ink for the rendered probe's 10th percentile to land on — so the mark fails the 3.30:1
floor **as rendered** while passing the character gate that only reads the table. Nine board
squares went red this way, and the cause was found by measurement rather than argument:
`CORNER_RADIUS` at 0.0, 0.3 and 0.6 all produced the same worst mark and the same nine
failures, so the rounding was not it. Outline share had fallen from 41–59% to as low as 14.5%
on every refined sprite while the untouched controls were unchanged.

The consequence for anyone raising a grid after this: **a meaningful share of the new
resolution has to be spent on a thicker outline, not on detail.** The net gain is real but
smaller than "four times the cells" suggests. Two metrics now hold the balance and they pull
in opposite directions on purpose — `subBlockDetail ≥ 20%` (a doubled 12×12 sprite scores 0%)
and `outlineShare ≥ 35%` — with `tintShare ≥ 30%` beside them so a silhouette still tells the
two armies apart. They live in `scripts/sprite-metrics.ts` and are enforced by
`tests/ui/art-refined-pieces.test.ts`.

### The radius, re-derived

`CORNER_RADIUS` 0.3 → **0.6**, the only value that holds the absolute radius steady across the
migration. The sweep is flat — 3.55:1 worst mark at every radius from 0.30 to 0.90 — and the
flatness is explained rather than shrugged at: the worst mark is a **painted square at 27px**
whose ratio is set by its palette tone, and rounding cannot change a fill. `smooth.ts` carries
the full table with the clamped-corner column beside it, because a sweep without that column
reads as "the radius is inert" when what is really happening is that `pathOf` clamps every
corner to a third of its shorter edge.

### Gate constants

`RECT_CAP` and `SHEET_DIVISOR` are now derived from `SPRITE_SIZE` rather than restated —
`5 * SPRITE_SIZE` and `(SPRITE_SIZE * 3) / 20`. Leaving the divisor at 1.8 would not merely
weaken the sheet-wide compression gate at 24×24, it would kill it: the upscaled dither fixture
clears a floor of 1.8 and is caught only by 3.6. The divisor is written as a fraction, not as
`0.15 * SPRITE_SIZE`, because those are **not** the same double — `0.15 * 12` is
1.7999999999999998 and the refactor would not have been behaviour-preserving.

## Still open

Nothing. A was eliminated on evidence, B shipped, and C was built, measured, shipped and
rejected by the author on sight. The spike is closed with one approach in the product and two
recorded as dead ends — both dead for reasons that are written down and checkable, which is
the only form in which a dead end is worth anything.
