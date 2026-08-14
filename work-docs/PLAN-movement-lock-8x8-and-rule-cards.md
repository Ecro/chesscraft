---
type: plan
task_slug: movement-lock-8x8-and-rule-cards
status: complete
created: 2026-08-13
tags: [strange-chess, plan, typescript, engine, content-schema, game-rules]
spec: "[[SPEC-movement-lock-8x8-and-rule-cards]]"
research_doc: "[[RESEARCH-movement-lock-8x8-and-rule-cards]]"
interview_rounds: 2
adrs: 8
validator_outcome: MAJOR_REVISION_RESOLVED
summary: "One settlement point for effects about a moving piece, then the lock, the block_capture owner fix, and the content"
---

# PLAN — Movement lock, 8x8 preset, new square types and rule cards

## 🎯 Executive Summary

**What.** Six asks from `SPEC-movement-lock-8x8-and-rule-cards`, delivered as six phases behind one
shared mechanism. Schema goes to **v12** carrying two additions: a per-card relocation-lock flag and
a `piece_kind_count_at_most` condition.

**Why the shape.** Three separate features all need the same fact — *the final surviving square of
the piece this effect is about* — and the engine currently computes it in exactly one place, for
exactly one card (`skill.quake`'s `protectRelocatedAfterPlay`, `engine.ts:1106-1113`). The
pre-interview draft found that writing the SPEC's `rule.blood-toll` replacement without that fact
produces an **inert card**: at `on_capture` the capturing piece is still on `action.from`
(`engine.ts:1007` passes it as `moverSquare`), and `freeze_piece` is square-keyed, so the freeze
lands on the square the piece is about to vacate. That is the failure mode this repo has recorded
**seven** times, and `rule.blood-toll` is already its fourth recorded instance. Phase 1 therefore
generalizes the settlement point before anything is built on it (ADR-001, confirmed with the author
in Interview #1).

**Key decisions.** ADR-001 (one settlement point) · ADR-002 (v12 lock flag, swap-aware validation) ·
ADR-003 (royals stay un-relocatable; SPEC AC-003 withdrawn) · ADR-004 (grants carry a beneficiary
side; `block_capture` consults it) · ADR-005 (a new condition rather than a widened one) · ADR-006
(the 8x8 preset is measured, not bounded) · ADR-007 (both schema additions in one version bump) ·
ADR-008 (swapped pieces enter the squares they arrive on).

**Estimated impact.** `src/engine/engine.ts`, `src/engine/effects.ts`, `src/engine/types.ts`,
`src/content/schema.ts`, `src/content/load.ts`, `src/content/sets/bundled.ts`,
`src/editor/controls.ts`, `src/ui/SentenceSlot.tsx`, `src/balance/cost.ts`, `src/i18n/ko.ts`,
`src/ui/art/{registry,pixels}.ts`, plus ~7 test files. Two of the eleven ACs are pure content.

## 📚 Prior Work

- **[[PLAN-same-turn-skill-move-balance]]** — schema v11 introduced `royalFollowUp` and
  `protectRelocatedAfterPlay`, and its ADR-003 defined the settlement point Phase 1 generalizes:
  "after the card's full `on_play` execution and the complete `cascadeEnter` chain". Its validation
  grammar (`load.ts:189-209`) explicitly **rejects** `swap_pieces`, which is why AC-002 needs
  ADR-002 rather than a flag flip.
- **[[PLAN-capture-rules-and-art-fixes]]** — Phase 3's differential oracle measured **zero**
  unexplained move-generation divergences, which is why no phase here re-opens the generator. Its
  Phase 5 measured `rule.blood-toll` at 20% clock / median 38 against a 25% baseline, which is why
  Phase 5 here is a taste change with a re-baseline, not a balance fix. Its Phase 6 recorded the
  AC-012 re-baseline direction (40 → 36) and the rule that a threshold is never met by reverting a
  fix.
- **`[fail:design] declared-but-inert-vocabulary` (count 7)** — the governing risk for this whole
  PLAN. Its fourth instance *is* `rule.blood-toll`; its sixth is `square.geyser`, which is why
  Phase 5 pins the inert branch of every new square type. The rule it states: every vocabulary entry
  needs either a test driving it end to end from real content, or an explicit rejection at validation
  time. Phase 1 and Phase 4 both add vocabulary and both carry that obligation.
- **`[wiki:convention] schema-v2-content-vocabulary`** — the precedent for how a version bump and its
  loader normalization land together.
- **`[fail:design] saved-blob-forks-shipped-content` (count 1)** — an install that has ever saved in
  the editor reads its own stored blob and never the bundle again, so **the new 8x8 preset and the
  new square types will not appear for such an install**. Out of scope here (it is a storage-policy
  decision with three candidate remedies), but it is the reason Phase 6's manual check must be run
  on a fresh profile or the preset will look broken.
- **`[wiki:architecture] card-legibility-and-notice-stack`** — `cardPlays.ts` derives a card's
  `impacted` set as the union of a live-effect key change and a board-occupancy change. Both the
  relocation lock (a grant) and the capture freeze (a `frozenUntil` write) are effect-state changes,
  so the banner and impact rings pick them up with no UI work. A lock implemented as anything other
  than engine state would be invisible there.

## 🎙️ Interview Transcript

SPEC `status: approved` with zero open questions → Case A. Step 3.0 confirmation ran and surfaced
one architectural decision the SPEC could not have anticipated, because it is a property of the
engine's event ordering rather than of the requirement.

| # | Topic | Category | Question | Options | Choice | Note | → ADR |
|---|-------|----------|----------|---------|--------|------|-------|
| 1 | Final-square settlement | Architecture | Extract "settle an effect about a moving piece on its final square" as one mechanism, or let the lock and the capture-freeze each solve it? | A. one mechanism, Phase 1 first / B. separate, parallel / C. change the blood-toll replacement to a card that never touches the moving piece | **A — one mechanism, Phase 1 first** | Accepts that Phase 1 is a serial bottleneck for three features, in exchange for one rule with one implementation. The alternative is the "one vocabulary, two code paths" shape this repo has recorded twice. | ADR-001 |
| 2 | Royal relocation | Scope boundary | `plan-validator` found SPEC AC-003 unreachable — `mayAffect` (`engine.ts:707-711`) refuses royal squares for skill-layer effects, gating `teleport_piece` (`:729`) and `swap_pieces` (`:825`), so **no skill card can relocate a king today**. Should they be able to? | A. keep royals un-relocatable, withdraw AC-003 / B. allow it, and lock the relocated king / C. a per-card `mayRelocateRoyal` flag | **A — keep royals un-relocatable, withdraw AC-003** | Relocating a king by card is royal *displacement*, a materially larger rule change than royal *locking*: it lets a player pull the king out of danger or drive it forward, and it requires rewriting the `royal-skill-immunity` suite that is the control for this whole area. Option C was rejected in the same breath — with every bundled card writing `false`, the flag would be vocabulary that validates and is never exercised. | ADR-003 |
| 3 | Swapped pieces and painted squares | Contract shape | Reporting swap endpoints (needed for the lock) makes `cascadeEnter` fire for them, which it does not today while teleport's does. Should a swapped piece enter the square it arrives on? | A. yes, same as teleport / B. no, keep the current exemption | **A — yes, same as teleport** | Closes an inconsistency nobody could explain ("teleport onto a bomb kills you, swap onto it does not"). Accepted cost: this is a behaviour change to shipped content and forces a `card-liveness` re-baseline. | ADR-008 |

Earlier decisions inherited from SPEC and not re-asked: democracy as a content-only clause keyed to
pawns; the capture report scoped to the `block_capture` defect; 8x8 as a full preset; the two-ply
freeze; the three square types.

**Round 2 (#2, #3) was opened by the Step 4 validator**, not by the Step 3.0 confirmation. Both
findings were verified against the code before being put to the author — neither is the validator's
inference.

## 📐 Architecture Decision Records

### ADR-001: One settlement point for effects about a piece that is moving

**Status:** Accepted (2026-08-13, via /hm:plan interview)

**Context:** Three features need the final surviving square of the piece an effect is about, and the
engine computes it in one hard-coded place for one card. The square-keyed model (`types.ts:31-42`)
means an effect that writes state for a piece mid-move writes it to the wrong square: at
`on_capture` the capturer stands on `action.from` (`engine.ts:1007`), and a `freeze_piece` targeting
`mover` therefore freezes the square it is about to leave. Written naively, the SPEC's AC-006 card
validates, logs `on_capture:rule:<id>`, and changes nothing.

**Decision:** Generalize the existing block at `engine.ts:1106-1113` into one settlement step that
runs after the full `on_play` execution, the complete `cascadeEnter` chain, and E6. It takes a list
of `(square-keyed write, subject)` pairs deferred during the ply, resolves each subject to its final
surviving square, and applies the write there — dropping any whose subject did not survive.

**Exactly three callers, and the third is deliberately narrow:**

1. `protectRelocatedAfterPlay` — existing, behaviour unchanged.
2. the relocation lock (ADR-002).
3. **`freeze_piece` only**, when its target is `mover` on a move ply. This is what makes AC-006 land
   on the destination.

Caller 3 is `freeze_piece` and **not** the general "any square-keyed write targeting `mover`",
because the other square-keyed writes are the three grant kinds (`engine.ts:830-851`) and this task
ships no content that targets `mover` with any of them. Deferring them too would be vocabulary that
validates and is never exercised — the failure class this PLAN names as its governing risk. Widening
caller 3 is a one-line change the day a card needs it, and Risk 10 records that it is deliberately
not made now.

The general rule stated once, so future content inherits it: **a square-keyed write about a piece
that moves during the ply settles on that piece's final square, not on the square it occupied when
the effect fired.** Caller 3 is today's only implementation of that rule; the sentence is the intent,
not a claim about coverage.

**The settlement step writes to the ply trace** (added 2026-08-13 after Phase A.5 round 2). Each
applied write pushes `settle:<kind>:<sourceId>` onto `m.log`, and a write whose subject did not
survive pushes `settle:dropped:<sourceId>`. This is a contract, not decoration: `GameState.log` is
defined as "per-ply resolution trace: which (event, layer) fired, and what was dropped"
(`types.ts:135`), and settlement is the one step that does **both** — it fires writes and drops
them. Without it, settlement's position is unpinnable: the end-state assertion ("the write survived
a square E7 emptied") only discriminates for an implementation that guards its write on board
occupancy at write time, and an unconditional deferred write satisfies it under either ordering.
Ordering is asserted where ordering lives.

This obligation was surfaced by A.5 round 1 (discrimination lens) and adopted into a test before it
was written down here — which round 2 correctly flagged as a test imposing an unauthorized
implementation contract. The lens was right both times; the omission was this document's.

**Consequences:**

- ✅ AC-006's card is live rather than inert, and it is live for the same reason quake's protection
  is — one rule, one implementation.
- ✅ `relocatedTo` becomes a **set**, which is what AC-002 needs: `executeActions` currently returns
  a single `moved` and `swap_pieces` returns none at all (`engine.ts:818-829`), so a swap has no
  settlement subject today.
- ✅ No shipped content changes behaviour *through caller 3*: `target: {kind:'mover'}` appears
  exactly once in the whole bundle (`bundled.ts:568`, `rule.blood-toll`'s `destroy_piece`), and
  `destroy_piece` is immediate rather than square-keyed.
- ⚠️ **Shipped content DOES change behaviour through the endpoint set**, by a path separate from
  caller 3: reporting swap endpoints makes `cascadeEnter` run for them. That is ADR-008, decided in
  Interview #3, and it is a behaviour change rather than a no-op.
- ⚠️ Phase 1 is a serial bottleneck for Phases 2, 5 and part of 6. If it slips, three features slip.
- ⚠️ The settlement step's slot is pinned by naming **all four neighbours** in the Technical Design,
  not just "before the royal transition" — see "Event ordering" below. A test asserting only the
  latter would stay green under either placement relative to the check tally and E7.

**Rejected alternatives:**

- Separate solutions per feature (Interview #1 option B) — rejected by the author; it re-creates the
  one-vocabulary-two-code-paths shape this repo has recorded twice.
- Re-keying `frozenUntil` after the move by diffing origin and destination — rejected: it infers the
  subject from board movement rather than knowing it, and a ply that moves two pieces (a swap, a
  portal chain) makes that inference ambiguous.
- Changing AC-006's card to one that never touches the moving piece (Interview #1 option C) —
  rejected by the author; it dodges the defect rather than fixing it, and leaves the next author to
  re-discover it.

**Source:** Interview #1

### ADR-002: The relocation lock is a per-card v12 flag whose grammar admits `swap_pieces`

**Status:** Accepted (2026-08-13, from SPEC AC-001/AC-002)

**Context:** SPEC AC-001 and AC-002 require that a piece relocated by a skill card cannot take the
move the turn still owes. v11 established that cards opt into follow-up rules **individually**
(ADR-002/003 of `PLAN-same-turn-skill-move-balance`), and its `protectRelocatedAfterPlay` validation
requires "exactly one unconditional, unquantified, single-subject teleport and no other relocation"
(`load.ts:196-201`) — a grammar that rejects `swap_pieces` by construction, which is the card the
author named first.

**Decision:** Schema v12 adds `SkillCardDef.lockRelocatedAfterPlay: boolean`, required on v12
documents and injected as `false` by the loader for `<= v11` sources. When true, ADR-001's settlement
step attaches a `forbid_movement` grant with `untilPly = state.plyCount + 1` to **every** relocation
subject's final surviving square. Validation accepts a card whose effects contain at least one
relocation action (`teleport_piece` or `swap_pieces`) and rejects one with none — the absent case
made explicit, per `[fail:design] absent-case-is-a-feature-black-hole`.

The narrower single-subject grammar stays attached to `protectRelocatedAfterPlay` only; the two
flags are validated independently.

**Why `untilPly = state.plyCount + 1` is the right window**, written down because it looks off by
one: the card branch returns at `engine.ts:1132-1149` **without** incrementing `plyCount`. So the
grant satisfies `untilPly > state.plyCount` (`engine.ts:53`) while the owed move is generated, and
expires exactly when the move ply increments at `engine.ts:1166`. It covers the owed move and
nothing beyond it. A reader who assumes the card branch increments `plyCount` will "fix" this to
`+2` and silently extend the lock into the opponent's turn.

**Consequences:**

- ✅ `skill.teleport` and `skill.swap` both carry a working lock; neither is a flag that validates
  and does nothing.
- ✅ The per-card opt-in matches how the author already decided `royalFollowUp` card by card.
- ⚠️ Every v12 skill card must now write three booleans. Bundled content writes all three explicitly.
- ⚠️ `forEach`-quantified relocation is admitted by the wider grammar and will lock every bound
  subject. That is the intended reading, and Phase 2 pins it rather than leaving it to be discovered.

**Rejected alternatives:**

- An engine-wide rule locking every square a card wrote to — rejected: the same blanket-rule
  objection that ADR-002 of the v11 work already settled, and it erases card identity.
- Authoring `forbid_movement duration:1` into each card's actions — rejected: targets resolve
  pre-cascade, so a portal or geyser on the destination makes the authored square the wrong one.

**Source:** SPEC AC-001, AC-002; RESEARCH Ask 1

### ADR-003: Royals stay un-relocatable, and SPEC AC-003 is withdrawn

**Status:** Accepted (2026-08-13, via /hm:plan Step 4 follow-up interview). **Supersedes** the
SPEC-interview answer "the lock reaches the king", which was given on an incomplete guard inventory.

**Context:** SPEC AC-003 required a relocated king to be locked. `plan-validator` found — and this
was verified against the code before being put to the author — that the criterion has no position
that exhibits it, because **three** royal guards stand between a skill card and a king, and this
PLAN's first draft named only the first:

| # | Guard | Location | What it stops |
|---|---|---|---|
| 1 | `generationModifiers` skips skill-layer grants on a royal | `engine.ts:55` | a lock/freeze/protection *grant* applying to a king |
| 2 | `executeActions`' `mayAffect` returns false for a royal occupant when `bound.layer === 'skill'` | `engine.ts:707-711`, gating `teleport_piece` at `:729` and `swap_pieces` at `:825` | **the relocation itself** |
| 3 | the card branch skips bound subjects that are royal | `engine.ts:1048-1051` | a quantified skill effect binding a king |
| 4 | `candidatesFor` drops royals from every choice slot | `engine.ts:293` | **the target being offered at all** — added 2026-08-13 during Phase 2, which is when it was found |

Guard 4 is the outermost and the one that makes SPEC AC-012's original wording unconstructible: a
`chosen_friendly` relocation is never handed a royal square to name, so "plays the card naming that
king" describes an action the generator does not emit. AC-012 asserts the observable form instead.

Guard 2 is the load-bearing one: `skill.teleport` (`bundled.ts:720-735`) and `skill.swap`
(`:737-752`) are both no-ops on a king today. Carving out guard 1 alone would produce a lock that
can never fire.

**Decision:** Keep all three guards intact. SPEC AC-003 is **withdrawn**; SPEC AC-012 replaces it,
asserting the opposite — a relocation card naming a royal leaves the position identical to the
no-card control on board, grants and legal actions alike. The relocation lock therefore never
applies to a royal, and `generationModifiers` needs **no** carve-out.

Because there is no carve-out, there is **no discriminator field** on `ActiveGrant` either. The
lock's grant is an ordinary `forbid_movement` grant, distinguished only by its `sourceId`/`layer`
provenance, which nothing in the engine branches on.

**Consequences:**

- ✅ Phase 2 loses its riskiest clause. The `royal-skill-immunity` suite is green **unmodified** and
  keeps its full strength as a control rather than being rewritten to admit an exception.
- ✅ `ActiveGrant` gains one field (ADR-004's `beneficiarySide`) rather than two, so the
  absent-case question for the authored-grant push site (`engine.ts:838`) does not arise.
- ⚠️ A player can teleport a non-royal piece and still move their king afterwards. That is the same
  turn the game already allows and is not a loophole in the lock — the lock is about the piece the
  card moved.
- ⚠️ Royal displacement by card remains unauthorable. If it is wanted later it is its own unit, with
  its own ADR and its own arm in `royal-skill-immunity`.

**Rejected alternatives:**

- Allow skill cards to relocate a friendly king, then lock it (Interview #2 option B) — rejected by
  the author: it is a materially larger rule change (pull the king out of danger, drive it forward)
  wearing the clothes of a small one.
- A per-card `mayRelocateRoyal` flag (Interview #2 option C) — rejected: every bundled card would
  write `false`, so the flag would validate and never be exercised. `[fail:design]
  declared-but-inert-vocabulary`, count 7.
- Carving out guard 1 only (this PLAN's first draft) — rejected on evidence: guards 2 and 3 make the
  resulting lock unreachable, so the phase's exit criterion could never be met.

**Source:** Interview #2; `plan-validator` pass 1, critical finding 1

### ADR-004: A grant records who it is for, and `block_capture` consults it

**Status:** Accepted (2026-08-13, from SPEC AC-005)

**Context:** `executeActions` pushes an `ActiveGrant` carrying `{kind, square, untilPly, sourceId,
layer}` and no side (`engine.ts:830-851`), and `generationModifiers` adds a live `block_capture`
square to `protectedSquares` regardless of who occupies it (`engine.ts:57`). `square.mist` grants
three plies of protection on entry (`bundled.ts:411-424`); when the protected piece walks away and an
enemy steps in, the enemy is uncapturable. Square-keying is a **declared** design choice
(`types.ts:31-42`) and it is right for freeze, where a lingering effect is a penalty the next
occupant inherits — for protection it inverts, handing a benefit to the opponent.

**Decision:** `ActiveGrant` gains `readonly beneficiarySide: Side`, **required** on every grant.
`generationModifiers` adds a square to `protectedSquares` only when the current occupant's side
equals the grant's `beneficiarySide`.

**The derivation rule, stated per creation site rather than globally** — there are three, and the
"empty square" case the first draft treated as an edge case is the *systematic* case at one of them:

| Site | Location | `beneficiarySide` |
|---|---|---|
| authored action, lifecycle event | `engine.ts:838-848` via `runEvent` | the target square's occupant; if empty, `eventSubject` (see below) |
| authored action, card `on_play` | `engine.ts:838-848` via the card branch | the target square's occupant; if empty, **drop the grant** — there is no event subject on this path |
| settlement — protect (existing) | `engine.ts:1107-1113` | the relocated piece's side (it is standing there by construction) |
| settlement — lock (ADR-002) | new | the relocated piece's side, recorded for uniformity; `forbid_movement` does not read it |

**The empty-square case at `on_capture`, and the mechanism that supplies the answer.** The victim is
removed at `engine.ts:984`, *then* `runEvent(..., 'on_capture', [action.to], ...)` runs at `:1009`,
so a `block_capture` granted at the victim's square during `on_capture` always sees an **empty**
square. A naive "fall back to the acting side" would name the **capturer** — who then moves onto
that very square at `:1018-1020` and would be protected there. The victim's death would hand
protection to its killer.

The fallback must therefore be the **victim**, and naming the source precisely matters: it is
**`runEvent`'s own `subject` parameter**, threaded into `executeActions` as a new argument — *not*
`ctx.subject`. They differ exactly where it counts: `ctx.subject` is
`bound.boundSubject ?? subject` (`engine.ts:677`), so under a `forEach` quantifier it is whatever
the quantifier bound, which can be the capturer's own piece — reproducing the inversion this rule
exists to prevent. On the card's `on_play` path there is no event at all and `ctx.subject` is
`bound.boundSubject ?? played`, where `played` is the **first chosen target's occupant**
(`engine.ts:1036-1038, :1056`) — the caster's pick, which this ADR's rejected alternatives already
rule out. Hence the table's second row: on that path there is no honest fallback, so the grant is
dropped.

**The drop rule is scoped to `block_capture`.** It is the only kind that reads the field, and
deleting a `forbid_movement` or `grant_movement` grant because an unread field could not be
populated would be a semantic change driven by a field those kinds do not consume. For those two
kinds an empty target square records the acting side and the grant is kept — the value is inert
either way.

No shipped content is affected, and the inventory is complete rather than sampled: the bundle
carries **ten** duration-bearing grants (`bundled.ts:420, 837, 861, 880, 897, 1004, 1049, 1109,
1127, 1150`), and every one targets a square occupied by construction — `entering`, `self`,
`chosen_friendly` or `chosen_enemy`. Of those ten, the three the drop rule can touch at all are the
`block_capture` ones: `:420` (`square.mist`), `:880` and `:1109`.

**Scope:** only `block_capture` consults the field in this task. `forbid_movement` and
`grant_movement` carry it and do not read it, because the SPEC scoped the report to protection. The
sibling case — your own `forbid_movement` pinning a friendly piece that later steps onto the square —
is real and is Risk 6 rather than a silent fix.

**Interaction with `sideInCheck`, stated precisely and narrowed twice.** `sideInCheck` filters
royals by `mods.protectedSquares` (`engine.ts:223-244`), so the field can change a check verdict —
but two things bound it much harder than the first draft assumed:

1. `engine.ts:55` already drops **skill-layer** grants standing on a royal, so only `square`- and
   `rule`-layer grants can reach a royal's square. In the shipped set that is `square.sanctuary`
   (`generate_moves`, no duration → not a persisted grant) and `square.mist` (`duration: 3` →
   persisted). One square type.
2. The **same-ply** case does not exist. `settled` at `engine.ts:1155` omits `m.grants`, so the
   ply's own check tally reads `state.grants` and cannot see any grant created during the ply
   (Risk 12). The field only changes a verdict from the **following** ply onward.

So the observable case is exactly one and it is cross-ply: a king standing on a `square.mist` grant
earned on an earlier ply by an enemy piece. That is what Phase 3 asserts.

**Consequences:**

- ✅ AC-005's two arms differ in exactly one bit, so a fix that merely expires the grant early fails
  one of them.
- ✅ An authored card that protects an *enemy* piece keeps working: the beneficiary is read off the
  occupant, not off the caster.
- ⚠️ A protected piece that leaves and returns is protected again while the grant lives. That is
  square-keying behaving as declared, and it is stated here so it is not read later as a second bug.
- ⚠️ A field two of three grant kinds do not read is a mild declared-but-inert risk; it is mitigated
  by the field being live for `block_capture` and by the risk register naming the open sibling.

**Rejected alternatives:**

- Keying the beneficiary to the caster rather than the occupant — rejected: it breaks an authored
  card that deliberately protects an enemy piece.
- Expiring the grant when the square changes occupant — rejected: it also expires the grant when the
  *owner* steps out and back, which no requirement asks for, and it makes `frozenUntil` and `grants`
  disagree about what square-keying means.
- Moving to piece identity — rejected for the same reason the v11 work rejected it: the board model
  intentionally has no piece ids.

**Source:** SPEC AC-005; RESEARCH Ask 6 candidate (2)

### ADR-005: `piece_kind_count_at_most` is a new condition, not a widened `piece_count_at_most`

**Status:** Accepted (2026-08-13, from SPEC AC-007)

**Context:** SPEC AC-007 needs a condition that can observe absence, so that AC-008's card can say
"this side has no pawns left". `piece_count_at_most` counts a side's
whole army with no kind filter (`effects.ts:159-164`) and its `n` is
`z.number().int().positive()` (`schema.ts:243`), so it cannot express zero. `forEach` iterates
existing pieces, so zero matching subjects produce zero bindings and the effect never fires — the
absent-case black hole in its purest form.

**Decision:** Add `{ kind: 'piece_kind_count_at_most'; side: 'mover' | 'opponent'; pieceId: string;
n: number }` with `n: z.number().int().nonnegative()`. `piece_count_at_most` is left exactly as it
is, including its `positive()` bound.

**Consequences:**

- ✅ Every `<= v11` document keeps validating unchanged; no existing card's meaning shifts.
- ✅ The n=0 row is expressible, and it is the row the golden table in the SPEC exists to pin.
- ⚠️ Two similar conditions in the editor vocabulary. Their labels must make the difference visible
  or an author will pick the wrong one.
- ⚠️ Six consumers move together: `schema.ts` (union + zod), `effects.ts` (evaluation),
  `editor/controls.ts:75` (template), `ui/SentenceSlot.tsx:304,313` (side and numeric pickers, plus a
  new piece picker), `balance/cost.ts:151` (pricing), `i18n/ko.ts:478` (vocabulary label).

**Rejected alternatives:**

- Relaxing `piece_count_at_most` to `nonnegative` and adding an optional `pieceId` — rejected: an
  optional field that changes the meaning of the count is the absent-case shape this repo has
  recorded eight times, and `n: 0` on the existing condition would mean "this side has no pieces at
  all", a state the royal rules already terminate.
- Reading `state.captured` from a new condition — rejected: it counts what was lost, not what
  remains, so a revive makes the two disagree.

**Source:** SPEC AC-007, AC-008

### ADR-006: The 8x8 preset is measured and reported, not bounded

**Status:** Accepted (2026-08-13, from SPEC AC-010 and the SPEC interview)

**Context:** `PLY_CAP = 60` is global (`engine.ts:29`) and AC-012's self-play assertions run against
`BUNDLED_PRESET_ID` only (`self-play.test.ts:44`), currently median 36 against a cap of 40. A new
preset would ship entirely unmeasured, which is the declared-but-inert shape at the balance layer.

**Decision:** `self-play.test.ts` gains a report-only test for the new preset: median plies, maximum
plies, and the per-rule-card distribution. The only assertion is coverage — the reported card keys
equal the preset's declared `ruleCardIds`, which is the check the existing 6x6 test already makes
(`self-play.test.ts:116`). No threshold on any length, and `PLY_CAP` is unchanged.

**Consequences:**

- ✅ The numbers exist and are read, so a later decision about `PLY_CAP` has evidence.
- ✅ Today's balance is not frozen into a requirement — the mistake `PLAN-capture-rules-and-art-fixes`
  Phase 5 explicitly refused to make.
- ⚠️ A genuinely broken 8x8 preset (every match to the cap) ships green. The coverage assertion does
  not catch it; the human reading the printed table is the control, and Phase 6's exit criterion
  requires that reading to be written down.

**Rejected alternatives:**

- Asserting median/max on the new preset — rejected by the author; it encodes an unmeasured balance
  as a requirement on its first day.
- Skipping measurement entirely — rejected by the author.

**Source:** SPEC AC-010; SPEC interview Round 2

### ADR-007: Both schema additions land in one version bump

**Status:** Accepted (2026-08-13, planning decision)

**Context:** ADR-002 adds a required skill-card field and ADR-005 adds a condition kind. Each could
be its own version. `SCHEMA_VERSION = 11` (`schema.ts:95`), and the loader's normalization is a
single `schemaVersion <= 10` branch (`load.ts:147-150`).

**Decision:** One bump to **12**, with **two independent normalization branches, not one widened
predicate**:

```ts
// load.ts, skillCards — order matters, and so does keeping the predicates apart
const normalized = { ...record,
  ...(schemaVersion <= 10 ? { royalFollowUp: 'preserve', protectRelocatedAfterPlay: false } : {}),
  ...(schemaVersion <= 11 ? { lockRelocatedAfterPlay: false } : {}),
}
```

This is written out because the obvious edit is wrong in a way no validation catches. The existing
branch (`load.ts:147-150`) spreads its defaults **last** — `{ ...record, royalFollowUp: 'preserve',
protectRelocatedAfterPlay: false }` — so they override whatever the document declares. Widening that
predicate from `<= 10` to `<= 11` would silently reset every **v11** document's declared
`royalFollowUp` and `protectRelocatedAfterPlay` to the defaults, disabling `skill.quake`'s protection
and every follow-up disposition in v11 author content. The fields would be present and well-typed, so
nothing would error.

The new condition needs no normalization: the absence of a condition kind is not a missing field. A
v12 document missing `lockRelocatedAfterPlay` fails, per the v11 precedent that Zod defaults are not
used for this.

**Consequences:**

- ✅ One migration branch to reason about and one round of author-content churn instead of two.
- ✅ `[fail:design] saved-blob-forks-shipped-content` is not made worse: a bump is the one path that
  currently invalidates a stored blob, and invalidation **discards** the author's work
  (`App.tsx:37`) — so the bump must be announced in the phase notes and is a stated risk, not a
  silent side effect.
- ⚠️ Phases 2 and 4 both touch `schema.ts` and `load.ts`, so they cannot be parallelised despite
  being logically independent.

**Rejected alternatives:**

- v12 then v13 — rejected: two migration branches and two invalidations of stored author content for
  one release.

**Source:** planning decision, recorded because it constrains phase parallelism

### ADR-008: A swapped piece enters the square it arrives on

**Status:** Accepted (2026-08-13, via /hm:plan Step 4 follow-up interview)

**Context:** ADR-002 needs `swap_pieces` to report its endpoints so the lock has settlement
subjects. Today it reports none (`engine.ts:818-829`), so `relocatedTo` stays null and
`engine.ts:1069` — `if (relocatedTo) subjectSquare = cascadeEnter(...)` — never runs for a swap.
Teleport's endpoint does run it. The consequence is a difference no player could explain: a
teleported piece landing on `square.bomb` dies, a swapped one does not; a teleported pawn reaching
the promotion rank promotes, a swapped one does not.

Reporting the endpoints makes the cascade fire. That is not a side effect to be engineered around —
it is the inconsistency surfacing.

**Decision:** Both swap endpoints cascade, in declared order (`a` then `b`), exactly as a teleport
destination does. `subjectSquare` — which feeds E5 promotion (`engine.ts:1088-1096`) and E7's
`subject` (`:1163`) — is the **last surviving cascaded endpoint**, so a single-relocation card's
behaviour is bit-for-bit unchanged. E5 promotion iterates the **whole** cascaded subject set rather
than `subjectSquare` alone, because the existing comment at `:1085` already states the governing
rule: "landing on the promotion rank is a fact about the square, not about how the piece got
there" — and promoting one of two swapped pawns and not the other would contradict it. E7's subject
stays single; `end_of_ply` has one subject by design, and `forEach` is the vocabulary for talking
about many.

**"Last surviving endpoint" is a fixed arbitrary choice, not an observable rule** (recorded
2026-08-13 after Phase A.5 round 2 reported it unpinned). `subjectSquare` has four consumers —
E5 promotion (`engine.ts:1088-1097`, which now iterates the set instead), E6 `on_remove` (`:1101`),
the protect settlement (`:1106`), and E7 (`:1163-1164`). On a **card** ply, which is the only kind a
swap can occur on, E7 is unreachable: the card branch returns at `:1132`. The protect settlement's
subject is a single teleport, never a set. So after E5 iterates, the choice between "first" and
"last" endpoint is observable **only** through `on_remove` — vocabulary the engine's own comment
marks "none produced yet". Writing a fixture to drive an unused trigger purely to pin a tie-break is
the direction `[fail:design] declared-but-inert-vocabulary` (count 7) warns about, so it is not
pinned. "Last" is chosen because it makes a single-relocation card's behaviour bit-for-bit
unchanged; if `on_remove` ever gains content, this becomes observable and needs a test then.

**Two mechanical requirements that come with the iteration**, both easy to miss and both fatal:

- **The set is filtered by occupancy at E5 time, not by `cascadeEnter`'s return.** E5 dereferences
  unguarded — `m.board.get(subjectSquare)!` at `engine.ts:1089` and `:1097` — and two things run
  between the cascades and E5: the *second* endpoint's own `cascadeEnter`, and the `m.arrived` loop
  (`:1081-1083`). Either can remove the piece standing on the first endpoint. A set member with no
  occupant would turn a rules outcome into a `TypeError` inside `transition`. Both `!` assertions
  become guards, and the iteration skips empty squares. AC-013 will **not** catch this — its
  preconditions require both swapped pieces to survive — so Phase 1 owns a separate case where
  endpoint b's `on_enter` destroys the piece on endpoint a.
- **`on_promote` now fires once per surviving endpoint.** `engine.ts:1097` runs it unconditionally,
  not only when a promotion happened, so iterating the set doubles its occurrences on a swap ply.
  Nothing in the shipped bundle uses `on_promote`, but `schema.ts:108` makes it authorable, so this
  is a trigger-frequency change and is recorded rather than discovered later.

**Consequences:**

- ✅ One rule for arriving on a square, whatever moved you there.
- ✅ Gives `skill.swap` real interaction with painted squares — swapping a piece onto a portal now
  carries it onward, which is a play, not a bug.
- ⚠️ **This changes shipped behaviour**, so `card-liveness.test.ts` must be re-baselined for
  `skill.swap` and `square-liveness.test.ts` gains swap arms. It is measured as SPEC AC-013 rather
  than absorbed silently.
- ⚠️ A swap onto a bomb now kills your own piece. That is the intended reading and the card text
  needs no change (it already says only what it moves), but it is a live trap where none existed.
- ⚠️ Self-play length may move; the AC-012 re-baseline in Phase 5 covers both this and the
  blood-toll change, so the two must be attributed separately or the metric lesson is lost.

**Rejected alternatives:**

- Report endpoints for settlement but suppress their cascade (Interview #3 option B) — rejected by
  the author: it preserves an inconsistency and adds a second notion of "relocated" that only the
  lock can see.

**Source:** Interview #3; `plan-validator` pass 1, critical finding 2

## 🏗️ Technical Design

### Current State

- **Settlement.** `transition`'s card branch tracks a single `relocatedTo` (`engine.ts:1061`),
  cascades it (`:1069`), and — only when `protectRelocatedAfterPlay` — pushes one `block_capture`
  grant at `:1106-1113`. `executeActions`' `swap_pieces` case (`:818-829`) returns no `moved`, so a
  swap contributes no settlement subject at all.
- **Grants.** `ActiveGrant` = `{kind, square, untilPly, sourceId, layer, pattern?}`
  (`types.ts:31-42`). `generationModifiers` (`engine.ts:46-59`) merges live grants into
  `protectedSquares` / `forbidden` / `granted`, skipping any skill-layer grant on a royal (`:55`).
- **Capture events.** `runEvent(..., 'on_capture', [action.to], {victim}, mover, action.from)`
  (`engine.ts:1007`); `resolveTarget`'s `mover` case returns `ctx.moverSquare`
  (`effects.ts:192-198`), which at that moment is the origin.
- **Conditions.** `piece_count_at_most` counts a whole side (`effects.ts:159-164`); `n` is positive
  (`schema.ts:243`).
- **Boards.** All five shipped boards are 6x6 (`bundled.ts:1196` ff). `width`/`height` are unbounded
  positive integers (`schema.ts:444-445`). The renderer sizes from state (`MatchHost.tsx:1201`).
- **Square types.** Eight ship (`bundled.ts:273-424`), covering four triggers.

### Affected Components

| Component | Change | Phase |
|---|---|---|
| `src/engine/engine.ts` | settlement step; grant beneficiary; royal carve-out; `relocatedTo` → set | 1, 2, 3 |
| `src/engine/effects.ts` | `swap_pieces` reports both endpoints; new condition case | 1, 4 |
| `src/engine/types.ts` | `ActiveGrant.beneficiarySide`; settlement types | 1, 3 |
| `src/content/schema.ts` | `SCHEMA_VERSION = 12`; `lockRelocatedAfterPlay`; new condition | 2, 4 |
| `src/content/load.ts` | `<= 11` normalization; lock-flag validation | 2 |
| `src/content/sets/bundled.ts` | card dispositions; replacement + democracy cards; 3 square types; board + preset | 2, 5, 6 |
| `src/editor/controls.ts`, `src/ui/SentenceSlot.tsx` | new condition in the authoring vocabulary | 4 |
| `src/balance/cost.ts` | pricing case for the new condition | 4 |
| `src/i18n/ko.ts` | vocabulary label, card names and texts, square names and texts | 4, 5, 6 |
| `src/ui/art/{registry,pixels}.ts` | art for 2 new rule cards + 3 new square types | 5 |

### Dependencies

No new runtime dependency. `zod` and `vitest` already carry everything needed.

### Architecture

```
ply
 ├─ on_play / move
 │    └─ executeActions ──► relocationSubjects: Set<SquareId>   (ADR-001)
 │                          deferredWrites: [{write, subject}]
 ├─ cascadeEnter chain  ──► each subject resolves to its final square
 ├─ E6 on_remove
 └─ SETTLEMENT  (one step, three callers)                        (ADR-001)
      ├─ protectRelocatedAfterPlay  → block_capture grant   (existing behaviour)
      ├─ lockRelocatedAfterPlay     → forbid_movement grant (ADR-002, ADR-003)
      └─ mover-targeted square write→ freeze / grant at destination (AC-006)
```

### Event ordering — the settlement slot, with every neighbour named

"After E6, before the royal transition" is not a slot: on the move branch there are two more steps
between them, and both are load-bearing here. The settlement step goes **immediately after E6 and
before the card branch's early return**, which is the one position that serves both branches:

```
CARD branch                          MOVE branch
  on_play                              E2 on_leave / E3 capture / E4
  cascadeEnter chain                   E5 promotion        engine.ts:1088
  E5 promotion       engine.ts:1088    E6 on_remove        engine.ts:1101
  E6 on_remove       engine.ts:1101    ▶ SETTLEMENT  ◀     (new)
  ▶ SETTLEMENT  ◀    (new)             check tally         engine.ts:1155
  royalTransition    engine.ts:1130    E7 end_of_ply       engine.ts:1164
  return             engine.ts:1132    plyCount + 1        engine.ts:1166
  (material cap unreachable here)      royalTransition     engine.ts:1192
                                       material cap        engine.ts:1193
```

The diagram also omits nothing that can invalidate a settled subject: the `m.arrived` cascade loop
(`engine.ts:1081-1083`) runs **before** E5 and can remove a piece standing on an endpoint computed
earlier, which is why the settlement guard re-checks `m.board.has(subject)` at settlement time rather
than trusting `cascadeEnter`'s return.

**What the position actually buys — corrected against the code.** A first draft of this section
claimed two consequences that are both false, and the correction is the useful part:

- ❌ *"`end_of_ply` rule cards observe settled writes."* They cannot. The only settled write on a move
  ply is caller 3's `freeze_piece`, and **no condition kind reads frozen state** — the union is
  `always / piece_is / piece_side / on_square / on_own_rank / piece_count_at_most /
  check_count_at_least / not / all / any` (`effects.ts:142-173`). `sideInCheck` does not read
  `frozenUntil` either (`engine.ts:223-244` filters by `protectedSquares` and sweeps with
  `reachFrom`); the only readers are `movesFor` (`:149`) and `describeRejection` (`:592`), both of
  which run on the **next** ply.
- ❌ *"The check tally sees ADR-004's `protectedSquares` change on the same ply."* It cannot, for a
  reason worth recording on its own: `settled` at `engine.ts:1155` is
  `{ ...state, board: m.board, frozenUntil: m.frozenUntil }` — it carries the new board and the new
  freezes but **not `m.grants`**, so `sideInCheck` at the tally reads `state.grants`, the pre-ply
  array. **No grant pushed during a ply is visible to that ply's check tally today.** That is a
  pre-existing defect, not one this PLAN introduces; it is Risk 12 and is deliberately out of scope.

✅ **What settlement's position does change**, and therefore what Phase 1 can pin: E7's `runEvent`
(`engine.ts:1164`) can destroy or relocate the settlement subject. Settlement **before** E7 leaves
the write on a square E7 then empties; settlement **after** E7 drops it via the `m.board.has`
guard. The two orders are observably different, so **Phase 1's ordering test has exactly one arm:
the E7 arm**, driven by a fixture `end_of_ply` card that destroys the mover. The check-tally arm is
dropped — it was unpinnable, and an exit criterion that cannot go red is worse than none.

### Design Decisions

- The settlement step's slot is the block above, pinned by test in Phase 1.
- There is **no** discriminator field on `ActiveGrant`: ADR-003 removed the carve-out that needed
  one, so the lock's grant is an ordinary `forbid_movement` grant.
- `beneficiarySide` is read off the occupant at creation, and off the event subject when the square
  is empty — never off the caster (ADR-004).
- The new condition is a new union member; the old one is untouched (ADR-005).
- Both swap endpoints cascade; E5 iterates the subject set, E7 stays single-subject (ADR-008).

### AC-007's golden table — the four rows, enumerated

The SPEC's machine companion (`specs/SPEC-movement-lock-8x8-and-rule-cards.machine.yaml`, AC-007
`golden_table`) already carries these; they are restated here so the phase's exit criterion is
judgeable without opening a second file. Provenance is the `at most n` operator's own arithmetic,
fixed before any code exists.

| `n` | pieces of the named kind remaining | condition |
|---|---|---|
| 0 | 0 | true |
| 0 | 1 | false |
| 1 | 1 | true |
| 1 | 2 | false |

The `n = 0, remaining = 0` row is the one a `forEach`-based encoding provably cannot produce, and it
is the row the whole ADR exists for.

### Data Flow — AC-005's two arms

```
grant created:  d3 occupied by WHITE  → beneficiarySide: 'white'
white leaves, black enters d3, grant still live (untilPly > plyCount)

generationModifiers:
  occupant(d3).side === 'black' !== 'white'  → d3 NOT added to protectedSquares
  ⇒ white's capture of d3 is generated                        (AC-005 arm 1)

control: white still on d3
  occupant(d3).side === 'white' === 'white'  → d3 IS protected
  ⇒ the capture is not generated                              (AC-005 arm 2)
```

### API and Schema Changes

- `SCHEMA_VERSION`: 11 → 12.
- `SkillCardDef.lockRelocatedAfterPlay: boolean` — required on v12, injected `false` for `<= 11`.
- `Condition` union gains `piece_kind_count_at_most { side, pieceId, n }` with `n` nonnegative.
- `ActiveGrant` gains `readonly beneficiarySide: Side` — **required**, no discriminator field
  (ADR-003 removed the need for one).
- `executeActions` returns a **set** of relocation endpoints instead of a single `movedTo`.
- No change to `Action`, `GameState`'s public shape beyond `grants[]` entries, or any UI contract.

## 📝 Implementation Plan

**Total order — this is binding, not advisory.** `1 → 2 → 3 → 4 → 5 → 6`. `parallel_group` labels
below describe which phases *contend for the same files*, not which may run at once; nothing in this
PLAN runs concurrently. The order matters at two specific seams:

- **2 before 3.** Phase 2 creates a third `ActiveGrant` push site (the lock grant) and Phase 3 makes
  `beneficiarySide` required on every grant. Landing 3 first means Phase 2 must remember to populate
  a field on a site that did not exist when the field was designed. Landing 2 first means Phase 3
  retrofits **all** push sites at once, which is one job with one checklist. Phase 3 owns that
  retrofit by name.
- **4 after 2.** Phase 4 previously declared `depends_on: []` while its own merge-hazard line said it
  shared `schema.ts` with Phase 2 — an escape hatch ("or resolve `SCHEMA_VERSION` by hand") is not an
  order. `SCHEMA_VERSION = 12` is owned solely by Phase 2; Phase 4 adds a v12 field to a file that is
  already at v12.

### Phase 1 — Settlement mechanism (ADR-001, ADR-008)

- **depends_on:** `[]`
- **parallel_group:** `serial-engine`
- **merge_hazards:** `src/engine/engine.ts`, `src/engine/effects.ts`, `src/engine/types.ts` — shared
  with Phases 2 and 3, which is why this group is serial.
- **Scope in:** the settlement step and its types; `executeActions` returning a **set** of relocation
  endpoints; both swap endpoints cascading, with `subjectSquare` = the last surviving endpoint and E5
  promotion iterating the set (ADR-008); routing `protectRelocatedAfterPlay` through the new step
  with no behaviour change; deferral of `freeze_piece` writes whose target is `mover` on a move ply.
- **Scope out:** the lock flag, the schema bump, any content, `block_capture` ownership, deferral of
  the three **grant** kinds when targeting `mover` (Risk 10).
- **Exit criterion:** three parts, all runnable.
  1. `npx vitest run tests/engine/` green with `royal-threat-audit`, `royal-skill-immunity`,
     `layer-order` and `apply-trusted` **unmodified**. (`card-liveness` is deliberately NOT on this
     list — ADR-008 changes `skill.swap`'s behaviour, so its `current` baseline moves; the move must
     be attributed to ADR-008 in the test comment, not absorbed.)
  2. A new ordering test with **one** arm: a fixture `end_of_ply` rule card that destroys the mover,
     asserting the settled write **survives** on the vacated square. It goes red when settlement is
     moved after E7 (`engine.ts:1164`), because the `m.board.has(subject)` guard then drops it.
     Deliberately no check-tally arm and no `royalTransition` arm — neither is observable (see the
     Event ordering block), and an exit criterion that cannot go red is worse than none.
  3. SPEC AC-013 passes: a swap onto `square.bomb` destroys the arriving piece and a swap onto
     `square.portal` carries it on, for **both** endpoints — the differential against teleport.
- **Risk:** high — it moves an event-ordering seam that four suites depend on, and it changes shipped
  behaviour for `skill.swap`.
- **Rollback point:** n/a (first phase); revert to base.
- **Status: DONE.** `tests/engine/relocation-settlement.test.ts`, 12 tests, all green. Full unit
  suite **145 files / 1650 tests green**, `tsc --noEmit` clean. All four named suites
  (`royal-threat-audit`, `royal-skill-immunity`, `layer-order`, `apply-trusted`) green
  **unmodified**; `card-liveness` and `square-liveness` also green unmodified — the ADR-008
  re-baseline the exit criterion anticipated did **not** materialise, because the shipped
  `skill.swap` takes `chosen_friendly` targets and no shipped board paints a square the bundled
  self-play positions swap onto. Delivered: `DeferredWrite` + `Mutable.deferred`; `executeActions`
  returning `SquareId[]`; `swap_pieces` reporting both endpoints; `subjectSquares` with E5 iterating
  it under occupancy guards (the `!` dereferences at `:1089`/`:1097` are gone); the settlement step
  after E6 with `settle:<kind>:<sourceId>` / `settle:dropped:<sourceId>` trace entries.

  **A.5 gate: FAIL at round 2 of 2, escalated, resolved by two author decisions** — the `settle:`
  trace entry is now an ADR-001 contract (it was a test imposing an unwritten obligation), and
  "last surviving endpoint" is recorded as unobservable rather than pinned. Round 1 caught four
  real gaps including the portal branch and the E5-promotion clause, both of which a correct-looking
  half-implementation would have passed.

  **One structure test caught a real violation**: `no-content-in-engine` rejected a content id in a
  new comment. This project's ADR-001 says the engine names no content, and that includes prose.

#### Phase 1 — D.5 newly-reachable window

This phase repairs two defects (an inert mover-targeted freeze; a swap that skipped `on_enter`), so
the window is written down rather than reflected on.

1. **The window.** Three inputs newly reach code they could not before. (a) A **swapped** piece now
   reaches every `on_enter` effect — bomb, portal, shrine, sanctuary, mire, geyser, thorns, mist —
   where before it reached none. (b) A **mover-targeted `freeze_piece`** now lands on the ply's final
   square, so a destination square can carry a freeze it previously never could, including a
   destination reached through a cascade chain. (c) **E5 promotion** now runs for swap endpoints, so
   a pawn can promote by being swapped rather than by moving.
2. **The tests that enter it, all in this commit.** (a) `destroys the piece a swap moves onto a bomb
   square`, `cascades BOTH endpoints, not just one`, `carries a swapped piece through a portal to
   the pair`. (b) `freezes the square the capturer arrives on`, and `follows a cascading destination
   to the FINAL square` — the second is the one that enters the *chained* half of the window and is
   the only arm that separates real deferral from origin→destination re-keying. (c) `promotes a pawn
   swapped onto the promotion rank` and `promotes BOTH endpoints when both land on the promotion
   rank`.
3. **Absent case.** The deferral activates on `ctx.moverSquare != null`, so its absent case is a card
   `on_play` naming `mover`. Covered by `queues nothing when a card names 'mover'`, and the measured
   answer is stronger than expected: nothing is deferred **and** nothing is written, because `mover`
   is not a choice slot, so such a card takes no targets and has no subject to fall back to. **That
   is a pre-existing declared-but-inert case in the vocabulary, discovered by this probe and not
   introduced here** — a card whose only action names `mover` on `on_play` validates, is offered,
   plays, logs `on_play:skill:<id>`, and changes nothing. Out of scope to fix; recorded as Risk 14.

### Phase 2 — Relocation lock (ADR-002, ADR-003, ADR-007)

- **depends_on:** `[1]`
- **parallel_group:** `serial-engine` — **runs before Phase 3**, per the total order above.
- **merge_hazards:** `engine.ts` (with 1, 3), `schema.ts` and `load.ts` (with 4), `bundled.ts`
  (with 5, 6).
- **Scope in:** `SCHEMA_VERSION = 12`; `lockRelocatedAfterPlay` in the schema, the loader
  normalization and the loader validation (accepting `swap_pieces`, rejecting zero relocation
  actions); the lock grant at the settlement site; explicit `false`/`true` on all 24 bundled skill
  cards, with `skill.teleport` and `skill.swap` set true.
- **Scope out:** any royal carve-out and any `ActiveGrant` discriminator — ADR-003 removed both.
  Which *other* bundled cards should carry the lock: every card except those two is `false`, and
  widening is a content decision for a later unit.
- **Exit criterion:** AC-001, AC-002, AC-004 and **AC-012** pass as tests; a loader test proves a v12
  card declaring the flag with only a `swap_pieces` action is **accepted** and one with no relocation
  action is **rejected**; `royal-skill-immunity` is green **unmodified** and gains AC-012's arm; a
  `<= v11` fixture still loads and comes out with `lockRelocatedAfterPlay: false`; **and a v11
  fixture declaring `protectRelocatedAfterPlay: true` still reads back `true` after the bump** — the
  assertion that catches the widened-predicate mistake ADR-007 spells out.
- **Risk:** medium — the loader validation is where a flag most easily becomes inert, which is why
  both the accept and the reject case are named.
- **Rollback point:** Phase 1.
- **Status: DONE.** `tests/engine/relocation-lock.test.ts`, 14 tests. Full unit suite **146 files /
  1665 tests green**, `tsc --noEmit` clean. AC-001, AC-002, AC-004 and AC-012 all pass;
  `royal-skill-immunity` green **unmodified** apart from the mechanical flag addition every v12
  fixture needed.

  **Three things the phase surfaced that its scope did not anticipate:**

  1. **A FOURTH royal guard.** ADR-003 inventoried three; `candidatesFor` (`engine.ts:293`) is a
     fourth and the outermost — it drops royals from every choice slot, so a `chosen_friendly`
     relocation is never even OFFERED a royal target. SPEC AC-012's original wording ("plays the
     card naming that king") is unconstructible for that reason, so the test asserts the observable
     form instead: no offered play names the king, and no grant lands on its square. ADR-003's table
     is updated below.
  2. **`editor/io.ts` carried a DUPLICATE of the loader's normalization** (`<= 10`, injecting the
     two v11 fields) and it went stale the moment v12 landed — every pre-v12 document imported
     through the editor would be re-stamped v12 without the new field and then refused. That is
     `[fail:design] shared-vocabulary-unshared-code-path`, count 4, and the repair was to delete the
     copy: `normalizeSkillCard` is now exported from `load.ts` and both paths call it.
  3. **The editor needed a control, or the flag would be bundled-content-only.** `RecordForm` gained
     a checkbox beside its `protectRelocatedAfterPlay` sibling, `draft.ts` a default, `RecordGrade`
     a normalization, `ko.ts` a label. Without them an author could never set the flag, which is the
     declared-but-inert shape one layer up. The PLAN's non-goal forbids a redesign, not a checkbox.

  **AC-012's measured re-baseline (Risk 4).** `card-decisiveness.test.ts` moved and was re-measured
  rather than edited: same 600 seeds, every per-card `n` IDENTICAL to the 2026-08-09 run, so the
  card assignment did not shift — only the outcomes did. `knights-honour` 31%→44%, `royal-bodyguard`
  35%→44%, `conscription` 41%→34% (leaves the worst four), `last-stand` 37%→36% (enters it). The
  cause is the lock itself: relocation now costs the mover its move, so repositioning is no longer
  free tempo and material trades come slower. AC-012's own median and maximum are UNCHANGED
  (`self-play.test.ts` green), so this is a redistribution rather than a lengthening. No card's
  content was touched in this unit — the attribution Risk 4 demands is therefore clean, and Phase 5's
  blood-toll change will be measurable against this baseline rather than confounded with it.

#### Phase 2 — D.5 newly-reachable window

Mostly new-feature work; one repair, and the window is that repair's.

1. **The window.** Deleting `io.ts`'s duplicate normalizer makes **every pre-v12 document imported
   through the editor** reach code it could not: before, the copy stopped at `<= 10`, so a v11
   import was re-stamped to v12 with the new field missing and refused outright.
2. **The tests that enter it.** v1 via `preset-io.test.ts`'s round trip and v7 via
   `loadout-v8.test.ts` — both already existed and both went red, which is how the duplicate was
   found. **v11 had no fixture on the import path at all**, so this commit adds one: `brings a v11
   document up to v12 through the EDITOR import path too`.
3. **Absent case.** The normalizer activates on a declared `schemaVersion`; its absent case is
   `schemaVersion === null`, which `normalizeSkillCard` returns untouched. That is safe by
   construction here — `loadContentSet` already errors on a missing `schemaVersion` before any
   record is parsed, and `importContent` refuses a non-numeric one — so the null branch is
   unreachable from both callers rather than merely untested.

### Phase 3 — `block_capture` beneficiary (ADR-004)

- **depends_on:** `[2]`
- **parallel_group:** `serial-engine` — **runs after Phase 2**, so it retrofits every push site once.
- **merge_hazards:** `engine.ts`, `types.ts`.
- **Scope in:** `ActiveGrant.beneficiarySide` as a **required** field, populated at **all three**
  push sites — the authored action (`engine.ts:838-848`), the existing protect settlement
  (`:1107-1113`), and Phase 2's lock grant; the empty-square rule taking the event subject's side at
  `on_capture`; the `protectedSquares` filter reading the field.
- **Scope out:** `forbid_movement` and `grant_movement` consulting the field (Risk 6).
- **Exit criterion:** AC-005 passes with **both** arms — the same live grant, the same attacker,
  differing only in which side occupies the square; `tests/engine/capture-oracle.test.ts` still
  reports **zero** unexplained divergences; plus a named `sideInCheck` assertion, since "re-checked"
  is not a criterion: **a king standing on a `square.mist` grant earned on an EARLIER ply by an enemy
  piece is IN check, and the same king on a grant whose beneficiary is its own side is NOT** — the one
  observable case ADR-004 identifies, and it goes red if the filter is applied at only one of the two
  call sites. The grant must predate the ply under test: `settled` at `engine.ts:1155` omits
  `m.grants`, so a same-ply grant is invisible to the tally (Risk 12) and a fixture built that way
  would pass under any implementation.
- **Risk:** medium — `protectedSquares` is read by both move generation and check detection.
- **Rollback point:** Phase 2.
- **Status: DONE.** `tests/engine/grant-beneficiary.test.ts`, 8 tests. Full unit suite **147 files /
  1676 tests green**, `tsc --noEmit` clean, `capture-oracle.test.ts` still 9/9 with zero unexplained
  divergences. Delivered: `ActiveGrant.beneficiarySide` as a **required** field, populated at all
  three push sites; the empty-square fallback taking `runEvent`'s raw `subject` (threaded into
  `executeActions` as its own parameter, deliberately not `ctx.subject`); the drop rule scoped to
  `block_capture`; and the `protectedSquares` filter comparing occupant side to beneficiary.

  **Making the field REQUIRED did real work.** `tsc` named every remaining push site and every
  hand-built grant in the test suite — two engine sites and two test fixtures — instead of letting
  them default silently. That is the whole argument for required-over-optional in one line of
  evidence.

  **Mutation-verified, because two gates earlier in this task passed on tests that could not
  discriminate:**

  | Mutation | Expected red | Result |
  |---|---|---|
  | `protectedSquares` filter removed | AC-005 arm A + the check-detection arm | ✅ 2 failed |
  | beneficiary = caster instead of occupant | the enemy-protection card | ✅ 1 failed |
  | empty-square fallback = caster instead of event subject | both D.5 absent-case tests | ✅ 2 failed |

  **`card-decisiveness` did NOT move**, so the beneficiary fix is balance-neutral and Phase 2's
  re-baseline stands unconfounded.

#### Phase 3 — D.5 newly-reachable window

The user-reported defect, so the window is written down rather than reflected on.

1. **The window.** Two inputs newly reach code they could not. (a) A **capture of an enemy piece
   standing on a square whose live `block_capture` grant belongs to the other side** — that action
   was never generated before, so every position with a stale-cover square had a move the engine
   refused to see. (b) **Check detection through the same filter**: a king on an enemy-beneficiary
   grant is now in check where it previously was not, which can end a match that used to run on.
2. **The tests that enter it.** (a) `lets the enemy be captured on a square whose protection belongs
   to white`, with its one-bit control `still protects white on that same live grant`. (b) the two
   `sideInCheck` arms — deliberately cross-ply, because `settled` at the check tally is built
   without `m.grants` (Risk 12) so a same-ply fixture would pass under any implementation.
3. **Absent case — and it is SYSTEMATIC, not an edge.** The rule activates on "the occupant's side",
   whose absent case is an empty target square. At `on_capture` that is *always* the case: the
   victim is removed before the event runs. A naive fallback to the acting side would name the
   **capturer**, who then moves onto that very square and would be shielded by its victim's death —
   the exact inversion the rule exists to prevent. Covered by `names the VICTIM at on_capture`, and
   the card-`on_play` sub-case (no event subject at all) by `drops a block_capture whose square is
   empty`. Both go red when the fallback is changed to the caster.

### Phase 4 — `piece_kind_count_at_most` (ADR-005)

- **depends_on:** `[2]`
- **parallel_group:** `serial-schema`
- **merge_hazards:** `schema.ts` and `load.ts` with Phase 2 — Phase 2 owns `SCHEMA_VERSION`; this
  phase adds a field to a file already at v12. No hand resolution.
- **Scope in:** the condition in `schema.ts` and `effects.ts`; `editor/controls.ts:75` template;
  `SentenceSlot.tsx:304,313` side + numeric pickers and a new piece picker; `cost.ts:151` pricing
  case; `ko.ts:478` vocabulary label distinguishing it from `piece_count_at_most`.
- **Scope out:** any content using it (Phase 5); widening or touching `piece_count_at_most`.
- **Exit criterion:** AC-007's four rows (enumerated in the Technical Design) pass; **plus a named
  end-to-end drive in two arms** — `tests/ui/card-recipe-vocabulary.test.tsx` (new):
  1. build a **rule** card carrying the condition through the editor's own template
     (`editor/controls.ts`) and slot components, and assert the built record validates against the
     v12 schema. This is the shape Phase 5 actually ships (AC-008's pawn-wipeout is a rule card).
  2. build a **skill** card carrying the same condition and price it through
     `explainSkillCardCost` without throwing. `cost.ts` exports no rule-card pricing entry point,
     and arm 1 only builds and schema-validates — so without arm 2 the new `conditionBreadth` case
     (`cost.ts:145-164`) is never evaluated. (`effectCost` at `cost.ts:208` is card-kind-agnostic
     and reaches `conditionBreadth` for any `Effect`; `explainSkillCardCost` is simply the shipped
     path that gets there.)

  This is the obligation Risk 2 rests on; "an author can build it" is not a criterion, a test file is.
- **Risk:** medium — six consumers, and the failure mode of missing one is silence.
- **Rollback point:** Phase 2.
- **Status: DONE.** `tests/engine/piece-kind-count.test.ts` (8) and
  `tests/balance/kind-count-pricing.test.ts` (2), plus two additions to the existing
  `tests/editor/vocabulary-coverage.test.ts`. Full unit suite **149 files / 1688 tests green**,
  `tsc --noEmit` clean.

  **The end-to-end drive already existed and is stronger than the file this criterion asked for.**
  `tests/editor/vocabulary-coverage.test.ts` enumerates the vocabulary from the Zod schema and runs
  a per-entry probe that reaches the control in the rendered editor, authors the value, saves
  through the real validator and re-opens the document. Writing a new
  `card-recipe-vocabulary.test.tsx` beside it would have been a weaker second copy of a gate that
  is already permanent, so the new entry was added as a ROW there instead — which is also what
  makes the schema/controls/editor coupling ADR-006 describes stay a three-place edit rather than
  four. The exit criterion's arm 1 is met by that row; **arm 2 is a genuinely separate file**,
  because `conditionBreadth` is reachable only through the skill-card pricing path and the
  coverage row authors a rule card.

  **Two consumers turned out to be self-defending, and one did not.** `VOCABULARY_CONTROLS` throws
  at module load when a vocabulary entry has no maker (`controls.ts:141-146`), and `cost.ts`'s
  switch is exhaustive, so `tsc` named the missing pricing case by itself. Neither could have
  shipped silently. `SentenceSlot`'s three pickers had no such guard — those are the ones the
  mutation table below had to cover.

  | Mutation | Expected red | Result |
  |---|---|---|
  | `evalCondition` drops the kind filter (counts the whole side) | the golden table + the kind-vs-army test | ✅ 4 failed |
  | `cost.ts` prices it as the whole-army count | the narrower-than-sibling assertion | ✅ 1 failed |
  | `SentenceSlot` loses the piece picker | the coverage row | ✅ 1 failed |
  | cleared numeric field snaps to 1 instead of 0 | — | ❌ **96 passed** → test added, then ✅ |

  The last row is the useful one: `n ?? 0` was a defensive branch I added without a probe, and the
  mutation check caught that nothing defended it. The numeric slot is shared by four conditions and
  three of them are `positive()`, so a cleared field snapping to 1 would silently turn "none of this
  kind left" into "one left" with no way for the author to see it. Now pinned by `keeps a cleared
  count at zero for the kind-filtered condition`.

  **`piece_count_at_most` is untouched**, including its `positive()` bound, and a probe pins that
  `n: 0` on it is still a validation error — so a later "simplification" that merges the two
  conditions fails here rather than silently changing what the old one means.

#### Phase 4 — D.5 newly-reachable window

New-feature work, not a repair: no defect was fixed, so there is no window a repair opened. Stated
in one line rather than skipped silently, per the step's own instruction.

The nearest thing to an absent case is the **new condition's own zero row**, which is the entry's
whole reason for existing and is covered four ways: the golden table's `n=0` rows, the
kind-vs-army discriminator, the editor's cleared-field behaviour, and the `forEach` contrast that
measures *why* absence was previously unobservable rather than asserting it.

### Phase 5 — Content: cards and square types

- **depends_on:** `[1, 4]`
- **parallel_group:** `content`
- **merge_hazards:** `bundled.ts` (with 2, 6), `ko.ts` (with 4, 6), `art/registry.ts` and
  `art/pixels.ts`.
- **Scope in:** `rule.blood-toll` replaced by the two-ply freeze on the capturer; the new pawn-wipeout
  rule card; three square types (a movement-granting pad, a pawn-spawning post, an altar promoting
  whatever arrives to a knight); their art, names and texts; the AC-012 re-baseline if the card
  change moves the 6x6 median.
- **Scope out:** rebalancing any other rule card; the four unresolved suspects from
  `PLAN-capture-rules-and-art-fixes` Phase 6.
- **Exit criterion:** AC-006, AC-008 and AC-011 pass; `square-liveness.test.ts` drives all **eleven**
  square types and pins the inert branch of each new one; `card-liveness.test.ts` shows both new
  cards changing state against a no-card control; the 6x6 self-play median is restated in the test
  comment with its headroom said out loud, and no threshold was met by reverting a fix.
- **Risk:** high — this is where `metric-green-because-of-the-defect` recurs, and where a new square
  type ships inert.
- **Rollback point:** Phase 4.
- **Status: DONE.** `tests/engine/recoil-and-democracy.test.ts` (7), six new probes in
  `square-liveness.test.ts` (18 total), one in `card-liveness.test.ts` (68). Full unit suite
  **150 files / 1702 tests green**, `tsc --noEmit` clean.

  **Four content invariants pushed back, and each one changed the design rather than the test.**
  This phase was written expecting the engine to be the hard part; the content pipeline was.

  1. **`BASELINE_STAMP_IDS` is frozen and may not name a record the bundle no longer ships.** The
     replacement card was drafted as a new id, `rule.recoil`. It cannot be: the stamp is a snapshot
     of a past release and dropping `rule.blood-toll` from the bundle invalidates it. **The id
     survives a total change of identity** — name, text, art and effect are all new, the id is not.
     Written down on the record itself, because an id that lies about its content is a readability
     cost somebody will otherwise try to "fix".
  2. **A baseline-era record may not reference a post-baseline one.** `preset.default` is in the
     stamp, so adding `rule.democracy` to it broke the baseline slice's validation, and painting a
     v12 square type onto `board.los-alamos` broke it the same way. Both moved to post-baseline
     records: democracy ships on `preset.covenant`, and the three new squares are painted on
     `board.cavalry` / `board.bastion` / `board.covenant`. **Consequence worth stating: the flagship
     preset cannot gain new rule cards at all** until the baseline moves forward.
  3. **The art surplus must SURVIVE a feature** — "a surplus the next feature eats is not a
     surplus". Taking five ids from the spare pool dropped square art 10 → 7 and card art 30 → 29,
     both under their floors. **Five sprites were drawn** (`springboard`, `levy`, `altar`,
     `recoil`, `democracy`) and all five pass the 12x12 / palette / ≤60-rect / contrast gates
     first time.
  4. **Every bundled card must open as a sentence in the recipe view.** Democracy was drafted with
     TWO effects so it would be symmetric within one ply; `readSentence` reads one effect, so the
     card could not be opened at all. It is one clause now, matching `rule.duel`, and the cost is
     recorded on the record: the mirror case (a side losing its own last pawn) is decided one ply
     later, when the opponent's ply evaluates the same clause from the other end.

  **AC-012 re-baseline — and the direction is a design finding, not a defect.** `rule.blood-toll`
  went **20% → 42%** clock rate, mid-pack into third worst; same 600 seeds, same per-card `n`.
  Destroying the capturer removed material and shortened matches; freezing it removes a tempo and
  leaves the material standing, so captures now lengthen them. The author asked for this card to
  stop deleting their pieces — this is the price, stated rather than tuned away. `self-play.test.ts`
  (AC-012 median/max) is unchanged and green.

  ⚠️ **`rule.democracy`'s own decisiveness is UNMEASURED.** It ships on `preset.covenant` and
  `card-decisiveness.test.ts` surveys `BUNDLED_PRESET_ID` only. Recorded in the test file too.

#### Phase 5 — D.5 newly-reachable window

Content work with one repair inside it: the replacement card only works because Phase 1's deferral
exists, and getting `plies` wrong made it inert in a way the old card had already been inert for.

1. **The window.** Three inputs newly reach code they could not. (a) A capture under this rule card
   now leaves a **frozen piece standing on the destination** — a board state that could not occur
   before, since the old card removed that piece. (b) A side reaching **zero pawns** now ends the
   match, so every position with one pawn left is newly decisive. (c) Three square types put pieces
   through **`grant_movement` at `generate_moves`, a spawn, and a promotion** on squares that
   previously had none.
2. **The tests that enter it.** (a) `leaves the capturer standing, frozen` plus `actually stops the
   piece moving on the next turn` — the second matters because the first would pass on a
   `frozenUntil` entry move generation never reads. (b) the AC-008 block, with its
   second-pawn-standing boundary. (c) the six `square-liveness` probes.
3. **Absent case, and it caught a real one.** The freeze activates on a `plies` count whose absent
   case is "the window closes before the piece's own next turn". Drafted at `plies: 2`, it expired
   exactly as the capturer's turn began and **cost it nothing** — a card that reads as a tax and
   charges none, which is the same inert shape the card it replaces spent four months in. Caught by
   `actually stops the piece moving on the next turn`, fixed to `plies: 3`, and the card text was
   corrected in the same change so the number a player reads is the number the engine uses.
   The two square types with vacancy-dependent effects (`levy`) and identity-dependent effects
   (`altar`) each have their inert branch pinned and named in their card text, per the
   `square.geyser` precedent.

### Phase 6 — 8x8 board and preset (ADR-006)

- **depends_on:** `[5]`
- **parallel_group:** `content`
- **merge_hazards:** `bundled.ts` (with 2, 5), `ko.ts` (with 4, 5), `self-play.test.ts`.
- **Scope in:** the 8x8 board record with 32 placements and painted squares drawn from the eleven
  types; a preset naming its pieces, rule cards, skill cards and `loadoutBudget`; the report-only
  self-play test; the envelope check.
- **Scope out:** any `PLY_CAP` change; any threshold on the new preset's length; making the new
  preset the default.
- **Exit criterion:** AC-009 and AC-010 pass; the printed distribution is **read and written into
  this PLAN** as a measured table (the human control ADR-006 depends on); `npm run test` green; the
  preset starts a single-player match in the running app **on a fresh browser profile** (see the
  risk register — an install that has ever saved will not see it).
- **Risk:** medium — content volume, and the legibility question at ~21 px squares.
- **Rollback point:** Phase 5.
- **Status: DONE — and the measurement it required says the room does not resolve.**
  `tests/engine/grand-board.test.ts` (5) and a report-only arm in `self-play.test.ts`. Full unit
  suite **151 files / 1708 tests green**, `tsc --noEmit` clean.

  **The engine needed nothing**, which was the claim and is now measured: `board.grand` is 8x8 with
  32 placements and ten painted squares, and it plays without one line of engine change.
  `withinEnvelope` admits it, a knight reaches the h file, and the opening deals normally.

  **A 6x6 invariant was replaced rather than deleted.** `bundled.test.ts` asserted every preset is
  on a 6x6 board, and its own comment said why: "the AI's cost at other sizes is unmeasured, so no
  room may quietly introduce one". That was a PROXY. It now asserts `withinEnvelope(...).ok` for
  every preset — the measurement the proxy stood in for. The guard got stricter on the thing it
  cared about.

  **Four shipped rule cards are silently WRONG on eight ranks**, found while choosing the room's
  pool: `king-of-the-hill` and `harvest` name `CENTRE` (c3/c4/d3/d4), which is off-centre here;
  `fast-promotion` reads `on_own_rank: 5` and `beacon` reads `6`, both one-short-of-promotion and
  far-back-rank on SIX ranks only. Each still fires — just somewhere its own text does not
  describe. None is dealt by `preset.grand`, and the exclusion is pinned by a test rather than left
  to the next author to rediscover. Making them board-relative is a schema question and its own unit.

### ⚠️ Phase 6's measurement — the room does not resolve inside `PLY_CAP`

ADR-006 accepted that "a genuinely broken 8x8 preset ships green... the human reading the printed
table is the control". **The control fired.** 300 seeds, `preset.grand`:

| rule card | n | median plies | max |
|---|---|---|---|
| `rule.three-check` | 42 | **35** | 60 |
| `rule.tribute` | 52 | 60 | 60 |
| `rule.duel` | 46 | 60 | 60 |
| `rule.siege` | 46 | 60 | 60 |
| `rule.conscription` | 40 | 60 | 60 |
| `rule.blood-toll` | 39 | 60 | 60 |
| `rule.democracy` | 35 | 60 | 60 |
| **whole room** | **300** | **60** | **60** |

**199 of 300 matches (66%) end on the clock**, against 25% for the 6x6 set. Every rule card except
the fast check-counter has a median sitting exactly on `PLY_CAP`.

**The reading.** This is almost certainly the CAP rather than the room: 60 half-moves is 30 moves a
side, and the board carries 32 pieces instead of 24 across 64 squares instead of 36. There is not
enough clock to trade down. `rule.three-check` resolving at 35 supports that — it is the one card
that can win without material.

### Phase 6b — `PLY_CAP` 60 → 160 (author decision, 2026-08-13)

The author chose to raise the cap far enough for the 8x8 room to resolve, with the 6x6 baselines
re-measured. Scope-out on `PLY_CAP` is lifted by that decision and recorded here rather than
silently overrun.

**Chosen from measurement, not from a guess.** Both rooms were played out under a probe cap of 400
first, which left nothing unfinished (6x6 max 282, 8x8 max 368) — so these are natural lengths:

| | median | p75 | p90 | p95 | p99 | max |
|---|---|---|---|---|---|---|
| 6x6 | 42 | 66 | 92 | 117 | 160 | 282 |
| 8x8 | 87 | 126 | 170 | 206 | 319 | 368 |

Note what that already says: **60 was about the p72 of the 6x6 distribution**, so the clock was
deciding roughly a third of the "small" rooms' matches too. It was never only an 8x8 problem.

| cap | 6x6 on the clock | 8x8 on the clock |
|---|---|---|
| 60 | 31% | 66% |
| 120 | 4% | 27% |
| **160** | **1%** | **12%** |
| 200 | 0% | 5% |

**160 is the knee.** The 8x8 room is decided by play in about seven matches in eight, and the cap
stays a real bound. 200 buys seven points on a room that already resolves, makes the cap inert at
6x6, and costs a quarter more search per self-play run.

**The 8x8 room at the new cap** (300 seeds): median **87**, max 160, **12%** on the clock, nothing
unfinished. Per card: `three-check` 35 · `conscription` 84 · `duel` 91 · `democracy` 92 ·
`siege`/`tribute` 99 · `blood-toll` 100. Compare the pre-raise table above, where every card except
`three-check` sat exactly on 60.

**6x6 re-measured, and both baselines moved:**

- **AC-012 median 36 → 40** over the same 1000 seeds, and the bound moved 40 → **45**. The rise is
  not content drift: a third of these matches used to be truncated at 60 and scored on material,
  and their real lengths are now counted — the typical match did not get longer, it stopped being
  measured short. At exactly 40 the assertion had **zero headroom**, which is the state
  `[fail:test] metric-green-because-of-the-defect` was recorded for; 45 gives five plies of margin
  while staying far under the p75 of 66, so a set that genuinely started dragging still fails.
- **The decisiveness survey changed what it ranks.** Cap rates collapsed to 0–4%, so ordering by
  them sorts noise; it now ranks by median plies, which still separates the set from 22 to 58. The
  SUSPECTS list is re-derived accordingly. That is a change to what the test measures, made because
  the measurement said the old signal was gone.
- Three fixtures in `win-condition.test.ts` had hard-coded `plyCount: 59` and `ply 60`. They read
  `PLY_CAP` now — they were the only place in the suite that named the value, which is why they
  were the only ones that broke.

### ⚠️ A deadlock the raise exposed — and it was Phase 5's card, not the cap

Raising the cap made **3 of 1000** 6x6 self-play seeds report *unfinished*, which is the opposite of
what a bigger budget should do. They were not running out of budget: `legalActions` returned an
**empty list** — the side to move had no move, no playable card, and no `end_turn`, so the match
simply stopped. A human would have been looking at a board that accepts no input.

All three were under `rule.blood-toll` with 9–14 frozen squares. **Phase 5's freeze-the-capturer
card creates positions where a side's last two or three pieces are all frozen**, and the engine had
no rule for that. The old ply cap was killing those matches at 60 before they could be reached, so
the defect shipped hidden inside a different one.

**Fixed at the generator.** ADR-003 offered the forced pass only while a card was pending, and its
objection to anything wider was exact — "a pass available with no card pending is a way to skip your
turn outright". That objection does not reach a side with **no** legal action: there is nothing to
skip. `legalActions` now returns `[end_turn]` when the mover has neither a move nor a playable card,
and `describeRejection` was updated in the same change so the two agree — otherwise `apply` would
reject the very action the generator had just offered. Pinned by `does not leave a fully frozen side
with no action at all`.

**Cost recorded:** the unit suite went from ~40 s to ~110 s wall-clock. Self-play now plays matches
to their real length instead of truncating a third of them at 60.

#### Phase 6 — D.5 newly-reachable window

New-feature work with no repair, so no window a repair opened. The nearest thing is the **board-size
axis itself**: every engine path that reads `state.width`/`state.height` is newly reachable at a
value other than 6. Covered by the h-file move test (address arithmetic round-tripping a letter no
6x6 room emits), the 32-placement load, the envelope score, and the opening-deal test. The absent
case — a preset whose board is neither 6x6 nor 8x8 — is not special-cased anywhere, which is the
point: nothing branches on size, so there is no absent case to define.

## 🧪 Testing Strategy

**Unit (vitest).** One suite per phase, written RED first. New files:
`tests/engine/relocation-lock.test.ts` (AC-001, AC-002, AC-004 + the ADR-001 ordering pin),
`tests/ui/card-recipe-vocabulary.test.tsx` (Phase 4's end-to-end vocabulary drive), and a
grant-ownership block in the existing capture suite (AC-005). Extended files:
`royal-skill-immunity.test.ts` (AC-012), `vocabulary-v3.test.ts` or a v12 sibling (AC-007),
`win-condition.test.ts` (AC-008), `ai-complexity.test.ts` (AC-009), `self-play.test.ts` (AC-010),
`square-liveness.test.ts` and `card-liveness.test.ts` (AC-006, AC-011).

**The controls that make the assertions mean something**, stated because
`[fail:test] control-arm-is-not-a-control` is recorded here: AC-005's control is the *same* live
grant with the *owner* standing on the square, not an absent grant. AC-008's control is the identical
capture with two pawns on the board. AC-011's control is the same ply on an **unpainted** square, and
each new type's inert branch must be placed where the correct behaviour is provably nothing.
AC-012's control is the *same card played with a non-royal target*, so "nothing happened" is
distinguished from "the card is broken". AC-013's reference implementation is **teleport**, which the
change does not touch. `royal-skill-immunity` is the pre-existing control for ADR-003 and must not be
edited — under ADR-003 there is no exception for it to admit.

**Integration.** `npm run test` green at every phase exit; `capture-oracle.test.ts` re-run at Phase 3
and Phase 6 (a new board is new geometry for it).

**Manual.** On a **fresh browser profile**: start the 8x8 preset in single-player; teleport a piece
and confirm it cannot be moved again that turn; swap two and confirm neither can; teleport the king
and confirm the same; walk a piece onto each new square type.

## ⚠️ Risks & Mitigation

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| 1 | Phase 1's reordering breaks a suite in a way that is "fixed" by editing the suite | medium | high | Phase 1's exit criterion names five suites that must be green **unmodified**. Editing one is a phase failure, not a pass. |
| 2 | A new square type or the lock flag ships inert | medium | high | `[fail:design] declared-but-inert-vocabulary` count 7. Phase 4 and Phase 5 exit criteria both require an end-to-end drive from real content, and Phase 2's requires the swap-acceptance and no-relocation-rejection cases explicitly. |
| 3 | `/hm:execute` widens `mayAffect` (`engine.ts:707-711`) to make a royal-relocation test pass, quietly reversing ADR-003 | medium | high | ADR-003 states the three-guard inventory and SPEC AC-012 asserts the **opposite** of the withdrawn AC-003 — a widened `mayAffect` fails AC-012 rather than passing silently. Phase 2's exit criterion requires `royal-skill-immunity` green **unmodified**. |
| 4 | **Two** changes move the 6x6 AC-012 median at once — the blood-toll replacement and ADR-008's swap cascade | high | medium | Expected and legitimate; re-baseline per `PLAN-capture-rules-and-art-fixes` ADR-003. **Attribute them separately** in the test comment (Phase 1 lands the swap change, Phase 5 the card change, so the median can be read after each) or the metric lesson is lost — a single combined delta cannot say which direction either change pushed. Never meet the threshold by reverting a fix. |
| 5 | `beneficiarySide` changes `sideInCheck` and therefore `rule.three-check` | medium | medium | Bounded by ADR-004 to exactly one observable case (a king on a live `square.mist` grant), because `engine.ts:55` already drops skill-layer grants on royals. Phase 3's exit criterion names that case as an assertion rather than saying "re-checked". |
| 6 | **Known open sibling, deliberately unfixed:** `forbid_movement` and `grant_movement` remain occupant-blind, so your own pin can catch a friendly piece that later steps onto the square | high | low | Recorded here and in ADR-004's scope note. The field exists, so closing it later is a one-line change. Not fixed because the SPEC scoped the report to protection. |
| 7 | **The v12 bump discards saved author content**, and the new preset is invisible to any install that has ever saved | high | medium | `[fail:design] saved-blob-forks-shipped-content`. A bump is currently the only thing that un-freezes a stored blob, and it does so by **discarding** the author's work (`App.tsx:37`). Out of scope to fix; Phase 6's manual check runs on a fresh profile so the preset is not falsely reported broken, and the phase notes must state the discard so it is a decision rather than a surprise. |
| 8 | The 8x8 preset ships balanced badly and passes green | medium | medium | ADR-006 accepts this. The control is a human reading the printed table, which Phase 6's exit criterion requires to be written into this PLAN. |
| 9 | 12x12 sprites at ~21 px squares fail the contrast gate | medium | medium | `[fail:test] measured-the-artifact-not-the-rendering` — re-measure at rendered CSS size over the real background on a percentile, not by assumption. Surfaced at Phase 6; a failure here is a legibility finding, not a rules failure. |
| 10 | **Known scope boundary:** ADR-001's settlement covers `freeze_piece` only, so a card targeting `mover` with `block_capture` / `forbid_movement` / `grant_movement` still writes to the vacated square | low | medium | Deliberate. Deferring all four write kinds would ship three of them with no content driving them and no test pinning them — `[fail:design] declared-but-inert-vocabulary`, count 7, which this PLAN names as its governing risk. No shipped or planned content does this. Widening is one line the day a card needs it, and ADR-001 says so in its Decision rather than implying coverage. |
| 11 | ADR-008's swap cascade turns `skill.swap` into a way to destroy your own piece on a bomb square, with no card-text change | medium | low | Intended; the card text already says only what it moves, and the same is true of `skill.teleport` today. Surfaced as SPEC AC-013 so it is measured, and it is the first thing to re-read if playtest reports "swap killed my piece". |
| 12 | **Pre-existing defect found while planning, deliberately out of scope:** a ply's check tally cannot see any grant created during that ply | high | low | `settled` at `engine.ts:1155` is `{ ...state, board: m.board, frozenUntil: m.frozenUntil }` — it carries the new board and freezes but not `m.grants`, so `sideInCheck` reads the pre-ply `state.grants`. A card that protects a king therefore does not stop that ply's check from being tallied. **Not fixed here**: it predates this task, it belongs to `rule.three-check`'s semantics rather than to anything in this SPEC, and fixing it would change check counts across the shipped set with no measurement budgeted. It is recorded because ADR-004's bound and Phase 3's fixture both depend on knowing it. |
| 14 | **Pre-existing declared-but-inert case, found by Phase 1's D.5 probe:** a skill card whose only `on_play` action targets `mover` validates, is offered, plays, and does nothing — `mover` is not a choice slot, so the card takes no targets and `ctx.subject` is null | low | medium | Instance 8 of `[fail:design] declared-but-inert-vocabulary`. Not introduced by this task and not fixed here (the remedy is a loader rejection or a new target kind, both out of scope). Pinned by `queues nothing when a card names 'mover'` so it is visible rather than latent, and so the settlement work is not later blamed for it. |
| 13 | E5 iterating the subject set dereferences an emptied square and throws | medium | high | ADR-008 requires the `!` assertions at `engine.ts:1089`/`:1097` to become guards and the set to be filtered by occupancy **at E5 time**. AC-013's preconditions exclude this case, so Phase 1 owns a dedicated fixture where endpoint b's `on_enter` destroys the piece on endpoint a. |

## ✅ Success Criteria

- [x] AC-001 — a teleported piece contributes no move for the rest of the ply
- [x] AC-002 — both swapped squares are locked, and the loader accepts `swap_pieces` for the flag
- [x] AC-003 — **withdrawn** 2026-08-13 (ADR-003); replaced by AC-012
- [x] AC-012 — a relocation card naming a royal changes nothing: board, grants and moves all equal
      the no-card control
- [x] AC-013 — a swapped piece enters the square it arrives on, both endpoints, matching teleport
- [x] AC-004 — a lock that leaves nothing mobile yields exactly `end_turn`
- [x] AC-005 — protection applies to its beneficiary's side only, both arms
- [x] AC-006 — the capturer is frozen **at its destination** and is not destroyed. Shipped at
      `plies: 3`, not the two this line first claimed: at 2 the freeze expired exactly as the
      capturer's own next turn began and cost it nothing (Phase 5's D.5 absent case)
- [x] AC-007 — the new condition's four-row golden table, including n=0
- [x] AC-008 — the match ends on the last pawn and not on the second-to-last
- [x] AC-009 — `withinEnvelope` admits the 8x8 preset; the bundle loads
- [x] AC-010 — the 8x8 distribution is reported, covers every declared rule card, asserts no threshold
- [x] AC-011 — all eleven square types drive live, and each new one's inert branch is pinned
- [x] `npm run test` green with no pre-existing assertion relaxed
- [x] Phase 6's measured table written into this PLAN

## 🔍 Plan Validation

**Pass 1 — `plan-validator`, 2026-08-13: MAJOR_REVISION.** 3 critical, 6 warning, 2 suggestion.
Ledger: `mlrc-20260813-1`, `.claude/observability/stage-agents.jsonl`.

| Severity | Finding | Resolution |
|---|---|---|
| critical | AC-003 unreachable — `mayAffect` (`engine.ts:707-711`) blocks skill-layer relocation of royals, gating both `teleport_piece` and `swap_pieces` | **Verified against the code, then put to the author (Interview #2).** AC-003 withdrawn, AC-012 added, ADR-003 rewritten with the three-guard inventory. |
| critical | Reporting swap endpoints makes `cascadeEnter` fire for them — a behaviour change ADR-001 called a no-op; `subjectSquare` from a set was undecided | **Verified, then put to the author (Interview #3).** ADR-008 added; `subjectSquare` = last surviving endpoint, E5 iterates the set, E7 stays single-subject. AC-013 added to the SPEC. |
| critical | The settlement slot was underspecified on the move branch (the check tally and E7 sit between E6 and `royalTransition`), so Phase 1's ordering test was unwritable | Technical Design now names all neighbours for both branches with line numbers, states the two consequences chosen, and Phase 1's test asserts against the two neighbours that can actually move. |
| warning | The royal carve-out's discriminator was named but never defined | Moot — ADR-003 removed the carve-out, so no discriminator exists. Stated explicitly so it is not re-added. |
| warning | `beneficiarySide`'s empty-square fallback is the *systematic* case at `on_capture` and would hand protection to the killer | ADR-004 now derives per creation site (three named), and the empty-square rule takes the **event subject's** side, dropping the grant if there is none. |
| warning | Phases 2/3/4 shared files across two `parallel_group`s with no stated order | A binding total order heads the Implementation Plan; Phase 3 `depends_on: [2]`, Phase 4 `depends_on: [2]`, and Phase 3 owns the `beneficiarySide` retrofit of all three push sites. |
| warning | Phase 3's "`sideInCheck` is re-checked" and Phase 4's "an author can build it" are not checkable | Both replaced with named assertions: the king-on-mist check case, and `tests/ui/card-recipe-vocabulary.test.tsx`. |
| warning | ADR-001's third caller was stated generally but only `freeze_piece` has a consumer — the PLAN's own declared-but-inert instance | ADR-001 narrowed to `freeze_piece` explicitly; Risk 10 records the boundary. |
| warning | "AC-007's four-row golden table" cited an artifact not in `SPEC.md` | **Partly incorrect** — the four rows are in `SPEC-…machine.yaml` AC-007 `golden_table`, which the validator did not read. Rows are now restated in the Technical Design so the criterion is judgeable from one file. |
| suggestion | ADR-005's Context cited AC-008 where it meant AC-007 | Fixed. |
| suggestion | `untilPly = plyCount + 1`'s correctness is unstated and a reader may "fix" it to +2 | The arithmetic is now written into ADR-002. |

**Pass 2 — `plan-validator`, 2026-08-13: MAJOR_REVISION.** 1 critical, 5 warning, 2 suggestion.
The pass verified all 11 pass-1 findings as genuinely resolved in the document (not merely claimed in
the table above), and every new finding is against material pass 1 could not have seen.

| Severity | Finding | Resolution |
|---|---|---|
| critical | Phase 1's ordering test was unsatisfiable: the two "consequences" justifying it are both false against the code — no condition kind reads `frozenUntil`, `sideInCheck` does not either, and `settled` (`engine.ts:1155`) omits `m.grants` so a ply's tally cannot see that ply's grants at all | **Verified.** The Event ordering block now states both corrections explicitly and derives what settlement's position *does* change: E7 can destroy the subject, so the guard drops the write. Phase 1's test reduced to **one** arm (the E7 arm) with a fixture `end_of_ply` card that destroys the mover. The stale-grants reading is recorded as Risk 12, a pre-existing defect deliberately out of scope. |
| warning | E5 iterating the subject set hits unguarded `m.board.get(sq)!` (`:1089`, `:1097`) with a mutation window (endpoint b's cascade, the `m.arrived` loop) in between; `on_promote` also doubles | ADR-008 now requires occupancy filtering **at E5 time** and turns both `!` into guards; the `on_promote` frequency change is recorded. Risk 13 added, with a Phase 1 fixture AC-013's preconditions cannot reach. |
| warning | ADR-004's "take the event subject's side" is unavailable at the push site: `executeActions` sees `ctx.subject` = `bound.boundSubject ?? subject`, which under `forEach` is the bound piece, and on the card path is the caster's first chosen target | The mechanism is now named — `runEvent`'s raw `subject`, threaded in as a new argument, explicitly *not* `ctx.subject` — and the per-site table gained the card-`on_play` row, where there is no honest fallback and the grant is dropped. |
| warning | The "drop the grant" rule would silently delete `forbid_movement` / `grant_movement` grants over a field those kinds never read | Drop rule scoped to `block_capture`; the other two record the acting side and are kept. |
| warning | Phase 4's pricing arm is unwritable — `explainSkillCardCost` takes a `SkillCardDef` and `cost.ts` exports no rule-card pricing | Split into two arms: a rule card validated against the v12 schema, and a skill card priced through `explainSkillCardCost` so `conditionBreadth`'s new case is actually driven. |
| warning | ADR-007's "normalize `<= 11`" reads as widening the existing predicate, whose defaults spread **last** — that would reset every v11 document's `royalFollowUp` and `protectRelocatedAfterPlay` with no validation error | ADR-007 now shows the two-branch code and states the trap; Phase 2's exit criterion gained a v11 fixture declaring `protectRelocatedAfterPlay: true` that must read back `true`. |
| suggestion | The royal-grant skip was cited as `engine.ts:54` three times; it is line 55 | Fixed — in **four** places, not three; pass 3 found the fourth in Current State. |
| suggestion | The Codex skip paragraph appeared twice | Fixed — one copy, below. |

**Pass 3 — `plan-validator`, 2026-08-13: NEEDS_REVISION → resolved.** The author authorized one pass
past the 2-pass cap for the single purpose of verifying the pass-2 fixes; scope was narrowed to those
eight findings and the ledger row carries the reason (`--pass 3 --reason`), so an operator-authorized
extra pass is distinguishable from a stage that ignored its own limit.

**All eight pass-2 fixes verified correct against the code** — the four event-ordering claims, the
`runEvent`-subject threading, the two-branch normalization, the E5 guards and `on_promote` doubling,
Phase 4's arm 2, and Risk 12. Three residual text defects, all fixed:

| Severity | Finding | Resolution |
|---|---|---|
| warning | ADR-004's supporting inventory said "all three duration-bearing grants"; the bundle has **ten** — the same partial-inventory defect as pass 1's critical, in miniature | Replaced with the complete list (ten cited by line), and the three `block_capture` ones the drop rule can actually touch named separately. The conclusion was correct; the evidence for it was sampled, not audited. |
| suggestion | The `:54` → `:55` fix covered three of **four** occurrences | Fourth fixed in Current State; the pass-2 row above corrected to say four. |
| suggestion | "`conditionBreadth` is reachable only through the skill-card path" is false — `effectCost` (`cost.ts:208`) is card-kind-agnostic | Reworded. The operative conclusion (arm 1 alone leaves the case undriven) was true and is unchanged; only the reason was wrong. |

**Cap and its overrun, recorded.** The procedure allows two passes; a third ran on explicit operator
authorization. All three rounds of fixes were applied in full; no finding is carried as accepted
risk, and the two defects this PLAN keeps (Risks 12 and 13) have owners rather than waivers.

**The recurring lesson, stated once.** Across three passes the defects were overwhelmingly of one
kind: a decision that was right, resting on a justification that diverged from the code — a partial
guard inventory, two false claims about what reads what, a sampled grant list. Every one survived my
own re-reading and was caught by reading the source. That is the same shape as `[fail:test]
control-arm-is-not-a-control` and it is why this PLAN cites line numbers rather than describing
behaviour.

**Cross-model second opinion:** `codex` — **skipped**. The Side preset gate runs enabled models only
on a high-diff change; at plan time the working tree is clean (`git diff HEAD` → 0 files, 0 added
lines) and `hm high_diff classify` returned `{"boundary": false, "is_high": false, "reasons": []}`.
Both verdicts above are Claude-only.
