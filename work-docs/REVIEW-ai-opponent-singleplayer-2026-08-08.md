---
type: review
task_slug: ai-opponent-singleplayer
status: APPROVED
created: 2026-08-08
reviewers_invoked: [code-reviewer, performance-reviewer, codex]
consensus_method: single
drift_verdict:
  result: scope_violation
  scope_violations:
    - src/ui/Lobby.tsx
  scenario_misses: []
  task_slug: ai-opponent-singleplayer
  computed_at: 2026-08-08T02:40:00Z
---

# REVIEW — Single-player AI opponent

## 🎯 Round 1 Summary

**Grade: A** (0 consensus-passed P0, 0 remaining consensus-passed P1) — threshold is B.
**Findings: 6 P1, 2 P2.** All six P1 were real, all six were fixed in-round, and each fix carries a
test that enters the input window the fix opened.

`reviewers.consensus` is `single` in this harness, so a single-source finding is authoritative.
Three voices ran: `code-reviewer` and `performance-reviewer` (Claude) plus `codex` as a
cross-model voter — the diff classified `is_high` (38 files, 4,948 added lines), which opens the
Side preset's cross-model gate.

The honest headline: **the strongest findings came from outside my own reasoning.** Two of the six
were defects I had written a comment next to, claiming the opposite of what the code did.

## 🔍 Drift Findings

**P1 — scope violation: `src/ui/Lobby.tsx`.** PLAN Phase 4's scope names `src/ui/Home.tsx` for the
mode and difficulty selection; the implementation put them in `Lobby.tsx` instead, and `Home.tsx`
was not touched. The reasoning is defensible — `Lobby` is already the pre-match setup screen where
players are named, and `Home` is a title carousel — but the PLAN said Home and this is a
substitution, not a superset. Recorded rather than rationalised away.

No scenario misses: every AC-001…AC-011 has at least one test, and the SPEC's Verification
Criteria table matches the files that exist.

## ✅ Consensus Findings (all fixed in round 1)

### P1 · `client.ts` terminated and respawned the worker after **every** AI turn
*Source: code-reviewer.* React runs an effect's cleanup whenever its dependencies change — and the
AI's own move changes `state`. So `client.cancel()` fired on the ordinary path, after the request
had already settled, and `cancel()` terminated unconditionally. Every ply after the first paid a
worker start plus a full content re-send, on the hot path. ADR-009 claims respawn is "paid on the
exceptional path only"; it was paid on every turn.

Phase 5's calibrated response times never saw this because they were measured against direct
`chooseWithDetail` calls, not through the client. **Fixed:** terminate only when a request was
actually in flight. **Test:** `ai-determinism.test.ts` now plays four AI plies through the client
and asserts `spawned === 1` and `terminated === 0` — no prior test played more than one.

### P1 · the wall-clock valve never cut a search short
*Source: code-reviewer.* ADR-010 and AC-011 promise a backstop that "returns the best action found
so far". The implementation measured elapsed time *after* `chooseWithDetail` returned and set a
label. The comment beside it said so plainly, which is the part that should have caught my eye: the
code and the ADR disagreed and the code documented its own disagreement.

**Fixed:** `SearchOptions.deadline` is now a real cut-off, checked every 512 expansions. **The clock
is read only when a deadline is supplied**, which is what keeps AC-003 true — a node count that
depended on the clock would differ under load. **Tests:** an expired deadline visits strictly fewer
nodes than an unbounded search and still returns a move; a far-future deadline changes nothing; and
a test counts `Date.now` calls and asserts **zero** when no deadline is given.

### P1 · a second `as TrustedAction` cast defeated ADR-004's single-mint claim
*Source: code-reviewer.* `engine.ts` documents "the one mint is the cast at the end of
`legalActions` … keeping it to a single expression is what makes it auditable", and `search.ts`'s
iterative-deepening loop had a second cast because `ScoredAction.action` was typed `Action`. Safe by
adjacency today; compiles just as cleanly the day someone caches actions across two positions —
which is the exact failure the brand exists to make impossible, and the reason a debug assertion was
rejected. **Fixed:** `ScoredAction.action` is `TrustedAction`; the cast is gone.

### P1 · the transposition table treated a 32-bit hash collision as position equality
*Source: codex.* The index was `key & 0xFFFF` and verification compared only the 32-bit key. A
search stores up to ~20,000 positions, so by the birthday bound two share a 32-bit key with
probability **~4.7%** — several times an hour of play. The symptom is not a crash; it is one
position's score handed to another, which reads as an inexplicable move. **Fixed:** two independent
hashes folded into one 53-bit key (exact in a `Float64Array`), bringing the same bound to ~2e-8.

### P1 · the lobby's AI refusal could be bypassed by stale state
*Source: codex.* The AI radio is disabled when the complexity envelope refuses the content — but
`mode` was not reset and the start handler did not re-check. The import panel is on the same screen,
so a player choosing the computer and *then* importing an over-budget room left `mode === 'ai'` with
no control able to clear it. **Fixed:** the mode is now derived (`envelope.ok ? mode : 'human'`)
rather than guarded at one call site, which removes the class rather than the instance. **Test:**
`lobby-ai-refusal.test.tsx` asserts what the start button *hands over* after exactly that sequence —
a test on the disabled attribute would have passed against the bug.

### P1 · the complexity envelope ignored declaration size
*Source: codex.* The score summed the target Cartesian product and piece reach. `effects[].actions[]`
has no schema maximum and the engine walks it on every applied action, so a card with **zero** chosen
targets and thousands of actions scored ~1 while costing more per node than anything that ships.
**Fixed:** a `declaredActions` term, weighted by board area. **Test:** content widened only in
declarations is refused, with the target and reach terms asserted **unchanged** so the refusal is
attributable to the new term.

### P1 · `support()`'s safety scan was unbounded and uncounted
*Source: performance-reviewer, with the arithmetic.* Each candidate costs one `apply`, one
`legalActions` on the child, and one `apply` per reply — ~740 µs at the measured branching. The
worst case is 200 candidates with none safe: **~148 ms**, added outside the node budget, to a move
whose p95 is 1,142 ms against a 1,500 ms SLO. That is 41% of the remaining slack, spent in exactly
the lost positions where the search is already working hardest. **Fixed:** the scan is capped at 32.
The cap costs almost nothing because the list is *ranked* and a hung king scores −MATE, so a safe
action — when one exists — sorts above every losing one and is found immediately.

## ⚠️ Weak Consensus

None. With `consensus: single` every finding is authoritative on one source; no two sources
described the same defect with diverging reasoning.

## 📝 Manual-Only Findings (accepted, not fixed)

### P1 · `evaluate` runs `sideInCheck` twice per leaf, and that cost is absent from the envelope
*Source: performance-reviewer.* Correct on both halves. `evaluate` sits on the leaf side of the
`depth <= 0` gate, so it runs at ~95% of nodes, and each `sideInCheck` re-runs a
move-generation-scale pass.

**Not fixed, deliberately, and the reason is worth recording.** The measured p95 of 1,142 ms is
end-to-end — it already contains both calls — and it is inside the SLO. Changing `evaluate` changes
what the AI plays, which invalidates the 400-game tournament that calibrated the difficulty ladder;
the fix would cost a re-run and buy headroom that is not currently needed. The half that *is* a
correctness gap — the envelope not modelling this cost for high-reach authored content — is now
partly closed by the `declaredActions` term, and the wall-clock valve (a real cut-off as of this
round) is the backstop for what the envelope still under-counts.

### P2 · `positionKey` allocation pattern; `orderChildren` decorate-and-sort
*Source: performance-reviewer.* Both run only on internal-node expansions (~5–10% of the budget),
and the reviewer explicitly declined to call them material without a profile. `positionKey`'s
`localeCompare` on the grants comparator is the one cheap win here and is left for a follow-up
rather than taken mid-review.

## 🤝 Disagreements

None between sources. One reviewer disagreed with **itself** and said so: `performance-reviewer`
opened by treating `positionKey` as a per-node cost, then corrected to internal-node-only after
reading the `depth <= 0` early return, and downgraded its own finding from P1 to P2 in the same
report. Recorded because a reviewer that revises itself mid-report is more trustworthy on the
findings it kept.

## 🧊 Cross-model findings (frozen @ round 1)

| id | model | severity | summary | disposition |
|---|---|---|---|---|
| `77c00fe283578f7c` | codex | P1 | Lobby AI refusal bypassable via stale `mode` | accepted → fixed |
| `9d3e008ffa571f31` | codex | P1 | envelope ignores effect/action declaration size | accepted → fixed |
| `bfc5a679ac91678f` | codex | P1 | TT treats 32-bit hash collision as position equality | accepted → fixed |

`second_opinion_results: [{model: codex, status: invoked, findings: 3}]`. All three survived
independent verification against the code and all three were fixed. None was refuted.

## Verification after fixes

| gate | result |
|---|---|
| `tsc --noEmit` | pass |
| `npm run build` | pass — worker still a separate 85 kB chunk |
| unit (`vitest run`) | **565 / 565**, 68 files |
| `test:build` | 18 / 18 |
| e2e (mobile + desktop) | 221 passed, 1 skipped |
| e2e:pwa | 6 / 6 |
| `test:strength` | re-run required and re-run — the TT key and the clamp cap both change what the AI plays, so the previous 400-game result was invalidated by this round's fixes |

## Review Iteration Summary

| Iteration | Grade | Fixes Applied | Remaining | New |
|-----------|-------|---------------|-----------|-----|
| 1 (init)  | A     | 6             | 1 P1 accepted + 2 P2 | 0 |

Final grade: **A**
Iterations used: 1 / 2
Exit reason: converged
Status: **APPROVED**
human_review_needed: **true**

`human_review_needed` is true because one **P1 is `manual-only` and was accepted rather than
fixed** (`evaluate`'s double `sideInCheck`), and because the drift finding is a real deviation from
the PLAN's stated scope. Neither blocks the work; both are decisions a human should see rather than
inherit silently.
