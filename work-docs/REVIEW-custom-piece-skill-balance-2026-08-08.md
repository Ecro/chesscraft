---
type: review
task_slug: custom-piece-skill-balance
status: APPROVED
created: 2026-08-08
reviewers_invoked: [code-reviewer, codex]
consensus_method: single + cross-model voter
drift_verdict:
  result: clean
  scope_violations: []
  scenario_misses: []
  task_slug: custom-piece-skill-balance
  computed_at: 2026-08-08T02:30:00Z
---

# REVIEW — custom-piece-skill-balance

## 🎯 Round 1 Summary

**Grade: B** (0 × P0, 1 × consensus-passed P1). Threshold is B, so the letter cleared — but
`unverified_severe` was TRUE (two manual-only P1s from the cross-model voter), and **all five
findings were real**, so every one was fixed rather than filed.

The diff classified `is_high: true` (28 files, +2772 lines, `src/content/schema.ts` on a
contract path), so the `codex` cross-model voter ran per the ADR-003 Side-preset gate. It
returned `status: invoked` with four findings; `code-reviewer` returned two, one of which
overlapped a codex finding at a deeper level.

## 🔍 Drift Findings

None. Every changed file is inside a PLAN phase scope, and the one phase not completed
(Phase 6) is documented as PARTIAL with its blocker named before this review ran, not after.

Two files are outside any phase's literal scope list and are accepted as necessary wiring
rather than drift: `vite.config.ts` and `tsconfig.json` gained the `@balance` path alias that
Phase 2's new module requires.

## ✅ Consensus Findings

### P1 — the measurement's two arms differed in more than the thing being measured

`src/balance/measure.ts` (`armsFor`). Reported by both voices, from opposite ends:

- **`code-reviewer`** traced the deeper half: `pickDistinct` (`rng.ts:42-50`) indexes with
  `Math.floor(rng() * pool.length)`, and the skill arm's pool was exactly one card longer than
  its control's. Different length → different index arithmetic from the *first* draw → white's
  whole three-card opening hand differed between arms. The paired difference therefore stopped
  cancelling, and `everChanged` read true for every skill card whether or not the card did
  anything — destroying the inert/gentle discrimination `classify()` exists for.
- **`codex`** found the other half: the control arm was the *untouched* preset, so a room that
  already carried a white loadout was measured as "candidate instead of the existing loadout"
  rather than "candidate versus the baseline", and a preset whose slot already held the
  candidate measured 0 ± 0.

Both are the same defect: **the control was not a control.** This is the third time this axis
has been wrong, and the second time it was wrong while the suite was green.

**Fix.** `armsFor` now gives BOTH arms an explicit white loadout (black stripped), and withholds
the reference card *and* the card under measurement from the shared pool, so both arms deal a
pool of identical length and composition. A `Baseline { presetId, referencePieceId,
referenceSkillCardId }` makes the skill axis symmetric with the piece axis: every piece is graded
as a replacement for the reference piece, every card as an alternative to the reference card.

**Evidence the fix works, not just compiles.** At 600 seeds the skill-card standard error fell
from ~4.2pp to ~1.0pp — the ~4× drop a removed confound predicts — and both reference records now
measure exactly `0.00 ± 0.00` with `everChanged === false`, which is only reachable when the arms
are genuinely identical.

## ⚠️ Weak Consensus

### P1 / P2 — a loadout card that the room also deals

`src/engine/loadout.ts:29-37`. Both voices flagged it, at different severities (codex P1,
`code-reviewer` P2, the latter explicitly unsure whether it was intended), so per the
severity-tier rule they do not merge.

`skillPoolFor` returns the shared pool unchanged when the loadout card is already a member. Both
sides read that same shared list, so a card one side "brought" as its own is dealt to the
opponent too — silently, and only in rooms that happen to double-list it.

**Fix, and why it is in the loader rather than in `skillPoolFor`.** Stripping the card from the
*other* side's pool would punish that player for a choice they did not make. The configuration is
simply contradictory, so `load.ts` refuses it with a located error: a loadout card may not also
be in the room's shared pool.

## 📝 Manual-Only Findings

Both single-source (`codex`), both real, both fixed.

### P1 — the grade cache key omitted the measurement context

`src/balance/cache.ts`. `keyForRecord` hashed the record alone, but a measured delta depends on
the preset, the replacement target and the seed count as well: the same piece graded against a
pawn and against a queen produces different numbers under one key, and `gradeMapFor` would hand
back whichever was written last.

**Fix.** `GradeContext` (the baseline, the seed count, and a `MEASUREMENT_REVISION` constant) is
hashed together with the record. The revision field also answers codex's second point — a change
to how the engine measures now invalidates every stored grade instead of leaving answers to a
question nobody is asking.

### P2 — a zero or negative seed count returned NaN as a success

`src/balance/measure.ts`. With no samples, `paired` computed `0 / 0` and returned
`{ ok: true, delta: NaN }`, which `runGradeJob` would have written into the cache as a grade.

**Fix.** `measureRecord` refuses anything that is not an integer ≥ 2, with the reason stated.
"Measured, and the answer is not a number" is not a state any consumer can act on.

## 🤝 Disagreements

One, recorded rather than averaged: the shared-pool overlap was P1 to `codex` (a leak) and P2 to
`code-reviewer` (possibly intended room-author behaviour, flagged as informational). Both takes
are reasonable — the schema never promised exclusivity. The fix resolves it by making the
document say which one it is, instead of leaving the behaviour to depend on how the room was
written.

## 🧊 Cross-model findings (frozen @ round 1)

| id | model | severity | file | disposition | outcome |
|---|---|---|---|---|---|
| 8a86e99510dba261 | codex | P1 | src/balance/measure.ts:173 | accepted | fixed (merged with the reviewer's deeper finding) |
| b2b605326fa486e3 | codex | P2 | src/balance/measure.ts:193 | accepted | fixed |
| 3f319c3db79410f5 | codex | P1 | src/engine/loadout.ts:36 | accepted | fixed |
| c25ee9ca0e89bf7c | codex | P1 | src/balance/cache.ts:121 | accepted | fixed |

`status: invoked`, `reason: null`. Nothing refuted; every finding survived checking against the
source and none was a false positive.

## 📌 A finding the review produced that is not a defect

PLAN Phase 3 exit criterion 2 asked the fitted predictor to agree with the measurement on ≥80% of
bundled records. Re-measuring after the fix showed it cannot, and the reason is substantive rather
than a tuning problem:

```
piece.archer  delta = +20.08   attacked squares N =  2.67
piece.queen   delta =  +8.50   attacked squares N = 16.11
piece.rook    delta =  +2.33   attacked squares N = 10.00
piece.knight  delta =  +4.58   attacked squares N =  4.44
piece.pawn    delta =   0.00   attacked squares N =  1.39
```

The published jumper estimate `33N + 0.69N²` does not order this game's pieces at all — the
strongest piece has nearly the smallest attacked-square count, because the archer captures at
range without moving and a square count cannot see that. **PLAN R-4 named this outcome in advance
and named the remedy**, so it is taken: the predictor is demoted to a hint, and the test reports
its band agreement instead of gating on a threshold. Bending the assertion to fit would have
produced a green suite around a predictor that is wrong about the strongest piece in the game.

## 🔁 Round 2 — the fixes reviewed

`code-reviewer` re-read the fix diff end to end. Fixes 1, 2, 3 and 5 were confirmed correct, with
the pool composition and length walked for both candidate kinds and for the candidate-is-the-
reference case. Two new findings, both in fix 4, both real and both fixed:

### P1 — the cache key hashed its inputs by ID, so editing a reference or the room left every
### other grade looking current

`src/balance/cache.ts`. `GradeContext` carried `presetId`, `referencePieceId` and
`referenceSkillCardId` as bare strings. But `armsFor` reads their *definitions* — the reference
piece's movement builds the control's placements, and the preset's board and rule-card pool drive
every `playOut`. An id survives an edit, so rewriting `piece.pawn` (the piece every other piece is
graded against) or changing the room's board left every other record's key unmoved and its cached
delta silently stale.

Worse than the bug: **the module's own docstring claimed this was impossible** — "editing a record
changes its key … there is no path where an edited record keeps the grade its previous version
earned." There was such a path, and the comment was standing where the safeguard should have been.
That is `[fail:design] comment-claims-unbuilt-safeguard` (count:3), committed in the same file
whose comments warn about the neighbouring failure class.

**Fix.** `keyForRecord` resolves and hashes the reference piece, the reference skill card, the
preset and its board **by value**. Six new tests each edit something *other* than the record being
keyed — the reference piece, the reference card, the room's rule pool, the board, the seed count —
and require the key to move; a sixth requires it to stay put when nothing moved, so the group
cannot pass by hashing everything into noise.

### P2 — `GradeContext.replaces` was declared and set by nobody

The declared-but-inert shape, count:5 in this repo, written by me into a file whose comments cite
that exact failure. `measureAll` always fixes `replaces` to the reference piece, so the field was
always undefined and a no-op in the hash — and the next caller to wire it without updating the key's
call sites would have re-created the stale-grade path the P1 above just closed.

**Fix.** Removed. It comes back when a caller needs it, with its reader.

## Review Iteration Summary

| Iteration | Grade | Fixes Applied | Remaining | New |
|-----------|-------|---------------|-----------|-----|
| 1 (init)  | B     | —             | 5         | —   |
| 2         | B     | 5             | 0         | 2   |
| 3         | A     | 2             | 0         | 0   |

Final grade: **A**
Iterations used: 2 / 2 (round 3 is the verification of round 2's fixes, not a new review round)
Exit reason: converged
Status: APPROVED
human_review_needed: false

Verification after all seven fixes: `npx vitest run` **560/560 green** (up from 546 — fourteen new
regression tests, each encoding one finding), `npx tsc --noEmit` clean, `npm run build` clean.

**One honest limitation:** round 2's two fixes were verified by the suite and by purpose-built
regression tests, not by a third reviewer dispatch. The round cap is 2.

Counters: unreviewed 0 · prior-fix 0 · unattributed 0
