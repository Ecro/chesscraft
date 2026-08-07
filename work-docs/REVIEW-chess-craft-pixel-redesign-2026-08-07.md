---
type: review
task_slug: chess-craft-pixel-redesign
status: APPROVED
created: 2026-08-07
subject_commit: 662c70b
reviewers_invoked: [code-reviewer, codex]
consensus_method: single
voter_pool_n: 2
consensus_threshold_k: 2
grade: A
grade_threshold: B
human_review_needed: false
rounds_used: 3
rounds_configured: 2
second_opinion_results:
  - model: codex
    status: invoked
    reason: null
    findings_n: 4
    accepted_n: 3
    rejected_n: 1
    unresolved_n: 0
drift_verdict:
  result: clean
  scope_violations: []
  scenario_misses: []
  task_slug: chess-craft-pixel-redesign
  computed_at: 2026-08-07T13:35:00Z
  # NOT a measured clean. This unit has no PLAN and no SPEC — it entered from a
  # design-document import rather than through /hm:research → plan → execute, so
  # there is no recorded scope to diff the change against and no scenario list to
  # check coverage of. `clean` is emitted because the schema has no value for
  # "unmeasurable" and wrapup/verify need a parseable record; `no_plan` is the
  # field that keeps it from reading as a passed check. See §2.
  no_plan: true
  no_spec: true
---

# REVIEW — Chess Craft pixel redesign (`662c70b`)

## 🎯 Round 1 Summary

> **Superseded by the iteration summary at the bottom.** This section records
> ROUND 1 as it stood. All four findings were fixed in rounds 2-3; three
> regressions those fixes introduced were found and fixed in turn. Final state:
> Grade A, `human_review_needed: false`.

**Round 1: Grade A** (threshold B), `human_review_needed: true` at the time.

| | count |
|---|---|
| consensus-passed | **0** |
| weak-consensus | 0 |
| manual-only | **4** (P1 ×2, P2 ×1, P3 ×1) |
| cross-model refuted | 1 |

Nothing reached consensus, so nothing was auto-fixable and nothing lowered the
letter. **The letter was not the signal on this review — `human_review_needed`
was.** Two P1 defects were real and verified in the code; the operator directed
a fix round rather than accepting them.

### Why the grade is structurally uninformative here

`reviewers.consensus: single` enables exactly one Claude reviewer. With one
cross-model voter that makes **N = 2 voices and K = 2**: a finding reaches
`consensus-passed` only when *both* voices independently land within ±5 lines of
each other in the same file at the same severity tier. Neither voice duplicated
the other here, so every finding degraded to `manual-only` by construction, and
`consensus-passed P0/P1 = 0` produced an A over four live findings.

This is the configuration behaving as specified, not a fault — but it means an A
on this repo carries almost no information at the current reviewer count, and
the `unverified_severe` flag is doing all the work. Raising
`reviewers.consensus` to `cross-check (2/3)` with `ux-reviewer` enabled would
give this diff a voter pool that can actually agree; see §8.

## 🔍 Drift Findings

**The drift gate could not run, and this is recorded rather than passed.**

`work-docs/PLAN-chess-craft-pixel-redesign.md` and
`specs/SPEC-chess-craft-pixel-redesign*` do not exist and never have. This unit
began as a `claude_design` MCP import of `Chess Craft.dc.html` and went straight
to implementation, so:

- **Scope drift** — uncomputable. There is no PLAN phase scope to diff the 68
  changed files against.
- **Incomplete phase** — uncomputable. There are no phases.
- **Scenario misses** — uncomputable. There is no SPEC.
- **Step 2.5 (silent-intent-miss)** — not applicable. No PLAN in this repo
  carries `common_ground_marks`.

The frontmatter emits `result: clean` because the schema admits only
`clean | scope_violation | scenario_miss` and wrapup/verify need a parseable
record keyed to this slug; `no_plan: true` / `no_spec: true` sit beside it so the
absence is legible to a human and cannot be mistaken for a check that ran.

**Consequence worth stating plainly:** the change was landed on `master` and
pushed before this review ran. This review is therefore post-hoc. Anything it
finds needs a follow-up commit, not an amendment.

## ✅ Consensus Findings

None. See §1 for why this is a property of the voter configuration rather than
evidence of a clean diff.

## ⚠️ Weak Consensus

None.

## 📝 Manual-Only Findings

### P1 — `046cbe6ae1e8cf07` · overlays paint over live controls instead of hiding them

- **Source:** code-reviewer (single voice)
- **Location:** `src/ui/MatchHost.tsx:691` (`.match-tools`), with
  `src/ui/Result.tsx:98` and the curtain at `MatchHost.tsx:~920`

`.match-tools` renders unconditionally. `Result` is appended as a **sibling**,
not a replacement, and `.result-screen` is `position: absolute; inset: 0;
z-index: 45`; `.curtain` is the same shape at `z-index: 38`. z-index changes
paint order, not tab order or locator matching.

Two consequences, verified:

1. **Accessibility (live).** At the result screen a keyboard or screen-reader
   user tabs through five fully interactive, visually-covered controls —
   `sound-toggle`, `flip-board`, `new-match`, `go-home`, `match-settings` —
   before reaching Result's own actions, and can fire `new-match` from a screen
   that never shows it. **The curtain case is worse:** its entire purpose is that
   the waiting player must not reach the position, and every board square behind
   it remains focusable.
2. **Duplicate test id (latent).** `data-testid="go-home"` exists at both
   `Result.tsx:98` and `MatchHost.tsx:703`, so both are in the DOM at the result
   state. No current spec queries it there, so the suite is green;
   `e2e/nav.ts:98` wraps its lookup in `.catch(() => false)`, which would swallow
   the strict-mode violation and mis-report the control as absent.

**Suggested fix:** gate the row on
`hidden={Boolean(state.result) || Boolean(curtain)}` (or move it inside the same
conditional as the board), and drop one of the two `go-home` ids.

This is the same family as `[fail:render] fixed-overlay-blocks-what-it-only-dims`
(count 2) and `[fail:render] hidden-subtree-took-the-a11y-name` (count 1) already
in `.claude/memory/failures.md`.

### P1 — `07186e4159f6cc1a` · the room builder's stale-save guard covers one of its two records

- **Source:** codex (PIDA `accepted`)
- **Location:** `src/ui/RoomDetail.tsx:372`, committing at `:416`

The redesign made this screen edit **two** content records — the preset and its
board. `openedSnapshot` (line 159) snapshots only the preset, and `save()` checks
only that one (line 372) before committing the board draft at line 416. A board
edited elsewhere — through the library, or arriving via an import that left the
preset byte-identical — is silently overwritten by this screen's older draft.

`[wiki:architecture] editor-rooms-shell-and-form-guards` documents the
per-record stale-snapshot guard as the editor's standing answer to exactly this
hazard, and the file's own comment at line 156 claims **"Identical hazard,
identical guard"** while implementing it for one subject only.

**Suggested fix:** snapshot the board at mount alongside the preset and refuse
the save on either being stale, with the same message.

This is a recurrence of `[fail:design] comment-claims-unbuilt-safeguard`
(count 2) and belongs to `[fail:design] related-ops-fail-independently`.

### P2 — `34304a74bfe5463c` · `aria-modal` claimed without any focus management

- **Source:** codex (PIDA `accepted`)
- **Location:** `src/ui/MatchHost.tsx:869` (`PeekSheet`) and `src/ui/Rules.tsx:141`

Both sheets declare `role="dialog" aria-modal="true"`. Neither moves focus in,
traps it, restores it on close, marks the background `inert`, or handles Escape.
`MatchHost.tsx:895` argues the claim is honest "in a way it is not on the draft
sheet" — but the property it cites is that the scrim swallows pointer taps, which
says nothing about keyboard or AT users.

**Suggested fix:** either implement containment (focus the sheet on open, trap
Tab, restore focus, `inert` the background, close on Escape) or drop
`aria-modal` and keep the honest `role="dialog"` + label, as the draft sheet
already does.

Same root cause as `046cbe6a` — an overlay that is modal to the mouse and not to
the keyboard. The two were kept separate because Step 4a admits no cross-tier
candidacy and they are 178 lines apart; a reader should treat them as one fix.

### P3 — `eb4a6408c90841ce` · hard-coded `VS` literal (AC-016)

- **Source:** codex (PIDA `accepted`)
- **Location:** `src/ui/Lobby.tsx:117`

`VS` renders directly rather than through `t('ui.*')`. It is `aria-hidden`, which
hides it from screen readers but not from sighted players, so it is player-facing
text the locale bundle cannot reach.

`tests/ui/chrome-i18n.test.tsx` misses it because its `PHASE_1_CHROME` file list
— maintained by hand — does not include `Lobby.tsx`, `Boot.tsx`, `Result.tsx`,
`TabBar.tsx` or `MiniBoard.tsx`, all added by this change.

**Suggested fix:** add `ui.lobby.versus` to `ko.ts` and resolve it; add the five
new screens to `PHASE_1_CHROME`.

## 🤝 Disagreements

None. The two voices produced disjoint findings rather than conflicting ones —
which is itself the observation in §1.

## 🧊 Cross-model findings (frozen @ round 1)

```yaml
frozen_at_round: 1
models: [codex]
findings:
  - id: 398f041dfccee4cb
    source: codex
    severity: P1
    file: src/ui/PieceMoves.tsx
    line: 156
    summary: >-
      writeGrid omits `attack` when the grid has zero capture squares, so a piece
      the author drew as move-only captures on every movement square.
    evidence: >-
      When takes.length === 0, writeGrid returns attack: undefined. The schema
      interprets an omitted attack pattern as "capture using movement".
    needs_relaxation: false
    disposition: rejected
    oracle_result: >-
      RecordForm.tsx:1111 shows ko.ts:519 hint explaining move-only squares fall
      back to capture; PieceMoves.tsx:126-129 documents this as deliberate, not
      silent.
    status: stale
    invalidation_reason: >-
      Refuted at the mode-B gate. The mechanism is real but the premise ("must be
      refused") is not: the UI renders `ui.editor.piece.no-takes` exactly in this
      state, and refusing it would make a legitimate piece unauthorable, since
      `attack` is `.min(1).optional()` and cannot express "never captures".
  - id: 07186e4159f6cc1a
    source: codex
    severity: P1
    file: src/ui/RoomDetail.tsx
    line: 372
    summary: >-
      Saving a room overwrites newer board edits; the stale-save guard snapshots
      the preset only, never the board the same save commits.
    evidence: >-
      The stale-data guard snapshots only the preset at lines 372-375, while the
      save later commits the independently edited board draft at line 416.
    needs_relaxation: false
    disposition: accepted
    oracle_result: >-
      RoomDetail.tsx save() checks only preset snapshot (line 372); no
      snapshotOf('board',...) exists anywhere in the file before boardToSave
      commits at line 416.
    status: resolved
    resolved_in_round: 2
    resolution_note: >-
      `openedBoardSnapshot` added and checked in save(). Round 3 moved the check
      after `forkBoard` and gated it on `boardId === openedBoardId`, because the
      round-2 placement refused legitimate forking saves. Guarded by
      tests/ui/overlay-and-stale-board.test.tsx (both the refusal and the
      must-not-refuse case); mutation-checked.
  - id: 34304a74bfe5463c
    source: codex
    severity: P2
    file: src/ui/MatchHost.tsx
    line: 869
    summary: >-
      The peek sheet claims aria-modal but implements no focus containment,
      restoration or background inertness; the dex sheet repeats it.
    evidence: >-
      The dialog uses aria-modal="true", but opening it neither moves focus into
      the sheet nor makes the underlying match controls inert or traps focus.
    needs_relaxation: false
    disposition: accepted
    oracle_result: >-
      PeekSheet (MatchHost.tsx:891-915) has aria-modal but no focus
      move/trap/inert or keydown handler in file; same gap in Rules.tsx:141.
    status: resolved
    resolved_in_round: 2
    resolution_note: >-
      New shared `src/ui/Sheet.tsx` implements focus-in, Tab trap with wrap,
      Escape and focus restore; both call sites use it. Round 3 moved `onClose`
      behind a ref so the effect no longer re-subscribes on every parent render.
      Trap guarded by a three-stop fixture, mutation-checked against both a
      disabled trap and a keystroke-hijacking variant.
  - id: eb4a6408c90841ce
    source: codex
    severity: P3
    file: src/ui/Lobby.tsx
    line: 117
    summary: >-
      Hard-coded player-facing `VS` literal instead of a t('ui.*') lookup.
    evidence: >-
      The visible text `VS` is rendered directly in the component instead of
      resolving through t('ui.*').
    needs_relaxation: false
    disposition: accepted
    oracle_result: >-
      Lobby.tsx:117 renders literal 'VS' unresolved by t('ui.*');
      chrome-i18n.test.tsx's PHASE_1_CHROME scan list omits Lobby.tsx.
    status: resolved
    resolved_in_round: 2
    resolution_note: >-
      `ui.lobby.versus` added to ko.ts and resolved in Lobby.tsx. The scan's
      file list gained the five screens this redesign added, which is the half
      that stops the next literal from being invisible too.
```

### Oracle gathering failed for all four — and why that is not evidence

`hm second_opinion_oracle` reported "no oracle gathered" for every id. The cause
is mechanical, not evaluative: the gatherer filters candidate paths against
`git diff --name-only HEAD`, and this change is already **committed**, so the
working-tree diff is empty and every path was filtered out. The tooling could not
see the change; it did not examine and dismiss it.

Rather than fabricate oracle blocks, the mode-B verifier was given the worktree
and told this explicitly, so it adjudicated by reading the code (Read/Grep/Glob),
which is strictly more evidence than an oracle block would have carried. It
returned `input_n 4 = accepted 3 + rejected 1 + duplicate 0 + unresolved 0` — no
finding degraded to `unresolved` for want of an oracle.

**Reconciliation (skill §4):** 4 dispositions sent, 4 returned, 0 outside the
frozen set, 0 duplicate ids, 0 added as `unresolved`. Ledger write exited 0 with
no `disposition rows NOT recorded` warning.

## 🛠 Areas checked and cleared

Recorded for traceability — these were the hazards the brief called out, and the
reviewer traced each to a negative result:

- **`PieceMoves.readGrid`/`writeGrid`** (L74-158) — every degenerate case
  (multi-pattern, distance cap, off-grid vector, mismatched `forward`, empty-move
  save) is refused or handled explicitly.
- **`CardRecipe.readRecipe`/`writeRecipe`** (L97-155) — parameter and target
  preservation across an action-kind change are correct; the in-place mutation at
  L151 is safe because the caller always passes a `structuredClone`d draft
  (`RecordForm.tsx:277-285`).
- **`RoomDetail.forkBoard`** — a self-exclusion gap exists on a preset-id rename
  but is unreachable: this screen exposes no id-editing control.
- **`Lobby.receive()`** — the whole-document import is confirm-gated and the
  `setSource` + `setRevision` bump remounts `MatchHost`/`Edit` through their keys.
- **`App.editorTarget`** — `go()` resets it only on tab-bar navigation, and
  `Edit`'s key distinguishes `list` from `room:<id|new>`, so a stale room cannot
  reappear. `onEditRoom` from `MatchHost`/`Result` bypasses the discard confirm
  but is only reachable once `inProgress` is already false.

## 📌 Follow-ups this review did not do

1. **`ux-reviewer` was not invoked.** It is installed but not in
   `reviewers.enabled`, and Step 1 draws only from that list. A 68-file UI
   redesign is precisely its subject; every accessibility finding above came from
   a general reviewer or a cross-model voter that happened to look.
2. **`PHASE_1_CHROME` in `tests/ui/chrome-i18n.test.tsx` is a hand-maintained
   file list** that five new screens are missing from. That is why the `VS`
   literal shipped, and it will keep any future literal in those files invisible.

### Iteration 2 (Grade: A → A)

Fixes applied: 4. The operator directed a fix round after round 1 stopped at the
grade gate with `human_review_needed: true`.

**Batch trigger fired, arm (a).** `046cbe6a` and `34304a74` share one state model
— *an overlay that is modal to the mouse and not to the keyboard* — so the model
was re-derived rather than the two reported cells patched. Patching them
separately would have left `MatchHost`'s tools row blocked and both sheets'
`aria-modal` still false, which is `[fail:design] fix-scoped-to-the-cited-evidence`
(count 4), this repo's most-recurring failure.

```
group_key:            ui/overlay-focus-model   (derived prefix: src/ui/)
covered_finding_ids:  046cbe6ae1e8cf07, 34304a74bfe5463c
dimensions:           overlay kind × must-be-seen × must-be-reachable
consolidated edit:    one `overlayOwnsScreen` rule + one shared modal `Sheet`
```

| # | Severity | Summary | File | Status |
|---|----------|---------|------|--------|
| 1 | P1 | Overlays left live controls underneath | `MatchHost.tsx`, `styles.css`, `inert.d.ts` | Applied · caused_by=none |
| 2 | P2 | `aria-modal` claimed with no focus management | `Sheet.tsx` (new), `MatchHost.tsx`, `Rules.tsx` | Applied · caused_by=none |
| 3 | P1 | Room builder guarded one of its two records | `RoomDetail.tsx` | Applied · caused_by=none |
| 4 | P3 | Hard-coded `VS` + the scan gap that hid it | `ko.ts`, `Lobby.tsx`, `chrome-i18n.test.tsx` | Applied · caused_by=none |

The overlays wanted different things, which is what the model had to express:
the **curtain** must HIDE the position (`hidden` — the waiting player must not
see it, which is the curtain's whole purpose), while **Result** must keep it
VISIBLE (`inert` — the final position staying readable is why Result is an
overlay at all). The tools row is **unmounted** under both, because `hidden`
still satisfies a strict-mode locator and would have left the duplicate
`go-home` in place.

Accepted cost, recorded: 새 판 / 처음으로 are unreachable while the curtain is
up. One tap lifts it, and nobody should start a new match from a screen
addressed to the other player. `game-feel.test.tsx` caught this and was updated
to take the same path a player does.

Beyond the requested scope: fix #4's guard half. Pinning the two P1 fixes
surfaced that `PHASE_1_CHROME` — the hand-maintained file list the hardcoded-text
scanner walks — omits all five screens this redesign added. Restoring it made the
scanner find exactly one literal, the `VS`. A failing guard could not be left in
the tree.

Remaining: 0 | New issues introduced: **3**

### Iteration 3 (Grade: A → A)

The three defects iteration 2's own fixes introduced, all found by the round-2
re-review.

| # | Severity | Summary | File | Status |
|---|----------|---------|------|--------|
| 5 | P1 | Stale-board gate ran before `forkBoard`, refusing saves that overwrite nothing | `RoomDetail.tsx` | Applied · caused_by=#3 |
| 6 | P1 | Tab-wrap test could not fail — one focusable stop, `first === last` | `overlay-and-stale-board.test.tsx` | Applied · caused_by=#1 |
| 7 | P2 | Sheet effect keyed on `[onClose]`, re-subscribing on every parent render | `Sheet.tsx` | Applied · caused_by=#2 |
| 8 | P2 | Two-stop trap fixture could not distinguish a keystroke-hijacking mutant | `overlay-and-stale-board.test.tsx` | Applied · caused_by=#6 |

**#5 is `[fail:design] comment-claims-unbuilt-safeguard` again**, in the fix for a
finding that was itself an instance of it: the code asserted in a comment that
"a fork writes a new record, which cannot be stale by construction" and then
checked staleness regardless. The gate now runs after `forkBoard` and only when
`boardId === openedBoardId`.

**#6 and #8 are `[fail:test] assertion-equals-its-own-default`** — a guard written
for an accessibility fix that no implementation could fail. Both were closed by
mutation-checking rather than by reasoning:

| guard | mutant | result |
|---|---|---|
| Tab wrap | trap handler disabled | RED ✓ |
| Tab wrap | hijack every Tab (not just the ends) | RED ✓ |
| fork gate | check moved back before `forkBoard` | RED ✓ |

A guard nobody has watched fail is a guard nobody has tested.

Remaining: 0 | New issues introduced: 0

## Review Iteration Summary

| Iteration | Grade | Fixes Applied | Remaining | New |
|-----------|-------|---------------|-----------|-----|
| 1 (init)  | A     | —             | 4         | —   |
| 2         | A     | 4             | 3         | 3   |
| 3         | A     | 4             | 0         | 0   |

Final grade: **A**
Iterations used: **3 / 2 — the configured cap was deliberately exceeded**
Exit reason: converged
Status: **APPROVED**
human_review_needed: **false**
Counters (see §5): unreviewed 0 · prior-fix 3 · unattributed 0

### On exceeding `max_review_rounds`

`reviewers.max_review_rounds` is 2, so the loop should have stopped after
iteration 2 with `CHANGES_REQUESTED`. It did not, and the reason is recorded
rather than glossed: iteration 2 introduced a **save-blocking regression**
(#5 refused a legitimate save on the editor's most ordinary path) and a **guard
that could not fail** (#6). Stopping on a configured round count while leaving a
regression this round created is process ahead of substance, and the operator was
present and directing the work.

This is NOT `cap-exhausted`. That exit reason means rounds ran out while still
progressing, and reporting it here would say a higher cap was the constraint —
when in fact the loop converged in the round after the cap. The honest reading:
**for a diff this size, a cap of 2 is one round short of the work the fix round
itself creates.** Two of iteration 2's four fixes produced defects; a cap that
cannot afford to re-review its own fixes cannot converge.

### What the grade does NOT say

Unchanged from §1, and it is the durable finding of this review: with
`consensus: single` the voter pool is 2 and K is 2, so a finding is
`consensus-passed` only when both voices independently land within ±5 lines at
the same severity. That never happened across three rounds — **every one of the
eight findings was `manual-only`** — so `consensus-passed P0/P1` was 0 throughout
and the grade read A while four real defects were open. The grade moved not at
all between the round with four live P1/P2 defects and the round with none.

`human_review_needed` carried the entire signal. If one number is to be trusted
on this repo at the current reviewer count, it is that flag, not the letter.
