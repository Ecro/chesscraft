---
type: plan
task_slug: turning-slide-perimeter
status: complete
created: 2026-08-23
tags: [strange-chess, plan, movement, editor, schema, engine]
interview_rounds: 1
adrs: 4
validator_outcome: MAJOR_REVISION_TERMINAL
summary: "Make every perimeter grid cell an automatic turning-slide entry point"
---

# PLAN — Automatic turning from every perimeter cell

## 🎯 Executive Summary

The current shared movement grid only treats the eight compass rays as slides. That contradicts the requested gesture: any cell on the outermost ring must be a discoverable automatic bend entry point, including an off-axis cell such as the user's `(1,5)` position. This change extends the automatic `turning_slide` contract so a perimeter cell can carry its non-zero integer first-leg vector, while preserving the existing unit compass behavior and legacy ordered pairs.

The editor will canonicalize compass perimeter cells to their existing unit vectors and preserve non-compass perimeter vectors such as `[-3, 1]` as explicit automatic first legs. The engine will repeat that vector for the first leg, then enumerate legal compass second legs while rejecting only collinear same-direction and U-turn continuations. Piece movement/capture and grant movement continue to use the same grid adapter.

## 📚 Prior Work

- `work-docs/PLAN-turning-slide-redesign.md` unified the movement/capture surface but incorrectly narrowed the gesture to eight compass rays.
- `[wiki:architecture] turning-slide-redesign` records the shared 7x7 grid and automatic `turn:any` contract; this plan corrects its perimeter scope.
- `[fail:design] content-coordinates-are-board-size-bound` reinforces that persisted vectors must remain explicit and validated rather than inferred from display labels.

## 🎙️ Interview Transcript

The user supplied the missing scope directly: diagonal and straight cells currently work, but an outer non-compass cell such as `(1,5)` must also show the sliding/turning state after double-click. No further choice is needed; the implementation defaults below make that correction explicit.

| # | Topic | Category | Question (1 line) | Options | Choice | Note | → ADR |
|---|---|---|---|---|---|---|---|
| 1 | Perimeter coverage | Scope / contract | Should every outer-ring cell, not only compass cells, enter automatic turning? | A: compass only; B: every perimeter cell; Other | **B** | User explicitly reports the off-axis perimeter miss and asks for the original outermost-cell behavior. | ADR-001, ADR-002 |

## 📐 Architecture Decision Records

### ADR-001: The whole outer ring is the automatic-turn gesture

**Status:** Accepted (2026-08-23, from user correction)

**Context:** `turnAt` currently returns the unchanged grid when the selected outer cell is not on one of the eight compass rays.

**Decision:** Any non-centre cell with `max(abs(df), abs(dr)) === 3` is a valid automatic-turn entry point. Compass cells retain their canonical unit vector; other perimeter cells retain their integer offset as the first-leg vector.

**Consequences:**

- ✅ `(1,5)`-style off-axis outer cells visibly become automatic turning slides.
- ✅ Existing straight and diagonal ray behavior remains stable.
- ⚠️ An off-axis vector repeats by its authored integer offset, so it is a discrete vector slide rather than an inferred fractional line.

**Rejected alternatives:**

- Snap off-axis cells to the nearest compass direction — rejected because it loses the cell the author selected and makes adjacent perimeter cells mean the same thing.

**Source:** Interview #1

### ADR-002: Extend only the automatic schema form

**Status:** Accepted (2026-08-23)

**Context:** Schema v15 restricts automatic first vectors to compass unit vectors, while legacy ordered pairs must remain narrow for compatibility.

**Decision:** Bump the schema to v16 and allow automatic `turn:any` vectors to be unique non-zero integer vectors with a maximum of 24 entries, matching the 7x7 perimeter cell count. Remove the v15 automatic `.max(8)` restriction. Keep legacy ordered pairs restricted to two valid compass unit vectors.

**Consequences:**

- ✅ New perimeter vectors survive validation, export, import, and editor round-trip.
- ✅ Existing v15 automatic and legacy records remain valid under v16.
- ⚠️ External automatic vectors outside the 7x7 editor remain preserved/read-only rather than being fabricated into a grid cell; an automatic row containing any such vector is preserved as a whole row, never partially split.

**Rejected alternatives:**

- Widen the legacy pair form — rejected because it would change the meaning of imported ordered turns.

**Source:** Interview #1

### ADR-003: Keep arbitrary turning vectors beside the compass grid state

**Status:** Accepted (2026-08-23)

**Context:** `PieceGrid.slides`, caps, and CSS ray rendering are optimized around the eight named directions.

**Decision:** Add an opaque keyed `turningVectors` state for drawable non-compass perimeter vectors. Reuse the existing compass state for unit rays and merge both sources only at schema serialization. The compact adapter classifies an automatic row atomically: if every vector is drawable it enters the grid, otherwise the exact row enters `preservedPatterns` unchanged.

**Consequences:**

- ✅ Existing reach/cap and straight-slide state does not need a risky key-shape rewrite.
- ✅ The same adapter can clear, copy, count, and serialize arbitrary turning vectors per axis.
- ⚠️ Arbitrary vectors receive a perimeter turning marker rather than a compass bar.

**Rejected alternatives:**

- Replace every direction map with arbitrary vector keys — rejected because it expands the regression surface for ordinary slides without helping the requested gesture.

**Source:** Interview #1

### ADR-004: Automatic bends remain one-bend and blocker-aware

**Status:** Accepted (2026-08-23)

**Context:** The user changes the first-leg authoring surface, not the established automatic bend semantics.

**Decision:** Repeat each authored first vector for positive first-leg steps; after each clear first-leg stop, enumerate the eight compass second vectors except collinear same/opposite directions, applying existing blocker and capture rules. For a non-unit first vector, occupancy is checked at each repeated vector endpoint only; no unrepresented fractional/intermediate square is inferred. The second leg continues to check every unit compass square.

**Consequences:**

- ✅ Off-axis authoring uses the same final-square action shape and blocker rules.
- ✅ Cost and AI accounting can continue using the shared automatic endpoint bound.
- ⚠️ A non-unit first vector may reach fewer lattice points than a unit compass vector on the same board distance cap.

**Rejected alternatives:**

- Add arbitrary second-leg vectors from the grid — rejected because the requested gesture chooses only the first leg and automatic bending remains bounded and predictable.

**Source:** Interview #1

## 🏗️ Technical Design

### Current State

- `src/ui/PieceMoves.tsx` recognizes only `rayOf()` compass cells as slides and rejects non-compass automatic vectors while reading.
- `src/ui/MovementPatternGrid.tsx` delegates every double-click to `turnAt`, so the model—not the component—causes the missing marker.
- `src/content/schema.ts` validates automatic vectors as compass units only.
- `src/engine/engine.ts` already repeats the first vector and enumerates automatic second directions, but its turn predicate assumes both vectors are compass units.

### Affected Components

| Component | Change |
|---|---|
| `src/content/movement.ts` | Add non-zero automatic-vector and collinearity helpers. |
| `src/content/schema.ts`, `src/content/sets/bundled.ts` | Bump v15 → v16 and widen only automatic vectors. |
| `src/ui/PieceMoves.tsx` | Recognize every perimeter cell, add arbitrary turning state, and preserve round-trip semantics. |
| `src/ui/MovementPatternGrid.tsx`, `src/ui/RecordForm.tsx`, `src/ui/SentenceSlot.tsx`, `src/ui/PieceDetail.tsx` | Render, clear, count, describe, and round-trip off-axis turning markers. |
| `src/engine/engine.ts` | Apply the generalized automatic turn predicate. |
| `tests/**`, `e2e/**` | Pin model, schema, engine, UI, save/reopen, and browser behavior. |

### Data Flow

1. A perimeter double-click reaches `turnAt(axis, df, dr)`.
2. Compass cells update the existing direction ray; off-axis cells add a keyed `turningVectors` entry and remove their leap bit.
3. `writeGrid` emits automatic `turning_slide` vectors from both stores; schema v16 validates them.
4. `reachFrom` repeats each first vector and applies the generalized one-bend predicate.
5. Cost, AI, detail view, grant editor, and save/reopen consume the same emitted contract.

### Shared Adapter Boundary

`turnAt`, `cycleAt`, `paintAt`, `readGrid`, and `writeGrid` are the single state/serialization core for both surfaces. `RecordForm` adds piece-only move/capture fallback through `readMovementEditor`/`writeMovementEditor`; `SentenceSlot` uses `readGrid` for its one movement axis and `writePatternGrid`, which delegates to `writeGrid` before selecting the requested pattern kind. Both paths therefore read the same `turningVectors` map. `readMovementEditor` preserves an automatic row atomically when any vector is outside the drawable perimeter; `SentenceSlot` renders that row read-only and never partially rewrites it.

## 📝 Implementation Plan

### Phase 1 — Contract and movement model

**Status:** completed

- **depends_on:** `[]`
- **parallel_group:** `serial-contract`
- **merge_hazards:** `src/content/schema.ts`, `src/content/movement.ts`, `src/ui/PieceMoves.tsx`, and schema fixtures define the vector contract; update serially.
- **Scope in:** `src/content/movement.ts`, `src/content/schema.ts`, `src/content/sets/bundled.ts`, `src/ui/PieceMoves.tsx`, schema/model tests.
- **Scope out:** engine enumeration and browser rendering.
- **Work:** add v16 automatic-vector validation with the 24-vector limit, perimeter vector helpers, `turningVectors`, atomic drawable/preserved row partitioning, read/write/cycle/clear behavior, and round-trip tests for an off-axis cell plus mixed out-of-grid preservation.
- **Exit criterion:** `npx --no-install vitest run tests/content/turning-slide-schema.test.ts tests/content/movement-bound.test.ts tests/ui/movement-grid-model.test.ts tests/ui/movement-ray.test.ts && npx --no-install tsc --noEmit` passes.
- **Risk:** high
- **Rollback point:** `83465d5` for the whole task; within the worktree, Phase 1 is the first recoverable boundary after its focused command passes. If rollback is needed, save `git diff --binary -- <Phase 1 file list>` first, then restore only the Phase 1 file list to `HEAD`, leaving unrelated worktree files untouched.

### Phase 2 — Engine and accounting compatibility

**Status:** completed

- **depends_on:** `[1]`
- **parallel_group:** `serial-engine`
- **merge_hazards:** `src/engine/engine.ts` and shared movement predicates feed cost/AI bounds; keep changes serial.
- **Scope in:** `src/engine/engine.ts`, `src/balance/cost.ts`, `src/engine/ai/evaluate.ts`, `src/engine/ai/complexity.ts`, engine and balance tests.
- **Scope out:** new editor gestures and CSS.
- **Work:** generalize automatic collinearity checks, test an off-axis first vector, endpoint-only first-leg blocking versus unit-step second-leg blocking, captures, forward mirroring, and retain existing compass expectations.
- **Exit criterion:** `npx --no-install vitest run tests/engine/turning-slide.test.ts tests/balance/turning-reach-accounting.test.ts tests/content/turning-slide-schema.test.ts` passes.
- **Risk:** high
- **Rollback point:** the Phase 1 boundary above. Save a binary diff for the Phase 2 file list, then restore only `src/engine/engine.ts`, the accounting consumers, and their tests if the engine gate fails.

### Phase 3 — Shared UI and browser regression

**Status:** completed

- **depends_on:** `[1, 2]`
- **parallel_group:** `serial-ui`
- **merge_hazards:** `src/ui/MovementPatternGrid.tsx`, `src/ui/RecordForm.tsx`, `src/ui/PieceDetail.tsx`, and movement test ids share the same state.
- **Scope in:** `src/ui/MovementPatternGrid.tsx`, `src/ui/RecordForm.tsx`, `src/ui/SentenceSlot.tsx`, `src/ui/PieceDetail.tsx`, `src/ui/styles.css`, UI tests, `e2e/maker-movement-and-placement.spec.ts`.
- **Scope out:** unrelated editor surfaces and action APIs.
- **Work:** show the off-axis turning marker, preserve axis isolation and omitted-attack fallback, clear it correctly, count/describe it, and assert piece and grant author → serialize → reopen → serialize stability in the real surfaces.
- **Implementation note:** `src/ui/SentenceSlot.tsx` already delegates grant patterns through `readGrid`/`writePatternGrid`; no source edit was required. Its off-axis grant round-trip is covered by `tests/ui/sentence-slot.test.tsx` and the shared adapter change.
- **Exit criterion:** `npx --no-install vitest run tests/ui/movement-grid-model.test.ts tests/ui/movement-pattern-grid.test.tsx tests/ui/sentence-slot.test.tsx tests/ui/piece-detail.test.tsx` and `npx --no-install playwright test e2e/maker-movement-and-placement.spec.ts --project=mobile-portrait --project=desktop --project=mobile-webkit` both pass.
- **Risk:** medium
- **Rollback point:** the Phase 2 boundary above. Save a binary diff for the Phase 3 file list, then restore only the UI files and UI/browser tests if the exact focused commands fail.

## Phase D.5 — Newly reachable perimeter window

This defect-repair window is part of the same commit and has the following fixed boundary:

- **Input window:** every 7x7 editor offset where `max(abs(df), abs(dr)) === 3`; automatic schema v16 vectors remain non-zero integer pairs with a maximum of 24 unique entries.
- **Covered test nodes:** `tests/ui/movement-grid-model.test.ts` S6–S9, `tests/ui/sentence-slot.test.tsx` off-axis grant round-trip, and `tests/engine/turning-slide.test.ts` off-axis repeat/block/capture/forward cases.
- **Absent case:** v15 compass-only documents retain their existing behavior; omitted `attack` continues to follow movement until a separate capture edit is made.
- **Release condition:** the perimeter cell is visibly marked, serializes as the selected vector (compass corners canonicalize to their existing unit vector), and survives save/reopen without changing the final `{ kind: "move", from, to }` action shape.

### Phase 4 — Full verification and delivery

**Status:** completed

- **depends_on:** `[3]`
- **parallel_group:** `serial-release`
- **merge_hazards:** final verification receipts, PLAN/REVIEW artifacts, and generated schema fixtures must reflect the same v16 contract.
- **Scope in:** changed tests, PLAN/REVIEW, verification cache and wrapup deliverables.
- **Scope out:** unrelated worktrees and unrelated staged changes.
- **Work:** run targeted-test selection, typecheck, build, Vitest, browser E2E, PWA E2E, security/context gates, review, wrapup, and push `master` when the delivery request is explicit. Existing shared accounting consumers in `src/balance/cost.ts`, `src/engine/ai/evaluate.ts`, and `src/engine/ai/complexity.ts` were verified against the generalized automatic contract and required no direct source edit.
- **Verification result:** `npm run verify` passed on 2026-08-23: 171 Vitest files / 1,825 tests, 439 browser E2E tests passed with 17 intentional skips, 6 PWA tests, and 21 build tests. Typecheck and production build passed. Review final grade is A / APPROVED; the security ledger has zero unresolved high/P0 findings after four documentation-pattern false positives were reclassified with rationale; context lint passed for 26 generated agents/skills.
- **Exit criterion:** `npm run verify` passes; review is APPROVED; `git status --short` is clean after the single wrapup commit.
- **Risk:** medium
- **Rollback point:** Phase 3.

## 🚧 Contract Boundaries

### Do not change

- `src/engine/types.ts` — final move actions remain `{ kind: "move", from, to }`.
- `src/editor/io.ts` — fail-closed import and one normalization path remain unchanged.
- Advisory: omitted `attack` fallback semantics remain movement-derived.
- Advisory: legacy ordered `turning_slide` pairs remain constrained and playable.

## 🧪 Testing Strategy

### Unit

- Validate v16 automatic non-zero vectors, exactly 24 accepted and 25 rejected automatic vectors, duplicate/zero rejection, legacy pair compatibility, v15 import restamping, and atomic preservation of mixed drawable/out-of-grid automatic rows.
- Exercise every non-compass perimeter offset through `turnAt`, `isTurningAt`, `paintAt`, clear, per-axis isolation, and write/read stability.
- Exercise arbitrary first-leg endpoint-only blocker behavior (for `[-3,1]`, only repeated landing endpoints block), unit-square second-leg blockers/captures, forward mirroring, and unchanged compass behavior.

### Component/integration

- Render `RecordForm`, double-click an off-axis perimeter cell, assert `data-turning="true"`, emitted vector, axis isolation, and save/reopen.
- Render `SentenceSlot` for a grant movement and assert author → serialize → reopen → serialize preserves the same off-axis automatic vector.
- Render `PieceDetail` and assert the automatic marker is not omitted.
- Load an omitted-`attack` piece, edit an off-axis movement turn, and assert fallback remains omitted; then make a capture-only edit and assert explicit attack retains both axes.

### Browser/manual

- On desktop and mobile projects, double-click an off-axis outer cell such as the cell corresponding to `(1,5)` and verify the marker and persisted movement.
- Confirm compass straight/diagonal slides and ordinary inner-cell hops still behave as before.

## ⚠️ Risks & Mitigation

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---:|---:|---|
| R1 | More than eight perimeter selections are rejected by the old automatic limit | Medium | High | Replace `.max(8)` with the explicit 24-vector contract and test all perimeter cardinality boundaries. |
| R2 | Arbitrary automatic vectors are accepted but lost by the compact adapter | Medium | High | Atomic drawable/preserved row partition, dedicated keyed state, round-trip tests, and save/reopen E2E. |
| R3 | Generalized turn predicate accidentally permits straight/U-turn paths | Medium | High | Cross-product/dot-product tests plus existing compass regression suite. |
| R4 | Schema bump rejects or rewrites existing v15 documents | Low | High | v15 import/restamp tests and unchanged legacy-pair fixtures. |
| R5 | Off-axis marker is technically stored but visually indistinguishable | Medium | Medium | `data-turning` assertion, explicit marker styling, and browser coverage. |

## ✅ Success Criteria

- [x] Every radius-three perimeter cell, including non-compass cells, accepts native double-click automatic turning.
- [x] The off-axis vector is visible, saved, reopened, and remains independent between movement and capture axes.
- [x] Automatic schema v16 accepts up to 24 unique non-zero vectors while legacy ordered pairs remain constrained and compatible.
- [x] Automatic rows with any out-of-grid vector are preserved atomically without dropping drawable neighbors.
- [x] The engine applies one bend with blockers/captures and does not alter final move action shape.
- [x] Existing straight/diagonal slides, grants (including reopen), detail rendering, and omitted attack fallback remain correct.
- [x] Targeted and full verification pass; review is APPROVED; wrapup creates one commit and pushes `master` when requested.

## 🔍 Plan Validation

- Pass 1: `NEEDS_REVISION`; resolved the non-executable Phase 3 command, named the shared adapter boundary, and made rollback boundaries explicit.
- Codex second opinion: invoked; its five findings were mitigated or rejected in the revised plan.
- Final validator pass: `NEEDS_REVISION`; terminal known risk is that the v15→v16 fixture assertions in `src/content/sets/bundled.ts`, `tests/content/bundled.test.ts`, and `tests/editor/schema-v13-roundtrip.test.ts` must be included in Phase 1 implementation and verification. This finding is carried into execute; the two-pass validation cap prevents another plan pass.
