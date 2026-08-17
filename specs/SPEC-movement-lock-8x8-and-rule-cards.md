---
type: spec
task_slug: movement-lock-8x8-and-rule-cards
status: approved
created: 2026-08-13
tier: 2
tags: [chess-craft, spec, typescript, game-rules, content-schema, engine]
test_framework: vitest
research_doc: "[[RESEARCH-movement-lock-8x8-and-rule-cards]]"
summary: "Relocation lock, block_capture side fix, pawn-wipeout rule card, an 8x8 preset and three new square types"
---

# SPEC — Movement lock, 8x8 preset, new square types and rule cards

## 🎯 Intent

Six requests arrived together, and `RESEARCH-movement-lock-8x8-and-rule-cards` established that
they land on three different layers. Two are corrections to rules the player experiences as unfair:
a piece relocated by `skill.teleport` / `skill.swap` can still be moved again in the same turn, and
a `block_capture` grant left on a square protects **whoever** stands there next, including the
opponent. Three are content the shipped set does not yet have: an 8x8 board, more square types, and
a rule card whose loss condition is the pawns rather than the king. One is a replacement:
`rule.blood-toll` destroys the capturing piece, which the author finds unfun — its measured profile
(20% of matches decided by the clock, median 38, against a 25% set baseline) says this is a taste
decision, not a balance defect.

## 🌅 Outcomes

- A player who teleports or swaps a piece can no longer move that same piece with the move the turn
  still owes them — including when the relocated piece is the king.
- A `block_capture` effect protects only the side that created it. An enemy piece that walks onto a
  square where a friendly piece was once protected is capturable.
- The shipped set contains an 8x8 board with its own preset, and the AI accepts it for
  single-player.
- Three new square types (a movement-granting pad, a pawn-spawning post, and an altar that turns
  whatever arrives into a knight) are authorable, painted, and reachable in play.
- `rule.blood-toll`'s capture tax is a two-ply freeze on the capturing piece rather than its
  destruction.
- A new rule card ends the match when one side's pawns are gone, expressed through a new condition
  that can observe the **absence** of a piece kind.

## 📋 In-Scope Scenarios

### AC-001: a teleported piece cannot take the move the turn still owes

**Given** it is white's turn and no card has been played
**When** white plays `skill.teleport`, moving a rook from `a1` to an empty `d4`
**Then** `legalActions` contains no `{kind:'move', from:'d4'}` action for the rest of that ply
**And** every other white piece's moves are unchanged from what they would be without the lock

### AC-002: both halves of a swap are locked, not just one

**Given** it is white's turn and no card has been played
**When** white plays `skill.swap` on two friendly pieces standing at `b2` and `e5`
**Then** `legalActions` contains no move originating from `b2` and none originating from `e5`
**And** the card's declared `lockRelocatedAfterPlay` validation accepts `swap_pieces` as a
relocation action, so the flag is not silently inert on this card

### AC-003: a relocated royal is locked despite royal skill-immunity — WITHDRAWN

**Withdrawn 2026-08-13** during `/hm:plan` Step 4, on a `plan-validator` finding confirmed against
the code. The criterion is unreachable: `executeActions`' `mayAffect` guard
(`engine.ts:707-711`) refuses any square holding a royal whenever the effect's layer is `skill`,
and it gates both `teleport_piece` (`engine.ts:729`) and `swap_pieces` (`engine.ts:825`). Since
the relocation lock is a `SkillCardDef` field, **no skill card can relocate a royal today** — so
"the relocated king is locked" has no position that exhibits it.

The author was asked whether skill cards should be able to relocate a friendly king, and chose to
keep royals immune. Making them relocatable is **royal displacement**, a materially larger rule
change than royal locking — it would let a player pull the king out of danger or drive it into
enemy territory with a card, and it would require rewriting the `royal-skill-immunity` suite that
guards it. That remains available as its own future unit; it is not this one.

**Replaced by:** ADR-003 of `PLAN-movement-lock-8x8-and-rule-cards`, which records the decision and
the full guard inventory so the next reader does not re-derive it.

### AC-012: a card that would relocate a royal leaves it where it stands

**Given** white's king stands on `c1` and white plays `skill.teleport` naming that king
**When** the card resolves
**Then** the king still stands on `c1` and no `forbid_movement` grant exists for any square
**And** the king's own moves for the owed move are unchanged, so the lock does not fire on a
relocation that did not happen

### AC-013: a swapped piece enters the square it arrives on

**Given** a painted square with an `on_enter` effect (a bomb, a portal) and a friendly piece that
could be swapped onto it
**When** white plays `skill.swap` placing a piece on that square
**Then** the square's `on_enter` effect resolves for that piece — the bomb destroys it, the portal
carries it to its pair
**And** the same holds for **both** endpoints of the swap, not only one

**Why this is here.** Today `swap_pieces` reports no relocation (`engine.ts:818-829`), so
`cascadeEnter` never runs for it while `teleport_piece` does run it — a swapped piece walks onto a
bomb unharmed and a teleported one does not. Attaching the lock requires reporting the endpoints,
which makes the cascade fire; the author chose to close the inconsistency rather than special-case
around it. This is a **behaviour change to shipped content**, not a bug fix, and it is written down
as its own criterion so it is measured rather than absorbed.

### AC-004: locking the last mobile piece still ends the turn

**Given** a position where the piece a card relocates is the mover's only piece with any legal move
**When** the card resolves and the lock is attached
**Then** `legalActions` returns exactly `[{kind:'end_turn'}]`
**And** applying it advances the ply rather than leaving the match unable to continue

### AC-005: a `block_capture` grant protects only the side that created it

**Given** a white piece entered `square.mist` on `d3` and took a three-ply `block_capture` grant,
then moved away, and a black piece now stands on `d3` while the grant is still live
**When** white's moves are generated
**Then** a white capture of the black piece on `d3` is legal
**And** while the white piece still stood there, that same capture was not legal — so the fix
removes the protection from the enemy without removing it from its owner

### AC-006: capturing freezes the capturing piece instead of destroying it

**Given** the replacement rule card is in play and a white rook on `d1` can capture a black knight
on `d5`
**When** white plays that capture
**Then** the white rook stands on `d5` and is not in `state.captured`
**And** `state.frozenUntil['d5'].untilPly` equals `plyCount + 2`, so the rook cannot act for two
plies

### AC-007: a condition can observe that a piece kind is absent

**Given** a side whose last piece of a named kind has just been captured
**When** an `end_of_ply` effect carrying `piece_kind_count_at_most { side, pieceId, n: 0 }` is
evaluated
**Then** the condition is true
**And** it is false on the ply before, when exactly one such piece remained — the case a `forEach`
selector cannot reach, because zero matching subjects produce zero bindings and the effect never
fires at all

### AC-008: the match ends when one side runs out of pawns

**Given** the new rule card is in play and black has exactly one pawn left
**When** white captures that pawn
**Then** `state.result` is `{kind:'win', winner:'white', reason:'win_action'}`
**And** with two black pawns on the board the same position produces no result, so the clause is
pinned at its boundary rather than by a single sample

### AC-009: the 8x8 preset is admitted for single-player

**Given** the new 8x8 board and its preset in the shipped bundle
**When** `withinEnvelope(content, <new preset id>)` is evaluated
**Then** `ok` is true and `reason` is null
**And** `loadBundledContent()` returns without throwing, so every placement, painted square and
card id in the new records validates against the schema

### AC-010: the 8x8 preset's match length is measured and reported

**Given** the seeded self-play harness
**When** it runs the new preset
**Then** the test prints that preset's median plies, maximum plies, and per-rule-card distribution
**And** it asserts no threshold on those numbers, so today's balance is not frozen into a
requirement — the existing 6x6 AC-012 bounds are untouched

### AC-011: each new square type does something, and its inert branch is named

**Given** the three new square types in the shipped bundle
**When** a piece enters or stands on each of them in a position where the effect applies
**Then** the resulting state differs from the same ply played on an unpainted square
**And** for every branch where the effect resolves to no change (a full home rank under the
spawning post, an arriving piece that is already a knight under the altar), the card text states
that condition and a test pins that branch too

## 🚫 Non-Goals

- **King capture stays a match-ending rule.** The new rule card is an additional win clause, not a
  replacement for the royal short-circuit (`engine.ts:997`) or `royalTransition` (`engine.ts:1229`).
  Neither is touched.
- **The `preserve-existing` royal follow-up rule (ADR-002 of `PLAN-same-turn-skill-move-balance`) is
  not re-decided.** It remains the reason some royal captures are refused on a card turn; whether
  its explanation reaches the player on screen is out of scope here.
- **No threshold is asserted on the 8x8 preset's match length**, and `PLY_CAP` is not changed. AC-010
  measures; a bound would be a separate decision made against that measurement.
- **`rule.blood-toll`'s art and id may be reused or replaced, but no other rule card is rebalanced.**
  The four cards `PLAN-capture-rules-and-art-fixes` recorded as unresolved suspects
  (`conscription`, `last-stand`, `royal-bodyguard`, `knights-honour`) stay unchanged.
- **No new target kind.** "Destroy the adjacent enemy" and similar remain inexpressible; `target`
  gains nothing (`schema.ts:185-193`).
- **`on_leave` stays unused.** A grant attached at `on_leave` lands on the square the piece just
  vacated, which is the declared-but-inert shape; no new content uses that trigger.
- **The editor is not redesigned.** New schema fields and the new condition appear in the existing
  editor vocabulary; no new authoring surface is built.

## ⚠️ Constraints

| Constraint | Value | Rationale |
|---|---|---|
| Test framework | `vitest` | The repo's whole unit suite (`vitest.config.ts`, ~1072 tests) plus `vitest.build.config.ts` and `vitest.strength.config.ts`. Playwright covers e2e separately and is not the framework for any AC here. |
| Schema version | bump to v12, with loader normalization for `<= v11` | v11 already established the pattern: `loadContentSet` injects defaults before strict record parsing, and a document declaring the new version missing a required field fails. Two additions land together — the relocation-lock flag and the new condition kind. |
| AI complexity envelope | new preset must score `<= COMPLEXITY_BOUND` (20,000) | `complexity.ts:71`. An 8x8 two-slot-card preset is estimated near 8k, but the estimate is an inference from the formula and AC-009 measures it rather than assuming. |
| Match-length measurement | report-only for the new preset | `[fail:test] metric-green-because-of-the-defect`, and `PLAN-capture-rules-and-art-fixes` Phase 5's explicit refusal to assert a cap rate that would encode today's balance as a requirement. |
| Board rendering | no engine or renderer change for 8x8 | `MatchHost.tsx:1201` already sizes from `state.width`; `inBounds` reads state (`engine.ts:102`). Any change here would mean the board size was hardcoded somewhere the research did not find. |
| Sprite admission | every new `artKey` passes `gates.ts` | 12x12 palette cells, ≤60 rects, sheet-wide compression floor — the five consumers listed in `[wiki:architecture] spare-art-pool-and-sprite-gates`. |
| Compatibility | every `<= v11` authored document still loads unchanged | Author-created content lives in browser storage and cannot be migrated by a deploy. |

## ✅ Verification Criteria

| Scenario | Verification mode | Test name / manual step |
|---|---|---|
| AC-001 | unit | `tests/engine/relocation-lock.test.ts` — "a teleported piece cannot move again this ply" |
| AC-002 | unit | `tests/engine/relocation-lock.test.ts` — "both swapped squares are locked" + a loader test that the flag validates on `swap_pieces` |
| AC-003 | — | **withdrawn**, see above |
| AC-012 | unit | `tests/engine/royal-skill-immunity.test.ts` — extended: a relocation card naming a royal moves nothing and leaves no grant |
| AC-013 | unit | `tests/engine/card-liveness.test.ts` + `tests/engine/square-liveness.test.ts` — a swap onto a bomb and onto a portal, both endpoints |
| AC-004 | unit | `tests/engine/relocation-lock.test.ts` — "the lock leaves `end_turn` as the only action" |
| AC-005 | unit | `tests/engine/capture-oracle.test.ts` or a sibling — differential: the same position with the grant's owner standing there vs an enemy standing there |
| AC-006 | unit | `tests/engine/card-liveness.test.ts` — the replacement card's per-card differential state change |
| AC-007 | unit | `tests/engine/vocabulary-v3.test.ts` (or a v12 sibling) — the condition at n=0 and at n=1 |
| AC-008 | unit | `tests/engine/win-condition.test.ts` — fires at the last pawn, silent with two |
| AC-009 | unit | `tests/engine/ai-complexity.test.ts` + `tests/content/*` bundle-load test |
| AC-010 | unit (report-only) | `tests/engine/self-play.test.ts` — "reports the 8x8 preset's length distribution" |
| AC-011 | unit | `tests/engine/square-liveness.test.ts` — applying and inert branch per new square type |
| AC-001..AC-011 | integration | `npm run test` green; no existing assertion is relaxed to accommodate a new one |
| AC-001, AC-002, AC-009 | manual | Play one match on the 8x8 preset: teleport a piece and confirm it cannot be moved again, swap two and confirm neither can, and confirm the single-player mode starts |

## ❓ Open Questions

None. Every decision the interview surfaced was resolved:

- **Democracy is a shortcut clause, not a replacement of king capture** — but keyed to pawns rather
  than to "every non-royal piece", which the vocabulary could not express and now can (AC-007).
- **The capture report is the `block_capture` defect only**; the `preserve-existing` filter stays as
  designed and is a stated Non-Goal.
- **The 8x8 board ships as a full preset** and is measured without a threshold.
- **`rule.blood-toll` becomes a two-ply freeze on the capturer.**
- **The relocation lock does NOT reach the king** — reversed 2026-08-13 on the `plan-validator`
  finding above. The original answer assumed skill cards could relocate a king; they cannot, and
  making them able to is a separate rule change the author declined for this unit (AC-003 withdrawn,
  AC-012 added).
- **Swapped pieces now enter the squares they arrive on** (AC-013), closing an inconsistency with
  teleport that surfaced only because the lock needs the endpoints reported.
- **Three new square types**, and two candidates were rejected on evidence rather than taste: an
  `on_leave` square would attach its grant to the vacated square, and an adjacent-enemy square has
  no target kind to name.

Items deliberately handed to `/hm:plan` as **how**, not **what**: the phase order and which of the
two schema additions lands first; whether the relocation lock reuses `protectRelocatedAfterPlay`'s
validation grammar or replaces it; and whether the new preset's cards are drawn from the existing
pool or authored fresh.

## 🔍 Refinement Decisions

- **Step 0** — skip heuristic not met: the change spans `src/engine/`, `src/content/`, and
  `src/ui/`, alters a schema other people's saved documents validate against, and is directly
  user-facing. Full interview run.
- **Round 1** (Outcomes + Non-Goals) — locked the four scope-defining choices: democracy as a
  content-only shortcut clause; the capture report scoped to the `block_capture` defect alone; 8x8
  as a full preset; `rule.blood-toll` replaced by a two-ply freeze on the capturer. The user's
  refinement of democracy — "a suitable piece kind, not every other piece" — was accepted and
  surfaced as needing one new condition kind, since `piece_count_at_most` cannot filter by kind and
  `forEach` cannot observe absence.
- **Round 2** (Constraints + Verification) — pawns as the named kind; the lock reaches the king via
  a carve-out; two new square types chosen; self-play reports the 8x8 numbers without asserting a
  threshold. The gate skipped "does the lock cover both halves of a swap" as common ground at
  inference ≥ 0.95 — "the piece that moved" means both in a swap — and AC-002 pins it anyway.
- **Round 3** (remaining scope) — a third square type (the altar). Two candidates were withdrawn
  before being offered, with the reason stated: `on_leave` grants land on the vacated square, and no
  `adjacent_enemy` target exists.
- **§2.1.5 Oracle elicitation** — every AC carries an `oracle_source` and a one-line independence
  justification. Six are `differential` against a control the change does not touch, three are
  `property` (invariants of what locking, protection-ownership and quantified absence *mean*), and
  two are `golden` with stated provenance. No AC's oracle is "the test will check it".
