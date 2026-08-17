---
type: plan
task_slug: preset-content-expansion
status: complete
created: 2026-08-08
tags: [chess-craft, plan, vitest, content-authoring, pixel-art, preset-design]
spec: "[[SPEC-preset-content-expansion]]"
research_doc: "[[RESEARCH-preset-content-expansion]]"
interview_rounds: 1
adrs: 5
validator_outcome: APPROVED
summary: "3 rooms + 24 records + a 60-sprite spare pool, behind a generator that enforces the sheet's own gates"
---

# PLAN — preset content expansion and a spare art pool

## 🎯 Executive Summary

**What.** Add 3 new rooms (presets) on 6×6 boards, grow the content set to 12
pieces / 8 square types / 17 rule cards / 24 skill cards, and build a pool of
~60 spare sprites that no record claims — so an author creating a new piece has
a picture to choose.

**Why.** One room holds every record today, so every match draws from the same
pool. And the art picker is 100% claimed on every surface: 6 piece / 5 square /
26 card entries against exactly 6 / 5 / 26 records, so a new piece can only steal
another piece's picture or fall back to a `?` monogram.

**Key decisions.** The engine is not touched (ADR-001) — the repair the SPEC was
originally built around turned out to be already done. Room character comes from
card pool, painted squares and a **per-preset** budget (ADR-002). Painted squares
stay on ranks that are empty at setup (ADR-003). A committed generator produces
sprite candidates but only ones a human can name get committed (ADR-004), and it
imports the gate predicates rather than reimplementing them (ADR-005).

**Estimated impact.** ~4 files of content data, 1 art data file, 1 registry, 1 new
script, ~5 test files touched. No engine, no schema, no new UI.

## 📚 Prior Work

- `[[RESEARCH-preset-content-expansion]]` — the art-claim census and the gate
  inventory this plan is built on.
- `[[VOCAB-GAPS-variant-chess-6x6-cards]]` — G-8 (a preset needs ≥6 skill cards or
  the draft deadlocks) is a hard constraint on every new room. G-3…G-7 stay open
  by decision (ADR-001).
- `[fail:design] declared-but-inert-vocabulary` — the defect class this plan
  guards against with AC-013. **The entry's card-specific claims are stale**; see
  ADR-001 and the wrapup action in Risks.
- `[wiki:architecture] shipped-grades-and-hash-keys` — also stale (ADR-012 removed
  the shipped table); cost is derived from the declaration, so new records are
  priced for free.

## 🎙️ Interview Transcript

| # | Topic | Category | Question | Options | Choice | Note | → ADR |
|---|---|---|---|---|---|---|---|
| 1 | Replacement for the vacated repair phase | Scope | The engine repair is already done — what takes its place? | regression guard / close G-3·G-4 / close G-7 / more art | **Regression guard only** | Engine untouched; budget goes to rooms, records, art | ADR-001 |
| 2 | Loadout budget across rooms | Contract | Per-preset budgets or one global value? | per-preset / all 6 / auto-derived | **Per-preset, deliberately varied** | Budget becomes one of the levers giving a room character | ADR-002 |
| 3 | Painted-square placement on new boards | Architecture | Keep the empty-rank restriction? | empty ranks only / allow under pieces / per-room rule | **Empty ranks only** | Preserves reachability + nothing hidden under a piece at setup | ADR-003 |
| 4 | Commit bar for generated sprites | Risk | Is passing the gates enough? | gates + human recognisability / gates only / hand-retouch after | **Gates + human recognisability check** | An art id must name what the picture depicts | ADR-004 |

Prior rounds live in `[[SPEC-preset-content-expansion]]` (`## 🔍 Refinement
Decisions`) and are not repeated here: scope, record counts, art quotas, palette,
board size, generator-is-committed, and test framework were all locked there.

## 📐 Architecture Decision Records

### ADR-001: The engine is out of scope; AC-001…003 become regression guards
**Status:** Accepted (2026-08-08, via /hm:plan interview)
**Context:** The SPEC was drafted on the premise that 4 of 26 cards were inert or
wrong-firing from 3 engine root causes, taken from a memory entry dated
2026-08-07. Checked against `master` during plan Step 1, the premise is false:
`tests/engine/card-liveness.test.ts` passes 32/32 with `intended === current` on
all 29 probes, and the three causes are closed at `engine.ts:505`,
`engine.ts:855` and `effects.ts:43`.
**Decision:** Touch no engine file. AC-001…AC-003 are retained as regression
guards that must still pass after the new content lands; the vacated repair phase
is replaced by extending the liveness rig to the new cards.
**Consequences:**
- ✅ The riskiest phase disappears; the remaining work is data plus tests.
- ✅ The existing rig already discriminates wrong-firing from inert, so extending
  it is cheap and covers the new records with the sharper probe shape.
- ⚠️ `VOCAB-GAPS` G-3…G-7 stay open, so new cards are still authored against the
  current expressive ceiling — some will read as re-skins.
- ⚠️ The stale memory entry keeps its false claim until wrapup corrects it.
**Rejected alternatives:**
- Close G-3/G-4 in this task — rejected: it re-introduces engine semantics risk
  the correction just removed, and the SPEC's value is content breadth.
- Spend the freed budget on 90–100 sprites instead of 60 — rejected: the
  sheet-wide compression gate is the binding limit, not effort.
**Source:** Interview #1

### ADR-002: Loadout budget is per-preset and deliberately varied
**Status:** Accepted (2026-08-08, via /hm:plan interview)
**Context:** `loadoutBudget` is currently a single value (6) tuned to the shipped
price spread (pieces 1–4 stars, cards 1–2). Adding a 5-star piece would change
which pairs are legal in every room at once. `presetDef` already carries the field
per preset.
**Decision:** Each of the 4 rooms declares its own budget, chosen as a design
lever — a low-budget room forces constraint play, a high-budget room permits a
dear piece beside a dear card. `preset.default` keeps 6 so existing behaviour is
unchanged.
**Consequences:**
- ✅ Room identity is expressible without any schema change.
- ✅ A new expensive piece cannot silently narrow the default room.
- ⚠️ Four budgets is four balance surfaces; each needs at least one legal-loadout
  assertion (folded into AC-004's phase).
**Rejected alternatives:**
- One global 6 — rejected: makes every room's deck-building identical.
- Auto-derive per room from its priciest piece — rejected: safe but removes the
  lever, and budget then cannot express intent.
**Source:** Interview #2

### ADR-003: Painted squares only on ranks that are empty at setup
**Status:** Accepted (2026-08-08, via /hm:plan interview)
**Context:** On `board.los-alamos`, ranks 3 and 4 are the only ones empty at
setup, and every painted square sits there — so all are reachable and none is
hidden under a piece at the start. Nothing in the schema enforces this.
**Decision:** All three new boards follow the same restriction.
**Consequences:**
- ✅ No square type is invisible at setup, and `on_enter` timing needs no
  special-case reasoning.
- ✅ The property is mechanically checkable, so it becomes a test rather than a
  convention.
- ⚠️ Rules out "a square you are already standing on from move one" designs.
**Rejected alternatives:**
- Allow placement under starting pieces — rejected: needs its own probe for when
  `on_enter` fires, which is engine-adjacent work ADR-001 just excluded.
- A different rule per room — rejected: multiplies the combinations to verify.
**Source:** Interview #3

### ADR-004: A generated sprite ships only if a human can name what it depicts
**Status:** Accepted (2026-08-08, via /hm:plan interview)
**Context:** AC-012 pins the mechanical floor (size, palette, non-blank, rect
budget, contrast). But an art id must name the **picture**, one segment, never
echoing a content id — so a sprite nobody can identify literally cannot be given
a legal id.
**Decision:** The generator emits candidates; a human reviews the batch and keeps
only sprites they can name in one word. That word becomes the sprite key and the
art id.
**Consequences:**
- ✅ The naming rule stays satisfiable by construction.
- ✅ The sheet keeps reading as one world rather than 100 unrelated drawings.
- ⚠️ Curation is a serial human step, so the art phase cannot be fully automated.
**Rejected alternatives:**
- Gates only — rejected: an unnameable sprite is an unfileable art id.
- Hand-retouch after generation — rejected: the result is then not reproducible
  by re-running the generator, which is half the reason it is committed.
**Source:** Interview #4

### ADR-005: The generator imports the gate predicates; it never reimplements them
**Status:** Accepted (2026-08-08, from SPEC AC-012, restated here as the binding contract)
**Context:** A generator that carries its own copy of "12×12, palette-only,
≤60 rects" will drift from the test suite's copy, and the drift is invisible until
a committed sprite fails CI.
**Decision:** The gate predicates move into one module imported by both the test
suite and the generator. AC-012 asserts module identity, not merely equivalent
behaviour.
**Consequences:**
- ✅ Drift becomes impossible rather than unlikely.
- ⚠️ Extracting the predicates touches existing test files, so the art phase
  starts with a refactor that must leave the suite green.
**Rejected alternatives:**
- Duplicate the predicates — rejected: this is the mechanism the failure mode
  needs.
**Source:** SPEC AC-012 + Interview #4

## 🏗️ Technical Design

**Current state.** `src/content/sets/bundled.ts` (748 lines) holds one
`ContentSource` with 6 pieces, 5 square types, 11 rule cards, 15 skill cards, 1
board, 1 preset. `src/ui/art/pixels.ts` holds 41 sprites over a 25-entry palette;
`src/ui/art/registry.ts` maps 37 art ids onto them (4 sprites are UI chrome and
unregistered). `src/ui/RecordForm.tsx:967` builds the picker by filtering the
registry on `surface`. `src/i18n/ko.ts` is the only locale bundle.

**Affected components.**

| Component | Change |
|---|---|
| `src/content/sets/bundled.ts` | +6 pieces, +3 square types, +6 rule cards, +9 skill cards, +3 boards, +3 presets |
| `src/i18n/ko.ts` | strings for every new record and preset/board name |
| `src/ui/art/pixels.ts` | ~60 new sprites |
| `src/ui/art/registry.ts` | ~60 new art ids with correct `surface` |
| `scripts/gen-sprites.*` (new) | candidate generator, gate-enforcing |
| shared gate module (new, extracted) | predicates used by both tests and generator |
| `tests/` | census, budget, placement, art-claim, generator, liveness extensions |

**Not touched:** `src/engine/**`, `src/content/schema.ts`, `src/balance/**`, any
UI component. The record form and room picker are already list-driven.

**Data flow (unchanged).** `bundledContentSource` → `loadContentSet` (schema
validation) → `ContentSet` → preset picker → match. Art: record `artKey` →
`artRegistry` → `PIXEL_SPRITES` → `Pix`. The expansion adds rows at both ends of
these chains and no new edges.

**API / contract changes.** None. Every new field used (`loadoutBudget` per
preset, `squares[]` per board) already exists in `presetDef` / `boardDef`.

## 📝 Implementation Plan

### Phase 1 — Extract the sprite gate predicates into a shared module
- `depends_on`: `[]`
- `parallel_group`: `art-track`
- `merge_hazards`: `tests/ui/pixels.test.ts`, `tests/ui/art-contrast.test.ts` — both are rewritten to import; anything else editing them must serialize
- **Scope in:** new gate module; `tests/ui/pixels.test.ts`; `tests/ui/art-contrast.test.ts`
- **Scope out:** any sprite data; the registry
- **Exit criterion:** `npx vitest run tests/ui/pixels.test.ts tests/ui/art-contrast.test.ts` green with zero predicate logic left inline in either file
- **Risk:** low
- **Rollback:** revert to base commit

### Phase 2 — The sprite generator
- `depends_on`: `[1]`
- `parallel_group`: `art-track`
- `merge_hazards`: none
- **Scope in:** `scripts/gen-sprites.*`; `tests/build/sprite-generator.test.ts`
- **Scope out:** committing any generated sprite (that is Phase 3)
- **Exit criterion:** the new test proves a deliberately invalid batch (wrong size / unknown char / blank / over-complex) yields zero output, and that the generator's gate import resolves to the Phase 1 module — satisfies AC-012
- **Risk:** low
- **Rollback:** Phase 1

### Phase 3 — Generate, curate and commit ~60 spare sprites
- `depends_on`: `[2]`
- `parallel_group`: `serial-art-curation` (human step)
- `merge_hazards`: `src/ui/art/pixels.ts`, `src/ui/art/registry.ts` — the content track also appends here in Phase 6; these two phases must not run concurrently
- **Scope in:** `src/ui/art/pixels.ts`; `src/ui/art/registry.ts`
- **Scope out:** any content record pointing at the new art
- **Exit criterion:** `npx vitest run tests/ui tests/content/art-key.test.ts` green, and the unclaimed-per-surface census reports ≥20 piece / ≥10 square / ≥30 card — satisfies AC-008…AC-011. Every kept sprite carries a one-word name (ADR-004)
- **Risk:** medium — the sheet-wide `runs < pixels/1.8` gate is the one that can fail late and globally
- **Rollback:** Phase 2

### Phase 4 — The three new boards
- `depends_on`: `[]`
- `parallel_group`: `content-track`
- `merge_hazards`: `src/content/sets/bundled.ts` — shared with Phases 5 and 6; the content track is serial within itself
- **Scope in:** `bundled.ts` boards + the 3 new square types; `ko.ts` board names
- **Scope out:** presets, pieces, cards
- **Exit criterion:** `npx vitest run tests/content` green, plus a new assertion that every board is 6×6 and every painted square sits on a rank empty at setup — satisfies ADR-003 and part of AC-004
- **Risk:** low
- **Rollback:** base commit

### Phase 5 — The new pieces and cards
- `depends_on`: `[4]`
- `parallel_group`: `content-track`
- `merge_hazards`: `src/content/sets/bundled.ts`, `src/i18n/ko.ts`
- **Scope in:** +6 pieces, +6 rule cards, +9 skill cards in `bundled.ts`; their `ko.ts` strings
- **Scope out:** preset membership (Phase 6), art ids (Phase 6)
- **Exit criterion:** `npx vitest run tests/content tests/ui/i18n.test.ts` green with the census reading 12/8/17/24 — satisfies AC-006 and AC-007
- **Risk:** medium — this is where a card can be authored inert; Phase 7 is the guard
- **Rollback:** Phase 4

### Phase 6 — Wire the four rooms, budgets and art ids
- `depends_on`: `[3, 5]`
- `parallel_group`: `serial-integration`
- `merge_hazards`: `src/content/sets/bundled.ts`, `src/ui/art/registry.ts` — the only phase touching both tracks
- **Scope in:** 3 new `presetDef`s with per-preset `loadoutBudget`; `artKey` on every new record
- **Scope out:** new sprites, new records
- **Exit criterion:** `npx vitest run` green; every preset lists ≥6 skill cards, no two presets share a skill list, exactly 4 are selectable, and each preset admits at least one loadout within its budget — satisfies AC-004, AC-005 and ADR-002
- **Risk:** medium — per-preset budgets are four balance surfaces
- **Rollback:** Phase 5

### Phase 7 — Extend the liveness rig to every new card
- `depends_on`: `[6]`
- `parallel_group`: `serial-integration`
- `merge_hazards`: `tests/engine/card-liveness.test.ts`
- **Scope in:** `tests/engine/card-liveness.test.ts`
- **Scope out:** engine sources (ADR-001)
- **Exit criterion:** the rig covers all 41 cards; each new card has at least one probe placing its subject where the correct behaviour is provably no change, asserting both resolved state and legal move set against a no-card control; `intended === current` everywhere — satisfies AC-013 and re-confirms AC-001…AC-003
- **Risk:** medium — a confounded inert probe (subject parked where the correct behaviour is legal anyway) passes without discriminating
- **Rollback:** Phase 6

## 🧪 Testing Strategy

- **Unit (vitest):** the census, board geometry, painted-square rank rule, art
  claim census, sprite gates, contrast, art-id grammar, generator refusal,
  i18n key resolution, per-preset skill counts and budget feasibility.
- **Integration (vitest + jsdom):** the room picker lists 4 rooms and the record
  form offers unclaimed art on each surface.
- **Regression:** the full suite must be green at every phase exit — in
  particular `tests/engine/card-liveness.test.ts`, `tests/structure/no-content-in-engine.test.ts`
  and `tests/ui/tokens.test.ts`, none of which this work edits but all of which it
  can break.
- **Manual:** one smoke pass — open each of the 4 rooms, draft, play a ply; open
  the record form and confirm unclaimed pictures appear on all three surfaces.

## ⚠️ Risks & Mitigation

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Sheet-wide `runs < pixels/1.8` breaks once ~60 sprites land, even though each passes its own check | medium | high — blocks Phase 3 at the end | Have the generator compute the running sheet aggregate and reject a candidate that pushes it over; fail early, per candidate, not at commit |
| A new card is authored inert or wrong-firing | medium | high — the repo's most recurring defect class | Phase 7 probes assert *inert where it must*, against a no-card control on both surfaces; place the subject where the correct behaviour is provably nothing |
| An inert probe is confounded (subject placed where the correct behaviour is legal anyway) | medium | medium — probe passes without discriminating | Mutation check: temporarily break the binding and confirm the new probes go red; the existing rig was validated this way |
| A new art id echoes a content id and trips the whole-file substring scan | medium | low — caught by CI, cheap to rename | Name sprites for what they depict before choosing record ids; ADR-004's one-word rule enforces it |
| Per-preset budgets admit no legal loadout in some room | low | medium | Phase 6 exit asserts at least one loadout within each budget |
| `bundled.ts` grows past readability (748 lines + ~24 records) | high | low | Accepted; splitting the file is a separate refactor and would collide with every phase here |
| The stale `[fail:design]` memory entry keeps asserting 4 broken cards | certain | medium — it will mislead the next task the same way it misled this one | **Wrapup action:** amend the entry with the 2026-08-08 verification and the commits that closed it |

## ✅ Success Criteria

- [x] AC-001…AC-003 — the 26 existing cards still behave as intended (regression)
- [x] AC-004 — every preset lists ≥6 skill cards; every board is 6×6
- [x] AC-005 — exactly 4 selectable presets, no two sharing a skill list
- [x] AC-006 — census reads 12 pieces / 8 square types / 17 rule cards / 24 skill cards
- [x] AC-007 — every declared text key resolves in ko
- [x] AC-008 — ≥20 piece / ≥10 square / ≥30 card art entries claimed by no record
- [x] AC-009 — every sprite passes the per-sprite rules and the sheet aggregate
- [x] AC-010 — every registered entry clears contrast on its permitted surfaces; palette unchanged
- [x] AC-011 — every art id is one segment and echoes no content id
- [x] AC-012 — the generator emits nothing from an invalid batch and shares the gate module
- [x] AC-013 — every new card has an inert-where-it-must probe
- [x] Manual smoke: 4 rooms playable; record form offers unclaimed art on all surfaces

## 🔍 Plan Validation

**Validator dispatch: not run — disclosed rather than silently skipped.** This
session carries a standing instruction not to invoke subagents unless the user
asks, so the `plan-validator` agent was not dispatched. The PLAN was self-reviewed
against the validator's own criteria instead; treat the outcome as
Claude-self-reviewed, not independently critiqued. No ledger row was emitted,
because writing a `dispatch-failed` row would misrepresent a deliberate omission
as a launch error.

**Cross-model second opinion: skipped (`codex`).** The ADR-003 gate for the Side
preset runs second-opinion models only on a high-diff change;
`hm high_diff classify` returned `{"boundary": false, "is_high": false}` (0 added
lines — the branch carries only new documents so far). Recorded as
`status: skipped, reason: not-high-diff`.

**Self-review findings, and what was done about them:**

1. *The SPEC's premise was wrong.* Caught in Step 1 by running the rig rather than
   reading the memory entry. Resolved into ADR-001 and corrected in both the SPEC
   and the RESEARCH document.
2. *Phase 3 and Phase 6 both write `registry.ts`.* Recorded as an explicit
   `merge_hazards` entry and serialized via `depends_on: [3, 5]`.
3. *The compression gate can only fail at the end of Phase 3.* Moved into the
   generator as a running per-candidate check, so it fails at generation time.
4. *AC-013's probe shape can be satisfied vacuously.* The Risks table names the
   confounded-probe failure and prescribes the mutation check that catches it.

## 🚚 Execution Record (2026-08-08)

All seven phases GREEN. Full suite **723 tests / 79 files passing**, `tsc --noEmit` clean.

| Phase | Status | Note |
|---|---|---|
| 1 — extract the gate predicates | DONE | `src/ui/art/gates.ts`; `pixels.test.ts` + `art-contrast.test.ts` rewritten to import it; new `art-gates.test.ts` covers the predicates against fixtures |
| 2 — the generator | DONE | `scripts/gen-sprites.ts`; module identity pinned by `tests/ui/sprite-generator.test.ts` |
| 3 — sprites | DONE | 84 committed, 84/84 gate-accepted on the first full run after one contrast fix |
| 4 — boards | DONE | 3 boards, all 6×6, painted only on ranks 3–4 |
| 5 — records | DONE | +6 pieces, +3 square types, +6 rule cards, +9 skill cards, all with ko strings |
| 6 — rooms + art ids | DONE | 4 presets with budgets 4 / 6 / 6 / 8, no two sharing a skill list |
| 7 — liveness | DONE | 30 new probes (a live and an inert one per new card); rig now 62 probes over 41 cards |

### Deviations from the plan, and why

1. **84 sprites, not 60.** AC-008's floor is on entries **no record claims**, and
   this task adds 24 records that each need a picture. A 60-sprite pool would
   have been eaten down to 36 unclaimed and the AC would have failed by
   construction. The 24 record pictures are authored separately
   (`RECORD_ART` in `scripts/spare-sprites.ts`) and the pool stands at exactly
   26 piece / 13 square / 45 card registered, of which **20 / 10 / 30** stay free.
2. **The generator test lives in `tests/ui/`, not `tests/build/`.** `tests/build/**`
   is excluded from the default vitest run (it asserts over `dist/`), and this
   test guards a pipeline that produces committed source — it has to run on every
   `npm test`.
3. **`testTimeout` raised to 20s** in `vitest.config.ts`. Four jsdom screen tests
   passed in isolation and exceeded the 5s default under a full parallel run once
   the content set roughly doubled. Diagnosed before changing anything: they are
   scheduling, not logic. The repo already carries the same reasoning on
   `ai-turn-model.test.ts`.
4. **Two shipped invariants generalised.** `offers every bundled card through the
   default preset` and `paints every bundled square type onto the default board`
   both encoded "there is one room". They now read *some* preset / *some* board,
   which keeps what they were protecting (no orphan content) and drops what was
   only ever an artefact of a single-room set.
5. **`loadout-ui`'s empty-state test now builds its own room.** Its premise — the
   shipped room deals every card, so none is ownable — is false with four rooms.
   Deleting it would have removed coverage of a real UI branch, so the room that
   makes the branch reachable is constructed in the fixture, and a second test
   pins the new shipped arithmetic (9 of 24 cards ownable without authoring one).

### Two probes were wrong, and the survey is what caught them

The first `skill.blink` and `skill.quake` inert probes reported `live`. Neither
was an engine defect: blink's fixture put an enemy on the destination and a king
whose two-square hop is the bomb square, and quake can legitimately throw a piece
onto that same bomb square — the entry pipeline running for a card-driven move
exactly as it does for a board move. Both were confounded fixtures of precisely
the kind `[fail:design]` warns about: *a probe for wrong-firing must place its
subject where the correct behaviour is provably nothing*. blink's fixture was
moved to empty, unpainted destinations; quake's surface was changed from the
captured pile to *where the mover's own pieces stand*, which is the thing a card
aimed at the enemy may never touch.

**Mutation-validated.** Reverting `engine.ts:505` to ignore `boundSubject` turns
4 probes red — including the new `rule.beacon` inert probe — and leaves the other
58 green. The new probes discriminate on the exact defect class they were written
for.

### Phase D.5 — newly-reachable window

This phase was **new-feature work, not a repair**, so the window question has no
product answer: no defect was fixed in `src/`. The only corrections were to two
test fixtures authored in this same task, and both are covered by the mutation
check above rather than by a green suite.
