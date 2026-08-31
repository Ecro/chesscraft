---
type: review
task_slug: veil-effect-move-persistence
status: APPROVED
grade: B
grade_threshold: B
created: 2026-09-01
review_run_id: 7334cb91bfa1
reviewers_invoked: [code-reviewer-design, code-reviewer-functionality, code-reviewer-robustness, code-reviewer-consistency, codex]
human_review_needed: false
confirm_pass_ran: true
confirm_pass_new_severe_n: 0
drift_verdict:
  result: clean
  scope_violations: []
  scenario_misses: []
  task_slug: veil-effect-move-persistence
  computed_at: 2026-09-01T01:05:00+09:00
---

# REVIEW — Capture-protection relocation

## Round 1 summary

The task delta matches the approved PLAN: the production change is confined to the engine
relocation seams, with dedicated engine/UI tests and workflow artifacts. The stored freeze base
predated the current task HEAD by the already-landed harness 0.55.0 commit; that pre-existing
commit was excluded from drift and finding adjudication. The actual staged task delta contained
seven files at round 1.

The consensus finalizer produced grade **B**, meeting the configured threshold **B**:

- P0: 0
- P1: 2
- P2: 5
- P3: 0
- dispositions: 7 accepted, 0 rejected, 0 duplicate, 0 unresolved
- mandatory lens coverage: design, functionality, robustness, consistency; no missing lenses

## Findings

### P1 — AC-005 later-occupant control uses the origin

- **ID:** `426462255558ef10`
- **Status:** pending; accepted; consensus-passed
- **Location:** `tests/engine/grant-relocation.test.ts`
- The protected subject is destroyed at `a3`, while the later replacement/capture query uses
  `a2`. Immediate origin/destination grant absence is asserted, but the later-destination
  occupant control is incomplete.

### P1 — royal-capture branch can reuse a mover changed by `on_leave`

- **ID:** `940fd1dd1e72043e`
- **Status:** pending; accepted; consensus-passed
- **Location:** `src/engine/engine.ts`
- A schema-supported `on_leave` effect can remove or relocate the mover before the terminal
  royal-capture early return reuses the cached piece. This is an adjacent pre-existing lifecycle
  edge; the ordinary Veil move and the tested terminal path are unaffected.

### P2 — `ActiveGrant` ownership comments are stale

- **ID:** `533362be0f9f41c2`
- **Status:** pending; accepted; consensus-passed
- **Location:** `src/engine/types.ts`
- The declaration still describes every grant as square-anchored although `block_capture` now
  follows its beneficiary. The exported type shape remains unchanged.

### P2 — card-relocation destruction lacks a dedicated oracle

- **ID:** `3a2dbd77f3e3e338`
- **Status:** pending; accepted; consensus-passed
- The production card branch performs the same survivor cleanup, but AC-005 directly exercises
  destruction only through a normal move.

### P2 — chained entry relocation lacks a dedicated oracle

- **ID:** `acdac97a701c5651`
- **Status:** pending; accepted; consensus-passed
- Direct teleport and batch swap are covered; an additional portal-style relocation hop is not
  separately pinned.

### P2 — full grant metadata preservation is not asserted deeply

- **ID:** `689df78c5ddb5565`
- **Status:** pending; accepted; consensus-passed
- Tests pin square, source, count, beneficiary behavior, and unrelated preservation, but do not
  deep-compare every duration/provenance field after relocation.

### P2 — non-protection removal control is not dedicated

- **ID:** `f67bfa63bb84369d`
- **Status:** pending; accepted; consensus-passed
- AC-003 pins `frozenUntil`, `forbid_movement`, and `grant_movement` across teleport; it does not
  repeat the negative control after destination destruction.

## Repair and confirmation passes

Confirmation pass 1 found two new documentation-consistency items:

1. The survivor-cleanup docstring overstated identity precision; it now states that the engine
   checks for a beneficiary-side occupant and cannot distinguish same-side replacement without
   stable piece IDs.
2. The PLAN claimed dedicated promotion and terminal-`liveEffects` coverage that the task did
   not add. The claims were narrowed to the executed scenarios.

Both changes were frozen and re-reviewed. Confirmation pass 2 exercised all four mandatory
lenses and reported zero new P0/P1 findings. No confirmation fix remained unreviewed.

## Cross-model findings frozen at round 1

Codex was invoked once because the staged change classified as high-diff when workflow documents
and tests were counted. PIDA accepted all five returned findings. They were reconciled and
recorded exactly once.

```json
{
  "frozen_at_round": 1,
  "models": ["codex"],
  "findings": [
    {"id":"940fd1dd1e72043e","source":"codex","severity":"P1","file":"src/engine/engine.ts","line":1374,"summary":"Terminal royal capture reuses a mover changed by on_leave","evidence":"The early return uses a cached piece after mutable on_leave effects.","needs_relaxation":false,"disposition":"accepted","oracle_result":"Confirmed by engine control flow; targeted source-path Vitest had no direct source-file test selector and project typecheck passed.","status":"pending"},
    {"id":"3a2dbd77f3e3e338","source":"codex","severity":"P2","file":"tests/engine/grant-relocation.test.ts","line":202,"summary":"Card-relocation destruction path lacks direct coverage","evidence":"AC-005 uses normal movement only.","needs_relaxation":false,"disposition":"accepted","oracle_result":"Focused relocation tests passed but do not exercise the card cleanup branch.","status":"pending"},
    {"id":"acdac97a701c5651","source":"codex","severity":"P2","file":"tests/engine/grant-relocation.test.ts","line":102,"summary":"Cascaded relocation lacks direct coverage","evidence":"Direct teleport ends on an inert square.","needs_relaxation":false,"disposition":"accepted","oracle_result":"Focused tests passed without a second relocation hop.","status":"pending"},
    {"id":"689df78c5ddb5565","source":"codex","severity":"P2","file":"tests/engine/grant-relocation.test.ts","line":96,"summary":"Grant metadata preservation is not deep-compared","evidence":"Assertions project primarily to square and source.","needs_relaxation":false,"disposition":"accepted","oracle_result":"Focused tests passed without a full-object preservation oracle.","status":"pending"},
    {"id":"f67bfa63bb84369d","source":"codex","severity":"P2","file":"tests/engine/grant-relocation.test.ts","line":161,"summary":"AC-003 removal control is absent","evidence":"The negative control uses surviving teleport only.","needs_relaxation":false,"disposition":"accepted","oracle_result":"Focused tests passed without destructive non-protection control.","status":"pending"}
  ]
}
```

## Verification evidence

- RED: 6 intended failures and 15 passes before implementation.
- Phase A.5 test review: FAIL on round 1, PASS on round 2 after strengthening swap multiplicity
  and later-occupant assertions.
- Focused engine/UI regression: 6 files, 63 tests passed.
- Changed-test selection: 91 files, 852 tests passed.
- Full Vitest: 177 files, 1,881 tests passed.
- `npm run typecheck`: passed.
- `npm run verify:ci`: production build passed; 1,881 unit tests and 21 build tests passed.
- Full `/hm:verify` exposed a pre-existing random-match flake in `e2e/collection.spec.ts`; the test now uses fixed seed 20 and force-clicks only in its high-volume match driver.
- Stabilized collection E2E: 9/9 across all projects, then 18/18 with `--repeat-each=2`.
- Focused post-fix review across functionality, robustness, and consistency found no new P0/P1/P2 findings.
- Final `npm run verify`: typecheck and production build passed; Vitest 1,881/1,881; Playwright 454 passed / 17 skipped; PWA 6/6; build tests 21/21.
- `git diff --check`: passed after removing report whitespace.

## Review iteration summary

| Iteration | Grade | Applied repairs | Remaining | New |
|---|---|---:|---:|---:|
| 1 | B | 0 | 2 P1, 5 P2 | 7 |
| confirm-1 | B | 2 documentation repairs | known round-1 set | 2 documentation findings |
| confirm-2 | B | 0 | known round-1 set | 0 severe |
| verify-fix | B | deterministic collection E2E | known round-1 set | 0 |
| confirm-3 | B | 0 | known round-1 set | 0 P0/P1/P2 |

Final grade: **B**
Iterations used: 2 / 2
Exit reason: **converged**
Status: **APPROVED**
`human_review_needed`: **false**
Counters: unreviewed fixes 0 · regression-attributed 0 · attribution-unknown 0
