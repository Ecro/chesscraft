---
type: plan
task_slug: unified-movement-and-placement-ux
status: complete
created: 2026-08-09
tags: [strange-chess, plan, react, typescript, editor-ux, movement-model, board-placement]
spec: "[[SPEC-unified-movement-and-placement-ux]]"
research_doc: "[[RESEARCH-unified-movement-and-placement-ux]]"
interview_rounds: 2
adrs: 9
validator_outcome: NEEDS_REVISION_RESOLVED
summary: "The cell carries the ray; the room's painter is extracted and the board record consumes it."
---

# PLAN — One movement drawing, one placement painter

## 🎯 Executive Summary

**What.** Collapse the piece maker's seven movement surfaces to one 7×7 grid whose
cell answers with three taps, and replace the board record maker's algebraic
`a6` buttons with the tap-to-place painter the room maker already ships.

**Why.** Both screens present more than one surface for one truth. Movement is a
direction plus a range — a single field drawn three times, then narrated four
more. Placement is one model (`boardDef.placements`) with two editors, one of
which is the only screen in the app that shows a child a coordinate string.

**Key decisions.**

- A cell painted 미끄러짐 **owns its ray**, and the cap is the painted distance —
  which makes reach per-direction and supersedes ADR-007's model freeze →
  [ADR-001](#adr-001-the-cell-carries-the-ray-and-adr-007s-freeze-is-lifted).
- The outermost ring cell means **"and keeps going"**, drawn as an arrow inside
  the existing cell. A slide capped at exactly 3 loses its encoding →
  [ADR-002](#adr-002-the-ring-cell-means-and-keeps-going-and-a-cap-of-3-is-given-up).
- Capture is a **mode**, not a cell state → [ADR-003](#adr-003-capture-is-a-mode-and-the-empty-capture-grid-is-the-omitted-attack).
- **Placement ships first**, as an isolated extraction, because both tracks edit
  `RecordForm.tsx` → [ADR-005](#adr-005-placement-ships-first-and-the-painter-is-extracted-not-copied).
- The coverage gate is **re-derived**, and is not declared green while two writers
  are mounted → [ADR-006](#adr-006-the-gate-is-re-derived-and-not-declared-green-while-two-writers-exist).

**Estimated impact.** ~10 source files, ~6 test files, one new component, one
deleted component. The in-game piece info card (`PieceDetail.tsx`) is dragged in
by the model change and is **not** optional.

## 📚 Prior Work

- `[wiki:architecture] unified-create-ux` — the extend-first-delete-last ordering
  (ADR-003 there) and the standing rule that a record the editor cannot draw is
  **suppressed, never save-blocked**. Both are inherited verbatim.
- `[wiki:architecture] editor-rooms-shell-and-form-guards` — `Edit.tsx:182-193`
  keeps **both** panels mounted with the inactive one `hidden`. This is why the
  shared painter needs a test-id prefix (ADR-005): `RoomDetail` and `RecordForm`
  can be in the DOM at the same time and both use `place-${square}` today.
- `[fail:test] jsdom-visibility-blind-spot` — four regressions shipped through a
  green 71-test jsdom gate because a control moved behind a `hidden` container.
  This is why AC-013 is a phase exit, not a nicety.
- `work-docs/PLAN-capture-rules-and-art-fixes.md:145` — ADR-007 froze the model
  and attempted a rendering-only merge; recorded `NOT MET` at `:494`, with the
  9×9 layout post-mortem at `src/ui/styles.css:2769-2785`.
- `[[RESEARCH-unified-movement-and-placement-ux]]` — the seven-surface inventory
  and the measurement that 17 of 18 shipped pieces open today.

## 🎙️ Interview Transcript

| # | Topic | Category | Question | Options | Choice | Note | → ADR |
|---|---|---|---|---|---|---|---|
| 1 | Movement unification | Architecture | May `reach` become per-direction? | M-A ray-cell / M-B model frozen / M-A staged | **M-A** | Model widening accepted; ADR-007's freeze to be lifted explicitly | ADR-001 |
| 2 | Board parity scope | Scope | How much of the room painter does the board record take? | placement+painting / placement only / delete the screen | **both** | Square-type painting becomes its own mode | ADR-004 |
| 3 | Capture editor | Architecture | Fold the separate capture editor into the grid? | fold / defer / fold-with-readonly-tail | **fold** | Removes the second uncoordinated writer of `d.attack` | ADR-003 |
| 4 | Derived views | Scope | How many read-only views survive? | preview only / preview+dex / none | **none** | Engine preview's oracle role moves into the suite | ADR-009 |
| 5 | Cell states | Contract | How does one cell answer two questions? | 6-state cycle / 3-state + capture mode / two grids | **3-state + mode** | Worst case three taps | ADR-003 |
| 6 | Non-goals | Scope | What is explicitly out? | (multi) | nightrider, pawn double-step/en-passant, drag-and-drop, grid growth | All four accepted | — |
| 7 | Undrawable records | Risk | What happens when the grid cannot draw a piece? | refusal view / make it impossible | **make it impossible** | Became AC-006 | ADR-002 |
| 8 | Ring mark | Contract | How does a cell say "and keeps going"? | ring arrow / 4th state on ring / outer arrow buttons | **ring arrow** | Conflicted with AC-006/007 — re-asked | ADR-002 |
| 9 | Conflict resolution | Risk | Arrow breaks charger editability. Which survives? | amend design / **amend SPEC** / 4-state everywhere | **amend SPEC** | Uniform three taps chosen over charger; SPEC amended, AC-007 repurposed | ADR-002 |
| 10 | Deletion order | Risk | Extend-first-delete-last, or replace at once? | ADR-003 order / one shot / split tracks | **ADR-003 order** | Each intermediate state shippable | ADR-007 |
| 11 | Painter sharing | Architecture | Extract, or let the board record import as-is? | **extract, both use it** / leave the room alone | **extract** | Room regression risk accepted; AC-010 is the guard | ADR-005 |

**Decided without asking** (defensible defaults, recorded as assumptions):

- **Test-id namespace.** The shared painter takes a `testIdPrefix` prop. The room
  keeps `place-${sq}` so its existing e2e passes unmodified; the board record uses
  `board-place-${sq}`. Forced by `Edit.tsx:182-193` — both panels are mounted at
  once, so one namespace would make `getByTestId` ambiguous the moment AC-010
  drives both in one test.
- **File paths and component naming** (`src/ui/PlacementPainter.tsx`).

## 📐 Architecture Decision Records

### ADR-001: The cell carries the ray, and ADR-007's freeze is lifted

**Status:** Accepted (2026-08-09, via /hm:plan interview #1)
**Context:** The 7×7 grid and the 8-direction dial are two drawings of one field.
ADR-027 split them because "a finite grid has no cell that means 'and keep
going'"; ADR-007 then froze `PieceGrid` and permitted only a rendering merge,
which was attempted twice, reverted twice, and recorded `NOT MET`.
**Decision:** A cell painted 미끄러짐 at distance *n* along a compass direction
compiles to a slide along that direction capped at *n*. `PieceGrid.reach` stops
being a shared scalar; each ray carries its own reach. ADR-007's freeze is
**explicitly lifted** — this PLAN supersedes it.
**Consequences:**
- ✅ The dial and the reach picker have nothing left to say and are deleted.
- ✅ A piece can slide two squares north and to the edge eastward, which is
  unrepresentable today.
- ⚠️ `readGrid`/`writeGrid` change their **pattern cardinality**, not just a field
  shape — see ADR-008.
- ⚠️ `tests/editor/vocabulary-coverage.test.ts` must be re-derived; ADR-007 named
  editing that file as the stop signal, and lifting the freeze is what authorises
  it.
**Rejected alternatives:**
- Keep the model frozen and delete only the derived views — rejected: leaves two
  editable surfaces, which is the reported defect.
- Infer slide from contiguity with no new cell state — rejected already at
  `PLAN-capture-rules-and-art-fixes.md:155`; re-examined and the rejection holds.
**Source:** Interview #1

### ADR-002: The ring cell means "and keeps going", and a cap of 3 is given up

**Status:** Accepted (2026-08-09, via /hm:plan interviews #8 and #9)
**Context:** The grid spans ±3 but a board does not. Something must mean
"beyond the drawing". The candidates were an arrow on the outermost ring cell
(every cell keeps three taps) and a fourth state on the ring only (three taps
inside, four on the ring).
**Decision:** The outermost ring cell painted 미끄러짐 renders as an arrow and
compiles to a slide with **no** `maxDistance`. Every cell takes the same three
taps. A slide capped at exactly 3 has no encoding.
**Consequences:**
- ✅ One interaction rule for all 48 cells; nothing is reachable only by a gesture
  a child may not have.
- ⚠️ `piece.charger` (`maxDistance: 3`) stays read-only. The SPEC was amended:
  the original AC-007 ("charger becomes editable") was withdrawn and AC-006
  re-aimed from "18/18 open" to "the refusal set is exactly `{piece.charger}`".
- ⚠️ The arrow is a **glyph inside the existing outermost cell**, not a control on
  a ring around the grid. The 9×9 ring layout that failed twice
  (`styles.css:2769-2785`) is not what this is; no layout restructuring follows
  from it. What does follow is a rendering question for diagonal rays, handled by
  the Phase 3 spike.
**Rejected alternatives:**
- Fourth state on the ring cell only — rejected by the author: keeping charger
  editable was judged worth less than every cell behaving identically. The cost
  was surfaced with the arithmetic before the choice was made.
- Long-press for "keeps going" — rejected: tap-and-hold succeeds for 60% of
  7–8-year-olds.
**Source:** Interviews #8, #9

### ADR-003: Capture is a mode, and the empty capture grid is the omitted `attack`

**Status:** Accepted (2026-08-09, via /hm:plan interviews #3 and #5)
**Context:** A cell must answer both "leap or slide" and "move or capture". A
single cycle covering both needs six states and up to five taps. Separately, the
standalone capture editor is a second writer of `d.attack`, uncoordinated with
the grid's own `commit` (`RecordForm.tsx:754-755`).
**Decision:** One grid, three-state cells, and a `움직이기 / 잡기` toggle above it.
The capture grid's **empty state is the schema's omitted `attack`** — meaning
"captures the way it moves". The standalone capture editor is deleted.
**Consequences:**
- ✅ Worst case three taps; one question on screen at a time.
- ✅ One writer of `attack`.
- ✅ AC-002 holds in capture mode: from empty, tap 1 writes `attack` with that one
  cell, tap 2 changes its travel kind, tap 3 empties the grid and the save omits
  `attack` again — byte-identical to the start.
- ⚠️ **The first tap in capture mode is a semantic cliff**: it silently narrows
  capture from "everywhere it moves" to "only here". Mitigation is display, not
  model — when the capture grid is empty, **the same 48 cell elements** are
  restyled to show the movement set faded, under the label "움직이는 대로 잡아요",
  and a `잡기를 움직임에서 가져오기` button seeds the grid from the movement set for
  an author who wants to subtract rather than start over.
- ⚠️ **The ghost is a restyle of the one grid, never a second region.** No
  additional cell-bearing element is rendered — the cells are the same DOM nodes
  with a `data-ghost` attribute, and their `Cell` values are read from `movement`
  for display while `attack` stays empty. This is what keeps AC-001 true ("one
  drawing") as well as AC-002 (three taps still restore the omitted `attack`,
  because a ghost is not a state in the cycle). Phase 7's AC-001 test asserts it
  positively: with the capture grid empty, the count of cell-bearing elements is
  exactly 48.
**Rejected alternatives:**
- Seed `attack` from `movement` on the first tap — rejected: three taps would then
  not restore the draft, breaking AC-002, and the author cannot get back to the
  omitted form by tapping. The seed button provides the same convenience without
  making it the default path.
- Render the ghosts as a **second** region beside the capture grid — rejected: two
  cell-bearing regions on one screen is the defect this whole task removes, and
  AC-001's banned-test-id list would not have caught it.
- Six-state single-button cycle — rejected: up to five taps, and the intermediate
  states are unpredictable.
- Two side-by-side grids — rejected: it is two maps again, the reported defect.
**Source:** Interviews #3, #5

### ADR-004: The board record takes both of the room maker's painting modes

**Status:** Accepted (2026-08-09, via /hm:plan interview #2)
**Context:** `RecordForm`'s board fieldset does piece placement and square-type
painting at once, two tiny buttons per square. The room maker splits them into
`판 칠하기` and `배치` as separate steps.
**Decision:** The board record gets both, as two modes over one painter, matching
the room.
**Consequences:**
- ✅ The `a6` text and all three `<select>`s disappear together.
- ⚠️ The board record's screen shape changes, not just its widgets.
- ⚠️ The board record offers **all** pieces in the source; the room offers only
  the pieces it lists (`RoomDetail.tsx:732`). A standalone board has no room to
  scope by, so the painter takes its palette as a prop.
**Rejected alternatives:**
- Placement only — rejected: leaves two interaction styles on one screen.
- Delete the board record editor — rejected: makes a shipped board record
  uneditable from the library, the shape of a recorded failure.
**Source:** Interview #2

### ADR-005: Placement ships first, and the painter is extracted, not copied

**Status:** Accepted (2026-08-09, via /hm:plan interview #11 + codex second opinion)
**Context:** Both tracks edit `RecordForm.tsx` and `styles.css`. The movement
track restructures `pieceGridView` and the imports and local state around it; the
placement track rewrites the board branch of the same return tree.
**Decision:** The placement track runs **first and to completion** (Phases 1–2),
before the movement track touches `RecordForm.tsx`. `RoomDetail`'s painter is
extracted into `src/ui/PlacementPainter.tsx` and **both** surfaces consume it. The
painter takes a `testIdPrefix`; the room keeps `place-${sq}` and the board record
uses `board-place-${sq}`.
**Consequences:**
- ✅ One implementation of placement, which is the point.
- ✅ No concurrent edits to one component's return tree.
- ⚠️ Working room-maker code is modified. AC-010 exists to catch the regression:
  it drives the same tap sequence through both surfaces and compares.
- ⚠️ The prefix is load-bearing, not cosmetic — `Edit.tsx:182-193` mounts both
  panels at once, so a single namespace makes `getByTestId` ambiguous exactly when
  AC-010 runs.
**Rejected alternatives:**
- Let the board record import the room's grid without refactoring — rejected: two
  call sites drift, which is the defect one layer down.
- Run the two tracks in parallel — rejected on the second opinion's evidence:
  both edit `RecordForm.tsx`'s single return tree and shared cell CSS.
**Source:** Interview #11; codex finding `e8e41bcd`

### ADR-006: The gate is re-derived, and not declared green while two writers exist

**Status:** Accepted (2026-08-09, via codex second opinion)
**Context:** The extend-first-delete-last order asks for the coverage gate to be
re-pointed onto the new controls while the old ones still exist. But ADR-006's
gate asserts **one** editor control per vocabulary entry, bidirectionally. With
both control sets mounted that assertion is either false or has been weakened.
**Decision:** During the overlap, add **new-control round-trip tests** only. The
bidirectional one-control-per-entry assertion is re-derived and required green
**after** the old surfaces are deleted, not during the overlap.
**Consequences:**
- ✅ The overlap still proves the new controls carry coverage before anything is
  deleted — which is what the ordering exists for.
- ✅ No weakened assertion is left behind reading as coverage. The recorded rule is
  that writing a weaker assertion to keep the suite green "is worse than an
  absence that is named".
- ⚠️ Phase 6 cannot claim `AC-012`; only Phase 7 can.
**Rejected alternatives:**
- Declare the gate green during the overlap — rejected: it would pass with two
  writers mounted, which is the thing AC-012 forbids.
**Source:** codex finding `30a9ddd2`

### ADR-007: Extend first, delete last

**Status:** Accepted (2026-08-09, via /hm:plan interview #10)
**Context:** The last time a form was deleted here, two affordances that lived
only in it went with it and were found by converting tests, not by reading the
diff.
**Decision:** Inherit `PLAN-unified-create-ux` ADR-003's ordering. Every
intermediate state stays shippable, and nothing is deleted until the replacement
has demonstrated coverage.
**Consequences:**
- ✅ More phases, each with a checkable exit.
- ⚠️ `RecordForm.tsx` briefly holds both control sets.
**Source:** Interview #10

### ADR-008: `readGrid`/`writeGrid` group slides by cap, under a canonical order

**Status:** Accepted (2026-08-09, via codex second opinion)
**Context:** `bucketize` returns `null` on a **second** slide pattern
(`PieceMoves.tsx:120-123`), `writeGrid`'s `build` emits exactly one slide object
using the shared `grid.reach`, and `sameReach` compares only the first slide
bucket (`PieceMoves.tsx:268-273`). Per-direction reach requires one slide pattern
per distinct cap, so this is a cardinality change, not a field rename.
**Decision:** `bucketize` accepts N slide patterns keyed by their cap. `writeGrid`
groups the painted rays by cap and emits one pattern per group, ordered by a
**canonical rule**: capped groups ascending by `maxDistance`, the uncapped group
last, vectors sorted within each group by the existing comparator. `sameReach`
compares cap-keyed sets, order-independently.
**Consequences:**
- ✅ Round-trip byte stability is definable and testable rather than incidental.
- ⚠️ A shipped piece whose hand-written slide patterns are in a different order
  would newly re-serialise differently. **Phase 4 must prove none does** — the
  17 currently-opening pieces are the fixture.
**Rejected alternatives:**
- Emit one pattern per direction — rejected: it changes the bytes of every
  multi-direction slider that ships today.
**Source:** codex findings `f85ee568`, `ad2b244a`

### ADR-009: The engine preview is deleted and its oracle role moves into the suite

**Status:** Accepted (2026-08-09, via /hm:plan interview #4)
**Context:** ADR-032 made the preview a verification oracle — it calls the real
`legalActions`, so it cannot drift from match behaviour. Deleting it removes an
in-app differential check.
**Decision:** Delete it. The differential role is carried by AC-006 (every shipped
piece opened through the real `readGrid`) and AC-013 (the real build in a real
browser).
**Consequences:**
- ✅ One drawing on screen, which was the request.
- ⚠️ Editor-versus-engine drift is now detectable only in CI, never in the app.
  This is a deliberate trade and is recorded here so a later reader does not
  restore the panel by accident.
**Source:** Interview #4

## 🏗️ Technical Design

**Current state.** `PieceGrid { cells, slides, reach, forward }` (`PieceMoves.tsx:78-85`),
compiled by `writeGrid` into at most one `slide` and one `step` pattern.
`readGrid` refuses anything else. `RecordForm.tsx:720-993` renders seven surfaces
from it; `PieceDetail.tsx:34-91` renders a read-only prose version in-game.
`RecordForm.tsx:1330-1401` is the board branch; `RoomDetail.tsx:676-756` is the
room's painter.

**Affected components.**

| File | Change |
|---|---|
| `src/ui/PlacementPainter.tsx` | **new** — extracted from `RoomDetail`; props include `testIdPrefix`, the piece palette, and the mode |
| `src/ui/RoomDetail.tsx` | consumes the painter; behaviour unchanged |
| `src/ui/RecordForm.tsx` | board branch rewritten to the painter; movement fieldset rebuilt then reduced |
| `src/ui/PieceMoves.tsx` | `PieceGrid` per-ray reach; `bucketize` / `writeGrid` / `sameReach` per ADR-008 |
| `src/ui/PieceDetail.tsx` | **forced in by ADR-001** — its `{reach}` sentence assumes one shared cap |
| `src/ui/PiecePreview.tsx` | deleted |
| `src/i18n/ko.ts` | new keys for the mode toggle, the ghost label, the seed button; removals for the deleted surfaces |
| `src/ui/styles.css` | ray + arrow cell rendering; board-cell rules move to the painter |

**Data flow.** Unchanged end to end: the grid compiles to `MovePattern[]`, the
schema is untouched, and `reachFrom` (`engine.ts:122`) consumes it exactly as
today. The widening is entirely in how many `slide` patterns the editor is willing
to read and write.

**API changes.** None outside `src/ui/`. No schema change, no engine change.

## 📝 Implementation Plan

**Status as of 2026-08-09 (`/hm:execute` run 1).**

| Phase | Status | Evidence |
|---|---|---|
| 1 — Extract `PlacementPainter` | **DONE** | 577/577 `tests/ui` and 14 room e2e green with **no test file edited**; `RoomDetail.tsx` −157/+75 |
| 2 — Board record consumes the painter | **DONE** | AC-009/010/011 green; vocabulary gate green; full suite 1187/1187; `tsc` clean |
| 3 — Ray-rendering spike | **DONE — ADR-002 stands** | Chromium @360px: diagonal ray continuous through corner cells, ring arrow legible, cell 45.1 px ≥ 44 at `max-width:344px; padding:6px`. **Stop-and-reopen condition not triggered.** |
| 4 — Widen the model | **DONE** | All five exits met; full suite 1215/1215, `tsc` clean. Phase A.5 PASS on attempt 2. |
| 5 — New grid UI | **DONE** | Representability matrix green (23 rows, exclusions named); cell cycle + ray + mode toggle shipped; full suite **1341/1341**, `tsc` clean, 3/3 new e2e on mobile-webkit |
| 6 — New-control coverage | **DONE** | AC-002/003/004/005/008 green by name; overlap round-trips added to the gate without claiming AC-012 |
| 7 — Delete the old surfaces | **DONE** | Dial, reach picker, standalone capture editor, `PiecePreview`, dex line and both prose notes gone; `piece-clear`/`piece-forward` rehoused; AC-012 re-derived and green |
| 8 — Real browser | **DONE** | Full mobile-webkit suite **131 passed / 0 failed**; unit **1376/1376**; `tsc` clean |

**Why the run stopped here, and why here specifically.** Phases 1–3 are a
complete, shippable unit under ADR-007: the placement half of the task is
delivered end to end, the movement half is untouched and still works, and the
movement track's one genuinely unknown risk (R3, the ray rendering) has been
answered before any code was committed to it. Stopping mid-Phase-4 would not have
this property — Phase 4 rewrites `readGrid`/`writeGrid`, which every movement
surface reads. Nothing is blocked; the remaining work is simply larger than one
run, and scaling it is the author's call, not the executor's.

**Two things Phase 4+ must carry that this run discovered.**

1. **`RecordForm`'s board branch no longer defines the grid geometry.** Phase 5's
   grid work must not reintroduce a fixed `width` on `.move-grid` — see below.
2. **The 44 px tap target is violated by the code that ships today.** `.move-grid`
   is `width: 294px` (`src/ui/styles.css:2699`), which measures **38.0 px** per
   cell in Chromium at a 360 px viewport. The spike's `max-width: 344px` with
   `padding: 6px` measures 45.1 px. This is a pre-existing defect the movement
   work inherits rather than causes, and Phase 5's exit re-check is where it gets
   fixed.

### Phase 4 — corrections, and the newly-reachable window

**Exit 2 asked for something that was never true.** It required the 17 openers to
"re-serialise byte-identically". Measured: `writeGrid` sorts vectors while the
bundled content is hand-written in a human order — `piece.king` ships
`[1,0],[-1,0],[0,1]…` and compiles back as `[-1,-1],[-1,0],[-1,1]…`. Opening a
piece in the maker and saving it has rewritten its vector order since long before
this task. The exit was replaced by the two properties it was reaching for, both
checkable and both now asserted per piece:

- **semantic identity** — same kinds, same vector *sets*, same caps, same
  `forward`, with `jump` normalised to `step` because `reachFrom` gives every
  non-slide `maxSteps = 1` and four shipped pieces still carry `jump`;
- **idempotence** — byte-level: a second round-trip changes nothing, which is the
  actual "a save must not churn the document" claim.

**`tsc` did not catch the two surfaces that read `reach`.** Exit 1 was written on
the belief that a compile error would prove `PieceDetail` had been carried. It
caught the reach *picker* in `RecordForm`, but `describeGrid` and `PieceDetail`
both interpolate the value into a template string, where a `Record` becomes
`[object Object]` with no type error at all. Both were fixed by reading, not by
the compiler. Anything later that keys an i18n lookup off a model value should
assume the same blind spot.

**Fixtures pinned to the old boundary had to move, not be deleted.** Three tests
encoded "two slide patterns with different caps is refused" — which is precisely
the case this phase makes legal. Each moved to the new boundary with the reason in
the diff: the refusal fixture became *one direction claimed twice at two caps*
(still refused, because the grid has one cell per direction), and a cap of exactly
3 was added as the other refusal — the shape `piece.charger` actually ships.

**Phase D.5 — newly-reachable window.** This phase widens a capability rather than
repairing a defect, but it does move a boundary, so the window is named.

1. **The window:** movement documents carrying two or more `slide` patterns whose
   `maxDistance` values differ, with each direction appearing at most once. These
   previously hit `reaches.size > 1 → null` and fell to the read-only path; they
   now open in the grid *and* are re-serialised by `writeGrid` on the next save.
2. **The tests that enter it:**
   `tests/editor/movement-opens-shipped-content.test.ts::round-trips a piece that slides different distances in different directions`
   and `::orders capped groups before the uncapped one, so the bytes are stable`
   for the model, and
   `tests/ui/piece-detail.test.tsx::says both caps rather than one of them`
   for the player-facing half — the surface that would otherwise have printed one
   cap over the other on a card a player reads mid-match.
3. **Absent case:** a direction that does not slide still carries a `reach` entry
   that is never read; `blankGrid` defaults every direction to `edge`, and the
   17-piece sweep covers both the no-slide pieces (knight) and the all-one-cap
   pieces (rook), so the field's default is exercised rather than assumed.

### Phase 5 — what the spike over-promised, and the two AC narrowings

**The spike's 45.1px was never available in the app, and re-checking is what
found it.** Phase 3 measured a bare page. On an iPhone 13 the editor's chrome
takes 112px before the grid is reached — 14px of padding each at `.editor`,
`.library` and `.record-form`, then 11px at `.piece-moves` — leaving 278px, so
the cell measured **36.3px**. The fixed `294px` the grid used to carry was never
honoured either: `max-width: 100%` clamped it to the container all along.

Escaping the fieldset's padding and halving the gap recovers what is available
without touching padding three other screens share: **38.9px**, asserted with a
floor of 38 in `e2e/maker-movement-and-placement.spec.ts`. **The 44px touch
target is not met**, and that is recorded rather than rounded away — closing the
last 5px is a padding change with a different blast radius, and it is now a named
decision for whoever takes it rather than a silent miss.

**AC-002's domain was two steps too wide, and both narrowings are facts about the
model.** Building the cycle showed:

1. **24 of the 48 cells cannot slide.** A slide vector must be one of the eight
   compass units, so a knight-shaped offset has no third state to visit. Those
   cells cycle in two, and two taps restore them. "Exactly three states" holds on
   the 24 compass cells.
2. **A cap belongs to a direction, not to a square.** Tapping any square of an
   existing ray clears the whole ray — there is no way to keep squares 1 and 3
   while dropping 2. So three taps restore a cell only when its direction carried
   no ray to begin with; otherwise the third tap re-tips the ray at the tapped
   square.

Both are asserted in `tests/ui/movement-cell-cycle.test.ts` rather than left as
prose, including the non-restoring case, so the rule is met rather than
rediscovered. **The SPEC's AC-002 structured fields need the same narrowing** —
that edit is outstanding.

**One test oracle of my own was degenerate and had to be replaced.** The cycle
tests first compared `writeGrid` output before and after. In capture mode a grid
with capture squares and no movement squares compiles to
`{ok:false,reason:'no-move'}` either way, so every restore assertion in that half
passed by comparing one refusal to another. The comparison is now over the grid
itself.

### Post-review — `reach` became per-axis, at the author's direction

The review's open P1 was closed by the model change it recommended rather than by
a third patch. `PieceGrid.reach` is now `Record<Axis, Record<Dir8, Reach>>`.

**Why a patch could not work.** With ONE cap per direction, a tap on the capture
grid had exactly two options and both are edits a child cannot see: overwrite the
cap (round 1's defect — it silently lengthened a MOVEMENT ray on a mode they were
not looking at) or adopt it (round 2's defect — the square they DID tap drew as
untouched while a square they never tapped became the tip). There is no third
answer while one number serves two questions. The schema was never the constraint:
`movement` and `attack` are separate arrays and each pattern carries its own
`maxDistance`, so the editor had been the narrower of the two all along.

**What the widening bought beyond closing the finding.** A document whose movement
and attack cap the same direction differently now OPENS, where `readGrid` used to
refuse it. That fixture moved from the refusal list into a new `NOW_OPENS` block
in `tests/ui/piece-grid-refusal.test.ts`, with a byte-identical round-trip
assertion, so the boundary shift is visible rather than implied.

**One defect the change introduced, caught by an existing test.** The
`attack`-absent promotion copies every move square to a capture square; it did not
copy the CAP. The two axes then disagreed about a ray nobody had authored, and
`writeGrid` emitted an `attack` for a record that had none — a field appearing out
of a round-trip that was meant to be a no-op. Fixed by promoting the cap with the
direction. It was found by `movement-ray.test.ts`'s existing round-trip check, not
by design, which is the third time this task's round-trip assertions have caught
something reading the code did not.

### Phases 6-8 — four places the plan was wrong, and one verification gap of mine

**ADR-003's "semantic cliff" does not exist, so its mitigation was deleted rather
than shipped.** The plan expected an empty capture grid and a first tap that
silently narrows capture to one square, and budgeted ghost cells plus a seed
button for it. An omitted `attack` means captures follow the movement and
`readGrid` PROMOTES every move square to both — so the capture grid opens already
showing the squares the record captures on, and a tap ADDS to that set. The
ghosts were worse than unnecessary: drawing the movement axis while a tap edited
the capture axis made the picture disagree with the control.

**Deleting the container took two unrelated controls with it.** Removing the
standalone capture editor by cutting its enclosing `{kind === 'piece' && (…)}`
also removed `editor-royal` and `editor-promotion-onRank` — the same shape as the
recorded `form-panel-expert` incident, one layer down. The gate caught it
immediately, which is what the gate is for; both were restored and only the
attack form left.

**AC-001's "top-of-form summary line" should not have included the sticky
anchor.** Dropping the movement clause from `summaryLine()` made a fully authored
piece's anchor read "you have not decided anything yet" — chrome that lies, which
is worse than the redundancy the criterion targets. The anchor is form chrome for
every record kind and it keeps its clause; what went is `piece-summary`, the dex
line inside the movement fieldset, which retold the drawing to someone already
looking at it. Found by `maker-anchors.spec.ts`, not by reading.

**Keeping `attack` when the movement half is emptied was tried and reverted.**
Losing authored capture squares to a clear looks like the bug; the reason it is
not is that once the axes diverge the promotion is materialised, so a leftover
`attack` is indistinguishable from an artefact — and holding an artefact
suppresses the promotion for every square painted next. Both the branch and a
test now carry the argument, so the next attempt meets it first.

**My own verification gap: Phase 2 deleted `paint-type` and I ran only
`rooms.spec.ts`.** Five e2e specs drove the board record's deleted `<select>`s and
went unnoticed until Phase 8 ran the suite. Deleting a control is exactly when the
full browser suite is not optional, and running one file because it was the
obviously-related one is how that gets missed.

### Two corrections this run made to the plan itself

- **The vocabulary gate had to be re-pointed in Phase 2, not only in Phase 7.**
  One `FIELD_ROWS` entry (`board` / `pairedWith`) reached the board painter through
  `paint-type` and `paint-a1` / `paint-a6` — controls Phase 2 deletes. It was
  re-pointed onto `board-mode-paint` → `board-paint-pick-…` → `board-paint-a1` /
  `board-paint-a6` with its `path` and `authored` untouched, which is the evidence
  that this was a re-point and not a weakening. ADR-006's "do not declare the gate
  green while two writers exist" is about the MOVEMENT overlap and is unaffected.
- **The two placement surfaces disagreed on what a tap does, and the PLAN did not
  know.** `RoomDetail.place` cleared any occupied square whatever piece was held;
  `RecordForm.place` cleared only on an exact piece-and-side match and otherwise
  replaced. Sharing the markup would have left that divergence in place, so the
  reducer is now shared too — `togglePlacement` in `PlacementPainter.tsx`, with the
  room's semantics winning because its rationale was the one with a written
  argument. Found by the Phase A.5 test-reviewer, not by the plan.

### Phase 1 — Extract `PlacementPainter`; the room consumes it

- `depends_on`: `[]` · `parallel_group`: `serial-placement` · `merge_hazards`: `src/ui/styles.css` (board-cell rules), `src/ui/RoomDetail.tsx`
- **Scope in:** `src/ui/PlacementPainter.tsx` (new), `src/ui/RoomDetail.tsx`, `src/ui/styles.css`
- **Scope out:** `RecordForm.tsx`, everything movement
- **Exit:** `npx vitest run tests/ui` and the room e2e spec pass **with no test file edited**; `git diff --stat` shows `RoomDetail.tsx` shrinking and no `data-testid` string in it changing.
- **Risk:** medium — working room-maker code is modified
- **Rollback:** revert to base; nothing else depends on this yet

### Phase 2 — The board record consumes the painter; the algebraic buttons go

- `depends_on`: `[1]` · `parallel_group`: `serial-placement` · `merge_hazards`: `src/ui/RecordForm.tsx` (board branch), `src/i18n/ko.ts`
- **Scope in:** `RecordForm.tsx` board branch, `src/i18n/ko.ts`, `tests/ui/board-record-painter.test.tsx` (new)
- **Scope out:** the movement fieldset
- **Exit:** AC-009, AC-010, AC-011 green. Specifically: zero rendered text nodes match `^[a-z][1-9][0-9]*$` inside the board editor; zero `<select>` elements; the AC-010 differential drives both surfaces in one mounted tree and compares `placements` as sets.
- **Risk:** medium
- **Rollback:** Phase 1

### Phase 3 — Ray-rendering spike

- `depends_on`: `[]` · `parallel_group`: `serial-movement` · `merge_hazards`: `none` — **honest only because nothing from this phase is merged.** The spike is 100% discardable: it produces a screenshot and a decision, never a commit on the task branch. Were any of its CSS to land, it would collide with Phase 1's declared `styles.css` hazard, since both phases carry `depends_on: []`.
- **Scope in:** a scratch file that is deleted at the end of the phase
- **Scope out:** any model or component change; **any commit to `src/ui/styles.css`**
- **Exit:** a static 7×7 renders, in Chromium at a 360 px-wide viewport, (a) a straight ray through the orthogonal cells, (b) a ray through the **diagonal** corner cells, (c) an arrow glyph in an outermost cell, with every cell's tap target ≥ 44 px and the grid not clipped. Screenshot attached to the phase. **If (b) cannot be drawn legibly, stop and re-open ADR-002** — that is the one thing that would make the chosen mark unworkable.
- **Risk:** medium — this is where the twice-reverted layout work actually lived
- **Rollback:** discard; ADR-002 reopens

### Phase 4 — Widen the model (ADR-008), and carry `PieceDetail` with it

- `depends_on`: `[2, 3]` · `parallel_group`: `serial-movement` · `merge_hazards`: `src/ui/PieceMoves.tsx`, `src/i18n/ko.ts` (shared with Phase 2)
- **Why it depends on Phase 2** — *not* ADR-005's `RecordForm.tsx` argument, which does not apply here: this phase deliberately does not touch that file. The real dependency is `src/i18n/ko.ts`, which Phase 2 also edits, plus the plain sequencing preference that the placement track lands whole before the movement track starts. If those two are ever untrue, this dependency may be dropped — but the `ko.ts` contention must then be resolved some other way.
- **Scope in:** `src/ui/PieceMoves.tsx`, `src/ui/PieceDetail.tsx`, `src/i18n/ko.ts` (the `{reach}` sentence), `tests/editor/movement-opens-shipped-content.test.ts` (new)
- **Scope out:** `RecordForm.tsx` — no editor UI change in this phase
- **Exit:** all four checks, each runnable:
  1. `npx tsc --noEmit` clean (this is what proves `PieceDetail` was carried).
  2. The 17 pieces that open today still open, and **re-serialise byte-identically** — the ADR-008 canonical-order risk, measured against the shipped bytes.
  3. `refused_piece_ids() === {'piece.charger'}` across all three sources, with the source count asserted (AC-006).
  4. `PieceDetail` renders a mixed-cap piece without printing a single shared reach; its existing tests pass or are updated with the reason recorded in the diff.
  5. **AC-007 directly** — open `piece.charger` (which check 3 has just established the grid *cannot* draw), edit a field unrelated to movement, save; assert `movement` and `attack` are deep-equal to the shipped bytes **and** the save control was never disabled. Checks 2 and 3 do not cover this: check 2 sweeps only the 17 pieces that *do* open, which by construction excludes charger, and check 3 asserts set membership only. The branch under test is the refusal path at `RecordForm.tsx:720-757`, where `commit()` is never invoked — the regression this guards is a save that rewrites the half the editor suppressed.
- **Risk:** **high** — cardinality change plus a player-facing surface
- **Rollback:** Phase 2

### Phase 5 — Build the new grid UI alongside the old surfaces

- `depends_on`: `[4]` · `parallel_group`: `serial-movement` · `merge_hazards`: `src/ui/RecordForm.tsx`, `src/ui/styles.css`, `src/i18n/ko.ts`
- **Scope in:** `RecordForm.tsx` movement fieldset (additive), `src/ui/styles.css`, `src/i18n/ko.ts`
- **Scope out:** deletions of any kind
- **Exit:** the new controls author every shape the old ones could, proven by an **enumerated representability matrix** — one row per shape, each asserted: leap-only; slide 1/2/edge per direction; two directions at different caps; mixed move/capture; `forward` on and off; empty capture grid; a cleared grid. Each row round-trips. Rows the design deliberately cannot express (`maxDistance: 3`) are listed as **excluded with a reason**, not omitted. **And the Phase 3 spike's three criteria are re-checked against the shipped CSS** — the spike certified throwaway styles; this certifies the real component, at the same 360 px viewport with the same ≥ 44 px tap target. Without it the spike only ever validated code that was discarded.
- **Risk:** high
- **Rollback:** Phase 4

### Phase 6 — New-control round-trip coverage, old surfaces still present

- `depends_on`: `[5]` · `parallel_group`: `serial-movement` · `merge_hazards`: `tests/editor/vocabulary-coverage.test.ts`
- **Scope in:** `tests/editor/vocabulary-coverage.test.ts`, `tests/ui/movement-cell-cycle.test.ts`, `tests/ui/movement-ray.test.ts`, `tests/ui/movement-capture-mode.test.tsx`, `tests/ui/movement-undrawable.test.tsx` (all new)
- **Scope out:** any source deletion; **any claim that AC-012 is met** (ADR-006)
- **Exit:** every vocabulary entry reachable through a **new** control round-trips, and each of these is green by name:
  - AC-002 → `tests/ui/movement-cell-cycle.test.ts`
  - AC-003 → `tests/ui/movement-capture-mode.test.tsx`
  - AC-004, AC-005 → `tests/ui/movement-ray.test.ts`
  - **AC-008 → `tests/ui/movement-undrawable.test.tsx`** — a *synthetic* undrawable piece survives an unrelated edit with the save never disabled. This is the sibling of Phase 4 exit 5 and neither substitutes for the other: Phase 4 proves it for the one piece that actually ships, this proves it for the shapes that do not ship yet.

  The `has ONE set of movement controls` test is **not** yet re-derived — it still pins the old controls and still passes, which is the proof that nothing was removed yet.
- **Risk:** medium
- **Rollback:** Phase 5

### Phase 7 — Delete the old surfaces, and rehouse what only lived there

- `depends_on`: `[6]` · `parallel_group`: `serial-movement` · `merge_hazards`: `src/ui/RecordForm.tsx`, `tests/editor/vocabulary-coverage.test.ts`
- **Scope in:** delete the dial, the reach picker, the standalone capture editor, `PiecePreview.tsx`, the dex sentence, the two prose notes, the top summary line; re-derive the coverage gate
- **Scope out:** the read-only refusal view (kept — AC-008)
- **Exit:**
  1. AC-001 green — none of the named test ids renders.
  2. AC-012 green — one control per vocabulary entry, **bidirectional**.
  3. **The orphan inventory is discharged explicitly.** Three affordances live only in deleted surfaces: `piece-clear` (clear-all), `piece-forward` (the forward mirror), and `piece-use-summary` (copies the generated prose into the record's description). The first two are **rehoused onto the new grid** and asserted present-and-enabled. The third is **dropped deliberately** — it has no home once the dex sentence is gone — and the drop is recorded here so it is a decision, not a loss. This is the `grid.forward` failure shape, and the inventory is what discharges it.
  4. `clear` semantics are defined per mode and tested: in 움직이기 it empties the grid, which the schema refuses at save with the existing message; in 잡기 it empties the capture grid, which means the `attack` key is omitted and captures follow movement again.
- **Risk:** **high**
- **Rollback:** Phase 6 (the last state where both control sets exist)

### Phase 8 — Real browser and full suite

- `depends_on`: `[7]` · `parallel_group`: `serial-movement` · `merge_hazards`: `none`
- **Scope in:** `e2e/maker-movement-and-placement.spec.ts` (new)
- **Exit:** AC-013 green — every control this PLAN names is visible and clickable in Chromium; the full `npx vitest run` and the Playwright suites pass.
- **Risk:** medium — this is the gate the recorded jsdom blind spot exists for
- **Rollback:** Phase 7

## 🧪 Testing Strategy

- **Unit (vitest/jsdom).** The model layer (ADR-008 grouping and canonical order),
  the cell cycle property, the capture-mode state machine, the representability
  matrix, the board painter's two modes.
- **Differential.** AC-006 against the three shipped sources; AC-010 against the
  room's own painter; AC-012 against the schema-derived vocabulary enumeration.
- **Real browser (Playwright).** AC-013, and the Phase 3 spike's viewport and
  tap-target measurements. jsdom is not permitted to be the last word on
  reachability — that is the recorded four-regression failure.
- **Byte-stability.** Phase 4 exit check 2 and AC-007 are the same oracle applied
  to different inputs: what the editor does not touch, it must not rewrite.

## ⚠️ Risks & Mitigation

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R1 | ADR-008's canonical order changes the bytes of a shipped multi-direction slider | medium | high | Phase 4 exit check 2 measures re-serialisation against the shipped bytes for all 17 openers, before any UI work |
| R2 | `PieceDetail` is forgotten and ships a false "shared reach" sentence to players | **was high** | high | Pulled into Phase 4 with `tsc --noEmit` as the mechanical proof; it cannot compile if forgotten |
| R3 | The diagonal ray cannot be drawn legibly, invalidating ADR-002 | medium | high | Phase 3 is a spike **before** any deletion, with an explicit stop-and-reopen instruction |
| R4 | The capture-mode first tap silently narrows capture and the author does not notice | medium | medium | ADR-003's ghost rendering + seed button; the ghosts are display-only so AC-002 stays true |
| R5 | An affordance that lived only in a deleted surface is lost silently | **was high** | medium | Phase 7 exit 3: a named inventory of three, each either rehoused-and-asserted or dropped-on-the-record |
| R6 | The coverage gate passes while two writers are mounted, reading as coverage it does not have | medium | high | ADR-006: AC-012 may only be claimed in Phase 7 |
| R7 | Extracting the painter regresses the room maker | medium | high | AC-010 drives both surfaces and compares; Phase 1 exit requires the room's tests to pass **unedited** |
| R8 | Both tracks edit `RecordForm.tsx` concurrently | **removed** | — | ADR-005 serialises them; placement completes at Phase 2 before movement touches the file |
| R9 | `place-${square}` collides once both panels are mounted | high | medium | `testIdPrefix`; the room keeps its ids so its e2e is untouched |

## ✅ Success Criteria

- [x] AC-001 — one editable movement surface (Phase 7)
- [x] AC-002 — three-tap cycle restores the draft (Phase 6)
- [x] AC-003 — empty capture grid omits `attack` (Phase 6)
- [x] AC-004 — per-direction reach (Phase 6)
- [x] AC-005 — ring cell writes no `maxDistance` (Phase 6)
- [x] AC-006 — refusal set is exactly `{piece.charger}`, 3 sources asserted (Phase 4)
- [x] AC-007 — charger survives an unrelated edit byte-identically (Phase 4)
- [x] AC-008 — a synthetic undrawable piece survives, save never disabled (Phase 6)
- [x] AC-009 — no algebraic text, no `<select>` (Phase 2)
- [x] AC-010 — board record and room agree on placements (Phase 2)
- [x] AC-011 — placing and painting are separate modes (Phase 2)
- [x] AC-012 — one control per vocabulary entry, bidirectional (Phase 7)
- [x] AC-013 — reachable in a real browser (Phase 8)

## 🔍 Plan Validation

**Cross-model second opinion — `codex`: `invoked`** (14 findings; 4 at P0).

| Finding | Disposition | Where it landed |
|---|---|---|
| `f85ee568` Phase 1 is a cardinality change, not a shape change; `bucketize` rejects a second slide pattern | **accepted** — verified at `PieceMoves.tsx:120-123` | ADR-008; Phase 4 exit 2 |
| `fafbd0cf` `PieceDetail.tsx` breaks at compile time and would misdescribe mixed-cap pieces | **accepted** — verified at `PieceDetail.tsx:91` | ADR-001 consequences; Phase 4 scope + exit 1; R2 |
| `05386126` AC-002 in capture mode is a semantic cliff | **accepted in substance, corrected in conclusion** — the state machine does close (empty → one cell → kind → empty), so AC-002 is satisfiable; the cliff is a UX problem, not a model one | ADR-003 consequences + ghosts and seed button; R4 |
| `65be7568` the ring-arrow needs a 9×9 flattening and inherits the reverted layout work | **rejected as stated** — the arrow is a glyph inside the existing outermost cell, not a control on a ring outside the grid, so no layout restructuring follows. The residual — diagonal ray rendering and tap-target size — is real | Phase 3 spike, with a stop-and-reopen exit |
| `e8e41bcd` the claimed parallelism is unsafe | **accepted** | ADR-005; phases serialised; R8 closed |
| `30a9ddd2` a green gate during the overlap defeats its own purpose | **accepted** | ADR-006; Phase 6 scope-out; R6 |
| `ad2b244a` `sameReach` compares only the first slide bucket | **accepted** | ADR-008 |
| `0fde9323` `piece-clear` / `piece-forward` can vanish with the container; `piece-use-summary` is silently lost | **accepted** | Phase 7 exit 3; R5 |
| `e4b6482c` clear semantics per mode are unspecified | **accepted** | Phase 7 exit 4 |
| `54bc7cb2` "authors every shape the old ones could" is unfalsifiable and false | **accepted** | Phase 5 exit rewritten as an enumerated matrix with explicit exclusions |
| `0b661434` "nothing orphaned" has no inventory | **accepted** | Phase 7 exit 3 |
| `ea54b7b4` Phase 1's exit did not prove source completeness | **accepted** | Phase 4 exit 3 |
| `55a05b1d` Phase 1 omits `PieceDetail` regression criteria | **accepted** | Phase 4 exit 4 |
| `76b71e3c` AC-007/008 need more than a save-enabled assertion | **accepted** | Phase 4 exit **5** (AC-007, the shipped piece) and Phase 6 exit (AC-008, the synthetic one). *Originally recorded as landing in Phase 4 exit 2; the validator showed that exit sweeps only the 17 pieces that open, which excludes charger by construction — so the acceptance had been booked against an assertion that could not carry it. Corrected.* |

### `plan-validator` — NEEDS_REVISION, resolved

The validator agreed with the one codex finding this PLAN rejected (the ring-arrow
/ 9×9 layout claim) after comparing ADR-002's text against the `styles.css`
post-mortem directly, and confirmed the residual was correctly kept alive as the
Phase 3 spike. It found no deferred-question phrasing anywhere in the document.

Its own findings, and where each was resolved:

| Severity | Finding | Resolution |
|---|---|---|
| **critical** | AC-007 is claimed by Phase 4, but none of Phase 4's four exits tested it — exit 2 sweeps only the 17 openers, which excludes charger by definition, and exit 3 asserts set membership only | **Phase 4 exit 5** added: open charger, edit an unrelated field, save, assert byte identity and that the save was never disabled. The branch named explicitly (`RecordForm.tsx:720-757`) |
| warning | AC-008 is claimed by Phase 6, whose exit never names it or its test | Phase 6 exit rewritten to list each AC against its test file by name, AC-008 included; scope-in no longer relies on a glob |
| warning | The `76b71e3c` acceptance was booked to a phase exit that could not carry it | Validation table row corrected above, with the original mistake left visible |
| warning | Phase 4's `depends_on: [2]` is justified by ADR-005's `RecordForm.tsx` argument, which does not apply since Phase 4 does not touch that file; the real overlap (`ko.ts`) was undeclared on both phases | Phase 4 now states its real reason; `src/i18n/ko.ts` added to the merge hazards of Phases 2, 4 and 5 |
| warning | ADR-003's ghost cells were underspecified — a second region would violate AC-001 and the AC-001 test would not catch it | ADR-003 now fixes the reading: the same 48 cell elements, restyled via `data-ghost`, never a second region. The rejected alternative is recorded, and Phase 7's AC-001 test asserts the cell count positively |
| warning | Phase 3 declares `merge_hazards: none` while editing `styles.css`, which Phase 1 declares as a hazard, and both carry `depends_on: []` | Phase 3 is now unambiguously discardable — a scratch file, no commit to `styles.css` — which is what makes `none` honest |
| suggestion | The spike's legibility finding is never re-verified against the real build | Phase 5 exit now re-runs the spike's three criteria on the shipped component |
| suggestion | No deferred-question phrasing found | No action |
