---
type: research
task_slug: piece-skill-creation-ux
status: complete
created: 2026-08-08
tags: [strange-chess, research, react, typescript, editor-ux, movement-grid, content-authoring]
mtime_warn_days: 7
libs_fetched: []
sources:
  - https://en.wikipedia.org/wiki/Betza%27s_funny_notation
  - https://www.chess.com/blog/Super_Free_Chess/chesscraft-create-and-play
  - https://www.nngroup.com/articles/progressive-disclosure/
  - https://mres.medium.com/designing-for-wide-walls-323bdb4e7277
  - https://dev.to/rocketsquirreldev/curing-blank-canvas-paralysis-with-1-click-templates-deskflow-update-3pbc
  - https://github.com/fairy-stockfish/Fairy-Stockfish/discussions/773
related_docs:
  - "[[PLAN-ui-ux-productization]]"
  - "[[RESEARCH-ui-ux-productization]]"
  - "[[VOCAB-GAPS-variant-chess-6x6-cards]]"
  - "[[PLAN-variant-chess-6x6-cards]]"
  - "[[REVIEW-chess-craft-pixel-redesign-2026-08-07]]"
  - "[[PLAN-custom-piece-skill-balance]]"
summary: "Split the movement axes (slides out of the grid) and prove every edit with a live engine-driven preview."
---

# RESEARCH — Piece & Skill Creation UX

## 🎯 Recommended Direction

**The 7x7 grid is not hard to use because it is badly styled — it is hard to use
because it is not a picture of anything.** The same 49-cell canvas means two
unrelated things depending on a radio button underneath it, one of those meanings
is not drawable on a finite grid at all, and nothing on screen ever shows the
author what the piece actually does. The direction with the best
cost-to-relief ratio is to **separate the movement axes the way the only shipped
precedent does — slides become a small set of direction toggles OUTSIDE the grid,
the grid becomes leap destinations only — and to make every edit provable by
rendering the draft piece's real legal moves on a preview board via the existing
engine.**

Rationale: the schema already admits multiple `MovePattern`s per piece
(`src/content/schema.ts:364`), so splitting slides from leaps is a pure editor
change with **no `schema_version` bump and no content migration** — and it
simultaneously retires `readGrid`'s single largest lockout cause
(`movement.length > 1`). The preview is what converts the split from "two
controls instead of one" into "you can see what you made", and because a preview
must build a validated `ContentSet` to call the engine, it also drags
validation forward from save-time to keystroke-time for free. Neither half works
alone: the split without a preview is still invisible, and the preview without
the split just renders a lie faithfully.

Informational only — `/hm:plan` makes the binding call.

## 🔍 Refinement Decisions

`--deep` was not set; Phase 0 / Phase 0.5 interview skipped.

**Discovery lens:** ① User-workflow / product opportunity (where the authoring
flow actually breaks for a 초·중학생 author), ② Technical architecture (the
movement data model and what the grid control can and cannot round-trip). The
research/benchmark and risk/compliance lenses were not used — no academic or
compliance question binds here.

## 🧨 What Is Actually Broken

Findings verified by reading the source, not inferred.

### F1 — For `slide`, one lit cell means an unbounded ray. The grid draws one square and the piece crosses the board.

`writeGrid` emits the painted offsets as a pattern's `vectors` with **no**
`maxDistance` (`src/ui/PieceMoves.tsx:145-149`):

```ts
const pattern = (vectors: Array<[number, number]>) => ({
  kind: grid.travel,
  vectors,
  ...(grid.forward ? { forward: true } : {}),
})
```

and the engine expands a slide to the board edge when `maxDistance` is absent
(`src/engine/engine.ts:121`):

```ts
const maxSteps = pattern.kind === 'slide' ? (pattern.maxDistance ?? Math.max(state.width, state.height)) : 1
```

Consequences, all of them user-visible:
- Painting the single cell `1,0` with travel `slide` produces a rook file, not a
  one-square move. The picture is wrong.
- Painting `1,0` **and** `2,0` and `3,0` with `slide` is exactly the same piece as
  painting `1,0` alone — three taps that do nothing. The picture is redundant.
- Reading a real rook back (`readGrid`) lights the four cells adjacent to centre —
  **visually identical to a king**, distinguished only by a radio button below the
  grid (`src/ui/PieceMoves.tsx:95`, `src/ui/RecordForm.tsx:1072-1085`).

This is the direct answer to "7x7 칸 — 이거 뭐 어떻게 하라는거". There is no
correct way to read the grid, because for one of its three modes the grid is not
depicting reachable squares.

### F2 — `step` and `jump` are the same thing. The picker offers three options and two behaviours.

`reachFrom` branches on `'slide'` only; every other kind gets `maxSteps = 1`
(`src/engine/engine.ts:121-134`), and no other engine or content code branches on
`'jump'` (verified by grep across `src/engine/` and `src/content/` — the only
matches are the schema enum at `src/content/schema.ts:171` and authored data in
`src/content/sets/*.ts`). A single-step move has no intervening square, so there
is nothing for a "jump" to jump over.

This is the project's own most-recurring recorded failure shape,
`[fail:design] declared-but-inert-vocabulary` (`.claude/memory/failures.md:38-43`):
*"A schema entry that validates but that no interpreter ever reads is worse than a
missing one … the author gets a card that passes every check, draws, plays, and
does nothing, with no signal anywhere."* Here the author gets a **piece**.

### F3 — The simple maker refuses to open precisely the interesting pieces.

`readGrid` returns `null` — and the screen replaces the grid with a note box
pointing at the 45-control schema form (`src/ui/RecordForm.tsx:1002-1013`) — for:

| Cause | Code |
|---|---|
| more than one movement pattern | `if (movement.length > 1) return null` (`PieceMoves.tsx:78`) |
| `attack` present but not exactly one pattern | `PieceMoves.tsx:79` |
| any `maxDistance` cap | `PieceMoves.tsx:83` |
| any offset beyond radius 3 | `PieceMoves.tsx:62,84` |
| movement and attack using different travel kinds | `PieceMoves.tsx:86-87` |
| movement and attack disagreeing on `forward` | `PieceMoves.tsx:91-92` |

The first row is the expensive one: a piece that both slides and leaps — the
bundled knight-honour grant is one (`src/content/sets/bundled.ts:532`) — is two
patterns, so the child-facing control steps aside for exactly the pieces a child
most wants to build. ADR-006 already recorded that the schema-shaped alternative
is *"unusable for the target age group"* (`PLAN-variant-chess-6x6-cards.md:73-91`),
so the fallback is not a fallback.

Note the fourth row is nearly dead on a 6x6 board — radius 3 covers every offset
that fits. Widening the grid is not the fix; it addresses the one cause that
almost never fires.

### F4 — Nothing ever shows the piece moving.

The only feedback is a counted sentence, `describeGrid` (`src/ui/PieceMoves.tsx:173-180`),
which counts **lit cells** — a number that is meaningless under F1, since four lit
cells on a slide are not four moves. `RESEARCH-ui-ux-productization.md:133` recorded
this as P1 more than one cycle ago — *"No playtest-from-editor. … 'Create →
immediately play' is the UGC retention moment"* — and it is still open.

### F5 — Validation only runs at save, against the whole document.

`commitDraft` runs the full `loadContentSet` (`src/editor/draft.ts:141,177`) and
errors populate only afterwards (`RecordForm.tsx:894-899`). Combined with
fail-closed AC-011 (`specs/SPEC-variant-chess-6x6-cards.md:125-132`), a child's
first signal that something is wrong is a document-level error naming a JSON field
path. The two live pre-save hints that do exist (`piece-no-moves`,
`RecordForm.tsx:1031-1032`) prove the pattern is affordable; it just was not
generalised.

### F6 — "Moves but never captures" is unauthorable, and the reason is a schema floor.

`writeGrid` omits `attack` when there are no capture squares
(`PieceMoves.tsx:156`), and an omitted `attack` means captures fall back to the
movement patterns (`schema.ts:365-366`). `attack` carries `.min(1)`, so an empty
capture set has no encoding. A previous review froze this as deliberate
(`REVIEW-chess-craft-pixel-redesign-2026-08-07.md:210-232`) — any redesign that
"fixes" it silently makes a currently-authorable shape unrepresentable, and doing
it properly is a `schema_version` bump.

### F7 — The card recipe is 4 slots wide and the vocabulary is 45 entries deep.

`readRecipe` covers one effect with one action and returns `null` for no effect,
multiple effects, multiple actions, a `forEach` quantifier, or a nested condition
(`src/ui/CardRecipe.tsx:97-117`); `not`/`all`/`any` and `swap_pieces` are excluded
by construction (`CardRecipe.tsx:44-54`). Everything else lands in the detailed
form's `VOCABULARY_CONTROLS`, ~45 entries (`src/editor/controls.ts:145`). The
gate already measured what that breadth buys: *"Only 6 of 28 cards were expressible
against the vocabulary as it stood"* (`VOCAB-GAPS-variant-chess-6x6-cards.md:178-180`).
Breadth is not the card maker's problem — reachability is.

### F8 — The room builder is already step-tabs, and that was never planned.

`src/ui/RoomDetail.tsx:130` — `const STEPS = ['board','pieces','place','cards','name']`
— rendered as freely-clickable tabs (`setStep`, `RoomDetail.tsx:571-582`), not a
linear wizard. ADR-019 explicitly rejected a wizard because it *"slows down repeat
edits, which is the dominant authoring loop"* (`PLAN-ui-ux-productization.md:207`),
and the Chess Craft import landed step-tabs anyway with **no PLAN and no SPEC**
(`REVIEW-chess-craft-pixel-redesign-2026-08-07.md:28-34`). Tabs largely dodge
ADR-019's objection — a repeat edit jumps straight to its step — but the record
does not say so anywhere. A redesign should settle this on purpose rather than
inherit it.

## 🛠️ Approaches Found

### A — Split the axes: slides become toggles, the grid becomes leaps only

| Field | Content |
|---|---|
| Approach | 8 direction toggles (4 orthogonal + 4 diagonal) with an optional reach cap, rendered outside and above the grid; the 7x7 grid keeps only bounded leap destinations, each still cycling move/capture/both. Compiles to up to two `MovePattern`s: one `slide`, one `step`. |
| Assumption | Presumes the schema tolerates two patterns per piece and that no migration is needed. |
| Evidence | It does: `movement: z.array(movePattern).min(1)` (`schema.ts:364`). The one shipped grid-painting precedent does exactly this — ChessCraft offers *"any combination of the 8 bishop or rook slides, plus a 7x7 grid of knight-like hops"* (chess.com blog, VERIFIED) — and this repo already borrows ChessCraft's visual language (`.claude/memory/wiki.md`, `chess-craft-pixel-redesign`). Betza confirms the structural reason: a rider is *"the step … repeated (in absence of obstacles)"* (Wikipedia, VERIFIED), i.e. distance is a parameter, not a square set. |
| Trade-off | Two controls where there was one, and the author must learn that "slide" and "hop" are different questions. Bought: the grid stops lying, the redundant-tap problem disappears, `movement.length > 1` stops being a lockout, and a reach cap gives `maxDistance` a home (retiring a second lockout cause). |
| Compatibility | High. Editor-only. No `schema_version` bump, no content migration. `readGrid`/`writeGrid` are rewritten; the ADR-006 coverage test must be re-derived against the new control set. |
| Risk | medium |

### B — Preview-first: render the draft piece's real legal moves on a small board

| Field | Content |
|---|---|
| Approach | A preview board beside the maker. On every edit, build a scratch `GameState` with the draft piece on a centre square (plus a couple of dummy targets), validate the draft through `loadContentSet`, and highlight what `legalActions` returns. |
| Assumption | Presumes the engine is callable as a pure function from the editor. |
| Evidence | It is: `legalActions(state, content)` is exported and takes state + content, returning actions (`src/engine/engine.ts:384`); the underlying `reachFrom` is pure over `(state, from, piece, patterns)` (`engine.ts:108-138`). ADR-009's DOM board already exists to render into. |
| Trade-off | Couples the editor to the engine and to a validated `ContentSet` — but that coupling is the mechanism that pulls F5's validation forward to keystroke time, so the cost buys two fixes. Preview needs a defined "what does an incomplete draft show" state. |
| Compatibility | High for movement; a *card* preview is much harder (effects need a game situation to fire in) and should probably be scoped separately. |
| Risk | medium |

### C — Remix-first entry: never open a blank record

| Field | Content |
|---|---|
| Approach | The maker opens on a gallery of the bundled pieces/cards ("make one like this"), not an empty form. `blankDraft` becomes the last option, not the first. |
| Assumption | Presumes the bundled set is broad enough to seed most intents. |
| Evidence | The documented fix for the failure mode: *"When users first open the app and stare at a massive, empty dark grid, it's intimidating"* → *"It turns a daunting creation task into a simple editing task"* (dev.to, VERIFIED). Consistent with Resnick's *"easy ways for novices to get started (low floor)"* (VERIFIED) and with Scratch's remix-centred design (UNVERIFIED verbatim). |
| Trade-off | Cheapest large win and independently shippable, but fixes none of F1–F2 — a remixed rook still shows the misleading grid. It multiplies A+B's value rather than substituting for them. |
| Compatibility | High. `openDraft` already clones from a source (`src/editor/draft.ts`); ADR-025's "a room is a reference set, never a copy" is untouched because a remix creates a new library record, not a room-private one. |
| Risk | low |

### D — Keep one grid, add a notation/expert mode

| Field | Content |
|---|---|
| Approach | Leave the simple grid as-is and route everything it refuses into a Betza-style string or the existing detailed form, behind an "advanced" disclosure. |
| Assumption | Presumes the refusal boundary is acceptable and only the escape hatch needs work. |
| Evidence | Every expressive tool surveyed is notation-based — ZRF, Ludii, Betza/XBetza, Fairy-Stockfish `variants.ini`. But Fairy-Stockfish, built specifically for fairy pieces, still cut Betza down: *"only a limited subset of Betza notation can be used"* (GitHub #773, VERIFIED). NN/g supports the disclosure shape but warns a badly-drawn split *"can actually slow user performance rather than improve it"* (VERIFIED). |
| Trade-off | Cheapest to build and leaves F1/F2 fully intact — the misleading grid is the thing the user reported. Also aims a mini-language at 초·중학생, which ADR-006 already rejected once. |
| Compatibility | High (changes almost nothing). |
| Risk | low build risk, **high** risk of not solving the reported problem |

## ⚠️ Pitfalls

- **Widening the grid to 9x9 or 11x11 fixes the one lockout cause that almost never
  fires.** Off-grid offsets are impossible to author on a 6x6 board (`PieceMoves.tsx:62`);
  the lockouts that bite are multi-pattern and `maxDistance` (F3).
- **Adding a "never captures" option is a schema change, not a UI change** —
  `attack` carries `.min(1)`, and a previous review froze the current fallback
  deliberately (F6). Shipping it as a checkbox that quietly writes something else
  is the `declared-but-inert-vocabulary` shape again.
- **Removing a control without removing the field is the recorded failure.**
  `PLAN-custom-piece-skill-balance.md:607,659` — `cost` was retired *at the type
  level*, and R-6 flags that deleting only the UI control is exactly the inert-
  vocabulary trap. If `jump` is merged into `step` (F2), it must go at the type
  level with a migration, not just lose its button.
- **The ADR-006 coverage test is enumerated along one axis and is blind to the
  others** (`.claude/memory/failures.md:51`) — its first draft missed schema v3's
  `duration` *parameter*. Any new control set must re-derive the gate, not extend
  the old row list.
- **A `key` that omits `source` re-runs a known bug.** `RecordForm`/`RoomDetail`
  once overwrote an unrelated record after import→edit→save because the component
  *"snapshots state at mount while reading one of its inputs LIVE"*
  (`.claude/memory/failures.md:111`). A rebuilt maker re-enters this territory.
- **Editor controls are not a validation boundary** (`RESEARCH-custom-piece-skill-balance.md:50,85-87`)
  — a constraint that lives only in a React control is absent on the import path.
- **A live preview must not become a second move generator.** Reimplementing
  reachability in the editor guarantees drift from `reachFrom`; the preview has to
  call the engine.
- **Save-time-only validation combined with fail-closed loading is a hard stop for
  a child**, not a warning (F5 + AC-011).

## ❓ Open Questions

1. **Scope of the schema touch.** Is this an editor-only redesign (A + B + C, no
   `schema_version` bump), or does it also retire `jump` (F2) and open the
   never-captures encoding (F6) — both of which are schema-level with migration
   obligations?
2. **Does the detailed 45-control form survive, and where?** ADR-006's coverage
   test requires every vocabulary entry be reachable from *some* control, so the
   detailed form cannot simply be deleted. Does it stay as an "expert" tab, or
   does the redesign have to rehouse all 45?
3. **How is a reach cap expressed to a nine-year-old?** A `maxDistance` number
   input is the literal schema; "1칸 / 2칸 / 끝까지" is the child-facing version.
   Which, and does the choice change what `readGrid` can round-trip?
4. **ADR-019 reconciliation.** Step-tabs shipped in `RoomDetail` against an ADR
   that rejected wizards, with no PLAN (F8). Do the piece/card makers adopt the
   same step-tab pattern — and does ADR-019 get amended or superseded?
5. **Does the card maker get a preview at all?** A movement preview is
   mechanically clear; an effect preview needs a game situation to fire in. Is a
   card preview in scope, or does the card path get remix-first (C) plus template
   cards only?
6. **Interaction with in-flight balance work.** `PLAN-custom-piece-skill-balance`
   introduces grading/budget and carries an unlanded SPEC amendment (R-10,
   `:609`). Does the redesigned maker have to surface a budget, and does that
   collide with the open question already recorded there — *"If the target is
   children, a numeric budget may communicate nothing and a 'pick 3 of these 8
   powers' construction may do the same job with no arithmetic"*
   (`RESEARCH-custom-piece-skill-balance.md:172-190`)?
7. **Is "제대로 동작안함" fully covered by F1–F7?** These are the defects the code
   shows. If there is a specific reproducible break the user hit that is not on
   this list, it should be named before `/hm:plan`.

## 📚 Sources

- Betza's funny notation — https://en.wikipedia.org/wiki/Betza%27s_funny_notation (VERIFIED: riders as repeated steps; hoppers; lame leapers `n`; initial-only `i`; divergent move/capture)
- ChessCraft — https://www.chess.com/blog/Super_Free_Chess/chesscraft-create-and-play (VERIFIED: *"any combination of the 8 bishop or rook slides, plus a 7x7 grid of knight-like hops"*)
- Nielsen Norman Group, Progressive Disclosure — https://www.nngroup.com/articles/progressive-disclosure/ (VERIFIED, incl. the warning that a bad split slows users)
- Resnick, "Designing for Wide Walls" — https://mres.medium.com/designing-for-wide-walls-323bdb4e7277 (VERIFIED: low floor / high ceiling / wide walls)
- "Curing Blank Canvas Paralysis with 1-Click Templates" — https://dev.to/rocketsquirreldev/curing-blank-canvas-paralysis-with-1-click-templates-deskflow-update-3pbc (VERIFIED)
- Fairy-Stockfish discussion #773 — https://github.com/fairy-stockfish/Fairy-Stockfish/discussions/773 (VERIFIED: *"only a limited subset of Betza notation can be used"*)
- UNVERIFIED (search-synthesis, not fetched): Ludii ludeme examples; Musketeer Chess fixed roster; Kodu Game Lab when-do tiles; Scratch remix research; Zillions ZRF direction vectors. No citable source was found for "save-time-only validation" or "unrepresentable-record lockout" as *named* failure modes — those are argued here from this repo's own code, not from external authority.

## 🔗 Related Internal Docs

- [[PLAN-ui-ux-productization]] — ADR-019 (list→detail, wizard rejected), ADR-020 (strings overlay), ADR-021 (tokens), ADR-025 (a preset IS the room), ADR-026 (rooms are the entry point)
- [[RESEARCH-ui-ux-productization]] — the "editor is a debug console, not a creation tool" gap list (P1, still partly open)
- [[VOCAB-GAPS-variant-chess-6x6-cards]] — 6-of-28 expressibility finding; open gaps G-3, G-4a, G-15, G-16
- [[PLAN-variant-chess-6x6-cards]] — ADR-001 (declarative only, no code hook), ADR-006 (hand-crafted forms + round-trip coverage test)
- [[REVIEW-chess-craft-pixel-redesign-2026-08-07]] — the no-PLAN import that produced the current makers; frozen finding on the move-only fallback
- [[PLAN-custom-piece-skill-balance]] — in-flight grading/budget work and its unlanded SPEC amendment
- [[SPEC-variant-chess-6x6-cards]] — target audience (초·중학생), AC-011 fail-closed, AC-014 immediately playable, AC-015 round-trip, AC-016 i18n
