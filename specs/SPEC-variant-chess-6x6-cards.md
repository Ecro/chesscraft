---
type: spec
task_slug: variant-chess-6x6-cards
status: draft
created: 2026-08-05
tier: 2
tags: [strange-chess, spec, typescript, vitest, game-engine, data-driven-content, chess-variant]
test_framework: vitest
research_doc: "[[RESEARCH-variant-chess-6x6-cards]]"
summary: "Data-driven 6x6 variant-chess web MVP: pieces/rules/skills/boards as content, hot-seat + editor"
---

# SPEC — 6x6 Variant Chess with Rule Cards, Skill Cards, and an In-App Content Editor

## 🎯 Intent

Build a two-player 6x6 variant-chess game for elementary and middle-school players (초·중학생) that
finishes faster than standard chess and stays fresh across sessions. Freshness comes from two card
layers — a **public rule card** drawn randomly per match, and **private skill cards** drafted 1-of-3
at the start and again after five turns.

The strategic goal is bigger than one game: the product is a **content platform** ("변형 체스계의
마인크래프트"). Boards, pieces, rule cards, skill cards, and win conditions are all *content* defined
in the same declarative schema and interpreted by one engine; an in-app editor lets the author create
and play new content without touching source code. The web build is the MVP; a Capacitor-wrapped
mobile release follows.

## 🌅 Outcomes

Observable end-state that does not exist today:

1. Two players share one device, start a match, see the drawn public rule card, each draft a skill
   card, and play a game that reaches a decisive result — with no server, no account, and no network.
2. Adding a new piece, rule card, skill card, board, **special square**, or bundled variant preset
   requires **editing or creating content data only** — no change to engine source files, no rebuild
   of engine logic.
3. The author opens the in-app editor, creates a piece / card / board / special square / variant
   preset, and plays a match using it in the same session, without leaving the app.
4. Invalid content never reaches the board: the engine rejects it and names the offending field.
5. A user-authored variant survives a device change via JSON export/import.

## 📋 In-Scope Scenarios

Terminology used below: **ply** = one player's single action (move or card play); **turn** = one
player's ply. A match's ply counter increments on every action by either player.

### AC-001: Match starts from the Los Alamos 6x6 base position

**Given** the default variant preset is selected
**When** a new match is started
**Then** the board is 6 files x 6 ranks and holds exactly 24 pieces (12 per side: 1 King, 1 Queen,
2 Rooks, 2 Knights, 6 Pawns — no Bishops)
**And** castling, pawn double-step, and en passant are absent from the generated legal-move set

### AC-002: A match is won by capturing the king

**Given** a legal position in which a piece of the side to move can capture the enemy king
**When** that capture is played
**Then** the match ends immediately with the capturing side as winner
**And** no checkmate, check-restriction, or stalemate rule constrains any earlier move — moving into
an attacked square is legal

### AC-003: The 60-ply cap ends the match by material count

**Given** a match that has reached ply 60 without a king capture
**When** ply 60 completes
**Then** the match ends and the side with more remaining pieces is declared the winner
**And** if both sides have an equal piece count the result is a draw

### AC-004: The public rule card is drawn deterministically from the match seed

**Given** a match seed value
**When** a match is started twice with that same seed and the same variant preset
**Then** both matches draw the identical public rule card
**And** both matches present the identical skill-card draft offers
**And** the drawn rule card is visible to both players for the whole match

### AC-005: First skill draft offers 3 cards to each player

**Given** a new match has started
**When** the draft phase for a player opens
**Then** exactly 3 distinct skill cards are offered and the player must pick exactly 1
**And** the match does not accept a board action from that player until the pick is made

### AC-006: Second skill draft opens after five completed turns, with no repeats

**Given** a player has completed 5 of their own turns
**When** their 6th turn begins
**Then** exactly 3 distinct skill cards are offered, none of which is a card that player already
holds and none of which appeared in that player's first offer
**And** offers are drawn from the match seed with no bias toward either player's position

### AC-007: Playing a skill card consumes the entire turn

**Given** it is a player's turn and they hold an unused active skill card
**When** they play that card and its effect resolves
**Then** the turn passes to the opponent without that player making a board move
**And** the card is marked used and cannot be played again in that match

### AC-008: Skill cards cannot be played out of turn or in response

**Given** it is the opponent's turn, or a card effect is mid-resolution
**When** a player attempts to play a skill card
**Then** the action is rejected and the game state is unchanged
**And** the rejection is surfaced to the player rather than silently ignored

### AC-009: A piece is fully defined by content data

**Given** a piece definition specifying its movement pattern, its attack pattern (which may differ
from movement), its promotion rule, and its passive abilities
**When** that definition is placed in the content set and a match uses it
**Then** the engine generates that piece's legal moves, captures, promotions, and passive effects
from the definition alone
**And** no engine source file names that piece

### AC-010: The MVP ships 10 rule cards and 14 skill cards, all schema-valid

**Given** the bundled default content set
**When** it is loaded
**Then** it contains at least 10 rule cards, at least 14 skill cards, and at least 4 special-square
types
**And** every bundled card, piece, board, special-square type, and variant preset passes schema
validation with zero errors

### AC-011: Invalid content is rejected fail-closed with a located error

**Given** a content definition that violates the schema (unknown field, missing required field, wrong
type, or a reference to a non-existent id)
**When** the content set is loaded for a match
**Then** loading fails, no match starts, and the reported error names the content id and the JSON
field path at fault
**And** no partially-loaded content reaches the board

### AC-012: Random self-play finishes fast

**Given** 1000 self-play matches played by a uniform-random legal-action agent over the bundled
content set, using 1000 distinct seeds
**When** the matches complete
**Then** the median match length is at most 40 plies
**And** no match exceeds 60 plies

### AC-013: Engine invariants hold across randomized play

**Given** any reachable game state produced during randomized self-play
**Then** each side has at most one king and the match ends the ply a king is captured
**And** the piece count is never negative and never exceeds the starting count plus pieces created by
resolved effects
**And** every action offered by the engine is accepted by the engine when played
**And** serializing the state and deserializing it yields a state that produces the identical
legal-action set

### AC-014: The editor creates content that is immediately playable

**Given** the in-app editor
**When** the author creates or edits a piece, a rule card, a skill card, a special-square type, a
board with its initial placement and painted special squares, or a variant preset bundling them,
and saves
**Then** the saved content passes validation before it can be saved as playable
**And** starting a match with the preset containing it uses the new content in that same session

### AC-015: User content round-trips through export/import

**Given** a user-authored variant preset stored in browser-local storage
**When** it is exported to JSON and that JSON is imported into a fresh browser profile
**Then** the imported preset is byte-equivalent in content to the exported one and plays identically
under the same seed

### AC-016: All player-facing content text is i18n-keyed

**Given** any bundled piece, card, board, or preset definition
**When** its text fields are inspected
**Then** each is an i18n key resolved through a locale bundle, not an inline literal string
**And** the `ko` bundle resolves every key used by bundled content

### AC-017: Both players' held skill cards are visible

**Given** an in-progress hot-seat match in which both players hold skill cards
**When** either player views the board
**Then** both players' held skill cards, and which of them are already used, are visible on screen

### AC-018: Special squares are content data with content-defined abilities

**Given** a board definition that paints one or more squares with a special-square type, where each
type is itself a content definition carrying an ability (for example: destroys any piece that enters,
teleports an entering piece to a paired square, cannot be entered or passed through, promotes an
entering pawn, or blocks capture of the piece standing on it)
**When** a match is played on that board
**Then** the engine applies each square's ability from its definition alone, at the moment the
definition's trigger fires (on enter / on leave / while occupied / while generating moves)
**And** no engine source file names any individual special-square type
**And** the special squares are visibly distinguished on the board with their ability text available
to both players

## 🚫 Non-Goals

- **Online / networked play.** No server, no matchmaking, no authoritative game state. Hot-seat only.
- **AI opponent.** The random-action agent exists for testing (AC-012, AC-013), not as a playable
  opponent.
- **Accounts, ranking, leaderboards, monetization, ads.**
- **Community sharing of user content** beyond manual JSON export/import — no gallery, no remote
  content fetch, no moderation.
- **Comeback / rubber-band balancing.** Draft offers are unbiased (AC-006), explicitly decided.
- **Native mobile build.** Mobile is a follow-on phase; this SPEC covers the web build only. The
  engine's framework-independence is the only mobile-facing requirement here.
- **Locales other than `ko`.** The i18n *structure* is required (AC-016); other locale bundles are not.
- **Chess-legality features excluded by the base rules:** checkmate detection, stalemate, threefold
  repetition, the 50-move rule, castling, en passant, pawn double-step.
- **Balance tuning of the card set.** Cards must be schema-valid and playable; they are not required
  to be competitively balanced in the MVP.

## ⚠️ Constraints

| Constraint | Value | Rationale |
|---|---|---|
| Test framework | `vitest` (engine + content), `playwright` (board & editor E2E) | User decision. Engine is pure TS with no DOM, so unit-level Vitest covers the rules; the editor and hot-seat flows are only observable through the UI. `fast-check` under Vitest supplies the property tests AC-013 requires. |
| Engine purity | Engine modules import no React, no DOM, no browser API | Mobile port re-hosts the view layer only; also what makes AC-012/AC-013 runnable headless. |
| Determinism | All randomness (rule-card draw, draft offers, test agent) derives from a single match seed | AC-004 and AC-012 are unverifiable without it; also enables replay and bug reproduction. |
| Content authoring | Adding a piece/card/board/special-square/preset changes content data only, never engine source | Core product thesis (Outcome 2). Enforced by AC-009, AC-018, and by a review check that no bundled content id appears in engine sources. |
| Content axes | Five: board (incl. special squares), piece, rule card, skill card, variant preset | Fixing the axis list bounds the schema and the editor's surface; a sixth axis is a SPEC change, not an implementation detail. |
| Validation policy | Fail-closed at load; editor may save incomplete drafts but may not mark them playable | User decision. Prevents unreachable "why is my card missing?" states. |
| Card timing model | Cards resolve immediately, on the owner's turn only, never in response to another card | RESEARCH pitfall 1 — avoids an MTG-style priority/stack system entirely. |
| Storage | Browser-local storage + JSON export/import; no server persistence | User decision; keeps the MVP serverless and survives the mobile port. |
| Text | i18n keys in content definitions; `ko` bundle only | User decision — zero-cost option on future localization. |
| Match length | Hard cap 60 plies; median random self-play ≤ 40 plies | User decision; the only measurable definition of "fast" available without human trials. |
| Target surface | Portrait mobile-web viewport is the primary layout target | Inferred from the stated mobile-app launch plan; desktop is secondary. Not separately interviewed. |

## ✅ Verification Criteria

| Scenario | Verification mode | Test name / manual step |
|---|---|---|
| AC-001 | unit | `tests/engine/setup.test.ts::initial position is 6x6 Los Alamos` |
| AC-002 | unit | `tests/engine/win-condition.test.ts::king capture ends the match` |
| AC-003 | unit | `tests/engine/win-condition.test.ts::ply cap resolves by material` |
| AC-004 | property | `tests/engine/determinism.test.ts::same seed yields same rule card and offers` |
| AC-005 | unit | `tests/engine/draft.test.ts::first draft offers three distinct cards` |
| AC-006 | unit | `tests/engine/draft.test.ts::second draft opens on turn six without repeats` |
| AC-007 | unit | `tests/engine/skill-cards.test.ts::playing a card consumes the turn` |
| AC-008 | unit | `tests/engine/skill-cards.test.ts::out-of-turn card play is rejected` |
| AC-009 | unit (parametric) | `tests/content/piece-definitions.test.ts::piece move generation matches definition` |
| AC-010 | unit | `tests/content/bundled-content.test.ts::bundled set meets minimum counts and validates` |
| AC-011 | unit (parametric) | `tests/content/validation.test.ts::invalid fixtures are rejected with field path` |
| AC-012 | unit (statistical) | `tests/engine/selfplay.test.ts::median match length within budget` |
| AC-013 | property | `tests/engine/invariants.test.ts::engine invariants hold under random play` |
| AC-014 | e2e | `e2e/editor.spec.ts::authored content is playable in the same session` |
| AC-015 | property | `tests/content/preset-io.test.ts::export import round trip` |
| AC-016 | unit (static) | `tests/content/i18n.test.ts::content text fields are keys resolvable in ko` |
| AC-017 | e2e | `e2e/hotseat.spec.ts::both players skill cards are visible` |
| AC-018 | unit (parametric) | `tests/content/special-squares.test.ts::square abilities apply from definition` |

## ❓ Open Questions

These are handed to `/hm:plan` as ADR candidates. None blocks test authoring.

1. **Content effect vocabulary.** RESEARCH recommended a hybrid (declarative schema for common
   patterns + typed escape hook). With the in-app editor now in the MVP, a card whose behavior lives
   in a code hook is *not editable in the editor* — so the hybrid's escape hatch is in tension with
   Outcome 3. `plan` must decide: (a) fully declarative vocabulary, editor covers everything, some
   RESEARCH cards get cut or reshaped; or (b) hybrid, with hook-backed cards marked read-only in the
   editor. This is the single largest architectural decision in the project.
2. **Editor form generation.** Proposed constraint: the editor renders forms *from* the content
   schema, so vocabulary changes do not require editor changes. Not yet confirmed by the user.
3. **Which 10 rule cards and 14 skill cards ship.** RESEARCH drafted R1–R14 and S1–S12; S12
   (Counterspell) violates the "no response cards" constraint and needs redesign or replacement, and
   4 rule cards must be cut. Selection also depends on question 1.
4. **Passive-ability vocabulary sharing.** Piece passives (AC-009) and skill-card passives look like
   the same mechanism. Should they share one vocabulary and one evaluation point, or stay separate?
5. **`boardgame.io` adoption.** With online play out of scope, the case is weak; `plan` should record
   the rejection (or adoption) as an ADR rather than leaving it implicit.
6. **Undo / takeback.** Not interviewed. Children mis-tap; a serverless hot-seat game can afford undo
   cheaply if state is immutable. Decide in `plan` — retrofitting is expensive if state is mutable.
7. **Rule-card and match-length interaction.** AC-012's median is measured over the bundled set as a
   whole; individual rule cards (e.g. a fog or blitz card) may skew length. Whether per-card length
   budgets are needed is deferred.
8. **Editor storage quota.** Browser-local storage is finite; behavior when a user's content exceeds
   it is unspecified.
9. **Effect resolution order across the five axes.** A single move can now trigger a special-square
   ability, a piece passive, a rule-card modifier, and a skill-card effect at once (e.g. a piece with
   "survives one capture" enters a "destroys entering pieces" square under a rule card that redirects
   movement). The SPEC's no-stack constraint forbids interrupts but does not fix a *deterministic
   ordering*. `plan` must define one total order over trigger points and record it as an ADR — this
   is the most likely source of engine bugs in the project.
10. **Which 4+ special-square types ship, and whether paired squares (portals) are in the MVP.**
   Pairing introduces cross-square references, which the validator must check (AC-011 already covers
   dangling references, but pairing symmetry is a further rule).

## 🔍 Refinement Decisions

- **Step 0:** skip heuristic not applicable — multi-file, new file format, 17 acceptance criteria,
  high reversal cost. Full interview ran.
- **Round 1 (Outcomes + Constraints):** MVP is hot-seat 2P only; Los Alamos 6x6 base *but* pieces are
  content data like cards; win by king capture, no checkmate; playing a skill card consumes the turn.
- **Round 3 (Outcomes/modding scope + Constraints):** in-app content editor is in the MVP; piece data
  extends to passive abilities; Vitest + Playwright; no comeback bias on the second draft.
  Concern raised and overruled by the user: building the editor before the effect vocabulary
  stabilizes risks freezing the UI early — mitigated by the schema-driven-form proposal (Open
  Question 2).
- **Round 4 (Constraints + Verification/oracle):** fail-closed validation; "fast" is defined as median
  ≤ 40 plies over 1000 seeded random self-play matches; i18n keys with `ko`-only bundle; editor covers
  all four content axes plus variant presets.
- **§2.5 inequality gate:** 4 of 6 candidates passed and were asked (card counts, storage,
  information visibility, termination rule). Skipped: portrait-mobile target (common-ground,
  self-inferred ≥ 0.95) and monetization/accounts (EIG below ε — already a non-goal).
- **Post-interview addition (user, same session):** special squares with content-defined abilities
  become a fifth content axis, carried by the board definition (AC-018; AC-010 minimum raised to 4
  square types; editor scope in AC-014 extended). Two RESEARCH rule cards (R9 Bomb Squares, R10
  Portal Corners) are reclassified from rule cards to square types, which makes them reusable across
  boards. This addition created Open Questions 9 and 10.
- **Oracle elicitation:** every AC carries an `oracle_source` + independence evidence in
  `SPEC-variant-chess-6x6-cards.machine.yaml`. Six ACs use `property` oracles (metamorphic relations
  that hold regardless of implementation), which is the main defense against the circular-oracle risk
  in a project where the engine and its tests would otherwise be written from the same reading of the
  rules.
