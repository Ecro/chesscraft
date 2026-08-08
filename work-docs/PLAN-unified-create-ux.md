---
type: plan
task_slug: unified-create-ux
status: complete
created: 2026-08-08
tags: [strange-chess, plan, react, typescript, editor-ux, progressive-disclosure]
spec: "[[SPEC-unified-create-ux]]"
research_doc: "[[RESEARCH-unified-create-ux]]"
interview_rounds: 3
adrs: 7
validator_outcome: MAJOR_REVISION_RESOLVED
summary: "Grow the sentence until it says everything, then delete the second surface."
---

# PLAN — One maker screen, no easy/advanced split

## 🎯 Executive Summary

**What.** Replace the maker's `쉽게` / `자세히` split with a single scrolling
screen whose only structural editor is a readable sentence. The sentence grows
four grammar pieces it does not have today — a `forEach` quantifier, a second
action, a compound `all`/`any` condition, and a two-target action — after which
it can express 100% of the content the game ships. The indexed-palette form, the
tab strip, and the `고급 설정` disclosure are then deleted.

**Why.** The tabs are not a teaching aid. They exist because the easy surface
cannot say everything, so a second surface had to say the rest — and 8 of 26
bundled cards land in that second surface for exactly four reasons
([[RESEARCH-unified-create-ux]], measured 2026-08-08). Deleting the tab without
closing the gap moves the hard form from a tab into a scroll and makes the screen
worse.

**Key decisions.**

- Slots are edited in a **bottom sheet with pixel-art options**, not inline chips
  or native selects → [ADR-001](#adr-001-a-slot-is-edited-in-a-bottom-sheet-not-in-place).
- The sentence **grows in place**; the residual tail is read-only, never
  flattened → [ADR-002](#adr-002-the-sentence-grows-in-place-and-the-tail-is-read-only).
- **Extend first, delete last** → [ADR-003](#adr-003-extend-first-delete-last).
- Action parameters live **inside the slot's sheet**, under the chosen option →
  [ADR-004](#adr-004-parameters-live-in-the-slots-sheet).
- Name/text keys are **derived**, guarded by an open-and-save invariant →
  [ADR-005](#adr-005-keys-are-derived-behind-an-open-and-save-invariant).
- `movement: 'jump'` **retires from the authorable vocabulary** →
  [ADR-006](#adr-006-jump-retires-from-the-authorable-vocabulary).

**Estimated impact.** ~5 source files (`CardRecipe.tsx`, `RecordForm.tsx`, a new
sheet-slot component, `ko.ts`, `styles.css`), one CI gate re-pointed
(`vocabulary-coverage.test.ts`), 4 e2e specs rewritten. No schema change, no
content migration, no `schema_version` bump.

## 📚 Prior Work

- [[RESEARCH-unified-create-ux]] — the measured refusal set and its four causes;
  the observation that `squareType` has no easy front door at all.
- [[SPEC-unified-create-ux]] — AC-001…AC-011, all oracles declared.
- [[RESEARCH-piece-skill-creation-ux]] / [[PLAN-ui-ux-productization]] — the axis
  split that made the piece grid total. This PLAN is its card-side sequel and
  inherits its rule: **refuse rather than flatten**.
- `[wiki:architecture] piece-maker-split-axes` — records why `readGrid` /
  `readRecipe` return `null` instead of dropping information, and that the
  makers open on a gallery rather than a blank draft.
- `[fail:render] unbounded-parent-defeats-inner-scroll` — a taller form is
  exactly the shape that broke the shell once; Phase 8 re-measures it.
- Learned correction 2026-06-08 (absent-case = feature black hole) — every new
  optional slot states its absent behaviour, enforced by AC-002's exhaustive
  round-trip over quantifier-present and quantifier-absent sentences.

## 🎙️ Interview Transcript

| # | Topic | Category | Question | Options | Choice | Note | → ADR |
|---|---|---|---|---|---|---|---|
| 0 | Stage entry | — | SPEC approved with no open questions; proceed to phases or lock a how-question first? | proceed / one decision / full interview | one decision first | The control shape drives the screen feel more than anything else | — |
| 1 | Slot control | Architecture | How does a child change a slot? | sheet with art / inline chips / native select | **bottom sheet with art** | Keeps the sentence short and readable while the sentence grows; reuses `Sheet.tsx`'s existing focus trap. Costs one extra tap and requires every slot to behave identically | ADR-001 |
| 2 | Ordering | Implementation phasing | Delete the tab first or extend the sentence first? | extend first / delete first | **extend first, delete last** | Deleting first would drop 8 cards to read-only mid-flight — a temporary functional regression on shipped content | ADR-003 |
| 3 | `movement: 'jump'` | Scope boundary | Deleting the indexed movement editor leaves `jump` with no authoring path — the grid re-emits it as `step`. Retire it, add a grid toggle, or keep a movement-only escape hatch? | retire / grid toggle / escape hatch | **retire from the authorable vocabulary** | Raised by the plan-validator's third critical finding. The engine gives `step` and `jump` the same `maxSteps` and branches on nothing else, so the distinction is unobservable in play; teaching it to a child would undo what the axis split just achieved | ADR-006 |

Gate outcome (Step E, round 1): no candidate passed all five terms — action
parameters resolved by inference at confidence 0.85 (recorded as ADR-004 rather
than asked), the coverage-gate re-pointing failed CLARITI (implementation
detail), and the commit boundary is common ground (`/hm:wrapup` owns the single
commit).

Round 3 was opened by the **MAJOR_REVISION** validator pass, not by the gate: the
validator found that the `movement` coverage rows had no successor under the
deleted form, which is a scope decision no ADR covered. Its other three critical
findings were scope/inventory corrections requiring no decision and were applied
directly (see [Plan Validation](#-plan-validation)).

## 📐 Architecture Decision Records

### ADR-001: A slot is edited in a bottom sheet, not in place
**Status:** Accepted (2026-08-08, via /hm:plan interview #1)
**Context:** The sentence stops being four fixed dropdowns and becomes variable
length — a quantifier, up to two actions, a compound condition. The action axis
alone has 12 entries and the target axis 7. Whatever control renders those
options is on screen at the same time as the sentence it is editing.
**Decision:** Every slot renders as a chip showing its current value; tapping it
opens the existing `Sheet` (`src/ui/Sheet.tsx`) containing that slot's options as
pixel-art buttons. Every slot behaves identically, including single-option and
disabled slots.
**Consequences:**
- ✅ The sentence stays short enough to read as a sentence at 390px, which is the
  entire point of the design.
- ✅ Options get pixel art and a large tap target; `Sheet` already implements the
  four things `aria-modal` claims (focus in, trap, Escape, restore), so no second
  focus trap is written.
- ⚠️ One extra tap per edit versus inline chips.
- ⚠️ `Sheet` has only been opened from the match screen and the dex. Opening it
  from a long scrolling form exercises focus-restore against a scroll position
  for the first time — Phase 2 must assert restore lands on the originating chip.
**Rejected alternatives:**
- Inline art chips — rejected because 12 actions × several slots pushes the
  sentence off screen, and a sentence you must scroll to read is not a sentence.
- Keep native `<select>` — rejected because it cannot carry the pixel art the
  rest of the app reads by, and the redesign already retired text glyphs for
  exactly that reason.
**Source:** Interview #1

### ADR-002: The sentence grows in place, and the tail is read-only
**Status:** Accepted (2026-08-08, inherited from SPEC interview Rounds 1–2)
**Context:** The easy surface refuses 8 of 26 bundled cards. The alternatives are
to widen it, to keep a second surface, or to restrict the schema.
**Decision:** Add exactly four grammar pieces — `forEach` quantifier, a second
action, `all`/`any` over two condition leaves, and a two-target action — which
covers 100% of bundled content. Shapes outside that (two or more effects,
movement patterns outside the grid model) render **read-only with saving
disabled**, and the record's bytes are unchanged by opening it.
**Consequences:**
- ✅ Every record the game ships, and every record a friend sends today, opens.
- ✅ No schema change, no migration, no `schema_version` bump.
- ⚠️ A schema-legal shape remains unauthorable. Accepted: zero bundled records
  are in that set, and the read-only path makes the limit visible rather than
  silent.
- ⚠️ The read-only path is now load-bearing and must be tested with a record that
  actually triggers it, constructed rather than found.
**Rejected alternatives:**
- Author every schema-legal shape — rejected: re-introduces the complexity the
  task exists to remove, for content nobody has written.
- Reject unshowable documents at import — rejected: one unshowable record would
  block a whole shared document that otherwise plays fine.
**Source:** SPEC interview Rounds 1–2

### ADR-003: Extend first, delete last
**Status:** Accepted (2026-08-08, via /hm:plan interview #2)
**Context:** The change both adds grammar and removes two surfaces. Either can go
first.
**Decision:** Phases 1–5 extend and re-point; **Phase 6 unwraps the panel
container with nothing deleted**; Phase 7 deletes the tab strip, the
indexed-palette form and the `고급 설정` disclosure; Phase 8 fixes the anchors.
The ADR-006 coverage gate is re-pointed (Phase 5) **before** the panel that
currently satisfies it is unwrapped, and the unwrap lands **before** any
deletion — see [ADR-006](#adr-006-jump-retires-from-the-authorable-vocabulary)
for the one entry that retires instead of moving.
**Consequences:**
- ✅ Every intermediate state is shippable: no phase boundary leaves shipped
  content less editable than it is today.
- ✅ Coverage is never briefly unmeasured — the failure mode where a vocabulary
  entry silently loses its editor.
- ⚠️ The screen keeps its tabs until the last phase, so the user-visible payoff
  arrives late.
**Rejected alternatives:**
- Delete first — rejected: between deletion and extension, 8 bundled cards would
  be read-only, a real functional regression on shipped content.
**Source:** Interview #2

### ADR-004: Parameters live in the slot's sheet
**Status:** Accepted (2026-08-08, inferred at confidence 0.85 — Step E gate)
**Context:** Several vocabulary entries carry parameters (`freeze_piece.plies`,
`forEach.pieceId`/`side`, `on_own_rank.n`, `destination.offset` df/dr, the
`duration` fields). They must be authorable (ADR-006 coverage) and must not
lengthen the sentence.
**Decision:** After an option is chosen in a slot's sheet, that option's
parameters render inside the same sheet, directly beneath it. The sheet stays
open until dismissed. The sentence chip shows the resolved value, not the
parameters.
**Consequences:**
- ✅ One interaction model for every edit; the sentence line never grows a form.
- ✅ The parameter is adjacent to the choice that introduced it, which is where
  its meaning is.
- ⚠️ A sheet can now contain a form, so its focus trap must include the newly
  rendered parameter controls — asserted in Phase 2.
**Rejected alternatives:**
- Parameters inline in the sentence — rejected: `freeze_piece` would put a number
  input inside a clause, and the clause stops reading as language.
**Source:** Step E gate (not asked; confidence above τ)

### ADR-005: Keys are derived, behind an open-and-save invariant
**Status:** Accepted (2026-08-08, inherited from SPEC interview Round 2)
**Context:** `고급 설정` exposes raw `nameKey` / `textKey`. Removing it is
required by "one screen", but a derivation that fires unconditionally re-homes a
record whose keys sit in a foreign namespace — a failure this repo has already
had once in its rename repair.
**Decision:** Remove the disclosure and both fields. Derivation runs only where
it runs today; opening and saving a record without editing its name or text must
leave `nameKey` / `textKey` byte-identical, enforced by a test that includes a
foreign-namespace record.
**Consequences:**
- ✅ Nothing on the maker screen has to be opened before it can be used.
- ⚠️ Hand-repointing a translation key is no longer possible in the UI. Accepted:
  it is a maintainer action, not a child's, and the document is still editable by
  export/import.
**Source:** SPEC interview Round 2

### ADR-006: `jump` retires from the authorable vocabulary
**Status:** Accepted (2026-08-08, via /hm:plan interview #3, opened by the validator's third critical finding)
**Context:** `tests/editor/vocabulary-coverage.test.ts:427-453` authors three
`movement` entries at `movement.1` through the indexed pattern editor inside
`form-panel-expert`. Two of them — `slide` and `step` — are authorable through
the grid and direction toggles and can simply be re-pointed. The third,
`jump`, cannot: the grid accepts `jump` on read and re-emits `step` on write
(ADR-027/AC-005 of [[SPEC-piece-skill-creation-ux]]). Deleting the indexed editor
therefore leaves one vocabulary entry with no editor, which is precisely what
ADR-006's gate exists to prevent.
**Decision:** Retire `jump` from `MOVEMENT_KINDS`, so `enumerateVocabulary()` no
longer emits it and the gate no longer requires a control for it. The **schema
keeps accepting `jump`**: existing documents load, play identically, and are
re-emitted as `step` on open-and-save exactly as they are today.
**Consequences:**
- ✅ The gate's contract stays honest — every entry it lists has a real editor.
- ✅ Nothing observable changes in play: the engine gives `step` and `jump` the
  same `maxSteps` and branches on nothing else, so a single-step move has no
  square in between for a jump to jump over.
- ⚠️ A vocabulary axis narrows without a schema change, so `vocabulary.ts` and
  `content/schema.ts` now disagree by one entry on purpose (`schema.ts:173` is an
  independent Zod enum and is untouched). The retirement reason is recorded at
  **both** removal sites — `MOVEMENT_KINDS` and `MAKERS['movement:jump']` — so a
  later reader does not "restore" it from the surviving half.
- ⚠️ An imported document authored elsewhere with `jump` still round-trips to
  `step` — unchanged behaviour, but now with no way to write `jump` back.
**Rejected alternatives:**
- A grid toggle for jump — rejected: it teaches a distinction the engine cannot
  observe, re-introducing the ambiguity the axis split removed.
- Keep a movement-only escape hatch on the piece screen — rejected: it is a
  second surface on the one screen this task exists to unify, for a distinction
  that does not exist in play.
**Source:** Interview #3

### ADR-007: The sentence hosts the whole vocabulary, not just the four gaps
**Status:** Accepted (2026-08-08, via /hm:execute interview — PLAN scope correction)
**Context:** Found while authoring Phase 1's tests. ADR-002's "four grammar
pieces" closes the gap between the sentence and *bundled content*, but Phase 5's
exit criterion is the ADR-006 gate, which covers the whole **vocabulary** — and
counting its rows shows four classes the four-slot view never covered at all,
because they only ever existed in the expert form:
- **5 `destination` rows** — the sentence has no "어디로" slot (`teleport_piece.to`,
  `spawn_piece.at`, `revive_piece.at`).
- **~20 parameter controls** — `param-duration` ×3, `param-cond-n` ×3,
  `param-side` ×3, `param-plies`, `param-df`/`-dr`, `param-square`, `param-to`,
  `param-cond-square-*`, `param-cond-side` ×2, `param-foreach-side`, all inside
  `conditionParams()` / `actionParams()`.
- **`condition:not`** — ADR-002 adds `all`/`any` only.
- **`param-pattern-jump`** — `grant_movement.pattern` is a movement pattern
  *inside an action*, i.e. a grid nested in a slot.

Phase 5's Work said "move every row's testid onto the sentence controls", which
presumes a destination exists to move them to. For these four it does not.
**Decision:** The sentence hosts the entire vocabulary. Phase 1 adds a
`destination` slot per action and per-leaf negation for `not`; Phase 2 renders
every parameter inside its slot's sheet (ADR-004), reusing the existing move grid
for `grant_movement.pattern`.
**Consequences:**
- ✅ AC-005 becomes achievable without a second surface — "모두 설정 가능" is true
  of the vocabulary, not merely of bundled content.
- ✅ No orphaned vocabulary entry, so Phase 7's deletion needs no further ADRs.
- ⚠️ Phases 1–2 roughly triple in size. Recorded rather than absorbed silently.
- ⚠️ A bottom sheet can now contain a 7x7 grid; ADR-004's focus-trap requirement
  extends to it.
**Rejected alternatives:**
- Offer a fixed set of preset movements for `grant_movement` instead of the grid —
  rejected by the user: it compresses "everything is configurable" in one place.
- Extend only, keep the tab (defer Phase 7) — rejected: it is the opposite of the
  request.
**Source:** /hm:execute Phase A scope check

## 🏗️ Technical Design

### Current state

| Concern | Where | Shape today |
|---|---|---|
| Slot model | `src/ui/CardRecipe.tsx` | `Recipe = {when, cond, then, who}` — fixed 4 slots; `readRecipe` returns `null` on >1 effect, >1 action, `forEach`, nested condition; `EXCLUDED_ACTIONS = {swap_pieces}` |
| Slot options | `CardRecipe.optionsFor()` | derived from `VOCABULARY_CONTROLS`, minus `WRAPPING` and `EXCLUDED_ACTIONS` filters |
| Slot rendering | `RecordForm.recipeView()` (`RecordForm.tsx:1234`) | 4 `<select>`s + a read-back sentence; gated to `ruleCard \| skillCard` |
| Raw editor | `RecordForm.tsx:1630-1705` | effect index cursor + action index cursor + 5 palettes + param blocks |
| Split | `RecordForm.tsx:1292, 1419-1471` | `hasSimple`, tab strip, two always-mounted `form-panel`s |
| **What `form-panel-expert` actually holds** | `RecordForm.tsx:1471` → closes just before `editor-save` | **Not only the effects palette.** Also `editor-royal` (1481), `editor-promotion-onRank`/`-to` (1497), the indexed movement editor `editor-clear-movement` / `movement-select-{i}` / `param-move-maxDistance` / `param-move-forward` (1540-1598), the `attack` fieldset `attack-kind-*` / `attack-cell-*` (1600-1626), the whole board painter `board-width` / `paint-type` / `paint-{sq}` / `place-{sq}` (1709+) and the `preset` controls (1788+). For `board` and `preset`, `hasSimple` is false, so this div is **never hidden** — it is their only surface. |
| External model consumer | `src/editor/templates.ts:3,117` | imports `writeRecipe` / `SlotId` and builds each bundled template slot-by-slot; `tests/ui/card-template-remix.test.tsx` asserts against the 4-slot shape |
| Coverage gate | `tests/editor/vocabulary-coverage.test.ts` | reaches expert-panel controls by test id while hidden; its own `AC-008` block (871-882) clicks `form-tab-expert` and asserts both panels' visibility |

### Affected components

- `src/ui/CardRecipe.tsx` — model widens from `Recipe` to a variable-length
  `Sentence`; `readRecipe`/`writeRecipe`/`optionsFor`/`recipeSentence` follow.
- `src/ui/SentenceSlot.tsx` *(new)* — the chip + `Sheet` control of ADR-001/004.
- `src/ui/RecordForm.tsx` — recipe view becomes the sentence editor and is
  extended to all four `EFFECT_HOSTS`; the tab strip and the two panel wrappers
  are unwrapped in Phase 6, and the palette form, the indexed movement editor and
  the disclosure are deleted in Phase 7.
- `src/editor/templates.ts` + `tests/ui/card-template-remix.test.tsx` — the
  external consumers of the widened model; they move with it in Phase 1.
- `src/editor/vocabulary.ts` — `MOVEMENT_KINDS` loses `jump` (ADR-006).
- `src/i18n/ko.ts` — new slot/quantifier/second-action wording; the two
  `*.complex-hint` strings and `ui.editor.form.tab.*` retire.
- `src/ui/styles.css` — sentence + chip + sheet-option styles; `.form-tabs` /
  `.form-panel` removed in Phase 6; the sticky anchors land in Phase 8.
- `tests/editor/vocabulary-coverage.test.ts` — re-pointed onto sentence controls.
- `e2e/editor.spec.ts`, `e2e/rooms.spec.ts`, `e2e/editor-refusal.spec.ts` —
  the first two switch selectors; the third is replaced by `editor-readonly.spec.ts`.

### Dependencies

None added. `Sheet.tsx`, `Pix.tsx`, `artRegistry`, `VOCABULARY_CONTROLS` and
`validateDraft` are all existing and unchanged.

### Data flow

```
draft (Record<string, unknown>)
   │  readSentence()            ← null only for the ADR-002 tail
   ▼
Sentence { when, cond, forEach?, actions[1..2], targets }
   │  slot tap → Sheet(options from VOCABULARY_CONTROLS, params per ADR-004)
   ▼
writeSentence() → draft.effects
   │  prepared() → validateDraft()   (unchanged, ADR-033)
   ▼
live errors + engine preview (unchanged)
```

### API changes

None external to the app. **But `Recipe` / `writeRecipe` / `SlotId` are not
internal to `CardRecipe.tsx`**: `src/editor/templates.ts` builds every bundled
card template through `writeRecipe` slot-by-slot (`templates.ts:106-117`), and
`tests/ui/card-template-remix.test.tsx` asserts against the four-slot shape.
Widening `Recipe` → `Sentence` is therefore a two-caller change, and both callers
are in Phase 1's scope.

`MOVEMENT_KINDS` narrows by one entry (ADR-006). `content/schema.ts` is
unchanged and still accepts `jump`.

## 📝 Implementation Plan

### Phase 1 — The sentence model grows

- `depends_on`: `[]`
- `parallel_group`: `serial-model`
- `merge_hazards`: `src/ui/CardRecipe.tsx` — every later phase reads this model
- **Scope in:** `src/ui/CardRecipe.tsx`, **`src/editor/templates.ts`**,
  `tests/ui/recipe-roundtrip.test.ts` (new),
  `tests/ui/recipe-bundled-coverage.test.ts` (new),
  **`tests/ui/card-template-remix.test.tsx`**
- **Scope out:** `RecordForm.tsx`, any CSS, any i18n
- **Work:** widen `Recipe` → `Sentence` with an optional `forEach` (carrying
  `pieceId` / `side`), `actions` of length 1–2 each with its own target(s)
  **and its own destination**, and a condition of one or two leaves each
  independently negatable (`not`) and joined by `all`/`any`; drop `swap_pieces`
  from `EXCLUDED_ACTIONS` and give it two target slots; keep `readSentence`
  returning `null` for the ADR-002 tail. Per ADR-007 the slot set covers **every**
  vocabulary axis — `trigger`, `condition` (+`not`/`all`/`any`), `action`,
  `target`, `destination`, `forEach` — not only the four bundled gaps.
- **Exit criterion:** `npx vitest run tests/ui/recipe-roundtrip.test.ts tests/ui/recipe-bundled-coverage.test.ts tests/ui/card-template-remix.test.tsx && npx tsc --noEmit`
  passes, with the bundled refusal count asserted to be **0** for 6 pieces and 26
  cards. `tsc` is part of the criterion because `templates.ts` is the caller that
  would otherwise fail to compile against the widened type.
- **Risk:** medium — this is where silent flattening would enter.
- **Rollback point:** phase start (model is additive; revert the file).

### Phase 2 — The slot control (sheet + art + params)

- `depends_on`: `[1]`
- `parallel_group`: `serial-record-form`
- `merge_hazards`: `src/ui/RecordForm.tsx`, `src/ui/styles.css`
- **Scope in:** `src/ui/SentenceSlot.tsx` (new), `src/ui/RecordForm.tsx`
  (`recipeView` → sentence editor), `src/ui/styles.css`, `src/i18n/ko.ts`,
  `tests/ui/sentence-slot.test.tsx` (new)
- **Scope out:** the expert panel, the tab strip, piece/squareType hosting
- **Work:** chip-per-slot rendering; tap opens `Sheet` with pixel-art options;
  parameters render in the sheet under the chosen option (ADR-004); focus
  restores to the originating chip; "그리고 또" adds the second action and
  removing it returns to one. Per ADR-007 this includes a home for **every**
  parameter control the gate names (~20), with the existing move grid reused
  inside the sheet for `grant_movement.pattern`.
- **Exit criterion:** `npx vitest run tests/ui/sentence-slot.test.tsx tests/ui/maker-contrast.test.ts`
  passes, including a focus-restore assertion and a contrast assertion for the
  sheet's option marks on the card surface.
- **Risk:** medium — first use of `Sheet` from a scrolling form.
- **Rollback point:** Phase 1.

### Phase 3 — Pieces and special squares use the sentence

- `depends_on`: `[2]`
- `parallel_group`: `serial-record-form`
- `merge_hazards`: `src/ui/RecordForm.tsx`
- **Scope in:** `src/ui/RecordForm.tsx`, `src/i18n/ko.ts`,
  `tests/ui/recipe-hosts.test.tsx` (new)
- **Scope out:** deletion of anything
- **Work:** drop the `kind !== 'ruleCard' && kind !== 'skillCard'` gate at
  `RecordForm.tsx:1235`; host the sentence editor for all of `EFFECT_HOSTS`,
  with per-host trigger options already handled by `optionsFor`.
- **Exit criterion:** `npx vitest run tests/ui/recipe-hosts.test.tsx` passes for
  all four kinds, and a `squareType` authored through the sentence round-trips.
- **Risk:** low.
- **Rollback point:** Phase 2.

### Phase 4 — The unshowable tail is read-only

- `depends_on`: `[3]`
- `parallel_group`: `serial-record-form`
- `merge_hazards`: `src/ui/RecordForm.tsx`, `src/i18n/ko.ts`
- **Scope in:** `src/ui/RecordForm.tsx`, `src/i18n/ko.ts`,
  `tests/ui/recipe-unshowable.test.tsx` (new)
- **Scope out:** e2e (Phase 6 updates the two selector-dependent specs; Phase 7
  replaces the refusal spec with the read-only one)
- **Work:** replace the two `*-complex` notes with a read-only rendering that
  states what the record does; disable the structural controls and the save
  button with the reason shown; guarantee byte-stability across open/close.
- **Exit criterion:** `npx vitest run tests/ui/recipe-unshowable.test.tsx` passes
  for **both** halves of the ADR-002 tail — a deliberately-constructed two-effect
  record **and** a movement pattern outside the grid model (two slide patterns
  with different reach caps) — each asserting read-only rendering, a disabled
  save with its reason shown, and serialise → open → close → serialise equality.
  One fixture per half; the movement half is what `editor-moves-complex` becomes.
- **Risk:** medium — the absent-case here is the one that silently flattens.
- **Rollback point:** Phase 3.

### Phase 5 — Re-point the ADR-006 coverage gate

- `depends_on`: `[4]`
- `parallel_group`: `serial-gate`
- `merge_hazards`: `tests/editor/vocabulary-coverage.test.ts` — the single file
  that both the old and new controls are asserted through
- **Scope in:** `tests/editor/vocabulary-coverage.test.ts`
- **Scope out:** source files
- **Work:** move every row's `testid` and `params` onto the sentence/sheet
  controls; keep the three claims intact (reachable **and enabled**, writes its
  own value at its own path, round-trips). The three `axis: 'movement'` rows
  (`vocabulary-coverage.test.ts:427-453`) are handled separately and explicitly:
  `slide` and `step` re-point at the direction toggles and the grid, which
  already author `movement.1`; `jump` is **not** re-pointed — it retires with
  `MOVEMENT_KINDS` in Phase 7 (ADR-006), and this phase leaves it pointing at the
  still-present indexed editor so nothing is briefly unmeasured.
- **Exit criterion:** `npx vitest run tests/editor/vocabulary-coverage.test.ts`
  passes **while the expert panel still exists** — proving the new controls carry
  coverage on their own before anything is deleted (ADR-003).
- **Risk:** high — this gate is the only structural defence against a vocabulary
  entry losing its editor.
- **Rollback point:** Phase 4.

### Phase 6 — Unwrap the panels (structure only — nothing is deleted)

> This phase exists because the validator found that `form-panel-expert` is not
> the effects palette's wrapper — it is the container for `royal`, `promotion`,
> the indexed movement editor, the `attack` fieldset, the whole board painter and
> the `preset` controls, and for `board`/`preset` kinds it is **never hidden**, so
> it is their only surface. Removing it in the same step as the palette form
> would delete the board editor.

- `depends_on`: `[5]`
- `parallel_group`: `serial-record-form`
- `merge_hazards`: `src/ui/RecordForm.tsx`, `src/ui/styles.css`
- **Scope in:** `src/ui/RecordForm.tsx`, `src/ui/styles.css`,
  `tests/editor/vocabulary-coverage.test.ts` (its `form-tab-expert` block only —
  the ROWS were re-pointed in Phase 5), `e2e/editor.spec.ts`, `e2e/rooms.spec.ts`
- **Scope out:** any deletion of an authoring control; the sentence model and
  slot control (frozen since Phase 2)
- **Work:** remove `hasSimple`, the tab strip and both `form-panel` wrapper divs,
  rendering **every** control they contained unconditionally in one deliberate
  order — picture → sentence → per-kind scalars (`uses`, `paired`, `royal`,
  `promotion`) → piece movement (grid, then the still-present indexed editor and
  `attack`) → board painter → `preset` controls → live errors → save. Delete
  `.form-tabs` / `.form-panel` CSS. Remove the gate's own `form-tab-expert`
  block, whose subject is the tab strip. Update the two e2e specs that click
  `form-tab-expert` to reach their controls directly.
- **Exit criterion:** `npx vitest run && npx playwright test` fully green,
  including the unmodified ROWS of `vocabulary-coverage.test.ts` — i.e. every
  control that lived in the panel is still reachable **and enabled** now that
  nothing hides it.
- **Risk:** medium — this is the phase that would silently drop the board editor
  if the inventory is wrong. The gate is the check.
- **Rollback point:** Phase 5.

### Phase 7 — Delete the second surface

- `depends_on`: `[6]`
- `parallel_group`: `serial-record-form`
- `merge_hazards`: `src/ui/RecordForm.tsx`, `src/i18n/ko.ts`,
  `src/editor/vocabulary.ts`, `tests/editor/vocabulary-coverage.test.ts`
- **Scope in:** `src/ui/RecordForm.tsx`, `src/editor/vocabulary.ts`,
  `src/editor/controls.ts` (delete the now-orphaned `MAKERS['movement:jump']` at
  `controls.ts:106` — `VOCABULARY_CONTROLS` is built from
  `enumerateVocabulary()`, so a maker for a retired entry cannot throw; it just
  becomes dead code, and a half-swept retirement in a second file is what a later
  reader "restores"), `src/i18n/ko.ts`,
  `tests/editor/vocabulary-coverage.test.ts` (drop the `jump` row), `tests/editor/rename.test.ts`, `tests/ui/rename-wiring.test.tsx`,
  `e2e/editor-refusal.spec.ts` → `e2e/editor-readonly.spec.ts`,
  `tests/ui/maker-one-surface.test.tsx` (new), `tests/ui/i18n.test.ts`
- **Scope out:** the board painter, the `preset` controls, `royal`, `promotion`,
  `attack` — all five rehoused in Phase 6 and explicitly **not** deleted. This
  list is the inventory guard against C1's failure mode; it must name every class
  the current-state table attributes to `form-panel-expert`.
- **Work:** delete the indexed effects palette form (`editor-add-effect`,
  `editor-effect-{i}`, `editor-action-{i}`, the five palettes and their param
  blocks) and the indexed movement editor (`editor-clear-movement`,
  `movement-select-{i}`); retire `jump` from `MOVEMENT_KINDS` with its reason at
  the removal site (ADR-006); delete the `고급 설정` disclosure and its two key
  fields, keeping derivation and adding the foreign-namespace open-and-save
  invariant test; retire `ui.editor.form.tab.*` and both `*-complex-hint`
  strings; replace the refusal e2e spec with the read-only one.
- **Exit criterion:** `npx vitest run && npx playwright test` — with
  `maker-one-surface` asserting `form-tab-simple` / `form-tab-expert` /
  `form-panel-expert` / `editor-advanced` / `editor-add-effect` /
  `editor-effect-0` / `editor-action-0` all absent for every kind,
  `vocabulary-coverage.test.ts` green against the narrowed `MOVEMENT_KINDS`, and
  `i18n.test.ts` asserting no string names a removed surface.
- **Risk:** medium.
- **Rollback point:** Phase 6 (this is the revert boundary — the whole deletion is
  one phase on purpose).

### Phase 8 — Phone anchors and the scroll regression

- `depends_on`: `[7]`
- `parallel_group`: `serial-record-form`
- `merge_hazards`: `src/ui/styles.css`
- **Scope in:** `src/ui/styles.css`, `src/ui/RecordForm.tsx`,
  `e2e/maker-anchors.spec.ts` (new), `tests/ui/shell-layout.test.ts`
- **Scope out:** everything structural
- **Work:** pin the preview, the live-error region and the save button; keep the
  shell's `height: 100dvh` invariant; measure on the longest authorable record.
- **Exit criterion:** `npx playwright test e2e/maker-anchors.spec.ts` passes at
  390×844, asserting all three anchors intersect the viewport after scrolling to
  the form's end **and** that the scroller's `scrollHeight > clientHeight` while
  the document element does not exceed the viewport.
- **Risk:** medium — this is the recorded failure's exact shape.
- **Rollback point:** Phase 7.

## 📊 Phase Status

| Phase | Status | Evidence |
|---|---|---|
| 1 — The sentence model grows | **DONE** (2026-08-08) | Exit criterion met: `npx vitest run tests/ui/recipe-roundtrip.test.ts tests/ui/recipe-bundled-coverage.test.ts tests/ui/card-template-remix.test.tsx` → 53 passed; `npx tsc --noEmit` → clean; full suite `825 passed (92 files)`. Bundled refusals now **0** for 6 pieces, 26 cards and 5 special squares — the eight previously-refusing cards each open, asserted by id. |
| 2 — The slot control (sheet + art + params) | **DONE** (2026-08-08) | Exit criterion met: `npx vitest run tests/ui/sentence-slot.test.tsx tests/ui/maker-contrast.test.ts` → 41 passed, including the focus-restore assertion and a 13-row table proving every ADR-007 parameter has a home in its own slot's sheet. `npx tsc --noEmit` clean. **One recorded deviation from ADR-001 — see below.** |
| 3 — Pieces and special squares use the sentence | **DONE** (2026-08-08) | `npx vitest run tests/ui/recipe-hosts.test.tsx` → 12 passed. The host set is **derived** from `VOCABULARY_CONTROLS`, not restated, so a kind added to the schema fails the test rather than shipping without a sentence. Also asserts each host offers only the triggers its own schema admits (`squareType` gets 4 of 7) and that a piece keeps its grid **and** gains the sentence. |
| 4 — The unshowable tail is read-only | **DONE** (2026-08-08) | `npx vitest run tests/ui/recipe-unshowable.test.tsx` → 11 passed, covering **both** halves of the ADR-002 tail with constructed fixtures: a two-effect card, and a piece with two slide patterns capped differently. Read-only view + disabled save with its reason + one described line per effect + draft byte-stability. |
| 5 — Re-point the ADR-006 coverage gate | **DONE** (2026-08-08) | Exit criterion met: `npx vitest run tests/editor/vocabulary-coverage.test.ts` → **81 passed while the indexed form still exists**, which is the whole claim — the sentence carries coverage on its own before anything is deleted. The six effect axes (`trigger`, `condition`, `action`, `target`, `destination`, `forEach`) now reach the sentence; `movement` still reaches the indexed editor and is Phase 7's business, so no axis is briefly unmeasured. |
| 6 — Unwrap the panels | **DONE** (2026-08-08) | Tab strip, `hasSimple`, the `tab` state and both `form-panel` wrappers removed; every control they held now renders unconditionally and **nothing was deleted**. `.form-tabs` / `.form-panel` CSS gone. Exit criterion met on both halves: **`npx vitest run` → 893 passed (95 files)**, `npx tsc --noEmit` clean, and **full `npx playwright test` → 239 passed / 1 skipped / 0 failed** (run with `E2E_PORT=5199`; see the stale-server note below — the default port gave a false verdict). Forced two corrections that are the most valuable output of this work: the closed-set miss and the AC-007 amendment. |
| 7 — Delete the second surface | **DONE** (2026-08-08) | **Done:** the indexed effects palette (effect/action index cursors, five palettes, all parameter blocks), the indexed movement editor, and the twelve dead helpers they held up; `jump` retired at all three sites (`MOVEMENT_KINDS`, its maker, the attack list); 20 orphaned i18n keys deleted; `tests/ui/maker-one-surface.test.tsx` added. Two gaps the deletion CREATED were closed with it — `forward` exposed on the grid, and clear-all restored as `piece-clear`. Then the `고급 설정` disclosure and its two raw key fields, with the gate's `nameDraft` moved onto the human fields (derivation only fires for a slot the author typed into) and the two e2e validation tests moved from an invalid key to an invalid `id`. ADR-005's foreign-namespace invariant is now `tests/ui/rename-invariant.test.tsx`. AC-001's held-back assertions are restored. |
| 8 — Phone anchors and the scroll regression | **DONE** (2026-08-08) | `e2e/maker-anchors.spec.ts` → 3 passed at 390x844: the scroller is taller than its clientHeight **and** the document element does not exceed the viewport (both sides of `[fail:render] unbounded-parent-defeats-inner-scroll`, since a one-sided check passes in the broken state); the summary, the error region and the save all intersect the viewport after scrolling to the form's end; the pinned summary changes when the grid does. |

### Phase 2 notes — recorded deviation from ADR-001, and the new test ids

**Deviation: options are labelled buttons, not pixel art.** ADR-001 specified
"pixel-art buttons". There is no sprite for a vocabulary entry — `artRegistry`
maps art ids for *pieces, squares and cards*, not for `destroy_piece` — so the 47
vocabulary options render as large labelled buttons inside the sheet instead.
Drawing 47 new sprites is a separate piece of work and was not in scope. What the
sheet still delivers, and what a `<select>` option cannot, is the tap target and
the room underneath for that option's parameters. Recorded rather than absorbed:
if the sprites are ever drawn, this is the one line that has to change.

**Parameter test ids are new (`s-param-*`), on purpose.** The indexed form still
renders its own `param-*` controls until Phase 7 deletes it, and two nodes sharing
a test id makes every `getByTestId` in the coverage gate ambiguous — it would
break the gate in the very phase that must keep it green (ADR-003). Phase 5
re-points the gate onto the `s-param-*` ids; Phase 7 removes the originals.

**Korean needs four clause shapes, not one template.** A single template of the
form "{who}<particle> {where}<particle> {then}" leaves a dangling destination
particle whenever the action takes no destination, and whitespace collapsing
cannot remove it. `sentenceText` therefore picks one of four keys by the action's
arity (no target / one target / one target plus destination / two targets), and a
test asserts the rendered line never shows an orphaned particle or an unresolved
`{placeholder}`.

### Phase 8 notes — what is pinned, and what deliberately is not

**The engine preview board is NOT pinned.** SPEC names "the preview" as one of the
three anchors, and the literal reading — pin `PiecePreview` — defeats itself: a 7x7
board at the top of a 390x844 viewport spends most of the screen on the thing the
child is scrolling past the form to reach. What is pinned instead is a one-line
summary of what the record currently is, read from `describeGrid` (movement) and
`sentenceText` (what it does) — **the same models the editors write**, so the line
cannot drift from either. An e2e test asserts the line changes when the grid does; a
pinned line that does not move with its subject is decoration, not a preview.

**Sticky resolves against `.editor`**, which has `overflow-y: auto`. `.phone`'s
`overflow: hidden` sits outside it, so it is not the scrollport here — the
arrangement in `[fail:render] sticky-inert-under-overflow-ancestor` was the other way
round, with the unwanted scrollport NEARER than the intended one. Checked before
writing the rule rather than after it failed.

**AC-010 asserts both sides.** The recorded failure's signature is that the inner box
reports a large `scrollHeight` while the document element's equals its
`clientHeight` — so a one-sided assertion passes in exactly the broken state.

### An operator error worth recording

The final verification ran the unit suite and the e2e suite **concurrently**, and
three unit tests failed on timeouts — two in a file this work never touched. All
three passed in isolation. Two lessons, and the second is mine:

- On this machine the two suites cannot share it. A local verdict taken while both
  are running is not a verdict.
- My own property test (walking every option of every slot) measured 5.4s against
  vitest's 5s default, i.e. I shipped a latent flake. Fixed by declaring a 20s
  timeout with the measurement in the comment — **not** by sampling the options,
  which would have traded the property for speed and left the test's name a lie.

### Phase 7 notes — closing the disclosure, and the third unreachable-guard

**Derivation only fires for a slot the author typed into.** `slotFor` is reached
through `if (!s.active || !s.typed) continue`, so a draft with an id and no words
keeps empty keys and fails the i18n-key regex on save. That is correct behaviour,
and it means the coverage gate's `nameDraft` had to stop stamping raw keys and start
doing what a child does — type a name and a description. The round-trip assertions
state the save-time derivation explicitly via `derivedKeys(id, host)`, written as a
literal rather than by calling `deriveKey`: an expectation computed with the function
under test cannot fail with it.

**Three guards in a row lost their subject to a deletion**, and each was converted to
assert unreachability rather than deleted:

1. the unshowable-draft-in-this-session case (Phase 7's palette deletion),
2. `editor-shell-state`'s "change ONLY the key" rename guard — the recorded bug where
   the visible field held the OLD key's text and the save wrote it over the
   destination. Unreachable now; its live half (renaming by **id** must not reach into
   another record's text) is kept and still asserted,
3. the two e2e validation tests, whose invalid value had to move from `nameKey` to
   `id` — the comment in `editor.spec.ts` had already said the raw slot was "the only
   way this test still tests what it is named after", so deleting the slot forced the
   field to move to one a child can actually type into.

**ADR-005's invariant is now a test**: `tests/ui/rename-invariant.test.tsx` opens a
record whose keys sit in a foreign namespace, saves it untouched, and requires the
keys AND the strings entry to be exactly where they were. Both shapes are in the
fixture set — derived-keyed and foreign-keyed — because a set with only the first
could not fail if the derivation were unconditional, which is precisely the bug this
repo already shipped once.

### Phase 7 notes — two gaps the deletion created, and the one it could not close

**Deleting a form deletes affordances that were only there.** Two came out of the
indexed editor with it, and both were found by converting the tests rather than by
reading the diff:

- **`forward` had no home.** `grid.forward` has been in the grid model since ADR-027
  and `readGrid` has always read it back, but no control on the grid ever set it —
  the only way to author it was `param-move-forward`. Same shape as `jump`, opposite
  answer: a forward mirror is observable in play (it is what makes a pawn a pawn),
  where `step` and `jump` are not. Exposed as `piece-forward`.
- **Clear-all vanished.** `editor-clear-movement` belonged to the indexed form, and
  every grid cell cycles `None → Move → Capture → Both` — so starting a shipped
  piece's movement over meant twenty-four taps. Restored as `piece-clear`.

**The `고급 설정` disclosure is still there, and the coupling is real.** `slotFor`
derives a missing `nameKey` / `textKey` at **save** time, not onto the draft. So
deleting the fields breaks the coverage gate's round-trip assertion — it compares
`openDraft(committed)` against a draft whose keys are still empty — and moving the
derivation onto the draft changes the rename semantics `nameTyped` / `textTyped`
exist for (a recorded past failure: a save re-pointing a record AND overwriting the
text at its destination key). Five call sites total; both routes are doable and
neither is a one-liner.

**What was NOT done about it:** the new `maker-one-surface.test.tsx` does not assert
AC-001's "no authoring control behind a disclosure" clause, and does not list
`고급 설정` among the removed-surface terms. Writing a weaker assertion in either
slot would have kept the suite green while reading as coverage, which is worse than
an absence that is named. The file names the gap and points here.

**Remaining for Phase 7:** delete `editor-advanced` and the two key fields, via one
of the two routes above; retire `ui.editor.form.advanced` and the two
`ui.editor.field.*-slot` keys; add ADR-005's foreign-namespace open-and-save
invariant test (`tests/editor/rename.test.ts`, `tests/ui/rename-wiring.test.tsx`);
then extend `maker-one-surface.test.tsx` with the two assertions held back here.

### Phase 6 notes — the closed-set miss, and the AC-007 amendment it forced

Two findings, both from the e2e run, and the first one is the most valuable thing
this work produced.

**1. A stale dev server silently judged the wrong tree.** The first e2e run
reported 20 failures. None was real: `playwright.config.ts` runs `npm run dev` with
`reuseExistingServer: !CI`, and port 5173 already had a Vite server started at
18:23 from the **main checkout** — so the browser was served master's UI while the
assertions were written against the worktree. The tell was the probe finding
`form-panel-expert` in the live DOM when `grep` said the source no longer had it,
and the failure distribution matched exactly: the 16 tests that do not touch the
changed code passed. Re-running with `E2E_PORT=5199` gave the honest verdict.
**This can produce a false PASS just as easily as a false failure** — a local e2e
run is only about the tree whose server it is talking to.

**2. `piece.archer` in the SLICE set has two effects, and the Phase 1 measurement
never looked at the slice set.** Everything through Phase 5 was measured against
`bundledContentSource`, because that is the set RESEARCH measured. So "no shipped
record is unshowable" was false the whole time, and the save-block built on it made
a **shipped piece uneditable** — a functional regression on shipped content, which
is exactly what ADR-003's ordering exists to prevent, three phases after the
premise was set. This repo's own memory names the shape:
`[fail:design] fix-scoped-to-the-cited-evidence` (count 5) — verify against the set
the property must survive, not against the evidence that prompted it.
`recipe-bundled-coverage.test.ts` now sweeps **all three** content sources and
asserts the source count, so a fourth set cannot join silently.

**3. AC-007 was amended, in the SPEC, not around it.** Its "the save button is
disabled" clause was wrong twice: it cost a shipped record its editability, and it
was never what prevented the flatten. A save writes the **draft**, and the draft
carries the unreadable half untouched — only an **editor** that rewrites a part it
misread can flatten. So suppressing that editor is sufficient, byte-stability of
the untouched half is what proves it, and the two halves (movement, effects) are
independent: one being undrawable must not take the other's editor away. The
oracle got *stronger* rather than weaker — it now asserts what a real save writes
instead of asserting that no save happens.

### Phase 6 notes — a forced scope move, and what is still unverified

**`editor-refusal.spec.ts` was replaced in Phase 6, not Phase 7.** The PLAN put it
in Phase 7's scope, and that was wrong: the spec's **subject** was the refusal →
`자세히` tab handoff — it asserted the note names the tab and that the tab opens
from there — and Phase 6 removes the tab. A spec whose subject no longer exists
cannot be edited into truth, so it could not survive the phase that deleted its
subject. `e2e/editor-readonly.spec.ts` replaces it with the claim that survived:
a record this screen cannot draw is shown read-only, says what it does, names no
destination, and is not rewritten. Recorded as a deviation rather than absorbed.

**The two e2e `expert(page)` helpers are now no-ops** rather than deleted from
~20 call sites, so the one-line change here is not buried in an unrelated diff.

**Unverified: `npx playwright test`.** Phase 6's exit criterion is the full unit
suite **and** playwright. Chromium is installed but a run needs the dev server up
and exceeded the time available in this session, so the e2e half is **not
verified**. Three specs are affected by this phase (`editor.spec.ts`,
`rooms.spec.ts` via the no-op helper, and the new `editor-readonly.spec.ts`) and
they are exactly the ones that would catch a visibility regression jsdom cannot
see. Phase 6 is therefore **code complete, not done**, and Phase 7 must not start
until the e2e run is green.

### Phase 5 notes — the gate re-pointed once, not 38 times, and what it caught

**One translation layer, 38 untouched rows.** Each row states which entry it
covers, where the entry lands in the draft, and what discriminates it from a
default — none of which depends on the control it is reached through. So the reach
moved in one place: `vocab-<axis>-<kind>` becomes "open the slot that owns that
axis, choose that entry in its sheet", and `param-*` becomes its `s-param-*` twin.
A hand-edited row is a row whose intent can drift from its comment while still
passing.

**Three entries needed bespoke reach, because they are not options.** `not` is a
toggle on the leaf it inverts; `all` / `any` are the join operator between two
leaves. None is an item in the condition slot's list, so each carries an explicit
`reachTestId`.

**`{kind:'all', of:[x]}` was an artifact and its expectation moved.** A
conjunction of a single thing only existed because the palette wrapped whatever
condition happened to be selected. The sentence joins **two** leaves, so the
authored value for `all` / `any` is now a two-operand shape. The entry is still
authorable, which is what the gate measures — but this is an expectation changing,
recorded rather than quietly edited. `op` defaults to `all` the moment a second
leaf appears, so the `all` row switches to `any` first and proves the control
switches it back.

**The `grant_movement` row grants a `step`, not a `jump`** — ADR-006, and the
engine gives both the same `maxSteps` regardless.

**What the gate caught in Phase 4, before this phase ran.** Blocking saves on the
LIVE draft broke four rows: `condition: all`, `condition: any`, `movement: step`
and `movement: jump` all author shapes the sentence cannot show, through the
indexed form that still exists. Re-reading AC-007 settled it — its scenario is *an
imported record the child opens* — so the save-block is keyed on the record **as
opened**, and a draft the author deliberately made unshowable in this session
still saves. Exactly the regression ADR-003's ordering exists to surface, surfaced
by the gate rather than by a user.

### Phase 4 notes — two things the tests nearly measured and did not

**The read-only rule is per-RECORD, not per-control.** A piece whose movement the
grid refuses reads *fine* on its effects side, so an earlier draft of this phase
showed an editable sentence beside a blank grid. That combination is the flatten:
saving writes back whatever the grid happened to show. `readOnly` is therefore the
OR of both halves, and the sentence view yields to the read-only view whenever
either is unreadable.

**A byte-stability check against the source document is vacuous.** The document is
a prop and React does not mutate it, so `JSON.stringify(source)` before and after
is equal no matter what the form does — a fixture with no instance capable of
failing (`[fail:test] all-positive-fixture-hides-overcounting`). The mechanism by
which a flatten actually enters is the form normalising the draft on open and a
save writing that back, so the assertion compares the **draft the form is
holding** (`editor-draft-json`) against the record, key-order-canonicalised.
Caught by probing the rendered test ids rather than by the suite, which passed
either way.

**The fixtures are constructed, and named explicitly.** No bundled record is in
the unshowable set any more — that was Phase 1's point — so a "found" fixture
would be empty. Both are built from a named bundled record; the first draft used
`find(id) ?? [0]`, which silently fell through to a different card because
`skill.zap` is not a bundled id.

### Phase 1 notes — Phase D.5 newly-reachable window

Phase 1 is mostly new-feature work, but one behavioural repair inside it opened a
window, so the three questions are answered rather than skipped.

1. **The window.** Making a brand-new record open as a sentence (rather than as
   the old "made in the detailed form" refusal, which is what `readRecipe`
   returned for `effects: []`) newly makes reachable *a record with no trigger,
   edited through a slot other than `when`*. The old `writeRecipe` filled that gap
   with `SKILL_TRIGGER`. It was invisible because the view refused blank records
   and `applyTemplate` writes `when` first — and it writes `on_play` onto a rule
   card, an event `ruleCard`'s schema does not admit. **The absent case IS this
   window**: the trigger being absent is the state that predates any choice.
2. **The tests that enter it**, both in this same change:
   `tests/ui/recipe-roundtrip.test.ts::does not invent a trigger when a non-when
   slot is edited first` (asserts `'trigger' in effect === false` for a `ruleCard`
   edited via `cond` / `then` / `each` first — i.e. the record, not just the
   reported model) and `::keeps a trigger the author DID choose across later edits
   to other slots` (the other side, so the fix cannot be "never set a trigger").
3. `always` **is** still seeded, and the asymmetry is deliberate: it is the
   neutral element of the condition axis and valid for every host, so seeding it
   commits the author to nothing. The trigger axis has no neutral value — every
   option is a host-specific commitment — so it stays unset and the live validator
   points at the slot the author still has to fill.

## 🧪 Testing Strategy

| Layer | What it covers | Where |
|---|---|---|
| Unit (vitest, jsdom) | sentence round-trip (exhaustive over the slot cross-product), bundled coverage, host coverage, unshowable byte-stability, key invariance, absence of the split test ids, string hygiene | `tests/ui/`, `tests/editor/` |
| CI gate (vitest) | ADR-006 vocabulary coverage — reachable **and enabled**, writes own value, round-trips | `tests/editor/vocabulary-coverage.test.ts` |
| Contrast gate (vitest) | sheet option marks on the card surface | `tests/ui/maker-contrast.test.ts` |
| e2e (playwright) | anything about **visibility** or **geometry**: read-only save blocking, the three anchors, the scroll invariant | `e2e/` |

The unit/e2e boundary is not stylistic. `fireEvent` ignores visibility and let a
control ship in the wrong panel here once already, so every claim of the form
"the child can see / cannot see X" is e2e.

## ⚠️ Risks & Mitigation

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R1 | A vocabulary entry silently loses its editor when the expert panel is deleted | medium | high | Phase 5 re-points the gate and must pass **before** Phase 6 deletes anything (ADR-003) |
| R2 | The widened writer flattens a record instead of refusing it | medium | high | Phase 1's exhaustive round-trip plus Phase 4's byte-stability test on a constructed two-effect record |
| R3 | The longer single screen re-triggers `unbounded-parent-defeats-inner-scroll` | medium | medium | Phase 7 asserts both sides of the scroller/document comparison on the longest record, in a real browser |
| R4 | `Sheet` opened from a scrolling form restores focus to the wrong place or scrolls the page | medium | medium | Phase 2 asserts focus restore lands on the originating chip |
| R5 | Sentence copy still names a surface that no longer exists | low | medium | Phase 7's `i18n.test.ts` check against a hardcoded list of removed-surface terms |
| R6 | Removing the key fields re-homes a foreign-namespace record | low | high | ADR-005's open-and-save invariant test, with a foreign-namespace fixture |
| R7 | e2e churn hides a real regression | medium | low | `editor-refusal.spec.ts` is replaced, not edited — the new spec's subject is the read-only path, not the tab handoff |
| R8 | Deleting `form-panel-expert` takes the board painter, `royal`, `promotion` and `attack` with it — for `board`/`preset` it is the only surface and is never hidden | **high without Phase 6** | high | Phase 6 unwraps the container and rehouses its contents with **nothing deleted**, and its exit criterion is the unmodified coverage ROWS passing with nothing hidden; Phase 7's scope-out names these controls explicitly |
| R9 | Widening `Recipe` breaks `src/editor/templates.ts`, the external caller the PLAN first called internal | high | medium | `templates.ts` and `card-template-remix.test.tsx` are in Phase 1's scope, and `npx tsc --noEmit` is part of its exit criterion |
| R10 | The `movement: 'jump'` coverage row is left with no editor and gets deleted without a decision | medium | high | ADR-006 makes the retirement an explicit decision with the reason recorded at the removal site; Phase 5 leaves the row pointing at the still-present editor so coverage is never briefly unmeasured |

## ✅ Success Criteria

- [x] AC-001 — no `form-tab-*`, `form-panel-expert` or authoring disclosure renders for any kind
- [x] AC-002 — every sentence shape round-trips
- [x] AC-003 — 6/6 bundled pieces and 26/26 bundled cards open with 0 refusals
- [x] AC-004 — `editor-add-effect` / `editor-effect-0` / `editor-action-0` are absent
- [x] AC-005 — the ADR-006 coverage gate passes on the sentence controls
- [x] AC-006 — piece and squareType author effects as sentences
- [x] AC-007 — an unshowable record is read-only, save-blocked, and byte-stable
- [x] AC-008 — no key field renders; a foreign-namespace record survives open-and-save
- [x] AC-009 — preview, errors and save stay in view at 390×844
- [x] AC-010 — the longest record scrolls inside the shell
- [x] AC-011 — no editor string names a removed surface

## 🔍 Plan Validation

### Pass 1 — `plan-validator` → **MAJOR_REVISION** (4 critical, 3 warning, 1 suggestion)

Every critical finding was verified against the source before acting on it; all
four were correct.

| # | Finding | Verified | Resolution |
|---|---|---|---|
| C1 | `form-panel-expert` also holds `royal`, `promotion`, the indexed movement editor, `attack`, the board painter and the `preset` controls — and is never hidden for `board`/`preset` | ✅ the div closes just before `editor-save`; `kind === 'board'` / `'preset'` blocks are inside it | **New Phase 6** unwraps the container and rehouses everything with nothing deleted; deletion moves to Phase 7 with these controls in its scope-**out**. Current-state table corrected. |
| C2 | `src/editor/templates.ts` calls `writeRecipe`/`SlotId` directly; the "internal API" claim is wrong | ✅ `templates.ts:3,117`; `card-template-remix.test.tsx:18` | Both files added to Phase 1's scope; `npx tsc --noEmit` added to its exit criterion; the API-changes section corrected. |
| C3 | The three `movement` coverage rows have no sentence-side successor, so ADR-003's ordering does not protect them | ✅ rows at `vocabulary-coverage.test.ts:427-453` write `movement.1` via the expert editor | Interview round 3 → **ADR-006**: `slide`/`step` re-point at the grid and direction toggles; `jump` retires from `MOVEMENT_KINDS` with its reason recorded. Phase 5's Work now states both halves. |
| C4 | The gate's own `form-tab-expert` block is in no phase's scope and would break Phase 6's own exit criterion | ✅ `vocabulary-coverage.test.ts:871-882` | Added to **Phase 6**'s scope, whose subject is the tab strip. |
| W1 | Phase 4 tested only the two-effect half of the ADR-002 tail | — | Phase 4's exit criterion now requires a movement-outside-grid fixture too. |
| W2 | AC-008's SPEC-designated test files were unnamed | — | `tests/editor/rename.test.ts` and `tests/ui/rename-wiring.test.tsx` added to Phase 7's scope. |
| W3 | Risk register missing the three concrete risks above | — | Added as R8, R9, R10. |
| S1 | `interview_rounds: 1` disagreed with the transcript | — | Corrected to 3. |

Clean categories reported: rollback-strategy, adr-completeness,
missing-interview-rounds.

Cross-model second opinion: **skipped** for every enabled model
(`codex`). Side preset gates second opinion on a high-diff change;
`hm high_diff classify` returned `{"boundary": false, "is_high": false}` (0 added
lines — the branch carried only the RESEARCH and SPEC documents at plan time).
The verdict is Claude-only.

### Pass 2 — `plan-validator` → **MAJOR_REVISION** (2 critical, 1 warning, 1 suggestion), all applied

Pass 2 independently re-verified C1–C4 against source and confirmed they are
resolved **at the mechanism level**: the Phase 6/7 content split holds, Phase 6's
exit criterion is achievable with the palette form still present, `templates.ts`
is in Phase 1's scope, and ADR-006's retirement has no schema- or type-level
consequence (`content/schema.ts:173` is an independent Zod enum).

Its four new findings were all **document-consistency defects introduced by the
revision itself**, each with the corrective text named. None is a phase redesign,
so none was accepted as risk:

| # | Finding | Applied |
|---|---|---|
| C5 | ADR-003's Decision text still said "Phase 6 deletes…", contradicting Phase 6's own "nothing is deleted" header — an executor treating the ADR as authoritative would reproduce exactly the C1 regression | ADR-003's Decision rewritten to the 5/6/7/8 ordering |
| C6 | Phase 7's Scope-out — the inventory guard against C1's failure mode — omitted the `preset` controls, though the current-state table and Phase 6's Work both name them | `preset` added; the list now states it must name every class the current-state table attributes to the panel |
| W4 | Four stale phase-number cross-references outside the Implementation Plan (Prior Work, Affected components ×2, R5) | All four re-pointed against the Implementation Plan as source of truth |
| S2 | `MAKERS['movement:jump']` (`controls.ts:106`) becomes dead code that no phase removes — harmless (a maker for a retired entry cannot throw) but a half-swept retirement | `src/editor/controls.ts` added to Phase 7's scope with the reason; ADR-006 now names both removal sites |

Validator pass cap is 2 (`re-run validator once only`), so there is no pass 3.
Both critical fixes are text edits to sections pass 2 had already verified
functionally, and the ledger carries both passes under run id
`unified-create-ux-20260808-1` for the "does pass 2 change the verdict?" question.

**Final outcome: MAJOR_REVISION_RESOLVED.**
