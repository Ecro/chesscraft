---
type: review
task_slug: ui-ux-productization
status: APPROVED
created: 2026-08-06
reviewers_invoked: [code-reviewer, ux-reviewer]
consensus_method: single
grade_threshold: B
final_grade: B
human_review_needed: true
drift_verdict:
  result: scope_violation
  scope_violations:
    - src/main.tsx
  scenario_misses: []
  task_slug: ui-ux-productization
  computed_at: 2026-08-06T02:55:00Z
---

# REVIEW — PLAN Phase 1 (tokens, dark mode, UI-chrome localisation)

## 🎯 Round Summary

| Round | Grade | Fixes applied | Remaining | New |
|---|---|---|---|---|
| 1 (init) | C | — | 4 in-scope P1 · 2 P2 · 1 P3 | — |
| 2 (auto-fix) | B | 6 | 2 deferred P1 (recorded as new gaps) | 0 |

`ux-reviewer` is **not** in `harness.yaml.reviewers.enabled` (which holds
`code-reviewer` alone). It was added for this run because the diff is entirely
UI — CSS, i18n copy and JSX — and the agent is installed. `consensus: single`,
so the two reviewers' findings were never merged with each other; each is
recorded as its own source.

## 🔍 Drift Findings

| Severity | Finding | Verdict |
|---|---|---|
| P1 | **`src/main.tsx` is outside Phase 1's `Scope in`** — it gained the two-line `tokens.css` import. | Real drift, necessary change. Without the import nothing else in the phase takes effect. Recorded rather than retro-fitted into the PLAN: the PLAN's scope list was wrong, and that is the useful signal for the next phase's scoping. |
| P1 | **`src/ui/i18n.ts` is in `Scope in` and did not change.** | Real, and the PLAN over-scoped. `translate()`'s signature change belongs to Phase 8 (ADR-020); Phase 1 needed nothing from this file. |

No scenario misses — this slug has no SPEC, so Phase A authored tests from the
phase's exit criterion instead.

## 📝 Findings (all `manual-only` — single-source under `consensus: single`)

### Fixed this round

| # | Sev | Source | Finding | Fix |
|---|---|---|---|---|
| 1 | P1 | code-reviewer | `--color-text-subtle` on `--color-board-light` computed ≈2.2:1 (light) and ≈3.3:1 (dark) — below the 4.5:1 AA floor, and `.square .coord` renders it at 9px, too small for the large-text exemption. Values authored in this diff. | Light `#a8a29e`→`#6b6560` (≈5.0:1), dark `#8b8378`→`#b8b0a4` (≈5.9:1). |
| 2 | P1 | ux-reviewer | Dark-theme `--color-side-white` (L≈0.540) and `--color-side-black` (L≈0.545) sat at the same lightness, so the dark palette left **hue alone** to distinguish the two armies — the exact failure tokens.css's own header says must not happen. | `--color-side-black` `#fca5a5`→`#f87171` (L≈0.329), restoring a real lightness gap while keeping ≈4.6:1 against the dark board. |
| 3 | P2 | code-reviewer + ux-reviewer (independent) | tokens.css claimed sides are separated "by hue AND by weight"; no selector set a per-side `font-weight`. A comment asserting an accessibility property that does not exist. | Added `font-weight: 800` to `.square[data-side='black'] .piece` (white stays 600) and rewrote the comment to say where the weight half lives — including that review found it claimed before it existed. |
| 4 | P2 | code-reviewer | `--color-focus` declared in all three cascade layers, referenced nowhere; its value was an exact clone of `--color-selected`. | Removed. Phase 6 introduces it together with the `:focus-visible` rule that uses it. |
| 5 | P1 | ux-reviewer | `--color-board-dark` declared in all three layers, referenced nowhere — **the board renders a single flat colour with no checker pattern at all**, in every theme. | Token removed. The checker itself is recorded below as a new gap for Phase 4. |
| 6 | P2 | ux-reviewer | `ui.result.win: '승리'` (noun) and `ui.result.draw: '비겼어요'` (해요체 sentence) render in the same banner slot, one reading as a scoreboard label and the other as a spoken remark. | `ui.result.draw` → `'무승부'`, matching the noun register of its sibling. |
| 7 | P3 | ux-reviewer | `ui.preset.label: '놀이 종류'` names the widget, contradicting the bundle's own stated rule (and its siblings `놀기` / `만들기`, which are verbs). | → `'놀이 고르기'`. |

### Deferred with reasons

| Sev | Source | Finding | Why not fixed here |
|---|---|---|---|
| P1 | ux-reviewer | Painted-square gradient sits ≈1.03:1 (light) / ≈1.11:1 (dark) from the plain square — far under the 3:1 non-text floor, so AC-018's "distinguishable at a glance" clause is carried almost entirely by the 1px accent border. **Pre-existing** (the old `#f5f5f4` square vs `#fef3c7` stripe was equally flat), not introduced here. | Raising the fill's contrast pushes piece text toward illegibility on the same square — a trade-off that needs the board in front of a person, not a blind palette guess. Belongs with Phase 6's manual device check; recorded as **gap #42**. |
| P1 | code-reviewer | `{state.result.reason}` renders the raw engine enum (`king_capture` / `win_action` / `material_cap`) to the player on every completed match. | Already tracked: RESEARCH gap #5, assigned to **Phase 2**. Untouched by this diff. |
| P1 | code-reviewer | The preset `<select>` renders raw ids although every preset carries a translated `nameKey`. | Already tracked: RESEARCH gap #17, assigned to **Phase 2**. Untouched by this diff; both reviewers independently confirmed it is pre-existing. |
| P2 | ux-reviewer | `data-theme` is write-only — no component sets it, so only the `prefers-color-scheme` layer is reachable by a real user. | Honest deferral, not a dead feature: the CSS half is Phase 1's, the control is Phase 6's (settings). Noted on PLAN Phase 1's status line so it is tracked rather than assumed done. |

## 🆕 Gaps discovered by this review (append to the RESEARCH inventory)

- **#41 — the board has no checker pattern.** Every square renders the same
  colour in every theme; `Play.tsx` assigns no file+rank parity. This is not in
  the original 40-gap audit because the audit read the board as "plain", not as
  "missing the single most recognisable affordance a chess board has". Owner:
  **Phase 4** (board rendering) — needs a `data-parity` attribute and the
  `--color-board-dark` token this round removed as dead.
- **#42 — painted squares do not meet non-text contrast.** See the deferred P1
  above. Owner: **Phase 6**, with a device check.
- **Test-design finding (no severity — process).** `chrome-i18n.test.tsx` scans
  JSX **text nodes**, so it structurally cannot see an English string that
  arrives as the runtime *value* of an expression (`{state.result.reason}`,
  `{id}`, `{side}`). Phase 2 localises exactly those, so its tests must assert
  on **rendered output**, not on source literals. Recorded here because the
  weakness is invisible from the test's own green result.

## 🤝 Disagreements

None. The two reviewers overlapped on exactly one item (the "hue AND weight"
overclaim) and agreed on both its substance and that it was not a runtime
failure today; `ux-reviewer` additionally traced it into the dark palette, which
`code-reviewer` did not, and that trace is what turned a documentation nit into
finding #2.

## Review Iteration Summary

| Iteration | Grade | Fixes Applied | Remaining | New |
|-----------|-------|---------------|-----------|-----|
| 1 (init)  | C     | —             | 7         | —   |
| 2         | B     | 6             | 4         | 0   |

Final grade: **B** (threshold B — met)
Iterations used: 2 / 2
Exit reason: converged
Status: **APPROVED**
human_review_needed: **true**

⚠️ **Grade B but 3 unverified severe findings remain** (`manual-only` P1: the
painted-square contrast, and the two Phase-2-tracked leaks). Under
`consensus: single` every finding is single-source by construction, so none of
them could be consensus-verified. Two are tracked in later PLAN phases; the
third is a real deferred defect with a stated reason. Human review before
wrapup is the correct next step, not an automatic pass.
