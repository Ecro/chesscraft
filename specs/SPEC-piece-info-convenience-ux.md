---
type: spec
task_slug: piece-info-convenience-ux
status: draft
created: 2026-08-08
tags: [chess-craft, spec, typescript, touch-ux, accessibility]
tier: 2
test_framework: vitest
research_doc: "[[RESEARCH-piece-info-convenience-ux]]"
summary: "In-match piece info: a visible selection strip, a long-press accelerator, and a hover route"
---

# SPEC — Piece info and convenience affordances

## 🎯 Intent

Every entity on the match board except the piece already has a tap-to-explain
route: skill cards and rule cards through the hotbar's `SlotDetail`, painted
square types through the legend chips, both landing in one shared `Peek` sheet.
A piece's name and ability text exist in `content.pieces` but are reachable only
from the dex screen, which is a different route (`route === 'dex'`) than a live
match. A player mid-match — the target player is a child — has no way to ask
"what is this, and what does it do" about the thing they touch most.

This SPEC adds that route. It adds it twice on purpose: once through a control
the player cannot fail to see, and once through a gesture that is fast for a
player who already knows it exists.

## 🌅 Outcomes

A player in a match can, without leaving the match:

- See the selected piece's name, mark and ability text in a strip that appears
  where the hint bar already lives.
- Open a full detail sheet for **any** piece on the board — their own or the
  opponent's — and for any painted empty square, by pressing and holding it.
- See **how** a piece moves as a 7×7 grid, or be told plainly that this
  particular piece is too complicated to draw.
- Do all of the above while a skill card is armed, without losing the arming.
- On a pointer device, get the same information from hover and from the keyboard.

What they cannot do today: any of it.

## 📋 In-Scope Scenarios

### AC-001: The selected piece explains itself in place

**Given** a match is in progress and no card is armed
**When** the player taps one of their own pieces
**Then** the strip below the board shows that piece's mark, its localized name
and its one-line ability text, plus a control that opens the full detail sheet
**And** the strip's vertical space is reserved whether or not a piece is
selected, so selecting one does not reflow the board.

### AC-002: Pressing and holding a square opens its detail sheet

**Given** a match is in progress
**When** the player presses a square holding a piece and holds it past the press
threshold without moving beyond the movement threshold
**Then** the detail sheet opens on that piece
**And** no move is committed and the current selection is unchanged.

### AC-003: A press that becomes a drag is a drag, never both

**Given** the player has pressed down on a square
**When** the pointer moves beyond the movement threshold before the press
threshold elapses
**Then** the detail sheet does not open and the drag proceeds as it does today
**And** for every pointer sequence, at most one of {sheet opened, move
committed} occurs — never both.

### AC-004: Every inspectable target on the board has the route

**Given** a match is in progress
**When** the player presses and holds one of their own pieces, an opponent
piece, or a painted square with no piece on it
**Then** the detail sheet opens with the correct entity and its kind label
**And** an unpainted empty square opens nothing.

### AC-005: A piece too complex to draw says so instead of showing nothing

**Given** the detail sheet is open on a piece
**When** the piece's movement can be round-tripped through the 7×7 grid
**Then** the sheet shows the grid, marking move-only, capture-only and both
**And when** it cannot be round-tripped (multiple patterns, mixed travel kinds,
a quantifier, a nested condition), the sheet shows the ability text together
with an explicit line saying this piece cannot be drawn as a grid
**And** the sheet never renders an empty or blank grid.

### AC-006: Inspecting does not disarm an armed card

**Given** the player has armed a skill card and chosen zero or more targets
**When** they press and hold any square, read the sheet, and close it
**Then** the card is still armed with the same targets
**And** the hint bar still shows the card's targeting prompt.

### AC-007: The keyboard reaches the same sheet the pointer does

**Given** a square has keyboard focus
**When** the player presses the inspect key
**Then** the same detail sheet opens as a long press would.

> **Amended 2026-08-08 — the hover tooltip is removed.** This criterion also
> asked for a tooltip naming the piece under a hover-capable pointer, dismissible
> per WCAG 1.4.13. It was built and it shipped; it was then removed at the
> owner's request as noise — on a 6x6 board the pointer crosses most squares on
> the way to anywhere, so the tooltip fired constantly while answering a question
> nobody had asked. The information it carried is not lost: the strip names the
> selected piece and the long press opens the full sheet, and neither is
> ambient. The criterion is narrowed rather than deleted so the keyboard route,
> which is the accessibility-relevant half, keeps its owner.
>
> WCAG 1.4.13 governs content that *appears on hover*; with none appearing, the
> criterion no longer applies here rather than being violated.

### AC-008: The operating system does not eat the press

**Given** the app is running in mobile Safari or mobile Chrome
**When** the player presses and holds a square
**Then** no system callout, selection handle, magnifier or context menu appears
over the board
**And** the board still scrolls and pinches exactly as it does today.

### AC-009: The new surfaces obey the recorded visual rules

**Given** the strip, the sheet's grid and the hover tooltip are rendered
**When** their colours are measured against the surfaces they sit on
**Then** every pair clears the contrast floors the suite already enforces
**And** hovering a square changes its bevel only — no `filter`, no `opacity`
change, and no change to its box size.

### AC-010: The gesture advertises itself

**Given** the selection strip is showing a piece
**When** the player reads it
**Then** the strip carries a line telling them that pressing and holding any
piece opens its full description.

## 🚫 Non-Goals

- **A move history / notation log.** Only single-ply `undo` exists today and it
  stays that way in this cycle.
- **Enriching the captured-piece tray** (`Taken`) with its own tap route.
- **Expanding `describeRejection`** to explain *why* a move is illegal in more
  detail.
- **An explicit info-mode toggle** in the tools row — rejected in interview
  Round 1 in favour of the strip.
- **A route for the square under the active rule card** — the rule card already
  has its own toggle at the top of the screen.
- **Overlaying reachable squares from the detail sheet.** Selection already
  answers "where can it go"; the sheet answers what selection does not.
- **Changing any engine behaviour.** This SPEC is presentation only — no
  content, no resolution order, no legality.
- **Locales other than `ko`.**

## ⚠️ Constraints

| Constraint | Value | Rationale |
|---|---|---|
| Test framework | `vitest` (unit/component) + `@playwright/test` (e2e) | Already the repo's two harnesses; `npm run verify` chains typecheck → build → vitest → playwright → pwa → build-test |
| Press threshold | ~450 ms hold, movement tolerance ~8 px | The documented recipe for separating a hold from a drag; exact values are `plan`'s to tune |
| Press feedback | Visual only — no haptic dependency | `src/ui/sound.ts:63` records that iOS Safari has no `navigator.vibrate`, so a buzz cannot confirm the press on the primary device |
| Hover styling | Bevel change only, under `@media (hover: hover)` | ADR-007 of `PLAN-web-server-deployment`; `styles.css:253-254` forbids glow/brightness affordances |
| Hover content | Must satisfy WCAG 1.4.13 (dismissible, hoverable, persistent) | An author-built popover is not covered by the native-`title` exemption |
| Contrast | No floor in `tests/ui/art-contrast.test.ts` may be lowered | Recorded rule: move the colour, never lower the floor |
| Layout | Strip height reserved unconditionally | `MatchHost.tsx:862-865` — a region that appears only on demand reflows the board under the player's thumb |
| Pointer contract | The square keeps `onPointerDown`/`onPointerUp`/`onClick`; a winning press must clear `dragFrom` **and** suppress the trailing click | `[fail:design] rule-keyed-to-event-not-state` — one input must not produce two commits |
| Compatibility | Mobile Safari 15+, mobile Chrome, and the desktop Playwright project | The PWA already ships to all three |
| Scope | `src/ui/` only — no `src/engine/`, no content changes | Non-Goal above |

## ✅ Verification Criteria

| Scenario | Verification mode | Test name / manual step |
|---|---|---|
| AC-001 | e2e | `e2e/piece-info.spec.ts::selecting a piece fills the strip without reflowing the board` |
| AC-002 | e2e | `e2e/piece-info.spec.ts::press and hold opens the piece sheet without moving` |
| AC-003 | unit | `tests/ui/press-gesture.test.tsx::a sequence never both opens the sheet and commits a move` |
| AC-004 | e2e | `e2e/piece-info.spec.ts::own piece, enemy piece and painted square each open; bare square does not` |
| AC-005 | unit | `tests/ui/piece-detail.test.tsx::every bundled piece renders either a grid or the undrawable notice` |
| AC-006 | e2e | `e2e/piece-info.spec.ts::inspecting while a card is armed preserves the arming` |
| AC-007 | e2e | `e2e/piece-info.spec.ts::focus plus i opens the same sheet the pointer route opens` |
| AC-008 | e2e + unit | `e2e/piece-info.spec.ts::a long press raises no system menu and leaves scrolling intact` (engine-evaluated half) and `tests/ui/touch-hardening.test.ts::suppresses the iOS callout and the selection handles together` (source half — the iOS-only property is not implemented in Playwright WebKit) |
| AC-009 | unit + e2e | `tests/ui/art-contrast.test.ts::piece-info surfaces clear their floors` and `e2e/piece-info.spec.ts::square hover changes bevel only` |
| AC-010 | e2e | `e2e/piece-info.spec.ts::the strip names the press-and-hold gesture` |

## ❓ Open Questions

1. **Which key is the keyboard inspect key** (AC-007)? `i` is free but
   undiscoverable; `Shift+Enter` collides with nothing today. `plan` picks it
   and records the reason.
2. **Does the hover tooltip carry the ability text or only the name** (AC-007)?
   The name alone keeps it small and keeps the strip the canonical route; the
   full text makes the tooltip a second answer to maintain.
3. **Where the strip's mark comes from for an opponent piece under the
   side-tint contract** — `pieceMark` takes a side, and the strip is not on the
   board, so the tint has no square behind it to sit on. `plan` decides whether
   the strip mark carries a side tag.

## 🔍 Refinement Decisions

- **Round 1** — Locked: selection strip as the floor plus long-press as the
  accelerator (over strip-only, press-only, or an info-mode toggle); inspectable
  targets are own pieces, opponent pieces and painted empty squares (rule-card
  square excluded); the sheet shows a 7×7 move grid with an explicit text
  fallback when `readGrid` cannot round-trip the piece; scope narrowed to piece
  info, with move log / capture tray / rejection detail pushed to Non-Goals.
- **Round 2** — Locked: a hover tooltip ships in addition to the right-click and
  keyboard routes, which promotes WCAG 1.4.13's three conditions from advice to
  acceptance criteria (AC-007); the long-press gesture is advertised by a line
  in the strip rather than by a first-run coach mark; a long press while a card
  is armed opens the sheet and preserves the arming (AC-006).
- **Gate (§2.5)** — Test framework and press-threshold values were generated as
  candidates and skipped: the first is common ground (`vitest` + Playwright are
  already the repo's harnesses), the second scored below the EIG floor (defaults
  suffice and `plan` tunes them).
