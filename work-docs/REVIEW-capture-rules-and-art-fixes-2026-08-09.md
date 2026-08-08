---
type: review
task_slug: capture-rules-and-art-fixes
status: APPROVED
created: 2026-08-09
reviewers_invoked: [code-reviewer, codex]
consensus_method: single + cross-model voter
drift_verdict:
  result: scope_violation
  scope_violations:
    - src/ui/MatchHost.tsx
    - tests/ui/recipe-bundled-coverage.test.ts
  scenario_misses:
    - "Phase 3 scope named tests/ui/capture-highlight.test.tsx and it was never written — closed during this review"
    - "Phase 1 scope named work-docs/ART-SPIKE-smoothing.md and it was never written — closed during this review"
  task_slug: capture-rules-and-art-fixes
  computed_at: 2026-08-09T07:20:00Z
final_grade: A
human_review_needed: true
---

# Review — capture-rules-and-art-fixes

## 🎯 Round 1 Summary

**Grade A** (0 consensus-passed P0, 0 consensus-passed P1) with **`human_review_needed: true`** —
two P1 findings are tagged `manual-only`, which the letter does not count and the
unverified-severe scan does.

Both P1s were **fixed anyway**, as an explicit orchestrator decision rather than under the
auto-fix rule. That distinction is recorded rather than blurred: `manual-only` findings are not
auto-fix eligible, so nothing here was authorised by the consensus filter. What authorised it is
that two independent sources found the same two defects, and one of them — a refused drag saying
nothing — defeats the purpose of the phase that produced it. Declining to fix that because a
severity tier did not line up would be putting the process above the person who reported the bug.

| | Count |
|---|---|
| Reviewers invoked | `code-reviewer` (Claude), `codex` (cross-model voter) |
| Findings, code-reviewer | 2 × P1, 1 × P2 |
| Findings, codex | 3 × P2, 2 × P3 — all 5 `accepted` by the PIDA gate |
| `consensus-passed` | **0** |
| `manual-only` | 7 (2 × P1, 4 × P2, 2 × P3 — see §5) |
| Fixed this round | 4 (both P1s and two P2/P3s) |
| Left open, recorded | 1 (P2/P3 duplicate pair: redundant `generationModifiers`) |

Verification after the fixes: `tsc --noEmit` clean · 113 files / **1098 unit tests** pass · **391
Playwright tests** pass, 17 skipped (pre-existing WebKit skips, `FINDING-webkit-back-guard`).

## 🔍 Drift Findings

**P1 — one PLAN phase was reported DONE before it was.** Phase 3's scope names
`tests/ui/capture-highlight.test.tsx` — the UI half of ADR-004, which interview #8 explicitly
chose ("engine + UI highlight"). It was never written, and the phase was reported complete. The
drift gate found it by comparing declared scope against the actual diff, which is the only check
in the pipeline that could have. **Closed during this review**: 3 tests asserting the board's
`data-legal` marks EQUAL `legalActions`' move set, in both directions, for every own piece in the
position. A subset check would pass a board that highlights nothing; a superset check would pass
one that highlights everything.

**P2 — `src/ui/MatchHost.tsx` changed outside any phase's declared scope.** ADR-010 describes the
UI mapping ("The UI maps it to a `ui.match.reject.*` key"), so the work was authorised by the
decision; the file was simply never added to Phase 4's `Scope in`. A PLAN whose ADR and whose
scope list disagree is a PLAN that cannot be checked against a diff.

**P2 — `tests/ui/recipe-bundled-coverage.test.ts` changed outside any phase's scope.** This was
the pre-existing red baseline discovered in Phase 2's verification (bundle census 6→12 pieces and
26→41 cards; `piece.charger` unopenable in the maker). Repairing a red gate that predates the task
is defensible; doing it without declaring it is what the gate flags.

**P3 — Phase 1's exit artifact was written into the PLAN instead of `work-docs/ART-SPIKE-smoothing.md`.**
**Closed during this review** — the file now exists and carries the spike's finding, and it is
where Phase 7's before/after screenshots belong.

## ✅ Consensus Findings

**None.** Zero findings reached `consensus-passed`, and the reason is mechanical rather than
substantive: Step 4a admits only **same-tier** candidates and forbids bridging tiers. Every pair
where the two voices agreed on the defect disagreed on its severity — see §6. The letter grade is
therefore A on a diff that contains four real defects, three of them independently corroborated.
That is the grade gate working as specified and it is also the reason
`human_review_needed` exists.

## ⚠️ Weak Consensus

None. No pair satisfied surface match, so none reached the reasoning-alignment step.

## 📝 Manual-Only Findings

### P1 — a refused DRAG said nothing (fixed)

`src/ui/MatchHost.tsx` · sources: `code-reviewer` (P1), `codex` (P2, id `e3104923b198a629`)

`usePressInspect` resolves one pointer sequence into exactly one of inspect / tap / drag, so a
player who presses a piece and pulls it onto an enemy never reaches `clickSquare`. Phase 4 wired
the tap path only, which left the reported defect — reach for a capture the engine refuses and
NOTHING happens — alive on the gesture a finger actually uses. `tests/ui/rejection-wiring.test.tsx`
drove everything with `fireEvent.click`, which is precisely what cannot exercise this path, so the
new suite could not have caught it.

**Fixed**: the drag handler now calls `describeRejection` on a refused drag onto an enemy-occupied
square, and a pointer-driven regression test covers it.

### P1 — the band and the price could describe two different records (fixed)

`src/ui/RecordGrade.tsx` · sources: `code-reviewer` (P1), `codex` (P2, id `58d557c7cb41c92f`)

The star band came from the saved document; the cost explanation came from the live draft. Widen a
saved one-star piece's movement and the price jumped while the star stayed — two numbers about two
pieces in one paragraph, with nothing saying so.

**Fixed** by removing the contradiction rather than labelling it: the band is now derived from
whichever record the explanation describes, with `data-from` naming it. The ceiling is still the
saved document's, which is the same one-save-behind the price already accepted and moves the band
by at most a step.

This superseded an assertion I had written twice — "no band before the first save" — and both
copies were updated. That earlier rule was a preference of mine, and it is what allowed the
contradiction; what replaces it is the invariant whose failure was actually reported, which is
checkable where the preference was not.

### P2 — an unpriceable draft showed the saved record's price (fixed)

`src/ui/RecordGrade.tsx` · source: `codex` (id `b58a89a7b90d0de4`, `accepted`)

When the draft stopped parsing, the panel silently fell back to the saved declaration — a
plausible price for a piece the author had already edited away, with no marking. Found by codex
alone; code-reviewer did not report it.

**Fixed**: an unpriceable draft now says so (`ui.editor.cost.unpriceable`) instead of describing
something else.

### P3 — a refusal outlived the question it answered (fixed)

`src/ui/MatchHost.tsx` · source: `codex` (id `223e41a5e91628a8`, `accepted`)

Attempt a protected capture, then ask what a different piece IS; the old refusal stayed in the
status line, reading as the answer to the new question.

**Fixed, and wider than reported.** codex named the press handler. There are **six** ways to open
an inspection sheet — press, the `i` key, the selection strip, a card, a square type — and a rule
applied at one of them is the shape that made this a finding. All of them now go through one
`openPeek` helper that drops the refusal.

### P2 / P3 — `describeRejection` recomputes `generationModifiers` (open, recorded)

`src/engine/engine.ts:549` · sources: `code-reviewer` (P2), `codex` (P3, id `910f50b94c850573`)

`legalActions` already builds the modifiers; the rejected-move branch builds them again. Both
voices agree it is **not** a correctness bug — `generationModifiers` is pure and deterministic, so
the two computations cannot disagree. code-reviewer's own verdict: "not worth doing unless
profiling shows it matters," on a 7×7 board with small content sets.

**Deliberately not fixed.** Threading modifiers out of `legalActions` widens an exported engine
signature to save work nobody has measured, on a path that runs once per refused tap. Recorded so
the next reader inherits the judgement rather than the question.

## 🤝 Disagreements

Three defects, two voices, three severity disagreements — and the disagreement is the finding:

| Defect | `code-reviewer` | `codex` | Effect |
|--------|-----------------|---------|--------|
| Refused drag is silent | **P1** | P2 | No candidacy (tiers not bridged) → both `manual-only` |
| Band vs draft price | **P1** | P2 | Same |
| Redundant `generationModifiers` | P2 | P3 | Same |

Both voices identified the same code and the same consequence in all three; only the tier differs.
Step 4a's no-bridging rule exists so that severity disagreements surface instead of being averaged
— it did exactly that, and the cost is that a fully corroborated P1 cannot reach
`consensus-passed`. Acting on the higher tier is the conservative reading and is what happened.

## 🧊 Cross-model findings (frozen @ round 1)

```yaml
frozen_at_round: 1
models: [codex]
findings:
  - id: e3104923b198a629
    source: codex
    severity: P2
    file: src/ui/MatchHost.tsx
    line: 733
    summary: "Illegal captures remain silent when attempted by dragging."
    evidence: "The tap path calls describeRejection, but onDrag only pushes a legal move and otherwise returns silently."
    needs_relaxation: false
    disposition: accepted
    oracle_result: "MatchHost.tsx:728-735 onDrag finds moveAction and pushes if legal, else returns with no setRejection call, unlike clickSquare:636."
    status: resolved
  - id: 58d557c7cb41c92f
    source: codex
    severity: P2
    file: src/ui/RecordGrade.tsx
    line: 114
    summary: "The displayed stars can contradict the adjacent draft price."
    evidence: "The explanation is calculated from the current draft, while grade is read from the saved record; both render together without provenance labels."
    needs_relaxation: false
    disposition: accepted
    oracle_result: "RecordGrade.tsx:117 grade reads costs.of(recordId) (saved) while explanation:91-106 prices priceable (draft); both render together, line 122-140."
    status: resolved
  - id: b58a89a7b90d0de4
    source: codex
    severity: P2
    file: src/ui/RecordGrade.tsx
    line: 94
    summary: "An invalid edited draft can display a plausible but stale price belonging to the saved version."
    evidence: "When draft parsing fails, the code silently falls back to explaining the saved record."
    needs_relaxation: false
    disposition: accepted
    oracle_result: "RecordGrade.tsx:94-97/100-103: safeParse failure falls through to the saved record's explain* with no invalid-draft indicator."
    status: resolved
  - id: 223e41a5e91628a8
    source: codex
    severity: P3
    file: src/ui/MatchHost.tsx
    line: 718
    summary: "Rejection text can remain stale across press-to-inspect."
    evidence: "clickSquare clears rejection for taps, but the long-press inspection handler neither clears nor replaces it."
    needs_relaxation: false
    disposition: accepted
    oracle_result: "setRejection clears only at 415,447,541,598,765,789; onInspect (718-723) and onCancel (744-747) call neither."
    status: resolved
  - id: 910f50b94c850573
    source: codex
    severity: P3
    file: src/engine/engine.ts
    line: 549
    summary: "Every refused move evaluates all active generate-move effects twice."
    evidence: "describeRejection first calls legalActions, which already computes generationModifiers; the rejected-move branch computes the same modifiers again."
    needs_relaxation: false
    disposition: accepted
    oracle_result: "engine.ts: legalActions already calls generationModifiers; describeRejection recomputes it at 549 for the move branch."
    status: pending
```

**A note on the PIDA oracle, because a silent degradation here looks like a working run.** The
harness's `second_opinion_oracle` gatherer runs `pytest` and `ruff`. This is a TypeScript project,
so it produced Python parser errors on `.tsx` files — evidence-shaped noise and nothing else. It
was **withheld** from the mode-B verifier rather than passed through, and the verifier was told
what actually ran instead (`tsc` clean, 1091 unit tests, 391 e2e). All five verdicts were reachable
by code inspection, which the verifier stated explicitly. A second detail worth recording: the
gatherer rejected every path on the first attempt because codex reports **absolute** paths and the
gatherer's path filter refuses them — the worktree prefix had to be stripped before it would look
at anything. Both of these are harness limitations on a non-Python stack, not review findings.

## Review Iteration Summary

| Iteration | Grade | Fixes Applied | Remaining | New |
|-----------|-------|---------------|-----------|-----|
| 1 (init)  | A     | 4 (orchestrator, not auto-fix) | 1 recorded-open | 0 |

Final grade: **A**
Iterations used: 1 / 2
Exit reason: converged
Status: **APPROVED**
human_review_needed: **true** — two P1 findings were `manual-only` (severity disagreement blocked
candidacy). Both are fixed and covered by regression tests; the flag stands because the letter
grade never counted them, and a reader deserves to know the A was not earned by their absence.
Counters: unreviewed 4 · prior-fix 0 · unattributed 0

**`unreviewed 4` is honest and not a formality**: the four fixes landed after the reviewers ran and
no reviewer has seen them. What has seen them: `tsc`, the 1098-test unit suite, the 391-test
Playwright suite, and four regression tests written specifically for the four defects — two of
which (the pointer-driven drag test, the band-follows-draft test) were verified to exercise a path
the pre-existing suite could not.
