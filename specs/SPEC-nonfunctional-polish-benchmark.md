---
type: spec
task_slug: nonfunctional-polish-benchmark
status: approved
created: 2026-08-26
tags: [chess-craft, spec, typescript, child-ux, collection, retention]
tier: 2
test_framework: vitest
research_doc: "[[RESEARCH-nonfunctional-polish-benchmark]]"
summary: "Turn the dex into a collection a child fills by playing — and one a lost match still fills"
---

# SPEC — The dex becomes a collection

## 🎯 Intent

When a match ends, nothing survives it. `src/ui/Result.tsx` shows a winner, a
reason and three numbers that are compared to nothing, and 한 판 더 mints a fresh
seed and discards the entire `GameState` (`src/ui/MatchHost.tsx:592-611`). Across
the app there are six `localStorage` keys and not one of them accumulates.

The 도감 screen (`src/ui/Rules.tsx`) already draws every piece, square type, rule
card and skill card in the loaded content set, and its own intro string already
promises *'새로 만든 것도 여기에 바로 나와요.'* — but every entry always renders in
full, in the same state, forever. It is a reference book. This SPEC makes it a
collection the child fills by playing, and makes a **lost** match fill it exactly
as much as a won one, because discovery accrues during play rather than at the
result.

## 🌅 Outcomes

A child can, without an account, a network, or a daily task:

- Open 도감 and see, at a glance, how much of each of the four kinds they have met
  and how much they have not — a count and a shelf with empty places in it.
- Recognise an entry they have never encountered as a silhouette rather than as a
  finished tile, and recognise one they have actually used as different again from
  one they have only seen.
- Finish a losing match and see that it still added to the collection.
- See, on the result screen, what this particular match added.
- Find everything they themselves made already marked as theirs, from the moment
  they make it — including everything they made before this feature existed.

What they cannot do today: any of it. Every dex entry is identical in every state,
no count exists, and nothing a match produces is written down.

## 📋 In-Scope Scenarios

### AC-001: Playing a match records what the child met and what they used

**Given** a child starts a match in a room containing a piece, a square type, a
rule card and a skill card they have never encountered
**When** the match is played to its end
**Then** every one of those records is recorded at least at `seen`
**And** a skill card that was merely offered in the draft and not taken is still
recorded at `seen`
**And** a piece that was actually moved, a skill card that was actually played, and
a square type a piece actually stood on are recorded at `used`
**And** a piece that merely appeared — placed on the board by a card rather than
moved onto it — is recorded at `seen` and not at `used`
**And** a move that PROMOTES credits neither id at `used` for that move: the engine
rewrites the landed piece's id inside the same transition, so from the recorded
states the new id is indistinguishable from a piece that appeared and the old one
from a piece that was taken. Both stay at `seen` unless another move credits them
**And** a record that was `used` by the winning side of a decisive match, where
that side was played by a person, is recorded at `won`
**And** the record survives closing and reopening the app

### AC-002: A lost match fills the collection exactly as much as a won one, up to `won`

**Given** two matches played from the same seed with the same moves
**When** one is scored as a win for the child and the other as a loss
**Then** the set of records reaching `seen` and the set reaching `used` are
identical in both
**And** nothing in the collection is removed, reduced or reverted by the loss
**And** only the `won` tier differs between the two, which is what that tier means

### AC-003: The shelf shows what is missing, not only what is present

**Given** the child has encountered some but not all records of a kind
**When** they open that tab of 도감
**Then** a count of encountered-over-total is shown for **that tab's kind**, not a
single total across kinds
**And** an unencountered entry renders visibly distinct from an encountered one at
the rendered-pixel level, not merely by a differing attribute value
**And** an unencountered entry still occupies its place in the grid rather than
being hidden

### AC-004: What the child made is theirs from the moment it exists

**Given** a record authored by the child, whether created before or after this
feature shipped
**When** 도감 renders it
**Then** it is marked as authored by the child
**And** it is never rendered as unencountered, regardless of what the collection
record contains

### AC-005: An entry never goes backwards

**Given** any sequence of matches, app restarts, content edits and imports
**When** an entry's collection state is read after each step
**Then** that entry's state never regresses along the ladder
`unencountered < seen < used < won`, for as long as the record exists

### AC-006: The result screen names what this match added

**Given** a match that caused at least one entry to be recorded for the first time
**When** the result screen is shown
**Then** the number of newly recorded entries for that match is displayed
**And** a match that added nothing new displays no such element rather than a zero

### AC-007: A collection that cannot be written never blocks play

**Given** a browser whose storage is full, unavailable, or denied
**When** a match is played to its end and the result screen is shown
**Then** the match completes, the result screen renders, and 한 판 더 works
**And** no error text from the storage layer reaches the screen

## 🚫 Non-Goals

- **A global score, level, XP, or rating.** The counts here are per-kind and derived
  from currently loaded content; there is no single number representing the child.
- **A daily task, a streak, a login reward, or any time-based reset.** Deliberate:
  여성가족부's 2025 진단조사 puts 중학생 at the largest overdependence-risk cohort
  (85,487 of 213,243). An explicit stopping point is the goal, not an open ladder.
- **Trophies, badges, achievements or unlocks.** `PLAN-ui-ux-productization.md:551`
  already scoped achievements out; nothing here gates content behind progress.
- **Avatars, cosmetics, or any spend-currency.** ChessKid's Gems axis is out.
- **Any change to match rules, the engine's resolution order, card balance, or the
  content schema.** The collection is written from observed play, never fed back
  into it.
- **Persisting or resuming an in-progress match.** Losing one is accepted.
- **Sound or haptics for discovery.** The result-screen count is silent this cycle;
  adding a `discover` event to `SOUND_EVENTS` is a separate decision.
- **The make→play shortcut for pieces and cards** (Approach B) and **a seed input
  field** (the write-only-seed defect). Both are real and both are recorded in the
  RESEARCH document; neither is in this cycle.
- **Any network, account, share, or server surface.**
- **Difficulty persistence.** One `Settings` field, unrelated to the collection.

## ⚠️ Constraints

| Constraint | Value | Rationale |
|---|---|---|
| Test framework | `vitest` (unit/component) + `@playwright/test` (e2e, incl. the PWA config) | Every prior SPEC in `specs/` uses this pair; `npm run verify` already chains typecheck → build → test → e2e → e2e:pwa → test:build |
| Storage | one new key `chess-craft.collection.v1`, written through the existing typed-result pattern | Matches `src/editor/storage.ts:21-41` — quota-refusing writes, `SaveResult`/`LoadResult`, no partial clears |
| Storage failure | fail open: play always continues, collection silently degrades | AC-007; mirrors `src/ui/onboarding.ts:61`, which fails toward already-seen so a storage-denying browser cannot trap a child |
| Absent case | a child with no collection record is not "at zero for their own work" — authored records derive their authored state from the content document, never from the collection log | The project's most-recurring recorded failure class is the undefined absent case; this is the migration path for every existing user |
| Perceptual assertion | the encountered/unencountered difference must be asserted on rendered pixels or computed style, never on a differing attribute value alone | `[fail:test] distinct-is-not-distinguishable`; and `[fail:render] glyph-opts-out-of-its-styling` (count 3) — `text-shadow`/`color`/`font-weight` are inert on `<img>`, so the treatment must be a `filter` |
| Motion | any new emphasis honours `prefers-reduced-motion` and adds no particles or screen shake | ADR-007 of `PLAN-skill-legibility-and-onboarding`; low-end mobile frame budget |
| Tone | no UI string may contain 어린이 / 저학년 / kid, and no new element may be age-labelled | NN/g: "The word 'kid' is a teen repellent"; children are "acutely aware of age differences" and reject content aimed younger |
| Localization | every new string is a `ui.*` key in `src/i18n/ko.ts`; zero literals in `src/ui/*.tsx` | Enforced by `tests/ui/no-raw-ids.test.tsx`, `tests/ui/chrome-i18n.test.tsx` — Hangul in `src/ui/*.tsx` fails the gate, comments included |
| Accessibility | counts and state changes are exposed as text, not colour alone; targets stay ≥44 px | `e2e/a11y.spec.ts` already asserts both |
| Exit | any new overlay or sheet has its dismissal defined before it is built | `[fail:design] mode-with-no-way-out`; children's default recovery is closing the app |

## ✅ Verification Criteria

| Scenario | Verification mode | Test name / manual step |
|---|---|---|
| AC-001 | e2e | `e2e/collection.spec.ts::a played match records what was met and what was used` |
| AC-001 (appeared / promoted) | unit | `tests/collection/observe.test.ts::a piece that appeared or promoted is met, never used` |
| AC-002 | unit (property) | `tests/collection/observe.test.ts::the seen and used sets are independent of the match result` |
| AC-003 | e2e | `e2e/collection.spec.ts::an unmet entry renders distinctly and keeps its place` |
| AC-004 | unit | `tests/ui/collection-dex.test.tsx::an authored record is never unencountered` |
| AC-005 | unit (property) | `tests/collection/record.test.ts::entry state never regresses across any operation sequence` |
| AC-006 | e2e | `e2e/collection.spec.ts::the result screen names this match's new entries` |
| AC-007 | unit | `tests/collection/record.test.ts::a refusing storage never surfaces and never blocks` |
| AC-003 (pixel) | manual | Open 도감 on a phone-width viewport with a partially filled set; confirm at arm's length that filled and empty tiles are telling apart without reading the count |

## ❓ Open Questions

All four questions this SPEC opened were resolved in `/hm:plan`'s interview and are
recorded there as ADR-002 through ADR-005; the scenarios above were amended to
match. Nothing remains open.

- `used` gains a third tier `won` → ADR-004 (and AC-002 was rescoped accordingly).
- A deleted record leaves the shelf; its discovery is retained so re-adding restores
  it → ADR-003.
- An offered-but-not-taken skill card counts as `seen` → ADR-002.
- The count is per tab → ADR-005.

## 🔍 Refinement Decisions

- **Round 0 (research handoff).** Three questions the RESEARCH document left open
  were decided by the user answering "진행해" rather than choosing, so they are
  recorded here as defaults with their reasons, and any of them may be reversed by
  naming it:
  - **Approach A first** — the shelf (`src/ui/Rules.tsx`) and the raw material
    (`everOffered`/`held`/`used` in `GameState.drafts`) both already exist, so this
    is the lowest-risk of the three directions surveyed.
  - **"Collected" = `seen` / `used`, plus an authored badge** — two states are the
    fewest that still move often enough for a child to notice movement.
  - **A lost match earns exactly what a won one does** — discovery accrues during
    play, not at the result. This is honest (it does not soften the loss line) and
    it is what makes the collection safe as the thing a child has to show for a bad
    session. Precedent: ChessKid's "Stars are never lost or deducted; they only
    increase!"
- **Interview skipped.** The six categories were answered by the RESEARCH document
  and the user's three prior decisions (not a commercial product · content never
  leaves the device · losing an in-progress match is acceptable); the user then
  asked to proceed rather than answer further questions. Constraints defaulted to
  the repository's standing choices (`vitest` + `@playwright/test`, the
  `chess-craft.*.v1` storage convention, the i18n and contrast gates), which are
  uniform across all eight prior SPECs and were not worth re-asking.
