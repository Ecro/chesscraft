---
type: review
task_slug: piece-skill-creation-ux
status: APPROVED
created: 2026-08-08
reviewers_invoked: [code-reviewer, codex]
consensus_method: single
drift_verdict:
  result: scope_violation
  scope_violations:
    - tests/helpers/reach.ts
  scenario_misses: []
  task_slug: piece-skill-creation-ux
  computed_at: 2026-08-08T09:40:00Z
---

# REVIEW — Piece & Skill Creation UX

## 🎯 Round 1 Summary

| | |
|---|---|
| Diff | 28 files, ~4,240 insertions, 146 deletions (all staged, nothing committed) |
| Diff class | `is_high: true` — file count 8 > 3, added lines 877 ≥ 400 |
| Reviewers | `code-reviewer` (enabled) + `codex` (cross-model voter, gate satisfied) |
| Grade, round 1 | **B** — 0 × P0, 2 × P1 |
| Grade, round 2 | **A** — 0 × P0, 0 × P1 |
| Fixes applied | 2 × P1, 2 × P2 |
| Verification | `tsc --noEmit` clean · vitest 86 files / 771 tests green |

`ux-reviewer` is installed but not in `reviewers.enabled`, so it did not run. For a
change this UI-heavy that is worth knowing; it was left as configured rather than
added silently.

## 🔍 Drift Findings

**`result: scope_violation`, one file, already self-reported.**

- `tests/helpers/reach.ts` — a fixture builder that asks the engine where a piece
  can go. It appears in no PLAN phase's scope list. Recorded before review as
  deviation #2 in the PLAN's Execution Notes, with the reason: it is deliberately
  NOT shared with `src/ui/PiecePreview.tsx`, because one shared builder would make
  AC-006's differential oracle circular. Accepted; the reasoning holds.

No incomplete phases: all six report DONE, and every SPEC scenario AC-001…AC-011
maps to at least one test.

**One check could not run, and it is not drift.** `e2e/editor-refusal.spec.ts` is
authored but was never executed — Playwright does not reach the app in this
environment, and the pre-existing `e2e/routing.spec.ts` fails identically at
`getByTestId('tab-edit')`. **AC-011's e2e half is unproven.** This must be run
before landing.

## ✅ Consensus Findings

`reviewers.consensus: single`, so a finding from the enabled reviewer stands on its
own; each cross-model finding additionally passed the Step 3.6 PIDA gate before
being counted.

### P1 — Clicking the grid's last move square did nothing at all

`src/ui/RecordForm.tsx:1068` (`commit`) · source: `code-reviewer` · **FIXED**

- **OBSERVE** — `commit` called `writeGrid(next)` and, when it returned
  `{ok: false, reason: 'no-move'}`, its `update()` callback simply `return`ed.
- **TRACE** — `blankDraft('piece')` seeds exactly one movement vector, and an
  omitted `attack` makes `readGrid` render that cell as `Both`. Tapping it once
  cycles it to `None`, which empties the grid, which is precisely the case
  `writeGrid` rejects. The draft was therefore left untouched, so the next render
  called `readGrid` on the same record and produced the same lit cell.
- **INFER** — nothing on screen changed. Worse, `noMoves` is computed from that
  same grid, so `piece-no-moves` — the hint the code comment promised would
  explain the refusal — could never render. The comment described a safeguard the
  code did not implement.
- **CONCLUDE** — the first interaction a child has with a blank piece from the
  gallery is tapping its one lit cell, and it was silently ignored with no route
  to discovery. Reproduced: `tests/ui/piece-grid-clear.test.tsx` failed 5 of 6
  before the fix, first assertion `the click was swallowed: expected '3' to be '0'`.

**Fix.** The empty state is written (`d.movement = []; delete d.attack`) instead of
discarded. `readGrid` already maps an empty movement to a blank grid, so the cell
goes dark, `hasMoves` goes false and the hint appears, and `validateDraft` reports
the schema's movement floor through the same validator the save button uses
(ADR-033). An unsaveable draft that says so is a state an author can leave.

**Regression cover.** `tests/ui/piece-grid-clear.test.tsx`, 6 tests, driving the
CLICK HANDLER rather than the compiler — which is the gap that let this through:
every existing grid test exercised `writeGrid`/`readGrid`, and the compiler was
never wrong. Includes the recovery path (draw a different piece afterwards) and
the same claim for the last slide direction.

### P1 — A document already holding the probe id broke the preview permanently

`src/ui/PiecePreview.tsx:27` · source: `codex` · PIDA `accepted` · **FIXED**

- **OBSERVE** — the preview built its scratch document by pushing a piece with the
  fixed id `piece.preview-probe`, unconditionally.
- **TRACE** — `loadContentSet` refuses a document with a duplicate id. So for any
  imported document that already contained a record with that id, every scratch
  set failed to load.
- **INFER** — the error's `contentId` matches the probe, so the preview's own
  "cannot show this" branch fired: the board went blank and stayed blank.
- **CONCLUDE** — rare, invisible and permanent: not one piece, but every piece in
  that document, forever, with nothing on screen explaining why.

**Oracle — direct reproduction, not inference.** The harness's
`hm second_opinion_oracle` is unusable in this repository (it runs `uv run pytest`
and `uv run ruff` against a TypeScript/React tree and emitted ~284 KB of ruff
`invalid-syntax` from parsing `.tsx` as Python — the recorded
`spec-machine-binding-is-pytest-only` failure, second instance). Following that
entry's recorded workaround, project-native evidence was substituted: a throwaway
vitest run of `previewReach` against a document carrying the probe id returned
`{moves: 0, captures: 0, errors: [duplicate id piece.preview-probe]}` for a rook
that should show eight destinations.

**Fix.** `probeIdFor(source)` derives a free id per document, stepping `-2`, `-3`, …
past anything taken. The id is threaded through the scratch preset, the board map
and the error filter, so nothing still assumes a constant. The verifier's
out-of-scope note — that `preset.pieceIds` used the same unchecked-append pattern —
is closed by the same change, since the appended id is now unique by construction.

**Regression cover.** Two tests in `tests/ui/piece-preview-parity.test.ts`: the
collision case now previews correctly, and the id keeps stepping while a document
keeps taking them.

## ⚠️ Weak Consensus

None.

## 📝 Manual-Only Findings

None outstanding. Both P2s below were addressed rather than deferred.

### P2 — The ADR's "cost is shared" claim was factually wrong

`work-docs/PLAN-piece-skill-creation-ux.md`, ADR-032/ADR-033 · source:
`code-reviewer` · **FIXED (documentation)**

ADR-032 claimed that because the preview already builds a validated `ContentSet`,
live validation is free. It is not: `RecordForm`'s `liveErrors` runs
`validateDraft → commitDraft → loadContentSet` on the whole record spliced into the
real document, and `PiecePreview` separately runs `loadContentSet` on a scratch
document carrying only the draft's movement. They validate **different documents**,
so neither can reuse the other's result and the editor performs two
full-document validations per render.

Sharing them is not available — the two splices are deliberately different, because
a movement preview must not light up with "nameKey is required" while a child is
typing a name. So the claim was corrected rather than the code: both ADRs now state
the cost is added, not shared, and point at R-3's unchanged mitigation (debounce the
render, never the authority).

### P2 — The AC-008 gate saved and reopened exactly one combination

`tests/editor/vocabulary-coverage.test.ts` · source: `codex` · PIDA `accepted` ·
**FIXED**

The new block asserted eight directions and three reach values against the
transient draft JSON, but only one combination — east at two squares — was ever
saved and reopened. A normalisation that dropped the south-west vector or the
one-square cap on its way through the validator would have passed the whole block.
That is this repo's own recorded "a gate enumerated along one axis is blind to
extensions along every other" shape, arriving inside the gate written to answer it.

**Fix.** The round-trip is now parameterised: all eight directions at the board
edge, plus all three reach values on one direction — eleven save-and-reopen cycles,
each asserting the emitted slide pattern as well as document equality. Bounded
rather than Cartesian on purpose: `reach` is one shared field, not a per-direction
one, so the 24-cell product would buy only interaction terms nothing treats as
coupled.

## 🤝 Disagreements

None. The two reviewers found disjoint defects — `code-reviewer` in the interactive
layer, `codex` in the scratch-document construction and the test breadth — and
neither contradicted the other. `code-reviewer` independently traced the
`readGrid`/`writeGrid` round-trip contract and could not construct an input where
`writeGrid`'s own output is refused by `readGrid`; that is recorded below as a
positive result, not an absence of findings.

## 🧊 Cross-model findings (frozen @ round 1)

```yaml
frozen_at_round: 1
models: [codex]
findings:
  - id: 0dfd596516c336cf
    source: codex
    severity: P1
    file: src/ui/PiecePreview.tsx
    line: 27
    summary: >-
      A document already containing the fixed probe id makes every scratch set
      fail to load, so the preview shows its refusal for every piece, permanently.
    evidence: >-
      PiecePreview declares the fixed probe id and previewSource executes
      scratch.pieces.push(probe) unconditionally without checking existing ids.
    needs_relaxation: false
    disposition: accepted
    oracle_result: >-
      Reproduced with vitest: previewReach on a colliding document returned
      0 moves, 0 captures and `duplicate id piece.preview-probe`.
    status: resolved
  - id: 7e20708f19c6dc61
    source: codex
    severity: P2
    file: tests/editor/vocabulary-coverage.test.ts
    line: 788
    summary: >-
      The AC-008 block never saves or reopens seven of eight directions and two
      of three reach values, so a value-specific normalisation regression passes.
    evidence: >-
      Only the east/reach-2 case presses editor-save and compares openDraft; the
      other rows assert against the transient editor-draft-json only.
    needs_relaxation: false
    disposition: accepted
    oracle_result: >-
      File inspection confirmed: one save-and-reopen case in the whole block.
    status: resolved
```

## ✅ Confirmed clean (positive results, not absent findings)

Recorded because "no finding" and "checked and sound" are different claims:

- **`readGrid`/`writeGrid` round-trip contract.** Every refusal branch traced
  against every shape `writeGrid` can emit; no input found where the compiler's own
  output is then refused. The shared `reach`/`forward` fields make the two axes
  agree by construction, and `writeGrid` never emits a cap on a leap pattern.
- **`sameReach`'s per-kind-bucket comparison** is correct for a two-pattern array,
  and the both-buckets-differ fixture the PLAN required is present.
- **`prepared()`** really is one function with one argument list for both the save
  path and live validation — the ADR-033 contract working as designed.
- **`freshId` / `remixOf`.** The unbounded loop is bounded by a finite taken-set;
  `remixOf` never writes to the source, confirmed against the byte-identical
  assertion plus the separate overlay-text assertion.
- **The `key`-must-include-`source` trap does not apply.** `EditorLibrary`'s key
  omits `source`, but the recorded resolution for that failure was "refuse rather
  than remount" (`openedSnapshot`/`sameSnapshot`), which is present and wired.
  `MakerGallery` and `PiecePreview` hold no state of their own.
- **`.form-panel:not([hidden])` and `.form-body:not([hidden])`** carry forward the
  recorded `[hidden]`-defeated-by-`display` lesson, with comments naming why.
- **ADR-032's exit grep** over `src/ui/PiecePreview.tsx` returns nothing.

## Review Iteration Summary

| Iteration | Grade | Fixes Applied | Remaining | New |
|-----------|-------|---------------|-----------|-----|
| 1 (init)  | B     | —             | 4         | —   |
| 2         | A     | 4             | 0         | 0   |

Final grade: **A**
Iterations used: 2 / 2
Exit reason: converged
Status: **APPROVED**
human_review_needed: **true**
Counters: unreviewed 0 · prior-fix 0 · unattributed 0

`human_review_needed` is set **not** by an unverified severe finding — there are
none — but by the unrun e2e suite. AC-011's browser half is written and never
executed; nobody should land this without running `npx playwright test` where the
dev server starts. The letter grade cannot see that, so it is flagged here.


## Round 3 — e2e actually ran, and it found things jsdom could not

The round-1/2 report above said e2e was "authored but unverifiable here". That was
wrong, and the way it was wrong matters: a **different Claude session** had a vite
dev server on port 5173 serving `master`, and `playwright.config.ts` sets
`reuseExistingServer: !CI`. Every earlier e2e run therefore tested *another
worktree's app*, which is why it failed at `tab-edit` in a way that looked
environmental. Once that server exited, the suite ran against this worktree.

**Baseline, measured rather than assumed.** `git stash` → same command on the base
branch → **19 passed, 1 skipped, 0 failed**. So every failure below was introduced
by this task.

### Regressions found and fixed

1. **`editor-uses` and `editor-paired` were stranded in the expert tab.** The panel
   boundary fell where the JSX happened to split, not where the product wanted it.
   "몇 번 쓸 수 있나" is the second question anyone asks about a skill card. Moved
   into the simple panel.
2. **Boards and rooms had no simple maker at all**, so the tabs offered an empty
   "쉽게" tab and hid the entire form behind "자세히". `hasSimple` now covers only
   piece / ruleCard / skillCard; a special square's content IS its effects, so it
   renders one column too.
3. **The vocabulary palette needs a tab click now**, which is the design (ADR-031,
   AC-008) and which every palette-driving spec had to learn. Added `expert(page)`.
4. **Switching `editor-kind` mid-test reopens the gallery**, so `editor-id` was
   invisible at the moment the spec filled it. Added `startBlank(page)` after every
   kind switch and at the top of `fillIdentity`.

Every one of these is invisible to jsdom: `fireEvent` ignores visibility, Playwright
enforces it. The vocabulary-coverage gate passed unchanged through all four.

**A memoisation attempt that made things worse, recorded because it is instructive.**
Suspecting the reviewer's P2 (two full-document validations per render) was causing
the failures, `liveErrors` was memoised on `JSON.stringify(ready)` — which serialises
`ready.base`, the whole content set, and so paid a full document walk per render to
avoid a full document walk per render. It is now keyed on the single record. The
performance hypothesis was wrong regardless; the real cause was #4 above.

### Outstanding — this is why the status is CHANGES_REQUESTED

`e2e/editor-refusal.spec.ts` — both tests — **passes in isolation and fails when run
alongside the other editor specs** (30s timeout reaching `library-open-piece.king`).
Every pre-existing spec passes: 19 passed, 1 skipped. The failure is confined to the
spec this task added, and its cause is not yet identified. It is left failing rather
than deleted or skipped.

**Do not land until this is understood.** A test that passes alone and fails in
company is either a real ordering dependency in the app or a defect in the spec, and
neither is safe to assume away.

### Round 4 — the e2e suite, resolved

The outstanding item above is closed, and the diagnosis in Round 3 was wrong twice
before it was right. It was NOT port contention and it was NOT a flake: on a private
port (`E2E_PORT`) the failures reproduce exactly, and they are one app bug plus its
fallout.

**The app bug.** `takePick` marked a GALLERY CHOICE as unsaved work
(`onDirtyChange(true)`). So picking "start from nothing" and then clicking an existing
record tripped the editor shell's discard-confirm guard; Playwright auto-dismisses an
unhandled dialog, so the open was refused, the blank draft stayed, and the save that
came later was rejected for an empty `nameKey`. Eleven tests failed at `save()` with a
message pointing nowhere near the gallery. A child meets the same prompt — asked
whether to throw away work they never did. Fixed: answering the gallery is navigation,
not an edit. Recorded as `[fail:design] navigation-marked-as-unsaved-work`.

**The fallout.** Four specs needed to answer the gallery where they OPEN a form —
after `editor-new` and after an `editor-kind` switch, never mid-flow, because answering
it replaces the draft. `startBlank` now lives in `e2e/nav.ts` and is shared rather than
copied. `editor-refusal.spec.ts` opens a shipped piece instead of depending on the
gallery at all, since its subject is the refusal.

**Full gate, all green:** `tsc` clean · vitest 86 files / 771 tests · build ok ·
e2e 229 passed / 1 skipped across desktop and mobile-portrait · e2e:pwa 6 passed ·
test:build 18 passed. AC-011's browser half is now proven, not merely authored.

**Final status: APPROVED · human_review_needed: false.**
