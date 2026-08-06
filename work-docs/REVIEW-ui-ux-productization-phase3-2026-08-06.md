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
  result: scope_violation
  scope_violations:
    - src/ui/styles.css
    - src/ui/Home.tsx
  scenario_misses: []
  task_slug: ui-ux-productization
  computed_at: 2026-08-06T05:35:00Z
---

# REVIEW — PLAN Phase 3 (FTUE: rules reference, coach marks, seen flag)

## 🎯 Round Summary

| Round | Grade | Fixes applied | Remaining | New |
|---|---|---|---|---|
| 1 (init) | C | — | 3 P1 · 4 P2 · 1 P3 | — |
| 2 (auto-fix) | A | 7 (+2 tests) | 0 | 0 |

## 🔍 Drift Findings

| Severity | Finding | Verdict |
|---|---|---|
| P1 | `src/ui/styles.css` (Phase 1's file) gained ~90 lines. | Half of it is **Phase 2's unpaid debt**: `.home`, `.seed`, `.result-panel`, `.primary` shipped as class names with no rules and rendered as browser defaults. Phase 2 should have carried its own CSS; Phase 3 paid it. |
| P1 | `src/ui/Home.tsx` (Phase 2's file) modified to add the `open-rules` control. | Necessary — the rules screen needs a door. Not anticipated by Phase 3's scope list. |

**Third phase in a row with the same shape.** Phase 1 spilled into `main.tsx`,
Phase 2 into seven e2e files, Phase 3 into `styles.css` + `Home.tsx`. The PLAN's
phase scopes list the files a phase *creates* and omit the files it must *touch
to make them live*. Phase 4 (`iconKey`) will hit `schema.ts`, `load.ts`, the
bundled content, `MatchHost` and e2e simultaneously — its scope should be
re-derived before it starts rather than discovered during it.

## 📝 Findings

### Fixed this round

| # | Sev | Source | Finding | Fix |
|---|---|---|---|---|
| 1 | P1 | code-reviewer | **`coach.ts` reproduced the loop its own docstring claimed to prevent.** Reads and writes do not fail together: a zero-quota storage answers `getItem` (null) and throws on `setItem`, so guarding only the read gave not-seen on every load and an unrecordable dismissal every time — the tutorial replays forever. The docstring asserted both calls fail together; they do not. | `hasSeenCoach` now probes writability when the flag is absent: a storage that cannot keep the answer is treated as having already given it. |
| 2 | P1 | ux-reviewer | **Coach card 1 restated `ui.home.tagline` almost verbatim**, on the same screen, directly below it. A child who learns card 1 is skippable stops reading card 4 — the only one carrying information not already visible. | Card dropped. |
| 3 | P1 | ux-reviewer | **`여기` pointed at nothing.** The coach is a sibling card, not a spotlight, so the one card whose entire content is a pointing gesture had no gesture. | Names the control by the label a child can read: `「놀러 가기」`. |
| 4 | P2 | ux-reviewer | Cards 2 and 3 narrated controls already on screen and labelled. | Merged into one; the sequence is now two cards — what to do, and where to look things up later. |
| 5 | P2 | ux-reviewer | The last step offered **`건너뛰기` and `알겠어요` side by side, both calling `onDone`** — two words for one action, when there is nothing left to skip. | Skip is hidden on the last step. |
| 6 | P2 | code-reviewer | **A detour restarted the introduction.** `Coach` held its own step index and the rules route unmounts it, so a child who read a card, tapped through to see what it meant, and came back was shown the sequence from the top — while `coaching` was still true. | The index moved to `App`, which owns the route that unmounts. |
| 7 | P2 | code-reviewer | `Rules.tsx`'s `entries()` typed `textKey` optional, so `boards` and `presets` — which have no `textKey` at all — were structurally assignable. A fifth Group added by copy-paste would have listed them with every description blank, with no compiler complaint. | `textKey` is required; the type is now the guard the file's comment claims. |
| 8 | P2 | ux-reviewer | 33+ entries in one flat scroll on a 360px phone, with no collapse — weak as the in-match reference the coach's own card promises. | Groups are `<details>`; pieces open, the rest collapsed. |

### Coverage added with the fixes

Both P1/P2 behavioural fixes shipped with tests, deliberately: Phase 2 taught
that a guard added without one is indistinguishable from no guard the moment its
predicate drifts, and that lesson is in `.claude/memory/failures.md`. Added: a
read-succeeds/write-throws storage asserting `hasSeenCoach` reports seen, and an
`App`-level test that a detour to the rules screen resumes the coach rather than
restarting it. The second one failed first against a stale import, not against
the fix — noted so the record is not read as "passed first try".

## 🤝 Disagreements

None; the reviewers' findings were disjoint again. Under `consensus: single`
that means five of the eight had exactly one witness — including both P1s.

## Review Iteration Summary

| Iteration | Grade | Fixes Applied | Remaining | New |
|-----------|-------|---------------|-----------|-----|
| 1 (init)  | C     | —             | 8         | —   |
| 2         | A     | 7 + 2 tests   | 0         | 0   |

Final grade: **A** (threshold B — met)
Iterations used: 2 / 2
Exit reason: converged
Status: **APPROVED**
human_review_needed: **false**

Verification after fixes: `npm run verify` GREEN — typecheck, build, 268 unit
tests, 36 Playwright tests.
