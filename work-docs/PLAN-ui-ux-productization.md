---
type: plan
task_slug: ui-ux-productization
status: planning
created: 2026-08-06
tags: [strange-chess, plan, react, ui-ux, mobile-web, pwa, content-editor]
research_doc: "[[RESEARCH-ui-ux-productization]]"
interview_rounds: 5
adrs: 13
validator_outcome: MAJOR_REVISION_RESOLVED
summary: "Close the match loop, then art+juice, then rooms a child can build, name and play"
---

# PLAN — UI/UX productization

## 🎯 Executive Summary

**What:** Take the current UI — a correct but bare test harness — to a state a
stranger can pick up, play, re-play, and author content in. Scope is the full
40-gap inventory from `RESEARCH-ui-ux-productization` (36 original, 3 found
after the `01e9e7b` merge, and #40 surfaced by the interview).

**Why:** Two verified defects make the product's own value proposition
unreachable: there is no way to start a second match, and the match seed is
hard-wired to `1`, so the rule-card draw and skill-draft offers — the entire
freshness mechanism — are identical forever. No amount of visual polish changes
that.

**Key decisions:**
- Sequence is lifecycle → art/juice → editor (ADR-015).
- Piece art becomes *content*, not a UI table (ADR-017) — schema v4 `iconKey`.
- Authored content can finally carry its own display text (ADR-020) — schema v4
  `strings` overlay; the author types a Korean name and the editor derives the key.
- Hot-seat stays "two people share one board"; only a manual flip toggle is added
  (ADR-018), so AC-017 is untouched.
- PWA ships this cycle; Capacitor stays a later wrapper (ADR-022).

**Estimated impact:** ~10 phases. Touches every file under `src/ui/`, adds a new
`src/ui/` component set, extends `src/content/schema.ts` twice (one migration),
adds `src/editor/strings.ts`, rewrites `e2e/*.spec.ts` selectors, and adds a
`public/` asset directory that does not exist today.

## 📚 Prior Work

**Baseline shifted mid-planning.** `RESEARCH-ui-ux-productization` was written
against `cd4a3dc`. During this session the peer worktree merged as `01e9e7b`
("verification harness, AC-010 wiring, and the defect it found"). Re-verified
against the merged tree:

| Research claim | Status on `01e9e7b` |
|---|---|
| #2 seed hard-wired | **Still true.** `App.tsx:75` omits `seed`; `Play.tsx:18` defaults `seed = 1` |
| App loads the Phase 3 slice | **Superseded.** App now loads `bundledContentSource` — 40 content entries (11 rule cards, 15 skill cards, 5 square types) |
| e2e specs pin the slice | **Superseded.** `e2e/content.ts` bootstraps the slice *through the editor's real import control* (`editor-json` + `editor-import`) |
| — | **New:** `npm run verify` = typecheck + build + 238 unit + 28 Playwright |

Three gaps were added after re-reading the merged tree, and one came out of the
interview:

- **#37 — the editor screen has no CSS at all.** `styles.css` contains no rule
  for `.editor`, `fieldset`, `.vector-grid`, `.board-row`, or `.board-cell`. It
  renders as browser-default fieldsets.
- **#38 — the editor is one flat column**, `Edit.tsx:667`, with the `open`
  fieldset emitting a raw-id button per existing record — 40 of them on the
  bundled set.
- **#39 — editor labels are schema field names in English** (`kind`, `open`,
  `id`, `nameKey`, `textKey`).
- **#40 — authored content cannot carry display text.** The editor accepts only
  a *key* (`Edit.tsx:692-693`); nothing in `src/editor/` writes a locale string;
  `translate()` falls back to the key. A piece authored by a child renders on the
  board as `my.piece.name`. This is a P0 for the content-platform thesis and was
  not in the research document.

**Lessons carried in:**
- `[wiki:architecture] declarative-content-engine` — the UI names no piece, card
  or square type. Every decision below preserves that.
- `[wiki:architecture] table-driven-content-editor` — editor controls are derived
  from one table (`src/editor/controls.ts`) guarded by the pre-existing ADR-006 vocabulary-coverage test.
  The IA restructure must re-group that table's output, not bypass it.
- Global learned correction 2026-06-08 (absent-case = feature black hole): both
  schema additions in this plan activate on optional fields, so both carry an
  explicit absent-case rule and a test for it.

## 🎙️ Interview Transcript

| # | Topic | Category | Question | Options | Choice | Note | → ADR |
|---|---|---|---|---|---|---|---|
| 1 | Cycle scope | Scope boundaries | How far does this cycle reach? | A only / A+B / A+B+D / A+D | **A+B+D — everything** | All 39+1 gaps | ADR-015 |
| 2 | e2e selector contract | Testing depth | Freeze `data-testid`, or migrate? | migrate-in-same-commit / freeze / switch to a11y selectors | **Migrate in the same commit** | UI may be restructured freely | ADR-016 |
| 3 | Visual identity ownership | Dependencies | Who sets palette / piece art / logo? | I propose / already decided / defer | **Claude proposes and locks it this cycle** | No pre-existing art direction | ADR-021 |
| 4 | Piece art home | Contract shape | Where does the icon live, given ADR-011? | schema `iconKey` / UI mapping table / typography only | **schema `iconKey`** | Editor-authored pieces get icons too | ADR-017 |
| 5 | Hot-seat physical model | Architecture | Shared board, or device hand-off? | shared+flip toggle / auto-flip+handoff screen / both via setting | **Shared board + manual flip toggle** | AC-017 preserved | ADR-018 |
| 6 | Editor information architecture | Architecture | How to restructure the flat column? | list→detail + collapsible / wizard / tabs only | **list→detail + collapsible, and Korean copy an elementary student understands** | Free-form addition: 한글화, 초등 눈높이 | ADR-019 |
| 7 | Authored display text | Contract shape | How does user content carry its name? | type name → key auto-derived / allow literals / separate string-editor tab | **Type the name; the editor derives the key** | AC-016's literal ban survives | ADR-020 |
| 8 | Sound & haptics | Scope boundaries | In scope? | haptics only / both (4-6 SFX) / neither | **Both, 4-6 effects** | Asset strategy deferred to ADR-023 | ADR-023 |
| 9 | Distribution | Dependencies | Decide packaging now? | PWA first / defer to Capacitor / end interview | **PWA first — manifest + icons + service worker** | Capacitor remains a later wrapper | ADR-022 |
| 10 | What a "room" is | Architecture | Is a room a reference set over one shared library, or does it own copies of its content? | preset = room, shared library / room owns private copies | **preset = room; content stays one shared library** | Editing a card changes it in every room that uses it — accepted | ADR-025 |
| 11 | Sharing | Scope boundaries | Does a room get its own export so it can be handed to a friend? | room bundle export / whole-set export only | **Out of scope entirely** | User: sharing belongs with online play, later | — |
| 12 | Editor entry point | Architecture | Is the library reachable on its own, or only through a room? | rooms-first + library tab / rooms-only / keep the flat 6-kind list | **Rooms are the entry; the library stays a tab of its own** | A record in no room must still be visible — otherwise it exists in storage and nowhere on screen | ADR-026 |
| 13 | Deletion | Contract shape | What may be deleted, and what happens to what references it? | refuse while referenced, naming the referrer / cascade-untick / rooms only | **Rooms deletable (never the last); a record refused while referenced, and the refusal names the rooms** | Cascade would change another room silently with no way to know why | ADR-027 |

Two candidate questions were **not** asked, per the 5-term gate:
- *Seed provider shape* — failed common-ground: `browserStorage(storage)` already
  establishes dependency injection as this repo's testability idiom, and the
  determinism suite requires a fixed seed to remain injectable. Defaulted, then
  promoted to ADR-024 because it changes a component's public props.
- *UI chrome i18n key naming* — failed EIG: `ui.*` in the existing `ko` bundle is
  the only choice consistent with `src/ui/i18n.ts`. Recorded as an assumption.

## 📐 Architecture Decision Records

### ADR-015: Sequence lifecycle → presentation → editor, in that order
**Status:** Accepted (2026-08-06, via /hm:plan interview)
**Context:** All 40 gaps are in scope, but they cannot land at once, and the
ordering determines whether intermediate states are shippable.
**Decision:** Phases run lifecycle/FTUE first, then board art + game feel +
layout/a11y/PWA, then the editor. Every phase boundary leaves a playable app.
**Consequences:**
- ✅ The first phases fix defects that make later work measurable (you cannot
  evaluate a move animation across matches you cannot restart).
- ✅ Any early stop still yields a usable product.
- ⚠️ The visible payoff is back-loaded; the first two phases barely change a
  screenshot.
**Rejected alternatives:**
- Art first — rejected because gaps #1/#2 mean it would polish a loop that does
  not close.
- Editor first (A+D) — rejected by the user in favour of full scope.
**Source:** Interview #1

### ADR-016: e2e selectors may be migrated in the same commit as the UI change
**Status:** Accepted (2026-08-06, via /hm:plan interview)
**Context:** Every `data-testid` in `Play.tsx` and `Edit.tsx` is asserted by
`e2e/*.spec.ts`; the restructure this plan requires cannot preserve all of them.
**Decision:** A phase may rename or remove a `data-testid` provided the same
commit updates every spec that references it, and `npm run verify` passes.
**Consequences:**
- ✅ UI structure is not held hostage by selector archaeology.
- ⚠️ A phase that renames selectors cannot be reverted independently of its spec
  changes — rollback is per-phase, not per-file.
**Rejected alternatives:**
- Freeze selectors — rejected: locks the editor into its flat column.
- Move e2e to role/aria selectors wholesale — rejected as a separate concern; the
  a11y work in Phase 6 makes that possible later, not now.
**Source:** Interview #2

### ADR-017: Piece iconography lives in the content schema as `iconKey`
**Status:** Accepted (2026-08-06, via /hm:plan interview)
**Context:** Pieces currently render as Korean word labels. ADR-011 of the
original PLAN forbids the UI from naming any content, so a `pieceId → icon`
lookup in the UI would re-introduce the coupling that ADR removed.
**Decision:** `pieceDef` gains an optional `iconKey: string`. The UI renders the
glyph the key resolves to and knows no piece ids. Schema goes to v4.
**Absent-case rule (mandatory):** when `iconKey` is absent, the renderer falls
back to the first grapheme of the translated `nameKey`, styled as a monogram —
never a blank square. A test asserts the fallback for a piece authored without an
icon.
**Consequences:**
- ✅ Editor-authored pieces can have icons; the UI stays content-agnostic.
- ✅ Bundled pieces get real glyphs by adding data, not code.
- ⚠️ Schema v4 migration: stored content from v3 must load unchanged (absent
  `iconKey` → fallback).
**Rejected alternatives:**
- UI-side `pieceId → icon` map — rejected: violates ADR-011; editor-authored
  pieces would be permanently icon-less.
- Typography only — rejected by the user; does not read as a chess app.
**Source:** Interview #4

### ADR-018: Hot-seat remains one shared board; flipping is a manual toggle
**Status:** Accepted (2026-08-06, via /hm:plan interview)
**Context:** Black currently plays upside-down for the whole match. The fix could
be a manual flip or a full device-handoff model, and those are opposite designs.
**Decision:** Keep AC-017's model — both hands, one board, both trays always
visible. Add a board-orientation toggle the players control. No automatic
rotation, no "pass the phone" interstitial.
**Consequences:**
- ✅ AC-017 and its e2e coverage are untouched.
- ✅ Small, testable surface: one boolean, one reversed render order.
- ⚠️ Gap #14 (turn handoff) is explicitly NOT solved this cycle.
**Rejected alternatives:**
- Auto-flip + handoff screen — rejected: requires amending AC-017 and re-deciding
  the hidden-information model.
- Both, behind a setting — rejected: doubles implementation and test combinations
  for a mode nobody has asked for yet.
**Source:** Interview #5

### ADR-019: The editor's record form is list → detail with collapsible sections and elementary-level Korean copy
**Status:** **Superseded in part by ADR-026** (2026-08-06) — the browse→detail pattern
survives, but only *inside the library tab*. This ADR was written when the editor's
entry point was the per-kind browse view; ADR-026 makes that a room list. Everything
below still governs how a single record is browsed and edited; it no longer describes
the screen a child lands on.
**Originally:** Accepted (2026-08-06, via /hm:plan interview)
**Context:** `Edit.tsx:667` is one `<section>` of sequential fieldsets; the `open`
fieldset renders a raw-id button per record (40 on the bundled set); labels are
schema field names in English; and no CSS rule targets the editor at all.
**Decision:** Two levels — a browse view (per kind, showing translated names, with
search) and a detail view (the form, with 기본/움직임/효과 style sections that
collapse). All labels become Korean written for an elementary reader; schema field
names never appear as UI copy. Controls continue to be generated from
`src/editor/controls.ts`; only their grouping and labelling change.
**Consequences:**
- ✅ The pre-existing ADR-006 vocabulary-coverage gate keeps working — controls are re-grouped,
  not re-authored.
- ✅ Scales past 40 records.
- ⚠️ Editor label copy becomes a translatable surface of its own (`editor.*` keys).
**Rejected alternatives:**
- Wizard — rejected: slows down repeat edits, which is the dominant authoring loop.
- Tabs only — rejected: leaves the long-form problem intact.
**Source:** Interview #6

### ADR-020: Authored content carries its text in a content-level `strings` overlay; the editor derives keys
**Status:** Accepted (2026-08-06, via /hm:plan interview)
**Context:** The editor accepts only a key. `translate()` falls back to the key,
so anything a user authors renders as `my.piece.name` on the board. There is no
code path anywhere in `src/editor/` that writes a locale string.
**Decision:** `ContentSource` gains an optional
`strings: Record<Locale, Record<string, string>>`. The editor's name/description
fields take **plain Korean text**; the editor derives the key from the record id
(`piece.<id>.name`) and writes the typed text into `strings.ko`. `translate()`
consults the content overlay first, then the built-in bundle, then falls back to
the key. Content records still store keys only — AC-016's literal ban is intact.
**Absent-case rule (mandatory):** content without `strings` behaves exactly as
today (bundle lookup, then key fallback). A test loads a v3 document with no
`strings` and asserts unchanged rendering.
**Consequences:**
- ✅ A child can name their own piece and see that name on the board.
- ✅ Export/import carries the text with the content — a shared variant is readable
  on another device.
- ✅ Translation remains possible: the overlay is keyed by locale.
- ⚠️ `translate()` becomes content-dependent, so it needs the active content set
  passed in — a signature change touching every call site.
- ⚠️ Renaming a record id must re-key its strings, or the text is orphaned.
**Rejected alternatives:**
- Allow literals in name/text fields — rejected: kills AC-016 and the translation
  path.
- A separate string-editing tab — rejected: makes a child manage keys and text
  as two artifacts.
**Source:** Interview #7

### ADR-021: Visual identity is defined in this cycle as a CSS custom-property token set
**Status:** Accepted (2026-08-06, via /hm:plan interview)
**Context:** No art direction exists. `styles.css` hardcodes every colour; there
is no type scale, no spacing scale, no dark mode.
**Decision:** Introduce `src/ui/tokens.css` — colour, spacing, radius, type-scale
and elevation as custom properties, with a `prefers-color-scheme` dark set and a
`:root[data-theme]` override. All component CSS consumes tokens only; no literal
colour outside the token file. Direction proposed here: warm neutral board, high
contrast piece sides, one accent for "your turn" state — tuned for a child's
device at arm's length rather than a desktop monitor.
**Consequences:**
- ✅ Dark mode, theming and future re-skinning become data changes.
- ✅ Gap #31 and #35 are structural, not cosmetic, fixes.
- ⚠️ A later brand decision can override the token values, but not the structure.
**Rejected alternatives:**
- Defer to a designer — rejected by the user for this cycle.
- Tailwind or a component library — rejected: 218 lines of CSS and 3 runtime
  dependencies today; a framework would be the largest thing in the app.
**Source:** Interview #3

### ADR-022: Ship a PWA this cycle; Capacitor remains a later wrapper
**Status:** Accepted (2026-08-06, via /hm:plan interview)
**Context:** The game is fully offline-capable in principle (no server, no
account, no network) but is not installable and does not work offline.
**Decision:** Add `manifest.webmanifest`, an icon set, and a service worker that
precaches the built assets. The Capacitor mobile release is unaffected and comes
later.
**Consequences:**
- ✅ Installable and offline immediately, on the platform that already exists.
- ⚠️ A service worker introduces a cache-invalidation surface — stale-build bugs
  are the classic failure and need an explicit update path.
- ⚠️ First build artifact requirement: the repo has no `public/` directory today.
**Rejected alternatives:**
- Defer to Capacitor — rejected by the user.
**Source:** Interview #9

### ADR-023: Sound is synthesized at runtime; no binary audio assets
**Status:** Accepted (2026-08-06, via /hm:plan interview for the scope; the asset
strategy is this plan's own default)
**Context:** The user put 4-6 sound effects and haptics in scope. The repo has no
asset pipeline, no `public/` directory, and no audio licensing story.
**Decision:** Generate the effects with the Web Audio API (short oscillator +
envelope per event: move, capture, card play, draft pick, win, illegal). Haptics
via `navigator.vibrate` where supported. Both behind a single user-facing
sound/haptics toggle, persisted, defaulting to **on for haptics, off for sound**
(a child opening a game in a classroom should not blast audio).
**Consequences:**
- ✅ No licensing, no asset pipeline, a few hundred bytes of code, no download cost.
- ✅ Trivially testable — the audio layer is a pure function of event → parameters.
- ⚠️ Synthesized effects have a ceiling in perceived quality; replacing them with
  sampled audio later is a swap behind the same interface.
- ⚠️ `navigator.vibrate` is unsupported on iOS Safari — the toggle must not imply
  a promise the platform cannot keep.
**Rejected alternatives:**
- Bundled audio files — rejected for this cycle: licensing and asset pipeline cost
  exceeds the benefit at 4-6 short effects.
**Source:** Interview #8 (scope), plan default (mechanism)

### ADR-024: The match seed enters through an injected provider, not a call to `Math.random()` inside a component
**Status:** Accepted (2026-08-06, plan default — not asked, per the 5-term gate's
common-ground term)
**Context:** Gap #2's fix must vary the seed per match without making any test
non-deterministic. `browserStorage(storage)` already establishes injection as
this repo's testability idiom.
**Decision:** The match host takes `newSeed?: () => number`, defaulting to a
random 31-bit integer. Tests and the determinism suite pass a fixed generator.
The seed in play is surfaced in the UI so a match can be reproduced or shared.
**Consequences:**
- ✅ AC-004's determinism guarantee stays testable through the real product path.
- ✅ "Replay this exact match" becomes a feature for free.
- ⚠️ `MatchHost`'s props change (Phase 2 splits `Play` into `MatchHost` + `Board`
  + `Tray` + `DraftPanel`, so there is no `Play` left to take the prop); every
  test constructing it directly must be updated.
**Rejected alternatives:**
- `Math.random()` inline in `App` — rejected: makes the product path untestable
  and forces tests onto a separate code path from users.
**Source:** plan default; recorded because it changes a component contract.

### ADR-025: A preset IS the room; content stays one shared library
**Status:** Accepted (2026-08-06, via /hm:plan interview)
**Context:** The product goal is that a child assembles a board, pieces, rules and
skills into a thing they name, keep, and play with a friend — and that these
accumulate. `presetDef` is already `{ id, nameKey, boardId, pieceIds[],
ruleCardIds[], skillCardIds[] }`, i.e. exactly that unit, but nothing in the
product presents it as one.
**Decision:** A preset is the room. Pieces, square types, rule cards, skill cards
and boards remain ONE shared library that every room references by id. A room is a
reference set, never a copy.
**Consequences:**
- ✅ No schema change, no storage change, no export-format change — the concept
  already exists and only the product surface is missing.
- ✅ A piece authored once is available to every room.
- ⚠️ Editing a card changes it in every room that references it, and there is no
  such thing as a room-private piece. Accepted: the alternative buys isolation
  that only *sharing* would cash in, and sharing is out of scope (see ADR-027's
  context and the Non-Goals).
**Rejected alternatives:**
- Rooms owning private copies of their content — rejected: a much larger schema,
  storage and export change whose payoff is isolation during transfer, which this
  cycle does not do.
**Source:** Interview #10

### ADR-026: Rooms are the editor's entry point, and the library keeps a tab of its own
**Status:** Accepted (2026-08-06, via /hm:plan interview)
**Context:** `Edit.tsx` is one screen with a `<select>` over six record kinds, so
"preset" reads as one of six equal things rather than as the thing being built.
ADR-019 assumed the per-kind browse view was the editor's top level; ADR-025 makes
the room the unit, which moves the top level.
**Decision:** The editor opens on a room list. Opening a room shows its name, its
board and tick-lists of the pieces, rule cards and skill cards it uses, with
"+ new" entering the record form in place. A **standalone library tab** lists every
record of every kind, whether or not a room uses it.
**Consequences:**
- ✅ "Make a room" is a thing the product visibly does.
- ✅ A record that no room references is still reachable, and is badged as such —
  without the tab it would exist in storage and nowhere on screen, which is the
  absent-case black hole this repo's global learned correction names.
- ⚠️ One more screen than ADR-019 assumed, and every `editor.spec.ts` selector
  moves (ADR-016 already permits this).
- ⚠️ ADR-019 is superseded in part: its browse→detail pattern now governs the
  library tab only.
**Rejected alternatives:**
- Rooms-only navigation — rejected on the black-hole consequence above.
- Keeping the flat six-kind list and only restyling — rejected: it leaves the
  product with no room-making experience at all, which is the point of the work.
**Source:** Interview #12

### ADR-027: Deletion refuses while referenced, and the refusal names the rooms
**Status:** Accepted (2026-08-06, via /hm:plan interview)
**Context:** There is no record-level delete anywhere today — `commitDraft`
(`draft.ts:123-136`) only adds or replaces — so rooms would accumulate with no way
to remove one. And deletion is not locally safe: `load.ts:193-250` enforces
referential integrity across the whole document, so removing a record something
references fails `loadContentSet` and the ENTIRE content set stops loading, not
just the room that used it.
**Decision:** A room may be deleted, except the last one. A library record may be
deleted only when nothing references it; when something does, the delete is refused
and the message NAMES the rooms involved. Reference resolution is transitive: a room
references a board, and a board references pieces (`placements[].pieceId`) and square
types (`squares[].typeId`), so a record reachable only through a room's board counts
as referenced by that room.
**Consequences:**
- ✅ A child cannot break the app by deleting something, and is told which room to
  change if they want the delete to succeed.
- ✅ The refusal is a UI-level guard in front of a check `load.ts` already performs,
  so the two cannot disagree about what is legal.
- ⚠️ "Never the last room" has NO schema backstop — `presets` carries no array
  minimum the way `pieceIds` carries `.min(1)` — so it lives entirely in
  `deleteRecord` and needs its own test.
- ⚠️ Deleting takes more than one step when a record is in use.
**Rejected alternatives:**
- Cascade-untick (delete the record and silently remove it from every room) —
  rejected: another room changes with no way to know why and no way back.
- Rooms-only deletion, leaving library records undeletable — rejected: material
  then only ever accumulates, which is the same clutter problem one level down.
**Source:** Interview #13

## 🏗️ Technical Design

### Current state (verified on `01e9e7b`)

```
src/ui/
  App.tsx      84 lines   shell: play/edit tabs, preset <select>, content load
  Play.tsx    218 lines   board, trays, draft, rule card, legend, rejection
  Edit.tsx   1096 lines   one <section>, sequential <fieldset>s, no CSS
  styles.css  218 lines   play view only — nothing targets the editor
  i18n.ts      61 lines   translate(key, locale) over a static ko bundle
src/i18n/ko.ts 117 lines  content strings only; no UI chrome strings
index.html                viewport-fit=cover, no manifest, no icons
```

No `public/`, no service worker, no design tokens, no animation, no audio.

### Affected components

| Component | Change |
|---|---|
| `src/content/schema.ts` | v4: `pieceDef.iconKey?`, `ContentSource.strings?` |
| `src/content/load.ts` | carry `strings` onto `ContentSet`; keep fail-closed validation |
| `src/ui/i18n.ts` | `translate(key, content?, locale?)` — overlay → bundle → key |
| `src/i18n/ko.ts` | new `ui.*` and `editor.*` namespaces |
| `src/ui/App.tsx` | becomes a router: Home / Play / Edit / Rules; owns theme + settings |
| `src/ui/Play.tsx` | split into `MatchHost` (lifecycle, seed, result) + `Board` + `Tray` + `DraftPanel` |
| `src/ui/Edit.tsx` | split into `EditorBrowse` + `EditorDetail` + section components |
| `src/editor/strings.ts` | **new** — key derivation + overlay read/write |
| `src/ui/tokens.css` | **new** |
| `src/ui/sound.ts` | **new** — Web Audio synthesis + `navigator.vibrate` |
| `public/` | **new** — manifest, icons, service worker |
| `e2e/*.spec.ts` | selector migration per ADR-016 |

### Dependencies

No new runtime dependency. React 18, Zod 3 as today. PWA is hand-written (a
`vite-plugin-pwa` dependency is avoidable at this size); if the service worker
proves fiddly, the fallback is that plugin — recorded as a Phase 7 risk, not a
decision.

### Data flow — where the two schema additions sit

```
ContentSource (JSON, storage, export)
  ├─ pieces[].iconKey?  ──────────────┐
  └─ strings?.ko.{key: text}  ──┐     │
                                ▼     ▼
        loadContentSet ──► ContentSet ──► translate(key, content)
                                            │  1. content.strings[locale][key]
                                            │  2. built-in ko bundle
                                            └─ 3. key (loud fallback, unchanged)
```

Both additions are optional and both have an explicit absent-case rule (ADR-017,
ADR-020) with a dedicated test. That is the direct application of the 2026-06-08
learned correction.

### API changes

- `translate(key)` → `translate(key, content?, locale?)`. Call sites: `Play.tsx`,
  `Edit.tsx`, `i18n.ts` internals, `tests/ui/i18n.test.ts`.
- `Play`'s props → `MatchHost({ content, presetId, newSeed?, onExit })`.
- Schema v3 → v4 (two optional fields; no breaking change to stored documents).

## 🚫 Non-Goals

Consolidated so a phase's output can be diffed against one list rather than ten
`Scope out` bullets.

**Deferred by this plan (revisit next cycle):**
- Turn-handoff / auto-flip hot-seat model (#14) — ADR-018 chose the shared board.
- Editor undo/redo — Phase 10 `Scope out`; interim mitigation in R9.
- Sampled audio assets — ADR-023 chose runtime synthesis.
- Capacitor wrapper — ADR-022 chose PWA for this cycle.
- Canvas/SVG board rewrite — Approach C, rejected in RESEARCH.
- Screen shake / particle effects — Phase 5 `Scope out`.
- Moving e2e wholesale onto role/ARIA selectors — Phase 6 makes it possible, does not do it.

**Carried over from `SPEC-variant-chess-6x6-cards` and still out of scope:**
- Checkmate, check restriction, stalemate (AC-002 is king-capture by design).
- Locales other than `ko` — the ADR-020 overlay is locale-keyed so it stays
  possible, but no second bundle ships here.
- Card/piece balance tuning — this plan changes presentation, never the engine's
  resolution order or any content's effect.
- Network play, accounts, servers
- **Handing one room to a friend as a file.** Sharing is a transfer problem and belongs
  with online play; whole-set export/import (AC-015) stays as backup, not as sharing
- **Room-private content.** ADR-025 keeps one shared library — a room is a reference set
  over it, not a copy of it, so there is no such thing as a piece that belongs to one room.

## 📝 Implementation Plan

**Execution order.** The graph is `1 → 2 → {3 ∥ 4} → 5 → 6 → 7 → 8 → 9 → 10`.
Phases 3 and 4 are the only genuinely concurrent pair (route table vs board
renderer — disjoint files). The editor track runs **strictly after** the board
track, not concurrently: Phase 8 changes `translate()`'s signature at every
render call site while Phases 5 and 6 are still rewriting those same call sites
in `Board.tsx`. Running them in parallel is the merge hazard this ordering
exists to remove.


### Phase 1 — Tokens, theming, and UI-chrome localisation
- **Status:** DONE (2026-08-06) — `npm run verify` GREEN; `src/ui/tokens.css` added, `styles.css` holds no literal colour, chrome routed through `ui.*` keys.
  Reviewed at grade B ([[REVIEW-ui-ux-productization-2026-08-06]]), 6 fixes applied in round 2.
  **Carried forward:** `data-theme` is CSS-only scaffolding — no component sets it, so only the
  `prefers-color-scheme` layer is reachable by a user until Phase 6 lands the control. Review also
  found two gaps the audit missed: #41 the board has no checker pattern (Phase 4) and #42 painted
  squares miss non-text contrast (Phase 6).
- `depends_on`: []
- `parallel_group`: `serial-foundation`
- `merge_hazards`: `src/ui/styles.css` (rewritten to consume tokens), `src/i18n/ko.ts` (new namespace) — every later phase edits both
- **Scope in:** `src/ui/tokens.css` (new), `src/ui/styles.css`, `src/i18n/ko.ts`, `src/ui/i18n.ts`, `src/ui/Play.tsx` + `App.tsx` string literals, `tests/ui/i18n.test.ts`
- **Scope out:** layout restructuring, editor, any new screen
- **Exit criterion:** `npm run verify` passes; a test asserts no user-visible
  Korean or English literal remains in `src/ui/*.tsx` (grep-based assertion over
  JSX text nodes); a test asserts `styles.css` contains no literal colour outside
  `tokens.css`; dark mode renders via `prefers-color-scheme` and `data-theme`
- **Risk:** low
- **Rollback:** revert to `01e9e7b`

### Phase 2 — Match lifecycle: seed provider, home screen, new match, rematch
- **Status:** DONE (2026-08-06) — `npm run verify` GREEN (258 unit, 32 e2e). `Play.tsx` became
  `MatchHost.tsx`; `Home.tsx` and a three-route shell added; seed injected per ADR-024 and shown
  with a copy control; `new-match` / `rematch` / `go-home`; phase, side and the end-of-match reason
  localised with the machine value moved onto `data-phase` / `data-side` / `data-winner`; preset
  picker names presets (#17). Per ADR-016 the e2e suite was migrated in the same change — 12 text
  assertions became attribute assertions, and `e2e/content.ts` + `editor.spec.ts`'s own `play()`
  helper now pass through the home screen.
- `depends_on`: [1]
- `parallel_group`: `serial-lifecycle`
- `merge_hazards`: `src/ui/App.tsx` and `src/ui/Play.tsx` are both restructured; Phase 3 builds on the same files
- **Scope in:** `src/ui/App.tsx` (router), `src/ui/MatchHost.tsx` (extracted from `Play.tsx`), `src/ui/Home.tsx` (new), seed provider per ADR-024, result screen with rematch/home, preset picker showing translated names (#17), localised phase/side/result (#5, #6)
- **Scope out:** board visuals, animation, tutorial content
- **Exit criterion:** an e2e test starts a match, plays to a result, taps rematch,
  and asserts the second match's `data-rule` differs across a sample of seeds;
  an e2e asserts the active seed is on screen and copyable
  (`data-testid="match-seed"`), which is what makes ADR-024's replay/share claim
  real rather than internal; a unit test asserts a fixed `newSeed` reproduces
  AC-004's determinism exactly
- **Risk:** medium — touches the component that every existing e2e spec drives
- **Rollback:** Phase 1

### Phase 3 — FTUE: how-to-play, rules reference, contextual first-match coaching
- **Status:** DONE (2026-08-06) — `npm run verify` GREEN (266 unit, 36 e2e). `Rules.tsx` renders the
  loaded set by group and is asserted by COUNT against the content, so an authored piece appears with
  no code change; `Coach.tsx` shows one card at a time, skippable at every step; `coach.ts` holds the
  seen flag with `Storage` injected and fails toward already-seen so a storage-denying browser cannot
  trap a player in a tutorial. Also styled `.home` / `.seed` / `.result-panel` / `.primary` from
  Phase 2, which had shipped as class names with no rules.
- `depends_on`: [2]
- `parallel_group`: `parallel-after-lifecycle` (with Phase 4)
- `merge_hazards`: `src/ui/App.tsx` route table; `src/i18n/ko.ts` copy. Disjoint from Phase 4's files (`schema.ts`, `Board.tsx`), which is why the two may run concurrently
- **Scope in:** `src/ui/Rules.tsx` (new — piece/card/square reference generated from the content set, naming nothing), first-match coach marks introduced one at a time, skip control, "seen" flag in storage
- **Scope out:** video, animation-based tutorial, achievements
- **Exit criterion:** e2e — a first visit shows the coach mark sequence, a skip
  ends it, and a second visit does not show it; the rules screen lists every
  piece, rule card, skill card and square type in the *loaded* set (assert count
  equals the content set's, so an authored piece appears without a code change)
- **Risk:** medium — progressive disclosure is where onboarding overwhelms
- **Rollback:** Phase 2

### Phase 4 — Board rendering: schema v4 `iconKey`, glyphs, coordinate relocation
- **Status:** DONE (2026-08-06) — `npm run verify` GREEN (277 unit, 41 e2e). Schema v4 adds
  `pieceDef.iconKey` and `SCHEMA_VERSION` 3→4 (which is what lets `io.ts` re-import a v4 export);
  the bundle authors six icons; the board draws the glyph with a first-grapheme monogram fallback
  for every pre-v4 document; coordinates moved to rank/file rails on the frame; and #41's checker
  landed with `data-parity` plus the `--color-board-dark` rule that Phase 1 had removed as dead.
  The A.5 gate ran three times — the third round found that '왕' and '성' are already one grapheme,
  so a grapheme-COUNT assertion would have missed king and rook keeping their names.
- **Scope re-derived 2026-08-06** by tracing reachability rather than listing new files, after
  `[fail:design] phase-scope-omits-wiring` recorded three consecutive phases drifting the same way.
  What the original one-line scope missed is below; the findings are cited, not assumed.
- `depends_on`: [2] — `Board`/`MatchHost` does not exist until Phase 2 splits `Play.tsx`
- `parallel_group`: `serial-board`
- `merge_hazards`: `src/content/schema.ts` (Phase 8 edits the same file for `strings`, and must land
  after this); `src/editor/io.ts` (its import gate is keyed to `SCHEMA_VERSION`); `src/ui/styles.css`
  and `src/i18n/ko.ts` (every phase touches both); `e2e/hotseat.spec.ts`'s portrait-scroll assertion
- **Scope in — content layer:**
  - `src/content/schema.ts` — `pieceDef.iconKey?` (note `pieceDef` is a `z.strictObject`, so an
    unknown key is *rejected*, not ignored: the field must exist before any document can carry it),
    and `SCHEMA_VERSION` 3 → 4
  - `src/editor/io.ts` — **not in the original scope.** `io.ts:44` refuses any document declaring
    `schemaVersion > SCHEMA_VERSION`, so the bump is what makes a v4 export importable at all
  - `src/content/sets/bundled.ts` — six pieces gain icons; the document's own `schemaVersion: 3` → 4
  - `src/i18n/ko.ts` — the icon entries `iconKey` resolves through `translate`
- **Scope in — render layer:**
  - `src/ui/MatchHost.tsx` — glyph instead of the piece's name text; coordinates moved off the square
  - `src/ui/styles.css` — square/piece/coordinate rules and the edge rail
  - `src/ui/tokens.css` — reinstate `--color-board-dark`, removed in Phase 1's review as a dead
    token, together with the `data-parity` attribute that gives the board a checker (**gap #41**)
- **Scope in — tests:**
  - `tests/content/` — a v4 document round-trips; **the absent case is already exercised in-tree**:
    `slice.ts` declares `schemaVersion: 1` and `gate6a.ts` declares `2`, and both are loaded by
    existing suites, so a piece with no `iconKey` is not a hypothetical fixture
  - `tests/ui/` — the monogram fallback renders rather than a blank square; no square contains its
    own coordinate text
  - `e2e/` — `hotseat.spec.ts:172` ("lays out in portrait without horizontal scrolling") is the
    assertion an edge coordinate rail can break; it is the reason the rail must be sized, not added
- **Scope out — and the consequence, stated because it is not obvious:** the editor gets **no
  `iconKey` control** in this phase; that belongs to Phase 9's form work. **ADR-017's consequence
  "editor-authored pieces get icons too" is therefore NOT true until Phase 9**, and until then an
  authored piece renders the monogram fallback. This has to be written down because nothing will
  catch it: the ADR-006 coverage gate derives its vocabulary from the Zod *discriminated unions*
  (`src/editor/vocabulary.ts:6,26` — it unwraps `kind` options), and no test asserts coverage of
  record-level fields against `pieceDef.shape`. `royal`, `promotion` and `attack` are in that gate
  because someone added rows for them by hand. A new optional field is invisible to it — which is
  `[fail:design] declared-but-inert-vocabulary` for the third time if it is left implicit.
- **Exit criterion:** `npm run verify`; a test loads `slice.ts` (v1) and asserts the monogram
  fallback renders for a piece with no `iconKey`; an e2e asserts every bundled piece renders a glyph
  and that no square contains its coordinate text; `hotseat.spec.ts`'s portrait no-horizontal-scroll
  assertion still passes with the coordinate rail present; a test asserts the board renders two
  distinct square colours (#41 — the checker, which shipped as a dead token in Phase 1)
- **Risk:** medium-high — schema migration plus the first change to the board's own markup
- **Rollback:** Phase 3

### Phase 5 — Game feel: animation, last-move, drag, sound, haptics
- **Status:** DONE (2026-08-06) — `npm run verify` GREEN (288 unit, 45 e2e). `MatchHost` retains the
  applied action, so the last-move highlight and the land animation follow the piece rather than a
  board diff, and both clear on undo and on a new match. `sound.ts` synthesizes six events with the
  audio backend injected (so a test asserts silence, not that a flag was read) and haptics feature-
  detected; `settings.ts` persists the toggles with `Storage` injected, sound off and haptics on by
  default. Drag lands alongside tap. `playwright.config.ts` runs the suite under reduced motion with
  `e2e/motion.spec.ts` opting back in — the arrangement exists precisely so the animation path is
  not silently untested.
- **Scope re-derived 2026-08-06**, same method as Phase 4: trace what must be touched for the new
  thing to be reachable, not what the phase creates. Four items below were absent from the original.
- `depends_on`: [4]
- `parallel_group`: `serial-board`
- `merge_hazards`: `src/ui/MatchHost.tsx`, `src/ui/styles.css`, `src/ui/tokens.css`; and
  `playwright.config.ts`, which is shared by all 41 existing specs
- **Scope in — the animation itself:**
  - `src/ui/MatchHost.tsx` — **must start retaining the applied `Action`.** `push` currently keeps
    only the resulting state (`MatchHost.tsx:118-119`), and the engine gives pieces no instance
    identity — `state.board.get(sq)` is keyed by square — so a tween derived from diffing board maps
    animates *squares*, and a piece fades out and in instead of sliding. The action that was applied
    is the only thing that says what moved where. Cleared on undo, or the last move replays.
  - `src/ui/tokens.css` — **not in the original scope.** Duration and easing become tokens so
    `prefers-reduced-motion` has one place to zero them rather than a sweep through component rules
  - `src/ui/styles.css` — motion rules, last-move highlight (#11), and the reduced-motion block (#30)
- **Scope in — input:**
  - drag-and-drop **alongside** tap (#12). Tap is not replaced: all 41 existing specs drive the board
    by clicking, and they are the regression net for this phase
- **Scope in — sound and haptics (ADR-023):**
  - `src/ui/sound.ts` (new) — Web Audio synthesis, no binary assets
  - `src/ui/settings.ts` (new) — **not in the original scope.** The toggle has to persist, and
    persistence in this repo means `Storage` injected as a parameter with a stated failure
    direction; `src/ui/coach.ts` is the precedent, including its read/write asymmetry lesson
  - `src/i18n/ko.ts` — the toggle's labels
  - `navigator.vibrate` is **absent on iOS Safari** (ADR-023's own consequence): feature-detect, and
    do not let the toggle promise what the platform cannot do
- **Scope in — the test harness itself:**
  - `playwright.config.ts` — **not in the original scope, and the trap is specific.** Adding motion
    puts 41 existing specs on a moving board. Setting `reducedMotion: 'reduce'` project-wide would
    make them stable *and never exercise the animation path* — which is
    `[fail:test] test-setup-hides-the-failure-path`, already recorded in this repo from the clipboard
    e2e that granted the permission whose absence was the risk. So: reduced by default for the
    existing suite, plus **at least one spec that explicitly opts into full motion**
- **Exit criterion:** `npm run verify`; the suite passes with reduced motion AND the opted-in spec
  passes with motion on; a unit test asserts undo after a move leaves no stale animation state; a
  unit test asserts every sound event maps to synthesis parameters and that the toggle silences all
  of them; a test asserts the haptics toggle reflects actual `navigator.vibrate` support rather than
  intent; tap-to-move still passes every pre-existing spec unchanged
- **Risk:** high — the positional-identity trap above, and 41 specs newly racing an animation
- **Rollback:** Phase 4

### Phase 6a — Accessibility, contrast, and the theme control
- **Status:** DONE (2026-08-06) — `npm run verify` GREEN (291 unit, 56 e2e). 44px targets and a
  `:focus-visible` ring across every non-editor control; the board is a `role=grid` whose squares
  carry labels that include reachability, so legal moves are not colour-only; the rejection is a
  fixed toast; a theme control that persists and beats the OS in both directions; ADR-018's flip.
  The contrast trio resolved: outlining the glyph decoupled piece legibility from the board, so the
  checker reached 3.30:1 (light) / 3.20:1 (dark) and the painted square 3.99:1 — both were open
  since Phase 4. It also surfaced that the LIGHT theme's two sides were 1.04:1 apart, i.e. hue
  alone; they are 2.75:1 now.
- **Scope re-derived 2026-08-06.** Same method as Phases 4 and 5, which are the only two phases so
  far whose drift verdict came back `clean`. This one also **collects what three reviews deferred
  here** — those items were recorded in REVIEW documents, not in this scope, and would otherwise be
  found by reading old reviews rather than the plan.
- `depends_on`: [5]
- `parallel_group`: `serial-board`
- `merge_hazards`: `src/ui/styles.css` and `src/ui/tokens.css` (every phase touches both);
  `src/ui/MatchHost.tsx`; `e2e/hotseat.spec.ts`'s portrait no-horizontal-scroll assertion
- **Split from Phase 6 on 2026-08-06.** The A.5 gate counted the authored tests against the phase's
  own exit criterion and found four scope items with no test at all — the accessibility and contrast
  work had been done and the layout work silently skipped. Splitting is the honest response: 6a is
  what is actually ready, 6b is what was not started. Neither half shrank; the boundary moved to
  where the work already was.
- **Scope in:** touch targets to 44px (#27), `:focus-visible` (#28), board semantics — `role="grid"`,
  `aria-label`, `aria-pressed`, legal-move state exposed non-visually (#29), rejection as a
  non-shifting toast (#15), board flip toggle per ADR-018 (#13)
- **Scope in — carried here by earlier reviews, one line each:**
  - **#42 painted-square contrast** (Phase 4 review) — ≈1.03:1 against a plain square; AC-018's
    "distinguishable at a glance" is currently carried by a 1px border
  - **Outlined piece glyphs** (Phase 4 review) — the checker and the pieces trade contrast on one
    axis, measured: a 1.97:1 checker drops the tinted glyphs to ≈2.9:1. An outline decouples them.
    **This is one piece of work with #42 and the board tokens, not three** — every change moves the
    same measurements, so they must be re-measured together or the table in the Phase 4 review lies.
  - **A theme toggle** (Phase 1 review) — `data-theme` has been CSS-only since Phase 1; **verified
    still true**: no `.tsx` sets it and `Settings` has no theme field, so only the OS-preference
    layer is reachable by a real person
  - **`piece-land` perceptibility** (Phase 5 review) — needs the device check below, not a rewrite
- **Scope in — the wiring the lists above do not name:**
  - `src/ui/settings.ts` — **gains a `theme` field.** A toggle whose choice does not survive a reload
    is not a choice; persistence here means the existing injected-`Storage` module, extended
  - `src/ui/App.tsx` — must **write `data-theme` onto `document.documentElement`**, which is outside
    React's tree and therefore an effect, not a render
  - `src/ui/Home.tsx`, `src/ui/Rules.tsx`, `src/ui/Coach.tsx` — **not named in the original scope**,
    but touch targets and focus rings are properties of every interactive element, and 8 of the 18
    buttons outside the editor live in these three files
  - `src/i18n/ko.ts` — labels for theme, flip, and whatever the grouped controls become
- **Scope out, explicitly:** `src/ui/Edit.tsx`. It holds the largest number of controls in the app
  and every one of them will fail the 44px and focus-ring checks — but the editor is rebuilt in
  Phase 9, and fixing its markup now means doing it twice. The tests must therefore scope their
  element queries to the non-editor surfaces and say so, or Phase 6 cannot go green.
- **Exit criterion:** `npm run verify`; an **e2e** (layout is required, so jsdom cannot answer)
  asserts every interactive element outside the editor is ≥44×44 CSS px and that each has a visible
  focus indicator when focused; e2e asserts the board exposes a grid role with per-square labels and
  that legal-move state is present non-visually; an e2e asserts an illegal tap causes **no layout
  shift** (board bounding box unchanged before/after); a test asserts the theme toggle flips
  `data-theme` on the root, persists, and that an explicit choice beats the OS preference in **both**
  directions; a measured assertion that the painted square clears 3:1 against a plain square in both
  themes AND that pieces still clear 3:1 on both parities — the Phase 4 review's table, re-measured
- **Note on the focus ring:** `:focus-visible` does not apply to a programmatic `.focus()` in
  Chromium, so the test drives focus with `Tab`. An implementation using plain `:focus` would also
  pass, but would then ring on mouse clicks too — the test permits either and the choice is the
  implementer's.
- **Risk:** high — the contrast items are a three-way constraint, and 45 e2e specs drive this markup
- **Rollback:** Phase 5

### Phase 6a+ — User-directed follow-up: readability, board primacy, content icons, turn state
- **Status:** DONE (2026-08-06) — `npm run verify` GREEN (291 unit, 56 e2e). Driven by the user
  reviewing the running app on a device rather than by a phase scope, so it is recorded here as its
  own unit instead of being folded into 6a's record. It **partially consumes Phase 6b** (the tray
  and control-row items below) and **partially extends ADR-017** with a schema bump; 6b keeps the
  safe-area and breakpoint items, which this did not touch.
- `depends_on`: [6a]
- `parallel_group`: `serial-board`
- `merge_hazards`: `src/ui/styles.css` and `src/ui/tokens.css` (every phase touches both);
  `src/ui/MatchHost.tsx`; `src/content/schema.ts` — the v5 bump lands here, so Phase 8's
  `strings` addition to the same file must come after it
- **Risk (recorded after the fact):** high — a schema version bump plus the board's markup
  plus the play screen's whole layout in one unit, executed without a review gate in front
  of it. The review that eventually ran found four P1s, which is what that risk looks like
  when it lands.
- **Rollback:** Phase 6a
- **These five fields were written retrospectively.** The work was user-directed from a
  running app rather than planned, so the metadata describes what happened rather than what
  was decided in advance — which is exactly why the drift gate could not judge this unit.
- **What it found, and why each was invisible until someone looked:**
  - **Every `button` / `select` / `input` / `textarea` rendered black-on-dark in the dark theme**
    (≈1.2:1). Form controls do not inherit `color`; the UA substitutes `buttontext`. `styles.css`
    had set `background` from Phase 1 and never `color`, so the defect existed for six phases and
    was structurally invisible to the light theme — including to `e2e/contrast.spec.ts`, which
    measures the BOARD's tokens and never a control's computed colour.
  - **`:root[data-theme='light']` was missing `--color-glyph-outline` and `--color-focus-ring`** —
    the same half-implementation `tokens.css`'s own header warns about, pointed the other way: a
    user on a dark OS who chose light kept the near-white glyph outline on a near-white board.
  - **The board was not the hero of the play screen.** Status, a seven-control seed row, the rule
    card and three stacked draft offers put ~590px of chrome above it, so the board did not fit on
    a 915px phone. Order inverted: everything that is not the board or the hand played from it now
    sits below it.
  - **The draft read as a list, not a choice.** It is now a bottom sheet over a dimmed board, with
    the offers dealt in as cards in the drafting side's colour. First implementation made the scrim
    eat pointer events — 20 e2e failures, and the player-facing version was worse: no way out of a
    draft except reloading. The scrim dims and does not trap.
  - **Whose turn it was read as one grey chip among four**, on a hot-seat game where that is the
    only thing the chrome must answer. It is now a banner with the side's colour and dot, and the
    board's own frame carries the same colour.
- **Schema v5 (extends ADR-017).** v4 gave `iconKey` to pieces only, which left the rule in play, a
  skill card in a hand, and a painted square distinguishable only by reading Korean prose. The UI
  cannot supply the missing half itself — a `.square[data-square-type='square.bomb']` selector puts
  a content id in a stylesheet, which is exactly what ADR-011 forbids — so the icon is content.
  `iconKey` added to `squareTypeDef`, `ruleCardDef`, `skillCardDef`, all optional; every v4 document
  loads unchanged. 31 bundled entries carry one, and `textKeysOf` counts them so AC-016 covers them.
- **Also closes the P1 regression Phase 6a introduced.** 6a's green painted squares were ≈1.4:1
  against `--color-legal`, so the legal-move cue vanished on precisely the squares whose ability
  makes the decision hard — and green conventionally means safe, the opposite of what a 폭탄칸 does.
  Painted squares are violet now, and the legal cue no longer depends on a single colour clearing
  every fill: it is a dot inside a theme-invariant black/white ring (`--color-cue-lo` / `-hi`).
- **Scope:** `src/content/schema.ts`, `src/content/sets/bundled.ts`, `src/i18n/ko.ts`,
  `src/ui/i18n.ts`, `src/ui/MatchHost.tsx`, `src/ui/styles.css`, `src/ui/tokens.css`,
  `tests/content/bundled.test.ts`
- **Reviewed after the fact** — `REVIEW-ui-ux-productization-phase6a-2026-08-06.md`, run on the
  landed commit `63b9a1b` rather than on a working tree, because `/hm:wrapup` had gated on Phase
  5's verdict for want of one. **C → A over two rounds, 12 fixes.** All four P1s were things the
  suite structurally could not see: `:focus-visible` erasing the last-move ring (same specificity,
  same property, later in the file); `pieceGlyph` able to paint an unresolved key on the board while
  the `iconOf` added beside it guarded the other three kinds; no `aria-live` anywhere in `src/`, so
  a turn change was never announced; and the legend omitting the very icon it exists to decode.
  Two P2s deferred to a device (a scroll affordance for the tools row, and `display: contents` +
  `role="row"` on older a11y trees).
- **Exit criterion:** `npm run verify` GREEN with no decrease in Playwright count — met (56, from 56).

### Phase 6b — Layout: safe area, breakpoints, trays, and empty states
- **Status:** DONE (2026-08-06) — `npm run verify` GREEN (298 unit, 64 e2e). The shell consumes all
  four safe-area insets with fallbacks; a short-landscape breakpoint sizes the board off the short
  axis and moves the chrome beside it; both hands collapse to their label without reflowing the
  board; a failed load of the author's own saved content is reported with somewhere to go; sound and
  haptics moved behind one affordance.
- **What the exit criterion could not see, found by measuring during Phase A.** The #33 clauses —
  "the board stays square" and "the page does not scroll horizontally" — were already TRUE at 360,
  768 and 915px before a line of this phase existed, so as written they compelled no work. Measured,
  the real landscape defect is that a board sized off WIDTH is 441px tall in a 412px-tall window:
  241px of it, the bottom two ranks, sits below the fold. An assertion that the whole board is on
  screen was added, and it is what drove the breakpoint. Recorded because the phase would otherwise
  have shipped #33 "covered" by two assertions that cannot fail.
- **Split out of Phase 6 on 2026-08-06** — see 6a. These four had no authored test when the gate
  counted, which is what surfaced them as a separate body of work rather than a tail of 6a.
- `depends_on`: [6a]
- `parallel_group`: `serial-board`
- `merge_hazards`: `src/ui/styles.css`; `e2e/hotseat.spec.ts`'s portrait no-horizontal-scroll assertion
- **Scope in:** safe-area insets (#32 — `index.html` already sets `viewport-fit=cover`, so this is
  padding that consumes `env(safe-area-inset-*)`), tablet and landscape breakpoints (#33),
  card-shaped collapsible trays (#16), designed error and empty states (#18), and the control-row
  grouping that Phase 4's and Phase 5's reviews both deferred
- **Scope correction 2026-08-06 (during execute).** That bullet originally read "the row is now
  seed, copy, sound, haptics, **theme**, flip, new-match and home", and `theme` does not belong in
  it. The theme toggle lives in `App`'s `<nav>` and is therefore reachable from home, the rules
  screen and the editor as well as from a match; moving it into `MatchHost`'s tools row would make
  it reachable only while a match is open, which is a regression the phase would have shipped by
  following its own scope line. What the two deferring reviews actually asked for was grouping the
  **two settings toggles** (sound, haptics) behind one affordance, and that is what this phase does.
  The theme control stays where it is.
- **Scope out:** `src/ui/Edit.tsx`, for the same reason as 6a — Phase 9 rebuilds it
- **Exit criterion:** `npm run verify`; an e2e at a tablet viewport and one in landscape assert the
  board stays square and the page does not scroll horizontally; a test asserts the shell consumes
  `env(safe-area-inset-*)` rather than merely declaring `viewport-fit=cover`; an e2e collapses and
  expands a tray and asserts the board's bounding box is unchanged by it; a test renders the shell
  with content that fails to load and asserts a designed state with a recovery action rather than a
  bare sentence
- **Risk:** medium
- **Rollback:** Phase 6a

### Phase 7 — PWA: manifest, icons, offline
- **Status:** DONE (2026-08-06) — `npm run verify` GREEN (308 unit, 64 e2e, 4 pwa-e2e). Hand-written
  service worker emitted by `vite-plugin-sw.ts` with the build's own hashed asset list baked in; a
  rook mark on the ADR-021 violet rasterised to 192/512/512-maskable by `scripts/make-icons.mjs`;
  an update prompt that announces and never reloads on its own.
- **The defect that cost the most, recorded because nothing else would have caught it.** Offline,
  the shell came back and both assets failed — which reads exactly like a precache that never ran.
  It had run: the cache held both files. `caches.match(request)` was the wrong lookup, because a
  RELOAD marks every request it starts with cache mode `reload` and matching such a Request misses.
  Matching by URL string fixes it, and the URL is the right identity here anyway since these
  filenames carry a content hash. No unit test could have found this; it needed a real browser, a
  real build and a real reload, which is what the second Playwright config exists for.
- **Known gap, recorded rather than dropped: iOS.** `e2e-pwa` runs one Chromium
  profile, so nothing in CI exercises WebKit — and iOS honoured the manifest's
  `display: standalone` only from 16.4, which is why `index.html` also carries
  `apple-mobile-web-app-capable`. Installability on older iOS is a **manual
  check**, in the same bucket as the HTTPS clause above.
- **Four places now hold the brand hexes** — `tokens.css`, `index.html`'s
  `theme-color`, `manifest.webmanifest`'s `theme_color`/`background_color`, and
  `scripts/make-icons.mjs`. Only the first is covered by ADR-021's scan (the
  others are not stylesheets), so a re-skin that edits the token alone leaves
  three artifacts on the old palette with nothing failing. Each carries a comment
  pointing at the token; generating them from one source is the real fix and is
  not done here.
- **No dependency added.** The worker is ~40 lines of Cache API and the icon script drives the
  chromium that `@playwright/test` already brings, at design time only — a build that shells out to
  a browser is a build that breaks in CI for reasons unrelated to the code, so the PNGs are committed.
- `depends_on`: [6b] — **was `[6]`, a node that no longer exists.** Phase 6 was split into
  6a (DONE), 6a+ (DONE) and 6b (pending) on 2026-08-06 and this reference was left dangling;
  6b is the last serial-board phase, so it is the real predecessor.
- `parallel_group`: `serial-platform`
- `merge_hazards`: `vite.config.ts`, `index.html`, new `public/`
- **Scope in:** `public/manifest.webmanifest`, icon set generated from the ADR-021
  identity, service worker precaching the build, an explicit update prompt when a
  new build is available
- **Scope out:** Capacitor, push, background sync
- **Exit criterion:** e2e — the app loads with the network offline after one
  visit; Lighthouse-installability criteria met (manifest, icons, SW, HTTPS-ready);
  a stale-cache test asserts the update prompt appears when the SW sees a new build
- **Verification split for the HTTPS clause, recorded rather than dropped.** The
  offline suite runs against `http://127.0.0.1:4173`, so most of "HTTPS-ready" is not
  assertable from it: `location.protocol` would be a permanent false negative and the
  certificate is a deploy property. The part that a BUILD can break — an absolute
  `http:` URL baked into the manifest, which an installed app fetching over HTTPS gets
  blocked as mixed content — is asserted. The remainder (served over TLS, no mixed
  content from the deployed origin) is a **manual post-deploy check**, listed here so
  it is a known gap rather than an unnoticed one.
- **These tests need their own runner.** A service worker precaching the build cannot
  be exercised against `npm run dev`, which serves unbundled modules no precache
  manifest can name, so `e2e-pwa/` runs under `playwright.pwa.config.ts` against
  `vite build && vite preview`. `npm run verify` chains it — a suite the authoritative
  gate never runs is `[fail:design] built-but-not-wired`.
- **Risk:** medium — service-worker cache invalidation
- **Rollback:** Phase 6

### Phase 8 — Schema v4 `strings` overlay, key derivation, and the rename primitive
- `depends_on`: [7] — strictly after the whole board track; see **Execution order**
- `parallel_group`: `serial-editor`
- `merge_hazards`: `src/content/schema.ts` (same file as Phase 4 — strictly after it); `src/ui/i18n.ts`'s signature change ripples to every render call site, which Phases 5 and 6 rewrite — hence the serial dependency on 7 rather than 4
- **Scope in:** `src/content/schema.ts` (+`strings`), `src/content/load.ts`,
  `src/ui/i18n.ts` (overlay-aware `translate`), `src/editor/strings.ts` (new — key
  derivation from record id), export/import carries the overlay, **and the rename
  primitive in `src/editor/draft.ts`**: `commitDraft` gains the id the draft was
  opened under, so changing an id replaces the record and re-keys its strings.
  Today `commitDraft` matches solely on the draft's own `id` (`draft.ts:123-136`),
  so an id change appends a second record and orphans the first — a pre-existing
  defect that ADR-020 would otherwise turn into orphaned text (R10)
- **Scope out:** editor UI changes, including threading the opened id through the
  form — Phase 9 owns that
- **Exit criterion:** a unit test builds a `ContentSource` **programmatically**
  with a `strings.ko` entry (no editor UI is involved at this phase) and
  round-trips it through export → import → render, asserting the Korean text
  reaches the board; a v3 document with no `strings` renders identically to
  before (ADR-020 absent-case); a unit test calls `commitDraft` with a changed id
  and asserts exactly one record exists afterwards and its strings moved with it
- **Risk:** high — `translate`'s signature change touches every rendering call site
- **Rollback:** Phase 7

### Phase 9a — Rooms: the editor's entry, room detail, naming, and the library tab
- **Re-planned 2026-08-06 (ADR-025/026/027).** Phase 9 was written as "make the editor
  pleasant to browse". The product goal is that a child assembles a room, names it, keeps
  several, and picks one to play — which touches the same files and produces a different
  screen. Split into 9a (structure) and 9b (deletion) on the validator's finding that one
  phase carried four separable bodies of work; the same split judgement that produced
  6a/6b, and for the same reason.
- `depends_on`: [8] — **because any typed Korean name in the editor needs ADR-020's
  overlay**, not only a room's. `presetDef.nameKey` is an i18n key and the schema rejects
  literal text (AC-016), and so does every record created through "+ new" inside a room.
  Without Phase 8 the child types a name and the board renders `my.piece.name`.
- `parallel_group`: `serial-editor`
- `merge_hazards`: `src/ui/Edit.tsx` splits into new files; every `editor.spec.ts` selector
  moves (ADR-016); `src/editor/draft.ts` is edited by Phase 8 for the rename primitive, so
  8 must land first; `src/ui/Home.tsx` and `src/i18n/ko.ts` (every phase touches the latter)
- **Scope in — new screens:**
  - `src/ui/EditorRooms.tsx` (new) — the room list, "새 방 만들기", and opening a room. A new
    room cannot be empty: `pieceIds` carries `.min(1)` (`schema.ts:375`), so creation seeds
    at least one piece and the form refuses to untick the last one
  - `src/ui/RoomDetail.tsx` (new) — name field (plain Korean, via Phase 8's overlay), board
    select, tick-lists over pieces / rule cards / skill cards, and "+ 새 기물 / 룰 / 스킬"
    entering the record form in place
  - `src/ui/EditorLibrary.tsx` (new) — today's six-kind surface, restructured browse → detail
    per ADR-019, with an "어느 방에도 안 들어감" badge (ADR-026's black-hole guard)
  - `src/ui/Edit.tsx` — reduced to a two-tab shell
- **Scope in — the wiring the screens do not name:**
  - `src/editor/references.ts` (new) — "which rooms reference this record", walking the
    **transitive** path room → board → `placements[].pieceId` / `squares[].typeId` as well
    as the four direct preset fields. 9b's delete guard and 9a's library badge are the two
    callers, and they must not answer this question differently
  - `src/editor/draft.ts` — the opened-record id threaded into `commitDraft`, which is what
    makes Phase 8's rename primitive reachable from a form at all (R10)
  - `src/ui/Home.tsx`, `src/i18n/ko.ts` — the preset `<select>` becomes a room picker.
    `ui.preset.label` ("놀이 고르기") is replaced: it reads as *choose a different game*,
    and what it selects is a configuration of the same game
  - editor CSS (#37 — no rule targets the editor today), `editor.*` Korean copy for an
    elementary reader (#39), field-anchored validation (#25), raw draft-JSON `<pre>` removed (#19)
- **Scope out:** deletion of any kind (9b); preview, playtest, file I/O (Phase 10); room
  sharing and online play (Non-Goals — not in this PLAN)
- **Exit criterion:** `npm run verify`; an **e2e** creates a room by typing a Korean name,
  picking a board and ticking pieces, one rule card and one skill card, saves, then starts a
  match on it from Home and asserts the board renders exactly those pieces; an e2e asserts a
  record belonging to no room is listed and badged in the library tab; a unit test asserts
  `references.ts` reports a room for a piece reachable ONLY through that room's board
  `placements` (never through `pieceIds`) and for a square type reachable only through
  `squares[].typeId`; an e2e renames a record's id through the form and asserts one record
  remains with its text intact; the pre-existing ADR-006 vocabulary-coverage test passes
  UNCHANGED, proving controls were re-grouped rather than re-authored; an assertion proves no
  schema field name (`nameKey`, `textKey`, `iconKey`, `kind`, `pieceIds`) appears as visible
  UI copy
- **Risk:** high — the largest restructure in the plan, and every editor e2e selector moves
- **Rollback:** Phase 8

### Phase 9b — Deletion, with a refusal that names the room
- **Split out of Phase 9 on 2026-08-06.** Deletion is the least-precedented subsystem here —
  nothing in the editor deletes anything today — and its edge cases are where a child can
  break the app. As three bullets inside 9a they would have had no exit criteria of their own.
- `depends_on`: [9a]
- `parallel_group`: `serial-editor`
- `merge_hazards`: `src/editor/draft.ts` (9a threads the opened id through `commitDraft` in
  the same file); `src/editor/references.ts` (authored in 9a, gains its second caller here)
- **Scope in:**
  - `src/editor/draft.ts` — `deleteRecord(base, kind, id)`, refusing when `references.ts`
    reports referrers and RETURNING them so the UI can name the rooms; revalidating through
    `loadContentSet` exactly as `commitDraft` does, so a delete can never leave a document
    that will not load
  - the "마지막 방은 지울 수 없어요" guard, which has **no schema backstop** — `presets`
    carries no array minimum — and therefore lives here and needs its own test
  - `src/ui/EditorRooms.tsx`, `src/ui/EditorLibrary.tsx` — the delete controls and the
    refusal message
- **Scope out:** undo of a delete (R9's family; a delete is confirmed, not undoable this cycle)
- **Exit criterion:** `npm run verify`; unit tests cover `deleteRecord` in five cases —
  unreferenced record deletes; referenced record refuses AND returns the referring room ids;
  a record referenced only through a room's board (both `placements[].pieceId` and
  `squares[].typeId`) refuses; the sole remaining room refuses; the last piece of a room
  refuses. An **e2e** deletes a room and asserts it leaves Home's picker while the remaining
  rooms still play; an e2e attempts to delete a piece a room uses, asserts the refusal text
  contains that room's name, unticks it there, and asserts the delete then succeeds
- **Risk:** high — the failure mode is a content set that no longer loads, which takes the
  whole app down rather than one room
- **Rollback:** Phase 9a

### Phase 10 — Making a room feel makeable: preview, playtest, staged complexity, backup
- `depends_on`: [9b]
- `parallel_group`: `serial-editor`
- `merge_hazards`: `e2e/content.ts` bootstraps most specs through `editor-json` +
  `editor-import`; that control must keep working or every spec using it migrates in the
  same commit
- **Scope in:** movement / card preview (#21); playtest the open room and return to it intact
  (#20); staged complexity — advanced sections collapsed by default (#26); file download /
  upload as **whole-set backup** alongside the JSON textarea (#22); confirmation before a
  destructive import (#23)
- **Scope out:** editor undo/redo (deferred — R9); per-room export and any online transport
  (Non-Goals)
- **Note on #24.** "A named draft list replacing raw ids" is largely dissolved by 9a — the
  room list IS the named list, and the library's browse view names records. What remains is
  nothing this phase needs to build.
- **Note on #22.** File I/O here is backup and restore of the whole content set, NOT room
  sharing. Handing one room to a friend is a transfer problem that belongs with online play
  and is out of this PLAN entirely.
- **Exit criterion:** `npm run verify`; an e2e authors a piece, sees its movement preview,
  playtests the room and returns to the editor with the room intact; an e2e shows the import
  confirmation and dismisses it with no data loss; the existing `useSliceContent` bootstrap
  still passes
- **Risk:** medium
- **Rollback:** Phase 9b

## 🧪 Testing Strategy

**Unit (vitest).** Schema v4 migration both directions (present and absent for
`iconKey` and `strings`); key derivation and re-keying in `src/editor/strings.ts`;
overlay precedence in `translate`; seed provider determinism with a fixed
generator; sound event → parameter mapping and the mute toggle; token file has no
orphan references.

**Integration (@testing-library/react).** `MatchHost` lifecycle — start, play,
result, rematch, undo-clears-animation-state; coach-mark sequence and its
"seen" persistence; editor browse → detail navigation preserving an unsaved draft.

**E2E (Playwright).** Per-phase exit criteria above. Two cross-cutting runs:
one with `prefers-reduced-motion: reduce` and one offline-after-first-visit. The
`useSliceContent` bootstrap in `e2e/content.ts` must keep passing at every phase
— it is the canary for the editor import path.

**Manual.** Real phone check at Phase 5 and Phase 6: one-hand reachability, board
legibility at arm's length, and whether a child can complete a first match without
being told anything. The last one is the only test that can falsify Phase 3.

## ⚠️ Risks & Mitigation

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R1 | `translate` signature change (Phase 8) breaks call sites subtly — a missing content argument silently degrades to bundle-only lookup | high | high | Make the content parameter required at the type level for the render path; a test asserts an authored string is unreachable through the bundle-only overload |
| R2 | Move animation animates squares rather than pieces (RESEARCH pitfall) | high | medium | Phase 5 animates the applied `Action`, not a diff of board maps; explicit test that undo leaves no stale animation |
| R3 | Editor split (Phase 9) breaks the pre-existing ADR-006 coverage gate | medium | high | Gate test is the phase's exit criterion and must pass *unchanged* — no edits to the coverage test are permitted in that phase |
| R4 | Service worker serves a stale build (Phase 7) | medium | high | Explicit update-available prompt; e2e test for it; version the cache on build hash |
| R5 | Selector migration (ADR-016) silently drops e2e coverage — a spec renamed into passing vacuously | medium | high | Assert the total Playwright test count does not decrease across any phase; review each removed selector's assertion for a replacement |
| R6 | Coach marks (Phase 3) overwhelm rather than teach — the documented top onboarding failure | medium | medium | One concept at a time, skippable, and the manual child test at Phase 3's close is the acceptance signal |
| R7 | `navigator.vibrate` absent on iOS Safari | high | low | Feature-detect; the toggle reflects actual capability rather than intent |
| R8 | Scope (39+1 gaps, 10 phases) exceeds the cycle | medium | medium | ADR-015's ordering makes every phase boundary shippable; phases 8-10 can slip without leaving a broken product |
| R9 | Editor undo/redo (#24's sibling) is deferred, so a mis-edit still loses work | medium | medium | Phase 10 keeps `openDraft`'s clone semantics so a reload restores the last save; full undo is a follow-up |
| R10 | Changing a record's id in the editor currently appends a duplicate instead of renaming (`draft.ts:123-136`) — pre-existing today, and ADR-020 would additionally orphan the record's text | high | high | Phase 8 adds the rename primitive to `commitDraft` and Phase 9 wires it to the form; both carry a dedicated exit-criterion test |
| R11 | Reference resolution is transitive (room → board → `placements[].pieceId` / `squares[].typeId`), so a delete guard that walks only the four direct preset fields lets a squareType or a board-placed piece through — and `loadContentSet` then fails for the WHOLE document, not one room | medium | high | `src/editor/references.ts` is the single source for both the guard and the library badge, authored in 9a with unit tests for both transitive paths before 9b's delete calls it |
| R12 | "Never the last room" has no schema backstop — `presets` carries no array minimum the way `pieceIds` carries `.min(1)` — so nothing outside `deleteRecord` prevents a content set with zero rooms, and `Home.tsx:37` renders a `<select>` with no empty state | low | high | The guard lives in `deleteRecord` with a dedicated unit test; 9b's exit criterion names the sole-remaining-room case explicitly |

## ✅ Success Criteria

Ticked only where a phase that actually shipped covers the line. Four remain open
because Phases 6b–10 are not started; the plan is **not** complete and its
frontmatter still says so.

- [x] A first-time visitor reaches a finished match and starts a second one without instruction.
- [x] Two consecutive matches differ in rule card and draft offers; a fixed seed still reproduces a match exactly (AC-004 intact).
- [x] The seed in play is visible and copyable, so a match can be replayed or shared.
- [x] No English enum, raw preset id, or schema field name appears as user-visible copy.
- [x] Every bundled piece renders a glyph; a piece authored with no icon renders a monogram, not a blank.
- [ ] A child types a Korean name in the editor and sees that name on the board — no source edit, and the name survives export → import. *(Phase 8)*
- [ ] A room can be assembled, named in Korean, and played from Home; a library tab still reaches every record, including ones no room uses; every label is Korean an elementary reader understands. *(Phase 9a)*
- [ ] A room can be deleted, the last one cannot, and deleting a record something uses is refused by naming the room that uses it. *(Phase 9b)*
- [x] The play view passes 44×44 touch targets, has visible focus, exposes squares to a screen reader, and renders in dark mode.
- [x] The app installs and plays offline after one visit. *(Phase 7 — installability on iOS below 16.4 is a manual check; the e2e suite is Chromium-only)*
- [x] Motion is fully suppressed under `prefers-reduced-motion`; sound and haptics are toggleable and off/on per ADR-023's defaults.
- [x] `npm run verify` passes at every phase boundary, with no decrease in Playwright test count.

## 🔍 Plan Validation

### Pass 2 — room-axis re-plan of Phases 9/10 (2026-08-06): MAJOR_REVISION → resolved

Ten critiques (3 critical, 5 warning, 2 suggestion). All were resolved by revising
this document; none needed a further interview round, because each named an
objectively-wrong artifact rather than an open user decision — the same resolution
path pass 1 took.

| Severity | Finding | Resolution |
|---|---|---|
| critical | ADR-019 ("the editor is a per-kind browse view → detail") and the new ADR-026 ("rooms are the entry point") are two Accepted ADRs asserting incompatible top-level structures, with nothing marking the first superseded | ADR-019 is now **Superseded in part by ADR-026**: its browse→detail pattern governs the library tab only, and its heading says so |
| critical | The delete guard was scoped as "which rooms reference this record", which walks only the four direct preset fields. A room also depends on records **through its board** — `boardDef.placements[].pieceId` and `boardDef.squares[].typeId` — so a square type or a board-placed piece could be deleted, and `loadContentSet` would then fail for the whole document rather than produce ADR-027's room-naming refusal | `references.ts` is scoped explicitly as a **transitive** walk (room → board → pieces/square types); 9a's exit criterion unit-tests both indirect paths before 9b's delete has a caller; recorded as **R11** |
| critical | ADR-027's "never the last room" has no schema backstop — `presets` carries no array minimum the way `pieceIds` carries `.min(1)` — and no exit criterion tested the boundary | The guard is named as living in `deleteRecord`, 9b's exit criterion covers the sole-remaining-room case, and it is recorded as **R12** with `Home.tsx:37`'s missing empty state as the consequence |
| warning | Phase 9 bundled four separable bodies of work (IA restructure, the Room concept, a whole deletion subsystem, rename wiring); this project already splits on that signal | Split into **9a** (structure) and **9b** (deletion). Deletion is the least-precedented subsystem and now carries five named unit cases of its own |
| warning | The Affected Components table still named `EditorBrowse` + `EditorDetail` | Updated to `EditorRooms` + `RoomDetail` + `EditorLibrary` |
| warning | The Phase 9 Success Criteria line described the old single-library IA, so ticking it would not verify what 9a builds | Rewritten against ADR-026, and a second line added for 9b's deletion contract |
| warning | Non-Goals did not carry ADR-025's shared-library trade-off, though that section exists to consolidate exclusions | Added, alongside an explicit line that handing one room to a friend is out of scope |
| warning | Phase 7's `depends_on: [6]` is a dangling reference — Phase 6 was split into 6a/6a+/6b and no longer exists as a node, and it sits directly upstream of the phases under review | Corrected to `[6b]`, with the reason stated inline |
| suggestion | The stated reason for `depends_on: [8]` mentioned only room naming, but "+ 새 기물" inside a room needs the same overlay | Widened: any typed Korean name in the editor, room or record |
| suggestion | "Korean copy for an elementary reader" has no measurable exit criterion | Left as-is deliberately. A reading-level rubric routed through `judgment-reviewer` is worth doing, but as an advisory gate rather than a blocking exit criterion, and inventing one here would put an unmeasured claim in a phase boundary — which is the failure this document has already recorded twice |

Verification after the revision: frontmatter `adrs: 13` matches 13 ADR headings; the
interview transcript carries 13 rows; every phase — including the retrospective 6a+ —
carries `depends_on`, `parallel_group`, `merge_hazards`, an exit criterion, a risk and a
rollback point.

**Pass 1 — `plan-validator`: MAJOR_REVISION** (3 critical, 3 warning, 1 nit).
All seven were resolved by revising this document; none required a further
interview round, because each named an objectively-wrong artifact rather than an
open user decision.

| Severity | Finding | Resolution |
|---|---|---|
| critical | This PLAN's ADR-001…ADR-010 collide with ADR numbers already burned into the codebase — `schema.ts` cites ADR-001/002/003/005/010/012, `Edit.tsx` cites ADR-006, `Play.tsx` cites ADR-011. A bare "ADR-006" would mean two unrelated decisions in the same files | Renumbered this PLAN's ADRs. The four references to the *pre-existing* ADR-006 vocabulary-coverage gate are now written as "the pre-existing ADR-006 …" so neither reading is ambiguous. **The first renumber (013…022) was still wrong** — it was checked only against the three files pass 1 named, and `match.ts:8` (ADR-013) plus `rng.ts:2` / `agent.ts:18` (ADR-014) already own those numbers. A full-tree grep shows ADR-001…ADR-014 are all taken, so this PLAN's block is **ADR-015…ADR-024** |
| critical | `depends_on` contradicted the rollback anchors (Phase 6 depended on [2,4] but rolled back to 5; Phase 8 depended on [4] but rolled back to 7), and the `serial-editor` track would have changed `translate()`'s signature at the same call sites `serial-board` was rewriting in `Board.tsx`, with no merge hazard recorded | Graph reconciled to `1 → 2 → {3 ∥ 4} → 5 → 6 → 7 → 8 → 9 → 10` and stated explicitly under **Execution order**. Phase 6 → `depends_on: [5]`; Phase 8 → `depends_on: [7]` with the call-site collision named in its `merge_hazards`. Phase 4 → `depends_on: [2]` (a further error the critique exposed: `Board.tsx` does not exist until Phase 2 splits `Play.tsx`) |
| critical | Phase 8's exit criterion "renaming a record id moves its strings with it" presumes a rename primitive that does not exist — `commitDraft` matches only on the draft's own id (`draft.ts:123-136`), so an id change **appends a duplicate** rather than renaming, and no phase scoped the fix | Rename primitive added to Phase 8's scope (`commitDraft` takes the opened id) with its own unit-test exit criterion; the UI threading added to Phase 9's scope with an e2e criterion; the pre-existing duplicate-on-rename defect recorded as **R10** |
| warning | ADR-024's "the seed is surfaced in the UI so a match can be reproduced" had no exit criterion, so it could be satisfied by an invisible prop | Phase 2's exit criterion now asserts a visible, copyable `data-testid="match-seed"`; a matching line added to Success Criteria |
| warning | No consolidated Non-Goals — exclusions were scattered across ten `Scope out` bullets, and the SPEC's own exclusions were never restated | **🚫 Non-Goals** section added, covering both this plan's deferrals and the carried-over SPEC exclusions |
| warning | Phase 8's exit criterion said "round-trips an **authored** piece" while Phase 8 explicitly excludes the editor UI that would do the authoring — easy to conflate with Phase 9's UI-driven claim | Reworded: the test builds the `ContentSource` **programmatically**, and the phase states that no editor UI is involved |
| nit | ADR-024 said "`Play`'s props change" although Phase 2 splits `Play` into `MatchHost` in the same phase | Reworded to `MatchHost`, with the split named inline |

**Pass 2 — `plan-validator`: MAJOR_REVISION (1 critical).** Six of the seven pass-1
findings were confirmed genuinely resolved (phase graph, rename primitive + R10,
seed-visibility criterion, Non-Goals, Phase 8 wording, ADR-024 wording). The
remaining critical was that the renumber itself was incomplete — resolved above by
grepping the whole tree rather than the three files pass 1 happened to name, and
shifting this PLAN's block to **ADR-015…ADR-024**.

**Outcome: MAJOR_REVISION_RESOLVED.** No finding remains open. The lesson is
recorded for wrapup: *verify a fix against the whole artifact set, not against the
files the critique cited* — a scoped fix to a scope-shaped defect reproduces the
defect.
