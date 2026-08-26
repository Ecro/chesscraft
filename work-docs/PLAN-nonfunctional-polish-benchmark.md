---
type: plan
task_slug: nonfunctional-polish-benchmark
status: complete
created: 2026-08-26
tags: [chess-craft, plan, typescript, child-ux, collection, persistence]
spec: "[[SPEC-nonfunctional-polish-benchmark]]"
research_doc: "[[RESEARCH-nonfunctional-polish-benchmark]]"
interview_rounds: 1
adrs: 9
validator_outcome: MAJOR_REVISION_RESOLVED
summary: "Add a per-device collection record; render 도감 as a shelf with gaps; name what each match added"
---

# PLAN — The dex becomes a collection

## 🎯 Executive Summary

**What.** Add one new per-device record of which content the players have met,
used, and won with; render 도감 as a shelf with visible gaps and a per-tab count;
and name, on the result screen, what this match added.

**Why.** Today nothing survives a match. `src/ui/Result.tsx` reports three numbers
compared to nothing, `startNew` (`src/ui/MatchHost.tsx:592-611`) discards the whole
`GameState`, and none of the six `localStorage` keys accumulates. 도감
(`src/ui/Rules.tsx`) already draws every record in the loaded set — including the
child's own — but every entry renders identically forever, so it is a reference
book rather than a collection. RESEARCH establishes that classification and
completion are the age-appropriate engine here, and that a monotonic tier is what
lets a **lost** match still leave something behind.

**Key decisions.**
- The collection is a property of the **device**, not of a player — ADR-001.
- A skill card that was offered and declined still counts as met — ADR-002.
- The shelf is over currently loaded content; deleting a record removes its tile
  but not its discovery — ADR-003.
- A fourth tier, `won`, credited only to a **person's** winning side — ADR-004.
- The count is per tab, never a single total — ADR-005.
- Own module, own storage key, never on the content document — ADR-006.
- The unmet treatment is a CSS `filter`, asserted on rendered pixels — ADR-007.
- One commit at match end from a pure observer; the engine does not change — ADR-008.

**Estimated impact.** Two new files under `src/collection/`, three edited UI files
(`Rules.tsx`, `Result.tsx`, `MatchHost.tsx`), one new stylesheet block, new `ui.*`
keys in `src/i18n/ko.ts`, one new unit test file and one new e2e spec. No engine
change, no schema-version bump, no change to the content document's shape.

## 📚 Prior Work

- **`src/editor/hidden.ts` is the template, and it is exact.** A per-browser set of
  ids, its own key, `Storage` injected, read-only on load, and every failure —
  absent, corrupt, wrong shape, denied — resolving to "nothing". Its header states
  the reason the collection must not live on the content document: *"`importContent`
  rebuilds `ContentSource` field by field, so an unknown top-level field is silently
  dropped on the very next read… A hidden set stored on the document would survive
  exactly one save."* The same is true of a collection. Its second reason applies
  too: *"a document handed to another child should not carry this device's idea of
  what to look at."*
- **`src/content/provenance.ts:47` `officialIds(bundle)`** already answers AC-004 with
  no new storage — an id is authored iff the running build's bundle does not ship it,
  and `Edit.tsx:111` already derives the set this way. There is therefore **no
  migration** for existing users: everything they have made is theirs the moment the
  feature ships.
- **`src/engine/types.ts:76-80`** already carries `everOffered`, `held` and `used` per
  side per match. The material for ADR-002 exists; it is discarded rather than absent.
- **`[fail:test] distinct-is-not-distinguishable`** — a checker-pattern test asserted
  two colours were different *strings*; they were, imperceptibly, and the feature
  shipped invisible. Directly governs AC-003 and ADR-007.
- **`[fail:render] glyph-opts-out-of-its-styling` (count 3)** — `text-shadow`,
  `color`, `font-weight`, `-webkit-text-stroke` are silently inert on `<img>`, and
  the CSS keeps parsing. Dex tiles are `<img>`. Forces `filter`.
- **`[fail:render] fixed-overlay-blocks-what-it-only-dims` (count 2)** and
  **`[fail:design] mode-with-no-way-out`** — govern the result-screen addition:
  it must be inline in the existing result layout, never a new overlay.
- **`[fail:lint] hangul-literal-in-ui-source`** — the `chrome-i18n` gate forbids
  Hangul anywhere under `src/ui/*.tsx`, comments included. Every new string is a key.
- **`PLAN-content-provenance-and-room-delete`** already established *"Make 'what we
  shipped' and 'what the child made' two visibly different things"* inside the editor.
  This extends that distinction into 도감.
- **`PLAN-ui-ux-productization.md:551`** scoped achievements out of FTUE. This PLAN
  does not reintroduce them: there are no trophies, no unlocks, and nothing gated.

## 🎙️ Interview Transcript

| # | Topic | Category | Question | Options | Choice | Note | → ADR |
|---|---|---|---|---|---|---|---|
| 1 | What counts as met | Contract shape | Does a skill card offered in the draft but not taken count as `seen`? | A. seen if it was on screen · B. seen only once held | **A** | The engine already tracks `everOffered` separately; the count moves more often, which is what makes the child notice movement | ADR-002 |
| 2 | Tier depth | Contract shape | Add a third tier above `used` — "이걸로 이겼다"? | A. two tiers this cycle · B. three now | **B** | Accepted with the consequence named at ask time: the new tier is result-dependent, so SPEC AC-002 was rescoped to `seen`/`used` and AC-005's ladder extended | ADR-004 |
| 3 | Deleted records | Failure handling | What happens when a record the child met is later deleted? | A. leaves the shelf, numerator and denominator move together · B. stays as a ghost | **A** | Deleting is a deliberate act by the child; the discovery is retained so re-adding restores the tier | ADR-003 |
| 4 | Count placement | Scope boundaries | Per tab, or one total in the header? | A. per tab · B. one header total | **A** | A per-tab count is a number about the shelf currently on screen, and finishing one tab is an achievable target; a single total also reads too close to the "no number representing the child" non-goal | ADR-005 |

**Validator-driven revisions (pass 1, MAJOR_REVISION).** Five findings were raised and
all five resolved by revising the document. None opened a follow-up round, because each
had exactly one defensible answer and the stage's own rule is to pick a defensible
default rather than spend a round on it — a round asking "should Phase 5 declare the
dependency its own merge_hazards text requires?" has no second option.

| # | Finding | Resolution |
|---|---|---|
| V1 (critical) | Phase 5's `merge_hazards` required Phase 4 to land first, but `depends_on` was `[3]`, so a graph-driven scheduler could run them concurrently and collide on `ko.ts` / `styles.css` | Phase 5 `depends_on: [3, 4]`; Phase 4 `depends_on: [1, 3]`. The graph now encodes what the prose asserted |
| V2 | The SPEC's verification table named `tests/ui/collection.test.ts`; the PLAN named three different files, so an AC→test trace would report AC-002/004/005/007 unimplemented | The PLAN's layout wins and the SPEC table plus its machine `test_ids` were amended to match. `record` and `observe` are pure — filing them under `tests/ui/` would misdescribe them |
| V3 | R3's mitigation claimed a double-commit guard "covered by the Phase 3 unit case", but Phase 3's exit criterion named only the refusing-storage case | Phase 3's exit criterion now names both cases explicitly |
| V4 | ADR-003's Context said a child can "delete or hide" their own records. Delete is authored-only, hide is official-only, and `Rules.tsx` does not filter the hidden set at all — so hiding produces no shelf gap | Context corrected against `EditorLibrary.tsx:229-242`; hidden-set filtering declared out of scope |
| V5 | Phase 4's rollback point was Phase 3 while its `depends_on` was `[1]`, assuming a serial order the graph did not encode | Resolved by V1's `depends_on: [1, 3]`; the rollback chain is now true |

Checked and found clean by the validator: ADR-004's result-dependent `won` tier against
the rescoped SPEC AC-002 and the extended AC-005 ladder — the contradiction is closed,
not carried.

Defaults taken without asking, each stated in the design brief before the round so
an unseen default could not pass for an oversight: the record is per device
(ADR-001), the module is `src/collection/` (ADR-006), and the unmet treatment is a
CSS `filter` (ADR-007) because the recorded failure makes any text-property
treatment inert on these tiles.

## 📐 Architecture Decision Records

### ADR-001: The collection belongs to the device, not to a player
**Status:** Accepted (2026-08-26, via /hm:plan interview)
**Context:** Hot-seat is the default mode and both sides are children sharing one
phone; the app has no identity concept beyond two 8-character display names in
`Settings.names`, which are a label for the turn bar rather than an account.
**Decision:** One collection per browser profile. Records met or used by **either**
side count, and both children fill the same shelf.
**Consequences:**
- ✅ No identity concept has to be invented, and the shelf fills roughly twice as fast.
- ✅ `Settings.names` stays what its own header says it is — about who is holding the
  phone, not about who owns what.
- ⚠️ Two children sharing a phone cannot each have their own shelf. Accepted: the
  same document already works this way, and splitting it would require the accounts
  the SPEC's non-goals exclude.
**Rejected alternatives:**
- Per-side collections keyed on `Settings.names` — rejected because a renamed or
  blank name would silently orphan a shelf, and blank is a legitimate stored value.
**Source:** Design-brief default, stated before Interview Round 1.

### ADR-002: A skill card that was offered and declined still counts as met
**Status:** Accepted (2026-08-26, via /hm:plan interview)
**Context:** The draft offers `DRAFT_OFFER_SIZE = 3` cards per side and one is
taken. The engine already distinguishes `everOffered` from `held` and `used`
(`src/engine/types.ts:76-80`).
**Decision:** `everOffered` maps to `seen`. Holding or playing maps to `used`.
**Consequences:**
- ✅ Two of every three offered cards become discoveries instead of nothing, so the
  count moves in almost every match — the property that makes a child notice it.
- ✅ It is honest: the child did look at the card and read what it does.
- ⚠️ "발견" carries slightly less weight per unit. Accepted; `used` and `won` are the
  tiers that carry weight.
**Rejected alternatives:**
- Held-or-played only — rejected because an offered-and-declined card would stay a
  silhouette forever despite having been read, which reads as a bug.
**Source:** Interview #1.

### ADR-003: The shelf is over currently loaded content; discovery outlives the tile
**Status:** Accepted (2026-08-26, via /hm:plan interview)
**Context:** A child can **delete** their own authored records, and can replace the
whole document by pasting a friend's. A collection keyed to record ids must define
what happens when an id it holds no longer exists. Note that deleting and hiding are
not interchangeable and only deletion is relevant here: `src/ui/EditorLibrary.tsx:229-242`
offers delete for authored records only and hide for official records only, and
`src/ui/Rules.tsx` builds its four sets straight from the content set with no hidden
filter (`src/ui/App.tsx` passes `loaded.set` unfiltered). Hiding an official record
therefore produces no gap in 도감 today, and adding that filtering is **out of scope**
for this PLAN.
**Decision:** 도감 lists exactly the records in the loaded content set — unfiltered by
the hidden set, unchanged from today — so a deleted record leaves both the numerator
and the denominator. The discovery record itself is
**not** pruned: if the id returns — undeleted, re-imported, or re-created with the
same id — its tier returns with it.
**Consequences:**
- ✅ The count never lies about the shelf on screen.
- ✅ AC-005's monotonic guarantee is exact and testable: it is per entry, for as long
  as that entry exists.
- ⚠️ The displayed count can go down when the child deletes something. Accepted:
  that is the child's own deliberate action, and the alternative shows tiles for
  records that are gone.
- ⚠️ The stored id list grows without bound across imports. Bounded in practice by
  the id space of shipped plus authored content; if it ever matters, pruning is a
  later decision and not a correctness one.
**Rejected alternatives:**
- Ghost entries for deleted records — rejected because a tile the child cannot open,
  cannot play, and cannot delete is exactly the "why won't this go away" surface.
- Pruning the discovery on delete — rejected because it makes an undo destructive.
**Source:** Interview #3.

### ADR-004: A fourth tier `won`, credited only to a person's winning side
**Status:** Accepted (2026-08-26, via /hm:plan interview)
**Context:** The user chose a third step above `used`. The engine produces no
per-record win attribution, and in an AI match the winning side may be the computer.
**Decision:** The ladder is `unencountered < seen < used < won`. At the end of a
decisive match, records that reached `used` **by the winning side** are promoted to
`won`, and only when that side was played by a person. A draw promotes nothing.
**Consequences:**
- ✅ The collection gains a top tier the child can aim at.
- ✅ A child never sees 이걸로 이겼다 on a card the computer beat them with.
- ⚠️ **SPEC AC-002 had to be rescoped.** `seen` and `used` remain provably
  independent of the result; `won` is by definition not. The SPEC scenario and the
  machine `expected_relation` were both amended, and AC-005's ladder extended, so
  the contradiction is closed rather than carried.
- ⚠️ In hot-seat both sides are people, so the loser's cards do not promote. That is
  the tier's meaning and not a defect.
**Rejected alternatives:**
- Two tiers this cycle (the recommended option) — rejected by the user.
- Crediting the winning side regardless of who played it — rejected as above.
**Source:** Interview #2.

### ADR-005: The count is per tab
**Status:** Accepted (2026-08-26, via /hm:plan interview)
**Context:** 도감 has four tabs (기물 / 특별한 칸 / 규칙 카드 / 스킬 카드) and the
count has to attach somewhere.
**Decision:** Each tab shows met-over-total for its own kind. No aggregate anywhere.
**Consequences:**
- ✅ The number describes the shelf actually on screen, and one tab is a finishable
  target.
- ✅ Stays clear of the SPEC non-goal "a single number representing the child".
- ⚠️ There is no one place showing overall progress. Intended.
**Rejected alternatives:**
- One header total — rejected for both reasons above.
**Source:** Interview #4.

### ADR-006: Own module, own storage key, never the content document
**Status:** Accepted (2026-08-26, via /hm:plan interview)
**Context:** Three existing stores already faced this choice and made it the same
way — `hidden.ts`, the bundle stamp, and `settings.ts`.
**Decision:** `src/collection/` with `chess-craft.collection.v1`, `Storage` injected,
typed load result, fail-to-empty in every direction.
**Consequences:**
- ✅ `importContent` cannot silently drop it — the failure `hidden.ts` documents.
- ✅ An exported document stays free of this device's play history, which is a
  privacy property as well as a cleanliness one.
- ✅ The refusing-storage path is reachable in a test, which is what AC-007 needs.
- ⚠️ A fourth per-browser key. Accepted; the convention is established and uniform.
**Rejected alternatives:**
- A field on `ContentSource` — rejected: survives exactly one save, per `hidden.ts`.
- Reusing `SETTINGS_KEY` — rejected: settings are three flags read on every render;
  a growing id set does not belong in the same blob.
**Source:** Design-brief default, stated before Interview Round 1.

### ADR-007: The unmet treatment is a CSS `filter` on the tile
**Status:** Accepted (2026-08-26, via /hm:plan interview)
**Context:** Dex tiles render through the art registry as `<img>`. The project has
recorded three separate instances of a styled set whose one member came from another
technology and silently inherited nothing.
**Decision:** Unmet tiles are treated with `filter` (which rasterises against the
image's alpha and therefore works on a replaced element), and the difference is
asserted on the rendered result rather than on the attribute that produces it.
**Consequences:**
- ✅ Immune to the recorded failure class; works identically for glyph and art tiles.
- ✅ Zeroed under `prefers-reduced-motion` is not needed — it is a static treatment,
  not motion — so it adds nothing to that surface.
- ⚠️ A filtered tile must still meet the non-text contrast floor against the shelf
  background. Verified as part of the phase, not assumed.
**Rejected alternatives:**
- `opacity` alone — rejected: a low-opacity tile can drop under the contrast floor
  the project refuses to lower.
- Hiding unmet tiles — rejected: AC-003 requires the gap to be visible; a shelf with
  no empty places is not a collection.
**Source:** Design-brief default, stated before Interview Round 1.

### ADR-008: One commit at match end, from a pure observer; the engine does not change
**Status:** Accepted (2026-08-26, via /hm:plan interview)
**Context:** Discovery could be written incrementally as the match proceeds, or
derived once from the finished match.
**Decision:** A pure function reads the completed match and returns the tier sets;
`MatchHost` commits once, when `state.result` first appears. No engine file is
touched and no engine type gains a field.
**Consequences:**
- ✅ AC-002's property is structural: the observer receives the move history, and the
  result kind is only consulted for the `won` tier.
- ✅ A quota-refusing storage cannot interrupt play, because the only write happens
  after the match is over — which is most of AC-007.
- ✅ The observer is testable without a browser, a DOM, or storage.
- ⚠️ Abandoning a match mid-way records nothing. Accepted: the SPEC's non-goals
  already accept losing an in-progress match, and a partial discovery would need the
  incremental write this decision rejects.
**Rejected alternatives:**
- Incremental writes per move — rejected: a write per ply on a refusing storage, and
  a much larger surface for AC-007.
- A field on `GameState` — rejected: `src/engine/` is a contract boundary here.
**Source:** Design-brief default, stated before Interview Round 1.

## 🏗️ Technical Design

### Current state
- `src/ui/Rules.tsx` builds four `Entry[]` sets straight from `ContentSet` and
  renders every entry identically. No state, no count.
- `src/ui/Result.tsx` renders a title, a reason and three per-match numbers.
- `src/ui/MatchHost.tsx` holds the match; `state.result` becoming non-null is the
  end-of-match signal already used to gate `CaptureReveal` and `Result`.
- `src/engine/types.ts` `GameState.drafts` carries `everOffered`, `held`, `used`.
- Six `localStorage` keys, none accumulating.

### Affected components
| File | Change |
|---|---|
| `src/collection/tiers.ts` *(new)* | The tier ladder, its ordering, and the merge that can only move up |
| `src/collection/record.ts` *(new)* | `chess-craft.collection.v1` load/save, `Storage` injected |
| `src/collection/observe.ts` *(new)* | Pure: finished match → per-tier id sets |
| `src/ui/MatchHost.tsx` | Commit once on `state.result`; pass the match's delta to `Result` |
| `src/ui/Result.tsx` | Render the new-this-match count when it is non-zero |
| `src/ui/Rules.tsx` | Per-entry tier, per-tab count, unmet treatment, authored badge |
| `src/ui/styles.css` | The unmet tile treatment and the count chip |
| `src/i18n/ko.ts` | New `ui.dex.*` / `ui.result.*` keys |

### Dependencies
None added. No new npm package.

### Data flow
```
match ends (state.result != null)
        │
        ├─ observe(match)  ── pure ──▶ { seen: Set<id>, used: Set<id>, won: Set<id> }
        │                                        │
        │                              mergeUp(stored, observed)   ← can only move up
        │                                        │
        │                              saveCollection(storage)  ── refuses ──▶ swallowed
        │                                        │
        ├─────────────────────────────▶ delta (ids that moved to a tier for the
        │                                first time) ──▶ Result: 새로 발견 N
        │
Rules.tsx ── loadCollection ─┬─ tier(id) per entry ─▶ tile treatment
                             └─ |met ∩ kind| / |kind| ─▶ per-tab count
                                officialIds(bundle) ──▶ authored badge
```

### Design decisions
Every one links to an ADR above: device scope (ADR-001), tier semantics (ADR-002,
ADR-004), lifecycle against deletion (ADR-003), count placement (ADR-005), storage
shape (ADR-006), visual treatment (ADR-007), commit point (ADR-008).

### API changes
None public. `src/collection/` exports `Tier`, `Collection`, `loadCollection`,
`saveCollection`, `mergeUp`, `observe`. Nothing in `src/engine/` or `src/content/`
changes signature.

## 📝 Implementation Plan

### Phase 1 — The tier ladder and the store
- **depends_on:** `[]`
- **parallel_group:** `parallel-foundation`
- **merge_hazards:** none — both files are new
- **Scope in:** `src/collection/tiers.ts`, `src/collection/record.ts`,
  `tests/collection/record.test.ts`
- **Scope out:** every existing file
- **Detail:** `Tier = 'seen' | 'used' | 'won'` with a rank; `mergeUp` never lowers a
  tier; `loadCollection` resolves absent / corrupt / wrong-shape / denied to an empty
  collection, filtering bad entries rather than rejecting the file, exactly as
  `loadHidden` does; `saveCollection` never throws.
- **Exit criterion:** `npm run test -- tests/collection/record.test.ts` green, with
  cases for each failure direction and a property test for `mergeUp` monotonicity
- **Risk:** `low`
- **Rollback point:** none needed — additive, no existing file touched
- **Status:** ✅ DONE — `tests/collection/record.test.ts` 14/14. A.5 PASS in one round.

### Phase 2 — The observer
- **depends_on:** `[1]`
- **parallel_group:** `serial-observe`
- **merge_hazards:** none — new file, imports Phase 1's types
- **Scope in:** `src/collection/observe.ts`, `tests/collection/observe.test.ts`
- **Scope out:** `src/engine/**` (contract boundary)
- **Detail:** derive `seen` from every record present in the match plus every
  `everOffered` card; `used` from pieces actually moved, cards actually played, and
  square types actually stood on; `won` per ADR-004. The result kind is consulted for
  `won` and for nothing else — that separation is what AC-002 tests.
- **Exit criterion:** `npm run test -- tests/collection/observe.test.ts` green,
  including the AC-002 property (same move sequence, three result kinds, identical
  `seen`/`used`)
- **Risk:** `low`
- **Rollback point:** Phase 1
- **Status:** ✅ DONE — `tests/collection/observe.test.ts` 13/13.
  Resolved after an escalation: the user chose the sweep path (option B) and authorized a
  third A.5 round outside the 2-round budget. Round 3 found one further defect — the
  `movers` oracle diffed square occupants, which reports a piece CAPTURED IN PLACE as
  though it had moved, so a correct `observe` would have been required to over-credit
  `used`. Rebuilt from the applied `move` actions instead. Measured afterwards: captures
  were 0 at those fixtures, so the predicted concrete failure never fired, but the latent
  defect was real. A fixture premise then caught itself in Phase C — `walk(9, 4)` had zero
  occupied square types, and the depth was re-measured to `walk(3, 12)` (2 of 5 occupied).

  The original blocker, for the record: A.5 rounds 1 and 2 each resolved the prior findings
  and surfaced a fresh same-class one — round 1 a missing played-card positive and a
  vacuous square-negation, round 2 two one-directional implications. The sweep added
  negative witnesses for every predicate `observe` computes, including a `seen`-negative
  that neither review round had cited and that an escalation found: unpainted square types
  (12 of 17) and unplaced pieces (7 of 13) are absent BY CONSTRUCTION, not by walk depth.

  **Round 1 FAIL** — (a) AC-001's "a skill card that was *actually played*" → `used` clause
  had no test, only its declined-card negative; (b) the square-type test asserted no premise
  that any type was left unreached, so its not-used loop could execute zero times. Both were
  fixed: a played-card test was authored, and the square test gained
  `occupied.size > 0` and `occupied.size < painted.size`. Separately, and from my own
  measurement rather than the review, `walk` was changed to prefer `play_card` — under the
  old first-legal-action walk both sides moved exactly
  `piece.knight, piece.pawn, piece.rook` for every seed tried, identical sets, which made the
  `won`-tier assertion fail for the wrong reason.

  **Round 2 FAIL** — two NEW findings, both banned-pattern-1 one-directional implication:
  (a) the played-card test proves `played ⇒ used` but never `held-but-not-played ⇒ not used`,
  so an `observe` computing card-`used` as `held ∪ used` passes the whole file; (b) the
  moved-piece test proves `moved ⇒ used` but never `never-moved ⇒ not used`, so an `observe`
  that credits every piece ever on the board passes.

  **Measured after round 2** (a real probe, not inference — it also refutes round 2's own
  non-blocking guess that `walk(5, 6)` would have no movers):

  | fixture | movers | non-movers | cards played | held-not-played |
  |---|---|---|---|---|
  | `walk(5, 6)` | 2 | 4 | 1 | 1 (`skill.recruit`) |
  | `walk(9, 4)` | 1 | 5 | 1 | 1 (`skill.volley`) |
  | `walk(5, 12)` | 4 | 2 | 2 | 0 |
  | `walk(3, 24)` | 6 | 0 | 4 | 0 |

  So both remaining findings have a witness at shallow depth and none at 24 plies — the fix is
  two premise-guarded negative assertions at 6 or 4 plies, and the numbers to make it safe are
  already in hand. What the budget stopped is not an unfixable defect; it is the pattern of a
  reviewer resolving the prior round and surfacing a fresh same-class finding each time.

  `[boundaries] comparison not performed — blocked exit.`

### Phase 3 — Commit at match end
- **depends_on:** `[1, 2]`
- **parallel_group:** `serial-matchhost`
- **merge_hazards:** `src/ui/MatchHost.tsx` — also edited by Phase 5, which declares
  `3` in its `depends_on`; these two are never concurrent
- **Scope in:** `src/ui/MatchHost.tsx`, `tests/ui/matchhost-commit.test.tsx`
- **Scope out:** `src/engine/**`, `src/ui/Rules.tsx`, `tests/ui/match-lifecycle.test.tsx`
  (the existing MatchHost suite is left alone; the commit guard gets its own file so the
  phase's scope is exactly what it declares)
- **Detail:** on `state.result` first becoming non-null, observe → merge → save once,
  guarded so a re-render cannot double-commit. A refusing save is swallowed at the
  call site with a comment naming the failure direction, matching `sound.ts:105-108`.
- **Exit criterion:** `npm run test` green and `npm run typecheck` clean, with two
  named new unit cases: `a refusing storage leaves the result screen rendered and the
  rematch control operable` (AC-007) and `a re-render after the result appears does
  not commit twice` (R3 — the guard the risk register claims exists)
- **Risk:** `medium` — the busiest file in the app
- **Rollback point:** Phase 2
- **Status:** ✅ DONE — `tests/ui/matchhost-commit.test.tsx` 5/5 (four from this phase).
  A.5 took two rounds. Round 1: the R3 re-render trigger was dead code — `sound-toggle` is
  unmounted whenever `overlayOwnsScreen = Boolean(state.result)`, so the test asserted
  nothing; and all three tests mounted an already-terminal `initialState`, so a commit keyed
  on that prop rather than on live state would have passed while never firing for a child
  who actually finished a game. Fixed with `rerender` and with a fixture that finds a
  position one legal move from a result and plays that move through the board.
  Round 2 found a single defect in three places: `skipOnboarding(storage)` passes an argument
  to a zero-parameter helper, which broke `tsc --noEmit` for the whole repository —
  `npm run test` does not typecheck, so A.4 could not have surfaced it. Replaced with
  `markSeen(storage, MATCH_INTRO_SEEN_KEY)`, which also fixes the semantics: `MatchHost`
  reads the INJECTED storage, and `skipOnboarding` writes to the global one.
  The A.5 budget was exhausted at that point; the user's ruling on the identical question one
  phase earlier ("proceed to Phase C") was applied, the remaining finding having been a
  compile error with no judgement in it.

### Phase 4 — 도감 becomes a shelf
- **depends_on:** `[1, 3]`
- **parallel_group:** `serial-dex`
- **merge_hazards:** `src/ui/styles.css` and `src/i18n/ko.ts` — also touched by
  Phase 5, which declares `4` in its `depends_on` so the graph forces the order
  rather than only this prose
- **Scope in:** `src/ui/Rules.tsx`, `src/ui/styles.css`, `src/i18n/ko.ts`,
  `e2e/collection.spec.ts`, `tests/ui/collection-dex.test.tsx`
- **Scope out:** `src/ui/tokens.css` (no contrast floor moves)
- **Detail:** per-entry tier from the store; unmet tiles keep their grid position and
  take the `filter` treatment (ADR-007); per-tab met/total chip (ADR-005); authored
  badge from `officialIds` (AC-004). Tier is exposed as text as well as treatment —
  colour alone is not a cue here, per the standing rule.
- **Exit criterion:** `npm run test` green and `npm run e2e -- collection.spec.ts`
  green, with the unmet-vs-met assertion made on computed style / rendered pixels,
  never on a differing attribute value
- **Risk:** `medium` — the perceptual assertion is where the recorded failures live
- **Rollback point:** Phase 3
- **Status:** ✅ DONE — `tests/ui/collection-dex.test.tsx` 5/5, A.5 PASS on round 2.
  Round 1's single finding: the met-count fixture seeded only a piece id, so `|seen|` and
  `|seen ∩ pieces|` were both 1 and a kind-agnostic aggregate would have passed — exactly
  the count ADR-005 forbids. Fixed by seeding a square-type id as well and asserting the
  pieces tab still reads 1.
  **Scope note:** `src/ui/App.tsx` was edited to pass `official` and `collection` into
  `Rules`. It is named in no phase's Scope in, and is reported as a scope expansion at Step 4
  rather than folded in silently. It crosses no contract boundary.

### Phase 5 — The result screen names what this match added
- **depends_on:** `[3, 4]`
- **parallel_group:** `serial-result`
- **merge_hazards:** `src/ui/MatchHost.tsx` (Phase 3), `src/i18n/ko.ts` and
  `src/ui/styles.css` (Phase 4), `e2e/collection.spec.ts` (Phase 4) — strictly last,
  and every one of those edges is declared in `depends_on` above so no scheduler can
  start this concurrently with either phase
- **Scope in:** `src/ui/Result.tsx`, `src/ui/MatchHost.tsx`, `src/i18n/ko.ts`,
  `src/ui/styles.css`, `e2e/collection.spec.ts`
- **Scope out:** any new overlay, sheet or modal
- **Detail:** the delta computed in Phase 3 is passed to `Result` and rendered
  **inline in the existing result layout** as one more line beside the three
  statistics. Zero renders nothing — absence, not a zero. No new dismissal path is
  introduced, which is deliberate given the recorded overlay and no-way-out failures.
- **Exit criterion:** `npm run verify` green end to end
- **Risk:** `low`
- **Rollback point:** Phase 4
- **Status:** ✅ DONE — the delta is measured across the write in `MatchHost` and rendered
  inline by `Result`; absent, not zero, when a match added nothing.
  A.5 round 1 confirmed a doubt raised in the dispatch: the no-op premise compared
  `loadCollection(storage)` against a second read of the same storage, which is `assert X == X`
  and holds for any storage state whatsoever. Rewritten to diff the post-first-match snapshot
  against the post-second-match read.
  Round 2 raised a scope finding rather than a test defect — SPEC's verification table routes
  AC-006 (with AC-001 and AC-003) to `e2e/collection.spec.ts`, which had not been authored.
  It now exists and passes 3/3 on mobile-portrait, asserting the unmet treatment on the
  RENDERED computed style rather than on `data-tier`, and the result-screen count against a
  delta read from `localStorage`.

## 🚧 Contract Boundaries

### Do not change
- `src/engine/` — the engine must not learn that a collection exists; the observer reads it, never the reverse (ADR-008)
- `src/content/schema.ts` — no `SCHEMA_VERSION` bump; the collection is not content (ADR-006)
- `src/editor/storage.ts` — the content document must not carry collection state; `importContent` would drop it on the next read
- `src/editor/io.ts` — an exported document stays free of this device's play history
- `src/ui/tokens.css` — no colour value moves and no contrast floor is lowered; move the colour, never the floor
- `src/ui/sound.ts` — no new sound or haptic event this cycle
- `src/ui/settings.ts` — no new settings field; the collection is not a preference
- Advisory: no new UI string may contain 어린이, 저학년, or kid, and no element may be age-labelled
- Advisory: no particles, no screen shake, no new full-screen overlay
- Advisory: every new string is a `ui.*` key; Hangul anywhere under `src/ui/*.tsx`, comments included, fails the existing gate

### ADR-009: A promotion, and a piece that merely appeared, stop at `seen`
**Status:** Accepted (2026-08-26, via /hm:review round 2 + user decision)
**Context:** `observe` reads only `Match.states`. The engine rewrites a promoting
piece's id inside the transition that moves it, and `spawn_piece`/`revive_piece`
place a piece that arrives exactly like one that moved. From the states alone a
promotion is indistinguishable from a creation plus a capture.
**Decision:** Neither case reaches `used`. AC-001 was amended to say so, and both are
pinned by `tests/collection/observe.test.ts::a piece that appeared or promoted is met,
never used`.
**Consequences:**
- ✅ The observer stays pure over the states, so ADR-008 holds and `src/engine/`
  remains untouched.
- ✅ The behaviour is specified and tested rather than silently wrong.
- ⚠️ A child who wins by promoting a pawn does not see that pawn credited for the
  promoting move. Accepted: it is an under-credit, the pawn is almost always already
  `used` from an earlier move, and the alternative changes a fixed signature.
**Rejected alternatives:**
- Threading the applied actions from `MatchHost` into `observe` — rejected by the
  user in favour of amending the criterion.
**Source:** /hm:review round 1 (design lens), resolved by the user after round 2.

## 🧪 Testing Strategy

The SPEC's Verification Criteria table originally named a single
`tests/ui/collection.test.ts`. It was written before the module split below existed;
the SPEC table and its machine `test_ids` were amended to these paths, so the two
documents name one layout. Splitting is the point: `record` and `observe` are pure
and need neither a DOM nor storage, and putting them under `tests/ui/` would hide
that.

**Unit (`vitest`)**
- `tests/collection/record.test.ts` — absent / corrupt / wrong-shape / denied all
  resolve to empty; one bad entry is filtered, not fatal; `saveCollection` never
  throws; `mergeUp` is monotonic over arbitrary operation orders (AC-005, AC-007).
- `tests/collection/observe.test.ts` — the tier derivation per kind; the AC-002
  property over the three result kinds; `won` only for a person's winning side.
- `tests/ui/collection-dex.test.tsx` — an authored record is never unmet for any
  collection log including the empty one (AC-004); the per-tab count is per kind.
- `tests/ui/matchhost-commit.test.tsx` — a refusing storage leaves the result screen
  rendered and the rematch control operable (AC-007); a re-render after the result
  appears does not commit twice (R3).

**E2E (`@playwright/test`)**
- `e2e/collection.spec.ts` — play a seeded match to its end and assert the persisted
  collection against the room's own content list (AC-001); reload and assert it
  survives; assert the unmet tile differs from a met one on rendered output and keeps
  its grid position (AC-003); assert the result screen's new-count against a
  storage-read delta, and its absence when nothing is new (AC-006).

**Manual**
- On a phone-width viewport with a partially filled set, confirm at arm's length that
  filled and empty tiles are tellable apart without reading the count. This is the
  check the recorded contrast failures say a measurement alone does not settle.

## ⚠️ Risks & Mitigation

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R1 | The unmet treatment is measurably different but perceptually invisible — the exact shape of `[fail:test] distinct-is-not-distinguishable` | medium | high | Assert on rendered output, not attributes (ADR-007), plus the manual arm's-length check |
| R2 | `filter` on an `<img>` tile drops it under the non-text contrast floor | medium | medium | Verify against the existing contrast gates in Phase 4; the floor does not move |
| R3 | Double-commit on re-render inflates the delta shown on the result screen | medium | low | Guard the commit on the transition, not the state; covered by the Phase 3 unit case |
| R4 | The stored id list grows unboundedly across repeated imports | low | low | Bounded by the id space in practice; pruning is a later, non-correctness decision (ADR-003) |
| R5 | `MatchHost.tsx` is the app's busiest file and Phases 3 and 5 both touch it | medium | medium | Declared as a merge hazard; the phases are strictly serial |
| R6 | The `won` tier makes a losing child feel a second loss on the result screen | low | medium | The result screen reports only the *count of new discoveries*, which is result-independent for `seen`/`used`; the `won` tier is visible only in 도감 |
| R7 | A new string lands in `src/ui/*.tsx` and trips the Hangul gate | medium | low | Known and recorded (fired four times in one work unit before); every string is a key from the start |

## ✅ Success Criteria

- [x] AC-001 — a played match records `seen` (including offered-and-declined cards), `used`, and `won`, and survives a reload
- [x] AC-002 — the `seen` and `used` sets are identical across win, loss and draw for the same move sequence; nothing is ever removed
- [x] AC-003 — each tab shows met-over-total for its own kind; unmet entries keep their place and differ on rendered output
- [x] AC-004 — an authored record is marked as the child's and is never unmet, for any collection log including the empty one
- [x] AC-005 — no entry regresses along `unencountered < seen < used < won` while it exists
- [x] AC-006 — the result screen names this match's new entries, and renders nothing when there are none
- [x] AC-007 — a refusing storage never blocks play and never surfaces a message
- [x] `npm run verify` green (typecheck · build · test · e2e · e2e:pwa · test:build)
- [x] No file under `## 🚧 Contract Boundaries` appears in the final diff

## 🔍 Plan Validation

**Pass 1 — MAJOR_REVISION.** Five findings (1 critical, 4 warnings). All five resolved
by revising the documents; the resolutions are tabulated as V1–V5 in
`## 🎙️ Interview Transcript`. Measured PLAN churn from the revision: **0.127**, under
the 0.5 threshold, so no queued critique was retired as stale.

Verified clean by pass 1 and re-verified by pass 2: ADR-004's result-dependent `won`
tier against the rescoped SPEC AC-002 and the extended AC-005 ladder.

**Pass 2 — NEEDS_REVISION. This pass is terminal.** The two-pass cap is the stage's,
and it is not raised here. Loop outcome as computed by `hm plan_rounds outcome`: **progress** —
`resolved_n: 5`, `new_n: 3`, `unresolved_n: 0`. The cap stopped a loop that was still
moving, which is a different fact from a loop that had stalled, and the two have
opposite remedies. None of the three new findings blocks.

| # | Severity | Finding | Disposition |
|---|---|---|---|
| P2-1 | warning | Phase 3's exit criterion names two unit cases but its Scope in declared no test file, unlike every other phase. `/hm:execute` would have had to choose between extending the undeclared `tests/ui/match-lifecycle.test.tsx` and creating an undeclared new file — a scope decision the PLAN owes it | **Fixed.** Phase 3 now declares `tests/ui/matchhost-commit.test.tsx` in Scope in, explicitly scopes the existing MatchHost suite out, and the Testing Strategy lists the file |
| P2-2 | suggestion | `e2e/collection.spec.ts` is in both Phase 4's and Phase 5's Scope in but was not named in either `merge_hazards`, unlike the other three shared files. Not a scheduling risk — Phase 5's `depends_on: [3, 4]` already serialises it — only a documentation inconsistency | **Fixed.** Named in Phase 5's `merge_hazards` alongside the others |
| P2-3 | suggestion | Frontmatter `validator_outcome` still read `APPROVED` while the body carried the placeholder for this very pass | **Fixed.** Now `MAJOR_REVISION_RESOLVED`, which is what pass 1 plus its resolutions actually were |

P2-1 and P2-2 were applied rather than only recorded: both are one-line scope
declarations, neither reopens a decision, and P2-1 in particular describes a stall
`/hm:execute` would hit. Nothing was re-validated after them — the terminal pass stays
terminal, and no third dispatch was made.

Categories the validator returned clean across both passes: risk register, ADR
completeness, SPEC alignment, scope-drift hazards, missing interview rounds, rollback
strategy.

**Cross-model second opinion.** `codex` — `status: skipped`, reason: the Side preset
gates every enabled model on a high-diff change, and `hm high_diff classify` returned
`{"boundary": false, "is_high": false}` for this stage's working tree, which holds only
the RESEARCH and SPEC documents. Both verdicts above are Claude-only by that rule.
