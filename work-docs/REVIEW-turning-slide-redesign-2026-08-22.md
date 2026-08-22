---
type: review
task_slug: turning-slide-redesign
status: APPROVED
created: 2026-08-22
reviewers_invoked: [code-reviewer, codex]
consensus_method: cross-check
drift_verdict:
  result: clean
  scope_violations: []
  scenario_misses: []
  task_slug: turning-slide-redesign
  computed_at: 2026-08-23T00:34:26+09:00
confirm_pass_ran: true
confirm_pass_new_severe_n: 0
post_review_gate: PASS
post_review_reviewer: test-reviewer
---

# REVIEW — Integrated automatic turning slide

## 🎯 Round 1 Summary

- **Grade:** B before the repair; the P1 finding was fixed in the same review run.
- **Finding coverage:** four mandatory Side lenses exercised: design, functionality, robustness, consistency.
- **Consensus:** the P1 legacy fallback finding was reviewer-lens consensus-passed under ADR-007. Two lenses independently reported the same P2 adapter-duplication concern; it is retained as a non-blocking manual follow-up.
- **Codex second opinion:** invoked once. Its grant-slide finding was sent through PIDA and rejected after the shared `writePatternGrid` fix and regression coverage; it is retained in the frozen record below as stale.

## 🔍 Drift Findings

`drift_verdict.result` is `clean`. The changed files are within the PLAN's affected components and phase scopes, and the PLAN's scenarios have focused test coverage. No scope violations or scenario misses were found.

## ✅ Post-review gate (2026-08-23)

The post-review `test-reviewer` gate returned **PASS** for the E2E contract updates and the rule-icon contrast fix. Image assertions now wait for decoded WebP inputs without weakening their content checks; the outermost-cell double-click test still asserts `data-turning="true"` and the persisted `{ turn: "any" }` pattern; the rule icon receives an isolated outline filter. The targeted three-browser contrast run passed 6/6, and the final full verification passed.

## ✅ Consensus Findings

### P1 — resolved

**Legacy movement-only fallback could gain an explicit attack array on save** (`src/ui/PieceMoves.tsx`). When a document omitted `attack`, captures were supposed to follow the complete movement declaration, including preserved legacy ordered pairs. The adapter now records `captureFollowsMovement`, keeps `attack` omitted until an intentional grid edit, and has a mixed legacy-plus-drawable regression test.

The post-fix re-review found no remaining P0/P1 issue. The final grade is **A**.

## ⚠️ Weak Consensus

None.

## 📝 Manual-Only Findings

None at P0/P1. The P2 structural duplication note is recorded as a non-blocking accepted follow-up under the consensus findings below.

## 🧭 Non-blocking follow-up

Two lenses identified that `SentenceSlot` still contains a small pattern-level adapter beside the `PieceMoves` adapter. This does not change the current behavior or grade, and the shared `MovementPatternGrid` and regression tests already cover both surfaces. A future refactor can centralize that conversion if the movement vocabulary expands again.

## 🤝 Disagreements

The robustness/functionality reports raised a possible multi-vector grant read-only path. Direct inspection and the existing reopen test showed that `SentenceSlot` uses `readGrid`, which accepts multi-vector automatic patterns; the path is drawable and remains editable. The report therefore records it as rejected rather than changing correct code.

## 🧊 Cross-model findings (frozen @ round 1)

```yaml
frozen_at_round: 1
models: [codex]
findings:
  - id: f6f0e8410bf919f1
    source: codex
    severity: P1
    file: src/ui/SentenceSlot.tsx
    line: 257
    summary: Grant movement slide patterns could not be authored from the shared grid
    evidence: Before the fix, a first compass-cell click emitted a temporary step and the local conversion returned an empty slide, resetting the grant grid.
    needs_relaxation: false
    disposition: rejected
    oracle_result: Current shared writePatternGrid promotes compass-ray cells to slide vectors; regression tests cover this path and tsc passes.
    status: stale
    invalidation_reason: PIDA rejected the finding after the shared writePatternGrid fix and its regression test.
```

## Review Iteration Summary

| Iteration | Grade | Fixes Applied | Remaining | New |
|-----------|-------|---------------|-----------|-----|
| 1 (init)  | B | — | 1 P1, 1 P2 | — |
| 2         | A | 1 P1 | 0 P0/P1 | 0 |
| confirm-1 | A | 0 | 0 P0/P1 | 0 |

Final grade: **A**
Iterations used: 2 / 2
Exit reason: converged
Status: **APPROVED**
human_review_needed: false
Counters: unreviewed 0 · prior-fix 1 · unattributed 0
Confirmation pass: ran, clean; new severe findings: 0
