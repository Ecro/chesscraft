---
type: research
task_slug: movement-lock-8x8-and-rule-cards
status: complete
created: 2026-08-13
tags: [chess-craft, research, typescript, game-rules, content-schema, engine]
mtime_warn_days: 7
libs_fetched: []
sources: []
related_docs:
  - "[[PLAN-same-turn-skill-move-balance]]"
  - "[[PLAN-capture-rules-and-art-fixes]]"
  - "[[REVIEW-capture-rules-and-art-fixes-2026-08-09]]"
  - "[[REVIEW-same-turn-skill-move-balance-2026-08-11]]"
summary: "Six asks split three ways: four are content edits, one reuses the v11 relocation hook, one needs engine surgery"
---

# RESEARCH — Movement lock, 8x8 board, new square types, rule cards, capture defects

## 🎯 Recommended Direction

**Split the six asks by the layer they actually land on, and do NOT plan them as one unit.** Four
of them (`8x8` board, extra square types, the `rule.blood-toll` replacement, and a
`piece_count_at_most`-shaped `민주주의`) are pure content edits inside a vocabulary that already
expresses them. One (relocation lock) is a **schema v12 sibling of the v11
`protectRelocatedAfterPlay` flag** and lands at the exact resolution point that flag already
computes. Only one — `민주주의` in the strict reading the user gave it ("you lose only when every
non-king piece is captured") — requires touching the royal-capture short-circuit, which is the
single highest-blast-radius change in the engine.

The rationale is the cost gradient: the relocation lock costs one schema field and ~20 lines
because `skill.quake` already paid for the "final surviving square after the full cascade" plumbing
(`PLAN-same-turn-skill-move-balance` ADR-003). Strict `민주주의` costs a change to **two** independent
royal-loss paths plus the AI evaluation and every royal-adjacent test. Those two do not belong in
the same phase.

**On the capture bug: the code says the previously-reported instance was already root-caused and
closed, so the remaining report needs a fresh cause, and there are two concrete candidates below.**
Do not re-open the move generator — `tests/engine/capture-oracle.test.ts` measured **zero** unexplained
divergences over ~480 sampled positions.

## 🔍 Refinement Decisions

`--deep` not set; Phase 0 and Phase 0.5 skipped.

**Discovery lens:** Technical architecture / implementation (primary), plus rule/game design for
the two content-authoring asks. The user-workflow lens is not engaged: every ask names an existing
mechanism in this repo by its behaviour, so the binding constraint is what the schema and engine
already express, not how players work. No external lens — no third-party library is involved and
the rules vocabulary is entirely local.

## 🛠️ Approaches Found

### Ask 1 — Relocated piece may not move on the same turn

The turn is `[play_card?] → move` (`types.ts:88-100`). `skill.teleport` and `skill.swap` relocate a
friendly piece and the mover *still owes a move*, so today the relocated piece can be moved again.
The user wants that piece excluded from the owed move.

Two facts make this cheap. First, `forbid_movement` already exists as both an action
(`schema.ts:279`) and a persisted `ActiveGrant` (`types.ts:31-42`), and `movesFor` skips any square
in `mods.forbidden` (`engine.ts:146`). Second, the v11 work already computes "the relocated
subject's final surviving square, after the full `on_play` execution and the complete `cascadeEnter`
chain" for `protectRelocatedAfterPlay` — that is the same hook, with `block_capture` swapped for
`forbid_movement`.

| Field | A — `lockRelocatedAfterPlay` schema flag (sibling of v11) | B — Engine-wide rule: any square a card wrote to is locked | C — Content-only: add `forbid_movement duration:1` to each card |
|---|---|---|---|
| Approach | v12 boolean per skill card; after cascade, attach `forbid_movement` grant with `untilPly = plyCount + 1` to the subject's final square | `transition` diffs board occupancy across the card and forbids every changed square for the rest of the ply | Author the action into `skill.teleport` / `skill.swap` in `bundled.ts` |
| Assumption | Cards opt in individually, matching how `royalFollowUp` was decided card-by-card (ADR-002/003) | The player reads "a card moved it" as one uniform rule | The existing target grammar can name the piece the card just moved |
| Evidence | `schema.ts:434` + the v11 dispositions table already establish the per-card precedent; `mayAffect`/cascade resolution exists | No such diff exists today; `movesMadeLastPly` (`types.ts:104`) is the only occupancy-derived field and it is a count | **Contradicted**: `resolveTarget` targets resolve at declaration time against pre-cascade squares. `square.portal` (`bundled.ts:303`) teleports again on entry, so the authored square is not where the piece ends up |
| Trade-off | One more field every authored card must set; loader normalization for `<= v11` | Erases card identity — the same objection that killed the blanket ban in ADR-002 | Free until a portal or geyser is on the board, then silently wrong |
| Compatibility | Highest — reuses the v11 resolution point verbatim | Low — would have to re-derive what the v11 flag already knows | Medium at authoring, low at runtime |
| Risk | low | high | medium (silent) |

**Two gaps A must close, both real:**

1. **Swap has two subjects.** The v11 grammar for `protectRelocatedAfterPlay` is validated as
   "exactly one unquantified, unconditional `teleport_piece` action whose target resolves to at most
   one piece, and no other relocation action" (ADR-003). `swap_pieces` fails that check by
   construction. The user named 자리바꿈 explicitly, so the grammar must widen to cover
   `swap_pieces` (locking both squares) or the flag will validate-and-do-nothing on the card the
   user cares most about — the declared-but-inert shape this repo has recorded five times.
2. **A relocated king would not be locked.** `generationModifiers` skips any skill-layer grant whose
   square holds a royal: `if (grant.layer === 'skill' && occupant royal) continue`
   (`engine.ts:54`). That guard exists so a card cannot freeze the king, and it would also void a
   lock on a teleported king. Either the lock needs a carve-out from royal skill-immunity, or
   `skill.coronation`/`skill.recall`-style king relocation stays exempt — a decision for `/hm:plan`,
   not an accident.

A third, benign consequence: locking the only mobile piece leaves the mover with no legal move, and
`legalActions` already answers that with the `end_turn` escape hatch (`engine.ts:499`). No new work.

### Ask 2 — Replace `rule.blood-toll`

`rule.blood-toll` (`bundled.ts:557`) is one `on_capture` effect that destroys the capturer. Its
measured profile is **not** the problem: 20% of its matches ended on the clock against a 25% set
baseline, median 38 plies (`PLAN-capture-rules-and-art-fixes` Phase 5 table, 600 seeds, 2026-08-09).
It sits mid-pack. So this is a fun complaint, not a balance defect, and the replacement should be
judged on decision density rather than on the cap rate.

The set's own evidence says what "fun" measures as here: `rule.duel` decided **100%** of its
matches at a median of 22 plies, and its whole content is one `end_of_ply` +
`piece_count_at_most` + `win` (`bundled.ts:610`). `rule.blitz` (2% clock, median 21) is the other
end of the same shape.

Replacement candidates fully expressible in today's vocabulary (`schema.ts:215-300`):

- **A payoff on capture rather than a tax.** `rule.tribute` already spawns a pawn on capture; the
  inverse-of-blood-toll is `on_capture → promote_piece` on the capturer, i.e. taking a piece
  upgrades the taker. Expressible: `target: { kind: 'mover' }`, `promote_piece` (`schema.ts:258`).
  Same trigger, opposite valence, one clause.
- **A capture that pays the victim's owner.** `on_capture → revive_piece` for `opponent`
  (`schema.ts:290`), which consumes the graveyard rather than conjuring — the comeback mechanic
  the schema comment says `revive_piece` exists for.
- **A capture that must be re-earned.** `on_capture → freeze_piece` on `mover` for 2 plies
  (`schema.ts:271`). Preserves blood-toll's "captures are expensive" identity without deleting the
  piece, which is the part the user found unfun.

What the grammar **cannot** say, and therefore what to not promise: there is no `on_capture`
condition that reads the *victim's* value or the capturer's identity relative to it, so
"only cheap pieces pay" is unauthorable without a schema addition. `Condition` has no cost or
piece-comparison kind (`schema.ts:215-233`).

### Ask 3 — An 8x8 board

The schema imposes **no** upper bound on board size — `width`/`height` are only
`z.number().int().positive()` (`schema.ts:444-445`), and placement validation is derived from them
(`schema.ts:464`). The match renderer is already size-agnostic:
`gridTemplateColumns: repeat(${state.width}, 1fr)` and rank/file arrays built from `state.height` /
`state.width` (`MatchHost.tsx:1002-1003, 1201`). `inBounds` reads state (`engine.ts:102`); slide
distance defaults to `Math.max(state.width, state.height)` (`engine.ts:123`). All five shipped
boards are 6x6 (`bundled.ts:1196, 1214, 1231, 1246`).

So this is a content record plus a preset, not an engine change. Three couplings do move, and two
of them are load-bearing:

- **AI complexity envelope — fits, with headroom.** `total = boardArea * maxPieceReach +
  maxCardCombos + declaredActions * boardArea`, bound 20,000 (`complexity.ts:71, 137`). The shipped
  6x6 preset scores 3,024 = 36x48 + 36². At 8x8 the two-slot card ceiling alone becomes 64² = 4,096
  and the move term roughly 64 x ~64, putting the total near **8k** — under the bound. *(Inference
  from the formula; not measured. `withinEnvelope` is the cheap way to confirm before authoring.)*
  A **three**-slot card would be 64³ and blow it — but it already blows it at 6x6 (46,656), so
  nothing changes.
- **`PLY_CAP = 60` is a hard global** (`engine.ts:29`), and `materialResult` decides on piece count
  when it fires (`engine.ts:908`). A bigger board with more material takes longer to resolve, so an
  8x8 preset is the most likely thing in this batch to end on the clock.
- **AC-012 measures `BUNDLED_PRESET_ID` only** (`self-play.test.ts:44`) — currently median 36
  against a cap of 40, four plies of headroom. A new preset therefore does **not** break AC-012, and
  that is the hazard, not the relief: an 8x8 preset would ship entirely unmeasured. `[fail:test]
  metric-green-because-of-the-defect` and the repo's five recorded declared-but-inert instances both
  point the same way — extend the self-play measurement to the new preset, or state in the PLAN that
  it is deliberately unmeasured.

The unmeasured risk is **legibility, not rules**. Board squares render around 28 px at 6x6 on
mobile; at 8x8 in the same frame they fall to roughly 21 px, against 12x12 palette-cell sprites
(`pixels.ts`) and a contrast gate that `[fail:test] measured-the-artifact-not-the-rendering` says
must be re-measured at rendered CSS size, not assumed.

### Ask 4 — More square types

Eight ship today: `bomb`, `portal`, `shrine`, `sanctuary`, `mire`, `geyser`, `thorns`, `mist`
(`bundled.ts:273-424`). They use four of the available triggers and a narrow slice of the action
vocabulary, so headroom exists without any schema change. Unused-in-squares combinations that are
already expressible: `grant_movement` with a duration (a square that lends geometry),
`forbid_movement` (a square that pins whoever stands on it), `spawn_piece` /
`revive_piece` on entry, `on_leave` as a trigger (nothing uses it today), and `on_own_rank` /
`piece_count_at_most` as conditions.

Two authoring constraints that are recorded rather than obvious, both from `square.geyser`'s comment
(`bundled.ts:352-372`): a square effect has **no `cardResolves` gate**, so an effect that cannot
apply fires and silently does nothing; and every branch must be pinned by
`tests/engine/square-liveness.test.ts`, both the applying and the inert one. Each new square type
also needs an `artKey` that passes the `gates.ts` sprite admission rules.

### Ask 5 — `민주주의` rule card

The user's rule: *you lose only when every non-king piece is captured.* Read strictly, that removes
king-capture as a loss condition, and **king capture is not a card-level rule in this engine — it is
hardcoded in two places**:

1. `transition`'s royal short-circuit, which returns a terminal state immediately and by design lets
   "no later event or layer resurrect the king, destroy the capturing piece, or award a competing
   win" (`engine.ts:982-1003`).
2. `royalTransition`, which catches royal removal by card or square effect and awards the win or a
   draw (`engine.ts:1220-1231`).

| Field | A — Content-only, `piece_count_at_most n:1` | B — Schema v12 `royalCapture: 'ends-match' \| 'ordinary'` on rule cards |
|---|---|---|
| Approach | `end_of_ply` + `piece_count_at_most { side: 'opponent', n: 1 }` + `win { side: 'mover' }` — exactly `rule.duel`'s shape with n=1 | Rule card declares that royals are ordinary pieces; both royal-loss paths consult it |
| Assumption | "Down to the king alone" is close enough to what the player wants | The user meant the strict reading — the king stops being a target |
| Evidence | `rule.duel` proves the shape works (`bundled.ts:610`, 100% decisive). `n` must be ≥ 1 — `z.number().int().positive()` (`schema.ts:243`) — and n=1 with a live king is exactly "all soldiers gone" | Both paths are unconditional today; nothing reads content to decide them |
| Trade-off | King capture still ends the match first, so the clause is a *shortcut*, not a replacement — in practice it fires rarely, because the losing side's king is usually taken before it stands alone | Blast radius: the two paths above, plus `hasRoyal`, royal skill-immunity (`engine.ts:54`), `sideInCheck` and `rule.three-check`, the AI evaluation, and every royal-adjacent test |
| Compatibility | Perfect — no schema or engine change | Requires v12 + loader normalization, same machinery as v11 |
| Risk | low, but likely to disappoint | high |

**This is the one ask where the user's answer changes the work by an order of magnitude**, which is
why it is the first open question below.

### Ask 6 — "Sometimes a capture that should happen doesn't" / "capture range misbehaves"

**Start from what is already settled.** `PLAN-capture-rules-and-art-fixes` Phase 3 built a
differential oracle that reads `MovePattern` independently of `movesFor` and compared them with all
content effects stripped: *"there is no move-generation defect. UNEXPLAINED divergences = 0"* over
120 seeded matches / ~480 sampled positions (`tests/engine/capture-oracle.test.ts`, 9 tests), with
`tests/ui/capture-highlight.test.tsx` asserting the board's `data-legal` marks equal `legalActions`
in both directions. The originally reported instance was **`square.sanctuary` on a4** — a
`block_capture` the player was never told about — and Phase 4 closed it as a *legibility* defect by
replacing prose with a `RejectionReason` code union including `target-protected` / `piece-frozen` /
`piece-forbidden` (`engine.ts:561-600`, `ko.ts:683-686`).

So a still-live report needs a cause introduced **after 2026-08-09**, or one the oracle's control
arm cannot see. Three candidates, ranked:

1. **The v11 `preserve-existing` royal follow-up filter (landed 2026-08-11, commit `ace9fd9`).**
   While a card is pending, royal captures are legal only when their exact `from>to` key was in
   `royalCaptureBaseline` — the set computed *before* the card resolved (`engine.ts:492-502`).
   **18 of 24 bundled skills carry `preserve-existing`** (`bundled.ts`, 18 occurrences vs 6
   `preserve`). Because the key is exact, a teleport or swap that moves the attacker changes
   `from`, so a king capture the player can plainly see is refused. This matches "sometimes"
   precisely: it can only bite on a turn where a card was played. It is **working as designed** per
   ADR-002 — the question for the user is whether the design is what they want, not whether the code
   is wrong. There is a message for it (`royal-followup-blocked`, `ko.ts:686`); whether it actually
   reaches the player at the moment it bites is the thing to verify on screen.
2. **`block_capture` grants are keyed by square and never re-checked against the occupant.**
   `executeActions` pushes `{ kind, square, untilPly }` with no side and no piece
   (`engine.ts:830-851`), and `generationModifiers` adds that square to `mods.protectedSquares`
   regardless of who is standing on it (`engine.ts:57`). Square-keying is a **declared** choice
   (`types.ts:31-42`) and it is correct for freeze, where a lingering effect is a penalty the next
   occupant inherits. For `block_capture` it inverts: `square.mist` grants three plies of protection
   on entry (`bundled.ts:411-424`), the protected piece walks away, an **enemy** piece steps onto the
   square, and it is now uncapturable. Best fit for "capture range misbehaves", and unlike (1) this
   is a defect rather than a policy.
3. **Piece definitions with a separate `attack` set.** When `def.attack` is defined, movement
   patterns yield quiet moves only and captures come solely from `attack` (`engine.ts:157-166`) —
   and `mods.granted` patterns are merged into `movement`, so a card that grants geometry to a piece
   with a separate attack set grants *movement only*. `piece.archer` is the shipped instance. Reads
   exactly as "the capture range is not what the piece says it is". Whether it is a defect or the
   documented model is a design question; `PLAN-capture-rules-and-art-fixes` ADR-008 already says
   "moves but never captures" stays inexpressible and the editor should say so where it happens.

## ⚠️ Pitfalls

- **Declared-but-inert is this repo's most-recurring failure — five recorded instances.** The two
  shapes at risk here are named above: a `lockRelocatedAfterPlay` flag whose validation grammar
  excludes `swap_pieces` (the card the user asked for), and an 8x8 preset that no self-play
  measurement covers. `[fail:design] absent-case-is-a-feature-black-hole` (global CLAUDE.md,
  2026-06-08) is the same rule: a feature that activates on an optional field must define the absent
  case explicitly.
- **A control that keeps piece passives and painted squares is not a control for a geometry claim.**
  The capture oracle's first draft stripped only the rule card and fired immediately on content that
  was behaving correctly (`capture-oracle.test.ts` header comment, and `[fail:test]
  control-arm-is-not-a-control`). Any new capture investigation must strip *every* effect or it is
  measuring the paint.
- **Do not fix a card to move a metric.** `[fail:test] metric-green-because-of-the-defect`. AC-012
  sits at median 36 against a cap of 40 — four plies of headroom — and the Phase 6 write-up records
  that repairing a dead win condition moved the median **down** by four. Any blood-toll replacement
  or new preset will move it in an unpredictable direction, and re-baselining is legitimate while
  reverting a correct fix to keep a number green is not.
- **`piece_count_at_most` has no n=0.** `z.number().int().positive()` (`schema.ts:243`). Any
  "everything is gone" clause must be written as ≤1 with a live king, or the schema must change.
- **Royal skill-immunity is a silent veto on skill-layer grants** (`engine.ts:54`). Any new
  skill-sourced grant aimed at a king does nothing, with no error and no log line.
- **Perceptual gates must be re-measured at rendered CSS size, over the real background, on a
  percentile** (`[fail:test] measured-the-artifact-not-the-rendering`). Shrinking squares from 6x6
  to 8x8 changes exactly the edges where this board's contrast lives.
- **Two royal-loss paths, not one.** A `민주주의` that patches only the move short-circuit
  (`engine.ts:997`) still loses the match to a card or a bomb square that removes the king, via
  `royalTransition` (`engine.ts:1229`).

## ❓ Open Questions

1. **`민주주의` — strict or shortcut?** Strict ("the king is no longer a target; you lose only when
   every other piece is gone") needs schema v12 plus both royal-loss paths and touches the AI
   evaluation. The shortcut (`piece_count_at_most n:1` + `win`, zero engine change) means king
   capture still usually ends the match first. **This decides whether Ask 5 is a one-line content
   edit or an engine phase.**
2. **Is the `preserve-existing` royal follow-up rule (2026-08-11) itself the "capture bug" the user
   is reporting?** If yes, this is a re-decision of ADR-002, three days old, not a fix. If no, the
   most likely defect is the square-keyed `block_capture` grant, and the two want different phases.
3. **Does the relocation lock apply to a relocated king?** Royal skill-immunity currently voids it
   (`engine.ts:54`). Carve-out, or kings exempt from the lock?
4. **Does the lock cover both halves of a swap?** Locking one square makes the card half-safe and is
   the more surprising rule of the two.
5. **Does the 8x8 board get its own preset (pieces, rule cards, skill cards, `loadoutBudget`), or
   does it re-point an existing preset?** A preset is the unit `withinEnvelope`, `self-play`, and
   the AI all read; a board alone is not playable.
6. **What replaces `rule.blood-toll` — the payoff, the comeback, or the freeze shape?** All three
   are one clause in today's vocabulary; the choice is identity, not feasibility.
7. **How many new square types, and does any of them need a trigger nothing uses yet (`on_leave`)?**
   Count drives the art and `square-liveness` work more than the engine work.

## 📚 Sources

No external sources. Every claim above is grounded in this repository; no third-party library,
framework, or specification is involved in any of the six asks, so no Context7 lookup or web search
was warranted.

## 🔗 Related Internal Docs

- [[PLAN-same-turn-skill-move-balance]] — ADR-002 (`royalFollowUp` per-card policy, exact
  `from>to` baseline) and ADR-003 (the 24-card disposition table and
  `protectRelocatedAfterPlay`'s post-cascade resolution point). The direct precedent for Ask 1 and
  the origin of candidate (1) under Ask 6.
- [[PLAN-capture-rules-and-art-fixes]] — Phase 3 (the capture oracle and its zero-divergence
  result), Phase 4 (the `RejectionReason` union), Phase 5 (the 600-seed rule-card decisiveness
  table used above), Phase 6 (the AC-012 re-baseline, 40 → 36).
- [[REVIEW-capture-rules-and-art-fixes-2026-08-09]] and
  [[REVIEW-same-turn-skill-move-balance-2026-08-11]] — the review rounds that closed both.
- [[CARDSET-variant-chess-6x6-cards]] and [[PLAN-preset-content-expansion]] — prior content-authoring
  passes; the precedent for how a new preset is scoped.
- `[wiki:architecture] card-legibility-and-notice-stack` — `cardPlays.ts` derives "was a card played
  and what did it touch" from `match.states` as a pure function, and its `impacted` set is the union
  of a live-effect key change **and** a board-occupancy change. A relocation lock is an effect-state
  change, so the banner and impact rings pick it up for free; a lock implemented as anything other
  than a grant would be invisible there.
- `[wiki:architecture] piece-info-affordances` — `usePressInspect` and the four-state hint bar; the
  surface where a `royal-followup-blocked` or `target-protected` message has to actually land for
  Ask 6's legibility half to be closed.
