---
type: plan
task_slug: content-provenance-and-room-delete
status: complete
created: 2026-08-09
tags: [chess-craft, plan, typescript, react, content-provenance, editor-ux, localstorage]
interview_rounds: 4
adrs: 7
validator_outcome: MAJOR_REVISION_RESOLVED
summary: "Official vs authored content becomes a derived, visible distinction; official records hide instead of delete."
---

## 🎯 Executive Summary

**TL;DR.** Make "what we shipped" and "what the child made" two visibly different things,
without touching the content schema. Official records are identified by membership in the
bundled id set, edited by forking rather than in place, removed by *hiding* rather than
deleting, and never rendered as a raw `piece.king`-shaped id.

**What.** Six changes, one theme:

1. A pure `provenance` module answers "is this ours or theirs?" from the bundle's own ids.
2. Editing an official record's *rules* produces an authored copy; renaming it does not.
3. Official records are hidden (reversibly, per browser) instead of deleted.
4. Room and library lists split into 「기본」 / 「내가 만든 것」 sections.
5. Raw content ids never reach the screen — an unresolvable name becomes a Korean
   kind-name (`이름 없는 기물`).
6. The home carousel gains a way into room management; deletion itself stays in one place.

**Why.** The saved document carries no provenance at all (`src/content/merge.ts:11-15`),
which is the same root cause already recorded as `[fail:design]
saved-blob-forks-shipped-content`. Today a child can permanently delete a room we shipped,
can edit our king in place with no copy kept, and can be shown the literal string
`piece.king`. None of these is recoverable from inside the product.

**Key decisions.** ADR-001 (fork-on-edit, rules only) · ADR-002 (no raw ids in UI) ·
ADR-003 (provenance derived, not stored) · ADR-004 (hide, don't delete) · ADR-005 (hiding
filters lists, never the document) · ADR-006 (hidden set in its own storage key) ·
ADR-007 (an official record's id field is read-only).

**Estimated impact.** ~4 new modules, ~12 edited files, no schema change, no migration, no
change to `ContentSource` — every existing saved document keeps working untouched.

## 📚 Prior Work

- **`work-docs/REVIEW-bundled-content-merge-2026-08-09.md`** and the merge it reviewed
  (`src/content/merge.ts`) are the direct precedent. The merge already had to answer
  "deleted by the author, or never shipped?" and solved it with a stamp. This PLAN answers
  the adjacent question — "ours or theirs?" — and deliberately does *not* reuse the stamp
  for it (see ADR-003).
- **Memory `[fail:design] saved-blob-forks-shipped-content`** names the exact trap this
  PLAN must not re-dig: *"the stored blob predates every record added after it, carries no
  `bundledVersion` and no provenance per record"*, and the fix it warns against is a
  schema field whose absent case is undefined. ADR-003 avoids the trap by not adding a
  field at all.
- **Memory `[fail:test] test-setup-hides-the-failure-path` (count: 6)** is the testing
  constraint. Its sixth instance was specifically about a storage key whose *absent* branch
  had no coverage. Every phase below that reads storage must have a test for the absent
  key, and §🧪 makes that explicit rather than implied.
- **`src/editor/storage.ts:76-136`** is the shape ADR-006 copies: a second key, read
  defensively, every failure resolving to the safe direction.
- **`src/editor/draft.ts:237-306`** — the existing three-gate delete. This PLAN adds a
  branch *in front of* it, and reuses gates 1 and 3 rather than restating them.

## 🎙️ Interview Transcript

| # | Topic | Category | Question | Options | Choice | Note | → ADR |
|---|-------|----------|----------|---------|--------|------|-------|
| 1 | The real delete gap | Scope | Delete already exists in the editor — what is actually missing? | official-rooms-must-not-vanish / editor-only discoverability / no undo / distinction only | official-rooms-must-not-vanish **and** editor-only discoverability (multi) | Undo explicitly not chosen; reversibility comes from hiding instead | ADR-004 |
| 2 | Editing official content | Architecture | What happens when the child edits something we shipped? | fork-on-edit / edit in place + badge / read-only | fork-on-edit | Original always survives; "restore default" becomes free | ADR-001 |
| 3 | Unresolvable names | Contract (UI) | What is shown when a record's name cannot resolve? Today: `piece.king` | Korean kind-name / require a name / humanise the slug | Korean kind-name | Raw ids leave the UI entirely | ADR-002 |
| 4 | Provenance basis | Contract | What decides that a record is official? | derived from bundle ids / stored `origin` field (schema v11) / derived + `forkedFrom` | derived from bundle ids | No schema change, no migration, no absent case | ADR-003 |
| 5 | Deleting an official room | Risk | What happens when the child deletes a room we shipped? | hide (reversible) / no delete button / delete + restore | hide (reversible) | Solves "too many rooms" without permanent loss | ADR-004 |
| 6 | Showing the distinction | UI | How is official-vs-authored surfaced? | two sections / per-item badge / both | two sections | Reads better for a child than a badge; sorting follows | — |
| 7 | Play-surface entry point | Phasing | How does room management reach the home carousel? | '방 관리' button → editor rooms / manage inline / defer | button → editor rooms | Delete stays implemented in exactly one place | — |
| 8 | Fork boundary | Contract | Does renaming count as an edit? | rename ≠ fork, rules ⇒ fork / any edit ⇒ fork / fork + in-room swap | rename ≠ fork, rules ⇒ fork | Preserves the i18n-overlay rename UX (`src/ui/i18n.ts:16`) | ADR-001 |
| 9 | Hiding scope | Scope | Rooms only, or all official content? | all official content / rooms only / end interview | all official content | One rule: "what we gave you does not disappear" | ADR-004 |
| 10 | Editing an official record's **id field** | Contract | `RecordForm.tsx:1138` exposes an editable id; on an official record this currently overwrites the original in place. What should happen? | lock the id field / treat as fork keyed on `openedId` / remove the id field | lock the id field | Raised by `plan-validator` (critical #2). Collapses three rename paths to two and removes the fork-anchor ambiguity entirely | ADR-007 |
| 11 | Hiding on **picker** surfaces | Scope | Do hidden records also disappear from the room composition checklists and the remix gallery? | all lists / browse lists only / picker only | all lists | Raised by `plan-validator` (warning #1). One meaning for 숨김 | ADR-005 |
| 12 | Closing out validation | Risk | Pass 2 returned MAJOR_REVISION and the two-pass cap is reached; all four findings were fixed but no third pass verified the fixes. Proceed, exceed the cap, or abort? | proceed with the revised PLAN / third validator pass / abort | proceed with the revised PLAN | `validator_outcome: MAJOR_REVISION_RESOLVED`. The unverified fixes are recorded as accepted risk in §🔍 rather than presented as validated | — |

**Assumptions taken without asking** (defensible defaults, recorded rather than deferred):

- The hidden set lives under its own storage key, not as a field on the saved document —
  `importContent` rebuilds the source field by field and would drop an unknown top-level
  field on the very next read (`src/editor/storage.ts:79-84` records this happening once
  already). Promoted to ADR-006 because it is a contract.
- The last *visible* room cannot be hidden — the same rule as `deleteRecord`'s `last-room`
  gate (`src/editor/draft.ts:269`), reusing its `reason` so the refusal sentence is one
  sentence in one place.
- A forked copy's id is the original's with a numeric suffix (`piece.king` →
  `piece.king-2`), incremented until free. `contentId` is `^[a-z]+\.[a-z0-9-]+$`
  (`src/content/schema.ts:136`), which the suffix satisfies.
- Hiding is per-browser, like every other piece of state this app persists. There are no
  accounts.

## 📐 Architecture Decision Records

### ADR-001: Editing an official record's rules forks it; renaming it does not
**Status:** Accepted (2026-08-09, via /hm:plan interview; Decision corrected after
`plan-validator` pass 1, critical #2)
**Context:** Official content is edited in place today, so an authored change is
indistinguishable from what we shipped and the original is unrecoverable. But renaming is
already a first-class, deliberately supported action, and forking on rename would multiply
the catalogue every time a child calls the king 임금님.

There are **three** rename mechanisms in this codebase, not one, and the first draft of
this ADR saw only the third:

| # | Mechanism | Effect on the record |
|---|---|---|
| a | The name field → `foldText` (`src/ui/RecordForm.tsx:542`) | none — the typed text is folded into `source.strings` at the existing `nameKey` |
| b | The **id** field (`RecordForm.tsx:1138`) → `prepared()` re-derives `nameKey`/`textKey`/`iconKey` (`:526-540`) → `commitDraft(…, openedId)` | `id` **and** three key fields change, and `commitDraft:164-167` **replaces at `openedId`** — on an official record the shipped original is overwritten and gone |
| c | The i18n overlay (`src/ui/i18n.ts:16`) | none |

**Decision:** A commit against an official record forks iff the resulting record differs
structurally from the bundled record of the **same id**. Mechanisms (a) and (c) write only
into `source.strings`, leaving the record byte-identical, so they are exempt without a
hand-maintained per-kind list of "rule fields". Mechanism (b) is removed for official
records by ADR-007 — which is what makes the comparison unambiguous: with the id field
locked, `draft.id === openedId === the bundled id`, so there is no question of which
bundled record anchors the comparison.
**Consequences:**
- ✅ The bundled original is always recoverable; "restore default" needs no stored backup.
- ✅ The exemption is structural, not a rule that can drift as fields are added.
- ✅ No hidden "anchor on `openedId`, never on `draft.id`" rule for an implementer to get
  wrong, because ADR-007 makes the two identical on every path that reaches this branch.
- ⚠️ `foldText` *sets* `nameKey` when a record has none. Bundled records all have one, so
  this cannot fire on an official record — but Phase 6's test asserts it rather than
  assuming it.
- ⚠️ Deep structural comparison per commit. Records are small; this is not a hot path.
**Corrections made while implementing (Phase 6):**
- The comparison is against the record **as stored in the document**, not only against the
  draft. An id match alone reads an imported look-alike as "ours, modified", and a pure
  rename then forked it. Where the stored record already differs from the shipped one there
  is no pristine original to protect, so the edit lands in place.
- The copy takes **its own derived keys and the current words** (`src/editor/fork.ts`),
  following `MakerGallery`'s remix precedent. Without this the copy points at the
  original's `nameKey` and renaming the copy renames the shipped record everywhere.
- The consequence bullet about `foldText` was about the wrong mechanism. `nameKey` is
  required by the schema, so a shipped record always has one and `foldText` never assigns
  it. `tests/editor/fork.test.ts` asserts that bundle invariant directly.

**Rejected alternatives:**
- *Any edit forks* — Rejected because it breaks the existing rename UX, which is a shipped,
  deliberately-built affordance, and would grow the piece list on a purely cosmetic action.
- *Read-only official content* — Rejected because it removes renaming entirely.
- *Keep the id field editable and anchor the fork check on `openedId`* — Rejected as
  ADR-007's rejected alternative: it preserves a capability nobody asked for at the cost of
  a load-bearing invariant that lives only in a comment.
- *Fork and swap the reference inside the room being edited* — Rejected for this cycle: it
  is the most correct behaviour and the hardest to explain, and it can be added on top of
  this ADR later without contradicting it.
**Source:** Interview #2, #8, #10

### ADR-002: No content id ever reaches the screen
**Status:** Accepted (2026-08-09, via /hm:plan interview)
**Context:** `recordLabel` falls back to the record's id when no name resolves
(`src/ui/recordLabel.ts:20`), and `RoomDetail.tsx:941,999` render `${id} (없는 항목)`
directly. The audience is a Korean-speaking child; `piece.king` is developer output.
There is also a **second, independent implementation of the same fallback**:
`src/ui/RecordForm.tsx:358-364` defines a private `label(id, nameKey)` — structurally
identical to `recordLabel`, importing nothing from it — backing `pieceLabel` (`:366`) and
`checkboxList` (`:485`), which draws the room's piece / rule-card / skill-card composition
pickers (`:1432-1434`). A required-argument guard on `recordLabel` alone does not reach it.
`src/ui/MakerGallery.tsx` renders record labels too and must be checked on the same pass.
**Decision:** Every label path resolves to Korean, through **one** function. An unresolvable
name becomes a kind-derived Korean name (`이름 없는 기물`, `이름 없는 방`), disambiguated by
a 1-based ordinal when a single list shows more than one. `recordLabel` gains a required
`kind` argument, and `RecordForm`'s private `label`/`pieceLabel` are deleted in favour of
it.
**Consequences:**
- ✅ The id becomes a purely internal identifier, which is what it always was.
- ✅ A required argument makes a missed call site a type error, not a runtime leak — but
  only for call sites that go through `recordLabel`, which is why deleting the duplicate is
  part of the decision rather than a follow-up.
- ⚠️ Every `recordLabel` call site must be touched. There are few, and the compiler finds
  all of them.
- ⚠️ The render-level safety net must mount the **picker** surfaces, not only the two list
  surfaces — a test scoped to the lists would have passed against this very defect.
- ⚠️ Two unnamed records now share a label until the ordinal disambiguates. The ordinal is
  list-position-derived, so it is stable within a render and not an identity.
**Rejected alternatives:**
- *Require a name at save time* — Rejected because the import path
  (`importContent`) accepts documents this editor did not author, and a hard requirement
  would reject sets that are otherwise valid.
- *Humanise the slug* (`piece.king` → `king`) — Rejected: the slug is English and there is
  no Korean slug to humanise, so the leak survives in a smaller font.
**Source:** Interview #3

### ADR-003: Provenance is derived from the bundled id set, not stored on records
**Status:** Accepted (2026-08-09, via /hm:plan interview)
**Context:** The saved document has no provenance (`src/content/merge.ts:11-15`), and the
obvious remedy — an `origin` field at schema v11 — puts every saved document in existence
into the field-absent state. That absent case is exactly the failure recorded as
`[fail:design] saved-blob-forks-shipped-content` and the global rule *absent-case = feature
black hole*: a feature that activates on an optional field never fires for the data that
predates it.
**Decision:** `isOfficial(id)` ⟺ `id ∈ officialIds(bundledContentSource)`. Nothing is
written, nothing is migrated, no schema version moves. ADR-001 is what makes this exact:
because a rule-edit forks to a *new* id, an official id always names an unmodified official
record.
**Consequences:**
- ✅ Zero migration, zero absent case, and it works on every install today with no first
  save required.
- ✅ Testable with no storage at all — the module is pure.
- ⚠️ A record we ship today and *remove* from a future bundle stops being official on that
  release. It does not disappear (the merge is additive-only and the saved copy stays), but
  it moves into 「내가 만든 것」. Accepted: un-shipping a record is rare and deliberate.
- ⚠️ If a future bundle ships an id a child had already authored, that record is
  reclassified as official. The fork suffix makes a collision unlikely and
  `loadContentSet` already refuses duplicate ids, so the observable is a section change,
  not data loss.
**Rejected alternatives:**
- *`origin` field at schema v11* — Rejected on the absent-case ground above; it re-digs a
  trap this project has already fallen into once and written down.
- *Reuse the existing `BundleStamp`* — Rejected because the stamp answers a different
  question ("what existed at the author's last save") and is deliberately allowed to lag
  the content (`src/editor/storage.ts:127`). A lagging stamp would misclassify newly
  shipped records as authored.
- *Derived plus an optional `forkedFrom`* — Rejected for this cycle: it stores a fact
  nothing in the plan reads.
**Source:** Interview #4

### ADR-004: Official content is hidden, never deleted
**Status:** Accepted (2026-08-09, via /hm:plan interview)
**Context:** `deleteRecord` treats every record alike, so a shipped room is as permanently
destructible as an authored one, and the only recovery is `doReset`
(`src/ui/Edit.tsx:169`), which throws away the child's own work too. The felt problem is
list length, not a wish to destroy.
**Decision:** For a record where `isOfficial(id)` holds, the destructive control is
「숨기기」, which adds the id to a per-browser hidden set. Authored records keep the existing
`deleteRecord`. This applies to **all six kinds**, not only rooms.
**Consequences:**
- ✅ Nothing we ship can be lost from a device; recovery needs no export and no developer.
- ✅ One rule covers rooms, pieces, skills and rules, so nothing needs a second explanation.
- ⚠️ Two controls with different words now exist in one list. The section split (Interview
  #6) is what keeps that from reading as arbitrary.
- ⚠️ A hidden record still occupies storage. It is an id in an array; the cost is bytes.
**Rejected alternatives:**
- *Hide the delete button on official records* — Rejected: it leaves a growing list with no
  remedy at all.
- *Delete, plus a restore button* — Rejected: `deleteRecord`'s reference gate refuses a
  referenced record, so the common case is a refusal the child must decode, whereas hiding
  never has to refuse for that reason (ADR-005).
**Source:** Interview #1, #5, #9

### ADR-005: Hiding filters lists; it never mutates the document
**Status:** Accepted (2026-08-09, via /hm:plan interview)
**Context:** If hiding removed records from the `ContentSource`, hiding a piece a room
still uses would produce a document that fails `loadContentSet` — the exact class of
failure `deleteRecord`'s third gate exists to prevent (`src/editor/draft.ts:253-258`).
**Decision:** The hidden set is applied at render time to **every list of records the author
can browse or pick from**, and nowhere else. That is five surfaces, enumerated so none is
left to inference:

| # | Surface | File and call sites |
|---|---|---|
| 1 | Room list | `src/ui/EditorRooms.tsx:83` |
| 2 | Library list | `src/ui/EditorLibrary.tsx` |
| 3 | Home carousel | `src/ui/Home.tsx:46` |
| 4 | Generic record-kind picker (`RecordForm`, incl. `kind='preset'` via the library) | `src/ui/RecordForm.tsx:485,1432-1434` |
| 5 | **Room builder pickers (`RoomDetail`) — a separate screen with its own renders** | `src/ui/RoomDetail.tsx:231-233,248` (the four `namedRecords` sources) feeding the piece tile grid `:646`, the rule/skill `ChipList` `:949-990`, the placement picker `:735`, the paint picker `:606`, and the loadout `<select>`s `:1150,1167,1199` (via `ownable` `:1076`) |
| 6 | Remix / "start from" gallery | `src/ui/MakerGallery.tsx:126` |

Surfaces 4 and 5 are both live: `preset` is in `EDITABLE_KINDS` (`src/editor/draft.ts:19-28`),
so a room is reachable through the library's generic form *and* through `RoomDetail`. They
share no picker code. `src/ui/Lobby.tsx` is **not** on this list — it labels the one room
already chosen and is not a browse surface.

The document handed to the engine, to the merge, and to `saveContent` is unfiltered.

**One exemption, and it is load-bearing.** A picker always shows a record the thing being
edited **already selects**, hidden or not. Two distinct failures if it is missing, and the
second is worse than the first:

1. The checkbox is simply absent, which reads as the selection having been lost — and
   saving the form would then actually lose it.
2. In `RoomDetail` it is not absent but **actively wrong**: `VanishedRows` (`:918-946`) and
   `ChipList`'s tail (`:987-990`) compute `known` from the *rendered* array
   (`:926`, `:966`), so a selected id missing from that array falls into the
   `${id} (없는 항목)` branch. Filtering the four `namedRecords` sources without the
   exemption therefore tells the child their piece is broken, and does it in the very raw-id
   string ADR-002 exists to delete.

The exemption is **codified once, not re-derived per call site**:

```ts
// src/editor/visibility.ts
visibleIds(records, hidden, keepSelected: readonly string[]): Array<[string, unknown]>
//   keep a record iff  id ∉ hidden  ∨  id ∈ keepSelected
```

Every one of the six surfaces goes through it; the browse surfaces pass an empty
`keepSelected`. A surface that needs the exemption and forgets it is then a missing
argument, not a subtly wrong render.
**Consequences:**
- ✅ Hiding can never produce an unloadable document, so it needs no reference gate and can
  never refuse for that reason.
- ✅ A room that still uses a hidden piece keeps playing correctly, and editing that room
  cannot silently drop it.
- ✅ 숨김 has one meaning on every screen — "not in my way" — rather than one meaning while
  browsing and another while composing.
- ⚠️ A hidden piece is still reachable through a room that uses it (its detail view, its
  sprite in play). That is intended: hiding tidies the browsing surface, it does not
  uninstall content.
- ⚠️ Five surfaces must remember to apply the filter. One shared helper, and §🧪 asserts
  each surface individually rather than trusting the helper's existence — the duplicate
  `label()` in `RecordForm` is this project's standing evidence that a shared helper does
  not imply a shared call.
**Rejected alternatives:**
- *Hiding removes from the source and the merge re-adds on unhide* — Rejected: it
  reintroduces the reference-gate refusal, and an unhide that must re-satisfy validation
  can fail, which makes hiding not reversible after all.
- *Browse lists only, pickers untouched* — Rejected (Interview #11): the stated motivation
  for hiding is list length, and the composition picker is the longest list in the product.
**Source:** Interview #5, #9, #11; contract between the list layer and the document layer

### ADR-006: The hidden set is its own storage key
**Status:** Accepted (2026-08-09, via /hm:plan interview)
**Context:** The natural home is a field on the saved document. `importContent` rebuilds
`ContentSource` field by field, so an unknown top-level field is silently dropped on the
very next read — a failure this project already hit and documented when placing the bundle
stamp (`src/editor/storage.ts:79-84`).
**Decision:** `HIDDEN_KEY = 'chess-craft.hidden.v1'`, holding `{ ids: string[] }`, read
with the same defensive shape-check `loadStamp` uses, every failure resolving to "nothing
hidden".
**Consequences:**
- ✅ Survives import/export round trips, and an exported document does not carry one
  device's hiding preferences to another.
- ✅ The safe failure direction is showing *more* than expected, never losing content.
- ⚠️ A third key to clear. `clearStoredContent` must clear it too, or a reset would leave
  the shipped set partly hidden on a fresh start.
**Rejected alternatives:**
- *Field on `ContentSource`* — Rejected on the drop-on-read ground above.
- *Reuse `STORAGE_KEY` with a wrapper object* — Rejected: it changes the shape of a key
  every existing install already holds, which is a migration by another name.
**Source:** Assumption promoted; Interview #5

### ADR-007: An official record's id field is read-only
**Status:** Accepted (2026-08-09, via /hm:plan interview round 4, after `plan-validator`
critical #2)
**Context:** `RecordForm.tsx:1138` renders an editable `id` text input on every record.
On an official record this is a live data-loss path today: `prepared()` (`:526-540`)
re-derives `nameKey`/`textKey`/`iconKey` to follow the new id, and `commitDraft` replaces
the record sitting at `openedId` (`src/editor/draft.ts:164-167`) — so the shipped original
is overwritten, not copied. It is also the reason ADR-001's fork comparison would otherwise
need an unwritten "anchor on `openedId`, never on `draft.id`" rule, since by commit time the
draft's own id has already diverged.
**Decision:** When the opened record is official, the id input is read-only. The name field
and the rules stay fully editable; changing the rules forks, and the fork picks the new id
itself (`forkId`). Authored records — including a record that was just forked — keep the
editable id exactly as today.
**Consequences:**
- ✅ Removes a data-loss path that exists in the shipped product right now.
- ✅ `draft.id === openedId === the bundled id` on every commit that reaches ADR-001's fork
  branch, so the comparison anchor is a fact of the code rather than a comment.
- ✅ Consistent with ADR-002: the id is an internal identifier, and this is one fewer place
  a child is asked to think about one.
- ⚠️ A child who wants "the king, but called 임금님, and with its own id" must fork first
  (change a rule) and then rename. Nobody has asked for this.
- ⚠️ The existing rename tests in `tests/editor` cover the id-edit path on records that are
  official in the fixture; those fixtures move to authored records rather than being
  deleted, so the capability keeps its coverage.
**Rejected alternatives:**
- *Keep the field editable and treat an id edit as a fork keyed on `openedId`* — Rejected:
  it preserves a capability nobody asked for, and pays for it with an invariant that lives
  only in a comment and breaks silently — the failure mode being the destruction of shipped
  content, which is the exact thing this PLAN exists to prevent.
- *Remove the id field entirely* — Rejected: an imported set may carry ids the author wants
  to tidy, and authored records are where that is legitimate.
**Source:** Interview #10

## 🚫 Non-Goals

Collected here so an executor does not re-litigate them mid-phase. Each traces to a
specific rejected alternative above.

- **In-room reference swap on fork.** When a rule edit forks an official piece, the room
  being edited is *not* automatically repointed at the copy. (ADR-001, rejected alt. 4.)
- **An `origin` field on the schema.** No `SCHEMA_VERSION` bump, no migration, no
  `forkedFrom`. (ADR-003, rejected alts. 1 and 3.)
- **Undo for deletion.** Reversibility is delivered by hiding official content, not by an
  undo stack over `deleteRecord`. (Interview #1 — the undo option was offered and not
  chosen.)
- **Hiding authored content.** Authored records are deleted, not hidden. (ADR-004.)
- **Removing the id field.** It stays for authored records. (ADR-007, rejected alt. 2.)
- **Accounts or cross-device sync.** Hiding is per-browser, like all state here.
- **Refreshing already-installed bundled records.** `merge.ts` is additive-only and stays
  that way; this PLAN does not change what an install receives.

## 🏗️ Technical Design

### Current State

- `src/content/sets/bundled.ts` — the shipped catalogue, a module-level singleton.
- `src/content/merge.ts` — additive merge of newly-shipped records, keyed on a stamp.
  Explicitly documents the absence of per-record provenance.
- `src/editor/storage.ts` — `STORAGE_KEY` (whole document) + `STAMP_KEY`.
- `src/editor/draft.ts` — `openDraft` / `commitDraft` / `deleteRecord` (3 gates).
- `src/ui/recordLabel.ts` — falls back to the raw id.
- `src/ui/EditorRooms.tsx`, `src/ui/EditorLibrary.tsx` — flat lists, one delete button each.
- `src/ui/Home.tsx` — room carousel, no management entry point.

### Affected Components

| File | Change |
|---|---|
| `src/content/provenance.ts` | **new** — `officialIds`, `isOfficial`, `forkId`, `differsFromBundled` |
| `src/editor/hidden.ts` | **new** — `HIDDEN_KEY`, `loadHidden`, `saveHidden` |
| `src/editor/visibility.ts` | **new** — `visibleIds(records, hidden, keepSelected)`, `partitionByOrigin`, `canHide`. `keepSelected` is a required parameter, not optional: it is what makes ADR-005's exemption a missing argument rather than a wrong render |
| `src/ui/unnamed.ts` | **new** — kind-derived Korean fallback names |
| `src/editor/draft.ts` | `commitDraft` gains a fork branch; `deleteRecord` unchanged |
| `src/editor/storage.ts` | `clearStoredContent` also drops `HIDDEN_KEY` |
| `src/ui/recordLabel.ts` | `kind` becomes required; fallback routes through `unnamed.ts` |
| `src/ui/RecordForm.tsx` | private `label`/`pieceLabel` deleted in favour of `recordLabel` (ADR-002); id input read-only when official (ADR-007); pickers filtered (ADR-005) |
| `src/ui/MakerGallery.tsx` | labels via `recordLabel`; gallery filtered (ADR-005) |
| `src/ui/EditorRooms.tsx` | two sections; hide-vs-delete branch |
| `src/ui/EditorLibrary.tsx` | two sections; hide-vs-delete branch |
| `src/ui/RoomDetail.tsx` | `${id} (없는 항목)` at :941 and :999 (ADR-002); **its four `namedRecords` sources at :231-233,248 routed through `visibleIds` with the room's own selections as `keepSelected` (ADR-005 surface 5)** |
| `src/ui/deleteMessage.ts` | refusal sentences gain the hide vocabulary — **shared by Phase 2 and Phase 4** |
| `src/ui/Edit.tsx` | owns hidden state; adds a restore control |
| `src/ui/Home.tsx` | filter hidden rooms; '방 관리' button |
| `src/i18n/ko.ts` | new `ui.record.unnamed.*`, `ui.editor.hide.*` keys |

### Dependencies

No new packages. `zod`, `react` and the existing test rig only.

### Architecture

```
 bundledContentSource ─────────────► provenance.ts  (pure, no storage, no DOM)
                                          │ isOfficial(id)
                                          ▼
 localStorage                        visibility.ts  (pure)
  ├ chess-craft.content.v1 ──┐          │ partitionByOrigin(records, hidden)
  ├ chess-craft.bundle-stamp ─┼─ merge ─┤
  └ chess-craft.hidden.v1 ────┘         │
        (hidden.ts)                       ▼
                                   list surfaces only
                          EditorRooms · EditorLibrary · Home
                                          │
   document handed to engine / save ──────┘  ◄── UNFILTERED (ADR-005)
```

### Design Decisions

- Provenance is a *pure function of the bundle*, so it is testable with a fixture bundle
  and never needs a browser (ADR-003).
- Fork detection is *structural difference from the bundled record*, which makes the
  rename exemption fall out of the data model rather than out of a field list (ADR-001).
- Hiding is a *view concern*, which is why `visibility.ts` is separate from `hidden.ts`:
  one owns the rule, the other owns the bytes (ADR-005, ADR-006).
- `recordLabel`'s `kind` parameter is *required*, not optional, so that ADR-002 is enforced
  by the compiler.

### Data Flow

1. `App` loads → merge → unfiltered `ContentSource` in state (unchanged).
2. `Edit` reads `HIDDEN_KEY` once on mount into React state.
3. A list surface calls `partitionByOrigin(records, hiddenSet)` → `{ official, authored }`,
   each already filtered.
4. Delete/hide: authored → `deleteRecord` (unchanged); official → add id to the hidden set,
   `saveHidden`, update state.
5. Commit of an official record: `commitDraft` compares against the bundled record; on
   difference it rewrites the draft's id via `forkId` and appends instead of replacing.

### API Changes

Internal only — no wire format, no schema version, no storage-key shape change to any
existing key. `recordLabel`'s signature is the one breaking internal change.

## 📝 Implementation Plan

### Phase 1 — Provenance core (pure)
- **Status:** DONE — 14 tests. `differsFromBundled` (the PLAN text originally said `differsFromOfficial`; the implementation name won).
- **depends_on:** `[]`
- **parallel_group:** `pure-core`
- **merge_hazards:** none — new files only
- **Scope (in):** `src/content/provenance.ts`, `tests/content/provenance.test.ts`
- **Scope (out):** every UI file; `merge.ts`; `bundled.ts`
- **Exit criterion:** `npx vitest run tests/content/provenance.test.ts` passes, covering:
  official id present, authored id absent, `forkId` collision chain
  (`x` → `x-2` → `x-3`), and `differsFromBundled` returning false for a
  strings-only rename.
- **Risk:** low
- **Rollback point:** none needed — additive, nothing imports it yet.

### Phase 2 — Korean fallback names, raw ids removed (ADR-002)
- **depends_on:** `[]`
- **parallel_group:** `pure-core`
- **merge_hazards:** `src/i18n/ko.ts` — also touched by Phases 4, 5, 7, 8, 9. Land Phase 2
  first and rebase the rest onto it; concurrent edits to the same key table conflict.
  `src/ui/deleteMessage.ts` — **also in Phase 4's scope**; Phase 4 now depends on Phase 2
  so the two edits are serialized. `src/ui/RecordForm.tsx` — also touched by Phases 6 and 9;
  same serialization, via their `depends_on`. `src/ui/RoomDetail.tsx` and
  `src/ui/MakerGallery.tsx` — also touched by Phase 9, serialized by the chain 2 → 6 → 9;
  declared here rather than left to that inference.
- **Scope (in):** `src/ui/unnamed.ts`, `src/ui/recordLabel.ts`, `src/i18n/ko.ts`
  (`ui.record.unnamed.*`), `src/ui/RoomDetail.tsx:941,999`, `src/ui/deleteMessage.ts`,
  **`src/ui/RecordForm.tsx:358-369` (delete the private `label`/`pieceLabel`, route through
  `recordLabel`)**, **`src/ui/MakerGallery.tsx`**, and every `recordLabel` call site the
  compiler flags
- **Scope (out):** provenance, hiding, forking, the id-field lock (Phase 6)
- **Exit criterion:** `npm run typecheck` clean, `rg -n 'return id$' src/ui/` returns no
  hand-rolled label fallback outside `recordLabel.ts`, **and** a new
  `tests/ui/no-raw-ids.test.ts` asserting that no rendered text matches
  `/^[a-z]+\.[a-z0-9-]+$/` across **five** mounts: the room list, the library list, a room
  with a dangling reference, **the room composition picker inside `RecordForm`**, and
  **`MakerGallery`** — each against a fixture whose records have an empty `nameKey`. The
  picker mount is the one that would have caught the defect this phase exists to fix.
- **Risk:** medium — touches many call sites; the compiler catches misses within
  `recordLabel`, the five-surface test catches the ones outside it.
- **Rollback point:** Phase 1 (independent branch point).
- **Status:** DONE. Three leaks closed, one of them larger than this PLAN estimated:
  `MakerGallery` resolved names through `source.strings` alone, and bundled names live in
  `src/i18n/ko.ts`, so **every shipped record in the remix gallery rendered as its id** on a
  fresh install — not only unnamed ones. The test proves it against the unmodified bundle.
- **Found here, deliberately NOT fixed here** — recorded so it is inherited rather than
  rediscovered: the sprite picker (`src/ui/RecordForm.tsx:665-695`) sets
  `aria-label={artId}`, so a screen reader speaks `art.king` to a child. `artId` is not a
  content id — `src/content/schema.ts:149` defines it as "exactly one segment, never a
  content id" — so it is outside ADR-002 as written, and a real fix needs a Korean name per
  sprite (12+ new i18n keys), which is a scope widening rather than a line change. The
  Phase 2 test excludes the `art.*` namespace explicitly and says why, so the exclusion is
  visible rather than silent.

### Phase 3 — Hidden-set persistence (ADR-006)
- **Status:** DONE — 25 tests, absent-key case first.
- **depends_on:** `[1]`
- **parallel_group:** `serial-storage`
- **merge_hazards:** `src/editor/storage.ts` — `clearStoredContent` gains a third key;
  no other phase edits this file.
- **Scope (in):** `src/editor/hidden.ts`, `src/editor/visibility.ts`,
  `src/editor/storage.ts` (`clearStoredContent`), `tests/editor/hidden.test.ts`,
  `tests/editor/visibility.test.ts`
- **Scope (out):** all UI
- **Exit criterion:** `npx vitest run tests/editor/hidden.test.ts tests/editor/visibility.test.ts`
  passes, and the suite includes a test for **the absent key** (no `HIDDEN_KEY` stored →
  empty set, no write performed), a corrupt-JSON test, a wrong-shape test, and a
  storage-throws test.
- **Risk:** low
- **Rollback point:** Phase 1.

### Phase 4 — Hide-vs-delete branch in the editor (ADR-004)
- **Status:** DONE — 9 tests. test-reviewer FAILed attempt 1: the in-use-piece case asserted only what the untouched fixture already satisfied, so a no-op hide handler passed it. Fixed and mutation-verified. An earlier fixture also failed `loadContentSet`, silently turning every delete into an `invalid` refusal — a `describe('the fixtures')` premise assertion now guards that.
- **depends_on:** `[1, 2, 3]` — the dependency on Phase 2 exists solely to serialize
  `src/ui/deleteMessage.ts`, which both phases edit.
- **parallel_group:** `serial-ui`
- **merge_hazards:** `src/ui/EditorRooms.tsx`, `src/ui/EditorLibrary.tsx`,
  `src/ui/Edit.tsx` — all three are also edited by Phase 5. Strictly serial with Phase 5.
  `src/ui/deleteMessage.ts` — shared with Phase 2, serialized by the `depends_on` above.
- **Scope (in):** `src/ui/Edit.tsx` (hidden state + `onHide`), `src/ui/EditorRooms.tsx`,
  `src/ui/EditorLibrary.tsx`, `src/ui/deleteMessage.ts`, `src/i18n/ko.ts`
  (`ui.editor.hide.*`)
- **Scope (out):** section layout (Phase 5), Home (Phase 7), restore UI (Phase 8)
- **Exit criterion:** `npx vitest run tests/ui` passes with new cases proving: an official
  room shows 「숨기기」 and no delete control; an authored room shows 「삭제」; hiding the last
  *visible* room is refused with the `last-room` sentence; hiding a piece a room still uses
  **succeeds** (ADR-005) and the room still loads.
- **Risk:** high — this is where a wrong branch makes shipped content destructible or
  authored content undeletable. Both directions are covered above.
- **Rollback point:** Phase 3.

### Phase 5 — Two-section lists
- **Status:** DONE — 7 tests. e2e delete spec re-run: 9/9. `preset.slice`, which the e2e fixtures import, is not in the bundle, so it stays authored and keeps its delete button.
- **depends_on:** `[1, 4]`
- **parallel_group:** `serial-ui`
- **merge_hazards:** same three UI files as Phase 4 — serial by construction.
- **Scope (in):** `src/ui/EditorRooms.tsx`, `src/ui/EditorLibrary.tsx`, `src/i18n/ko.ts`
  (section headings)
- **Scope (out):** hide/delete behaviour (Phase 4)
- **Exit criterion:** `npx vitest run tests/ui` passes with a case asserting both headings
  render, each list holds the right ids, and — the case the fixture must not hide — a
  document with **zero** authored records still renders the 「내가 만든 것」 heading with an
  empty-state sentence rather than vanishing.
- **Risk:** low
- **Rollback point:** Phase 4.

### Phase 6 — fork-on-edit + the id-field lock (ADR-001, ADR-007)
- **Status:** DONE — 18 unit + 9 wiring tests. The gap below was resolved by applying the
  remix precedent (operator approved), and implementing it turned up **two corrections to
  ADR-001 itself**, both recorded under the ADR:
  1. Comparing only the DRAFT against the bundle made a pure RENAME fork any record that
     merely WEARS an official id — an imported set ships its own `piece.king` with a
     different definition (`e2e/content.ts` says so). Two pre-existing tests caught it. The
     rule now also requires the STORED record to match the shipped one.
  2. Exit case 4's premise is unreachable, and the reason matters: `nameKey` is
     `i18nKey` — **required** — on every record schema (`src/content/schema.ts:345`), so a
     record we ship always carries one and `foldText` has nothing to assign. The protection
     is that bundle invariant, not the call order the first test claimed. Asserted directly
     over the real bundle instead.
- **A.5 gate:** FAIL, FAIL — the two-attempt budget is spent. Attempt 1 found three genuine
  coverage holes (all added); attempt 2 found that the case-4 test asserted the wrong
  invariant (corrected as above). **No third review verified the correction.**

> ⚠️ **Gap found while preparing Phase 6: ADR-001 never says what happens to the copy's
> TEXT.**
>
> A record does not carry its own words. It carries `nameKey` / `textKey`, and the words
> live either in `src/i18n/ko.ts` (for what we ship) or in `source.strings` (for what the
> child typed). So a fork that copies the record and nothing else produces a copy pointing
> at the ORIGINAL's keys — and then `slotFor` (`src/ui/RecordForm.tsx:175`) resolves a
> later rename of the copy to that same shared key, so **renaming the copy renames the
> original too, everywhere it is used.** That is the exact failure ADR-001 exists to
> prevent, arriving through the text layer instead of the record layer.
>
> This codebase has already solved it once, for the remix gallery
> (`src/ui/MakerGallery.tsx:85-95`): *"A remix produces a NEW record. The source is read and
> never written — not even its text: the copy gets its own derived `nameKey`/`textKey` and
> the source's words are pre-filled into the form's own inputs, so saving the copy under a
> new name cannot rename the original."*
>
> **Proposed resolution — apply that precedent:** a fork derives `${newId}.name` /
> `${newId}.text` and the current words are pre-filled into the form, exactly as a remix
> does. Consequence: the fork must happen in the layer that HAS the text (`RecordForm` /
> `RoomDetail`, which already do this for renames in `prepared()`), not inside
> `commitDraft`. That is also the lower-risk placement — `commitDraft` is the single save
> path for all six kinds and stays untouched.
>
> Recorded rather than implemented because it is a decision, not a detail: it changes what
> the child sees the moment they edit a shipped piece.

- **depends_on:** `[1, 2]` — Phase 2 for `src/ui/RecordForm.tsx`, which both edit.
- **parallel_group:** `serial-editor`
- **merge_hazards:** `src/editor/draft.ts` — no other phase edits it.
  `src/ui/RecordForm.tsx` — shared with Phases 2 and 9; serialized by `depends_on`.
- **Scope (in):** `src/editor/draft.ts` (`commitDraft` fork branch),
  `src/ui/RecordForm.tsx:1138` (id input `readOnly` when official), `tests/editor/draft.test.ts`,
  `tests/ui/record-form.test.tsx`
- **Scope (out):** the in-room reference swap (Non-Goals); picker filtering (Phase 9)
- **Exit criterion:** `npx vitest run tests/editor tests/ui` passes with **six** cases:
  1. editing an official piece's `movement` produces a new record at `piece.<slug>-2` and
     leaves the original intact;
  2. typing a new *name* on an official record produces **no** fork and no new record, and
     writes only to `source.strings`;
  3. the id input is `readOnly` when the opened record is official, and editable when it is
     authored — including on a record that was just forked;
  4. a record with no `nameKey` does not gain one via `foldText` in a way that forks an
     official record (asserts the ADR-001 consequence rather than assuming it);
  5. editing an authored record replaces in place as before;
  6. the pre-existing `openedId` rename tests, re-pointed at authored fixtures, are
     otherwise unchanged and still green.
- **Risk:** high — `commitDraft` is the single save path for six record kinds, and a wrong
  branch either duplicates records on every save or silently overwrites shipped content.
  Case 3 is the one that closes the currently-shipping data-loss path.
- **Rollback point:** Phase 2.

### Phase 7 — Home carousel: filter + '방 관리'
- **Status:** DONE — 7 tests. The hidden set moved from `Edit` to `App`, because the carousel and the editor must not hold separate copies. `Home` also falls back to the unfiltered list when hiding would empty the carousel — reachable only through a hand-edited key, and a tidy-up must not strand a child on a blank screen.
- **depends_on:** `[3, 5]`
- **parallel_group:** `serial-ui`
- **merge_hazards:** `src/ui/Home.tsx`, `src/ui/App.tsx` (threading hidden state and the
  navigation callback) — `App.tsx` is otherwise untouched by this PLAN.
- **Scope (in):** `src/ui/Home.tsx`, `src/ui/App.tsx`, `src/i18n/ko.ts`
- **Scope (out):** any delete or hide control on the carousel itself (Interview #7 — one
  implementation, in the editor)
- **Exit criterion:** `npx vitest run tests/ui` passes with a case proving a hidden room is
  absent from the carousel and from its dot count, and `npm run e2e` passes a new spec that
  taps '방 관리' from home and lands on the editor's room list.
- **Risk:** medium — `App.tsx:395` clamps the active preset; a hidden active room must fall
  back rather than blank the screen. That specific case gets its own test.
- **Rollback point:** Phase 5.

### Phase 8 — Restore hidden content
- **Status:** DONE — 6 tests. The restore list walks all six kinds, and lists an id the document no longer holds so the key can always be emptied.
- **depends_on:** `[3, 4]`
- **parallel_group:** `serial-ui`
- **merge_hazards:** `src/ui/Edit.tsx` — serial with Phase 4.
- **Scope (in):** `src/ui/Edit.tsx` (a 「숨긴 것 되돌리기」 list in the transfer section),
  `src/i18n/ko.ts`
- **Scope (out):** everything else
- **Exit criterion:** `npx vitest run tests/ui` passes a hide → restore → present-again
  round trip, and a case proving the control is absent (not an empty box) when nothing is
  hidden.
- **Risk:** low
- **Rollback point:** Phase 4.

### Phase 9 — Hidden filter on the picker and gallery surfaces (ADR-005 surfaces 4-6)
- **Status:** DONE — 9 tests, including the exemption asserted on the `vanished` class specifically and a save round trip.
- **depends_on:** `[3, 5, 6]`
- **parallel_group:** `serial-ui`
- **merge_hazards:** `src/ui/RecordForm.tsx` — shared with Phases 2 and 6, serialized by
  `depends_on`. `src/ui/MakerGallery.tsx` and `src/ui/RoomDetail.tsx` — shared with Phase 2;
  already serialized by the chain 2 → 6 → 9, declared here rather than left to that
  inference.
- **Scope (in):**
  - `src/editor/visibility.ts` — `visibleIds` gains its required `keepSelected` parameter
  - `src/ui/RoomDetail.tsx:231-233,248` — the four `namedRecords` sources, each passed the
    room's corresponding selection (`draft.pieceIds` / `ruleCardIds` / `skillCardIds`, and
    the ids painted on the board for `squareTypes`) as `keepSelected`
  - `src/ui/RecordForm.tsx:485,1432-1434` — `checkboxList` sources, `keepSelected` = the
    draft's current selection for that field
  - `src/ui/MakerGallery.tsx:126` — browse surface, `keepSelected` empty
  - `tests/ui/hidden-pickers.test.tsx`, `tests/editor/visibility.test.ts`
- **Scope (out):** the hidden set itself (Phase 3), the browse lists (Phases 4–5)
- **Exit criterion:** `npx vitest run tests/editor tests/ui` passes with **five** cases,
  each naming its surface rather than folding them together:
  1. a hidden official piece is absent from `RoomDetail`'s piece tile grid, from its
     rule/skill chip lists, and from its loadout `<select>`s;
  2. a hidden official record is absent from `RecordForm`'s `checkboxList`;
  3. a hidden official record is absent from `MakerGallery`;
  4. **exemption, `RoomDetail`:** a room that already selects a hidden piece renders that
     piece as a **normal, selected tile — not a `vanished` one.** Asserted on the class /
     test id, so it distinguishes "hidden but selected" from "genuinely dangling", which
     `VanishedRows` must still report;
  5. **exemption, round trip:** saving that room's form does not drop the hidden-but-selected
     ids from `pieceIds` / `ruleCardIds` / `skillCardIds`.
- **Risk:** high — reduced from a silent drop to a visible one by the exemption, but a
  filter applied at `:231-233` *without* it makes the pre-existing `VanishedRows` path
  (`:918-946`, `known` derived from the rendered array at `:926`) report the child's own
  piece as a broken reference. Cases 4 and 5 exist for exactly that.
- **Rollback point:** Phase 6.

## 🔬 Newly-reachable windows (execute Phase D.5)

Three of the nine phases were REPAIRS, not new features. A green suite measures the
coverage that existed before a fix, so each names the input window its repair newly makes
reachable and the test that enters it. `[fail:code] fix-introduced-defect-passes-all-gates`
is at count:4 in this repo, every instance on an all-green run.

| Repair | Newly-reachable window | Test that enters it |
|---|---|---|
| **Phase 2** — raw ids removed | Records whose name will not resolve now take the fallback path, and the ORDINAL logic inside it is newly reachable code: two unnamed siblings must come out tellable apart. The absent case is a record with **no `nameKey` field at all** (an older export), not merely an empty one. | `tests/ui/no-raw-ids.test.tsx > names an unnamed record in Korean, by its kind` and `> handles a record with NO nameKey field at all` |
| **Phase 6** — the id-field lock (R9) | With the id fixed, `commitDraft` is now reached with `draft.id === openedId` on every official save, so the FORK branch becomes the live path where the replace branch used to be. The window is "an official record being saved at all" — including a save with no change, which must produce nothing. | `tests/editor/fork.test.ts > does NOT fork an unchanged official record`; `tests/ui/fork-on-edit.test.tsx > closes the overwrite path` and `> renaming a record we ship leaves ONE record` |
| **Phase 7** — the active-room clamp (R5) | The clamp now walks the FILTERED list, so a new window opens: hidden-set states the unfiltered clamp never saw. Its absent case is the degenerate one — **every** room hidden — which the editor refuses to create but a hand-edited key can. | `tests/ui/home-hidden-rooms.test.tsx > moves to another room rather than blanking` and `> still shows a room when EVERY room is hidden` |

## 🧪 Testing Strategy

**Unit (vitest).**
- `tests/content/provenance.test.ts` — official/authored classification, `forkId` collision
  chain, structural-difference detection with a strings-only rename as the negative case.
- `tests/editor/hidden.test.ts` — **absent key first**, then corrupt, wrong-shape, and
  storage-throws. Written per `[fail:test] test-setup-hides-the-failure-path`: the absent
  branch is the state every install is in today, so it is the branch that must not be
  seeded away by the test's own setup.
- `tests/editor/visibility.test.ts` — partition and filter, including an empty authored set.
- `tests/editor/draft.test.ts` — fork branch (all six Phase 6 cases), plus the existing
  rename tests re-pointed at authored fixtures as a regression check.

**Integration / component (vitest + testing-library, `tests/ui`).**
- Hide-vs-delete branching per kind.
- Section rendering with an empty authored side.
- Carousel filtering and the active-room fallback.
- Picker and gallery filtering, **including the already-selected exemption**.
- The id input's `readOnly` state on official vs authored records.
- `tests/ui/no-raw-ids.test.ts` — the ADR-002 gate, across all five label surfaces. It must
  mount the **shipped document unmodified** in one case, not only a fixture with probe
  records: a fixture that adds a named record deletes the exact case the product ships.

**E2E (playwright).**
- Home → '방 관리' → room list.
- Hide an official room → it leaves both the editor list and the carousel → restore → it
  returns.

**Manual.**
- Open the app with an existing saved document (do not clear storage) and confirm nothing
  moved, nothing vanished, and the sections split correctly. This is the case no test can
  fully stand in for, because the interesting input is a real device's history.

**Full gate.** `npm run verify` before wrapup.

## ⚠️ Risks & Mitigation

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R1 | `commitDraft`'s fork branch fires on a save that should replace, duplicating records on every edit | medium | high | Structural comparison against the *bundled* record only; authored records never enter the branch. Phase 6 exit criterion tests both directions explicitly. |
| R2 | A list surface forgets the hidden filter, so a hidden record reappears in one place | medium | medium | One shared `partitionByOrigin`; each surface asserted individually rather than trusting the helper's existence (ADR-005 consequence). |
| R3 | The hidden set desynchronises from a reset, leaving a fresh start partly hidden | low | high | `clearStoredContent` drops all three keys in Phase 3, with the same separate-`try` shape `storage.ts:162-167` already uses for exactly this asymmetry. |
| R4 | A label path outside `recordLabel` survives and leaks a raw id | medium | medium | The known duplicate (`RecordForm.tsx:358`) is deleted in Phase 2; `kind` is required so misses within `recordLabel` are type errors; the `no-raw-ids` test mounts five surfaces including the pickers. Raised as `plan-validator` critical #1. |
| R8 | The picker filter drops a room's already-selected hidden records on the next save | medium | high | ADR-005's already-selected exemption, codified as a **required** `keepSelected` parameter on `visibleIds` so a surface that forgets it fails to compile; Phase 9 case 5 asserts the save round trip, not just the render. |
| R11 | The loadout `<select>`s in `LoadoutSection` were the one list in `RoomDetail` left outside `visibleIds`, so a hidden piece stayed selectable as a side's loadout piece | **was live** | medium | Found by the Phase 9 A.5 gate, not by the suite — the fixture had no coverage of that surface at all. All three loadout lists now route through `visibleIds` with the slot's own ids as the exemption; three tests added. |
| R12 | `idLocked` keyed on id membership while the fork keyed on record identity, so an imported set's look-alike had its id locked with no shipped original to protect | **was live** | low | Found by an e2e failure (`maker-anchors.spec.ts`), which used the id field to force a validation error. Both rules now share `isPristineOfficial` (`src/editor/fork.ts`). |
| R10 | Filtering `RoomDetail:231-233` makes the pre-existing `VanishedRows` path report a hidden-but-selected piece as `${id} (없는 항목)` — a broken-reference message, in the raw-id form ADR-002 deletes | medium | high | The exemption keeps such ids in the rendered array, so `known` (`:926`, `:966`) still contains them; Phase 9 case 4 asserts on the `vanished` class specifically, so the genuinely-dangling case keeps its report. Raised as `plan-validator` pass 2, critical #2. |
| R9 | Editing an official record's id field overwrites the shipped original | **certain today** | high | ADR-007 locks the field; Phase 6 case 3. This is a live defect in the current build, not a risk introduced by this PLAN. |
| R5 | The active room is hidden and the home screen blanks | medium | high | `App.tsx:395`'s existing clamp is extended to skip hidden ids, with its own test (Phase 7). |
| R6 | A future bundle ships an id a child already authored, reclassifying their record as official | low | low | Fork suffixes make collision unlikely; `loadContentSet` already refuses duplicate ids. Accepted in ADR-003. |
| R7 | Section split makes the library feel longer, not shorter, on a document with few authored records | medium | low | Empty-state sentence rather than an empty heading (Phase 5 exit criterion). |

## ✅ Success Criteria

- [x] `isOfficial` answers correctly for every bundled id and for authored ids, with no
      schema change and no migration.
- [x] Editing an official record's rules leaves the original intact and produces an
      authored copy; renaming produces no copy.
- [x] An official record's id field cannot be edited, and no path through the form
      overwrites a bundled record in place.
- [x] Hidden records are absent from all **six** list surfaces, **except** where the record
      being edited already selects them.
- [x] An official room cannot be deleted; it can be hidden, and hiding is reversible from
      inside the product.
- [x] Hiding applies to all six kinds, and never produces a document that fails to load.
- [x] Room and library lists render 「기본」 and 「내가 만든 것」 sections, both present even
      when one is empty.
- [x] No string matching `^[a-z]+\.[a-z0-9-]+$` is rendered anywhere in the UI.
- [x] The home carousel omits hidden rooms and offers a route into room management.
- [x] `npm run typecheck` clean, `npx vitest run` 1300/1300, `npx playwright test` 394/394.
      (`npm run build` and `npm run test:build` not run here — wrapup owns the full gate.)
- [x] An existing saved document loads unchanged, with nothing lost and nothing resurrected.

## 🔍 Plan Validation

**Cross-model second opinion:** classified `is_high: false`, `boundary: false` on the
Side-preset high-diff gate, so no second-opinion model was invoked this run.

| Model | Status | Reason |
|---|---|---|
| codex | skipped | not a high-diff change (`hm high_diff classify` → `{"boundary": false, "is_high": false}`) |

**Validator outcome:** pass 1 → `MAJOR_REVISION` · pass 2 → recorded below ·
frontmatter records `MAJOR_REVISION_RESOLVED`.

| # | Severity | Finding | Resolution |
|---|---|---|---|
| C1 | critical | `RecordForm.tsx:358-364` holds a second raw-id label fallback that never routes through `recordLabel`, drawing the room composition picker (`:485`, `:1432-1434`). ADR-002's required-`kind` guarantee cannot reach it, and the safety-net test was scoped to the two browse lists | **Plan revised.** Verified against the code. ADR-002 now names the duplicate and deletes it; Phase 2 scope gains `RecordForm.tsx` and `MakerGallery.tsx`; `no-raw-ids.test.ts` mounts five surfaces including the picker. R4 re-rated medium |
| C2 | critical | The id input (`RecordForm.tsx:1138`) is a third rename mechanism: `prepared()` (`:526-540`) re-derives three key fields and `commitDraft` replaces at `openedId` (`draft.ts:164-167`), overwriting the shipped original. ADR-001 never stated which bundled record anchors the fork comparison | **Interview round 4, Q10 → ADR-007** (id field read-only on official records). Chosen over the validator's suggested `openedId`-anchor fix because locking the field makes `draft.id === openedId` a fact of the code rather than an invariant living in a comment. ADR-001's Decision rewritten with the three-mechanism table; Phase 6 gains the id-lock and six exit cases; logged as R9 (a live defect in the current build) |
| W1 | warning | ADR-005 named three list surfaces; `MakerGallery.tsx:126` and the `RecordForm` pickers also enumerate full collections, and the gap was never decided | **Interview round 4, Q11 → all lists.** ADR-005 now enumerates five surfaces in a table and adds the already-selected exemption (which the finding did not raise but the decision requires); new Phase 9; new risk R8 |
| W2 | warning | `deleteMessage.ts` is in both Phase 2's and Phase 4's scope with no serialization | **Plan revised.** Declared in both phases' `merge_hazards`; Phase 4 `depends_on` gains `2`. Same treatment applied to `RecordForm.tsx` across Phases 2/6/9 |
| W3 | warning | Success Criteria gave no independent signal that the id-edit path was verified | **Resolved by C2's fix**, as the validator suggested; a Success Criterion for the id lock added rather than folding it in silently |
| S1 | suggestion | No consolidated Non-Goals section | **Adopted.** `## 🚫 Non-Goals` added with seven entries, each traced to a rejected alternative |

**Pass 2 findings and resolutions** (verdict: `MAJOR_REVISION`; the two-pass cap is reached,
so these were fixed without a third validator pass — see the note below):

| # | Severity | Finding | Resolution |
|---|---|---|---|
| C3 | critical | ADR-005's table claimed completeness at five surfaces but covered only `RecordForm`'s picker. `RoomDetail` is a **separate screen with its own picker renders** (`:231-233,248` → tile grid `:646`, `ChipList` `:949-990`, loadout selects `:1150,1167,1199`), and Phase 9 named it without line references — so Phase 9 could pass its exit criterion with `RoomDetail` unfiltered. Same failure class as pass 1's C1: an enumeration claiming completeness that missed a file | **Plan revised.** Verified: `preset` is in `EDITABLE_KINDS`, so both screens are live and share no picker code. ADR-005's table is now six numbered rows with per-call-site line numbers, `Lobby.tsx` explicitly excluded with a reason; Phase 9's scope and its five exit cases name each surface separately |
| C4 | critical | Filtering `RoomDetail:231-233` makes the **pre-existing** `VanishedRows` / `ChipList` tail fire: `known` is derived from the rendered array (`:926`, `:966`), so a hidden-but-selected id renders as `${id} (없는 항목)` — a broken-reference message, in the exact raw-id form ADR-002 deletes. The exemption also had no codified mechanism, leaving each call site to re-derive it | **Plan revised.** Verified against `:918-946` and `:987-990`. The exemption is now a **required** `keepSelected` parameter on `visibleIds(records, hidden, keepSelected)`, so a surface that forgets it fails to compile rather than rendering wrongly; Phase 9 case 4 asserts on the `vanished` class specifically, preserving the genuinely-dangling report; logged as R10 |
| W4 | warning | `RoomDetail.tsx` is in both Phase 2's and Phase 9's scope without being declared in either `merge_hazards`, inconsistent with the standard W2 established | **Adopted.** Declared in both, noting it is already serialized by the chain 2 → 6 → 9 |

**Verified as correctly closed in pass 2, not re-reported:** ADR-007's id lock does close the
`RecordForm.tsx:1138` overwrite path (`commitDraft` matches strictly on `openedId`);
`RoomDetail.tsx:435`'s rename branch is unreachable — the screen has no id input — so it is
not a fourth mechanism; `MakerGallery`'s `remixOf` (`:86-95`) already assigns a fresh id, so
a remix cannot collide with an official one; ADR-002's fallback list is complete (a sweep of
`src/ui/` for bare-id returns found exactly the sites already in Phase 2's scope);
`Lobby.tsx` correctly excluded from ADR-005.

**Note on the two-pass cap.** The stage permits `plan-validator` one re-run, which pass 2
was. All four pass-2 findings were mechanical rather than judgmental — each named a specific
file, line range and fix — so they were applied rather than accepted as risk, and the code
claims behind C3 and C4 were re-verified directly against `RoomDetail.tsx` before writing.
**No third validator pass has run**, so those fixes carry the same status as any unreviewed
edit: the reasoning is recorded above and the first execute phase to touch `RoomDetail` is
where they get their real check.

**Cross-model second opinion:** skipped — see the table above. The verdict is Claude-derived
and valid without it.
