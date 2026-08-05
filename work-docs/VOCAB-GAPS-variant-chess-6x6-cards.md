---
type: vocabulary-gaps
task_slug: variant-chess-6x6-cards
phase: 3
created: 2026-08-05
plan: "[[PLAN-variant-chess-6x6-cards]]"
status: open
summary: "Expressiveness limits found while authoring the Phase 3 vertical slice"
---

# Vocabulary gaps — PLAN Phase 3 vertical slice

PLAN Phase 3 exit criterion (c). Authoring a playable variant out of nothing but
the Phase 1 vocabulary is the cheapest way to find out what that vocabulary
cannot say. The slice was **not blocked** by any of the items below — every one
of them had a workaround — but each workaround costs something a content author
would have to know about, which is exactly what this list is for.

Severity is about what it costs to leave the gap open, not about how hard it is
to close.

---

## G-1 — A skill card can never fire during a board move (criterion wording, not a schema gap)

**Severity:** none — the criterion was written before the trigger table existed.

The PLAN's Phase 3 exit criterion (a) asks for "at least one reachable **move**
[that] fires all four pipeline layers at once". ADR-003's trigger-availability
table makes that structurally impossible: `skillEffect` accepts only `on_play`,
so no board move can ever resolve a layer-4 effect.

**Resolved by:** meeting the criterion at the granularity of one **ply**.
`tests/engine/layer-order.test.ts` drives a single ply that resolves
`on_play:skill` → `on_enter:square` → `on_enter:piece` → `end_of_ply:rule`, and
asserts both the log sequence and a board outcome that only that order produces.
The criterion's intent — actually exercising ADR-002's ordering rather than
merely finishing a match — is met in full.

**No schema change.** The PLAN's wording should be corrected to "ply".

---

## G-2 — Card-driven movement bypassed the entry pipeline

**Severity:** high — silently made one content kind mean something different from another.

`apply`'s card branch ran the card's actions and went straight to E6/E7. A
`teleport_piece` on a **card** therefore put a piece on a square without ever
firing that square's `on_enter`, while the identical action on a **square type**
or a **piece passive** did. A warp was the one way to walk onto a hostile square
unharmed, and no card author could have seen that from the schema — the two
actions are the same word in the same vocabulary.

**Fixed in this phase** (`src/engine/engine.ts`): the E4 cascade was extracted to
`cascadeEnter` and both branches go through it, as does E5 promotion. Pinned by
`tests/engine/layer-order.test.ts` ("runs the same square pipeline for a board
move as for a card-driven move").

**No schema change** — this was an interpreter bug, not missing vocabulary.

---

## G-3 — An effect cannot compare the subject to its own owner

**Severity:** medium — blocks a whole natural class of piece passive.

`condition: piece_side` compares the subject to the **mover**, never to the
effect's owner. There is no way to write "when an **enemy** piece enters" or
"when one of **my** pieces is captured" as a piece passive, because the owner's
side is known to the engine (`BoundEffect.ownerSide`) but not reachable from the
condition grammar.

**Workaround used:** the archer's volley fires on *anything* entering the
contested square, keyed by `on_square` rather than by allegiance. That reads as a
property of the board, not of the piece — which is not what was intended.

**Candidate extension (ADR-005):** a `subject_is_owners` / `subject_is_enemy_of_owner`
condition, or a `relativeTo: 'mover' | 'owner'` field on the existing
`piece_side`. Shape should be decided by Phase 6a, where the full card set is
specified on paper and will say how often this is actually needed.

---

## G-4 — A square-type effect cannot reference its own square

**Severity:** medium — couples reusable content to one board.

`destination` offers `paired_square`, `chosen_empty`, a **literal** `square`, and
`own_back_rank`. There is no "N squares from here" and no reference to the square
the effect is attached to. So a square type that means "throw the occupant
forward two" cannot be written; only "throw the occupant to d4" can.

The same limit hits piece passives from the other direction: the archer's volley
hardcodes `on_square: ['c3']`, so `piece.archer` is no longer portable to a board
without a c3 beacon.

**Workaround used:** `square.beacon` hardcodes `to: { kind: 'square', square: 'd4' }`
and the volley hardcodes `c3`. Both work and both are board-specific.

**Candidate extension (ADR-005):** a `{ kind: 'offset', df, dr }` destination
resolved against the effect owner's square, plus an `on_own_square` condition.
Interacts with G-3 — both are "the effect cannot see its own owner".

---

## G-5 — A layer-2 effect fires once per piece instance, against a global subject

**Severity:** medium — correctness depends on the action being idempotent.

`collectEffects` yields one `BoundEffect` per (piece on board × matching effect),
but `evalCondition` sees a single event-wide subject. A passive whose condition
does not mention its owner therefore fires once **per instance of that piece on
the board**. With four archers, the volley resolves four times against the same
square and writes four identical log lines.

`destroy_piece` is idempotent so the slice is correct today. `spawn_piece`,
`freeze_piece` with accumulating duration, or any future counter would not be.

**Workaround used:** none needed — the slice's only layer-2 action is idempotent.

**Candidate resolution:** either scope layer-2 collection to the owner (which
G-3/G-4 would make expressible) or declare a once-per-(event, source) rule in
ADR-002. This is a **correctness** question, not a convenience one, and should be
settled before Phase 6a authors status-effect cards.

---

## G-6 — `spawn_piece` does not enter the square it spawns onto

**Severity:** medium — the same asymmetry G-2 fixed, one action over.

Now that card-driven `teleport_piece` cascades through E4, `spawn_piece` is the
remaining action that puts a piece on a square without entering it. `skill.rally`
can drop an archer directly onto a beacon or a bomb square with no effect firing.

**Not fixed in this phase.** Unlike G-2 it was not needed to satisfy any Phase 3
exit criterion, and changing it needs its own reviewed test rather than a
drive-by edit. It belongs with the Phase 6a items, which is where creation
effects get authored in bulk.

---

## G-7 — `check_count_at_least` is declared but inert

**Severity:** low for now, blocking for one known card.

Carried forward from Phase 2. The condition parses and validates, but the engine
has no check-counting, so it evaluates `false` — a card relying on it never fires
rather than silently reading as true. **A Three-Check rule card cannot be
authored** until check counting exists.

---

## G-8 — A preset needs at least six skill cards to open both drafts

**Severity:** none once documented; it was a deadlock before.

Not a vocabulary gap — an engine absent case the slice was the first content to
reach. AC-005 fixes an offer at three distinct cards and AC-006 requires the
second offer to be disjoint from the first, so a preset with fewer than six skill
cards cannot open a second draft. `bumpTurns` previously produced an **empty**
offer in that case, which still gated board play while yielding no `draft_pick`:
a match with no result and no legal action.

**Fixed in this phase:** a pool that cannot fill an offer opens no offer at all.
Pinned by `tests/engine/slice-match.test.ts` and by an in-loop deadlock guard
over 25 seeds of self-play.

**Content rule for Phase 6b:** a shippable preset carries ≥ 6 skill cards.

---

---

# Phase 6a update (2026-08-06)

Writing the whole 28-card set down (`CARDSET-variant-chess-6x6-cards.md`) found six more gaps and
closed five of the originals. **Only 6 of 28 cards were expressible** against the vocabulary as it
stood — the headline finding of the gate.

## Closed in Phase 6a (schema v2, ADR-005)

- **G-5** — closed by *decision*, written into ADR-002 Amendment 3: a piece-layer effect fires once
  per owning piece, owner-relative targets bind to that piece. No behaviour change; the semantics
  stopped being accidental.
- **G-6** — `spawn_piece` and the new `revive_piece` now enter their destination square through the
  same E4 cascade as movement. Pinned by the revive-onto-a-bomb-square fixture.
- **G-7** — check detection landed. `check_count_at_least` reads a real per-side counter, and a royal
  standing on a `block_capture`-protected square is **not** in check.
- **G-9** *(new, then closed)* — `forEach` binds each matching piece as an ownerless effect's owner
  and subject. Unblocks R4, R5, R6, R11, R14, S10.
- **G-12** *(new, then closed)* — `own_back_rank` resolves to the first vacancy on the **owning
  piece's** home rank, not the mover's.
- **graveyard** — `GameState.captured` retains removed pieces; `revive_piece` consumes it. A card
  that would resolve to nothing is no longer offered at all.

## Still open, with the card that forces each

| Gap | What is missing | Forced by |
|---|---|---|
| G-3 | an effect cannot compare the subject to its **own owner's** side | any "when an *enemy* piece does X" passive |
| G-4 | no destination relative to a square (`offset`), and no reference to the effect's own square | S13 밀치기 |
| G-13 | no condition over a side's piece count | R11 최후의 저항 |
| G-14 | no swap action; two teleports cannot express it (each needs its destination empty) | S2 자리바꿈 |
| **G-15** | `grant_movement` / `forbid_movement` / `block_capture` are consumed at E1 only, so a **skill card** carrying them is a silent no-op — and `skillEffect` accepts all nine actions | S3 방패, S8 기사의 도약, S10 돌진 |
| G-16 | no adjacency constraint between two chosen targets | S11 희생 |

**G-15 is the one to fix next.** Three of the nine actions are unusable from the content kind most
likely to want them, and the schema advertises all nine — an author gets a card that validates,
draws, plays, and does nothing. It is the same failure shape as G-7 and G-12, which this phase closed,
and it is currently the largest remaining instance of it.

## Escalated as scope decisions, not tasks

Three ranked items are **needs-subsystem** — each is a new engine capability, not content:

- **S3 방패** — replacement effects that persist across turns.
- **S9 장벽** — a card painting a square at runtime, with a duration.
- **R3 오리** — a third, neutral side plus path blocking.

And four are **recommended cuts** from the MVP set, because they sit outside the content vocabulary
by design (ADR-001 admits no code hook): R12 속공 턴 and S4 연속 이동 (turn structure), R13 반쪽 안개
(view redaction), R7 합체와 분리 (two pieces on one square).

---

## Disposition against the exit criterion

The PLAN says "Any gap found is applied to the Phase 1 schema under ADR-005
*before* Phase 4 begins."

- **G-1, G-2, G-8** — closed in this phase; no schema change is owed.
- **G-3, G-4, G-5, G-6, G-7** — **deferred to Phase 6a, which is a deviation from
  the literal criterion and needs a call from the user.**

The reason for proposing the deferral: none of the five blocked the slice, and
their *shape* is genuinely undetermined. Phase 6a's first deliverable is the
complete card set specified on paper, which is what says whether G-3 needs a new
condition or a field on the existing one, and how often G-4's offset destination
is really wanted. Extending the schema now would be guessing at that shape, and
ADR-005 makes every guess a `schema_version` bump plus the ADR-006 editor
round-trip obligation.

The risk this accepts is bounded by the PLAN's own text: Phase 4's UI is declared
schema-generic, and the PLAN already accepts Phase 6a reopening
`src/content/schema/**` while Phase 4 runs. G-5 is the one to watch — it is a
correctness question, and it must be settled before 6a authors status-effect
cards, not merely before Phase 5.
