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
    - e2e/hotseat.spec.ts
    - e2e/slice.spec.ts
    - e2e/editor.spec.ts
    - e2e/bundle.spec.ts
    - e2e/scaffold.spec.ts
    - e2e/content.ts
    - tests/ui/chrome-i18n.test.tsx
  scenario_misses: []
  task_slug: ui-ux-productization
  computed_at: 2026-08-06T04:40:00Z
---

# REVIEW — PLAN Phase 2 (match lifecycle, home, seed, localisation)

## 🎯 Round Summary

| Round | Grade | Fixes applied | Remaining | New |
|---|---|---|---|---|
| 1 (init) | D | — | 1 P0 · 2 P1 · 2 P2 | — |
| 2 (auto-fix) | A | 5 (+1 test) | 1 P2 deferred | 0 |

`ux-reviewer` was again added beyond `harness.yaml.reviewers.enabled` because the
diff is UI-facing. `consensus: single`, so findings were never merged across the
two reviewers — and that mattered: the P0 came only from `ux-reviewer`, and the
clipboard P1 came only from `code-reviewer`.

## 🔍 Drift Findings

| Severity | Finding | Verdict |
|---|---|---|
| P1 | **Seven e2e/test files changed that Phase 2's `Scope in` does not list.** | Sanctioned by ADR-016 (selectors may migrate in the same commit) but NOT anticipated by the phase's `merge_hazards`, which named only `App.tsx` and `Play.tsx`. The Phase A.5 reviewer predicted this before implementation and was right: one helper in `editor.spec.ts` took 13 tests down. |
| P1 | **`tests/ui/chrome-i18n.test.tsx` (a Phase 1 artifact) was modified.** | Unavoidable — `Play.tsx` became `MatchHost.tsx`, so the file list the scanner reads had to follow, and a template literal added this phase produced a false positive that needed the code-fragment filter widened. |

**The generalisable fact this phase produced:** a UI restructure is one unit with
the entire e2e suite. Phases 4, 6 and especially 9 (editor IA) must scope their
spec migration up front rather than discover it.

## 📝 Findings

### Fixed this round

| # | Sev | Source | Finding | Fix |
|---|---|---|---|---|
| 1 | **P0** | ux-reviewer | **`새 판` discards a live match with no confirmation**, and the reviewer widened it correctly: `처음으로` and the top-level `놀기` tab also unmount `MatchHost`, whose match lives only in local state. Two children share one phone and the control sits beside the board; `undo` steps one ply and cannot bring a discarded match back. | A confirm gate on all three paths. `MatchHost` reports progress upward so `App`'s nav — which owns the unmount — can apply the same gate. |
| 2 | P1 | code-reviewer | **`copySeed` reported success unconditionally.** `void navigator.clipboard?.writeText(...); setCopied(true)` — on an insecure context or an older mobile browser the API is absent, and a child taps, reads the success label, and shares nothing. The e2e test grants clipboard permissions, so it could never have caught this. | The promise decides: `copied` / `failed` / `idle`, with a distinct label for failure and the state exposed on `data-copy-state`. |
| 3 | P1 | ux-reviewer | **`흰편` / `검은편` contradict the board.** The palette renders the two sides blue and red on purpose (a red/green pair fails one player in twelve), so the labels described a board nobody sees — the localisation pass reintroduced the exact mismatch `tokens.css` was written to remove. | → `파란 편` / `빨간 편`, named for what is on screen. Machine values on `data-side` are untouched. |
| 4 | P2 | ux-reviewer | The raw 31-bit seed sat in the control row with no stated purpose, competing for width on a 360px screen. | A hint explaining what the number is for, attached to the seed itself. |
| 5 | P2 | code-reviewer | `setMatchUndo` was declared after the `return` — legal by hoisting, invisible to a reader scanning handlers, and silently broken by the very common mechanical refactor to an arrow function. | Moved up beside the other handlers as `doUndo`. |

### Found while fixing — the P0 fix was initially wrong

The first version of the guard used `state.plyCount > 0` as "is there a match
worth keeping". A draft pick does **not** advance the ply counter, so a match in
which both players had already chosen their skill cards reported *nothing to
lose* — precisely the state a mis-tap hurts most. The added test failed against
that implementation, which is the only reason it surfaced: the fix had shipped
with no coverage, and a guard that quietly stops guarding is worse than none.
Progress is now measured in applied actions (`match.states.length > 1`).

### Deferred

| Sev | Source | Finding | Why |
|---|---|---|---|
| P2 | ux-reviewer | The seed + copy control shares one row with new-match and home; four controls compete for a 360px width. | Layout work on the control row belongs with Phase 6 (touch targets, breakpoints, tray redesign), which will lay that row out properly rather than shuffling it twice. |

## 🤝 Disagreements

None — the two reviewers found disjoint sets. That is itself the finding worth
recording: under `consensus: single` there is no cross-check, and here the single
most severe issue (P0) and one of the two P1s each had exactly one witness. A
one-reviewer configuration would have shipped one of them.

## Review Iteration Summary

| Iteration | Grade | Fixes Applied | Remaining | New |
|-----------|-------|---------------|-----------|-----|
| 1 (init)  | D     | —             | 5         | —   |
| 2         | A     | 5 + 1 new test | 1        | 0   |

Final grade: **A** (threshold B — met)
Iterations used: 2 / 2
Exit reason: converged
Status: **APPROVED**
human_review_needed: **false**

Verification after fixes: `npm run verify` GREEN — typecheck, build, 259 unit
tests, 32 Playwright tests.

## ✅ What Phase 2 actually closed

- **#2** the seed never varied — every match drew the same rule card and the same
  drafts, forever. Now injected (ADR-024), varying by default, shown and copyable.
- **#1** no way to start a second match — home screen, `새 판`, `한 판 더`.
- **#5** `king_capture` printed to players at the end of every match.
- **#6** `play` / `white` rendered as English enums.
- **#17** the preset picker showed raw ids.
