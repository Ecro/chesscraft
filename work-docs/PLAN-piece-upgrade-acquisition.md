---
type: plan
task_slug: piece-upgrade-acquisition
status: complete
created: 2026-09-01
tags: [chess-craft, plan, typescript, progression, collection, game-balance]
research_doc: "[[RESEARCH-piece-upgrade-acquisition]]"
interview_rounds: 2
adrs: 8
validator_outcome: MAJOR_REVISION_RESOLVED
summary: "Cap authored power and add earned, device-owned base-piece upgrades with guaranteed forging"
---

# PLAN — bounded authored power and earned base-piece upgrades

## 🎯 Executive Summary

**TL;DR.** Chess Craft will classify completed matches as standard or sandbox from the content actually used. Human-authored pieces above the canonical base-piece ceiling remain playable in sandbox but earn no progression. Standard matches award one non-paid Spark; three Sparks buy a three-choice reveal and five Sparks forge any visible upgrade directly. The first roster is Pawn+, Knight+, Bishop+, and Rook+, each adding a movement-only option while retaining the base capture pattern. Ownership and equipment belong to the device, and both hot-seat players use the same shelf.

The existing room loadout couples a piece replacement to a required skill card and replaces every same-id starting piece. That contract becomes schema v17: each side independently carries an optional `piece` slot and optional `skillCardId`; new piece slots name one starting square, while migrated v16 slots omit the square and keep their legacy replace-all behaviour. A device-owned upgrade selection overrides the room's piece slot for that side at match creation, so one side never stacks a custom piece and an official upgrade. The effective equipment becomes part of the match's deterministic input.

**Key decisions:**

- Standard-vs-sandbox is derived at match start rather than stored on the room (ADR-001).
- One square-scoped effective piece substitution exists per side; skills are independent (ADR-002).
- Progression is one device-owned shelf shared by both hot-seat players (ADR-003).
- Curated upgrades are immutable bundle catalog entries, not authored metadata (ADR-004).
- Acquisition is earned choice plus guaranteed forge, with no paid or duplicate pulls (ADR-005).
- Device equipment overrides, rather than mutates, the room's piece slot (ADR-006).
- Author power uses a canonical 6×6 ceiling plus room-time validation (ADR-007).
- Progress writes are atomic, recoverable, and announced only after persistence succeeds (ADR-008).

**Estimated impact:** about 8 new progression/content modules, 4 curated piece records and art variants, a v17 preset migration, changes to match creation and room/lobby/dex/result UI, and roughly 15–20 focused test files. No backend, account, payment SDK, network API, or new runtime dependency is introduced.

## 📚 Prior Work

- [[RESEARCH-piece-upgrade-acquisition]] recommends earned choice-reveals plus direct forging and rejects paid randomized power for this child-oriented, assets-only PWA. It also identifies the all-copy replacement and required-skill coupling as blockers.
- [[RESEARCH-custom-piece-skill-balance]] and [[PLAN-custom-piece-skill-balance]] established declaration-derived costs, five stars, room budgets, structural `royal`/`win` bans, and per-side loadouts. This plan reuses those mechanisms and replaces only the loadout's coupled shape.
- [[REVIEW-custom-piece-skill-balance-2026-08-08]] found overlap, context, and absent-state defects. New equipment and reward APIs therefore make absence, overlap, and persistence failure explicit test cases.
- [[PLAN-nonfunctional-polish-benchmark]] made collection state device-owned, monotonic, separate from content JSON, and committed once at match end. Progression follows the storage boundary but uses its own schema because ownership/currency are not `seen/used/won` tiers.
- [[RESEARCH-piece-skill-creation-ux]] requires live engine-driven feedback and warns that form-only limits are bypassed by imported JSON. Eligibility is therefore a pure domain check used by both UI and match start.
- `[wiki:architecture] turning-slide` requires movement cost and AI complexity to share the same endpoint semantics. Upgrade catalog tests use the existing `pieceCost` and complexity consumers rather than a parallel estimator.
- `[wiki:architecture] settlement-grants-and-board-size` confirms board size is content and unbounded movement grows with it. The stable authoring label is canonical 6×6, while the selected room is validated again.
- `[fail:design] bug-masks-content-built-on-it` requires side-relative probe pairs when a new piece uses asymmetric movement. Pawn+ receives white/black behavioural fixtures rather than a symmetric-looking constant alone.

## 🎙️ Interview Transcript

| # | Topic | Category | Question | Options | Choice | Note | → ADR |
|---|---|---|---|---|---|---|---|
| 1 | Over-cap creations | Scope | What happens to a human-authored piece above the standard ceiling? | standard + sandbox / reject everywhere / equip-only refusal / other | Standard + sandbox | User selected `1A`; sandbox matches are playable but progression-ineligible. | ADR-001, ADR-007 |
| 2 | Equipment contract | Contract | How do owned upgrades combine with the existing loadout? | one unified piece slot / extra upgrade slot / replace every copy / other | One unified piece slot | User selected `2A`; one starting square, custom-or-upgrade, skill independent. | ADR-002, ADR-006 |
| 3 | Hot-seat ownership | Architecture | Who owns upgrades on a shared device? | device shelf / local profiles / disabled in hot-seat / other | Device shelf | User selected `3A`; both local players choose from the same owned set. | ADR-003 |
| 4 | Remaining defaults | Architecture / Risk | Continue interviewing or finish autonomously with research defaults? | continue / autopilot defaults | Autopilot defaults | User requested autopilot through completion. Canonical cap, reward constants, device override, and recovery rules use the documented recommended defaults and remain tunable where noted. | ADR-004…ADR-008 |

## 📐 Architecture Decision Records

### ADR-001: Standard eligibility is derived; over-cap rooms fall back to sandbox
**Status:** Accepted (2026-08-31, via /hm:plan interview)
**Context:** A hard loader rejection would make old or deliberately wild rooms unloadable, while a UI-only warning would be bypassed by import. The user chose standard limits with a sandbox escape.
**Decision:** Compute a `StandardEligibility` result from the active preset, board, effective starting placements, bundle provenance, and equipment before a match starts. Ineligible rooms remain playable but grant no Sparks and show the concrete reasons before play and on result.
**Consequences:**
- ✅ Creative rooms and existing documents keep working.
- ✅ One pure check drives lobby copy, reward authority, and tests.
- ⚠️ “Standard” is contextual rather than a permanent property printed into a room file.
**Rejected alternatives:**
- Reject over-cap pieces in `loadContentSet` — rejected because one sandbox record would invalidate the entire document.
- Store `preset.mode` — rejected because a declared label can drift from the content it claims to classify.
**Source:** Interview #1

### ADR-002: One effective piece slot per side, square-scoped; skill selection is independent
**Status:** Accepted (2026-08-31, via /hm:plan interview)
**Context:** v16 requires `{ pieceId, replaces, skillCardId }` together and substitutes every matching starting piece. The user wants one owned upgrade to replace one base piece without requiring a card or stacking with another custom piece.
**Decision:** Schema v17 represents each side as `{ piece?: { pieceId, replaces, square? }, skillCardId?: string }`. New UI always writes `square`; the absent-square form exists only for migrated v16 documents and preserves replace-all playback. Validation refuses empty side objects and new non-legacy piece slots without an exact matching non-royal starting square.
**Consequences:**
- ✅ Custom pieces and official upgrades occupy the same power axis.
- ✅ A Pawn+ item upgrades one pawn, not the pawn line.
- ⚠️ v16 replace-all rooms keep their behaviour but are sandbox-only until resaved as square-scoped.
**Rejected alternatives:**
- Add an upgrade slot beside the custom slot — rejected because it creates three stackable power axes.
- Change legacy slots to the first matching square — rejected because migration would silently change existing matches.
**Source:** Interview #2

### ADR-003: Progression belongs to the device and is shared in hot-seat
**Status:** Accepted (2026-08-31, via /hm:plan interview)
**Context:** The app has names but no identity or account boundary; the existing dex collection is device-owned. Per-name ownership would require profile lifecycle and recovery decisions unrelated to the requested loop.
**Decision:** Store one `chess-craft.progression.v1` profile per browser. Both hot-seat sides may select from the same owned upgrades. In AI play only the human side receives a device override; the AI keeps the room-authored piece slot.
**Consequences:**
- ✅ Matches current storage and shared-device product shape.
- ✅ No account, authentication, or child-data subsystem.
- ⚠️ A visiting player can use the host device's upgrades, and ownership does not follow a name.
**Rejected alternatives:**
- Local named profiles — rejected as a new identity lifecycle.
- Disable upgrades in hot-seat — rejected because it prevents the primary shared-device mode from using earned content.
**Source:** Interview #3

### ADR-004: Curated upgrades are bundle-owned catalog entries, never authored claims
**Status:** Accepted (2026-08-31, via /hm:plan interview)
**Context:** An importable `official` or `upgradeOf` field is forgeable. Yet the engine needs ordinary `PieceDef` records so upgraded movement remains data-defined.
**Decision:** Add the four upgraded pieces to bundled content as normal `PieceDef`s and define a typed `UPGRADE_CATALOG` in `src/progression/catalog.ts` mapping each immutable bundled upgrade id to a base piece id. Curated ids are progression-only records: piece/room authoring selectors exclude them, imported presets that place them directly are sandbox with `curated-upgrade-requires-owned-equipment`, and only a validated owned `EffectiveEquipment` override can introduce one into a standard match. Eligibility resolves curated status against the running bundle and pristine definition; authored forks are ordinary authored pieces even if their id or prose resembles an upgrade.
**Consequences:**
- ✅ No engine source names piece ids and no document can grant itself an official exception.
- ✅ Upgrade pieces reuse movement, cost, rendering, AI, and import-safe bundle merge paths.
- ✅ Bundle visibility cannot bypass acquisition through room authoring or imported starting placements.
- ⚠️ Adding an upgrade requires coordinated catalog, bundle, strings, art, and invariant tests.
**Rejected alternatives:**
- `pieceDef.upgradeOf` — rejected because imported content could claim the exception.
- A separate engine piece type — rejected because it duplicates movement rules and violates data-defined content.
**Source:** Interview #4 (autopilot default)

### ADR-005: Free Sparks fund either a discounted choice-reveal or guaranteed direct forge
**Status:** Accepted (2026-08-31, via /hm:plan interview)
**Context:** Research found that paid randomized gameplay power conflicts with the product and policy surface, while pure direct progress loses the requested reveal moment.
**Decision:** Every completed standard match with at least one human side grants exactly one non-expiring Spark, independent of result. Grants never buy or create an offer automatically. `purchaseReveal` is an explicit atomic action: with no existing pending offer, at least one unowned upgrade, and at least `REVEAL_COST = 3`, it deducts three Sparks and persists up to three distinct unowned choices before the UI announces them. `chooseOffer` owns exactly one listed choice at no further cost and clears the whole offer. Navigation does neither and the offer persists; there is no cancel/refund action. `forgeUpgrade` atomically deducts `FORGE_COST = 5` and owns any visible unowned upgrade; if that id is in a pending offer, it is removed and the remaining paid choices persist, otherwise the offer is unchanged. Owned/all-owned/insufficient/pending-offer reveal requests are explicit no-charge failures. All constants live in one module and are provisional until a later non-blocking human playtest.
**Consequences:**
- ✅ A desired upgrade is at most five eligible matches away.
- ✅ Randomness changes the discount options, never whether progress occurred.
- ⚠️ The 3/5 cadence is an initial product constant, not evidence-backed balance, and may change after playtesting.
**Rejected alternatives:**
- Paid gacha — rejected for trust, policy, backend, and pay-to-win scope.
- Duplicate shards/levels — rejected because a four-item launch pool would turn duplicates into the dominant result.
**Source:** Interview #4 (autopilot default)

### ADR-006: Device equipment overrides the room piece default without mutating content
**Status:** Accepted (2026-08-31, via /hm:plan interview)
**Context:** Ownership belongs to a device, but room loadouts are exported content. Writing owned upgrades into the preset would export an entitlement the receiving device may not have.
**Decision:** The progression profile stores optional equipment by `{ presetId, side }` as `{ upgradeId, square }`. At match creation a pure resolver produces one `EffectivePieceSlot` per side: an owned valid device upgrade overrides the preset's piece slot; otherwise the preset slot remains. `createMatch` accepts the resolved equipment and its deterministic identity becomes `(document, presetId, seed, effectiveEquipment)`.
**Consequences:**
- ✅ Exported rooms contain rules, not local ownership.
- ✅ The one-piece-slot invariant holds while device choice persists between matches.
- ⚠️ Replays and tests must include equipment in their input; `(document,preset,seed)` alone is no longer sufficient when an override exists.
**Rejected alternatives:**
- Persist upgrade ids in `preset.loadout` — rejected because content export would leak device state.
- Apply both room and device piece slots — rejected by Interview #2.
**Source:** Interview #2 and #4

### ADR-007: The authoring ceiling is canonical 6×6 base power, followed by room-time validation
**Status:** Accepted (2026-08-31, via /hm:plan interview)
**Context:** `pieceCost` depends on board size, so a global dex/maker label needs a stable board while actual legality must account for the selected room.
**Decision:** `src/progression/power.ts` derives the standard authored ceiling from the most expensive non-royal base family on `{ width: 6, height: 6 }` using the existing `pieceCost`. The maker shows canonical cost and live over-cap status. Match eligibility recomputes every effective starting piece against the active board and existing room ceiling. A curated upgrade must be at most one canonical star above its base and remain under the active room ceiling and budget, and a pristine curated id placed directly by content is always sandbox regardless of ownership; standard admission is possible only through a validated owned equipment override.
**Consequences:**
- ✅ No new hand-authored power formula or trusted cost field.
- ✅ One stable authoring label plus honest room-specific legality.
- ⚠️ A piece can be canonically acceptable and still make a large-board room sandbox; the lobby must explain that distinction.
**Rejected alternatives:**
- Room-only grading in the maker — rejected because a standalone piece has no room.
- Fixed numeric cap literal — rejected because it drifts when bundled base pieces change.
**Source:** Interview #1 and #4

### ADR-008: Progress writes are atomic, fail visibly, and have a separate backup format
**Status:** Accepted (2026-08-31, via /hm:plan interview)
**Context:** A local reward announced before persistence can disappear, and content import/export deliberately excludes device play history. Money is out of scope, but earned ownership still needs a recoverable path.
**Decision:** Progression uses a validated versioned payload, injected `Storage`, single-call writes, and explicit `{ ok, reason }` results. A match claim carries an injected run id and a bounded recent-claim ring so terminal re-renders are idempotent. Pending offers are stored before presentation. The dex exposes separate full-profile backup/restore that never touches content or collection keys. Restore is an explicit local-trust replacement, not a merge: after confirmation and whole-payload validation it atomically replaces Sparks, owned ids, pending offer, equipment, nonce, and bounded claim ring with the normalized backup values. Unknown catalog ids, duplicate/owned offer ids, unsafe counters, invalid nonce relations, and equipment for an unowned id reject the entire restore; references to a missing preset/square remain stored but the resolver ignores them with a visible reason. Restoring an older backup intentionally rolls progress and spent Sparks back to that snapshot; this is acceptable only because the economy is offline, free, and non-competitive, and the UI states the consequence before confirmation.
**Consequences:**
- ✅ UI only announces a Spark or owned upgrade after storage confirms it landed.
- ✅ A backup has deterministic snapshot semantics instead of inventing unsafe per-field merges.
- ⚠️ Restore is a manual, local-trust rollback path; replay prevention would require the explicitly out-of-scope account/backend authority.
**Rejected alternatives:**
- Add progression to `ContentSource` — rejected because authoring saves and room sharing have different lifecycle/privacy semantics.
- Silent fail-to-empty — rejected because it would erase visible earned ownership behind a normal-looking screen.
**Source:** Interview #4 (autopilot default)

## 🏗️ Technical Design

### Current State

| Concern | Current contract | Gap |
|---|---|---|
| Piece power | `pieceCost`, 1–5 stars, room-derived ceiling | no standard/sandbox eligibility for authored starting pieces |
| Room loadout | required piece + replacement id + skill per side | cannot equip a piece alone; replaces all same-id placements |
| Provenance | derived from pristine running bundle | no immutable upgrade-family registry |
| Collection | device-local `seen/used/won` sets | no currency, ownership, pending offer, or equipment |
| Match completion | one guarded collection write in `MatchHost` | no reward grant result or persistent idempotence key |
| Dex | piece tiles and detail sheet | no upgrade family, ownership, preview, forge, or backup controls |
| Deployment | assets-only Worker, no account/backend | purchased entitlements and cloud restoration unavailable by design |

### Affected Components

| Area | Files / modules | Change |
|---|---|---|
| Upgrade content | `src/content/sets/bundled.ts`, `src/i18n/ko.ts`, `src/ui/art/` | four PieceDefs, text, distinct art, catalog references |
| Power/eligibility | new `src/progression/catalog.ts`, `power.ts`, `eligibility.ts` | canonical cap, curated invariants, standard reasons |
| Profile/rewards | new `src/progression/model.ts`, `record.ts`, `rewards.ts`, `io.ts` | storage schema, deterministic offers, claims, merge-safe backup |
| Loadout schema | `src/content/schema.ts`, `load.ts`, `src/editor/io.ts` | v17 independent slots and v16 normalization |
| Engine setup | `src/engine/loadout.ts`, `match.ts` | exact-square replacement and device override input |
| App/UI | `App.tsx`, `Lobby.tsx`, `Rules.tsx`, `Result.tsx`, `RoomDetail.tsx`, new focused UI components | own profile state, eligibility notice, equip/forge/reveal surfaces |
| Verification | `tests/progression/`, focused content/engine/UI tests, `e2e/collection.spec.ts`, `e2e/match-lifecycle.spec.ts` | domain invariants and complete user loop |

### Dependencies

No new runtime or development dependency. Use Zod already present for profile/import validation, existing seeded RNG helpers for offers, existing `pieceCost`/stars, current `Storage` injection pattern, and current art pipeline.

### Architecture

```text
bundled PieceDefs ──> UPGRADE_CATALOG ──> catalog invariants
       │                     │
       └── ContentSet ───────┼──> standardEligibility(active room, effective equipment)
                             │                    │
local progression profile ──┴──> resolveEquipment│
  owned / sparks / pending / equipped             │
       │                                           ▼
       ├── Dex forge & backup              createMatch(effectiveEquipment)
       ├── Lobby equip                              │
       └── Result claim <── completed standard match
```

Progression modules may import content/balance/engine types, but engine modules never import progression or storage. `App` resolves device state into plain `EffectiveEquipment` and passes it inward.

### Design Decisions

- Standard eligibility is a discriminated result: `{ eligible: true } | { eligible: false; reasons: EligibilityReason[] }` (ADR-001).
- v17 new piece slots use exact square; absent square is a migration-only legacy state (ADR-002).
- Profile ownership is `Set`-semantics serialized in stable acquisition order; equipment is keyed by preset then side (ADR-003, ADR-006).
- `UPGRADE_CATALOG` is code-owned content metadata, while movement stays in normal PieceDefs (ADR-004).
- Rewards expose explicit grant, reveal-purchase, choose, and forge transitions; rendering never rolls or spends implicitly (ADR-005, ADR-008).
- Cap calculation calls existing cost functions; it does not trust a document field (ADR-007).

### Data Flow

1. App loads content, collection, and progression independently.
2. Lobby resolves selected room plus device equipment and calls `standardEligibility`.
3. Lobby shows standard/sandbox and reasons; start is always allowed.
4. App passes resolved effective equipment and eligibility snapshot to `MatchHost`.
5. `createMatch` applies at most one exact-square override per side; AI uses the room default.
6. When a terminal state first appears, `MatchHost` keeps the existing collection fold, then submits one progression claim if eligibility was standard.
7. `grantCompletedMatch` refuses duplicate run ids, adds one Spark only, and returns a UI event only after save success. Reaching three Sparks never spends or opens an offer automatically, preserving the five-Spark save path.
8. Result or dex may call `purchaseReveal`; the store validates funds/state, deducts three, deterministically generates and persists the offer in the same write, then announces it. Navigation leaves Sparks and pending state unchanged.
9. `chooseOffer` owns one offered id and clears the offer. `forgeUpgrade` deducts five and owns the requested id; if it was offered, only that id is removed and the remaining paid choices persist. Every rejected transition is a no-write/no-charge result.
10. Lobby equipment selectors immediately reflect the new owned set. Backup restore atomically replaces the entire validated profile snapshot after explicit confirmation; it never field-merges spendable state.

### API Changes

```ts
// schema v17
type PieceLoadoutSlot = { pieceId: string; replaces: string; square?: SquareId }
type SideLoadout = { piece?: PieceLoadoutSlot; skillCardId?: string }
type PresetDef = { /* existing */ loadout?: { white?: SideLoadout; black?: SideLoadout } }

type UpgradeDef = { id: string; basePieceId: string }
type UpgradeEquip = { upgradeId: string; square: SquareId }
type EffectiveEquipment = Partial<Record<Side, UpgradeEquip>>

type StandardEligibility =
  | { eligible: true }
  | { eligible: false; reasons: EligibilityReason[] }

interface ProgressionProfileV1 {
  version: 1
  sparks: number
  ownedUpgradeIds: string[]
  pendingOffer?: { nonce: number; upgradeIds: string[] }
  equipped: Record<string, Partial<Record<Side, UpgradeEquip>>>
  nextOfferNonce: number
  recentClaimIds: string[]
}

function createMatch(args: ExistingArgs & { effectiveEquipment?: EffectiveEquipment }): Match
function grantCompletedMatch(profile: ProgressionProfileV1, claimId: string): GrantResult
function purchaseReveal(profile: ProgressionProfileV1): UpdateResult
function chooseOffer(profile: ProgressionProfileV1, upgradeId: string): UpdateResult
function forgeUpgrade(profile: ProgressionProfileV1, upgradeId: string): UpdateResult
function restoreProgression(profileBackup: unknown): RestoreResult
```

## 📝 Implementation Plan

### Phase 1 — Upgrade catalog, content, and canonical power invariants

- **Status:** done (2026-09-01)

- **depends_on:** `[]`
- **parallel_group:** `serial-content-foundation`
- **merge_hazards:** `src/content/sets/bundled.ts`, `src/i18n/ko.ts`, and art registry/generated assets must agree on every new id
- **Scope:** Add `src/progression/catalog.ts` and `power.ts`; define four base-family mappings; add Pawn+/Knight+/Bishop+/Rook+ PieceDefs, distinct Korean text/art, move-only capture separation, canonical cap and `base + 1 star` catalog validation. Export a catalog predicate designed for authoring filters, but do not add ownership or UI yet.
- **Files in:** `src/progression/catalog.ts`, `src/progression/power.ts`, `src/content/sets/bundled.ts`, `src/i18n/ko.ts`, `src/ui/art/`, `tests/progression/catalog.test.ts`, focused content/art tests.
- **Files out:** match lifecycle, storage, room schema, dex/result UI.
- **Exit criterion:** `npx --no-install vitest run tests/progression/catalog.test.ts tests/content/piece-definitions.test.ts tests/ui/art-assets.test.ts` and `npm run typecheck`; every catalog id exists as a pristine bundled non-royal piece, names one base, is detectable as progression-only, has distinct art, costs no more than one canonical star above it, and its added movement cannot capture.
- **Risk:** medium
- **Rollback point:** repository state before Phase 1.

**Execution notes:** Added four catalog-bound move-only upgrades and eight generated 192×192 transparent WebP side assets. Phase exit suite passed `18/18`; the full Vitest suite passed `1889/1889`. Phase D repaired census tests whose old contract equated every bundled piece with an authorable/directly placeable piece. Newly reachable window: a progression-only bundled piece exists but must remain outside authoring and preset direct-placement surfaces. Covered in the same change by `tests/editor/movement-opens-shipped-content.test.ts`, `tests/ui/recipe-bundled-coverage.test.ts`, and `tests/content/bundled-liveness-audit.test.ts`.

### Phase 2 — v17 loadout migration, exact-square substitution, and eligibility

- **Status:** done (2026-09-02)
- **depends_on:** `[1]`
- **parallel_group:** `serial-contract-migration`
- **merge_hazards:** `src/content/schema.ts`, `src/content/load.ts`, `src/editor/io.ts`, and `src/engine/loadout.ts` jointly define v16 migration and playback
- **Scope:** Bump schema to v17; normalize v16 loadouts into independent piece/skill fields without changing legacy playback; require new UI-created piece slots to carry a matching square; update structural/budget checks; add plain effective-equipment input to match setup; implement pure standard eligibility and reasons. Direct/imported curated-upgrade placements are sandbox, and the eligibility API admits them only when the resolver marks a pristine catalog id as a validated equipment override. Keep progression storage absent.
- **Files in:** `src/content/schema.ts`, `src/content/load.ts`, `src/editor/io.ts`, `src/balance/legal.ts`, `src/engine/loadout.ts`, `src/engine/match.ts`, `src/progression/eligibility.ts`, loadout/eligibility tests.
- **Files out:** profile persistence, reward cadence, user-facing equip/forge screens.
- **Exit criterion:** `npx --no-install vitest run tests/content/loadout-v17.test.ts tests/content/loadout-roundtrip.test.ts tests/progression/eligibility.test.ts tests/engine/equipment.test.ts`; v16 fixtures replay identically, v17 exact-square fixtures change one square only, a second piece axis is unrepresentable, direct/imported curated ids report `curated-upgrade-requires-owned-equipment`, a validated override is admitted, and every ineligible fixture reports a stable reason.
- **Risk:** high
- **Rollback point:** Phase 1 content remains; revert the v17 contract as a unit.

**Execution notes:** A fresh Phase A.5 run passed after adding the paired canonical-6×6-eligible/8×8-sandbox assertion, complete-board exact-square comparisons, royal-square refusal, direct-preset curated injection, and modified-catalog-id provenance coverage. Schema v17 now separates piece and skill axes, persists a `legacyLoadoutV16` migration marker so re-exported v16 replace-all rooms remain playable, and accepts explicit validated equipment as a deterministic match input. Phase exit passed `24/24`; typecheck passed; full Vitest passed `1914/1914`. Phase D repaired old fixtures that declared v8 loadouts as current v17 records, literal schema-version pins, and one shallow nested fixture copy. Newly reachable window: nested v17 loadouts and genuine v8 migration documents now enter their distinct paths without cross-test mutation. Covered by `tests/content/loadout-v17.test.ts`, `tests/content/loadout-v8.test.ts`, `tests/content/duel-legal.test.ts`, and `tests/ui/loadout-ui.test.tsx` in the same change.

### Phase 3 — Progression profile, reward state machine, and backup format

- **Status:** done (2026-09-02)
- **depends_on:** `[1]`
- **parallel_group:** `parallel-domain-after-catalog`
- **merge_hazards:** none
- **Scope:** Add validated profile model/store, atomic save results, recent-claim ring, deterministic persisted offers, explicit three-Spark `purchaseReveal`, one-choice resolution, five-Spark direct forge with pending-offer repair, ownership/equipment operations, and full-snapshot backup/restore. Keep it framework-free and UI-free.
- **Files in:** `src/progression/model.ts`, `record.ts`, `rewards.ts`, `io.ts`, `tests/progression/record.test.ts`, `rewards.test.ts`, `io.test.ts`.
- **Files out:** `ContentSource`, collection tiers, engine state, React components.
- **Exit criterion:** `npx --no-install vitest run tests/progression/record.test.ts tests/progression/rewards.test.ts tests/progression/io.test.ts`; corrupt/denied storage is explicit, duplicate claims are no-ops, a grant never auto-spends, reveal deducts exactly three only on persisted success, navigation is inert, choose clears the offer, forge deducts exactly five and repairs an overlapping offer, every failure is no-charge, offers rehydrate byte-identically without duplicates, and restore either replaces every validated field atomically or rejects without mutation. Tests include replaying an older post-spend backup and assert the documented full rollback rather than a field merge.
- **Risk:** medium
- **Rollback point:** Phase 1; this phase can be removed without touching content or matches.

**Execution notes:** Added strict versioned profile validation, explicit load/save/read-back failures, immutable grants and equipment, deterministic three-Spark offers, five-Spark direct forge with pending-offer repair, and confirmed whole-snapshot backup restore. The default two-round Phase A.5 budget found one final aliasing gap in the unowned-equipment rejection; on 2026-09-02 the user explicitly authorized pass 3, which passed after the test independently checked the returned rejection profile and original input against a pre-call snapshot. Phase exit passed `38/38`; typecheck passed; full Vitest passed `1952/1952`. Pure new feature: no repair-only newly-reachable window applies.

### Phase 4 — Room editor and lobby equipment resolve one effective piece slot

- **Status:** done (2026-09-02)
- **depends_on:** `[2, 3]`
- **parallel_group:** `serial-ui-equipment`
- **merge_hazards:** `src/ui/App.tsx` owns progression state while `RoomDetail.tsx` owns room defaults; both feed match creation
- **Scope:** Refactor `LoadoutSection` to independent piece/skill controls with exact starting-square selection and exclude all catalog upgrade ids from every piece/room authoring picker. Add a focused lobby equipment control showing room default vs owned upgrades per human side, canonical/room stars, budget, and standard/sandbox reasons. App loads/saves progression, validates ownership before resolution, and passes the eligibility/equipment snapshot into `MatchHost`. AI side keeps room default; imported direct placements remain visible but sandbox rather than being silently rewritten.
- **Files in:** `src/ui/App.tsx`, `Lobby.tsx`, `RoomDetail.tsx`, `useGrades.ts`, new `UpgradeEquipment.tsx`, i18n/styles, UI and engine wiring tests.
- **Files out:** reward result presentation, dex forge/backup controls.
- **Exit criterion:** `npx --no-install vitest run tests/ui/loadout-ui.test.tsx tests/ui/upgrade-equipment.test.tsx tests/ui/rejection-wiring.test.tsx tests/engine/equipment.test.ts`; catalog ids never appear in authoring pickers, an imported direct placement is visibly sandbox, a side can select custom-or-owned-upgrade but never both, skill is optional/independent, unowned ids are refused, Pawn+ changes one selected square, and AI receives no device override.
- **Risk:** high
- **Rollback point:** Phase 3 domain modules remain unused; revert UI and match wiring to Phase 2.

**Execution notes:** The default two-round Phase A.5 budget left one App-level persistence-to-MatchHost gap; the user explicitly authorized a Phase 4 third pass, which passed after adding the complete owned-upgrade path from local profile storage through Lobby into the rendered board. Added a fail-closed equipment resolver, independent piece/skill authoring with exact-square selection, progression-only authoring filters, owned-only human-side equipment controls, standard/sandbox disclosure, App-owned persistence, and frozen MatchHost setup input. Phase exit passed `34/34`; typecheck passed; full Vitest passed `1963/1963` across 185 files. Phase D repaired two newly reachable compatibility windows: an official room edit forks to a new preset id, so persistence tests now locate the committed fork instead of the untouched source id; and a legacy flat v16 loadout passed directly to the editor retains its hidden selected piece until normalization. Covered by `tests/ui/loadout-ui.test.tsx` and `tests/ui/hidden-pickers.test.tsx` in the same change.

### Phase 5 — Match rewards, choice reveal, dex ownership, and direct forge

- **Status:** done (2026-09-02)
- **depends_on:** `[3, 4]`
- **parallel_group:** `serial-user-loop`
- **merge_hazards:** `src/ui/App.tsx`, `MatchHost.tsx`, `Result.tsx`, and `Rules.tsx` share progression event/state lifetime
- **Scope:** Grant one Spark once per completed standard match, persist before announcing, render an inline non-blocking result panel, expose explicit reveal purchase without auto-spend, allow a paid pending choice there or later, extend piece dex sheets with upgrade family/ownership/move preview/target forge, and expose confirmed full-profile backup/restore. Sandbox results show why no Spark was awarded without presenting it as an error.
- **Files in:** `src/ui/MatchHost.tsx`, `Result.tsx`, `Rules.tsx`, `App.tsx`, new `UpgradeReward.tsx`/`UpgradeFamily.tsx`, i18n/styles, UI tests and focused e2e.
- **Files out:** payments, online accounts, daily/streak/expiry systems, particle/full-screen reward overlays.
- **Exit criterion:** `npx --no-install vitest run tests/ui/progression-result.test.tsx tests/ui/upgrade-dex.test.tsx tests/ui/match-lifecycle.test.tsx` and `npx --no-install playwright test e2e/collection.spec.ts e2e/match-lifecycle.spec.ts`; win/loss/draw each grant one standard Spark, sandbox grants none, three Sparks remain unspent until explicit reveal purchase, the five-Spark save path remains available, persistence failure announces nothing false, navigation cannot lose a paid pending offer, forge/offer overlap follows ADR-005, confirmed restore replaces the snapshot, and direct forge equips on the next match.
- **Risk:** high
- **Rollback point:** Phase 4 leaves equipment usable with seeded test ownership; revert reward/dex UI together.

**Execution notes:** The second Phase A.5 review passed after strengthening persistence, remount, forge-overlap, and next-match equipment coverage. Added persisted one-Spark terminal claims, truthful save-failure and sandbox notices, explicit three-Spark reveal/choice, five-Spark family forge, durable pending offers, and confirmed full-snapshot backup restore. The focused unit suite passed `23/23`; typecheck passed; full Vitest passed `1975/1975` across 187 files; the exact Playwright exit suite passed `23` with `1` intentional skip. The browser test was repaired to close the dex sheet before navigating through the background rules control, matching the modal interaction contract rather than masking a product defect.

### Phase 6 — Balance, performance, migration, accessibility, and full verification

- **Status:** done (2026-09-02)
- **depends_on:** `[5]`
- **parallel_group:** `serial-release-gate`
- **merge_hazards:** tuning constants, bundled content snapshots, service-worker asset inventory, and e2e screenshots must land together
- **Scope:** Run cost/self-play/AI-complexity surveys for the four upgrades; verify v16 migration, bundle merge on existing saves, storage refusal, profile backup, keyboard/screen-reader names, reduced motion, mobile layout, offline assets, and no regression to existing collection/loadout flows. Add a deterministic cadence simulation that locks the provisional 3/5 contract: reveal is unavailable through claim 2 and affordable at claim 3, saving without spending guarantees a named forge at claim 5, all outcomes advance equally, and neither path creates duplicates or negative Sparks. Do not auto-tune subjective feel; record a 20-match human playtest as non-blocking post-review follow-up.
- **Files in:** focused balance/performance tests, migration fixtures, e2e/a11y/offline tests, any minimal fixes exposed by them, PLAN validation notes.
- **Files out:** adding Queen+/King+, monetization, accounts, cloud sync, online fairness/anti-cheat.
- **Exit criterion:** `npm run verify:ci`, targeted Playwright progression/a11y/offline tests, `npm run test:strength` when the focused complexity smoke indicates ordering drift, and `tests/progression/cadence-scenario.test.ts` proves the fixed claim-2/3/5 thresholds, result-independence, no implicit spending, bounded inventory, and nonnegative balances. The human 20-match feel test is documented but does not block execute or review.
- **Risk:** medium
- **Rollback point:** Phase 5 functional loop; revert tuning/content additions independently only if catalog invariants remain true.

**Execution notes:** Phase A.5 passed on its first review with deterministic claim-2/3/5, outcome-independence, bounded-inventory, nonnegative-balance, and named-region accessibility coverage. Added a shared progression affordance read model so the reward and forge UIs cannot drift from the 3/5 domain guards, plus polite Spark balance announcements and exact upgrade-family region names. Focused release gates passed `110/110`; `npm run verify:ci` passed the production build, full Vitest `1980/1980`, and build-output tests `21/21`. Targeted Playwright progression/accessibility/reduced-motion coverage passed `62` with `1` intentional WebKit clipboard skip, and the production-build PWA suite passed `6/6` offline, routing, update, manifest, and service-worker scenarios. Phase D found the expected newly reachable window in the hard-coded 188-file offline art census after eight upgrade-side assets were added; the test now derives its expected `196` files from the source art inventory, and the final post-PWA build-output rerun passed `21/21`. The focused AI complexity smoke showed no ordering drift, so the conditional `test:strength` gate was not triggered. The provisional 20-match human feel test remains a documented non-blocking follow-up; no automatic tuning was performed.

## 🚧 Contract Boundaries

### Do not change

- `src/collection/` — preserve `seen/used/won` semantics and its independent device store; progression is not a fourth tier.
- `src/engine/engine.ts` — no currency, ownership, storage, or reward eligibility inside move resolution.
- `src/content/provenance.ts` — keep provenance derived from the running bundle; add no stored `official` flag.
- `src/editor/storage.ts` — content reset must not silently erase progression ownership; progression gets its own explicit reset/import path.
- `wrangler.jsonc` — remain assets-only; no backend or entitlement service in this task.
- Advisory: No real-money purchase, paid currency, randomized paid reward, duplicate level, expiry, daily login, streak, trading, or online account surface.
- Advisory: Existing v16 loadout playback must remain identical after migration even though it is sandbox-only for progression.

## 🧪 Testing Strategy

### Unit and property tests

- Catalog completeness: every upgrade id exists, is pristine official, maps to one base, is non-royal, and stays within canonical delta.
- Movement/capture metamorphic checks: each upgrade contains every base legal move/capture; added destinations are move-only; Pawn+ side-relative probes are mirrored.
- Cost/eligibility: canonical cap is derived, large-board recheck can downgrade to sandbox, and reason ordering is deterministic.
- Schema migration: v16 → v17 preserves serialized intent and whole-match playback; v17 exact-square replacement changes one placement.
- Reward state machine: grants never reduce Sparks/ownership, duplicate claim ids are idempotent, reveal/choose/forge costs and failure no-ops match the transition contract, pending offers are stable, and direct forge never depends on RNG.
- Store/restore failure: absent/corrupt/future/wrong-shaped/quota-denied states have explicit safe results; a restore is whole-profile replacement, including a deliberate old-backup rollback, or no mutation.

### Integration tests

- App owns one profile and passes the same shelf to hot-seat sides, lobby, dex, and result.
- Effective equipment overrides the room piece slot but not its skill; AI receives room defaults.
- Standard eligibility snapshot used at start is the one used at result, even if device/content state changes while a match is open.
- Result commit writes collection and progression independently; failure in one does not falsify the other.
- Bundle merge supplies new upgraded PieceDefs to a previously saved content document without erasing authored records.

### End-to-end and manual

- Fresh device: play three standard results including a loss, choose one of three, equip it, and observe one starting square/movement change.
- Save five Sparks instead, forge a named upgrade, reload, and equip it.
- Play an over-cap authored room: start remains enabled, sandbox reason is visible, result grants no Spark.
- Hot-seat: both named players see the same shelf but make independent side selections for the match.
- AI: human override appears; black AI retains the room default.
- Export progression, clear only progression through its own control, confirm restore, and recover the exact profile snapshot; separately verify that restoring an older snapshot visibly rolls back later spending/ownership.
- 360×560 and desktop layouts, keyboard traversal, screen-reader labels, reduced motion, offline reload with all upgrade art cached.

## ⚠️ Risks & Mitigation

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| v16 migration changes replace-all matches | medium | high | preserve absent-square legacy semantics and compare full seeded play-outs before/after |
| Device override breaks deterministic replay | medium | high | make effective equipment an explicit match input and include it in round-trip/replay fixtures |
| Cap labels disagree across rooms | high | medium | always distinguish canonical authoring grade from selected-room effective grade |
| Over-cap status becomes a loader black hole | low | high | derive eligibility outside `loadContentSet`; sandbox never blocks play |
| Result grants twice after re-render/remount | medium | high | injected run id, bounded persisted claim ring, reducer/property tests |
| Storage failure announces progress that vanished | medium | high | save returns explicit result; publish UI event only after read-back/confirmed write |
| Pending choice traps navigation | medium | medium | inline optional panel; persist pending offer; also resolve from dex |
| Bundled upgrade bypasses acquisition in the room editor | medium | high | progression-only catalog predicate, picker filtering, direct-placement sandbox reason, imported-room tests |
| Upgrade art is indistinguishable from base | medium | medium | distinct art invariant plus rendered pixel/contrast check, not id-only assertion |
| Move-only encoding accidentally expands capture | medium | high | base-vs-upgrade legal-action metamorphic tests on empty and blocked boards |
| Pawn side-relative movement is wrong for one side | medium | high | mirrored white/black same-rank probe pair per recorded failure |
| AI branching rises disproportionately | medium | medium | complexity smoke per upgrade and strength suite only on ordering drift |
| 3/5 cadence feels too fast or slow | high | medium | lock objective economy invariants now; schedule a non-blocking 20-match human feel test after review before any later content expansion |
| Old backup restores already spent Sparks | medium | medium | explicit confirmed full-snapshot rollback semantics; keep economy free/offline and never represent restore as a merge |
| Old room references deleted equipment square/id | medium | medium | resolver drops invalid device selection with visible reason and keeps room default |
| Progression scope grows into monetization/accounts | medium | high | explicit contract boundary; no network/runtime dependency or entitlement model |

## ✅ Success Criteria

- [x] A human-authored over-cap starting piece remains playable but makes the match visibly sandbox and progression-ineligible.
- [x] The standard authored ceiling is derived from bundled base pieces on canonical 6×6 and actual rooms are revalidated.
- [x] Pawn+, Knight+, Bishop+, and Rook+ exist as data-defined, visually distinct, non-royal bundled pieces whose added moves cannot capture.
- [x] One side can apply at most one effective piece substitution to exactly one new-format starting square.
- [x] A side's skill card is optional and independent; selecting an upgrade never requires or adds a skill.
- [x] v16 loadouts import and play identically, with legacy replace-all slots classified sandbox for progression.
- [x] Ownership, Sparks, pending choice, equipment, and recent claims survive reload in a separate validated device store.
- [x] Hot-seat sides share ownership; AI receives no device-owned override.
- [x] Every completed standard match grants one Spark regardless of win/loss/draw and a claim cannot grant twice.
- [x] Three Sparks produce up to three distinct unowned choices; five Sparks always forge a specified visible upgrade.
- [x] No paid, duplicate, expiring, daily, streak, account, trading, or network economy exists.
- [x] Result reward UI is inline, skippable, persistence-honest, and recoverable later from the dex.
- [x] Upgrade ids are absent from authoring pickers, and direct/imported upgrade placements are sandbox unless introduced by validated owned equipment.
- [x] Progression backup/restore is a confirmed atomic snapshot replacement, independent of room/content export and collection tiers.
- [x] Automated cadence scenarios prove claim-2/3/5 thresholds and no implicit spending; subjective 20-match feel testing remains a non-blocking follow-up.
- [x] Targeted unit, integration, e2e, accessibility, offline, migration, cost, and AI complexity gates pass.

## 🔍 Plan Validation

**Outcome:** `MAJOR_REVISION_RESOLVED` — validator pass 2 was `APPROVED` after all pass-1 findings were resolved.

Pass 1 returned `MAJOR_REVISION`. The plan was revised to (1) prevent curated bundle pieces from bypassing ownership through authoring/import, (2) replace the subjective blocking playtest with deterministic cadence assertions, (3) define every reveal/choose/forge/pending-offer transition and deduction point, and (4) make backup restore an explicit field-complete snapshot replacement instead of an unsafe spendable-state merge. Pass 2 reported no remaining critiques and marked phase decomposition, risks, rollback, ADR completeness, scope drift, interview coverage, specification alignment, and test depth clean.

| Voter | Status | Reconciliation |
|---|---|---|
| `plan-validator` | `APPROVED` | All four pass-1 findings were incorporated; pass 2 had no critiques. |
| `codex` second opinion | `skipped` | Side-preset gating classified the pre-write planning diff as low (`is_high: false`, `boundary: false`), so no model invocation was permitted. This plan therefore carries one independent-validator vote rather than cross-model confirmation. |
