---
type: review
task_slug: mobile-grade-graphics
status: APPROVED
created: 2026-08-07
reviewers_invoked: [code-reviewer, ux-reviewer, codex]
consensus_method: single (config) — 3 independent voices in practice
drift_verdict:
  # Round 1 read `scenario_miss`; the missing ART-SPEC was written in the
  # auto-fix round, so only the scope violations remain — recorded and accepted
  # in the PLAN's Execution Record, not fixed.
  result: scope_violation
  scope_violations: [src/assets.d.ts, src/ui/art/MarkBody.tsx, src/ui/art/square-bomb.gen.py, playwright.config.ts, vitest.config.ts]
  scenario_misses: []
  scenario_misses_resolved: ["Phase 4's work-docs/ART-SPEC-mobile-grade-graphics.md — written in round 2"]
  task_slug: mobile-grade-graphics
  computed_at: 2026-08-07
---

# REVIEW — mobile-grade-graphics

## 🎯 Round 1 Summary

**Initial grade: B** (0 consensus-passed P0, 1 consensus-passed P1) with
`unverified_severe = true` (four further P1s at single source).
**Final grade: A** after one auto-fix round. Every finding was fixed; none was
accepted as risk.

Reviewer set: `reviewers.enabled` is `[code-reviewer]`, extended at runtime with
**ux-reviewer** — the change alters board rendering and the accessibility tree
(`alt=""`, `aria-hidden`), which is that reviewer's category and would otherwise
have gone unexamined. `second_opinion.models: [codex]` fired because
`hm high_diff classify` returned `is_high: true` (23 files, a contract path,
+1894 lines).

**Pass 1 (redacted) was skipped deliberately.** Its purpose is to stop reviewers
anchoring on each other; all three were dispatched in parallel with no shared
state and no visibility of each other's output, so anchoring could not occur.
Recorded rather than silently omitted.

## 🔍 Drift Findings

**P1 — incomplete phase.** Phase 4's scope named
`work-docs/ART-SPEC-mobile-grade-graphics.md`; the phase was marked DONE without
it. That document is the handoff that makes the 43-asset batch reproducible —
the filename contract, the surface classes, both thresholds and the generation
constraints. Without it Phase 4 delivered a gate and no way to build for it.
**Fixed:** written.

**P2 — scope drift, five files.** `src/assets.d.ts`, `src/ui/art/MarkBody.tsx`
and `src/ui/art/square-bomb.gen.py` are unlisted sub-parts of phases that named
their directory; `playwright.config.ts` was already recorded as a deviation in
the PLAN's Execution Record; `vitest.config.ts` is a genuine omission — Phase 3's
scope line lost it during the validator revision that introduced
`vitest.build.config.ts`. No behaviour outside the PLAN's intent; recorded, not
fixed.

## ✅ Consensus Findings

### P1 — the contrast harness measured the asset, not the rendering `[2/3]`

`code-reviewer` and `ux-reviewer` reached this independently from different
directions and agreed on the execution risk, which is what makes it consensus.

- **OBSERVE:** `luminanceOf` drew each asset onto a canvas sized
  `img.naturalWidth` (192px) and took percentiles there. `MarkBody` renders at
  `1.15em`, and `.square-mark[data-occupied='true']` drops the wrapper to
  `font-size: 12px` — a ~13.8px box.
- **TRACE:** `square-bomb.webp` carries a 9/192 ≈ 4.7% outline. At 13.8px that
  is ~0.65px, which the browser's downscale anti-aliases into the fill.
- **INFER:** the gate reads the outline's true ink value from the un-downscaled
  file while the player sees a smudge.
- **CONCLUDE:** Phase 4's stated purpose — "measured rather than eyeballed" —
  fails exactly for the reduced-size cue `styles.css` already special-cases, and
  would silently admit any asset in the 43-icon batch whose detail does not
  survive downscaling.

`ux-reviewer` added the sharper half: `.square-mark[data-occupied='true']`
declares its ring with **`text-shadow`, which does not apply to replaced
elements**, so the badge shipped with **no ring at all** — in the most common
board state there is, a piece standing on a painted square.

**Fixed, in three parts, because the two halves need different answers:**
1. `luminanceOf` now draws at the **rendered** CSS size (`renderPxFor`).
2. `.square-mark[data-occupied='true'] img` and `.square .piece img` declare a
   four-offset `drop-shadow` ring — the replaced-element equivalent, which
   rasterises against alpha. Declared in CSS px, so it does not shrink with the
   art. The `.piece` rule lands now rather than with the piece batch, because
   the batch is where it would be forgotten.
3. A new e2e test asserts the badge's computed `filter` is not `none`.

**A deliberate limit, stated rather than hidden:** the harness measures each
asset at its **primary** render size, not at the 13.8px badge. No reasonable
illustration carries a 3.3:1 outline unaided at that size, so demanding it would
reject every usable asset while the real rendering is fine — a false gate, the
same class of error as measuring against the wrong surface. The badge's ring is
carried by CSS and asserted separately.

## 📝 Manual-Only Findings (single source — all verified and fixed)

Configured `consensus` is `single`, so these are actionable rather than
advisory; each was checked against the code before being applied.

| # | Sev | Source | Finding | Resolution |
|---|-----|--------|---------|------------|
| 1 | P1 | codex | `luminanceOf` discarded α<128 and measured the rest **uncomposited** — a 50%-opacity dark edge scored as near-black though it renders halfway to the square beneath, and at 49% vanished from the sample | Every pixel above ~9% opacity now composited over the actual surface before measuring; the profile is re-measured per surface |
| 2 | P1 | codex | Surface selection came only from the filename prefix; nothing stopped a rule card pointing at a `square-` asset, which would then be gated against painted board tones and never against a card face | New structural test ties each record's `artKey` to a filename prefix matching that record's kind |
| 3 | P1 | ux-reviewer | `MarkBody`'s comment claimed `.piece` was `aria-hidden` like the other four wrappers. It is not — `alt=""` is safe there only because `squareLabel` puts the piece in the button's `aria-label`, a guarantee in another function. The next batch would read the comment and inherit a false invariant | Comment corrected to state the real mechanism; `tests/ui/board-a11y.test.tsx` pins that the button's accessible name still names the occupying piece |
| 4 | P2 | code-reviewer | `Rules.tsx` never passed `side`, and piece art is always a *sided* entry — so once the batch lands, no piece could **ever** show art on the one screen built to decode the icon vocabulary | `Group` takes a `side`; the piece group passes `white` |
| 5 | P2 | code-reviewer | `artId`'s regex allowed any number of segments, so `art.piece.rabbit` validated. The PLAN claimed the one-segment rule was enforced "over the whole catalogue"; only the content-id-echo half was | Regex tightened to `^art\.[a-z0-9-]+$`, plus a registry-wide test |
| 6 | P2 | code-reviewer | `resolveMark` returned `{kind:'art', src}` unconditionally once the shape matched, so an entry with an empty url would render `<img src="">` — which resolves against the document URL | Empty url is now a third degenerate case falling through to the glyph, with a test |
| 7 | P2 | codex | `square-bomb.gen.py` wrote to the session temp directory it was authored in, so the one thing a committed generator is for — reproducing the binary beside it — was the one thing it could not do | Writes to `Path(__file__).with_name(...)` |
| 8 | P2 | code-reviewer | `iconMark` evaluated twice per render site (guard + body) — correct, since it is pure, but it reads as if the two could differ | Hoisted at all four sites |

## 🤝 Disagreements

None. Where two reviewers touched the same code they agreed on the risk; the
`text-shadow`-on-`<img>` half was found only by `ux-reviewer` and is compatible
with, not contrary to, `code-reviewer`'s reading.

`code-reviewer` explicitly cleared several things `ux-reviewer` also cleared —
the six `resolveMark` branches, `1.15em` sizing against every wrapper's
font-size, the `piece-land` keyframe (it animates `.piece`'s transform, which
wraps the image), and `tones()`'s regex against the real `tokens.css`.

## ℹ️ Recorded, not fixed

**P3 — `tests/build/precache.test.ts` can pass against a stale `dist/`**
(code-reviewer). Run standalone it validates whatever build is lying there. This
is the acknowledged trade-off the PLAN already states: `verify` is the only place
`build` and `test:build` are ordered. Making the test rebuild would make it slow
and non-hermetic; making it compare timestamps would fail spuriously on a fresh
clone. Left as-is, with the limitation now written in two places instead of one.

## 🧊 Cross-model findings (frozen @ round 1)

| id | model | severity | disposition | file |
|----|-------|----------|-------------|------|
| `5672ee0ce5d8dbc6` | codex | P1 | accepted → fixed | `e2e/art-contrast.spec.ts` |
| `fc8f7dc6c0420c62` | codex | P1 | accepted → fixed | `e2e/art-contrast.spec.ts` |
| `817f0455e6b4ff88` | codex | P2 | accepted → fixed | `src/ui/art/square-bomb.gen.py` |

`status: invoked`, no skip reason. All three survived refutation: each names a
concrete input (a semi-transparent edge pixel; a card referencing a `square-`
asset; a second checkout) and each was reproduced against the code before being
applied.

## Review Iteration Summary

| Iteration | Grade | Fixes Applied | Remaining | New |
|-----------|-------|---------------|-----------|-----|
| 1 (init)  | B     | —             | 9         | —   |
| 2         | A     | 9             | 0         | 0   |

Final grade: **A**
Iterations used: 2 / 2
Exit reason: converged
Status: **APPROVED**
human_review_needed: **false**

Verification after the fix round: `npm run verify` green end to end —
typecheck, build, **420** unit, **3** build-output, **76** e2e (1 skipped: the
sided-pair rule, which has no real asset until the batch), **4** PWA e2e.
