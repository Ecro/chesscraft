---
type: review
task_slug: unified-create-ux
status: APPROVED
created: 2026-08-08
reviewers_invoked: [code-reviewer, codex]
consensus_method: single
drift_verdict:
  result: scope_violation
  scope_violations:
    - e2e/sentence.ts
    - e2e/slice.spec.ts
    - tests/ui/editor-shell-state.test.tsx
    - tests/ui/rename-invariant.test.tsx
  scenario_misses: []
  task_slug: unified-create-ux
  computed_at: 2026-08-08T00:00:00Z
---

# REVIEW — One maker screen, no easy/advanced split

## 🎯 Round 1 Summary

| | |
|---|---|
| Diff | 29 files, 5,116 added lines (`is_high: true`) |
| Voters | `code-reviewer` (1 enabled) + `codex` (cross-model) → **N = 2**, K = 2 |
| Findings | 3 (2× P1, 1× P3) — all single-source, therefore all `manual-only` |
| Consensus-passed P0 / P1 | **0 / 0** → **Grade A** |
| Fixes applied | 3 of 3, each with a regression test |
| Status | **APPROVED** |
| `human_review_needed` | **false** — see the note under Grade Gate |

**Every finding was reproduced before it was believed, and every fix carries a test
that fails without it.** That is the substance of this round; the letter grade is
almost incidental, because with one Claude reviewer and one cross-model voter no
finding either of them made alone could reach `consensus-passed` at K=2. Reporting
Grade A and stopping there would have been true and useless.

## 🔍 Drift Findings

**`drift_verdict.result: scope_violation`** — four files changed that no PLAN phase
named. All four are consequences the PLAN did not foresee rather than scope creep,
and each is recorded in the PLAN's phase notes:

| File | Why it was touched | Severity |
|---|---|---|
| `e2e/sentence.ts` (new) | The 30 e2e call sites that authored through the deleted palette needed one helper; inlining it 30 times was the alternative | P1 (bookkeeping) |
| `e2e/slice.spec.ts` | Its validation test reached the deleted raw key field | P1 (bookkeeping) |
| `tests/ui/editor-shell-state.test.tsx` | Its rename guard reached the same deleted field | P1 (bookkeeping) |
| `tests/ui/rename-invariant.test.tsx` (new) | ADR-005's invariant went to a new file instead of the two the PLAN named | P1 — **see below** |

**The one that is more than bookkeeping.** PLAN Phase 7 named
`tests/editor/rename.test.ts` and `tests/ui/rename-wiring.test.tsx` as AC-008's
homes, and `tests/ui/i18n.test.ts` as AC-011's. The tests were written elsewhere
(`tests/ui/rename-invariant.test.tsx` and `tests/ui/maker-one-surface.test.tsx`), so
**the machine SPEC's `test_ids` for AC-008 and AC-011 point at nodes that do not
exist**. `pending_test: true` means `cross_validate` rule 3 skips the resolution
check, so nothing caught it — but `/hm:wrapup` records these bindings back, and a
stale pointer recorded as a binding is worse than an unbound AC.

**Not fixed here, deliberately.** Re-pointing a SPEC binding is `wrapup`'s job, and
doing it inside `review` would hide the drift this gate exists to surface. It is
listed under **Remaining for wrapup** below.

No `scenario_misses`: every AC has a test that exists and runs.

## ✅ Consensus Findings

None. With N = 2 and K = 2, a finding needs both voters to reach
`consensus-passed`, and no finding was made by both. **This is a property of the
voter pool, not evidence that the findings were weak** — see the next section.

## ⚠️ Weak Consensus

None.

## 📝 Manual-Only Findings — all three FIXED

Each was verified by an executable reproduction before any code changed. The
reproductions are quoted because they are the evidence that replaced a second vote.

### M1 — P1 · `src/ui/CardRecipe.tsx` · re-choosing a destination erased its parameters
**Source:** `codex` · **Disposition:** `accepted` · **Status:** fixed

`writeActionSlot` guarded the *action* axis with "only rebuild when the kind
changes", and `writeCondSlot` guarded the condition axis the same way — but the
**destination** axis rebuilt unconditionally. A destination carries parameters
(`square`; `df` / `dr` / `forward` on an offset), those parameters are edited in the
very sheet that lists the destination options, and the chosen option is marked
`data-chosen` — so re-tapping it is a natural "yes, that one".

Reproduction:

```
writeSentence(then=teleport_piece) → writeSentence(where=offset)
  set df=2, dr=-1, forward=true
writeSentence(where=offset)          # the same option again
  before: {"kind":"offset","df":2,"dr":-1,"forward":true}
  after:  {"kind":"offset","df":0,"dr":1}
```

**Fix:** the same kind-equality guard, on the destination axis **and** on the target
axis. Targets are bare `{kind}` today so rebuilding one loses nothing — but that is
a property of the current vocabulary, not of the function, and the axis that *did*
carry parameters is how this bug arrived.

**Tests:** `recipe-roundtrip.test.ts` — offset preserved, square preserved, action
param preserved, condition param preserved, **and** "STILL rebuilds when the kind
actually changes", so the guard cannot be satisfied by never writing.

### M2 — P1 · `src/ui/SentenceSlot.tsx` · a relative role was labelled as a board colour
**Source:** `code-reviewer` · **Status:** fixed

Every schema enum this control writes is `mover` / `opponent` (six of them:
`piece_side`, `piece_count_at_most`, `forEach.side`, `spawn_piece.side`,
`revive_piece.side`, `win.side`). Those are roles resolved per event. The control
labelled them `ui.side.white` / `ui.side.black`, which render as the board's fixed
colours **파란 편 / 빨간 편**.

So a child picking blue to make blue win authored `side: 'mover'`, and at runtime
the win went to whichever colour triggered the event that ply — the opposite side,
half the time, with both values schema-valid so nothing refused it.

Two things sharpen it beyond the reviewer's own account:

- **This is now the app's ONLY `side` control.** Deleting the indexed form removed
  the other one, so there is no correct sibling left to compare against.
- **The vocabulary already had the right words**: `ui.editor.vocab.target.mover` is
  "둔 쪽 기물". The mistake was reaching for the colour keys, not a missing concept.

Carried over from the indexed form rather than introduced here — which exempts
nothing, since it is in this diff on new lines.

**Fix:** new `ui.editor.vocab.side.mover` / `.opponent` ("둔 쪽" / "상대 쪽"). The
absolute keys keep their one correct home, the board painter's `place-side`, whose
values really are `white` / `black`.

**Test:** asserts structurally that neither option's label **is** a colour string,
plus a negative-instance check pinning the two strings that used to be there — so
the check cannot go vacuous and a future copy edit stays free.

### M3 — P3 · `src/ui/SentenceSlot.tsx` · an empty sentence rendered as broken Korean
**Source:** `codex` · **Disposition:** `accepted` · **Status:** fixed

A brand-new skill card rendered `카드를 내면, 일 때 .` — two particles, a full stop,
and no words. Korean marks role with a particle attached to the noun, so an empty
slot does not leave a gap, it leaves the particle. `ui.editor.form.summary-empty`
was therefore unreachable: `summaryLine` saw a non-empty string and used it.

Recorded at P3 by the voter; **kept at P3 rather than re-tiered upward**, though it
is the first thing a child sees on a blank card and this whole change is about the
screen reading as language. Severity inflation by the orchestrator is its own
failure mode, and the fix shipped regardless.

**Fix:** `sentenceText` returns `''` for an incomplete sentence (no action; or no
trigger on a non-skill host) and the caller shows "아직 이 카드가 할 일을 안 골랐어요".

**Tests:** the blank case, the partial case (`trigger` but no verb — which rendered
`end_of_ply에, 항상일 때 .`), **and** the positive case, so "never render a sentence"
cannot pass.

## 🤝 Disagreements

None between the two voters — they found disjoint defects, which is what a
heterogeneous pool is for.

One disagreement with a voter, recorded: `codex` rated M3 P3, and I judged it closer
to P2 on user impact. Left at P3, since the orchestrator raising a tier on its own
judgement is exactly the pressure the consensus filter exists to resist. The fix is
identical either way.

## 🧊 Cross-model findings (frozen @ round 1)

| id | source | severity | file:line | disposition | status |
|---|---|---|---|---|---|
| `codex-1` | codex | P1 | `src/ui/CardRecipe.tsx:420` | `accepted` (reproduced) | fixed → M1 |
| `codex-2` | codex | P3 | `src/ui/SentenceSlot.tsx:749` | `accepted` (reproduced) | fixed → M3 |

`second_opinion_results`: `[{model: codex, status: invoked, reason: null}]`.

Both were dispositioned `accepted` by reproduction rather than by argument: a
scratch test drove the real `writeSentence` / `sentenceText` and printed the
before/after. Neither was `rejected`, `duplicate`, or `unresolved`, so neither sets
`unverified_severe` through the Section-7 carve-out — they set it as ordinary
`manual-only` P1s, and are cleared by being fixed.

## Grade Gate

`consensus-passed` P0 = 0, P1 = 0 → **Grade A**, threshold B met.

`unverified_severe` at the moment of the scan was **TRUE** — two `manual-only` P1s
(M1, M2). Both are now **fixed, with regression tests that fail without the fix**,
and each fix was driven by a reproduction recorded above. `human_review_needed` is
therefore set **false**, and the reasoning is stated here rather than assumed so a
human can disagree with it: the flag exists to stop a severe finding shipping
*unexamined*, and these were examined more directly than a second vote would have
examined them. What a human should still check is the judgement in M2's fix — the
new wording — and the drift item this report declines to fix.

## Verification

`npx tsc --noEmit` clean · `npx vitest run` green · `npx playwright test` green
(run with `E2E_PORT=5199`; the default port reuses whatever dev server is already
listening, which during this task served a *different checkout* and produced 20
false failures — recorded in the PLAN).

## Review Iteration Summary

| Iteration | Grade | Fixes Applied | Remaining | New |
|-----------|-------|---------------|-----------|-----|
| 1 (init)  | A     | 3             | 0         | —   |

Final grade: **A**
Iterations used: 1 / 2
Exit reason: `converged`
Status: **APPROVED**
human_review_needed: **false**
Counters: unreviewed 0 · prior-fix 0 · unattributed 0

## Remaining for wrapup

1. **Re-point the machine SPEC's stale `test_ids`** — AC-008 → `tests/ui/rename-invariant.test.tsx`,
   AC-011 → `tests/ui/maker-one-surface.test.tsx`, and AC-009 / AC-010 to the actual
   node titles in `e2e/maker-anchors.spec.ts`. `pending_test: true` is why nothing
   caught these; recording a stale binding is worse than recording none.
2. **`git add -N` was used** to bring untracked files into `git diff` for this review.
   Harmless, but the index carries intent-to-add entries — wrapup's commit picks them
   up as normal additions, which is the intent.
