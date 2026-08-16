---
type: research
task_slug: 12x12-cards-balance
status: complete
created: 2026-08-16
tags: [strange-chess, research, typescript, board-scaling, cards, game-balance]
mtime_warn_days: 7
libs_fetched: []
sources:
  - https://rcc.fide.com/fide-laws-of-chess_fulltexthtml/
  - https://static.chessvariants.org/rules/obentochess
  - https://www.evochess.com/chess-variant/twelve-by-twelve
  - https://lichess.org/variant
  - https://arxiv.org/abs/2605.20229
related_docs:
  - "[[RESEARCH-movement-lock-8x8-and-rule-cards]]"
  - "[[PLAN-movement-lock-8x8-and-rule-cards]]"
  - "[[RESEARCH-preset-content-expansion]]"
  - "[[PLAN-preset-content-expansion]]"
  - "[[RESEARCH-custom-piece-skill-balance]]"
  - "[[PLAN-same-turn-skill-move-balance]]"
  - "[[CARDSET-variant-chess-6x6-cards]]"
  - "[[VOCAB-GAPS-variant-chess-6x6-cards]]"
  - "[[RISK-RANKING-variant-chess-6x6-cards]]"
summary: "Build 12x12 as a region-aware preset, then rebalance effects before adding broad content"
---

# RESEARCH — 12x12 board, recurring skills, bishop, and content balance

## 🎯 Recommended Direction

Treat this as one product slice with four dependencies, not as a bulk content dump:

1. Add board-relative vocabulary first: regions/territories, promotion zones, target filters, and a relation between two chosen targets.
2. Replace the hard-coded second draft with a recurring per-side skill schedule. Keep the existing one-card acquisition decision (a three-card offer with one pick) every five completed turns, but give the deck a finite/recycle policy so a long 12x12 match cannot run dry.
3. Add a dedicated 12x12 preset, a full bishop, and a responsive board/AI envelope together. The current board schema and match geometry already accept arbitrary positive dimensions, but the current content, complexity guard, opening helper, and CSS do not yet make 12x12 shippable.
4. Re-author the strongest effects against those constraints, then expand rule cards, board modifiers, terrain, and skill cards in themed batches with a liveness test for every record.

The most important balance rule is to constrain the *legal target set*, not merely increase a displayed card cost. `cost` on rule and skill declarations is deprecated and is not read as an in-match payment; the active loadout model derives a declaration-based price. A card that can delete or relocate a major piece anywhere remains too strong even when its paper cost is high.

Recommended first-pass contracts:

- `skill.teleport`: one non-royal friendly piece; destination must be in that piece's own territory (or the board-declared safe region); preserve the existing same-turn relocation lock. No arbitrary cross-board jump and no direct effect on royals.
- `skill.quake`: one non-royal enemy piece; destination must stay in the target's territory or a bounded local region; remove the current combination of arbitrary destination plus guaranteed final-arrival protection, or make the protection mutually exclusive with the displacement. The player should not both choose any square and receive a safe, immediate tactical win.
- `skill.volley`: retain a one-target identity only if its target filter excludes royals and queens at minimum. A second balancing pass can restrict it to a minor-piece tier. The candidate generator and executor must enforce the same filter.
- `square.shrine` and `skill.coronation`: no unconditional pawn-to-queen from any rank. Require a board-relative promotion zone, or make the shrine promote to a bishop/minor piece and reserve a queen for a real promotion zone. A one-use shrine would be stronger still, but consumable terrain requires a state change that the current square vocabulary does not have.
- `skill.sacrifice`: require the sacrificed friendly piece and the enemy target to be adjacent (the intended older specification), and exclude royals/queens from the destructive target unless a future card explicitly opts into a higher tier. This needs a target-relation vocabulary; two unrelated chosen squares are the current defect.

For the 12x12 opening, use a separate themed preset rather than silently resizing `board.grand`. A standard-like 12-file back rank with bishop pairs is easy to understand, while a 12x12 experimental board can use a larger three-rank army only as a separate room. The exact army size and promotion convention belong in the plan interview.

The implementation order should be:

**schema and migration → engine target/cadence semantics → 12x12 board and bishop → UI/AI envelope → balance audit → themed content expansion.** This preserves the repository's existing rule that every newly expressible vocabulary item must be exercised end-to-end before it is used to pad a card count.

## 🔍 Refinement Decisions

- **Discovery lens:** Technical architecture / implementation (primary), User-workflow / product opportunity (secondary), and Rule / game-balance design (secondary).
- The board data model is already dimension-driven: `squareRef` accepts files through `z`, board validation checks placements against declared width/height, `inBounds` reads state dimensions, and the renderer builds its grid from `state.width`/`state.height`. A 12x12 board can therefore be added as content, but only after the downstream couplings are addressed.
- The shipped baseline is 12 pieces, 11 square types, 18 rule cards, 24 skill cards, 4 boards, and 5 presets. These are real records, not empty schema capacity; each new record also needs Korean text and art/coverage decisions.
- The current skill model is `draft -> hold one card -> use once`; every bundled skill declares `uses: 1`. `bumpTurns` opens exactly one second offer at `completedTurns === 5` and then stops because `draftIndex` has no recurring state. The user-visible symptom is therefore a lifecycle limitation, not a shortage of the current card definitions alone.
- A recurring cadence must be per side's completed turns, not global plies. The current `completedTurns`, deterministic `(seed, side, draftIndex)` RNG stream, `everOffered`, and AI `wouldRevealDraft` boundary are the pieces that must move together.
- Preserve a three-card choice if the product still values agency: one skill is gained after the player picks one of three. A direct one-card grant is a viable simpler alternative, but it removes the existing draft decision and needs a different UI/AI information boundary.
- A no-repeat policy is finite. A 12x12 match can last much longer than the current two-draft flow, so the plan must choose between a larger per-room deck, one-card draws, and a discard/cooldown recycle policy. `everOffered` alone cannot support indefinite cadence.
- A bishop is directly expressible as four unbounded diagonal slide vectors. The current `piece.lancer` is intentionally capped because a full diagonal slider was considered too strong on the 8x8 opening; adding a bishop should be a deliberate room/power decision, not an unnoticed replacement of the lancer.
- The current complexity guard makes an unmodified 12x12 preset impossible for common skill pools. Under `complexity.ts`, a 12x12 board has area 144; a queen contributes 8 default slide vectors times board max 12, giving a 96 reach term; and a two-choice card such as teleport contributes `144^2 = 20,736` target combinations. These two terms alone are `13,824 + 20,736 = 34,560`, already above `COMPLEXITY_BOUND = 20,000`, before declared effect actions. This is a formula lower bound, not a measured search time.
- Target restrictions are therefore not only balance features. If the AI envelope continues to use board area as the ceiling, region-aware candidate domains must either be reflected in the envelope or the 12x12 single-player room must use a deliberately narrow card pool. Raising the bound without a new timing measurement would remove a safety gate rather than solve the underlying branching problem.
- “Board card” is not a current content axis. The loader/editor collections are pieces, square types, rule cards, skill cards, boards, and presets. If the request means random board modifiers, define a separate `boardModifier`/`boardCard` contract; if it means more maps, themed board presets are cheaper and clearer.
- Current same-turn royal protection and Quake final-arrival protection are already specified in `PLAN-same-turn-skill-move-balance`. New target restrictions must preserve that invariant and must not re-open direct or same-turn royal removal while fixing queen/material balance.
- Memory evidence reinforces a hard authoring rule: `declared-but-inert-vocabulary` and `bug-masks-content-built-on-it` are recurring failure classes. Every new action, target, region, or duration needs a resolving test and a content re-audit after interpreter changes.

## 🛠️ Approaches Found

### 1. 12x12 board shape

| Approach | Evidence | Trade-off | Risk | Recommendation |
|---|---|---|---|---|
| A. Dedicated 12x12 standard-like room | FIDE defines bishop diagonal movement and promotion on the farthest rank; the EvoChess 12x12 variant keeps familiar pieces and uses a board-relative promotion rank. | Easiest to teach and balance; requires a new 12-file opening and a larger-board AI/UI pass. | Medium | **Recommended first room** |
| B. 12x12 large-army room | Obento Chess uses a 12x12 board with 36 pieces per side and three occupied rows. | More spectacle and material, but significantly more search, setup, and endgame length. | High | Add only after A is measured |
| C. Resize `board.grand` in place | Reuses one preset name and some content. | Breaks coordinate-coupled rules, opening assumptions, complexity, and player expectations; hides a new mode inside an old one. | High | Reject |

The external variants show that 12x12 does not have one canonical setup: a familiar-piece room and a larger-army room are both defensible. The plan should choose one as the initial acceptance target rather than combining their material counts.

### 2. Recurring skill acquisition

| Approach | Evidence | Trade-off | Risk | Recommendation |
|---|---|---|---|---|
| A. Every five completed turns: offer three, pick one | Extends the existing `draft_pick` UX; one card is actually gained per cadence. | Requires `draftIndex`/offer history to become recurring state and needs recycle behavior. | Medium | **Recommended** |
| B. Every five completed turns: draw one automatically | Smallest action/UI surface and enough cards can be dealt from a shuffled per-side deck. | Removes player choice and can create bad random swings; draft gating disappears. | Medium | Viable fallback |
| C. Keep two drafts and add more cards to the pool | No engine change. | Does not address the reported mid/late-game starvation; larger pool makes the two existing offers less predictable. | High as a solution | Reject as the only change |

Recommended state shape is a per-side `nextDraftTurn` or `draftCount` plus a pending offer. The cadence check should be `completedTurns >= next threshold`, not a single equality, so a forced/end-turn path cannot skip a due offer. A deck/discard model should distinguish “offered and passed”, “held”, “used”, and “eligible again”. If the room wants no repeats for a match, it must guarantee enough cards for its maximum expected cadence; otherwise a one-card fallback or a cooldown recycle must be explicit.

The AI must mirror the same draw boundary. `wouldRevealDraft` currently mirrors a hard-coded `completedTurns + 1 === 5` condition, and `positionKey` intentionally omits `everOffered` because it only affects a future draw. A recurring/recycling deck changes that assumption: the next-draw state or a canonical deck/discard fingerprint must be included wherever it changes legal future offers.

### 3. Region and target vocabulary

| Approach | Evidence | Trade-off | Risk | Recommendation |
|---|---|---|---|---|
| A. Board-declared regions plus target constraints | Existing board records own dimensions and painted squares; regions can remain data-driven and work for 6x6, 8x8, and 12x12. | Requires schema bump/migration, candidate filtering, execution validation, editor support, and AI scoring. | Medium | **Recommended** |
| B. Hard-code `own_half`/`center` in individual cards | `on_own_rank` already provides one board-relative condition. | Fast for the first card, but every future map needs exceptions and the current 8x8 exclusion problem returns. | High | Reject |
| C. Content-only text restrictions | No code change. | Text cannot enforce targets; players can still choose the forbidden square. | High | Reject |

The smallest useful vocabulary should cover:

- board-side regions such as `own_territory`, `opponent_territory`, `neutral`, or named board zones;
- destinations such as `own_territory`, `same_region`, and `near_origin`/bounded offset;
- action target filters such as `non_royal`, `not_piece: queen`, or an explicit allowed piece set;
- a relation such as `adjacent_to_previous_choice` for Sacrifice;
- a promotion-zone condition/destination that means “last N ranks from this piece's own side”, rather than an absolute rank.

The runtime must apply these constraints in both `legalActions` and `apply`/trusted execution. A target that is merely hidden from the UI is not a rule.

### 4. Balancing the reported effects

| Effect | Current behavior | Main failure | Recommended first contract | Required capability |
|---|---|---|---|---|
| Teleport | Friendly chosen piece to any empty square; bundled card already locks the relocated piece for the current follow-up. | Global relocation creates arbitrary threats and bypasses board geography. | Non-royal friendly only; destination in its own territory or a board-declared safe region; keep the lock; test hazards and portals. | Region-constrained destination and consistent target filter |
| Quake | Enemy chosen piece to any empty square; current card also protects the final arrival for the current play. | Displacement, arbitrary placement, and immediate safety stack together. | Non-royal enemy; same/target territory or bounded local destination; remove final-arrival protection or replace it with a short, explicit penalty. | Region/range destination and protection policy |
| Volley | Destroys one chosen enemy; royal skill immunity protects kings, but queens are ordinary targets. | A queen or other major piece can disappear without a positional exchange. | Exclude queen at minimum; consider a minor-piece ceiling or change to a short freeze if playtests still show a swing. | Target filter evaluated during generation and execution |
| Shrine | Any entering pawn becomes a queen; no promotion-zone or consumable state. | A pawn can become a queen from a map square unrelated to promotion progress. | Promotion-zone gate; initial safer content variant promotes to bishop, or use a one-use/limited shrine once consumable terrain exists. | Region/promotion condition; optional terrain state |
| Coronation | Chosen friendly pawn becomes a queen immediately, with no rank restriction. | Same-turn queen creation is reliable anywhere. | Require pawn in the opponent-side promotion zone; keep one use; do not allow royals as the chosen piece. | Promotion-zone target condition |
| Sacrifice | Two independently chosen destructive actions: one friendly and one enemy, with no adjacency. | Removes a valuable enemy anywhere for a cheap/local cost; current `cost: 5` is not the enforcement mechanism. | Friendly sacrificial piece adjacent to enemy target; both targets non-royal; exclude queen for the first pass or cap the target tier. | Choice relation and target filters |

### 5. Content expansion tracks

#### Rule cards

Add rules that are board-relative and create distinct room identities: center/territory control, promotion race, minor-piece majority, king-zone defense, three-check variants with different thresholds, and endgame conditions that use existing piece-count vocabulary. Avoid copying `CENTRE = ['c3', 'c4', 'd3', 'd4']` or fixed `on_own_rank` values into the 12x12 room; those are the exact coordinate-coupling defects already excluded from `preset.grand`.

#### Board cards / board modifiers

There is no current board-card schema. The low-risk version is more board presets with a clear map identity and terrain layout. If a random board card is a required product feature, add it as a first-class static modifier that composes with a board; do not overload `ruleCard` with map generation or make a “board card” a text-only label. Its interaction with regions, painted squares, AI complexity, save/import, and replay must be specified before authoring records.

#### Terrain

The bundle already has 11 square types, so add a small themed set rather than dozens of isolated hazards. Safe first candidates use existing triggers: a cover square, a short-range movement spring, a one-ply mire, a regional rally square, and a bishop-focused diagonal crossing. Avoid consumable/occupancy-changing terrain until the engine has explicit square state. Every terrain type needs an applying and an inert liveness scenario, plus a board placement that is reachable and not occupied at setup.

#### Skill cards

Create families with different decisions instead of more arbitrary relocation/destruction: local reposition, defensive cover, short movement grants, regional rescues, limited promotion alternatives, and terrain interactions. The 12x12 room should have a large enough skill deck for its cadence policy, but each card must use a proven grammar or arrive with a schema/engine test in the same change.

#### Bishop

Define `piece.bishop` as an unbounded diagonal slider with the standard four vectors, localized text, icon/art, movement tests, and at least one room placement. For the initial 12x12 room, use a familiar bishop pair only if the opening material and AI envelope are measured together. The current `piece.lancer` can remain as a short-range diagonal alternative for rooms that want a flanker rather than a full rider.

### 6. Verification strategy

The research-to-plan acceptance matrix should include:

- schema migration and editor/import/export round-trip for regions, target filters, promotion zones, and recurring draft state;
- a 12x12 board test covering `a1` through `l12`, opening occupancy, painted-square reachability, and bishop diagonal movement/capture;
- recurring draft tests at turn 4/5 boundary, no skipped due offer, per-side independence, no duplicate policy, pool exhaustion, serialization, and AI `wouldRevealDraft` agreement;
- differential tests proving Teleport, Quake, Volley, Shrine, Coronation, and Sacrifice reject the old overpowered target classes in both generated and directly applied actions;
- liveness coverage for every new card and terrain record, including a non-triggering case;
- complexity and self-play measurements per 12x12 preset, with a target-generation metric after region pruning rather than only the current board-area upper bound;
- a human balance pass using concrete scenarios: queen deletion, pawn-to-queen from the opening, cross-board Teleport, Quake plus immediate capture, and non-adjacent Sacrifice.

## ⚠️ Pitfalls

- **The current AI gate rejects the obvious 12x12 card pool.** A two-target card and queen reach already exceed 20,000 under the current static formula. Raising the constant without measuring p95 search time makes the gate decorative. Candidate-domain-aware scoring or a constrained 12x12 pool is required.
- **The six-column CSS assumption is real.** `.square` uses `font-size: min(34px, 11cqw)` with comments calibrated for six columns. At 12 columns, marks can exceed a cell and overlap. A responsive board must size marks from the actual column count and test mobile landscape/portrait layouts.
- **Board coordinates are not the same as board semantics.** `a`–`l` is enough for parsing 12 files, but center, territory, promotion, and “home area” need board-relative definitions. Fixed `c3`/`d4` lists will be wrong again.
- **Recurring drafts can reveal information to the AI.** The existing search stops before an unrevealed second offer. A repeated cadence must update the predicate, state key, serialization, and any analysis that assumes `draftIndex` is only 0/1.
- **Finite pools run out.** The current `everOffered` and `skillPoolFor` logic deliberately prevents repeats and requires three remaining cards. That is correct for two rounds and insufficient for a long match with offers every five turns.
- **Card hand growth changes UX and balance.** The hotbar already renders at least five slots and can grow, but a recurring hand can become a visual inventory. The plan needs a hand cap, discard/consume display, or a compact deck summary.
- **Target filters must be authoritative.** Filtering only `candidatesFor` leaves direct action application and AI/trusted paths exploitable. Filtering only execution leaves UI and complexity estimates misleading.
- **The existing royal-skill policy is not a queen policy.** Kings are protected by the current skill-layer invariant; queens are intentionally ordinary pieces. Any new “major-piece” filter must be explicit and must not weaken king protection.
- **The old cost fields are misleading.** `cost` values in bundled records are deprecated; the balance module derives a declaration-based estimate. Do not claim that changing `cost: 5` to `cost: 8` nerfs Sacrifice unless the pricing contract is intentionally revived.
- **Shrine consumption is not expressible as a static square effect.** A one-use shrine needs board state, a consumed-square marker, or a different content mechanism. Do not add a text promise that the engine cannot remember.
- **More records can reduce variety.** Adding all 24 existing skills to every room dilutes draft probability and makes themed rooms indistinguishable. Use per-preset pools and measure both acquisition rate and card usefulness.
- **Declared-but-inert content has recurred.** The internal memory records schema entries that validated, drew, and did nothing, including effects later fixed by duration/quantifier work. New vocabulary needs an end-to-end content test before new cards depend on it.
- **Interpreter fixes can invalidate authored content.** The `fast-promotion` history shows that fixing `forEach` semantics made old absolute-rank content promote opening pawns. After every schema/interpreter change, re-audit every bundled record using that vocabulary.
- **Random self-play is not sufficient balance evidence.** It can miss a skilled Quake/Volley/Sacrifice line. Pair seed measurements with targeted tactical positions and a human-readable card audit.
- **Large armies multiply more than board area.** A 36-piece 12x12 setup increases move count, terrain interactions, match length, and AI nodes. Do not combine the large-army setup, recurring cards, and broad global target pools in the first acceptance slice.
- **Art and localization are part of content scope.** The repository has a Korean bundle and art gates. Every new piece, terrain, card, board, and board modifier needs keys/assets or an explicit fallback decision.

## ❓ Open Questions

1. Should the first 12x12 room use a familiar 24-piece-per-side setup (one back rank plus one pawn rank) or a 36-piece-per-side, three-row setup like Obento Chess?
2. Is the recurring cadence exactly five completed turns per side, or should it be four for the 12x12 room? Does “one skill” mean one automatic draw or one pick from three offers?
3. When the skill deck has fewer than three eligible cards, should the game show a smaller offer, draw one automatically, or recycle used cards after a cooldown?
4. What is “our region”: each side's half, the home three ranks, a board-declared named zone, or the region containing the selected piece? Should Teleport and Quake use the same definition?
5. Should Quake lose its current final-arrival protection, become a short freeze, or consume the player's mandatory move? Which penalty is easiest to teach?
6. Should Volley exclude only queens, all major pieces, or all pieces above a declared material tier? Is a freeze/recoil version preferable to deletion?
7. Should Shrine and Coronation create a bishop as the safer default, or keep queen creation behind a promotion-zone condition? Does Shrine need to be consumable in the first release?
8. Must Sacrifice be adjacent in Chebyshev distance 1, orthogonal-only, or merely in the same region? Can its enemy target ever be a queen?
9. Does “board card” mean additional static boards/presets, or a new random board-modifier card axis? If it is an axis, is it drafted, public, or selected before the match?
10. Is AI support mandatory for every 12x12 room, or may a first 12x12 room be human-only while the complexity/search envelope is redesigned?
11. Should bishop replace one lancer slot in `preset.grand`, coexist with it, or appear only in the new 12x12 room?
12. What content/art target is desired for the first pack: a small measured batch (for example 6 rules, 6 terrains, 8 skills, 2 pieces) or a larger catalog milestone?

## 📚 Sources

### External sources

- [FIDE Laws of Chess](https://rcc.fide.com/fide-laws-of-chess_fulltexthtml/) — authoritative reference for bishop movement and pawn promotion choices. This is a rules reference, not a balance prescription.
- [Obento Chess rules](https://static.chessvariants.org/rules/obentochess) — a concrete 12x12 variant using 36 pieces per side and three occupied rows; useful as a large-army setup precedent.
- [EvoChess Twelve by Twelve](https://www.evochess.com/chess-variant/twelve-by-twelve) — a contrasting 12x12 design using familiar pieces, an inset opening, and board-relative promotion rank; useful evidence that setup conventions vary.
- [Lichess variants](https://lichess.org/variant) — demonstrates the product value of curated modes with distinct win conditions rather than one undifferentiated rules pool.
- [A theoretical 12x12 mobility model](https://arxiv.org/abs/2605.20229) — a narrow mathematical proxy for rider/leaper mobility. It supports the inference that board size changes piece power, but it is not a playtest-based balance result and should not set card costs.

### Internal evidence

- `src/content/schema.ts`: strict board/piece/card grammar; square refs support 12 files, but no regions, target filters, promotion zones, or target relations.
- `src/content/sets/bundled.ts`: current 12/11/18/24 record census, `piece.lancer` choice, coordinate-coupled rule cards, current Teleport/Quake/Volley/Shrine/Coronation/Sacrifice declarations, and 8x8 exclusions.
- `src/engine/engine.ts`: `SECOND_DRAFT_AFTER_TURNS = 5`, one second-draft equality check, board-relative move generation, candidate selection, and card resolution.
- `src/engine/ai/complexity.ts`: 20,000 bound and board-area/card-slot formula; current 6x6 bundled score is 4,068, while the 12x12 lower-bound calculation above already exceeds the bound for a two-slot card.
- `src/engine/ai/search.ts`: `wouldRevealDraft` mirrors the current one-time draw and `positionKey` intentionally omits future-offer history; both need review for recurring/recycling draws.
- `src/ui/styles.css` and `src/ui/MatchHost.tsx`: data-driven grid sizing exists, but mark sizing is commented/calibrated for six columns and hotbar growth needs a recurring-hand UX decision.
- `tests/content/bundled.test.ts`, `tests/engine/draft.test.ts`, `tests/engine/ai-draft-boundary.test.ts`, `tests/engine/card-liveness.test.ts`, `tests/engine/square-liveness.test.ts`, and `tests/engine/grand-board.test.ts`: current content, draft, liveness, and 8x8 gates.
- Internal memory anchors `[fail:design] declared-but-inert-vocabulary` and `[fail:design] bug-masks-content-built-on-it`: prior evidence that schema acceptance is not proof of runtime behavior, and that interpreter fixes require a complete content re-audit.

No external library documentation was fetched; the implementation uses the repository's existing TypeScript/Zod/Vitest stack.

## 🔗 Related Internal Docs

- [[RESEARCH-movement-lock-8x8-and-rule-cards]] — prior 8x8, square-type, relocation-lock, and card-rule research; establishes the coordinate-coupling and AI-envelope risks.
- [[PLAN-movement-lock-8x8-and-rule-cards]] — implementation record for the current 8x8 and vocabulary baseline.
- [[RESEARCH-preset-content-expansion]] — prior content/preset/art expansion research and the recommendation to fix liveness before broadening records.
- [[PLAN-preset-content-expansion]] — prior preset and content expansion execution record.
- [[RESEARCH-custom-piece-skill-balance]] — constrain first, price second, measure last; relevant to user-authored pieces and skills.
- [[PLAN-same-turn-skill-move-balance]] — current skill-layer royal immunity and Quake final-arrival protection contract.
- [[CARDSET-variant-chess-6x6-cards]] — earlier intended rule/skill catalog and the original Sacrifice adjacency requirement.
- [[VOCAB-GAPS-variant-chess-6x6-cards]] — known missing or historically inert target, relation, duration, and board-relative vocabulary.
- [[RISK-RANKING-variant-chess-6x6-cards]] — schema-risk ranking that identifies Sacrifice adjacency and movement/target vocabulary as extension points.

