---
type: review
task_slug: bundled-content-merge
status: APPROVED
created: 2026-08-09
reviewers_invoked: [code-reviewer, codex]
consensus_method: single (config) — voter pool N=2 with the cross-model voter, K=2
grade: A
grade_threshold: B
human_review_needed: false
rounds_used: 1
max_review_rounds: 2
second_opinion_results:
  - model: codex
    status: invoked
    reason: null
    duration_s: 88.1
    findings: 2
drift_verdict:
  result: clean
  scope_violations: []
  scenario_misses: []
  task_slug: bundled-content-merge
  computed_at: 2026-08-09T17:30:00Z
---

# REVIEW — bundled content merge

## 🎯 Round 1 Summary

**Grade A** (0 consensus-passed P0, 0 consensus-passed P1) against a threshold of **B**.
Status **APPROVED**, `human_review_needed: false` — every finding is P2/P3, so the
unverified-severe scan is clean by construction.

Three findings, all **`manual-only`** (single-source: no two findings shared a file and line,
so nothing reached surface match). All three were **judged correct and fixed** — not because
the grade gate demanded it, but because two of them are tests that could not fail, and
"the letter cleared, so leave the dead test in" is not a defensible reading of a gate whose
whole job is to stop that.

**The finding worth recording is not any of the three — it is who found them.** The
`code-reviewer` pass concluded, in as many words, that *"the test suite … is non-vacuous — it
follows the plan's own `assertion-equals-its-own-default` discipline"*. The cross-model voter
then refuted that on two specific tests. And the Phase A.5 `test-reviewer` gate had already
passed both of them, listing them among its `passing_tests`. **Two gates certified as live two
tests that could not fail; one heterogeneous voter caught both.** That is the entire argument
for the second-opinion gate, and it is the first time in this repo the gate has been able to
clear at all — the side preset gates it on a high-diff change, and at plan time the working
tree is empty, so `is_high` is always false. It cleared here on the post-execute diff
(`file count 10 > 3`, `added lines 1763 >= 400`).

## 🔍 Drift Findings

`result: clean`, with one observation recorded rather than scored.

| Check | Outcome |
|---|---|
| Production files outside PLAN scope | **None.** `merge.ts` → Phase 1 · `storage.ts` + `Edit.tsx` → Phase 2 · `App.tsx` → Phase 3 |
| Files the PLAN named as deliberately untouched | **All four untouched** — `src/content/schema.ts`, `src/content/load.ts`, `src/editor/io.ts`, `src/content/sets/bundled.ts` |
| Phases with scope declared but no change | **None** — all four phases have their stated deliverables |
| Test files beyond the enumerated list | **Two.** `tests/ui/stamp-on-save.test.tsx`, `tests/ui/initial-source.test.tsx` |

**On those two test files, and on the honesty of this gate.** Both serve exit criteria the PLAN
states explicitly — Phase 2's "a content save refused for quota leaves the stamp unchanged" is a
property of `Edit.tsx`'s `persist()` and is unfalsifiable from `tests/editor/storage.test.ts`
alone, and Phase 3's criterion asks for "tests at the `initialSource` level" without naming a
file. So they are in scope by criterion and absent only from the file list.

But this gate compares the diff against a PLAN **the executing agent amended during execute** —
Phase 2's Status note recording the added file was written by the same process that added it. A
drift gate reading a document its own subject can edit is partly measuring itself. Not a defect
in this change; a limitation of the gate, stated so the `clean` verdict is not read as stronger
than it is.

`common_ground_marks` is absent from the PLAN frontmatter, so the Step 2.5 silent-intent-miss
hook is a no-op here.

## ✅ Consensus Findings

**None.** With a voter pool of two (`code-reviewer` + `codex`) and K=2, consensus requires both
voices on the same file and line at the same severity tier. No pair matched: the two codex
findings are in test files, the code-reviewer finding is in `src/ui/App.tsx`. Every finding is
therefore single-source.

This is worth naming plainly rather than reading as agreement: **a grade of A here means "no
finding was corroborated", not "two independent voices agreed the change is clean".** With N=2
the consensus filter cannot distinguish those, and all three real findings were excluded from
the grade by it. The letter is the weakest evidence in this document; the probes below are the
strongest.

## ⚠️ Weak Consensus

None.

## 📝 Manual-Only Findings

All three, all fixed. Severity as the reporting voice assigned it.

### `56cab9a57259ba78` · P3 · `tests/content/merge.test.ts` · codex · **fixed**

The `stampOf` fixed-point test merged the bundle into **itself**, so every candidate id was
already in `held` and the skip predicate short-circuited before it ever consulted the stamp.
`added` was empty for *any* stamp — including a `stampOf` that returned `{ ids: [] }`.

This is `[fail:test] assertion-equals-its-own-default` (count:5), and the rule against it is
written at the top of the very file that broke it: *"No fixture may have the saved set equal to
the bundle for the row it tests."* It was stated for the seven-row fixtures and then violated in
the last test of the file.

**Fix:** two merges over a saved set that is *missing* a bundled preset, differing only in the
stamp, with opposite outcomes — `stampOf(bundle)` suppresses the addition, `{ ids: [] }` makes
it. `stampOf`'s output is now load-bearing.

**Verified by refutation, not by greenness:** with `stampOf` mutated to `return { ids: [] }`,
the corrected test **fails** (3 failed / 18 passed). The original passed that mutation.

### `4c6b127c369a7a88` · P3 · `tests/ui/initial-source.test.tsx` · codex · **fixed**

The "writes nothing" test sat inside `describe('a saved install with no stamp')` and **seeded a
stamp**. So it proved "no write when a stamp exists" and left the absent-stamp branch — the
state every install alive today is in — with no no-write coverage at all.

The mutation it fails to catch is not hypothetical, it is **risk R1**: write the synthesised
stamp only when `loadStamp` returns null, and this release's additions land in the stamp while
never reaching the document, so the next load classifies them as records the author deleted and
drops them. It works once per session and reverts on reload. The first draft of this design
shipped exactly that.

**Fix:** the no-stamp variant now seeds no stamp and asserts `STAMP_KEY` is still null after the
load; the stamp-present case became its own test, so neither covers for the other.

**Verified by refutation:** with `if (!found) saveStamp(storage, stamp)` injected into
`initialSource`, the corrected no-stamp test **fails** and the stamp-present test passes — which
is precisely the asymmetry that made the original blind.

### `781bfc685ec7317a` · P2 · `src/ui/App.tsx:54` · code-reviewer · **fixed**

`MERGE_COLLECTIONS` hand-duplicated the unexported `COLLECTIONS` tuple in
`src/content/merge.ts`. Identical today, with nothing forcing them to change together: a seventh
collection on `ContentSource` would be walked by the merge and skipped by
`additionsToDecline`'s named-record scan, quietly weakening attribution for that collection
only. Completeness rather than correctness — the progress rule's decline-everything branch still
catches it — hence P2.

**Fix:** `COLLECTIONS` is exported from `merge.ts` and imported by `App.tsx`; the duplicate is
gone. This is the reviewer's own suggested fix, applied verbatim.

## 🤝 Disagreements

One, and it is the substantive content of this review.

| Voice | Claim about test vacuity |
|---|---|
| `code-reviewer` | *"the test suite … is non-vacuous — it follows the plan's own `assertion-equals-its-own-default` discipline"* |
| `codex` | Two specific tests are vacuous, each with the mutation that survives them |
| `test-reviewer` (Phase A.5, execute) | Both tests listed under `passing_tests`; `blocking_issues: []` |

**codex was right, and I verified it by mutation rather than by preferring a voice.** Both
mutations were injected and both corrected tests fail on them. The disagreement is not averaged:
`code-reviewer`'s vacuity conclusion is **rejected on evidence**, while everything else in its
pass — the seven-row trace, the termination argument, the aliasing check, the ADR-002 import
reasoning it raised and then correctly withdrew — stands and is recorded below.

Worth noting the shape of the miss: `code-reviewer` applied the anti-vacuity rule to the
seven-row fixture block (`merge.test.ts:59-134`), where it holds, and did not carry it to the
last test in the same file. The rule was checked where it was announced, not where it was broken.

## 🧊 Cross-model findings (frozen @ round 1)

Frozen state for rounds 2..N. Never deleted; statuses updated in place.

| id | severity | file:line | disposition | status |
|---|---|---|---|---|
| `56cab9a57259ba78` | P3 | `tests/content/merge.test.ts:246` | accepted | fixed (round 1, post-grade) |
| `4c6b127c369a7a88` | P3 | `tests/ui/initial-source.test.tsx:110` | accepted | fixed (round 1, post-grade) |

`model: codex` · `status: invoked` · `reason: null` · `duration_s: 88.1` · findings: 2, both
accepted. Neither is `unresolved`, so the provenance carve-out on the unverified-severe scan is
not engaged.

## ✅ What both voices checked and found sound

Recorded because a review that lists only findings makes a clean area indistinguishable from an
unexamined one.

- **All seven ADR-001 rows** traced by hand against the skip predicate
  `known.has(id) || held.has(id) || declined.has(id)`; the mapping is exact.
- **`mergeWithRepair` terminates**: `declined` only grows and the candidate set strictly shrinks
  each round, bounded by the finite bundle id count. No non-terminating path found.
- **`additionsToDecline`'s attribution**: every Pass 2 error class in `load.ts` that does not
  name the changed record (loadout `replaces`, paired-square symmetry) was traced. In each
  constructible case the attributed `contentId` resolves either to a record already valid
  standalone in `saved` or to a current-round candidate — so the decline-everything branch does
  appear unreachable via any real bundle, matching the PLAN's own claim, and is covered by fault
  injection.
- **No aliasing of the `bundledContentSource` singleton**: additions are `structuredClone`d
  before being pushed, and both non-merge branches of `initialSource` clone the bundle.
- **No content-id string literals** in `src/ui/**` (the ADR-001 structure gate).
- **ADR-002's import behaviour**: `code-reviewer` initially flagged `Edit.tsx`'s unconditional
  stamp write as re-freezing the catalogue for an imported document, then withdrew it on reading
  ADR-002 — an import *is* someone else's document, and the eager write and the lazy synthesis
  produce the identical stamp value, so there is no behavioural gap. Recorded because a
  correctly-withdrawn finding is evidence the area was actually read.

## Review Iteration Summary

| Iteration | Grade | Fixes Applied | Remaining | New |
|-----------|-------|---------------|-----------|-----|
| 1 (init)  | A     | 3             | 0         | 0   |

Final grade: **A**
Iterations used: 1 / 2
Exit reason: `converged`
Status: **APPROVED**
human_review_needed: **false**
Counters: unreviewed 1 · prior-fix 0 · unattributed 0

**On `unreviewed_fix_count: 1`.** Two of the three fixes are test-only. The third touches
production (`src/content/merge.ts` export + `src/ui/App.tsx` import) and **no reviewer was
re-dispatched over it**, because the grade had already met the threshold — so the auto-fix loop,
which owns selective re-review, never ran. The fix is the reviewer's own suggestion applied
verbatim and is a pure constant relocation, but it is unreviewed as applied, and recorded as
such rather than counted as covered.

Verification after all three fixes: typecheck clean, **118 test files / 1167 tests** green.
