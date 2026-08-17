---
type: research
task_slug: piece-info-convenience-ux
status: complete
created: 2026-08-08
tags: [chess-craft, research, react, touch-ux, accessibility, game-ui]
mtime_warn_days: 7
libs_fetched: []
sources:
  - https://flook.co/blog/posts/mobile-tooltip-best-practices
  - https://www.gamedeveloper.com/design/using-gestures-in-mobile-game-design
  - https://developer.android.com/develop/ui/compose/touch-input/pointer-input/understand-gestures
  - https://guides.gamepressure.com/into_the_breach/guide.asp?ID=43635
  - https://interfaceingame.com/games/into-the-breach/
  - https://additionalknowledge.com/2024/08/02/how-to-prevent-the-default-context-menu-live-preview-on-long-press-in-mobile-safari-chrome/
  - https://bugs.webkit.org/show_bug.cgi?id=231161
  - https://dequeuniversity.com/resources/wcag2.1/1.4.13-content-on-hover-or-focus
  - https://www.wcag.com/authors/1-4-13-content-on-hover-or-focus/
  - https://www.parallelhq.com/blog/what-are-affordances-in-design
  - https://arxiv.org/pdf/1806.06084
related_docs:
  - "[[PLAN-ui-ux-productization]]"
  - "[[RESEARCH-ui-ux-productization]]"
  - "[[PLAN-web-server-deployment]]"
  - "[[RESEARCH-web-server-deployment]]"
  - "[[REVIEW-ui-ux-productization-2026-08-07]]"
summary: "Ship a visible selection-detail strip first; add long-press as an accelerator, not as the only route"
---

# RESEARCH — Piece info and convenience affordances

## 🎯 Recommended Direction

**Make "what is this piece" reachable by a route a nine-year-old can see, and treat
long-press as an accelerator layered on top of it — never as the only door.**

The board already reuses `Peek` — one content-agnostic detail sheet (`{mark, name,
kind, text}`, `src/ui/MatchHost.tsx:163`) — for skill cards, rule cards and painted
square types. The one entity on the board with no in-match detail route is the piece
itself: `content.pieces` entries carry `nameKey` + `textKey` and are rendered in the
dex screen (`src/ui/Rules.tsx:37`, `App.tsx:413`), which is a different route
(`route === 'dex'`) than the match. So the missing feature is not a new data model —
it is a second opener on an existing sheet, plus a way to ask for it.

The binding trade-off is **discoverability, not gesture plumbing**. A long-press timer
that coexists with the existing drag is a solved problem (movement threshold + click
suppression). A hidden gesture that the target player never finds is not: gesture
discoverability research finds hold/press interactions are "discovered only
serendipitously" because nothing on the element advertises them
([IxDF/Parallel on hidden affordances](https://www.parallelhq.com/blog/what-are-affordances-in-design),
[Touching Data, arXiv](https://arxiv.org/pdf/1806.06084)). This project already paid
that bill once: `[fail:design] rule-keyed-to-event-not-state`'s second instance was
found by *a child asking where to click*, and its recorded lesson is that an
affordance needs its own visible commit, not an implicit one.

Impact class: **user-facing workflow value** (in-match comprehension for a child
player), not maintainer value.

## 🔍 Refinement Decisions

`--deep` not set — no Phase 0 interview.

Discovery lens: **User-workflow / product opportunity** (how a child actually asks
"what does this do" mid-match) + **Technical architecture** (how a press coexists with
the board's existing pointer contract). Research/benchmark lens deliberately not used
alone.

### Local capability × user artifact

| Player's live question | Artifact that already answers it | Reachable in-match today? |
|---|---|---|
| "Where can this piece go?" | selection highlight — `reachable` set + `data-legal-kind` (`MatchHost.tsx:478`, `:823`) | ✅ tap the piece |
| "What is this piece called / what does it do?" | `content.pieces` `nameKey`/`textKey`, rendered by `Rules.tsx` dex | ❌ dex is a separate route |
| "How does this piece move, as a picture?" | `PieceMoves` 7×7 grid (`src/ui/PieceMoves.tsx`) | ❌ editor-only |
| "What is this painted square?" | legend chips → `Peek` sheet (`MatchHost.tsx:882-905`) | ✅ |
| "What does this card do?" | hotbar `SlotDetail` → `Peek` sheet (`MatchHost.tsx:1170`) | ✅ |
| "What is the rule card in force?" | `rule-card` toggle (`MatchHost.tsx:715`) | ✅ |
| "What did I just do / can I take it back?" | `undo` button (`MatchHost.tsx:702`) | ✅ (one ply) |
| "Why did the board refuse me?" | `hint-bar` + `describeRejection` (`MatchHost.tsx:866`) | ✅ |

The gap is one row wide and two rows deep: **pieces**. Everything else on the board
already has a tap-to-explain route; the piece — the thing a child touches most — does
not.

## 🛠️ Approaches Found

### Approach A — Long-press on a square opens the piece `Peek`

| Field | Content |
|---|---|
| Approach | `onPointerDown` starts a ~450 ms timer; fires `setPeek(pieceEntry)` if the pointer moved < ~8 px; the ensuing `click` is suppressed |
| Assumption | Players will find the gesture, or be taught it once |
| Evidence | Standard mobile pattern — long-press is the canonical "inspect" verb ([flook](https://flook.co/blog/posts/mobile-tooltip-best-practices)); the movement-threshold recipe for separating press from drag is the documented one ([Android gestures](https://developer.android.com/develop/ui/compose/touch-input/pointer-input/understand-gestures), [Game Developer](https://www.gamedeveloper.com/design/using-gestures-in-mobile-game-design)) |
| Trade-off | Cheapest to build and zero screen cost — paid for entirely in discoverability |
| Compatibility | The square already owns `onPointerDown`/`onPointerUp` for drag (`MatchHost.tsx:818-819`) and `onClick` for select. A press timer slots between them; `dragFrom.current` must be cleared when the press wins |
| Risk | **medium** — gesture conflict is tractable; the iOS callout/magnifier and the "never found" failure mode are not free |

### Approach B — Explicit info mode (a `?` toggle in the tools row)

| Field | Content |
|---|---|
| Approach | A persistent toggle beside `flip-board`/`sound-toggle`; while on, a tap inspects instead of selecting |
| Assumption | A visible control beats a fast one for this audience |
| Evidence | Into the Breach's info affordance is a *held modifier* over a *visible* unit panel, not a hidden gesture ([battle-map UI](https://guides.gamepressure.com/into_the_breach/guide.asp?ID=43635), [Interface In Game](https://interfaceingame.com/games/into-the-breach/)); the "adjacent info icon instead of a contended gesture" fallback is the documented mobile-tooltip escape hatch ([flook](https://flook.co/blog/posts/mobile-tooltip-best-practices)) |
| Trade-off | Fully discoverable and keyboard/screen-reader reachable for free — costs a tools-row slot and introduces a mode, and a mode a child forgets they left on makes the board stop responding to taps |
| Compatibility | Tools row already holds 5+ controls (`MatchHost.tsx:960-990`); settings panel is the overflow. Modal state must be visibly latched or it becomes a bug report |
| Risk | medium — mode confusion is the real cost |

### Approach C — Selection detail strip (no new gesture at all)

| Field | Content |
|---|---|
| Approach | When `selected` is set, the always-present `hint-bar` region grows into a strip naming the piece, showing its mark and its one-line `textKey`; a `▸` opens the full `Peek` sheet |
| Assumption | The player selects the piece they are curious about anyway — selection *is* the question |
| Evidence | This mirrors the existing legend chip → sheet pattern (`MatchHost.tsx:882`) and the hotbar `SlotDetail` → sheet pattern (`:1170`); both were accepted in the productization cycle. Into the Breach shows unit detail on selection, not on a modifier, for the same reason |
| Trade-off | Zero discoverability risk and zero new gesture — costs vertical space on a 390×844 phone, and the `hint-bar` comment (`MatchHost.tsx:862-865`) explicitly warns that a region which appears and disappears reflows the board under the player's thumb |
| Compatibility | Highest — `selected` already exists (`:232`); nothing about the pointer contract changes. Reserve the height always, fill it conditionally |
| Risk | **low** |

**Synthesis (informational — `plan` decides):** C as the floor, A as the accelerator.
C answers the question through a route the player is already using and cannot fail to
find; A makes it one gesture for the opponent's pieces and for pieces the player does
not want to select. B is the weakest of the three here — it buys discoverability that
C already gives, and pays a mode for it.

## ⚠️ Pitfalls

1. **iOS eats the long press before your handler does.** `-webkit-touch-callout: none`
   suppresses the action sheet but *not* the magnifier loupe; you need
   `-webkit-user-select: none` alongside it, and even then iOS 15+ has a standing
   regression showing the zoom callout anyway
   ([WebKit #231161](https://bugs.webkit.org/show_bug.cgi?id=231161),
   [write-up](https://additionalknowledge.com/2024/08/02/how-to-prevent-the-default-context-menu-live-preview-on-long-press-in-mobile-safari-chrome/)).
   `src/ui/styles.css` currently declares **no** `touch-action`, `user-select` or
   `-webkit-touch-callout` rule anywhere — a long press on `.square` (`styles.css:1219`)
   would today race the OS.

2. **Haptic confirmation of the press is unavailable on the primary device.**
   `src/ui/sound.ts:63,68` records that iOS Safari has no `navigator.vibrate`
   (ADR-023's own consequence). The "press registered" feedback must be visual — the
   press cannot be confirmed by a buzz on an iPhone.

3. **A hover tooltip is not an answer on touch, and the one that exists proves it.**
   The only tooltip in the app is `title={t('ui.seed.hint')}` (`MatchHost.tsx:998`) —
   invisible to every touch player. Any author-built hover/focus popover must be
   dismissible, hoverable and persistent per WCAG 1.4.13
   ([Deque](https://dequeuniversity.com/resources/wcag2.1/1.4.13-content-on-hover-or-focus),
   [wcag.com](https://www.wcag.com/authors/1-4-13-content-on-hover-or-focus/));
   native `title` is exempt only because the user agent owns it.

4. **A move diagram has an absent case that will silently show nothing.**
   `PieceMoves.readGrid` returns `null` for anything it cannot round-trip — multiple
   patterns, mixed travel kinds, `forEach` quantifiers, nested conditions
   (`src/ui/PieceMoves.tsx:16-25`). A knight-plus-rook piece would render an empty
   diagram unless the fallback is defined up front. This is the recorded
   absent-case footgun (global learned correction, 2026-06-08): define the
   diagram-unavailable branch explicitly, do not let it no-op.

5. **The visual language forbids the obvious tooltip styling.** `styles.css:253-254`
   records "a block that lights up on hover would look like glass"; ADR-007 of
   `PLAN-web-server-deployment` re-admitted hover *only* as a bevel change, gated on
   `@media (hover: hover)`. Any new surface also has to clear
   `tests/ui/art-contrast.test.ts`, and the recorded rule is **move the colour, never
   lower the floor** (`[wiki:architecture] chess-craft-pixel-redesign`).

6. **Do not restate what selection already says.** Selection already answers "where can
   it go" via `reachable` + `data-legal-kind` and puts it in the ARIA label
   (`squareLabel`, `MatchHost.tsx:108`). The new affordance must carry what selection
   does *not*: the piece's name, its ability text, and how it travels.

7. **A press that also selects is worse than no press.** `beginDrag` deliberately does
   not set `selected` (`MatchHost.tsx:544-552`, with a comment about a highlight left
   on a square the player did not choose). A long-press that wins must clear
   `dragFrom.current` **and** suppress the trailing `click`, or a peek will also move a
   piece — the exact "one input, two commits" shape `[fail:design]
   rule-keyed-to-event-not-state` warns about.

## ❓ Open Questions

1. **Scope of the inspectable.** Own pieces only, or the opponent's pieces and empty
   painted squares too? (Empty painted squares already have the legend route; the
   opponent's pieces have none.)
2. **Diagram or text?** Does the piece detail show a read-only `PieceMoves` grid, or
   name + ability text only? Q4's fallback cost rides on this.
3. **Desktop's route.** Hover tooltip (WCAG 1.4.13 obligations), right-click, or the
   same sheet on a modifier-click? Keyboard must have one too — the board is
   `role="grid"` with focusable cells.
4. **Which approach is the floor.** C alone, C + A, or B — and if a mode ships, what
   latches it visibly.
5. **Teaching the gesture.** Does a long-press accelerator earn a coach mark in the
   existing first-run flow (`src/ui/coach.ts`, `COACH_SEEN_KEY`), or does it stay
   undocumented on the grounds that C already covers the need?
6. **Beyond piece info.** The topic said "등등" — candidates surfaced but not scoped
   here: a move history/log (only single-ply `undo` exists today), a capture tray
   readout (`Taken`, `MatchHost.tsx:1142`), and a "why is this illegal" expansion of
   `describeRejection`. Are these in this task or a later one?

## 📚 Sources

- [13 Mobile Tooltip Best Practices](https://flook.co/blog/posts/mobile-tooltip-best-practices) — long-press as deliberate inspect intent; adjacent-info-icon fallback
- [Using Gestures in Mobile Game Design — Game Developer](https://www.gamedeveloper.com/design/using-gestures-in-mobile-game-design)
- [Understand gestures — Android Developers](https://developer.android.com/develop/ui/compose/touch-input/pointer-input/understand-gestures) — hold duration + movement threshold
- [Into the Breach: Interface — Battle Map](https://guides.gamepressure.com/into_the_breach/guide.asp?ID=43635)
- [Into the Breach — Interface In Game](https://interfaceingame.com/games/into-the-breach/)
- [Preventing the long-press context menu in mobile Safari/Chrome](https://additionalknowledge.com/2024/08/02/how-to-prevent-the-default-context-menu-live-preview-on-long-press-in-mobile-safari-chrome/)
- [WebKit bug 231161 — iOS 15 zoom callout despite `-webkit-user-select: none`](https://bugs.webkit.org/show_bug.cgi?id=231161)
- [WCAG 1.4.13 Content on Hover or Focus — Deque](https://dequeuniversity.com/resources/wcag2.1/1.4.13-content-on-hover-or-focus)
- [WCAG 1.4.13 — wcag.com](https://www.wcag.com/authors/1-4-13-content-on-hover-or-focus/)
- [What Are Affordances in Design?](https://www.parallelhq.com/blog/what-are-affordances-in-design) — hidden affordances
- [Touching Data: A Discoverability-based Evaluation (arXiv)](https://arxiv.org/pdf/1806.06084) — hold-and-swipe never discovered

## 🔗 Related Internal Docs

- [[PLAN-ui-ux-productization]] — legend chips, `Peek` sheet, coach marks, hint-bar
- [[RESEARCH-ui-ux-productization]] — onboarding + touch-target prior art
- [[PLAN-web-server-deployment]] — ADR-007 bevel-only hover, `@media (hover: hover)`
- [[RESEARCH-web-server-deployment]] — the recorded no-hover decision and its reversal
- [[REVIEW-ui-ux-productization-2026-08-07]]
- `[wiki:architecture] chess-craft-pixel-redesign` — art-as-data, single dark theme, contrast floors
- `[fail:design] rule-keyed-to-event-not-state` — the UI instance: a commit keyed to the input that usually triggers it
