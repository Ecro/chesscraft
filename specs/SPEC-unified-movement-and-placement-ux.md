---
type: spec
task_slug: unified-movement-and-placement-ux
status: approved
created: 2026-08-09
tier: 2
tags: [chess-craft, spec, react, typescript, editor-ux, movement-model, board-placement]
test_framework: vitest
research_doc: "[[RESEARCH-unified-movement-and-placement-ux]]"
summary: "One grid says where a piece goes; the board record places pieces the way 배치 already does."
---

# SPEC — One movement drawing, one placement painter

## 🎯 Intent

The piece maker asks where a piece goes in three editable places at once — a 7×7
leap grid, an 8-direction slide dial, and a separate capture-pattern editor — and
then answers itself in four read-only views. The author cannot tell which one is
the question. The board record maker, meanwhile, is the only screen in the app
that renders a square as the literal text `a6` and picks a piece from a
`<select>`, while the room maker's `배치` step has done the same job as a
tap-to-place painter with piece art all along.

Both are one defect with one shape: **more than one surface for one truth.** This
SPEC reduces movement to a single grid whose cell carries the ray, and makes the
board record use the painter that already exists.

## 🌅 Outcomes

A child opening a piece in the maker sees **one drawing**. Tapping a cell cycles
`안 감 → 뛰어감 → 미끄러짐 → 안 감`; a `움직이기 / 잡기` toggle above the grid
switches which of the two questions the drawing is answering. There is no dial,
no reach picker, no second capture form, and no read-only panel restating what
the drawing already shows.

A child opening a board record sees the **same painter as `배치`** — a real board
with piece art on it, a tile palette to pick from, tap to place, tap again to
remove — for both placing pieces and painting square types. No coordinate text is
visible anywhere in the editor.

Two things become possible that are not possible today. A piece can slide a
different distance in each direction — north two squares and east to the board
edge — where the reach cap is shared across all directions today. And it can
slide a direction a different distance for moving than for capturing, which the
persisted schema has always permitted (`movement` and `attack` are separate
pattern arrays, each carrying its own `maxDistance`) and only the editor refused.

One thing deliberately stays impossible. The outermost ring cell means "and keeps
going", so a slide capped at exactly 3 has no encoding, and `piece.charger`
(`maxDistance: 3`) therefore stays read-only. This is the price of every cell
answering with the same three taps, and it was chosen with the arithmetic in
front of us (see Refinement Decisions).

## 📋 In-Scope Scenarios

### AC-001: The piece maker has exactly one editable movement surface

**Given** any piece draft is open in the maker
**When** the movement section renders
**Then** the grid cells and the `움직이기 / 잡기` mode toggle are the only enabled
movement controls present
**And** none of `piece-slide-{dir}`, `piece-reach-{reach}`, the separate
capture-pattern editor, the engine preview, the dex sentence, the two leap-vs-slide
prose notes, or the top-of-form summary line renders at all

### AC-002: A cell tap cycles through every state its square can hold, and comes back

**Given** a cell on one of the eight compass rays, in a mode where that cell's
direction carries no ray yet
**When** it is tapped three times
**Then** the grid is identical to before the first tap
**And** the three states visited are, in order, 뛰어감 (`step`), 미끄러짐
(`slide`), 안 감 — never more, never fewer

**Given** a cell that is **not** on a compass ray — 24 of the 48
**When** it is tapped twice
**Then** the grid is identical to before the first tap
**And** the two states visited are 뛰어감 and 안 감, because a slide vector must be
one of the eight compass units and this square has no ray to offer

**Given** a cell whose direction **already** carries a ray **on the axis being
edited**
**When** it is tapped once
**Then** the whole ray is cleared on that axis, not merely that square — a cap
belongs to a direction, and there is no way to keep squares 1 and 3 of a ray
while dropping 2
**And** the other axis is untouched: each axis owns its own cap for each
direction, so a tap can never move a ray on the mode the author is not looking at

### AC-003: Painting nothing in the capture mode means captures follow the movement

**Given** a piece whose 잡기 (capture) mode grid is empty
**When** the draft is saved
**Then** the saved document omits `attack` entirely rather than duplicating
`movement` into it
**And** painting any cell in 잡기 mode makes `attack` appear with exactly that
cell's vector

### AC-004: A slide cell owns its ray, and the ray's length is per-direction

**Given** the grid in 움직이기 mode
**When** the cell two squares north is painted 미끄러짐 and the cell one square
east is painted 미끄러짐
**Then** the saved `movement` contains a north slide capped at 2 and an east slide
capped at 1 as separate patterns, rather than one pattern under a shared cap
**And** the cells between the centre and each painted cell are drawn as part of
that ray, not as independently painted cells

**Given** a piece whose `movement` slides north one square and whose `attack`
slides north two
**When** it is opened
**Then** the grid draws it — a cap belongs to a direction **and an axis**, which
is what `movePattern` has always said, and refusing this document made the editor
narrower than the schema it edits

### AC-005: Sliding past the grid's edge is expressible

**Given** the grid in 움직이기 mode
**When** the outermost cell in a direction is marked as continuing
**Then** the saved slide pattern for that direction carries no `maxDistance` at
all, rather than `maxDistance: 3`

### AC-006: The set of shipped pieces the grid cannot open is exactly one, and it is named

**Given** every piece in all three content sources the app loads
**When** each is opened in the maker
**Then** the pieces that fall through to the read-only refusal view are exactly
`{piece.charger}` — no more, and the assertion names it rather than counting it
**And** the test asserts the number of sources it swept, so a fourth source cannot
join silently

### AC-007: The one piece the grid cannot open survives an unrelated edit

**Given** `piece.charger`, whose shipped `movement` is a forward slide with
`maxDistance: 3` plus two forward steps
**When** it is opened in the maker, a field unrelated to movement is edited, and
it is saved
**Then** the saved `movement` and `attack` are byte-identical to the shipped ones
**And** the save control was never disabled on account of the undrawable half

### AC-008: A record the grid cannot draw stays saveable

**Given** a synthetic piece whose movement the grid cannot express
**When** it is opened in the maker, an unrelated field is edited, and it is saved
**Then** the movement half of the saved document is byte-identical to the input
**And** the save button is never disabled on account of the undrawable half

### AC-009: The board record maker shows no coordinate text and no dropdown

**Given** a board record open in the maker
**When** the placement and square-painting sections render
**Then** no rendered text node matches an algebraic square (`^[a-z][1-9][0-9]*$`)
**And** neither the piece choice nor the side choice nor the square-type choice is
a `<select>` element

### AC-010: The board record and the room's `배치` place pieces identically

**Given** the same board, the same chosen piece and side, and the same sequence of
square taps
**When** the sequence is applied once through the board record maker and once
through the room maker's `배치` step
**Then** the resulting `placements` arrays are equal as sets
**And** tapping an occupied square with the same piece and side removes it in both

### AC-011: Square-type painting is its own mode, as it is in the room maker

**Given** a board record open in the maker
**When** the author switches between placing pieces and painting square types
**Then** exactly one of the two is active at a time, and both use the same painter
component the room maker uses

### AC-012: The vocabulary stays fully reachable through the new controls

**Given** the vocabulary the schema declares
**When** the coverage gate enumerates it
**Then** every entry has exactly one editor control and every control maps to
exactly one entry
**And** each entry round-trips: authored through its control, saved through the
real validator, re-opened, and identical

### AC-013: The controls are reachable in a real browser, not only in jsdom

**Given** the shipped build running in Chromium
**When** a piece and a board record are opened and edited end to end
**Then** every control this SPEC names is visible and clickable under Playwright's
visibility rules

## 🚫 Non-Goals

- **Nightrider-style repeating vectors.** A ray along a non-compass vector is
  unrepresentable today and stays unrepresentable. The grid's rays remain the 8
  compass directions.
- **Pawn double-step and en passant.** These are engine capabilities the piece
  vocabulary does not have; adding them is a different change.
- **Drag-and-drop placement.** Placement stays tap-to-select-then-tap-to-place.
  Measured: 7–8-year-olds complete a tap 83% of the time and a drag-and-drop 30%
  (PMC7303424), and the FittsFarm authors recommend select-and-tap for educational
  applications by name.
- **Growing the grid past 7×7.** Leaps beyond ±3 stay unrepresentable.
- **A slide capped at exactly 3.** The outermost ring cell means "and keeps
  going", so the representable reaches are 1, 2 and edge. `piece.charger` stays
  read-only; AC-006 pins it as the sole exception so a second one cannot appear
  unnoticed.
- **Retiring the read-only refusal view.** It is kept as insurance (AC-008) even
  though no shipped content reaches it (AC-006).
- **Redesigning the room maker.** Its `배치` step is the reference; it is extracted,
  not re-authored.

## ⚠️ Constraints

| Constraint | Value | Rationale |
|---|---|---|
| Test framework | `vitest` (unit / jsdom) + `playwright` (e2e) | Already the project's two suites. Playwright is **mandatory** for reachability: "testing-library's `fireEvent` does not enforce visibility and Playwright does, so a control moved behind a `hidden` panel keeps every jsdom test green while being unreachable" — four regressions rode through on exactly that (`.claude/memory/failures.md:173`). |
| Model change | `PieceGrid.reach` becomes per-direction | This is the widening ADR-007 froze. It must be re-decided in `plan` as an explicit ADR that supersedes ADR-007, not slipped in. |
| Engine | Unchanged | `reachFrom` already branches only on `kind === 'slide'` (`src/engine/engine.ts:122`). No engine edit is in scope. |
| Schema | Unchanged | `movePattern` already carries `kind` + `maxDistance` per pattern (`src/content/schema.ts:172-180`). Per-direction reach needs no schema change — it is one `slide` pattern per distinct cap. |
| Backward compatibility | Every record that opens today must still open | Measured 2026-08-09: 18 pieces across three sources, 17 open today and 17 after. The single refusal is `piece.charger` before and after — today because `reachOf` rejects `maxDistance: 3`, afterwards because the ring cell means "and keeps going". No record that opens today may stop opening. |
| Grid extent | 7×7 (±3), 8 compass rays | Unchanged; the non-goals above depend on it. |
| Coverage gate | Re-derived, not edited row-wise | `tests/editor/vocabulary-coverage.test.ts:1041` currently pins `piece-slide-n` as present-and-enabled; that assertion must be re-derived against the new control set. A gate "enumerated along one axis is blind to extensions along every other axis" (`.claude/memory/failures.md:54`). |
| Interaction | Tap only; no long-press gates anything | Tap-and-hold succeeds for 60% of 7–8-year-olds (PMC7303424). |

## ✅ Verification Criteria

| AC | Mode | Test name / manual step |
|---|---|---|
| AC-001 | unit | `tests/editor/vocabulary-coverage.test.ts::has ONE set of movement controls, not a simple one and a detailed one` |
| AC-002 | unit (property) | `tests/ui/movement-cell-cycle.test.ts::a ray cell at (%i,%i) visits leap then ray then nothing` |
| AC-003 | unit | `tests/ui/movement-capture-mode.test.tsx::writes attack the moment the capture set stops matching the movement set` |
| AC-004 | unit | `tests/ui/movement-ray.test.ts::caps one direction without touching another` |
| AC-005 | unit | `tests/ui/movement-ray.test.ts::AC-005 — the ring cell writes no maxDistance` |
| AC-006 | unit (differential) | `tests/editor/movement-opens-shipped-content.test.ts::refuses exactly piece.charger, and opens everything else` |
| AC-007 | unit (golden) | `tests/editor/movement-opens-shipped-content.test.ts::keeps piece.charger byte-identical, and never disables the save` |
| AC-008 | unit | `tests/ui/movement-undrawable.test.tsx::AC-008 — undrawable means the editor is suppressed, not the save` |
| AC-009 | unit | `tests/ui/board-record-painter.test.tsx::renders no text node that reads as a square name` |
| AC-010 | unit (differential) | `tests/ui/board-record-painter.test.tsx::draws and writes the same thing for the same taps` |
| AC-011 | unit | `tests/ui/board-record-painter.test.tsx::shows exactly one of the two painters at a time` |
| AC-012 | unit (differential) | `tests/editor/vocabulary-coverage.test.ts::has one editor control per vocabulary entry, and no control for anything else` |
| AC-013 | e2e | `e2e/maker-movement-and-placement.spec.ts` |

**Oracles.** Every AC's oracle and its independence justification are carried in
`specs/SPEC-unified-movement-and-placement-ux.machine.yaml`. Two are worth naming
here because they replace something this change deletes:

- **AC-006 / AC-012 are differential against sources outside the editor** — the
  shipped content sets and the schema-derived vocabulary enumeration. The editor
  cannot satisfy them by agreeing with itself.
- **AC-002 / AC-007 are metamorphic round-trips** — three taps restore the draft;
  open-and-save preserves bytes. Both hold regardless of how the grid is written,
  which is what makes them safe to hand to `/hm:execute`.

Deleting the engine preview removes an in-app differential check between what the
editor draws and what the engine computes. That check is not abandoned — it moves
into AC-006, which opens every shipped piece through the real `readGrid`, and into
AC-013, which exercises the real build.

## ❓ Open Questions

None blocking. One item is deliberately handed to `/hm:plan` as ADR material
rather than left as an assumption:

1. **Superseding ADR-007.** ADR-007 froze `PieceGrid` and permitted only a
   rendering merge; that attempt is recorded `NOT MET`. This SPEC requires the
   model change ADR-007 refused. `plan` must write the ADR that supersedes it and
   state why the freeze is being lifted — silently widening the model is the
   failure mode the record warns about.
**Resolved during the `/hm:plan` interview, recorded here so the SPEC stays the
single source of truth:** the outermost ring cell painted 미끄러짐 renders as an
arrow and means "and keeps going". Every cell therefore takes the same three taps.
The cost — no encoding for a slide capped at exactly 3 — was surfaced with the
arithmetic and accepted; see Non-Goals and Refinement Decisions.

## 🔍 Refinement Decisions

- **Round 1** — Locked M-A (the cell carries the ray; dial and reach picker
  deleted; `reach` becomes per-direction) over the model-frozen alternative and
  over a two-stage rollout. Locked the board record maker taking **both** the
  placement and the square-painting painter from the room maker. Locked folding the
  separate capture editor into the grid. Locked deleting **all four** read-only
  derived views, including the engine preview.
- **Round 2** — Locked a three-state cell tap (안 감 / 뛰어감 / 미끄러짐) with
  capture moved to a `움직이기 / 잡기` mode toggle, over a six-state single-button
  cycle and over two side-by-side grids. Locked the four non-goals. Locked
  "no shipped piece may fall through to the refusal view" as an acceptance
  criterion rather than a hope, with the refusal view retained as insurance.
- **Measured during the interview** — across `bundled`, `slice` and `gate6a` there
  are **18 pieces**; **17** open in the grid today and the sole refusal is
  `piece.charger` (`maxDistance: 3`).
- **Amended during the `/hm:plan` interview (2026-08-09).** The ring-cell mark was
  put to the author as a choice between an arrow (uniform three taps everywhere)
  and a fourth state on the ring only (uniformity traded for charger). The arrow
  was chosen. Because the arrow consumes the ring cell for "and keeps going", a
  slide capped at exactly 3 loses its encoding — so the original AC-007 ("charger
  becomes editable") was **withdrawn**, the Outcomes paragraph promising it was
  rewritten, and AC-006 was re-aimed from "18/18 open" to "the refusal set is
  exactly `{piece.charger}`". The withdrawal was not silent: the conflict with the
  Round 2 decision was surfaced with the arithmetic and the author chose uniformity
  knowing the cost. AC-007 was **repurposed** rather than deleted, so the one
  undrawable shipped piece still has to survive an unrelated edit byte-for-byte —
  the recorded failure mode this guards is a save that flattens the half the editor
  cannot draw.
- **Not asked** — the test framework, because `vitest.config.ts` and
  `playwright.config.ts` are both present and every prior SPEC in this repo names
  `vitest`. Common-ground term of the §2.5 gate; confidence ≥ 0.95.
