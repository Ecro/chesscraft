---
type: research
task_slug: custom-piece-skill-balance
status: complete
created: 2026-08-08
tags: [chess-craft, research, typescript, zod, content-vocabulary, game-balance, ugc]
mtime_warn_days: 7
libs_fetched: []
sources:
  - https://www.sjgames.com/knightmare/kc_rules.pdf
  - https://www.sjgames.com/knightmare/kc_intro.html
  - https://en.wikipedia.org/wiki/Knightmare_Chess
  - https://store.steampowered.com/app/1064340/Chess_Evolved_Online/
  - https://steamah.com/chess-evolved-online-the-definitive-army-building-guide-rated-6000/
  - https://lichess.org/@/ubdip/blog/finding-the-value-of-pieces/PByOBlNB
  - https://www.schemingmind.com/home/journalarticle.aspx?article_id=184
  - https://arxiv.org/pdf/2105.01115
  - https://arxiv.org/pdf/2503.24099
related_docs:
  - "[[SPEC-variant-chess-6x6-cards]]"
  - "[[RISK-RANKING-variant-chess-6x6-cards]]"
  - "[[VOCAB-GAPS-variant-chess-6x6-cards]]"
  - "[[CARDSET-variant-chess-6x6-cards]]"
  - "[[PLAN-variant-chess-6x6-cards]]"
summary: "Constrain-then-price: hard authoring caps at load time first, budget second, self-play advisory last"
---

# RESEARCH — bringing a self-made piece and a self-made skill into a match without breaking it

## 🎯 Recommended Direction

**Constrain first, price second, measure last.** Make a player-created record legal for a duel
by *restricting what it may say* (a duel-legal profile enforced inside `loadContentSet`, not in
the editor form), then layer the already-declared `cost` field on top as a soft budget, and
treat random self-play as an advisory signal only — never as the gate.

Rationale: the content vocabulary is a closed declarative grammar with no code escape hatch
(`src/content/schema.ts:11-14`), so a *structural* restriction is total and cheap — it cannot be
argued with, cannot be gamed by a clever combination, and needs no tuning. A numeric budget is
the opposite: it is a guess that has to be re-guessed every time the vocabulary grows, and the
grammar contains actions no price can domesticate (`win` ends the match; `royal: true` decides
what losing even means). The empirical route is real and already half-built — `playOut`
(`src/engine/agent.ts:68`) plus the 1000-seed harness in `tests/engine/self-play.test.ts` — but
its agent is *uniform-random by construction* (`src/engine/agent.ts:19-24`), so it measures the
content's shape, not what a competent player can do with it. It will clear a card that is only
broken in skilled hands.

Two structural facts decide the shape of the work more than the balance question does, and both
are stated below before the approaches: **a per-side skill loadout is not expressible today**,
and **the editor form is not a security boundary**.

## 🔍 Refinement Decisions

`--deep` was not set; no Phase 0 interview ran.

**Discovery lens:** primarily *technical architecture / implementation* (what the schema, loader
and match setup can and cannot express), with *risk* as a second lens (what an author can do that
the current validator permits). The *user-workflow* lens was applied narrowly — the artifacts a
player already maintains here are local, not third-party, so the mapping is small:

| Local capability (exists today) | User artifact it already touches | What the balance gate can reuse it for |
|---|---|---|
| `loadContentSet` full-document validation on every save (`src/editor/draft.ts:173`) | the author's whole content document in `localStorage` | the single choke point every authored record already passes through |
| `cost` number field in the record form (`src/ui/RecordForm.tsx:1235`) | the card the author is editing right now | a budget input the author already sees and already fills in |
| JSON export/import (`src/editor/io.ts`, AC-015) | a file the author hands to another device or person | the bypass path — anything enforced only in the form is absent here |
| `playOut` + 1000-seed statistical harness | none (test-only today) | an advisory "this piece ended 87% of games in 12 plies" badge |

## 🛠️ Approaches Found

### Two blocking structural facts

**(1) Asymmetric skill loadouts are not expressible.** `presetDef` carries one flat
`skillCardIds` array (`src/content/schema.ts:454`), and `createMatch` draws *both* sides' draft
offers from that one pool: `const offersFor = (side: Side) => pickDistinct(rngFor(seed, 'draft',
side, 0), preset.skillCardIds, DRAFT_OFFER_SIZE)` (`src/engine/match.ts:56`). The seed substream
differs per side; the **pool does not**. So "I bring my skill, you bring yours" has nowhere to
live — it needs either a schema bump (per-side pools on the preset) or a match-level loadout
parameter that sits outside the content document.

A custom *piece* is different: `boardDef.placements` already carries a `side`
(`src/content/schema.ts:407-413`), so an asymmetric army is expressible **today** by painting
one board with different back ranks per side. Piece and skill are therefore not one problem —
the piece half is a content-authoring task, the skill half is a schema/API change.

**(2) The editor form is not a boundary.** `commitDraft` runs the whole document through
`loadContentSet` — deliberately "the same validator the game loads with, not a lenient
editor-side copy" (`src/editor/draft.ts:12-16`). That is the correct hook. But AC-015 requires
export/import round-tripping, and `io.ts` accepts any document declaring a known
`schemaVersion`, so a hand-edited JSON never sees a form control. **Any cap enforced only by a
UI control is absent for imported content** — the same absent-case shape recorded as the
most-recurring failure in `.claude/memory/failures.md`.

### Approach A — Duel-legal profile (structural restriction at load time)

| Field | Content |
|---|---|
| Approach | A named validation profile ("duel-legal") applied to records flagged as player-created: a whitelist of actions/targets/conditions plus hard numeric caps (movement vector count, `maxDistance`, `uses`, `plies`, `duration`), and an outright ban on `win`, `royal`, `revive_piece`, `spawn_piece`. |
| Assumption | Power is bounded by *expressiveness*, and the grammar is small enough (7 targets, 5 destinations, 10 conditions, 10 actions) to whitelist by hand. |
| Evidence | The grammar is closed by design — "no generic 'do arbitrary thing' action" (`src/content/schema.ts:12-14`). `enumerateVocabulary()` (`src/editor/vocabulary.ts:39`) already derives the full kind list from the Zod schemas, so a profile can be checked for coverage the same way `tests/editor/vocabulary-coverage.test.ts` checks the editor's. |
| Trade-off | Blunt. A whitelist forbids a combination that would have been fine, and the author gets "you may not use this" instead of "this is too strong". Creative ceiling drops. |
| Compatibility | Highest. Fits `loadContentSet`'s existing fail-closed, located-error contract (AC-011), needs no new subsystem, and works identically for saved and imported documents. |
| Risk | low |

### Approach B — Point budget on the declared `cost` field

| Field | Content |
|---|---|
| Approach | Give `cost` a meaning: derive a *computed* cost from the record's shape (attacked-square count for movement, a price per action kind, multipliers for duration/uses) and refuse a record whose computed cost exceeds a cap. Add `cost` to `pieceDef`, which lacks it entirely. |
| Assumption | A single scalar can order these records well enough to separate "spicy" from "broken". |
| Evidence | Direct prior art, and the schema already names it: `cost` is annotated "Balance budget, in the Knightmare Chess sense. **Unused by the MVP engine**" (`src/content/schema.ts:381`). Knightmare Chess prices cards 2–10 and builds a 150-point deck per player, with an explicit handicap dial ([rules PDF](https://www.sjgames.com/knightmare/kc_rules.pdf)). Chess Evolved Online runs the same idea on *pieces* — every unit has a supply cost and an army must fit a supply limit ([Steam](https://store.steampowered.com/app/1064340/Chess_Evolved_Online/)). For movement value specifically there is a published closed-form estimate for pure jumpers, `33N + 0.69N²` centipawns in N attacked squares ([lichess, ubdip](https://lichess.org/@/ubdip/blog/finding-the-value-of-pieces/PByOBlNB)), which maps directly onto `movePattern.vectors`. |
| Trade-off | Every price is a guess that ages. Worse, it is *ordinal on a single axis*: two 6-cost records can combine into something neither is, and a scalar cannot see that. |
| Compatibility | Medium. The field, the editor control and the author's mental model already exist — but wiring it means `cost` must stop being author-declared and start being derived, or authors will simply type `0`. |
| Risk | medium |

### Approach C — Empirical self-play gate

| Field | Content |
|---|---|
| Approach | On save (or on entering a duel), run N `playOut` matches of the custom record against a baseline preset and gate on win-rate band and median ply count. |
| Assumption | A uniform-random agent's outcome distribution correlates with human-play brokenness. |
| Evidence | The machinery exists and is proven at 1000 seeds in CI (`tests/engine/self-play.test.ts`), including the per-rule-card breakdown table that names *which* card carries a tail. But `agent.ts`'s own docstring is explicit about what it measures: it "shares no code with move generation or evaluation … so the match lengths it produces are a property of the CONTENT, not of an evaluator" (`src/engine/agent.ts:19-24`) — a property, deliberately, and not a skill measurement. External work on this is uniformly *stronger* than a random agent: evolved evaluation functions for CCG balance ([arXiv 2105.01115](https://arxiv.org/pdf/2105.01115)), RL-driven asymmetric balancing ([arXiv 2503.24099](https://arxiv.org/pdf/2503.24099)), and for chess variants, self-play from materially imbalanced positions with a real engine ([SchemingMind](https://www.schemingmind.com/home/journalarticle.aspx?article_id=184)). |
| Trade-off | The strongest form needs an actual playing agent, which the SPEC lists as a **non-goal** ("AI opponent … not a playable opponent", SPEC line 197). The weak form is affordable but blind to skill-dependent brokenness. Also a latency problem: 1000 seeds is a test-suite budget, not an interactive one. |
| Compatibility | Medium as an advisory badge, low as a gate. |
| Risk | high (as a gate), low (as a report) |

### Recommended composition

A → B → C, in that order and with decreasing authority:

1. **A is the gate.** Fail-closed, at `loadContentSet`, with the same located-error shape as AC-011.
2. **B is the dial.** A derived `cost` shown in the editor, and a per-side budget for the duel loadout, so the answer to "why can't I?" is a number the author can trade against rather than a wall.
3. **C is a report.** The self-play distribution surfaced as a badge on the record ("ended 87% of test games within 12 plies"), phrased as information. It is also the only one of the three that can catch the *opposite* failure — a card that does nothing.

Note this is informational; `plan` makes the binding call.

## ⚠️ Pitfalls

- **Extending `cost` without an interpreter re-creates the project's most-recurring failure.**
  `cost` is today the textbook case of `[fail:design] declared-but-inert-vocabulary` (count:5): it
  validates, the editor writes it (`src/ui/RecordForm.tsx:1235`), and *nothing reads it*. The rule
  that entry records is that every vocabulary entry needs either an end-to-end test driving it from
  real content, or an explicit rejection at validation time saying it is not available yet. A
  "duel-legal" flag or a `budget` field added ahead of its enforcement is instance #6.
- **Enforcing in the form only.** `io.ts` imports any document declaring a known `schemaVersion`
  and AC-015 requires the round-trip to work. A cap living in a React control is absent on the
  import path — the absent-case black hole already recorded in the global corrections log.
- **A scalar budget cannot price `win` or `royal`.** `win` is an ordinary action in the shared
  vocabulary by explicit decision (ADR-012, `src/content/schema.ts:268-269`), and `royal: true`
  on a `pieceDef` redefines the loss condition. These are bans, not prices — no cost number is
  high enough, because a 6×6 board with a 60-ply cap makes a one-shot win effect strictly
  dominant.
- **A random-agent win-rate clears skill-dependent breakage.** Stated by the source itself
  (`src/engine/agent.ts:19-24`). Anything gated on it should be labelled as a smoke test.
- **"Too weak" is the more likely failure, and a power gate is blind to it.** The card-liveness
  survey drove all 26 shipped cards from hand-built positions and found **4 broken, from 3 root
  causes** — and critically, 3 of the 4 *did* change state, just the wrong state, so a
  did-anything-happen probe cleared two of them
  (`tests/engine/card-liveness.test.ts`, `[fail:design]` 2026-08-07 entry). A player-authored
  record inherits every one of those traps. If the author's audience is children (the delete-flow
  copy in `src/editor/draft.ts:190` is written for one), a card that silently does nothing is a
  worse outcome than a card that is a bit strong.
- **Hot-seat has no owner boundary.** SPEC non-goals rule out online play, accounts and
  community sharing (lines 196-201). Both players share one `localStorage` document and one
  editor, so "my piece" is not owned by anyone — player 2 can edit player 1's piece between
  matches. Any threat model stronger than "co-operative players want a fair game" is unbuildable
  without a boundary that does not exist.
- **Balance is a declared non-goal in the current SPEC** (line 208: "Cards must be schema-valid
  and playable; they are not required to be competitively balanced in the MVP"). This work
  reverses that for a scoped subset. It needs a new SPEC/AC, not a quiet reinterpretation of the
  old one.

## ❓ Open Questions

1. **Where does the per-side loadout live?** Schema v8 with per-side pools on `presetDef`, or a
   match-setup parameter passed to `createMatch` outside the content document? The first makes a
   loadout exportable and inspectable; the second keeps the content vocabulary from growing a
   session concept. `plan` must pick one — every downstream design depends on it.
2. **Threat model: co-operative or adversarial?** If the answer stays "hot-seat, players trust
   each other", an advisory warning is sufficient and Approach A can be a soft profile. If
   imported JSON from a stranger is in scope, the gate must be fail-closed at
   `loadContentSet`. These produce materially different implementations.
3. **Ban list.** Are `win`, `royal`, `revive_piece` and `spawn_piece` off-limits for
   player-created records, or merely expensive? Recommendation is ban, but it is a design call.
4. **Who is the author?** If the target is children, a numeric budget may communicate nothing and
   a "pick 3 of these 8 powers" construction may do the same job with no arithmetic. This changes
   the *surface* of A and B, not their mechanism.
5. **What does "not overpowered" mean concretely as an AC?** A win-rate band from self-play, a
   cost ceiling, or purely the structural caps? Only the third is deterministic and CI-cheap.
6. **Cost of an in-browser playout.** Unmeasured. 1000 seeds runs in CI; the interactive budget
   (and whether it needs a Web Worker) is unknown and should be measured before C is scoped at all.

## 📚 Sources

- Knightmare Chess rules PDF (deck point budget, per-card cost, handicap dial) — https://www.sjgames.com/knightmare/kc_rules.pdf
- Knightmare Chess introduction (Steve Jackson Games) — https://www.sjgames.com/knightmare/kc_intro.html
- Knightmare Chess (Wikipedia) — https://en.wikipedia.org/wiki/Knightmare_Chess
- Chess Evolved Online (Steam) — custom pieces with supply cost under an army supply limit — https://store.steampowered.com/app/1064340/Chess_Evolved_Online/
- Chess Evolved Online army-building guide (cost/army-strength trade-off in practice) — https://steamah.com/chess-evolved-online-the-definitive-army-building-guide-rated-6000/
- ubdip, "Finding the value of pieces" (lichess) — closed-form jumper value `33N + 0.69N²`, and engine-game regression for piece values — https://lichess.org/@/ubdip/blog/finding-the-value-of-pieces/PByOBlNB
- "A method for calculating the relative value of fairy pieces in chess variants" (SchemingMind) — self-play from materially imbalanced positions — https://www.schemingmind.com/home/journalarticle.aspx?article_id=184
- "Evolving Evaluation Functions for Collectible Card Game AI" (arXiv 2105.01115) — automated CCG balance via evolved evaluators — https://arxiv.org/pdf/2105.01115
- "Level the Level: Balancing Game Levels for Asymmetric Player Archetypes With Reinforcement Learning" (arXiv 2503.24099) — RL-driven asymmetric balancing — https://arxiv.org/pdf/2503.24099

## 🔗 Related Internal Docs

- [[SPEC-variant-chess-6x6-cards]] — AC-011 fail-closed validation, AC-012 self-play budget, AC-014 editor-to-playable, AC-015 export/import; Non-Goals lines 194-209 (balance tuning, AI opponent, online play).
- [[RISK-RANKING-variant-chess-6x6-cards]] — the schema-risk framing ("if we are wrong about the vocabulary, does this card find out?") and the needs-subsystem escalation pattern.
- [[VOCAB-GAPS-variant-chess-6x6-cards]] — the G-numbered vocabulary gap list a new profile must not silently reopen.
- [[CARDSET-variant-chess-6x6-cards]] — the 28-card design set; the reference distribution any budget should reproduce.
- [[PLAN-variant-chess-6x6-cards]] — ADR-001/003 (one shared effect grammar), ADR-005 (schema bumps), ADR-012 (`win` as ordinary vocabulary).
- `.claude/memory/failures.md` — `[fail:design] declared-but-inert-vocabulary` (count:5) and the card-liveness survey; both bear directly on wiring `cost`.
- `.claude/memory/wiki.md` — `[wiki:architecture] effect-subject-quantifier-mover`, the subject/quantifier/mover distinction a piece- or skill-authoring profile must not confuse.
