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
subject_commit: 63b9a1b
drift_verdict:
  result: clean
  scope_violations: []
  scenario_misses: []
  task_slug: ui-ux-productization
  computed_at: 2026-08-06T11:55:00Z
---

# REVIEW — commit 63b9a1b (Phase 6a + the user-directed follow-up)

Reviewed **after** the work was committed, not before. `/hm:wrapup` landed
`63b9a1b` gating on Phase 5's drift verdict because no review existed for either
unit in it — this document is that missing review, run on the commit rather than
on a working tree.

## 🎯 Round Summary

| Round | Grade | Fixes applied | Remaining | New |
|---|---|---|---|---|
| 1 (init) | **C** | — | 4 P1 · 5 P2 · 1 P3 | — |
| 2 (auto-fix) | **A** | 12 | 2 P2 deferred | 0 |

## 🔍 Drift Findings

`result: clean` — no changed file falls outside the union of the PLAN's Phase 6a
and Phase 6a+ scope blocks. Two qualifications, both of which matter more than
the verdict:

**The verdict is worth less than it looks.** The Phase 6a+ scope block was
written *after* the code, during wrapup. A scope authored from a finished diff
cannot fail a comparison against that diff, so for roughly half this commit —
the schema-v5 icon work, the layout inversion, the draft sheet — the gate
returned `clean` by construction and detected nothing. The 6a half is a real
check; the 6a+ half is not. This is the `[fail:design] phase-scope-omits-wiring`
family pointed at its own gate.

**Two test files are in no scope block.** `e2e/board-render.spec.ts` (Phase 4's)
and `tests/ui/game-feel.test.tsx` (Phase 5's) changed. Both edits are *forced* by
in-scope changes — 6a re-measures Phase 4's contrast table, and the new
`--motion-card-duration` token is caught by game-feel's "every declared duration
is zeroed under reduced motion" assertion. Recorded as a scope-writing omission,
not a violation.

**One incomplete-phase candidate, resolved.** 6a's scope names `Home.tsx`,
`Rules.tsx` and `Coach.tsx`; none changed. The 44px and focus requirements reach
them through `:where(nav, .home, .coach, .rules, .play) :is(button, select)`
without an edit. Achieved by other means, not skipped.

## ✅ Findings — fixed this round

| # | Sev | Source | Finding | Fix |
|---|---|---|---|---|
| 1 | **P1** | code-reviewer | **`:focus-visible` erased the last-move ring.** `.square[data-last]` and `.square:focus-visible` are both specificity (0,2,0) and both set `box-shadow`; focus is later in the file, so it *replaced* rather than composed. Tabbing onto the square a piece had just landed on deleted the only record of the move — and the comment two lines above claims to have just solved exactly this hazard for `outline`. The fix was checked against the cues it was written for, not against every rule sharing the property. | A `.square[data-last]:focus-visible` rule carrying both rings. Re-review then found the 3-layer version had a dead middle layer (an earlier inset paints over a later one at the same origin); reduced to the two that actually render. |
| 2 | **P1** | code-reviewer | **`pieceGlyph` could paint a raw i18n key on the board.** `if (def.iconKey) return translate(def.iconKey)` — and `translate` echoes an unresolved key. `iconOf`, added in the same commit for the other three content kinds, guards this; the piece path — the glyph drawn largest, in the centre of the square — was the one left open. Reachable today through an imported document, and through the editor once Phase 9 grows the control. | Falls through to the monogram when the icon key does not resolve. |
| 3 | **P1** | ux-reviewer | **The turn was never announced.** No `aria-live` anywhere in `src/`. React swaps the text inside the same node, which a screen reader announces nothing for, so a non-visual player had to re-navigate to the status row after every move to learn it was their turn — on the one signal the PLAN calls "the ONLY thing two players need from the chrome". | `role="status" aria-live="polite"` on the turn span. |
| 4 | **P1** | ux-reviewer | **The legend omitted the icon.** A child sees a badge in a square's corner and comes to the legend to decode it — and the legend showed the name and the prose and not the badge. `title` does not fire on touch and the aria-label is screen-reader-only, so that list is the only visual cross-reference a sighted player has. The v5 feature's stated purpose, undercut in the exact screen built to serve it. | `iconOf(type)` rendered in each legend row, and in `Rules.tsx` too — the only place to look an icon up *before* a match. |
| 5 | **P1** | ux-reviewer | **`role="grid"` owned no `role="row"`**, and `role="gridcell"` sat on a native `<button>` (not an allowed role for that element). 36 cells with no row or column context. The 6a exit criterion asserts the attributes are *present* in the DOM, which a flat grid satisfies while doing nothing for the AT it exists for — `[fail:design] declared-but-inert-vocabulary`. | Row wrappers at `display: contents`, so the a11y tree gains a level and the layout does not. |
| 6 | P2 | code-reviewer | `.play:has(.draft-scrim)` — `:has()` is Chrome 105 / Safari 15.4. On an older WebView (the audience is children on whatever phone the household had) the rule silently never matches and the tools row goes unreachable behind the sheet again, invisible to a modern CI browser. | `data-drafting` written from the component's own `phase`. The DOM never needed to be asked. |
| 7 | P2 | ux-reviewer | The draft sheet had no dialog semantics. | `role="dialog"` + label. Deliberately **no** `aria-modal` — the scrim passes pointers through by design, so claiming modality would describe a containment that does not exist. |
| 8 | P2 | ux-reviewer | In dark theme `--color-focus-ring`, `--color-side-white` and `--color-selected` were all `#93c5fd` — turn outline, selection and focus drawing one blue. | Selection separated to amber, then (see below) rebuilt entirely. |
| 9 | P2 | ux-reviewer | 🌀 (portal) and 🕸️ (mire) are both irregular round lattices — the two hardest to tell apart at the 12px occupied-square badge size, for two mechanics that are opposite in urgency. | Mire → ⚓, a distinct silhouette that still reads as "held in place". |
| 10 | P2 | code-reviewer | `schema.ts`'s version-history block enumerated every bump except 3 → 4. | Added. |
| 11 | P3 | ux-reviewer | `Rules.tsx` had no icon surface. | Folded into #4. |

## Found while fixing

Re-review of fix #8 measured what the amber actually achieves and the answer
changed the fix. Against the four dark-theme fills a selection ring can land on
— `#3a352c`, `#8d8269`, and the two painted violets — **no single colour clears
3:1**: amber gets 7.29:1 on the dark tile and 1.58:1 on the painted one, white
gets 12.17 and 2.63, near-black gets 1.52 and 7.04. Every candidate wins at one
end of the range and loses at the other, which is the signature of a cue that
needs two tones rather than a better hex. Selection is now sandwiched between
`--color-cue-lo` and `--color-cue-hi` exactly as the legal dot is, on `::before`
rather than `box-shadow` — because `data-last` and `:focus-visible` already
contend for that property, and a third claimant is how finding #1 happened.

That is the second time in two rounds that `[fail:render] contrast-set-not-closed-over-cues`
has been the real shape behind a finding.

## Deferred

| Sev | Finding | Why not now |
|---|---|---|
| P2 | The tools row sits below board + trays + legend with no "more below" affordance; a child who never scrolls will not find 새 판 / 소리 / 진동 / 보드 돌리기. | A scroll cue is a design change that wants a device and an eye, not a guess. Belongs with Phase 6b, which owns layout. |
| P2 | `display: contents` + `role="row"` has a history of dropping elements from the a11y tree on older engines — the same class of platform gap that made `:has()` unusable here (#6), and unverifiable in CI. | Needs VoiceOver/TalkBack on a real minimum-support device. Recorded rather than guessed at. |

## 🤝 Disagreements

None between the two reviewers — they found disjoint sets this round, with no
overlapping location. Worth noting against the earlier rounds of this task, where
the two converged twice and the converged finding was the most severe both times;
no such convergence here.

One disagreement between the reviewers and this stage: `pieceGlyph` (#2) was
filed P1, and it is currently unreachable — the bundled keys all resolve and the
editor has no icon control until Phase 9. It was fixed at P1 anyway rather than
argued down, because the author of the code and the grader of the finding are the
same process here and a self-serving downgrade is the cheaper error.

## Review Iteration Summary

| Iteration | Grade | Fixes Applied | Remaining | New |
|-----------|-------|---------------|-----------|-----|
| 1 (init)  | C     | —             | 10        | —   |
| 2         | A     | 12            | 2 (deferred) | 0 |

Final grade: **A** (threshold B — met)
Iterations used: 2 / 2
Exit reason: converged
Status: **APPROVED**
human_review_needed: **false**
Counters: unreviewed 2 · prior-fix 0 · unattributed 0

Verification after fixes: typecheck, build, **291 unit**, **56 Playwright** — all
GREEN. The last two fixes (the shadow-layer reduction and the selection sandwich)
were applied after the re-review that prompted them and are counted as
`unreviewed`.

## Note recorded for the next planning pass

Raised by the user during this round, and larger than anything above: the product
model. `presetDef` is `{ boardId, pieceIds[], ruleCardIds[], skillCardIds[] }` —
structurally already the "room" the product is supposed to be about — but it is
presented as one of six flat record kinds in the editor and as a three-item
dropdown labelled 놀이 고르기 on Home, which reads as *choose a different game*.
There is no room list, and sharing is whole-content-set export/import (AC-015),
so a room cannot be handed to a friend without overwriting theirs. This does not
change any finding here; it means **Phases 9 and 10 are written along the wrong
axis** ("make the editor pleasant to use" rather than "make, keep and share
rooms") and should be re-planned before they are executed.
