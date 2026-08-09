---
type: plan
task_slug: bundled-content-merge
status: complete
created: 2026-08-09
executed: 2026-08-09
tags: [chess-craft, plan, typescript, content, storage, migration]
interview_rounds: 2
adrs: 4
validator_outcome: MAJOR_REVISION_RESOLVED
summary: "Deliver newly shipped bundled records to installs that already saved, via a stored id set"
---

# PLAN — bundled content merge

## 🎯 Executive Summary

**TL;DR.** Newly shipped presets, boards, pieces and cards never reach a browser that has ever
saved in the editor. Fix it by storing, alongside the saved document, the **set of bundled ids
as it stood at the author's last save** — and on load, adding the bundled records whose ids are
in neither that set nor the saved document. The whole merge is one line:

```
merged = saved  +  { bundle records : id ∉ stamp  ∧  id ∉ saved }
```

**Why it is broken.** `src/ui/App.tsx:28` `initialSource()` returns the stored source whenever
`loadStoredContent` succeeds. `STORAGE_KEY = 'strange-chess.content.v1'`
(`src/editor/storage.ts:19`) holds the **entire** `ContentSource`, and `src/ui/Edit.tsx:71` is
the sole production writer. So the first editor save freezes that browser's catalogue
permanently. Reported as *"new maps show up on a fresh install but not on one I already had"*.

(For precision: `App.tsx:37`–`:41` returns the bundle on **every** non-ok load reason, not only
`absent`. The freeze happens on the *ok* path, which never consults the bundle at all.)

**Why it needs a stamp at all.** The saved blob has **no provenance**, so `bundle − saved` is
ambiguous: an id missing from the saved set is either *a record the author deleted* or *a
record that is new*. Confirmed, not assumed — records carry `id` (`schema.ts:344…`) and nothing
about origin, and a bundled preset really can be deleted (`deleteRecord`, four refusal reasons;
see Current state). Remembering which ids the bundle had at save time removes the ambiguity
with one array of strings.

**Scope was reduced after three validation passes** (interview #4, ADR-001). This plan
originally carried a *three-way* merge that would also refresh untouched bundled records from
each new bundle. Roughly half of the ~20 findings across passes 1–3 — and most of the
criticals — were in that machinery alone: fingerprints, canonical form, tuple-versus-set
classification, schema-version invalidation, and the cross-record validation failures a refresh
can cause. Additive-only deletes all of it and still fixes the reported symptom completely.
What it gives up is delivering *fixes to bundled records* into installs that have saved.

**Key decisions:** ADR-001 (additive-only, and the seven-case table it collapses to) ·
ADR-002 (a separate storage key) · ADR-003 (the merge is a recomputed view; only a *successful*
save advances the stamp) · ADR-004 (validate, repair by declining unsatisfiable additions).

**Estimated impact.** One small new module + tests, one new storage key, ~10 lines each in
`App.tsx` and `Edit.tsx`. No change to `ContentSource`, to any record schema, or to the 69
bundled records.

## 📚 Prior Work

- **`[fail:design] saved-blob-forks-shipped-content`** — this defect, with the file/line
  evidence and three candidate policies. Its closing line is the brief: *"persist the author's
  DELTA against a named bundle version."* The id set is that named version.
- **`absent-case = feature black hole`** (global CLAUDE.md, count:8, the most-recurring class)
  — *"any feature that ACTIVATES on an optional field must define the absent-case behaviour
  explicitly."* The optional field is the stamp, and every install that exists today lacks it
  (ADR-003).
- **`[fail:test] assertion-equals-its-own-default`** (count:5) — governs Phase 1 and, as
  validation pass 3 pointed out, governs this plan's own choice of neutrality witness: a test
  whose saved document IS the bundle proves nothing about a merge.
- **`[fail:design] metric-rewards-the-half-it-can-see`** — from the task immediately before
  this one, and the reason ADR-001's scope reduction is recorded with evidence rather than
  taste: the removed machinery is where the errors actually were.

## 🎙️ Interview Transcript

| # | Topic | Category | Question | Options | Choice | Note | → ADR |
|---|-------|----------|----------|---------|--------|------|--------|
| 1 | Installs that already saved carry no stamp | Risk / Scope | How to treat them, once | conservative / aggressive / ask in-app | **Conservative** | Never guesses at an irreversible action; existing installs forgo the backlog once, and every release after that is exact | ADR-003 |
| 2 | How deep the merge goes | Contract | id-only (additive) vs id+fingerprint (three-way) | 3-way / additive-only | **Three-way** *(superseded by #4)* | Chosen to also deliver fixes to bundled records | — |
| 3 | The discard-on-schema-bump path | Scope | Fix `App.tsx:37` too | out of scope / together | **Out of scope** | A different defect needing record-level salvage | — |
| 4 | Scope, revisited after three validation passes | Scope | Keep three-way and fix six more findings, or reduce | **additive-only** / keep+fix+execute / keep+fix+pass 4 | **Additive-only** | ~10 of ~20 findings, and most criticals, were in the refresh machinery; deleting it fixes the reported symptom just as well | ADR-001 |

**Decided without asking** (measurable or conventional, not preferences):
- The merge runs in `initialSource()` — the only place that reads the bundle.
- `merged.strings = saved.strings` (see Technical Design — the bundle has none).
- `merged.schemaVersion = max(saved, bundle)` — the merged document now holds bundle-vintage
  records, so it must declare at least that version; it can never exceed the running build's,
  because the bundle **is** this build.

## 📐 Architecture Decision Records

### ADR-001: Additive-only — add ids the bundle gained, never refresh what is already there
**Status:** Accepted (2026-08-09, via /hm:plan interview #4; supersedes the three-way design)
**Context:** Interview #2 chose a three-way merge that would also refresh untouched bundled
records. Three validation passes then concentrated on exactly that machinery, producing, in
order: an over-broad array-ordering rule; a schema-version invalidation rule that **caused** the
permanent misclassification it claimed to prevent; a canonicaliser that would sort `[2,1]` and
`[1,2]` alike and therefore let the bundle **overwrite an author's edit to a piece's
movement**; board placements wrongly marked order-bearing, with a required test that would have
frozen the mistake; a repair step whose literal reading deleted a room the author had played
for months; and a repair loop with no progress guarantee for cross-record validation errors.
All six are properties of *refresh*. None exists without it.
**Decision:** The stamp is a **set of bundled ids** as of the author's last save. On load, add
every bundled record whose id is in neither the stamp nor the saved document. Nothing else is
touched. The seven reachable membership cases collapse to one action:

| # | B | T | S | what it means | verdict |
|---|---|---|---|---|---|
| 1 | ✗ | ✗ | ✓ | the author created it | keep the saved record |
| 2 | ✗ | ✓ | ✓ | this release removed it from the bundle; the author still has it | keep the saved record |
| 3 | ✗ | ✓ | ✗ | removed from the bundle, and already deleted by the author | nothing |
| 4 | ✓ | ✗ | ✗ | **new this release** | **add it from the bundle** |
| 5 | ✓ | ✗ | ✓ | the author created an id the bundle now also ships | keep the saved record; skip the bundled one |
| 6 | ✓ | ✓ | ✗ | the author deleted a bundled record | leave it out |
| 7 | ✓ | ✓ | ✓ | present everywhere | keep the saved record |

Every row but 4 is "keep whatever the saved document has", which is what makes the
implementation `saved ++ additions` rather than a per-record decision tree.
**Consequences:**
- ✅ No fingerprints, no canonical form, no tuple-versus-set classification, no
  canonicaliser-version invalidation. Two ADRs deleted with them.
- ✅ Row 5 cannot produce `duplicate id` at `load.ts:168`: an addition is made only when the id
  is absent from the saved set.
- ✅ **An author's record can never be overwritten by this feature** — the sharpest risk in the
  three-way design, now structurally impossible rather than guarded.
- ⚠️ **Fixes to bundled records never reach an install that has saved.** The accepted cost, and
  the half of the original problem this no longer solves. Adding it later means putting
  fingerprints in the stamp — an extension of this shape, not a rewrite.
- ⚠️ A bundled record whose id an author has taken (row 5) is shadowed for good.
**Rejected alternatives:**
- *Three-way with fingerprints* — designed and validated three times; see Context. Deferrable
  without redesign.
- *Per-record provenance flag* — `pieceDef` is `z.strictObject` (`schema.ts:343`), so an extra
  field fails validation outright.
- *Bundle version integer* — needs a hand-maintained changelog of which ids arrived when.
**Source:** Interview #4

### ADR-002: The stamp lives under its own storage key
**Status:** Accepted (2026-08-09)
**Context:** The obvious home is a field on the saved document, and it does not survive:
`loadStoredContent` (`storage.ts:62`) goes through `importContent`, which **rebuilds the source
field by field** (`io.ts:60`–`:71`), so any new top-level field is silently dropped on the very
next read. (The document root is *not* a strict Zod object — an earlier draft claimed it was,
which is false and would have sent a future reader to re-litigate a sound decision.)
**Decision:** A separate key, `strange-chess.bundle-stamp.v1`, beside `STORAGE_KEY` in
`src/editor/storage.ts`. Shape: `{ ids: string[] }`.
**Consequences:**
- ✅ `ContentSource`, its schema, and the import/export format are untouched.
- ✅ A corrupt or absent stamp degrades to the ADR-003 path rather than making the document
  unreadable — the stamp can never cost an author their work.
- ⚠️ Two keys can disagree; bounded by ADR-003.
- ⚠️ An exported document carries no stamp, so importing one behaves like a fresh install for
  merge purposes. Correct — an import *is* someone else's document.
**Source:** Assumption, recorded

### ADR-003: The merge is a recomputed view; only a SUCCESSFUL save advances the stamp
**Status:** Accepted (2026-08-09, via interview #1; hardened twice under validation)
**Context:** Every install that exists now has a saved document and no stamp — the
most-recurring failure class here, so the absent case must be a defined path. Two ways of
writing the stamp were tried and both were unsound:

- **Writing it at load**, while leaving the merged document in React state only, means the next
  load sees those records in the stamp and not in the saved set — row 6, *author deleted* — so
  **the merge classifies its own additions as deletions and drops them.** It would have worked
  once per session and reverted on reload.
- **Writing it unconditionally at save** is the same failure through the quota door:
  `saveContent` returns `{ok: false, reason: 'quota'}` rather than throwing (`storage.ts:41`),
  so a refused save leaves the stamp ahead of content that was never stored, and the record the
  author could see becomes row 6 and disappears.

**Decision:** `initialSource()` **writes nothing**; the merge is recomputed on every load from
(saved, bundle, stamp-or-synthesised). The stamp is written **only** by the save path
(`Edit.tsx:71`), **only when `saveContent` returns ok**, and that save persists the merged
document. When no stamp is stored, synthesise one from the **current** bundle ids and run the
identical merge — nothing is new relative to it, so nothing is added.
**Invariant:** *the stamp may lag the content, never lead it.* A lagging stamp is safe and
self-healing: a bundled id added after it is row 5 (in saved, not in the stamp), so the saved
record — already the newer copy — is kept, and the next successful save re-synchronises.
**Consequences:**
- ✅ No load-time write at all: quota and private-mode failure modes vanish rather than being
  waved off, and there is exactly one stamp writer.
- ✅ Recomputation is idempotent — an install that never saves shows the same merged catalogue
  on every load, forever, without persisting anything.
- ✅ The absent case is not a branch: `mergeBundled` never learns the stamp was missing.
- ⚠️ **Existing installs forgo the backlog.** Content shipped between their first save and
  their next save after this release will not appear. Accepted cost of not resurrecting
  deletions; invisible to the player, and no in-app notice is shown (the app has no changelog
  surface, and announcing content that is not coming is worse than silence).
- ⚠️ The merge runs on every load: a set difference over 69 ids. Not a measurable cost.
**Rejected alternatives:** writing the stamp at load; writing it unconditionally at save;
persisting the merged document at load (makes the entry path a content writer, and
`saveContent` refuses on quota by design); merging everything missing once (resurrects
deletions); asking the player (a provenance question a child cannot answer).
**Source:** Interview #1, hardened after validation passes 1 and 2

### ADR-004: Validate, and repair by declining additions — with a progress rule
**Status:** Accepted (2026-08-09; progress rule added after validation pass 3)
**Context:** `loadContentSet` Pass 2 (`load.ts:175`) rejects a document with dangling
references, and an addition can dangle: the bundle adds `preset.cavalry`, which references
`skill.veil`, which this author deleted. Failing to start is far worse than not merging.

Validation pass 3 found the subtler half. Pass 2 has error classes beyond `references unknown`
whose **attribution does not name the record that changed** — the loadout `replaces` check
(`load.ts:373`) reports against a preset, and the paired-square symmetry check (`load.ts:258`)
reports against a board. A repair loop that declines "the candidate the error names" can
therefore find nothing to decline, make no progress, and fall through — and with deterministic
inputs the merge is then permanently off. Additive-only shrinks this sharply (only additions
are ever candidates, and a brand-new square type cannot invalidate a board the author painted
before it existed) but does not by itself guarantee progress.
**Decision:** Validate the merged document. On failure, decline additions and re-validate to a
fixed point. **Declining an addition means omitting it** — there is no other kind of candidate,
which is why this ADR is four lines where the three-way version needed a table. The **progress
rule**, which the termination argument actually depends on: decline every addition that appears
in, or is referenced by, any record named in an error; **if that set is empty, decline all
remaining additions.** Every round therefore strictly shrinks the candidate set.
**Soundness:** the worst fixed point — declining everything — is exactly the saved document,
and the saved document is **valid by construction**: `loadStoredContent` reaches its ok branch
only through `importContent`, which runs `loadContentSet` and fails closed (`io.ts:57`,
`storage.ts:62`). So repair always converges on something that validates, and the fall-back
branch is unreachable by any bundle.
**Consequences:**
- ✅ The author's deletion stays authoritative, and nothing they have is removed to honour it —
  only an addition is declined.
- ✅ Repair provably converges, so the merge cannot be permanently off for deterministic inputs.
- ✅ Declined ids are named behind a `mergeFailed` flag, **distinct from `failedToLoad`** (which
  already means "your saved work did not load"; overloading it would make two very different
  problems indistinguishable in a field report).
- ⚠️ The all-or-nothing final round can decline more additions than strictly necessary.
  Accepted: it fires only when attribution fails, and correctness beats completeness here.
- ⚠️ The fall-back branch is unreachable in production, so only fault injection covers it.
  Stated, rather than left as an exit criterion nobody can satisfy.
**Source:** Assumption, hardened after validation passes 1 and 3

## 🏗️ Technical Design

### Current state

| Concern | Where | Shape today |
|---|---|---|
| Source selection | `src/ui/App.tsx:28` | Stored wins whenever valid; the bundle is returned on **every** non-ok reason |
| Persistence | `src/editor/storage.ts:19` | One key holding the whole `ContentSource`; `saveContent` **refuses on quota** (`:42`), returning `{ok:false}` rather than throwing |
| Read path | `storage.ts:62` | Through `importContent`, which **rebuilds the source field by field** (`io.ts:60`) — unknown top-level fields are silently dropped |
| The only production writer | `src/ui/Edit.tsx:71` | `saveContent(storage, next)` |
| The document | `src/content/load.ts:57` | `schemaVersion` + `strings?` + `pieces` / `squareTypes` / `ruleCards` / `skillCards` / `boards` / `presets` |
| Record identity | `src/content/schema.ts:344…` | `id: contentId`. **No origin, no provenance.** `pieceDef` is `z.strictObject` (`:343`) |
| Deletion | `deleteRecord` (`src/editor/draft.ts:262`) | Four refusal reasons: `missing`, `last-room` (a preset when `presets.length <= 1`), `referenced`, `invalid` |
| Reference reachability | `roomsReferencing` (`references.ts:64`) | Transitive through boards; returns `[]` for `kind === 'preset'`, so **presets are the only bundled records deletable in one step** — the four shipped presets reach every piece, card, board and square type |
| Validation | `loadContentSet` Pass 2 | `references unknown` (`load.ts:193`), duplicate ids (`:168`), loadout `replaces` (`:373`), paired-square symmetry (`:258`) |
| Bundled size | `src/content/sets/bundled.ts` | **69** records: 12 pieces, 8 square types, 17 rule cards, 24 skill cards, 4 boards, 4 presets |
| Bundled text | `src/i18n/ko.ts` | `bundledContentSource` declares **no `strings` field at all** |

### `strings` and `schemaVersion`

**`merged.strings = saved.strings`.** The bundle has no `strings`, so there is nothing to merge
in — bundled record text lives in `src/i18n/ko.ts`, a code file that ships current. What matters
is the opposite direction: `saved.strings` holds the author's renames and is pruned by
`deleteRecord` (`draft.ts:300`), so a merge built bundle-first would lose them.
(`ContentStrings` is `z.record(localeCode, z.record(i18nKey, z.string()))` — nested, not the
flat map an earlier draft assumed.)

**`merged.schemaVersion = max(saved, bundle)`.** The merged document now holds bundle-vintage
records, so it must declare at least the bundle's version; it can never exceed the running
build's, because the bundle is this build. Keeping the saved value would let a document
declaring v10 carry v11 records.

### Flow

```
initialSource()
  ├─ loadStoredContent ──absent/invalid──▶ bundled (unchanged behaviour)
  │        │ ok
  │        ▼
  ├─ loadStamp ──absent or corrupt──▶ { ids: bundle ids }        ← ADR-003
  │        ▼
  ├─ merge: saved ++ bundle records whose id ∉ stamp.ids ∧ ∉ saved
  │        ▼
  ├─ loadContentSet(merged) ──invalid──▶ decline additions (progress rule), retry
  │        ▼ valid
  └─ merged                       (nothing is written here — ADR-003)

Edit.tsx save
  └─ result = saveContent(next)
       ├─ result.ok     ──▶ saveStamp({ ids: bundle ids })    ← the only stamp writer
       └─ not ok        ──▶ leave the stamp alone             ← may lag, never lead
```

### Affected components

**Added:** `src/content/merge.ts` — `stampOf()`, `mergeBundled()`, the `BundleStamp` type.
Pure: no storage, no DOM. Plus `tests/content/merge.test.ts` and
`tests/content/upgrade.test.ts`.

**Changed:** `src/editor/storage.ts` (stamp load/save) · `src/ui/Edit.tsx` (stamp beside a
successful save) · `src/ui/App.tsx` (`initialSource()` merges, repairs, falls back; **exported
with an injectable bundle** — it is currently module-private with a static import, and Phase 3's
criterion is unwritable otherwise).

**Existing tests that seed `STORAGE_KEY` directly** and therefore start taking the new path:
`tests/ui/shell-states.test.tsx:46`, `:57`, `:73` and `tests/ui/strings-overlay.test.tsx:123`,
`:139`. See Phase 3 — only some are real witnesses, and saying which is the point.

**Untouched, deliberately:** `src/content/schema.ts` and every record shape ·
`src/content/load.ts` · `src/editor/io.ts` · `src/content/sets/bundled.ts`.

## 📝 Implementation Plan

> **Runner.** npm (`package-lock.json`; no pnpm). `npm run test` excludes `e2e/**`,
> `tests/build/**`, `tests/strength/**` (`vitest.config.ts:37`). `npm run verify`
> (`package.json:18`) re-adds them plus **two Playwright suites**, so a browser-install failure
> there is an environment problem, not a merge regression (cf. `fbf688b`).

### Phase 1 — The merge, as a pure function

- **Status:** DONE — `src/content/merge.ts`, `tests/content/merge.test.ts` (21 tests). A.5 PASS.
- **depends_on:** `[]`
- **parallel_group:** `serial-1`
- **merge_hazards:** none — a new module and a new test file.
- **Scope in:** `src/content/merge.ts` (new), `tests/content/merge.test.ts` (new).
- **Scope out:** storage, `App.tsx`, `Edit.tsx`. The app behaves exactly as today.
- **Exit criterion:** `npm run test && npm run typecheck` green, covering:
  1. **All seven rows of ADR-001**, each with a fixture where that row is the only thing that
     differs. Row 1 gets a named assertion — *an authored record survives the merge* — because
     an implementation iterating the bundle instead of the saved set would delete the child's
     whole catalogue. **No fixture may have the saved set equal to the bundle** for the row it
     tests; that collapses every row to "unchanged" (count:5 here).
  2. `merged.strings === saved.strings`, asserted with an author-renamed bundled piece.
  3. `merged.schemaVersion === max(saved, bundle)`.
  4. The absent-stamp path adds nothing and preserves a deletion.
  5. Purity: none of the three inputs is mutated.
- **Risk:** `low`
- **Rollback:** the phase's own commit.

### Phase 2 — Stamp persistence

- **Status:** DONE. A.5 PASS. **One scope addition:** the exit criterion's fourth item
  ("a content save refused for quota leaves the stamp unchanged") is a property of
  `Edit.tsx`'s `persist()`, not of `storage.ts` — `saveStamp` has no knowledge of
  `saveContent`'s result, so the branch is unfalsifiable from `tests/editor/storage.test.ts`
  alone. Added `tests/ui/stamp-on-save.test.tsx`, which drives a real editor save and induces
  the quota at the `Storage.prototype` boundary. The PLAN's file list was short by one test
  file; the criterion it was written to satisfy is unchanged.
- **depends_on:** `[1]`
- **parallel_group:** `serial-2`
- **merge_hazards:** `src/editor/storage.ts` — shared with the content key.
- **Scope in:** `src/editor/storage.ts` (`STAMP_KEY`, `loadStamp`, `saveStamp`),
  `src/ui/Edit.tsx`, `tests/editor/storage.test.ts`.
- **Scope out:** `App.tsx`.
- **Exit criterion:** `npm run test && npm run typecheck` green, covering: a round-trip; a
  corrupt stamp reads as absent rather than throwing; a stamp write that throws does not fail
  the content save it accompanies; and **a content save refused for quota leaves the stamp
  unchanged** — `saveContent` returns `{ok:false}` rather than throwing, so an unconditional
  write would put the stamp ahead of the content and the record the author could see would
  become row 6 and vanish.
- **Risk:** `low`
- **Rollback:** Phase 1.

### Phase 3 — Wire into `initialSource()`

- **Status:** DONE. A.5 PASS. `initialSource(bundle = bundledContentSource)` and
  `mergeWithRepair(saved, bundle, stamp, validate = loadContentSet)` are both exported;
  `additionsToDecline` carries the progress rule. `mergeFailed` surfaces as
  `data-merge-declined` on `<main>` — an attribute rather than a notice, because ADR-003 rules
  out announcing content that is not coming and a child cannot act on "one room needed a card
  you deleted", while a field report IS a DOM capture. Both the present and absent paths
  through that one call site are asserted by rendering `App`.
  **Two implementation notes worth carrying forward:**
  1. The reference half of the progress rule is a substring scan over the records an error
     names, not a per-schema reference table. The table is the part that rots — it needs
     extending every time a record gains a field naming another record — and over-declining
     costs at most an addition, which ADR-004 accepts by name.
  2. `tests/structure/no-content-in-engine.test.ts` failed the first draft: ADR-001 forbids
     `src/ui/**` from naming a content id, and the doc comment quoted ADR-004's own
     `skill.veil` example. The gate was right; the comment is now generic.
- **depends_on:** `[2]`
- **parallel_group:** `serial-3`
- **merge_hazards:** `src/ui/App.tsx` — the app's entry decision.
- **Scope in:** `src/ui/App.tsx` — export `initialSource(bundle = bundledContentSource)`; the
  ADR-004 repair loop with its progress rule; the `mergeFailed` flag and its one call site.
- **Scope out:** the schema-bump discard path at `App.tsx:37` (interview #3).
- **Exit criterion:** `npm run test && npm run typecheck` green, plus tests at the
  `initialSource` level proving:
  1. a first run still gets the bundle unchanged;
  2. a saved install with no stamp is unchanged **and nothing is written** — assert both
     storage keys are untouched by a load, which is ADR-003's central claim;
  3. a saved install *with* a stamp receives the new records;
  4. **a mixed-membership neutrality case** — a saved document that is neither the bundle nor
     disjoint from it (some shared ids, some ids the bundle lacks, some bundled ids absent).
     Validation pass 3 caught that the two existing files are weak witnesses:
     `shell-states.test.tsx:46`/`:57` seed invalid content and exit at `App.tsx:37` before any
     merge runs, and `:73` seeds the bundle **itself**, so the merge is a no-op by construction
     — this plan's own `assertion-equals-its-own-default` rule, applied to its own proof. Only
     `strings-overlay.test.tsx:123`/`:139` is a real witness. Both files must stay green
     **unedited**, but as regression witnesses, not as the neutrality proof.
  5. a dangling addition is declined and the repaired document validates, with the declined ids
     named in `mergeFailed`. **Not** a test reaching the fall-back branch: ADR-004 proves it
     unreachable for any bundle, so demanding one would be demanding the impossible; it is
     covered by fault injection into the repair loop.
- **Risk:** `medium` — a mistake here is a blank app.
- **Rollback:** Phase 2.

### Phase 4 — The upgrade, end to end

- **Status:** DONE. A.5 PASS. `tests/content/upgrade.test.ts`, 4 tests.
  **The regression claim was checked, not asserted.** "The only test that would have failed
  before the fix" is the sort of claim a green suite cannot support, so `initialSource` was
  temporarily reverted to its pre-fix body (`return { source: stored.source, … }`) and the file
  re-run: **3 of 4 fail**, the fourth being the already-current no-op, which correctly passes
  either way.
  **That probe found a real defect in the first draft of the fixture.** `releaseWithout(ids)`
  removed records by id with no prune, so other rooms were left naming cards that were gone —
  a document that does not validate. `initialSource` then took its `failedToLoad` branch,
  returned the whole bundle, and one test passed **against the pre-fix code**: every "the
  record is present" assertion was satisfied without the merge running at all. Replaced by
  `releaseWithoutRooms(rooms)`, which prunes via the real `roomsReferencing` and asserts
  `loadContentSet(next).ok` on the fixture itself. This is
  `[fail:test] test-setup-hides-the-failure-path` in a new costume, and only the probe caught
  it — no gate could have.
- **depends_on:** `[3]`
- **parallel_group:** `serial-4`
- **merge_hazards:** none — tests only.
- **Scope in:** `tests/content/upgrade.test.ts` (new).
- **Scope out:** production code. A production change needed here is a Phase 3 defect.
- **Exit criterion:** a test that **replays the field report** — build a saved document from a
  reduced "old" bundle, stamp it, load against the real `bundledContentSource`, assert the
  records the old set lacked are present and the document validates. Plus the mirror: the same
  run with a bundled record deleted first, asserting it stays deleted. **The deleted record must
  be a preset** — `roomsReferencing` returns `[]` only for presets, and every other kind is
  reachable from one of the four shipped presets — and the fixture needs **more than one**
  preset or `deleteRecord` refuses with `last-room`. Then `npm run verify` green.
- **Risk:** `low`
- **Rollback:** Phase 3.

## 🪟 Newly-reachable window (Phase D.5)

This unit is a **repair**, so the green gates above measure the coverage that existed before
it. `[fail:code] fix-introduced-defect-passes-all-gates` sits at count:4 in this repo, every
instance on an entirely green four-gate run. So: what does this fix newly make reachable?

**The window.** Before this change, `initialSource`'s ok branch returned the saved document
verbatim — the bundle was **never read on that path at all**. The repair opens it, and with it
three input windows that no code path could previously produce:

| # | Window | Entered by |
|---|---|---|
| A | A document that is **part-authored, part-bundle** — records inserted into a document that has been through the editor, then handed to `loadContentSet` Pass 2. Pass 2 had never seen such a mixture. | `upgrade.test.ts` *receives the rooms this release added…*; `initial-source.test.tsx` *handles mixed membership…*; and the case where Pass 2 actually **rejects** it — *declines the addition, names it, and returns a document that validates* |
| B | **The stamp is absent** — the optional input, and the state of every install alive today. | `initial-source.test.tsx` *changes nothing* + *writes nothing — neither key is touched by a load*; `merge.test.ts` *adds nothing, and preserves a deletion, when the stamp is synthesised…* |
| C | **The stamp lags the document** — fewer ids than the document holds, after a refused write. | `stamp-on-save.test.tsx` *leaves the stamp untouched when the content save is refused for quota* (the write side) and `initial-source.test.tsx` *is safe when the stamp LAGS the saved document* (the load side) |

**Window C's load side was the gap this step found.** The write side was covered from Phase 2
and `merge.test.ts` row 5 covers the membership pattern, but nothing entered the window at the
`initialSource` level — which is where the invariant's safety argument actually has to hold.
Added rather than argued away.

**Absent-case (the repo's most-recurring class, count:8).** The feature activates on an
optional field — the stamp — and every install that exists today lacks it. The absent-case
behaviour is a **default**: synthesise from the current bundle, which adds nothing and
resurrects nothing. Window B is that case, covered at both the pure-function and the
`initialSource` level.

## 🧪 Testing Strategy

**Unit.** `tests/content/merge.test.ts`: seven rows, strings preservation, `schemaVersion`, the
absent-stamp path, purity. `tests/editor/storage.test.ts`: stamp round-trip, corruption, and
the two write-failure directions.

**Integration.** `tests/content/upgrade.test.ts` replays the field report against the real
bundle — the only test that would have failed before the fix, and therefore the regression
gate. Phase 3's mixed-membership case is the neutrality proof.

**Manual (one pass, because the bug came from a device).** Save once in the editor and confirm
a stamp key appears; reload and confirm the catalogue is unchanged; delete **a bundled preset**
(the only bundled record deletable in one step), save, reload, confirm it stays deleted.

**Explicitly NOT asserted:** that existing installs receive the backlog (ADR-003), or that a
bundled record's later fixes reach an install that has saved (ADR-001). Tests claiming either
would encode the wrong contract.

## ⚠️ Risks & Mitigation

| # | Risk | Likelihood | Impact | Mitigation |
|---|------|-----------|--------|------------|
| R1 | The merge classifies its own additions as deletions on the next load | **Was certain** | Critical | ADR-003: `initialSource` writes nothing; Phase 3 asserts both storage keys are untouched by a load. The first draft shipped this, and its phase gate asserted the state that caused it. |
| R2 | The stamp leads the saved document after a refused save, and the record vanishes | Medium | High | The stamp write is conditional on `saveContent` returning ok (Phase 2 asserts it). Invariant: the stamp may lag, never lead — and a lagging stamp is safe, since the affected id becomes row 5 and the saved copy is kept. |
| R3 | The author's `strings` (renames) are lost by a bundle-first merge | Medium | High | `merged.strings = saved.strings`, asserted with a renamed bundled piece. The first draft had this backwards. |
| R4 | An addition dangles and the repair loop makes no progress, leaving the merge permanently off | Low | High | ADR-004's progress rule: decline every addition named by or referenced from an error, and if that set is empty decline all remaining additions. Every round strictly shrinks the candidate set; the worst fixed point is the saved document, valid by construction. |
| R5 | Existing installs never receive the backlog | Certain | Low | Accepted (ADR-003, interview #1); no in-app notice. |
| R6 | Fixes to bundled records never reach an install that has saved | Certain | Medium | Accepted (ADR-001, interview #4) — the cost of the scope reduction, and the reason the stamp's shape leaves fingerprints as a later extension. |
| R7 | A bundled record is permanently shadowed by an author's id (row 5) | Low | Low | Correct behaviour; stated so it is not later read as a bug. |
| R8 | An imported document has no stamp and merges like a fresh install | Low | Low | Correct (ADR-002) — an import is someone else's document. |

## ✅ Success Criteria

- [x] A saved install that upgrades receives every bundled record added since its stamp, and the
      merged document validates.
- [x] **An authored record survives the merge** (row 1) — asserted by name.
- [x] A bundled record the author deleted stays deleted; one this release removed but the author
      still holds is kept.
- [x] An author-created id that the bundle later also ships keeps the author's record, with no
      duplicate id.
- [x] `merged.strings === saved.strings` with an author rename surviving;
      `merged.schemaVersion === max(saved, bundle)`.
- [x] `initialSource()` **writes nothing**; the stamp advances only through `Edit.tsx`, and only
      when `saveContent` returned ok.
- [x] A dangling addition is declined, the repaired document validates, and `mergeFailed` names
      the declined ids.
- [x] The mixed-membership neutrality case passes, and `tests/ui/shell-states.test.tsx` /
      `tests/ui/strings-overlay.test.tsx` pass **unedited**.
- [x] `ContentSource`, every record schema, and `src/content/sets/bundled.ts` are unchanged.
- [x] `npm run verify` green.

## 🔍 Plan Validation

**Three passes, all `MAJOR_REVISION`, and the fourth response was to cut scope rather than patch
again.** Counts: pass 1 — 4 critical / 6 warning / 3 suggestion; pass 2 — 5 critical / 2
warning, **every one in a section pass 1 had forced a rewrite of**; pass 3 — 2 critical / 4
warning, with 5 of pass 2's 7 fixes independently verified correct.

The findings were converging, but their *location* was not moving: roughly half of the ~20, and
most of the criticals, were in the three-way refresh machinery. Interview #4 put that evidence
in front of the author, who chose additive-only. **That deletes the machinery rather than
fixing it**, and with it:

| Finding | Fate |
|---|---|
| #8, #14 — stamp `schemaVersion` invalidation (the rule that caused the permanent pin it claimed to prevent) | **Moot** — no fingerprints, so nothing to invalidate. That ADR is deleted. |
| #10, #15, #16, #22 — array ordering, fixed-arity tuples, `placements` misclassified, the three-class enumeration | **Moot** — no canonical form. That ADR is deleted. |
| #23 — fingerprint stability across the JSON round trip | **Moot** — no fingerprints. |
| #4, #18, #21 — refresh-induced dangles, per-case decline semantics, repair attribution | **Shrunk to one rule.** Only additions are candidates, so decline has one meaning; the progress rule remains and is now stated. |
| #25 — "content-identical" ambiguous once arrays are sorted | **Moot** — a no-op merge returns the saved records verbatim, so deep equality is the right relation. |

Findings that survive the scope change and are fixed in this document: #1/#17 (stamp write
timing — ADR-003), #2 (the case table's totality — ADR-001, now seven rows), #3 (`strings`
direction), #5 (69 records, not 67), #6 (four deletion refusal reasons; presets only), #7
(`initialSource` export), #9/#24 (the existing test files, and `merged.schemaVersion`), #11
(`mergeFailed` as its own flag), #12 (ADR-002's real reason), #13 (the `verify` cost), #19 (the
unreachable fall-back branch), #20 (the dead enumeration entry — gone with its ADR), and #26
(`shell-states.test.tsx` is not a neutrality witness; Phase 3 now says which seed is).

**This document has not been validated since the scope change.** It is materially smaller than
the version pass 3 read — two ADRs deleted, one merge rule instead of eight cases — which is an
argument for expecting fewer defects, not evidence of none.

**Cross-model second opinion:** `codex` — **skipped** on all three passes. The side preset gates
cross-model invocation on a high-diff change and `hm high_diff classify` returns
`is_high: false` because the working tree is empty at plan time. This gate can never clear
during planning: a standing gap, not a one-off.
