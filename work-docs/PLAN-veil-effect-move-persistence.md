---
type: plan
task_slug: veil-effect-move-persistence
status: complete
created: 2026-09-01
tags: [strange-chess, plan, typescript, engine, grants, movement]
spec: "[[SPEC-veil-effect-move-persistence]]"
research_doc: "[[RESEARCH-veil-effect-move-persistence]]"
interview_rounds: 1
adrs: 1
validator_outcome: NEEDS_REVISION_RESOLVED
summary: "Move durationed capture protection with its beneficiary without changing square hazards."
---

# PLAN — Capture-protection relocation

## 🎯 Executive Summary

Durationed `block_capture` promises protection for a piece but currently remains on its origin square. This plan introduces one private, batch-oriented engine helper that transfers matching capture protection at every relocation seam, plus one post-cascade cleanup that removes protection whose beneficiary no longer occupies a square. No serialized type, content schema, card wording, or other effect ownership changes.

The player-facing impact is direct: after `skill.veil` or an equivalent cover effect, capture immunity and the visible shield follow the selected piece through a normal move, teleport, swap, promotion, and terminal royal capture. ADR-001 fixes the ownership boundary and the rejected alternatives.

## 📚 Prior Work

- `[[RESEARCH-veil-effect-move-persistence]]` identifies the missing `m.grants` relocation and compares three implementation strategies.
- `[[PLAN-movement-lock-8x8-and-rule-cards]]` introduced `beneficiarySide` and documented the deliberate square ownership of movement locks and movement grants.
- `[wiki:settlement-grants-and-board-size]` records the rule that a square-keyed write about a moving piece must resolve at the piece's settled location.
- `[fail:design] declared-but-inert-vocabulary` requires end-to-end real-content tests rather than a state-shape-only assertion.

## 🎙️ Interview Transcript

| # | Topic | Category | Question | Options | Choice | Note | → ADR |
|---|---|---|---|---|---|---|---|
| 1 | Effect ownership | Architecture | How should durationed capture protection behave after relocation? | Move `block_capture` at existing seams / explicit anchor schema / stable piece IDs | Move `block_capture` at existing seams | The user explicitly requested an autonomous pipeline without questions. The research default preserves serialization and square-hazard contracts. | ADR-001 |

## 📐 Architecture Decision Records

### ADR-001: Durationed capture protection follows the beneficiary at relocation seams

**Status:** Accepted (2026-09-01, via user-authorized autonomous default)

**Context:** Capture-protection card prose names a piece while runtime `ActiveGrant` names only its current square. Relocation changes the board but not the grant, so capture legality and UI state detach from the selected piece.

**Decision:** Whenever a piece relocates, batch-replace the `square` of each live `block_capture` grant at the origin whose `beneficiarySide` matches the relocated piece. Apply the batch to normal move, terminal royal capture, `teleport_piece`, and both directions of `swap_pieces`. After entry cascades, remove a protection transferred during the current action when its destination is empty or occupied by the wrong side. Unrelated pre-existing grants, `forbid_movement`, `grant_movement`, and `frozenUntil` remain untouched and square-anchored.

**Consequences:**

- ✅ Capture legality and live-effect display follow the beneficiary across every current relocation mechanism.
- ✅ The serialized `ActiveGrant` shape, content schema, and downstream consumers remain unchanged.
- ⚠️ Every new relocation mechanism must call the same batch helper.
- ⚠️ Without stable piece identity, a same-side same-transition replacement cannot be distinguished from the original beneficiary. That case is outside this work unit; shipped destroy-on-enter behavior leaves the square empty and is covered.

**Rejected alternatives:**

- Explicit `anchor: piece | square` metadata — rejected because no current content requires square-anchored durationed capture protection, while the field would expand snapshot and authoring contracts.
- Stable piece-instance IDs — rejected because this bug does not justify a core board/snapshot/AI migration.
- A `skill.veil` special case — rejected because it would duplicate content identity in the engine and leave identical cover cards inconsistent.

**Source:** Interview #1

## 🏗️ Technical Design

### Current State

- `ActiveGrant` stores `kind`, `square`, expiry, provenance, and `beneficiarySide`.
- The main move branch and `executeActions` directly mutate `m.board` for normal moves, teleports, and swaps.
- `m.grants` is filtered for expiry at transition start but is never relocated.
- `generationModifiers`, `liveEffects`, and AI hashing already consume `grant.square` and need no parallel logic.

### Affected Components

- `src/engine/engine.ts` — private transfer and orphan-cleanup helpers plus relocation call sites.
- `tests/engine/grant-relocation.test.ts` — engine-level acceptance coverage.
- `tests/ui/effect-visibility.test.tsx` — exact live-effect location coverage.

### Dependencies

- Existing `ActiveGrant.beneficiarySide` supplies the ownership discriminator.
- Existing Vitest helpers and shipped content supply `skill.veil`, teleport, swap, and destroy-on-enter fixtures.

### Architecture

1. `relocateCaptureProtection(grants, pairs)` receives relocation pairs containing `from`, `to`, and the relocated `PieceOnBoard`.
2. It maps from the original grant array exactly once. A grant matches at most one pair by its original square and beneficiary side; this prevents a swap from moving an already-transferred grant back again.
3. The normal move, royal-capture early return, teleport, and swap branches assign the returned array alongside their board relocation.
4. After destination/arrival cascades and before returning a state, `discardOrphanedRelocatedProtection` removes only entries transferred during the current action whose square has no beneficiary-side occupant.
5. A terminal royal capture transfers the protected non-royal capturer's grant before the early return so replay and final-board rendering remain internally consistent.

### Design Decisions

- ADR-001 restricts transfer to `block_capture`; no generalized effect-attachment framework is introduced.
- Cleanup occurs after cascades. Transfer is provisional until a beneficiary-side occupant survives the destination pipeline.
- Promotion retains protection because relocation precedes promotion and the piece remains on the destination with the same side.

### Data Flow

`state.grants` → expiry filter → board relocation pairs → batch protection transfer → entry cascades/promotion → orphan cleanup → `GameState.grants` → move generation, UI, AI hashing.

### API Changes

None. Helpers remain private to `src/engine/engine.ts`; runtime and serialized public types are unchanged.

## 📝 Implementation Plan

### Phase 1 — RED behavioral tests

- **Status:** DONE — RED confirmed 6 intended failures / 15 passes; Phase A.5 passed on round 2 after strengthening swap multiplicity and later-occupant assertions.
- **depends_on:** `[]`
- **parallel_group:** `serial-tests`
- **merge_hazards:** `tests/engine/grant-relocation.test.ts` and `tests/ui/effect-visibility.test.tsx` become the oracle used by Phase 2.
- **Scope in:** create `tests/engine/grant-relocation.test.ts`; extend `tests/ui/effect-visibility.test.tsx`.
- **Scope out:** all production files.
- **Work:**
  - AC-001: real `skill.veil` play followed by a normal move; assert exact origin/destination grant set and independent enemy capture legality.
  - AC-002: table-drive normal move, teleport, and both swap endpoints; assert one transfer per surviving beneficiary and preservation of unrelated grants.
  - AC-003: prove `forbid_movement`, `grant_movement`, and `frozenUntil` retain origin keys on a relocation path that can legally bypass them.
  - AC-004: compare the exact `liveEffects` shield-square set before and after relocation.
  - AC-005: relocate a protected piece onto a destroy-on-enter square that becomes empty; assert no protection at origin/destination and no later inheritance.
  - Terminal case: a protected non-royal captures the enemy royal; assert the terminal state holds exactly one matching grant at the destination.
- **Exit criterion:** `npx --no-install vitest run tests/engine/grant-relocation.test.ts tests/ui/effect-visibility.test.tsx` is RED only for absent capture-protection relocation/cleanup, with no syntax, import, or fixture failures.
- **Risk:** medium.
- **Rollback point:** remove the newly authored tests; production remains untouched.

### Phase 2 — Engine transfer and cleanup

- **Status:** DONE — private batch relocation and transferred-grant survivor cleanup implemented; focused regression 63/63 passed.
- **depends_on:** `[1]`
- **parallel_group:** `serial-engine`
- **merge_hazards:** `src/engine/engine.ts` is one shared transition contract and must be edited serially.
- **Scope in:** `src/engine/engine.ts` only.
- **Scope out:** public types, serialization, content, i18n, UI derivation, AI hashing.
- **Work:**
  - Implement batch transfer from original grant squares.
  - Wire normal move, terminal royal capture, teleport, and both swap directions.
  - Run orphan cleanup after cascades on card and ordinary move returns; the terminal royal-capture branch transfers to its occupied destination before returning.
  - Preserve unrelated grants and every non-`block_capture` effect byte-for-byte.
- **Exit criterion:** `npx --no-install vitest run tests/engine/grant-relocation.test.ts tests/ui/effect-visibility.test.tsx tests/engine/grant-beneficiary.test.ts tests/engine/relocation-settlement.test.ts tests/engine/relocation-lock.test.ts tests/engine/effect-provenance.test.ts` passes.
- **Risk:** medium.
- **Rollback point:** Phase 1; revert only `src/engine/engine.ts`, leaving the RED tests as evidence.

### Phase 3 — Regression and artifact closure

- **Status:** DONE — typecheck and production build passed; changed selection 852/852; full Vitest 1881/1881; Playwright 454 passed / 17 skipped, PWA 6/6, and build tests 21/21 passed in the final `npm run verify` gate.
- **depends_on:** `[2]`
- **parallel_group:** `serial-verify`
- **merge_hazards:** none.
- **Scope in:** PLAN phase statuses, verification artifacts, and `e2e/collection.spec.ts` only if the intended longer-lived protection exposes that suite's random-match flake.
- **Scope out:** further gameplay or content changes.
- **Work:** run type checking, targeted grant/card/effect tests, full CI-derived verification, and drift checks. If collection E2E becomes nondeterministic because protected pieces now survive moves, pin its match seed and keep its high-volume state-driving clicks independent from browser animation stability waits.
- **Exit criterion:** `npm run verify:ci && git diff --check` passes.
- **Risk:** low.
- **Rollback point:** Phase 2.

## 🚧 Contract Boundaries

### Do not change

- `src/engine/types.ts` — serialized `ActiveGrant` shape remains stable.
- `src/content/` — no card, schema, or authoring semantics are added.
- `src/i18n/` — player-facing wording already expresses the intended behavior.
- `src/engine/ai/search.ts` — consumes `grant.square` and updates automatically.
- `src/ui/liveEffects.ts` — consumes `grant.square` and updates automatically.
- Advisory: do not make `forbid_movement`, `grant_movement`, or `frozenUntil` follow pieces.
- Advisory: do not add stable piece identities or refactor unrelated board mutation.

## 🧪 Testing Strategy

- **Unit / property-style:** Vitest fixtures cover normal move, teleport, swap, exact one-grant transfer, origin cleanup, unrelated grants, terminal royal capture, entry destruction, and non-protection controls. Existing beneficiary regression suites are included in the focused gate; promotion behavior is an implementation consequence, not a new dedicated scenario in this work unit.
- **UI derivation:** exact `liveEffects` sets ensure the badge/legend source changes only through public state rather than duplicated movement arithmetic.
- **Regression:** run `grant-beneficiary`, `relocation-settlement`, `relocation-lock`, `effect-provenance`, `card-liveness`, and the test selection derived from changed files.
- **Full:** run the CI-derived suite at Phase 3 and again in `/hm:verify` when the verification cache is stale.
- **Browser stability:** the collection persistence E2E uses one fixed match seed and force-clicks only inside its high-volume state driver; result-screen, storage-delta, and reload assertions remain ordinary user-visible assertions.

## ⚠️ Risks & Mitigation

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Swap sequentially moves one grant twice | medium | high | Batch-map from original squares; test both endpoints with two protected pieces. |
| Square hazards begin following pieces | low | high | Match `kind === 'block_capture'` only and pin AC-003 controls. |
| A wrong-side occupant inherits protection | low | high | Require `beneficiarySide === relocatedPiece.side`; keep existing beneficiary tests. |
| Entry cascade destroys the beneficiary but leaves a shield | medium | high | Post-cascade orphan cleanup; AC-005 asserts empty board and zero origin/destination protection. |
| Terminal royal-capture snapshot disagrees with final board | low | medium | Transfer before the early return and assert state plus `liveEffects`. |
| A relocation path is missed | medium | medium | Enumerate every board delete/set relocation and cover normal/teleport/swap explicitly. |
| Same-side same-transition replacement inherits protection | low / not shipped | medium | Explicitly outside scope because runtime has no piece identity; do not claim this discriminator. |

## ✅ Success Criteria

- [x] AC-001 through AC-005 each map to a passing named Vitest.
- [x] Destination capture is excluded while the vacated origin has no live shield.
- [x] Normal move, teleport, both swap endpoints, and terminal royal capture obey the same ownership rule.
- [x] Entry-destroyed beneficiaries leave no protection for a later occupant.
- [x] Other persistent effect kinds retain their square keys.
- [x] `liveEffects` reports the exact destination/origin shield set.
- [x] Targeted suites and `npm run verify:ci` pass; `git diff --check` is run at stage close.
- [x] No contract-boundary path is changed.

## 🔍 Plan Validation

- **Pass 1:** `NEEDS_REVISION` — lifecycle ordering after destination destruction and terminal royal-capture semantics were ambiguous.
- **Resolution:** added post-cascade orphan cleanup, narrowed AC-005 to the observable empty-destination case, and fixed terminal snapshot behavior to transfer before early return.
- **Pass 2:** `APPROVED` — no remaining critiques.
- **Second opinion:** Codex skipped because the Side-preset high-diff classifier returned `is_high=false`, `boundary=false`.
- **Outcome:** `NEEDS_REVISION_RESOLVED`.
