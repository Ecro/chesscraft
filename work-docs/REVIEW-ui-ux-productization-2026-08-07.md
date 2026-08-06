---
type: review
task_slug: ui-ux-productization
status: APPROVED
created: 2026-08-07
reviewers_invoked: [code-reviewer, codex]
consensus_method: cross-check
run_id: 20260806T1514Z
grade_threshold: B
max_review_rounds: 2
drift_verdict:
  result: clean
  scope_violations: []
  scenario_misses: []
  task_slug: ui-ux-productization
  computed_at: 2026-08-07T00:05:00Z
second_opinion_results:
  - model: codex
    status: invoked
    reason: null
    findings_n: 3
    dispositions: { accepted: 3, rejected: 0, duplicate: 0, unresolved: 0 }
---

# REVIEW — ui-ux-productization, PLAN phase 9a

Scope: the phase-9a diff (18 files, +2937 / −1064), staged on `hm/ui-ux-productization`.

**Voter pool.** `reviewers.enabled` holds exactly one Claude reviewer (`code-reviewer`), and
`second_opinion.models` holds `codex`, so N = 2 voices at K = 2. Every consensus cluster
therefore requires **both** voices; anything either voice found alone is `manual-only` by
construction. That is worth stating plainly, because with N = 2 the difference between
`consensus-passed` and `manual-only` is closer to "did the other model happen to look here"
than to a confidence measure. Four of the six findings below are `manual-only` and three of
those four are P1 — the grade does not reflect them, and `human_review_needed` is the flag
that does.

Single enabled Claude reviewer → the 2-pass redaction protocol was skipped (no cross-reviewer
anchoring bias to mitigate); the reviewer ran Pass 2 directly on the full context.

## 🎯 Round 1 Summary

| | |
|---|---|
| Grade | **D** (1 consensus-passed P0) |
| Consensus-passed | 1 (P0) |
| Manual-only | 5 (1 P0-cluster member folded, 3 P1, 1 P2 — see below) |
| Auto-fix | enabled; entered round 2 |

## 🔍 Drift Findings

`result: clean`. Three facts recorded rather than swept:

1. **`src/ui/RecordForm.tsx` and `src/ui/recordLabel.ts` are new files the PLAN does not name.**
   Not treated as scope drift: PLAN 9a says "`src/ui/Edit.tsx` — reduced to a two-tab shell",
   and a 1096-line form body reduced to a shell has to land somewhere. `RecordForm.tsx` is
   that body, moved; `recordLabel.ts` is the label helper three of the new screens share.
2. **`src/editor/draft.ts` is in 9a's scope and was not changed.** Not an incomplete phase:
   Phase 8 already added the `openedId` parameter to `commitDraft`, so 9a's actual work —
   "the opened-record id threaded into `commitDraft`" — was the *caller* side, and it landed
   in `RecordForm.tsx` / `RoomDetail.tsx`.
3. **`#19` ("raw draft-JSON `<pre>` removed") was implemented as `hidden`, not deleted**,
   because the same exit criterion requires the ADR-006 vocabulary-coverage gate to pass
   UNCHANGED and that gate reads exactly that node. Recorded in the PLAN as a deliberate
   reading of two clauses that would otherwise contradict.

PLAN frontmatter carries no `common_ground_marks`, so the Step 2.5 silent-intent-miss hook
is a no-op for this task.

**Oracle tooling limitation (recorded for `/hm:health`).** `hm second_opinion_oracle` runs
`uv run pytest` and `uv run ruff` only. This is a TypeScript/React repository, so it produced
`ERROR: not found: .../src/ui/RecordForm.tsx` from pytest and ~1.2 MB of `invalid-syntax`
from ruff parsing TSX as Python — no usable oracle for any finding. The PIDA gate was given
fixed-command project evidence instead (coverage greps + the green `npm run verify`), and
was told to treat the gatherer output as absent rather than as refutation. A repo whose
oracle gatherer cannot speak its language degrades every cross-model finding toward
`unresolved` silently; that did not happen here only because the substitution was explicit.

## ✅ Consensus Findings

### P0 · `ea7edd1fbac1028c` + `4cd8ebaa5615dd64` — a form that outlived its document `[2/2]`

`src/ui/RecordForm.tsx:707` · `src/ui/RoomDetail.tsx:169` · `src/ui/Edit.tsx:87-95`

`doImport` replaces the whole `ContentSource` via `commit(result.source)`, but neither panel
remounts: `EditorLibrary`'s key is `${kind}:${id}:${seq}` and `EditorRooms`' is
`${id}:${seq}` — neither includes `source`. Both forms snapshot their draft at mount and read
`source` **live** at save time, so `commitDraft` matched the stale mount-time `openedId`
against the *new* document (`draft.ts:158-161`) and replaced a record the form had never
seen. The import reported success and so did the save.

Reachable through the flow the transfer controls exist for: export → edit the JSON → re-import,
with a record still open. Both voices independently traced the same execution risk (codex
anchored at the mount-time snapshot, `RecordForm.tsx:94`; code-reviewer at the live-`source`
read in `save`), and the CONCLUDE clauses agree: a legitimately imported record is silently
discarded. **Strong consensus.**

Nothing in the suite exercised "import while a form is open" — `rg editor-import` finds the
control used in `e2e/content.ts` and twice in `e2e/editor.spec.ts`, and the one occurrence
followed by a save comes after a `page.reload()`, which remounts everything.

**Fixed in round 2** — see the iteration record.

## ⚠️ Weak Consensus

None. No pair matched on surface while diverging on CONCLUDE.

## 📝 Manual-Only Findings

None of these lowered the grade. All four are real; three are P1. They were the reason
`human_review_needed` was set after round 2 — and **all four were fixed in the user-directed
round 3**, recorded below. They are kept here in full, as found, because the record of what a
two-voice pool could not see is the more useful artifact.

### P1 · `4df79e93a074f677` — a room's "new record" shortcut discards unsaved Library work
`src/ui/Edit.tsx:76` (source: code-reviewer)

`createFromRoom` calls `openInLibrary(kind, null)`, which always does `seq: prev.seq + 1`.
`EditorLibrary` keys `RecordForm` on that `seq`, and the form's edit buffer lives only in
that instance's state. So: open the Library, start editing a record, switch to Rooms, press
`room-new-piece` — the Library edit is gone, with no confirmation and no trace.

This inverts the shell's own stated invariant. `Edit.tsx`'s docstring argues that both panels
stay mounted so "the room they left is still exactly as they left it"; the protection is
applied to Rooms work and withheld from Library work. `rg` for `room-new-piece` /
`onCreateRecord` / `createFromRoom` matches three source files and **zero** test files, so
the path has no coverage at all.

*Suggested:* do not force a remount when the requested kind/id already match what is open;
warn or confirm when a dirty Library form would be discarded; add a test that drives
`room-new-*` with a dirty Library form open.

### P1 · `ca231dc0c3c10eb0` — clearing a name or description is silently ignored
`src/ui/RecordForm.tsx:708` · `src/ui/RoomDetail.tsx:169` (source: codex, PIDA `accepted`)

Save writes the overlay only when `nameText.trim() !== ''` (same for `bodyText`, and the
identical conditional in `RoomDetail.save`). Erase the visible name field and save: the branch
is skipped, the existing overlay entry and the record's key are left untouched, and
`setSaved(id)` still fires. The editor reports success and the old name is still on screen.

This is the repo's own `[fail:design] empty-collection-is-not-absent` shape at count 1 — an
empty value being read as "nothing to do" rather than as an instruction. Note the schema
constrains the fix: the overlay is `z.record(localeCode, z.record(i18nKey, z.string().min(1)))`,
so *writing* the empty string is not available. The two real options are deleting the overlay
entry (`dropStrings` already exists in `src/editor/strings.ts`) — after which the name falls
back to the bundle, or to the dotted key for an authored record, which is its own problem — or
refusing the save with a message. That choice is a product decision, which is part of why it
is being handed back rather than auto-applied.

### P1 · `f56215626e5aee83` — changing a raw key clobbers the destination's text
`src/ui/RecordForm.tsx:708` (source: codex, PIDA `accepted`)

The advanced `editor-nameKey` / `editor-textKey` inputs mutate `draft.nameKey` / `draft.textKey`
directly and never touch `nameText` / `bodyText`, which still hold the text resolved through the
**old** key. On save, `slotFor(next.nameKey, …)` returns the new key verbatim (non-empty, so no
derivation), and `writeString` (`src/editor/strings.ts:34-41`) overwrites unconditionally — no
destination-occupied check. Point a record at an existing shared key and that key's text is
globally replaced by this record's.

Exposure is limited: it needs the advanced disclosure, which is exactly the escape hatch for
imported sets — the case where shared keys are most likely to exist. Existing `editor-nameKey`
tests never reach the write path (two author an invalid key on a new record and assert the save
is refused; the third leaves the visible name field empty).

### P2 · `b4da2b0a7845af04` — errors bleed across the tab switch
`src/ui/Edit.tsx:135` (source: code-reviewer)

The tab buttons call only `setTab`; only `createFromRoom` and `doExport` clear `errors`. The
`editor-errors` list renders at shell level, outside both `hidden` panel wrappers, so a failed
Library save stays on screen under the Rooms tab, describing a field that is no longer visible.

*Suggested:* clear `errors` in both tab `onClick` handlers, or scope the list to the tab that
produced it.

## 🤝 Disagreements

None. The two voices never assigned different severities to the same location. Worth recording
what they did *not* share: codex found both text-authoring defects (`ca231dc0c3c10eb0`,
`f56215626e5aee83`) and code-reviewer found neither; code-reviewer found both cross-panel
state defects (`4df79e93a074f677`, `b4da2b0a7845af04`) and codex found neither. With N = 2 the
overlap was one finding out of six — which is the honest reading of what a K = 2 threshold
measures in this configuration.

Explicitly checked and found sound (not findings): the `[hidden] { display: none !important }`
guard in `styles.css`, which prevents any `display:` rule from defeating the hidden-panel
design; `references.ts`'s transitive walk against `presetDef`'s four direct id fields plus
`board.placements` / `board.squares`; the rename key-rewrite order in both save paths, which
`tests/ui/rename-wiring.test.tsx` exercises; and the deliberate decision to let a rename of a
*referenced* record fail validation rather than silently orphan the references (9b's scope).

## 🧊 Cross-model findings (frozen @ round 1)

```yaml
frozen_at_round: 1
models: [codex]
findings:
  - id: 4cd8ebaa5615dd64
    source: codex
    severity: P0
    file: src/ui/RecordForm.tsx
    line: 94
    summary: >-
      Open forms survive document replacement and can overwrite imported or
      concurrently edited records with stale snapshots.
    evidence: >-
      RecordForm snapshots draft/openedId/nameText/bodyText only at mount while its key
      (EditorLibrary) excludes source; RoomDetail does the same and its key (EditorRooms)
      also excludes source. A successful import commits a replacement source without
      changing either key (Edit.tsx doImport). Subsequent saves call commitDraft against
      the NEW source using the STALE whole-record draft. No test covers saving an
      already-open form after import.
    needs_relaxation: false
    disposition: accepted
    oracle_result: >-
      No test remounts an open form across an import; source confirms the stale mount-time
      draft overwrites the fresh source via commitDraft (draft.ts:158-161).
    status: resolved
    invalidation_reason: null
  - id: ca231dc0c3c10eb0
    source: codex
    severity: P1
    file: src/ui/RecordForm.tsx
    line: 708
    summary: >-
      Clearing a record name or description, or a room name, is silently ignored on save.
    evidence: >-
      Visible fields set nameText/bodyText to '', but save writes strings only when
      trim() !== ''. It neither deletes nor blanks the existing overlay entry, and the
      record retains its existing key. RoomDetail.save has the identical conditional.
    needs_relaxation: false
    disposition: accepted
    oracle_result: >-
      No test clears a text field; RecordForm.tsx:708/713 confirms an empty trim() skips
      the write branch entirely while the save reports success.
    status: resolved
    invalidation_reason: null
  - id: f56215626e5aee83
    source: codex
    severity: P1
    file: src/ui/RecordForm.tsx
    line: 708
    summary: >-
      Changing an advanced nameKey or textKey overwrites the destination overlay entry
      with the text resolved from the previous key.
    evidence: >-
      The advanced key inputs mutate draft.nameKey/draft.textKey while nameText/bodyText
      still hold text resolved through the OLD keys. slotFor returns the new non-empty key
      verbatim and writeString overwrites unconditionally.
    needs_relaxation: false
    disposition: accepted
    oracle_result: >-
      Existing nameKey tests only cover new or untouched records; slotFor + writeString
      confirmed to write the stale nameText into the new key, clobbering its prior value.
    status: resolved
    invalidation_reason: null
```

## Auto-Fix Loop

### Iteration 2 (Grade: D → A)

Fixes applied: 1

| # | Severity | Summary | File | Status |
|---|----------|---------|------|--------|
| 1 | P0 | A form that outlived its document | `src/ui/RecordForm.tsx`, `src/ui/RoomDetail.tsx`, `src/i18n/ko.ts` | Applied · caused_by=none |

**What was applied.** `RecordSnapshot` / `snapshotOf(source, kind, id)` / `sameSnapshot` in
`RecordForm.tsx`, exported and reused by `RoomDetail.tsx`. Each form holds an
`openedSnapshot` taken at mount; `save()` refuses when the document's current snapshot for
`openedId` differs, surfacing `ui.editor.form.stale`. On a successful save the snapshot moves
forward from the **committed** document.

**Refuse rather than remount, deliberately.** The reviewer's own suggestion was to invalidate
open forms on import. Remounting would have thrown away a half-typed edit the author is in the
middle of — trading one silent loss for another, and creating a second instance of the
`4df79e93a074f677` failure mode still open above. Refusing keeps the buffer and hands the
decision back.

**The fix needed two passes, and the first was wrong in the way this repo keeps being wrong.**
The snapshot originally compared only the stored record — which the guard's own motivating
case defeats: an import that changes a *name* changes the `strings` overlay, while the record
carries only the key and is byte-identical. The guard refused nothing. `tests/ui/stale-document.test.tsx`
caught it because it asserts the imported *text* survived rather than merely that a message
appeared. Same shape as `[fail:design] fix-scoped-to-the-cited-evidence` (count 3); the
snapshot now covers record + name + text.

**One test harness was changed, and it deserves the scrutiny.** `tests/ui/rename-wiring.test.tsx`
mounted `Edit` **uncontrolled** — it captured `onCommit` but never fed the result back as the
`source` prop, which is not a state `App` can produce (`App` calls `setSource(next)`). Under
the new guard a second save from the same form then compared against a document that had never
received the first, and refused. The harness was converted to a controlled `Host`; **every
assertion is unchanged**. Recorded here rather than buried because editing a test during a fix
round is exactly where a fix hides its own regression.

**New coverage:** `tests/ui/stale-document.test.tsx` — refuse a library save after an import
(asserting the imported text survived); refuse a room save after an import; and two consecutive
saves from the same form still succeed (the obvious way to get this fix wrong, and one no
import-shaped test would catch).

Verification after the fix: `npm run verify` GREEN — typecheck + build + **367** vitest + 70
Playwright + 4 PWA.

**Selective re-review of the fix returned no finding at any severity.** It was asked four
questions and traced all four to source rather than to the diff's own comments:

- *Does the guard actually close the P0?* Yes. `save()` is redefined on every render, so it
  closes over the current render's `source`; an import flows `commit(result.source)` →
  `onCommit` → parent state → new `source` prop into the still-mounted form, and the guard
  reads that live value at invocation. That is the mechanism that was missing.
- *Did the fix introduce anything?* The reviewer went looking for the failure this class of
  fix usually produces — a `JSON.stringify` snapshot comparison firing on key-ORDER drift
  after a JSON round trip rather than on content drift, which would refuse **every** import
  regardless of whether it touched the open record. Traced clear: `importContent`
  (`src/editor/io.ts:57-63`) assigns `raw[collection]` straight from `JSON.parse` rather than
  through a zod-reconstructed object, and `openDraft` is a plain `structuredClone`, so an
  untouched record's key order survives the round trip.
- *Can the new tests fail against pre-fix code?* Yes for both P0 cases — pre-fix the save was
  unconditional, so `getByTestId('editor-errors')` / `room-errors` throws rather than passing
  quietly. Test 3 is green on both sides by design: it guards against over-refusing.
- *The harness change:* judged **fidelity, not evasion**, verified against `App.tsx:241-246`
  rather than against the comment. The reviewer also traced what the OLD uncontrolled harness
  had been getting away with before the guard existed: `commitDraft`'s `base` was the stale
  pre-save document, so the rename's second save would have **pushed** rather than replaced —
  and the assertions would still have passed, because the form's own local draft supplied the
  right key derivation regardless of `base`. A latent fidelity gap in a pre-existing test that
  adding the guard forced into the open.

Remaining: 4 (`4df79e93a074f677` P1, `ca231dc0c3c10eb0` P1, `f56215626e5aee83` P1,
`b4da2b0a7845af04` P2 — all manual-only) | New issues introduced: 0

### Iteration 3 — user-directed (Grade: A → A)

`max_review_rounds` is 2 and the loop had already exited `converged`. The user then asked for
all four remaining `manual-only` findings to be fixed, which is a directed fix pass rather
than another auto-fix round — recorded here because the loop's own accounting would otherwise
show four findings abandoned at exit.

Fixes applied: 4

| # | Severity | Summary | File | Status |
|---|----------|---------|------|--------|
| 2 | P1 | A room's shortcut discarded unsaved library work | `src/ui/Edit.tsx`, `src/ui/EditorLibrary.tsx`, `src/ui/RecordForm.tsx` | Applied · caused_by=none |
| 3 | P1 | Clearing a name or description was silently ignored | `src/editor/strings.ts`, `src/ui/RecordForm.tsx`, `src/ui/RoomDetail.tsx` | Applied · caused_by=none |
| 4 | P1 | A raw key change clobbered the destination's text | `src/ui/RecordForm.tsx`, `src/ui/RoomDetail.tsx` | Applied · caused_by=none |
| 5 | P2 | Errors bled across the tab switch | `src/ui/Edit.tsx` | Applied · caused_by=none |

**Fix 2 — ask, and do not ask needlessly.** `Edit` now tracks `libraryDirty`, raised by
`RecordForm` through a new `onDirty` prop on every edit. `createFromRoom` short-circuits when
the library is already showing a blank form of the requested kind — bumping the key there was
the defect in its purest form, destroying the author's work to arrive at the screen they were
already on — and otherwise confirms before discarding. The confirm is the same shape the app
already uses for `ui.confirm.discard`.

**Fix 3 — a product decision, taken rather than deferred.** *Clearing a name means cancelling
the name you gave it.* The overlay cannot hold an empty string (`z.string().min(1)`, and that
minimum is deliberate — a blank name renders as a blank square and reads as a rendering bug),
so the entry is DROPPED. For a shipped record that is exactly the undo the author wanted: the
bundle answers again. For a record the author invented there is nothing underneath, and
dropping would paint `piece.rabbit.name` across every square it stands on — so that save is
refused with the field named. `clearString` was added to `src/editor/strings.ts` beside the
`writeString` / `rekeyStrings` / `dropStrings` family it belongs to.

**Fix 4 — write what was typed, not what happens to be in the box.** The old condition
(`value !== ''`) conflated *this is the text* with *I am setting this text*, and the two come
apart precisely when the author edits the raw KEY instead: the visible field still holds the
old key's text, so the save re-pointed the record AND wrote that text over the destination —
globally, for every record sharing it. `nameTyped` / `textTyped` gate the write and reset on
a successful save. This also makes ordinary edits cheaper: opening a record to change its
movement no longer rewrites its overlay entry.

**One test-tooling change, flagged rather than buried.** `tests/ui/chrome-i18n.test.tsx`'s
JSX-text-node scanner gained a fourth exception: `} \n interface TextSlot {` reads as
`}`-text-`{` to its regex. It is matched tightly — a declaration keyword plus exactly one
PascalCase identifier — so prose like "type your name" is still caught. Worth noting *why*
this surfaced now: the scanner's own comment justified staying a regex because "the file it
guards is 3 files long", and Phase 9a took that list to 8. The blind spot went from unlucky
to likely, and the next occurrence should probably buy the parser.

**Two test harnesses were made `App`-faithful, in two different ways, and both are recorded
because a harness edited during a fix round is where a fix buys its own green light.**
`rename-wiring.test.tsx` mounted `Edit` uncontrolled (round 2). `editor-shell-state.test.tsx`
needed `TranslateContext.Provider` — without it every authored name falls back to its id, so
two label assertions were measuring nothing and passing. `App` supplies both; the harnesses
now do too. No assertion was weakened in either.

**New coverage:** `tests/ui/editor-shell-state.test.tsx`, 10 cases — confirm-and-keep on
refusal, discard on acceptance, no prompt when nothing is at stake, errors cleared on tab
switch, clearing a shipped record's name restoring the bundled text, refusing to leave an
invented record nameless, and re-pointing a raw key without dragging its old text onto the
destination; plus the three the re-review demanded — no prompt after a save, a room shortcut
getting a blank form even after the library saved through its own new button, and the
library's own kind picker / list / new button asking before they discard.

Verification: `npm run verify` GREEN — typecheck + build + 374 vitest + 70 Playwright + 4 PWA.

**The re-review found Fix 2 incomplete in three ways, and all three were the fix reaching
back into the defect it was written to close.** Recorded in full, because "we fixed it and
re-reviewed" is worth nothing if the re-review's own findings are folded away:

1. **`libraryDirty` was a one-way latch.** `RecordForm.save()` cleared its own state on
   success but had no way to tell the shell, so after any successful save the next room
   shortcut prompted "discard unsaved work?" about a form that had none. A guard that fires
   when nothing is at stake is a guard the author learns to click through.
2. **`alreadyOpen` trusted a field a save can leave stale.** The shell's `library.id` stays
   `null` after the library's own new-record button, so a record created AND saved there
   still read as "blank". The room's shortcut would have skipped the remount and handed the
   author their previous record back — and the next save would have overwritten it instead
   of creating what the room asked for.
3. **Only the room's shortcut was guarded** — the least travelled of the four paths that
   remount the form. The kind picker, a click on another record in the list, and the
   new-record button all still discarded a dirty buffer silently. The author's ordinary way
   to leave a half-typed record is to click the next one, so the round-1 P1 was still fully
   reproducible through the library's own UI.

**Reworked rather than patched three times.** `onDirty` became `onDirtyChange(dirty)`, raised
on edit and cleared on a successful save, so the flag is correct rather than monotonic; the
confirm moved INTO `openInLibrary`, which is the one thing all four navigation paths do; and
the `alreadyOpen` short-circuit was deleted outright — with a correct flag and a single gate
it bought nothing, and it was the only place a stale id could still decide anything. Three
more tests cover exactly the three holes.

Verification after the rework: `npm run verify` GREEN — typecheck + build + **377** vitest +
70 Playwright + 4 PWA.

Remaining: 0 | New issues introduced: 0 (3 found by the re-review of iteration 3, all fixed
within it)

## Review Iteration Summary

| Iteration | Grade | Fixes Applied | Remaining | New |
|-----------|-------|---------------|-----------|-----|
| 1 (init)  | D     | —             | 6         | —   |
| 2         | A     | 1             | 4         | 0   |
| 3 (user-directed) | A | 4 (+3 on re-review) | 0 | 0 |

Final grade: **A**
Iterations used: 2 / 2 auto + 1 user-directed
Exit reason: converged
Status: **APPROVED**
human_review_needed: **false**
Counters (see §5): unreviewed 0 · prior-fix 0 · unattributed 0

All six findings are resolved: one by the auto-fix loop, four at the user's direction, and
the sixth was the second voice of the P0 cluster. No `manual-only` or `weak-consensus` P0/P1
remains, so `unverified_severe` is false.

**What the letter still does not measure.** The grade was A after round 2 with three real P1s
open, because the pool was two voices at K = 2 and only one cluster ever got both. The three
that the grade could not see were fixed by a human saying "fix them", not by the gate. If this
repository keeps a two-voice pool, `human_review_needed` — not the letter — is the field to
read.
