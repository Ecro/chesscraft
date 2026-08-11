---
type: plan
task_slug: same-turn-skill-move-balance
status: complete
created: 2026-08-11
tags: [strange-chess, plan, typescript, game-balance, turn-model, skill-cards, royal-capture]
research_doc: "[[RESEARCH-same-turn-skill-move-balance]]"
interview_rounds: 6
adrs: 5
validator_outcome: NEEDS_REVISION_RESOLVED
summary: "Make royals skill-immune and tune all 24 cards against new same-turn royal captures"
---

# PLAN — Same-turn skill and move balance

## 🎯 Executive Summary

**TL;DR.** Keep the accepted `[play_card?] → move` turn. Make every royal piece immune to direct skill targeting and skill-caused mutation, then classify all 24 bundled skills explicitly so a card cannot make a royal-capture move newly legal in its same-turn follow-up. Preserve exact royal captures that were already legal before the card. Tune `skill.quake` further: its relocated ordinary piece is protected from capture until the current ply closes, including after portal relocation.

**What.** Schema v11 adds two required skill-card declarations: `royalFollowUp` (`preserve` or `preserve-existing`) and `protectRelocatedAfterPlay` (boolean). Pre-v11 documents are normalized before strict parsing. The engine gains skill-layer-only royal immunity and a pending-turn baseline of exact royal-capture action keys. Bundled content declares a policy for every skill; 18 potentially geometry-changing cards use `preserve-existing`, while 6 non-geometry cards use `preserve`. A deterministic audit and bounded generated counterexample search exercise every card.

**Why.** The current shipped behavior permits both direct card wins (`skill.volley` destroys a king) and card-plus-move wins (`skill.knight-leap` creates a new king capture). Reverting card play to a full-turn cost is explicitly rejected. The player instead wants skill-plus-move preserved, royals immune to skills, and each card tuned according to its identity.

**Key decisions.** Skill-only royal immunity (ADR-001); exact pre-card capture baselines and explicit per-card policy (ADR-002); concrete 24-card dispositions plus Quake's final-arrival protection (ADR-003); a non-vacuous audit oracle (ADR-004); state-derived UI feedback (ADR-005).

**Estimated impact.** Five serial phases touching the content schema/import path, engine state and move generation, AI position keys, all bundled skill declarations, editor round-trip/forms, localized rejection/help copy, and engine/content/UI tests. No new library and no change to the `[play_card?] → move` or one-ply-per-turn contracts.

## 📚 Prior Work

- [[RESEARCH-same-turn-skill-move-balance]] identifies the no-response terminal transition as the problem and compares global, timing, and content-only approaches.
- [[PLAN-skill-then-move-and-effect-visibility]] establishes `[play_card?] → move`, one card per turn, contextual undo, same-ply effects, and the reason card play must not return to consuming the turn.
- [[REVIEW-skill-then-move-and-effect-visibility-2026-08-08]] records that the AI search and position key must treat the intermediate card state as part of one turn.
- `tests/engine/skill-cards.test.ts:190-243` proves two live terminal routes: direct `skill.volley` royal destruction and a `skill.knight-leap` follow-up royal capture.
- `[fail:design:rule-keyed-to-event-not-state]` requires the royal-immunity backstop to inspect skill-caused state transitions, not only selected targets or the usual capture event.
- `[wiki:architecture:piece-info-affordances]` requires a rejected board interaction to use the existing state-driven hint/rejection surface.

## 🎙️ Interview Transcript

| # | Topic | Category | Question | Options | Choice | Note | → ADR |
|---|---|---|---|---|---|---|---|
| 1 | Royal rule scope | Scope | Which royal rule covers direct and follow-up skill kills? | skill-turn protection / new threats only / all-skill immunity / reported cards only | **All-skill immunity + per-card tuning** | User added that Volley already kills a king directly | ADR-001, ADR-003 |
| 2 | Indirect skill capture | Architecture | How should skill-buffed friendly pieces be handled? | affected piece block / card-by-card / allow | **Card-by-card** | Rejects one blanket restriction for every card | ADR-002, ADR-003 |
| 3 | Audit breadth | Scope | Which bundled cards are inspected? | all 24 / offensive only / reported only | **All 24** | Every shipped skill receives an explicit disposition and resolving test | ADR-003, ADR-004 |
| 4 | Tuning style | Product contract | What is the default balancing lever? | after-move timing / identity-specific minimum / numeric only / no-capture turn | **Identity-specific minimum** | Preserve each card's ordinary-piece identity | ADR-003 |
| 5 | Completion rule | Verification | What common gate must varied card fixes meet? | no newly legal same-turn royal capture / obvious combos only / playtest only | **No newly legal same-turn royal capture** | Exact `(from,to)` capture actions define the comparison | ADR-002, ADR-004 |
| 6 | Protected relocation grammar | Contract | Which authored relocations may request final-arrival protection? | one unquantified single-target teleport / last relocation wins / omit Quake protection | **One unquantified single-target teleport** | Portal final square is protected; removed targets leave no grant | ADR-003 |

## 📐 Architecture Decision Records

### ADR-001: Royal immunity is a skill-layer rule, not a shared effect rule

**Status:** Accepted (2026-08-11, via /hm:plan interview)

**Context:** `chosen_enemy` and `chosen_friendly` currently include royals, and the shared action executor serves square, piece, rule, and skill effects. Filtering the shared resolver without provenance would silently change non-skill rules.

**Decision:** A royal cannot be directly selected or mutated by an effect whose bound layer is `skill`, whether the royal is friendly or enemy. Card target generation omits royal squares. Execution independently checks `bound.layer === 'skill'` and preserves any royal that a selector, quantifier, cascade, destroy, teleport, promotion, swap, freeze, or grant path nevertheless reaches. Quantified effects skip royal subjects and continue over nonroyals. Square, piece, and rule layers remain unchanged. Explicit `win` actions and non-royal alternate wins are outside this ADR.

**Consequences:**

- ✅ `skill.volley`, `skill.sacrifice`, `skill.quake`, defensive buffs, and future skill actions all obey one direct-immunity contract.
- ✅ Shared vocabulary retains its non-skill semantics, pinned by positive controls.
- ⚠️ Friendly skills can no longer teleport, shield, freeze, promote, or otherwise affect the mover's own royal.
- ⚠️ Target filtering alone is insufficient; the execution backstop must remain synchronized with future actions.

**Rejected alternatives:**

- Enemy-only immunity — rejected because the user chose all-skill immunity and friendly king buffs/teleports create the same exception surface.
- Selector filtering only — rejected because quantifiers, indirect relocation, and future actions can bypass selection.
- Immunity inside the shared target resolver — rejected because it would alter rule, square, and piece effects.

**Source:** Interview #1

### ADR-002: Each card declares an exact pre-existing royal-capture policy

**Status:** Accepted (2026-08-11, via /hm:plan interview)

**Context:** The user rejected a blanket ban on royal capture after every skill, but requires bundled cards not to create new same-turn royal captures. After a card resolves, `legalActions(state, content)` cannot reconstruct the pre-card board from `turnCard` alone.

**Decision:** Schema v11 requires `SkillCardDef.royalFollowUp: 'preserve' | 'preserve-existing'`. For `preserve-existing`, card play computes sorted exact royal-capture keys (`from>to`) from a moves-only generator before effects resolve and stores them as `GameState.royalCaptureBaseline`. While that card is pending, royal captures are legal only when their exact key is in the baseline. A capture authorized by both ordinary and skill-granted geometry is allowed precisely when the key existed before the card; movement-source attribution is deliberately unnecessary. The baseline is initialized to `null`, set only for a pending `preserve-existing` card, folded into the AI position key, and cleared by move, forced end, terminal card result, and every other turn close-out.

For compatibility, `loadContentSet` normalizes every source declaring `schemaVersion <= 10` before strict record parsing, injecting `royalFollowUp: 'preserve'` and `protectRelocatedAfterPlay: false`. A v11 source missing either field fails. Writers and bundled content emit both fields explicitly.

**Consequences:**

- ✅ An unrelated skill does not erase an exact king capture that was already legal.
- ✅ Cards opt into the stronger follow-up rule individually, matching the user's card-by-card decision.
- ✅ Exact action identity resolves overlap without changing `Action` or tagging movement patterns.
- ⚠️ `GameState`, initialization, fixtures, AI hashing, undo/replay assumptions, schema versioning, import normalization, and editor writes all change together.
- ⚠️ Pre-v11 authored cards default to `preserve`; direct royal immunity still applies, but they do not gain the bundled follow-up guarantee automatically.

**Rejected alternatives:**

- Global no-royal-capture skill turn — rejected by Interview #2.
- Movement-source provenance on `Action` — rejected because overlap between ordinary and granted movement becomes ambiguous and widens the public action contract.
- Card-ID lists in the engine — rejected because content IDs may not own engine behavior.
- Zod defaults for missing fields — rejected because they would also accept malformed v11 documents.

**Source:** Interviews #2 and #5

### ADR-003: All 24 bundled skills receive explicit dispositions; Quake protects its final arrival

**Status:** Accepted (2026-08-11, via /hm:plan interview)

**Context:** Fixing only reported cards leaves equivalent blocker-removal, relocation, spawn, revive, promotion, and movement-grant paths. Applying one timing rule to every card erases card identity.

**Decision:** Every bundled skill explicitly writes both v11 fields. The dispositions are:

| Policy | Cards | Reason / additional tuning |
|---|---|---|
| `preserve-existing` | `teleport`, `swap`, `revive`, `coronation`, `knight-leap`, `charge`, `recall`, `shove`, `recruit`, `volley`, `sacrifice`, `blink`, `mend`, `quake`, `dart`, `tide`, `brand`, `echo` | These can relocate, remove, create, revive, transform, or grant geometry and therefore can create a royal capture in a valid position. Their non-royal same-turn effects remain. |
| `preserve` | `freeze`, `snare`, `bulwark`, `shackle`, `leash`, `veil` | These alter enemy movement or friendly protection without changing the mover's same-turn attack geometry or occupancy. Direct royal immunity still applies. |

`skill.quake` additionally sets `protectRelocatedAfterPlay: true`; all other bundled cards set it to `false`. The flag is legal only when the card has exactly one unquantified, unconditional `teleport_piece` action whose target kind resolves to at most one piece, and no other relocation action. Loader validation rejects zero relocation, conditional relocation, `forEach`, multi-subject target kinds, and multiple relocation actions when the flag is true.

After the card's full `on_play` execution and the complete `cascadeEnter` chain, the engine attaches a duration-one `block_capture` grant to the relocated subject's final surviving square (`untilPly = state.plyCount + 1`, source is the card and layer is `skill`). If the subject is removed by a bomb or another entry effect, no grant is attached. Thus Quake cannot place an ordinary piece beside an attacker and cash it out immediately; a portal carries protection to the paired destination.

**Consequences:**

- ✅ The inventory makes omissions visible and gives new bundled cards a precedent.
- ✅ Cards retain ordinary-piece combos and individual identities instead of sharing one global timing rule.
- ✅ Quake receives a specific fix for the reported place-and-capture interaction.
- ⚠️ Adding a bundled card requires classification and a resolving audit fixture.
- ⚠️ Final-arrival protection adds a narrow schema/editor concept and relies on a deliberately conservative authoring grammar.

**Rejected alternatives:**

- One after-move timing for all offensive cards — rejected by Interview #4.
- Only `volley`, `quake`, and `knight-leap` — rejected by Interview #3.
- A grant on Quake's first destination — rejected because portals leave square-keyed grants behind.
- Piece identity — rejected because the board model intentionally has none.
- Last relocation wins — rejected because quantified or multi-action cards would become order-dependent.

**Source:** Interviews #3, #4, and #6

### ADR-004: A runtime guarantee is backed by a non-vacuous 24-card counterexample search

**Status:** Accepted (2026-08-11, via /hm:plan interview)

**Context:** A list of card IDs in hand-written tests can pass without any card resolving, while random self-play rarely chooses precise two-action tactics. Exhaustive enumeration of every legal 6×6 state is not tractable.

**Decision:** Engine tests expose or wrap the moves-only royal-capture key calculation used by ADR-002. For every legal card play in the audit corpus, compare post-card royal-capture keys with the pre-card set according to its declaration. The corpus has three required layers:

1. One deterministic resolving fixture for every one of the 24 bundled cards; every coverage counter must be positive.
2. Category fixtures for direct target, friendly relocation, enemy relocation, blocker removal, ordinary/granted overlap, promotion, spawn/revive, hostile-square removal, Quake-to-portal, and Quake-to-bomb.
3. Seeded `fast-check` positions on 6×6 with exactly one royal per side, zero to six nonroyals, shipped square/rule contexts, and every legal target tuple enumerated for each reached state.

Synthetic positive controls for direct destroy, relocation, granted movement, and blocker removal must make the oracle fail when declared `preserve`, proving the gate detects the intended class. The generated corpus is described as a bounded counterexample search, not a mathematical proof; the runtime exact-baseline filter is the all-state guarantee for cards declared `preserve-existing`.

**Consequences:**

- ✅ Each card is proven reachable in the test, and each major terminal path has a failing control.
- ✅ The test and runtime use one engine-owned capture identity rather than reimplementing chess geometry.
- ⚠️ The bounded corpus cannot prove that a `preserve` card is harmless in every future interaction; classification still requires review when vocabulary changes.
- ⚠️ Generated tests need deterministic seeds and a fixed run budget to remain CI-stable.

**Rejected alternatives:**

- Random self-play only — rejected because it under-samples tactical target pairs.
- One hand-written fixture per card only — rejected because card-name coverage is not state-space coverage.
- Claiming exhaustive proof — rejected because arbitrary placements, rules, squares, and transient state are combinatorial.

**Source:** Interviews #3 and #5

### ADR-005: Legal state owns highlights and two localized explanations

**Status:** Accepted (2026-08-11, via /hm:plan interview)

**Context:** The board already derives card targets and moves from `legalActions`, and the hint bar owns localized rejection feedback. A hidden exception would make correct engine behavior appear broken.

**Decision:** Royal squares omitted by ADR-001 never appear as skill targets. `describeRejection` adds `royal-skill-immune` for a direct skill attempt and `royal-followup-blocked` for a royal capture absent from the pending baseline. The shipped Korean bundle explains both (the repository has no separate English locale). Match help states that skills cannot affect kings directly and that selected cards cannot create a new same-turn king capture. No persistent board badge is added: the restriction exists only inside the card-to-move intermediate state and legal highlights already reveal it.

**Consequences:**

- ✅ UI target and capture affordances cannot drift from engine legality.
- ✅ A rejected tap has a specific player-facing reason.
- ⚠️ Two rejection codes and help strings expand the localization completeness gate.
- ⚠️ Direct royal targets are normally absent, so a deliberate illegal-action test is required to exercise that rejection.

**Rejected alternatives:**

- Silent target removal — rejected because the player cannot distinguish immunity from a broken card.
- Persistent royal shield badge — rejected because the rule ends when the pending move closes and would add board noise.
- UI-side filtering — rejected because it duplicates engine legality.

**Source:** Interview #1 and `[wiki:architecture:piece-info-affordances]`

## 🏗️ Technical Design

### Current State

- `GameState.turnCard` distinguishes the intermediate card-to-move state but carries no pre-card legality snapshot.
- `candidatesFor` includes every piece of the requested side, including royals.
- `executeActions` is shared by all effect layers; `BoundEffect.layer` is the provenance boundary.
- Royal capture is detected through the direct capture short-circuit and the state-based `royalTransition` fallback.
- Active protection is square-keyed, so protection attached before a portal relocation stays behind.
- `skillCardDef` is strict and has no migration defaults; `loadContentSet` has the source `schemaVersion` before record parsing.

### Affected Components

| Component | Change |
|---|---|
| `src/content/schema.ts` | v11 fields and types; schema-version comment |
| `src/content/load.ts` | `<=10` normalization; flagged-relocation syntactic validation |
| `src/editor/io.ts`, recipe/form modules | v11 writes, round-trip, authoring controls and validation copy |
| `src/content/sets/bundled.ts` | 24 explicit dispositions; Quake flag |
| `src/engine/types.ts`, `match.ts` | `royalCaptureBaseline` contract and initialization |
| `src/engine/engine.ts` | moves-only capture keys, skill-only immunity, baseline filtering, final-arrival protection, rejection codes |
| `src/engine/ai/search.ts` | fold baseline into `positionKey`; preserve one-turn search semantics |
| `src/i18n/en.ts`, `ko.ts` | rejection, help, and editor copy |
| Engine/content/UI tests | migration, audit, invariants, interaction feedback |

### Dependencies

No new runtime or development dependency. Use existing Zod, Vitest, fast-check, engine action generation, and i18n completeness tests.

### Architecture

```text
pre-card state
  ├─ moves-only royalCaptureKeys ──► baseline (selected cards only)
  └─ play_card
       ├─ target generation omits royals
       ├─ skill-layer executor preserves royals
       ├─ on-enter cascade reaches final square
       └─ optional final-arrival protection
              ↓
pending GameState(turnCard, royalCaptureBaseline)
              ↓
legal follow-up moves
  ├─ ordinary captures unchanged
  ├─ exact pre-existing royal captures retained
  └─ newly created royal captures filtered + explained
```

### Design Decisions

- Skill provenance, not action kind, owns direct immunity (ADR-001).
- Exact `(from,to)` keys are the legality identity; no movement-source field is added (ADR-002).
- Schema fields are strict for v11 and injected only at the `<=10` compatibility boundary (ADR-002).
- Bundled declarations are explicit, not inferred from card IDs at runtime (ADR-003).
- Quake protection attaches after cascade to the final surviving square and uses a conservative single-relocation grammar (ADR-003).
- The bounded audit discovers regressions; the runtime baseline enforces the declared all-state rule (ADR-004).

### Data Flow

1. `legalActions` generates a legal `play_card` without royal targets.
2. Before transition, a moves-only helper computes royal-capture keys without calling `legalActions`, avoiding recursion.
3. The card resolves under the skill-layer immunity backstop.
4. For Quake, entry cascades settle before final-arrival protection is written.
5. The returned intermediate state stores `turnCard` and, for `preserve-existing`, the sorted baseline.
6. Move generation filters only royal captures absent from that baseline.
7. The follow-up move or forced end closes the turn and clears the baseline.

### API and Schema Changes

```ts
type RoyalFollowUp = 'preserve' | 'preserve-existing'

interface SkillCardDef {
  // existing fields...
  royalFollowUp: RoyalFollowUp
  protectRelocatedAfterPlay: boolean
}

interface GameState {
  // existing fields...
  royalCaptureBaseline: readonly string[] | null
}
```

`Action` remains unchanged. `RejectionReason` adds `royal-skill-immune` and `royal-followup-blocked`. The moves-only helper is engine-internal unless tests can exercise it through public legal actions without duplication.

## 📝 Implementation Plan

### Phase 1 — RED contracts and non-vacuous audit

- **Status:** `done` — Fresh Phase A.5 passed all three lenses after the user resumed. The RED gate failed only on the intended 14 missing behaviors; the final audit covers all target tuples, 24 unique generated placements, every bundled card, and isolated positive controls.
- **depends_on:** `[]`
- **parallel_group:** `serial-contract`
- **merge_hazards:** `tests/engine/skill-cards.test.ts`, shared action/fixture helpers, and the definition of royal-capture key identity
- **Scope:** Add `tests/engine/royal-skill-immunity.test.ts` and `tests/engine/royal-threat-audit.test.ts`; update existing `royal-removal` and `skill-cards` fixtures only where necessary. Do not edit production source.
- **Work:** Encode direct friendly/enemy immunity, exact baseline overlap, all 24 resolving fixtures, category fixtures, seeded bounded positions, target-tuple enumeration, and four positive controls. Add explicit Quake ordinary place-and-capture, portal, and bomb expectations.
- **Exit criterion:** `npx --no-install vitest run tests/engine/royal-skill-immunity.test.ts tests/engine/royal-threat-audit.test.ts tests/engine/royal-removal.test.ts tests/engine/skill-cards.test.ts` fails only on the new intended contracts; positive-control assertions prove the audit itself can fail; all 24 coverage counters are nonzero.
- **Risk:** `medium` — fixtures may name cards without resolving them. **Signal:** zero coverage counter or missing legal target tuple. **Mitigation:** fail hard per card and enumerate actual `legalActions`.
- **Rollback point:** Baseline branch state. Remove only the Phase 1 test files and narrowly edited fixtures; production remains untouched.

### Phase 2 — Skill-layer royal immunity and rejection contract

- **Status:** `done` — Royal candidates are filtered and the executor independently guards destroy, relocation, swap, promotion, freeze, movement/protection grants, revival, and quantified subjects at the skill layer. Square/rule behavior remains a positive control.
- **D.5 newly reachable window:** Indirect skill targets can reach a royal from a non-royal quantified subject. `tests/engine/royal-skill-immunity.test.ts > backs up relocation, swap, promotion, freeze, grant, and protection actions` enters that window in this change and proves each action family preserves the royal.

- **depends_on:** `[1]`
- **parallel_group:** `serial-engine`
- **merge_hazards:** `src/engine/engine.ts` shared `resolveTarget`/`executeActions` paths and `RejectionReason` consumed by UI/i18n
- **Scope:** Modify skill target candidate generation and add a `BoundEffect.layer === 'skill'` execution backstop; add engine rejection codes and localized keys needed by engine/UI completeness tests. Exclude follow-up baseline and schema work.
- **Work:** Omit royal friendly/enemy card targets, skip royal quantified subjects, prevent every skill action from changing a pre-action royal, and retain square/piece/rule behavior. Cover direct destroy, teleport, swap, promotion, freeze/grant, hostile-square relocation, and non-skill controls.
- **Exit criterion:** `npx --no-install vitest run tests/engine/royal-skill-immunity.test.ts tests/engine/royal-removal.test.ts tests/engine/layer-order.test.ts tests/engine/rejection-reasons.test.ts tests/ui/rejection-wiring.test.tsx` passes, including controls that rule/piece/square effects still affect royals as before.
- **Risk:** `high` — a shared resolver guard can bleed into non-skill layers. **Signal:** non-skill royal-effect controls change. **Mitigation:** provenance guard exists only at skill binding/execution boundaries and layer-order tests cover the rest.
- **Rollback point:** Phase 1 RED checkpoint. Revert Phase 2 engine, rejection-type, and i18n changes together while retaining RED evidence.

### Phase 3 — v11 per-card policy and pending baseline state

- **Status:** `done` — Schema v11, legacy normalization, exact pending baselines, all close-outs, serialization/undo/replay, and AI hashing are implemented and covered.
- **D.5 newly reachable window:** Documents with absent policy fields at schema v1-v10 now migrate, while v11 absence fails. `tests/content/royal-policy-v11.test.ts` covers both absent legacy versions, strict v11, authored non-default round-trip, and the editor import upgrade in this change.

- **depends_on:** `[2]`
- **parallel_group:** `serial-contract`
- **merge_hazards:** `src/content/schema.ts`, `src/content/load.ts`, `src/engine/types.ts`, `src/engine/engine.ts`, `src/engine/ai/search.ts`, editor write paths
- **Scope:** Bump to schema v11; add both strict card fields; normalize all `<=10` sources; add `royalCaptureBaseline`; implement moves-only key calculation, exact follow-up filter, all close-outs, initialization, AI hash, editor writes, and round-trip tests. Do not add Quake final-arrival behavior yet.
- **Work:** Require missing v11 fields to fail; cover v1/v10 migration and v11 round-trip. Compute baselines without re-entering `legalActions`. Assert baseline non-null iff a `preserve-existing` card is pending, and assert exact overlap behavior.
- **Exit criterion:** `npx --no-install vitest run tests/content/preset-io.test.ts tests/content/bundled.test.ts tests/engine/royal-threat-audit.test.ts tests/engine/skill-cards.test.ts tests/engine/ai-turn-model.test.ts tests/engine/ai-agent.test.ts` passes; `npm run typecheck` passes; v1/v10 migration, both missing-field failures, v11 round-trip, undo/replay, terminal clearing, forced-end clearing, and position-key differentiation are pinned.
- **Risk:** `high` — strict-schema compatibility, recursive generation, or stale pending state can break imports/search. **Signals:** legacy fixture rejection, stack/re-entry, representative action-count slowdown, terminal baseline, or equal AI keys for unequal baselines. **Mitigation:** pre-parse version gate, moves-only helper below `legalActions`, a representative micro-benchmark, enumerated close-outs, invariant property, and hash test.
- **Rollback point:** Phase 2 immunity checkpoint. Revert SCHEMA_VERSION/fields, `<=10` normalization, editor writes, GameState baseline, engine filter, and AI-key changes as one contract unit; retain direct immunity.

### Phase 4 — Bundled dispositions and Quake final-arrival protection

- **Status:** `done` — All 24 cards declare their policies. Quake protection attaches to the final surviving cascade square, and ambiguous protected-relocation declarations fail loading.
- **D.5 newly reachable window:** A protected relocation may now terminate at its direct destination, a portal destination, or removal on entry. The three named Quake tests in `tests/engine/royal-threat-audit.test.ts` enter each window in this change; the grammar table covers zero, conditional, quantified, multi-subject, and multiple relocation declarations.

- **depends_on:** `[3]`
- **parallel_group:** `serial-content`
- **merge_hazards:** all bundled card records, v11 protected-relocation validation, shared post-cascade ordering, editor recipe representation
- **Scope:** Write both declarations on all 24 cards; implement the conservative `protectRelocatedAfterPlay` grammar and editor surface; attach final-arrival protection; update Quake copy. No general per-piece identity and no card-ID engine branch.
- **Work:** Validate exactly one unconditional, unquantified, single-subject teleport with no other relocation when protection is true. Reject zero, conditional, quantified, multi-subject, and multiple relocation forms. Attach protection only after `cascadeEnter`; omit it if removed.
- **Exit criterion:** `npx --no-install vitest run tests/engine/royal-threat-audit.test.ts tests/engine/card-liveness.test.ts tests/content/bundled.test.ts tests/content/preset-io.test.ts tests/ui/card-template-remix.test.tsx` passes; all 24 disposition rows and resolving counters are present; Quake target cannot be captured in the follow-up; Quake-to-portal protects the paired final square; Quake-to-bomb leaves no stale grant; every invalid protected-relocation grammar has a named loader test.
- **Risk:** `medium` — square-keyed protection can stay at the first destination or ambiguous authored cards can protect an order-dependent subject. **Signals:** portal final square is capturable, bomb leaves a grant, or an invalid grammar loads. **Mitigation:** post-cascade final-square attachment and conservative syntactic validation.
- **Rollback point:** Phase 3 policy checkpoint. Revert bundled declarations and the protection field's loader/interpreter/editor/tests as one vocabulary unit; keep the dormant follow-up mechanism and immunity.

### Phase 5 — UI explanation and full regression

- **Status:** `done` — Legal highlights, localized rejection hints, rendered rules help, typecheck, build, and the full Vitest suite are GREEN.
- **D.5 newly reachable window:** Deliberate taps on an omitted royal card target or filtered royal capture now reach a specific rejection explanation. The two royal interaction tests in `tests/ui/rejection-wiring.test.tsx` exercise both paths and assert the visible Korean copy in this change.

- **depends_on:** `[4]`
- **parallel_group:** `serial-ui`
- **merge_hazards:** rejection reason union, i18n completeness list, MatchHost target/highlight handlers, help copy
- **Scope:** Wire direct-immunity and follow-up-blocked explanations through existing highlights and hint bar; add rules/help text; run full engine/content/UI/AI regression. Do not add a persistent board badge or change turn timing.
- **Work:** Prove royal card targets and blocked captures are not highlighted, deliberate illegal actions show localized reasons, and no raw code leaks. Manually drive Quake, Volley, and Knight Leap scenarios.
- **Exit criterion:** `npm run typecheck && npm run build && npx --no-install vitest run tests/engine tests/content tests/ui` passes; targeted random invariants and AI legality/search suites pass; manual scenarios in Testing Strategy match the documented behavior.
- **Risk:** `medium` — absent targets can look like a broken card and a new reason can miss one locale. **Signals:** rejection completeness failure, raw key in DOM, or no explanation after deliberate illegal action. **Mitigation:** engine-owned reasons, localization enumeration, and UI wiring tests.
- **Rollback point:** Phase 4 engine/content checkpoint. Revert only Phase 5 help/highlight/rejection presentation changes; engine behavior and targeted engine tests remain intact.

## 🧪 Testing Strategy

### Unit and contract tests

- Direct skill targeting: friendly and enemy royals are absent for every relevant target kind.
- Execution backstop: destroy, teleport, swap, promote, freeze, movement grants, protection, quantifier, and hostile-square paths preserve royals at the skill layer.
- Layer controls: equivalent square, piece, and rule effects retain current royal behavior.
- Baseline identity: exact `(from,to)` membership, ordinary/granted overlap, initialization, close-out, terminal state, forced end, undo, replay, and AI key.
- Schema: v1 and v10 normalization; v11 missing `royalFollowUp`; v11 missing `protectRelocatedAfterPlay`; v11 round-trip; future-version refusal.
- Protected relocation grammar: zero, conditional, quantified, multi-subject, and multiple relocation rejection.

### Audit and generated tests

- One resolving fixture and positive counter for each bundled skill.
- Deterministic category positions for every known threat-construction mechanism.
- Every legal target tuple, not one sampled target, is exercised in reached states.
- Seeded bounded positions carry exactly one royal per side and zero to six nonroyals.
- Positive-control cards make the oracle fail in four distinct ways.
- Audit output identifies card, seed, pre-card state, card targets, baseline keys, and new key on failure.

### Integration and UI tests

- Card → intermediate state → follow-up move remains one turn and one ply.
- Existing exact royal capture remains legal after a `preserve-existing` card when unchanged.
- Newly created royal capture is absent and returns `royal-followup-blocked` when deliberately submitted.
- Royal card targets are absent and return `royal-skill-immune` when deliberately submitted.
- The shipped Korean text renders without raw rejection codes.

### Manual scenarios

1. Quake an ordinary enemy next to an attacker: it relocates, is visibly not capturable in the mandatory move, and becomes ordinary after the ply closes.
2. Quake onto a portal: protection follows the piece to the paired square.
3. Quake onto a bomb: the piece is removed and no stale protection remains.
4. Volley with the enemy king and an ordinary enemy visible: the king is not a target; the ordinary piece remains valid.
5. Knight Leap creates a new line to the king: ordinary captures remain, the new king capture is unavailable that turn, and later turns behave normally.
6. An already legal exact king capture remains available after a qualifying card if the board still supports that same move.

## ⚠️ Risks & Mitigation

| Risk | Signal | Mitigation |
|---|---|---|
| Skill immunity changes rule/piece/square semantics | Non-skill royal controls fail | Gate only on `BoundEffect.layer === 'skill'`; retain layer-order controls |
| Baseline calculation recursively calls `legalActions` | Stack/re-entry or large action-count slowdown | Extract moves-only helper and benchmark a representative high-branching state |
| Baseline survives its turn or hashes incorrectly | Non-null baseline outside pending state; TT collision test | Enumerate initialization/close-outs; invariant test; fold sorted keys into `positionKey` |
| v11 breaks legacy imports | v1/v10 fixtures fail | Normalize all `schemaVersion <= 10` before strict record parsing; reject missing v11 fields |
| Quake protection stays at portal entrance | Final square is capturable | Attach after complete cascade; named portal regression |
| Quake leaves protection after removal | Grant remains after bomb | Attach only when final subject survives; named bomb regression |
| Protected relocation grammar is ambiguous | Quantified/multi-action card loads | Conservative syntactic loader validation and editor refusal |
| A bundled card is omitted or audit is vacuous | Zero per-card coverage counter | 24-row explicit inventory, mandatory resolving fixture, positive controls |
| Generated audit becomes flaky or slow | Seed-dependent CI failure or timeout | Fixed seeds, bounded sizes, failure replay output, separate targeted command |
| UI silently hides a move | No highlight and no reason | Dedicated engine rejection reasons, hint-bar wiring, localization completeness |

## ✅ Success Criteria

- [x] `[play_card?] → move`, one card per turn, and one ply per completed turn remain unchanged.
- [x] Friendly and enemy royals cannot be directly targeted or mutated by any skill-layer effect.
- [x] Equivalent rule, piece, and square effects retain their existing royal semantics.
- [x] All 24 bundled skills explicitly declare both v11 policy fields and resolve at least once in the audit.
- [x] The 18 geometry-changing cards cannot offer a post-card royal capture whose exact key was absent before card play.
- [x] The 6 `preserve` cards pass their deterministic fixtures and bounded counterexample search without creating a new royal capture.
- [x] An exact royal capture already legal before a card remains legal afterward when still geometrically valid.
- [x] Quake's relocated ordinary target cannot be captured in the same-turn follow-up.
- [x] Quake protection follows portal cascades to the final square and leaves no stale grant after removal.
- [x] v1-v10 documents load with compatibility values; malformed v11 documents fail; v11 round-trips both fields.
- [x] Baseline state is initialized, hashed, undone, replayed, and cleared consistently.
- [x] Target highlights, capture highlights, rejection copy, and help text agree with engine legality in the shipped Korean locale.
- [x] No content ID appears in engine behavior branches and no new dependency is introduced.
- [x] Targeted engine/content/UI/AI tests, typecheck, and build pass.

## 🔍 Plan Validation

**Outcome:** `NEEDS_REVISION_RESOLVED`

| Pass | Verdict | Finding | Resolution |
|---|---|---|---|
| Cross-model pre-pass | invoked | Five P1 findings: deferred card decisions, missing baseline state, shared-resolver bleed, vacuous oracle, ambiguous movement-source overlap | All accepted. Added the 24-card table, explicit pending baseline contract, skill-layer provenance guard, non-vacuous corpus/controls, and exact action-key semantics. |
| Validator pass 1 | `MAJOR_REVISION` | Quake protection lacked post-cascade ownership; legacy default was incomplete; risk, rollback, and ADR rationale were incomplete | Defined final-surviving-square protection, `<=10` normalization with strict v11, concrete signals/mitigations, operational rollbacks, and full ADR consequences/alternatives. |
| Validator pass 2 | `NEEDS_REVISION` | Protected relocation still allowed ambiguous quantified or multi-action cards | Interview #6 selected a conservative grammar: exactly one unconditional, unquantified, single-subject teleport and no other relocation; added loader and editor refusal tests. |

The Codex second opinion ran successfully and every injected finding was reconciled. The plan-validator run is coherent under `plan-same-turn-skill-move-balance-20260811-1`; unrelated historical ledger incoherence remains outside this task.
