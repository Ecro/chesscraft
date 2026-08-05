---
type: plan
task_slug: variant-chess-6x6-cards
status: planning
created: 2026-08-05
tags: [strange-chess, plan, typescript, vitest, game-engine, declarative-content, chess-variant]
spec: "[[SPEC-variant-chess-6x6-cards]]"
research_doc: "[[RESEARCH-variant-chess-6x6-cards]]"
interview_rounds: 4
adrs: 14
validator_outcome: MAJOR_REVISION_RESOLVED
summary: "Fully declarative content vocabulary + fixed-layer engine, built vertical-slice-first"
---

# PLAN — 6x6 Variant Chess with Declarative Content

## 🎯 Executive Summary

**TL;DR:** Build one declarative content vocabulary (`trigger / condition / action`) that expresses
piece passives, rule cards, skill cards, and special-square abilities alike; build an immutable-state
engine that resolves it through a fixed four-layer pipeline; prove the whole stack with a thin
vertical slice before filling in content.

**What:** A hot-seat 6x6 variant-chess web app where boards, pieces, special squares, rule cards,
skill cards, and variant presets are all content data, editable in an in-app editor.

**Why:** The product thesis is a content platform, not a single game (SPEC Intent). Every
architectural choice below is subordinate to one requirement: *adding content must never require an
engine change.*

**Key decisions:**
- Effects are **fully declarative** — there is no code escape hatch (ADR-001). The only legal response
  to an inexpressible card is to extend the vocabulary and bump the schema version (ADR-005).
- Effect resolution uses a **total order**: lifecycle events in a fixed sequence, and within each
  event the fixed owner layers board square → piece passive → rule card → skill card (ADR-002).
  Content cannot reorder itself.
- One **unified vocabulary** across all four effect-bearing content kinds — pieces, rule cards, skill
  cards and special-square types (ADR-003) — including victory itself, expressed as a `win` action
  (ADR-012).
- **Immutable state**, which makes unlimited undo, replay, and the AC-013 property tests the same
  mechanism (ADR-004).
- Build **vertical-slice-first** (ADR-007) so the vocabulary meets the editor early, while it is still
  cheap to change.

**Estimated impact:** greenfield; ~8 phases. The engine and schema are the durable assets — the UI and
editor are re-hostable, and the mobile port (out of scope here) touches only the view layer.

## 📚 Prior Work

- `[[RESEARCH-variant-chess-6x6-cards]]` — prior art (Knightmare Chess's rule-breaking cards and point
  budget, Duck Chess's single-object twist, Chessplus's merge, Chess Evolved Online's status effects
  and zero-in-match-RNG stance, Sigil Engine's JSON-defined abilities), plus the MTG stack/priority
  pitfall that motivates the no-response-cards constraint.
- `[[SPEC-variant-chess-6x6-cards]]` — 18 acceptance criteria, status `draft`, quality 84/100. Its 10
  open questions are the input to this plan's interview; ADR-001…ADR-010 resolve or explicitly defer
  each one.
- Repo memory (`hm memory_retrieve`) returned no entries — greenfield project, no prior failures to
  inherit. Second Brain disabled.

## 🎙️ Interview Transcript

| # | Topic | Category | Question | Options | Choice | Note | → ADR |
|---|-------|----------|----------|---------|--------|------|-------|
| 1 | Effect representation | Architecture | How are card / passive / square effects expressed? | fully declarative · hybrid with code hook · declarative + sandboxed expressions | **Fully declarative** | Editor must cover 100% of content (SPEC Outcome 3); a code-hook card would be uneditable | ADR-001 |
| 2 | Resolution order | Contract | How are simultaneous effects across 4 sources ordered? | fixed layer pipeline · per-card priority field · layers + declaration order | **Fixed layer pipeline** | Determinism and debuggability over expressiveness | ADR-002 |
| 3 | Vocabulary sharing | Architecture | Do piece passives, card effects and square abilities share one vocabulary? | unified · separate per axis · unified with per-axis trigger limits | **Unified** | One interpreter, one editor form family | ADR-003 |
| 4 | Undo | Risk tolerance | Is undo/takeback in scope? | immutable + unlimited undo · immutable + single undo · no undo | **Immutable + unlimited undo** | Children mis-tap; immutability is also what AC-013 and replay need | ADR-004 |
| 5 | Phasing | Implementation phasing | Horizontal layers or vertical slice first? | vertical slice · engine→UI→editor · spec-then-parallel · end interview | **Vertical slice first** | Surfaces vocabulary errors at the cheapest moment | ADR-007 |
| 6 | Vocabulary limits | Contract | What happens when a card cannot be expressed? | extend vocabulary + version bump · drop/redesign the card · generic escape action | **Extend the vocabulary** | Keeps ADR-001 enforceable; the generic-escape option was rejected as a disguised code hook | ADR-005 |
| 7 | Editor forms | Architecture | Schema-generated forms or hand-crafted UI? | schema-driven auto · hand-crafted · auto + grid editor for pieces | **Hand-crafted** | Usability for 초·중학생 prioritized over decoupling; cost accepted knowingly | ADR-006 |
| 8 | Portals | Contract | Are paired (cross-referencing) squares in the MVP vocabulary? | include with cross-ref validation · defer to v2 | **Include** | High appeal; validator already checks dangling references (AC-011) | ADR-010 |
| 9 | Phase 5/6 parallelism | Risk tolerance | Is content authoring safe to run beside the editor build? | high-risk-cards-first gate · serialize 6 after 5 · parallel and absorb rework | **High-risk-cards-first gate** | Raised by `plan-validator`; keeps most of the parallel benefit while front-loading the vocabulary risk | ADR-011 |
| 10 | Win-condition representation | Contract | How are alternate win conditions (R1 King of the Hill, R2 Three Check) expressed? | `win` action in the shared Effect vocabulary · separate `winConditions` list · both | **`win` action in the shared vocabulary** | Raised by the Codex cross-model review, which found victory had no design at all; keeps ADR-003's unification | ADR-012 |
| 11 | Win-condition composition | Scope boundaries | Do rule-card win conditions replace or add to king capture? | additive · replacing · per-card flag | **Additive — king capture always wins** | Resolves SPEC Open Question 4, which had been left unanswered; also shortens matches rather than lengthening them | ADR-012 |
| 12 | AC-012 miss remedy | Risk tolerance | If the self-play median exceeds 40 plies, what may change? | content-level only (card pool) · reopen the SPEC · both, escalating | **Content-level only** | The SPEC's 60-ply cap and 24-piece array stay fixed; a content-level remedy that fails escalates to the user as a SPEC decision, not a silent plan change | Risk R-4 |

**Rounds vs. questions:** `interview_rounds: 4` counts interview *rounds* (batched question sets),
not questions. Rounds 1 and 2 carried 4 questions each; round 3 carried the single validator-raised
question #9; round 4 carried the three Codex-raised questions #10–#12. Entries #1–#12 are therefore
12 questions across 4 rounds.

Decisions made by default (not interviewed — recorded as assumptions, per the "no trivial questions"
rule): `boardgame.io` is not adopted (ADR-008); rendering is a DOM grid, not Canvas (ADR-009); the
concrete 10 rule / 14 skill card list is deferred to Phase 6 because it depends on the frozen
vocabulary; per-rule-card match-length budgets are deferred to the Phase 7 measurement (Risk R-4);
exceeding the browser storage quota refuses the save and reports it (no silent data loss).

## 📐 Architecture Decision Records

### ADR-001: Content effects are fully declarative — no code escape hatch
**Status:** Accepted (2026-08-05, via /hm:plan interview)
**Context:** SPEC Outcome 3 requires that any content the author creates in the in-app editor be
playable. RESEARCH recommended a hybrid (declarative schema + typed code hook), but a hook-backed card
cannot be represented in an editor form, so the hybrid silently breaks the outcome for exactly the
cards that are most interesting.
**Decision:** Every effect — piece passive, rule card, skill card, special-square ability — is a
`trigger / condition / action` structure drawn from a closed, versioned vocabulary. Engine source
contains the vocabulary interpreter; it contains no per-content behavior.
**Consequences:**
- ✅ The editor can express 100% of content by construction; AC-009, AC-014 and AC-018 become
  structurally satisfiable rather than aspirational.
- ✅ Content is data end-to-end: diffable, exportable (AC-015), and portable to the mobile build.
- ⚠️ Some RESEARCH card ideas will not fit the initial vocabulary and must wait for an extension.
- ⚠️ The vocabulary becomes a hard dependency of both the engine and the editor; see ADR-006.
**Rejected alternatives:**
- Hybrid with a typed `custom` hook — rejected: hook-backed content is uneditable, contradicting
  SPEC Outcome 3.
- Declarative plus a sandboxed expression language — rejected for the MVP: adds an interpreter and a
  safety-review surface before the plain vocabulary has been proven insufficient.
**Source:** Interview #1

### ADR-002: Effects resolve through a fixed four-layer pipeline
**Status:** Accepted (2026-08-05, via /hm:plan interview)
**Context:** With five content axes, a single move can fire a square ability, a piece passive, a rule
card modifier and a skill card effect at once. SPEC forbids an MTG-style stack, but forbidding
interrupts does not by itself make resolution deterministic.
**Decision:** Resolution is a **total order over (lifecycle event × owner layer)**, not over owners
alone.

*Lifecycle event sequence*, fixed, in this order:
`E1 generate-moves → E2 on-leave (origin square vacated) → E3 on-capture (occupant removed)
 → E4 on-enter (destination occupied) → E5 on-promote → E6 on-remove (deferred destructions)
 → E7 end-of-ply`.

*Within each event*, effects resolve in the ADR-002 owner layers: **(1) board square → (2) piece
passive → (3) rule card → (4) skill card.** Within a layer, in content-declaration order.

*Cascades:* an effect that itself triggers a later event (a portal producing a second `on-enter`,
a destruction producing an `on-remove`) enqueues that event **after** the current event completes,
never re-entering an event already passed. Cascade depth is capped at 8; exceeding it is a content
error surfaced at validation-fixture time, not a silent truncation.

*Invalidation:* if an earlier layer removes the piece an unresolved later-layer effect targets, that
effect is dropped, not retargeted. Every drop is recorded in the ply's resolution log.

Content cannot declare or alter its event or its layer.
**Consequences:**
- ✅ Resolution is a pure fold over a known-length list — reproducible, loggable, and directly
  testable.
- ✅ Any resolution bug localizes to one layer boundary.
- ✅ The event sequence answers SPEC Open Question 9 in full — layer order alone did not, because it
  never said *when* layers are entered or re-entered.
- ⚠️ Cards of the form "this applies before the square does" are inexpressible. If one is wanted later,
  it is a vocabulary extension under ADR-005, not a priority field.
- ⚠️ The cascade cap (8) is an arbitrary safety bound; if legitimate content needs more, raising it is
  a schema-version change so the decision stays visible.
**Rejected alternatives:**
- Per-card numeric `priority` — rejected: pushes ordering onto content authors (including children),
  and still requires a tie-break rule.
- Layers fixed with intra-layer order by file position — rejected: file ordering leaking into
  gameplay is not observable to the player.
**Source:** Interview #2; the lifecycle-event half was added after the Codex cross-model review found
that owner ordering alone is not a total order.

### ADR-012: Victory is a `win` action in the shared vocabulary, and is additive
**Status:** Accepted (2026-08-05, via /hm:plan interview)
**Context:** SPEC rule cards R1 (King of the Hill) and R2 (Three Check) are alternate win conditions,
but the draft plan implemented only hard-coded king capture and the 60-ply cap — victory had no
declarative design at all. SPEC Open Question 4 (do rule-card win conditions replace or add?) had
also been left unanswered.
**Decision:** Victory is expressed as a `win` **action** in the shared Effect vocabulary (ADR-003), so
content declares it like any other effect. Win conditions are **additive**: king capture always
remains a winning move, and a rule card adds a second path to victory rather than replacing the first.
Terminal precedence is fixed: **king capture short-circuits immediately at event E3** — the ply's
remaining events and layers are abandoned, so no later effect can resurrect the king, destroy the
capturing piece, or award a competing win. If two non-king-capture `win` actions resolve within the
same ply, the earlier (event, layer, declaration) position wins; the 60-ply cap (AC-003) is evaluated
only at E7 and therefore always loses to any `win` action in the same ply.
**Consequences:**
- ✅ SPEC AC-002's "immediately" and AC-013's "ends the ply a king is captured" become literally true
  of the implementation, which the previous data flow contradicted.
- ✅ Users can author new win conditions in the editor — a significant slice of the platform thesis
  that would otherwise have been engine-only.
- ✅ Additive composition shortens matches, which serves AC-012.
- ⚠️ The interpreter must support aborting resolution mid-ply, which is a control-flow shape ordinary
  actions do not need.
- ⚠️ Two win paths mean every rule card must be checked against the base game for unreachable or
  trivially-reachable victory.
**Rejected alternatives:**
- A separate declarative `winConditions` list — rejected: simpler to evaluate, but it forks the
  vocabulary in exactly the way ADR-003 exists to prevent, and it would leave victory uneditable in
  the same sense a code hook would.
- Both mechanisms — rejected: requires a third precedence rule between them for no added expressiveness.
- Replacing rather than adding — rejected: a rule card that removes king capture forces the UI to
  explain why a captured king did not end the match.
**Source:** Interviews #10 and #11

### ADR-013: Undo is a UI-level history operation, outside `legalActions`
**Status:** Accepted (2026-08-05, derived from the Codex cross-model review)
**Context:** ADR-004 committed to unlimited undo but never said whether undo is a game action. If it
were one, the random self-play agent could select it, and the 60-ply termination guarantee behind
AC-003 and AC-012 would no longer bound execution — matches could cycle forever, and offers could be
re-rolled to bypass AC-006's no-repeat rule.
**Decision:** Undo is **not** a member of `legalActions` and is invisible to the engine's action
space. It is a history operation over the immutable state list: it pops to a prior snapshot,
restoring the ply counter, per-player completed-turn counts, card-used flags, draft state and the PRNG
stream positions exactly as they were. Undo is unavailable after a terminal state. The self-play agent
and all headless suites never see it.
**Consequences:**
- ✅ AC-003's and AC-012's termination guarantees hold unconditionally.
- ✅ Undo cannot re-roll a draft offer, since the restored snapshot includes the PRNG positions.
- ⚠️ Undo is therefore not covered by the engine property suite; its correctness is an E2E concern
  (Phase 4).
**Rejected alternatives:**
- Undo as an engine action — rejected: breaks termination bounds and offer immutability.
- No undo — rejected: the user explicitly chose unlimited undo in Interview #4.
**Source:** ADR-004 + Codex cross-model review

### ADR-014: Domain-separated PRNG substreams
**Status:** Accepted (2026-08-05, derived from the Codex cross-model review)
**Context:** "All randomness derives from one match seed" is necessary but not sufficient. With a
single mutable stream, the random self-play agent's draws would advance the same stream the draft
offers consume, so a different action history would silently change the second offer — making offers
depend on board position and violating AC-006's no-bias clause and AC-004's replay guarantee.
**Decision:** The match seed derives independent, keyed substreams by domain:
`rng(seed, "rule-draw")`, `rng(seed, "draft", playerId, draftIndex)`, `rng(seed, "agent")`. Each is
consumed only by its own domain. No module-level global PRNG exists anywhere.
**Consequences:**
- ✅ Draft offers are a pure function of (seed, pool, playerId, draftIndex) — which is what makes the
  AC-006 bias-independence test possible at all (see Testing Strategy).
- ✅ Replay stays exact regardless of how the match was played.
- ⚠️ Substream key strings become part of the compatibility surface: renaming one changes every
  seeded outcome, so they are versioned with the schema.
**Rejected alternatives:**
- One sequential stream — rejected: couples unrelated domains, as above.
**Source:** Codex cross-model review

### ADR-003: One vocabulary shared by pieces, cards and squares
**Status:** Accepted (2026-08-05, via /hm:plan interview)
**Context:** Piece passives, card effects and square abilities are structurally the same thing
attached to different owners.
**Decision:** A single `Effect` vocabulary is shared by all three. The owner (piece / card / square)
determines which triggers are *available*, but the grammar, the interpreter and the editor form
family are one.
**Consequences:**
- ✅ One interpreter to write, test and mutate; one form family in the editor.
- ✅ A new action added for cards is immediately usable by squares and pieces.
- ⚠️ Trigger availability per owner must be part of the schema, or authors will write triggers that
  can never fire (an absent-case bug class).
**Rejected alternatives:**
- Separate per-axis vocabularies — rejected: three interpreters and three editor form families for
  one concept.
**Source:** Interview #3

### ADR-004: Immutable game state with unlimited undo
**Status:** Accepted (2026-08-05, via /hm:plan interview)
**Context:** Undo, deterministic replay, seeded reproduction, and the AC-013 property tests all want
the same thing — states that are values, not mutated objects.
**Decision:** `GameState` is immutable. Every action produces a new state; the match holds the state
list. Undo pops. All state reads pass through a `viewFor(player)` accessor so per-player redaction
(a future fog rule) stays possible.
**Consequences:**
- ✅ Undo is nearly free; replay and seeded bug reproduction come with it.
- ✅ AC-013's serialization round-trip and invariant walk operate on values.
- ⚠️ Memory grows with match length; bounded in practice by the 60-ply cap (AC-003).
**Rejected alternatives:**
- Mutable state with a command/inverse-command log — rejected: every new action type must also
  implement its inverse, which is exactly the per-content engine work ADR-001 forbids.
**Source:** Interview #4

### ADR-005: Vocabulary extension is the only escape hatch
**Status:** Accepted (2026-08-05, via /hm:plan interview)
**Context:** ADR-001 removes code hooks, so the project needs a stated, legal response to "this card
cannot be expressed" — otherwise the first hard card grows an ad-hoc hook and ADR-001 quietly dies.
**Decision:** When content cannot be expressed, add the required `trigger`/`condition`/`action` to the
vocabulary and bump `schema_version`. Existing content is migrated in the same change. A generic
"do arbitrary thing" action is prohibited.
**Consequences:**
- ✅ ADR-001 stays enforceable, and every extension is visible in the schema's version history.
- ✅ Vocabulary growth is a reviewable event rather than an invisible one.
- ⚠️ Every extension also requires editor work — see ADR-006.
- ⚠️ Migration of existing content is mandatory work per extension, not optional.
**Rejected alternatives:**
- A generic escape action — rejected: functionally a code hook wearing a schema costume.
- Dropping inexpressible cards — rejected as the *only* policy: it makes the vocabulary's initial
  guesses permanent.
**Source:** Interview #6

### ADR-006: Editor forms are hand-crafted, not schema-generated
**Status:** Accepted (2026-08-05, via /hm:plan interview)
**Context:** Schema-driven forms would make vocabulary extensions free on the editor side. The user
chose usability for 초·중학생 over that decoupling.
**Decision:** The editor's forms are purpose-built UI (including a visual grid editor for movement
patterns), not generated from the schema.
**Consequences:**
- ✅ Far better authoring experience for the target age group, which is the point of shipping an editor
  in the MVP at all.
- ⚠️ **Every ADR-005 vocabulary extension now requires matching editor work.** This coupling is
  accepted deliberately.
- ⚠️ Mitigation is mandatory, not optional: a *vocabulary-editor coverage test* asserts, for every
  vocabulary entry, both (a) that it is reachable from some editor control and (b) that the control
  **round-trips** it — author via the control → save → validate → re-open → identical value. The
  reachability half alone would only catch "forgot to add a control", not "added a control that
  writes the wrong shape"; the round-trip half is what closes R-2. The test fails the build when an
  extension lands without editor support (Phase 5 exit criterion).
**Rejected alternatives:**
- Schema-driven auto-generated forms — rejected: generic forms are unusable for the target age group.
- Auto forms plus a bespoke grid editor for pieces only — rejected as a half-measure that keeps both
  costs.
**Source:** Interview #7

### ADR-007: Vertical-slice-first phasing
**Status:** Accepted (2026-08-05, via /hm:plan interview)
**Context:** The riskiest artifact is the vocabulary, and its worst failure mode is discovering it is
wrong *after* the editor has been built against it.
**Decision:** Phase 3 drives a minimal content set (2 pieces, 1 rule card, 1 skill card, 1 square type)
through engine, UI and editor before the full content set or the full editor is built.
**Consequences:**
- ✅ Vocabulary errors surface while migration is cheap.
- ✅ Every axis has an end-to-end proof before breadth work starts.
- ⚠️ Some UI and editor code is touched twice (slice, then breadth).
**Rejected alternatives:**
- Engine → UI → editor horizontally — rejected: the editor, the strongest critic of the vocabulary,
  arrives last.
- Freeze the schema on paper, then parallelize — rejected: fixes the vocabulary before anything has
  been authored with it.
**Source:** Interview #5

### ADR-008: `boardgame.io` is not adopted
**Status:** Accepted (2026-08-05, default decision recorded for the record)
**Context:** RESEARCH left the choice open, conditional on online play.
**Decision:** Do not adopt `boardgame.io`. Implement turn flow and state management directly.
**Consequences:**
- ✅ No framework constraints on the immutable-state design (ADR-004) or the layer pipeline (ADR-002).
- ⚠️ If online play is ever added, transport and authority must be built or adopted then.
**Rejected alternatives:**
- Adopt it for its turn/undo/multiplayer machinery — rejected: SPEC makes online play a non-goal, so
  the only parts used would be the parts easiest to write directly.
**Source:** Default (SPEC non-goals); no interview round consumed.

### ADR-009: The board renders as a DOM grid
**Status:** Accepted (2026-08-05, default decision recorded for the record)
**Context:** 36 squares, plus an accessibility and portrait-mobile target.
**Decision:** Render the board with DOM elements and CSS grid; no Canvas or WebGL.
**Consequences:**
- ✅ Playwright can assert on real elements (AC-014, AC-017); keyboard and screen-reader support is
  reachable.
- ⚠️ Elaborate animation is harder later.
**Rejected alternatives:**
- Canvas — rejected: no performance need at 36 squares, and it costs testability and accessibility.
**Source:** Default; no interview round consumed.

### ADR-010: Paired squares (portals) are in the MVP vocabulary
**Status:** Accepted (2026-08-05, via /hm:plan interview)
**Context:** Portals require cross-square references, which the validator must check for symmetry as
well as existence.
**Decision:** Include a paired-square reference in the vocabulary; the validator enforces both that
the referenced square exists and that the pairing is symmetric.
**Consequences:**
- ✅ A high-appeal square type ships in the MVP; the schema learns cross-references early, while the
  content set is small.
- ⚠️ Adds a reference-integrity rule beyond AC-011's dangling-reference check.
**Rejected alternatives:**
- Defer to v2 — rejected: retrofitting cross-references into a shipped schema is more expensive than
  including them now.
**Source:** Interview #8

### ADR-011: Content authoring is gated on a high-schema-risk card batch
**Status:** Accepted (2026-08-05, via /hm:plan interview, raised by `plan-validator`)
**Context:** The draft plan let Phase 6 (authoring 24+ cards) run fully parallel to Phase 5 (the
hand-crafted editor). Because ADR-006 couples the editor to the vocabulary, a vocabulary gap
discovered while authoring would invalidate editor forms already built — which is risk R-2 itself,
enabled by the phase graph rather than prevented by it.
**Decision:** Split content authoring. **Phase 6a** authors only the 4–5 cards judged highest
schema-risk (multi-layer interactions, cross-references, status effects) and must clear before
Phase 5 begins its bulk form work. **Phase 6b** (the remaining content) runs parallel to Phase 5.
**Consequences:**
- ✅ The most likely vocabulary gaps surface before the editor's expensive surface is built.
- ✅ Most of the parallelism is retained — only 4–5 cards are on the critical path.
- ⚠️ Phase 5 acquires a dependency on Phase 6a, lengthening the critical path slightly.
- ⚠️ "Highest schema-risk" is a judgment call made at Phase 6a's start; it must be written down in the
  phase's output so the gate is auditable rather than retroactive.
**Rejected alternatives:**
- Serialize Phase 6 entirely after Phase 5 — rejected: safest, but it means authoring the editor
  against a vocabulary nothing has exercised, and it lengthens the schedule most.
- Keep full parallelism and absorb the rework — rejected: it accepts the project's #2 risk by
  default rather than by decision.
**Source:** Interview #9

## 🏗️ Technical Design

### Current state
Greenfield. The repository contains only harness scaffolding (`.claude/`), `CLAUDE.md`, the RESEARCH
document and the SPEC pair. No source, no build tooling, no tests.

### Affected components (all new)

| Component | Path (planned) | Responsibility |
|---|---|---|
| Content schema | `src/content/schema/` | Zod schemas for the 5 axes + the shared `Effect` vocabulary; `schema_version` |
| Content validator | `src/content/validate.ts` | Fail-closed validation, field-path errors, cross-reference and pairing integrity |
| Bundled content | `content/` | Pieces, rule cards, skill cards, square types, boards, presets — data only |
| Engine | `src/engine/` | Immutable state, domain-separated seeded RNG (ADR-014), layered move generation, **draft state and offer generation**, termination and win-condition evaluation, state history for undo |
| Effect interpreter | `src/engine/effects/` | The single `trigger/condition/action` evaluator (ADR-003), including the `win` action and the E1–E7 event sequence (ADR-002, ADR-012) |
| Game UI | `src/ui/` | DOM board, draft screen, card tray, hot-seat flow |
| Editor | `src/editor/` | Hand-crafted forms per axis, preset manager, local storage, export/import |
| i18n | `src/i18n/` | Key resolution; `ko` bundle |

### Dependencies
`react`, `react-dom`, `vite`, `typescript`, `zod` (schema + field-path errors), `vitest`,
`fast-check` (property tests), `@playwright/test`. No game framework (ADR-008), no state library —
immutable state plus React context suffices at this size.

### Architecture

```
content/*.json ──► validate (fail-closed, Zod) ──► ContentSet (frozen)
                                                        │
                                    ┌───────────────────┴───────────────────┐
                                    ▼                                       ▼
                              Engine (pure TS)                        Editor (React)
                    ┌────────────────────────────────┐          hand-crafted forms
                    │ legalActions(state)            │          per axis (ADR-006)
                    │   layer 1: square abilities    │                 │
                    │   layer 2: piece passives      │◄────────────────┘
                    │   layer 3: rule card           │        writes content, re-validates
                    │   layer 4: skill card          │
                    └────────────────────────────────┘
                                    │  apply(state, action) → new state (immutable)
                                    ▼
                              UI (DOM grid, ADR-009)
```

### Design decisions
- The engine imports nothing from React or the DOM (SPEC constraint), which is what lets Phases 3 and 7
  run the self-play and invariant suites headless.
- All randomness derives from one match seed (SPEC constraint), consumed through **domain-separated
  substreams** (ADR-014) passed into match construction — never a module-level global, which would
  break AC-004 and silently couple the test agent to draft offers.
- Draft state lives in the engine, not the UI (SPEC's engine-purity constraint): offer generation,
  per-player completed-turn counts, and the board-action gate are engine concerns, so AC-005/AC-006
  are headless unit-testable and survive serialization. The UI only renders offers and submits picks.
- Undo is a history operation over the state list, deliberately outside `legalActions` (ADR-013).
- `viewFor(player)` wraps every state read from day one, so a future fog rule does not require a
  cross-layer retrofit (RESEARCH pitfall 5).
- Validation errors carry a JSON field path (`piece.archer.movement[2].step`), which AC-011 asserts
  on; Zod's issue paths give this directly.

### Data flow (one ply)
`UI action → engine.apply(state, action)` → the E1–E7 event sequence runs, each event resolving its
four owner layers (ADR-002) → **a king capture at E3 short-circuits the remaining events and layers
immediately** (ADR-012) → any `win` action resolves at its own (event, layer) position → the 60-ply
cap is evaluated only at E7 → the resulting state, plus the ply's resolution log, is pushed onto the
match's state list → `viewFor(player)` renders.

### API changes
None — greenfield. The content schema *is* the public contract, and `schema_version` is its
compatibility marker (ADR-005).

## 📝 Implementation Plan

### Phase 0 — Project scaffold
- **depends_on:** `[]`
- **parallel_group:** `serial-0`
- **merge_hazards:** none
- **Scope (in):** `package.json`, `vite.config.ts`, `tsconfig.json`, `vitest.config.ts`,
  `playwright.config.ts`, CI script, directory skeleton.
- **Scope (out):** any game logic.
- **Exit criterion:** `npm run test` runs Vitest with one placeholder test passing, `npm run e2e`
  starts Playwright, `npm run build` produces a bundle, `tsc --noEmit` is clean.
- **Risk:** low
- **Rollback point:** n/a (first phase).

### Phase 1 — Content schema and fail-closed validator
- **depends_on:** `[0]`
- **parallel_group:** `serial-1`
- **merge_hazards:** `src/content/schema/**` — every later phase reads it; must land alone.
- **Scope (in):** the shared `Effect` vocabulary — the E1–E7 trigger set, conditions, and actions
  including `win` (ADR-002, ADR-012) — per ADR-003; schemas for piece (movement, attack, promotion,
  passives), rule card, skill card, square type, board, preset; `schema_version`; validator with
  field-path errors, dangling-reference checks, and portal pairing symmetry (ADR-010); the trigger
  availability table per owner (ADR-003 consequence).
- **Scope (out):** the interpreter, any content beyond fixtures.
- **Exit criterion:** `npm run test -- tests/content/validation.test.ts` passes AC-011's 7 fixtures
  (6 invalid, each error naming **both the content id and the JSON field path**; 1 valid), a
  portal-asymmetry fixture, and an **atomicity fixture**: a content set mixing valid and invalid
  records yields no `ContentSet` at all, starts no match, and exposes none of its valid subset.
- **Risk:** high — this is the vocabulary bet; Phase 3 exists to falsify it.
- **Rollback point:** Phase 0.

### Phase 2 — Engine core
- **depends_on:** `[1]`
- **parallel_group:** `serial-2`
- **merge_hazards:** `src/engine/**` — Phases 3–7 all build on it.
- **Scope (in):** immutable `GameState` and `viewFor`; domain-separated seeded PRNG (ADR-014); the
  **E1–E7 event sequence with its four owner layers, cascade queue and invalidation rule** (ADR-002);
  the effect interpreter including the `win` action; move/attack/**promotion** generation from piece
  definitions; special-square ability evaluation (layer 1); piece passive evaluation (layer 2);
  **draft state — offer generation, per-player completed-turn counts, the board-action gate**;
  king-capture short-circuit and win-condition precedence (ADR-012); the 60-ply material cap;
  the state history that undo reads (ADR-013); serialization; the per-ply resolution log.
- **Scope (out):** UI, editor, content breadth. Undo's *user-facing* behavior is Phase 4.
- **Exit criterion:** `tests/engine/setup.test.ts`, `tests/engine/win-condition.test.ts`,
  `tests/engine/skill-cards.test.ts`, `tests/engine/draft.test.ts` (AC-005, AC-006 — headless, no
  React), **`tests/content/piece-definitions.test.ts` (AC-009, including at least one custom
  promotion rule and its resulting piece)** and **`tests/content/special-squares.test.ts` (AC-018)**
  all pass — covering AC-001, AC-002, AC-003, AC-005, AC-006, AC-007, AC-008, AC-009, AC-018 — plus
  a king-capture short-circuit fixture proving a later-layer resurrection effect does **not** change
  the winner, and a state round-trip through serialization with an identical legal-action set.
- **Risk:** high — the layer pipeline is the most likely bug source in the project.
- **Rollback point:** Phase 1.

### Phase 3 — Vertical slice (ADR-007)
- **depends_on:** `[2]`
- **parallel_group:** `serial-3`
- **merge_hazards:** may amend `src/content/schema/**` — vocabulary corrections found here must land
  before Phases 4–6 start.
- **Scope (in):** a minimal content set — 2 pieces (one with a movement/attack split, one with a
  passive), 1 rule card, **3 skill cards (the minimum for one conforming AC-005 draft offer)**,
  1 square type; a throwaway UI harness good enough to play it;
  a first pass of the editor over exactly these four kinds. The four items **must be authored so that
  at least one reachable move fires all four pipeline layers at once** (square ability + piece passive
  + rule card + skill card), which is what actually exercises ADR-002's ordering.
- **Scope (out):** breadth in any axis.
- **Exit criterion:** (a) a fixture test drives the deliberate all-four-layer move and asserts the
  resolved outcome matches ADR-002's layer order — a passing match alone does not satisfy this;
  (b) a full match is playable end-to-end using only slice content; (c) a written vocabulary-gap list
  is produced (empty is an acceptable outcome). Any gap found is applied to the Phase 1 schema under
  ADR-005 *before* Phase 4 begins.
- **Risk:** medium — its purpose is to convert Phase 1's risk into known work.
- **Rollback point:** Phase 2.

### Phase 4 — Game UI and hot-seat flow
- **depends_on:** `[3]`
- **parallel_group:** `ui-4`
- **merge_hazards:** `src/ui/**` shared with Phase 5's editor shell — Phase 5 depends on this phase
  rather than running beside it. Phase 6a runs concurrently and may reopen `src/content/schema/**`
  (ADR-005 extension); this is **accepted as low impact** because Phase 4's UI is schema-generic — it
  renders card and square *text and state* through the content-set interface rather than encoding any
  specific trigger or action. A schema extension therefore changes what Phase 4 displays, not how it
  is built. Phase 5's hand-crafted forms do not have this property, which is exactly why ADR-011 gates
  Phase 5 on 6a and does not gate Phase 4.
- **Scope (in):** DOM board (ADR-009), move input with legal-target highlighting, **draft screens for
  all four picks (each of the two players, at match start and on their sixth turn)**, the open card
  tray (AC-017), the persistent drawn-rule-card display, visibly distinguished special squares with
  readable ability text (AC-018's UI clause), a surfaced rejection message for illegal card plays
  (AC-008's UI clause), the undo control (ADR-013), match result screen, portrait layout.
- **Scope (out):** editor, content breadth.
- **Exit criterion:** `e2e/hotseat.spec.ts` plays a match to a result and asserts, in addition to the
  four draft picks and card visibility (AC-017): the drawn rule card remains visible for the whole
  match (AC-004's display clause), an out-of-turn card play shows an error rather than failing
  silently (AC-008), special squares are visually distinguished and their ability text is readable
  (AC-018), and undo restores the prior position without re-rolling a draft offer (ADR-013).
- **Risk:** medium
- **Rollback point:** Phase 3.

### Phase 5 — Content editor and preset storage
- **depends_on:** `[4, 6a]` — the 6a vocabulary gate must clear first (ADR-011)
- **parallel_group:** `serial-5`
- **merge_hazards:** `src/editor/**`, plus the local-storage module shared with Phase 4's match state.
- **Scope (in):** hand-crafted forms for all five axes (ADR-006), including the visual grid editor for
  movement patterns and the board-painting UI for special squares; preset bundling; browser-local
  storage; JSON export/import; save blocked on validation failure; quota-exceeded reporting.
- **Scope (out):** sharing, remote content.
- **Exit criterion:** `e2e/editor.spec.ts` covers **both create and edit** flows for each of the five
  axes separately — piece, rule card, skill card, standalone special-square type, board with painted
  squares — plus preset bundling, and asserts for each that the authored or edited content affects
  gameplay in the same session without a reload (AC-014). AC-015's export/import round-trip passes.
  The vocabulary-editor coverage test passes — every vocabulary entry is both reachable from an editor
  control *and* round-trips through it (author → save → validate → re-open → identical value), per
  ADR-006. Saving content that fails validation is blocked with the offending field shown.
- **Risk:** high — largest UI surface, and the phase that pays ADR-006's coupling cost.
- **Rollback point:** Phase 4.

### Phase 6a — High-schema-risk content gate (ADR-011)
- **depends_on:** `[3]`
- **parallel_group:** `content-6a` — runs beside Phase 4.
- **merge_hazards:** may reopen `src/content/schema/**`; this is precisely why it precedes Phase 5.
- **Scope (in):** first, **specify the behavior of the complete card set on paper** — all ≥10 rule
  cards and ≥14 skill cards, one line of intended effect each. The RESEARCH drafts supply 14 rule and
  11 usable skill cards (S12 excluded), so at least 3 skill cards must be newly designed here; a
  risk ranking cannot rank content that does not yet exist. Then author only the 4–5 items judged
  highest schema-risk — multi-layer interaction, cross-references (portals), status effects with
  duration, resurrection/creation of pieces, and any `win` action (ADR-012). Commit the written
  ranking.
- **Scope (out):** the remaining content, i18n breadth.
- **Exit criterion:** (a0) the full card-set behavior specification is written and committed;
  (a) every 6a item passes schema validation; (b) `tests/content/gate-6a.test.ts`
  contains one scenario fixture per 6a item that drives the item's effect from a constructed position
  and asserts the resolved board state — "plays correctly" is that file passing, not a judgment call;
  (c) the written risk ranking that selected the 6a items is committed alongside them; (d) the
  vocabulary-gap list from authoring them is empty *or* the resulting ADR-005 extension has landed in
  the Phase 1 schema. Phase 5 does not begin until all four hold.
- **Risk:** medium — this phase exists to convert R-1/R-2 into early, cheap work.
- **Rollback point:** Phase 3.

### Phase 6b — Remaining content set and i18n
- **depends_on:** `[6a]`
- **parallel_group:** `content-6b` — may run beside Phases 4 and 5.
- **merge_hazards:** `content/**` only. With the vocabulary gated by 6a, a further extension here is
  unlikely; if one occurs it reopens `src/content/schema/**` and must serialize against Phase 5.
- **Scope (in):** the balance of ≥10 rule cards, ≥14 skill cards, ≥4 square types, the piece set,
  boards, the default preset, and the `ko` i18n bundle. Selection starts from the RESEARCH R1–R14 /
  S1–S12 drafts; S12 (Counterspell) is excluded as it violates the no-response-cards constraint.
- **Scope (out):** balance tuning (SPEC non-goal).
- **Exit criterion:** AC-010 and AC-016 pass; every bundled item validates with zero errors.
- **Risk:** low–medium — the vocabulary risk was front-loaded into 6a.
- **Rollback point:** Phase 6a.

### Phase 7 — Verification harness and final acceptance gate
- **depends_on:** `[4, 5, 6b]` — depending on Phase 2 alone would let the project's final verification
  phase complete while the UI and editor were unfinished, so AC-014/AC-015/AC-017 could never fail it
- **parallel_group:** `serial-7`
- **merge_hazards:** none (test-only).
- **Scope (in):** the uniform-random legal-action agent, written independently of engine evaluation
  code and drawing from its own PRNG substream (AC-012's differential oracle, ADR-014); the 1000-seed
  self-play run; the fast-check invariant suite (AC-013); the determinism suite (AC-004); the
  draft bias-independence test (see Testing Strategy); per-rule-card length reporting.
- **Scope (out):** balance changes; if the median exceeds 40 plies, the remedy is content-level only
  (Risk R-4).
- **Exit criterion:** AC-004, AC-012, AC-013 pass, **and** the complete suite — unit, property,
  statistical and both E2E specs — runs green in CI in one invocation. This is the project's final
  acceptance gate: all 18 acceptance criteria are green simultaneously, not phase by phase.
- **Risk:** medium
- **Rollback point:** Phase 6b.

## 🚫 Non-Goals (planning rollup)

Inherited unchanged from the SPEC: online/networked play, an AI opponent (the random agent is a test
fixture, not a playable opponent), accounts/ranking/monetization, community sharing beyond manual JSON
export/import, comeback or rubber-band balancing, the native mobile build, locales other than `ko`,
and the chess features the base rules exclude (checkmate, stalemate, threefold repetition, the 50-move
rule, castling, en passant, pawn double-step).

Added by this PLAN:
- **No code escape hatch for content behavior** (ADR-001) — including no "generic action" (ADR-005).
- **No per-card priority or content-declared ordering** (ADR-002).
- **No schema-generated editor forms** (ADR-006) — and correspondingly no expectation that vocabulary
  extensions are free on the editor side.
- **No game framework dependency** (ADR-008) and **no Canvas/WebGL rendering** (ADR-009).
- **No card balance tuning** in any phase; S12 (Counterspell) is excluded outright as it contradicts
  the SPEC's no-response-cards constraint.

## 🧪 Testing Strategy

- **Unit (Vitest):** move generation per piece definition (including a custom promotion rule),
  termination and win-condition precedence, draft mechanics (engine-side, headless), card timing,
  validator fixtures including the atomic-load case, i18n key checks. Fixtures are hand-authored
  *before* the code they check, per the SPEC's oracle evidence.
- **Property (Vitest + fast-check):** seed determinism (AC-004), draft disjointness (AC-006),
  turn-consumption (AC-007), engine invariants and serialization round-trip (AC-013), export/import
  round-trip (AC-015).
- **Structural bias-independence (AC-006's "no bias" clause):** offers are asserted to be a pure
  function of `(seed, cardPool, playerId, draftIndex)` — the test fixes those four and varies the
  board position, material balance and action history, then asserts the offer is unchanged. A
  deterministic algorithm can still be biased; the disjointness and determinism tests would both pass
  on a position-dependent implementation, so neither covers this.
- **Statistical (Vitest):** 1000-seed self-play median and maximum ply length (AC-012).
- **E2E (Playwright):** hot-seat match to a result with card visibility (AC-017); the editor authoring
  flows and same-session playability (AC-014).
- **Structural:** the vocabulary-editor coverage test (ADR-006) and a check that no bundled content id
  appears in `src/engine/**` (ADR-001, SPEC constraint).

## ⚠️ Risks & Mitigation

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R-1 | The vocabulary cannot express a card the author wants, discovered after Phases 4–6 are built | high | high | Phase 3 vertical slice forces the discovery early; Phase 6a gates the highest-risk cards ahead of Phase 5 (ADR-011); ADR-005 makes extension the defined, reviewable response |
| R-2 | ADR-006 coupling — a vocabulary extension ships without editor support, or with a control that writes the wrong shape | high | medium | Phase 6a clears the vocabulary before Phase 5's bulk form work (ADR-011); the vocabulary-editor coverage test asserts reachability **and** round-trip value equality, as a Phase 5 exit criterion and a permanent CI gate |
| R-3 | Layer-pipeline ordering bugs when 3–4 effects fire on one move | medium | high | ADR-002's total order; a resolution log per ply; property tests over random play (AC-013); Phase 3's slice content is deliberately authored so one move fires all four layers, asserted as a Phase 3 exit criterion |
| R-4 | Random self-play median exceeds 40 plies (AC-012 fails) | medium | medium | Phase 7 reports per-rule-card length. **Permitted remedies are content-level only**: drop or replace slow rule cards, raise the share of cards adding a fast `win` condition (ADR-012), or retune card effects. The 60-ply cap (AC-003) and the 24-piece Los Alamos array (AC-001) are SPEC-fixed and must not be changed as a plan-level remedy — earlier drafts of this row proposed exactly that. If content-level remedies are exhausted and the median still exceeds 40, the phase halts and escalates to the user as a SPEC amendment decision |
| R-5 | Editor scope overruns; Phase 5 is the largest UI surface and serves the least experienced users | medium | medium | Phase 3 delivers a first editor pass over four content kinds, so Phase 5 is breadth over an already-validated shape |
| R-6 | Immutable state memory growth in long matches | low | low | Bounded by the 60-ply cap (AC-003) |
| R-7 | Browser storage quota exceeded with user content | low | low | Save refused with an explicit message; export to JSON is the escape valve |

## ✅ Success Criteria

Mirrors the SPEC's verification criteria; each item is the phase that proves it.

- [ ] AC-001 6x6 Los Alamos initial position — Phase 2
- [ ] AC-002 king capture wins — Phase 2
- [ ] AC-003 60-ply cap resolves by material — Phase 2
- [ ] AC-004 seed determinism — Phase 7
- [ ] AC-005 first draft offers 3 — Phase 2 (engine) + Phase 4 (UI)
- [ ] AC-006 second draft at turn 6, no repeats, unbiased — Phase 2 (engine) + Phase 7 (bias test)
- [ ] AC-007 card play consumes the turn — Phase 2
- [ ] AC-008 out-of-turn card play rejected — Phase 2
- [ ] AC-009 pieces defined by data — Phase 2 (`tests/content/piece-definitions.test.ts`)
- [ ] AC-010 ≥10 rule / ≥14 skill / ≥4 square types, all valid — Phase 6b
- [ ] AC-011 fail-closed validation with field paths — Phase 1
- [ ] AC-012 self-play median ≤ 40 plies, max ≤ 60 — Phase 7
- [ ] AC-013 engine invariants under random play — Phase 7
- [ ] AC-014 editor content immediately playable — Phase 5
- [ ] AC-015 export/import round-trip — Phase 5
- [ ] AC-016 i18n keys resolvable in `ko` — Phase 6b
- [ ] AC-017 both players' cards visible — Phase 4
- [ ] AC-018 special squares from data — Phase 2 (`tests/content/special-squares.test.ts`) + Phase 4
      (visibility and ability text, `e2e/hotseat.spec.ts`)
- [ ] Final acceptance: all 18 criteria green in one CI invocation — Phase 7

## 🔍 Plan Validation

**First pass — `plan-validator`: MAJOR_REVISION** (3 critical, 2 warnings, 1 suggestion).

| # | Severity | Critique | Resolution |
|---|---|---|---|
| 1 | critical | AC-009 and AC-018 were claimed as Phase 2 coverage, but neither `tests/content/piece-definitions.test.ts` nor `tests/content/special-squares.test.ts` appeared in any phase exit criterion; Phase 2's scope also omitted square-ability evaluation despite the architecture diagram assigning it to pipeline layer 1 | Fixed — both test files named in Phase 2's exit criterion; square-ability and piece-passive evaluation added to Phase 2 scope; Success Criteria now cite the test files |
| 2 | critical | Phase 6's `parallel_group` claimed it could run beside Phase 5, while its own `merge_hazards` described the collision that claim enables — risk R-2 admitted by the phase graph | Resolved via Interview #9 → **ADR-011**: Phase 6 split into 6a (high-schema-risk gate, precedes Phase 5) and 6b (parallel). Phase 5 now `depends_on [4, 6a]`; Phase 7 on `[2, 6b]` |
| 3 | critical | Frontmatter `interview_rounds: 2` contradicted the 8-row transcript | Fixed — the reviewed document disclosed no rounds-vs-questions distinction anywhere, so the number was unverifiable from the document itself. The distinction is now stated explicitly in the transcript section, and the count is 3 after Interview #9. (An earlier draft of this row called the finding a validator misreading; that framing was wrong and is retracted.) |
| 4 | warning | R-3's "dedicated multi-layer fixtures in Phase 3" mitigation was not enforced by Phase 3's exit criterion — a playable match need never fire more than one layer | Fixed — Phase 3 scope now requires the slice content to co-fire all four layers on at least one move, asserted by a named fixture test in the exit criterion |
| 5 | warning | ADR-006's coverage test checked only structural reachability, not that a control writes a correct value | Fixed — the test now also requires round-trip value equality; ADR-006 and Phase 5's exit criterion updated |
| 6 | suggestion | No PLAN-level Non-Goals rollup | Fixed — `## 🚫 Non-Goals (planning rollup)` added |

**Second pass — `plan-validator`: NEEDS_REVISION** (0 critical, 2 new warnings). All six first-pass
critiques confirmed resolved in substance; the dependency graph
`0→1→2→3, 3→{4,6a}, {4,6a}→5, 6a→6b, {2,6b}→7` was hand-traced as acyclic and consistent with each
phase's `parallel_group` and `merge_hazards`. Two defects were *introduced* by the Phase 6 split:

| # | Severity | Critique | Resolution |
|---|---|---|---|
| 7 | warning | Phase 4's `merge_hazards` said nothing about Phase 6a running beside it and possibly reopening `src/content/schema/**` — an unstated assumption rather than an evaluated risk | Fixed — Phase 4's `merge_hazards` now states the hazard and why it is accepted (Phase 4's UI is schema-generic; Phase 5's hand-crafted forms are not, which is why only Phase 5 is gated) |
| 8 | warning | Phase 6a's exit criterion said the items must "play correctly" — the same unauditable phrasing Phase 3's exit criterion had just been tightened away from, in the very phase ADR-011 exists to make auditable | Fixed — the criterion now names `tests/content/gate-6a.test.ts` with one scenario fixture per 6a item, plus the committed risk ranking |

The validator also pushed back on this table's own first-pass row 3, correctly: the reviewed document
contained no rounds-vs-questions disclosure, so characterizing the finding as a misreading was wrong.
Row 3 above is corrected and the earlier framing retracted.

Both second-pass findings were warning-level with a single defensible fix each, so they were corrected
directly rather than routed through a follow-up interview round; this deviates from the stage's
"one interview round per warning" instruction for NEEDS_REVISION and is recorded here rather than
left implicit. A third pass was not run.

**Cross-model second opinion — Codex (`codex:rescue`, manual):** 2 critical, 12 major, 2 minor, 1 nit.
Invoked at the user's request; note that `second_opinion.models: ["codex"]` in `.claude/harness.yaml`
is consumed by `/hm:review`, not by this stage. Codex found substantive defects both `plan-validator`
passes missed — chiefly that the plan had **no design for content-defined win conditions at all**,
despite SPEC rule cards R1/R2 being exactly that.

| # | Severity | Critique | Resolution |
|---|---|---|---|
| 1 | critical | ADR-002's "fixed layer pipeline" ordered effect *owners* but not lifecycle events (generate-moves, on-leave, capture, on-enter, promote, remove, cascades) — so it was not the total order SPEC Open Question 9 demanded | Fixed — ADR-002 amended to a total order over (event × layer) with the E1–E7 sequence, a cascade queue with a depth cap of 8, and an explicit invalidation rule |
| 2 | critical | King-capture termination was checked *after* the whole pipeline resolved, contradicting AC-002's "immediately" and AC-013 — a later effect could resurrect the king or change the winner | Fixed — ADR-012 defines a short-circuit at event E3 plus precedence over other `win` actions and the 60-ply cap; Phase 2 exit adds a resurrection-does-not-change-the-winner fixture |
| 3 | major | Content-defined win conditions were never designed; only hard-coded king capture and the ply cap existed | Resolved via Interviews #10/#11 → **ADR-012**: victory is a `win` action in the shared vocabulary, additive to king capture. This also closes SPEC Open Question 4, which had been left unanswered |
| 4 | major | Draft mechanics were absent from Phase 2's engine scope but tested as unit tests, inviting timing and offer-selection logic into React and breaking engine purity | Fixed — draft state, offer generation, turn counts and the board-action gate moved into Phase 2 scope and exit criteria; Phase 4 keeps only rendering and submission |
| 5 | major | AC-006's "no bias toward either player's position" had no oracle — determinism and disjointness both pass on a position-biased implementation | Fixed — a structural bias-independence test added to the Testing Strategy and Phase 7 scope: offers must be a pure function of `(seed, pool, playerId, draftIndex)` |
| 6 | major | A single mutable PRNG stream would couple the test agent's draws to draft offers, making offers depend on action history | Fixed — **ADR-014** requires domain-separated keyed substreams |
| 7 | major | Player-facing clauses of AC-004 (persistent rule display), AC-008 (surfaced rejection) and AC-018 (square visibility and readable text) were scoped but never asserted | Fixed — all three added to Phase 4's E2E exit criterion; AC-018 now maps to both a unit and an E2E check |
| 8 | major | AC-009's named test covered movement but the oracle had no promotion fixture, a common place for built-in pawn assumptions to leak into engine code | Fixed — Phase 2 exit requires at least one custom promotion rule and its resulting piece |
| 9 | major | Fail-closed validation was tested per-record, not as an atomic match-start boundary — a loader could partially register valid records before failing | Fixed — Phase 1 exit adds a mixed valid/invalid atomicity fixture and requires both content id and field path in every error |
| 10 | major | Phase 5's exit named one generic E2E flow, not AC-014's create-or-edit flows across all five axes | Fixed — Phase 5 exit now enumerates create **and** edit for each of the five axes plus preset bundling |
| 11 | major | Phase 7 depended only on `[2, 6b]`, so the final verification phase could complete with the UI and editor unfinished | Fixed — Phase 7 now `depends_on [4, 5, 6b]` and is explicitly the final acceptance gate requiring all 18 criteria green in one CI invocation |
| 12 | major | R-4's remedies (tighten the ply cap, adjust the starting array) contradicted SPEC-fixed values | Resolved via Interview #12 — remedies are content-level only; exhausting them halts and escalates to the user as a SPEC amendment decision |
| 13 | major | Unlimited undo was unreconciled with ply counting and self-play; a random agent choosing undo would void the 60-ply termination bound | Fixed — **ADR-013** places undo outside `legalActions` as a UI history operation restoring counters, card flags, draft state and PRNG positions |
| 14 | major | Phase 6a would rank "highest schema risk" over cards that did not exist yet — RESEARCH supplies only 11 usable skill cards against a required 14 | Fixed — Phase 6a now specifies the complete card set's behavior on paper first, as exit criterion (a0) |
| 15 | minor | The Phase 3 slice had 1 skill card but claimed a "full match", which needs 3 distinct cards per offer | Fixed — the slice now carries 3 skill cards |
| 16 | minor | "Draft screens for both skill picks" was ambiguous for a four-pick hot-seat flow | Fixed — Phase 4 now says all four picks (two players × two draft times) |
| 17 | nit | "All three effect-bearing axes" undercounts — pieces, rule cards, skill cards and square types are four | Fixed in the Executive Summary and ADR-003's framing |

Codex's open questions are answered by ADR-002 (event chronology, cascades), ADR-012 (short-circuit
and win precedence, win-condition representation), ADR-013 (undo boundaries), ADR-014 (substreams),
Phase 6a's exit (a0) (card behavior before the gate), and Phase 7's revised dependencies (final
acceptance phase).

No further validation pass was run after this revision. The revision is large — three new ADRs, an
amended ADR-002, and changes to every phase from 1 through 7 — so a further review pass before
`/hm:execute` would be reasonable and is the user's call.
