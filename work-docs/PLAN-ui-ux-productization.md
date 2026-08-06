---
type: plan
task_slug: ui-ux-productization
status: planning
created: 2026-08-06
tags: [strange-chess, plan, react, ui-ux, mobile-web, pwa, content-editor]
research_doc: "[[RESEARCH-ui-ux-productization]]"
interview_rounds: 3
adrs: 10
validator_outcome: MAJOR_REVISION_RESOLVED
summary: "Close the match loop, then art+juice, then a kid-usable editor — 40 gaps in 10 phases"
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

### ADR-019: Editor is restructured as list → detail with collapsible sections and elementary-level Korean copy
**Status:** Accepted (2026-08-06, via /hm:plan interview)
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
- Network play, accounts, servers.

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
- `depends_on`: [4]
- `parallel_group`: `serial-board`
- `merge_hazards`: `src/ui/Board.tsx`; `src/ui/styles.css` motion rules
- **Scope in:** move/capture animation driven by the last `Action` held in host
  state (no engine change — the engine has no piece-instance identity, so the UI
  animates the action it just applied and clears it on undo), last-move highlight
  (#11), drag-and-drop alongside tap (#12), `src/ui/sound.ts` per ADR-023,
  sound/haptics toggle, `prefers-reduced-motion` (#30)
- **Scope out:** particles, screen shake
- **Exit criterion:** e2e passes with animation enabled and with reduced-motion
  forced; a unit test asserts every sound event maps to synthesis parameters and
  that the toggle silences all of them; undo after a move leaves no stale
  animation state
- **Risk:** high — the positional-piece-identity trap in RESEARCH §Pitfalls
- **Rollback:** Phase 4

### Phase 6 — Layout, accessibility, and interaction hygiene
- `depends_on`: [5]
- `parallel_group`: `serial-board`
- `merge_hazards`: `src/ui/styles.css`; `src/ui/Board.tsx` ARIA attributes
- **Scope in:** touch targets to 44px (#27), `:focus-visible` (#28), board
  semantics — `role="grid"`, `aria-label`, `aria-pressed`, legal-move state
  exposed non-visually (#29), safe-area insets (#32), tablet/landscape breakpoints
  (#33), rejection as a non-shifting toast (#15), card-shaped collapsible trays
  (#16), designed error/empty states (#18), board flip toggle per ADR-018 (#13)
- **Scope out:** an a11y audit of the editor (Phase 9 owns that)
- **Exit criterion:** an automated check asserts every interactive element in the
  play view is ≥44×44 CSS px; e2e asserts a screen-reader-visible label for every
  square and that an illegal tap causes no layout shift (bounding box of the
  board unchanged before/after)
- **Risk:** medium
- **Rollback:** Phase 5

### Phase 7 — PWA: manifest, icons, offline
- `depends_on`: [6]
- `parallel_group`: `serial-platform`
- `merge_hazards`: `vite.config.ts`, `index.html`, new `public/`
- **Scope in:** `public/manifest.webmanifest`, icon set generated from the ADR-021
  identity, service worker precaching the build, an explicit update prompt when a
  new build is available
- **Scope out:** Capacitor, push, background sync
- **Exit criterion:** e2e — the app loads with the network offline after one
  visit; Lighthouse-installability criteria met (manifest, icons, SW, HTTPS-ready);
  a stale-cache test asserts the update prompt appears when the SW sees a new build
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

### Phase 9 — Editor IA: browse → detail, collapsible sections, elementary Korean copy, editor styling
- `depends_on`: [8]
- `parallel_group`: `serial-editor`
- `merge_hazards`: `src/ui/Edit.tsx` is split into new files; every `editor.spec.ts` selector moves (ADR-016)
- **Scope in:** `src/ui/EditorBrowse.tsx` + `EditorDetail.tsx` (new, split from
  `Edit.tsx`), section grouping over the existing `controls.ts` table, `editor.*`
  Korean copy written for an elementary reader, editor CSS (#37, the entire
  screen is currently unstyled), name/description fields taking plain text per
  ADR-020, the opened-record id threaded from `EditorBrowse` through
  `EditorDetail` into `commitDraft` so the Phase 8 rename primitive is actually
  reachable from the UI, raw draft-JSON `<pre>` removed (#19), field-anchored
  validation (#25)
- **Scope out:** playtest, previews, file import/export (Phase 10)
- **Exit criterion:** the pre-existing ADR-006 vocabulary-coverage test still passes unchanged
  (proving controls were re-grouped, not re-authored); e2e authors a piece by
  typing only Korean text and finds it on the board; an assertion proves no schema
  field name (`nameKey`, `textKey`, `iconKey`, `kind`) appears as visible UI copy;
  an e2e renames an existing record's id through the form and asserts the list
  still shows one record with its text intact
- **Risk:** high — largest single-file restructure in the plan
- **Rollback:** Phase 8

### Phase 10 — Editor creation UX: preview, playtest, named drafts, file I/O
- `depends_on`: [9]
- `parallel_group`: `serial-editor`
- `merge_hazards`: `e2e/content.ts` depends on `editor-json` + `editor-import` as the content bootstrap for most specs — that control must keep working or every spec that uses it must migrate in the same commit
- **Scope in:** movement/card preview (#21), playtest-from-editor returning to the
  editor (#20), named draft list replacing raw ids (#24), file download/upload and
  share alongside the existing JSON textarea (#22), confirmation before a
  destructive import (#23), staged complexity — advanced sections collapsed by
  default (#26)
- **Scope out:** editor undo/redo (deferred; see Risks)
- **Exit criterion:** e2e — author a piece, preview it, playtest it, return to the
  editor with the draft intact; the existing `useSliceContent` bootstrap still
  passes; an import shows a confirmation and can be dismissed without data loss
- **Risk:** medium
- **Rollback:** Phase 9

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

## ✅ Success Criteria

- [ ] A first-time visitor reaches a finished match and starts a second one without instruction.
- [ ] Two consecutive matches differ in rule card and draft offers; a fixed seed still reproduces a match exactly (AC-004 intact).
- [ ] The seed in play is visible and copyable, so a match can be replayed or shared.
- [ ] No English enum, raw preset id, or schema field name appears as user-visible copy.
- [ ] Every bundled piece renders a glyph; a piece authored with no icon renders a monogram, not a blank.
- [ ] A child types a Korean name in the editor and sees that name on the board — no source edit, and the name survives export → import.
- [ ] The editor opens on a browsable list, not a 40-button row, and every label is Korean an elementary reader understands.
- [ ] The play view passes 44×44 touch targets, has visible focus, exposes squares to a screen reader, and renders in dark mode.
- [ ] The app installs and plays offline after one visit.
- [ ] Motion is fully suppressed under `prefers-reduced-motion`; sound and haptics are toggleable and off/on per ADR-023's defaults.
- [ ] `npm run verify` passes at every phase boundary, with no decrease in Playwright test count.

## 🔍 Plan Validation

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
