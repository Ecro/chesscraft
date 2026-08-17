---
type: spec
task_slug: preset-content-expansion
status: approved
created: 2026-08-08
tier: 2
tags: [chess-craft, spec, vitest, content-authoring, pixel-art, engine-semantics]
test_framework: vitest
research_doc: "[[RESEARCH-preset-content-expansion]]"
summary: "Fix 3 inert-card root causes, then add 3 rooms + 24 records + a 60-sprite spare art pool"
---

# SPEC — preset content expansion and a spare art pool

## 🎯 Intent

The game ships **one** room (`preset.default`) holding every record, so every
match draws from the same pool and reads the same. Separately, the record form's
art picker is **100% claimed** — 6 piece / 5 square / 26 card pictures against
exactly 6 pieces / 5 square types / 26 cards — so a player who authors a new
piece can only steal another piece's picture or fall back to a `'?'` monogram.

The trigger is both at once: more content to draw from, and pictures to give it.

**Correction (2026-08-08, during `/hm:plan`).** This SPEC was first drafted on the
premise that 4 of the 26 shipped cards were inert or wrong-firing. That premise
came from a memory entry written 2026-08-07 and was **not true of `master`**:
running `tests/engine/card-liveness.test.ts` gives 32/32 with `intended ===
current` on all 29 probes, and the three root causes are closed in code
(`engine.ts:505` binds `boundSubject` into the event context, `engine.ts:855`
routes the card-play branch through `bindEffect`, `effects.ts:43` carries
`moverSquare` so `on_capture` can name the capturer). AC-001…AC-003 are therefore
**regression guards on behaviour that already holds**, not repair work — they must
survive 24 new records landing on the same engine.

## 🌅 Outcomes

Observable end-state, in the order a user meets it:

- **A player** can pick among **4 rooms** in the lobby instead of accepting one,
  and each room plays differently because its card pool, its painted squares and
  its loadout budget differ — not because its board is a different size.
- **An author** opening the record form sees **unclaimed pictures** on every
  surface: at least 20 for a piece, 10 for a square type, 30 for a card, none of
  which any shipped record is already using.
- **A card author** can trust that a card which validates also *fires*: every one
  of the 26 existing cards still behaves as its text says after the expansion,
  and every newly added card carries a probe proving it stays inert where it must.
- **A maintainer** can regenerate more spare sprites by running a committed
  script that refuses to emit a candidate failing the sheet's own gates.

## 📋 In-Scope Scenarios

AC-001…AC-003 are **regression guards** — they hold on `master` today and must
still hold once the new content lands. AC-008…AC-012 (art) are independent of the
content work and may run in parallel.

### AC-001: `on_capture` binds the capturing piece

**Given** the rule card `rule.blood-toll` ("the piece that captured disappears too") is in play
**When** a pawn captures an enemy piece
**Then** the capturing pawn is absent from the board after the ply resolves
**And** the same position played with the card absent leaves that pawn standing

### AC-002: a `forEach` effect evaluates its condition against the piece it bound

**Given** `rule.king-of-the-hill` is in play and a rook — not the king — stands on a centre square
**When** the ply resolves
**Then** no side has won
**And** with `rule.fast-promotion` in play, a pawn on its own rank 3 is not promoted when a rook lands on e2

### AC-003: a played skill card binds its quantifier

**Given** `skill.charge` is held and the player has more than one eligible friendly piece
**When** the card is offered
**Then** the number of plays offered equals the number of pieces its `forEach` selector matches
**And** playing one grants the movement to that bound piece

### AC-004: every room can open both drafts

**Given** the bundled content set after expansion
**When** each preset is loaded
**Then** every preset lists at least 6 skill cards
**And** every preset's `boardId` resolves to a 6×6 board

### AC-005: the lobby offers four rooms

**Given** a fresh install
**When** the room picker is opened
**Then** exactly 4 presets are selectable, of which one is `preset.default`
**And** no two presets carry the same skill-card list

### AC-006: the record counts grow as specified

**Given** the bundled content set after expansion
**When** its records are counted by kind
**Then** there are 12 pieces, 8 square types, 17 rule cards and 24 skill cards

### AC-007: every declared text key resolves

**Given** the expanded content set
**When** every player-facing text key the content declares is translated in the ko bundle
**Then** no key translates to itself

### AC-008: the art picker offers unclaimed pictures on every surface

**Given** the expanded art catalogue
**When** the registry entries are partitioned by `surface` and cross-referenced against every `artKey` the content declares
**Then** at least 20 piece, 10 square and 30 card entries are claimed by no record

### AC-009: every sprite, spare included, obeys the sheet's own rules

**Given** the expanded sprite sheet
**When** each sprite is measured
**Then** each is exactly 12 rows of 12 characters, uses only palette characters plus `.` and `$`, draws at least one non-transparent cell, and compresses to at most 60 rects
**And** the sheet as a whole still satisfies `total_runs < total_pixels / 1.8`

### AC-010: every spare is legible where it is meant to appear

**Given** every registered pixel entry, spare or claimed
**When** its contrast is measured against each surface its declared `surface` allows it to land on
**Then** every entry clears the same floor the existing sheet clears
**And** no sprite introduces a colour outside the existing 25-entry palette

### AC-011: no art id names content

**Given** the expanded art catalogue
**When** every art id is inspected
**Then** each matches `art.<one-segment>` and contains no content id as a substring

### AC-012: the generator refuses what the gates refuse

**Given** the committed sprite generator under `scripts/`
**When** it is run over a candidate batch containing deliberately invalid sprites (wrong size, unknown character, blank, over-complex)
**Then** it emits none of them
**And** the gate predicates it applies are imported from the same module the test suite uses, not reimplemented

### AC-013: every new card proves it stays inert where it must

**Given** each card added by this work
**When** the suite runs
**Then** each has at least one probe placing its subject where the correct behaviour is provably no change, asserting the resolved state and the legal move set both match a no-card control

## 🚫 Non-Goals

- **No board size other than 6×6.** The AI's search cost at larger sizes is unmeasured; changing it is a separate task.
- **No raster / illustrated art.** The `ArtEntry` raster path stays unused — it costs offline-free rendering, precache enumeration and a doubled per-piece asset count (ADR-007).
- **No palette extension.** The 25-entry ramp is what the contrast gate is tuned against.
- **No new locale.** ko remains the only bundle.
- **No vocabulary extension beyond the 3 root-cause repairs.** `VOCAB-GAPS` G-3…G-7 stay open; this work fixes what is broken, it does not add new grammar.
- **No return of a shipped-grade table.** Cost stays derived from the declaration (ADR-012).
- **No new UI screens.** The room picker and record form already exist and are list-driven.

## ⚠️ Constraints

| Constraint | Value | Rationale |
|---|---|---|
| Test framework | `vitest` | Already the project runner (`package.json:11`); `/hm:execute` writes against it |
| Board size | 6×6 only | AI search cost at other sizes is unmeasured (RESEARCH OQ-4) |
| Palette | existing 25 entries, unchanged | `art-contrast.test.ts` is calibrated to this ramp |
| Sheet compression | `total_runs < total_pixels / 1.8`, **sheet-wide** | Existing gate; a batch of noisy sprites breaks it globally even when each passes its own ≤60-rect check |
| Sprite format | 12×12, palette chars + `.` + `$` | `pixels.test.ts` |
| Art id shape | `art.<one-segment>`, never echoing a content id | `art-key.test.ts` + whole-file substring scan in `no-content-in-engine.test.ts` |
| Skill cards per preset | ≥ 6 | Fewer deadlocks the draft (`VOCAB-GAPS` G-8) |
| Locale | ko only | `src/i18n/ko.ts` is the sole bundle |
| Cost model | derived from declaration, unchanged | ADR-012; new records are priced for free |
| Ordering | AC-001…003 stay green throughout | They already hold; a new record must not silently break an existing card |
| Loadout budget | per-preset, deliberately varied | The schema already supports it; budget becomes one of the levers that gives a room its character |
| Painted squares | only on ranks empty at setup | Preserves the existing board's property — every painted square is reachable and none starts under a piece |

## ✅ Verification Criteria

| Scenario | Verification mode | Test name / manual step |
|---|---|---|
| AC-001 | unit | `tests/engine/card-liveness.test.ts` — blood-toll vs no-card control |
| AC-002 | unit | `tests/engine/card-liveness.test.ts` — rook-on-centre and pawn-on-rank-3 inert probes |
| AC-003 | unit | `tests/engine/skill-cards.test.ts` — charge offers one play per bound target |
| AC-004 | unit | `tests/content/bundled.test.ts` — per-preset skill count and board size |
| AC-005 | unit | `tests/content/bundled.test.ts` — 4 presets, no two sharing a skill list |
| AC-006 | unit | `tests/content/bundled.test.ts` — record census |
| AC-007 | unit | `tests/ui/i18n.test.ts` — every declared key resolves in ko |
| AC-008 | unit | `tests/content/art-key.test.ts` — unclaimed-per-surface census |
| AC-009 | unit | `tests/ui/pixels.test.ts` — per-sprite rules + sheet aggregate |
| AC-010 | unit | `tests/ui/art-contrast.test.ts` — per-surface contrast + palette closure |
| AC-011 | unit | `tests/content/art-key.test.ts` + `tests/structure/no-content-in-engine.test.ts` |
| AC-012 | unit | `tests/ui/sprite-generator.test.ts` — invalid batch yields empty output; shared-module identity |
| AC-013 | unit | `tests/engine/card-liveness.test.ts` — one inert-where-it-must probe per new card |

## ❓ Open Questions

None — all three were resolved in the `/hm:plan` interview and promoted to ADRs:

1. ~~Does `loadoutBudget: 6` still admit a sensible loadout in each new room?~~ →
   **per-preset budgets, deliberately varied** (ADR-002).
2. ~~How do painted squares distribute across the new boards?~~ → **only on ranks
   empty at setup**, preserving the existing board's reachability property (ADR-003).
3. ~~Is passing every gate sufficient to commit a generated sprite?~~ → **no; gate
   pass plus a human recognisability check**, because an art id must name what the
   picture depicts and an unrecognisable sprite cannot be named (ADR-004).

## 🔍 Refinement Decisions

- **Round 1 (Intent / Outcomes / Constraints):** scope is *both* new rooms and new
  records, sequenced rooms-first; the 3 engine root causes behind the 4 broken
  cards are fixed **before** new content; spare art target is ~60 sprites split
  20 piece / 10 square / 30 card; the existing 25-colour ramp is kept.
- **Round 2 (Scenarios / Non-Goals):** 3 new rooms, all 6×6 (AI cost at other
  sizes stays out of scope); records grow by +6 pieces / +3 square types / +6
  rule cards / +9 skill cards; the sprite generator is **committed** under
  `scripts/` with the gate predicates imported rather than reimplemented.
- **Not asked (common ground):** test framework (`vitest`, `package.json:11`) and
  locale scope (ko only, sole bundle) were determined by the repo at confidence
  ≥ 0.95.
- **Not asked (unanswerable now):** `loadoutBudget` re-tuning depends on costs
  that only exist once the new pieces are declared — promoted to Open Question 1
  rather than guessed.
- **Round 3 (`/hm:plan`, 2026-08-08) — premise correction:** the "4 broken cards"
  claim was checked against `master` and found false (see the Intent correction).
  The repair phase was replaced by a **regression guard**; the remaining three open
  questions were resolved into ADR-002/003/004. Status moved `draft` → `approved`.
