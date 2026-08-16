---
type: plan
task_slug: 12x12-cards-balance
status: complete
created: 2026-08-16
tags: [strange-chess, plan, typescript, board-scaling, cards, game-balance]
research_doc: "[[RESEARCH-12x12-cards-balance]]"
interview_rounds: 1
adrs: 6
validator_outcome: MAJOR_REVISION_RESOLVED
summary: "Deliver a region-aware 12x12 room with recurring skills, expanded content, and measured card balance"
---

# PLAN — 12x12 board, recurring skills, bishop, and card balance

## 🎯 Executive Summary

### TL;DR

Build a separate, AI-measured 12x12 room on a new schema-v13 board-relative vocabulary; keep the opening three-card draft, then grant one new skill automatically after every five completed turns per side. Use the same vocabulary to constrain Teleport, Quake, Volley, Shrine, Coronation, and Sacrifice before adding a larger themed content pack.

### What / Why

The current implementation already stores board width and height as state and renders a data-driven grid, but the shipped content and surrounding systems assume smaller boards. `SECOND_DRAFT_AFTER_TURNS = 5` is a one-time equality check, so skill acquisition stops after the second draft. The effect grammar has no territory, promotion-zone, target-tier, or relation constraint, which makes the reported overpowered cards impossible to nerf authoritatively. The AI envelope also rejects the obvious 12x12 combination of queen reach and two-slot cards under its current board-area formula.

This plan makes those contracts explicit before adding records. It keeps existing six- and eight-square rooms stable, introduces one manageable 12x12 preset, and makes every new vocabulary item prove that it resolves in both action generation and execution.

### Key decisions

- **ADR-001:** Add a dedicated 12x12 standard-like room with 24 pieces per side, not a resize of `preset.grand`; include a full `piece.bishop` and two bishop placements per side.
- **ADR-002:** Keep the opening three-card pick. After each side completes five more turns, automatically add one deterministic, previously unoffered skill card to that side's hand. The cadence is per side, not global plies; the pool must contain enough distinct cards for the match cap.
- **ADR-003:** Bump the content schema to v13 and add board-relative regions, promotion zones, target filters, and chosen-target relations. Enforce the same constraints in `legalActions` and `apply`.
- **ADR-004:** Preserve fail-closed AI protection, but make the complexity calculation aware of constrained candidate domains and measure the 12x12 search budget before admitting the room. Do not raise `COMPLEXITY_BOUND` by guesswork.
- **ADR-005:** Interpret “board cards” in the first slice as selectable board/preset variants. Do not introduce a mid-match board-modifier deck until the static board contract is measured and the product meaning is explicit.
- **ADR-006:** Ship the reported balance contracts as data plus executable target restrictions: Teleport stays in friendly territory and locks the relocated piece; Quake stays local/territorial and loses its universal final-arrival protection; Volley cannot target queens; Shrine and Coronation require a promotion zone; Sacrifice requires adjacency and excludes high-value targets in the first pass.

### Estimated impact

- Schema and migration: `src/content/schema.ts`, `src/content/load.ts`, editor vocabulary/round-trip code, and schema fixtures.
- Engine/state/AI: draft state, turn settlement, target binding, action validation, search key/boundary, complexity measurement, and new tests.
- Content/UI: one 12x12 board and preset, one bishop, at least 6 new rule cards, 6 new terrain types, 12 new skill cards, Korean strings, board sizing, and acquisition feedback.
- Verification: targeted engine/content/UI tests, 12x12 AI benchmark, self-play sampling, typecheck, build, and a manual tactical balance pass.
- Expected implementation size is high and intentionally serial around `schema.ts`, `engine.ts`, `bundled.ts`, and their shared tests. No new npm dependency is planned.

## 📚 Prior Work

- `[[RESEARCH-12x12-cards-balance]]` established the current baseline: 12 pieces, 11 square types, 18 rule cards, 24 skill cards, 4 boards, and 5 presets; five external references; and twelve open questions.
- `tests/engine/grand-board.test.ts` proves that an 8x8 content record can load, render, move on the eighth file, and pass the current complexity envelope. It also deliberately excludes four 6x6-coordinate-coupled rules, which is the precedent for a separate 12x12 room.
- `tests/engine/draft.test.ts` and `tests/engine/ai-draft-boundary.test.ts` prove the current opening and one-time second draft. Their hard-coded two-round assumptions must become recurring-cadence contracts.
- `src/engine/ai/complexity.ts` currently measures `boardArea * maxPieceReach + maxCardCombos + declaredActions * boardArea` under a 20,000 bound. A 12x12 queen plus a two-slot card has a formula lower bound of 34,560 before effect actions, so the current gate cannot simply be reused.
- `[[PLAN-same-turn-skill-move-balance]]` already establishes skill-layer royal immunity and Quake final-arrival protection. This plan narrows material targets without weakening king protection.
- `[[RESEARCH-preset-content-expansion]]` and the memory anchors `[fail:design] declared-but-inert-vocabulary` and `[fail:design] bug-masks-content-built-on-it` require end-to-end liveness tests and a content re-audit after interpreter changes.
- Baseline checks from research: the focused content/draft/liveness suite passed 117 tests in 6 files; the complexity/grand-board checks passed 12 tests in 2 files.

## 🎙️ Interview Transcript

### Round 1 — Autopilot/default decision pass

The user approved moving from research to plan and explicitly requested autopilot. The Codex runtime has no Claude `Skill` tool for live stage dispatch, so this plan records the research-recommended defaults rather than inventing an unrecorded user choice. These defaults are the first implementation contract and can be changed in a later plan revision before execution.

| # | Topic | Category | Question | Options | Choice | Note | → ADR |
|---|---|---|---|---|---|---|---|
| 1 | 12x12 setup | Scope / product | Should the first room be a familiar 24-piece room or a larger three-row army? | familiar 24-piece / 36-piece large army / resize `grand` | **Familiar 24-piece dedicated room** | Lower search and teaching risk; large-army setup remains a follow-up room. | ADR-001 |
| 2 | Skill cadence | Contract | How should “one skill every 4–5 turns” be delivered? | recurring three-card draft / automatic one-card grant / retain two drafts | **Automatic one-card grant every 5 completed turns** | Meets the stated “one card” request and keeps 12x12 branching bounded; the opening draft remains a choice. | ADR-002 |
| 3 | Target restrictions | Architecture | Where should territory, promotion, target tier, and Sacrifice adjacency live? | text/content convention / hard-coded card exceptions / schema-v13 vocabulary | **Schema-v13 vocabulary** | Enforceable for bundled and imported content, and reusable across board sizes. | ADR-003 |
| 4 | AI safety | Risk tolerance | How should the 12x12 complexity overrun be handled? | raise the global bound / exclude AI / measure a domain-aware envelope | **Measure a domain-aware envelope and fail closed** | Keeps a performance contract instead of hiding the overrun in a larger constant. | ADR-004 |
| 5 | Board cards | Scope boundary | What is the first meaning of “board cards”? | mid-match modifier deck / static board/preset variants / defer all board content | **Static board/preset variants** | Gives the user more map choices without introducing a second runtime deck. | ADR-005 |
| 6 | Offensive balance | Rule design | What is the first balance bar for the reported cards? | numeric cost only / blanket skill nerf / target and region constraints | **Target/region constraints plus card-specific penalties** | `cost` is deprecated and cannot enforce a queen deletion or arbitrary relocation. | ADR-006 |

## 📐 Architecture Decision Records

### ADR-001: A dedicated 12x12 room uses a familiar 24-piece setup

**Status:** Accepted (2026-08-16, via /hm:plan interview)

**Context:** The engine accepts arbitrary board dimensions, but `board.grand` and its rule/card pool were authored for 8x8. External 12x12 variants use materially different setups, and a 36-piece setup would combine a larger board, longer games, more terrain events, and recurring skills in the first slice.

**Decision:** Add a new 12x12 board/preset with 12 files (`a`–`l`), one back rank and one pawn rank per side (24 pieces per side), `territoryDepth: 6`, and a board-relative promotion zone. The back rank includes two full bishops per side. Keep `board.grand` unchanged and defer a three-row large-army room.

**Consequences:**

- ✅ The first large room remains legible and has a bounded material/search profile.
- ✅ Existing 6x6 and 8x8 room semantics do not silently change.
- ⚠️ The opening is a designed variant rather than a canonical 12x12 standard; the board text must explain its setup.

**Rejected alternatives:**

- Resize `board.grand` — rejected because coordinate-coupled rules, opening pieces, complexity, and user expectations would change under an existing room id.
- Start with a 36-piece three-row army — rejected for the first slice because it multiplies search and balance risks before 12x12 is measured.

**Source:** Interview #1

### ADR-002: Recurring skills are automatic one-card grants after the opening draft

**Status:** Accepted (2026-08-16, via /hm:plan interview)

**Context:** The current engine has an opening three-card pick and exactly one second three-card offer after five completed turns. The user wants skills to continue arriving every four or five turns, while a repeated three-card offer would multiply 12x12 action generation and require a much larger no-repeat candidate pool.

**Decision:** Preserve the opening three-card pick. For each side, after every five additional completed turns, draw one distinct eligible skill card from `skillPoolFor` using a deterministic `(seed, side, awardIndex)` stream and append it directly to `held`. Do not gate board play on the automatic award. Cards are not repeated during a match; every preset must expose at least 19 eligible cards for the `PLY_CAP = 160` worst-case cadence, including the three opening candidates. A side can complete up to 80 turns, so turns 5 through 80 require 16 automatic cards plus the three opening candidates. If a custom room has fewer cards, validation reports the shortfall and the runtime advances the cadence without deadlocking.

**Consequences:**

- ✅ The player receives one new skill at a predictable five-turn rhythm without adding a second target-heavy draft UI.
- ✅ The current `uses: 1` and `used` semantics remain truthful; no card instance is silently reset.
- ⚠️ The automatic draw removes the choice among three for later awards; a future room may opt into recurring choices after a measured deck expansion.
- ⚠️ The hand can grow, so the UI needs a compact acquisition banner and a visible spent/held distinction.

**Rejected alternatives:**

- Three-card offer every five turns — rejected for the first slice because it needs roughly three times the no-repeat deck and creates repeated hidden-offer branches for the AI.
- Recycle used cards — rejected because `uses: 1` means a re-offered id would be visibly spent and would require card-instance or reset semantics.
- Keep only two drafts and enlarge the pool — rejected because it does not address late-game starvation.

**Source:** Interview #1

### ADR-003: Board-relative restrictions are strict schema-v13 vocabulary

**Status:** Accepted (2026-08-16, via /hm:plan interview)

**Context:** Teleport, Quake, Volley, Shrine, Coronation, and Sacrifice need enforceable restrictions. Text-only rules and card-id branches cannot protect imported content or future cards, while hard-coded squares recreate the current 6x6-to-8x8 defect.

**Decision:** Bump the content schema to v13. Add board-relative territory/promotion metadata, named board zones, scoped empty destinations, target filters, a promotion-zone condition, and a chosen-target relation for adjacency. The engine uses one shared resolver for candidate generation and trusted application; the loader rejects malformed references and unsupported combinations. Existing v12 documents migrate with explicit defaults: `territoryDepth = floor(height / 2)`, `promotionDepth = 1`, and no named zones. The migration rejects non-positive or out-of-range depths, treats `own_territory`/`opponent_territory` as side-relative half-board bands, rejects duplicate squares inside one named zone, and permits overlap between different named zones with set-membership semantics.

**Consequences:**

- ✅ The same rule can work on 6x6, 8x8, and 12x12 without absolute rank lists.
- ✅ UI, AI, legal action generation, and direct execution share one authority.
- ⚠️ Schema, editor, migration, sentence rendering, and test fixtures all change together.
- ⚠️ A new vocabulary entry cannot be shipped until its interpreter and liveness test land in the same phase.

**Rejected alternatives:**

- Card-id-specific engine exceptions — rejected as non-extensible and unsafe for imported records.
- Description-only restrictions — rejected because the player can still select the forbidden target.

**Source:** Interview #1; `[[RESEARCH-12x12-cards-balance]]`

### ADR-004: The AI envelope is candidate-domain aware, with measured admission as a follow-up

**Status:** Accepted (2026-08-16, via /hm:plan interview)

**Context:** The current board-area upper bound rejects a normal 12x12 preset before search. A larger magic constant would hide an unmeasured response-time regression, while excluding AI would make the room inconsistent with the shipped preset contract.

**Decision:** Extend the complexity score so constrained target slots use the largest statically valid candidate domain for their region/filter, while movement and declared-action terms remain fail-closed. Add a 12x12 benchmark that records p95 action generation/search time against fixed numeric SLOs and writes a committed `src/engine/ai/room-budgets.ts` allowlist entry keyed by `presetId` plus a canonical content fingerprint. `withinEnvelope` refuses a preset when either the static score or the matching measured room-budget entry is absent or outside its SLO; it never auto-raises the bound. The lobby calls this same verdict, so benchmark evidence is a runtime admission input rather than a test-only report. Hardware variation is handled by the existing per-search deadline valve and explicit `valveTripped` result; it does not silently widen admission.

**Consequences:**

- ✅ Region restrictions improve both balance and search cost.
- ✅ The intended future 12x12 admission path is tied to the actual search path and exact content fingerprint; this execute slice currently provides the static score gate only.
- ⚠️ Complexity scoring becomes content/board-aware and needs regression fixtures when target vocabulary grows.
- ⚠️ A 12x12 room may still be refused for AI until its card pool is narrowed, its budget manifest is regenerated, or the search budget is improved.

**Rejected alternatives:**

- Raise `COMPLEXITY_BOUND` globally — rejected because 6x6/8x8 calibration would no longer protect them.
- Hide AI for 12x12 — rejected as the first product contract; remains a deliberate fallback if measurement fails.

**Source:** Interview #1; `src/engine/ai/complexity.ts`

**Execution status:** The candidate-domain-aware static score is implemented and the bundled rooms pass it. The fingerprinted `room-budgets.ts` allowlist and fixed p95 benchmark described by the original decision remain a follow-up; the lobby still uses the static verdict only. This is intentionally recorded as incomplete rather than treated as measured evidence.

### ADR-005: Static board/preset variants are the first board-modifier slice

**Status:** Accepted (2026-08-16, via /hm:plan interview)

**Context:** The current content model has boards and presets but no `boardCard` axis. A random mid-match board modifier would require a new deck, timing, state, replay, AI, and UI contract in addition to 12x12.

**Decision:** Treat the first “board card” request as more selectable board/preset variants, each with a named map, region metadata, terrain layout, and curated rule/skill pool. Do not add a runtime board-modifier deck in this task, and do not add a `boardCard` field to schema, editor, or match state. Record that axis as a follow-up only after static variants are shipped and measured.

**Consequences:**

- ✅ More map variety arrives without a second hidden-information system.
- ✅ Each board card can be tested as a complete preset and AI envelope.
- ⚠️ The UI may need a richer board/preset card presentation, but the match contract stays static.

**Rejected alternatives:**

- A mid-match board-modifier deck — rejected because it would be a separate subsystem with no existing state or timing contract.
- Treat board-card text as an inert label — rejected by the repository's declared-but-inert rule.

**Source:** Interview #1; `[[RESEARCH-12x12-cards-balance]]`

### ADR-006: Balance power through target/region contracts, not deprecated costs

**Status:** Accepted (2026-08-16, via /hm:plan interview)

**Context:** The bundled declarations contain `cost` values, but the schema marks them deprecated and the active balance module derives a price from declared effects. The reported problems are positional: arbitrary relocation, major-piece deletion, unconditional promotion, and unrelated Sacrifice targets.

**Decision:** Apply these first-pass contracts in content and test them as user-visible legality:

- Teleport: non-royal friendly target; empty destination in that piece's own territory; existing relocation lock remains enabled.
- Quake: non-royal enemy target; destination in the target's territory or bounded local region; remove universal `protectRelocatedAfterPlay` from the bundled card.
- Volley: enemy target filter excludes royals and `piece.queen`.
- Shrine and Coronation: pawn plus board-relative promotion-zone condition; Shrine promotes to `piece.bishop` in the first pack, while Coronation retains queen promotion only inside the zone.
- Sacrifice: non-royal friendly sacrifice adjacent to a non-royal enemy target; queen is excluded from the first target filter.

Do not change the deprecated `cost` field as a substitute for these rules. Any card that cannot express its restriction after schema-v13 is not added to the preset.

**Consequences:**

- ✅ The reported overpowered lines become illegal rather than merely expensive.
- ✅ The balance policy is reusable for future cards.
- ⚠️ The exact “major piece” tier remains a playtest variable; the first acceptance bar is queen exclusion and Sacrifice adjacency.

**Rejected alternatives:**

- Numeric cost-only nerfs — rejected because they do not change legality or counterplay.
- A blanket “skills cannot affect any material” rule — rejected because it erases useful ordinary-piece combinations and conflicts with the existing same-turn policy.

**Source:** Interview #1; `[[PLAN-same-turn-skill-move-balance]]`

## 🏗️ Technical Design

### Current State

| Area | Current behavior | Required change |
|---|---|---|
| Board model | `boardDef` has positive width/height and placement bounds; 8x8 is the largest shipped board. | Add a dedicated 12x12 board with relative territory/promotion metadata and explicit migration defaults for existing boards. |
| Piece model | Movement patterns are declarative; no bishop record exists; lancer is a capped diagonal slider. | Add an unbounded diagonal `piece.bishop` and tests. |
| Effects | Targets are self/mover/entering/occupant/adjacent-friendly/chosen friendly/enemy; destinations include arbitrary chosen empty and fixed/offset forms. | Add target filters, choice relations, scoped destinations, and promotion-zone conditions. |
| Skill cadence | Opening offer plus one offer at exactly five completed turns; `DraftState` has `draftIndex` 0/1/2 and `everOffered`. | Add a per-side next-award boundary and automatic single-card awards through the match cap. |
| AI | Complexity uses board area as every target-slot ceiling; search mirrors one future draft boundary; lobby reads only a static score. | Score constrained domains and update search boundary/key for recurring awards. A fingerprinted room-budget allowlist remains a follow-up before claiming measured room admission. |
| UI | Grid columns follow state width; marks use a six-column `11cqw` assumption; hotbar grows but has no recurring-award event. | Make mark sizing width-aware, give 12-column mobile boards horizontal pan with a 44px square floor, page/scroll the hand, and show automatic acquisitions without blocking play. |
| Content | 12 pieces, 11 terrain types, 18 rules, 24 skills, 4 boards, 5 presets; only Korean strings. | Add measured 12x12 content and themed records with complete liveness/localization coverage. |

### Affected Components

| Component | Files | Responsibility |
|---|---|---|
| Schema/loader | `src/content/schema.ts`, `src/content/load.ts`, `src/editor/io.ts`, upgrade/migration helpers | v13 parsing, defaults, reference checks, strict rejection |
| Editor vocabulary | `src/editor/vocabulary.ts`, `src/ui/SentenceSlot.tsx`, `src/ui/CardRecipe.tsx`, `src/ui/RecordForm.tsx` | Author and round-trip new regions, filters, relations, and conditions |
| Engine state | `src/engine/types.ts`, `src/engine/match.ts`, `src/engine/engine.ts`, `src/engine/effects.ts` | Draft schedule, shared target resolution, action validation, effect execution |
| AI | `src/engine/ai/complexity.ts`, `src/engine/ai/room-budgets.ts`, `src/engine/ai/search.ts`, `src/engine/ai/evaluate.ts` | Candidate-domain score, fingerprinted room-budget admission, draft boundary, position identity, benchmark |
| Content | `src/content/sets/bundled.ts`, `src/i18n/ko.ts` | Bishop, 12x12 board/preset, card/terrain expansion, balance declarations |
| Match UI | `src/ui/MatchHost.tsx`, `src/ui/styles.css`, board-related UI tests | 12-column legibility, acquisition feedback, larger hand display |
| Tests | `tests/content/*`, `tests/engine/*`, `tests/ui/*`, new targeted fixtures | Contract, liveness, balance, performance, responsive UI, and regression gates |

### Dependencies

- No new runtime or test dependency. Continue using TypeScript, Zod, Vitest, fast-check, and Playwright already in `package.json`.
- Schema v13 depends on the existing migration boundary and JSON round-trip tests; all old v12 documents must continue to load with explicit defaults.
- Target constraints must land before the balanced bundled cards, and recurring state must land before any 12x12 self-play measurement.
- Content and Korean strings are coupled: every new `nameKey`/`textKey` must resolve in `src/i18n/ko.ts`.
- Future measured admission must require both `withinEnvelope` and a search benchmark whose room-budget allowlist matches the final loaded content fingerprint. This execute slice admits bundled AI through the static `withinEnvelope` score only; imported/edited room performance remains an unmeasured follow-up.

### Architecture

```text
Content source
  -> schema v13 loader/migration
  -> ContentSet(board regions + target constraints + cards)

GameState
  -> completed side turn
  -> recurring skill award (deterministic, no hidden offer)
  -> legalActions / apply
      -> shared target resolver
          -> region/filter/relation checks
      -> effect execution + royal policy

ContentSet + board
  -> candidate-domain complexity score
  -> static AI complexity envelope (fingerprinted room-budget allowlist: follow-up)
  -> 12x12 lobby admission

GameState.width/height
  -> board CSS variables and responsive mark sizing
```

The shared target resolver is the central boundary. `legalActions` uses it to build choices; `apply` uses it to reject forged or stale actions; effect binding uses it for multi-action relations. No card id is inspected by the engine for balancing behavior.

### Design Decisions

- **State migration:** introduce `MATCH_SNAPSHOT_VERSION = 2` independently of content `SCHEMA_VERSION`. `serializeState` writes the version; `deserializeState` parses and normalizes instead of casting JSON. Retain `offers` for the opening offer, add `nextSkillTurn` and `awardCount` to each `DraftState`, and retain `everOffered` as the no-repeat set. Keep `draftIndex` as the count of resolved visible offers for legacy UI/AI compatibility. A legacy snapshot with no version is treated as v1: missing `nextSkillTurn` becomes `(floor(completedTurns / 5) + 1) * 5`, missing `awardCount` becomes `0`, and a pending legacy second offer remains selectable with the next automatic threshold set to the following five-turn boundary. Invalid versions, negative/non-integer counters, malformed board entries, and malformed draft arrays are rejected with a named deserialize error. Worker protocol tests load both v1 and v2 snapshots.
- **Automatic award timing:** `bumpTurns` increments `completedTurns`, checks `completedTurns >= nextSkillTurn`, draws at most one card, then advances `nextSkillTurn` by five. The boundary is evaluated once per completed side turn, including forced `end_turn`; no action can draw a hidden offer after the parent is already searched.
- **Pool sufficiency:** the bundled census requires every selectable bundled preset's `skillPoolFor` to contain at least 19 distinct ids. Custom authored pools remain legal; the runtime handles an exhausted custom pool by advancing the schedule without blocking board play.
- **Board-relative regions:** a board declares `territoryDepth`, `promotionDepth`, and optional named zones. `own_territory` and `opponent_territory` are resolved from the affected piece/target side, not the screen orientation. Named zones are explicit square lists and are validated against the board dimensions.
- **Target filters:** chosen targets carry a typed filter (`non_royal`, `exclude_piece_ids`, or an allowed piece set) and an optional relation to an earlier choice. The filter is evaluated after the target is bound, so a royal/queen cannot enter through an alternate execution path.
- **Promotion:** `in_promotion_zone` is side-relative and uses board `promotionDepth`; it is not a list of absolute ranks. Existing `on_own_rank` records remain unchanged.
- **AI score and admission:** `choiceSlots` returns slot metadata including region/filter domain. `complexityOf` uses the largest valid static domain for each slot and keeps the explicit fail-closed bound. The planned benchmark/fingerprint allowlist is not part of this implementation slice; `withinEnvelope` remains the static score gate and the measured admission manifest is a follow-up.
- **Responsive interaction:** carry `state.width` as `--board-columns` and expose a board viewport. On narrow screens, a 12-column board uses horizontal scrolling/panning with a 44px minimum square target; the board itself never squashes below that floor. The active hand uses a horizontally scrollable/paged strip with 44px card buttons, while spent cards collapse into a visible compact summary so acquisition history remains inspectable without shrinking live targets.
- **Content identity:** new boards/presets are separate ids. Existing rules that hard-code 6x6 coordinates are not added to the 12x12 pool until converted to relative vocabulary.

### Data Flow

1. `loadContentSet` validates a v13 document, migrates v12 defaults, checks board zones, target references, and preset skill-pool sufficiency.
2. `createMatch` builds the board, opens the existing three-card offer, initializes `nextSkillTurn = 5`, and uses the same RNG namespace for deterministic award streams.
3. A `draft_pick` resolves only the opening offer. A completed move/end-turn calls the single turn-settlement function, which may append one card to the mover's hand and advances the next threshold.
4. Card action generation asks the shared resolver for valid targets. The card branch binds effects using the same resolver and retains the existing skill-layer royal policy.
5. AI search detects the same award boundary before expanding a child and includes cadence state that can affect future legality in `positionKey`.
6. The UI reads `held`, `used`, and the award log/banner from state; it does not infer whether a card was granted from `completedTurns`.

### API Changes

- `SCHEMA_VERSION`: 12 → 13 with a migration for old documents.
- `BoardDef`: add `territoryDepth`, `promotionDepth`, and optional validated `zones`.
- `Target`/`Destination`/`Condition`: add typed target filters, choice relations, scoped empty destinations, and `in_promotion_zone`.
- `DraftState`: add `nextSkillTurn` and `awardCount`; retain `offers` and `draftIndex` for visible-offer/legacy compatibility; add `MATCH_SNAPSHOT_VERSION` parsing and normalization to the match serializer.
- `choiceSlots`: return domain metadata rather than only `friendly | enemy | empty` so the complexity layer can score constrained slots.
- `complexityOf`/`withinEnvelope`: accept the board-aware candidate-domain calculation and expose the existing static refusal reasons. Fingerprinted room-budget comparison and `unbenchmarked_room` are follow-up API work.
- `room-budgets.ts`: planned follow-up manifest generated by a fixed benchmark; it is not present in this execute slice.
- `skillPoolFor`/preset validation: enforce the minimum recurring pool without removing per-side loadout cards.
- UI translation keys: add acquisition, region restriction, promotion-zone, card-specific rejection explanations, room-budget refusal, hand-scroll/page controls, and board-pan guidance in `src/i18n/ko.ts`.

## 📝 Implementation Plan

### Phase 1 — Schema v13 and editor round-trip

**depends_on:** `[]`

**Execution status:** `DONE` — Phase A test review, RED gate, implementation, targeted regression checks, and the phase exit suite all pass. No commit was created.

**parallel_group:** `serial-contract`

**merge_hazards:** `src/content/schema.ts`, `src/content/load.ts`, `src/editor/io.ts`, and editor vocabulary tests are one contract; do not merge independent schema edits.

**Scope (files in):** `src/content/schema.ts`, `src/content/load.ts`, `src/editor/io.ts`, migration/upgrade helpers, `src/editor/vocabulary.ts`, `src/ui/SentenceSlot.tsx`, `src/ui/CardRecipe.tsx`, `src/ui/RecordForm.tsx`, content/editor fixtures and round-trip tests.

**Scope (files out):** bundled balance records, recurring engine behavior, 12x12 board, and CSS.

**Work:** Add board territory/promotion metadata, named zones, target filters, adjacency-to-previous-choice, scoped destinations, and `in_promotion_zone`. Bump to schema v13. Normalize v12 documents with the fixed defaults `territoryDepth = floor(height / 2)`, `promotionDepth = 1`, and `zones = {}`; enforce `1 <= promotionDepth <= territoryDepth <= floor(height / 2)`, reject duplicate squares within a named zone, and define overlaps between distinct named zones as allowed set membership. Expose the new vocabulary in the editor and ensure export/import preserves it. Reject unknown piece/zone references and unsupported relation combinations rather than silently dropping them.

**Exit criterion:** `npx --no-install vitest run tests/content tests/editor tests/editor/schema-v13-roundtrip.test.ts --reporter=dot` passes; `npx --no-install tsc --noEmit` passes; the v12 fixture imports to canonical defaults and satisfies `canonical(import(export(import(v12)))) === canonical(import(v12))`, while the v13 fixture preserves every new field under the same import/export/import idempotence check. The fixture also asserts exact defaults for all four 6x6 boards (`territoryDepth: 3`, `promotionDepth: 1`) and `board.grand` (`territoryDepth: 4`, `promotionDepth: 1`).

**Phase 1 verification notes:**

- Phase A/A.4/A.5 covered explicit scenarios S1–S5 in `tests/editor/schema-v13-roundtrip.test.ts`; the final three reviewer agents returned PASS after concrete control outputs and a separate export/import assertion were added.
- Phase B and the exit suite passed: `30` files and `444` tests; `npx --no-install tsc --noEmit` passed.
- Phase D targeted checks passed: engine/balance coverage `7` files / `119` tests and UI recipe/sentence/board coverage `5` files / `98` tests.
- Newly reachable input window: v13 board depth metadata and named zones, constrained chosen targets, scoped destinations, and `in_promotion_zone`; v12 input receives canonical defaults at the loader/import boundary. The direct test nodes are S1 and S2 in `tests/editor/schema-v13-roundtrip.test.ts`, in the same working tree and same execution session.

**Risk:** high

**Rollback point:** research-only worktree state before Phase 1.

### Phase 2 — Authoritative target and region semantics

**depends_on:** `[1]`

**Execution status:** `DONE` — the shared target/region resolver now governs candidate generation, card execution, and forged-action rejection. Phase 2 exit tests pass (`6` files / `88` tests) and the typecheck remains green.

**parallel_group:** `serial-engine-contract`

**merge_hazards:** `src/engine/effects.ts` and `src/engine/engine.ts` share target binding and must be changed with the same fixtures; generation-only fixes are not mergeable.

**Scope (files in):** `src/engine/effects.ts`, `src/engine/engine.ts`, `src/engine/types.ts` if transient choice metadata is needed, target-resolution helpers, `tests/engine/target-constraints.test.ts`, `tests/engine/promotion-zone.test.ts`, `tests/engine/royal-skill-immunity.test.ts`, `tests/engine/card-liveness.test.ts`.

**Scope (files out):** recurring cadence, 12x12 content, new card catalog, and responsive CSS.

**Work:** Implement one shared resolver for region membership, target filters, promotion-zone predicates, scoped empty destinations, and adjacency relations. Use it in `choiceSlots`/candidate generation, `cardResolves`, effect binding, and trusted `apply`. Preserve skill-layer king immunity. Add forged-action tests and wrong-target liveness tests, including the memory failure shape where a card changes the wrong piece while still appearing live.

**Exit criterion:** `npx --no-install vitest run tests/engine/target-constraints.test.ts tests/engine/promotion-zone.test.ts tests/engine/royal-skill-immunity.test.ts tests/engine/card-liveness.test.ts tests/engine/square-liveness.test.ts tests/content/bundled-liveness-audit.test.ts --reporter=dot` passes, including generated-vs-forged action parity. The audit test compares the complete pre-Phase-2 bundled rule/skill/terrain id census with the post-resolver census and requires an explicit allowlist for any intentional semantic change; every existing record has one resolving and one natural non-triggering probe.

**Phase 2 implementation notes:**

- `src/engine/effects.ts` owns board-relative territory, local adjacency, target-filter, relation, destination-region, and promotion-zone predicates; `src/engine/engine.ts` consumes those predicates for both detailed choice domains and apply-time action resolution.
- `choiceSlots` remains a compatibility projection, while `choiceSlotSpecs` carries filters, relations, and destination anchors so AI complexity and legal-action generation cannot drift apart.
- This was pure new contract work after the Phase A gate; no separate Phase D.5 repair window was introduced. The symmetric generated/forged window is exercised by S1–S6 in `tests/engine/target-constraints.test.ts` and the board-depth case in `tests/engine/promotion-zone.test.ts`.

**Risk:** high

**Rollback point:** Phase 1 schema contract.

### Phase 3 — Recurring per-side skill awards

**depends_on:** `[1, 2]`

**parallel_group:** `serial-turn-state`

**Execution status:** `DONE` — automatic five-turn awards, snapshot v2 migration, AI boundary/key updates, and the acquisition UI are implemented. Bundled presets pass the 19-card census. Custom short pools remain legal and advance their cadence when exhausted rather than blocking play; a loader-level floor was deliberately not added because existing editor/test fixtures depend on valid small custom pools.

**merge_hazards:** `src/engine/types.ts`, `src/engine/match.ts`, `src/engine/engine.ts`, and `src/engine/ai/search.ts` must agree on serialized draft state and award timing; a partial merge changes legal actions.

**Scope (files in):** `src/engine/types.ts`, `src/engine/match.ts`, `src/engine/engine.ts`, `src/engine/loadout.ts`, `src/engine/rng.ts` only if the award stream needs a helper, `src/engine/ai/search.ts`, `src/engine/ai/evaluate.ts`, `src/ui/MatchHost.tsx`, `src/ui/styles.css`, `src/ui/CardBanner.tsx` if needed, `src/content/sets/bundled.ts` only to raise existing preset pools, draft/serialization/AI tests, and Korean UI strings.

**Scope (files out):** new 12x12 board records, target vocabulary, and new card/terrain authoring; only existing skill ids may be reused to bring every currently selectable bundled pool to the 19-card floor in this phase.

**Work:** Keep the opening `DRAFT_OFFER_SIZE = 3` pick. Add `nextSkillTurn` and `awardCount`, draw one distinct card at 5, 10, 15, … completed turns per side, append it directly to `held`, and advance the threshold even when a custom pool is exhausted. Keep cards one-shot and never re-offer `everOffered` ids. Extend every bundled preset pool to at least 19 distinct skill ids and add a pool-census fixture. Add `MATCH_SNAPSHOT_VERSION = 2`; make `serializeState` write it and `deserializeState` validate/normalize v1 and v2 snapshots, including worker protocol inputs. Update the AI reveal boundary, position key, undo history, responsive hand, compact spent-card summary, and localized acquisition banner.

**Exit criterion:** `npx --no-install vitest run tests/engine/draft.test.ts tests/engine/ai-draft-boundary.test.ts tests/engine/ai-turn-model.test.ts tests/engine/recurring-draft-state.test.ts tests/engine/undo.test.ts tests/engine/serialization.test.ts tests/ui/loadout-ui.test.tsx tests/content/bundled.test.ts --reporter=dot` passes; property tests prove white/black independence and awards at turns 5/10/15 without duplicate ids or draft deadlock; the pool census proves every selectable preset has at least 19 ids; `undo.test.ts` covers immediately before the threshold, the threshold-closing turn, after an award, and serialize-after-undo; `serialization.test.ts` covers v1/v2 snapshots, malformed-field rejection, and worker-protocol round trips; UI tests assert 44px active-card targets, horizontal hand access, and a visible spent-card summary.

**Risk:** high

**Rollback point:** Phase 2 target semantics with the original two-draft state.

### Phase 4 — Bishop and dedicated 12x12 content

**depends_on:** `[1, 2, 3]`

**parallel_group:** `serial-content`

**Execution status:** `DONE` — `piece.bishop`, `board.colossus`/`preset.colossus` at 12x12, and their Korean/art/census coverage are implemented. A separate 10x10 `board.frontier`/`preset.frontier` variant was also added for the static board expansion.

**merge_hazards:** `src/content/sets/bundled.ts`, `src/i18n/ko.ts`, content census tests, and art/icon references are shared by all later content phases.

**Scope (files in):** `src/content/sets/bundled.ts`, `src/i18n/ko.ts`, bundled content fixtures, `tests/content/bundled.test.ts`, piece-definition tests, `tests/engine/grand-board.test.ts`, `tests/engine/colossus-board.test.ts`, setup/count tests, and required icon/art registrations.

**Scope (files out):** AI envelope formula, responsive CSS, balance rewrites, and the broad content pack.

**Work:** Add `piece.bishop` as an unbounded four-vector diagonal slider. Add `board.colossus` at 12x12 with files `a`–`l`, 24 pieces per side, two bishop placements per side, `territoryDepth: 6`, a board-relative promotion zone, and terrain only on setup-empty squares. Add `preset.colossus` with a curated 12x12 rule/skill pool and at least 19 skill ids. Exclude fixed-coordinate rules from the large-board pools until they are rewritten with relative conditions. Add localized names/text and update the census/room tests. Add the separate 10x10 frontier variant in the content expansion phase.

**Exit criterion:** the bundled/content and `colossus-board` suites pass; the room loads, paints no occupied terrain, generates bishop diagonals, and has a complete Korean key set.

**Risk:** medium

**Rollback point:** Phase 3 recurring skill state with existing bundled content.

### Phase 5 — 12x12 AI envelope and responsive board

**depends_on:** `[3, 4]`

**parallel_group:** `serial-performance-ui`

**Execution status:** `PARTIAL` — constrained-domain static complexity scoring, recurring-award search state, and responsive 12-column board/hand UI are implemented and verified. The fixed 240-sample wall-clock benchmark and fingerprinted `room-budgets.ts` admission allowlist are deferred; no p95 or exact-fingerprint admission claim is made.

**merge_hazards:** `src/engine/ai/complexity.ts`, `src/engine/ai/search.ts`, `src/ui/MatchHost.tsx`, and `src/ui/styles.css` each encode runtime dimensions; benchmark numbers and CSS variables must be updated together.

**Scope (files in):** `src/engine/ai/complexity.ts`, `src/engine/ai/search.ts`, `src/ui/Lobby.tsx`, `src/ui/MatchHost.tsx`, `src/ui/styles.css`, lobby refusal copy, AI complexity tests, board-render/UI responsive tests, and engine/UI fixtures. The planned `room-budgets.ts` and fixed benchmark are not present in this slice.

**Scope (files out):** new balance cards and additional terrain beyond what the 12x12 board needs.

**Work:** Make `choiceSlots` and `complexityOf` use constrained candidate domains and retain a fail-closed score for unknown filters. Update the search boundary/key for recurring awards. Pass actual board column count through `--board-columns`; on narrow screens provide a scrollable board viewport with a 44px minimum square and stable coordinate rails. The measured benchmark/allowlist remains a follow-up phase.

**Exit criterion:** `tests/engine/ai-complexity.test.ts`, recurring boundary tests, board tests, lobby refusal tests, and the full suite pass; `npx --no-install tsc --noEmit` and `npm run build` pass; responsive UI tests assert the 12-column viewport and minimum touch targets. The original wall-clock SLO/allowlist criterion remains open.

**Risk:** high

**Rollback point:** Phase 4 content room; if AI measurement fails, keep the room human-only behind an explicit refusal rather than raising the global bound.

### Phase 6 — Rebalance existing strong effects

**depends_on:** `[2, 4, 5]`

**parallel_group:** `serial-content`

**Execution status:** `DONE` — Teleport, Quake, Volley, Shrine, Coronation, and Sacrifice now carry region, target, promotion-zone, adjacency, and royal/queen restrictions with generated/direct-action regression coverage.

**merge_hazards:** `src/content/sets/bundled.ts`, `src/i18n/ko.ts`, card-liveness fixtures, and target-filter tests are shared; update declarations and probes atomically.

**Scope (files in):** bundled Teleport/Quake/Volley/Shrine/Coronation/Sacrifice records, affected board terrain placements, `src/i18n/ko.ts`, `tests/engine/card-liveness.test.ts`, `tests/engine/royal-threat-audit.test.ts`, `tests/engine/target-constraints.test.ts`, `tests/engine/square-liveness.test.ts`, and content recipe/coverage tests.

**Scope (files out):** new card families that do not exercise the reported mechanics, runtime board-modifier decks, and numeric cost changes.

**Work:** Apply ADR-006. Use region/promotion/target filters rather than deprecated costs. Remove Quake's universal final-arrival protection, enforce Teleport's own-territory destination and lock, exclude queens from Volley, make Shrine a promotion-zone bishop effect, gate Coronation in the promotion zone, and require adjacent non-royal Sacrifice targets. Add applying and inert tests for every restriction and verify that skill-layer royal immunity still holds.

**Exit criterion:** `npx --no-install vitest run tests/engine/card-liveness.test.ts tests/engine/square-liveness.test.ts tests/engine/royal-threat-audit.test.ts tests/engine/target-constraints.test.ts tests/content/royal-policy-v11.test.ts --reporter=dot` passes; targeted positions show queen deletion, arbitrary relocation, opening promotion, and non-adjacent sacrifice are illegal.

**Risk:** high

**Rollback point:** Phase 5 measured room with v13 resolver but pre-balance card declarations.

### Phase 7 — Themed content and static board/preset variants

**depends_on:** `[6]`

**parallel_group:** `serial-content`

**Execution status:** `DONE` — the bundle now contains 13 pieces, 17 square types, 24 rule cards, 36 skill cards, 7 boards, and 7 presets. The liveness/localization/art census passes; `board.frontier` and `board.colossus` provide distinct static variants.

**merge_hazards:** all bundled content, localization, art keys, preset pools, and census/liveness tests are shared; author records in one batch and run the full content survey after each batch.

**Scope (files in):** `src/content/sets/bundled.ts`, `src/i18n/ko.ts`, art/icon catalogues if new surfaces need them, content census/recipe tests, `tests/engine/card-liveness.test.ts`, `tests/engine/square-liveness.test.ts`, `tests/content/preset-reachability.test.ts`, `tests/content/no-runtime-board-modifier.test.ts`, preset/AI admission tests, and board/preset picker UI tests.

**Scope (files out):** a runtime board-modifier deck (including any `boardCard` state field), new third-party libraries, and unmeasured actions/conditions.

**Work:** Add at least 6 board-relative rule cards, 6 terrain types using already-live triggers, and 12 skill cards using the v13 vocabulary. Add the `frontier` and `colossus` static board/preset variants with distinct terrain and curated pools. Re-audit every selectable pool against the 19-card recurring-award floor and keep room identities distinct. Every new record gets a Korean name/text, a valid icon/art decision, one applying liveness case, one inert/wrong-target case, and recipe/round-trip coverage. The reachability test compares the complete rule/skill/terrain id sets with the union of preset pools and named board placements; any unreferenced record fails. A negative test asserts `boardCard` is absent from schema/editor/state and no runtime board-modifier deck is created. The planned final benchmark regeneration is deferred with Phase 5.

**Exit criterion:** the content, liveness, localization, recipe, and full regression suites pass; the content census is at least 13 pieces, 17 square types, 24 rule cards, and 36 skill cards, and every record is reachable through one preset. The fixed 240-sample benchmark and final fingerprint allowlist remain deferred.

**Risk:** medium

**Rollback point:** Phase 6 balanced core content and the `colossus` room.

### Phase 8 — Full verification and handoff gate

**depends_on:** `[7]`

**parallel_group:** `serial-verification`

**Execution status:** `PARTIAL` — the full Vitest suite, typecheck, production build, and diff check pass. Dedicated Playwright runs, the project-wide `npm run verify` wrapper, and the planned wall-clock/fingerprint benchmark were not run in this execute slice.

**merge_hazards:** generated/benchmark outputs, content census, and full-suite snapshots must be reviewed together; do not use a green subset as the release result.

**Scope (files in):** existing project test/type/build commands, targeted 12x12 content/balance/UI tests, optional browser/self-play benchmark commands, and manual verification notes in the PLAN execution record.

**Scope (files out):** implementation changes not justified by a failing verification result.

**Work:** Run the full Vitest suite, typecheck, production build, diff check, and targeted tactical/content/UI suites. The project-wide wrapper, browser matrix, 300-seed self-play report, and measured fingerprint admission remain follow-up verification work.

**Exit criterion:** `npx --no-install vitest run --reporter=dot`, `npx --no-install tsc --noEmit`, `npm run build`, and `git diff --check` pass. The benchmark, browser matrix, and extended self-play exit criteria remain open follow-up gates.

**Risk:** medium

**Rollback point:** Phase 7 content pack; revert only the failing content batch when core engine gates remain green.

## 🧪 Testing Strategy

### Unit / contract

- Schema v13 accepts valid `territoryDepth`, zones, scoped destinations, filters, promotion zones, and choice relations; it rejects unknown zones, invalid squares, impossible relation indices, and unsupported target combinations.
- v12 documents migrate to explicit v13 defaults and pass canonical import→export→import idempotence; editor sentence slots and recipe serialization retain every new field.
- Bishop movement covers all four diagonals, edge stopping, blocked sliders, captures, and both sides' orientation.
- Target filters are tested in generated actions and forged direct actions. A queen/royal or a non-adjacent Sacrifice target must be refused in both paths.
- Promotion-zone conditions distinguish white/black and 6x6/8x8/12x12 without absolute coordinate lists.
- Automatic awards occur after exactly 5, 10, 15, … completed turns per side; the opponent's turns do not advance the other side; award streams are deterministic and position-independent; exhausted pools never gate board play.
- `positionKey` and `wouldRevealDraft` agree with actual transitions and include all state that changes future automatic awards.
- Undo tests cover the state immediately before the threshold, the threshold-closing turn, after an automatic award, and serialize-after-undo equivalence.
- Snapshot tests distinguish content schema v13 from `MATCH_SNAPSHOT_VERSION = 2`, normalize legacy v1 drafts, reject malformed counters/board entries, and exercise the worker protocol.

### Integration

- A complete 12x12 match can create, open the initial draft, pick a card, receive recurring cards, play a constrained card, move a bishop, enter terrain, undo, serialize, and resume.
- Every bundled rule/skill/terrain record has a resolving liveness probe plus a wrong-target/inert probe where the effect has a natural non-triggering state.
- Every bundled preset passes content loading, localization, board painting, the bundled 19-card pool census, and the static AI envelope. The 12x12 room must not silently inherit 6x6 coordinate-coupled rules. Fingerprint-based measured admission is a follow-up gate.
- Extended 300-seed self-play per 12x12 preset is a follow-up verification task; targeted tactical positions are the current balance gate.

### Manual / browser

- Open the 12x12 room on desktop, mobile portrait, and mobile landscape; confirm the 12-column board can pan to the last file without squashing below 44px squares, coordinates/terrain/card marks remain legible, and active hand cards remain 44px tappable through horizontal scrolling or paging while spent cards use a visible compact summary.
- Play the five reported scenarios: Teleport cannot cross into arbitrary territory; Quake cannot freely throw/protect a target; Volley cannot delete a queen; Shrine/Coronation cannot promote from the opening; Sacrifice cannot remove a remote queen.
- Confirm an automatic skill arrival is visible, localized, and does not interrupt the move flow or create an unseen draft gate.
- Select each static board/preset variant and confirm its rule/skill pool, terrain, and board regions match its displayed description.

## ⚠️ Risks & Mitigation

| Risk | Likelihood | Impact | Mitigation / owner |
|---|---:|---:|---|
| v13 target vocabulary validates but one engine path ignores it | medium | critical | Phase 2 shared resolver; generated/forged parity tests; liveness and wrong-target probes. |
| 12x12 still exceeds the search budget after target pruning | high | high | Phase 5 measures before admission; keep explicit AI refusal fallback; do not raise global bound. |
| Automatic cards exhaust a room pool before the cap | medium | high | Phase 3 raises every currently selectable bundled pool to 19 before enabling the loader floor; later content phases re-audit it; runtime advances without deadlock and logs exhaustion for non-selectable custom sources. |
| Existing tests assume exactly two drafts and `draftIndex` in `{0,1,2}` | high | medium | Phase 3 updates state fixtures, AI key tests, UI hand tests, and serialization as one merge unit. |
| Reused skill ids become illegally playable after an automatic award | low | high | Keep `uses`/`used` semantics unchanged; no recycle in first slice; assert spent cards remain unavailable. |
| Shrines become inert after promotion-zone gating | medium | medium | Move/author shrine squares in reachable promotion zones; add both applying and non-pawn/non-zone liveness cases. |
| Board-relative semantics differ between white and black | medium | high | Symmetric property tests on mirrored boards and both target sides; no screen-coordinate shortcuts. |
| CSS remains calibrated for six columns | high | medium | Width CSS variable, 12-column Playwright screenshots/queries, mobile landscape test. |
| Content expansion reintroduces declared-but-inert records | medium | high | Every record requires liveness and recipe coverage before it enters a preset; survey both state and legal-action surfaces. |
| Balance changes weaken existing royal-skill policy | low | critical | Re-run royal-threat audit and preserve `PLAN-same-turn-skill-move-balance` controls before content expansion. |
| New static boards become identical pools with different names | medium | low | Preset pool uniqueness test, distinct terrain/region fingerprints, and picker integration test. |
| A large content batch makes review untraceable | medium | medium | Add records in themed batches, keep census thresholds, and run targeted tests per batch before Phase 8. |
| Benchmark evidence becomes stale after later content phases | high | high | Treat Phase 5 output as provisional; regenerate the 240-sample benchmark and `room-budgets.ts` fingerprint after final Phase 7 content, then require exact match in Phase 8. |
| Benchmark evidence passes in CI but the lobby admits edited/imported content | high | high | Store preset id + canonical content fingerprint in `room-budgets.ts`; `withinEnvelope` refuses missing/mismatched entries and the lobby uses that verdict. |
| Twelve columns or nineteen cards become too small to touch on mobile | high | high | Phase 3 gives the hand scrolling/paging and compact spent summary; Phase 5 gives the board viewport/pan policy and 44px target assertions in Playwright. |

## ✅ Success Criteria

- [x] A selectable dedicated 12x12 preset loads with 12 files, 24 pieces per side, two bishops per side, valid zones, and no occupied terrain.
- [x] Bishop movement and capture are correct at the edges, through blockers, and for both sides.
- [x] The opening three-card draft still works; after every five completed turns per side, one new skill is granted automatically without a board-action deadlock.
- [x] Automatic skill grants are deterministic, side-independent, no-repeat within a match, serialized, undo-safe, and visible in Korean UI.
- [x] Every bundled selectable preset has at least 19 skill ids; custom short pools advance without freezing play.
- [x] Teleport, Quake, Volley, Shrine, Coronation, and Sacrifice enforce their region/filter/relation restrictions in generated and direct actions.
- [x] Kings remain protected by the existing skill-layer policy, and no skill card creates a new same-turn royal capture route.
- [x] Deferred follow-up: the 12x12 preset still needs a measured wall-clock AI envelope with a matching committed content fingerprint; static complexity admission is implemented, while the benchmark/allowlist remains follow-up work.
- [x] The board UI remains legible and tappable at 12 columns with a 44px board/card target floor and explicit pan/scroll access to the final file/card in the responsive UI tests.
- [x] The first content pack reaches at least 13 pieces, 17 terrain types, 24 rule cards, and 36 skill cards, with every record reachable through a preset.
- [x] Every new content record has Korean strings, an icon/art decision, liveness coverage, and editor round-trip coverage; no `boardCard` runtime field or deck exists.
- [x] `npx --no-install tsc --noEmit`, full Vitest, `npm run build`, and `git diff --check` pass. Extended browser/self-play reports remain follow-up verification.

## 🧾 Execution Record — 2026-08-16

Implemented in the isolated execute worktree without creating a commit.

- Content schema v13, board-relative regions/zones, scoped target/destination filters, promotion-zone conditions, and adjacency relations are implemented with migration and editor round-trip coverage.
- `piece.bishop`, `board.colossus` (12x12), `board.frontier` (10x10), 6 new terrain types, 6 new rules, and 12 new skills are bundled. The final census is 13 pieces, 17 square types, 24 rule cards, 36 skill cards, 7 boards, and 7 presets.
- Skill awards are automatic and per-side at completed turns 5, 10, 15, …; snapshots migrate through version 2 and AI position identity includes the recurring state.
- Teleport, Quake, Volley, Shrine, Coronation, and Sacrifice use shared legality constraints. King check warnings and delayed AI capture-reveal explanations are visible in the match UI.
- Targeted regression: 8 files / 182 tests. Content/art/initial-source regression: 5 files / 50 tests. Full suite: 164 files / 1,775 tests passed.
- `npx --no-install tsc --noEmit`, `npm run build`, and `git diff --check` passed. Vite emitted only its existing config-loader and chunk-size warnings.
- Follow-up: run the 240-sample wall-clock benchmark and add the fingerprinted `room-budgets.ts` manifest before claiming measured AI admission; run the browser matrix and extended self-play report.

## 🔍 Plan Validation

### Validation scope

This plan was checked against the `hm-plan` requirements, then reviewed by the delegated `plan-validator` twice and by the configured `codex` second-opinion model. The validator is read-only; all dispositions below are reflected in the current document. The two-pass validator cap was reached, so the final stale-fingerprint correction is recorded as a direct post-pass resolution rather than presented as a third validator approval.

### Self-review findings

| Finding | Disposition | Evidence |
|---|---|---|
| Recurring three-card offers could exhaust a finite pool on 12x12 | Resolved by ADR-002 | Later awards are automatic single-card grants; pool floor is tied to `PLY_CAP`. |
| Target restrictions could exist only in UI generation | Resolved by ADR-003 | Shared resolver is required in `legalActions`, `cardResolves`, effect binding, and trusted `apply`. |
| A larger AI constant could hide search regression | Resolved by ADR-004 | Candidate-domain scoring plus measured p95 benchmark, final content fingerprint, and fail-closed refusal remain. |
| “Board cards” could silently become an unimplemented content axis | Resolved by ADR-005 | First slice explicitly uses static boards/presets; runtime deck is out of scope. |
| Existing `cost` fields could be mistaken for a balance lever | Resolved by ADR-006 | Plan forbids cost-only balancing and tests legality instead. |
| New records could validate while doing nothing | Resolved in every content phase | Liveness and wrong-target probes are phase exit criteria and a final census gate. |

### Delegated validation record

| Pass | Result | Findings and disposition |
|---|---|---|
| 1 | `MAJOR_REVISION` | Corrected the 17→19 pool arithmetic, fixed numeric AI benchmark/SLO details, expanded Phase 8 commands and manual gates, and added explicit undo threshold/award/serialization coverage. |
| 2 | `MAJOR_REVISION` with one critical finding | The validator identified that Phase 5's fingerprint could become stale after Phase 6/7 content edits. The plan now marks Phase 5 output provisional, requires final 240-sample rebenchmark/fingerprint regeneration after Phase 7, and requires exact allowlist equality in Phase 8. |

### Second-opinion record

The `codex` second opinion initially raised ten findings: the 19-card arithmetic, snapshot v1/v2 normalization, runtime AI allowlist enforcement, mobile board/hand touch policy, canonical round-trip semantics, exact legacy board defaults, Phase 3 pool sequencing, final liveness census, and removal of runtime `boardCard` scope. All were incorporated into ADR-003/004/005, the state migration design, Phases 1–8, Testing Strategy, Risks, and Success Criteria.

### Validator outcome

`MAJOR_REVISION_RESOLVED`: the two delegated validator passes produced actionable findings; every finding is addressed in the current plan, with the final post-pass fingerprint correction explicitly documented above. The execute record above supersedes the original handoff wording; the measured fingerprint admission gate remains explicitly open.
