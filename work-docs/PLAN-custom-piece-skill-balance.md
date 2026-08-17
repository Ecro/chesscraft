---
type: plan
task_slug: custom-piece-skill-balance
status: complete
created: 2026-08-08
tags: [chess-craft, plan, typescript, zod, content-vocabulary, game-balance, ugc]
research_doc: "[[RESEARCH-custom-piece-skill-balance]]"
interview_rounds: 5
adrs: 11
validator_outcome: MAJOR_REVISION_RESOLVED
summary: "Measured self-play delta is the grade; grade-matched replacement + budget sum gate the loadout"
---

# PLAN — a self-made piece and a self-made skill, graded by measurement

## 🎯 Executive Summary

**TL;DR.** Each side brings one custom piece and one custom skill card into a match through a
per-side **loadout** carried by the room (`preset`). What stops a broken loadout is not a
hand-written price list: a record's **grade is the win-rate delta it produces in seeded random
self-play**, measured against a fixed baseline. The custom piece may only replace a bundled piece
**of the same grade**, and the piece+skill pair must fit the room's **budget**. Two things are
banned outright rather than priced — `win` and `royal` — because a 6×6 board under a 60-ply cap
makes them dominant at any price.

**What.** Schema v8 adds `preset.loadout`; a new `src/balance/` module measures records; the
loader enforces a duel-legal profile on loadout slots; a Web Worker measures on save; the editor
shows a grade badge and a budget meter.

**Why.** The content vocabulary is closed and declarative (`src/content/schema.ts:11-14`), so
structural bans are total and free. But the user's requirement is a *grade with an objective
index*, and for skill cards no closed-form value formula exists — only measurement does. The
measurement rig already ships: `playOut` (`src/engine/agent.ts:68`) and the 1000-seed harness in
`tests/engine/self-play.test.ts`. **Measured on this machine at 1.89 ms/match**, so a 200-seed
candidate-vs-control comparison is ~0.8 s in Node and a few seconds in a phone's Web Worker.

**Key decisions.** Loadout on the room (ADR-001) · measured delta is ground truth and the static
formula is a *fitted predictor*, not an invented price list (ADR-002) · the ban attaches to the
loadout slot rather than to a record's provenance (ADR-003) · budget sum is the gate (ADR-004) ·
measure automatically on save (ADR-005) · uniform-random agent accepted (ADR-006) · grades are
never read from a document (ADR-007) · grade-matched replacement (ADR-008).

**Estimated impact.** One schema bump (v7→v8), one new module (`src/balance/`), one new worker,
loader validation additions, two editor screens. No engine rule changes beyond honouring the
loadout at match setup.

## 📚 Prior Work

- **`specs/SPEC-variant-chess-6x6-cards.md:208-209`** — "**Balance tuning of the card set**" is a
  standing SPEC Non-Goal. This PLAN overrides it for a scoped subset; ADR-009 records that
  deliberately rather than letting the divergence be discovered later.
- **[[RESEARCH-custom-piece-skill-balance]]** — the three approaches (structural / budget /
  empirical) and the two blocking structural facts this PLAN resolves.
- **`[wiki:architecture] preset-is-the-room`** (2026-08-06, decided with the user) — a preset IS
  the room; content stays shared and there is no room-private piece. The loadout is therefore a
  *selection* the room makes over the shared library, never a private copy. ADR-001 obeys this.
- **`[fail:design] declared-but-inert-vocabulary`** (count:5, the project's most-recurring
  failure) — `cost` is a live instance today: it validates, `RecordForm.tsx:1235` writes it, and
  nothing reads it. Every field this PLAN adds lands in the same phase as its interpreter, and
  ADR-007 exists specifically so `grade` never becomes instance #6.
- **`tests/engine/card-liveness.test.ts`** — 4 of 26 shipped cards were broken, and 3 of the 4
  *did* change state, just the wrong state. A grade of ~0 delta is therefore ambiguous between
  "gentle" and "inert", which Phase 3's exit criterion has to separate.
- **`[wiki:architecture] effect-subject-quantifier-mover`** — the subject/quantifier/mover
  distinction any authored effect can trip over; the measurement harness inherits it unchanged.

## 🎙️ Interview Transcript

| # | Topic | Category | Question | Options | Choice | Note | → ADR |
|---|---|---|---|---|---|---|---|
| 1 | Loadout storage | Contract shape | Where does the per-side "my piece / my skill" selection live? | preset field (v8) / `createMatch` param / asymmetric board only | **preset field (v8)** | Keeps it exportable and seed-reproducible; obeys preset-is-the-room | ADR-001 |
| 2 | Enforcement point | Risk tolerance | Where is an overpowered record refused? | fail-closed in loader / at loadout time / warn only | **Reframed by user**: "등급이 있어야 한다. 등급을 객관적으로 매길 수 있는 지표 필요" | User rejected all three options and redirected to a grading system | ADR-002 |
| 3 | Ban list | Scope boundaries | What is banned outright rather than priced? | `win` / `royal` / `revive_piece`+`spawn_piece` / nothing | **`win` + `royal`** | Revive/spawn stay priced, not banned | ADR-003 |
| 4 | Grade ground truth | Architecture | What defines the grade? | measured delta w/ formula as predictor / formula only / measurement only | **measured delta is truth, formula is the predictor** | The only option with zero hand-set final authority | ADR-002 |
| 5 | Enforcement rule | Contract shape | What does the grade actually enforce? | equal grades / grade ceiling / **budget sum** / end interview | **budget sum** | Piece+skill total must fit the room's budget | ADR-004 |
| 6 | Measurement timing | Implementation phasing | When does self-play run? | auto in Web Worker on save / explicit button / at loadout time | **auto in Web Worker on save** | Provisional (formula) grade instantly, confirmed (measured) grade seconds later | ADR-005 |
| 7 | Agent limitation | Risk tolerance | How to handle uniform-random agent blindness to skill-dependent power? | accept / add shallow search agent / add pattern warnings | **accept** | Keeps the SPEC's "no AI opponent" non-goal intact; recorded as a stated limitation | ADR-006 |
| 8 | Piece placement | Contract shape | How does the custom piece get onto the board? | author-chosen replacement / fixed slot / end interview | **grade-matched replacement** (user's own wording: "같은 기물 등급끼리 교체") | Stronger than either option offered; bounds the piece half of the budget to one band | ADR-008 |
| 9 | Absent `loadoutBudget` | Failure handling | A room has a loadout but no budget — what happens? | **refuse (fail-closed)** / schema default / unlimited | **refuse** | Raised by `plan-validator`; matches AC-011's fail-closed contract and structurally blocks the repo's most-recurring absent-case failure | ADR-010 |
| 10 | Budget's piece term | Contract shape | Bands are ≥2σ wide, so same-band pieces measure differently — which value feeds the sum? | **band representative** / raw measured delta | **band representative** | Raised by `plan-validator`; keeps what the grade advertises and what the budget charges identical | ADR-004 (revised) |

Two questions were generated and **not** asked because the 5-term gate rejected them, and both are
carried below as phase outputs rather than as assumptions: the **budget number** and the **grade
band boundaries**. Both fail the CLARITI term — they depend on a distribution nobody has measured
yet, so asking now would have produced a guess dressed as a decision.

## 📐 Architecture Decision Records

### ADR-001: The loadout is a field on the room, not a match parameter
**Status:** Accepted (2026-08-08, via /hm:plan interview)
**Context:** A per-side custom piece and skill card cannot be expressed today —
`presetDef.skillCardIds` is one flat pool and `createMatch` draws both sides' draft offers from it
(`src/engine/match.ts:56`). The selection needs a home.
**Decision:** Schema v8 adds an optional `preset.loadout: { white?: LoadoutSlot; black?: LoadoutSlot }`
where `LoadoutSlot = { pieceId, replaces, skillCardId }`. Every field is optional at the top level
and every v7 document loads unchanged.
**Consequences:**
- ✅ The loadout exports and imports with the room (AC-015), and a match stays reproducible from
  `(document, presetId, seed)` alone — AC-004 keeps holding.
- ✅ Obeys `preset-is-the-room`: the loadout is a selection over the shared library, not a private copy.
- ⚠️ The content vocabulary absorbs a duel-setup concept it did not have. `io.ts:44` must learn v8,
  and the v7 compatibility path needs a test.
**Rejected alternatives:**
- `createMatch(loadout)` parameter — rejected because the loadout would not survive export and the
  same seed would no longer reproduce the same match, breaking AC-004 and AC-015.
- Asymmetric board only — rejected because the skill half is unexpressible: both sides would draft
  from the same pool, so "my skill" could be dealt to the opponent.
**Source:** Interview #1

### ADR-002: A record's grade is its measured self-play win-rate delta; the static formula is a fitted predictor
**Status:** Accepted (2026-08-08, via /hm:plan interview)
**Context:** The user requires an *objective* index behind the grade. For pieces a published
closed-form estimate exists (`33N + 0.69N²` centipawns in attacked squares). For skill-card effects
none exists — any action-weight table is a number a developer invented, which is not objective and
ages every time the vocabulary grows.
**Decision:** `grade(record)` is defined as the win-rate delta the record produces over N seeded
`playOut` matches against a fixed baseline, versus a control run. The static formula is retained
**only** as a fast editor-time predictor, and its coefficients are obtained by regression against
the measured grades of bundled content — never hand-set. Where predictor and measurement disagree,
the measurement is correct by definition and the predictor is refit.
**Consequences:**
- ✅ No hand-set number has final authority anywhere in the system. This is the literal answer to
  "객관적으로 매길 수 있는 지표".
- ✅ Piece and skill grades come out in the same unit (win-rate percentage points), so ADR-004's
  budget sum needs no normalization step.
- ⚠️ Grades carry sampling noise: ±3.5 %p standard error at 200 seeds, ±1.6 %p at 1000. Bands must
  be coarse enough to survive it (Phase 3 exit criterion).
- ⚠️ A grade is only meaningful relative to a **fixed** baseline. Measuring against the room a
  record will actually be used in would make grades room-dependent and destroy budget comparability;
  the bundled default room is the fixed baseline.
**Rejected alternatives:**
- Static formula only — rejected: the skill-card half would be developer-invented weights.
- Measurement only, no formula — rejected: no instant feedback while authoring, and no way to
  explain *why* a record scored what it did.
**Source:** Interview #2, #4

### ADR-003: The duel-legal ban attaches to the loadout slot, not to a record's provenance
**Status:** Accepted (2026-08-08, via /hm:plan interview)
**Context:** `win` and `royal` must be unavailable to player-created records, but bundled content
uses both by design (ADR-012 of the base PLAN makes `win` ordinary vocabulary; `royal` defines the
king). Distinguishing "player-created" from "bundled" would need a provenance flag on every record —
a new field that can be forged in an imported document.
**Decision:** The ban is checked on **whatever the loadout names**, not on where a record came from.
A record carrying a `win` action or `royal: true` is perfectly legal in the library and in the draft
pool; it simply cannot occupy a loadout slot.
**Consequences:**
- ✅ No provenance field, therefore nothing to forge, therefore no absent-case for imported documents.
- ✅ Bundled content needs no exemption list and no migration.
- ⚠️ A player can still author a `win` card and play it via the ordinary draft pool if a room lists
  it. That is the pre-existing situation and is out of scope here.
**Rejected alternatives:**
- `authored: true` provenance flag — rejected: a forgeable field, and it would have to be set
  correctly by every write path including import.
**Source:** Interview #3

### ADR-004: The gate is a budget sum over the loadout pair
**Status:** Accepted (2026-08-08, via /hm:plan interview)
**Context:** With grades in hand, several enforcement shapes are possible: equal grades on both
sides, a grade ceiling, or a budget.
**Decision:** `bandValue(pieceId) + bandValue(skillCardId) ≤ preset.loadoutBudget`. The budget is a
room property, so a room can be gentle or wild, and the number is set once per room rather than per
match.

**Which value each term uses (revised 2026-08-08 after `plan-validator`, Interview #10):** the
**band representative**, not the raw measured delta. Phase 3 makes bands ≥ 2σ wide, so two pieces in
the same band can measure several points apart; charging the raw delta would mean two records the UI
calls the same grade consume different budget, and the answer to "why does my B-grade leave less
skill budget than yours?" would be a number the player cannot see. The band representative keeps
what the grade advertises and what the budget charges identical.
**Consequences:**
- ✅ Produces a real trade-off — a strong piece leaves less room for a strong skill.
- ✅ Composes with ADR-008 without contradicting it: grade-matched replacement **bounds** the piece
  term to one band, and the band representative then makes it a single definite value. (The earlier
  wording claimed the replacement rule "already fixes" the term; that was wrong while the sum used a
  continuous grade, and `plan-validator` caught it.)
- ⚠️ Both terms must be on one scale. ADR-002 supplies that for free.
- ⚠️ Band-edge strength differences are deliberately invisible to the budget. That is the price of
  making the displayed grade and the charged cost the same object.
- ⚠️ The budget's default value is unknown until Phase 3 measures the distribution; it is a phase
  output, not a decision made here.
**Rejected alternatives:**
- Equal grades on both sides — rejected: forces a matching partner record to exist.
- Grade ceiling — rejected: makes a strong creation unusable, which kills the reason to create.
**Source:** Interview #5

### ADR-005: Measurement runs automatically in a Web Worker on save, with a provisional grade first
**Status:** Accepted (2026-08-08, via /hm:plan interview)
**Context:** 400 matches (200 candidate + 200 control) is ~0.8 s in Node at the measured
1.89 ms/match, and a few seconds on a phone. That is too slow to block a save and far too fast to
justify a manual button.
**Decision:** A save returns immediately and displays the **predictor's** grade marked as
provisional. A Web Worker runs the measurement and replaces it with the **confirmed** grade. The
two states are visually distinct.
**Consequences:**
- ✅ No button to find, no ungraded records piling up, no blocked UI.
- ⚠️ A grade can change a few seconds after it first appears; the UI must say so rather than let it
  silently flip.
- ⚠️ A "not yet measured" state exists and every consumer (budget check, loadout picker) must handle
  it explicitly — the absent case is a first-class state, not a null to paper over.
**Rejected alternatives:**
- Explicit measure button — rejected: unmeasured records accumulate and the refusal has to be
  explained twice.
- Measure at loadout time only — rejected: no feedback while authoring, so a child builds blind.
**Source:** Interview #6

### ADR-006: The uniform-random agent is accepted as the measuring agent
**Status:** Accepted (2026-08-08, via /hm:plan interview)
**Context:** `agent.ts` is uniform-random *by construction* so that what it measures is a property
of the content rather than of an evaluator (`src/engine/agent.ts:19-24`). That is also its
limitation: a record that is only broken under competent play will grade as mild.
**Decision:** Accept it. Grades measure **structural** strength, not skilled exploitation, and the
PLAN records that as a stated limitation surfaced in the UI copy.
**Consequences:**
- ✅ The SPEC's "AI opponent is a non-goal" stays intact; no new subsystem.
- ✅ Reuses a harness already proven at 1000 seeds in CI.
- ⚠️ Skill-dependent brokenness is out of scope and must be said plainly to the player, not implied
  away by the word "등급".
**Rejected alternatives:**
- Shallow-search agent — rejected: requires amending a SPEC non-goal, and an evaluation function
  reintroduces exactly the "are we measuring content or the evaluator?" confusion `agent.ts` was
  built to avoid.
- Hand-written pattern warnings alongside — rejected: reintroduces developer-invented numbers,
  which ADR-002 exists to eliminate.
**Source:** Interview #7

### ADR-007: A grade is never read from a document; it is recomputed and cached outside it
**Status:** Accepted (2026-08-08, via /hm:plan interview inference — not a user-facing question)
**Context:** A measured grade has to be cached or every budget check re-runs 400 matches. Storing it
on the record would put a claimed number inside an importable document — and `cost` already proves
what happens to a number nobody verifies.
**Decision:** Grades live in a cache outside the content document, keyed by a content hash of the
record. An imported document contributes records, never grades. A cache miss means "measure it", not
"trust it".
**Consequences:**
- ✅ A hand-edited or hostile JSON cannot claim a favourable grade.
- ✅ Editing a record changes its hash, so a stale grade cannot survive an edit — the failure mode
  that would otherwise be invisible.
- ⚠️ First load of an imported room measures its loadout records before a match can start.
**Rejected alternatives:**
- `grade` field on the record — rejected: unverifiable declared data, i.e. the
  `declared-but-inert-vocabulary` shape with a security edge.
- Reusing `cost` for the measured value — rejected for the same reason; `cost` is instead
  deprecated in the schema comment and its editor control removed.
**Source:** Derived from Interview #4 + `[fail:design] declared-but-inert-vocabulary`

### ADR-008: The custom piece enters by grade-matched replacement
**Status:** Accepted (2026-08-08, via /hm:plan interview)
**Context:** A custom piece has to occupy a square. Adding one breaks material balance; replacing an
arbitrary one lets a pawn become a queen-tier piece.
**Decision:** `LoadoutSlot.replaces` names a bundled piece present in that side's board placements,
and the loadout is legal only when `grade(pieceId)` falls in the **same band** as
`grade(replaces)`. Every placement of the replaced piece on that side is substituted.
**Consequences:**
- ✅ Material and structure are preserved by construction; "내 나이트 대신 내 토끼" is the whole
  mental model.
- ✅ The piece term of ADR-004's budget is pinned by which piece you replace, so the two rules
  compose instead of competing.
- ⚠️ Replacing a `royal` piece must be refused — otherwise the loss condition moves.
- ⚠️ Bundled pieces must be graded too, which makes Phase 2's measurement of bundled content a
  prerequisite rather than a report.
**Rejected alternatives:**
- Author-chosen replacement with no grade constraint — rejected by the user in favour of grade
  matching.
- Fixed board slot — rejected: `boardDef` would need a slot marker and the choice disappears.
**Source:** Interview #8

### ADR-009: This PLAN overrides the SPEC's "Balance tuning" Non-Goal for a scoped subset
**Status:** Accepted (2026-08-08, after `plan-validator` MAJOR_REVISION)
**Context:** `specs/SPEC-variant-chess-6x6-cards.md:208-209` declares balance tuning a Non-Goal:
"Cards must be schema-valid and playable; they are not required to be competitively balanced in the
MVP." Everything in this PLAN is balance work. The draft implemented that override without naming it,
which would have left the SPEC stale and the authorization undocumented.
**Decision:** The override is scoped and recorded here. The Non-Goal continues to hold for the
**ordinary draft pool and bundled card set** — nothing in this PLAN rebalances a shipped card. It is
lifted **only** for records occupying a loadout slot, which is a surface that did not exist when the
SPEC was written. The SPEC is flagged for a follow-up amendment via `/hm:spec`; this PLAN does not
edit it.
**Consequences:**
- ✅ A later `/hm:review` diffing against the SPEC finds a recorded decision instead of a divergence.
- ⚠️ Until the SPEC amendment lands, SPEC and PLAN disagree in writing. That is visible and dated
  rather than silent.
- ⚠️ New acceptance criteria are needed for the loadout surface; the Success Criteria below are the
  draft of them, not a substitute.
**Rejected alternatives:**
- Editing the SPEC from inside `/hm:plan` — rejected: the SPEC is `/hm:spec`'s artifact, and
  amending it here would bypass its own 6-category interview.
- Leaving it unrecorded — rejected: this is precisely the failure `plan-validator` flagged.
**Source:** `plan-validator` critique #1

### ADR-010: A loadout with no `loadoutBudget` is refused
**Status:** Accepted (2026-08-08, via /hm:plan interview round 5)
**Context:** `loadoutBudget` is optional on the preset. An optional field that a gate activates on
has three possible absent-case behaviours, and leaving it unstated is the black-hole shape recorded
as this repo's most-recurring failure: a gate that silently no-ops for every document predating the
field.
**Decision:** **Fail-closed.** If `preset.loadout` names any slot and `preset.loadoutBudget` is
absent, `loadContentSet` refuses the document with a located error. A room that wants a loadout must
state its budget. Absence of `loadout` entirely remains perfectly legal and unaffected — that is the
common case and every v7 document is in it.
**Consequences:**
- ✅ The gate cannot be bypassed by omission, and the absent case is a tested fixture rather than an
  emergent behaviour.
- ✅ Consistent with AC-011's existing fail-closed contract, so the error shape is already defined.
- ⚠️ Creating a loadout room costs one more decision. The editor supplies Phase 3's derived default
  as a pre-filled value, so the number is offered rather than demanded.
**Rejected alternatives:**
- `z.default()` on the schema — rejected: the effective budget would not appear in the document, so
  "why was this refused?" is unanswerable from the exported JSON alone.
- Unlimited when absent — rejected: fail-open. A room that forgot the field would be exactly the
  unconstrained room this whole PLAN exists to prevent.
**Source:** `plan-validator` critique #2, Interview #9

### ADR-011: The duel-legal check is split — structural rules in the loader, grade rules beside the cache
**Status:** Accepted (2026-08-08, during `/hm:execute` Phase 4)
**Context:** Phase 4 as planned put all four rules inside `loadContentSet`. Two of them —
band matching and the budget sum — need measured grades, and a confirmed grade is 600 self-play
matches per arm. `loadContentSet` runs on every editor save; it cannot run twenty thousand
matches. The plan was not wrong about the rules, only about where one of them can physically live.
**Decision:** `loadContentSet` owns everything decidable from the document alone: the budget must
be declared when a loadout is (ADR-010), a slot may carry neither `win` nor `royal`, a replaced
piece must be non-royal and must actually stand on that side of the board. `@balance/legal`'s
`checkLoadoutGrades` owns band matching and the budget sum, taking grades as an argument from the
cache that recomputed them (ADR-007).
**Consequences:**
- ✅ Saving stays instant, and the structural half of the gate is still fail-closed on every path
  including import.
- ✅ An ungraded record is REFUSED by the grade half rather than scored as zero — treating
  "not measured" as "harmless" is how a budget gets bypassed by whatever measurement has not
  caught up with.
- ⚠️ Two enforcement points instead of one. The match-start path must call the second, or a room
  could be played with a loadout that never had its grades checked. That wiring is Phase 6.
**Rejected alternatives:**
- Grades inside `loadContentSet` — rejected: it would either block the UI for seconds on every
  save or force the loader to read grades from the document, which ADR-007 forbids.
**Source:** `/hm:execute` Phase 4 implementation

## 🚫 Non-Goals

- **Rebalancing the bundled card set.** SPEC line 208-209 continues to hold for the ordinary draft
  pool; only loadout slots are governed here (ADR-009).
- **A competent-play agent.** Grades measure structural strength under uniform-random play and
  nothing else (ADR-006). Skill-dependent brokenness is explicitly out of scope.
- **Grading records outside a loadout.** Bundled pieces are measured because ADR-008 needs something
  to match against; rule cards and square types are not graded at all.
- **Online play, matchmaking, or a shared ladder.** Unchanged SPEC non-goals; a grade is a local
  number, not a rating.
- **Moderation of shared content.** Import stays manual JSON (AC-015); the duel-legal profile is a
  balance gate, not a safety review.

## 🏗️ Technical Design

### Current state

| Fact | Location |
|---|---|
| Content grammar is closed; no code escape hatch | `src/content/schema.ts:11-14` |
| `SCHEMA_VERSION = 7` | `src/content/schema.ts:64` |
| `presetDef` has one flat `skillCardIds` | `src/content/schema.ts:454` |
| Both sides' draft offers come from that one pool | `src/engine/match.ts:56` |
| `boardDef.placements` already carries `side` | `src/content/schema.ts:407-413` |
| `cost` exists, is author-typed, and nothing reads it | `src/content/schema.ts:381`, `src/ui/RecordForm.tsx:1235` |
| `pieceDef` has no `cost` at all | `src/content/schema.ts:312-350` |
| Every save/delete revalidates the whole document | `src/editor/draft.ts:173`, `:270` |
| Import accepts any document declaring a known version | `src/editor/io.ts:44` |
| `playOut` plays a full random match | `src/engine/agent.ts:68` |
| Measured throughput | **1.89 ms/match** (1000 matches in 1886 ms, Node, this machine) |

### Affected components

- `src/content/schema.ts` — v8 `loadout`, `loadoutBudget`; `cost` made `.optional()` and deprecated
  at the type level, not merely commented (it is `z.number()` *required* today at `:382` and `:395`).
- `src/content/load.ts` — duel-legal profile validation on loadout slots.
- `src/engine/match.ts` — `createMatch` honours the loadout (piece substitution + per-side pool).
- `src/balance/` **(new)** — `measure.ts` (self-play delta), `predict.ts` (fitted formula),
  `bands.ts` (band assignment), `cache.ts` (hash-keyed grade store).
- `src/balance/worker.ts` **(new)** — Web Worker entry.
- `src/ui/RecordForm.tsx` — grade badge (provisional/confirmed), `cost` control removed.
- `src/ui/RoomDetail.tsx` — loadout picker + budget meter.

### Dependencies

None added. Zod, Vitest, Playwright and the Vite worker support already present are sufficient.

### Data flow

```
author saves a record
   └─ commitDraft → loadContentSet (unchanged)          ── instant
   └─ predict.ts → provisional grade → badge            ── instant
   └─ worker: measure.ts (200 candidate + 200 control)  ── ~0.8s node / few s phone
        └─ bands.ts → confirmed grade → cache.ts (by content hash) → badge

room owner sets a loadout
   └─ load.ts duel-legal profile:
        (a) loadoutBudget is present at all                        [ADR-010]
        (b) loadout slot record carries no `win`, no `royal`       [ADR-003]
        (c) band(pieceId) == band(replaces)                        [ADR-008]
        (d) replaces is non-royal and present in that side's placements
        (e) bandValue(pieceId) + bandValue(skillCardId) ≤ loadoutBudget   [ADR-004]
        └─ any miss → located ValidationError, AC-011 shape

createMatch
   └─ substitute replaces → pieceId on that side's placements
   └─ that side's draft pool = preset.skillCardIds + loadout.skillCardId
```

### API changes

```ts
// schema.ts (v8) — every field optional; v7 documents load unchanged
const loadoutSlot = z.strictObject({
  pieceId: contentId,
  replaces: contentId,
  skillCardId: contentId,
})
// added to presetDef:
loadout: z.strictObject({ white: loadoutSlot.optional(), black: loadoutSlot.optional() }).optional(),
loadoutBudget: z.number().int().nonnegative().optional(),

// balance/measure.ts
export interface Measurement { delta: number; stderr: number; n: number }
export function measureRecord(
  content: ContentSet, baselinePresetId: string,
  candidate: { kind: 'piece'; pieceId: string; replaces: string } | { kind: 'skill'; skillCardId: string },
  seeds: number,
): Measurement
```

## 📝 Implementation Plan

### Phase 1 — Schema v8: the loadout, honoured at match setup

**Status: DONE** — `npx vitest run` 546/546 green, `tsc --noEmit` clean.

- `depends_on`: `[]`
- `parallel_group`: `serial-schema`
- `merge_hazards`: `src/content/schema.ts` (SCHEMA_VERSION constant), `src/editor/io.ts` (version
  gate) — both are single-line contention points that every other phase reads.
- **Scope in:** `src/content/schema.ts` (v8 `loadout` + `loadoutBudget`, **and `cost` → `.optional()`
  with a deprecation comment**), `src/content/load.ts` (reference checks only), `src/engine/match.ts`,
  `src/editor/io.ts`, `tests/content/`, `tests/engine/`.
- **Scope out:** all grading, all UI, all validation of *power* (Phase 4 owns that).
- **Exit criterion:** `npx vitest run tests/content tests/engine` green, with new tests proving
  (a) a v7 document still loads byte-identically, (b) a v8 loadout substitutes the replaced piece
  on one side only, (c) that side's draft pool contains its loadout skill card and the other
  side's does not, (d) a document omitting `cost` on a rule/skill card loads — proving the field is
  genuinely retired at the type level and not just hidden in the editor.
- **Risk:** medium — a schema bump touches the import gate and every downstream reader.
- **Rollback:** revert to task-branch base.

### Phase 2 — Measurement harness

**Status: DONE.** A correction landed during implementation and is worth recording, because the
suite was green while the axis was dead. The first version measured a skill card by adding it to
white's loadout and leaving the shared pool alone — but every bundled skill card is already IN that
pool and `skillPoolFor` deduplicates, so the candidate arm was byte-identical to its control and
**all fourteen skill cards graded exactly 0.00 ± 0.00**. One test asserted that as correct ("a card
the pool already deals measures zero") and the rest only checked the numbers were finite. The fix:
a skill measurement withholds the card from the shared pool in BOTH arms and gives it to white's
loadout in the candidate arm only. The test that legitimised the bug was replaced by its opposite —
*the axis must be capable of a non-zero number* and *not every card may grade identically*.

- `depends_on`: `[1]`
- `parallel_group`: `serial-balance`
- `merge_hazards`: none — `src/balance/` is a new directory.
- **Scope in:** `src/balance/measure.ts`, `tests/balance/`.
- **Scope out:** bands, predictor, cache, worker, UI.
- **Exit criterion:** a headless script grades **every bundled piece and skill card** and prints
  the distribution with per-record standard error; running it twice with the same seed base
  produces identical numbers (determinism, mirroring AC-004's contract).
- **Risk:** medium — a pathological custom record could explode `legalActions`; the harness needs
  an action-count guard in addition to the existing `PLY_CAP`.
- **Rollback:** delete `src/balance/measure.ts`; nothing else imports it yet.

### Phase 3 — Bands, fitted predictor, and the two deferred numbers

**Status: DONE** — `GRADE_SEEDS = 600` derived from the measured noise floor; band width derived from the distribution.

- `depends_on`: `[2]`
- `parallel_group`: `serial-balance`
- `merge_hazards`: none.
- **Scope in:** `src/balance/bands.ts`, `src/balance/predict.ts`, `tests/balance/`.
- **Scope out:** cache, worker, loader validation, UI.
- **Exit criteria** (all three):
  1. Band width ≥ 2× the measured standard error at the chosen seed count — the band boundaries
     are *derived from* Phase 2's distribution, not chosen.
  2. The predictor assigns the same band as the measurement for ≥ 80 % of bundled records;
     coefficients come from regression against Phase 2 output, with zero hand-set constants.
  3. **Inert is separated from gentle, against a named fixture set.** "≈ 0" means *within 1 standard
     error of zero* at the phase's seed count — a number, not a feeling. The fixture set is the four
     records `tests/engine/card-liveness.test.ts` already pins as broken (`rule.blood-toll`,
     `skill.charge`, and the two `forEach`-misbinding cards), each of which must classify as **inert**,
     plus at least three bundled records measuring near zero that must classify as **live**. The
     discriminator is the card-liveness probe shape: does the record change the resolved state or the
     legal-move set *at all*, versus a no-card control. Three of those four broken cards change state —
     just the wrong state — so a did-anything-happen check alone fails this criterion by design.
- **Output of this phase (not decided in advance):** the band boundaries and the default
  `loadoutBudget`. These are the two questions the interview gate deliberately refused to guess.
  **This phase also writes the derived default** into the bundled presets' `loadoutBudget` and into
  the editor's pre-filled value for a new room — deriving a number and leaving it unowned would make
  ADR-010's fail-closed rule fire on the shipped content.
- **Risk:** medium — the 80 % agreement target may not be reachable for skills; if not, the
  predictor is demoted to "hint only" and the provisional badge says so. That fallback is a
  content-level remedy, not a redesign.
- **Rollback:** revert to Phase 2.

### Phase 4 — Duel-legal validation in the loader

**Status: DONE**, split per ADR-011 — structural rules in `load.ts`, grade rules in `@balance/legal`.

- `depends_on`: `[1, 3]`
- `parallel_group`: `serial-schema`
- `merge_hazards`: `src/content/load.ts` — shared with Phase 1's reference checks.
- **Scope in:** `src/content/load.ts`, `tests/content/validation.test.ts` fixtures.
- **Scope out:** UI, worker, cache population.
- **Exit criterion:** parametric rejection fixtures, each producing a located error naming the
  content id and JSON path (AC-011 shape), for: `win` in a loadout slot, `royal` in a loadout slot,
  replacing a royal piece, replacing a piece absent from that side's placements, a cross-band
  replacement, a budget overrun, and — the absent case ADR-010 governs — **a loadout present with
  `loadoutBudget` omitted**. Plus two positive fixtures: one full loadout that passes all seven, and
  one preset with *no* loadout and no budget, which must still load (the common case, and every v7
  document is in it).
- **Risk:** low — pure additive validation with an established error contract.
- **Rollback:** revert to Phase 3.

### Phase 5 — Grade cache and Web Worker

**Status: DONE** — cache, hashing and the worker job are implemented and tested; the worker shell builds.

- `depends_on`: `[2, 3]`
- `parallel_group`: `serial-balance`
- `merge_hazards`: `vite.config.ts` (worker build config).
- **Scope in:** `src/balance/cache.ts`, `src/balance/worker.ts`, `vite.config.ts`, `tests/balance/`.
- **Scope out:** the badge and picker UI (Phase 6).
- **Exit criterion:** editing a record changes its content hash and invalidates its cached grade
  (unit test); the worker returns a measurement for a record in under 10 s on the CI machine; a
  cache miss reports "not yet measured" as an explicit state, never as a zero.
- **Risk:** medium — worker bundling under the existing PWA/service-worker setup is the unknown;
  `vite-plugin-sw.ts` and `tests/build/precache.test.ts` both touch the build output.
- **Rollback:** revert to Phase 3; nothing outside `src/balance/` imports the worker yet.

### Phase 6 — Editor and room UI

**Status: DONE (with two criteria explicitly left open — see Success Criteria).**

Landed: the `cost` control is removed from `RecordForm.tsx`, `blankDraft` no longer seeds a `cost`
on new cards (the pinning test caught that leftover), the ADR-006 coverage gate records the removal
as a decision rather than a silent omission, and `src/balance/grade-client.ts` + `worker.ts` exist
with the `new URL(..., import.meta.url)` form that makes a bundler emit the worker chunk.

**Now landed** (second pass): schema v9 adds `preset.grading` so a room declares the two records
its scale is measured against — a constant in the app's source would have named a piece, which
AC-009 forbids. `src/ui/useGrades.ts` reads the cache and starts a worker for anything unmeasured;
the room screen's `cards` step gained a loadout picker with a budget meter that names a cross-band
replacement and an over-budget pair BEFORE the save rather than reporting a JSON path after it; and
the lobby now runs `checkLoadoutGrades` and **disables the start button** when a loadout's grades
cannot be verified. That last one closes the review's standing finding: the grade-dependent half of
the gate had no caller, so a room could be played with a loadout nothing had checked.

Two things the wiring is proved by rather than claimed by: the worker is emitted as its own bundle
chunk (`dist/assets/worker-*.js`), and `tests/ui/loadout-ui.test.tsx` drives the real screens —
including the case where an ungraded record must BLOCK the match instead of scoring as harmless.

- `depends_on`: `[4, 5]`
- `parallel_group`: `serial-ui`
- `merge_hazards`: `src/ui/RecordForm.tsx`, `src/ui/RoomDetail.tsx`, `src/i18n/ko.ts` (new keys).
- **Scope in:** `src/ui/RecordForm.tsx` (grade badge, `cost` control removed), `src/ui/RoomDetail.tsx`
  (loadout picker + budget meter), `src/i18n/ko.ts`, `e2e/`.
- **Scope out:** engine, schema, balance module.
- **Exit criterion:** a Playwright e2e that creates a piece, sees a provisional grade appear
  immediately and a confirmed grade replace it, assigns it to a loadout slot, is refused for a
  cross-band replacement with a readable Korean message, then succeeds with a same-band one and
  starts a match in which the custom piece is on the board.
- **Risk:** medium — the "grade changed a moment after you saw it" state is a genuine UX hazard and
  ADR-005 accepted it; the copy has to name it rather than let the number silently flip.
- **Rollback:** revert to Phase 5; the engine remains fully functional without the UI.

## 🧪 Testing Strategy

**Unit** — measurement determinism under a fixed seed base; band assignment at boundary values;
content-hash invalidation on edit; predictor-vs-measurement agreement rate; inert detection.

**Parametric** — the six duel-legal rejection fixtures plus one positive, each asserting the error's
content id and JSON path (`tests/content/validation.test.ts` pattern).

**Property** — for any loadout that passes validation, `grade(piece) + grade(skill) ≤ budget` holds
after a round-trip through export and import; and the sum is computed from *recomputed* grades, never
from anything the document carried (ADR-007).

**Integration** — v7 document loads unchanged under v8; a v8 loadout produces an asymmetric starting
position and per-side draft pools.

**E2E** — the Phase 6 Playwright flow above.

**Manual** — one hot-seat match with a hand-built loadout on both sides, checking that the budget
meter and the grade badges say something a child can act on.

## ⚠️ Risks & Mitigation

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R-1 | Random agent misses skill-dependent brokenness | high | medium | Accepted (ADR-006). Stated as a limitation in the UI copy, not implied away by the word "등급". |
| R-2 | Measurement noise exceeds band width, so grades flicker | medium | high | Phase 3 exit criterion 1 makes band width ≥ 2σ a gate, not a hope. Raise seed count before narrowing bands. |
| R-3 | A pathological custom record explodes `legalActions` and the worker never returns | medium | high | Phase 2 adds an action-count guard alongside `PLY_CAP`; the worker has a hard timeout and reports "unmeasurable", which the loader treats as loadout-ineligible. |
| R-4 | Predictor cannot reach 80 % band agreement for skills | medium | low | Documented fallback: demote to a hint, badge says "예상", measurement still governs. No redesign. |
| R-5 | v8 bump breaks an existing exported document | low | high | `io.ts` version gate test with a real v7 fixture in Phase 1's exit criterion. |
| R-6 | A new field lands ahead of its interpreter — `declared-but-inert` instance #6 | medium | high | Every phase lands its fields and their readers together; ADR-007 keeps `grade` out of the document entirely; `cost` is retired at the **type level** in Phase 1 (`.optional()` + Phase 1 exit criterion (d)), not merely hidden by removing its editor control in Phase 6 — the draft claimed the latter closed it, which `plan-validator` correctly rejected. |
| R-9 | `loadoutBudget` gate silently no-ops on documents predating it | medium | high | ADR-010 makes it fail-closed, Phase 4 pins it with an explicit absent-case fixture, and Phase 3 owns writing the derived default into bundled presets so shipped content does not trip the new rule. |
| R-10 | SPEC and PLAN disagree in writing until the SPEC amendment lands | high | low | ADR-009 records the scoped override with the SPEC line cited; a follow-up `/hm:spec` run is the closing action. Visible and dated rather than silent. |
| R-7 | Worker bundling conflicts with the PWA precache | medium | medium | Phase 5 runs `tests/build/precache.test.ts` as part of its exit check. |
| R-8 | Grade ≈ 0 reads as "gentle" when the record is actually inert | medium | medium | Phase 3 exit criterion 3 separates the two with the card-liveness probe shape. |

## ✅ Success Criteria

- [x] A v7 content document loads unchanged under schema v8.
- [x] A room can carry a per-side loadout that survives export → import → match with the same seed.
      `tests/content/loadout-roundtrip.test.ts` plays 25 seeds to completion on both sides of the
      round trip and compares the final board, result and length — plus a guard that the loadout
      really did change the match, without which the whole file would pass on an engine that
      ignored it.
- [x] Every bundled piece and skill card has a measured grade, reproducible across runs.
- [x] Band boundaries and the default budget are derived from the measured distribution, with band
      width ≥ 2× standard error. The bundled room now carries `loadoutBudget: 18` and a `grading`
      baseline, both derived from its own 600-seed measurement and documented at the point of use.
- [x] No hand-set numeric constant governs any grade; predictor coefficients are fitted.
- [x] A loadout slot naming a record with `win` or `royal` is refused with a located error.
- [x] A cross-band replacement is refused; a same-band one is accepted.
- [x] A loadout exceeding the room's budget is refused, where the budget's piece term is the band
      representative and not the raw measured delta.
- [x] A room carrying a loadout but no `loadoutBudget` is refused; a room carrying neither loads.
- [x] `cost` is optional at the schema level and a document omitting it loads.
- [ ] The four records `card-liveness.test.ts` pins as broken classify as inert, not as gentle.
      **NOT DONE, and the criterion was partly unmeetable as written.** `classify()` is pinned
      against a guaranteed-inert real measurement (a record measured against itself), but two of the
      four named records are RULE cards, which this feature does not grade at all. Rewriting the
      criterion was the plan-time fix; ticking it at wrapup would not have been.
- [x] A grade is never read from a content document; editing a record invalidates its cached grade.
- [x] Saving a record shows a provisional grade instantly and a confirmed grade within seconds,
      visually distinguished — **built and gated; currently dormant because the data says so.**
      The confirmed half is wired end to end. The provisional half is built, marked as an estimate
      in the UI, and never charged to the budget — and it is shown only when the fit beats the
      trivial predictor on data it did not see. It does not. Measured three ways: one feature at 5
      samples, four features at 5, and four features plus nearest-neighbour at 15 (ten synthetic
      pieces spanning the space). Leave-one-out agreement was 0.40, 0.40 and 0.33 against a 0.40
      baseline. The features themselves did improve — splitting mobility, reach and ranged capture
      fixed the ordering that had put the strongest piece near the bottom — but in-sample ordering
      is not evidence. `tests/balance/predictor-gate.test.ts` pins the verdict and goes red the day
      a feature set earns it, at which point the badge lights up with no further code change.
- [x] The UI states plainly that grades measure structural strength under random play
      (`loadout-caveat`, pinned by a test).

## 🔍 Plan Validation

**Pass 1 — `plan-validator`: MAJOR_REVISION** (3 critical, 2 warning, 1 suggestion). All six were
accepted as valid; none were argued down. Resolution:

| # | Critique | Severity | Resolution |
|---|---|---|---|
| 1 | PLAN overrides SPEC's "Balance tuning" Non-Goal (line 208-209) with no record | critical | **ADR-009** added: scoped override, Non-Goal still holds for the draft pool, SPEC flagged for `/hm:spec` amendment. Prior Work cites the SPEC line. |
| 2 | `loadoutBudget` absent-case undefined — the repo's most-recurring failure shape | critical | **Interview round 5 → ADR-010**: fail-closed. Phase 4 gains an explicit absent-case fixture plus a no-loadout positive fixture; Phase 3 now owns writing the derived default into bundled presets. |
| 3 | ADR-004's "ADR-008 already fixes the piece term" contradicts the ≥2σ band width and the data-flow formula | critical | **Interview round 5 → ADR-004 revised**: the budget's piece term is the **band representative**. The "already fixes" claim is corrected to "bounds to one band", and the data flow now reads `bandValue(...)`. |
| 4 | `cost` stays required and inert; no phase owns the schema change | warning | Phase 1 scope now includes `cost` → `.optional()` + deprecation, with exit criterion (d) proving a document omitting it loads. R-6 corrected — the draft wrongly treated removing the editor control as closing the instance. |
| 5 | Phase 3 criterion 3 has no threshold or fixture set | warning | "≈0" defined as within 1 standard error of zero; fixture set named (the four `card-liveness.test.ts` broken records must classify inert, ≥3 near-zero bundled records must classify live). |
| 6 | No `## Non-Goals` section | suggestion | Added, five entries, led by the SPEC relationship. |

Validator was not re-dispatched: every critique was resolved by an ADR or an exit-criterion change
rather than by a structural rewrite, and the phase decomposition and rollback strategy were already
returned clean.

**Cross-model second opinion:** `codex` — **skipped**. Reason: the ADR-003 gate for the Side preset
runs second-opinion models only on a high-diff change, and
`hm high_diff classify` returned `{"boundary": false, "is_high": false}` for this stage's working
tree. The verdict above is Claude-only by policy, not by degradation.
