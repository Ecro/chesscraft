---
type: spec
task_slug: unified-create-ux
status: approved
created: 2026-08-08
tier: 2
tags: [strange-chess, spec, react, typescript, editor-ux, progressive-disclosure]
test_framework: vitest
research_doc: "[[RESEARCH-unified-create-ux]]"
summary: "One maker screen: the sentence is the only editor, and it can say everything the game ships."
---

# SPEC — One maker screen, no easy/advanced split

## 🎯 Intent

The maker splits itself in two — `쉽게` / `자세히` (`RecordForm.tsx:1419-1435`) —
and the split is not a teaching aid, it is a scar over one fact: the easy surface
cannot express everything, so a second surface had to exist to say the rest. A
child who wants a card that acts on *every* enemy pawn is told, by a note inside
the easy screen, to go to the other tab and use a 45-control schema form with an
effect index cursor.

The gap is small and fully enumerable. All 6 bundled pieces already round-trip
through the easy move grid; 8 of 26 bundled cards refuse, for exactly four
reasons — the `forEach` quantifier (6 cards), two actions in one effect (1), a
two-target action (1), and a compound `all` condition (1). Closing those four
makes the easy surface express 100% of shipped content, at which point the second
tab holds nothing a child could not otherwise reach.

This SPEC removes the split rather than relabelling it: one scrolling screen per
record, the sentence builder as the only structural editor for every kind that
has effects, and the indexed-palette form deleted.

## 🌅 Outcomes

A child using 만들기 can:

- See **one** screen per record. No tab strip, no `자세히`, and no `고급 설정`
  disclosure — there is nothing on the screen that has to be opened before it
  can be used.
- Author a card that acts on **every** matching piece (`forEach`), does **two**
  things, swaps **two** pieces, or fires only when **two** conditions hold — all
  by extending the same sentence, without ever meeting a second form.
- Open every piece and every card the game ships with, and every card a friend
  sends, without a refusal note.
- Author a **special square**'s and a **piece**'s effects in the same sentence
  the cards use — today the special square has no easy front door at all.
- On a phone, always see what they are making (preview), why they cannot save
  yet (errors), and the save button — regardless of how far they have scrolled.

And when a record genuinely cannot be shown as a sentence, they see **what it
does, read-only**, with saving blocked — never a silently flattened record.

## 📋 In-Scope Scenarios

### AC-001: The maker has one surface

**Given** any content kind the maker can open (piece, squareType, ruleCard, skillCard, board, preset)
**When** the record form renders
**Then** no tab control and no second panel exists — `form-tab-simple`, `form-tab-expert`, and `form-panel-expert` are absent from the DOM for every kind
**And** no `<details>`-style disclosure hides an authoring control from the initial render

### AC-002: The four grammar additions round-trip

**Given** a card draft edited through the sentence builder to use a `forEach` quantifier, a second action, a two-target action, or an `all`/`any` condition
**When** the draft is written and read back
**Then** reading the written record returns the same sentence the author built, for every combination
**And** the record validates through the same validator the save button uses

### AC-003: Everything the game ships opens as a sentence

**Given** the bundled content set
**When** each of its 6 pieces and 26 cards is opened in the maker
**Then** none produces a refusal note — the count of records the maker cannot open is 0

### AC-004: The indexed-palette form is gone

**Given** any content kind that bears effects
**When** the record form renders
**Then** `editor-add-effect`, `editor-effect-0`, and `editor-action-0` are absent
**And** the only way to change what a record does is the sentence

### AC-005: The vocabulary stays fully reachable

**Given** every entry in `VOCABULARY_CONTROLS` and every parameter it carries
**When** a record of a kind whose schema admits that entry is open
**Then** the entry's control is present **and enabled** in the render, writes its own value at its own JSON path, and the record round-trips through save and re-open
**And** this holds with no hidden panel involved

### AC-006: Pieces and special squares use the same sentence

**Given** a piece draft and a squareType draft
**When** their effects are authored
**Then** both use the sentence builder, with the same slots and the same wording rules as a card

### AC-007: An unshowable half is read-only, not flattened

> **Amended 2026-08-08 during execute (PLAN Phase 6's e2e run).** The original
> criterion required the save button to be disabled. That was wrong twice over.
> `piece.archer` in the **slice** content set carries two effects, so disabling the
> save made a *shipped* piece uneditable; and the save block was never what
> prevented the flatten. A save writes the draft, and the draft carries the
> unreadable half untouched — the flatten can only come from an **editor** that
> rewrites a part it misread. Suppressing that editor is therefore sufficient, and
> byte-stability of the untouched half is what proves it. The two halves
> (movement, effects) are also independent: one being undrawable must not take the
> other's editor away.

**Given** a record one half of which the screen cannot draw (two effects, or a movement outside the grid model)
**When** the child opens it
**Then** that half renders read-only, stating what it holds, with its editing controls absent
**And** the other half stays fully editable, and saving stays enabled
**And** the unreadable half round-trips through a save byte-for-byte unchanged

### AC-008: Keys are derived, not typed

**Given** a record whose name and description are edited
**When** it is saved
**Then** `nameKey` / `textKey` are derived without any on-screen key field
**And** an existing document whose keys sit in a foreign namespace round-trips through open-and-save unchanged

### AC-009: The phone anchors hold

**Given** the longest authorable record on a 390×844 viewport
**When** the child scrolls to the bottom of the form
**Then** the preview, the error notice region, and the save button are all still within the viewport

### AC-010: The one screen actually scrolls

**Given** the longest authorable record on a 390×844 viewport
**When** the maker is open
**Then** the scrolling container's `scrollHeight` exceeds its `clientHeight` and the document element does not grow past the viewport

### AC-011: No copy points at a destination that no longer exists

**Given** the shipped string table
**When** every editor string is read
**Then** none refers to a tab, panel, or disclosure that the UI no longer renders

## 🚫 Non-Goals

- **No schema change and no content migration.** Every addition here is already
  legal in `content/schema.ts`; `schema_version` does not move.
- **Not every schema-legal shape becomes authorable.** Records with more than one
  effect, or movement patterns outside the grid + direction model, stay
  unauthorable — they fall under AC-007's read-only path. Zero bundled records
  are in this set.
- **The board and room screens are not redesigned.** They already have one
  surface; only the shared chrome changes reach them.
- **No import-time rejection.** A document containing an unshowable record still
  imports and still plays (AC-007), it merely cannot be edited on this screen.
- **Balance, grading, and the engine preview are untouched.** They consume the
  draft and are indifferent to how it was authored.
- **No new visual language.** Pixel sprites, tokens, and the bevel system stay as
  the Chess Craft redesign left them.

## ⚠️ Constraints

| Constraint | Value | Rationale |
|---|---|---|
| Test framework | `vitest` (unit / jsdom) + `@playwright/test` (e2e) | Already the repo's two harnesses (`package.json:11,15`). Panel-membership and visibility claims **must** be e2e: `fireEvent` ignores visibility and let the misplaced `uses` field ship once (`RecordForm.tsx:1443-1447`). |
| Schema compatibility | `schema_version` unchanged; all existing documents load | The four additions are already-legal shapes; a bump would strand saved rooms. |
| Vocabulary coverage | ADR-006's gate must pass against the new controls in the same change | The gate's handholds are the expert panel's test ids; deleting the panel without moving the gate silently drops coverage. |
| Round-trip fidelity | Any newly openable shape must read back identical, proven by test, before it is allowed to open | Silent flattening is the failure this codebase already refused once (`CardRecipe.tsx:88-95`). |
| Viewport | 390×844 is the design target; the shell keeps `height: 100dvh` | `[fail:render] unbounded-parent-defeats-inner-scroll` — a taller form is exactly what broke it. |
| Accessibility | Sentence controls keyboard-reachable and labelled; any sheet keeps the existing focus trap | `Sheet.tsx` already implements what `aria-modal` claims; a second copy is the part that rots. |
| Contrast | Existing art/token contrast floors unchanged and still enforced | ADR-007/ADR-021 floors are measured, not advisory. |

## ✅ Verification Criteria

| Scenario | Verification mode | Test name / manual step |
|---|---|---|
| AC-001 | unit | `tests/ui/maker-one-surface.test.tsx::no tab or hidden panel renders for any draft kind` |
| AC-002 | unit (property) | `tests/ui/recipe-roundtrip.test.ts::every sentence shape reads back as itself` |
| AC-003 | unit (differential) | `tests/ui/recipe-bundled-coverage.test.ts::no bundled record refuses the sentence` |
| AC-004 | unit | `tests/ui/maker-one-surface.test.tsx::the indexed palette form is absent` |
| AC-005 | unit | `tests/editor/vocabulary-coverage.test.ts` (re-pointed, existing gate) |
| AC-006 | unit | `tests/ui/recipe-hosts.test.tsx::piece and squareType author effects as sentences` |
| AC-007 | unit + e2e | `tests/ui/recipe-unshowable.test.tsx::an unshowable record is read-only and byte-stable`; `e2e/editor-readonly.spec.ts` |
| AC-008 | unit | `tests/editor/rename.test.ts` + `tests/ui/rename-wiring.test.tsx` (extended) |
| AC-009 | e2e | `e2e/maker-anchors.spec.ts::preview, errors and save stay in view at 390x844` |
| AC-010 | e2e | `e2e/maker-anchors.spec.ts::the longest record scrolls inside the shell` |
| AC-011 | unit | `tests/ui/i18n.test.ts::no editor string names a removed surface` |

## ❓ Open Questions

None. Every question raised by [[RESEARCH-unified-create-ux]] was resolved in the
interview; the remaining decisions (commit boundary, whether slots open a `Sheet`
or an inline control, how the ADR-006 gate table is re-pointed) are **how**, and
belong to `/hm:plan`.

## 🔍 Refinement Decisions

- **Round 1** — Locked: close the four gaps only (100% of bundled content, not
  every schema-legal shape); **delete** the indexed-palette form rather than
  hide it; unify piece · squareType · ruleCard · skillCard on one sentence
  builder; pin all three phone anchors (preview, errors, save).
- **Round 2** — Locked: an unshowable record renders **read-only with saving
  blocked**, never flattened and never rejected at import; the `고급 설정`
  disclosure is removed and name/text keys are derived automatically.
- **§2.5 gate** — No follow-up candidate passed all five terms; multi-effect
  authoring, accessibility, and performance were all common-ground (prior
  answers, or existing repo gates at inference confidence ≥ 0.95). Interview
  closed.
- **Step 0** — Skip heuristic not applicable: multi-file, user-facing, and it
  deletes controls a standing CI gate depends on.
