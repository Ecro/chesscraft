---
type: review
task_slug: turning-slide
status: APPROVED
created: 2026-08-22
reviewers_invoked: [code-reviewer, codex]
lenses_invoked: [design, functionality, robustness, consistency]
consensus_method: single
grade_threshold: B
max_review_rounds: 2
auto_fix: true
drift_verdict:
  result: clean
  scope_violations: []
  scenario_misses: []
  task_slug: turning-slide
  computed_at: 2026-08-22T00:55:00+09:00
---

# REVIEW — One-bend sliding movement

## 🎯 Round 1 Summary

- Grade: **B** (P0=0, P1=2; the two Codex P2 findings do not lower the grade).
- Coverage: design, functionality, robustness, and consistency all returned results.
- Cross-model PIDA: Codex was invoked once; both findings were accepted.
- Auto-fix: one confirmation repair consolidated the grant editor state fix; its targeted
  tests, typecheck, changed Vitest suite, and movement e2e suite are green.
- Remaining items: the capture-only detail omission is P1; the recorded P2 observations
  do not lower the grade.
- human_review_needed: false.

The configured Side preset has no machine SPEC for this task, so no AC-cited rejection
path was available or needed. Drift was computed against the PLAN phase scopes and was clean.

## 🔍 Drift Findings

drift_verdict.result: clean. Every changed source, test, locale, style, and e2e path is
covered by a PLAN phase. No changed file was outside scope, and no declared scenario was
left without the corresponding targeted or browser coverage. The PLAN's historical
src/content/io.ts note is already corrected to the repository's src/editor/io.ts
boundary.

## ✅ Consensus Findings

### P1 — Grant editor silently rewrites unsupported turning caps

- Source: design lens (code-reviewer)
- Location: src/ui/SentenceSlot.tsx:485
- Reasoning: The grant editor renders a fallback row when turningRowFromPattern
  returns null, then serializes edits through turningPatternFromRow. A valid
  turning_slide with maxDistance: 4 is therefore shown as the default cap 2 and
  loses its declared distance on an edit.
- Suggestion: Detect a null turningRowFromPattern result and refuse editing,
  preserving the original pattern instead of defaulting to reach 2.
- Disposition: accepted, consensus-passed; status resolved by the confirmation repair.

### P1 — Piece details omit capture-only turning patterns

- Source: consistency lens (code-reviewer)
- Location: src/ui/PieceDetail.tsx:132
- Reasoning: readMovementEditor preserves attack-only turning rows in
  editor.turning.capture, and hasMovementEditorTakes keeps the editor drawable,
  but the detail view renders only editor.turning.move. A capture-only turning
  declaration is therefore accepted and playable yet absent from the player-facing
  movement description.
- Suggestion: Render turning rows from movement, or fall back to capture rows when
  movement rows are absent, matching the straight slideGroups fallback.
- Disposition: accepted, consensus-passed; status pending.

No P0 findings were reported. The P1 grant-editor finding was resolved by the
confirmation repair. The P1 capture-only detail omission remains pending for a future
review because the initial grade already met the configured B threshold.

## ⚠️ Weak Consensus

None.

## 📝 Manual-Only Findings

### P2 — Piece details silently omit independently authored turning-slide capture paths

- Source: Codex
- Location: src/ui/PieceDetail.tsx:132
- PIDA: accepted; the file-specific Vitest oracle had no matching test file, so the
  disposition rests on the diff evidence. The finding remains manual-only because it has
  only one cross-model voice.
- Evidence: PieceMoveRegion renders editor.turning.move but not
  editor.turning.capture.

### P2 — The grant_movement turning editor exposes nonfunctional add/remove controls

- Source: Codex
- Location: src/ui/SentenceSlot.tsx:488
- PIDA: accepted; the file-specific Vitest oracle had no matching test file, so the
  disposition rests on the diff evidence. The finding remains manual-only because it has
  only one cross-model voice.
- Evidence: The callback serializes only rows[0]; a second row is discarded and
  removing the sole row is replaced by the default north-to-east row.
- Resolution: the confirmation repair constrains the single-pattern grant host to one
  row, removes its impossible add/remove controls, and preserves unsupported caps.

## 🤝 Disagreements

The PieceDetail.tsx:132 issue received P1 from the consistency lens and P2 from Codex.
The SentenceSlot.tsx area received P1 from the design lens for unsupported-cap
corruption and an independent P2 from Codex for add/remove persistence. Cross-tier
findings are not merged by the consensus rule; both takes remain visible above.

## 🧊 Cross-model findings (frozen @ round 1)

frozen_at_round: 1
models: [codex]
findings:
  - id: 888aba5bb5cb0342
    source: codex
    severity: P2
    file: src/ui/PieceDetail.tsx
    line: 132
    summary: "P2: Piece details silently omit independently authored turning-slide capture paths."
    evidence: "PieceMoveRegion renders only editor.turning.move; independent turning capture rows are preserved by the adapter but not rendered."
    needs_relaxation: false
    disposition: accepted
    oracle_result: "Diff renders editor.turning.move only at src/ui/PieceDetail.tsx:132-141; independent capture rows are omitted."
    status: pending
    invalidation_reason: null
  - id: 27ebcd47c8d63046
    source: codex
    severity: P2
    file: src/ui/SentenceSlot.tsx
    line: 488
    summary: "P2: The grant_movement turning editor exposes nonfunctional add/remove controls."
    evidence: "TurningSlideEditor exposes add/remove while the grant callback serializes only rows[0]."
    needs_relaxation: false
    disposition: accepted
    oracle_result: "Diff callback at src/ui/SentenceSlot.tsx:480-488 serializes only rows[0], so add/remove controls cannot persist multiple or zero rows."
    status: resolved
    invalidation_reason: null

## Confirmation Passes

### confirm-1

Coverage was complete. Four core-lens P1 findings identified one shared grant-editor
state model: the schema stores one pattern for grant_movement, while the host exposed
multiple-row and final-row removal controls and serialized only rows[0]. The orchestrator
applied one consolidated repair:

- TurningSlideEditor now supports a single-row host mode.
- SentenceSlot uses that mode and refuses to flatten turning patterns with unsupported
  caps, preserving the original draft.
- A regression test covers the unsupported-cap preservation and hidden row controls.

The churn measurement was 0.28, above the 0.20 re-review threshold. The targeted
functionality re-review returned no findings. Focused tests (43), typecheck, the changed
Vitest suite (1,606 tests), and the movement Playwright scenario (12 tests) passed.

### confirm-2

Coverage was complete. The only new observation was a P2 design note about the shared
component importing its model from PieceMoves; it does not lower the grade and was not
auto-fixed. No new P0/P1 finding remained, so the confirmation gate approved the frozen
artifact.

## Review Iteration Summary

| Iteration | Grade | Fixes Applied | Remaining | New |
|-----------|-------|---------------|-----------|-----|
| 1 (init)  | B     | —             | 4 findings | —   |
| confirm-1 repair | B | 1 consolidated | 1 P1 + 1 P2 | 4 P1 (resolved) |
| confirm-2 | B | 0 | 1 P1 + 2 P2 | 0 severe |

Final grade: **B**
Iterations used: **1 / 2**
Exit reason: **converged**
Status: **APPROVED**
human_review_needed: **false**
Counters: unreviewed 0 · prior-fix 0 · unattributed 0

confirm_pass_ran: true
confirm_pass_new_severe_n: 0
