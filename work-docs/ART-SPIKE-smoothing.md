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

## Phase 7's home

Before/after screenshots at all three shipped sizes (board square ≈28px, editor 26px, detail
sheet's large mark) belong in this file when Phase 7 lands, per its exit criterion.
