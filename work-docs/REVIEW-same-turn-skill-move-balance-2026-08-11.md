---
type: review
task_slug: same-turn-skill-move-balance
status: APPROVED
created: 2026-08-11
reviewers_invoked: [code-reviewer, codex]
consensus_method: cross-check
consensus_threshold: 2
grade: A
grade_threshold: B
human_review_needed: false
second_opinion_results:
  - model: codex
    status: invoked
    reason: null
drift_verdict:
  result: clean
  scope_violations: []
  scenario_misses: []
  task_slug: same-turn-skill-move-balance
  computed_at: 2026-08-11T17:30:13+09:00
---

# REVIEW — Same-turn skill and move balance

## 🎯 Round 1 Summary

- **Grade:** A (threshold B)
- **Consensus-passed:** 0
- **Weak consensus:** 0
- **Manual-only:** 4 (2 P1, 2 P2)
- **Auto-fixes:** 0. Manual-only findings are not auto-fix eligible.
- **Human review:** required because two manual-only P1 findings remain.
- **Verification:** `npm run typecheck` passed; 4 targeted files / 116 tests passed.

The letter grade is A because the grade gate counts only consensus-passed P0/P1 findings. It must not be read as defect-free: the two P1 findings below were produced by the configured code reviewer but did not receive a second matching vote.

## 🔍 Drift Findings

The implementation diff is within the PLAN's engine, content, editor, localization, UI, and test scopes. No separate SPEC exists for this task; the PLAN success criteria and scenario inventory are covered by the changed tests.

Operational note: task preflight reported that `hm/same-turn-skill-move-balance` is one commit behind `master`. The worktree is dirty, so the harness correctly refused an automatic refresh. This is base-branch drift, not PLAN scope drift.

## ✅ Consensus Findings

None.

## ⚠️ Weak Consensus

None.

## 📝 Manual-Only Findings

### P1 — `91927b73396f5d42` — Square-bound skill markers can still affect a royal later

- **Source:** `code-reviewer`
- **Location:** `src/engine/engine.ts:52`
- **Evidence:** Skill grants are consumed by square and expiry only, while `frozenUntil` is consumed by square and expiry at line 147. Execution records `layer: 'skill'`, but the consumers do not use it. A king can capture an ordinary piece frozen by the four-ply Freeze card, inherit the still-live square marker, and be frozen on its next turn.
- **Reasoning:** The royal was not the original target, so target filtering and `mayAffect` both pass. The persistent square state later changes the royal's legal movement, leaving skill-layer royal immunity incomplete. The same transfer shape applies to persistent grants.
- **Suggestion:** When consuming `frozenUntil` and grants, ignore skill-layer entries when the square's current occupant is royal. Add capture-onto-marker regressions.

### P1 — `7b8775820b2b3639` — Royal-only quantified skills are offered as spendable no-ops

- **Source:** `code-reviewer`
- **Location:** `src/engine/engine.ts:376`
- **Evidence:** `cardResolves` treats any non-empty `bindEffect` result as resolving, including royal subjects. Transition then skips every royal binding at lines 1034-1038 and still consumes the card. The new execution-backstop test currently constructs and accepts this no-op path.
- **Reasoning:** Offer generation and execution apply different royal filters. A valid authored skill quantified over kings is therefore legal and consumable even though no effect can run, contradicting `cardResolves`' documented no-op suppression contract.
- **Suggestion:** Filter royal subjects while assessing skill bindings in `cardResolves`, suppress the card when no non-royal binding/effect remains, and cover all-royal and mixed binding sets.

### P2 — `93332da12abd32c3` — Royal rejection detection ignores target-slot semantics

- **Source:** `code-reviewer`
- **Location:** `src/engine/engine.ts:568`
- **Evidence:** Rejection labels a card play `royal-skill-immune` whenever any submitted target square contains a royal, without checking `choiceSlots`. A royal supplied in a `chosen_empty` destination slot is therefore reported as an attempted royal target rather than an invalid destination.
- **Reasoning:** Legal generation knows each target index's friendly/enemy/empty role, but rejection discards that information, producing misleading UI copy for malformed or replayed actions.
- **Suggestion:** Return royal immunity only for a royal occupying a friendly/enemy target slot; otherwise retain `card-bad-targets`.

### P2 — `f11adb22cd94b518` — The 24-card audit is vacuous with respect to skill-effect execution

- **Source:** `codex`
- **PIDA disposition:** `accepted`
- **Location:** `tests/engine/royal-threat-audit.test.ts:130`
- **Evidence:** The per-card audit treats a card as resolved because `apply` adds its ID to `drafts.white.used`, then checks only terminal/royal safety. A regression that makes every skill effect a no-op can still pass those assertions. The positive controls at lines 223-278 directly mutate copied state instead of playing synthetic cards through targeting, binding, execution, and policy enforcement.
- **Oracle result:** Lines 130-142 prove card consumption and royal safety; lines 223-278 prove helper sensitivity, not skill execution.
- **Suggestion:** Add a card-specific observable postcondition or execution counter for every bundled card. Drive destroy, relocation, grant, promotion/spawn, and blocker-removal controls as synthetic cards through `legalActions` and `apply`.

## 🤝 Disagreements

None. The findings target different symbols and failure modes, so no cross-tier or same-surface clusters were formed.

## 🧊 Cross-model findings (frozen @ round 1)

- `frozen_at_round`: 1
- `models`: [`codex`]

```yaml
- id: f11adb22cd94b518
  source: codex
  severity: P2
  file: tests/engine/royal-threat-audit.test.ts
  line: 112
  summary: The 24-card audit is vacuous with respect to skill-effect execution
  evidence: The per-card audit proves card consumption and royal safety but does not prove each bundled skill effect executed; its positive controls mutate copied state directly.
  needs_relaxation: false
  disposition: accepted
  oracle_result: Lines 130-142 only prove card consumption and royal safety; lines 223-278 mutate copied state, so effect execution can regress to no-op undetected.
  status: resolved
```

## Initial Review Iteration Summary

| Iteration | Grade | Fixes Applied | Remaining | New |
|-----------|-------|---------------|-----------|-----|
| 1 (init) | A | — | 4 | — |

Final grade: A
Iterations used: 1 / 2
Exit reason: converged
Status: APPROVED
human_review_needed: true
Counters: unreviewed 0 · prior-fix 0 · unattributed 0

No auto-fix round ran: the grade met the configured threshold, and every finding remained `manual-only` under the two-voice cross-model threshold.

## Follow-up Remediation (user-directed)

All four manual findings were addressed after the initial review. They remain part of the frozen review record; a fresh `/hm:review` should independently close the human-review gate.

| Finding | Remediation | Verification |
|---|---|---|
| `91927b73396f5d42` | Skill-layer frozen entries and persistent grants are ignored whenever their current square occupant is royal; rule/piece/square-layer behavior remains active. | Added capture-onto-Freeze and skill-vs-rule grant controls. |
| `7b8775820b2b3639` | `cardResolves` now filters royal quantified subjects and royal-only revive pools before offering a skill. | Added royal-only quantified and revive-pool regressions. |
| `93332da12abd32c3` | Royal rejection detection now checks the authored target-slot kind and ignores `chosen_empty` slots. | Added a teleport destination rejection regression. |
| `f11adb22cd94b518` | Every bundled target tuple must change an effect fingerprint, and five synthetic threat mechanisms now execute through `legalActions` and `apply`. | The audit fails on an executed relocation, grant, promotion, blocker removal, or spawn counterexample. |

Post-remediation checks:

- `npm run build` — passed.
- `npm run test` — 140 files, 1593 tests passed.
- Targeted royal/card/rejection suite — 5 files, 124 tests passed.
- `npm run typecheck` — passed.

## Fresh Re-review — 2026-08-11T17:30:13+09:00

The configured `code-reviewer` independently confirmed that all four initial findings are resolved and returned no new findings. The Codex second opinion was invoked exactly once and produced two new P2 findings. PIDA accepted both, but neither received a matching code-reviewer voice, so both remain `manual-only` and do not set the severe-finding human gate.

### Re-review manual-only findings

#### P2 — `3fc2bffec84f4753` — Royal rejection does not fully respect target-slot side semantics

- **Source:** `codex`
- **PIDA disposition:** `accepted`
- **Location:** `src/engine/engine.ts:577`
- **Evidence:** The rejection branch distinguishes piece slots from `chosen_empty`, but does not require a `friendly` slot's royal to be friendly or an `enemy` slot's royal to be enemy. A friendly king submitted to Volley's enemy slot is therefore described as skill immunity rather than bad targets.
- **Oracle result:** `engine.ts:577-582` returns `royal-skill-immune` for any royal in a piece slot without checking whether the royal matches the slot side.

#### P2 — `dbffb4696214c80d` — No-op prevention treats every individual effect as mandatory

- **Source:** `codex`
- **PIDA disposition:** `accepted`
- **Location:** `src/engine/engine.ts:383`
- **Evidence:** `cardResolves` returns false as soon as one effect has no non-royal binding or eligible revive subject, even if another effect on the same card executes observably. A royal-only quantified effect followed by an unconditional spawn is hidden despite the spawn being live.
- **Oracle result:** `engine.ts:374-406` rejects on an inert effect, while `engine.ts:1039-1061` executes each card effect independently and can apply later effects.

### Fresh cross-model findings (frozen @ round 1)

- `frozen_at_round`: 1
- `models`: [`codex`]

```yaml
- id: 3fc2bffec84f4753
  source: codex
  severity: P2
  file: src/engine/engine.ts
  line: 577
  summary: Royal rejection does not fully respect the target slot's side semantics
  evidence: The rejection branch checks slot kind and royalty but not whether the royal's side matches the friendly or enemy slot.
  needs_relaxation: false
  disposition: accepted
  oracle_result: engine.ts:577-582 returns royal-skill-immune for any royal in a piece slot without checking whether the royal matches the slot side.
  status: pending
- id: dbffb4696214c80d
  source: codex
  severity: P2
  file: src/engine/engine.ts
  line: 383
  summary: No-op prevention treats every individual effect as mandatory instead of the card as a whole
  evidence: cardResolves rejects the card on one inert effect even if a later effect would execute observably.
  needs_relaxation: false
  disposition: accepted
  oracle_result: engine.ts:374-406 rejects on any inert effect, while engine.ts:1039-1061 executes each card effect independently and can apply later effects.
  status: pending
```

### Fresh re-review summary

| Round | Grade | Consensus-passed | Manual-only | Human review needed |
|---|---|---:|---:|---|
| 1 | A | 0 | 2 P2 | false |

Final grade: A
Iterations used: 1 / 2
Exit reason: converged
Status: APPROVED
human_review_needed: false
Counters: unreviewed 0 · prior-fix 0 · unattributed 0

The grade gate is clear and wrapup is permitted. The two P2 manual-only findings are documented but were not auto-fixed because they did not reach two-voice consensus.
