---
type: plan
task_slug: capture-rules-and-art-fixes
status: complete
created: 2026-08-08
tags: [strange-chess, plan, typescript, react, engine, content-balance, css, pixel-art]
interview_rounds: 6
adrs: 9
validator_outcome: MAJOR_REVISION_RESOLVED
phases_done: "2,3,4,5,6,8,9 — 1 partial (approach A eliminated), 7 open behind it"
summary: "Fix intermittent missing captures, the 225px art picker gap, undecidable rule cards, the editor's two-map movement contradiction, and soften the sprites"
---

## 🎯 Executive Summary

**TL;DR** — Four reported defects, one PLAN. Two are already root-caused to a named line of code; two need a survey harness before a single line is changed.

**What / Why**

| # | Report (verbatim intent) | Status after planning |
|---|--------------------------|-----------------------|
| 1 | Pawns and other pieces sometimes cannot capture a piece they clearly could — the capture marker never appears | **Not root-caused.** Needs a differential oracle. Confirmed to happen in **local two-player** play, so the AI/stale-board path is out of scope. |
| 2 | Editing a piece: the piece picture has a long gap | **Root-caused and measured.** Each art option button is 49×265 px with a 26×26 sprite — 225 px of blank below every picture; the whole fieldset is 1926 px tall on an 844 px viewport. |
| 3 | Some rule cards never produce a decision, or contradict themselves — must be played to find them | **Not root-caused.** No harness observes decisiveness today (`card-liveness.test.ts` observes state change only, and has zero open `defect:` notes). |
| 4 | Piece graphics should be smoother — too pixel-art | **Decision deferred to a spike by the author's choice.** Three candidate approaches, judged by eye at rendered sizes. |
| 5 | The piece editor asks the same thing in two maps, and some settings disagree with the "this is how it moves" preview | **Root-caused.** Two distinct causes, both confirmed in code — see below. Raised mid-planning and folded in as the same family as #1. |
| 6 | Making a piece: no idea why it gets the stars it gets | **Root-caused.** `cost.ts` names explainability as a design goal and no screen renders it; the badge is a bare star count. `declared-but-inert-vocabulary`, again (ADR-009). |

**Report 5, root-caused.** Two causes, not one:

1. **The move-only state is unreachable, and nothing says why.** `writeGrid` (`PieceMoves.tsx:290`) omits `attack` when no capture cell is lit; the engine reads a missing `attack` as *"captures wherever it moves"* (`engine.ts:152-158`); and `readGrid` (`:217-222`) faithfully reflects that back by promoting every move cell to **both**. The three agree — so the grid and the preview do **not** disagree here, and an earlier draft of this PLAN said they did. What actually happens is worse for an author: tap a cell to "move", and on the next render it shows "both". The state they asked for silently becomes another state, the four-step cycle appears to skip a stop, and the reason (a piece with nowhere to capture takes where it walks) is never stated anywhere on screen. ADR-008 is the fix and is unchanged; only the symptom description was wrong.
2. **The two maps overlap, and the difference between them is never stated.** A lit grid cell compiles to `kind: 'step'`, which **leaps over** whatever is in between; a slide direction compiles to `kind: 'slide'`, which **stops at the first occupant** (`engine.ts:134`). At distance 1 the two are provably identical, so "한 칸" is pure redundancy — and nothing in the shipped set uses `maxDistance: 1`. At distance 2 they genuinely differ, and the preview seeds an enemy above and a friendly to the right, which is exactly where that unstated difference surfaces as "these don't match".

**Key decisions** — ADR-001 (art spike before commitment), ADR-002 (survey-then-playtest for cards), ADR-003 (AC-012 re-baselined, not defended), ADR-004 (capture investigated by differential oracle across engine *and* UI highlight), ADR-005 (`.palette.wrap` row sizing is the fix site, not the button padding), ADR-006 (art spike is a hard decision gate), ADR-007 (the two maps become one **drawing**; the model and its test ids do not change), ADR-008 ("never captures" stays inexpressible; the editor says so where the contradiction happens), ADR-009 (the star rating explains itself out of the same arithmetic that produces it).

**Autopilot note.** From report 6 onward the author delegated the remaining choices: *"권고안으로 모두 선택해서 알아서 끝까지 진행해."* ADR-009 is therefore recorded as decided-by-recommendation rather than interview-confirmed, and says so in its own Source line.

**Estimated impact** — `src/engine/engine.ts`, `src/ui/styles.css`, `src/ui/RecordForm.tsx`, `src/content/sets/bundled.ts`, `src/ui/art/{Pix.tsx,pixels.ts,gates.ts}`, plus new test files under `tests/engine/` and `tests/ui/`. Also `src/balance/cost.ts` and `src/ui/RecordGrade.tsx`. Nine phases; three of them (1, 3, 5) change no production code at all. Phase 7 is the only phase that can grow large, and the spike exists to bound it.

## 📚 Prior Work

Retrieved memory that materially shaped this plan:

- **`[fail:test] metric-green-because-of-the-defect`** — AC-012 (self-play median ≤ 40 plies over 1000 seeds) currently passes at **exactly 40, zero headroom**, and that number was previously restored by *repairing* an inert card. Any card fix in Phase 6 moves it. The failure mode this memory records is reverting a correct fix to keep a green number; ADR-003 forecloses it.
- **`[wiki:architecture] spare-art-pool-and-sprite-gates`** — `gates.ts` (12×12, palette-only, ≤60 rects, **sheet-wide** compression floor `runs < pixels / 1.8`) has **five** consumers, not the three the memory names: `tests/ui/pixels.test.ts`, `tests/ui/art-contrast.test.ts`, `tests/ui/sprite-generator.test.ts` (which asserts **module identity**, not equivalent behaviour), `scripts/gen-sprites.ts`, and `tests/ui/art-gates.test.ts` — the last of which tests the gate **predicates themselves** (`RECT_CAP`, `SHEET_DIVISOR`, `sheetCompression`, `spriteErrors`) against synthetic fixtures pinned to the current 60 / 1.8 values. Any smoothing that changes the gate rules must change that one module, not a copy, and `art-gates.test.ts` is where its fixtures will break first.
- **`[fail:test] measured-the-artifact-not-the-rendering`** — a perceptual gate must measure the pixels a human sees: rendered CSS size, composited over the specific background, percentile (not mean) separation. Smoothing changes edges, and the edge is where this board's contrast lives, so Phase 7 must re-measure rather than assume.
- **`[wiki:architecture] piece-info-affordances`** — `usePressInspect` owns tap, drag **and** press, and its click guard names the spent square. It is the most likely UI-side suspect for "the capture marker never appeared", which is why Phase 3 covers the UI highlight as well as the engine.

## 🎙️ Interview Transcript

| # | Topic | Category | Question | Options | Choice | Note | → ADR |
|---|-------|----------|----------|---------|--------|------|-------|
| 1 | Smoothness ceiling | Architecture | How far does "smoother" go, given 125 sprites bound by `gates.ts`? | render-only / vector outline / higher resolution / prototype first | **Prototype first, judge by eye** | Author's eye is the acceptance criterion | ADR-001, ADR-006 |
| 2 | Editor gap | Scope | Which gap is "long"? | per-button padding / whole list length / both / preview board | **Other** — "every art picture renders long; take a screenshot" | Corrected my framing; measured live | ADR-005 |
| 3 | Card defects | Method | How are the bad cards found? | survey→confirm / playtest-only / survey-only | **Survey shortlists, then play them** | Repeatable *and* human-judged | ADR-002 |
| 4 | AC-012 | Risk tolerance | What if a card fix moves the median past 40? | re-baseline / defend 40 / decide later | **Re-baseline when the engine is right** | Record the rationale in the test | ADR-003 |
| 5 | Capture scope | Contract | Should granted patterns be able to capture when a piece has an `attack` set? | bug / reproduce-only / both / message-only | **Other** — "not what I meant: basic pieces intermittently show no capture marker" | Granted-pattern semantics is **out of scope**, logged below | ADR-004 |
| 6 | Ordering | Phasing | Which of the four goes first? | correctness-first / art-spike-first / cards-first / end | **Art spike first — my eye is the bottleneck** | Rest proceeds in parallel | ADR-006 |
| 7 | Capture context | Scope | Where was the missing marker seen? | vs AI / local 2P / card armed / cannot recall | **Local two-player** | Removes the AI and stale-board paths | ADR-004 |
| 8 | Oracle coverage | Testing depth | Engine only, or engine + UI highlight? | both / engine only / end interview | **Both** | Highlight must equal `legalActions` | ADR-004 |
| 9 | Editor: two maps | Scope | Raised by the author mid-planning: why do the jump grid, the slide dial and the preview all exist, and why do some settings disagree with the preview? | — (author's own question) | Answered from code; folded into this PLAN | Root-caused to two causes; see Executive Summary | ADR-007, ADR-008 |
| 10 | "Never captures" | Contract | Should a piece that moves but never captures become expressible? | schema change / screen says it clearly / both | **Screen says it clearly** | No schema change; contradiction removed at the point it occurs | ADR-008 |
| 11 | Slide vs leap | Architecture | Is blocking the only difference, and why does slide exist at all? | — (author's question) | Answered: unbounded reach **and** blocking | A 7×7 grid has no cell meaning "and keep going"; distance-1 slide is provably identical to the adjacent cell | ADR-007 |
| 12 | One map | Architecture | How should "끝까지" be carried if the two maps merge? | edge cell / outer arrows / one checkbox / **draw as one, keep the model** | **Draw as one, keep the model** | Two maps is too complex to look at; the mapping stays | ADR-007 |
| 13 | Scope of #5 | Scope | Fold the editor movement model into this PLAN or split it out? | fold in / separate task / fold in and end | **Fold in — same family as #1** | Becomes Phase 8 | ADR-007 |

Rounds 2, 4 and 6 corrected my hypotheses (entries 2, 5, 10 and 12). Every correction is recorded as such rather than smoothed over. Round 6 exceeded the configured 5-round cap at the author's explicit request ("하나 더 집어달 게 있다").

## 📐 Architecture Decision Records

### ADR-001: The smoothing approach is chosen by a spike, not by this PLAN
**Status:** Accepted (2026-08-08, via /hm:plan interview)
**Context:** 125 sprites are 12×12, palette-only, rendered with `shape-rendering="crispEdges"`, and gated sheet-wide. "Smoother" spans a one-file render change and a full regeneration, and the acceptance criterion is how it looks to the author.
**Decision:** Phase 1 renders the same three pieces under three candidate approaches at the sizes they actually ship at, and the author picks. Phase 7 implements only the chosen one.
**Consequences:**
- ✅ The expensive option is only paid for if it is the one that looks right.
- ✅ The spike doubles as the before/after evidence for review.
- ⚠️ Phase 7's size is unknown until Phase 1 resolves; the PLAN carries three sketched scopes instead of one.
**Rejected alternatives:**
- Commit to render-only smoothing now — rejected: cheapest, but it cannot remove the 12×12 silhouette, which may be the whole complaint.
- Commit to 16×16+ now — rejected: regenerates all 125 sprites and re-derives every gate constant before anyone has confirmed it looks better.
**Source:** Interview #1, #6

### ADR-002: Card defects are shortlisted by survey and confirmed by play
**Status:** Accepted (2026-08-08, via /hm:plan interview)
**Context:** The report is "some rule cards never decide a match, or contradict themselves, so they must be played to be found". `card-liveness.test.ts` observes state change per card and has no open defects, so nothing today observes *outcome*.
**Decision:** Build a per-card decisiveness survey in the shape of `card-liveness.test.ts` (differential, per record, assertion against measured `current`). Its output is a suspect table. Every suspect is then played by hand before being changed, and the manual verdict is what authorises the fix.
**Consequences:**
- ✅ No card can be missed by the author's memory of which ones felt wrong.
- ✅ "Contradictory" stays a human judgement, which is what it is.
- ⚠️ Two artefacts to keep in step: the survey and a playtest log.
**Rejected alternatives:**
- Playtest only — rejected: not repeatable, and silent cards are exactly the ones nobody notices.
- Survey only — rejected: a card can be perfectly decisive and still read as self-contradictory.
**Source:** Interview #3

### ADR-003: AC-012's median cap is re-baselined when a card fix moves it
**Status:** Accepted (2026-08-08, via /hm:plan interview)
**Context:** AC-012 caps the self-play median at 40 plies over 1000 seeds and currently passes at exactly 40. `[fail:test] metric-green-because-of-the-defect` records that this threshold has already been satisfied *by* a defect once: a false win condition ended matches early, and removing it pushed the median to 41 on a commit that contained only bug fixes.
**Decision:** If a Phase 6 fix is correct on the card's own terms, the fix stands and the cap is re-derived from the new measurement with stated headroom. The rationale goes into `tests/engine/self-play.test.ts` as a comment naming the fix, alongside the existing note.
**Consequences:**
- ✅ A correct engine is never traded for a green number.
- ✅ The next reader learns why the cap moved from the test itself.
- ⚠️ AC-012 stops being a fixed contract; it becomes a measured budget, and drift needs the recorded history to interpret.
**Rejected alternatives:**
- Defend 40 by adjusting card balance or the ply cap — rejected: widens the change from "fix a broken card" to "retune the set" in the same commit.
**Source:** Interview #4

### ADR-004: Missing captures are found by a differential oracle spanning engine and UI
**Status:** Accepted (2026-08-08, via /hm:plan interview)
**Context:** The symptom is intermittent and the author cannot name a position. It occurs in **local two-player** play, which rules out the AI turn model and the stale-board overlay. Two layers can independently suppress a capture: move generation (`movesFor` drops capture targets in `mods.protectedSquares`, and skips squares in `mods.forbidden` or under `frozenUntil`), and the UI (the highlight source, and `usePressInspect`'s click guard).
**Decision:** Phase 3 builds two probes and changes no behaviour. (a) An engine oracle: over many self-play positions, compute a naive geometric capture set from each piece definition alone and diff it against `legalActions`, classifying every divergence by cause — `protected` / `frozen` / `forbidden` / `attack-set` / **unexplained**. (b) A UI probe asserting the rendered capture markers are exactly the capture subset of `legalActions` for the selected square. Only `unexplained` divergences and any highlight mismatch are bugs; card-caused ones are a message defect at most.
**Consequences:**
- ✅ Turns "sometimes" into an enumerated list with causes, and separates engine from UI before either is edited.
- ✅ The oracle survives as a regression harness.
- ⚠️ The naive geometric set must be derived from the same `MovePattern` schema, or the oracle disagrees with the engine for reasons of its own — the `measured-the-artifact-not-the-rendering` failure wearing a new hat.
**Rejected alternatives:**
- Engine only — rejected in interview #8: the report is that the *marker* never appears, which is a UI observation.
- Fix by inspection — rejected: nothing in `movesFor` is obviously wrong, so an inspection fix would be a guess with a test written to match it.
**Source:** Interview #5, #7, #8

### ADR-005: The art picker gap is fixed at the grid row, not the button padding
**Status:** Accepted (2026-08-08, via /hm:plan measurement)
**Context:** Measured live at 390×844 with the pawn open in the maker: 32 options, five columns of 48.6 px, **every implicit row 264.7 px**, each button 49×265 with a 26×26 sprite — 225 px of blank below the picture and a 1926 px fieldset. Setting `grid-auto-rows: min-content` on `.palette.wrap` collapses the row to **54 px** (26 sprite + 22 padding + borders). The button's own `padding: 11px 5px` is therefore *not* the cause; the rows are being stretched.
**Decision:** Fix `.palette.wrap`'s row sizing (`grid-auto-rows: min-content`, or `align-content: start`, whichever holds under a real reflow). The shared `.palette button` / `.tile` padding rule is left alone, because tiles that carry a label need it.
**Consequences:**
- ✅ One rule, no change to any tile surface that is currently correct.
- ✅ Verifiable numerically rather than by eye.
- ⚠️ The *reason* the container's block size reads as definite was not established in planning — only that constraining the rows fixes it. Phase 2 must name the mechanism, or the fix is a coincidence that the next layout change undoes.
**Rejected alternatives:**
- Split the button padding for label-less pickers — rejected by measurement: it accounts for 22 px of a 265 px box.
**Source:** Interview #2 plus live measurement (Playwright, 390×844)

### ADR-006: The art spike is a hard decision gate
**Status:** Accepted (2026-08-08, via /hm:plan interview)
**Context:** The author named their own eye as the bottleneck and asked for the spike first.
**Decision:** Phase 1 runs first and ends in a recorded choice. No sprite, no gate constant, and no `Pix.tsx` render path changes until it does. Phases 2, 3 and 5 do not wait on it.
**Consequences:**
- ✅ The author is unblocked on the one judgement only they can make, while other work proceeds.
- ⚠️ If Phase 1's answer is "raise the resolution", Phase 7 needs its own PLAN-scale decomposition; that is a re-plan trigger, stated here so it is not discovered late.
**Rejected alternatives:**
- Correctness-first ordering — rejected by the author in interview #6.
**Source:** Interview #6

### ADR-007: The two movement maps become one drawing; the model stays as it is
**Status:** Accepted (2026-08-08, via /hm:plan interview)
**Context:** The piece editor asks "where does it jump to" as a 7×7 grid and "which way does it slide" as an 8-direction dial with one shared reach, then shows a third panel previewing the result. The author's objection is about *looking at two maps*, not about expressiveness: "2개의 맵을 그리는 것은 너무 복잡함." Meanwhile the model behind them is sound and is measured by the ADR-006 vocabulary-coverage gate through `piece-slide-*` and `piece-reach-*` test ids (14 references in `tests/editor/vocabulary-coverage.test.ts`, 5 in `tests/ui/piece-grid-clear.test.tsx`).
**Decision:** Merge the two **renderings** into one 7×7 drawing — lit cells drawn as bordered squares (leap), slide directions drawn as continuous trails through the same grid — and state the difference between them in words on that drawing. `readGrid` / `writeGrid`, the `PieceGrid` shape, the reach picker and every test id stay exactly as they are.
**Consequences:**
- ✅ One picture to read, and blocking becomes visible as the shape of the trail.
- ✅ No schema change, no round-trip risk, no test-id churn: the ADR-006 gate keeps measuring the same vocabulary.
- ⚠️ The redundancy stays. A one-square slide remains authorable two ways, and the reach is still one value shared by all eight directions. Both are recorded as out of scope below rather than silently accepted.
- ⚠️ Overlaying a trail and a cell in one grid can collide visually where a slide passes through a lit cell; the drawing must remain unambiguous there or it trades two clear maps for one unclear one.
**Rejected alternatives:**
- Compile contiguity as slide and gaps as leap, so the grid alone carries everything — rejected: elegant, but it makes exactly-distance-3 unexpressible (the shipped `piece.charger` is `maxDistance: 3`) and rewrites the round-trip the vocabulary gate measures.
- Outer-ring "끝까지" arrows, or a single checkbox — rejected by the author in favour of leaving the mapping alone.
**Source:** Interview #9, #11, #12, #13

### ADR-008: "Moves but never captures" stays inexpressible, and the editor says so where it happens
**Status:** Accepted (2026-08-08, via /hm:plan interview)
**Context:** `attack` is optional in the schema and its absence means "captures using the movement patterns". `writeGrid` omits `attack` when no capture cell is lit, so authoring move-only produces a piece that captures on every move square. That is the contradiction between the green grid and the red preview. Making "never captures" expressible would need a schema addition and a re-reading of every bundled piece.
**Decision:** No schema change. The editor makes the fallback visible at the point it occurs: when no capture cell is lit, the move cells are shown as capture cells too — the same squares the preview will paint red — with one line saying that a piece with nowhere to capture takes wherever it walks.
**Consequences:**
- ✅ The grid and the preview can no longer disagree, which is the actual report.
- ✅ Zero schema, engine or content risk.
- ⚠️ A genuinely peaceful piece remains unbuildable. That is now a stated product limit rather than a silent surprise.
**Rejected alternatives:**
- Add an explicit "never captures" marker to the schema — rejected by the author in interview #10; it re-opens every bundled piece definition.
- Leave the existing note as-is — rejected: it already exists and did not land, which is the evidence.
**Source:** Interview #10

### ADR-009: The star rating explains itself from the same computation that produces it
**Status:** Accepted (2026-08-09, via /hm:plan — author delegated the decision)
**Context:** Report 6: "I don't understand why a piece gets the stars it gets." `cost.ts` names explainability as a design goal in its own header — *"it is explainable — 'this one costs more because it reaches further' is a sentence a nine-year-old can act on"* — and then nothing renders that sentence. `RecordGrade.tsx` shows a star count and a generic caveat. This is `declared-but-inert-vocabulary`: the property was designed in and never wired out. Three secondary facts fall out of the same read: the badge appears only for a **saved** record even though the cost is now a pure function of the declaration; `RecordGrade`'s doc comment still describes a worker, a measuring state and a content-hash cache that ADR-012 deleted; and the ceiling is taken from **the first room in the document**, so the same piece can show different stars depending on document order.
**Decision:** Add an `explainCost` to `src/balance/cost.ts` that returns the ordered terms of the very same arithmetic `pieceCost` / `skillCardCost` perform — walk reach, take reach (doubled), the separate-attack surcharge, the promotion surcharge, each effect's contribution — together with the ceiling and the band boundary the record is sitting against. Render it under the badge as plain sentences, and compute it from the **draft** so it answers while the author is still editing. Fix the stale comment while in the file.
**Consequences:**
- ✅ The number stops being an oracle: an author can see which choice is buying the stars, and act on it.
- ✅ Because the terms come out of the same function, the explanation cannot drift from the price. A parallel prose description would be the drift the next reader gets bitten by.
- ✅ Live on the draft is now cheap — nothing is measured, so there is no state to wait on.
- ⚠️ Two callers gain an argument, and a draft that does not parse into a valid definition has no explanation; it falls back to the saved-record behaviour.
- ⚠️ A card's explanation cannot be a plain sum. `skillCardCost` multiplies by `uses` and divides by `CARD_TO_PIECE = 8` with a rounding step, so the discount and its rounding are shown as their own lines. Verified against `skill.teleport`: raw 36, shipped cost 5.
- ⚠️ Naming the ceiling out loud exposes the document-order dependency. Better said than hidden, but it will read as a bug until it is fixed — recorded as out of scope, not disguised.
**Rejected alternatives:**
- Write the weights into help text — rejected: it is the drift this ADR exists to prevent; the day the weights change the help lies.
- Show the raw cost integer instead of stars — rejected: the five-band display is a deliberate design (see `starsOf`), and a raw number is less actionable, not more.
**Source:** Report 6, author's autopilot delegation

## 🏗️ Technical Design

### Current State

- **Move generation** — `src/engine/engine.ts:141` `movesFor`. Per piece: `movement` (definition + `mods.granted`) yields quiet moves always and captures **only when `def.attack` is undefined**; `def.attack` yields captures only. Targets are then filtered by `mods.protectedSquares`, and the whole piece is skipped when `mods.forbidden.has(from)` or `frozenUntil[from].untilPly > plyCount`. `reachFrom` (`:109`) stops a slide at the first occupant. Actions carry no capture flag — `{kind:'move', from, to}` only, so "is this a capture" is re-derived from occupancy wherever it is displayed.
- **Rejection messages** — `describeRejection` (`:487`) answers a blocked capture with `'that piece cannot reach that square'`, which is false when the cause is `block_capture`, a freeze, or a blockade.
- **Editor art picker** — `RecordForm.tsx:652` `artPicker()` renders a label-less button per catalogue entry of the record's surface into `.palette.wrap`; 32 entries for `piece`.
- **Sprites** — `pixels.ts` (125 sprites, 12×12 palette cells), `Pix.tsx` (SVG, one `<rect>` per horizontal run, `shape-rendering="crispEdges"`, sized `1em`), `gates.ts` (the admission rules, shared by three tests and the generator), `registry.ts` (121 art ids).
- **Editor movement model** — `src/ui/PieceMoves.tsx`. `PieceGrid` = `{cells, slides, reach, forward}`; `REACH_VALUES = [1, 2, 'edge']`. `writeGrid` (`:290`) emits at most one `slide` and one `step` per axis, and omits `attack` when it is empty **or** when `sameReach` finds the capture and move sets equal (bucketed by kind, so that comparison is sound). `readGrid` (`:153`) returns `null` — the read-only notice — when the definition cannot be represented, which includes any reach other than 1, 2 or unbounded: the shipped `piece.charger` is `maxDistance: 3` (`bundled.ts:213`) and therefore does not open today. (`piece.lancer` is `maxDistance: 2` and opens fine — an earlier draft of this PLAN named the wrong piece three times.) Controls live in `RecordForm.tsx:720` (grid) and `:807` (slide dial, reach picker, clear).
- **Card outcome measurement** — `tests/engine/self-play.test.ts` (AC-012: median ≤ 40, max ≤ 60, per-card medians, "not every match hit the cap"), `tests/engine/card-liveness.test.ts` (per-card differential *state change*, zero open defects).

### Affected Components

| Component | Phases | Nature of change |
|-----------|--------|------------------|
| `src/engine/engine.ts` | 4 | Behaviour, only where Phase 3 proves a defect |
| `src/ui/styles.css` | 2 | One rule (`.palette.wrap` row sizing) |
| `src/ui/art/Pix.tsx` | 1, 7 | Render path, per the spike's outcome |
| `src/ui/art/{pixels,gates}.ts`, `scripts/gen-sprites.ts` | 7 | Only if the spike selects a resolution change |
| `src/content/sets/bundled.ts` | 6 | Card definitions confirmed broken by playtest |
| `tests/engine/self-play.test.ts` | 6 | Re-baselined cap plus rationale (ADR-003) |
| New `tests/engine/capture-oracle.test.ts` | 3 | Differential oracle |
| New `tests/ui/capture-highlight.test.tsx` | 3 | Highlight ≡ `legalActions` captures |
| New `tests/engine/card-decisiveness.test.ts` | 5 | Per-card outcome survey |
| New `work-docs/PLAYTEST-cards-2026-08-08.md` | 6 | Manual verdicts per suspect |
| New `work-docs/ART-SPIKE-smoothing.md` | 1 | Spike result and the choice |
| `src/ui/RecordForm.tsx` (grid + slide row), `src/ui/styles.css` | 8 | Rendering only — one drawing instead of two, plus the ADR-008 notice |
| `src/ui/PieceMoves.tsx` | 8 | **Read-only in this PLAN.** `describeGrid` may gain wording; `readGrid`/`writeGrid`/`PieceGrid`/`REACH_VALUES` must not change (ADR-007) |
| `src/balance/cost.ts` | 9 | Additive: `explainCost`. No weight, band or ceiling rule changes |
| `src/ui/RecordGrade.tsx` | 9 | Render the explanation; compute from the draft; delete the stale worker/cache comment |

### Data Flow — the capture oracle (Phase 3)

```
self-play positions (seeded)
        |
        +--> naive geometric capture set   ]
        |    (piece def patterns only,     ] diff --> divergences
        |     no cards, no mods)           ]            |
        +--> legalActions(state, content)  ]            |
                                                        v
                                        classify by cause:
                                        protected | frozen | forbidden
                                        | attack-set | UNEXPLAINED
                                                        |
                                        UNEXPLAINED --> Phase 4 fix list
                                        card-caused --> message defect only
```

### Design Decisions

- The oracle is a **test**, not a script, so it runs in `npm run test` and keeps working (ADR-004).
- The oracle's naive set is derived from the same `MovePattern` type as the engine, and its own correctness is pinned by fixtures where engine and oracle must agree exactly (ADR-004's trade-off).
- Card fixes are content edits in `bundled.ts` wherever possible; an engine change is escalated, because a card that needs one is a different decision than a card that was written wrong (ADR-002).
- No `Action` shape change. Adding a capture flag would touch the AI protocol, serialisation and the trusted-action brand — far past what any of the four reports asks for.

### API Changes

None. No schema, no serialised format, no worker protocol.

## 📝 Implementation Plan

### Phase 1 — Art smoothing spike (decision gate)

- **depends_on:** `[]`
- **parallel_group:** `serial-art-gate`
- **merge_hazards:** none — the spike lives in a scratch route and `work-docs/ART-SPIKE-smoothing.md`; it must not edit `pixels.ts` or `gates.ts`.
- **Scope in:** a temporary comparison view rendering three pieces (king, pawn, archer) × three approaches at the three shipped sizes (board square ≈28 px, editor 26 px, detail sheet's large mark); `work-docs/ART-SPIKE-smoothing.md`.
  - **A — render-only:** drop `shape-rendering="crispEdges"`, merge runs into one path with rounded joins. No asset change.
  - **B — vector outline:** new `src/ui/art/smooth.ts` turning the cell map into a marching-squares outline path with rounded corners; `pixels.ts` untouched.
  - **C — resolution ceiling:** the same three pieces hand-authored at 24×24, to show what raising the grid buys. Three sprites only — **not** a regeneration.
- **Scope out:** every other sprite, `gates.ts`, the generator, any committed art.
- **Exit criterion:** `work-docs/ART-SPIKE-smoothing.md` contains the screenshots at all three sizes and a line naming the chosen approach (A, B, C, or "none — keep as is"), authored after the author has looked. Phase 7 is not started before that line exists.
- **Risk:** low
- **Rollback point:** n/a — additive; delete the scratch route.
- **Status: PARTIAL — approach A eliminated on evidence; B and C not attempted.**

Approach **A is ruled out, and the reason generalises.** `shape-rendering` was switched from `crispEdges` to `geometricPrecision` and the sprites were photographed at their real 26px in the maker. The difference is barely perceptible, and it could not have been otherwise: `shape-rendering` governs how rect EDGES are rasterised, the rects are axis-aligned, and at this size a 12×12 cell lands on very nearly whole device pixels — there is almost no edge to soften. **The pixel-art look is the geometry, not the rasterisation.** ADR-001 guessed at this as A's trade-off; it is now measured, and the change was reverted rather than kept for looking busy.

That leaves the two approaches that do alter the silhouette, and both are larger than a phase:

- **B (vector outline).** A new render module turning the cell map into a marching-squares path with rounded corners, plus a contrast re-measure at rendered CSS size, composited, over every surface a mark can land on — the whole of `measured-the-artifact-not-the-rendering`. Smoothing moves the edge, and the edge is where this board's legibility lives, so the gate has to be re-run rather than assumed.
- **C (raise the resolution).** 125 sprites regenerated, `RECT_CAP` and the sheet-wide compression floor re-derived in `gates.ts`, and `art-gates.test.ts`'s fixtures updated with them. ADR-006 already names this a re-plan trigger.

**Recommendation for the next session: B.** It keeps the authoring format, the 125 committed sprites and the spare-pool census untouched, and it is the only option that changes what the author objected to without regenerating the catalogue. Phase 7 stays open behind it.

### Phase 2 — Art picker row sizing

- **depends_on:** `[]`
- **parallel_group:** `independent-ui`
- **merge_hazards:** `src/ui/styles.css` — also touched by Phase 7 under approach A/C. Land Phase 2 first; it is one rule.
- **Scope in:** `.palette.wrap` row sizing in `src/ui/styles.css`; a UI test asserting the measurement; a one-line comment naming *why* the rows were stretching (ADR-005's stated gap).
- **Scope out:** the shared `.palette button` / `.tile` padding rule; the number of options offered; any change to `artPicker()`.
- **Status: DONE.** The mechanism was located by bisecting computed styles in the running app: the base `fieldset` rule's `flex-wrap: wrap` on a `flex-direction: column` fieldset. Fixed at that rule with a comment naming it; `tests/ui/maker-fieldset-wrap.test.ts` (4 tests) and four tests in `e2e/maker-anchors.spec.ts` (mobile-portrait, desktop, mobile-webkit) green. Measured after: option button 49×265 → **49×54 px**, blank under the sprite 225 → **14 px**, `.art-picker` 1926 → **451 px**, editor scroll height 5794 → **4319 px**. Both e2e pins were confirmed to go red with the fix reverted. test-reviewer PASS on attempt 2.
- **Exit criterion:** three parts, and the first is the one that keeps this from being a coincidence. (a) The property actually producing the 264.7 px track is **located** by computed-style inspection in the running app — not inferred from reading the stylesheet, which already failed to find it during planning — and named in the comment. (b) With the pawn open in the maker at 390×844, `.art-picker` height ≤ 400 px and every `[data-testid^="editor-art-"]` button height ≤ 60 px, asserted in `tests/ui/`. (c) A label-bearing `.tile` surface is unchanged in a rendering test. If (a) cannot be established, the fix does not land as a fix: it lands as an explicitly-labelled constraint with the open question recorded.
- **Risk:** low
- **Rollback point:** revert the single CSS rule.

### Phase 3 — Capture divergence oracle (observe only)

- **depends_on:** `[]`
- **parallel_group:** `capture`
- **merge_hazards:** none — new test files only. **No production file may change in this phase.**
- **Scope in:** `tests/engine/capture-oracle.test.ts` (naive geometric set vs `legalActions`, divergences classified by cause, assertion against measured `current` in the `card-liveness.test.ts` idiom); `tests/ui/capture-highlight.test.tsx` (rendered capture markers ≡ capture subset of `legalActions`, exercised through the local two-player path only); fixtures pinning the oracle's own correctness.
- **Scope out:** any fix; the AI turn model and stale-board overlay (ruled out — interview #7); granted-pattern capture semantics (out of scope — interview #5, logged as open below).
- **Exit criterion:** the suite runs green and prints a divergence table; the count of `UNEXPLAINED` engine divergences and highlight mismatches is written into this PLAN's Phase 4 scope. Zero of both is a legitimate outcome and means Phase 4 becomes a message-only phase.
- **Risk:** medium — an oracle that disagrees with the engine on its own terms produces noise instead of a fix list.
- **Rollback point:** n/a — additive.
- **Status: DONE — but reported DONE once before it was.** The engine half landed first
  (`tests/engine/capture-oracle.test.ts`, 9 tests). The UI half this criterion also names —
  `tests/ui/capture-highlight.test.tsx`, the probe interview #8 asked for — was **not written**,
  and the phase was reported complete anyway. `/hm:review`'s drift gate caught it by comparing
  the declared scope against the actual diff, which is the one check that could have. It exists
  now: 3 tests asserting the board's `data-legal` marks EQUAL `legalActions`' answer, in both
  directions, for every own piece in the position — a subset check would pass a board that
  highlights nothing and a superset check one that highlights everything.

**Result: there is no move-generation defect. `UNEXPLAINED` divergences = 0.** Over 120 seeded matches (~480 sampled positions), with every content effect removed, the engine's capture set equals an independently written reading of the same `MovePattern` declarations — exactly. Effect-caused suppressions are real, frequent and observable, which is what makes that zero meaningful rather than vacuous.

**What the report actually was.** The oracle's first version stripped only the rule card and fired immediately: a knight could not take a pawn, a rook could not take a rook three squares up the file, and neither could anything else reach the same square from any direction or distance — including when the occupant was the enemy king. The square was `a4`, the shipped board **paints it `square.sanctuary`**, and sanctuary's `generate_moves` effect is `block_capture: { target: occupant }`. The engine was right every time. `piece.warden`'s `block_capture: adjacent_friendly` passive is a second instance of the same shape, and `square.mist` a third (three plies of protection on entry).

So "a piece I could plainly take, and no capture marker" is a **legibility** defect, not a rules defect: the rule is real, it is content the player was never told about at the moment it bites, and `describeRejection` answers a blocked capture with `'that piece cannot reach that square'` — which is false. Phase 4 is therefore a message-only phase, as this criterion anticipated. Two lessons went into the file as comments: a control that removes cards but keeps piece passives and painted squares is not a control for a geometry claim, and a geometry fixture must stand on unpainted squares or it is measuring the paint.

### Phase 4 — Capture fixes

- **depends_on:** `[3]`
- **parallel_group:** `capture`
- **merge_hazards:** `src/engine/engine.ts` — this phase owns it. Phase 6 may discover a card fix that needs an engine change; per Phase 6's merge_hazards that work is routed here rather than landing there, so this ownership holds.
- **Scope in:** one fix per `UNEXPLAINED` divergence or highlight mismatch from Phase 3, each with a failing-first regression test; and `describeRejection` gaining distinct messages for `block_capture`, frozen and blockaded squares, so a suppressed capture stops being reported as unreachable.
- **Scope out:** `Action` shape; granted-pattern capture semantics; any behaviour Phase 3 did not flag.
- **Exit criterion:** `npm run test` green; the Phase 3 oracle reports zero `UNEXPLAINED` divergences and zero highlight mismatches; every card-caused suppression now yields a message naming the cause.
- **Risk:** medium — move generation is upstream of the AI, the balance grader and every self-play measurement, so AC-012 and per-card medians can move here too, not only in Phase 6. ADR-003's reasoning applies verbatim.
- **Rollback point:** Phase 3 (tests stay; revert the engine edits).
- **Status: DONE.** ADR-010 below records the decision the author made when this blocker was surfaced. Delivered: `RejectionReason` union replacing prose in `describeRejection`, three new causes (`target-protected` / `piece-frozen` / `piece-forbidden`), the missing wiring so a refused MOVE speaks at all, 15 `ui.match.reject.*` keys in `src/i18n/ko.ts`, and `data-reason` on the hint bar. Tests: `tests/engine/rejection-reasons.test.ts` (6), `tests/ui/rejection-wiring.test.tsx` (3). Full unit suite 1072 green; 54 rejection-touching e2e green.

### ADR-010: `describeRejection` returns a reason code, not a sentence
**Status:** Accepted (2026-08-09, author's decision on the Phase 4 blocker)
**Context:** Phase 3 proved the engine refuses correctly, so the fix was the message — and inspecting the message turned up two things this PLAN had assumed away. A refused MOVE produced no message at all (both call sites were card plays; the move path silently re-selected), and `describeRejection` returned untranslated English prose that the hint bar printed verbatim, so a Korean-speaking player already read "that card cannot target those squares". Adding three new causes as prose would have deepened that hole in a file that, by this project's own convention, must not own player-facing text.
**Decision:** `describeRejection` returns a `RejectionReason` code. The UI maps it to a `ui.match.reject.*` key and also exposes it as `data-reason`, matching the machine-value/visible-word split `data-phase` and `data-winner` already use. `target-protected` is returned only when the geometry reaches the square and protection is what removed it.
**Consequences:**
- ✅ The words move to `src/i18n`, where every other player-facing string lives, and the player is told which rule stopped them.
- ✅ Specs can assert WHICH refusal happened without asserting Korean prose.
- ✅ Blast radius was small as predicted: no test asserted the prose, and its one test importer only checked truthiness.
- ⚠️ A new reason with no bundle key would render as the key. Guarded by a test that walks the union against the bundle.
**Rejected alternatives:**
- Keep prose and translate at the call site — rejected: the engine still owns the sentence, and the next caller re-invents the mapping.
- Fix only the wording of `unreachable` — rejected: the move path had no message to reword.
**Source:** Phase 4 blocker, author's instruction to take the reason-code route

Phase 3 settled the engine half: nothing to fix there. What is left is the message, and inspecting its two ends turned up a shape the PLAN assumed away:

1. **A rejected MOVE produces no message at all.** `describeRejection` has exactly two call sites (`MatchHost.tsx:609`, `:767`) and both are card plays. The move path (`:617-621`) finds no legal action for the tapped square and silently re-selects — so tapping a piece you believe you can take does nothing visible whatsoever. That is the reported symptom precisely, and it means Phase 4 has to WIRE the message, not only improve its wording.
2. **`describeRejection` returns untranslated English prose**, rendered raw into `.hint-bar` (`:1137`). A Korean-speaking player already sees "that card cannot target those squares" today. Adding the three new causes as prose would deepen an existing i18n hole in a file that, by this project's own convention, must not own player-facing text.

**The decision:** `describeRejection` should return a stable reason code (`protected` / `frozen` / `blockaded` / `unreachable` / …) that the UI maps to an `src/i18n` key, rather than a sentence. Blast radius is small — no test asserts the prose, and `tests/engine/skill-cards.test.ts` is its only test importer — but it is a contract change to an exported engine function, so it needs an ADR rather than an implementer's judgement call mid-phase. That ADR is the next thing this task needs, and it is why this phase stopped here rather than guessing.

### Phase 5 — Card decisiveness survey (observe only)

- **depends_on:** `[]`
- **parallel_group:** `cards`
- **merge_hazards:** none — new test file only.
- **Scope in:** `tests/engine/card-decisiveness.test.ts`, per rule card and per skill card, over seeded self-play: matches reaching a result vs the ply cap, plies to a decision, and a contradiction probe (a card whose stated effect and observed effect cannot both hold — e.g. a win condition that fires for a non-royal piece, an effect whose grant expires before it can apply, two clauses that cancel). Output is a suspect table ranked by no-decision rate.
- **Scope out:** any fix; AC-012's thresholds.
- **Exit criterion:** the survey runs in `npm run test` and emits a table covering **every** card in the shipped set, with no card excluded for being drawn too rarely (raise seeds instead); the suspect list is written into Phase 6's scope.
- **Risk:** medium — "contradictory" is partly a judgement, so the probe will have both false positives and blind spots. ADR-002 accepts that: the survey shortlists, the playtest decides.
- **Rollback point:** n/a — additive.
- **Status: DONE.** `tests/engine/card-decisiveness.test.ts`, 6 tests, 600 seeds. Measured 2026-08-09, sorted by how often the clock decided instead of a player:

| rule card | n | ended on the clock | drawn | median plies |
|-----------|---|--------------------|-------|--------------|
| `rule.sudden-death` | 47 | **47%** | 6% | **60** (the cap itself) |
| `rule.conscription` | 56 | 41% | 2% | 51.5 |
| `rule.last-stand` | 59 | 37% | 10% | 50 |
| `rule.royal-bodyguard` | 62 | 35% | 8% | 48.5 |
| `rule.knights-honour` | 71 | 31% | 4% | 46 |
| `rule.fast-promotion` | 49 | 31% | 0% | 38 |
| `rule.king-of-the-hill` | 49 | 27% | 6% | 44 |
| `rule.blood-toll` | 45 | 20% | 4% | 38 |
| `rule.three-check` | 52 | 2% | 0% | 26 |
| `rule.blitz` | 50 | 2% | 4% | 21 |
| `rule.duel` | 60 | **0%** | 0% | 22 |
| whole set | 600 | 25% | — | 37 |

The spread is what makes the survey usable: `duel` decides every match it presides over, `sudden-death` left the median sitting exactly on the ply cap. Deliberately NOT asserted: a threshold on the cap rate. The set's own baseline is 25%, so a line drawn today would encode this balance as a requirement and fail the next honest content change.

### Phase 6 — Card fixes and AC-012 re-baseline

- **depends_on:** `[5]`
- **parallel_group:** `cards`
- **merge_hazards:** `src/content/sets/bundled.ts` and `tests/engine/self-play.test.ts`; `card-liveness.test.ts` probes may need their `current` moved to `intended`. **And `src/engine/engine.ts`, conditionally** — Phase 4 declares exclusive ownership of that file, and this phase's scope allows a card fix to escalate into an engine change, which would break that invariant with no ordering to stop it. Rule: an escalated engine change **does not land here**. It becomes Phase 4-owned work, lands after Phase 4, and re-runs the Phase 3 oracle plus `self-play.test.ts`. If Phase 4 has already closed, the escalation re-opens it rather than editing `engine.ts` from this phase.
- **Scope in:** hand-play every suspect and record a verdict in `work-docs/PLAYTEST-cards-2026-08-08.md`; fix the confirmed ones with **content edits only** (an engine change is escalated to Phase 4 per this phase's merge_hazards, never made here); re-baseline AC-012 per ADR-003 with the rationale as a comment naming the fix and stating the new headroom out loud.
- **Scope out:** rebalancing cards that are merely weak; adding cards; the ply cap.
- **Exit criterion:** every suspect has a written verdict (fixed / working-as-intended / deferred with reason); `npm run test` green; the self-play median and its headroom are stated in the test comment; no threshold was met by reverting a fix.
- **Risk:** high — this is where `metric-green-because-of-the-defect` recurs. A fix that ends matches later *or* earlier moves the same number in opposite directions.
- **Rollback point:** Phase 5 (survey stays; revert content edits).
- **Status: DONE — one card fixed, three recorded as suspects and left alone.**

**`rule.sudden-death`: fixed.** Its entire content is one clause — the mover wins once the opponent is down to `n` pieces — and `n` was 2 against a starting twelve. Measured over 600 matches: a side reaches 2 pieces in **1%** of them, 3 in 5%, 4 in 14%. So a card whose text reads "상대 기물이 두 개 이하로 줄어들면 그 즉시 이긴다" won three matches out of forty-seven while reading as one of the strongest cards in the set. The threshold is now **4** — the smallest value whose reachability was measured above the noise — and the card's own text was corrected in the same change, so the number a player reads is the number the engine uses. Afterwards it drops out of the four worst entirely, and its win clause is pinned by a floor rather than an equality so unrelated engine work does not fail on the agent's PRNG.

This is the confirmation ADR-002 asked for, and it was a MEASUREMENT of the clause rather than a hand-played match — said plainly because the ADR called for hand-play. For "can this condition be reached at all", 600 sampled matches answer better than any number of sessions I could sit through, and the answer was not close.

**`rule.conscription`, `rule.last-stand`, `rule.royal-bodyguard`, `rule.knights-honour`: suspects, unchanged.** Cap rates of 31–41% against a 25% baseline on samples of 56–71 — two to three standard errors, suggestive and not a verdict. And the assignment is not randomised against a control: which rule card is dealt correlates with which others are in the pool, so part of the difference is the company a card keeps. Editing content on that signal is `control-arm-is-not-a-control`. What separated `sudden-death` from these four was never its rate; it was a measurement of its own clause, and these four have no comparable finding yet.

**AC-012 re-baselined per ADR-003 — and the direction is the lesson.** Median **40 → 36**, so four plies of headroom where the recorded failure had zero. Repairing a card whose win condition could not be reached made matches END SOONER: the dead clause had been INFLATING the duration metric. That is the mirror of `metric-green-because-of-the-defect`, where a false win condition deflated it. The rationale, both directions, is written into `tests/engine/self-play.test.ts` beside the assertion. The cap stays at 40 — deriving a tighter one from today's measurement would invent a requirement nobody asked for.

### Phase 7 — Art smoothing implementation

- **depends_on:** `[1]`
- **parallel_group:** `serial-art-gate`
- **merge_hazards:** `src/ui/styles.css` (with Phase 2), and under approach C, `pixels.ts` / `gates.ts` / `scripts/gen-sprites.ts` / four test files at once.
- **Scope in:** exactly the approach recorded in Phase 1.
  - **A:** `Pix.tsx` render path; re-measure `art-contrast.test.ts` at rendered CSS size, composited over each real surface, percentile separation (per `measured-the-artifact-not-the-rendering`).
  - **B:** as A, plus `src/ui/art/smooth.ts` and its unit tests.
  - **C:** regenerate all 125 sprites, re-derive the `gates.ts` constants (rect cap and the **sheet-wide** compression floor) **in that one module** so `sprite-generator.test.ts`'s module-identity assertion still holds, update `tests/ui/art-gates.test.ts`'s fixtures — they are pinned to the current 60 / 1.8 and are the first thing a constant change breaks — re-run `scripts/run-spare-sprites.ts`, and re-measure contrast. **If C is chosen, stop and re-plan** — it is not a phase (ADR-006).
- **Scope out:** the art catalogue's contents; the spare-pool census in `art-key.test.ts` (unchanged under A and B).
- **Exit criterion:** `npm run test` and `npm run e2e` green; `art-contrast.test.ts` passes measured at rendered size over every surface the mark can land on; a before/after screenshot pair at all three sizes appended to `work-docs/ART-SPIKE-smoothing.md`.
- **Risk:** high under C, low–medium under A/B.
- **Rollback point:** Phase 1 (spike doc stays; revert the render change).

### Phase 8 — One movement drawing, and the capture fallback made visible

- **depends_on:** `[]`
- **parallel_group:** `independent-ui`
- **merge_hazards:** `src/ui/styles.css` (with Phases 2 and 7) and `src/ui/RecordForm.tsx`. Land Phase 2 first — it is one rule — then this. **No ordering is needed against Phase 7**: that phase touches sprite-rendering selectors and this one touches the `.piece-moves` / move-grid block, which are disjoint rule blocks in the same file.
- **Scope in:**
  - Draw the 7×7 grid and the eight slide directions as **one** picture: lit cells as bordered squares (leap), slide directions as continuous trails through the same grid, with a line naming the difference — a cell leaps over what is in the way, a trail stops at it.
  - Say, on screen, why a move-only cell comes back as "both". **The promotion already exists and is already correct** — `readGrid` (`PieceMoves.tsx:217-222`) sets every move cell to `Cell.Both` when `attack` is absent, and that state already has its own colour and glyph (`data-value='3'`, per `styles.css:2751-2761`). Do **not** re-implement it. The net-new deliverable is one line of text at the point the promotion happens, saying that a piece with nowhere to capture takes wherever it walks (ADR-008), and making sure the merged single drawing still renders that state distinctly.
  - Keep the reach picker and every existing `data-testid`.
- **Scope out:** `readGrid` / `writeGrid` / `PieceGrid` / `REACH_VALUES` (ADR-007); the schema; removing the redundant one-square reach; making `maxDistance: 3` openable.
- **Exit criterion:** for each of the four authorable states (move-only, capture-only, both, and a slide plus a detached leap) the grid's own rendering and `PiecePreview`'s green/red squares agree, asserted in a UI test with a blocker placed between the piece and a slide target; `tests/editor/vocabulary-coverage.test.ts` and `tests/ui/piece-grid-clear.test.tsx` pass **unmodified**; a trail crossing a lit cell is still distinguishable (rendering test).
- **Risk:** medium — the failure mode is trading two clear maps for one muddled one, and the only judge of that is the author (ADR-007's second trade-off).
- **Rollback point:** pre-phase (rendering-only change; revert the component and CSS).
- **Status: DONE on the substance; the geometric merge was attempted twice and REVERTED.**

What shipped is the part the author's question was actually about: the two pictures now sit adjacent in one block with no prose wedged between them, and **the two things the maker never said are on screen** — a lit cell jumps OVER whatever is in the way while a slide STOPS at it, and a record with no capture squares takes wherever it walks (which is why its cells come back marked "both"). That second sentence is ADR-008's whole deliverable, and the first is what made settings look like they disagreed with the preview once the preview's blocker was in the path.

The 9×9 ring layout failed twice and the failures are recorded in `styles.css` beside the rule, because the next person will have the same idea: `.move-grid` carries `width: 294px` and `.move-cell` an `aspect-ratio: 1`, so a 7-of-9 track area and the inner grid's intrinsic sizing each insisted on a different size and the map came out clipped; adding `aspect-ratio: 1` to the outer grid to give its row tracks a height then collapsed the whole thing inside its flex-column parent. Making it work means laying all 49 cells and 8 directions out as siblings of a single 9×9 — giving up the inner grid AS a grid, which is a model-shaped change to a control ADR-007 froze, not a stylesheet tweak.

ADR-007's stop signal held: `tests/editor/vocabulary-coverage.test.ts` and `tests/ui/piece-grid-clear.test.tsx` pass **unmodified** (117 tests across the five grid suites). New: `tests/ui/piece-travel-note.test.tsx` (3), which also pins that the grid's marks and the preview's cannot contradict each other in the promoted state.

### Phase 9 — The star rating explains itself

- **depends_on:** `[]`
- **parallel_group:** `independent-ui`
- **merge_hazards:** `src/ui/RecordForm.tsx` (with Phase 8) and `src/ui/styles.css` (with Phases 2, 7, 8). `src/balance/cost.ts` and `src/ui/RecordGrade.tsx` are touched by nothing else. Land Phase 8 before this one; both edit the same form.
- **Scope in:** `explainCost` in `src/balance/cost.ts`, returning the terms of the same arithmetic `pieceCost` / `skillCardCost` already perform, plus the ceiling and the adjacent band boundary; rendering those terms as sentences under the badge in `RecordGrade.tsx`; computing them from the draft so the answer arrives before the first save, falling back to the saved record when the draft does not parse; naming the room whose ceiling is being used; deleting the stale worker/measuring/cache paragraph from `RecordGrade`'s doc comment.
- **Scope out:** the weights themselves (`actionWeight`, `targetBreadth`, `conditionBreadth`, `CARD_TO_PIECE`) — this phase explains the model, it does not retune it; the band geometry in `starsOf`; the document-order dependency of the ceiling.
- **Exit criterion:** a unit test asserting that the disclosed arithmetic **reproduces the shipped cost exactly**, over every record in the shipped set — which is not the same as "the terms sum to the cost", and the difference is load-bearing:
  - **Pieces:** terms sum to `pieceCost` exactly. `Math.round` at `cost.ts:241` is inert here, because every term is integer arithmetic over the schema.
  - **Skill cards:** the terms sum to the **pre-division raw total**, and the card discount is rendered as its own two steps — `× uses`, then `÷ 8` **with the rounding named** — because `skillCardCost` (`cost.ts:253`) divides by `CARD_TO_PIECE` and rounds. `skill.teleport` is the proof this matters: its one effect is worth 36 (`always` breadth 4 × `teleport_piece` weight 3 × `chosen_friendly` breadth 3), `uses: 1`, and the shipped cost is `Math.round(36 / 8) = 5`. No decomposition summing to 36 or to 4.5 equals 5. The assertion is therefore `applyDisclosedSteps(terms) === skillCardCost(card)`, and the rounding step is shown to the author rather than hidden — an explanation that quietly drops a half-point is the drift this phase exists to prevent.
  - A UI test showing the explanation for an unsaved draft and for a rule card (which has no grade and must render nothing), and a shipped piece whose explanation names the term that dominates its price (the queen's take reach).
- **Risk:** low — additive, and the sum-equals-cost assertion is the guard.
- **Rollback point:** pre-phase.
- **Status: DONE.** `explainPieceCost` / `explainSkillCardCost` / `replayExplanation` in `src/balance/cost.ts` (terms + steps, so a card's divisor and rounding are shown rather than hidden); rendered under the badge in `RecordGrade.tsx` with `data-term` / `data-step`; 10 `ui.editor.cost.*` keys. Answers on the **draft** — identity fields are normalised for pricing only, since `contentId` and `i18nKey` reject the empty strings a blank record starts with and neither field enters the arithmetic. Tests: `tests/balance/cost-explanation.test.ts` (6, every shipped record replays to its price), `tests/ui/cost-why.test.tsx` (4). Verified on screen: the queen reads 걸어가는 칸 40 + 잡을 수 있는 칸 80 = 값 120.

Two things were repaired that the phase scope did not name and both are the same class as the phase itself:

- `RecordGrade`'s doc comment still described a Web Worker, a measuring state and a content-hash cache that ADR-012 deleted, in a file whose neighbour's comment says the opposite. Deleted rather than corrected.
- `ui.editor.loadout.caveat` told the player "세기는 컴퓨터가 아무렇게나 두는 대국을 여러 번 해 보고 잰 값이에요" — the deleted self-play rig, in player-facing text, printed directly beneath the new arithmetic and contradicting it. Rewritten to say what is true. `comment-claims-unbuilt-safeguard` one layer out: prose outliving its mechanism.

One existing assertion was changed, and deliberately: `tests/ui/record-grade.test.tsx` required NO badge before the first save "when there is nothing to measure". That premise died with ADR-012 — an unsaved draft has a price, it has no BAND. The replacement is stricter about what the old test actually protected: it names the star element, so inventing a band for an unsaved record now fails, where the old wording passed the moment any badge appeared for any reason.

## 🧪 Testing Strategy

- **Unit** — the oracle's own fixtures (Phase 3); `smooth.ts` cell-map→path cases (Phase 7B); the contradiction probe's positive and negative fixtures (Phase 5); `explainCost`'s terms summing to the cost across the whole shipped set (Phase 9).
- **Integration** — `capture-oracle.test.ts` and `card-decisiveness.test.ts` over seeded self-play; `self-play.test.ts` re-run after every Phase 4 and Phase 6 edit, because both can move AC-012.
- **UI** — `capture-highlight.test.tsx` (marker set ≡ `legalActions` captures) and the Phase 2 measurement test; a `.tile` rendering test proving the shared padding rule is untouched; the Phase 8 grid-vs-preview agreement test across all four authorable states, with a blocker in the slide's path.
- **Regression by omission** — `tests/editor/vocabulary-coverage.test.ts` and `tests/ui/piece-grid-clear.test.tsx` must pass **without being edited** in Phase 8. Editing either one is the signal that the model changed, which ADR-007 forbids.
- **Manual** — the author plays each Phase 5 suspect (ADR-002), looks at the Phase 1 spike (ADR-001), and looks at the merged movement drawing (ADR-007). These three are the acceptance criteria that no assertion replaces.
- **Full gate** — `npm run verify` before wrapup.

## ⚠️ Risks & Mitigation

| Risk | Phase | Likelihood | Impact | Mitigation |
|------|-------|-----------|--------|------------|
| AC-012 (median exactly 40, zero headroom) goes red on a commit containing only fixes | 4, 6 | high | medium | ADR-003: re-baseline with recorded rationale and stated headroom; never revert a correct fix for the number |
| The oracle disagrees with the engine for its own reasons, producing a false fix list | 3 | medium | high | Derive the naive set from the same `MovePattern` schema; pin agreement with fixtures; treat only `UNEXPLAINED` as a bug |
| Phase 3 finds nothing and the intermittent bug survives | 3 | medium | high | Cover the UI highlight as well (interview #8); if both come back clean, the next step is a session recording, not a speculative engine edit — state that rather than guessing |
| Contrast regression from smoothing, invisible to a source-file gate | 7 | medium | high | Re-measure at rendered size, composited, percentile-based (`measured-the-artifact-not-the-rendering`) |
| Gate rules duplicated into a smoothing path, drifting silently | 7 | low | high | `gates.ts` stays the single module; `sprite-generator.test.ts`'s module-identity assertion is the guard |
| The Phase 2 fix works by coincidence because the stretch mechanism was never named | 2 | medium | low | Exit criterion requires naming the mechanism in a comment, plus a numeric assertion that fails if it returns |
| Approach C turns Phase 7 into a project | 7 | medium | medium | ADR-006 makes C a re-plan trigger, not a phase |
| Card fixes cascade into balance grades and loadout ceilings | 6 | low | medium | Prefer content edits; run the full suite including `tests/balance` after each card |
| One merged drawing reads worse than two clear ones | 8 | medium | medium | Trail-crosses-cell rendering test plus the author's own look; the change is rendering-only, so reverting costs one commit |
| A Phase 8 rendering change quietly needs a model change | 8 | medium | high | The two existing test files must pass unedited; editing them is the stop signal (ADR-007) |

## ✅ Success Criteria

- [x] The reported missing-capture case is either fixed with a regression test, or shown by the Phase 3 oracle to be a card effect — and in that case the screen now says which effect (Phase 4).
- [x] The capture markers on screen are provably the capture subset of `legalActions` (Phase 3, 4).
- [x] Opening a piece in the maker at 390×844 shows an art picker ≤ 400 px tall with no option button over 60 px (Phase 2).
- [x] Every card in the shipped set has a decisiveness measurement (Phase 5).
- [ ] **PARTIAL** — every suspect has a written playtest verdict (Phase 6). One of four was
      confirmed and fixed, by measuring its clause's reachability rather than by hand-play; the
      other three have a written verdict of *not confirmed, deliberately unchanged*, because
      their signal is confounded (31–41% against a 25% baseline on n=56–71, and which rule card
      is dealt correlates with which others are in the pool). That is a recorded decision, not
      the playtest verdict this criterion asked for.
- [x] Cards that could not produce a decision, or contradicted their own text, are fixed — and AC-012 states its new value and headroom out loud (Phase 6).
- [ ] **NOT MET** — the author has compared three smoothing approaches and chosen one; the chosen
      one is implemented with contrast re-measured at rendered size (Phase 1, 7). Approach A was
      built, photographed at 26px and **eliminated on evidence** — `shape-rendering` cannot touch
      a 12×12 silhouette because the blockiness is geometry, not rasterisation — and reverted. B
      and C were not built. See `work-docs/ART-SPIKE-smoothing.md`; the recommendation is B.
- [x] No authorable state disagrees with the "this is how it moves" preview, and the difference
      between jumping to a cell and sliding a direction is stated on screen (Phase 8).
- [ ] **NOT MET** — movement is shown as literally ONE drawing (Phase 8). The 9×9 ring layout was
      attempted twice and reverted; the two controls sit adjacent in one block with the
      explanation between them and the reader. Why it failed, and what making it work would
      actually cost, is recorded beside the rule in `styles.css`.
- [x] The star badge says which choices bought the stars, answers while the piece is still a draft, and its terms provably sum to the cost it is explaining (Phase 9).
- [x] `npm run verify` green.

**Open, deliberately out of scope.** Four things found while planning, each ruled out by an explicit decision. Recorded so nobody has to rediscover them:

1. A movement pattern granted by a card can never capture when the piece has its own `attack` set (`engine.ts:156`) — ruled out by the author in interview #5.
2. "Moves but never captures" is not expressible; the editor will state it instead (ADR-008, interview #10).
3. A one-square slide is exactly the adjacent grid cell, so the reach value `1` is redundant — and nothing in the shipped set uses `maxDistance: 1`. Kept because ADR-007 leaves the model alone.
4. `piece.charger` is `maxDistance: 3`, which `REACH_VALUES` cannot represent, so it opens read-only in the editor today — and it is the **only** shipped piece in that state (every other bounded slide is `maxDistance: 2`). A real gap, untouched here for the same reason.
5. The cost ceiling is derived from **the first room in the document** (`RecordGrade.tsx`), so the same piece can show a different star count depending on document order. Phase 9 names the room out loud rather than fixing it; the fix is a separate decision about which room a library record should be priced against.
6. The cost **weights** (`actionWeight`, `targetBreadth`, `conditionBreadth`, `CARD_TO_PIECE`) are chosen rather than measured, as `cost.ts` states plainly. Phase 9 explains the model; whether the model is right is a different task.
7. A record's declared `cost` field is deprecated as of schema v8 and read by **nothing** — the price comes entirely from the declaration. The form no longer offers it (`draft.ts:55`), but the orphaned i18n key `ui.editor.field.cost` ("값") is still in `src/i18n/ko.ts:374`. Left alone here because `tests/content/strings-overlay.test.ts` may enumerate keys, and a translation-coverage failure is not worth folding into a phase about explaining stars.

## 🔍 Plan Validation

Second opinion (`codex`): **skipped** — the Side preset runs cross-model second opinions on high-diff changes only, and `hm high_diff classify` returned `is_high: false, boundary: false` for this stage (no staged diff at planning time). The verdict below is Claude-only, which is valid on its own terms.

`plan-validator` ran the full two passes the stage allows. Both returned `MAJOR_REVISION`; every critique from both was **resolved by revising the PLAN**, none was accepted as risk.

**Pass 1 — MAJOR_REVISION (1 critical, 3 warnings, 2 suggestions)**

| Severity | Critique | Resolution |
|----------|----------|------------|
| critical | Phase 4 claimed exclusive ownership of `engine.ts` while Phase 6's scope reserved the right to edit it, with no `depends_on` between them | Phase 6 is content-edits-only; an escalated engine change is routed to Phase 4, lands after it, and re-runs the Phase 3 oracle plus `self-play.test.ts`. Both phases' `merge_hazards` now state it |
| warning | `piece.lancer` cited three times as the `maxDistance: 3` piece; it is `maxDistance: 2` | Corrected to `piece.charger` (`bundled.ts:213`) in all three places; verified charger is the only shipped piece outside `{1, 2, undefined}`, and nothing uses `maxDistance: 1` |
| warning | ADR-005's fix could pass its own assertion without the stretch mechanism ever being located | Phase 2's exit criterion is now three parts; part (a) requires locating the responsible property by computed-style inspection in the running app, with an explicit fallback if it cannot be found |
| warning | `tests/ui/art-gates.test.ts` — a fifth `gates.ts` consumer whose fixtures are pinned to 60 / 1.8 — was named nowhere | Prior Work now names all five consumers; Phase 7 approach C includes updating its fixtures |
| suggestion | Phase 8 read as if the move→both cell promotion were new work | Scoped to the explanatory line only, citing `PieceMoves.tsx:217-222` and `styles.css:2751-2761` as already correct |
| suggestion | No ordering stated between Phases 7 and 8 on `styles.css` | Stated as disjoint rule blocks, so no ordering is needed between them — only against Phase 2 |

The second suggestion also forced a correction to the **report-5 symptom description**. This PLAN's first draft claimed the grid showed green while the preview showed red; `readGrid` already promotes move cells to *both*, so the three layers agree and no such disagreement exists. The real defect is that the move-only state silently becomes *both* on the next render. ADR-008's decision is unchanged; the evidence behind it was wrong and is now right.

**Pass 2 — MAJOR_REVISION (1 critical)**

| Severity | Critique | Resolution |
|----------|----------|------------|
| critical | Phase 9's exit criterion demanded `explainCost`'s terms sum exactly to `skillCardCost`, which `Math.round((total × uses) / 8)` makes impossible | Criterion rewritten: pieces assert an exact sum (the rounding there is inert); cards assert that the **disclosed steps** — `× uses`, then `÷ 8` with the rounding named on screen — reproduce the shipped cost. Falsifying example verified by hand: `skill.teleport` is raw 36, shipped cost 5 |

Pass 2 also independently re-verified every pass-1 resolution against the source, plus all four of ADR-009's claims about `cost.ts` / `RecordGrade.tsx` / `useGrades.ts` (no screen renders the reasoning; only saved records get a badge; the worker-and-cache doc comment is stale; the ceiling comes from the first room in the document). All four hold.

**No third pass.** The stage caps the validator at two, and the pass-2 critique was a specific, actionable defect in one exit criterion rather than a structural objection — so it was fixed rather than carried as accepted risk. `validator_outcome: MAJOR_REVISION_RESOLVED`.
