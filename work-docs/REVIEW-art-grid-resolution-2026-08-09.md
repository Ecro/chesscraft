---
type: review
task_slug: art-grid-resolution
status: APPROVED
created: 2026-08-09
reviewers_invoked: [code-reviewer, codex]
consensus_method: cross-check
grade: A
human_review_needed: true
drift_verdict:
  result: scope_violation
  scope_violations:
    - scripts/sprite-metrics.ts
    - tests/ui/art-refined-pieces.test.ts
  scenario_misses: []
  task_slug: art-grid-resolution
  computed_at: 2026-08-09T13:20:00Z
---

# REVIEW — art-grid-resolution

## 🎯 Round 1 Summary

**Grade A** — zero `consensus-passed` P0/P1. **`human_review_needed: true`**, because one
`manual-only` **P1** exists (see §5) and the grade gate does not count it.

Six findings across two voices (`code-reviewer`, `codex`). **All six were fixed in this
round**, including the P1 — but one of them was fixed for a different reason than the
reviewer gave, and that disagreement is why the flag stands. No auto-fix loop ran: every
fix was applied directly and the suite re-verified.

Post-fix: `npm run typecheck` clean, **1172 tests / 117 files** green, the migration audit
reconciles **209 found = 191 checked + 18 skipped**.

## 🔍 Drift Findings

**`result: scope_violation`** — two files changed that no PLAN phase's scope named:

| File | Why it exists | Verdict |
|---|---|---|
| `scripts/sprite-metrics.ts` | The three metrics (`subBlockDetail`, `outlineShare`, `tintShare`) invented mid-Phase-4 when delegated art passed every existing gate while adding nothing, then broke the rendered gate. | **Justified**, recorded in Phase 4's result note before review ran. |
| `tests/ui/art-refined-pieces.test.ts` | Enforces those metrics. Without it the round's lesson would be a comment with no guard — `[fail:design] comment-claims-unbuilt-safeguard` (count:8). | **Justified**, same note. |

`work-docs/art-baseline/*.png` is **not** drift: Phase 2 exit criterion 5 names that path.

No scenario misses (no SPEC for this task; the PLAN's phase exit criteria are the contract
and all five are recorded DONE with their measurements).

## ✅ Consensus Findings

**None.** Two findings describe the same defect from different voices but land in
**different severity tiers**, and Step 4a forbids bridging tiers — so they are recorded
independently below rather than merged into a cluster. Stated plainly because "zero
consensus findings" could otherwise read as "the two voices found nothing in common", and
the opposite is true: they overlapped twice.

| Defect | `codex` | `code-reviewer` | Cluster? |
|---|---|---|---|
| `--apply` rewrites any matching line with no block validation | P3 | P2 | No — tier mismatch |
| `--except` is not file-scoped | P2 | P1 | No — tier mismatch |

## ⚠️ Weak Consensus

None.

## 📝 Manual-Only Findings

### P1 — `--except` is not file-scoped, so the audit checks 191 tables where the PLAN claims 197
*Source: `code-reviewer`. **Conclusion rejected on evidence; the underlying observation accepted and fixed.***

The reviewer traced that `verify()` applies one flat exception set across both
`MIGRATED_FILES`, so the twelve refined piece names also exempt six same-named tables in
`scripts/spare-sprites.ts` — and concluded those six "were never verified", pointing at
`lance` and `watchtower` having no two consecutive identical rows, which a genuine
`upscale()` output must have.

**The conclusion is wrong, and the evidence it rests on has a different cause.** Those six
spare-pool tables are not unverified upscales — they are the **refined art, synced** from
the sheet during Phase 4 (R7). That is precisely why their rows are not duplicated in
pairs. Checked directly rather than argued:

```
lance:      spare copy == refined sheet copy?  True
watchtower: spare copy == refined sheet copy?  True
```

Exempting them is therefore correct: neither copy is an upscale of the baseline any more.

**The observation underneath it is right and mattered.** The PLAN did claim **197**, and it
justified that with "the 12 bundled pieces are disjoint from the 84 duplicated spares" —
which is **false**, and which **validator pass 2 confirmed as correct** after reading
`spare-sprites.ts:27`, the header of the *unclaimed* spare block, without reaching the six
collisions further down the file. Three validator passes carried the error.

Also right, and the real gap: `verify()` reported `checked` and `skipped` with **nothing to
reconcile them against**, so "191" could not be distinguished from an under-audit. That
ambiguity is exactly what led a careful reviewer to the wrong conclusion — which makes it a
defect in the tool's reporting, not only in the prose.

**Fixed:**
- `verify()` now counts every table it finds and fails on `found ≠ checked + skipped`. It
  prints `209 tables found: 191 checked, 18 skipped`.
- Every `--except` entry that matches no table is now an error (a typo used to exempt
  nothing and read as a clean audit).
- The skip list is **file-qualified** (`src/ui/art/pixels.ts:lance` vs
  `scripts/spare-sprites.ts:lance`), so one name exempting two tables is visible rather than
  inferred.
- The PLAN's `197` and its disjointness claim are corrected, and pass 2's confirmation of
  the false claim is struck through in place with a note — a validator's confident wrong
  answer is worth leaving visible.

### P2 — `art-gates.test.ts`'s rect-cap fixture comment states run arithmetic that is 2× off
*Source: `code-reviewer`. Accepted, verified, fixed.*

The comment read "6 runs per row x 24 rows = 144". `'oyoyoyoyoyoy'` contains no transparent
cell, so every character starts a new run. Measured: **12 runs per row, 288 total.** The
assertion (`> RECT_CAP`) passes either way, so nothing was broken — but the number is the
sort a future author copies when tuning `RECT_CAP`. The 6/144 arithmetic belongs to the
*sheet-floor* fixture below it (`o.o.o...`, where `.` breaks the runs — confirmed at 6), and
had been copied onto a fixture it does not describe. The 12×12 version of the comment was
wrong for the same reason, so this predates the migration.

### P2 — `tests/ui/art-refined-pieces.test.ts` pinned its roster with a literal, which is false-green
*Source: `codex`. Accepted, fixed.*

`REFINED` was a hardcoded array of twelve names and the set-pinning test asserted
`toHaveLength(12)` on it — which proves only that the array is the length of itself. Add a
bundled piece, or repoint an `artKey` at an unrefined sprite, and every assertion keeps
passing while the sprite a player sees goes unmeasured. The file's own header claimed this
test existed to prevent exactly that.

**Fixed:** the roster is now derived from `artRegistry` ∩ `bundledContentSource`'s claimed
`artKey`s, so it tracks the game. Adding a bundled piece without refining its art now fails.

### P2 — `--apply` rewrites any matching line with no block validation
*Source: `code-reviewer` (P2) and `codex` (P3) — same defect, tiers not bridged. Accepted, fixed.*

`ROW_LINE` matches any lone quoted string of palette characters; "alone on its line" is a
formatting convention, not a guarantee. `'square'` is six such characters and
`'spriteErrors'` is twelve — **and that second one actually happened during Phase 2**, when a
re-authoring regex over the test files rewrote `describe('spriteErrors', …)`. The codemod
had no equivalent guard.

**Fixed:** `applyTo` now runs `extractBlocks` before writing and refuses unless every matched
line sits inside a **named** block of uniform width, reporting the block and row counts it
accounted for.

### P3 — (folded into the P2 above)
`codex`'s lower-tier statement of the same `--apply` defect. Recorded for the tier split, not
counted twice.

## 🤝 Disagreements

**One, and it is substantive.** `code-reviewer` graded the `--except` scoping **P1** on the
strength of "six tables were never verified"; that claim is false (evidence in §5) and the
finding would be **P2 at most** on its true content — a reporting gap, not an under-audit.
The finding is nonetheless recorded at the reviewer's severity rather than downgraded here,
because a reviewer's tier is not the orchestrator's to quietly revise, and because the flag
it raises is the reason a human is being asked to look.

`codex` rated the same defect **P2**, which matches the corrected assessment.

## 🧊 Cross-model findings (frozen @ round 1)

`frozen_at_round: 1` · `models: [codex]` · gate: **high-diff** (`is_high: true` — 31 files,
+6881 lines).

| id | source | severity | file | line | summary | evidence | needs_relaxation | disposition | oracle_result | status |
|---|---|---|---|---|---|---|---|---|---|---|
| `c30f29959574735d` | codex | P2 | `tests/ui/art-refined-pieces.test.ts` | 71 | Roster hardcoded; set-pinning test is false-green | Test asserts length 12 on a literal and never reads the bundled art keys | false | accepted | Verified by reading the file; the derivation now yields the same 12 | resolved |
| `8dec6dfb4fd0b6ca` | codex | P2 | `scripts/upscale-sprites.ts` | 161 | `--except` matches bare names across files | `except.has(baseline.name)` ignores the containing file | false | accepted | Confirmed — the skip list printed 18 entries for 12 names | resolved |
| `b3f0f75dfc9e7c63` | codex | P3 | `scripts/upscale-sprites.ts` | 121 | Codemod can rewrite unrelated literals; no pre-write validation | `applyTo` transforms every `ROW_LINE` match with no block check | false | accepted | Confirmed — the same class already fired on `'spriteErrors'` in Phase 2 | resolved |

`second_opinion_results`: `[{model: codex, status: invoked, reconciliation: [accepted, accepted, accepted]}]`

## Review Iteration Summary

| Iteration | Grade | Fixes Applied | Remaining | New |
|-----------|-------|---------------|-----------|-----|
| 1 (init)  | A     | 5             | 0         | —   |

Final grade: **A**
Iterations used: 1 / 3
Exit reason: `converged`
Status: **APPROVED**
human_review_needed: **true**
Counters: unreviewed 5 · prior-fix 0 · unattributed 0

`unreviewed_fix_count: 5` — every fix landed in the terminal round, so no reviewer saw the
post-fix state. The suite did: typecheck clean, 1172 tests green, and the audit's new
self-reconciliation passes.

**Why the flag is set, in one line:** a P1 exists that no second voice corroborated at its
tier, its stated conclusion is contradicted by direct evidence recorded above, and a human
should decide whether they agree with that rebuttal before this lands.
