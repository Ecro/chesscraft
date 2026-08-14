---
type: review
task_slug: movement-lock-8x8-and-rule-cards
status: APPROVED
created: 2026-08-14
reviewers_invoked: [code-reviewer, codex]
consensus_method: single + cross-model voter
supersedes: REVIEW-movement-lock-8x8-and-rule-cards-2026-08-13.md
drift_verdict:
  result: scope_violation
  scope_violations:
    - src/engine/engine.ts (PLY_CAP — author-authorised)
    - src/engine/engine.ts (end_turn rule — self-widened)
    - src/balance/measure.ts
    - src/balance/grading-agent.ts
    - src/editor/io.ts
    - src/editor/draft.ts
    - src/ui/RecordGrade.tsx
  scenario_misses: []
  task_slug: movement-lock-8x8-and-rule-cards
  computed_at: 2026-08-14T00:00:00Z
---

# REVIEW — Phases 3 to 6

Round 1 of a second review. The first
([[REVIEW-movement-lock-8x8-and-rule-cards-2026-08-13]]) covered Phases 1–2; all four of its
findings are fixed and were re-verified here in passing.

## 🎯 Round 1 Summary

**Grade: A** (threshold B). Consensus-passed P0 = 0, P1 = 0.
**`human_review_needed: true`** — one P1 finding is `manual-only` on a technicality, described below.

**One defect found, by both voices, and fixed.** Everything else the reviewers were pointed at
verified clean against the code.

Scope: `git diff HEAD -- src/` — 17 files. High-diff by every measure (47 files overall,
`src/content/schema.ts` on a contract path, +5338 lines), so the cross-model voter was mandatory.

## 🔍 Drift Findings

**P1 — scope violation, three kinds and they are not equivalent.**

| File | Kind | Standing |
|---|---|---|
| `engine.ts` — `PLY_CAP` 60→160 | **Explicitly excluded** by Phase 6's `Scope out` | **Author-authorised.** Lifted by an explicit instruction and recorded as PLAN "Phase 6b" rather than absorbed |
| `engine.ts` — the `end_turn` rule | In no phase | **Self-widened.** The only item on this list I chose to add: the cap raise exposed a hard deadlock caused by Phase 5's own card, and leaving it would ship a board that accepts no input |
| `grading-agent.ts` | In no phase | This review's finding, fixed here |
| `measure.ts`, `win-condition.test.ts`, `bundled.test.ts` | In no phase | Consequences of the cap raise — a stale comment and two fixtures that had hard-coded 60 |
| `editor/io.ts`, `draft.ts`, `RecordGrade.tsx` | In no phase | Carried over from Phases 1–2, already recorded in the prior review |

**No scenario misses.** AC-005, AC-007, AC-008, AC-009, AC-010, AC-011 all have passing tests;
AC-001/002/004/012/013 were covered in the prior review; AC-003 is withdrawn.

## ✅ Consensus Findings

None reached `consensus-passed` — see Disagreements.

## 📝 Manual-Only Findings

### P1 · `manual-only` · `playOutGrading`'s step budget assumed one action per ply

Both reviewers found this, at the same file and the **same line** (`grading-agent.ts:138`), and
described the same mechanism. It is `manual-only` only because they graded it differently — see
Disagreements. I verified it independently before acting.

A turn is `[play_card?] → move` (ADR-001): a ply costs up to **two** actions while advancing
`plyCount` by one, and the two drafts each side resolves cost four more that advance it by none.
`playOutGrading` budgeted `PLY_CAP + DRAFT_ACTIONS` — one action per ply — so any grading match with
enough card plays ran out of loop before the cap could assign a result and returned `result: null`.
Its caller reads `.state` directly with no completion check, so a **material measurement was taken
from a position the game never reached**, silently.

`src/engine/agent.ts` already carried the correct bound *and a comment recording this exact
failure* — "~1% of AC-012 seeds ... with nothing wrong with the engine at all". The lesson had been
learned in one file and not the other: `[fail:design] shared-vocabulary-unshared-code-path`, count 4,
and the second instance of that class in this task (the first was `editor/io.ts`'s stale copy of the
loader's normalization).

**Pre-existing, not caused by the cap raise** — the shortfall was ~56 actions at cap 60 and ~156 at
160, so the raise widened it rather than created it.

**Fixed by deleting the copy, not correcting it.** `ACTIONS_PER_PLY`, `DRAFT_ACTIONS` and
`MAX_MATCH_ACTIONS` are exported from `engine.ts` once; both agents import it. There were **three**
copies of the arithmetic, counting `invariants.test.ts`. Pinned by
`tests/balance/grading-budget.test.ts`, and mutation-verified: restoring the old bound turns it red.

## ⚠️ Weak Consensus

None.

## 🤝 Disagreements

**Severity, on the one finding: Codex said P1, `code-reviewer` said P2.** Step 4a admits consensus
candidates only within a severity tier ("do not bridge tiers"), so two voices identifying the
identical defect at the identical line were classified `manual-only` and the grade computed as if
nothing had been found.

That is the procedure working as written, and it is worth recording that the letter and the
substance came apart here: the correct engineering response was obviously to fix it, which is what
happened. The grade of **A** should be read with that in mind — it reflects zero *cross-tier-agreed*
findings, not zero findings.

## 🧊 Cross-model findings (frozen @ round 1)

| id | model | status | severity | file:line | disposition |
|---|---|---|---|---|---|
| `22f416ceaec6cbd3` | codex | invoked | P1 | `src/balance/grading-agent.ts:138` | accepted → fixed |

`second_opinion_results: [{model: codex, status: invoked, reason: null}]`.

## ✅ What the reviewers verified clean

Recorded because a review that only lists defects understates what it checked. All seven focus items
were traced against the code by `code-reviewer`; the six below came back clean.

1. **`beneficiarySide`** — the occupant read sits inside the `resolveTarget` loop, so `forEach` and
   a multi-square `adjacent_friendly` each get their own correct occupant. `eventSubject` is
   threaded unconditionally, so the `on_capture` fallback is immune to `forEach` rebinding. The lock
   site iterates `subjectSquares` (both swap endpoints); the protect site stays single — matching
   ADR-004's per-site table exactly. No shipped card combines a relocation with a grant in one
   effect, so the ordering hazard is unreachable from content.
2. **`sideInCheck`** shares `generationModifiers` with move generation, so the occupant filter
   applies identically to both. No divergence.
3. **`end_turn`** — `describeRejection` recomputes `legalActions` and short-circuits on a match, so
   its fallback branches can only explain a genuinely illegal pass. `state.result` and a pending
   draft are both checked first. Repeated passing still increments `plyCount`, so it terminates at
   the cap: **no infinite loop**.
4. **The 3-ply freeze arithmetic** traces correctly through the deferred-write queue: `plies: 3`
   blocks the capturer at its own next turn and clears one turn later; `plies: 2` would have expired
   exactly as that turn began, which is the bug Phase 5 caught.
5. **The three new square types** are painted on real boards and drive live triggers — none is
   declared-but-inert.
6. **The 8x8 exclusion list is complete.** Every coordinate-encoding card in the bundle
   (`king-of-the-hill`, `harvest`, `fast-promotion`, `beacon`) is absent from `preset.grand`, and
   only those four encode coordinates.

## Review Iteration Summary

| Iteration | Grade | Fixes Applied | Remaining | New |
|-----------|-------|---------------|-----------|-----|
| 1 (init)  | A     | 1             | 0         | 0   |

Final grade: **A** (threshold B)
Iterations used: 1 / 2
Exit reason: converged
Status: **APPROVED**
human_review_needed: **true** — the single finding cleared on a tier mismatch rather than on
cross-check, so the letter grade did not see it. It is fixed and pinned; the flag is set so the
grade is not read as "nothing was found".

Verification after the fix: `tsc --noEmit` clean; full unit suite **152 files / 1712 tests green**.
No commit made — wrapup owns that.

## 📌 Carried forward

- The relocation lock's `forbid_movement` grant still does not read `beneficiarySide` (PLAN Risk 6).
  Both reviews have now cleared it for the one-ply window; it stays a known open sibling.
- The identity-guard test gap from the prior review (PLAN Phase 3 notes) is unchanged.
- `rule.democracy`'s decisiveness is unmeasured — it ships on `preset.covenant` and the survey
  measures `BUNDLED_PRESET_ID`.
- A size-relative `PLY_CAP` would serve both board sizes better than one scalar; recorded on the
  constant itself as the alternative not taken.
