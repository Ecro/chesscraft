---
type: research
task_slug: ui-ux-productization
status: complete
created: 2026-08-06
tags: [strange-chess, research, react, ui-ux, mobile-web, game-feel, accessibility]
mtime_warn_days: 7
libs_fetched: []
sources:
  - https://learn.hypehype.com/game-design/game-onboarding-and-first-time-user-experience
  - https://adriancrook.com/best-practices-for-mobile-game-onboarding/
  - https://uxdesign.cc/games-ux-building-the-right-onboarding-experience-a6e99cf4aaea
  - https://www.designstudiouiux.com/blog/mobile-app-onboarding-best-practices/
  - https://chesschest.com/creative-ui-ux-design-in-chess-applications/
  - https://www.chess.com/forum/view/site-feedback/piece-selection-and-legal-move-highlight-behavior-in-the-app
  - https://en.wikipedia.org/wiki/Hotseat_(multiplayer_mode)
  - https://create.roblox.com/docs/production/game-design/onboarding
  - https://ieee-cog.org/2022/assets/papers/paper_174.pdf
  - https://room8group.com/news/user-generated-content-what-it-means-when-players-become-creators/
  - https://www.w3.org/WAI/GL/wiki/WCAG_2.1/targets
  - https://blog.logrocket.com/ux-design/all-accessible-touch-target-sizes/
  - https://www.designthegame.com/learning/tutorial/how-tactile-interactions-game-juice-drive-player-engagement
  - https://valdemird.com/blog/game-feel-on-the-web/
related_docs:
  - "[[SPEC-variant-chess-6x6-cards]]"
  - "[[PLAN-variant-chess-6x6-cards]]"
  - "[[RESEARCH-variant-chess-6x6-cards]]"
  - "[[PLAN-ui-ux-productization]]"
summary: "Fix the match lifecycle + FTUE first (P0), then a token/juice layer; defer a canvas board rebuild"
---

# RESEARCH — What it takes for this UI to read as a product

> **Restored 2026-08-06.** The first copy of this file was written against
> `cd4a3dc` and was destroyed when a peer session finalized its worktree (an
> untracked file in the main tree). This copy is re-verified against `01e9e7b`
> and folds in the four gaps found after that merge (#37–#40).

## 🎯 Recommended Direction

**TL;DR — Do not start with visual polish. Start with the match lifecycle and the
first-time user experience (P0), then layer a design-token + game-feel pass on
the existing DOM board (P1), and defer any canvas/SVG board rewrite (P2).**

The current UI is a correct *test harness*, not a product: nearly every screen
element exists to be asserted by an `e2e` selector. The binding gap is not that it
looks plain — it is that a first-time player cannot **start, restart, or
understand** a match, and that every match is identical because `seed` is never
passed (`src/ui/App.tsx:75` renders `<Play>` without `seed`, so `Play`'s default
`seed = 1` at `src/ui/Play.tsx:18` applies forever). The product's stated value —
"freshness across sessions" (SPEC 🎯 Intent) — is unreachable through the UI
regardless of how good the pixels get. Cosmetic work applied before that would
polish a loop that does not close.

The main impact of this work is **user-facing workflow value** (a stranger can
play and re-play unaided), not internal maintainer value.

## 🔍 Refinement Decisions

`--deep` was not set; Phase 0 interview skipped.

**Discovery lens:** (1) User-workflow / product opportunity — primary, since the
topic is "what makes this marketable"; (2) Technical architecture — secondary, to
bound each gap against the existing `legalActions`-derived render contract.
Risk/compliance lens deliberately excluded: the app is offline, has no account, no
network and no PII (SPEC Outcome 1).

**Baseline:** re-verified against `01e9e7b` ("verification harness, AC-010 wiring,
and the defect it found"). What that merge changed for this research:

| Earlier claim | Status on `01e9e7b` |
|---|---|
| #2 seed hard-wired | **Still true** — `App.tsx:75` omits `seed` |
| App loads the Phase 3 slice | **Superseded** — now `bundledContentSource`, 40 entries (11 rule cards, 15 skill cards, 5 square types) |
| e2e specs pin the slice directly | **Superseded** — `e2e/content.ts` bootstraps the slice *through the editor's real import control* (`editor-json` + `editor-import`), so that control is load-bearing |
| — | **New** — `npm run verify` = typecheck + build + 238 unit + 28 Playwright |

## 📊 Local capability × User touchpoint

What the engine can already do, versus what the user can actually reach today.

| Engine/content capability (exists) | User touchpoint today | Gap |
|---|---|---|
| Deterministic per-seed rule card + draft offers (AC-004) | none — seed hard-wired to 1 | Every match identical; no "new match" control anywhere |
| `legalActions` full legal-move set | green outline on reachable squares | No drag, no last-move marker, no capture preview |
| `describeRejection` human-readable refusal (AC-008) | red `<p>` inserted into flow | No toast, no anchor to the offending square, causes layout shift |
| Rule/skill card `nameKey` + `textKey` in `ko` | rendered in play view | Not used by the preset picker — `App.tsx:67` prints raw preset **ids** |
| Square-type legend with ability text (AC-018) | `<ul>` under the board | Legend not linked to the squares it explains |
| Undo (`match.undo`) | `되돌리기` button | No redo, no move list, no "undo whose move?" affordance |
| Five-axis content editor | `edit` tab | No playtest, no preview, raw JSON `<pre>` at `Edit.tsx:1093` |
| Export/import JSON (SPEC Outcome 5) | `<textarea>` + two buttons | No file download/upload, no share link, no import confirmation |
| i18n key indirection for all content | `translate()` in play view | UI chrome hardcoded; **and authored content cannot carry text at all** (#40) |

## 🕳️ Complete gap inventory vs. commercial baseline

Grouped by severity. Every row cites the file it was read from. Severity is
**inference** from the sources in §📚; the code facts are verified.

### P0 — the product loop does not close

| # | Gap | Evidence | Commercial baseline |
|---|---|---|---|
| 1 | **No "new match" / "restart" / "rematch" control.** A finished match is a dead screen; only a page reload restarts. | `Play.tsx:114-118` renders the result and stops; `App.tsx` has no restart path | Every board-game app ends a match on a rematch/home CTA |
| 2 | **Seed never varies** — same rule card + same draft offers, every match, forever. | `App.tsx:75` omits `seed`; `Play.tsx:18` defaults `seed = 1` | Randomised setup is the product's own freshness mechanism (SPEC Intent) |
| 3 | **No onboarding / FTUE at all.** No rules screen, no "how to play", no first-move coaching, no card gallery. | no such component in `src/ui/` | New players decide within minutes; progressive in-context teaching is the norm ([HypeHype], [Adrian Crook]) |
| 4 | **No home / title screen.** Boots straight into a live board under `<h1>Strange Chess</h1>` and two lowercase `play`/`edit` buttons. | `App.tsx:50-59` | Title → mode select → match |
| 5 | **Result text leaks engine internals** — prints the raw `reason` string. | `Play.tsx:116` | Results are authored copy, not enum ids |
| 6 | **Phase and side render as raw English enums** (`play`, `draft`, `white`, `black`) in a Korean product for 초·중학생. | `Play.tsx:99-100`, `190-191` | Localised, human labels |
| 40 | **Authored content cannot carry display text.** The editor accepts only a *key*; nothing in `src/editor/` writes a locale string; `translate()` falls back to the key — so a piece a child authors renders on the board as `my.piece.name`. | `Edit.tsx:692-693`; `src/ui/i18n.ts:26`; no locale writer in `src/editor/` | A creator names their creation and sees the name |

### P1 — reads as unfinished software

| # | Gap | Evidence | Commercial baseline |
|---|---|---|---|
| 7 | **Pieces are Korean word labels at 12px, not icons.** | `Play.tsx:168`, `styles.css:127-131` | Scalable vector piece glyphs ([chesschest]) |
| 8 | **Coordinates printed inside every square**, permanently, competing with the piece. | `Play.tsx:167`, `styles.css:121-125` | Coordinates on the board edge, or optional |
| 9 | **Zero animation or transition in the entire stylesheet.** | `styles.css` has no `transition`/`animation`/`@keyframes` | Move animation is table stakes; juice is what reads as polish ([designthegame], [valdemird]) |
| 10 | **No sound, no haptics.** | no audio/vibration call in `src/` | Multi-sensory feedback is the standard polish layer |
| 11 | **No last-move highlight, no threat indication, no capture history.** | `Play.tsx` renders only `data-legal` / `data-selected` | Last-move highlight is universal |
| 12 | **Tap-only — no drag-and-drop, no drag preview.** | `Play.tsx:165` `onClick` only | Both tap and drag expected ([chess.com forum]) |
| 13 | **Board never flips for black**; black plays upside-down all match. | `Play.tsx:91` fixed rank order | Pass-and-play rotates or offers a flip toggle ([Hotseat]) |
| 14 | **No turn-handoff moment.** | `Play.tsx` phase derivation only | Hotseat designs insert an explicit handoff |
| 15 | **Rejection message is an inline `<p>` above the board** — layout shifts on every illegal tap. | `Play.tsx:141-145` | Non-shifting toast or square-anchored feedback |
| 16 | **Skill-card trays are stacked full-width text blocks**, both hands always expanded. Worse now: the bundled set has 15 skill cards. | `Play.tsx:189-215`, `styles.css:167-179` | Card-shaped, tappable, collapsible hand |
| 17 | **Preset picker shows raw ids** though `preset.nameKey` exists and is translated. | `App.tsx:67` vs `i18n.ts:53` | Localised names |
| 18 | **No empty / loading / error design.** Content failure prints English `content failed to load`. | `App.tsx:58` | Designed error state with a recovery action |

### P1 — the editor is a debug console, not a creation tool

| # | Gap | Evidence | Commercial baseline |
|---|---|---|---|
| 19 | **Raw draft JSON dumped on screen** in a `<pre>`. | `Edit.tsx:1093` | Debug output is not shipped |
| 20 | **No playtest-from-editor.** | `Edit.tsx` `save` → `onCommit`; no play hook | "Create → immediately play" is the UGC retention moment ([Roblox], [IEEE-CoG]) |
| 21 | **No preview of the thing being authored.** | `Edit.tsx` | Creator tools show the artifact as it will appear |
| 22 | **Export/import is a `<textarea>` of JSON.** Note: this control is now load-bearing for e2e (`e2e/content.ts`), so it can be supplemented but not removed. | `Edit.tsx:1084-1090` | File- or link-based sharing |
| 23 | **Import replaces everything with no confirmation and no undo.** | `Edit.tsx:1087` | Destructive actions confirm |
| 24 | **No editor undo/redo, no named draft list** — entries listed by id. | `Edit.tsx:685` | Named, browsable creations |
| 25 | **Validation errors are a bare `<ul>` at the bottom**, unlinked to the offending field. | `Edit.tsx:1073` | Inline, field-anchored validation |
| 26 | **Tool complexity is not staged** — the full five-axis vocabulary at once, for a 초·중학생 author. | `Edit.tsx` single flat form | Player-facing editors coarsen the primitives ([Room 8]) |
| 37 | **The editor screen has no CSS at all.** `styles.css` contains no rule for `.editor`, `fieldset`, `.vector-grid`, `.board-row`, `.board-cell` — it renders as browser-default fieldsets. | `src/ui/styles.css` (218 lines, play view only) | Every screen is styled |
| 38 | **The editor is one flat column**, and the `open` fieldset emits one raw-id button per record — 40 on the bundled set. | `Edit.tsx:667`, `679-689` | List → detail with search |
| 39 | **Editor labels are schema field names in English** (`kind`, `open`, `id`, `nameKey`, `textKey`). | `Edit.tsx:668-693` | UI copy written for the user, not the schema |

### P2 — accessibility and platform hygiene

| # | Gap | Evidence | Commercial baseline |
|---|---|---|---|
| 27 | **Chrome buttons below the recommended touch size** — `padding: 6px 10px` at 14px ≈ 30px. Passes WCAG 2.5.8 AA (24px), fails HIG 44pt / WCAG 2.5.5 AAA. Board squares (~74px) are fine. | `styles.css:40-47`, `22-27` | 44–48px ([W3C], [LogRocket]) |
| 28 | **No `:focus-visible` styling anywhere.** | `styles.css` | Visible focus ring |
| 29 | **Board squares are bare `<button>`s** with a `title`; no `aria-label`, `role="grid"`, `aria-pressed`; `data-legal` invisible to a screen reader. | `Play.tsx:154-169` | Semantics for assistive tech |
| 30 | **No `prefers-reduced-motion` handling.** | `styles.css` | Required once motion exists |
| 31 | **No dark mode**, one hardcoded light palette, no design tokens. | `styles.css:13-20` | Theme-aware surfaces |
| 32 | **`viewport-fit=cover` set but no `env(safe-area-inset-*)` padding.** | `index.html:5` vs `styles.css:22-27` | Safe-area respected |
| 33 | **Fixed `max-width: 480px`** — no tablet or landscape layout. | `styles.css:23` | Responsive breakpoints |
| 34 | **Not installable / not offline-capable** — no manifest, icons, or service worker, despite being a fully local game. | no `manifest.webmanifest`, no SW | PWA install + offline |
| 35 | **No visual identity** — `system-ui`, no logo, no colour system, no type scale. | `styles.css:14-15`, `29-32` | Distinct brand surface |
| 36 | **UI chrome strings hardcoded in TSX** (`되돌리기`, `승리`, `규칙 없음`, `아직 없음`) while content goes through `translate()`. | `Play.tsx:103,110,116,122,192` | One localisation path for all user-visible text |

## 🛠️ Approaches Found

### Approach A — Lifecycle & FTUE first (recommended)

| Field | Content |
|---|---|
| Approach | Close the loop: home screen, new-match with a varying seed, rematch, localised chrome, in-context tutorial, rules/card reference. Gaps #1–#6, #17, #36. |
| Assumption | The deficit is entirely presentation-layer. Verified: `Play` derives everything from `legalActions` + content + i18n and names no piece or card (`Play.tsx:9-17`). |
| Evidence | New players decide within minutes and onboarding is where they are lost ([HypeHype], [Adrian Crook]); teach in-context, not in an isolated screen ([UX Collective]). Seed defect verified in code. |
| Trade-off | Ships nothing visually impressive; the app becomes usable by a stranger. |
| Compatibility | High. No engine change; `createMatch` already takes `seed` and `presetId`. |
| Risk | low |

### Approach B — Design-token + game-feel layer on the existing DOM board

| Field | Content |
|---|---|
| Approach | CSS custom-property tokens, dark mode, focus rings, safe-area, SVG piece glyphs, move/capture animation, tap feedback, sound. Gaps #7–#12, #15, #16, #27–#33, #35. |
| Assumption | A 6×6 grid of DOM buttons can carry animation without jank. Plausible (36 nodes, transform-only), unverified on a low-end Android. |
| Evidence | Juice is why players perceive quality ([designthegame], [valdemird]); SVG pieces + move animation are the chess-app baseline ([chesschest]). |
| Trade-off | Real design work (piece art, palette, motion spec) — the largest cost, and the part not derivable from the codebase. |
| Compatibility | High for tokens; medium for animation — piece identity is positional (`state.board.get(sq)`), so a tween needs the applied action, not a board diff. |
| Risk | medium |

### Approach C — Canvas/SVG board rendering layer

| Field | Content |
|---|---|
| Approach | Replace the DOM grid with a canvas or SVG scene graph. |
| Assumption | DOM will not be enough — unsupported; the board is 36 cells, not 361. |
| Evidence | None found arguing DOM is insufficient at this size. |
| Trade-off | Breaks the `data-testid="sq-*"` e2e contract and the accessibility story at once. |
| Compatibility | Low. |
| Risk | high |

### Approach D — Creator-experience productization (editor)

| Field | Content |
|---|---|
| Approach | Turn `Edit.tsx` into a creation tool: playtest, previews, named drafts, staged complexity, styling, and a text-authoring path for #40. Gaps #19–#26, #37–#40. |
| Assumption | The "content platform / 변형 체스계의 마인크래프트" thesis (SPEC Intent) is the differentiator. |
| Evidence | Editor access measurably lifts retention (one reported case: D1 35%→45%); player-facing tools must coarsen the primitives ([Room 8], [IEEE-CoG], [Roblox]). |
| Trade-off | Serves the author before the player — worthless if a player cannot finish a first match. |
| Compatibility | High for IA; **#40 needs a schema change** — there is no path today for authored text to reach the screen. |
| Risk | medium |

**Sequencing inference:** A → B → D, with C rejected unless profiling on a real
low-end device says otherwise. This is what `PLAN-ui-ux-productization` locked in.

## ⚠️ Pitfalls

- **Explaining everything up front.** Teams commonly walk new players through
  multiple systems at once and lose them ([HypeHype], [Adrian Crook]). This
  product has *four* content layers — the temptation is acute.
- **Polishing before the loop closes.** Gaps #1 and #2 mean a beautiful build
  would still be one repeating match with no restart.
- **Breaking the render contract.** `Play` names no content type by design
  (`Play.tsx:9-17`, ADR-011). A "prettier" version that switches on `pieceId` to
  pick an icon re-introduces the coupling ADR-011 removed — piece art must be
  *content*, not a UI lookup table.
- **Breaking the e2e selector contract.** Every `data-testid` in `Play.tsx` and
  `Edit.tsx` is asserted by `e2e/*.spec.ts`; `e2e/content.ts` additionally uses
  `editor-json` + `editor-import` as the content bootstrap for most specs.
- **Animating positionally-keyed pieces.** Pieces are looked up by square, so a
  naive tween animates *squares* — the symptom is a piece that fades rather than
  slides.
- **Adopting 24×24 as the touch-target goal.** WCAG 2.5.8 AA's 24px is a legal
  floor; 44–48px is the usability standard ([W3C], [LogRocket]) — and the audience
  is children.
- **Shipping motion without `prefers-reduced-motion`** — a regression the moment
  gap #9 is fixed.
- **Treating #40 as a labelling problem.** Translating editor labels does not let
  a child name their own piece; that needs a place for authored strings to live.

## ❓ Open Questions

All eight were resolved in the `/hm:plan` interview — see
`PLAN-ui-ux-productization` §🎙️ Interview Transcript. Recorded here for the trail:

1. Scope for this cycle → **A+B+D, all 40 gaps**.
2. Piece representation → **schema `iconKey`**.
3. Board flip / handoff → **shared board + manual flip toggle; AC-017 unchanged**.
4. Sound → **in scope, 4–6 effects, plus haptics**.
5. PWA / installability → **PWA first; Capacitor later**.
6. Visual identity → **defined this cycle as a CSS token set**.
7. Target device floor → **not asked** (Approach C rejected, so it stopped being
   decision-relevant); transform-only animation is the standing constraint.
8. Test-contract policy → **`data-testid` may be migrated in the same commit**.

## 📚 Sources

- [Game Onboarding and First Time User Experience — HypeHype Learning Hub](https://learn.hypehype.com/game-design/game-onboarding-and-first-time-user-experience)
- [Best Practices For Mobile Game Onboarding — Adrian Crook & Associates](https://adriancrook.com/best-practices-for-mobile-game-onboarding/)
- [Games UX: Building the right onboarding experience — UX Collective](https://uxdesign.cc/games-ux-building-the-right-onboarding-experience-a6e99cf4aaea)
- [Mobile App Onboarding: 11 Best Practices & Examples (2026) — Design Studio](https://www.designstudiouiux.com/blog/mobile-app-onboarding-best-practices/)
- [Creative UI/UX Design in Chess Applications — ChessChest](https://chesschest.com/creative-ui-ux-design-in-chess-applications/)
- [Piece selection and legal move highlight behavior — Chess.com forum](https://www.chess.com/forum/view/site-feedback/piece-selection-and-legal-move-highlight-behavior-in-the-app)
- [Hotseat (multiplayer mode) — Wikipedia](https://en.wikipedia.org/wiki/Hotseat_(multiplayer_mode))
- [Onboarding — Roblox Creator Hub](https://create.roblox.com/docs/production/game-design/onboarding)
- [User-Generated Content and Editors in Video Games: Survey and Vision — IEEE CoG 2022](https://ieee-cog.org/2022/assets/papers/paper_174.pdf)
- [User-generated content: What it means when players become creators — Room 8 Group](https://room8group.com/news/user-generated-content-what-it-means-when-players-become-creators/)
- [WCAG 2.1/2.2 target size — W3C WAI wiki](https://www.w3.org/WAI/GL/wiki/WCAG_2.1/targets)
- [All accessible touch target sizes — LogRocket](https://blog.logrocket.com/ux-design/all-accessible-touch-target-sizes/)
- [How Tactile Interactions (Game Juice) Drive Player Engagement — Design The Game](https://www.designthegame.com/learning/tutorial/how-tactile-interactions-game-juice-drive-player-engagement)
- [Game feel on the web: squash, shake, and the art of juice](https://valdemird.com/blog/game-feel-on-the-web/)

## 🔗 Related Internal Docs

- [[PLAN-ui-ux-productization]] — the plan this research feeds.
- [[SPEC-variant-chess-6x6-cards]] — AC-004 (seed determinism), AC-008 (rejection
  text), AC-016 (i18n keys), AC-017 (both trays visible), AC-018 (square legend).
- [[PLAN-variant-chess-6x6-cards]] — ADR-011 (UI names no content), ADR-006
  (editor vocabulary coverage gate).
- [[RESEARCH-variant-chess-6x6-cards]] — original engine/content research.
- [[CARDSET-variant-chess-6x6-cards]] — the bundled card set the UI renders.
- Memory: `[wiki:architecture] declarative-content-engine`,
  `[wiki:architecture] table-driven-content-editor`.
