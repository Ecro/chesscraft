---
type: review
task_slug: ui-ux-productization
status: APPROVED
created: 2026-08-06
reviewers_invoked: [code-reviewer, ux-reviewer]
consensus_method: single
grade_threshold: B
final_grade: A
human_review_needed: false
drift_verdict:
  result: clean
  scope_violations: []
  scenario_misses: []
  task_slug: ui-ux-productization
  computed_at: 2026-08-06T07:20:00Z
---

# REVIEW — PLAN Phase 4 (schema v4 iconKey, glyphs, coordinate rails, checker)

## 🎯 Round Summary

| Round | Grade | Fixes applied | Remaining | New |
|---|---|---|---|---|
| 1 (init) | F | — | 1 P0 · 4 P1 · 2 P2 | — |
| 2 (auto-fix) | A | 7 | 1 recorded for Phase 6 | 0 |

## 🔍 Drift Findings

**`result: clean` — the first phase of four with no scope violation.**

Phases 1, 2 and 3 each drifted, and the failure recorded after Phase 3 was that
the PLAN listed the files a phase *creates* and omitted the ones it must touch to
make them reachable. Phase 4's scope was re-derived by tracing reachability
before it started, and every one of the ten changed files was in it — including
`src/editor/io.ts`, which the original one-line scope did not mention and whose
`SCHEMA_VERSION` gate is the only reason a v4 export can be re-imported at all.
That is the evidence the re-derivation was worth doing, not just tidier.

## 📝 Findings

### Fixed this round

| # | Sev | Source | Finding | Fix |
|---|---|---|---|---|
| 1 | **P0** | code-reviewer **+** ux-reviewer (first cross-reviewer agreement this cycle) | **The archer's icon was `🏹`, a colour emoji.** Browsers draw default-emoji-presentation characters from a COLR/CBDT font with its own palette, so CSS `color` and `font-weight` — the two side cues `tokens.css` commits to — are both ignored. Every archer rendered identically for both sides, on the variant's signature piece. | `♝`: monochrome, same family, inherits both cues, and it is the slot the archer occupies since Los Alamos has no bishops. Accepted cost: it reads as "bishop" to a chess-literate adult. |
| 2 | P1 | code-reviewer | **The contrast e2e never sampled the archer.** `.first()` binds to `a6` (a rook) in DOM order — parity 1, unpainted, occupied — which inherits `color` correctly and passes. The one glyph that structurally could not pass was not in the sample, so the P0 would have shipped green. | Iterates **every** occupied dark square, with the square and piece id in the failure message. |
| 3 | P1 | ux-reviewer | **The checker was 1.27:1 (light) and 1.22:1 (dark)** — two different strings describing a board a child reads as flat. The test asserted only that the two colours *differ*, which those values satisfy. Same defect class as #42, introduced fresh by this phase. | Tokens widened to 1.59:1 / 1.46:1 and the test now asserts a **luminance step**, not inequality. See the trade-off below — 3:1 was not reachable. |
| 4 | P1 | code-reviewer | **`iconKey` was absent from `textKeysOf`/`missingKeys`**, so a typo'd key would paint `piece.archer.icon` across a square with nothing to catch it — the exact class AC-016 covers for the other two keys. Worse, the render test computed its expectation with the same `translate` fallback, so both sides were equally wrong and the comparison passed. | `iconKey` joins the coverage walk; the test asserts the resolved value does not start with `piece.`. |
| 5 | P1 | ux-reviewer | **Relocating the coordinates did not make them readable.** The rail shipped at 9px muted — the same size that made them unreadable inside the square — and it is now the *only* visible source, since `title` does not fire on touch. | Its own `--font-size-coord` (13px) at full text colour. |
| 6 | P2 | code-reviewer | `pieceGlyph`'s fallback took the first character of `translate(nameKey)`, and `translate` returns the KEY when it cannot resolve — so an untranslated piece rendered a bare `p`, indistinguishable from a glyph. | Unresolved names render `?`. |
| 7 | P2 | ux-reviewer | 🏹 conveyed "ranged" loosely but not the archer's actual two-square, non-directional attack. | Moot after #1; the rules screen carries the mechanic, which is where it belongs. |

### The one thing review asked for that was NOT done, with numbers

`ux-reviewer` asked for a **≥3:1 checker** (WCAG 1.4.11). Measured, it is not
reachable while the pieces are tinted glyphs standing on those squares:

| light-theme dark square | checker | white piece | black piece |
|---|---|---|---|
| `#ded5c4` (shipped in round 1) | 1.27:1 | 4.60:1 | 4.44:1 |
| **`#c9bfa8` (shipped now)** | **1.59:1** | **3.67:1** | **3.54:1** |
| `#b8ab90` | 1.97:1 | 2.96:1 | 2.85:1 |
| `#a89b80` | 2.39:1 | 2.45:1 | 2.36:1 |

The two requirements trade on one axis: every step that makes the board more
legible makes the pieces less so. `#c9bfa8` is the darkest value keeping every
piece at or above 3.5:1. An **outlined glyph** would decouple them — a contrasting
`text-shadow` raises effective piece contrast independently of the square — but
that is a change whose result cannot be judged without a device, so it is
recorded for **Phase 6** rather than guessed at here. The dark theme is tighter
still: at a 1.88:1 checker the red side falls to 2.34:1.

## 🤝 Disagreements

None, and for the first time in this cycle the two reviewers **converged** — both
independently found the archer emoji, one by tracing the CSS cue contract and one
by reasoning about what a child sees. Every prior phase had disjoint finding sets
under `consensus: single`.

## Review Iteration Summary

| Iteration | Grade | Fixes Applied | Remaining | New |
|-----------|-------|---------------|-----------|-----|
| 1 (init)  | F     | —             | 7         | —   |
| 2         | A     | 7             | 0         | 0   |

Final grade: **A** (threshold B — met)
Iterations used: 2 / 2
Exit reason: converged
Status: **APPROVED**
human_review_needed: **false**

Verification after fixes: `npm run verify` GREEN — typecheck, build, 277 unit
tests, 41 Playwright tests.

## 📌 Carried to Phase 6

- Outlined piece glyphs, to decouple checker contrast from piece contrast; then
  revisit the board tokens against the table above.
- Gap #42 (painted-square gradient at ≈1.03:1) is still open and is the same
  measurement on a different pair.
