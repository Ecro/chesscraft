---
type: spec
task_slug: piece-skill-creation-ux
status: approved
created: 2026-08-08
tier: 2
tags: [chess-craft, spec, react, typescript, editor-ux, movement-grid]
test_framework: vitest
research_doc: "[[RESEARCH-piece-skill-creation-ux]]"
summary: "Make the piece maker's grid mean one thing, and prove every edit against the real engine."
---

# SPEC — Piece & Skill Creation UX

## 🎯 Intent

The piece maker's 7x7 grid is not a picture of where a piece can go. With
`travel: 'slide'` a single lit cell compiles to an unbounded ray
(`PieceMoves.tsx:145-149` + `engine.ts:121`), so the same 49-cell canvas means two
unrelated things depending on a radio button beneath it, a rook and a king look
identical on screen, and painting three cells in a line is three taps that change
nothing. The maker also refuses to open any piece with more than one movement
pattern, dumping a 초·중학생 author into the 45-control schema form that ADR-006
already recorded as unusable for that audience. Nothing anywhere shows the piece
actually moving, and the first signal that a record is invalid is a document-level
error at save time.

This SPEC makes the grid mean exactly one thing, gives sliding its own control,
and makes every edit provable by rendering the draft's real legal moves through
the existing engine.

## 🌅 Outcomes

A child using the piece maker can:

- Read the grid literally — a lit cell is a square the piece can reach, in every
  mode, with no exceptions.
- Decide "does it slide?" and "where does it hop?" as two separate, separately
  visible questions, and cap a slide at 1 square, 2 squares, or the board edge.
- Build a piece that both slides and hops without the maker refusing to open.
- Watch a preview board light up the piece's actual destinations — the same
  squares the match will allow — updating as they edit.
- See a problem the moment they cause it, not at save.
- Start from an existing piece ("make one like this") instead of an empty form,
  and start a card from a filled-in template.

What they could not do before: any of the above.

## 📋 In-Scope Scenarios

### AC-001: A lit grid cell is exactly one reachable square

**Given** a draft piece whose grid has an arbitrary set of lit cells and no slide
directions enabled
**When** the draft is compiled and its reach is computed on an otherwise empty
board
**Then** the set of reachable squares equals exactly the set of lit offsets —
neither a superset (no ray leakage) nor a subset
**And** this holds for every lit-cell set the grid can express, not for a chosen
example

### AC-002: A slide direction with a reach cap produces exactly that many squares

**Given** a draft piece with one or more of the 8 slide directions enabled and a
reach of `1칸`, `2칸`, or `끝까지`
**When** the draft is compiled and its reach is computed on an otherwise empty
board with the piece at a square far from every edge
**Then** each enabled direction yields exactly 1, exactly 2, or squares to the
board edge respectively
**And** enabling a direction never changes the squares any grid cell contributes

### AC-003: A piece that both slides and hops opens in the simple maker

**Given** a stored piece record carrying two movement patterns — one `slide` and
one `step`/`jump` — such as the knight-honour grant in the bundled set
**When** the piece maker opens that record
**Then** the simple maker opens it, with the slide directions reflected in the
toggles and the leap offsets lit in the grid
**And** the refusal note (`editor-moves-complex`) is not shown

### AC-004: Opening and re-saving never changes what a piece does

**Given** any piece record the simple maker accepts
**When** it is opened into the maker and immediately saved with no edit
**Then** the piece's legal destinations, from every square on the board and
against every occupancy the fixture covers, are identical before and after
**And** this holds for every accepted record, not for a chosen example

### AC-005: A `jump` piece opens in the grid and re-saves behaviourally identically

**Given** a stored piece record using `kind: 'jump'` (e.g. the bundled knight)
**When** it is opened into the maker and saved with no edit
**Then** the maker showed its offsets as lit grid cells rather than refusing
**And** the saved record's legal destinations are identical to the original's,
compared against the engine — the record's bytes are permitted to differ

### AC-006: The preview shows the engine's own legal destinations

**Given** a draft piece placed on the preview board with the fixture's friendly
and enemy occupants
**When** the preview renders
**Then** the squares it marks as move-destinations and as capture-destinations
are exactly those the engine reports for that piece in that position
**And** the preview updates after each grid or slide-toggle edit without a save

### AC-007: An invalid draft is reported before save, not at save

**Given** a draft piece in a state the content validator rejects (e.g. no move
squares at all)
**When** the author makes the edit that causes it
**Then** an error naming the problem in the maker's own words appears without the
author pressing save
**And** pressing save afterwards reports the same problem, not a different one

### AC-008: Every vocabulary entry stays reachable, from an always-open expert tab

**Given** the full editor vocabulary
**When** the record form is open on any record kind
**Then** the expert tab is reachable without the simple maker having refused
anything
**And** for every vocabulary entry, a control exists that inserts it and
round-trips it — the ADR-006 coverage gate re-derived against the new control set,
including the slide toggles and reach cap as controls

### AC-009: The maker opens on a gallery, and a remix does not mutate its source

**Given** the author starts a new piece
**When** the maker opens
**Then** a gallery of existing pieces is shown as the primary path and a blank
piece is offered as one option among them
**And** choosing "make one like this" creates a new library record whose id
differs from the source, leaving the source record byte-identical

### AC-010: A card starts from a filled-in template

**Given** the author starts a new rule or skill card
**When** the maker opens
**Then** a set of pre-filled template cards is offered, each of which the 4-slot
recipe view can open without refusing
**And** choosing one produces a new draft whose recipe slots are populated, not
empty

### AC-011: What the maker still cannot hold, it refuses by name

**Given** a stored piece record the redesigned simple maker cannot round-trip
(e.g. two slide patterns with different reach caps)
**When** the piece maker opens that record
**Then** the maker refuses rather than flattening it, and the record's stored
movement is unchanged after the refusal
**And** the refusal names the expert tab as the place that can hold it

## 🚫 Non-Goals

- **Any schema change.** No `schema_version` bump, no content migration. The
  redesign compiles to the movement model that exists today.
- **Retiring `kind: 'jump'`.** The engine does not distinguish it from `'step'`
  (`engine.ts:121` branches on `'slide'` only), which is a real defect — but
  removing it properly is a type-level removal plus a migration of the bundled,
  slice, and gate6a content. Recorded as follow-up; out of scope here.
- **Making "moves but never captures" authorable.** `attack` carries `.min(1)`;
  encoding an empty capture set is a schema change, and a prior review froze the
  current fallback deliberately.
- **A card effect preview.** A movement preview needs a board; an effect preview
  needs a designed game situation. Out of scope.
- **Widening the recipe to `not` / `all` / `any` / `swap_pieces`.** The card path
  gets template remix only.
- **Widening the grid past 7x7.** Off-grid offsets are unauthorable on a 6x6
  board; widening addresses the one lockout cause that almost never fires.
- **Balance, budgets, or grading.** That is `PLAN-custom-piece-skill-balance`'s
  scope and carries its own unlanded SPEC amendment.
- **Editor undo/redo.** Already deferred (R9); still deferred.
- **A measurable reading-level gate on Korean copy.** Previously declined as a
  hard gate; it stays advisory.
- **Online / multi-device anything.** No server, no account, hot-seat only.

## ⚠️ Constraints

| Constraint | Value | Rationale |
|---|---|---|
| Test framework | `vitest` (unit + component), `@playwright/test` for e2e only | The repo's existing suites (`vitest.config.ts`, `playwright.config.ts`); engine and grid logic are pure, so the oracles below run in vitest without a browser |
| Content schema | `schema_version` unchanged; `src/content/schema.ts` untouched | Chosen scope — editor-only. Any diff to `schema.ts` fails the drift gate |
| Move generation | The preview MUST call the engine; no reachability may be reimplemented in `src/ui/` | A second generator drifts from `reachFrom` silently |
| Vocabulary coverage | ADR-006 gate re-derived against the new control set, not extended row-wise | A gate enumerated along one axis is blind to the others — the recorded failure |
| Validation boundary | Every constraint also holds on the import path via `loadContentSet` | The editor form is not a security boundary; a React-only cap is absent on import |
| Fail-closed loading | Unchanged — invalid content still refuses to load and names id + field path | AC-011 of the parent SPEC |
| Colour / contrast | New controls use `tokens.css` custom properties only; no literal colour; existing contrast floors apply to the preview's move/capture marks | ADR-021, ADR-007 |
| Board rendering | Preview is a DOM grid, not Canvas | ADR-009 |
| Content coupling | Preview may not switch on `pieceId`; it reads the draft record | ADR-011 / ADR-017 |
| Room model | A remix creates a library record; rooms stay reference sets | ADR-025 |
| Player-facing text | All new copy is i18n-keyed in the locale bundle | AC-016 of the parent SPEC |
| Component identity | Any new maker component's React `key` includes `source`, not only the record | The recorded import→edit→save overwrite bug |
| Target reader | Korean copy aimed at an elementary reader; schema field names never appear as UI copy | ADR-019 |

## ✅ Verification Criteria

| Scenario | Verification mode | Test name / manual step | Oracle source | Oracle evidence |
|---|---|---|---|---|
| AC-001 | unit (property) | `tests/ui/piece-grid-reach.test.ts` | property | Metamorphic: compile-then-reach must be the identity on the lit-offset set. Holds regardless of how the compiler is written, so it cannot be satisfied by reading the compiler. |
| AC-002 | unit (parametric) | `tests/ui/piece-slide-reach.test.ts` | golden | Golden table hand-derived from the board geometry (a 6x6 board, piece at c3, direction N: reach 1→{c4}, 2→{c4,c5}, edge→{c4,c5,c6}), written before the control exists. |
| AC-003 | unit | `tests/ui/piece-grid-multipattern.test.ts` | golden | The fixture is the bundled knight-honour grant record at `src/content/sets/bundled.ts:532`, which predates this change — its shape was not chosen to make the test pass. |
| AC-004 | unit (property) | `tests/ui/piece-grid-roundtrip.test.ts` | property | Metamorphic: `legalActions(write(read(r))) == legalActions(r)` over every record the reader accepts. An implementation-independent invariant; a compiler that drops a pattern breaks it. |
| AC-005 | unit (differential) | `tests/ui/piece-jump-roundtrip.test.ts` | differential | The pre-edit record is the reference implementation: the engine is run against both the original and the re-saved record and the destination sets compared. Byte equality is explicitly not the oracle. |
| AC-006 | unit (differential) | `tests/ui/piece-preview-parity.test.ts` | differential | The engine's `legalActions` is the reference; the preview's rendered marks are compared against it. The preview cannot pass by agreeing with itself. |
| AC-007 | component | `tests/ui/piece-live-validation.test.tsx` | golden | The expected error is the existing `loadContentSet` error for that record shape, captured from the validator before the UI change — the UI must surface that specific one, not any error. |
| AC-008 | unit | `tests/editor/vocabulary-coverage.test.ts` | property | Universal quantification over `enumerateVocabulary()`: for every entry, some control inserts it and round-trips it. Derived from the schema, so it cannot drift with the control table. |
| AC-009 | component | `tests/ui/piece-gallery-remix.test.tsx` | property | Invariant: the source record is byte-identical before and after a remix, and the new id differs — a non-mutation property independent of how remix is implemented. |
| AC-010 | component | `tests/ui/card-template-remix.test.tsx` | property | Invariant: every offered template satisfies `readRecipe(t) !== null`, quantified over the whole template set rather than a sampled one. |
| AC-011 | unit + e2e | `tests/ui/piece-grid-refusal.test.ts`, `e2e/editor-refusal.spec.ts` | property | Invariant: for every record the reader rejects, the stored movement after a refused open is unchanged. Refusal is defined by the reader's own rejection, so the test set is derived, not hand-picked. |

## ❓ Open Questions

None blocking. Two decisions were deliberately deferred to `/hm:plan` as ADRs
rather than left ambiguous here:

- **ADR-019 reconciliation** — `RoomDetail` already ships step-tabs against an ADR
  that rejected wizards, and it entered with no PLAN. `plan` should record whether
  the piece maker adopts the same step-tab shape and whether ADR-019 is amended or
  superseded. This changes layout, not acceptance.
- **Reach `1칸` overlaps a grid cell** — a slide direction capped at 1 square and
  an adjacent lit grid cell describe the same destination. Accepted as a harmless
  redundancy the preview makes visible; `plan` may choose to drop `1칸` from the
  reach control if the redundancy proves confusing in review.

## 🔍 Refinement Decisions

- **Step 0** — skip heuristic not met: multi-file, changes `data-testid` contracts,
  and re-derives the ADR-006 coverage gate.
- **Round 1** — Scope locked: editor-only, schema untouched. Movement metaphor
  locked: axes split, slides as toggles outside the grid, grid as leap
  destinations. Preview locked: piece movement only. Detailed 45-control form
  locked: promoted to an always-reachable expert tab.
- **Round 2** — Entry point locked: remix gallery is the default, blank piece is
  one option. Card maker locked: template remix only, no recipe widening, no card
  preview. Reach control locked: `1칸 / 2칸 / 끝까지`. User confirmed no
  reproducible defect outside RESEARCH F1–F7.
- **§2.1.5 Oracle elicitation** — oracle source and evidence assigned per AC by the
  stage rather than interviewed, because every AC fell to `property` (metamorphic
  relations over the compiler) or `differential` (the engine as reference
  implementation) with no live choice to make. No AC uses "the test will check it".
- **§2.5 gate** — test framework skipped on common-ground (repo ships vitest +
  playwright). ADR-019 reconciliation skipped on common-ground and promoted to a
  `plan` ADR. All other candidates passed 5/5 and were asked.
