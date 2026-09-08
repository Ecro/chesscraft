---
type: plan
task_slug: upgrade-catalog-twelve
status: complete
created: 2026-09-08
tags: [chess-craft, plan, progression, catalog]
interview_rounds: 0
adrs: 3
validator_outcome: APPROVED
summary: "Expand collectible upgrades to twelve with three movement alternatives per family"
---

## 🎯 Executive Summary
Add eight upgrades, retaining the four shipped IDs and rules. Three alternatives per pawn/knight/bishop/rook family. All remain earned with existing 3/5-Spark acquisition and one-square equipment. No extra capture reach, royal power or authored ceiling increase.

## 📚 Prior Work
PLAN-piece-upgrade-acquisition and PLAN-upgrade-discovery-fun define persistence, power and canonical practice. Memory: authoritative catalog counts, valid migration fixtures, canonical album labels, no practice writes.

## 🎙️ Interview Transcript
User explicitly requested twelve total after delegating recommendations without questions. Default: two additions per existing family, no rarity/payment/cost changes. Implementation authorized by current request; commit/push not added to this task.

## 📐 Architecture Decision Records
### ADR-001: Twelve bounded movement alternatives
Status: Accepted, delegated design.
Context: Four choices offer limited variety; adding capture reach changes threat balance.
Decision: Keep original four and append pawn-scout (diagonal forward empty step), pawn-retreat (backward empty step); knight-diagonal (diagonal empty step), knight-spring (orthogonal two-square empty jump); bishop-spring (orthogonal two-square empty jump), bishop-scout (forward knight-style empty jumps at ±1,+2); rook-spring (diagonal two-square empty jump), rook-scout (forward knight-style empty jumps at ±1,+2). Each retains its base movement and exact base attack/promotion, no effects. Forward mirrors for black.
Consequences: Tactical variety without capture inflation; existing max +1 star must hold.
Rejected: new damage/effect mechanics or rarity levels broaden engine/balance scope.
Source: User count request and prior power contract.

### ADR-002: Catalog-derived capacity and family selection
Status: Accepted, delegated design.
Context: Parser caps owned IDs at four; base detail picks only one upgrade.
Decision: Derive ownership cap from catalog length; keep profile version/shape and original IDs. Preserve already-paid offers exactly. Keep upgradeForBase compatibility and add plural lookup. Base family detail gets an explicit three-option selector, defaulting to original; direct upgrade detail shows the exact variant. Reset local acquisition/failure/practice state on variant switch.
Consequences: Old profiles and offers load intact, all twelve round-trip; older app builds cannot read expanded ownership, so downgrade requires compatible backup.
Rejected: silent migration/reset or modifying existing IDs loses progress.
Source: Code inspection.

### ADR-003: Reuse art, distinguish through honest names and mechanics
Status: Accepted, delegated design.
Context: Existing sided upgrade artwork identifies the base family.
Decision: Reuse family upgrade art for the eight alternatives with unique canonical names/descriptions and style text; free practice shows actual new destinations. Practice legend refers to each piece's capture description: the scout pawn can now MOVE onto empty diagonals where its base already could capture, so not every added empty destination forbids captures. Count/completion text must not hardcode four. Album remains data-driven.
Consequences: No new binary assets/dependencies; variants share silhouettes but named cards and actual movement distinguish them.
Rejected: raster generation not necessary to implement movement catalog expansion.
Source: Existing art architecture.

## 🏗️ Technical Design
Catalog -> canonical bundled definitions -> validated profile -> existing reveal/forge/equipment. Family selector handles one variant at a time, avoiding duplicate test IDs or multiple practice boards. No engine or cost algorithm change. Content merge already adds new bundled IDs; cover a valid old source missing the eight IDs. Unowned progression-only IDs stay excluded from normal setup.

## 📝 Implementation Plan
### Phase 1 — Twelve-item vertical slice
- Status: done
- depends_on: []
- parallel_group: serial-catalog
- merge_hazards: catalog, bundle, UI and tests share IDs/counts
- Scope: src/progression/catalog.ts, model.ts; src/content/sets/bundled.ts; src/i18n/ko.ts; src/ui/UpgradeFamily.tsx; tests/progression, tests/ui/upgrade*, tests/content as needed; census-only expected counts in tests/editor/movement-opens-shipped-content.test.ts and tests/ui/recipe-bundled-coverage.test.ts; e2e/upgrade-discovery.spec.ts and new catalog E2E; this PLAN.
- Exit: targeted Vitest, npm run verify:ci, browser discovery and new acquisition/equipment paths at mobile/desktop; all twelve power and capture invariants.
- Risk: medium (save capacity and family lookup).
- Rollback: restore prior runtime source at 8444f9d; do not downgrade expanded saves without backup.

## 🚧 Contract Boundaries
### Do not change
- `src/engine/` — existing movement and legality APIs.
- `src/balance/` — no cap weakening.
- `src/progression/record.ts` — storage transaction behavior.
- `src/progression/rewards.ts` — costs and reward/selection semantics.
- `wrangler.jsonc` — deployment unchanged.
- Advisory: Keep profile version and fields, old IDs, one-square equipment and capture/promotion semantics. No commits from execute.

## 🧪 Testing Strategy
Independent eight-row movement oracle (white c3; black c4), capture equality and jump/blocker tests; base move inclusion and max+1 stars for all twelve; catalog uniqueness/three per family; old four-owned profile with saved pending offer preserved; 12-owned round-trip including backup/equipment and unknown/duplicate rejection; eleven-owned reveal singleton and complete refusal; all new IDs forge/choose/equip/save without free ownership. UI twelve album count, original family default, select new variant then forge/practice (no write), save refusal and reset on switching; direct album variant exact; old source merge adds new IDs without discarding authored data. Browser forge a new variant, reload, equip exactly one square and start a standard eligible match; mobile collection scroll.

## ⚠️ Risks & Mitigation
| Risk | Mitigation |
|---|---|
| Fifth owned ID invalidates profile | catalog-derived bound and durable twelve-owned round-trip |
| Silent base-only lookup | plural selector plus exact direct variant |
| New jump captures or power inflation | real engine capture equality, independent target oracle, existing cap |
| Old offers reset | explicit old pending-offer identity fixture |
| Shared art indistinct | canonical unique names, descriptions and practice; documented silhouette reuse |
| Old build rejects new IDs | document forward-only save expansion; do not reset |

## ✅ Success Criteria
- [x] Exactly twelve unique upgrades, three per family.
- [x] All eight new mechanics legal, mirrored and bounded with unchanged capture reach.
- [x] Existing progress/offers preserved; twelve-owned saves and acquisition/equipment work.
- [x] All twelve inspectable/practicable and family selection truthful.
- [x] Full checks and browser regression pass.

## 🔍 Plan Validation
Independent plan-validator APPROVED with no critiques. Side preimplementation classifier: is_high=false, boundary=false; codex second opinion skipped. Current implementation request authorizes execute after this planning prerequisite.

## Execution Notes
- Serial implementation: catalog IDs, bundle rules and family selection share contracts; parallel writes were not safe.
- A.4: 27 failed, 0 passed before implementation. A.5 independent test-reviewer PASS.
- Feature expansion, not a production bug repair: C.0/D.5 repair-only gates skipped. The newly accepted 5–12 owned-item window is explicitly exercised by storage/backup tests and browser fifth acquisition; legacy four-owned and old pending-offer cases retain exact state.
- Test fixture correction: default compact room has no bishop. Bishop equipment probes now select the actual shipped frontier room; the same resolve/eligibility/storage assertions remain and independent test review found no issue.
- Existing census assertions intentionally updated: bundled pieces 17→25, all three sources 23→31; authorable pieces remain 19. Cadence fixture now funds five Sparks for each of twelve items; reward costs unchanged.
- Practice legend now points to the individual capture explanation: scout pawn's new empty-diagonal move overlaps its unchanged base capture destination. No new capture reach is implied.
- Pure test typing corrected: readonly tuple copied for Vitest arrayContaining; save spy explicitly accepts a profile. No assertion weakened.
- Targeted progression/upgrade/content tests: 123 passed. Census-related tests: 86 passed. Browser: 12 passed across desktop Chromium, mobile Chromium and mobile WebKit; screenshots inspected and fifth ownership persisted through reload/equipment.
- Final npm run verify:ci exit 0: TypeScript, production build, 2,044 tests in 193 files, and 21 build tests passed. Earlier census-only failures were corrected and the complete suite rerun green.
- Boundary audit: 16 task paths changed, all within the enumerated scope; no changes to engine, balance, storage transactions, reward semantics or deployment. Profile shape/version and original four definitions preserved. Work remains staged on hm/upgrade-catalog-twelve; no execute commit or master merge.

## Wrapup
- User subsequently authorized wrapup and push to master.
- REVIEW-upgrade-catalog-twelve: APPROVED, grade A, clean drift; all seven lenses completed initial and confirmation passes without findings.
- Final relevant verification marker remains fresh. PLAN fulfillment, regression, security and merge-safety gates passed. Structural baseline is absent (dashboard has no Structural score); no-baseline PASS. Context lint returned no warnings.
- No machine SPEC or Second Brain promotion is configured for this task. Source/test code was unchanged after review.
