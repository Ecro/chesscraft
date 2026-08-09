---
type: review
task_slug: content-provenance-and-room-delete
status: APPROVED
created: 2026-08-09
reviewers_invoked: [code-reviewer, codex]
consensus_method: single (+1 cross-model voter)
drift_verdict:
  result: scope_violation
  scope_violations:
    - src/editor/fork.ts
  scenario_misses: []
  incomplete_phases:
    - src/editor/draft.ts
  task_slug: content-provenance-and-room-delete
  computed_at: 2026-08-09T23:55:00Z
---

## 🎯 Round 1 Summary

**Grade: A** (0 consensus-passed P0, 0 consensus-passed P1) · threshold **B** → **APPROVED**
**`human_review_needed: true`** — one PIDA-`accepted` cross-model **P1** landed as `manual-only`,
which sets `unverified_severe`.

Three findings, all single-source, all verified against the running code, **all fixed**:

| # | Severity | Source | Finding | Action |
|---|---|---|---|---|
| 1 | **P1** | codex | Renaming an official room *and* changing its rules in one save renamed the shipped original too | **Fixed** + regression test |
| 2 | P2 | codex | The loadout-exemption test's fixture is a document the loader refuses | **Fixed** + every fixture now self-validates |
| 3 | P2 | code-reviewer | 11 picker/grid sites label per row, so two unnamed siblings render identically | **Fixed** + regression test |

**Why the fixes were applied outside the consensus auto-fix path, and it is not a shortcut.**
`reviewers.enabled` holds one Claude reviewer, so the voter pool is 2 (code-reviewer + codex)
and K=2 — a finding reaches `consensus-passed` only when *both* voices report it independently.
They overlapped on nothing, so the auto-fix loop had zero eligible findings and would have
exited round 2 with `no-progress`, leaving a confirmed P1 in the tree behind a grade of A.
Each finding was instead confirmed with a decisive oracle (below) and fixed as a verified
manual finding. Recorded here rather than presented as consensus work.

## 🔍 Drift Findings

| Severity | Finding |
|---|---|
| P1 | **`src/editor/fork.ts` is outside every PLAN phase's scope.** Phase 6's scope names `src/editor/draft.ts` (`commitDraft` fork branch). The ⚠️ amendment block recorded under Phase 6 *predicted* this placement — "the fork must happen in the layer that HAS the text … not inside `commitDraft`" — but the scope list was never updated to match. The code follows the amendment; the scope line follows the superseded plan. |
| P1 | **`src/editor/draft.ts` is in Phase 6's scope and did not change.** The same amendment says so deliberately ("`commitDraft` … stays untouched. That is also the lower-risk placement"). Documented deviation, not a silent one. |

`src/ui/Lobby.tsx` is **not** drift: Phase 2's scope covers "every `recordLabel` call site the
compiler flags", and it is one.

No `common_ground_marks` in the PLAN frontmatter, so the Step 2.5 silent-intent-miss hook does
not apply.

## ✅ Consensus Findings

None. See the Round 1 Summary for why K=2 was unreachable with this voter pool.

## ⚠️ Weak Consensus

None.

## 📝 Manual-Only Findings

### P1 — `src/ui/RoomDetail.tsx` (was `:488-509`) · source: codex · id `e76676f88b09d1ae`

Renaming an official room **and** changing its rules in the same save renamed the shipped
original as well as the copy.

The typed name was folded into `strings` at the **original's** key before `forkOnEdit` ran; the
fork then resolved that already-overwritten key and copied the same new value onto the copy's
key. Both rooms ended up with the child's name and the shipped room's own name was gone.
`RecordForm.prepared()` does the opposite order and was correct — **one rule, two
implementations, and only one of them right.**

**Oracle** (purpose-written vitest, run against the code as it stood):

```
ORACLE presets: ["preset.ours","preset.other","preset.ours-2"]
ORACLE preset.ours.name   = "내 방"     ← the shipped room, renamed
ORACLE preset.ours-2.name = "내 방"
AssertionError: the SHIPPED room must keep its own name: expected '내 방' to be '우리 방'
```

**Why the suite missed it.** `fork-on-edit.test.tsx`'s room test changes composition and never
renames; the rename test changes no rule. The combination — which is one ordinary save for a
child — was reachable by a user and by nothing in 1300 tests.

**Fix.** The name fold moved *after* both forks and now keys off `roomDraft.nameKey` / `roomId`,
mirroring `RecordForm`. **Regression test:** `tests/ui/fork-on-edit.test.tsx > renaming an
official room AND changing its rules in one save leaves the original's name alone` — the oracle,
promoted verbatim. Post-fix: `preset.ours.name = '우리 방'`, `preset.ours-2.name = '내 방'`.

### P2 — `tests/ui/hidden-pickers.test.tsx` · source: codex · id `e1329d4b17ddbc66`

The loadout-exemption test mutated the base fixture to add a `loadout` without `loadoutBudget`.

**Oracle** (the real loader):

```
ORACLE base loads: true
ORACLE loadout-without-budget loads: false
  → "a preset that declares a loadout must also declare loadoutBudget"
```

This is `[fail:test] fixture-invalid-so-fallback-satisfies` recurring inside the very change that
had already hit it once — the `describe('the fixtures')` guard added during execute validated
only the **base** builder, so a mutation could still be a document the product cannot load.

**Fix.** `withLoadout()` is a named builder carrying `loadoutBudget`, and the fixture guard is now
`it.each` over **every** builder in the file.

**A second, larger defect fell out of that guard.** It immediately failed `withDangling`, and the
reason matters more than the fixture: a saved document with a dangling reference is refused by
`loadContentSet`, and `initialSource()` discards such a document wholesale — **so no child can
ever open that room, and the "still reports a genuinely dangling reference as vanished" test was
asserting against a state the product cannot be in.** The test now reaches the state the way a
child does: add a piece to the room without saving, delete it from the library (allowed — the
*saved* room does not reference it), and return to a draft naming something gone.

### P2 — 11 sites across `RoomDetail.tsx` / `RecordForm.tsx` / `MakerGallery.tsx` · source: code-reviewer

Picker and grid surfaces called `recordLabel` per row inside a `.map`, with no ordinal, so two
records that both fail to resolve a name render as the same three words — indistinguishable
except by DOM position. `recordLabel.ts`'s own doc comment claims *"every surface that renders
more than one record at a time goes through here"*, and eleven did not: the file documented a
guarantee the code did not provide (`[fail:design] comment-claims-unbuilt-safeguard`, count:8),
and `no-raw-ids.test.tsx` asserted "tellable apart" only against `EditorRooms`.

**Fix.** The four `RoomDetail` picker sources and `RecordForm`'s `checkboxList` build a
`recordLabels` map per list; `ChipList` takes the prepared map. **Regression test:**
`no-raw-ids.test.tsx > numbers unnamed siblings apart on the PICKER surfaces too`.
**Mutation-checked** — reverting the `RecordForm` half fails exactly that test and nothing else.

## 🤝 Disagreements

`code-reviewer` examined the fork ordering and reported it **correct**, having traced the
board-then-room axis (`takenIds` sees the forked board because the room fork is passed
`boardResult.source`) — which is true, and is not the axis codex found. The two voices did not
contradict each other; they read different orderings of the same function. Recorded because a
"no finding" on a function another voice found a P1 in is worth being able to see later.

`code-reviewer` additionally cleared, with tracing: `deepEqual` under `exactOptionalPropertyTypes`
(independently corroborated here — a JSON round trip changes **0** of the bundle's records, so
`isPristineOfficial` holds after a save/reload); `Edit`'s `ownHidden` fallback (unreachable on the
real render path, since `App` always supplies the props); `LoadoutSection`'s side-scoped
`chosenHere`; and the `Home`/`App` all-hidden fallback agreement.

## 🧊 Cross-model findings (frozen @ round 1)

```yaml
frozen_at_round: 1
models: [codex]
findings:
  - id: e76676f88b09d1ae
    source: codex
    severity: P1
    file: src/ui/RoomDetail.tsx
    line: 488
    summary: >-
      Renaming an official room and changing its rules in the same save renames both the
      original and the fork.
    evidence: >-
      The room name is written to the original key in `base` before `forkOnEdit` runs; the fork
      then resolves that already-overridden key and copies the same new value to the fork key.
      `RecordForm.prepared()` forks first and folds typed text into the fork's key afterward.
    needs_relaxation: false
    disposition: accepted
    oracle_result: >-
      Purpose-written vitest: renamed shipped preset.ours + toggled a piece, saved once;
      preset.ours.name became the child's new name, matching the finding.
    status: resolved
  - id: e1329d4b17ddbc66
    source: codex
    severity: P2
    file: tests/ui/hidden-pickers.test.tsx
    line: 194
    summary: >-
      The loadout exemption test uses a document the product cannot load, so the assertion can
      pass through a state unreachable from a successfully loaded room.
    evidence: >-
      The test adds a `loadout` to `preset.other` but omits the schema-required `loadoutBudget`.
      Unlike the file's base-fixture test, this mutated fixture is never checked with
      `loadContentSet`.
    needs_relaxation: false
    disposition: accepted
    oracle_result: >-
      Real loadContentSet run on the test's mutated fixture: loads=false, error
      'loadout requires loadoutBudget' at preset.other.loadoutBudget.
    status: resolved
```

**Oracle provenance — a harness gap worth recording.** `hm second_opinion_oracle` runs
`pytest` / `ruff` / `mypy`. This is a TypeScript project, so it emitted ~2 MB of Python syntax
errors against `.tsx` files and produced **no usable signal for any finding**. Injecting that
would have been noise, and reporting "no oracle gathered" would have degraded both findings to
`unresolved` — the silent all-`unresolved` failure the skill itself warns about, arriving through
the language rather than through a path filter. The oracles above were built instead with the
project's own tools (vitest, and `loadContentSet` driven from `tsx`), and their provenance was
stated in the mode-B call so the verifier could weigh it.

## Review Iteration Summary

| Iteration | Grade | Fixes Applied | Remaining | New |
|-----------|-------|---------------|-----------|-----|
| 1 (init)  | A     | 3 (manual, verified) | 0 | 0 |

Final grade: **A**
Iterations used: 1 / 2
Exit reason: converged
Status: **APPROVED**
human_review_needed: **true**
Counters (see §5): unreviewed 3 · prior-fix 0 · unattributed 0

`unreviewed 3` is the honest number: the three fixes were applied in the terminal round and no
reviewer has read them. Two carry mutation-checked regression tests; the third (the P1) carries
the oracle that found it, promoted verbatim into the suite.

## Verification after the fixes

`npm run typecheck` clean · `npx vitest run` **1304/1304**.

`npx playwright test`: the first post-fix run reported **393/394** with one
`expect(locator).toBeVisible()` timeout; the re-run was **394/394** with no code change in
between, so it was a timing flake rather than a regression. Recorded rather than reported as a
clean sweep — a flake seen once is a flake that will be seen again, and the next person to meet
it should know it predates their change.
