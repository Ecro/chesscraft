---
type: review
task_slug: upgrade-catalog-twelve
created: 2026-09-08
status: APPROVED
grade: A
human_review_needed: false
run_id: 7038bcb078f8
review_base: 8444f9d3199f93f4aaa6618c3b86cb5daae24b5a
drift_verdict:
  result: clean
  scope_violations: []
  scenario_misses: []
  task_slug: upgrade-catalog-twelve
  computed_at: "2026-09-08T13:40:01Z"
---

# Review: Twelve Upgrade Catalog

## Verdict

APPROVED, grade A. No actionable introduced P0, P1 or P2 findings. All seven lenses returned in round 1 and confirm-1; both coverage checks report blocks_approval=false, missing=[].

This invocation is review-only: no source/test fixes, task commits, merges or pushes. The user's pending master delivery can proceed through wrapup after this review.

## Scope and Method

Reviewed all 16 changed paths (510 additions, 17 deletions) against PLAN-upgrade-catalog-twelve. No task-specific machine SPEC exists; the PLAN's success criteria and boundaries are the applicable contract. Every changed path is explicitly in scope. Engine, balance, storage transaction, reward and deployment files are unchanged. The profile shape/version, original four IDs/definitions and exact-square equipment contract remain intact.

The base resolver initially selected eb48a3ffcdae2edc313b9c996de2e39b80b761ed, from the previous task's history. Before dispatch, its task-local frozen base ref was corrected to this task's actual starting HEAD, 8444f9d3199f93f4aaa6618c3b86cb5daae24b5a. No branch HEAD or user index was reset.

Configured single-reviewer direct/full-context mode was used; metadata-redaction pass was not applicable. Seven independent lens tasks were scheduled in batches of at most three, respecting the session's four-slot capacity. All returned before grading; absence was not counted as a clean response. Additional caller context included Rules, App, UpgradePractice, rewards, record, io, equipment, eligibility, power and engine movement handling.

## Evidence

| Area | Evidence and conclusion |
|---|---|
| Catalog and power | src/progression/catalog.ts:9, src/content/sets/bundled.ts:280, tests/progression/catalog.test.ts:89: exactly twelve canonical IDs, three distinct alternatives per family; original defaults retained, all twelve bounded by existing power assertions. |
| Movement and captures | tests/progression/catalog-expansion.test.ts:51: explicit independent destinations for all eight additions on both sides; occupied-square probes and definition equality preserve base captures/promotion. Jump and friendly-destination assertions exercise real engine legality. |
| Persistence and old offers | src/progression/model.ts:75, tests/progression/catalog-expansion.test.ts:84: catalog-derived capacity, twelve-owned storage/backup round-trip, unchanged unknown/duplicate validation, byte-preserved old paid offer. |
| Acquisition and equipment | tests/progression/catalog-expansion.test.ts:110, e2e/upgrade-catalog-twelve.spec.ts:3: each addition can be revealed/chosen/forged/equipped; browser fifth acquisition survives reload and replaces only the chosen square. |
| Family UI | src/ui/UpgradeFamily.tsx:28, tests/ui/upgrade-catalog-twelve.test.tsx:38: canonical exact variant throughout; selector clears failed/acquired state and keyed practice resets; Rules keys details by piece. |
| Content migration | tests/progression/catalog-expansion.test.ts:137: valid older content receives eight missing IDs without losing authored content. |
| Security and concurrency | Selection resolves against the canonical catalog; strict parsing and synchronous verified storage remain unchanged. No new async writer, network, HTML execution, permissions or dependencies. |

## Frozen Cross-Model Set

frozen_at_round: 1
models: [codex]
findings: []

Invoker output preserved verbatim:

~~~json
{"model": "codex", "status": "invoked", "findings": [], "reason": null, "duration_s": 46.17084419999446}
~~~

Side classifier: is_high=true, boundary=false; reasons: file count 16 > 3, added lines 510 >= 400. The configured model was invoked exactly once. No findings required a PIDA oracle/disposition call.

## Validation Evidence

The relevant verification cache was fresh for the unchanged source/test tree, key 5e2e886bcc6b7fa0c73b75066c6abd95036a1f42d965711c4dbcb9d1ddfeaf98, passed_at 2026-09-08T13:16:23.907786+00:00. This review reused that evidence; it did not claim a fresh full-suite run.

- npm run verify:ci exit 0: TypeScript, production build, 2,044 tests / 193 files, plus 21 build tests / 4 files.
- Discovery and twelve-item browser coverage: 12 passed across desktop Chromium, mobile Chromium and mobile WebKit.
- git diff --check and cached diff whitespace checks passed.
- No fresh full PWA/offline-upgrade suite or child playtest was performed.

Logs: /tmp/twelve-ci-green.log and /tmp/twelve-e2e.log (local, ephemeral).

## Confirmation Pass

confirm-1 reviewed the full frozen span 8444f9d3199f93f4aaa6618c3b86cb5daae24b5a..b9ced310f67e7b64411e8d5dedf7871885414411, not a repair-only diff. All seven lenses returned zero findings. Source/test tree was checked against the frozen snapshot and remained identical.

Lenses exercised in both passes: design, functionality, robustness, consistency, security, concurrency, tests.
confirm_pass_ran: true
confirm_pass_new_severe_n: 0
No repair round or second confirmation was needed.

## Residual Limitations

These are documented scope/design limits, not newly discovered blocking defects:

- The three variants in each family share art. Names, descriptions and practice distinguish them, but silhouettes alone do not.
- Expanded ownership/new IDs cannot be read by the older four-item app. Downgrades require a compatible backup; this review does not establish backward-read compatibility.
- Power/capture invariants are mechanically covered; age-group fun and real-match balance still require playtesting.
- Existing device-local trust and simultaneous cross-tab transaction limitations are unchanged.

## Review Iteration Summary

| Iteration | Grade | Fixes Applied | Remaining | New |
|---|---|---|---|---|
| 1 (init) | A | — | 0 | — |
| confirm-1 | A | — | 0 | 0 |

Final grade: A
Iterations used: 1 / 2
Exit reason: converged
Status: APPROVED
human_review_needed: false
Counters: unreviewed 0 · prior-fix 0 · unattributed 0

No auto-fix changes or repair-round oscillation. Runtime HEAD remains 8444f9d; the frozen review snapshot is a temporary ref, not a task branch commit. Ready for user-initiated hm-wrapup and master delivery.
