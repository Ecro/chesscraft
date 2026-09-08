---
type: review
task_slug: upgrade-discovery-fun
status: APPROVED
grade: A
created: 2026-09-08
run_id: 3d170db256d5
human_review_needed: false
drift_verdict:
  task_slug: upgrade-discovery-fun
  verdict: clean
  scope_drift: []
  incomplete_phases: []
---

# Upgrade Discovery Review

## Scope and child-facing assessment

The existing earned currency, duplicate-free choice and guaranteed forge path support deliberate collection without real-money pressure. Winning is not necessary to earn rewards. Existing one-square equipment keeps upgrade ownership from replacing strategy. Weaknesses were name-only choices, unclear goals, buried family details and no safe way to experience a move before choosing.

Implemented: canonical illustrated candidate cards and personality copy; separate 3/5-Spark saving paths; four-item ownership album; saved-only acquisition feedback and equipment guidance; base-versus-upgrade free one-move practice using actual engine legality; useful completed-collection state without a dead purchase CTA. No payments, rarity inflation, streaks, expiry, extra rewards or new permanent power were added. Younger children can see and try moves; older players can compare positional possibilities. This is a design hypothesis, not measured enjoyment. See [[RESEARCH-upgrade-discovery-fun]] for sources and future child playtest.

## Method and drift

All 15 initial changed files matched PLAN scope. Public contracts and excluded engine/economy/storage/deployment files are unchanged. Seven lenses ran in capacity-limited waves: design, functionality, robustness, consistency, security, concurrency and tests. Cross-model Codex ran exactly once (high diff: 15 files / 724 added lines). Review base initially resolved to the previous feature's historical review base; before dispatch it was explicitly corrected to this task's actual parent eb48a3f, avoiding re-review of the already shipped feature.

## Findings and repair

| ID | Severity | Finding | Disposition / lifecycle |
|---|---|---|---|
| b04e8b1ab98add63 | P1 | Official album sheet used imported name/ability strings, contradicting canonical practice | accepted, resolved; design + functionality |
| dc5dcf1dbe73e8cd | P2 | Overlay test checked only nested practice and missed contradictory sheet copy | accepted, resolved as regression evidence for the same repair |
| 4827deebf0fe9749 | P2 | Cross-model independently identified the same canonical sheet boundary defect | accepted, resolved by overlapping repair; separate severity tier retained |

Consolidated repair: sheet state identifies official-album origin; that origin uses canonical translation for accessible label, heading, ability and artwork. Ordinary authored dex entries keep their document translator. The regression test asserts the complete dialog and rejects both imported strings. RED: 1 failed / 10 passed before code repair. GREEN focused repair: 39 tests. Re-review by functionality and tests found no regression. Applied · caused_by=none for both repair targets; no revert and no unreviewed fix.

## Verification

- verify:ci: TypeScript, production build, 2,005 tests / 191 files, 21 build tests passed.
- Discovery + accessibility Playwright: 39 passed, Chromium desktop/mobile and mobile WebKit.
- Discovery + match lifecycle: 22 passed; one existing WebKit match test timed out then passed retry; one intentional WebKit clipboard skip. Not represented as an entirely first-attempt-green run.
- PWA: 6 passed against the real production build.
- Visually inspected mobile album/practice and desktop candidate/practice screenshots. Keyboard, reduced motion, 360px layout, >=44px targets, stored-offer reload and unreadable-profile non-mutation verified.
- Existing warnings: dev-server symlink font allow-list, Vite native config import extension and >500kB bundle. Production build/PWA passed; no unrelated configuration changes made.

## 🧊 Cross-model findings (frozen @ round 1)

frozen_at_round: 1; models: [codex]; status: invoked; reason: null.

- id: 4827deebf0fe9749
  source: codex
  severity: P2
  file: src/ui/Rules.tsx (adapter supplied absolute task-worktree path)
  line: 156
  summary: Imported content overrides canonical album sheet name and description.
  evidence: Album supplies practiceContent entry but Sheet translates label/name/text with active t; family/practice use upgradeText.
  needs_relaxation: false
  disposition: accepted
  oracle_result: Gatherer produced no executable oracle for the absolute path. Mode-B verifier accepted from direct Rules/UpgradeFamily code evidence; independently strengthened regression subsequently reproduced the defect.
  status: resolved

## Review Iteration Summary

| Iteration | Grade | Fixes applied | Remaining active findings | New |
|---|---|---|---|---|
| 1 | B | — | 3 records, one underlying defect | — |
| 2 | A | Canonical sheet + covering regression | 0 | 0 |

Final active-set grade A was produced by review_consensus finalize; resolved lifecycle records remain in the persisted round payload, excluded from the active voting set. Confirmation freeze 23d93c685de703ee3e7405406daa3f2871b3fa00 against eb48a3ffcdae2edc313b9c996de2e39b80b761ed covered the entire feature. All seven lenses returned no new findings. Coverage CLI: missing=[], blocks_approval=false. No source edits followed the freeze.

Status: APPROVED. Exit reason: converged. human_review_needed: false. confirm_pass_ran: true; confirm_pass_new_severe_n: 0. unreviewed_fix_count: 0; regression_attributed_n: 0; attribution_unknown_n: 0. Oscillation CLI returned []. Churn pre-fix pin was missed, so a reliable measured repair churn value is unavailable (not fabricated).
