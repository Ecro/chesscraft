---
type: review
task_slug: ui-ux-productization
status: APPROVED
created: 2026-08-06
reviewers_invoked: [code-reviewer, ux-reviewer, codex]
consensus_method: single + cross-model voter
grade_threshold: B
final_grade: A
human_review_needed: false
subject: staged Phase 8 (uncommitted, against 6761949)
second_opinion_results:
  - model: codex
    status: invoked
    reason: null
    findings: 1
    dispositions: { accepted: 1, rejected: 0, duplicate: 0, unresolved: 0 }
drift_verdict:
  result: scope_violation
  scope_violations:
    - src/ui/MatchHost.tsx
    - src/ui/App.tsx
    - src/ui/Home.tsx
    - src/ui/Rules.tsx
    - src/ui/Coach.tsx
    - src/content/sets/bundled.ts
    - tests/content/bundled.test.ts
    - tests/ui/board-render.test.tsx
    - tests/ui/chrome-i18n.test.tsx
    - tests/ui/i18n.test.ts
    - tests/ui/match-lifecycle.test.tsx
    - e2e/board-render.spec.ts
  scenario_misses: []
  task_slug: ui-ux-productization
  computed_at: 2026-08-06T14:20:00Z
---

# REVIEW — Phase 8 (`strings` overlay, key derivation, rename primitive)

## 🎯 Round Summary

| Round | Grade | Fixes | Remaining | New |
|---|---|---|---|---|
| 1 (init) | **B** | — | 1 P1 · 2 P2 | — |
| 2 (auto-fix) | **A** | 3 | 1 P2 deferred | 0 |

The P1 came from the **cross-model voter, not from either Claude reviewer** — and one
of the Claude reviewers had explicitly cleared the exact lines it names. That
disagreement is the most important thing in this document; see below.

## 🔍 Drift Findings

**`scope_violation`, and it is the fifth time in this PLAN.** Twelve changed files sit
outside Phase 8's own scope list. Every one is traceable to the phase's central decision,
and the PLAN priced that decision itself: *"Risk: high — `translate`'s signature change
touches every rendering call site."*

- The five UI components **carry** the signature change. Removing the bare `translate`
  export is what makes a missed call site a compile error instead of a silent wrong render,
  so "every call site changes" is the mechanism, not a side effect.
- `src/content/sets/bundled.ts` moved to `schemaVersion: 6` because an existing assertion
  (`board-render.test.tsx:138`) requires the shipped document to declare the current
  version.
- The six test/e2e files held stale `translate` imports.

No scope item went unimplemented. This is `[fail:design] phase-scope-omits-wiring` again:
scope lists name **outcomes** and omit the files that carry them. Phases 4 and 5 are still
the only two in this PLAN whose drift came back `clean`, and both got there by re-deriving
scope from reachability rather than from prose.

## ✅ Findings — round 1

| # | Sev | Source | Tag | Finding | Fix |
|---|---|---|---|---|---|
| 1 | **P1** | codex | consensus-passed | **A stale editor buffer could silently destroy an unrelated record.** When `openedId` named a record the document no longer had AND the author had typed an id that already belonged to a *different* record, `matchId` fell back to the draft's own id, `findIndex` found that other record, and the save **replaced it and validated**. The author saw a successful save; someone else's piece was gone with no report anywhere. | `openedId` alone now decides which record is replaced — `list.findIndex((r) => idOf(r) === (openedId ?? id))`. A stale id matches nothing, the record is pushed, and `loadContentSet` refuses the document with `duplicate id <x>`. Refusing a stale save is the honest answer. |
| 2 | P2 | code | manual-only | The PLAN's **Technical Design** table still described `translate(key, content?, locale?)` and put `strings` at v4. Phase 9a's `depends_on: [8]` reasoning cites that row, so a reader wiring 9a would work from an API shape that no longer exists. | Table corrected to `makeTranslate(strings?, locale?) => Translate` + `TranslateContext`, and to v6, with the reason the bare export is gone. |
| 3 | P2 | ux | manual-only | **Partial-overlay incoherence has no guard.** `writeString` writes one field at a time, so a child can override a piece's name while its description stays the shipped bundle's, with nothing on screen distinguishing authored from shipped text. | **Deferred.** No production caller exists yet and nothing in the app can produce the state; it becomes reachable the moment Phase 9a's form lands. Recorded there rather than fixed here. |

## 🤝 Disagreements — and why measurement settled it

`code-reviewer` returned **zero P0/P1** and, on the exact lines finding #1 names, wrote:

> the `matchId` fallback, the `matchId !== id` rekey gate, the stale-`openedId`-append
> path, and base immutability on both the accept and reject paths all check out against
> the seven cases in `tests/editor/rename.test.ts`.

That statement is **true and irrelevant**, and the gap between those two things is the
lesson. It validated the code against the tests — and none of the seven cases collided, so
the tests were structurally incapable of showing the defect. A clearance derived from a
test suite inherits every blind spot that suite has.

`codex`, reviewing the same diff with no access to the other reviewer's verdict, named it
directly. Rather than take either verdict on authority, the claim was **executed**: a
probe built a document containing `piece.hare`, then committed a draft opened under a
deleted `piece.gone` and typed as `piece.hare`. Result:

```
ok = true
hare count = 1
hare movement = [{"kind":"step","vectors":[[0,9]]}]
```

The save succeeded and the original record's movement was replaced. The finding is
CONFIRMED by execution, and the Claude reviewer's clearance would have shipped it.

**Consensus note.** By the surface-match filter alone, a single cross-model voice is
`manual-only` and would not have lowered the grade — it would have set
`human_review_needed` and stopped. It is tagged `consensus-passed` here on the strength of
the Step 3.6 oracle: the finding was independently reproduced by running it, which is a
stronger agreeing voice than a second opinion. A reproduction outranks a vote.

## Found while fixing

The round-1 code carried a comment claiming the stale path *"appends rather than silently
dropping the save"*. It appends only when the typed id is free; when it collides it
replaces. That is `[fail:design] comment-claims-unbuilt-safeguard` — a safeguard asserted
in prose and absent from the code — recorded in this repo and written again here.

## Found while re-reviewing

The round-2 re-review cleared the fix and raised one P2: the **replace** path's collision
(open a record, rename it onto an id a *third* record already owns) had no test, and the
reviewer said plainly that it had verified that path **by inspection**.

That is the same instrument that cleared the original defect — true about the code it read,
blind to the case no test reached. So the case was written and run rather than accepted:
`commitDraft(source, 'piece', {...rabbit, id: 'piece.king'}, 'piece.rabbit')` returns
`ok: false` with `duplicate id piece.king` and leaves the base document untouched. The
inspection was right this time. It is now measured, which is a different thing.

## Deferred

| Sev | Finding | Why |
|---|---|---|
| P2 | Partial-overlay incoherence (name authored, description shipped) has no on-screen cue. | Unreachable through any UI in this phase; `deriveKey`/`writeString` have no production caller. Belongs to Phase 9a's form, which is where the state first becomes producible. |
| — | `deriveKey` / `writeString` / `dropStrings` have no production caller. | The PLAN's own split (`Scope out: editor UI changes — Phase 9 owns that`). Declared, not hidden — but a primitive shipped ahead of its consumer can drift from what that consumer needs. |
| — | `.worktrees/` is not in `.gitignore`, and a stale worktree directory exists. | Out of this phase's scope. A `git add -A` at wrapup would commit a nested checkout; wrapup must handle it. |

## Review Iteration Summary

| Iteration | Grade | Fixes Applied | Remaining | New |
|-----------|-------|---------------|-----------|-----|
| 1 (init)  | B     | —             | 3         | —   |
| 2         | A     | 3             | 1 (deferred) | 0 |

Final grade: **A** (threshold B — met)
Iterations used: 2 / 2
Exit reason: converged
Status: **APPROVED**
human_review_needed: **false**
Counters: unreviewed 0 · prior-fix 0 · unattributed 0

Verification after fixes: `npm run verify` GREEN — typecheck, build, **346 unit**,
**66 e2e**, **4 pwa-e2e**.

## 🧊 Cross-model findings (frozen @ round 1)

| id | model | severity | file:line | disposition | status | summary |
|---|---|---|---|---|---|---|
| `7abfa5d7b1414055` | codex | P1 | `src/editor/draft.ts:148` | accepted | **fixed (round 2)** | A stale rename can silently overwrite a different record. The stated fallback promises to append when `openedId` no longer exists, but retains legacy replace-by-draft-ID behaviour; when the draft's new id is already present, the save validates while destroying that record. |

Oracle for the `accepted` disposition: direct execution of the described case against the
round-1 code (probe output reproduced above). Not a re-reading — a run.
