---
type: review
task_slug: movement-lock-8x8-and-rule-cards
status: APPROVED
created: 2026-08-13
reviewers_invoked: [code-reviewer, codex]
consensus_method: single + cross-model voter
drift_verdict:
  result: scope_violation
  scope_violations:
    - src/editor/io.ts
    - src/editor/draft.ts
    - src/ui/RecordForm.tsx
    - src/ui/RecordGrade.tsx
    - src/i18n/ko.ts
  scenario_misses: []
  task_slug: movement-lock-8x8-and-rule-cards
  computed_at: 2026-08-13T00:00:00Z
---

# REVIEW — Phases 1 and 2

## 🎯 Round 1 Summary

**Grade: B** (threshold B — met). P0 = 0, consensus-passed P1 = 1.
**`human_review_needed: true`** — three `manual-only` P1 findings were present at an approved grade.

**Every finding was fixed anyway**, which the grade gate does not require. All four shared one root
cause and one of them was a regression this work introduced, so shipping them behind a passing
letter would have been the exact shape this PLAN exists to prevent.

Scope reviewed: `git diff HEAD -- src/` — 9 files, +281/-29. High-diff by every measure the
classifier has (26 files overall, `src/content/schema.ts` on a contract path, +3035 lines including
tests), so the cross-model voter was mandatory rather than optional.

## 🔍 Drift Findings

**P1 — scope violation.** Five files changed that no attempted PLAN phase declares:

| File | Why it changed | Avoidable? |
|---|---|---|
| `src/editor/io.ts` | Carried a stale COPY of the loader's normalization; v12 broke it, so every pre-v12 editor import would be refused | **No** — the bump forces it |
| `src/editor/draft.ts` | New skill cards need the v12 field | No |
| `src/ui/RecordGrade.tsx` | Draft pricing normalizes the same three fields | No |
| `src/ui/RecordForm.tsx` | A checkbox, so an author can set the flag at all | **Yes** — deferrable to Phase 4 |
| `src/i18n/ko.ts` | The checkbox's label | Yes, with the above |

The first three are consequences of the version bump and could not have been left out without
shipping a broken import path. The last two were a judgment call: without them the flag is
bundled-content-only, which is the declared-but-inert shape one layer up — but Phase 4 already owns
`RecordForm` and `ko.ts`, so this widened Phase 2 rather than waiting. Recorded rather than waved
through.

**No scenario misses.** Every SPEC criterion in Phases 1–2 scope (AC-001, AC-002, AC-004, AC-012,
AC-013) has a passing test. AC-003 is withdrawn. AC-005 through AC-011 belong to Phases 3–6, which
have not run.

## ✅ Consensus Findings

### P1 · `consensus-passed [2/2]` · an `end_of_ply` freeze on `mover` was silently lost

`code-reviewer` anchored at `engine.ts:902` (the deferral gate), Codex at `engine.ts:1298` (E7's
`runEvent`). Different lines, one defect, identical CONCLUDE — so a surface match on the shared
symbol rather than on line proximity, and strong reasoning alignment.

E7 runs *after* settlement and is handed `subjectSquare` as `moverSquare`, so the gate
`act.target.kind === 'mover' && ctx.moverSquare != null` queued the write into a list that had
already been drained. No freeze, no `settle:dropped`, and the log still carried
`end_of_ply:rule:<id>` claiming the effect fired.

**This was a regression introduced by Phase 1** — before the settlement step, that write resolved
immediately and correctly. `[fail:design] declared-but-inert-vocabulary` (count 7), re-created by
the change written to close it.

**Fixed.** The deferral is now gated on an explicit `midMove` parameter, passed only by the move
branch's `on_leave` and `on_capture` — the two events where the mover is genuinely between squares.
Pinned by `does not defer an end_of_ply freeze — settlement has already drained`.

## 📝 Manual-Only Findings

All three were single-source. All three were verified against the code before being acted on, and
all three are fixed.

### P1 · `manual-only` (Codex) · an `on_enter` freeze deferred onto the OTHER swap endpoint

`cascadeEnter` passes a non-null `moverSquare` for every `on_enter` (`engine.ts:959`), so a square
type or piece passive freezing `mover` was deferred and then written to the last endpoint. On a
two-endpoint swap that is the other piece.

**Fixed** by the same `midMove` gate. Pinned by `does not defer an on_enter freeze onto the OTHER
swap endpoint`.

### P1 · `manual-only` (code-reviewer) · `resolveTarget`'s `mover` fallback was unguarded

`effects.ts:197` returned `[ctx.subject.square]` with no `board.has` check, unlike the branch
immediately above it. On the card `on_play` path `ctx.subject` is a snapshot taken *before* the
actions ran, so a card written as "teleport this piece and freeze it there" wrote the freeze onto
the vacated origin — square-keyed state that then immobilises whoever stands there next.

**Fixed** by guarding the fallback identically. Pinned by `does not freeze the vacated origin when a
card relocates and freezes in one effect`.

### P1 · `manual-only` (Codex) · the settlement guard checked occupancy, not identity

`m.board.has(subjectSquare)` is not proof the *named* piece survived: an effect can destroy the
subject and put another piece on the same square before settlement, and the freeze then lands on the
replacement.

**Fixed** — `DeferredWrite` now carries the subject's `{pieceId, side}`, captured at defer time, and
settlement compares before applying; a mismatch emits `settle:dropped`.

⚠️ **This fix is UNVERIFIED BY TEST, deliberately and on the record.** Two fixtures were attempted;
neither reproduced the defect — both dropped the write for an unrelated reason. A mutation check
caught that: removing the identity comparison left all 16 tests green, so the test proved nothing.
It was deleted and replaced by a comment block at the same location in
`tests/engine/relocation-settlement.test.ts` naming the gap. The guard is kept because it is
strictly more correct than occupancy alone and costs one comparison — but it is defended by
reasoning rather than by a probe, and the next person to touch settlement should know which.

## ⚠️ Weak Consensus

None.

## 🤝 Disagreements

None on severity. One near-miss worth recording: `code-reviewer` explicitly **cleared** the
`subjectSquare` empty-fallback path ("every downstream consumer re-guards with `m.board.has`"),
while Codex flagged the *replacement-occupant* case at the same guard. Those are different claims
about the same line and neither refutes the other — the fallback being inert when the square is
empty says nothing about the square being occupied by the wrong piece.

## 🧊 Cross-model findings (frozen @ round 1)

| id | model | status | severity | file:line | disposition |
|---|---|---|---|---|---|
| `27ac8a6c801d45bf` | codex | invoked | P1 | `src/engine/engine.ts:902` | accepted → fixed |
| `7f895d1b25f70f82` | codex | invoked | P1 | `src/engine/engine.ts:1298` | accepted → consensus-passed with code-reviewer → fixed |
| `ea77b9c8a3fe055f` | codex | invoked | P1 | `src/engine/engine.ts:1203` | accepted → fixed, test gap recorded |

`second_opinion_results: [{model: codex, status: invoked, reason: null}]`. Every finding was
verified against the source before disposition; none was refuted.

## 🔬 Mutation verification of the fixes

Run because two earlier gates in this task passed on tests that could not discriminate. Each fix was
reverted in isolation and the suite re-run:

| Mutation | Expected red | Result |
|---|---|---|
| Remove the `midMove` gate | E7 + `on_enter` tests | ✅ 2 failed |
| Occupancy-only settlement guard (drop identity) | the replacement test | ❌ **16 passed** — test deleted, gap recorded above |
| Unguard `effects.ts`'s `mover` fallback | the vacated-origin test | ✅ 1 failed |

## Review Iteration Summary

| Iteration | Grade | Fixes Applied | Remaining | New |
|-----------|-------|---------------|-----------|-----|
| 1 (init)  | B     | 4             | 0         | 0   |

Final grade: **B** (threshold B)
Iterations used: 1 / 2
Exit reason: converged
Status: **APPROVED**
human_review_needed: **true** — three P1 findings were `manual-only` at round 1. All are fixed, but
they cleared on a single voice plus my own verification rather than on cross-check, and one fix
carries an acknowledged test gap.

Verification after fixes: `tsc --noEmit` clean; full unit suite **146 files / 1668 tests green**.
No commit made — wrapup owns that.

## 📌 Carried into Phases 3–6

- The relocation lock's grant has **no owner field**. Both reviewers cleared it for the one-ply
  window (the opponent does not act inside it), but Phase 3 adds `beneficiarySide` to
  `ActiveGrant` and must decide whether `forbid_movement` reads it. PLAN Risk 6 already tracks this.
- The identity-guard test gap above.
- Scope drift: `RecordForm`/`ko.ts` were touched ahead of Phase 4, which owns them. Phase 4's
  merge-hazard line should be read with that in mind.
