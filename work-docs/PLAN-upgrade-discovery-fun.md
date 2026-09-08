---
type: plan
task_slug: upgrade-discovery-fun
status: complete
created: 2026-09-08
tags: [chess-craft, plan, progression, discovery]
research_doc: "[[RESEARCH-upgrade-discovery-fun]]"
interview_rounds: 0
adrs: 3
validator_outcome: APPROVED
summary: "Illustrated upgrade choices, transparent goals, ownership album and free move discovery"
---

## 🎯 Executive Summary

Turn the existing earned-upgrade economy into a clearer discovery loop: see progress, compare illustrated abilities, choose deliberately, celebrate a saved acquisition, inspect the collection and practice a new move. Preserve 1/3/5 rewards and offline storage. Implement one cohesive phase because shared reward, sheet and card components force serial handling.

## 📚 Prior Work

[[RESEARCH-upgrade-discovery-fun]] contains the audit and evidence. [[PLAN-piece-upgrade-acquisition]] owns economy and equipment contracts. The prior approved review requires failure-honest persistence and explicit retry.

## 🎙️ Interview Transcript

Skipped on explicit user instruction: follow the assistant's recommendations autonomously through commit and push to master. No age, identity or personal-data collection is required.

## 📐 Architecture Decision Records

### ADR-001: Improve discovery without changing the economy
**Status:** Accepted (2026-09-08, user-delegated recommendation).
**Context:** Existing choices and guaranteed acquisition are sound but poorly explained.
**Decision:** Preserve all costs, grants, offer generation, ownership and backup schemas. Derive progress/remaining counts and completion from the profile and catalog. Show one remaining offer honestly and no spending CTA after completion.
**Consequences:** Existing saves need no migration. The four-item catalog remains finite.
**Rejected alternatives:** Daily rewards, duplicate levels and rarity tiers add pressure and balance work without evidence.
**Source:** User delegation and research.

### ADR-002: Separate inspection from acquisition and celebrate only saved ownership
**Status:** Accepted (2026-09-08, user-delegated recommendation).
**Context:** Plain names make an irreversible choice hard to understand.
**Decision:** Reusable canonical illustrated cards show descriptions. Pending choices offer free inline practice and an explicit named acquire button. The dex has a four-entry album opening the existing single sheet; both base and upgrade entries reach family information. Show a polite, short saved-acquisition message only after the persistence callback succeeds and the current profile includes that item. Failed writes retain candidates and show failure. Avoid nested modal sheets; practice stays inline.
**Consequences:** Child can compare before choosing. Album count derives from durable ownership, not observed collection tiers. Existing general dex stays available; no automatic scroll or enforced animation.
**Rejected alternatives:** Blind card flips and immediate acquisition on inspecting a card hide decision information.
**Source:** Research and existing persistence contract.

### ADR-003: Free canonical one-move practice uses real engine legality
**Status:** Accepted (2026-09-08, user-delegated recommendation).
**Context:** A move-only upgrade is difficult to understand from prose alone.
**Decision:** Use a fixed canonical 6x6 practice position with a white piece at c3 and kings at a1/f6. Compute empty-square destinations for both base and upgrade via createPosition/legalActions. Display the added destinations distinctly with text/shape cues. Let the child toggle the base/upgrade preview, tap a destination, see the piece arrive and receive distinct new-move/ordinary-move feedback; reset freely. One-move exercise is explicitly not a match and has no profile callback, rewards, ownership or collection writes. Use bundled definitions and canonical names even with imported content overlays. Controls work by keyboard, fit 360px and honor reduced motion.
**Consequences:** Rules cannot diverge from the engine. This is a guided experiment, not competitive mastery scoring.
**Rejected alternatives:** Hardcoded move offsets duplicate movement logic; full reward-bearing matches would allow farming and overwhelm a short preview.
**Source:** Research and engine reuse.

## 🏗️ Technical Design

Current: UpgradeReward contains name buttons; UpgradeFamily lives only under base-piece sheets. Add UpgradeCard, UpgradePractice and UpgradeCollection components plus a small pure practice module; extend progression affordances for catalog-derived counts and remaining costs. Integrate cards/progress/saved message into Reward, practice into Family, album and upgrade-to-base routing into Rules. All canonical examples use bundled content; existing room preview and equip validation continue unchanged. No dependencies or new raster assets: reuse shipped artwork.

Flow: validated profile → goal/album derivation → compare/practice (no write) → existing purchase/choose/forge → persistence callback → rendered saved profile → acquisition message and equipment guidance. Album opens the existing sheet; do not duplicate forge controls outside that sheet. User may leave an offer unchanged at any time.

## 📝 Implementation Plan

### Phase 1 — Discovery experience
- Status: complete
- depends_on: []
- parallel_group: serial-discovery
- merge_hazards: shared UpgradeReward, UpgradeFamily, Rules, localization and styles
- Scope in: src/progression/affordances.ts, new practice module; src/ui/Upgrade*.tsx, Rules.tsx, i18n/ko.ts, styles.css; focused progression/UI tests and e2e/upgrade-discovery.spec.ts; task documents.
- Scope out: economy, profile schema, persistence, match lifecycle, equipment resolution, deployment configuration.
- Exit: focused Vitest discovery tests and existing upgrade suites; npm run verify:ci; npx playwright test e2e/upgrade-discovery.spec.ts e2e/match-lifecycle.spec.ts; npm run e2e:pwa. Visually inspect mobile and desktop screenshots.
- Risk: medium (interaction reachability and misleading state).
- Rollback: prior master eb48a3f, revert the feature commit as a unit; profile remains compatible.

## 🚧 Contract Boundaries

### Do not change
- `src/progression/model.ts` — saved profile contract.
- `src/progression/record.ts` — persistence contract.
- `src/progression/rewards.ts` — currency and acquisition semantics.
- `src/collection/` — no practice history in existing tiers.
- `src/engine/` — use engine APIs without altering rules.
- `wrangler.jsonc` — assets-only deployment.
- Advisory: No payments, ads, rarity odds, streaks, expiry, accounts, network play, new permanent bonuses or automatic spending.

## 🧪 Testing Strategy

TDD: engine practice targets pinned to independent known moves for all four families, empty targets only, unknown ids refused; UI 0/2/3/5 Sparks and all-owned states; pending one/multiple cards display artwork and abilities, practice does not acquire, durable choice success vs refused write, rehydrated offers and independent ordinary/new move feedback; album opens an unowned and an owned upgrade in the single detail sheet; read-only corrupt-profile viewing does not claim success. Browser: real App profile persistence, inspect/practice/choose/album/reload, keyboard escape, narrow layout and reduced motion. Keep existing backup/equipment/claim tests.

## ⚠️ Risks & Mitigation

| Risk | Mitigation |
|---|---|
| Practice teaches imported modified rules as official | Canonical bundled definitions and names; explicit practice context |
| Duplicate DOM IDs/modal traps | Reuse one sheet and keep practice inline; scope test queries to regions |
| Save failure falsely celebrates | Callback success plus current owned-profile confirmation |
| Whole collection leaves dead end | Completion message, free practice and equip guidance, no spend CTA |
| Mobile content overwhelms navigation | Compact summary/cards, scrollable flow, measured screenshots |
| Claimed age-specific enjoyment is untested | Label inference; document human playtest follow-up |

## ✅ Success Criteria

- [x] Clear 3/5 paths show remaining Sparks and no auto-spending.
- [x] Choices show illustrations and abilities before explicit acquisition; singleton offer is truthful.
- [x] Free base-vs-upgrade practice uses real legality and cannot affect progression.
- [x] Saved acquisition feedback, failures and rehydration remain honest.
- [x] Four-entry ownership album and complete-collection state remain useful; upgrade entries open family detail.
- [x] Browser/mobile/keyboard/reduced-motion and full CI pass; independent review complete.

## Completion Evidence

TDD: 15 new cases failed before implementation and passed afterward; independent test review passed after adding current-profile and imported-overlay cases. Review regression extension failed before the canonical-sheet repair. Final verify:ci passed 2,005 tests in 191 files, 21 build tests, TypeScript and production build. Discovery plus accessibility Playwright: 39 passed across three browser/device projects. Discovery plus match lifecycle: 22 passed, one passed on retry (existing WebKit match timeout), one intentional clipboard skip. PWA: 6 passed. Mobile 360x640 and desktop screenshots inspected; practice targets measured at least 44px; keyboard navigation and reduced-motion exercised. Independent seven-lens confirmation approved, no remaining findings. Review evidence: [[REVIEW-upgrade-discovery-fun]].

No profile, economy, engine, collection or deployment-format changes. Actual child enjoyment remains an unmeasured hypothesis; the consent-appropriate playtest in RESEARCH is a future evaluation, not an implementation blocker.

## 🔍 Plan Validation

Independent plan-validator APPROVED with no critiques. Side pre-implementation classifier returned is_high=false, boundary=false; cross-model opinion skipped by that gate. User delegation supersedes interactive stage confirmation.
