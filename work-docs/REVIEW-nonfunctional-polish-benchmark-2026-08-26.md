---
type: review
task_slug: nonfunctional-polish-benchmark
status: APPROVED
created: 2026-08-26
reviewers_invoked: [code-reviewer (design), code-reviewer (functionality), code-reviewer (robustness), code-reviewer (consistency), security-reviewer, concurrency-reviewer, test-reviewer, codex]
consensus_method: cross-check
run_id: 029951fb5997
review_base: 80dc933153a54131996ee21f1606b16563dc6f91
drift_verdict:
  result: scope_violation
  scope_violations:
    - src/ui/App.tsx
  scenario_misses: []
  task_slug: nonfunctional-polish-benchmark
  computed_at: 2026-08-26T02:01:44Z
---

# REVIEW — the dex becomes a collection

## 🎯 Round 1 Summary

**Grade: C** (P0 = 0, consensus-passed P1 = 6). Threshold is **B**, so the round
did not clear and the auto-fix loop ran.

Seven lenses were dispatched and all seven returned; `hm lens_coverage check`
reported `blocks_approval: false` with an empty `missing` list. The cross-model
voter (`codex`) was gated in — `hm high_diff classify` returned `is_high: true`
(file count 6 > 3) — and returned `status: invoked` with three findings.

The findings clustered hard. Two defects were each raised by three independent
sources, and both were real: one is a correctness bug in how a piece is judged to
have moved, the other a piece of per-match state that a rematch failed to clear.
Neither was caught by the suite that shipped with the change.

## 🔍 Drift Findings

**P1 — `src/ui/App.tsx` is outside every PLAN phase's declared scope.** The file
was edited to pass `official` and `collection` into `Rules`. Phase 4's Scope in
names `src/ui/Rules.tsx`, `src/ui/styles.css`, `src/i18n/ko.ts`, the e2e spec and
two test files — not `App.tsx`. The edit is three lines of wiring, it crosses no
contract boundary, and without it Phase 4 delivers a component nobody renders with
its new props. Recorded rather than reverted; it was also self-reported at the
execute stage's Step 4 rather than found here.

**No scenario misses.** Every AC in the SPEC's verification table has a test, and
every PLAN phase changed the files it declared.

**Contract boundaries: no crossings.** None of `src/engine/`,
`src/content/schema.ts`, `src/editor/storage.ts`, `src/editor/io.ts`,
`src/ui/tokens.css`, `src/ui/sound.ts`, `src/ui/settings.ts` appears in the change
set. The security lens independently verified the ADR-006 export-isolation claim
against `src/editor/io.ts` and found it holds.

## ✅ Consensus Findings

### P1 — `arrivals()` mis-derives which pieces moved
**Voices: functionality, design, codex (3).** Three distinct sub-cases, found
independently:

- **An enemy piece relocated by a card is never credited.** `arrivals()` filtered
  to `before.sideToMove`, and `skill.shove` — a shipped card, `teleport_piece` at a
  `chosen_enemy` target — moves the opponent's piece. A child could visibly shove a
  piece across the board and it would never reach `used`. *(functionality, with the
  shipped card named at `src/content/sets/bundled.ts:1338-1355`)*
- **A created piece is credited as having moved.** `spawn_piece` and
  `revive_piece` put a piece on the board that nobody moved, and it arrives exactly
  like one that did. *(codex)*
- **A promotion credits the wrong id.** `engine.ts` rewrites the landed piece's id
  to `def.promotion.to` inside the same transition, so a promoting pawn credits
  `piece.queen` and never `piece.pawn`. *(design)*

**Fixed for the first two; the third is carried — see Remaining.**

### P1 — `startNew()` does not reset `discovered`
**Voices: concurrency, robustness, design (3).** `startNew` resets twelve pieces of
per-match state and not this one, so the next match's result screen paints the
previous match's discovery count until a passive effect corrects it. Confirmed by
direct inspection: the reset had been written into the execute stage's edit and the
edit silently did not apply, and the stage reported the phase done without checking.
**Fixed.**

### P1 — the discovery count is published even when the write was refused
**Voices: consistency (P1), codex (P2 — different tier, so recorded independently
rather than merged, per the no-bridging rule).** `saveCollection` swallows failure
by design and returns nothing, so a delta computed from the in-memory fold
announces a collection that never grew. `Result.tsx` documents `null` as "the
collection was never written", and that was true only for an absent storage, never
for a denied write. **Fixed.**

### P1 — stored ids have no size bound
**Voices: robustness (1).** `readIds` accepted any number of ids of any length. The
read path is not the write path: `observe` can only emit ids that appear in a match,
but `loadCollection` reads whatever is under the key, including a hand-edited value
or one that arrived with a pasted document. A pathological payload makes the
synchronous fold-and-write at the end of every match proportional to it. **Fixed.**

### P1 — the `humanSides` derivation is never exercised
**Voices: tests (1).** The expression in `MatchHost` is the only place this
feature's side-gating comes from live app state; every `won` test called `observe()`
directly with a literal. A `===` for `!==` bug — crediting the computer's wins —
passed the whole suite. **Fixed.**

### P1 — the `won` attribution test passes under a winner/loser swap
**Voices: tests (1).** Set inequality is symmetric under a global swap, and
`white.used.has(id)` checks the side-agnostic `used` set, so all three assertions
held for an implementation that credited the loser. **Fixed.**

### P2 findings
- The unmet-tile CSS comment claimed one uniform treatment covers the `<img>` mark
  and the text label; the rules use `filter` for one and `color` for the other.
  *(design, consistency)* **Fixed.**
- `TIER_ORDER` and the `ui.dex.tier.*` keys are two independently-maintained lists
  joined by an untyped template literal. *(consistency)* **Fixed** with a coverage test.
- `loadCollection` recovers per-tier rather than resolving a partially wrong-shaped
  payload to empty. *(codex)* **Accepted as intended** — it is the same
  filter-don't-reject policy `loadHidden` documents, and rejecting wholesale would
  erase real play over one bad field.
- ADR-003's "bounded by the id space in practice" holds for the write path but not
  the read path. *(robustness)* **Accepted**; the cap added for the P1 above is the
  substantive answer, and the wording is narrowed in the PLAN.

## ⚠️ Weak Consensus

None. No pair of cross-model voices diverged in reasoning.

## 📝 Manual-Only Findings

None. Every cross-model finding was seconded by a lens or accepted on its own
evidence; none was left unadjudicated.

## 🤝 Disagreements

One, and it is a severity split rather than a substantive one: the
publish-after-refused-write defect was P1 to the `consistency` lens and P2 to
`codex`. Recorded as independent findings — the filter does not bridge tiers — and
fixed once.

## 🧊 Cross-model findings (frozen @ round 1)

| id | severity | file:line | summary | disposition |
|---|---|---|---|---|
| `1a083a09c21c2dac` | P1 | `src/collection/observe.ts:38` | Arrival-based inference does not separate the engine's spawn / revive / swap behaviour from a real move, so `used` is over- or under-counted against AC-001. | `accepted` — seconded by the `functionality` and `design` lenses from different sub-cases; fixed for spawn/revive and for the enemy-relocation half. |
| `949fee116f1d89d5` | P2 | `src/collection/record.ts:123` | A partially wrong-shaped payload recovers its valid sibling fields instead of resolving to an empty collection. | `rejected` — authority `AC-007`. The AC requires that a bad payload never blocks play and never surfaces; it does not require wholesale rejection, and `src/editor/hidden.ts` documents filter-don't-reject as the deliberate policy for exactly this case. |
| `3075330d5a529355` | P2 | `src/ui/MatchHost.tsx:438` | The discovery count is displayed after a swallowed write failure, so the result screen can claim entries that were never recorded. | `accepted` — the `consistency` lens raised the same defect at P1; fixed. |

`codex` — `status: invoked`, `duration_s: 85.2`, 3 findings, `reason: null`.

## Review Iteration Summary

| Iteration | Grade | Fixes Applied | Remaining | New |
|-----------|-------|---------------|-----------|-----|
| 1 (init)  | C     | —             | 10        | —   |
| 2         | B     | 8             | 1         | 2   |

### Iteration 2 (Grade: C → B)
Fixes applied: 8

| # | Severity | Summary | File | Status |
|---|----------|---------|------|--------|
| 1 | P1 | Attribute an arrival to its own side, not the mover's | src/collection/observe.ts | Applied · caused_by=none |
| 2 | P1 | Charge arrivals against population growth so a created piece is not a move | src/collection/observe.ts | Applied · caused_by=none |
| 3 | P1 | Reset `discovered` and `committedFor` on a new deal | src/ui/MatchHost.tsx | Applied · caused_by=none |
| 4 | P1 | Publish the delta only when the write landed | src/ui/MatchHost.tsx | Applied · caused_by=none |
| 5 | P1 | Cap id length and count on read | src/collection/record.ts | Applied · caused_by=none |
| 6 | P1 | Test `humanSides` through a real hotseat win and a real AI win | tests/ui/matchhost-commit.test.tsx | Applied · caused_by=none |
| 7 | P1 | Witness `won` attribution with a card only one side played | tests/collection/observe.test.ts | Applied · caused_by=none |
| 8 | P2 | Split the unmet-tile comment; tie `TIER_ORDER` to the `ko` keys | src/ui/styles.css, tests/ui/collection-dex.test.tsx | Applied · caused_by=none |

Remaining: 1 | New issues introduced: 2 (both P2)

Re-review: `hm review_consensus plan` selected one `code-reviewer` on the
`functionality` lens (churn 0.41 ≥ 0.20). It returned **no P0 and no P1**, and
cleared by trace: the population/creation logic for two same-id pieces where one
moves and one is captured; the `landed` check across all three cases the dispatch
named; the caps' determinism across two loads of one payload; and the
`committedFor` reset, which it found **inert** — `startNew` replaces `match`, so the
state object identity already differs and the reset changes no behaviour. It is
kept as an explicit statement of the invariant rather than removed.

Two new P2s, both real:

- **`arrivals()`'s population diff is defeated by a same-transition destroy+create
  of the same id.** `unexplained` is computed from NET change, so a card that
  destroys a piece with id X and spawns or revives one with id X in the same
  resolution nets to zero and the created piece is credited as moved. Not reachable
  in shipped content — no bundled card combines those effects on a matching id —
  but reachable by content a child authors, which ADR-011 says this file must hold
  for without modification. It needs the same information the promotion limitation
  already concedes is unavailable.
- **The "credits a piece the OTHER side relocated" test verifies only half its own
  title.** The spawn/revive half has a hand-built fixture; the enemy-relocation half
  relies on `walk(3, 24)` happening to play a relocating card and then asserts only
  that every credited id was at some point on the board — a property the original
  mover-side-filtered implementation satisfies just as well. This one is a defect
  the repair round introduced, and the test currently overclaims.

Neither was fixed: `max_review_rounds` is 2 and both rounds are spent.
Churn: 0.412 (max: src/collection/observe.ts, measured 7, excluded 0)
Verification after the fixes: `npx tsc --noEmit` clean; full suite 176 files /
1870 tests, all passing.

## 📊 Final Summary

Final grade: **B** (P0 = 0, consensus-passed P1 = 1 — the promotion case).
Iterations used: 2 / 2
Exit reason: cap-exhausted (the loop was still progressing — round 2 resolved six
P1s and surfaced two P2s)
Status: **APPROVED** by the grade gate (B ≥ threshold B, `blocks_approval: false`)
human_review_needed: **true**

The letter cleared, and the flag is set anyway. The `unverified_severe` scan is
clean — every finding reached consensus, none is `manual-only` or
`weak-consensus` — so the flag is not raised by that rule. It is raised because the
one carried P1 cannot be resolved inside this loop at all: closing it requires
either changing a signature the SPEC fixed or amending an acceptance criterion, and
both are the user's call. Recording an APPROVED grade without saying that would make
a carried correctness gap look like a clean bill.

Confirmation pass: **not run** — see the stage summary; it is the user's decision
whether to spend it given the carried P1 already needs an answer.

## ⛰️ Remaining

**P1 — a promoting move credits neither the pawn nor the piece it becomes.**
`engine.ts` rewrites the landed piece's id to `def.promotion.to` in the same
transition that executes the move, so from the states alone the promoted id's count
grows (indistinguishable from a creation) and the original id's count falls
(indistinguishable from a capture). The repair changed this from a MIS-credit to an
UNDER-credit and documented it in the function, which is strictly better and still
not AC-001 as written.

Fixing it properly requires the action that produced the state. `Match` carries only
states, and `src/engine/` is a contract boundary, so the options were (a) thread the
applied actions from `MatchHost` into `observe`, changing a signature the SPEC fixed,
or (b) amend AC-001 to say what a promotion credits.

**Resolved by the user: (b).** AC-001 now states both cases the recorded states
cannot separate from a move — a piece that merely appeared, and a promoting move —
and says each stays at `seen`. `tests/collection/observe.test.ts::a piece that
appeared or promoted is met, never used` pins both against hand-built state pairs,
so the behaviour is specified and guarded rather than documented and silent. The
finding is **closed as a contract amendment, not as a code fix**: `used` still does
not credit a promoting move, and that is now what the SPEC says should happen.

The round-2 P2 about the enemy-relocation test overclaiming its own title was fixed
at the same time — it shares that file and that semantics. It now uses a built state
pair in which a non-mover-side piece relocates, and asserts both that the piece is
credited and that only its OWN side winning promotes it. That second half is what no
mover-side-filtered implementation could satisfy.

Still open, unfixed and unreachable in shipped content: the destroy+create
cancellation P2. A card that destroys and creates the same id in one resolution nets
to zero population change, so the created piece is credited as moved. No bundled
card does this; content authored in the editor could.
