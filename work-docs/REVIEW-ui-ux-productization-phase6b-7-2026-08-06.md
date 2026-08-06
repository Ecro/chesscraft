---
type: review
task_slug: ui-ux-productization
status: APPROVED
created: 2026-08-06
reviewers_invoked: [code-reviewer, ux-reviewer]
consensus_method: single
grade_threshold: B
final_grade: A
human_review_needed: false
subject: staged Phase 6b + Phase 7 (uncommitted, against 5e34938)
drift_verdict:
  result: scope_violation
  scope_violations:
    - src/ui/MatchHost.tsx
    - src/ui/App.tsx
    - src/i18n/ko.ts
    - package.json
    - playwright.pwa.config.ts
    - scripts/make-icons.mjs
    - tests/ui/chrome-i18n.test.tsx
  scenario_misses: []
  task_slug: ui-ux-productization
  computed_at: 2026-08-06T13:35:00Z
---

# REVIEW — Phase 6b (layout) and Phase 7 (PWA)

## 🎯 Round Summary

| Round | Grade | Fixes | Remaining | New |
|---|---|---|---|---|
| 1 (init) | **C** | — | 6 P1 · 3 P2 · 1 P3 | — |
| 2 (auto-fix) | **A** | 11 | 2 P2 · 1 P3 deferred | **2 P1, both introduced by round 2's own fixes — fixed in the same round** |

## 🔍 Drift Findings

**`scope_violation`, and it is the fourth time in this PLAN.** Seven changed files
appear in no phase's scope. Every one is traceable to in-scope work — `MatchHost.tsx`
and `App.tsx` *carry* the collapsible trays, the error state and the update prompt;
`package.json` gained the `e2e:pwa` chain because the A.5 gate caught the new suite
as `built-but-not-wired`; `playwright.pwa.config.ts` exists because a worker that
precaches a build cannot be tested against a dev server. Nothing changed that
shouldn't have.

That is exactly what makes it worth recording rather than waving through. This is
`[fail:design] phase-scope-omits-wiring` for the fourth time (Phases 4, 5, 6a, and
now 6b/7): the scope lists name **outcomes** and omit the files that carry them.
Phases 4 and 5 fixed it by re-deriving scope from reachability and are the only two
phases in this PLAN whose drift came back `clean`. 6b and 7 did not use that method.

No scope item went unimplemented.

## ✅ Findings — round 1

The two reviewers produced **completely disjoint** sets — no overlap at any location.
Worth noting against this task's earlier rounds, where they converged twice and the
converged finding was the most severe of its round both times.

| # | Sev | Source | Finding | Fix |
|---|---|---|---|---|
| 1 | **P1** | ux | **The collapsible tray contradicted ADR-018.** The ADR says "both hands, one board, **both trays always visible**"; Phase 6b's scope says "collapsible trays (#16)" — the PLAN contradicts itself, and I implemented the scope line without checking the ADR three sections above it. Collapsing unmounted the cards, so a tap on the opponent's label hid their hand, and a player who left their own tray shut could not play a card on their own turn because the button did not exist. | Cards stay mounted. Collapsing now hides only `.card-body`, so the icon and the card's presence survive and it stays clickable. A new e2e drafts, collapses, and asserts the count is unchanged. |
| 2 | **P1** | ux | **The notices pushed the board down mid-match.** They render in `App`, above the routed screen, in normal flow — so an update arriving mid-match, or an undismissed content notice, moved the position under a player's thumb between turns. This is the defect 6a fixed for the rejection toast, reintroduced by a new element that did not inherit the lesson. | `position: fixed`, top-anchored, out of flow. |
| 3 | **P1** | ux | **The notice buttons fell outside the 44px floor.** The rule is scoped by a closed list of ancestor classes and `.notice` was not on it, so the two controls a confused player most needs got the smallest targets in the app. | `.notice` added to the scope list. |
| 4 | **P1** | ux | **The landscape comment claimed "chrome can scroll in its own column" and no `overflow` or `sticky` existed anywhere in the block.** `comment-claims-unbuilt-safeguard`, recorded in this repo, written by me again. | See "Found while fixing" — the first two attempts at this were measured no-ops. |
| 5 | **P1** | code | **The service worker's cache writes escaped the event lifetime.** `caches.open(...).then(cache.put(...))` was neither returned into `respondWith`'s chain nor passed to `waitUntil`, so a browser that suspends the worker after the response settles can drop the write silently — and the visible result is a shell that never refreshes, which is this phase's own stated risk. | Both branches now use `event.waitUntil`. |
| 6 | **P1** | code | **No iOS standalone fallback, and the PWA suite is Chromium-only.** iOS honoured the manifest's `display: standalone` only from 16.4; before that `apple-mobile-web-app-capable` was the only mechanism, and without it "Add to Home Screen" produces a Safari bookmark. The audience is children on whatever phone the household already had. `api-absent-on-the-target-platform`, recorded here after the drag-and-drop defect. | Meta tags added; the WebKit coverage gap recorded in the PLAN as a manual check rather than left unstated. |
| 7 | P2 | code | `icon-512-maskable.png` is declared by the manifest and was **not** in the worker's precache list — `public/` is copied outside the Rollup bundle, so every icon must be listed by hand and this one was missed. | Added. |
| 8 | P2 | code | The brand hexes now live in four artifacts and only `tokens.css` is covered by ADR-021's scan. | Cross-reference comments at each; generating them from one source is the real fix and is not done. |

## Found while fixing

**The landscape fix was wrong twice, and only measurement caught it.**

The first attempt — `position: sticky` on `.board-frame` — measured as a complete
no-op: after scrolling a 790px document in a 412px window the board sat at
**-293px**, entirely off screen. `align-self: start` did not help either. The cause
was two levels up: `main { overflow-x: hidden }` makes the computed `overflow-y`
`auto`, which turns `main` into a scroll container, and a sticky element then
positions against *that* instead of the viewport — so it never activates.
`overflow-x: clip` clips without creating one. Scoped to the landscape media query,
because `clip` is newer than the `:has()` this project rejected for old-device
support; there it degrades together with the sticky it enables.

Measured after: board at `top: 8, bottom: 282` in a 412px window with the document
scrolled fully down, horizontal scroll 0. A new e2e drafts first and *then* scrolls
to the bottom — the original assertion measured the empty pre-draft state, which is
a positive-only fixture that could never reach the failing case.

**Round 2's own fixes introduced two P1s.** Both were caught by re-review and fixed
in the same round:

- **Two notices at once landed on the same pixel.** Making them `fixed` removed the
  free vertical stacking that document flow had provided, and their conditions are
  independent — a content bundle that failed to load and a pending build are exactly
  the pair that ships together. The later one painted over the other, which became
  invisible and unclickable. Now one `.notice-stack` owns the position and the
  notices are normal blocks inside it, at `z-index: 30` so `.draft-scrim` (20) cannot
  wash them out.
- **Collapsed cards lost their accessible name.** `.card-body { display: none }`
  takes the only name source out of the accessibility tree, and the icon beside it is
  `aria-hidden` — so a screen reader announced "button" for every card in a collapsed
  tray. Worse than before the phase. `aria-label` now lives on the button itself, and
  the e2e asserts it.
- The ADR-018 e2e used `test.skip(held === 0)` with a **random** seed, so a run where
  no card reached the hand would report "skipped" rather than "failed" and drop the
  regression check with no signal. It now drains the draft and asserts the fixture.

## Deferred

| Sev | Finding | Why |
|---|---|---|
| P2 | The tray label's only affordance is a CSS `::after` caret. | It is a native `<button>` with `aria-expanded`, so AT users get a correct toggle; and post-fix it condenses rather than hides, so a missed affordance costs less. |
| P3 | The icon is a generic rook, not tied to the app's two-side identity. | A branding call, not a defect. |
| — | `update-apply` is never clicked against a real registration in e2e. | Carried from the A.5 gate; noted there as an acknowledged limitation. |

## 🤝 Disagreements

None between reviewers — their round-1 sets did not overlap at all.

One correction to the re-review: it judged the landscape `sticky` **fix-correct** from
CSS-spec reasoning about grid-area containing blocks. That reasoning is right in
general and wrong here, because it could not see `main`'s `overflow-x`. Measurement
disagreed with it, twice. Recorded because the reviewer's verdict would have shipped
a no-op.

## Review Iteration Summary

| Iteration | Grade | Fixes Applied | Remaining | New |
|-----------|-------|---------------|-----------|-----|
| 1 (init)  | C     | —             | 10        | —   |
| 2         | A     | 11            | 3 (deferred) | 2 (both fixed in-round) |

Final grade: **A** (threshold B — met)
Iterations used: 2 / 2
Exit reason: converged
Status: **APPROVED**
human_review_needed: **false**
Counters: unreviewed 3 · prior-fix 2 · unattributed 0

Verification: `npm run verify` GREEN — typecheck, build, **308 unit**, **66 e2e**,
**4 pwa-e2e**. The last three fixes (notice stack, `aria-label`, draft drain) landed
after the re-review that prompted them and are counted `unreviewed`.
