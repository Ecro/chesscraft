---
type: review
task_slug: skill-then-move-and-effect-visibility
status: APPROVED
created: 2026-08-08
reviewers_invoked: [code-reviewer, codex]
consensus_method: single + cross-model voter
grade: A
human_review_needed: false  # true at round 1; the P1 that raised it was fixed in iteration 2
drift_verdict:
  result: clean
  scope_violations: []
  scenario_misses: []
  task_slug: skill-then-move-and-effect-visibility
  computed_at: 2026-08-08T01:20:00Z
---

# REVIEW — skill-then-move-and-effect-visibility (round 1)

## 🎯 Round 1 Summary

**Grade: A** — zero `consensus-passed` P0/P1 findings.

**`human_review_needed: true`.** One P1 finding is present as `manual-only`: it came from the
cross-model voter, survived refutation (disposition `accepted`, verified against the source),
and no second voice agreed with it, so it cannot reach consensus and cannot lower the letter.
That is exactly the case the unverified-severe flag exists for — the grade is honest and
incomplete at the same time.

| Source | Findings | Severities |
|---|---|---|
| `code-reviewer` (Claude) | 4 | 3×P2, 1×P3 |
| `codex` (cross-model voter) | 1 | 1×P1 |
| Drift gate | 1 | 1×P1 (integration) |

No finding reached `consensus-passed`: the two voters found disjoint issues, so every finding
is single-source. Nothing was auto-fixed — the auto-fix loop runs only below the grade
threshold, and the grade cleared it.

**What the reviewer verified as correct, not merely asserted** (recorded because it is the
load-bearing half of a review): the two close-outs implement ADR-001's clause table exactly —
`win` and the royal transition run per action, `checkCount` / `end_of_ply` / `PLY_CAP` only on
the turn-closing action; `bumpTurns` is unreachable from the card branch, so the AC-006
second-draft trigger cannot double-count; contextual `undo` distinguishes mid-turn from
completed-turn across every traced sequence including draft boundaries; `positionKey` folds
`turnCard` and the frozen *expiry* only; `liveEffects` is one correctly-pruned derivation
feeding all three surfaces.

## 🔍 Drift Findings

**P1 — the branch cannot be landed as it stands: three of its files were deleted upstream.**

The PLAN's scope is intact — every changed file belongs to a phase, and every SPEC criterion
added has a verification row — so the formal `drift_verdict` is `clean`. The blocker is not
drift from the PLAN but divergence from `master`, which moved four commits while this branch
was being built:

```
c09fa9d feat(balance): price a record by what it says, not by how often it wins
c153e6d feat(balance): five stars, and a top the scale can actually hold
2fbae85 fix(test): audit the price on material, not on who won
c54d780 chore: re-render harness-maker harness to 0.50.1
```

`c09fa9d` **deletes** `src/balance/cache.ts`, `src/balance/shipped-grades.ts`,
`src/balance/bands.ts`, `src/balance/predict.ts`, `src/balance/grade-client.ts` and
`src/balance/worker.ts`, replacing the measured-grade machinery with `cost.ts` +
`grading-agent.ts`. Phase 7 of this branch edits exactly two of the deleted files
(`cache.ts`'s `MEASUREMENT_REVISION`, `shipped-grades.ts`'s regenerated table) plus
`tests/balance/measure.test.ts`, also deleted. `task-refresh` attempted the rebase and
aborted on the modify/delete conflict, leaving the branch untouched.

**Consequence:** the 600-seed re-measurement is an answer to a question the codebase stopped
asking. The turn-model, provenance and UI work is unaffected — the other 21 files rebase
cleanly, with at most a textual conflict in `src/i18n/ko.ts` where both sides added keys.

**Suggested resolution:** rebase taking `master`'s deletion for all three balance files
(dropping Phase 7 wholesale), then re-ask under the new cost model whether the turn change
needs anything of it. The measured deltas are not lost — they are recorded in the PLAN's
execution-status section, which is where the "eleven of thirteen cards went from negative to
positive" result now lives.

## ✅ Consensus Findings

None. The two voters found disjoint issues; no pair satisfied surface match (same file,
line ± 5, same severity tier), so no cluster formed.

## ⚠️ Weak Consensus

None.

## 📝 Manual-Only Findings

### P1 — a card turn costs two search depths, so cards and moves are compared at unequal horizons
`src/engine/ai/search.ts:435-437` · source `codex` · disposition `accepted`

**Observe.** The `play_card` branch recurses with `depth - 1`, and the follow-up move it
obliges decrements again, so one turn consumes two levels. `negamax` opens with
`if (depth <= 0 …) return evaluate(state, …)`.

**Infer.** At depth 1 the card child is at depth 0 and is scored statically — the move the
card obliges is never expanded. The position after a card and before its owner's move is not
a quiet position: material is unchanged, the effect has landed, and the reply is not yet
paid for.

**Conclude.** At the frontier the search compares a card line evaluated one action deep
against a move line evaluated a full ply deep. Cards are systematically mispriced there, and
the deeper the iterative-deepening loop goes the more frontier nodes exist. Verified against
the source, not taken on the model's word.

**Suggestion.** Do not decrement for a card play — `negamax(child, depth, alpha, beta, side, ctx)`.
That makes depth count *plies*, which is what ADR-002 already says a turn is, and it
terminates because `turnCard` forbids a second card. Cost is bounded by
`FOLLOW_UP_MOVE_CAP = 6`.

### P2 — the AI thinking indicator can blink off between the card and the move
`src/ui/MatchHost.tsx:440-488` · source `code-reviewer`

`land()` calls `setAiThinking(false)` and then `push()`. When the pushed action is a card the
side does not change, so the effect re-fires and sets it true again — but the `false → true`
transition straddles a `useEffect` boundary, so a render with `aiThinking === false` can paint
between the computer's two searches. PLAN Phase 5 names this as a requirement and no code
enforces it; no test covers it.

**Suggestion.** Clear the indicator only when the pushed action actually hands the turn over
(mirror `push`'s own `handedOver` computation, or gate on `next.turnCard === null`).

### P2 — the flourish silently skips a re-applied effect
`src/ui/MatchHost.tsx:322-326` · source `code-reviewer`

`arrived` diffs `square:kind` pairs against the previous state. Re-freezing an already-frozen
square, or extending a live grant, leaves that key unchanged, so the square is not marked as
touched this ply even though an effect genuinely fired on it. The badge's count updates; the
flourish ADR-005 promises does not fire.

**Suggestion.** Key on `square:kind:sourceId:remaining`, or diff against the ply's `log`.

### P2 — the negamax sign rule is unverified below the root
`src/engine/ai/search.ts:435-437` · source `code-reviewer`

The same one-line rule runs at the root and recursively. Only the root is pinned. The PLAN
records that a fixture for the recursive case was written, passed with the bug reintroduced,
and was deleted as non-discriminating. The reviewer independently reached the same conclusion
and asks for a shallower forced-order position that reliably reaches a card node one ply down.

This is a **known, self-disclosed gap**, surfaced here because it sits in the code path this
change most needed to get right: a regression reverts every card to "priced at the worst thing
its owner could do next", silently.

### P3 — `wouldRevealDraft` estimates the second-draft pool differently from `bumpTurns`
`src/engine/ai/search.ts:289-293` · source `code-reviewer` · `out_of_diff: true`

It reads `preset.skillCardIds` directly while `bumpTurns` goes through
`skillPoolFor(preset, mover)`, which appends the side's own loadout card. For a preset with a
per-side loadout skill the pool-size check can undercount and return `false` for a node where
a draw would really happen, letting the search recurse into an information boundary it should
score statically. **Pre-existing** — this branch touched only the action-kind exclusion in
that function — but adjacent to the change and worth carrying forward.

## 🤝 Disagreements

None. The voters did not overlap on any location.

## 🧊 Cross-model findings (frozen @ round 1)

| id | model | severity | file:line | summary | disposition | in grade? |
|---|---|---|---|---|---|---|
| `377ec80d230c0ec9` | codex | P1 | `src/engine/ai/search.ts:438` | Card turns consume two search depths, so the AI evaluates unequal numbers of plies | `accepted` | no — `manual-only`, no second voice |

`second_opinion_results`: `[{ "model": "codex", "status": "invoked", "reason": null }]`

Gate: high-diff (24 files, +2757 lines → `is_high: true`), so the model was invoked per the
Side-preset matrix. Refutation oracle was the source itself — `negamax`'s depth guard and the
two recursive call sites were read directly, and they confirm the claim.

## Iteration 2 — fixes applied at the operator's direction (Grade: A → A)

The grade had already cleared the threshold, so the auto-fix loop did not run. These three
were applied by explicit instruction after the round-1 report, with the integration blocker
resolved the same way.

Fixes applied: 3 · reverts: 1 phase

| # | Severity | Summary | File | Status |
|---|----------|---------|------|--------|
| 1 | P1 | A card play no longer spends a level of search depth — depth counts plies, which is what ADR-002 says a turn is | `src/engine/ai/search.ts` (both call sites) | Applied · caused_by=none |
| 2 | P2 | The thinking indicator is cleared only when the computer's action actually ends its turn | `src/ui/MatchHost.tsx` | Applied · caused_by=none |
| 3 | P2 | The flourish key gained the source and the EXPIRY, so a re-application counts as newly arrived | `src/ui/MatchHost.tsx` | Applied · caused_by=none |
| — | P1 | Phase 7 (balance) reverted wholesale; the rebase takes `master`'s deletion | `src/balance/{cache,shipped-grades}.ts`, `tests/balance/measure.test.ts` | Reverted to base · caused_by=none |

**Fix #3 was nearly a self-inflicted defect and is worth recording.** The first version keyed
the flourish on `square:kind:sourceId:remaining`. `remaining` ticks down every ply, so every
surviving effect would have been marked newly-arrived on every single ply — a board flashing
constantly says nothing at all. The key is `remaining + plyCount` (the absolute expiry):
constant while an effect merely persists, pushed forward exactly when something re-applies it.

**Remaining open (unchanged by this iteration):** the P2 coverage gap on the recursive
negamax sign rule, and the P3 `wouldRevealDraft` pool mismatch (pre-existing, out of diff).

### Verification after the fixes

- `tsc --noEmit` — clean.
- `tests/engine` — green.
- `tests/ui` — green in isolation (14/14 for the new file, 36/36 for the three that flaked).
- **Two balance tests are RED on this branch by design.** Reverting Phase 7 restores a grade
  table measured under the OLD turn economy, which the new engine no longer reproduces. Both
  files are deleted by `master`'s `c09fa9d`, so the rebase removes them along with the
  failure. This is stated rather than papered over: anyone running the suite on this branch
  before the rebase will see two red tests, and they are the two the rebase deletes.
- **Load-dependent flakiness in the jsdom UI suite is real and pre-existing.** Four different
  UI files have failed under full-suite parallelism and passed in isolation across this
  session (`editor-shell-state`, `game-feel`, `match-lifecycle`, `overlay-and-stale-board`,
  and now `effect-visibility`). The first of those flaked before any UI work on this branch
  existed. Worth its own investigation; not this change's defect.

## Review Iteration Summary

| Iteration | Grade | Fixes Applied | Remaining | New |
|-----------|-------|---------------|-----------|-----|
| 1 (init)  | A     | —             | 6         | —   |
| 2         | A     | 3 (+1 revert) | 2         | 0   |

Final grade: A
Iterations used: 2 / 2
Exit reason: converged
Status: APPROVED
human_review_needed: false — the P1 that raised it has been fixed; the two remaining findings
are P2/P3, which never set the flag.
Counters: unreviewed 0 · prior-fix 0 · unattributed 0
