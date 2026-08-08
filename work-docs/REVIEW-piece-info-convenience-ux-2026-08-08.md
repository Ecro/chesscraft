---
type: review
task_slug: piece-info-convenience-ux
status: APPROVED
created: 2026-08-08
reviewers_invoked: [stage-orchestrator-self-review, codex]
consensus_method: single + cross-model second opinion
drift_verdict:
  result: clean
  scope_violations: []
  scenario_misses: []
  task_slug: piece-info-convenience-ux
  computed_at: 2026-08-08T11:40:00Z
---

# REVIEW — piece-info-convenience-ux

## 🎯 Round 1 Summary

| | |
|---|---|
| Grade (round 1) | **B** — 0 × P0, 2 × P1 |
| Grade (round 2, after auto-fix) | **A** — 0 × P0, 0 × P1 |
| Findings | 4 (2 × P1, 2 × P2), all from the cross-model voter |
| Fixes applied | 4 / 4 |
| `human_review_needed` | **false** |

**Reviewer provenance, stated plainly.** The `code-reviewer` agent was **not
dispatched** — an operator instruction active in this session forbids Agent-tool
use unless the user asks for it. The Claude-side review is therefore the stage
orchestrator reading the diff itself, and it is recorded as such rather than
attributed to an agent that never ran (ledger: `plan-validator` and
`test-reviewer` both carry `dispatch-failed` / `dispatch-skipped` rows with that
reason). The cross-model voter DID run.

**Cross-model second opinion: `codex`, `status: invoked`.** The Side-preset gate
was met on measurement, not on assumption — `hm high_diff classify` returned
`{"is_high": true, "reasons": ["file count 20 > 3", "added lines 2581 >= 400"]}`.
Every one of the four findings below came from it, and every one was confirmed
against the source before being accepted. That is the honest summary of this
review: the model found four real defects that the self-review had not.

## 🔍 Drift Findings

**`result: clean`.** Every changed file is inside the PLAN's stated scope, with
one authorized expansion:

`e2e/hotseat.spec.ts`, `e2e/layout.spec.ts`, `e2e/match-lifecycle.spec.ts` and
`e2e/routing.spec.ts` are outside the PLAN's original Phase 5 scope. They were
touched under the R3 triage the user explicitly authorized ("keep the WebKit
project and triage by class"), whose own description said it widens the diff.
Recorded in the PLAN's execution record rather than left for a reader to
discover. Not counted as drift.

No SPEC scenario lacks coverage: AC-001…AC-010 each map to at least one test in
`## ✅ Verification Criteria`, and all of them run.

## ✅ Consensus Findings

All four reached `consensus-passed`: sourced by `codex`, then verified against
the actual source by the orchestrator (K=2, ADR-006).

### P1 — a drag swallows the next keyboard activation

- **File:** `src/ui/usePressInspect.ts`
- **OBSERVE:** `pointerHandled` was a bare boolean, set to `true` on every
  `pointerup`.
- **TRACE:** a drag ending on a different square produces no `click` on either
  square — the browser dispatches it to their common ancestor. So nothing ever
  reached `onClick` to clear the flag.
- **INFER:** the flag stayed armed indefinitely. The next Enter or Space on a
  focused square hit the guard and was discarded.
- **CONCLUDE:** one lost keystroke after every drag, for exactly the users the
  keyboard route was added for.
- **Why the suite missed it:** the generated domain drives ONE pointer sequence
  per case. A keystroke arriving *after* a completed drag is two interactions,
  and no case in a 200-sequence sweep of single gestures can contain it.
- **Fix:** the guard now names the square whose click is spent
  (`swallowClickOn`), and a drag arms it for nothing.

### P1 — a press released off the board still inspects

- **File:** `src/ui/usePressInspect.ts` / `src/ui/MatchHost.tsx`
- **OBSERVE:** move/up/cancel were handled only by per-square React handlers.
- **TRACE:** a finger sliding off the board produces no `pointermove` on any
  square, so the displacement is never measured and the tolerance never trips;
  a release outside the board reaches no square handler at all.
- **INFER:** the hold timer fires on schedule and opens a detail sheet for a
  gesture that left the board, and the sequence is left dangling.
- **CONCLUDE:** a phantom sheet on a scroll-off, on the primary input for this
  product.
- **Fix, and a rejected fix worth recording:** `setPointerCapture` is the
  textbook answer and is **wrong here** — capture retargets later events to the
  captured element, so the release of a drag from a1 to b2 would arrive at *a1*
  and every drag would resolve as a tap on its origin. The destination square is
  the one thing this arbiter cannot lose. Window listeners for the sequence's
  lifetime give the same visibility without touching event targeting; React's
  delegated handler still resolves a release over a square first, so the window
  listener finds nothing to do.

### P2 — multi-touch conflation

- **File:** `src/ui/usePressInspect.ts`
- **OBSERVE / TRACE:** one stored sequence, no `pointerId`. A second finger
  replaced the first; an up from either finger resolved whichever sequence was
  stored.
- **CONCLUDE:** a tap or drag committed for the wrong physical gesture. Two
  hands on the board is not exotic for a nine-year-old.
- **Fix:** the sequence records its `pointerId`; a second pointer is ignored
  until the first resolves.

### P2 — `pointercancel` leaked the eager drag selection

- **File:** `src/ui/MatchHost.tsx`
- **OBSERVE:** `beginDrag` sets `selected` on pointerdown so a drag has a
  highlight; the hook's cancel path cleared only its own state.
- **TRACE:** `touch-action: manipulation` keeps the board pannable, so a scroll
  starting on the player's own piece produces a real `pointercancel`.
- **CONCLUDE:** the piece stays selected with its legal moves lit, for a gesture
  the player never completed — and the hook's own contract said a cancelled
  sequence delivers nothing.
- **Fix:** an `onCancel` callback; `MatchHost` restores `selectedAtPress` and
  clears `dragFrom`, mirroring the inspect path.

## ⚠️ Weak Consensus

None.

## 📝 Manual-Only Findings

None. `unverified_severe = false`.

## 🤝 Disagreements

None — the orchestrator confirmed all four rather than contesting any. Worth
stating that this is *not* two independent reviewers agreeing: it is one model
finding and one verifying. The verification was done against the source, and the
regression it caught (pointer capture breaking drag targeting) is the evidence
that it was a real check rather than assent.

## 🧊 Cross-model findings (frozen @ round 1)

| id | model | severity | file | disposition | notes |
|---|---|---|---|---|---|
| `dada1c5534811d4f` | codex | P1 | `src/ui/usePressInspect.ts` | **accepted** | confirmed; drag arms a guard nothing clears |
| `7147be3758151aa9` | codex | P1 | `src/ui/MatchHost.tsx` | **accepted** | confirmed; fixed by window listeners, not by the suggested capture |
| `7fa25557ba502545` | codex | P2 | `src/ui/usePressInspect.ts` | **accepted** | confirmed; `pointerId` now tracked |
| `a4a2c9c42ed4424b` | codex | P2 | `src/ui/MatchHost.tsx` | **accepted** | confirmed; `onCancel` rollback added |

`status: invoked`, `reason: null`. No finding was rejected, duplicated or left
unresolved.

## Iteration 2 (Grade: B → A)

Fixes applied: 4

| # | Severity | Summary | File | Status |
|---|----------|---------|------|--------|
| 1 | P1 | Square-scoped click guard replaces the bare boolean | `src/ui/usePressInspect.ts` | Applied |
| 2 | P1 | Window listeners for the sequence's lifetime | `src/ui/usePressInspect.ts` | Applied · capture rejected, see above |
| 3 | P2 | `pointerId` ownership | `src/ui/usePressInspect.ts` | Applied |
| 4 | P2 | `onCancel` rollback of the eager selection | `src/ui/MatchHost.tsx` | Applied |

Remaining: 0 | New issues introduced: 0

**Tests added for the windows these fixes opened** (Phase D.5 discipline — each
case was reachable before the fix and by nothing already in the suite):

- keyboard activation immediately after a drag;
- a click swallowed only on the square that produced it;
- a second finger ignored while the first still owns the board;
- movement off the board observed, and no inspect after it;
- a release no square claimed treated as a cancellation;
- a square's own release resolving before the window listener sees it;
- window listeners installed and removed once per sequence (leak guard).

`tests/ui/press-gesture.test.tsx`: 8 → 15 tests.

## Review Iteration Summary

| Iteration | Grade | Fixes Applied | Remaining | New |
|-----------|-------|---------------|-----------|-----|
| 1 (init)  | B     | —             | 4         | —   |
| 2         | A     | 4             | 0         | 0   |

Final grade: **A**
Iterations used: 2 / 2
Exit reason: converged
Status: **APPROVED**
human_review_needed: false
Counters: unreviewed 0 · prior-fix 0 · unattributed 0

## Post-fix verification, including one more WebKit finding

`npm run verify` after the four fixes surfaced a **third** WebKit routing
failure, unrelated to this feature: `routing.spec.ts:89` — an unknown path is
routed correctly but the `replaceState` that rewrites the URL intermittently
does not land (1 in 3 repeats at `--workers=1`; it passed in a full clean run).

Handled the same way as the other two rather than retried away: recorded as
**symptom 2** in `work-docs/FINDING-webkit-back-guard.md`, skipped on WebKit
only with the reason naming it, and explicitly labelled *intermittent* — a retry
would have made it green while deleting the only evidence that it is a race.

## Note for `wrapup`

Two things should not be lost in the commit message or the memory capture:

1. **`work-docs/FINDING-webkit-back-guard.md` is open, with two symptoms.** The
   WebKit project surfaced a possible real defect in the app's History API
   handling — the back guard's confirm did not fire (deterministic), and
   unknown-path normalization intermittently does not land. Both are out of this
   task's scope and are skipped on WebKit only, against that document.
2. **The generated-sequence property test had a blind spot with a shape.** It
   swept 200 single gestures and could not see a second interaction following
   one. Both P1s here lived in that gap. The generalization worth remembering is
   that a property over *one* interaction says nothing about state carried into
   the *next* one.
