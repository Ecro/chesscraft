---
type: research
task_slug: mobile-grade-graphics
status: complete
created: 2026-08-06
tags: [chess-craft, research, architecture, renderer, distribution, game-art, mobile-web, pwa]
mtime_warn_days: 7
libs_fetched: []
sources:
  - https://github.com/lichess-org/chessground
  - https://github.com/lichess-org/lichobile
  - https://lichess.org/@/lichess/blog/mobile-app-official-release/wiwu6goO
  - https://github.com/lichess-org/mobile
  - https://www.mobiloud.com/blog/app-store-review-guidelines-webview-wrapper
  - https://www.magicbell.com/blog/pwa-ios-limitations-safari-support-complete-guide
  - https://www.mobiloud.com/blog/progressive-web-apps-ios
  - https://code2native.com/blog/fix-app-store-rejection-42-webview
  - https://capgo.app/blog/ultimate-guide-to-animation-performance-in-capacitor-apps/
  - https://kanopylabs.com/blog/capacitor-vs-react-native-vs-flutter
  - https://lichess.org/forum/general-chess-discussion/are-the-lichess-piece-sets-free-to-use-in-other-software
  - https://codeberg.org/FelixKling/chess_pieces
  - https://www.joshwcomeau.com/animation/linear-timing-function/
  - https://chr15m.github.io/juice-it/
  - https://tympanus.net/codrops/2019/02/19/svg-filter-effects-creating-texture-with-feturbulence/
  - https://github.com/orioncactus/pretendard
  - https://noonnu.cc/en/font_page/366
related_docs:
  - "[[PLAN-ui-ux-productization]]"
  - "[[RESEARCH-ui-ux-productization]]"
  - "[[REVIEW-ui-ux-productization-phase8-2026-08-06]]"
summary: "Keep DOM/CSS — it is not the quality ceiling; the ceiling is emoji art. Container is a separate, later decision."
---

# RESEARCH — Is HTML the right path to a commercial-quality game on web *and* app?

## 🎯 Recommended Direction

**Yes — keep HTML/DOM/CSS. It is not what is limiting the graphics.** Change the
art, not the renderer. Treat "does it ship to the iOS App Store" as a *separate,
later* decision that this cycle should not pay for in advance.

Three findings drive that, in order of weight:

1. **The reference implementation of this exact genre is DOM.** Lichess's board
   UI, [chessground](https://github.com/lichess-org/chessground), renders board
   and pieces as **DOM elements styled with CSS**, uses SVG only for annotation
   overlays, and ships in 10K gzipped with a custom DOM-diff to minimise writes.
   The largest open chess platform in the world did not need canvas to draw a
   board. Neither does a 6×6 board with ≤36 static nodes.

2. **What actually looks cheap today is measurable and has nothing to do with
   the renderer.** 31 of this app's 37 content icons are **OS emoji**
   (`src/i18n/ko.ts:47-141`); the other 6 are system-font Unicode chess
   characters (`ko.ts:17-29`), with 궁수 borrowing the bishop's `♝`. Emoji are
   drawn by the platform's colour font, so the art direction is decided by the
   player's phone — Apple's glossy 3D on iOS, Noto flat on Android. That single
   fact is why the board reads as a web page, and switching to WebGL would
   render the same emoji faster.

3. **The container question is real but it is a distribution question, not a
   graphics one — and it is genuinely undecided.** Google Play accepts PWAs via
   TWA; **Apple does not** — Guideline 4.2.2 blocks "web clippings," and
   Apple has no TWA equivalent
   ([mobiloud](https://www.mobiloud.com/blog/progressive-web-apps-ios),
   [magicbell](https://www.magicbell.com/blog/pwa-ios-limitations-safari-support-complete-guide)).
   So "웹/앱 모두" is already ~90% reachable today; the hole is exactly one
   store. Whether that hole matters depends on monetisation and reach goals
   nobody has stated yet.

**The honest caveat, and it cuts against the recommendation:** the strongest
available precedent for the *wrapper* half of this path is a failure. Lichess's
previous mobile app (`lichobile`) was **TypeScript + Mithril + Ionic Capacitor**
— precisely the stack ADR-022 has queued for this project — and they
**abandoned and rewrote it in Flutter**, citing near-native performance,
smoothness and responsiveness ([release blog](https://lichess.org/@/lichess/blog/mobile-app-official-release/wiwu6goO));
the old repo was archived in February 2026 ([lichobile](https://github.com/lichess-org/lichobile)).
Read the two halves together and the lesson is specific, not general: **DOM is
fine as a renderer; a WebView is a weak app *container*.** Those are separable
decisions, and this cycle only needs the first one.

Main impact of the recommended work is **user-facing** — it changes the first
three seconds of every session.

## 🔍 Refinement Decisions

`--deep` was not set; no Phase 0 interview ran. The topic was re-scoped mid-stage
by the user, from "graphics should be better" to "**is HTML even the right path**
for a quality app on both web and store" — this document answers the
architecture question first and keeps the art findings as the second half.

**Discovery lens:** *Technical architecture / implementation* (primary) +
*User-workflow / product opportunity* (secondary — what a player perceives as
"commercial", and whether a child-author's content can look as good as the
bundled set).

**Capability × player-facing surface** — what exists vs what a commercial casual
board game presents:

| Surface | Ships today (verified) | Commercial expectation | Renderer-bound? |
|---|---|---|---|
| Piece art | System Unicode `♚♛♜♞♟`; 궁수 reuses `♝` (`ko.ts:17-29`) | Drawn set, one silhouette language | **No** |
| Square-type / card icons | 31 OS emoji (`ko.ts:47-141`) | Art-directed icon family | **No** |
| Board material | Two flat fills, 2px grid gap (`styles.css:423-454`) | Bevel, inner shadow, texture, frame | **No** |
| Piece depth | 4-offset `text-shadow` outline (`styles.css:512-516`) | Contact shadow, fill gradient, lift | **No** |
| Motion | 3 duration tokens, one 140ms `piece-land` (`tokens.css:105-111`) | Springs, capture burst, win sequence | **No** (CSS `linear()`) |
| Title screen | `<p>` + `<select>` + 2 buttons (`Home.tsx:32-56`) | Logo, art background, animated entry | **No** |
| Typography | No webfont loaded at all (`index.html`) | Display face + readable body | **No** |
| Particle/physics FX at scale | — | Hundreds of particles, shaders | **Yes** — but not needed here |
| Sound / haptics | Built, injected backend (`src/ui/sound.ts`) | — | No |
| a11y grid, contrast | Measured and pinned (`tokens.css:38-64`, `styles.css:430-435`) | — | **Lost** if canvas |

Every row that matters for "상용 게임 느낌" answers **No** in the last column.
That column *is* the argument.

## 🛠️ Approaches Found

### Approach 1 — Stay DOM/CSS; invest the whole budget in art + juice (recommended)

| Field | Content |
|---|---|
| **Approach** | Keep React + DOM. Replace the emoji/glyph icon axis with a content-addressed SVG art set; add a CSS material pass (board bevel, texture, contact shadows), spring motion via `linear()`, a real title screen, a self-hosted Korean display font. |
| **Assumption** | That a turn-based 6×6 board never needs a frame budget DOM cannot meet. |
| **Evidence** | [chessground](https://github.com/lichess-org/chessground) — DOM + CSS + SVG annotations, 10K gzipped, powers lichess. Native CSS springs need no library since `linear()` ([Comeau](https://www.joshwcomeau.com/animation/linear-timing-function/)); ready-made juice patterns exist ([juice-it](https://chr15m.github.io/juice-it/)). This repo already tokenises every duration (`tokens.css:102-111`) and zeroes them under `prefers-reduced-motion` (`styles.css:490-502`), so new motion has one place to live. Pretendard is OFL/commercial-OK ([repo](https://github.com/orioncactus/pretendard)); Gmarket Sans is free for commercial use ([noonnu](https://noonnu.cc/en/font_page/366)). |
| **Trade-off** | Highest visual gain per unit of risk, and preserves everything already paid for. Ceiling excludes true particle/shader spectacle — irrelevant for this genre. |
| **Compatibility** | Excellent. Zero new runtime deps; ARIA grid, pointer input, 45+ Playwright specs, and the measured contrast tokens all survive. One schema bump for the art axis (a pattern this repo has already executed twice — `src/content/schema.ts:28-31`). |
| **Risk** | **low** |

**The art axis, concretely.** ADR-017 already made the icon a *content* property
(`iconKey`), and `pieceGlyph`/`iconOf` (`MatchHost.tsx:38-72`) take an arbitrary
resolved value while knowing no piece ids — so swapping glyph strings for vector
art is a data/schema change, not a UI rewrite. Sourcing is the interesting part:
free chess sets exist but are **copyleft** (Cburnett is CC BY-SA 3.0 / GPLv2+ as
lichess ships it — [lichess forum](https://lichess.org/forum/general-chess-discussion/are-the-lichess-piece-sets-free-to-use-in-other-software);
[FelixKling](https://codeberg.org/FelixKling/chess_pieces) differs), and **no
existing set covers this game's content anyway** — 궁수, 폭탄칸, 포탈, 신전,
성역, 늪 and 15 skill cards have no chess equivalent. Sourcing solves ~6 of 37
icons and imports a licence obligation; drawing one coherent set is likely both
cleaner and legally simpler.

### Approach 2 — Canvas / WebGL renderer (PixiJS) inside the same web app

| Field | Content |
|---|---|
| **Approach** | Replace the DOM board with a canvas scene graph: sprite sheets, real particle systems, shaders. |
| **Assumption** | That the visual ceiling is renderer-bound. **Contradicted** by the table above and by chessground. |
| **Evidence** | Only route to effects DOM cannot do (lighting, distortion, thousands of particles). |
| **Trade-off** | Destroys three contracts this repo bought deliberately: the ARIA grid (`.board-row { display: contents }`, `styles.css:430-435`) becomes an opaque canvas needing a parallel a11y tree; the **pointer**-event input model — chosen because HTML5 drag is dead on iOS Safari (`[wiki:architecture] game-feel-and-input`) — is re-implemented from scratch; and the suite's square-based selectors (~149 `.square` / `data-square*`
occurrences across 12 files under `e2e/`) are invalidated. Adds a several-hundred-KB dependency to a runtime that is currently react + zod. |
| **Compatibility** | Poor. |
| **Risk** | **high** — not recommended. |

### Approach 3 — Rewrite the UI native (Flutter / React Native) for store-grade app feel

| Field | Content |
|---|---|
| **Approach** | Keep the game as a native app; rewrite the presentation layer outside the browser. |
| **Assumption** | That App Store presence and native smoothness are product requirements. **Unstated today.** |
| **Evidence** | Lichess did exactly this: `lichobile` (TypeScript + Mithril + **Ionic Capacitor**) → archived Feb 2026, replaced by a Flutter rewrite for "near-native performance and looks… a much smoother and responsive experience" ([blog](https://lichess.org/@/lichess/blog/mobile-app-official-release/wiwu6goO), [mobile repo](https://github.com/lichess-org/mobile)). Independently, WebView animation is reported to diverge from native most visibly on gesture-driven/physics motion and mid-range devices ([capgo](https://capgo.app/blog/ultimate-guide-to-animation-performance-in-capacitor-apps/), [kanopy](https://kanopylabs.com/blog/capacitor-vs-react-native-vs-flutter)). |
| **Trade-off** | The only path that clears Apple 4.2.2 cleanly with a premium feel — at the cost of a second UI codebase and the loss of "one build runs everywhere". |
| **Compatibility** | **Asymmetric, and this is the key finding for *this* repo.** The core is already platform-free TypeScript: `src/engine`, `src/content`, `src/editor`, `src/i18n` total **4,287 lines** with no DOM dependency (only `src/editor/storage.ts` touches `localStorage`, already behind an injected seam). So **React Native reuses that core verbatim and rewrites only `src/ui/`; Flutter forces a Dart re-implementation of all 4,287 lines**, including the rules engine and the zod schema. Lichess's Flutter choice does not transfer — their chess logic was already being re-implemented, ours is the asset. |
| **Risk** | **medium-high**, and **premature**: it is bought with distribution goals, not graphics goals. |

### Approach 4 — Capacitor wrapper over the existing web app (ADR-022's queued plan)

| Field | Content |
|---|---|
| **Approach** | Ship today's PWA inside a native shell for both stores. |
| **Assumption** | That a WebView shell reads as a real app to Apple review and to players. |
| **Evidence** | Apple Guideline 4.2 rejects apps that are "a repackaged website"; Capacitor hybrids *with* native plugins have still been rejected under it ([mobiloud](https://www.mobiloud.com/blog/app-store-review-guidelines-webview-wrapper), [code2native](https://code2native.com/blog/fix-app-store-rejection-42-webview)). And the most experienced shipper of this exact stack abandoned it (above). |
| **Trade-off** | Cheapest route to a store listing; weakest ceiling, and carries review risk that scales inversely with how much native behaviour is added. |
| **Compatibility** | High — no code change. |
| **Risk** | **medium** — viable for Google Play (where a TWA/PWA is accepted outright), materially riskier for Apple. |

## ⚠️ Pitfalls

1. **Answering the graphics question with a renderer.** The table in Refinement
   Decisions is the guard: every surface that currently reads as cheap is
   renderer-independent. A canvas rewrite that keeps the emoji changes nothing a
   player can see, while spending the a11y grid, the iOS-safe pointer model, and
   45 specs.

2. **Emoji cannot be styled like the chess glyphs, and the existing safeguard
   silently doesn't apply to them.** `.square .piece` paints a 4-offset
   `text-shadow` outline (`styles.css:508-517`) whose stated purpose is to
   decouple glyph contrast from board contrast, and `tokens.css:38-44` records
   the palette measurement that *depends* on it. Colour-font emoji don't take
   `color`, and a text-shadow behind one draws a coloured duplicate rather than
   an outline (**inference — verify on device**). So that contrast argument is
   load-bearing for 6 icons and decorative for the other 31. Per
   `[wiki:architecture] board-glyph-rendering`: do not improve one of the two
   contrast numbers without recomputing the other.

3. **Assets in `public/` are invisible to the service worker unless hand-listed.**
   `vite-plugin-sw.ts:30-40` states it, and records that the maskable icon was
   missed on the first pass — `public/` is copied outside the Rollup bundle, so
   `...assets` never contains it. A sprite sheet, texture or webfont dropped
   there works in dev and renders as **nothing** in the installed offline app.
   Prefer importing assets through the bundler; otherwise add the precache entry
   in the same commit.

4. **`position: fixed` juice overlays break three contracts at once.** Any
   particle layer, win-sequence scrim or full-viewport flash repeats a defect
   already shipped twice here (`[fail:render] fixed-overlay-blocks-what-it-only-dims`,
   count:2): it intercepts pointers, steals the viewport edge from scrolling
   content, and stacks on top of sibling fixed elements instead of flowing.
   Declare `pointer-events: none` in the same edit as the background.

5. **New motion must be zeroed by the reduced-motion block — and a test asserts
   every declared token is.** `styles.css:490-502`, and `0.01ms` rather than
   `0s` because some engines treat zero as "no animation" and strand the `from`
   keyframe (`[wiki:architecture] game-feel-and-input`). A capture burst with a
   hard-coded duration passes review and fails that test.

6. **The board's cue channels are nearly saturated.** `tokens.css:145-149`
   records a dark-theme collision where three cues resolved to the same blue;
   `styles.css:706-734` records focus and last-move both claiming `box-shadow`
   at equal specificity. Glow/bloom/drop-shadow on squares competes for the same
   channels — new effects must compose, not take a property another cue owns.

7. **Don't ship art on the bundled set only.** A child who authors a piece and
   gets a `?` monogram beside hand-drawn bundled pieces learns their content is
   second-class — the opposite of the content-platform thesis. This is ADR-017's
   absent-case rule, and the global 2026-06-08 correction (absent-case = feature
   black hole) applies directly.

8. **Deciding the container now costs more than deferring it.** Approach 3 is
   bought with distribution requirements that have never been stated. Note also
   `[fail:design] plan-contradicts-its-own-adr`: ADR-022 already recorded
   "Capacitor stays a later wrapper," so any scope line implying a native
   rewrite this cycle contradicts a standing ADR and must amend it explicitly.

9. **Scope collides with an in-flight plan.** `PLAN-ui-ux-productization` still
   has Phases 9a/9b/10 (rooms, deletion, room-makeability) unbuilt. A graphics
   cycle inserted now re-opens ADR-015's ordering.

## ❓ Open Questions

1. **Is the iOS App Store actually a requirement?** This is the single question
   that decides Approaches 1 vs 3/4. Web + Android(TWA) is reachable today;
   Apple is not, at any level of DOM polish.
2. **Monetisation.** IAP requires a store binary; a PWA cannot sell on iOS. If
   there is no revenue plan, the App Store hole costs nothing.
3. **Art contract shape.** Does `iconKey` resolve to (a) a sprite-symbol id
   mapped by a UI-side registry, (b) inline SVG carried in content, or (c) a URL
   to a bundled asset? Trades ADR-011 purity against AC-016's literal ban and
   editor-input safety. Binding decision for `plan`.
4. **Build or source the art?** ~31 of 37 icons have no existing equivalent and
   the available chess sets are copyleft — does one commissioned/generated
   coherent set win outright?
5. **Licensing posture.** The repo has no LICENSE file. Commercial distribution
   would rule out CC BY-SA / GPL art.
6. **Does the editor's icon picker ship this cycle**, or do authored records
   keep the monogram fallback? (Pitfall 7.)
7. **Sequencing vs Phases 9/10.** ADR-015's rationale ("you cannot evaluate
   polish on a loop that does not close") expired when the loop closed in
   Phase 2 — so is this Phase 11, or does it pre-empt rooms?
8. **Fidelity target.** "상용 모바일 게임" spans flat-vector casual to rendered
   3D. Which reference products define done?
9. **Performance budget.** SVG `feTurbulence` is resolution-independent but
   paints expensively over large areas on mobile; a small tiling raster is the
   recommended alternative ([Codrops](https://tympanus.net/codrops/2019/02/19/svg-filter-effects-creating-texture-with-feturbulence/)).
   Is there a stated paint budget on the target device class?

## 📚 Sources

- [lichess-org/chessground — DOM/CSS board UI, SVG annotations, 10K gzipped](https://github.com/lichess-org/chessground)
- [lichess-org/lichobile — old app: TypeScript + Mithril + Ionic Capacitor, archived](https://github.com/lichess-org/lichobile)
- [Lichess blog — Mobile App: Official Release (Flutter rewrite rationale)](https://lichess.org/@/lichess/blog/mobile-app-official-release/wiwu6goO)
- [lichess-org/mobile — the Flutter app](https://github.com/lichess-org/mobile)
- [App Store Review Guidelines: Will Your Webview App Be Rejected? — MobiLoud](https://www.mobiloud.com/blog/app-store-review-guidelines-webview-wrapper)
- [Fix App Store Rejection 4.2: WebView apps — Code2Native](https://code2native.com/blog/fix-app-store-rejection-42-webview)
- [Do Progressive Web Apps Work on iOS? — MobiLoud](https://www.mobiloud.com/blog/progressive-web-apps-ios)
- [PWA iOS Limitations and Safari Support — MagicBell](https://www.magicbell.com/blog/pwa-ios-limitations-safari-support-complete-guide)
- [Animation Performance in Capacitor Apps — Capgo](https://capgo.app/blog/ultimate-guide-to-animation-performance-in-capacitor-apps/)
- [Capacitor vs React Native vs Flutter — Kanopy](https://kanopylabs.com/blog/capacitor-vs-react-native-vs-flutter)
- [Are the Lichess piece sets free to use in other software? — lichess.org](https://lichess.org/forum/general-chess-discussion/are-the-lichess-piece-sets-free-to-use-in-other-software)
- [FelixKling/chess_pieces — Codeberg](https://codeberg.org/FelixKling/chess_pieces)
- [Springs and Bounces in Native CSS — Josh W. Comeau](https://www.joshwcomeau.com/animation/linear-timing-function/)
- [juice-it — CSS game juice snippets](https://chr15m.github.io/juice-it/)
- [SVG Filter Effects: Creating Texture with feTurbulence — Codrops](https://tympanus.net/codrops/2019/02/19/svg-filter-effects-creating-texture-with-feturbulence/)
- [orioncactus/pretendard (OFL)](https://github.com/orioncactus/pretendard)
- [G Market Sans — noonnu](https://noonnu.cc/en/font_page/366)

## 🔗 Related Internal Docs

- [[PLAN-ui-ux-productization]] — ADR-011 (UI names no content), ADR-015
  (sequencing), ADR-017 (`iconKey` + absent-case rule), ADR-021 (token
  ownership), ADR-022 (PWA first, Capacitor later); Phases 9a/9b/10 unbuilt.
- [[RESEARCH-ui-ux-productization]] — the original 40-gap inventory.
- [[REVIEW-ui-ux-productization-phase8-2026-08-06]] — most recent review state.
- Memory: `[wiki:architecture] board-glyph-rendering`,
  `[wiki:architecture] game-feel-and-input`,
  `[fail:render] fixed-overlay-blocks-what-it-only-dims`,
  `[fail:design] plan-contradicts-its-own-adr`.
