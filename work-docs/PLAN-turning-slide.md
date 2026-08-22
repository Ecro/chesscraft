---
type: plan
task_slug: turning-slide
status: complete
created: 2026-08-22
tags: [chess-craft, plan, typescript, movement, engine, editor]
interview_rounds: 1
adrs: 6
validator_outcome: NEEDS_REVISION_RESOLVED
summary: "Add an authorable, bounded one-bend sliding movement while preserving the existing move lifecycle"
---

# PLAN — One-bend sliding movement

## 🎯 Executive Summary

Add a new opt-in `turning_slide` movement pattern. It slides along one compass direction,
turns once at an empty square, and continues along a second compass direction until the
declared total path distance is consumed or the board/occupancy stops it. The existing
`slide`, `step`, and `jump` patterns keep their current semantics.

The authoring contract is deliberately bounded and enumerable: one pattern contains exactly
two ordered compass vectors, the vectors cannot be equal or opposites, every leg has a positive
length, and every positive split of the total distance is considered. A path may therefore stop
on the first leg or bend and stop on the second leg, but it never makes a second bend, reverses,
or teleports through an occupied square. The engine still emits the existing `{ kind: 'move',
from, to }` action; only the final square participates in capture and transition resolution.

The feature is authorable in both piece movement/attack controls and `grant_movement`. Both
surfaces use the same pattern adapter and canonical serializer. The schema moves from v13 to v14,
while the loader keeps v13 documents readable and re-stamps them to v14 on export.

The work is split into four executable phases: the schema/geometry/engine contract, the shared
editor and vocabulary, accounting consumers, and compatibility/regression verification. No
bundled piece is changed to use the new pattern in this task; the new vocabulary is nevertheless
exercised through a real authoring round-trip and an engine fixture so it cannot be declared but
inert.

## 📚 Prior Work

- **[[RESEARCH-unified-movement-and-placement-ux]]** — `PieceGrid`, `readGrid`, and `writeGrid`
  are the established single-source-of-truth movement control. The plan extends that model with
  a separate ordered-turn row rather than making a second grid serializer.
- **[[RESEARCH-variant-chess-6x6-cards]]** — movement reach is content-derived and must remain
  visible to cost and AI consumers; a new movement kind cannot be engine-only.
- **`[fail:design] shared-vocabulary-unshared-code-path`** — repeated failures establish that
  piece movement and `grant_movement` must use the same control/adapter, not two implementations
  that happen to emit the same JSON.
- **`[fail:design] declared-but-inert-vocabulary`** — every schema/control entry needs an
  end-to-end test. The plan therefore covers registry, editor save/reopen, engine generation,
  and accounting.
- **`[fail:test] all-positive-fixture-hides-overcounting`** — the capture oracle includes
  blockers, friendly stops, intermediate occupancy, and final-enemy cases rather than only open
  boards.
- **[[PLAN-unified-movement-and-placement-ux]]** — canonical `writeGrid` output and the existing
  refusal boundary for patterns the compact editor cannot represent are preserved; turning rows
  are added as a native representation instead of flattened into straight rays.

## 🎙️ Interview Transcript

The user requested that a slider continue after changing direction and selected the recommended
bounded option when asked to choose the shape of the turn.

| # | Topic | Category | Question | Options | Choice | Note | → ADR |
|---|---|---|---|---|---|---|---|
| 1 | Turn cardinality | Behaviour | How many direction changes should one authorable slide make? | A. one bend / B. unlimited bends / C. explicit hand-authored path | **A — one bend** | Keeps the pattern finite, previewable, and compatible with a single movement action while delivering the requested direction change. | ADR-001 |

No unresolved question remains. “One bend” means exactly one possible change per pattern, not that
every generated destination must bend: direct first-leg stops remain legal and bent paths require
two positive legs.

## 📐 Architecture Decision Records

### ADR-001: Add an opt-in `turning_slide` with exactly one bend

**Status:** Accepted (2026-08-22, user-selected recommendation)

**Context:** Existing `slide` patterns enumerate one ray per vector from the origin. The requested
behaviour needs a direction change without making an unbounded path language, changing old records,
or making the editor guess an arbitrary sequence of turns.

**Decision:** Add `kind: 'turning_slide'` with `vectors: [first, second]`, an optional positive
`maxDistance` whose authored minimum is 2, and the existing optional `forward` flag. `first` and
`second` must be compass unit vectors. They must differ and must not be opposites, so a turn is a
real change rather than a straight continuation or a U-turn.

For a board of width `w` and height `h`, define `B = max(2, w + h - 2)`. Define
`D = min(maxDistance ?? B, B)`. The engine enumerates:

1. every direct first-leg endpoint at distance `a` for `1 <= a <= D`;
2. every bent endpoint with `a >= 1`, `b >= 1`, and `a + b <= D`, where `a` is the first leg
   and `b` is the second leg.

The split enumeration is exhaustive and deterministic: for each `a` from `1` through `D - 1`,
enumerate `b` from `1` through `D - a`. A `maxDistance` of 2 therefore permits one `1+1` bend;
there is no zero-length leg and an omitted cap uses the board bound. The first leg may stop without
bending, which keeps the origin-to-first-leg destinations useful and makes the pattern strictly
more expressive than a turn-only variant.

**Consequences:**

- ✅ The new rule is finite, testable, and renderable as ordered direction rows.
- ✅ Existing patterns and serialized actions retain their behaviour.
- ⚠️ A turning pattern has a triangular candidate count, so all accounting consumers must use the
  same upper-bound formula and editor controls must expose the cap.
- ⚠️ Direction order matters: `[north, east]` is different from `[east, north]`.

**Rejected alternatives:**

- Unlimited bends — rejected because it makes authored cost, preview, blocker semantics, and
  canonical serialization open-ended.
- A free-form list of arbitrary path squares — rejected because it duplicates board placement
  data and cannot share the existing vector-based movement grammar.
- Reinterpreting two ordinary slide vectors as a turn — rejected because it would silently change
  existing records and make straight movement ambiguous.

### ADR-002: Keep one final-square move action and existing occupancy semantics

**Status:** Accepted (2026-08-22)

**Context:** `legalActions`, `apply`, `applyTrusted`, capture handling, and transition effects all
  consume `{ kind: 'move', from, to }`. Adding a path payload would spread intermediate-square
  semantics through lifecycle code for no user-visible need.

**Decision:** `turning_slide` feeds the same action pipeline as `slide`. Every traversed square
  before the candidate destination must be empty. A friendly occupant stops that path without
  emitting the occupied destination. An enemy occupant can be emitted as a capture only when it is
  the current final candidate; it blocks all continuation beyond it. A first-leg enemy is therefore
  a legal direct capture (when the caller allows capture), but it cannot be crossed to reach the
  second leg. The final destination alone is used by `apply` and transition/capture effects.

  For a bent candidate, the first leg must be fully empty, the bend square is empty by that rule,
  and the second leg applies the same final-square rule. Move-only generation and capture-enabled
  generation keep their existing independent `allowCapture` behaviour; no new action kind or path
  history is introduced.

**Consequences:**

- ✅ The requested “turn while sliding” works without changing action consumers.
- ✅ Blockers cannot be bypassed by turning, and final-enemy capture remains observable through the
  existing capture action.
- ⚠️ The UI preview must explain that the two rows are ordered and that the cap is total path
  distance, not distance per leg.

### ADR-003: Share the movement adapter/control between pieces and `grant_movement`

**Status:** Accepted (2026-08-22)

**Context:** The piece editor already has `PieceGrid`, `readGrid`, and `writeGrid`, while
`SentenceSlot` currently owns a smaller hard-coded `slide`/`step` picker and local vector grid.
Adding only a new button to one surface would create the exact shared-vocabulary drift recorded in
memory.

**Decision:** Extract reusable movement-pattern draft conversion and the turning-row editor from
`PieceMoves.tsx` into a shared module/component. The piece form and `SentenceSlot` both pass the
same movement/attack or grant pattern draft through that adapter and serialize with the same
canonical ordering. `SentenceSlot` keeps its action mutation wrapper, but it no longer defines its
own movement-kind list, vector toggler, or turning serializer. Multiple turning rows are supported
on each axis; each row has its own ordered pair and cap. Move and capture axes remain independent.

The vocabulary/control registry is the source for kind selection: `MOVEMENT_KINDS` includes
`turning_slide`, `controls.ts` registers its maker/default, and `CardRecipe.tsx` continues to derive
the available vocabulary from that registry. The shared editor is the parameter control for both
the piece form and `grant_movement`, so a saved grant can be reopened by the same reader as a piece.

**Consequences:**

- ✅ A new movement kind has one schema representation, one draft adapter, one canonical writer,
  and two host surfaces.
- ✅ Multiple rows and move/capture independence are explicit rather than accidental.
- ⚠️ Refactoring `SentenceSlot` is part of the feature, not optional cleanup; Phase 2 cannot exit
  with a second local serializer.

### ADR-004: Centralize turning geometry and reach accounting in a pure helper

**Status:** Accepted (2026-08-22)

**Context:** `cost.ts`, AI evaluation, and search complexity currently use related but not identical
straight-slide bounds. A turning pattern has a triangular number of endpoints, so independently
guessing the formula would make balancing and search admission diverge.

**Decision:** Add a dependency-light geometry helper under `src/content/movement.ts` that owns:

- compass-vector and ordered-turn-pair validation;
- `boardTurnDistance(width, height) = max(2, width + height - 2)`;
- `boardTurnDistanceFromMax(boardMax) = max(2, 2 * boardMax - 2)` for declaration-only consumers;
- the capped distance `D` used by the engine;
- `turningEndpointUpperBound(D) = D + D * (D - 1) / 2`, representing direct first-leg endpoints
  plus all positive two-leg splits;
- the boardMax form used by declaration-only consumers: `B = boardTurnDistanceFromMax(boardMax)`.

The engine uses the dimension-aware form; `patternReach`, `pieceValue`, and
`reachOfPatterns` use the same triangular formula with their existing declaration-only board
input. The helper is pure and does not import engine or UI modules. Existing straight-slide
accounting stays unchanged except for shared helper use where appropriate; new turning branches
must be identical across all three consumers. Tests assert the helper table and each consumer's
monotonicity against it.

**Consequences:**

- ✅ A cap increase cannot make cost decrease or AI/complexity undercount relative to the same
  declared geometry.
- ✅ The formula is reviewable in one place and can be adjusted with one balancing decision.
- ⚠️ Declaration-only accounting is an upper bound for rectangular boards, not an exact occupancy
  count; it intentionally overestimates blocked or off-board paths.

### ADR-005: Bump schema v13 to v14 with backward-compatible normalization

**Status:** Accepted (2026-08-22)

**Context:** `MovePattern.kind` is schema vocabulary. Shipping `turning_slide` without a version
bump would make old saved blobs and bundled version assertions ambiguous.

**Decision:** Set `SCHEMA_VERSION` and the bundled schema stamp to 14. v13 documents remain valid
because their existing `slide`/`step`/`jump` patterns still parse; load accepts them, and export
re-stamps the document at v14 without rewriting unrelated content. v14 turning patterns round-trip
without losing vector order, cap, or `forward`. Future-schema rejection remains unchanged.

**Consequences:**

- ✅ Existing saved content is readable and receives the current stamp on export.
- ✅ New vocabulary is rejected by older readers through the existing future-version guard rather
  than being silently flattened.
- ⚠️ All exact v13 assertions and version fixtures must be audited, including bundled content and
  the editor round-trip suite.

### ADR-006: Do not change bundled gameplay content in this feature

**Status:** Accepted (2026-08-22)

**Context:** The request is a new movement capability. Re-authoring a shipped piece at the same time
would mix a rules feature with a balance/content change and make regressions harder to localize.

**Decision:** Keep bundled piece declarations semantically unchanged and update only the schema
version stamp required by ADR-005. Use dedicated test fixtures plus editor-created content to prove
that `turning_slide` is live.

**Consequences:**

- ✅ Existing presets preserve their move sets and balance.
- ✅ The feature can be reviewed independently from balance tuning.
- ⚠️ A later content task may opt a specific piece into the pattern and should reuse the same
  accounting tests and editor contract.

## 🏗️ Technical Design

### Current State

Existing `slide` patterns enumerate one ray per origin vector, and both piece and grant editors
have movement authoring surfaces. The engine, editor, and accounting code do not yet recognize a
turning pattern.

### Affected Components

The implementation spans the v14 content schema and pure movement geometry, the engine's central
reach enumerator, the shared piece/grant editor, vocabulary controls and locale, three reach
accounting consumers, and compatibility fixtures. The exact phase ownership and file boundaries
are listed below in the Implementation Plan.

### Dependencies

Phase 1 depends only on the current v13 schema and existing move lifecycle. Phase 2 depends on the
v14 pattern contract and shared adapter shape from Phase 1. Phase 3 depends on the helper exported
by Phase 1 and the authorable pattern from Phase 2. Phase 4 depends on all preceding green exits.
No external package or database migration is required.

### Architecture

The data flow remains content schema → engine movement enumeration → existing move action →
existing apply/capture/transition lifecycle. The editor flow is vocabulary registry → shared
movement adapter/turning-row control → piece or grant host → canonical v14 JSON. Accounting reads
the same JSON through the pure movement helper and never calls the engine.

### Design Decisions

ADR-001 fixes the path grammar and positive split enumeration; ADR-002 preserves the final-square
action lifecycle; ADR-003 makes the editor adapter shared; ADR-004 prevents accounting drift;
ADR-005 defines compatibility; and ADR-006 keeps bundled gameplay stable. These decisions are
implemented as boundaries below rather than as host-specific exceptions.

### Data Flow

An authored draft enters through the registry-selected shared control, is normalized into ordered
`MovePattern` rows, and is stamped as v14 by editor export. The loader parses that document, the
engine orients the pair for the moving side and enumerates direct/one-bend destinations, then
emits the existing move action. The apply pipeline sees only the final destination. Cost, AI, and
complexity independently read the same pattern and call the pure upper-bound helper.

### API Changes

The content API gains the `turning_slide` `MovePattern` variant and v14 schema stamp. The editor
API gains a reusable turning-row draft/control adapter and a registry control. The engine's public
action type does not change. No network, persistence, or external package API changes are needed.

### Schema and geometry

`src/content/schema.ts` adds a strict `turning_slide` branch with exactly two vectors and a
`maxDistance` integer minimum of 2. The vector pair refinement accepts only the eight unit compass
vectors and rejects equal/opposite pairs. Existing `slide`, `step`, and `jump` branches retain
their accepted fields and inferred types. `forward` is applied to both vectors by the existing
orientation helper before enumeration.

`src/content/movement.ts` is the shared pure boundary. It exposes the path bound and endpoint upper
bound used by engine and declaration-only consumers. No helper assumes an 8x8 board; it receives
dimensions or the declared `boardMax` explicitly.

### Engine enumeration

`src/engine/engine.ts` keeps `orient` and `reachFrom` as the central movement path. For a
`turning_slide` pattern it walks the first vector from the origin, stopping at the first occupied
or off-board square. Each empty first-leg square emits a direct move candidate when it is the
current destination. At each empty first-leg square, it walks the second vector for the remaining
positive distances, emitting each empty destination and an enemy destination when capture is
allowed, then stopping at the first occupant. Candidate actions are deduplicated by destination as
before, so another pattern or split cannot duplicate a move.

The implementation must use the helper's `D`, enumerate every `a/b` split in the ADR-001 order,
and never recurse into another turn. Existing `slide` and `step` branches remain byte-for-byte
semantic controls. `movesFor`, `legalActions`, `apply`, and transition code receive no new action
shape.

### Shared authoring model

The existing `PieceGrid` remains the representation for straight rays and leaps. Add a native
turning-row representation to the shared movement editor: each row stores `first: Dir8`,
`second: Dir8`, `reach: 2 | 3 | edge`, and its move/capture axis. The row editor prevents
equal/opposite pairs, offers total-distance `2`, `3`, and `edge` choices, and exposes add/remove
row controls.

The shared adapter reads/writes:

- straight slides and steps through existing `readGrid`/`writeGrid` canonical logic;
- turning rows as `kind: 'turning_slide'` with ordered vectors and `maxDistance` omitted for
  `edge`, or set to the selected positive cap;
- `forward` once per axis, rejecting a draft that cannot represent mixed forward values;
- multiple rows without merging distinct ordered pairs or move/capture axes.

On write, patterns have stable order: axis order (`movement`, then `attack`), straight buckets in
the existing canonical order, then turning rows in direction-pair order. On read, a record that
contains a turning row outside the compact editor's cap or invalid pair returns the existing
`null` refusal and remains available in the detailed form. No turning pattern is flattened into a
straight ray.

`src/editor/controls.ts` registers `movement:turning_slide` and a valid default pair. The
`MOVEMENT_KINDS` registry and Korean labels/hints are updated. `src/ui/CardRecipe.tsx` is included
in the integration scope because it derives vocabulary options from the registry. `SentenceSlot`
uses the shared adapter for the `grant_movement` action, including multiple rows and save/reopen;
the piece form uses the same adapter for movement and attack.

### Accounting

For a turning pattern with capped distance `D`, the declaration-level candidate upper bound is
`D + triangular(D - 1)`, or `D + D(D - 1)/2`. The first term counts direct first-leg endpoints;
the second counts one endpoint for each positive split `(a, b)` with `a + b <= D`. The bound is
multiplied by the number of declared turning rows/patterns by each caller in the same way it
multiplies ordinary vector counts.

`patternReach` uses `D` from `maxDistance ?? max(2, 2 * boardMax - 2)`, capped at that board bound.
AI and complexity use the same helper and boardMax form. Existing non-turning calculations remain
the control values for regression tests. A table covers `D = 2, 3, 4`, cap monotonicity, and the
uncapped board-bound case.

## 📝 Implementation Plan

### Phase 1 — Schema, geometry, and engine contract

**depends_on:** none  
**parallel_group:** A  
**merge_hazards:** `src/content/schema.ts`, `src/content/movement.ts`, and `src/engine/engine.ts`
are shared by every later phase; do not begin editor or accounting work against an unverified
pattern shape.

**Scope (files in):**

- Add `turning_slide`, vector-pair validation, v14 schema stamp, and the pure movement geometry
  helper.
- Extend `reachFrom` with direct first-leg and exhaustive positive-split one-bend enumeration,
  preserving orientation, blocker, capture, and destination deduplication semantics.
- Add focused engine tests for direct stops, `1+1` and larger splits, ordered pairs, forward black
  orientation, board edges, friendly/intermediate blockers, first-leg enemy stops, and final enemy
  captures.
- Extend `tests/engine/capture-oracle.test.ts` with an independently written two-leg oracle; it
  must not import production enumeration or endpoint-bound helpers.
- Add schema/helper tests for invalid pairs, distance-1 rejection, exact split enumeration, and
  the dimension/boardMax bound table.

**Scope (files out):** editor controls, accounting consumers, bundled gameplay declarations, and
UI copy.

**Exit criterion:**

`npx --no-install vitest run tests/engine/turning-slide.test.ts tests/engine/capture-oracle.test.ts
tests/content/movement-bound.test.ts tests/content/turning-slide-schema.test.ts
tests/content/validation.test.ts`
is green. The engine suite demonstrates both direct and bent actions; the oracle agrees on open
and blocked positions, including an intermediate blocker and a final enemy; schema tests prove a
v13 straight-only document still parses and a v14 turning document preserves ordered vectors.

**Risk:** high — this is the new semantic contract and a wrong split loop can overcount or bypass
blockers.

**Rollback point:** Phase 0 baseline (clean `turning-slide` worktree before Phase 1).

**Reachable rollback procedure:** Stop at the first failing Phase 1 command, record the failing
test and diff, and revert only the Phase 1 paths listed above to the Phase 0 patch boundary. Do not
touch editor/accounting paths or advance the phase. Re-run the Phase 1 exit command against the
boundary; if it is not green, the phase remains open.

### Phase 2 — Shared editor, vocabulary, and grant authoring

**depends_on:** Phase 1 green  
**parallel_group:** B  
**merge_hazards:** `src/ui/PieceMoves.tsx`, `src/ui/SentenceSlot.tsx`, `src/editor/controls.ts`,
and `src/editor/vocabulary.ts` are shared authoring paths. The piece and grant surfaces must be
changed together so they cannot acquire divergent serializers.

**Scope (files in):**

- Extract/reuse the shared turning-row draft adapter and editor component from `PieceMoves.tsx`;
  retain canonical straight `readGrid`/`writeGrid` behaviour.
- Add turning rows to both piece movement and attack axes, including multiple rows, ordered pair
  validation, cap selection, forward state, add/remove, and move/capture independence.
- Refactor `SentenceSlot`'s `grant_movement` parameters to use that shared control rather than its
  hard-coded `slide`/`step` list and local vector serializer.
- Register `movement:turning_slide` in `controls.ts`, add it to `MOVEMENT_KINDS`, update
  `CardRecipe.tsx` registry-derived options, and add Korean labels/hints.
- Update `RecordForm.tsx`, `PieceDetail.tsx`, and relevant editor summaries/test ids so turning
  rows can be created, saved, reopened, and inspected without changing ordinary pieces.
- Add unit/component coverage for canonical output, multiple rows, independent move/capture
  axes, invalid-pair refusal, and `grant_movement` save/reopen. Extend vocabulary coverage so the
  registry, control maker, locale key, and action host all have a live row.
- Add/update the existing movement Playwright scenario with a bent-move authoring and reload path.

**Scope (files out):** engine enumeration changes, cost/AI/complexity formula changes, and bundled
piece re-authoring.

**Exit criterion:**

`npx --no-install vitest run tests/ui/turning-slide-editor.test.tsx tests/ui/sentence-slot.test.tsx
tests/ui/piece-detail.test.tsx tests/editor/vocabulary-coverage.test.ts
tests/editor/schema-v13-roundtrip.test.ts` and
`npx --no-install playwright test e2e/maker-movement-and-placement.spec.ts` are green. The
fixtures cover two turning rows, move/capture independence, canonical write/read, piece save and
reopen, and a `grant_movement` save/reopen through `CardRecipe`/`SentenceSlot`; the browser case
creates a bent pattern and sees it after reload.

**Risk:** high — this phase crosses two UI hosts and can regress canonical content serialization.

**Rollback point:** Phase 1 green boundary, before any Phase 2 path is consumed by later work.

**Reachable rollback procedure:** If a Phase 2 test fails after a partial refactor, preserve the
  failing diff and undo only the shared editor, host, registry, locale, and Phase 2 test paths. Run
  the full Phase 1 exit command to re-establish the engine/schema boundary before making another
  editor patch. A partial piece-only or grant-only implementation is not a valid rollback state.

### Phase 3 — Cost, AI evaluation, and search complexity

**depends_on:** Phase 1 green; Phase 2 green for the vocabulary contract  
**parallel_group:** C  
**merge_hazards:** `src/content/movement.ts` is the shared formula boundary; all three consumers
must call the same turning helper and retain their existing straight-slide controls.

**Scope (files in):**

- Add turning branches to `src/balance/cost.ts`, `src/engine/ai/evaluate.ts`, and
  `src/engine/ai/complexity.ts` using the shared boardMax bound and triangular endpoint formula.
- Add unit tests for exact `D=2/3/4` values, cap monotonicity, uncapped board scaling, and parity
  across piece cost, piece value, and complexity reach.
- Add a regression fixture showing ordinary `slide` and existing content costs do not change.

**Scope (files out):** tuning a bundled piece, changing the complexity ceiling, or changing AI
search selection beyond the declaration reach value.

**Exit criterion:**

`npx --no-install vitest run tests/balance/turning-reach-accounting.test.ts
tests/balance/cost.test.ts tests/engine/ai-complexity.test.ts`
is green. The shared helper table is asserted directly, every consumer is monotone as cap rises,
and the same turning declaration yields the expected relative reach in cost, AI, and complexity.

**Risk:** medium — the formula is isolated, but inconsistent board-bound adaptation could affect
loadout admission or move choice.

**Rollback point:** Phase 2 green boundary plus the unchanged Phase 1 helper contract.

**Reachable rollback procedure:** If accounting tests fail, remove only the three consumer branches
  and their tests while retaining the Phase 1 helper and Phase 2 authoring paths. Re-run Phase 1 and
  Phase 2 exit commands; do not alter the helper to make one consumer pass until the failing
  consumer's boardMax conversion is understood.

### Phase 4 — Compatibility, targeted regression, and handoff to review

**depends_on:** Phases 1–3 green  
**parallel_group:** D  
**merge_hazards:** schema fixtures, bundled version assertions, loader/export code, and all
  movement regression tests must agree on v14 while preserving v13 input compatibility.

**Scope (files in):**

- Bump `src/content/sets/bundled.ts` and all exact current-version fixtures from 13 to 14.
- Audit `src/editor/io.ts`/`src/content/load.ts` (as applicable), update v13 round-trip naming and
  add explicit old-document normalization/re-stamp and future-version rejection coverage.
- Update and run `tests/editor/schema-v13-roundtrip.test.ts`, `tests/editor/io.test.ts`,
  `tests/content/bundled.test.ts`, and any exact-version content fixture so the v13 input/v14
  output boundary is exercised rather than only changing a constant.
- Run the targeted test selection for every changed path, including the full movement/editor
  Playwright scenario and the independent capture oracle.
- Run typecheck and the full Vitest suite if the targeted diff or test dependency graph requires
  it; leave review-ready evidence in the PLAN/working tree without committing.

**Scope (files out):** `/hm:wrapup`, commit creation, bundled balance changes, and unrelated
cleanup.

**Exit criterion:**

`npx --no-install tsc --noEmit`, all Phase 1–3 targeted Vitest commands, and
`npx --no-install playwright test e2e/maker-movement-and-placement.spec.ts` are green. A v13
straight-only document loads and exports with schemaVersion 14 and unchanged semantic content; a
v14 turning document round-trips exactly; bundled content remains semantically unchanged; the
final diff has no unrelated files. The stage then advances to `/hm:review`.

**Risk:** medium — version fixture drift can hide as a test-only failure while runtime migration
remains wrong.

**Rollback point:** Phase 3 green boundary.

**Reachable rollback procedure:** If compatibility or typecheck fails, revert only Phase 4 fixture,
loader, and test edits to the Phase 3 boundary, then re-run the Phase 3 targeted command. Keep the
engine/editor/accounting implementation intact while isolating whether the failure is a version
stamp, normalization, or type declaration issue.

## 🚧 Contract Boundaries

### Do not change

- `src/content/schema.ts` — v14 `MovePattern` grammar; `turning_slide` is the only new vocabulary
  and its pair/cap invariants are enforced at the schema boundary.
- `src/content/movement.ts` — pure compass-pair validation, board distance, split enumeration
  bounds, and declaration-level endpoint upper bound shared by engine and accounting.
- `src/engine/engine.ts` — path occupancy and final-square action semantics; no new action kind or
  intermediate transition side effects.
- `src/ui/PieceMoves.tsx` — canonical straight-grid and turning-row adapter; no host-specific
  serializer.
- `src/ui/SentenceSlot.tsx` — grant host only; it delegates pattern editing to the shared adapter.
- `src/editor/controls.ts` and `src/editor/vocabulary.ts` — movement registry and control coverage
  source; every registered `turning_slide` entry must be reachable from a host.
- `src/ui/CardRecipe.tsx` — registry-derived card authoring options; its vocabulary list must
  include the new movement control through the same registry.
- `src/editor/io.ts` and `src/content/load.ts` — v13 read compatibility, v14 export stamp, and
  future-version guard; no silent flattening of turning patterns.
- `src/balance/cost.ts`, `src/engine/ai/evaluate.ts`, `src/engine/ai/complexity.ts` — consumers of
  the shared turning upper bound; straight-slide baselines remain regression controls.
- Advisory: `src/content/sets/bundled.ts` — schema stamp only; no bundled movement declaration is
  changed.

## 🧪 Testing Strategy

### Unit and property-style coverage

- **Schema:** valid ordered compass pairs; equal/opposite/non-compass rejection; cap minimum;
  v13 compatibility; exact v14 round-trip.
- **Engine:** direct first-leg endpoints; every positive `(a,b)` split; `maxDistance` 2/3/4;
  ordered-pair asymmetry; forward black orientation; board edge; friendly first-leg stop;
  intermediate blocker; first-leg enemy direct capture; second-leg final enemy capture; no
  continuation through either enemy; no U-turn.
- **Independent oracle:** duplicate the two-leg enumeration locally in
  `tests/engine/capture-oracle.test.ts`, with its own bound and split loop. Compare generated
  destinations for open and blocked states without importing production movement helpers.
- **Editor:** canonical read/write, multiple rows, move/capture independence, forward state,
  invalid-pair refusal, and shared piece/grant adapter identity through save/reopen.
- **Accounting:** helper table, exact triangular values, monotonicity, board-bound scaling, and
  unchanged straight-slide controls across cost/AI/complexity.

### Integration and browser coverage

- Vocabulary coverage must exercise `controls.ts` → `MOVEMENT_KINDS` → `CardRecipe`/host → shared
  editor → serialized `turning_slide`, not only assert that a label exists.
- The browser scenario creates a bent movement, saves it, reloads the record, and confirms the two
  ordered directions and cap are still present.
- Phase D targeted selection is based on the final changed-file set; if shared schema or editor
  paths expand the dependency graph, the full Vitest suite is run before review.

## ⚠️ Risks & Mitigation

1. **Split overcount or zero-leg turn.** The schema requires two vectors and cap ≥2; the engine and
   oracle both enumerate `a >= 1`, `b >= 1`, `a+b <= D`, with explicit golden tables.
2. **Turning around a blocker.** Every first-leg and second-leg square is checked in order;
   intermediate occupancy tests include friendly and enemy pieces.
3. **Capture/transition regression.** Actions retain the existing shape and a final-enemy test
   runs through the existing capture application path.
4. **Piece/grant serializer drift.** One shared adapter/component is required, and both host save
   and reopen tests use the same canonical fixture.
5. **Registry entry that cannot be authored.** Controls, vocabulary, locale, host, and coverage
   tests are all in Phase 2; no registry-only change can satisfy the exit criterion.
6. **Accounting drift.** One helper owns the triangular upper bound; direct consumer parity and
   monotonicity tests cover all three call sites.
7. **Schema migration loss.** v13 normalization/re-stamp and v14 exact round-trip tests run before
   review; future-version rejection remains a control.
8. **UI ambiguity.** Ordered direction labels and total-distance copy accompany the row control;
   equal/opposite choices are disabled or rejected before serialization.

## ✅ Success Criteria

- `turning_slide` is a valid v14 pattern with exactly two ordered compass vectors, a cap of at
  least 2 when present, and optional forward mirroring.
- One pattern can stop directly on its first ray or make exactly one positive-length turn; all
  legal positive splits within the total cap are generated.
- Intermediate occupied squares cannot be crossed; final enemy squares can be captured through
  the existing move lifecycle; friendly squares and post-enemy continuation are blocked.
- Existing straight movement, action shape, capture handling, and bundled semantics are unchanged.
- Piece movement/attack and `grant_movement` expose the same turning-row editor, support multiple
  rows and independent axes, and round-trip canonical JSON.
- The registry, `CardRecipe`, locale, and host tests prove the new vocabulary is authorable rather
  than inert.
- Cost, AI evaluation, and complexity use the same triangular upper bound and remain monotone as
  the turning cap increases.
- v13 content remains readable and exports at v14; v14 turning content preserves all fields.
- Typecheck, targeted Vitest, movement Playwright, and review preflight are green. No commit is
  created in execute or review; commit remains `/hm:wrapup` scope.

## 🔍 Plan Validation

### Pass 1 — plan-validator

**Verdict:** `MAJOR_REVISION`

The validator identified eight issues: unspecified positive split enumeration and distance-1
behaviour; an unshared `grant_movement` editor; missing control-registry/CardRecipe coverage;
inconsistent accounting bounds; incomplete v14 fixture coverage; under-specified phase exits;
an oracle limited to straight rays; and rollback points that were not reachable from partial phase
states. All eight were revised in this plan:

- ADR-001 and the Technical Design define direct endpoints, every positive `(a,b)` split, blockers,
  and the `maxDistance >= 2` contract.
- ADR-003 and Phase 2 require a shared adapter/component for piece and grant hosts and include
  `controls.ts`, `vocabulary.ts`, `CardRecipe.tsx`, and `SentenceSlot.tsx`.
- ADR-004 defines one helper and one boardMax conversion used by all three accounting consumers.
- ADR-005 and Phase 4 enumerate bundled, loader/export, v13, v14, and future-version coverage.
- Every phase exit names the missing behaviour tests, and every rollback identifies a path boundary
  plus a re-verification command.

### Pass 2 — terminal re-validation

**Verdict:** `NEEDS_REVISION`

The follow-up validator resolved seven of eight first-pass findings. It reported the migration
locator as unresolved because its read observed the pre-patch `src/content/io.ts` wording. The
current PLAN has the corrected `src/editor/io.ts` locator and now names the exact v13/v14 fixture
tests in Phase 4; the remaining issue is therefore closed by the final document self-audit, with
no design risk left to carry into execute. The Codex second opinion remains skipped because the
pre-plan `high_diff classify` result was `is_high: false`; `harness.yaml` has no second-opinion
oracle to invoke for this low-diff plan.

| Validator finding | Pass-2 disposition | Resolution in this PLAN |
|---|---|---|
| One-bend path split contract | resolved | ADR-001 and Phase 1 define positive split enumeration and cap minimum. |
| Shared `grant_movement` editor | resolved | ADR-003 and Phase 2 require one adapter/component for both hosts. |
| Movement vocabulary control registry | resolved | Phase 2 includes controls, vocabulary, CardRecipe, locale, and live coverage. |
| Shared turning reach accounting | resolved | ADR-004 centralizes the triangular bound and boardMax conversion. |
| Schema v14 migration coverage | resolved by self-audit | Phase 4 uses `src/editor/io.ts`, `src/content/load.ts`, and the exact version fixtures. |
| Phase exit coverage | resolved | All exits name engine, editor/grant, accounting, browser, type, and migration checks. |
| Independent two-leg capture oracle | resolved | The oracle has its own split loop and blocker/final-enemy cases. |
| Reachable rollback | resolved | Every phase has a patch boundary, path-limited rollback, and re-run command. |

### Validation bookkeeping

- plan-rounds follow-up: all eight validator critiques scheduled for one revision round.
- validator agent ledger pass 1: `MAJOR_REVISION` emitted for run `turning-slide-plan-20260822-1`.
- validator agent ledger pass 2: `NEEDS_REVISION` emitted as the terminal pass for run
  `turning-slide-plan-20260822-1`.
- plan-rounds outcome: `no-progress` by stable critique identity (the pass-2 agent restated the
  first-pass findings); the stale locator was closed by the current-file self-audit above.
- ledger coherence check: run after both pass rows and before execute.
