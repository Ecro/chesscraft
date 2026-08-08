---
type: review
task_slug: preset-content-expansion
status: APPROVED
created: 2026-08-08
reviewers_invoked: [stage-orchestrator-self-review, codex]
consensus_method: single + cross-model second opinion
grade: B
human_review_needed: false
drift_verdict:
  result: scope_violation
  scope_violations:
    - tsconfig.json
    - vitest.config.ts
    - tests/content/art-key.test.ts
    - tests/content/bundled.test.ts
    - tests/ui/loadout-ui.test.tsx
    - scripts/spare-sprites.ts
    - scripts/run-spare-sprites.ts
    - tests/engine/square-liveness.test.ts
  scenario_misses: []
  task_slug: preset-content-expansion
  computed_at: 2026-08-08T00:00:00Z
---

# REVIEW — preset-content-expansion (2026-08-08)

## 🎯 Round 1 Summary

**Grade: B** (0 consensus-passed P0, 1 consensus-passed P1). Threshold is B → **APPROVED**.

| | |
|---|---|
| Findings raised | 6 (all from the cross-model second opinion) |
| Confirmed after verification | 6 |
| Fixed in this round | 5 |
| Left open, documented | 1 (P1, pre-existing engine gap) |
| Suite after fixes | **742 tests / 80 files passing**, `tsc --noEmit` clean |

**The reviewer set is thinner than it looks — read this before trusting the grade.**
`harness.yaml` configures `consensus: single` with `code-reviewer` installed, but
this session carries a standing instruction not to invoke subagents unless the
user asks. The Claude-side review was therefore done by the stage orchestrator —
**the same context that wrote the code**. A self-review is structurally weak on
exactly the defects that come from the author's own assumptions, and that is not
a hypothetical here: **every finding in this document came from `codex`, not from
the self-review.** The self-review's contribution was verification — driving each
report against the engine rather than accepting or dismissing it — which is worth
something, but it found nothing on its own.

## 🔍 Drift Findings

**Result: `scope_violation`** — eight files changed that no PLAN phase named. All
eight are test or config files supporting the phases that *were* named, and each
is explained below. None is product code outside scope; `src/` changes are
confined to the four files the PLAN listed.

| File | Why it changed |
|---|---|
| `tsconfig.json` | `scripts/` added to `include` so the committed generator is typechecked; it produces committed source and was previously unchecked |
| `vitest.config.ts` | `testTimeout` 5s → 20s (see the Execution Record in the PLAN) |
| `tests/content/art-key.test.ts` | AC-008's unclaimed-per-surface census had to live beside the other catalogue checks |
| `tests/content/bundled.test.ts` | AC-004 / AC-005 / AC-006, plus generalising two invariants that encoded "there is one room" |
| `tests/ui/loadout-ui.test.tsx` | its empty-state premise became unreachable from the shipped set; the fixture now builds the room that makes the branch reachable |
| `scripts/spare-sprites.ts`, `scripts/run-spare-sprites.ts` | the candidate data and the runner; the PLAN named only `scripts/gen-sprites.*` |
| `tests/engine/square-liveness.test.ts` | **new, and the direct result of finding F3** — the square types had no survey at all |

## ✅ Consensus Findings

Every finding below was raised by `codex` and independently confirmed by driving
the engine before being acted on. Confirmations are cited to what was run, not to
what was read.

### F1 · P1 · `skill.blink` was offered where it could do nothing — FIXED

`cardResolves` validates `own_back_rank` destinations and nothing else, so a card
whose destination is an `offset` is offered for **every** friendly piece —
including one whose destination is off the board.

**Confirmed by driving it.** A rook on c5 holding `skill.blink`: the play is
offered, the play is legal, the rook is still on c5 afterwards, and
`drafts.white.used` records the card as spent. A wasted turn *and* a dead card.

**Not a new engine defect** — shipped `skill.shove` has carried the same shape
since the original set — but it was a new *instance* of one. Fixed in content:
`skill.blink` now grants a two-square straight leap (`grant_movement`, duration 3)
instead of teleporting. A grant always resolves. `tests/engine/card-liveness.test.ts`
now asserts which piece received the grant and that the reach is real.

### F2 · P1 · `skill.brand` is offered on non-pawns — OPEN, deliberately

`candidatesFor(state, 'friendly')` derives its options from the action's target
kind and never applies the effect's `condition`. So a card gated on
`piece_is: piece.pawn` is offered for every friendly piece, and choosing a rook
consumes the card and does nothing.

**Confirmed** by reading `cardPlays` → `choiceSlots` → `candidatesFor`
(`src/engine/engine.ts:242-343`): the condition is evaluated at execution, after
the choice is already made.

**Left open on purpose, and this is the one thing to look at before merge.**
Shipped `skill.coronation` has the identical shape (`piece_is: piece.pawn` +
`chosen_friendly`, `bundled.ts:777`), so the real fix is filtering candidates by
the effect's condition — an engine change, which **ADR-001 put out of scope** for
this task. The two content-only alternatives were both worse: dropping the
condition lets a player turn their queen into a lancer, and this game is aimed at
a nine-year-old. Recommended as its own unit, where it fixes `coronation` too.

### F3 · P1 · `square.geyser` fires and changes nothing at the opening — MITIGATED

`teleport_piece … own_back_rank` resolves through a vacancy lookup that returns
null on a full rank, and execution then continues silently. **Every room starts
with a full home rank.**

**Confirmed by driving it.** A pawn stepping onto b3 of `board.cavalry` logs
`on_enter:square:square.geyser` and is still standing on b3. This is the
`rule.blood-toll` shape from `[fail:design] declared-but-inert-vocabulary`, in
new content, and **the card-only AC-013 survey was structurally unable to see it
— the SPEC's criterion says "every new card".**

Two changes, neither of which pretends the behaviour is gone:
1. The player-facing text now states the condition ("끝줄에 빈 칸이 있으면 …
   가득 차 있으면 아무 일도 일어나지 않는다"). The memory entry's own rule is that
   a safe-looking default is what makes the failure invisible; naming it in the
   text is the remedy available to content, since a square effect has no
   `cardResolves` to gate it.
2. **`tests/engine/square-liveness.test.ts` is new** — all 8 square types driven,
   with both geyser branches pinned, and a coverage assertion so the next square
   type cannot be added without one.

### F4 · P2 · The new live probes were weaker than their names — FIXED

`skill()` accepts a card when *any* legal play changes *anything* in `observe`.
A Blink that moved sideways, a Brand that produced the wrong piece, or a grant
with the wrong pattern all passed. Five exact-result assertions added
(`brand` → lancer, `echo` → +1 own piece and captured unchanged, `blink` → the
chosen piece gains the leap, `tide` → sideways reach, `quake` → the enemy moved
and the mover's own rook did not).

### F5 · P2 · The generator never read `Candidate.surface` — FIXED

`generate` took `backgrounds` and `tints` from its caller, so which backgrounds a
mark must clear — and that a **piece** is drawn in *both* army tints — was a
convention the caller could get wrong rather than an invariant the generator
held. ADR-005 promises the generator refuses what the suite refuses; it did not.

`GenerateContext` now takes a `token(name)` resolver and `generate` derives both
from `gates.SURFACES[candidate.surface]`. The runner was simplified accordingly.

### F6 · P3 · The generator tests reinforced F5 — FIXED

They supplied colours directly, so an implementation ignoring `surface` passed.
Two tests added that fail against the old version: a card sprite legible only on
the light *board* tone is rejected, and a `$`-only piece sprite is rejected
because it cannot separate in the dark tint.

## ⚠️ Weak Consensus

None.

## 📝 Manual-Only Findings

None. F2 is consensus-passed and open by decision, not manual-only.

## 🤝 Disagreements

None. The self-review confirmed all six reports; the only divergence from codex
was on remedy for F2 and F3, where codex proposed engine changes and this review
took the content-level mitigation ADR-001 leaves available, recording the residue.

## 🧊 Cross-model findings (frozen @ round 1)

| id | model | severity | file | disposition | outcome |
|---|---|---|---|---|---|
| 43aed9ae77b2681c | codex | P1 | `src/content/sets/bundled.ts` (skill.blink) | accepted | fixed |
| 9c5a715714a272d5 | codex | P1 | `src/content/sets/bundled.ts` (skill.brand) | accepted | open — pre-existing, out of ADR-001 scope |
| 327a5c0f5155713d | codex | P1 | `src/content/sets/bundled.ts` (square.geyser) | accepted | mitigated + surveyed |
| 7d9fcb21c9736946 | codex | P2 | `tests/engine/card-liveness.test.ts` | accepted | fixed |
| 58a57aca0e7ac70a | codex | P2 | `scripts/gen-sprites.ts` | accepted | fixed |
| 44448278adb6aed9 | codex | P3 | `tests/ui/sprite-generator.test.ts` | accepted | fixed |

`second_opinion_results`: `[{model: codex, status: invoked, reason: null}]`.
Gate: Side preset, high-diff required — `hm high_diff classify` returned
`{"is_high": true, "reasons": ["file count 22 > 3", "added lines 5314 >= 400"]}`.

## Review Iteration Summary

| Iteration | Grade | Fixes Applied | Remaining | New |
|-----------|-------|---------------|-----------|-----|
| 1 (init)  | B     | 5             | 1         | —   |

Final grade: **B**
Iterations used: 1 / 2
Exit reason: converged
Status: **APPROVED**
human_review_needed: false
Counters: unreviewed 0 · prior-fix 0 · unattributed 0

**Two things a human should still weigh**, neither of which the grade expresses:
the Claude-side voice was a self-review by the code's own author (see Round 1
Summary), and **F2 remains open** — a shipped card and a new one both offer plays
that silently do nothing when the player picks the wrong piece.
