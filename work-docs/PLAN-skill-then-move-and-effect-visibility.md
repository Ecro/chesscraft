---
type: plan
task_slug: skill-then-move-and-effect-visibility
status: planning
created: 2026-08-08
tags: [chess-craft, plan, typescript, react, engine, turn-model, ui-affordance]
interview_rounds: 4
adrs: 7
validator_outcome: MAJOR_REVISION_RESOLVED
summary: "Card play stops ending the turn; every live effect gets a source card and a visible badge."
---

# PLAN — Skill-then-move, and making effects visible

## 🎯 Executive Summary

**TL;DR.** Three changes that look like three features and are really one: a skill card
becomes a thing you do *during* your turn instead of *instead of* your turn, every lasting
effect starts carrying the card that created it, and the board finally draws what those
effects are doing.

**What.**
1. **Turn model.** `AC-007` ("playing a skill card consumes the entire turn") is retired.
   A turn is now `[play_card?] → move`. The card play no longer advances `plyCount` and no
   longer hands the board over; the board move that follows does both (ADR-001, ADR-002).
2. **Effect provenance.** `frozenUntil` becomes a record of structures and `ActiveGrant`
   gains a source, so every live effect can name the card that produced it (ADR-004).
3. **Effect visibility.** Frozen pieces, `grant_movement` / `forbid_movement` /
   `block_capture` squares get board badges with their remaining plies; the legend row
   carries an effect chip per live effect; tapping an affected square opens the existing
   peek sheet naming the source card; a card firing gets a one-shot flourish (ADR-005).

**Why.** Right now a player spends a whole turn on a card, and then cannot see what the
card did. `MatchHost.tsx` renders `frozenUntil` and `grants` nowhere at all — the state
exists, the board is silent about it, and the only feedback that a card fired is the piece
that moved (when one did). Both halves of that are being fixed here, and the turn change is
what makes cards worth using at all.

**Key decisions.** ADR-001 (turn shape), ADR-002 (ply accounting), ADR-003 (forced-pass
escape hatch), ADR-004 (provenance data model), ADR-005 (visibility surfaces),
ADR-006 (grade invalidation).

**Estimated impact.** ~9 source files, 2 new UI components, ~6 test files updated, 1 SPEC
amended, and a full regeneration of `SHIPPED_GRADES`. The engine change is small in lines
and large in blast radius: it touches the AI search, the self-play balance rig, the shipped
grade table, and every test that asserts a card play flips `sideToMove`.

---

## 📚 Prior Work

- `specs/SPEC-variant-chess-6x6-cards.md` **AC-007** is the criterion being retired, and
  **AC-008** (no out-of-turn card play) survives unchanged. **AC-006**'s second-draft trigger
  counts *completed turns*, which is exactly the counter the new turn shape can double-count.
- `work-docs/PLAN-ai-opponent-singleplayer.md` — the search's node budget (ADR-003 there) and
  its reproducibility contract are what constrain how the AI may explore the new turn shape.
- `work-docs/PLAN-custom-piece-skill-balance.md` — grades are a *measurement* over 600 seeded
  self-play matches; the turn economy is an input to that measurement.
- `.claude/memory` wiki — `[wiki:architecture] measured-grade-and-per-side-loadout` (grades
  are cache-keyed by `MEASUREMENT_REVISION`, and an ungraded record blocks the match rather
  than scoring as harmless), `[wiki:convention] card-liveness-survey` (a card probe must
  observe a *state change*, differentially, and the load-bearing probes are the inert ones),
  `[wiki:architecture] effect-subject-quantifier-mover` (subject vs bound subject vs mover —
  the distinction this plan must not disturb).
- Global learned correction 2026-06-08 — **absent-case = feature black hole.** Applied twice
  here: what happens when a card leaves no legal move (ADR-003), and what a badge does for an
  effect whose source card is not in the content set (Phase 4).

---

## 🎙️ Interview Transcript

| # | Topic | Category | Question | Options | Choice | Note | → ADR |
|---|-------|----------|----------|---------|--------|------|-------|
| 1 | Turn rule | Scope | What does "use a skill and move right away" change in the rules? | A. retire AC-007 / B. per-card opt-in flag / C. UI-only tap reduction / D. retire + optional skip | **A — retire AC-007** | D (an always-available end-turn button) was explicitly rejected: the follow-up move is expected, not optional | ADR-001, ADR-003 |
| 2 | Effect visualization scope | Scope | How much of the live effect state is drawn on the board? | A. frozen + all grants / B. those + a firing flourish / C. frozen only | **B** | The flourish is one-shot and additive to the persistent badges | ADR-005 |
| 3 | Provenance surface | Contract | Where does a player learn *which* skill caused an effect? | A. square tap sheet + always-on list / B. sheet only / C. list only | **A — both** | Two surfaces, one data source | ADR-004, ADR-005 |
| 4 | Ply accounting | Contract | Do the card and the follow-up move each advance `plyCount`? | A. whole turn = 1 ply / B. card 1 ply + move 1 ply | **A** | Keeps every shipped card's `duration` / `plies` number meaning what it meant; a card's effect therefore applies to the same turn's move | ADR-002 |
| 5 | No legal move after a card | Failure handling | What happens when the card leaves the mover with zero legal moves? | A. auto-pass / B. pre-filter the card as illegal / C. reveal an end-turn button only then | **C** | B rejected: `legalActions` would have to simulate every card's aftermath, exploding cost and AI branching | ADR-003 |
| 6 | Provenance data model | Contract | How is the source carried in engine state? | A. both structures carry `sourceId` (`frozenUntil` becomes a struct) / B. fold freeze into `grants` / C. parallel effect log | **A** | B rejected as a larger engine migration for the same player-visible result; C rejected because two sources of truth drift | ADR-004 |
| 7 | AI search | Risk tolerance | How does the search handle card × follow-up-move fan-out? | A. shallow — top-K follow-ups per card / B. full search / C. AI stops playing cards | **A** | Preserves the node budget and reproducibility; C rejected as a feature regression | ADR-001 (consequences) |
| 8 | Grade invalidation | Dependencies | The turn economy is an input to every measured grade. | A. bump `MEASUREMENT_REVISION`, lazy re-measure / B. also re-derive band scale / C. defer entirely | **A** | B out of scope; C rejected — a stale grade served as current is the one thing ADR-007 of the balance plan forbids | ADR-006 |
| 9 | Undo granularity | Testing/UX | What does undo take back between the card and the move? | A. the card only (push the intermediate state) / B. the whole turn / C. card only, but the card cannot be replayed this turn | **A** | Accepted with eyes open: a player may play a card, read the result, and take it back. Hot-seat with children — the mis-tap this protects against is more common than the exploit it permits | ADR-001 |
| 10 | Effect list placement | Architecture | Where does the always-on effect list live in a no-scroll layout? | A. merged into the existing legend row / B. its own row / C. counter chip in the turn bar opening a sheet | **A** | Effect chips first, square-type chips after; the row scrolls horizontally | ADR-005 |
| 11 | AI strength gate | Testing depth | Round 4, post-validator. A two-action turn halves effective depth at a fixed node budget — what gates it? | A. smoke only (sign check) / B. full ladder tournament / C. raise the budget + ladder | **A — smoke only** | Ladder ordering is explicitly not gated; the strength delta is accepted unmeasured and recorded as a risk | Phase 4, R2 |
| 12 | Undo boundary | Failure handling | Round 4, post-validator. A turn now pushes two states, so undoing a completed turn takes two taps and the first lands on the opponent's intermediate state. | A. contextual undo (mid-turn → card only, else whole turn) / B. leave it, accept two taps | **A — contextual** | One tap is one retraction; the opponent's intermediate state is never a resting place | ADR-007 |
| 13 | Duration-less grants | Scope | Round 4, post-validator. A grant with no duration never reaches `state.grants`, so a piece passive's permanent grant has nothing to render. | A. Non-Goal, lasting effects only / B. derive it in Phase 5 | **A — Non-Goal** | Success criterion narrowed to durationed effects; recorded under Non-Goals | ADR-005 |

Every round's gate render was 5/5 (EIG · CLARITI · common-ground · confidence · open-ended),
and no round was skipped for ambiguity acceptance.

**Decisions taken as defensible defaults, not asked** (each is recorded here so review can
challenge them without reading the diff):

- The new state field is `turnCard: string | null` — the card played *this turn*, cleared when
  the turn ends. One field answers both "may I still play a card?" and "am I awaiting a move?",
  and it is the field the end-turn escape hatch and the UI both read.
- One card per turn. Playing a card does not open a second card play.
- The firing flourish respects `prefers-reduced-motion` and degrades to an instant badge.
- A badge whose `sourceId` names a record absent from the content set still draws, labelled
  with the id — a badge that vanishes because the *label* is missing hides the effect itself.

---

## 📐 Architecture Decision Records

### ADR-001: A turn is `[play_card?] → move`; the card no longer ends it
**Status:** Accepted (2026-08-08, via /hm:plan interview)
**Context:** `SPEC-variant-chess-6x6-cards.md` AC-007 promises that a card play consumes the
turn. In play that makes a card a turn you did not get, and the shipped grades show it —
eleven of the thirteen measured skill cards have a *negative* win-rate delta. The user's
request is to make a card something you do on the way to your move.
**Decision:** `apply(play_card)` keeps `sideToMove`, does not advance `plyCount`, and records
`turnCard = cardId`. The following `move` advances the ply, flips the side, clears `turnCard`
and is the only action that calls `bumpTurns`. AC-007 is retired and replaced by **two**
criteria in the SPEC — the turn shape *and* card consumption, which AC-007's second clause was
the only statement of. Undo is contextual (ADR-007).

**Card consumption moves to the card branch.** `bumpTurns` is today the only writer of
`draft.used`, and it takes the card id from the action it closes the ply for
(`engine.ts:922`). With the close-out moved to the `move` — which carries no card id — that
argument would be permanently `null` and a one-use card would be re-playable forever.
`draft.used` is therefore appended **in the `play_card` branch**, where the card id is in
hand; `bumpTurns` keeps only `completedTurns` and the second-draft draw, and its `usedCard`
parameter is removed rather than left as a null that reads as "no card was played".
**Consequences:**
- ✅ A card is now worth its slot: the effect and a move happen on the same turn.
- ✅ `movesMadeLastPly` regains its meaning — every completed ply has exactly one move
  (or is a forced pass, ADR-003).
- ✅ Consumption is recorded at the moment the card is spent, which is also what makes the
  intermediate state distinguishable in the AI's transposition key.
- ⚠️ Every existing test asserting "a card play flips `sideToMove`" is now wrong and must be
  rewritten, not deleted — `tests/engine/skill-cards.test.ts` is the AC-007 pin.
- ⚠️ `bumpTurns` fires on the *move*, not on the card. Firing on both would double-count
  `completedTurns` and open the AC-006 second draft a turn early.
- ⚠️ There are **two** close-outs, not one: the normal return (`engine.ts:910-923`) and the
  royal-capture short-circuit (`engine.ts:768-779`), which spreads `...state` and enumerates
  its overrides — it must clear `turnCard` explicitly or a terminal state ships a stale one.
- ⚠️ `tests/engine/invariants.test.ts` bounds its AC-013 walk in **actions**
  (`PLY_CAP + DRAFT_ACTIONS`, `invariants.test.ts:114`). A two-action turn halves the walk's
  reach, and it fails at `invariants.test.ts:143` ("ran past the cap without a result") for a
  reason that looks nothing like the turn model. The bound moves to
  `2 × PLY_CAP + DRAFT_ACTIONS`, pinned by Phase 1.
- ⚠️ `tests/engine/invariants.test.ts:152-179` ("advances the ply count on a move **or a card
  play**") asserts `plyCount + 1` for every non-`draft_pick` action. It is a **second**
  AC-007-era semantic pin, not a walk-length concern: it needs a three-way branch
  (`draft_pick` / `play_card` / `move`+`end_turn`) and a new title. Rewritten, not deleted —
  and specifically **not** "fixed" by making the card branch advance the ply, which is the
  alternative ADR-002 rejects.

**How the shared ply close-out splits (engine.ts:865-923).** That block is one unit today and
must not be moved wholesale to the move branch — a card can end the match on its own.

| Clause | `play_card` | `move` / `end_turn` |
|---|---|---|
| `m.result` from a `win` action | **runs** | runs |
| Royal-transition check (`engine.ts:901-907`) | **runs**, comparing the board before and after *this action* | runs |
| `checkCount` / `sideInCheck` (`:869-872`) | no — settled once per turn | runs |
| E7 `end_of_ply` (`:877`) | no — it is per-ply by name | runs |
| `PLY_CAP` material result (`:908`) | no — `plyCount` does not advance here | runs |

The royal-transition check *must* be per-action, not per-turn: it is judged as a transition
from the board at the start of the action, and after a card destroys a king the follow-up
move's "before" board is already royal-less, so a per-turn check would find nothing lost and
the match would run to the cap — the exact bug `engine.ts:881-890` records as found by the
AC-013 walk. When the card branch produces a result it returns terminal immediately: a finished
match has no follow-up move to wait for.
**Rejected alternatives:**
- *Per-card `followUpMove` flag* — pushes a rules question into content and leaves two turn
  shapes in the engine forever.
- *UI-only tap reduction* — does not answer the request; the card would still cost the turn.
- *Optional move with an always-available end-turn button* — rejected by the user in Interview
  #1; an always-present pass button is a way to lose a turn by mis-tap.
**Source:** Interview #1, #9

### ADR-002: The whole turn is one ply
**Status:** Accepted (2026-08-08, via /hm:plan interview)
**Context:** `plyCount` is the clock for `freeze_piece.plies`, `ActiveGrant.untilPly`,
`PLY_CAP`, and the AI's depth. Introducing a second action per turn forces a choice about
what a ply counts.
**Decision:** A ply is a completed turn. The card play does not advance `plyCount`; the
move (or the forced pass) does.
**Consequences:**
- ✅ The **arithmetic** is unchanged: `plyCount + act.plies` still counts the same number of
  turns, so no content document needs editing to remain valid.
- ⚠️ The **effective window grows** by the caster's own move — an effect is now live for the
  move that follows it, which it never was before. That is the intent, and it is precisely why
  ADR-006 invalidates every measured grade. Content authored and tuned against a
  card-costs-the-turn economy (the `plies: 1` freezes in `src/content/sets/slice.ts`) may want
  re-tuning; that re-tuning is **deferred, not unnecessary** (see Non-Goals).
- ✅ An effect a card creates is live during that same turn's move — "freeze it, then take it"
  is expressible, which is most of the point of the change.
- ⚠️ Effects created this turn are visible to `generationModifiers` for this turn's own move
  generation. That is intended, and it is exactly the case Phase 1's tests must pin.
- ⚠️ Grants are pruned with `g.untilPly > state.plyCount` at the top of `apply`; with two
  `apply` calls per ply that prune now runs twice per turn. It is idempotent, but the card
  branch must not prune away a grant it is about to create.
**Rejected alternatives:**
- *Card = 1 ply, move = 1 ply* — silently halves every authored duration and invalidates
  `PLY_CAP` and every cached grade for a second, unrelated reason.
**Source:** Interview #4

### ADR-003: `end_turn` exists, and is legal only when nothing else is
**Status:** Accepted (2026-08-08, via /hm:plan interview)
**Context:** If the follow-up move is expected, a card that freezes or blockades the mover's
own last mobile piece leaves a turn that cannot be completed. This is the absent case the
repo's own learned correction (2026-06-08) says must be defined explicitly, not left to
no-op.
**Decision:** A new action `{ kind: 'end_turn' }`. `legalActions` yields it **iff**
`turnCard !== null` and no `move` action exists. It closes the ply exactly as a move does —
advances the ply, flips the side, clears `turnCard`, calls `bumpTurns`, and runs the **whole**
close-out column in ADR-001's table (`checkCount`, E7 `end_of_ply`, the royal transition and
the `PLY_CAP` material result) — with `movesMadeLastPly = 0`. A forced pass that skipped E7 or
the cap would be a ply on which no rule card's end-of-ply effect fires and the cap cannot
trigger. The UI shows the end-turn button only while that action is legal.
**Consequences:**
- ✅ The turn always terminates; there is no reachable stuck state.
- ✅ The self-play agent and the search inherit it for free — it is a normal member of
  `legalActions`, so ADR-013's termination bound still holds.
- ⚠️ `movesMadeLastPly = 0` now means "forced pass" rather than "a card was played". Any
  reader of that field must be re-checked (`search.ts`, `evaluate.ts`, tests).
- ⚠️ It is legal only in the narrow case, so it can never be used to skip a turn voluntarily.
**Rejected alternatives:**
- *Auto-pass* — a turn that ends itself with no acknowledgement reads as a frozen app.
- *Pre-filter the card as illegal* — `legalActions` would have to apply each candidate card
  and re-generate moves to know, multiplying the most expensive part of move generation and
  inflating the AI's branching factor at every node.
**Source:** Interview #5

### ADR-004: Every lasting effect carries its source
**Status:** Accepted (2026-08-08, via /hm:plan interview)
**Context:** "Which skill did this?" is unanswerable today. `frozenUntil` is
`Record<SquareId, number>` and `ActiveGrant` has `kind`, `square`, `untilPly`, `pattern` —
no field in either names the card, the piece passive or the square type that created it.
**Decision:** Introduce a shared shape:
```ts
export interface EffectSource { sourceId: string; layer: Layer }   // 'square'|'piece'|'rule'|'skill'
export interface FrozenEntry extends EffectSource { untilPly: number }
// GameState.frozenUntil: Readonly<Record<SquareId, FrozenEntry>>
// ActiveGrant: … existing fields … & EffectSource
```
`executeActions` already holds the `BoundEffect`, which carries `sourceId` and `layer`, so
both writes are one-line changes at `engine.ts:626` and `engine.ts:637`.
**Consequences:**
- ✅ One data source feeds both the sheet and the effect list (Interview #3).
- ✅ The `layer` field means a freeze from a *square type* or a *rule card* is attributable
  too — not only skill cards. The UI names whatever the layer points at.
- ⚠️ `frozenUntil` is read in five places outside `engine.ts` (`search.ts:221` hashes it into
  the transposition key, `invariants.test.ts:98`, `card-liveness.test.ts:40`,
  `ai-information-boundary.test.ts:83`, `match.ts` initialisers). All must move together.
- ⚠️ `serializeState` / `deserializeState` (AC-013) round-trip the new shape as plain JSON —
  no custom codec, but the round-trip test must assert the new fields survive.
**Rejected alternatives:**
- *Fold freeze into `grants` as a fourth kind* — a bigger engine migration (`E1` generation
  sweep, freeze checks in move generation) for an identical player-visible result.
- *A parallel `effectLog` array* — two structures describing one fact drift, and the drift is
  invisible until a badge names the wrong card.
**Source:** Interview #6

### ADR-005: Three visibility surfaces, one source
**Status:** Accepted (2026-08-08, via /hm:plan interview)
**Context:** AC-017/AC-018's one-screen, no-scroll layout is a hard constraint — the Chess
Craft redesign exists because the board was being pushed off a 390×844 phone.
**Decision:**
1. **Board badge** — an affected square carries `data-effect="frozen|granted|forbidden|shielded"`
   and `data-effect-plies="<n>"`, drawn as a corner pip with the remaining ply count.
2. **Effect chips** — the existing `.legend` row leads with one chip per live effect, then the
   square-type chips it already has; the row scrolls horizontally. Chips are absent when no
   effect is live, so the row's height is unchanged in the common case.
3. **Peek sheet** — tapping an affected square (or its chip) opens the existing `PeekSheet`
   with the effect's name, its remaining plies, and **the source record's name and text**.
4. **Flourish** — the squares an effect touched this ply get a one-shot animation, keyed on
   `plyCount` so it fires once and never on re-render. Under `prefers-reduced-motion` the
   badge simply appears.
**Consequences:**
- ✅ Both surfaces the user asked for, fed by the ADR-004 fields — no second derivation.
- ✅ Layout height is unchanged when nothing is live, which is most of a match.
- ⚠️ A square can carry a square-type mark, a piece, a side tag and now an effect pip. Four
  marks in one ~60px box is the crowding risk; Phase 4 owns proving it at 390px wide.
- ⚠️ The board taps for "select a piece" and "inspect an effect" must not fight. The effect
  sheet opens from the pip's own hit area and from the chip, never from the square body —
  the square body keeps meaning "select / move".
**Rejected alternatives:**
- *A separate effect row* — costs vertical space at the exact moment the board is busiest.
- *Sheet only* — the user asked for an always-on list (Interview #3).
**Source:** Interview #2, #3, #10

### ADR-006: Bump `MEASUREMENT_REVISION` and regenerate the shipped grades
**Status:** Accepted (2026-08-08, via /hm:plan interview)
**Context:** A grade is the win-rate delta a record produces over 600 seeded self-play
matches. The turn economy is an input to every one of those matches, so every cached and
shipped grade measures a game that no longer exists.
**Decision:** `MEASUREMENT_REVISION: 1 → 2`. Device caches invalidate by construction (the key
hashes the revision). `SHIPPED_GRADES` is **regenerated** in the same change by running the
balance suite and copying what the test reports.
**Consequences:**
- ✅ No stale grade can be served as current — the property `shipped-grades.ts` documents.
- ⚠️ Regeneration is mandatory, not optional: `tests/balance/shipped-grades.test.ts`
  re-measures every entry, so leaving the old table red-fails the suite. Not regenerating
  would also cost every player a ~1 minute on-device measurement on the dex screen.
- ⚠️ The re-measured deltas will *move* — that is the point — and a card whose new grade lands
  in a different band changes what loadouts a room can afford. Expected; it is the change
  being measured, not a defect.
- ⚠️ The band scale (`bandScaleFrom`) is **not** re-derived here. If the new standard errors
  differ materially the bands are slightly mis-sized until a follow-up; recorded as a risk.
**Rejected alternatives:**
- *Defer the bump* — serves grades measured under the old turn economy as current, which is
  precisely what the revision field exists to prevent.
**Source:** Interview #8

### ADR-007: Undo is contextual — one tap, one retraction
**Status:** Accepted (2026-08-08, via /hm:plan interview round 4)
**Context:** `undo` pops exactly one state (`match.ts:21-25`). A turn now pushes two, so the
naive behaviour makes undoing a completed turn take two taps, and the first tap lands the
board on the **opponent's** intermediate state — a card played, no move made, side unchanged —
which is not a position anyone was ever looking at.
**Decision:** `undo` pops to the previous *decision point*: while the player is mid-turn
(`turnCard !== null` and it is their own turn) it retracts the card only; otherwise it retracts
the whole preceding turn, intermediate state included. One tap is always one retraction, and
the intermediate state is never a resting place.
**Consequences:**
- ✅ The behaviour a player already has is preserved: one tap takes back the last thing they did.
- ✅ Retracting a card before moving still works, which is what Interview #9 asked for.
- ⚠️ `undo` stops being "pop one" and becomes a small rule. It lives in `match.ts` (not in the
  component), so the UI stays a caller and the rule is unit-testable.
- ⚠️ `push`'s hand-off classification (`MatchHost.tsx:246-253`) gains a third case: an action
  that neither passes the phone nor is an undo — the card play. It must announce nothing.
- ⚠️ A player may still play a card, read the result and retract it (risk R6, accepted).
**Rejected alternatives:**
- *Leave `undo` as pop-one and accept two taps* — the first tap shows a board state that is
  nobody's turn-in-progress, which reads as a bug rather than as a step.
**Source:** Interview #12

---

## 📌 Execution status (2026-08-08)

| Phase | Status | Notes |
|---|---|---|
| 1 — Turn model | **DONE** | `turnCard`, close-out split, consumption moved to the card branch. Two AC-007-era test files rewritten (`vocabulary-v3`, `layer-order`) and one production reader fixed (`agent.ts`'s action budget, plus its RNG key, which drew the same number twice per turn). |
| 2 — `end_turn` | **DONE** | Legal only with a card pending and no move. Runs the full close-out. |
| 3 — Provenance | **DONE** | `FrozenEntry`, `ActiveGrant.sourceId`/`layer`. `positionKey`'s `frozenUntil` fold was interpolating the whole entry — every frozen square would have hashed to `[object Object]`, silently. |
| 4 — AI search | **DONE** | `positionKey` folds `turnCard`; `wouldRevealDraft` no longer fires on a card; `FOLLOW_UP_MOVE_CAP = 6`. **A defect the PLAN did not anticipate was found here** — see below. |
| 5 — Match UI | **DONE** | Badges, chips, sheet-with-source, flourish (reduced-motion aware), end-turn button, contextual undo. `MatchHost` gained an `initialState` seam so ADR-003's stranded-mover state is testable. |
| 6 — SPEC + e2e | **DONE** | AC-007 retired; AC-019…AC-022 added with verification rows. `e2e/turn-shape.spec.ts` covers the turn on a 390×844 viewport. |
| 7 — Grades | **WITHDRAWN** (2026-08-08, after review) | Implemented and then reverted. `master` moved four commits during this branch's life, and `c09fa9d feat(balance): price a record by what it says, not by how often it wins` **deleted** `cache.ts`, `shipped-grades.ts`, `predict.ts`, `bands.ts`, `grade-client.ts` and `worker.ts`, replacing measured grades with a declared-cost model. Phase 7 edited two of the deleted files plus `tests/balance/measure.test.ts`; `task-refresh` aborted on the modify/delete conflict. The three files are reverted to their pre-change state so the rebase takes `master`'s deletion cleanly. ADR-006 is superseded, not wrong: it was correct about the old rig, and the rig is gone. |

**The negamax sign (found in Phase 4, not planned for).** `negamax` and `search` negated
every child and flipped the perspective. A `play_card` child does not change the side to
move, so the search was reading the mover's own follow-up move as the OPPONENT's choice and
pricing every card at the worst thing its owner could do next. Nothing about it looked
wrong from outside — the search returned a legal move, promptly, and simply never played a
card worth playing. Fixed at both call sites and pinned at the root by a fixture where the
card wins a queen only if the mover picks the follow-up.

**Known coverage gap.** The same one-line rule *inside* `negamax` is unpinned. A fixture
was written to reach a card node one level down and it passed with the bug reintroduced —
the search never reached that node inside its budget — so it was deleted rather than kept:
a test that cannot fail reads as coverage. The root pin is the evidence for both.

**A test that was underpowered rather than wrong.** `measure.test.ts`'s directional
property (a strictly stronger army must score above its own standard error) failed at 40
seeds: the queen swap is worth ~11.5pp and the standard error at 40 seeds is 11.0. Measured
at 40/120/300 seeds, that error falls to 5.7 and 3.6. The seed count for that one test was
raised to 120 rather than the assertion weakened — `> stderr` is what separates a real
effect from noise that landed positive.

**Measured outcome of the change.** Under the old rule eleven of the thirteen skill cards
carried a NEGATIVE win-rate delta — playing one lost you games. Re-measured under
`[play_card?] → move`, eleven of thirteen are positive or zero. `skill.swap` (−0.75) and
`skill.sacrifice` (−0.50) still are not, which is now a content question rather than an
artefact of the turn economy.

> This measurement is the one durable thing Phase 7 produced. The table it was written into
> no longer exists upstream, so the numbers live here: piece.queen +11.17, piece.archer
> +16.67, and among the cards coronation +2.75, snare +1.92, freeze +1.67, revive +1.42,
> knight-leap +1.17, recruit +1.00, shackle +0.92, volley +0.75, bulwark +0.42, charge +0.33,
> shove +0.25, recall 0.00, teleport 0.00, swap −0.75, sacrifice −0.50 (600 seeds each,
> standard error ≈0.9pp for cards). Whether the new declared-cost model needs any of it is a
> question for that model's owner, not a conclusion this branch should reach for it.

**Observed flakiness, unrelated to this change.** `tests/ui/editor-shell-state.test.tsx`
failed once under a full parallel run and passes in isolation; nothing in this diff touches
the editor shell. It passed on the final full run.

**A layout defect the e2e found and the unit tests could not.** The legend row wrapped, so
the first effect chip to appear grew it a second line and pushed the board down — Playwright
saw it as a square that would not hold still long enough to click, at the exact moment a
player is reaching for it. Fixed by making the row scroll sideways instead of wrapping,
which is what ADR-005 specified and the CSS did not do.

**Final verification.** `tsc --noEmit` clean; `vitest run` 717/717 across 81 files;
`playwright test` 229/229.

## 🚫 Non-Goals

Deliberately deferred, each with the decision that deferred it:

- **Band-scale re-derivation** (`bandScaleFrom`) — ADR-006. Bands stay sized to the old
  standard errors until a follow-up measures the new ones. Risk R5.
- **Content re-tuning** — ADR-002. Card durations authored against the old turn economy are
  left as authored; Phase 7 will *show* the movement as grade deltas, and acting on it is a
  separate content decision.
- **Duration-less grant visibility** — Interview #13. A `grant_movement` / `forbid_movement` /
  `block_capture` with no `duration` never reaches `state.grants` (`engine.ts:619-624`) —
  it is consumed by the E1 generation sweep — so a piece passive's permanent grant has no state
  to render and stays invisible. Only durationed effects get badges, chips and sheet entries.
- **AI ladder ordering** — Interview #11. Phase 4 gates on the strength *smoke* only; whether
  the easy < medium < hard ordering survives the depth loss is not measured here. Risk R2.
- **Multiple cards per turn** — one card per turn, unchanged from today's economy.

## 🏗️ Technical Design

### Current state

| Concern | Where | Today |
|---|---|---|
| Turn end | `engine.ts:910-923` | every `apply` returns `sideToMove: otherSide(mover)`, `plyCount+1`, `bumpTurns(...)` |
| Card play | `engine.ts:798-838` | resolves effects, `movesMade` stays 0, turn passes |
| Freeze | `engine.ts:637`, `types.ts:72` | `frozenUntil[sq] = plyCount + act.plies`, no source |
| Grants | `engine.ts:626`, `types.ts:13` | `{kind, square, untilPly, pattern?}`, no source |
| Frozen gate | `engine.ts:146` | `if ((state.frozenUntil[from] ?? -1) > state.plyCount) continue` |
| Board render | `MatchHost.tsx:800-849` | `data-piece`, `data-side`, `data-square-type`, `data-legal`, `data-last` — **no effect state at all** |
| Legend | `MatchHost.tsx:882-905` | square types only |
| AI | `search.ts:302`, `search.ts:329` | `play_card` ordered last, capped by `cardCap` |
| Grades | `cache.ts:118`, `shipped-grades.ts` | `MEASUREMENT_REVISION = 1`, 20 shipped entries |

### Affected components

- `src/engine/types.ts` — `Action` (+`end_turn`), `GameState` (+`turnCard`, changed
  `frozenUntil`), `ActiveGrant` (+source), new `EffectSource` / `FrozenEntry`.
- `src/engine/engine.ts` — `legalActions`, `cardPlays` gating, `apply` branching,
  `executeActions` writes, `describeRejection`, frozen-gate reads, `bumpTurns` call site.
- `src/engine/match.ts` — initial `frozenUntil: {}` shape, initial `turnCard: null`.
- `src/engine/ai/search.ts` — `frozenUntil` hashing, follow-up-move policy, `end_turn` ordering.
- `src/engine/ai/evaluate.ts`, `difficulty.ts`, `complexity.ts` — readers of ply/turn semantics.
- `src/engine/agent.ts` — self-play action selection (must handle the two-action turn).
- `src/balance/cache.ts` — `MEASUREMENT_REVISION`; `src/balance/shipped-grades.ts` — table.
- `src/ui/MatchHost.tsx` — turn flow, end-turn button, board badges, effect chips, sheet,
  flourish; `src/ui/styles.css` + `tokens.css` — badge and chip styling.
- `src/i18n/ko.ts`, `src/ui/i18n.ts` — new strings (effect names, "turn end", source line).
- `specs/SPEC-variant-chess-6x6-cards.md` — AC-007 retired, new criteria added.

### Data flow (new turn)

```
tap card ──► legalActions: play_card (turnCard === null, side to move, card resolves)
             apply ──► effects resolve, turnCard = cardId, plyCount UNCHANGED,
                       sideToMove UNCHANGED, movesMadeLastPly untouched
                       history.push(intermediate)          ← undo target (ADR-001)
                    │
                    ├─ moves exist ──► board shows badges + chips; player moves
                    │                  apply(move) ──► plyCount+1, side flips,
                    │                                 turnCard = null, bumpTurns
                    └─ no move ──────► end_turn is legal; button appears
                                       apply(end_turn) ──► same close-out, movesMade 0
```

### API changes (engine surface)

| Symbol | Change | Breaking |
|---|---|---|
| `Action` | `+ { kind: 'end_turn' }` | yes — exhaustive switches |
| `GameState.turnCard` | new, `string \| null` | additive |
| `GameState.frozenUntil` | `Record<sq, number>` → `Record<sq, FrozenEntry>` | **yes** |
| `ActiveGrant` | `+ sourceId`, `+ layer` | additive |
| `legalActions` | yields `play_card` only while `turnCard === null`; yields `end_turn` only while `turnCard !== null` **and** no `move` exists; `move` is unrestricted | behavioural |
| `bumpTurns` | loses its `usedCard` parameter — consumption is recorded in the card branch | internal |
| `apply` | card branch no longer closes the ply | behavioural |
| `serializeState`/`deserializeState` | unchanged code, new payload shape | wire-compatible JSON |

`GameState` is never persisted to storage (only `serializeState`'s AC-013 round-trip and the
AI worker's structured-clone hand-off use it), so **no user-data migration is required**.
This was verified: no `localStorage`/`io.ts` path writes a `GameState`.

---

## 📝 Implementation Plan

### Phase 1 — Turn model
- **depends_on:** `[]`
- **parallel_group:** `serial-engine`
- **merge_hazards:** `src/engine/engine.ts`, `src/engine/types.ts` — every later phase edits
  both; nothing may run beside this.
- **Scope — in:** `types.ts` (`Action`, `GameState.turnCard`), `engine.ts` (`legalActions`,
  `cardPlays`, `apply` card branch incl. the `draft.used` append, **both** close-outs — the
  normal return at `engine.ts:910-923` **and** the royal-capture short-circuit at
  `engine.ts:768-779` — the close-out split in ADR-001's table, `bumpTurns` signature,
  `describeRejection`), `match.ts` (initial `turnCard`), `tests/engine/skill-cards.test.ts`,
  `tests/engine/setup.test.ts`, `tests/engine/invariants.test.ts` — both the action bound at
  `:114` (and the shorter walks at `:161`, `:187`) **and** the AC-007-era ply-count pin at
  `:152-179`, which needs a three-way semantic rewrite (`draft_pick` / `play_card` /
  `move`+`end_turn`), not a bound change.
- **Scope — out:** provenance fields, any UI, AI search, balance.
- **Exit criterion:** `npx vitest run tests/engine` green, including new tests that pin:
  (a) after `play_card` the side and `plyCount` are unchanged and `turnCard` is set;
  (b) a second `play_card` in the same turn is not in `legalActions`;
  (c) the follow-up `move` advances the ply, flips the side, and bumps `completedTurns`
  **exactly once per turn**;
  (d) an effect created by the card is live for that same turn's move generation (ADR-002);
  (e) **a card played this turn appears in `draft.used` exactly once once the card resolves,
  and is absent from `legalActions` for the rest of the match** (the retired AC-007's
  consumption clause);
  (f) a turn that plays a card and then captures a royal returns a terminal state whose
  `turnCard` is `null` and whose `used` contains the card (the short-circuit path);
  (g) **a card that destroys the enemy royal, or fires a `win` action, returns a terminal state
  from the card branch itself** — no follow-up move is awaited, and the match does not run on;
  (h) the AC-013 walk reaches result-or-cap for every seed under the raised bound.
- **Risk:** high
- **Rollback:** revert to the phase's base commit; no other phase depends on a partial Phase 1.

### Phase 2 — Forced-pass escape hatch (`end_turn`)
- **depends_on:** `[1]`
- **parallel_group:** `serial-engine`
- **merge_hazards:** `src/engine/engine.ts` — same file as Phase 1.
- **Scope — in:** `end_turn` in `legalActions` + `apply`, `describeRejection` message,
  `tests/engine/skill-cards.test.ts` (forced-pass case).
- **Scope — out:** the UI button (Phase 5).
- **Exit criterion:** in a scripted position built with `createPosition` (drafts resolved) where
  a card freezes the mover's every mobile piece, `legalActions` contains `end_turn` and no
  `move`; applying it closes the ply with `movesMadeLastPly === 0`, bumps `completedTurns`
  once, and `end_turn` is **absent** from `legalActions` whenever any move exists or
  `turnCard === null`. Plus: **an `end_turn` on the ply that reaches `PLY_CAP` yields a
  material result**, and a rule card's `end_of_ply` effect fires on a forced-pass ply — the
  two clauses a close-out that skipped E7 and the cap would silently drop.
- **Risk:** medium
- **Rollback:** Phase 1's tip.

### Phase 3 — Effect provenance
- **depends_on:** `[1]`
- **parallel_group:** `serial-engine`
- **merge_hazards:** `src/engine/types.ts`, `src/engine/engine.ts`, and `search.ts:221`'s
  hash — the AI phase reads the same line.
- **Scope — in:** `EffectSource`/`FrozenEntry` in `types.ts`, the two write sites in
  `executeActions`, every `frozenUntil` read (`engine.ts:146`, `search.ts:221`,
  `match.ts` initialisers), `serializeState` round-trip test,
  `tests/engine/invariants.test.ts` (the `frozenUntil` read at `:98`),
  `tests/engine/card-liveness.test.ts` (`:40`),
  `tests/engine/ai-information-boundary.test.ts` — **type-level only**; that file's semantic
  change belongs to Phase 4.
- **Scope — out:** anything that displays the source (Phase 5); the `positionKey` `turnCard`
  fold and the `wouldRevealDraft` semantics (both Phase 4).
- **Exit criterion:** `npx vitest run tests/engine` green with a new assertion that a freeze
  and a grant created by `skill.freeze` / `skill.bulwark` each report that card's id **and**
  layer `'skill'`, and a freeze created by a square type reports layer `'square'`; plus an
  AC-013 round-trip asserting the new fields survive serialize→deserialize.
- **Risk:** medium
- **Rollback:** Phase 1's tip.

### Phase 4 — AI search under the new turn shape
- **depends_on:** `[1, 2, 3]`
- **parallel_group:** `serial-engine`
- **merge_hazards:** `src/engine/ai/search.ts` — the transposition hash touched in Phase 3.
- **Scope — in:** `search.ts` — (a) follow-up-move policy: after a `play_card` child, expand
  only the top-K ordered moves, K from the existing `cardCap` family of knobs; (b) `end_turn`
  ordering; (c) `frozenUntil` hash update; (d) **`positionKey` must fold `turnCard`**
  (`search.ts:204-224`) — without it two states with different legal-action sets share a key
  whenever a card's effects change nothing the key observes, and TT hits then depend on
  traversal order, breaking reproducibility nondeterministically; (e) **`wouldRevealDraft`
  (`search.ts:237-256`) must move with `bumpTurns`** — it is documented as mirroring it
  exactly, so under ADR-001 a `play_card` reveals nothing and an `end_turn` does. Also
  `agent.ts` (self-play must complete a two-action turn), `evaluate.ts` / `difficulty.ts` /
  `complexity.ts` readers of `movesMadeLastPly` (whose `0` now means forced pass, ADR-003),
  `tests/engine/ai-agent.test.ts`, `tests/engine/ai-information-boundary.test.ts` (semantics).
- **Scope — out:** re-measurement (Phase 7); ladder ordering (Non-Goal).
- **Exit criterion:** `npx vitest run tests/engine` green — the whole directory, as Phases 1
  and 3 gate on, because this phase changes the transposition key and the move ordering, the
  two inputs to AC-003's reproducibility contract, which lives in
  `tests/engine/ai-determinism.test.ts` and would not run under a narrower command. Pins: a self-play match at each difficulty terminates within `PLY_CAP`;
  two searches from the same state and seed return the identical action; **two states differing
  only in `turnCard` produce different `positionKey` values**; **`wouldRevealDraft` is false for
  `play_card` and true for `end_turn` at the second-draft boundary**; and the strength smoke's
  sign check holds (the stronger level scores above the weaker).
- **Risk:** high — this phase carries the change's only unmeasured consequence (effective
  search depth), by decision (Interview #11).
- **Rollback:** Phase 3's tip — the engine is playable without an AI change only in hot-seat,
  so this phase is not independently shippable.

### Phase 5 — Match UI: turn flow, badges, chips, sheet, flourish, undo
- **depends_on:** `[1, 2, 3, 4]` — depends on Phase 4 because the AI turn flow lives in this
  phase's file but is caused by Phase 4's contract (see below).
- **parallel_group:** `serial-ui`
- **merge_hazards:** `src/ui/MatchHost.tsx`, `src/ui/styles.css`, `src/i18n/ko.ts` — single
  large files, no parallel edits.
- **Scope — in:** `MatchHost.tsx` (hint-bar copy for the awaiting-move state, end-turn button
  gated on `end_turn ∈ legal`, `data-effect` / `data-effect-plies` on squares, effect pip,
  effect chips merged into `.legend`, `PeekSheet` source line, flourish keyed on `plyCount`),
  **`match.ts` contextual `undo` (ADR-007) and its `doUndo` caller**, **the AI turn effect at
  `MatchHost.tsx:385-433`** — after the computer plays a card `sideToMove` no longer flips, so
  the effect re-fires and the AI searches **twice per turn**: `aiThinking` must not flicker off
  between the two, the perceived wait roughly doubles, and the wall-clock valve (`aiDegraded`)
  now has two chances per turn to trip — **and `push`'s hand-off classification**
  (`MatchHost.tsx:246-253`), which gains a third case that announces nothing.
  Also `styles.css` + `tokens.css`, `i18n/ko.ts` + `ui/i18n.ts` strings, tests under `tests/ui/`.
- **Scope — out:** engine behaviour, e2e (Phase 6).
- **Exit criterion:** `npx vitest run tests/ui tests/engine` green (the contextual `undo` rule
  lives in `match.ts`, so its unit test lands under `tests/engine`) with tests that assert: a frozen square
  carries `data-effect="frozen"` and the correct remaining-ply count; a chip exists per live
  effect and none when none is live; tapping the pip opens the sheet naming the source card;
  the end-turn button is absent whenever a move is legal; the flourish is suppressed under
  `prefers-reduced-motion`; **undo mid-turn retracts only the card, undo after a completed turn
  retracts the whole turn and never rests on an intermediate state**; and **a card play raises
  no hand-off announcement while the follow-up move does**.
- **Risk:** medium
- **Rollback:** Phase 3's tip; the engine change is playable without the new visuals.

### Phase 6 — e2e and SPEC amendment
- **depends_on:** `[4, 5]`
- **parallel_group:** `serial-verify`
- **merge_hazards:** `specs/SPEC-variant-chess-6x6-cards.md`, `e2e/*.spec.ts`.
- **Scope — in:** retire AC-007 in the SPEC and add its replacements — turn shape, **card
  consumption** (AC-007's second clause, which is the only spec statement of the one-use rule
  and must not be dropped with the first), forced pass, effect visibility, provenance — with
  the verification table rows; e2e covering play-a-card →
  move-in-the-same-turn on a real phone viewport (390×844), badge visibility, and the layout
  not scrolling.
- **Scope — out:** grade regeneration (Phase 7).
- **Exit criterion:** `npx playwright test` green; the SPEC's verification table has a row for
  every new criterion and no row still points at AC-007.
- **Risk:** low
- **Rollback:** Phase 5's tip.

### Phase 7 — Grade invalidation and shipped-table regeneration
- **depends_on:** `[4]`
- **parallel_group:** `serial-balance`
- **merge_hazards:** `src/balance/shipped-grades.ts` (generated content — never hand-edit),
  `src/balance/cache.ts`.
- **Scope — in:** `MEASUREMENT_REVISION: 1 → 2`, regenerate `SHIPPED_GRADES` from what
  `tests/balance/shipped-grades.test.ts` reports.
- **Scope — out:** `bandScaleFrom` re-derivation and content re-tuning (Non-Goals). The
  strength ladder under `vitest.strength.config.ts` is **not** this phase's gate — that config
  includes only `tests/strength/**` and contains no shipped-grade assertion at all.
- **Exit criterion:** `npx vitest run tests/balance/shipped-grades.test.ts` green **and every
  graded record reports `ok`**. The drift assertion skips any record whose measurement was
  truncated (`if (!shipped || !outcome.ok) continue`), and a two-action turn roughly doubles
  the agent work per ply against an unchanged `budgetMs: 900_000` — so without the `ok`-count
  clause this phase can pass having verified nothing and ship old-economy grades under the new
  revision key. Raise `budgetMs` if the measured runtime demands it. Additionally: a room with
  a loadout starts from the lobby without an ungraded-record refusal.
- **Risk:** medium
- **Rollback:** Phase 4's tip. Reverting the revision bump alone would re-serve grades measured
  under the old turn economy, so this phase reverts as a unit with its table.

---

## 🧪 Testing Strategy

**Unit (vitest, `tests/engine`)**
- Turn shape: card → side unchanged, ply unchanged, `turnCard` set; move → ply+1, side flips,
  `turnCard` cleared; `completedTurns` bumps once per turn (the AC-006 double-count guard).
- One card per turn: a second `play_card` is not offered.
- Same-turn effect application (ADR-002): freeze the enemy, then take it on the same turn.
- Forced pass: `end_turn` present iff `turnCard !== null` and no move exists.
- Consumption: a played card lands in `draft.used` exactly once and never returns to
  `legalActions` — the clause the retired AC-007 was the only statement of.
- Provenance: source id + layer on freezes and grants from each of the four layers.
- AC-013: serialize→deserialize preserves `turnCard`, `frozenUntil` entries and grant sources;
  and the invariant walk's action bound is large enough that at least one seed still reaches
  result-or-cap rather than exhausting its steps.
- Undo (ADR-007): mid-turn retracts the card; otherwise retracts the whole turn.

**Card liveness (`tests/engine/card-liveness.test.ts`)** — the per-record survey must be
re-run and its `current` column updated wherever the turn change alters what a card does.
Per `[wiki:convention] card-liveness-survey`, the load-bearing probes are the ones asserting a
card stays **inert** where it must; those must be re-checked against the new turn shape rather
than assumed to still hold.

**Unit (vitest, `tests/ui`)** — badge presence and ply count, chip set, sheet source line,
end-turn button gating, reduced-motion suppression.

**AI (`tests/engine/ai-agent.test.ts`, `ai-information-boundary.test.ts`,
`ai-strength-smoke.test.ts`)** — self-play termination at every difficulty, determinism from a
fixed seed, `positionKey` separating states that differ only in `turnCard`, the ADR-008 draft
boundary reclassified (`play_card` reveals nothing, `end_turn` does), and the strength smoke's
sign check. Node count is deliberately **not** an assertion — the search cannot exceed its own
budget, so such a check verifies nothing.

**Balance (`tests/balance/shipped-grades.test.ts`, default config)** — shipped-grade
re-measurement, with every graded record required to report `ok` so a truncated measurement
fails loudly instead of being skipped.

**e2e (playwright, 390×844)** — card → move in one turn; badges visible mid-match; layout does
not scroll; the effect chip row does not push the board off screen.

**Manual** — one hot-seat match played through a freeze card on a phone-sized window: is the
pip legible beside a piece, a side tag and a square-type mark?

---

## ⚠️ Risks & Mitigation

| # | Risk | Likelihood | Impact | Mitigation |
|---|------|-----------|--------|------------|
| R1 | `bumpTurns` double-counts, opening the second draft (AC-006) a turn early | medium | high | Phase 1 exit criterion pins `completedTurns` per turn explicitly; the AC-006 bias test stays green |
| R2 | AI branching explodes at a card node | medium | high | ADR-001's shallow follow-up policy (top-K follow-ups per card), gated by Phase 4's termination, determinism and smoke pins. **No node-count assertion** — the search cannot exceed its own budget, so such a check verifies nothing. The strength half is R11; the wall-clock half is R10 |
| R3 | Board crowding — pip + square mark + piece + side tag in one ~60px box | high | medium | Phase 5 e2e at 390×844; pip is a corner element with its own hit area; if it fails, fall back to the chip row alone |
| R4 | Re-measured grades move a card across a band, changing which loadouts a room can afford | high | medium | Expected consequence, not a defect (ADR-006); surfaced in the Phase 7 exit criterion via the lobby start path |
| R5 | Band scale is stale relative to the new standard errors | medium | low | Explicitly deferred in ADR-006; recorded here as follow-up work |
| R6 | Undo lets a player read a card's outcome and retract it | high | low | Accepted in Interview #9 for a hot-seat game; revisit only if it is observed to matter |
| R7 | `frozenUntil` shape change misses a reader and fails at runtime rather than at build | low | high | TypeScript makes every read a compile error; the five known sites are listed in ADR-004 and each is in a phase scope |
| R8 | The turn change makes cards strictly stronger, and eleven negative deltas swing positive past the loadout budget | medium | medium | Phase 7 measures it; the budget gate refuses rather than silently allowing (existing behaviour) |
| R9 | Grade measurement times out per record (`armFor` returns `null` past its deadline) and the drift assertion silently skips it, shipping an old-economy grade under the new revision key | high | high | Phase 7's exit criterion requires every graded record to report `ok`; raise `budgetMs` if the measured runtime demands it |
| R10 | The AI searches twice per turn, so a computer turn takes roughly twice as long and the wall-clock valve trips more often, degrading seed reproducibility (`aiDegraded`) | medium | medium | Phase 5 owns the turn-flow UI contract and depends on Phase 4; the degraded notice already exists and is honest about it |
| R11 | Effective search depth halves at a fixed node budget, weakening the AI and possibly inverting the difficulty ladder | medium | medium | Accepted unmeasured by decision (Interview #11); gated only by the strength smoke's sign check. Ladder ordering is a Non-Goal and a follow-up |

---

## ✅ Success Criteria

- [ ] Playing a skill card leaves the turn with the same player, who then makes a board move.
- [ ] Exactly one skill card may be played per turn, and a card spent this match cannot be
      played again (the consumption rule the retired AC-007 carried).
- [ ] When a card leaves no legal move, an end-turn control appears and ends the turn; it is
      never present otherwise.
- [ ] A frozen piece and every **durationed** granted / forbidden / shielded square are visibly
      marked on the board with their remaining plies. (Duration-less grants are a Non-Goal —
      they never reach `state.grants`.)
- [ ] A live durationed effect appears as a chip beside the square-type legend, and the row is
      absent when no such effect is live.
- [ ] Undo takes back exactly one decision: the card while mid-turn, the whole turn otherwise.
- [ ] Tapping an affected square (or its chip) names the card, piece, rule or square type that
      caused the effect.
- [ ] A card firing produces a one-shot flourish, suppressed under `prefers-reduced-motion`.
- [ ] Freeze durations and grant expiries mean the same number of turns they meant before.
- [ ] The AI still plays cards, still finishes within its node budget, and still reproduces
      from a seed.
- [ ] Shipped grades are re-measured under the new turn economy, every graded record reports
      `ok`, and the strength **smoke**'s sign check holds. (Ladder ordering is a Non-Goal, R11.)
- [ ] `SPEC-variant-chess-6x6-cards.md` no longer claims AC-007, and every replacement
      criterion has a verification row.

---

## 🔍 Plan Validation

**Pass 1 — `plan-validator`: MAJOR_REVISION** (6 critical, 5 warning, 2 suggestion; clean on
rollback-strategy and missing-interview-rounds). Every critical finding was verified against
the source before acting on it; all six were correct.

| # | Critical finding | Resolution |
|---|------------------|------------|
| 1 | `bumpTurns` is the only writer of `draft.used`, so moving the close-out to the `move` would make one-use cards infinitely reusable — and retiring AC-007 deletes the only spec statement of consumption | ADR-001 now records consumption **in the card branch**; Phase 1 exit pin (e); Phase 6 carries the consumption clause into the SPEC |
| 2 | `positionKey` does not fold `turnCard`, so two states with different legal actions can share a TT key | Phase 4 scope (d) + exit pin |
| 3 | `wouldRevealDraft` mirrors `bumpTurns` and would misclassify `play_card` / `end_turn` at the ADR-008 draft boundary | Phase 4 scope (e) + exit pin; the boundary test's semantic edit moved from Phase 3 to Phase 4 |
| 4 | The AC-013 invariant walk is bounded in **actions**, so a two-action turn halves its reach with nothing red | Phase 1 scope + exit pin (g) |
| 5 | Phase 7's exit command (`vitest.strength.config.ts`) includes only `tests/strength/**` and runs zero shipped-grade assertions | Phase 7 exit criterion rewritten to name `tests/balance/shipped-grades.test.ts` |
| 6 | "Node count stays within budget" is unfalsifiable — the search cannot exceed it — and the real strength gate was named nowhere | Interview #11: gate on `ai-strength-smoke`; ladder ordering recorded as a Non-Goal and risk R11 |

Warnings resolved: ADR-002's "no content edit is needed" reworded and content re-tuning moved
to Non-Goals; undo given ADR-007, a Phase 5 owner and exit pins (Interview #12); the
two-searches-per-AI-turn consequence given an owner (Phase 5, which now depends on Phase 4);
Phase 7's measurement-truncation path given exit clause and risk R9; Phase 1 scope names both
close-outs including the royal-capture short-circuit; the badge success criterion narrowed to
durationed effects with duration-less grants recorded as a Non-Goal (Interview #13).
Suggestions resolved: a `## 🚫 Non-Goals` section added; Phase 2's exit criterion qualified
with "drafts resolved".

**Pass 2 — `plan-validator`: MAJOR_REVISION** — every pass-1 critical and warning confirmed
resolved with a named owner and a checkable pin, and **two new** criticals found in the
revision itself, both correct and both fixed in the text above:

| # | New critical | Resolution |
|---|--------------|------------|
| 7 | The shared ply close-out (`engine.ts:865-923`) was never decomposed. Executed literally, a card that destroys a royal or fires a `win` action produces no result — and the follow-up move cannot recover it, because the royal transition is judged against the board at the *start of the action*, which is already royal-less. Symmetrically, an `end_turn` that skipped the block would drop E7 and the `PLY_CAP` result | ADR-001 now carries a clause-by-clause split table; ADR-003 states `end_turn` runs the whole column; Phase 1 pin (g) and Phase 2's cap/E7 pins |
| 8 | Phase 4's exit command named three files and omitted `tests/engine/ai-determinism.test.ts`, which holds AC-003 — the reproducibility contract Phase 4's own pin claims | Phase 4 now gates on the whole `tests/engine` directory, as Phases 1 and 3 do; the named files remain pins, not scope |

Pass-2 warnings and suggestions also applied: `invariants.test.ts:152-179` named as a second
AC-007-era semantic pin (a three-way rewrite, not a bound change); R2's mitigation rewritten to
cite only gates that exist; the "strength suite is green" success criterion replaced with the
smoke sign check; ADR-001's walk-failure wording corrected (it fails loudly at
`invariants.test.ts:143`, it does not pass silently) and the redundant pin folded into the
bound change; Phase 5's exit command widened to `tests/ui tests/engine` for the `match.ts` undo
rule.

**No third validator pass was run** — the stage allows one re-run only. The pass-2 fixes above
are therefore Claude-applied and un-revalidated; each is a plan-text correction traceable to a
verified source line, and none changes a decision taken in the interview.

**Cross-model second opinion:** `codex` — **skipped**. The Side preset gates every enabled
model on a high-diff change; `hm high_diff classify` over the working tree returned
`{"boundary": false, "is_high": false}` (a clean tree at planning time), so no model was
invoked and no findings were injected. Both validator passes are Claude-only.
