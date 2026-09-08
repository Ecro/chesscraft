---
type: review
task_slug: piece-upgrade-acquisition
status: approved
created: 2026-09-03
reviewers_invoked: [design, functionality, robustness, consistency, codex]
consensus_method: cross-check
drift_verdict:
  result: clean
  scope_violations: []
  scenario_misses: []
  task_slug: piece-upgrade-acquisition
  computed_at: 2026-09-03T00:00:00+09:00
---

# REVIEW — piece upgrade acquisition

## 🎯 Round 1 Summary

Grade: **C**. Nine accepted P1 findings require a repair round; two accepted P2 consistency findings and one cross-tier Codex P2 record do not lower the grade. Mandatory Side coverage is complete: design, functionality, robustness, and consistency all returned. The independent Codex voter ran because the diff was classified high and PIDA accepted all seven of its findings.

## 🔍 Drift Findings

No scope violation or scenario miss. All 74 changed files map to the PLAN's content, migration, progression, equipment, UI, art, or release-gate phases. Contract-boundary files remain untouched.

## ✅ Consensus Findings

| ID | Severity | Summary | Location | Voices | Disposition |
|---|---|---|---|---|---|
| `77b6aae132f15ce0` | P1 | Document-wide legacy marker lets unrelated v17 slots bypass exact-square validation | `src/content/load.ts:509` | design, consistency, codex | accepted |
| `e35066b5f3a7c050` | P1 | Device upgrade cannot override a room-authored piece slot | `src/progression/equipment.ts:52` | functionality, codex | accepted |
| `1722a7ac4371766f` | P1 | Editor-launched matches bypass eligibility and completion rewards | `src/ui/App.tsx:657` | functionality, codex | accepted |
| `4825a36dc91e9d74` | P1 | Transient save failure permanently consumes the match claim attempt | `src/ui/MatchHost.tsx:489` | functionality, robustness | accepted |
| `304fcfbb013700a7` | P1 | Stale tabs can overwrite newer progression snapshots | `src/ui/App.tsx:215` | robustness | accepted |
| `1e9ed3ebabc548a5` | P1 | Reveal, choice, and forge persistence failures have no visible recovery state | `src/ui/UpgradeReward.tsx:24` | robustness | accepted |
| `58ad29c4d1b6b11f` | P1 | Effective upgrades bypass the active room ceiling and loadout budget | `src/progression/eligibility.ts:97` | functionality, codex | accepted |
| `5d819e371872ae5f` | P1 | Bundle merge drops the v16 migration marker and breaks migrated saves on reload | `src/content/merge.ts:132` | functionality, codex | accepted |
| `7abe1290e6ade863` | P1 | Progression load failures are treated as empty and can overwrite recoverable state | `src/ui/App.tsx:209` | functionality, codex | accepted |
| `18a7d8125c658a08` | P2 | `placementsFor` documentation describes replace-all as the only behavior | `src/engine/loadout.ts:51` | consistency | accepted |
| `5dd4a3684598c7df` | P2 | PLAN claims sorted ownership serialization but implementation preserves acquisition order | `work-docs/PLAN-piece-upgrade-acquisition.md:213` | consistency | accepted |

## ⚠️ Weak Consensus

None.

## 📝 Manual-Only Findings

| ID | Severity | Summary | Location | Reason |
|---|---|---|---|---|
| `a96dd9fb7445e75d` | P2 | Concurrent tabs can overwrite each other's progression snapshots | `src/ui/App.tsx:215` | Codex assigned P2 while the robustness lens independently assigned P1; cross-tier records are not merged. |

## 🤝 Disagreements

The stale-tab lost-update defect is P1 under robustness and P2 under Codex. The records remain independent as required; the P1 lens record governs the repair queue.

## 🧊 Cross-model findings (frozen @ round 1)

frozen_at_round: 1
models: [codex]

| id | source | severity | file | line | summary | evidence | needs_relaxation | disposition | oracle_result | status | invalidation_reason |
|---|---|---|---|---:|---|---|---|---|---|---|---|
| `11cd2a8e88550e08` | codex | P1 | `src/progression/equipment.ts` | 52 | Owned upgrades cannot override a room-authored piece slot | Resolver and UI reject room-piece override. | false | accepted | ADR-006 and the engine precedence path confirm the contradiction. | resolved | — |
| `9ef29612a7594700` | codex | P1 | `src/progression/eligibility.ts` | 97 | Equipped upgrades can exceed the active room ceiling or budget while still standard | Effective equipment is omitted from both envelope checks. | false | accepted | Functionality cross-check confirmed a reachable room-dependent over-budget path. | resolved | — |
| `5f064465ac073b40` | codex | P1 | `src/ui/App.tsx` | 655 | Standard matches launched from the editor never grant completion Sparks | Editor Play clears `matchSetup`. | false | accepted | MatchHost returns when eligibility is absent. | resolved | — |
| `e7a858def94b9f48` | codex | P1 | `src/content/merge.ts` | 131 | Reloading a saved migrated-v16 loadout loses its migration marker | `mergeBundled` reconstructs source without the marker. | false | accepted | Functionality cross-check traced the next-load rejection. | resolved | — |
| `e0550a7b8ac7a928` | codex | P1 | `src/content/load.ts` | 505 | A schema-v17 document can forge the legacy marker and obtain replace-all playback | Loader and import trust an input-supplied marker. | false | accepted | Loader/import inspection confirms the marker has no provenance proof. | pending | — |
| `d74b97e54071ad3a` | codex | P1 | `src/ui/App.tsx` | 209 | Failed progression loads are presented as empty and can overwrite recoverable state | App discards the load reason. | false | accepted | A later successful v1 write can destroy future-version or temporarily unreadable data. | resolved | — |
| `a96dd9fb7445e75d` | codex | P2 | `src/ui/App.tsx` | 215 | Concurrent tabs can overwrite each other's progression snapshots | Full snapshots are written without rereading storage. | false | accepted | Robustness independently confirmed the same failure at P1. | pending | — |

## 🔧 Auto-Fix Iterations

### Iteration 2 (Grade: C → B)

Fixes applied: 9

| # | Severity | Summary | File | Status |
|---|---|---|---|---|
| 1 | P1 | Device equipment overrides the room piece axis without stacking | `src/progression/equipment.ts` | Applied · caused_by=none |
| 2 | P1 | Editor Play freezes equipment and eligibility | `src/ui/App.tsx` | Applied · caused_by=none |
| 3 | P1 | Match reward write failure keeps the claim retryable | `src/ui/MatchHost.tsx` | Applied · caused_by=none |
| 4 | P1 | Failed/future progression loads are read-only and stale snapshots are detected | `src/ui/App.tsx` | Applied · caused_by=none |
| 5 | P1 | Reveal, choice, and forge failures have visible retry state | `src/ui/UpgradeReward.tsx` | Applied · caused_by=none |
| 6 | P1 | Effective equipment is checked against active ceiling and budget | `src/progression/eligibility.ts` | Applied · caused_by=none |
| 7 | P1 | v16 migration marker survives additive bundle merge | `src/content/merge.ts` | Applied · caused_by=none |
| 8 | P2 | Exact-square versus migration-only replace-all documentation corrected | `src/engine/loadout.ts` | Applied · caused_by=none |
| 9 | P2 | Ownership serialization wording corrected | `work-docs/PLAN-piece-upgrade-acquisition.md` | Applied · caused_by=none |

Remaining: 2 P1. New issues introduced: 1 P1 (`c48531edc1be3852`, App-level retry blocked by the fail-closed issue state).

Churn: 0.2963 (max: `tests/ui/progression-result.test.tsx`, measured 18, excluded 0). Re-review: functionality, because `churn 0.30 >= 0.20`.

### Iteration 3 (Grade: B → B)

Fixes applied: 1

| # | Severity | Summary | File | Status |
|---|---|---|---|---|
| 1 | P1 | A `save-failed` action rereads storage and retries idempotently | `src/ui/App.tsx` | Applied · caused_by=#4 |

Remaining: 2 P1. New issues introduced: 0.

Churn: 0.1111 (max: `tests/ui/progression-result.test.tsx`, measured 3, excluded 0). Re-review: skipped — `churn 0.11 < 0.20`.

## 🧪 Confirmation Passes

- Confirm 1: **FAIL**. All seven lenses returned. Three new severe defects were accepted: an automatic reward write/render retry loop, a missing ceiling-only eligibility oracle, and a mixed room/device final-placement oracle gap. The separate veil feature was rejected as task drift because commit `68d0b65` is already the current integrated master/HEAD baseline, not an uncommitted task change.
- Confirmation repair: moved the latest persistence callback behind a ref so only explicit `rewardRetry` retriggers a failed claim; added independent ceiling and no-stacking match-placement tests.
- Confirm 2: **PASS**. All seven lenses returned; no new P0/P1 findings.

## 📌 Remaining Accepted Limitations

| ID | Severity | Summary | Reason not changed in review |
|---|---|---|---|
| `77b6aae132f15ce0` | P1 | Root-level v16 provenance marker can be forged for a square-less v17 slot | Proving per-slot migration origin requires a persisted contract change; forged legacy playback remains sandbox-ineligible for Sparks. |
| `304fcfbb013700a7` | P1 | Two tabs that read the same snapshot at the same instant can still race | The repair detects already-stale snapshots and synchronizes storage events, but a true cross-tab atomic transaction requires an asynchronous lock or revision protocol outside the fixed profile callback/storage contract. |

Non-blocking confirmation notes: the PLAN's `EffectiveEquipment` API example still conflates persisted and engine-facing shapes (P2), and `room-piece-conflict` is now a dead refusal member/copy key (P3).

## 🏁 Final Summary

- Status: **APPROVED**
- Grade: **B** (threshold: B)
- Exit reason: `converged`
- Human review needed: `false`
- Coverage: design, functionality, robustness, consistency, security, concurrency, tests
- Confirmation: pass 1 repaired; pass 2 clean
- Unreviewed fix count: 0
- Regression-attributed findings: 1
- Attribution unknown: 0

## Wrapup verification (2026-09-08)

- Production build and typecheck: PASS (`npm run verify:ci`).
- Full Vitest: 189 files, 1,990 tests passed; build-output tests: 4 files, 21 passed.
- Latest match-lifecycle Playwright: 14 passed, 1 intentional WebKit clipboard skip.
- Earlier release gates: targeted progression/accessibility/reduced-motion Playwright 62 passed, 1 intentional skip; production PWA 6 passed. No source changes since the final review verification.
- PLAN success checklist reconciled against phase evidence and the accepted limitations above.
- Drift verdict: clean; contract-boundary files unchanged; whitespace and unmerged-path checks clean.
- Structural gate: PASS, no baseline score recorded. No recorded unresolved high/P0 security findings.
