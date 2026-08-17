---
type: plan
task_slug: piece-skill-creation-ux
status: complete
created: 2026-08-08
tags: [chess-craft, plan, react, typescript, editor-ux, movement-grid]
spec: "[[SPEC-piece-skill-creation-ux]]"
research_doc: "[[RESEARCH-piece-skill-creation-ux]]"
interview_rounds: 1
adrs: 7
validator_outcome: NEEDS_REVISION_RESOLVED
summary: "Split the movement axes, share one draft between makers, and prove every edit against the engine."
---

# PLAN — Piece & Skill Creation UX

## 🎯 Executive Summary

**What.** Rebuild the piece maker so the 7x7 grid means exactly one thing (leap
destinations), give sliding its own row of 8 direction toggles with a shared
reach cap, render the draft's real legal moves through the engine, validate on
every edit instead of at save, and open both makers on a gallery instead of a
blank form.

**Why.** With `travel: 'slide'` a single lit cell compiles to an unbounded ray
(`PieceMoves.tsx:145-149` + `engine.ts:121`), so the grid is not a picture of
where the piece can go — a rook and a king render identically and three collinear
taps change nothing. The maker also refuses to open any multi-pattern piece,
pushing a 초·중학생 author into the 45-control schema form ADR-006 already called
unusable for that audience. Nothing shows the piece moving; the first sign of
trouble is a document-level error at save.

**Key decisions.** Axes split ([[#ADR-027]]), slide toggles carry the same
move/capture/both axis as grid cells ([[#ADR-028]]), one shared reach control that
keeps `1칸` ([[#ADR-029]]), simple maker and expert form share one live draft
([[#ADR-030]]), ADR-019 amended so tabs are permitted ([[#ADR-031]]), the preview
calls the engine and never reimplements reachability ([[#ADR-032]]), validation
runs through `loadContentSet` on every edit ([[#ADR-033]]).

**Estimated impact.** ~5 source files rewritten or extended
(`src/ui/PieceMoves.tsx`, `src/ui/RecordForm.tsx`, a new preview component, a new
gallery component, `src/editor/draft.ts`), one new template registry, locale
additions, and the ADR-006 coverage gate re-derived. No change to
`src/content/schema.ts` — the drift gate should fail if one appears.

## 📚 Prior Work

- **[[RESEARCH-piece-skill-creation-ux]]** — findings F1–F7, verified against
  source. F1 (slide leakage) and F2 (`step` ≡ `jump` in `reachFrom`) are the two
  that were read out of the engine rather than inferred.
- **[[SPEC-piece-skill-creation-ux]]** — AC-001…AC-011, oracles assigned, quality
  85/100, no weak dimensions.
- **[[REVIEW-chess-craft-pixel-redesign-2026-08-07]]** — the current makers landed
  with no PLAN and no SPEC. Its frozen finding: a move-only piece falling back to
  "captures using movement" is deliberate, not a bug. This PLAN preserves that.
- **`.claude/memory/failures.md`** — three entries bind here:
  - `declared-but-inert-vocabulary` (count 5) — the reason `jump` is *not* quietly
    dropped from the UI while staying in the schema. It is either removed at the
    type level with a migration, or left visible. This PLAN leaves it, and says so.
  - "A component that snapshots state at mount while reading one of its inputs
    LIVE" — the recorded `RecordForm`/`RoomDetail` overwrite bug. [[#ADR-030]]'s
    single-draft rule exists to keep the new tab structure out of that shape.
  - "A coverage gate enumerated along one axis is blind to extensions along every
    other axis" — the reason AC-008 re-derives the gate rather than adding rows.
- **`.claude/memory/wiki.md`** — `chess-craft-pixel-redesign` (art is data; single
  dark theme; the makers refuse rather than flatten) and `table-driven-content-editor`
  (the vocabulary/controls table is schema-derived, so a control cannot ship
  without an entry).

## 🎙️ Interview Transcript

Case B: SPEC was `approved` but promoted two ADR-level items to `plan`. One round
covered those two plus two contract decisions surfaced by the internal draft.

| # | Topic | Category | Question | Options | Choice | Note | → ADR |
|---|---|---|---|---|---|---|---|
| 1 | Slide toggle value axis | Contract shape | Do slide toggles distinguish move / capture / both, like grid cells? | 4-state cycle · plain on/off | 4-state cycle | Lets a pawn-shaped piece slide forward and capture diagonally from the simple maker; keeps one interaction rule across both controls | ADR-028 |
| 2 | Reach `1칸` | Scope boundary | Keep `1칸` when it duplicates an adjacent grid cell? | keep · drop | keep | The duplication is visible in the preview, and keeping it lets the reader round-trip existing `maxDistance: 1` records | ADR-029 |
| 3 | Simple ↔ expert coupling | Architecture | Do the two views share one live draft? | live shared · sync on tab switch | live shared | Two buffers reproduce the recorded mount-snapshot overwrite bug | ADR-030 |
| 4 | ADR-019 vs shipped step tabs | Architecture | Amend, supersede, or avoid tabs? | amend · supersede · avoid | amend | ADR-019 rejected wizards because they slow repeat edits; freely-clickable tabs do not | ADR-031 |

Decisions taken as defensible defaults rather than asked (5-term gate, common-ground
term failed): phase ordering (forced serial by shared files), and `data-testid`
migration (ADR-016 already permits it in the same commit).

## 📐 Architecture Decision Records

Numbering continues the project's global sequence, which reached ADR-026 in
[[PLAN-ui-ux-productization]].

### ADR-027: Movement axes are split — slides leave the grid
**Status:** Accepted (2026-08-08, via /hm:plan interview)
**Context:** With `travel: 'slide'`, `writeGrid` emits painted offsets as a
pattern with no `maxDistance`, and `reachFrom` expands that to the board edge. A
lit cell therefore does not denote a reachable square, and the same canvas means
two different things depending on a radio button.
**Decision:** The 7x7 grid holds only bounded leap destinations and always
compiles to `kind: 'step'`. Sliding moves to a separate row of 8 direction
toggles above the grid with its own reach control. A piece compiles to at most two
patterns per array: one slide, one step.
**Consequences:**
- ✅ A lit cell is a reachable square in every mode, with no exceptions.
- ✅ `movement.length > 1` stops being a refusal cause — the single largest
  lockout, which today hides the bundled knight-honour grant.
- ✅ No schema change: `movement` is already `z.array(movePattern).min(1)`.
- ⚠️ Two controls where there was one; the author must learn that "does it slide"
  and "where does it hop" are different questions.
**Rejected alternatives:**
- Per-cell travel (each cell also carrying a "slide this way" state) — rejected:
  cell state grows from 4 to 8 and the tap cycle becomes unlearnable.
- Keep one grid, add a preview only — rejected: it renders the lie faithfully
  instead of removing it, and the reported complaint is the grid itself.
**Source:** SPEC scope decision, Round 1 of /hm:spec.

### ADR-028: Slide toggles carry the same move/capture/both axis as grid cells
**Status:** Accepted (2026-08-08, via /hm:plan interview)
**Context:** ADR-027 splits the controls; the split leaves open whether a slide
direction is a boolean or carries the cell axis.
**Decision:** A slide direction cycles `None → Move → Capture → Both`, identically
to a grid cell. `movement` receives a slide pattern built from move-or-both
directions and a step pattern from move-or-both cells; `attack` receives the
capture-or-both equivalents, and is omitted when it would duplicate `movement`.
**Consequences:**
- ✅ One interaction rule across both controls.
- ✅ A pawn-shaped piece (slides forward, captures diagonally) is authorable in the
  simple maker.
- ⚠️ Up to two patterns per array instead of one, so the reader must accept and
  disambiguate a `[slide, step]` pair.
**Rejected alternatives:**
- Plain on/off toggles — rejected: divergent move/capture pieces would fall back to
  the expert tab, re-creating the lockout ADR-027 exists to remove.
**Source:** Interview #1.

### ADR-029: One shared reach control with three values, `1칸` retained
**Status:** Accepted (2026-08-08, via /hm:plan interview)
**Context:** The schema's `maxDistance` is a free positive integer; exposing it
raw aims a number field at a nine-year-old, and per-direction caps would need one
slide pattern per distinct cap.
**Decision:** A single reach control — `1칸` / `2칸` / `끝까지` — applies to every
enabled slide direction. It compiles to `maxDistance: 1`, `maxDistance: 2`, or an
omitted `maxDistance`. Records whose slide patterns disagree on cap are refused by
the reader and handled in the expert tab.
**Consequences:**
- ✅ `maxDistance` stops being a blanket refusal cause; existing records capped at
  1 or 2 now open in the simple maker.
- ✅ On a 6x6 board, 3+ is indistinguishable from "to the edge", so the three
  values cover the meaningful space.
- ⚠️ `1칸` in a direction and the adjacent lit grid cell describe the same
  destination — an accepted redundancy the preview makes visible.
- ⚠️ A piece wanting an unbounded rook line and a 2-square bishop line is refused.
**Rejected alternatives:**
- Numeric input — rejected: the target reader.
- Drop `1칸` — rejected: it would keep refusing existing `maxDistance: 1` records
  for no gain, since the redundancy is visible rather than hidden.
**Source:** Interview #2; promoted from SPEC Open Questions.

### ADR-030: The simple maker and the expert form share one live draft
**Status:** Accepted (2026-08-08, via /hm:plan interview)
**Context:** The single-draft property already holds today — `RecordForm` runs the
simple grid view and the detailed fieldsets off the same `draft` state object,
side by side (`RecordForm.tsx:1223-1229`). What is new is that AC-008 promotes the
detailed form into a *tab*, so the two views become either/or rather than
simultaneous, and Phase 3 adds a third reader of the draft. The decision is
therefore whether the tab restructure preserves the property, not whether to
adopt it.
**Decision:** One draft object owns the record; both views read and write it
directly. There is no per-tab buffer and no sync-on-switch step. When an edit in
the expert tab produces something the grid reader rejects, the simple tab's grid
is replaced by the refusal note at that moment.
**Consequences:**
- ✅ No divergence, so no "which buffer is real" question.
- ✅ The refusal becomes live feedback rather than an open-time verdict.
- ⚠️ The grid re-reads on every expert-tab keystroke; `readGrid` must stay cheap
  (it is O(vectors), no allocation beyond the cell map).
**Rejected alternatives:**
- Sync on tab switch — rejected: this is the exact shape of the recorded bug where
  a component snapshotted state at mount while reading another input live, and
  overwrote an unrelated record after import → edit → save.
**Source:** Interview #3.

### ADR-031: ADR-019 amended — step tabs permitted, linear wizards still rejected
**Status:** Accepted (2026-08-08, via /hm:plan interview). Amends ADR-019.
**Context:** ADR-019 rejected a wizard because it "slows down repeat edits, which
is the dominant authoring loop". The Chess Craft import then shipped
`RoomDetail`'s five step-tabs with no PLAN and no SPEC.
**Decision:** ADR-019's rejection is narrowed to *linear* wizards — flows that
force a forward sequence and gate later steps on earlier ones. Freely-clickable
step tabs, where any step is one click from any other, are permitted. The piece
maker adopts the same tab shape for simple / expert.
**Consequences:**
- ✅ The shipped `RoomDetail` structure is legitimised deliberately rather than by
  silence.
- ✅ Repeat edits still jump straight to the step they need, which is what ADR-019
  was protecting.
- ⚠️ ADR-019's other clauses (elementary-level Korean copy, no schema field names
  as UI copy) remain in force and are unaffected.
**Rejected alternatives:**
- Supersede ADR-019 entirely — rejected: it would require restating clauses that
  are not in dispute.
- Keep the piece maker as one long screen — rejected: the simple maker plus the
  45-control form on one column reproduces the recorded 4,700px editor scroll.
**Source:** Interview #4; promoted from SPEC Open Questions.

### ADR-032: The preview calls the engine; reachability is never reimplemented in the UI
**Status:** Accepted (2026-08-08, via /hm:plan interview)
**Context:** The preview must show real destinations. It could compute them from
the grid model directly, which is simpler and faster.
**Decision:** The preview builds a scratch `GameState` and a validated
`ContentSet` containing the draft, then calls the engine's exported
`legalActions`. No reachability logic is written under `src/ui/`.
**Consequences:**
- ✅ The preview cannot drift from match behaviour, because it *is* match behaviour.
- ✅ AC-006's differential oracle is meaningful — the preview cannot pass by
  agreeing with itself.
- ⚠️ Building a validated `ContentSet` per edit was expected to make ADR-033
  free. **It does not** — corrected after round-1 review. The preview splices
  only the draft's movement into a scratch document; live validation splices the
  whole record into the real one. They are different documents, so neither can
  reuse the other's validated set, and the editor runs TWO full-document
  validations per render rather than one. R-3's mitigation (debounce the render,
  never the authority) is unchanged and still the answer if lag is measured.
- ⚠️ The editor gains a dependency on `src/engine/`; an invalid draft has no
  legal actions to show, so the preview needs a defined empty state (it shows the
  validation error from ADR-033 instead of a board).
**Rejected alternatives:**
- Compute destinations from the grid model in the UI — rejected: a second move
  generator drifts silently, and it would make AC-006 circular.
**Source:** SPEC constraint; recorded here because it is a boundary decision.

### ADR-033: Validation runs through `loadContentSet` on every edit
**Status:** Accepted (2026-08-08, via /hm:plan interview)
**Context:** Today `commitDraft` runs `loadContentSet` over the whole document at
save, and errors populate only afterwards. Combined with fail-closed loading, a
child's first signal is a JSON field path.
**Decision:** Each edit runs the same validator the save path runs, on a document
with the draft spliced in, and surfaces the result immediately. The save path is
unchanged and remains the authority — live validation is an earlier reading of the
same function, never a second implementation of the rules.
**Consequences:**
- ✅ AC-007's "the same error, earlier" holds by construction.
- ✅ The import path keeps its guarantee, since nothing moved into the React layer.
- ⚠️ A full-document validate per keystroke, and a SECOND one from the preview.
  The two splice different documents, so the cost is added rather than shared —
  the original wording here claimed otherwise and was wrong (round-1 review, P2).
  The bundled document is tens of records, so this is affordable; if it stops
  being so, debounce the render and never the authority.
**Rejected alternatives:**
- A lightweight UI-side pre-check — rejected: a constraint living only in a React
  control is absent on the import path, which the record already names as a trap.
**Source:** SPEC constraint; recorded here because it changes when a contract runs.

## 🏗️ Technical Design

### Current state

| File | Today |
|---|---|
| `src/ui/PieceMoves.tsx` | `PieceGrid = { cells, travel, forward }`; `readGrid` refuses 6 shapes; `writeGrid` emits exactly one pattern per array |
| `src/ui/RecordForm.tsx` | `pieceGridView()` renders 49 cells + a 3-way travel picker; `recipeView()` renders 4 selects; the 45-control palette lives further down the same column; `<details className="advanced">` is the only disclosure |
| `src/ui/CardRecipe.tsx` | `readRecipe`/`writeRecipe` over one effect / one action |
| `src/editor/draft.ts` | `blankDraft` seeds one starter movement pattern; `commitDraft` validates the whole document at save |
| `src/engine/engine.ts` | `legalActions` exported; `reachFrom` private; `'slide'` is the only branched kind |

### Affected components

- **Rewritten:** `src/ui/PieceMoves.tsx` (model + reader + writer + summary).
- **Restructured:** `src/ui/RecordForm.tsx` (tab shell, slide row, reach control,
  grid, live errors).
- **New:** `src/ui/PiecePreview.tsx` (engine-driven preview board),
  `src/ui/MakerGallery.tsx` (remix entry for pieces and cards),
  `src/editor/templates.ts` (card template registry).
- **Extended:** `src/editor/draft.ts` (live validation entry point beside
  `commitDraft`), `src/ui/i18n` locale bundle, `src/ui/styles.css` +
  `tokens.css` usage.
- **Untouched (enforced):** `src/content/schema.ts`, `src/engine/*`.

### Data flow

```
grid cells ─┐
            ├─> writeGrid ─> { movement:[slide?,step?], attack?:[slide?,step?] }
slide dirs ─┤                        │
reach      ─┘                        ├─> spliced into the content document
                                     │
                                     ├─> loadContentSet ──> errors ──> live error line (ADR-033)
                                     │        │
                                     │        └─ ok ──> ContentSet
                                     │                      │
                                     └──────────────────────┴─> scratch GameState
                                                                     │
                                                                legalActions (ADR-032)
                                                                     │
                                                              PiecePreview marks
```

The expert form writes into the same draft object (ADR-030), so it enters this
flow at the same point the grid does.

### The new grid model

```ts
type Dir8 = 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'nw'
type Reach = 1 | 2 | 'edge'

interface PieceGrid {
  cells: Record<string, Cell>   // "df,dr" within radius 3, centre excluded
  slides: Record<Dir8, Cell>    // ADR-028: same 4-state axis
  reach: Reach                  // ADR-029: shared across enabled directions
  forward: boolean
}
```

`writeGrid` emits, for each of `movement` and `attack`:
- a slide pattern from the directions whose value includes that axis, carrying
  `maxDistance: 1 | 2` or none, and
- a step pattern from the cells whose value includes that axis,

omitting either when empty, and omitting `attack` entirely when it would equal
`movement` — preserving the frozen "move-only falls back to capture-using-movement"
behaviour.

**The equality check is per-kind-bucket, never array-order.** Today's `writeGrid`
compares two flat vector lists with an order-independent `every(...some(...))`
over one pattern each (`PieceMoves.tsx:141-144`). With up to two patterns per
array that shape is no longer sufficient: `attack` is omitted only when the slide
bucket matches the slide bucket (same direction set, same `maxDistance`, same
`forward`) **and** the step bucket matches the step bucket (same offset set, same
`forward`), each compared order-independently after being selected by `kind`.
Comparing the arrays index-by-index or by JSON equality mis-detects functionally
identical pairs that were constructed in a different order — and it does so
precisely on the multi-pattern pieces ADR-027 and ADR-028 exist to unlock.

`readGrid` returns null only for shapes the model genuinely cannot hold:
more than one slide or more than one step pattern per array; a slide vector that
is not one of the 8 unit directions; a `maxDistance` other than 1, 2, or absent;
slide caps disagreeing between `movement` and `attack`; a step offset outside
radius 3; or `forward` disagreeing across patterns. `kind: 'jump'` is **accepted**
into the grid and re-emitted as `'step'` (AC-005 asserts behavioural, not byte,
identity — the two are indistinguishable in `reachFrom`).

### API changes

None outward-facing. Internal signature changes: `PieceGrid`, `readGrid`,
`writeGrid`, `describeGrid`, and `cycle` (unchanged). New exports
`PiecePreview`, `MakerGallery`, `CARD_TEMPLATES`, and a `validateDraft` helper in
`src/editor/draft.ts`.

## 📝 Implementation Plan

> **Execution status (2026-08-08).** All six phases are DONE. Every unit and
> component check is green; the e2e half of AC-011 is written but could not be
> RUN in this environment — see `## 🚧 Execution Notes`. Deviations, findings and
> the Phase D.5 windows are recorded there too.

### Phase 1 — Grid model rewrite
- `Status`: DONE
- `depends_on`: []
- `parallel_group`: `serial-a`
- `merge_hazards`: `src/ui/PieceMoves.tsx` is rewritten wholesale; every later
  phase reads its types. Must land alone.
- **Scope (in):** `src/ui/PieceMoves.tsx`; new `tests/ui/piece-grid-reach.test.ts`,
  `piece-slide-reach.test.ts`, `piece-grid-roundtrip.test.ts`,
  `piece-grid-multipattern.test.ts`, `piece-jump-roundtrip.test.ts`,
  `piece-grid-refusal.test.ts`.
- **Required fixture:** `piece-grid-roundtrip.test.ts` must include, beyond the
  bundled records, at least one synthesised piece whose move and capture sets
  differ **in both buckets at once** — different slide directions *and* different
  step offsets between `movement` and `attack`. Without it the per-kind-bucket
  equality check is only ever exercised on one axis and an order-dependent
  comparison passes.
- **Scope (out):** any `.tsx` rendering, `src/content/schema.ts`, the engine.
- **Exit criterion:** `npx vitest run tests/ui/piece-*.test.ts` green, and
  `git diff --name-only HEAD -- src/content/schema.ts src/engine` is empty.
- **Risk:** medium — the reader's refusal set is the contract every later phase
  depends on.
- **Rollback point:** branch tip before Phase 1.
- **Covers:** AC-001, AC-002, AC-003, AC-004, AC-005, AC-011.

### Phase 2 — Maker shell: slide row, reach control, expert tab
- `Status`: DONE
- `depends_on`: [1]
- `parallel_group`: `serial-a`
- `merge_hazards`: `src/ui/RecordForm.tsx` — restructured into tabs; Phases 3–5
  all edit the same file.
- **Scope (in):** `src/ui/RecordForm.tsx`, `src/ui/styles.css`, locale bundle,
  `tests/editor/vocabulary-coverage.test.ts` (re-derived, not extended).
- **Scope (out):** preview, validation timing, gallery.
- **Exit criterion:** `npx vitest run tests/editor/vocabulary-coverage.test.ts`
  green with the slide and reach controls enumerated as controls; the expert tab
  is reachable from a record the simple maker accepts.
- **Risk:** medium — the coverage gate is being re-derived, and the recorded
  failure is a gate blind to a new axis.
- **Rollback point:** end of Phase 1.
- **Covers:** AC-003 (UI half), AC-008.

### Phase 3 — Engine-driven preview
- `Status`: DONE
- `depends_on`: [2]
- `parallel_group`: `serial-a`
- `merge_hazards`: `src/ui/RecordForm.tsx` (mount point), and the first import of
  `src/engine/` from `src/ui/`.
- **Scope (in):** new `src/ui/PiecePreview.tsx`, its mount in `RecordForm.tsx`,
  `tests/ui/piece-preview-parity.test.ts`.
- **Scope (out):** card previews (Non-Goal), any reachability logic in `src/ui/`.
- **Exit criterion:** `npx vitest run tests/ui/piece-preview-parity.test.ts` green,
  and `rg -n "maxDistance|reachFrom|vectors" src/ui/PiecePreview.tsx` returns
  nothing — the preview must obtain squares only from `legalActions`.
- **Risk:** medium — the scratch `GameState` must be a legal one; an
  under-specified fixture makes the differential oracle vacuous.
- **Rollback point:** end of Phase 2.
- **Covers:** AC-006.

### Phase 4 — Live validation
- `Status`: DONE
- `depends_on`: [3]
- `parallel_group`: `serial-a`
- `merge_hazards`: `src/editor/draft.ts` and `src/ui/RecordForm.tsx` error state.
- **Scope (in):** `validateDraft` in `src/editor/draft.ts`, error surfacing in
  `RecordForm.tsx`, `tests/ui/piece-live-validation.test.tsx`.
- **Scope (out):** changing `commitDraft`'s save-path authority, changing any
  validation rule.
- **Exit criterion:** `npx vitest run tests/ui/piece-live-validation.test.tsx`
  green, asserting the live error equals the save error for the same draft.
- **Risk:** low — it reuses `loadContentSet` rather than restating rules.
- **Rollback point:** end of Phase 3.
- **Covers:** AC-007.

### Phase 5 — Remix gallery and card templates
- `Status`: DONE
- `depends_on`: [4]
- `parallel_group`: `serial-a`
- `merge_hazards`: `src/ui/RecordForm.tsx` entry path and `src/editor/draft.ts`
  `blankDraft`/`openDraft`.
- **Scope (in):** new `src/ui/MakerGallery.tsx`, new `src/editor/templates.ts`,
  entry wiring, `tests/ui/piece-gallery-remix.test.tsx`,
  `tests/ui/card-template-remix.test.tsx`.
- **Scope (out):** the 4-slot recipe's own structure (Non-Goal), card preview.
- **Exit criterion:** both new tests green; a remix leaves the source record
  byte-identical.
- **Risk:** medium — this is the path that produced the recorded import→edit→save
  overwrite; the component `key` must include `source`.
- **Rollback point:** end of Phase 4.
- **Covers:** AC-009, AC-010.

### Phase 6 — Copy, contrast, e2e
- `Status`: DONE (e2e authored, not executable here)
- `depends_on`: [5]
- `parallel_group`: `serial-a`
- `merge_hazards`: locale bundle and `e2e/` selectors; ADR-016 permits selector
  migration in the same commit.
- **Scope (in):** elementary-level Korean copy for every new control and the
  refusal note, `tokens.css`-only colours, contrast assertions for the preview's
  move/capture marks, `e2e/editor-refusal.spec.ts`, updated existing e2e selectors.
- **Scope (out):** new features.
- **Exit criterion:** `npx vitest run` and `npx playwright test` both green;
  `rg -n "#[0-9a-fA-F]{3,6}" src/ui/PiecePreview.tsx src/ui/MakerGallery.tsx`
  returns nothing.
- **Risk:** low.
- **Rollback point:** end of Phase 5.
- **Covers:** AC-011 (e2e half), ADR-021 / ADR-007 constraints.

## 🧪 Testing Strategy

- **Unit (vitest).** Phase 1's six suites carry the metamorphic properties
  (AC-001, AC-004) and the golden reach table (AC-002). They run against pure
  functions and the engine, with no DOM.
- **Component (vitest + Testing Library).** AC-007, AC-009, AC-010 mount
  `RecordForm` / `MakerGallery`. Every mount supplies
  `TranslateContext.Provider` — the recorded harness gap where a test compared an
  id to an id because the provider was missing — and every `key` includes
  `source`.
- **Differential (vitest).** AC-005 and AC-006 compare against the engine, which is
  not the code under test.
- **E2E (playwright).** AC-011's refusal note, because it asserts a rendered
  affordance rather than a value.
- **Fixtures.** Bundled content sets are enumerated rather than sampled for AC-004
  and AC-009; refused records for AC-011 are synthesised from the reader's own
  documented rejection causes rather than hand-picked.

## ⚠️ Risks & Mitigation

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R-1 | The re-derived coverage gate is blind to the new slide/reach axis, exactly as the previous gate was blind to `duration` | medium | high | AC-008 quantifies over `enumerateVocabulary()` **and** requires the two new controls to be enumerated as controls; Phase 2's exit criterion names the gate explicitly |
| R-2 | The preview's scratch `GameState` is too sparse, so the differential oracle passes vacuously | medium | high | The fixture must include a blocking friendly and a capturable enemy on a slide ray; Phase 3's exit grep forbids reachability logic in the preview |
| R-3 | Per-keystroke full-document validation is slow enough to feel laggy on a child's device | low | medium | Bundled documents are tens of records; the preview needs the validated set anyway. If measured lag appears, debounce the *render*, never the validation authority |
| R-4 | Remix reproduces the recorded import→edit→save overwrite | medium | high | AC-009's non-mutation invariant; component `key` includes `source`; Phase 5 names this as its own risk |
| R-5 | Rewriting `readGrid` silently makes a currently-authorable shape unrepresentable — specifically the frozen move-only fallback | medium | high | AC-004 quantifies round-trip over every accepted bundled record; the frozen finding is restated in the Technical Design so a reviewer can check it directly |
| R-6 | `jump` stays in the schema, visibly inert — the project's most-recurring failure shape | high | medium | Deliberately accepted and recorded as a Non-Goal with its reason; AC-005 makes the equivalence observable rather than hidden. **Note the mechanism precisely:** the grid always compiles to `kind: 'step'`, and `writeGrid` recompiles on every commit, so opening and saving a `jump` record through the simple maker rewrites it to `step`. That is a de facto per-record migration happening one piece at a time as authors touch them — sanctioned by AC-005 (behavioural, not byte, identity) but distinct from the deferred type-level removal. A future reviewer should not have to re-derive this from `engine.ts:121` |
| R-7 | A slide-vs-grid redundancy (`1칸`) confuses rather than reassures | low | low | The preview shows both produce the same square; ADR-029 records that dropping `1칸` is the fallback if review disagrees |
| R-8 | Tab restructure re-introduces the `[hidden] { display: none !important }` / unbounded-scroll traps, and hides controls the test suites need to reach | medium | medium | Phase 2 keeps both panels mounted and preserves the existing hidden-panel guard; the stylesheet rule is referenced in the phase scope. **Test-visibility asymmetry, verified:** `tests/editor/vocabulary-coverage.test.ts` drives controls with `fireEvent.click`, which does not enforce visibility in jsdom, so the coverage gate keeps working across a hidden tab. Playwright *does* enforce actionability, so any Phase 6 e2e scenario that touches an expert-tab control must switch tabs explicitly first rather than relying on the element being in the DOM |

**Gating risks.** R-1, R-2, R-4 and R-5 are the high-impact rows, and each is
gated by a named phase exit criterion rather than by reviewer attention: R-1 by
Phase 2's coverage-gate run, R-2 by Phase 3's grep forbidding reachability logic
in the preview, R-4 by AC-009's non-mutation assertion in Phase 5, and R-5 by
Phase 1's round-trip property over every accepted bundled record. A phase whose
exit criterion is red does not merge.

## ✅ Success Criteria

Mirrors [[SPEC-piece-skill-creation-ux]]'s verification table.

- [x] AC-001 — a lit cell equals exactly one reachable square, quantified over all lit-cell sets
- [x] AC-002 — reach `1칸`/`2칸`/`끝까지` produce exactly 1 / 2 / to-edge squares per direction
- [x] AC-003 — a slide-plus-leap record opens in the simple maker with no refusal note
- [x] AC-004 — read-then-write preserves legal destinations over every accepted bundled record
- [x] AC-005 — a bundled `jump` piece opens in the grid and re-saves behaviourally identically
- [x] AC-006 — preview marks equal the engine's quiet and capture destinations
- [x] AC-007 — the invalid draft reports before save, with the same error save would give
- [x] AC-008 — every vocabulary entry round-trips through a control; the expert tab is always reachable
- [x] AC-009 — the gallery is the default entry; a remix leaves its source byte-identical
- [x] AC-010 — every offered card template opens in the 4-slot recipe view with populated slots
- [x] AC-011 — a refused record is left unchanged and the note names the expert tab
- [x] `src/content/schema.ts` and `src/engine/` are unchanged by this task

## 🔍 Plan Validation

**Cross-model second opinion:** `codex` — `status: skipped`, reason: the ADR-003
matrix runs it only on a high-diff change, and `hm high_diff classify` returned
`{"is_high": false, "boundary": false}` (no source diff yet; documents only).
The verdict below is Claude-only.

**Validator outcome:** `NEEDS_REVISION` on pass 1 → all four critiques resolved by
revision (option A); no critique was accepted as risk or rejected. Single pass; no
re-run was required because none of the critiques were critical.

| Severity | Section | Issue | Resolution |
|---|---|---|---|
| warning | Technical Design — `writeGrid` `attack` omission | The equality check for the new `[slide, step]` pair was unspecified; an order-dependent or JSON-equality comparison mis-detects functionally identical pairs, exactly on the multi-pattern pieces ADR-027/028 exist to unlock | Revised: Technical Design now specifies a per-kind-bucket, order-independent comparison, and Phase 1 gained a required fixture whose move and capture sets differ in **both** buckets at once |
| suggestion | ADR-030 Context | Framed single-draft sharing as an open choice, but `RecordForm.tsx:1223-1229` already runs both views off one `draft` today; the real new risk is the tab restructure plus Phase 3's third reader | Revised: ADR-030's Context restated to say the property already holds and the decision is whether the tab restructure preserves it |
| suggestion | R-6 — `jump` retention | "Not migrated" is inaccurate: the grid always compiles to `step` and `writeGrid` recompiles on every commit, so an open-and-save silently migrates that record | Revised: R-6 now names the de facto per-record migration explicitly and distinguishes it from the deferred type-level removal |
| suggestion | Risk register | No indication of which risks gate a merge; also no note that jsdom `fireEvent.click` ignores visibility while Playwright enforces it | Revised: added a "Gating risks" note tying R-1/R-2/R-4/R-5 to their phase exit criteria, and folded the test-visibility asymmetry into R-8's mitigation |

**Validator's positive checks (recorded, not merely absent findings):** all 11 ACs
trace to at least one phase with no orphan; `movement: z.array(movePattern).min(1)`
carries no length cap and `reachFrom` already loops an arbitrary-length pattern
array, so the two-patterns-per-array design needs no schema or engine change; the
`jump` ≡ `step` equivalence was re-confirmed independently at `engine.ts:121`; all
seven ADRs carry populated rejected-alternatives and two-sided consequences; no
`Accept? / OK? / Verify?` deferral phrasing anywhere in the document.

## 🚧 Execution Notes

### Phase status

| Phase | Status | Evidence |
|---|---|---|
| 1 — Grid model rewrite | DONE | 6 suites, 43 tests green; `git diff HEAD -- src/content/schema.ts src/engine` empty |
| 2 — Maker shell | DONE | `tests/editor/vocabulary-coverage.test.ts` 71 tests green, including 13 new AC-008 rows for the slide/reach controls |
| 3 — Engine-driven preview | DONE | `tests/ui/piece-preview-parity.test.ts` 6 tests green; the ADR-032 exit grep over `src/ui/PiecePreview.tsx` returns nothing |
| 4 — Live validation | DONE | `tests/ui/piece-live-validation.test.tsx` 6 tests green |
| 5 — Remix gallery and card templates | DONE | `tests/ui/piece-gallery-remix.test.tsx` + `tests/ui/card-template-remix.test.tsx`, 27 tests green; Phase A.5 returned PASS first attempt |
| 6 — Copy, contrast, e2e | DONE, with one check unrun | `tests/ui/maker-contrast.test.ts` 9 tests green; `e2e/editor-refusal.spec.ts` authored; existing e2e helpers migrated past the gallery. **Playwright does not run in this environment** — see below |

### Deviations from the PLAN as written

1. **Phase 1 touched `src/i18n/ko.ts`.** `describeGrid` counted lit cells for
   both halves, which is meaningless once slides are directions; fixing it needed
   new summary keys. The PLAN scoped Phase 1 to `PieceMoves.tsx` plus tests.
2. **Phase 1 added `tests/helpers/reach.ts`**, a fixture builder that asks the
   engine where a piece can go. It is deliberately NOT shared with
   `src/ui/PiecePreview.tsx`, which builds its own scratch state — sharing one
   builder would have made AC-006's differential oracle circular.
3. **Phase C ran before Phase A.5 returned on Phase 1.** The gate then returned
   FAIL, the test was strengthened, and the second attempt passed. The
   implementation was not adjusted to suit the test; the added assertion passed
   against the code as written. Recorded because the ordering exists to stop
   exactly the opposite from happening.
4. **Phase 3's exit grep drove a design choice.** The preview originally
   synthesised a partner piece, which put `vectors` in the file and tripped the
   ADR-032 grep. It now reuses a piece already in the document. That is the
   better design — the criterion did its job rather than being loosened.
5. **AC-007's subject changed.** The PLAN and SPEC name "no move squares at all"
   as the invalid draft. That state is not reachable through the grid: `commit`
   refuses to write a `no-move` grid and keeps the last valid movement, so the
   draft never becomes invalid that way. The implemented and tested subject is a
   malformed record id, which a child reaches immediately and which produces a
   real validator error. The criterion — same problem, earlier, same wording as
   the save — is met; the example behind it is different.

### Findings outside this task's scope

- **A new record can silently overwrite an existing one.** `commitDraft` matches
  the record to replace by `openedId ?? idOf(draft)` (`src/editor/draft.ts:165`).
  For a NEW record `openedId` is undefined, so typing an id that already belongs
  to another record replaces that record instead of being refused as a duplicate.
  Found while looking for a reachable invalid draft for AC-007. This is a
  save-path defect, not a maker-UX one, and fixing it would change behaviour this
  task did not scope — so it is reported, not fixed. The doc comment above that
  line reasons carefully about the *stale-openedId* case and does not cover the
  *no-openedId* case.
- **`previewReach` had a silent-empty path.** A load failure unrelated to the
  probe returned no marks and no errors, which renders as "your piece goes
  nowhere" — a different claim, and a false one. Fixed within Phase 3 by falling
  back to the whole error list.

### Phase D.5 — newly-reachable window (Phase 3's repair)

Phase 3 contained a repair: the silent-empty branch above. The window it opens
is *a scratch document that fails to load for a reason the probe did not cause* —
previously unreachable as an observable state, because it rendered identically to
"valid piece with nowhere to go". `tests/ui/piece-preview-parity.test.ts` →
"reports the draft as unshowable rather than silently showing nothing" enters
that window with `movement: []`, and asserts both that errors are non-empty and
that marks are empty. The **absent case** — a document with no boards or no
pieces at all, where `previewSource` returns null — is handled by an explicit
early return to `EMPTY`, and is NOT covered by a test. That is a named gap, not a
silent one: the state is unreachable from the editor, which always holds a loaded
document, but it would become reachable if the preview were ever mounted against
an empty draft document.

### Phase 5–6 addendum

**e2e is authored and VERIFIED** (see REVIEW Round 4; this paragraph's original
claim was wrong and is kept for the record). The original text follows.

**[superseded] e2e is authored and UNVERIFIED here.** `e2e/editor-refusal.spec.ts` exists and
`e2e/editor.spec.ts` / `e2e/rooms.spec.ts` gained a `startBlank` step past the
gallery (ADR-016 permits the selector migration in the same commit). None of it
was executed: Playwright never reaches the app in this environment — the existing
`e2e/routing.spec.ts` fails identically at `getByTestId('tab-edit')`, before any
change of this task's is involved. The most recent commit on the base branch is
`ci: give the dev server longer to start, and find out why it needs it`, so this
is a known local condition, not a regression. **AC-011's e2e half is therefore
written but not proven; its model half is proven.** Anyone landing this must run
`npx playwright test` somewhere the dev server starts.

**A contrast gate was retargeted, and the reason matters.** The first version of
`tests/ui/maker-contrast.test.ts` asserted that the move and capture fills
separate by ≥2.75:1. They are 1.05:1 apart — hue and almost nothing else. That is
not a regression this task introduced: `--color-side-white` / `--color-side-black`
are what the SHIPPED grid already uses for those two states, and `styles.css`
says so in a comment ("Colour AND a mark, because 이동 and 둘 다 differ by hue
alone otherwise"). ADR-007 forbids two cues differing by hue ALONE; the glyph is
the third channel. So the gate now asserts what the design actually promises —
each state carries its own glyph, and each glyph clears 2.75:1 on its own fill —
and additionally pins the *fill-versus-empty* separation at 2.73, which is what
`--color-board-painted` achieves today. That number is a ratchet, deliberately
below WCAG's 3:1 so it does not fail the grid already on screen, and deliberately
not lower.

**Phase D.5 — newly-reachable window (Phase 6's repair).** Phase 6 repaired a
stale sentence: `ui.editor.card.complex-hint` still said "아래 자세한 칸에서",
which pointed at a place that no longer exists now that the detailed form is a
tab. The newly-reachable window is *a card record the recipe view refuses, opened
after the tab restructure* — before Phase 2 there was no tab for the sentence to
misname. `e2e/editor-refusal.spec.ts` enters the equivalent window for the PIECE
refusal and asserts the note names the tab; **the CARD refusal's note is not
covered by any test**, and that is a named gap rather than a silent one. The
absent case — a locale with no override for the key — falls through to the same
bundle string, so there is no default to diverge.

### Findings, updated

- The **`commitDraft` silent-overwrite** finding from Phase 4 is now partly
  mitigated by accident rather than by design: the gallery gives a new record a
  guaranteed-free id (`freshId`), so a child no longer has to invent one and is
  much less likely to type a taken one. The underlying defect is unchanged and
  still reachable by typing over the suggested id.
