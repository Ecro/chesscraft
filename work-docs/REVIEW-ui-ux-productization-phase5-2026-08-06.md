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
drift_verdict:
  result: clean
  scope_violations: []
  scenario_misses: []
  task_slug: ui-ux-productization
  computed_at: 2026-08-06T08:40:00Z
---

# REVIEW — PLAN Phase 5 (animation, last-move, drag, sound, haptics)

## 🎯 Round Summary

| Round | Grade | Fixes applied | Remaining | New |
|---|---|---|---|---|
| 1 (init) | F | — | 5 P1 · 2 P2 · 1 P3 | — |
| 2 (auto-fix) | A | 7 | 2 deferred to Phase 6 | 0 |

## 🔍 Drift Findings

**`result: clean` — second consecutive phase.** All nine changed files were in
the re-derived scope, including the three the original one-line scope had
missed: `playwright.config.ts`, `settings.ts`, and the motion tokens. Phases 1-3
each drifted; the two phases whose scope was re-derived by tracing reachability
have not.

## 📝 Findings

### Fixed this round

| # | Sev | Source | Finding | Fix |
|---|---|---|---|---|
| 1 | **P1** | code-reviewer **+** ux-reviewer (second cross-reviewer agreement of the cycle) | **Drag was built on HTML5 drag-and-drop, which iOS Safari does not dispatch for a touch gesture** and Android supports inconsistently — on a product whose entire premise is two children sharing one phone. **And the e2e passed**, because Playwright's `dragTo` synthesises mouse events: a test certifying a gesture no finger can perform. | Rebuilt on pointer events, which cover mouse, touch and stylus with one path. The e2e drives `mouse.down/move/up`, which raise the same pointer events a finger does, so it now exercises the real path. |
| 2 | P1 | ux-reviewer | **The last-move highlight was silently overridden** by `.square[data-square-type]:not([data-square-type=''])`, which outranks `.square[data-last]` on specificity — so the highlight vanished exactly when a piece landed on a portal or a shrine, the turn a child most needs to see two things at once. | An inset `box-shadow` instead of a `background`, which composes with any fill rather than competing for it. |
| 3 | P1 | code-reviewer | **`onDragStart` set `selected` with no `pendingCard` guard.** Starting a drag mid card-target sequence left a stale selection that painted legal-move highlights on a square the player never chose, once the card resolved. | `beginDrag` refuses while a card is choosing targets. |
| 4 | P1 | code-reviewer | **A draw sounded exactly like a win.** The event was picked with `next.result ? 'win' : …` and `result` is merely truthy for both endings — so a drawn match played the victory tone and its 40ms buzz. Neither ending had any test. | A `draw` event with its own lower, flatter tone; the choice moved into an exported pure `eventFor`, and a new describe asserts every branch including "an ending outranks what the move otherwise was". |
| 5 | P1 | ux-reviewer | **`소리 끔` reads as either "sound is off" or "turn sound off"** — the classic toggle ambiguity, and for this audience the wrong reading means tapping and hearing nothing happen. | `소리: 꺼짐`. The colon makes it a status, unambiguously. |
| 6 | P2 | code-reviewer | `push` derived the next state from the render's `state` rather than inside the functional updater — latent, not currently reachable, but a regression in robustness versus the form it replaced. | State is recomputed inside the updater; only the *sound* is chosen from the render's state, where the worst case is the wrong tone. |
| 7 | P3 | code-reviewer | Reduced motion zeroed durations to exactly `0s`, which some engines treat as "no animation" and leave the `from` keyframe applied. | `0.01ms`. |

### Found while fixing

The `draw` event I added to fix #4 immediately failed the reachability test,
because nothing drives a draw through the component. The tempting fix was to
grow the exclusion list — one round after shrinking it on the principle that an
exclusion is only honest if every entry has been re-checked. Instead `eventFor`
became a pure exported function and its branches are asserted directly, so the
exclusion is now a routing detail rather than a coverage hole.

The chrome-i18n scanner also false-positived on `, after:` — a multi-line
TypeScript signature sits between a `}` and a `{`, which is the same shape as a
JSX text node to that regex. Filter widened.

### Deferred to Phase 6 (which owns layout)

| Sev | Finding |
|---|---|
| P2 | The control row is now six controls — seed, copy, sound, haptics, new-match, home — plus undo above, unstructured on a 360px phone. Phase 4's review already deferred this row's layout to Phase 6; grouping the two toggles behind one settings affordance belongs with that work, not shuffled twice. |
| P2 | `piece-land` was a scale-only pop. Now offset toward the origin square via `--land-dx/dy`, so it reads as arrival — but whether it is perceptible at ~55px squares still wants a device. |

## 🤝 Disagreements

None. The two reviewers converged on the drag defect from opposite directions —
one traced the DnD API against the platform, the other asked what happens when a
child puts a finger on a piece. That is the second convergence of the cycle;
before Phase 4 every round produced disjoint sets.

## Review Iteration Summary

| Iteration | Grade | Fixes Applied | Remaining | New |
|-----------|-------|---------------|-----------|-----|
| 1 (init)  | F     | —             | 8         | —   |
| 2         | A     | 7             | 2 (deferred) | 0 |

Final grade: **A** (threshold B — met)
Iterations used: 2 / 2
Exit reason: converged
Status: **APPROVED**
human_review_needed: **false**

Verification after fixes: `npm run verify` GREEN — typecheck, build, 291 unit
tests, 45 Playwright tests.
