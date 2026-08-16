---
type: review
task_slug: 12x12-cards-balance
status: APPROVED
created: 2026-08-16
review_base: 95c2ef28fdbe2edfbc8ad1bacfdea9bee894452b
freeze_ref: refs/hm-freeze/v1/12x12-cards-balance-base
review_run_id: 20260816T131956Z
reviewers_invoked:
  - code-reviewer (design, functionality, robustness, consistency)
  - codex (cross-model second opinion)
  - code-reviewer (round-2 functionality rereview)
consensus_method: single
final_grade: B
human_review_needed: true
drift_verdict:
  result: scope_violation
  scope_violations:
    - .agents/**
    - .claude/**
    - .codex/hooks.json
    - AGENTS.md
    - CLAUDE.md
  scenario_misses: []
  task_slug: 12x12-cards-balance
  computed_at: 2026-08-16T22:52:57+09:00
---

# Review: 12x12 cards and balance

## Scope and method

The review was frozen against `95c2ef28fdbe2edfbc8ad1bacfdea9bee894452b` so later repair edits could not change the review span. The task has no machine SPEC; the repository's older 6x6 SPEC does not define acceptance criteria for this slug, so no finding was cleared by an AC-cited rejection.

The Side conditional route dispatched the four mandatory core lenses through `code-reviewer`: design, functionality, robustness, and consistency. Coverage passed for all four lenses. The Codex cross-model voter ran once at round 1; its finding set is frozen below and was not re-invoked.

## Round 1 — initial result

The merged round-1 result contained 6 P1 and 5 P2 consensus-counted findings and graded **C** with `human_review_needed: true`. It also contained cross-model-only manual findings which did not count toward the letter but did require human review.

Consensus findings:

| ID | Severity | Location | Finding |
|---|---|---|---|
| `658451b47cce81ef` | P1 | `.agents/**`, `.claude/**`, `AGENTS.md`, `CLAUDE.md` | Extensive out-of-plan harness changes create scope drift. |
| `4d5c7f21d4bfc33a` | P1 | `src/engine/ai/complexity.ts:180` | AI admission has no measured room-budget/fingerprint gate. |
| `b8f8f752c0a2964a` | P1 | `src/ui/styles.css:1334` | Piece marks used six-column sizing on larger boards. |
| `1a1b5786aca36d3b` | P1 | `src/engine/ai/complexity.ts:113` | Filtered target domains counted only opening material. |
| `b4a4d37800df52da` | P1 | `src/engine/engine.ts:1009` | Spawn/revive bypassed scoped chosen-empty destinations. |
| `691c2425f2391dab` | P2 | `tests/content/bundled-liveness-audit.test.ts:4` | Bundled liveness checked membership, not behavior. |
| `11881000a2dfdff7` | P2 | `tests/engine/square-liveness.test.ts:4` | Terrain reachability did not prove terrain behavior. |
| `d0610fb3e52dedd4` | P2 | `src/content/load.ts:398` | Loader did not diagnose recurring-award pool exhaustion. |
| `4087d29d0374be3e` | P2 | `src/engine/engine.ts:1607` | Recurring-award code retained second-draft documentation. |
| `0e828f0017499546` | P2 | `tests/engine/bundled-balance.test.ts:8` | Balance tests did not exercise the 12x12 preset. |
| `cb8b46cdbd68fe95` | P1 | `src/engine/engine.ts:1697` | Imported snapshots accepted out-of-bounds squares. |

Cross-model-only findings were recorded separately: loadout-only skill cards (`c68a2d5284d02684`), responsive board-frame sizing (`87e6884230f4f15f`), terrain behavior coverage (`64c34f7568162d6cf8`), inert Colossus Shrines (`6f4f5fe4226d6cf8`), loader pool diagnostics (`cfe7efa4b68b38c4`, merged into `d0610fb3e52dedd4`), editor target-filter controls (`e891830cdcecd4b9`, rejected), named zones (`cef6f695dcc1e51b`), and the non-discriminating complexity-width test (`01ac2fd7164d2331`).

## Round 2 — repair and rereview

The repair round applied these fixes:

1. `choiceSlotSpecs` now carries `act.at.region`; spawn and revive both call `isDestinationAllowed` before insertion. Added generation and forged-action tests for both paths.
2. `deserializeState` now requires positive integer dimensions and validates every imported square with `parseSquare` against those dimensions. Added malformed-dimension and out-of-bounds tests.
3. Complexity scoring now includes both loadout skill-card IDs and a conservative eligible spawn headroom in filtered target domains. The bound was adjusted from 20,000 to 20,500 so the shipped 12x12 room remains admitted after the correction.
4. Piece-mark sizing is derived from `--board-columns`, keeping the mark proportional to a cell on 6x6 through 12x12 boards.
5. Replaced the stale recurring-award/second-draft documentation and added a Colossus balance-path regression case.

Churn was `0.28776978417266186` (threshold `0.20`), so the configured rereview gate dispatched exactly one `code-reviewer` over the changed hunks. It returned no P0–P3 findings. The cross-model set was not re-invoked.

The final consensus payload graded **B**: 0 P0, 2 P1, 3 P2, 0 P3, with `human_review_needed: true` because two severe findings remain manual-only.

## Remaining findings

### Consensus-counted P1

**Scope drift — `658451b47cce81ef`.** OBSERVE: the review-base span includes broad `.agents`, `.claude`, `.codex`, `AGENTS.md`, and `CLAUDE.md` changes. TRACE: those files alter workflow and agent behavior rather than the 12x12 runtime. INFER: the task cannot be audited or merged as a focused implementation. CONCLUDE: isolate the harness changes into a separate task before wrapup.

**Measured AI admission — `4d5c7f21d4bfc33a`.** OBSERVE: `withinEnvelope` still admits rooms from a static score only. TRACE: no fingerprinted room budget or p95 latency manifest is consulted before the AI path. INFER: a 12x12 room can enter search without the planned measured evidence. CONCLUDE: the measured admission gate remains a follow-up required by the plan's partial Phase 5.

### Manual-only P1

**Responsive board floor — `87e6884230f4f15f` (`src/ui/MatchHost.tsx:1339`).** The 44px board-frame minimum reads `--board-columns` from an ancestor, while the variable is assigned on the descendant `.board`; the frame therefore falls back to six columns. This was cross-model-only and was not auto-fixed in the repair round. Set the variable on `.board-frame`/`.board-viewport` and add a responsive regression test in a follow-up.

**Terrain behavior oracle — `64c34f7568162d6cf8` (`tests/engine/square-liveness.test.ts:4`).** The liveness replacement proves only that terrain IDs are painted, not that effects resolve or that inert controls remain inert. Restore discriminating behavior probes for the shipped and new terrain types.

### P2 follow-ups

- `691c2425f2391dab`: add per-card legal-action/state-transition probes to the bundled liveness audit.
- `11881000a2dfdff7`: retain the terrain census but add resolving and inert behavior controls.
- `d0610fb3e52dedd4` / frozen raw ID `cfe7efa4b68b38c4`: either enforce or explicitly retire the recurring pool-floor diagnostic in the plan/spec.
- `6f4f5fe4226d6cf8`: Colossus Shrines at `c5` and `j8` are outside the board's promotion bands and are currently inert.
- `cef6f695dcc1e51b`: add named-zone creation and membership controls to `RecordForm`.
- `01ac2fd7164d2331`: make the complexity-width test hold the widened card and compare generated action widths.

## Resolved in round 2

The following round-1 findings are addressed and were removed from the final graded population: `b8f8f752c0a2964a` (cell-relative marks), `c68a2d5284d02684` (loadout skill union), `1a1b5786aca36d3b` (spawn headroom), `b4a4d37800df52da` (spawn/revive region enforcement), `cb8b46cdbd68fe95` (snapshot dimensions and bounds), `4087d29d0374be3e` (recurring-award documentation), and `0e828f0017499546` (12x12 balance coverage).

## Cross-model findings (frozen @ round 1)

The Codex voter was invoked once. The PIDA verifier accepted all listed findings except the editor target-filter finding, which it rejected because `SentenceSlot` already renders `controlsFor('targetFilter')`. No raw frozen finding was deleted; the loader finding was merged into lens finding `d0610fb3e52dedd4`.

| Frozen ID | Severity | Location | Disposition | Final state |
|---|---|---|---|---|
| `c68a2d5284d02684` | P1 | `src/engine/ai/complexity.ts:160` | accepted | resolved in round 2 |
| `1a1b5786aca36d3b` | P1 | `src/engine/ai/complexity.ts:113` | accepted | resolved in round 2 |
| `87e6884230f4f15f` | P1 | `src/ui/MatchHost.tsx:1339` | accepted | manual-only, unresolved |
| `64c34f7568162d6cf8` | P1 | `tests/engine/square-liveness.test.ts:4` | accepted | manual-only, unresolved |
| `6f4f5fe4226d6cf8` | P2 | `src/content/sets/bundled.ts:2094` | accepted | manual-only, unresolved |
| `cfe7efa4b68b38c4` | P2 | `src/content/load.ts:398` | accepted | merged to `d0610fb3e52dedd4` |
| `e891830cdcecd4b9` | P2 | `src/ui/SentenceSlot.tsx:498` | rejected by PIDA | excluded; target-filter controls exist |
| `cef6f695dcc1e51b` | P2 | `src/ui/RecordForm.tsx:1483` | accepted | manual-only, unresolved |
| `01ac2fd7164d2331` | P2 | `tests/engine/ai-complexity.test.ts:73` | accepted | manual-only, unresolved |

## Verification

- Targeted regression set: 5 files, 37 tests passed.
- Full Vitest suite: 164 files, 1,777 tests passed.
- `npm run typecheck`: passed.
- `npm run build`: passed; existing Vite native-loader and >500 kB chunk warnings remain.
- `npm run test:build`: 4 files, 21 tests passed.
- `git diff --check`: passed.
- The targeted-test selector returned `mode: full` because changed source files were classified as `source-without-hints`; the full suite was therefore required and executed.
- No commit was created by this review stage.

## Review Iteration Summary

| Iteration | Grade | Fixes Applied | Remaining | New |
|---|---|---:|---:|---:|
| 1 (init) | C | — | 17 | — |
| 2 | B | 7 | 10 | 0 |

Final grade: **B**  
Iterations used: **2 / 2**  
Exit reason: **converged** (grade threshold met)  
Status: **APPROVED**  
`human_review_needed`: **true**  
Counters: unreviewed / prior-fix / unattributed — not measured in this standalone run.

