---
type: spec
task_slug: mobile-grade-graphics
status: active
created: 2026-08-07
tags: [strange-chess, art, assets, contrast, accessibility]
summary: "What the 43-asset illustrated batch must satisfy to pass the gate that already exists"
---

# ART SPEC — the illustrated batch

This is the handoff for the art batch that `PLAN-mobile-grade-graphics` deferred
(ADR-002 fidelity, ADR-004 generated raster, ADR-005 contract-first). The
contract it describes is **already enforced in code** — every rule below is a
test that will fail, not a guideline. Where a rule has a number, the number is
read from `src/ui/tokens.css` at test time rather than copied here, so re-toning
the board re-runs the gate instead of silently invalidating this document.

## What has to be produced

| Group | Count | Sided? | Notes |
|---|---|---|---|
| Pieces | 6 × 2 = 12 | **Yes** (ADR-007) | 왕, 여왕, 룩, 나이트, 폰, 궁수 |
| Square types | 5 | No | 폭탄칸, 포탈, 신전, 성역, 늪 — one already exists as a flat placeholder (ADR-013) |
| Rule cards | 11 | No | |
| Skill cards | 15 | No | |
| **Total** | **43** | | |

Of these, only 6 have any chess-set equivalent, and every one of those sets is
copyleft — which is why `RESEARCH-mobile-grade-graphics` concluded that
producing one coherent set is both cleaner and legally simpler than sourcing.

## File contract

```
src/ui/art/<prefix>-<name>[-white|-black].webp
```

**The prefix is load-bearing, not a convention.** `e2e/art-contrast.spec.ts`
derives from it which surfaces the asset must clear, and an unrecognised prefix
is a hard failure rather than a skip — otherwise one badly-named file silently
exempts itself.

| Prefix | Surfaces it must clear | Why |
|---|---|---|
| `piece-` | checker tones **and** painted stripes | a piece stands wherever it is moved |
| `square-` | painted stripes only | a square mark is only ever drawn on a painted square |
| `card-` | card surface tones | never on the board |

`-white` / `-black` suffixes are required on pieces and forbidden elsewhere;
they are how the harness pairs the two armies.

**Assets are imported by `src/ui/art/registry.ts`, never placed in `public/`**
(ADR-009). `public/` is copied outside the Rollup bundle, so the generated
service worker never precaches it and the installed offline app renders nothing.
This is verified by `tests/build/precache.test.ts` against a real build, and the
failure mode was reproduced deliberately: a `public/`-style path string
type-checks, builds, and renders correctly in dev.

The registry must stay a **static literal map**. A template-string path builder
compiles and then resolves at runtime to a file the bundler was never told to
emit.

## Contrast rules the batch must pass

Run by `e2e/art-contrast.spec.ts`. Both thresholds are traceable to
`tokens.css`; neither may be lowered to admit art (this area's standing rule is
that neither contrast number may be improved by regressing the other).

1. **Surface separation — 3.30:1**, the checker figure `tokens.css` records.
   Measured at the **10th and 90th percentile** of opaque-pixel luminance, and
   the asset clears a surface when **either** end does.

   This is the single most important thing to understand before generating
   anything. It is not a loophole — it is the design this board already uses.
   `tokens.css` records that a glyph's *outline* carries its contrast while the
   fill carries hue, and the move dot goes further with a deliberate
   black-on-white sandwich so that whatever the square is, one of the two tones
   separates from it. **So: give every asset a strong outline whose luminance is
   far from its fill.** A flat, outline-less illustration has both percentiles
   sitting on the fill and cannot pass against surfaces on both sides of its own
   lightness — and the painted stripe is dark violet in the light theme and pale
   lavender in the dark one, i.e. exactly that case.

2. **Side separation — 2.75:1** between a piece's `-white` and `-black`
   variants, measured on the **mean**.

   The constraint behind the number: today the two armies separate by hue
   **and** weight **and** lightness, deliberately, because roughly one in twelve
   boys reads red/green poorly and a chess board is the worst possible place to
   learn that about yourself. Raster art inherits none of those tokens, so the
   whole safeguard has to be drawn in. **Two armies that differ only in hue will
   fail, and should.**

## Generation prompt constraints

Whatever generates these must be told, at minimum:

- One coherent style across all 43 — the same line weight, the same palette
  family, the same level of detail. Consistency reads as "commercial" far more
  than any single asset's quality does.
- A heavy dark outline on every subject, and a light inner rim where the subject
  is dark (rule 1 above).
- Square-transparent background, subject centred, generous margin: the mark is
  rendered at roughly 28 CSS px inside a ~55 px square, and at that size any
  detail below about 1/16 of the frame is gone.
- For pieces: the two variants are the SAME drawing in a light and a dark
  colourway, not two different drawings. Players read silhouette first.
- Authored at 192 px square, exported WebP quality ~90.

## Follow-ups this batch owns

- **The editor's art picker (ADR-008).** Deferred from the contract cycle on the
  grounds that Phase 9 was about to rebuild the editor's IA — which it since
  has. Once bundled records carry illustration and authored ones do not, a
  child's own piece is visibly second-class, which is the opposite of the
  content-platform thesis. This is a required scope item of the batch, not an
  open question.
- **Replace the placeholder.** `src/ui/art/square-bomb.webp` is a flat mark
  generated by `square-bomb.gen.py`, not the ADR-002 target (ADR-013). It ships
  only to keep the pipeline proven; delete the `artKey` line in `bundled.ts` to
  withdraw it.
- **Bundle budget.** The placeholder is 4.2 kB. 43 assets at that size is ~180
  kB, which the service worker precaches in full on install — measure before
  assuming it is free, and record the per-icon budget when the first real assets
  land.
- **Re-check the sided-pair gate.** It is `test.skip`-ped today because no sided
  art exists. The first `piece-*-white`/`-black` pair un-skips it, and that is
  the first time that rule will have run against a real file.
