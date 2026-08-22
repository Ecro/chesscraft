---
type: plan
task_slug: turning-slide-redesign
status: complete
created: 2026-08-22
tags: [strange-chess, plan, typescript, movement, editor, ux]
interview_rounds: 1
adrs: 5
validator_outcome: MAJOR_REVISION_TERMINAL
summary: "Integrate automatic one-bend sliding into the movement/capture grid"
---

# PLAN — Integrated automatic turning slide

## 🎯 Executive Summary

The existing implementation exposes `turning_slide` through a separate row editor beside the movement/capture grid. That is the wrong authoring model for this product: the author chooses movement and capture on one map, but the new movement family is configured somewhere else with a different vocabulary. This plan replaces that split with one interaction surface. A normal grid interaction continues to describe a hop or a straight slide. A quick double-click on the outermost cell of a compass ray marks that ray as an automatic one-bend slide for the currently selected axis (`move` or `capture`). The author never chooses a second direction; the engine explores every legal non-straight, non-U-turn direction for the second leg.

The persisted contract is a new `turning_slide` form with `turn: "any"` and one or more first-leg vectors. The old ordered two-vector form remains valid and playable, so importing an older document cannot silently widen a piece's movement. The compact editor carries any legacy pair in an opaque preserved-pattern bucket and merges it back unchanged on save; it never turns a legacy pair into an automatic pattern merely because the grid can display the rest of the record. The engine, balance, AI, grant movement editor, player detail view, and tests all consume the same meaning.

**Key decisions:** ADR-001 unifies the authoring surface around the existing movement/capture grid; ADR-002 makes the outermost-cell double-click the only new gesture; ADR-003 persists automatic turns explicitly while retaining legacy pairs through an opaque preservation state; ADR-004 defines one-bend enumeration and blocker semantics; ADR-005 makes the shared grid adapter the single UI owner for piece and grant movement patterns.

**Estimated impact:** one schema extension and one engine branch, removal of the standalone `TurningSlideEditor`, a reusable movement-pattern grid for the piece and grant surfaces, updated detail/cost/AI consumers, and focused unit/component/browser coverage. Existing straight pieces and existing legacy turning pairs retain their current behavior.

## 📚 Prior Work

- `work-docs/PLAN-turning-slide.md` and `work-docs/REVIEW-turning-slide-2026-08-22.md` delivered the first bounded one-bend implementation. The review approved the engine but left the UI split across `PieceMoves`, `TurningSlideEditor`, and grant-specific controls; this redesign closes that user-facing boundary rather than layering another control beside it.
- `[wiki:architecture] turning-slide` records that the existing final-square action shape can carry a bounded one-bend move and that cost/AI must use the same endpoint bound as the engine.
- `[fail:render] column-flex-wrap-invents-a-height` records the need to keep column fieldsets explicitly `flex-wrap: nowrap`; the replacement grid must not reintroduce a nested column fieldset with the base wrapping rule.
- The old review's pending capture-only detail omission is included in this plan's player-detail phase because the new grid already has independent movement and capture state.

## 🎙️ Interview Transcript

| # | Topic | Category | Question (1 line) | Options | Choice | Note | → ADR |
|---|---|---|---|---|---|---|---|
| 1 | Authoring surface and gesture | Scope / architecture / interaction | Where should automatic turning be authored, and how should the author select it? | A: separate bend editor; B: same movement/capture map, outermost-cell double-click; Other | **B** | User explicitly requested that turning be configured in the existing movement/capture box and become automatic from the outermost cell. | ADR-001, ADR-002, ADR-005 |
| 1 | Bend semantics | Contract / behavior | How is the second leg chosen when the author does not select it? | A: any legal compass direction except straight/U-turn; B: one fixed default direction; Other | **A (defaulted from “자동으로 꺾임”)** | The engine will enumerate six possible second directions after each first-leg stop and deduplicate final squares. | ADR-004 |
| 1 | Existing documents | Compatibility | What should happen to the shipped ordered-pair contract? | A: widen it silently; B: preserve it as a legacy constrained form; Other | **B** | Expanding an old pair changes gameplay, so the old form remains accepted, carried as an opaque preserved pattern, and is not flattened by the compact editor. | ADR-003 |

## 📐 Architecture Decision Records

### ADR-001: Make the movement/capture grid the only compact authoring surface

**Status:** Accepted (2026-08-22, via /hm:plan interview)

**Context:** The first implementation placed `TurningSlideEditor` beside the grid. That forced authors to switch mental models and made movement/capture ownership unclear. The user explicitly rejected this split.

**Decision:** Store the automatic-turn marker in the same `PieceGrid` model that already owns cells, slide directions, reach caps, and the move/capture axis. Remove the standalone row editor from the piece maker. The grid remains the source of truth for both normal and automatic slide patterns.

**Consequences:**

- ✅ Movement, capture, reach, and turning are configured in one map.
- ✅ The existing move/capture mode keeps independent state, so a turn can be authored for movement without changing capture.
- ⚠️ The compact editor cannot expose every legacy constrained pair as a row; those records use the read-only preservation path until the author replaces them.

**Rejected alternatives:**

- Separate first-direction/second-direction rows — Rejected because the user cannot discover the relationship from the movement/capture box and it duplicates the grid's direction vocabulary.

**Source:** Interview #1

### ADR-002: Outer-radius double-click means automatic turning

**Status:** Accepted (2026-08-22, via /hm:plan interview)

**Context:** The current grid already uses the first tap for a destination and the second tap on a compass ray for a slide cap. The user wants the outermost cell to be the simple entry point for a slide that can bend.

**Decision:** A quick double-click on a radius-three compass cell sets that axis/direction to an edge-reach `turning_slide` with `turn: "any"`. Single-click behavior remains the existing hop → straight-slide cycle, including inner capped rays. The double-click handler writes the final automatic state after the browser's two click events, making the gesture deterministic.

**Consequences:**

- ✅ No extra picker, direction row, or hidden mode is needed.
- ✅ Inner cells retain their existing meaning and can still author capped straight slides.
- ⚠️ A fast double-click on the outermost cell is reserved for automatic turning; a deliberately separated pair of clicks can still create the ordinary edge slide.

**Rejected alternatives:**

- A new “turning” button or modifier key — Rejected because it adds a second control for a fact already visible in the ray map.

**Source:** Interview #1

### ADR-003: Persist automatic turns explicitly and keep ordered pairs compatible

**Status:** Accepted (2026-08-22, via /hm:plan interview)

**Context:** The first feature introduced `turning_slide` as an ordered pair of compass vectors. Automatic bending has different semantics: the author chooses only a first direction, and the engine chooses the second direction.

**Decision:** Bump the content vocabulary to schema v15 and extend `turning_slide` with `turn: "any"`. The automatic form carries one or more first-leg vectors; the legacy form carries exactly two vectors and omits `turn`. Existing v14 documents normalize and round-trip unchanged. `MovementEditorState` contains `preservedPatterns: { movement: unknown[]; attack?: unknown[] }` for patterns the grid cannot represent. The reader removes those entries from the drawable projection, and the writer prepends them unchanged before emitting edited grid patterns; a legacy-only record is rendered read-only and its opaque arrays are returned byte-for-byte by an untouched save.

**Consequences:**

- ✅ JSON states the difference between constrained and automatic turns; no hidden UI state changes gameplay.
- ✅ Older exported content remains loadable and its movement does not widen on import or disappear on an unrelated editor save.
- ⚠️ The schema and editor tests must cover both forms, and export of a newly edited automatic ray uses the v15 form while preserved legacy entries remain in their original form.

**Rejected alternatives:**

- Replacing the old pair with a one-vector tuple without a discriminator — Rejected because a two-vector legacy document would become ambiguous and could silently gain six new routes.

**Source:** Interview #1

### ADR-004: Enumerate one automatic bend with total-distance and blocker rules

**Status:** Accepted (2026-08-22, via /hm:plan interview)

**Context:** Automatic bending needs a precise engine contract or the editor's simple gesture will produce inconsistent captures, costs, and AI values.

**Decision:** For each authored first vector, enumerate direct first-leg endpoints and every positive split `firstLeg + secondLeg <= maxDistance`. The second vector may be any compass unit except the first vector and its opposite. A friendly occupant stops the current leg without making that square a destination; an enemy occupant may be captured and terminates that leg. The piece may turn only after an unoccupied first-leg stop, and the action remains the existing `{ kind: "move", from, to }` final-square shape. Duplicate final squares are harmless and removed by the existing action set.

**Consequences:**

- ✅ Engine, cost, complexity, and AI can share the existing triangular endpoint bound with a vector-count multiplier.
- ✅ Captures obey the same blocker rule on both legs and never pass through an occupied square.
- ⚠️ Automatic turns can produce more endpoints than a straight slide, so the existing complexity envelope remains the guardrail.

**Rejected alternatives:**

- Allowing a bend after an occupied first-leg square — Rejected because it would make a capture square also a hidden waypoint and would disagree with straight-slide blocking.

**Source:** Interview #1

### ADR-005: Reuse one movement-pattern grid adapter across piece and grant surfaces

**Status:** Accepted (2026-08-22, via /hm:plan interview)

**Context:** `RecordForm` and `SentenceSlot` currently serialize movement patterns through different controls. Fixing only the piece maker would leave `grant_movement` with a second, contradictory way to author a turn.

**Decision:** Extract the presentational grid/gesture layer into a reusable `MovementPatternGrid` component backed by the `PieceGrid` adapter. The piece surface supplies move/capture axes; the grant surface supplies one pattern axis. Both use the same double-click, legacy refusal, forward flag, and serialization rules.

**Consequences:**

- ✅ A future movement kind is implemented once and reaches both content surfaces.
- ✅ The grant editor no longer needs a separate direction-pair row.
- ⚠️ The refactor touches `SentenceSlot` and its sheet tests in addition to the piece maker.

**Rejected alternatives:**

- Leave grant movement on `TurningSlideEditor` — Rejected because it would preserve the exact split the user is removing and invite semantic drift.

**Source:** Interview #1

## 🏗️ Technical Design

### Current State

- `src/ui/RecordForm.tsx` renders a combined 7x7 movement/capture grid but mounts `TurningSlideEditor` below it for turning rows.
- `src/ui/PieceMoves.tsx` has a `PieceGrid` for straight patterns and a separate `MovementEditorState.turning` array for ordered rows.
- `src/ui/SentenceSlot.tsx` has a second vector grid for most grant patterns and mounts `TurningSlideEditor` for `turning_slide`.
- `src/engine/engine.ts` supports only an ordered pair for `turning_slide`; the pair is selected by content, not by the grid.
- `src/ui/PieceDetail.tsx` describes straight slides and then separately lists movement-side turning rows, so capture-only rows can disappear.

### Affected Components

| Component | Change |
|---|---|
| `src/content/schema.ts` | Add schema-v15 automatic-turn discriminator while accepting legacy ordered pairs. |
| `src/content/load.ts` / `src/editor/io.ts` | No production code change is planned; their existing version gate, normalizers, and fail-closed restamp are compatibility boundaries covered by tests. |
| `src/content/movement.ts` | Export compass directions, automatic-turn validation, and the shared upper-bound multiplier. |
| `src/engine/engine.ts` | Enumerate automatic second legs with the same blocker/capture rules. |
| `src/balance/cost.ts`, `src/engine/ai/evaluate.ts`, `src/engine/ai/complexity.ts` | Price and bound automatic patterns from their first-vector count. |
| `src/ui/PieceMoves.tsx` | Move turning state into `PieceGrid`, add `turnAt`, add opaque legacy preservation buckets, and remove row-state serialization. |
| `src/ui/MovementPatternGrid.tsx` | New reusable grid renderer for one pattern or the piece's move/capture axes. |
| `src/ui/RecordForm.tsx` | Use the shared grid and handle outer-radius double-click in the existing fieldset. |
| `src/ui/SentenceSlot.tsx` | Use the shared grid for `grant_movement` and remove the row editor path. |
| `src/ui/PieceDetail.tsx` | Describe automatic-turn rays and preserve capture-only turning content without a second list shape. |
| `src/ui/TurningSlideEditor.tsx` | Delete after all call sites and tests move to the shared grid. |
| `src/ui/styles.css`, `src/i18n/ko.ts` | Add one visual state and concise gesture/help text; preserve column-fieldset nowrap guards. |

### Dependencies

No new runtime or build dependency is required. React event handling, Zod, the existing movement helpers, and the current Vitest/Playwright toolchain are sufficient.

### Architecture

```text
7x7 grid + move/capture axis
          |
          v
PieceGrid { cells, slides, reach, turning, forward }
          |
          +--> MovementPatternGrid --> RecordForm (piece)
          |                         --> SentenceSlot (grant_movement)
          |
          +--> write/read adapter --> schema v15 patterns
                                      |
                                      +--> engine reachFrom
                                      +--> balance / AI
                                      +--> PieceDetail
```

The component owns DOM gestures only. The adapter owns canonical state transitions and schema conversion. The engine does not import UI code and receives only validated `MovePattern` values. `turning_slide` with `turn: "any"` is the only new automatic form; legacy pairs stay in the schema and engine branch.

### Design Decisions

- `PieceGrid.turning[axis][direction]` is a boolean parallel to `slides[direction]`, so turning can be cleared without changing the other axis or leaving a dead cap.
- `turnAt` always canonicalizes the selected radius-three direction to an edge-reach slide, removes the axis's leap bit at the tip, and sets the turning bit. It does not mutate the other axis.
- The renderer exposes `data-turning="true"` and an accessible label/hint so turning is distinguishable from a straight ray without relying on colour.
- The adapter groups automatic first vectors by reach and emits a `turning_slide` with `turn: "any"`. It removes legacy ordered pairs from the drawable projection into `preservedPatterns`, and the writer puts them back unchanged before any edited grid patterns. A legacy-only projection is marked read-only rather than represented as a fake blank grid.
- The shared grid takes a `singleAxis` mode for grants and a `move/capture` mode for pieces; the underlying `PieceGrid` and event helpers remain identical.
- The outermost-cell gesture is the only place that turns on automatic bending. Clearing the ray clears its turning bit. A normal inner-cell double-click remains a capped straight slide.

### Data Flow

1. A click or double-click arrives at `MovementPatternGrid` with `(axis, df, dr)`.
2. `cycleAt` handles ordinary one-click state transitions. For a radius-three double-click, `turnAt` wins as the final state and marks the ray automatic.
3. `RecordForm` or `SentenceSlot` passes the resulting `PieceGrid` to the shared writer.
4. The writer emits `slide`/`step` patterns and explicit automatic `turning_slide` patterns; it omits `attack` when the two piece axes are equal, preserving current fallback semantics.
5. The existing `loadContentSet`/`importContent` path validates the v15 shape and restamps older documents. `reachFrom` enumerates final endpoints, and cost/AI/complexity use the same bound calculation.

### API Changes

- `MovePattern` gains `turn: "any"` on the automatic `turning_slide` form.
- `SCHEMA_VERSION` becomes `15`; v14 documents remain accepted and are restamped on export.
- `MovementEditorState` no longer has a separate `turning.move/capture` row collection; the turning flags live inside `PieceGrid`, while non-drawable legacy entries live in `preservedPatterns`.
- No action or board-state API changes: final moves remain `{ kind: "move", from, to }`.

## 📝 Implementation Plan

### Phase 1 — Contract and grid model

**Status:** completed

- **depends_on:** `[]`
- **parallel_group:** `serial-contract`
- **merge_hazards:** `src/content/schema.ts`, `src/ui/PieceMoves.tsx`, and all movement fixtures define the same pattern shape; update them serially.
- **Scope in:** `src/content/schema.ts`, `src/content/movement.ts`, `src/ui/PieceMoves.tsx`, `tests/content/turning-slide-schema.test.ts`, `tests/content/movement-bound.test.ts`, `tests/ui/movement-cell-cycle.test.ts`, and new adapter tests. `src/editor/io.ts` is exercised but not modified.
- **Scope out:** engine enumeration and rendered React components beyond model helpers.
- **Work:** add the v15 automatic discriminator, preserve legacy pair parsing, add `PieceGrid.turning`, implement `turnAt`/`isTurningAt`, add `preservedPatterns` with writer precedence, update read/write/canonicalization, and make old row state disappear from the adapter.
- **Exit criterion:** `npx --no-install vitest run tests/content/turning-slide-schema.test.ts tests/content/movement-bound.test.ts tests/ui/movement-cell-cycle.test.ts tests/ui/movement-grid-model.test.ts && npx --no-install tsc --noEmit` passes.
- **Risk:** high
- **Rollback point:** base commit `9599222` (the pre-task master tip); the Phase 1 file set is independently revertable before the engine or UI phases begin.

### Phase 2 — Engine and consumer semantics

**Status:** completed

- **depends_on:** `[1]`
- **parallel_group:** `serial-engine`
- **merge_hazards:** `src/engine/engine.ts` and `src/content/movement.ts` are shared hot-path contracts for cost and AI; keep these changes serial.
- **Scope in:** `src/engine/engine.ts`, `src/balance/cost.ts`, `src/engine/ai/evaluate.ts`, `src/engine/ai/complexity.ts`, `tests/engine/turning-slide.test.ts`, `tests/balance/turning-reach-accounting.test.ts`, and automatic-turn fixtures.
- **Scope out:** editor rendering and player-facing copy.
- **Work:** add automatic second-direction enumeration, first-leg and second-leg blocker tests, capture tests, forward-orientation tests, endpoint-bound multipliers, and legacy-pair regression tests.
- **Exit criterion:** `npx --no-install vitest run tests/engine/turning-slide.test.ts tests/balance/turning-reach-accounting.test.ts tests/content/turning-slide-schema.test.ts` passes with no type errors.
- **Risk:** high
- **Rollback point:** Phase 1.

### Phase 3 — Shared grid UI and authoring surfaces

**Status:** completed

- **depends_on:** `[1]`
- **parallel_group:** `serial-ui`
- **merge_hazards:** `src/ui/PieceMoves.tsx`, `src/ui/RecordForm.tsx`, and `src/ui/SentenceSlot.tsx` share test ids and draft serialization; integrate as one UI change.
- **Scope in:** new `src/ui/MovementPatternGrid.tsx`, `src/ui/RecordForm.tsx`, `src/ui/SentenceSlot.tsx`, `src/ui/TurningSlideEditor.tsx`, `src/ui/styles.css`, `tests/ui/turning-slide-editor.test.tsx`, `tests/ui/movement-capture-mode.test.tsx`, `tests/ui/movement-grid.test.tsx`, and grant editor tests.
- **Scope out:** engine and balance consumers except for adapter-facing type repairs.
- **Work:** render the existing move/capture map through the shared component, route outer-radius double-click to `turnAt`, show the turning marker, remove the standalone row editor, preserve normal single-click behavior, keep move/capture independent, carry preserved legacy patterns through unrelated saves, and make grant movement use the same gesture.
- **Exit criterion:** `npx --no-install vitest run tests/ui/turning-slide-editor.test.tsx tests/ui/movement-capture-mode.test.tsx tests/ui/movement-grid.test.tsx tests/ui/grant-movement.test.tsx` passes; the deleted editor has no remaining import.
- **Risk:** high
- **Rollback point:** Phase 1.

### Phase 4 — Detail view, vocabulary, copy, and compatibility coverage

**Status:** completed

- **depends_on:** `[2, 3]`
- **parallel_group:** `serial-polish`
- **merge_hazards:** `src/ui/PieceDetail.tsx`, `src/editor/vocabulary.ts`, and `src/i18n/ko.ts` must agree on the new visible meaning; update together.
- **Scope in:** `src/ui/PieceDetail.tsx`, `src/editor/vocabulary.ts`, `src/editor/controls.ts`, `src/i18n/ko.ts`, `src/content/sets/bundled.ts`, `tests/ui/piece-detail.test.tsx`, `tests/editor/schema-v13-roundtrip.test.ts`, new `tests/editor/schema-v14-turning-slide.test.ts`, `tests/editor/vocabulary-coverage.test.ts`, and relevant e2e anchors.
- **Scope out:** unrelated card, board, or placement editors.
- **Work:** replace the separate turning list with automatic-ray wording, remove the obsolete vocabulary choice if the shared grid owns it, update schema-version fixtures and bundled stamps, add explicit v14 → v15 import/export coverage while retaining the v13 regression, and assert legacy documents remain playable/read-only.
- **Exit criterion:** `npx --no-install vitest run tests/ui/piece-detail.test.tsx tests/editor/schema-v13-roundtrip.test.ts tests/editor/vocabulary-coverage.test.ts tests/content/bundled.test.ts` passes.
- **Risk:** medium
- **Rollback point:** Phase 3.

### Phase 5 — Full verification and browser acceptance

**Status:** completed

- **depends_on:** `[2, 3, 4]`
- **parallel_group:** `serial-verify`
- **merge_hazards:** generated PLAN/REVIEW artifacts and the full browser suite must observe the final combined UI; no parallel edits.
- **Scope in:** targeted movement e2e specs, `e2e/maker-movement-and-placement.spec.ts`, `e2e/maker-anchors.spec.ts`, all changed tests, and verification configuration only if a command requires it.
- **Scope out:** production behavior changes after verification begins unless a failing gate identifies one.
- **Work:** add browser coverage for quick outer-cell double-click in movement and capture modes, assert the turning marker survives save/reopen, assert grant movement uses the same gesture, run the targeted-test-selection recipe for the changed-file union, run typecheck/build/unit/E2E/PWA/build-config checks, and record the verification cache.
- **Exit criterion:** `npm run verify` passes, targeted movement e2e passes on all configured browsers, `uv run --with /home/noel/.claude/plugins/cache/harness-maker/harness-maker/0.52.6 hm test_runners plan --root .` has been honored for the changed-file union, and `! rg -n "TurningSlideEditor|turning-slide-row" src tests` succeeds.
- **Risk:** high
- **Rollback point:** Phase 4.

## 🚧 Contract Boundaries

### Do not change

- `src/engine/types.ts` — keep final move actions and board coordinates unchanged.
- `src/editor/io.ts` — retain fail-closed import behavior and the single normalization path.
- Advisory: preserve `RecordForm.tsx` move/capture fallback semantics when `attack` is omitted, even though its rendering code is intentionally changed.
- Advisory: do not make turning a card/effect-layer feature or add a second persisted flag that can disagree with `turning_slide.turn`.

## 🧪 Testing Strategy

### Unit

- Validate automatic and legacy `turning_slide` shapes, v14 → v15 import/export, invalid same/opposite compass vectors, and canonical writer output.
- Exercise `turnAt`, clearing, per-axis isolation, radius checks, `data-turning` derivation, and legacy refusal in the grid model.
- Exercise direct endpoints, every legal bend class, total-distance splits, friendly/enemy blockers on both legs, board edges, forward mirroring, deduplication, cost, value, and complexity.

### Component/integration

- Render the real `RecordForm`, double-click the outermost movement cell, assert automatic JSON output, switch to capture, and prove the movement axis is unchanged.
- Save and reopen a piece with automatic turning; assert the marker and `forward` flag survive.
- Open the grant movement sheet and perform the same gesture; assert the action pattern uses `turn: "any"`.
- Mount a legacy ordered pair and assert the editor preserves it instead of rewriting it to automatic semantics.
- Render a capture-only automatic pattern in `PieceDetail` and assert it is described rather than omitted.

### Browser/manual

- Run the movement maker on mobile portrait and desktop: one click remains a hop, two slow clicks remain a straight ray, and a quick double-click on the outermost cell visibly marks automatic bending.
- Verify keyboard focus/`aria-pressed` remains usable for the grid and the hint explains the gesture without colour-only meaning.
- Run the full `npm run verify` gate and inspect the final diff for any remaining `TurningSlideEditor` import or stale turning-row vocabulary.

## ⚠️ Risks & Mitigation

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---:|---:|---|
| R1 | Automatic enumeration multiplies endpoints and slows authored-content search | Medium | High | Keep one-bend/total-distance bounds, use the existing final-target set, and update cost/complexity from the same upper-bound function. |
| R2 | Browser double-click leaves the grid in a transient straight state before the final handler | Medium | Medium | `onDoubleClick` writes a canonical automatic state independent of the two preceding click results; component tests assert the final draft only. |
| R3 | A move-axis gesture changes capture or fallback semantics | Medium | High | Store turning per axis, test both modes through `RecordForm`, and keep `attack` omission logic in the existing writer. |
| R4 | Legacy ordered pairs are widened or lost during save | Low | High | Keep the pair schema/engine branch, make the adapter return its preservation path, and pin import/edit/save byte stability. |
| R5 | The reusable grid recreates the column-fieldset height regression | Medium | Medium | Keep `flex-wrap: nowrap` on column containers and retain both selector-list unit coverage and geometry E2E coverage. |
| R6 | Removing the separate editor strands a grant or detail call site | Medium | Medium | Search for all `TurningSlideEditor` imports as Phase 3 exit and cover piece, grant, and detail surfaces in Phase 4/5. |

## ✅ Success Criteria

- [x] The piece maker has one movement/capture fieldset; no separate bend-row editor is rendered or imported.
- [x] A quick double-click on a radius-three cell in movement mode writes an automatic `turning_slide` and does not alter capture state.
- [x] The same gesture in capture mode writes only the attack-side automatic pattern; omitted `attack` fallback remains correct.
- [x] The automatic pattern turns exactly once into any non-straight, non-U-turn compass direction, with total distance and blockers enforced.
- [x] A normal inner-cell interaction still authors a straight capped slide, and ordinary straight pieces keep their behavior.
- [x] Legacy ordered-pair `turning_slide` content remains loadable, playable, and unexpanded by an untouched or unrelated editor save through the explicit preserved-pattern bucket.
- [x] Grant movement uses the same grid gesture and persisted contract.
- [x] Player detail describes movement-side and capture-only automatic turns.
- [x] Schema, engine, balance, AI, component, browser, typecheck, build, and full verification tests pass.

## 🚦 Execution Receipt

- Phase 1–4 focused checks passed during implementation; the final full Vitest run passed **171 test files / 1,813 tests**.
- Current post-fix focused checks passed **5 files / 67 tests**; `npx --no-install tsc --noEmit` passed.
- Final `npm run verify` passed: typecheck/build, Vitest **171/1,813**, browser E2E **436 passed / 17 expected skipped**, PWA E2E **6/6**, and build-config tests **4 files / 21 tests**.
- Targeted-test-selection was run for the complete changed-file union. The project runner classified the source paths as `source-without-hints`, so the selector correctly required `mode: "full"` with no individual node ids; the full suite above was then executed.
- Review run `6801565919ca` exercised the four mandatory Side lenses. Round 1 found and fixed the omitted-`attack` legacy fallback issue; the P2 adapter-duplication note remains for manual follow-up. Round 2 re-review found no remaining P0/P1 issues. Codex second opinion was invoked once; its grant-slide finding was rejected by PIDA after the shared `writePatternGrid` fix and regression test.
- Browser coverage now waits for decoded raster inputs before measuring them, and the movement E2E asserts the outer-cell `dblclick` contract across the configured browser projects. The rule icon also carries an isolated outline filter so the existing 3.3:1 rendered-contrast gate remains meaningful.
- Security scan high matches were reviewed as benign quoted detection-pattern documentation in generated harness guidance and recorded with `accepted-risk-with-rationale`; all 8 latest high records are resolved, and no high finding involved secrets, permissions, hooks, or dependencies.

## 🔍 Plan Validation

### Pass 1 — `MAJOR_REVISION`

The plan-validator identified five issues. All five follow-up rounds selected **A — revise the plan**:

| Follow-up | Resolution |
|---|---|
| Legacy pair preservation | Added `MovementEditorState.preservedPatterns`, writer precedence, legacy-only read-only behavior, and save tests. |
| Contract boundary contradiction | Marked `RecordForm.tsx` as intentionally mutable with a fallback invariant; made `src/editor/io.ts` a no-production-change compatibility boundary. |
| Phase 1 rollback | Set the concrete rollback point to base commit `9599222`. |
| Version coverage | Added explicit v14 → v15 coverage while retaining the existing v13 regression. |
| Phase 5 completeness | Replaced the subjective changed-path condition with the targeted-test-selection recipe, full verification, and a stale-editor search command. |

Cross-model second opinion: `codex` status `failed`; the invoker returned no JSON result after the allowed wait, so no Codex findings were injected. The plan-validator pass remains the authoritative Claude-side review for this plan. A terminal whole-plan validator pass is required after this revision.

### Pass 2 — `MAJOR_REVISION_TERMINAL`

The terminal whole-plan validator retained four accepted-risk findings. Per the active autopilot instruction, execution proceeds with these risks recorded rather than reopening the interview:

| Severity | Finding | Accepted-risk handling |
|---|---|---|
| P0 | Automatic patterns with multiple first vectors or non-radius-three caps are not fully closed under the boolean grid projection. | Execute must constrain the writer to the grid-representable one-vector edge form or place every other automatic form into the same opaque preservation bucket before enabling edits. Add import/edit/save tests before UI completion. |
| P1 | Targeted-test-selection has no machine receipt named in the plan. | Execute will run the selector and preserve its JSON output in the stage notes; full `npm run verify` remains mandatory. |
| P1 | No consolidated global Non-Goals section exists. | Execute is constrained by the ADRs and phase scope-outs: one bend only, no new action shape, no unrelated editors. |
| P2 | Native double-click timing is not numerically specified. | Native browser `dblclick` dispatch is the contract; browser tests assert the final state and manual checks cover supported projects. |

`plan_rounds outcome` returned `progress` with 5 resolved and 4 still pending critiques. This is the terminal pass; no third validator pass is permitted. `validator_outcome: MAJOR_REVISION_TERMINAL` is intentional and is a known-risk release condition for `hm-execute`.
