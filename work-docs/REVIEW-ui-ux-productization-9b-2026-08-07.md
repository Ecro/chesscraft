---
type: review
task_slug: ui-ux-productization
status: APPROVED
created: 2026-08-07
phase: 9b
reviewers_invoked: [code-reviewer, codex]
consensus_method: cross-check
run_id: 20260806T1611Z
grade_threshold: B
max_review_rounds: 2
drift_verdict:
  result: clean
  scope_violations: []
  scenario_misses: []
  task_slug: ui-ux-productization
  computed_at: 2026-08-07T01:05:00Z
second_opinion_results:
  - model: codex
    status: invoked
    reason: null
    findings_n: 4
    dispositions: { accepted: 4, rejected: 0, duplicate: 0, unresolved: 0 }
---

# REVIEW — ui-ux-productization, PLAN phase 9b (deletion)

Scope: the phase-9b diff (9 files, +598 / −5), staged on `hm/ui-ux-productization` over
`475c77f`.

**Voter pool.** One Claude reviewer (`code-reviewer`) plus `codex`, so N = 2 at K = 2 — every
consensus cluster needs both voices, and anything one voice found alone is `manual-only` by
construction. Six of the seven findings below are `manual-only`. That ratio is not a comment
on their quality: every one of the four codex findings was accepted by the PIDA refutation
gate, and the code-reviewer's two singles are traced to source.

Single enabled Claude reviewer → the 2-pass redaction protocol was skipped; the reviewer ran
Pass 2 directly on the full context.

## 🎯 Round 1 Summary

| | |
|---|---|
| Grade | **B** (1 consensus-passed P1) |
| Consensus-passed | 1 (P1) |
| Manual-only | 6 (3 P1, 3 P2) |
| Auto-fix | not entered — grade already met the `B` threshold |
| `human_review_needed` | **true** |

**Every finding in this review is about the same seam**, and that is the most useful thing
it says: 9b's delete logic itself came through clean, and all seven findings live where a
delete meets state that phase 9a left mounted. `Edit.tsx` keeps both panels alive so a
half-built room survives a trip to the library — a deliberate, documented decision — and 9b
added an operation that can invalidate what those panels hold, without either panel learning
that anything happened. `deleteRecord`'s three gates were reviewed and no gate order defect
was found in them.

## 🔍 Drift Findings

`result: clean`. Three files changed that PLAN 9b does not name:

- **`src/ui/deleteMessage.ts`** — the exit criterion requires the refusal to contain the
  room's *name*, and both panels raise that refusal; a refusal worded differently in two
  places would read as two different rules, so it is one module.
- **`src/i18n/ko.ts`**, **`src/ui/styles.css`** — the copy and the styling that "the delete
  controls and the refusal message" necessarily bring with them.

Nothing in 9b's scope went unchanged. PLAN frontmatter carries no `common_ground_marks`, so
the Step 2.5 silent-intent-miss hook is a no-op.

**Oracle tooling (unchanged from the 9a review, recorded again because it is still true).**
`hm second_opinion_oracle` runs `uv run pytest` and `uv run ruff` only. On this TypeScript
repo it emitted `ERROR: not found: .../src/ui/EditorLibrary.tsx` and ruff `invalid-syntax`
from parsing TSX as Python — no usable oracle for any finding. The PIDA gate was given
fixed-command project evidence instead and told to treat the gatherer output as absent
rather than as refutation. Already recorded as a recurrence of
`[fail:tooling] spec-machine-binding-is-pytest-only`.

## ✅ Consensus Findings

### P1 · `e31efa66c5fc5237` + `9ad74738b8480085` — a delete leaves the form mounted on the record it just removed `[2/2]`

`src/ui/EditorLibrary.tsx:96-106`

Both voices reached the same execution risk by different routes, which is what makes this the
one cluster and also what makes a partial fix tempting:

- **code-reviewer:** `remove` resets the form only `if (open.id === id)`, and the shell's
  `library.id` is set only by `openInLibrary` — a save performed *inside* the form updates
  `RecordForm`'s own `openedId` and never tells the shell. `Edit.tsx:100`'s own comment
  already records this lag for a different consumer. So `editor-new` → fill → save → delete
  that row: the reset never runs.
- **codex:** even when the check passes, `remove` calls `commit(result.source)` **before**
  `onOpen(...)`, and ignores `onOpen`'s return value. `openInLibrary` can refuse when the
  form is dirty — so accepting the delete confirm and then declining the discard prompt
  leaves the record deleted and the form still on it.

Either way the child is left editing a record the document no longer contains, with a live
save button, and finds out only from `ui.editor.form.stale` on the next save — a message
about a document race, not about a deletion they performed. The 9a stale-snapshot guard is
what prevents the save from resurrecting the record; it is not a substitute for telling them.

**Fixing one route leaves the other open**, which is exactly the shape of this repo's
`[fail:design] fix-scoped-to-the-cited-evidence` (count 4). The set here is "every way
`remove` can finish without the form being reset", and it has two members.

*Suggested:* have `RecordForm` report the id it actually holds so the shell's `library.id`
follows a save, and make the reset unconditional and ordered before the commit — a form
whose record is being deleted has nothing left to discard, so prompting about it is wrong
anyway.

## ⚠️ Weak Consensus

None.

## 📝 Manual-Only Findings

None of these lowered the grade. Three are P1 and all three were traced to source — the two
codex ones through the PIDA gate, which accepted all four of its inputs.

### P1 · `502af833c9f8e9fd` — a room can be deleted from the library while its own detail screen is open
`src/ui/EditorLibrary.tsx:96` · `src/editor/references.ts:64-65` (source: code-reviewer)

`roomsReferencing` returns `[]` unconditionally for `kind === 'preset'` — rooms do not
reference rooms — so `deleteRecord`'s only gate on a room is `last-room`. `EDITABLE_KINDS`
includes `preset`, so the library's kind picker lists rooms with delete buttons, and
`EditorLibrary.remove` knows only about its own open record. With two rooms: open room A in
the Rooms tab, switch to the library, pick kind `preset`, delete A. Back on the Rooms tab,
`RoomDetail` is still showing A's board and tick-lists with a live save button.

*Suggested:* keep `preset` out of what the library can delete — rooms already have their own
delete surface — or let `RoomDetail` notice the room it holds is gone and say so.

### P1 · `b2aec8b70d24cfff` — a library delete strands an unsaved room draft
`src/ui/RoomDetail.tsx` (source: codex, PIDA `accepted`)

`roomsReferencing` reads `source.presets` — the **committed** document — and has no
visibility into a `RoomDetail` draft held in component state. So: tick an otherwise-unused
piece into a room without saving, switch to the library, delete that piece (correctly
allowed — no committed room references it), come back. The draft still carries the id, its
checkbox is no longer rendered because `tickList` builds from the current source, so there is
no control that can remove it, and the save fails loader validation. The only way out is to
abandon the room edits.

This is the deeper version of the cluster above: the reference walk answers a question about
the document, and the editor now holds state that is not in the document yet.

### P1 · `b0e3a96053b697a1` — `dropStrings` on delete can take a live record's text, and leave the deleted one's
`src/editor/draft.ts` · `src/editor/strings.ts` (source: codex, PIDA `accepted`) — **disputed, see Disagreements**

`deleteRecord` calls `dropStrings(next.strings, id)`, which drops every overlay key starting
with `${id}.`. That is keyed on the record's **id**, not on the keys the record actually
points at — and since phase 9a the editor explicitly supports records whose `nameKey` does
not derive from their id (`slotFor` exists for exactly that). Given imported records
`A {id: 'piece.a', nameKey: 'shared.a'}` and `B {id: 'piece.b', nameKey: 'piece.a.name'}`,
deleting A leaves `shared.a` orphaned and removes `piece.a.name`, which B still points at —
so B renders a dotted key in a document the loader still accepts.

### P2 · `8ab3abf6fb44591d` — the refusal goes stale when the room is fixed in the other panel
`src/ui/EditorLibrary.tsx:74` (source: codex, PIDA `accepted`)

`refusal` is local state cleared only by library navigation or another delete attempt. Both
panels stay mounted, so removing the reference in the Rooms tab and coming back leaves the
paragraph still naming a room that no longer uses the record. It is not recomputed when
`source` changes.

### P2 · `162d41cc9ed8a98d` — the delete suite never exercises `kind: 'board'`
`tests/editor/delete.test.ts` (source: code-reviewer)

All eleven cases use `piece`, `squareType` or `preset`. `references.ts`'s
`case 'board': hit = room.boardId === id` is covered by `references.test.ts` but never
through `deleteRecord`.

*Suggested:* the two cases that mirror the existing piece/squareType pattern — a board a room
plays on is refused with that room named, and an unused second board deletes.

## 🤝 Disagreements

**`dropStrings` on delete — one voice flagged it P1, the other explicitly cleared it.**
This is the one place the two reviewers actively contradict each other rather than simply not
overlapping, and it is recorded rather than averaged.

- **codex (P1):** the drop is keyed on the record's id while the editor supports records
  whose keys live elsewhere, so a delete can take a sibling's text and leave its own.
- **code-reviewer (not a finding):** "`dropStrings`' dot-boundary prefix matching is safe
  because `contentId` (`schema.ts:95`) permits exactly one dot, so no id can nest inside
  another's namespace."

The clearance answers a **different question**. `contentId` is `/^[a-z]+\.[a-z0-9-]+$/`, so
it is true that no *id* nests inside another id's namespace. codex's scenario is not id
nesting — it is a record whose **`nameKey`** sits in another record's id-namespace, which the
schema permits (`i18nKey` has no such constraint) and which phase 9a made reachable through
the advanced key field. The rebuttal does not reach the scenario, so this is recorded as an
open P1 rather than as a cleared one — but a human should confirm the reachability judgement
before it is fixed, which is precisely what `human_review_needed` is for.

Explicitly checked and cleared by the reviewer, and NOT findings: `App`'s `presetId` /
`MatchHost` fallback when the selected room is deleted (`App.tsx:152-154` already falls back
to the first surviving preset); `deleteRecord`'s gate ORDER, over every record kind.

## 🧊 Cross-model findings (frozen @ round 1)

```yaml
frozen_at_round: 1
models: [codex]
findings:
  - id: 9ad74738b8480085
    source: codex
    severity: P1
    file: src/ui/EditorLibrary.tsx
    line: 104
    summary: >-
      Deleting the record open in a dirty form commits the delete before asking whether to
      discard the form; cancelling the discard leaves the record deleted and the form
      stranded on it.
    evidence: >-
      remove() commits the deletion and only afterward calls onOpen, whose return value is
      ignored; openInLibrary can refuse navigation when libraryDirty is true. The stale
      snapshot guard prevents resurrection but cannot restore the deleted record.
    needs_relaxation: false
    disposition: accepted
    oracle_result: >-
      remove() calls deleteRecord + commit before onOpen(); onOpen's discard-declined return
      is discarded, so a cancelled discard cannot undo the already-committed delete.
    status: resolved
    invalidation_reason: null
  - id: b0e3a96053b697a1
    source: codex
    severity: P1
    file: src/editor/draft.ts
    line: 258
    summary: >-
      Deletion can remove another live record's localized text and leak the deleted record's
      own, when keys do not derive from ids.
    evidence: >-
      deleteRecord unconditionally calls dropStrings(next.strings, id) while dropStrings
      removes keys by the ${id}. prefix rather than inspecting the deleted record's actual
      nameKey/textKey; the editor supports imported records with arbitrary key fields.
    needs_relaxation: false
    disposition: accepted
    oracle_result: >-
      dropStrings keys strictly on the deleted id's prefix; RecordForm's slotFor confirms
      imported text may key anywhere at all, so an id-prefix drop can remove a live sibling
      record's key.
    status: resolved
    invalidation_reason: null
  - id: 8ab3abf6fb44591d
    source: codex
    severity: P2
    file: src/ui/EditorLibrary.tsx
    line: 74
    summary: >-
      A reference refusal goes stale after the named room is fixed in the other mounted
      panel.
    evidence: >-
      Both panels remain mounted; refusal is local state cleared only by library navigation
      or another delete attempt, and is not recomputed when source changes.
    needs_relaxation: false
    disposition: accepted
    oracle_result: >-
      refusal is local useState cleared only inside remove()/openRecord(); both panels stay
      mounted, so a fix made via the Rooms panel never clears the stale refusal.
    status: resolved
    invalidation_reason: null
  - id: b2aec8b70d24cfff
    source: codex
    severity: P1
    file: src/ui/RoomDetail.tsx
    line: 142
    summary: >-
      A library delete can strand an unsaved room draft: the id survives in the draft with no
      rendered checkbox to remove it, and the save cannot succeed.
    evidence: >-
      RoomDetail renders checkboxes only from the current source collections while its draft
      persists hidden; a library deletion checks only committed room references.
    needs_relaxation: false
    disposition: accepted
    oracle_result: >-
      roomsReferencing iterates only source.presets (committed), never RoomDetail's local
      draft; RoomDetail stays mounted with its draft intact across a library delete.
    status: resolved
    invalidation_reason: null
```

## Iteration 2 — user-directed (Grade: B → A)

The auto-fix loop was never entered: it runs only below threshold, and B *is* the threshold.
The user then asked for all seven findings to be fixed, which is a directed pass rather than
an auto-fix round — recorded here so the loop's accounting does not read as seven findings
abandoned at a passing grade.

Fixes applied: 7 (as **one** answer, not seven patches)

| # | Severity | Summary | File | Status |
|---|----------|---------|------|--------|
| 1 | P1 | Form left on the deleted record (both routes: lagging `open.id`, and the ignored `onOpen` refusal) | `src/ui/EditorLibrary.tsx`, `src/ui/RecordForm.tsx`, `src/ui/Edit.tsx` | Applied · caused_by=none |
| 2 | P1 | A room deleted from the library while its detail screen is open | `src/ui/RoomDetail.tsx` | Applied · caused_by=none |
| 3 | P1 | A library delete stranding an unsaved room draft | `src/ui/RoomDetail.tsx` | Applied · caused_by=none |
| 4 | P1 | `dropStrings` taking a live record's text and leaving the deleted one's | `src/editor/draft.ts` | Applied · caused_by=none |
| 5 | P2 | Refusal going stale after the room let go | `src/ui/EditorLibrary.tsx`, `src/ui/EditorRooms.tsx` | Applied · caused_by=none |
| 6 | P2 | Delete suite never exercising `kind: 'board'` | `tests/editor/delete.test.ts` | Applied · caused_by=none |

**Answered once, at the level the findings actually shared.** Round 1's own summary said these
were one design question with several faces, so the fix names the rule rather than the cases:
*an open editor screen whose subject leaves the document notices it, says so at that moment,
stops pretending it can save, and never leaves the child holding state they cannot act on.*
Six of the seven fall out of that; the seventh (`dropStrings`) is a separate correctness bug
in the same commit.

- **The form reports the id it holds** (`onOpenedIdChange`), stamped with the `seq` it was
  reported under so a stale report from a previous form instance falls away on navigation
  instead of needing to be cleared. The shell could not derive this: a save made INSIDE the
  form moves that id while `open.id` is set only by navigation.
- **A delete of the record the form holds closes it before the commit, and does not ask.**
  There is nothing to discard when the buffer's subject is going with it. `onOpen` gained an
  explicit `force`, and the reason is worth keeping: clearing `libraryDirty` first and calling
  in normally does NOT work — React has not re-rendered, so the closure still reads the old
  `true` and prompts anyway. That is a real trap and the comment in `Edit.tsx` names it.
- **Both panels derive `subjectDeleted` / `roomDeleted` each render** and refuse with a
  message about the deletion rather than about a document race, with the save disabled. This
  is the display half 9a never wrote.
- **`RoomDetail` renders a row for anything its draft holds that the source no longer has**,
  strictly so it can be unticked. The delete itself was correct — `roomsReferencing` reads the
  committed document by design — but the room was left unsaveable with no control to fix it.
- **Refusals store the subject, not the sentence**, re-derived each render. A stored sentence
  is a fact frozen when it was true; both panels stay mounted, so the fact could outlive it.
- **`deleteRecord` drops overlay text by reachability.** It collects the keys the deleted
  record actually pointed at and drops only those nothing else points at. This degenerates to
  the old prefix answer whenever keys are derived, and stops being wrong when they are not.

Verification: `npm run verify` GREEN — typecheck + build + **397** vitest + 73 Playwright + 4
PWA. New coverage: `tests/ui/delete-open-state.test.tsx` (5) and four more cases in
`tests/editor/delete.test.ts` (11 → 15), including a key two records share and a record whose
keys sit in another record's namespace.

**The re-review of these fixes found no introduced defect**, and traced each of the pieces
that could plausibly have broken: `dropUnreferenced` computes reachability across ALL
collections rather than the deleted record's own; the bundled `ko` fallback is outside
`ContentStrings` and is never touched; `formHolds`'s `seq` comparison survives a rename
inside the form (a rename reports without bumping `seq`, which is exactly right); `force` has
one caller, gated on `formHolds === id`; and `subjectDeleted` / `roomDeleted` short-circuit on
a blank draft so a never-saved form cannot misfire the notice. It also went looking for a
third screen that could display a vanished subject and found none — `App`'s `presetId` already
substitutes the first surviving room, which is pre-existing and outside this diff.

**It did return one P2, and it was right.** The "a key two records share" case could not fail
against the pre-fix code: the shared key was `both.name`, which never matches the deleted
record's `piece.one.` prefix, so the old drop-by-prefix implementation would have kept it too
— for an unrelated reason. It documented the intent and guarded nothing. Rewritten so the
shared key sits INSIDE the deleted namespace (`piece.one.name`, pointed at by a surviving
`piece.two`), which is the one shape where the two implementations disagree.

**One thing the fix itself broke, found while checking my own work rather than by a reviewer.**
Replacing `dropStrings` with the reachability walk left `dropStrings` with no caller but its
own unit test — which is precisely the `[fail:design] declared-but-inert-vocabulary` shape
this phase's PLAN note had claimed to close, re-created by the fix for it, with the PLAN note
now asserting something false. `dropStrings` and its two tests were removed and the PLAN note
corrected. Unit count 397 → 395 for that reason, not a lost assertion.

Remaining: 0 | New issues introduced: 0 (1 found by the re-review of iteration 2, fixed within it)

## Review Iteration Summary

| Iteration | Grade | Fixes Applied | Remaining | New |
|-----------|-------|---------------|-----------|-----|
| 1 (init)  | B     | —             | 7         | —   |
| 2 (user-directed) | A | 7         | 0         | 0   |

Final grade: **A**
Iterations used: 1 / 2 auto (loop never entered) + 1 user-directed
Exit reason: converged
Status: **APPROVED**
human_review_needed: **false**
Counters (see §5): unreviewed 0 · prior-fix 0 · unattributed 0

**What the letter did not say, twice now.** Round 1 graded B — a passing grade — with one
consensus-passed P1 and three `manual-only` P1s open, and the auto-fix loop never ran because
B *is* the threshold. Both facts are properties of the configuration, not of the code: a
two-voice pool at K = 2 leaves most real findings `manual-only`, and a threshold equal to the
achieved grade disables the loop that would have fixed the one finding that did reach
consensus. `human_review_needed` was the only field carrying the truth, and what closed the
findings was a human reading them.

**What the letter is not saying.** `deleteRecord` itself reviewed clean: the three gates,
their order, and every record kind were checked and nothing was found. Every one of the seven
findings is about the seam between a delete and the state phase 9a deliberately keeps mounted
— an open record form, an open room detail, a rendered refusal. That is one design question
with several faces, not seven unrelated defects, and it is worth deciding once: **what should
an open editor screen do when the document underneath it loses the thing it is showing?**
9a answered the *save* half (refuse, and say the document moved). 9b did not answer the
*display* half, and the two P1s in the consensus cluster are the same omission reached from
two directions.
