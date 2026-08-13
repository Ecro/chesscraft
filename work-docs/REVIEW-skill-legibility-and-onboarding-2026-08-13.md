---
type: review
task_slug: skill-legibility-and-onboarding
status: APPROVED
created: 2026-08-13
reviewers_invoked: [code-reviewer, codex]
consensus_method: single
drift_verdict:
  result: scope_violation
  scope_violations:
    - src/ui/App.tsx
    - tests/ui/effect-visibility.test.tsx
  scenario_misses: []
  task_slug: skill-legibility-and-onboarding
  computed_at: 2026-08-13T15:20:00Z
second_opinion_results:
  - model: codex
    status: invoked
    reason: null
---

# REVIEW — skill legibility and first-entry onboarding

## 🎯 Round 1 Summary

**Grade: B** (0 × P0, 1 × P1). Threshold is `B`, so the gate cleared on round 1 — the
auto-fix loop was entered anyway, because the P1 was a real display bug with a concrete fix
and shipping it behind a passing letter would have been the wrong reading of the gate.

| | |
|---|---|
| Reviewers | `code-reviewer` (the only entry in `reviewers.enabled`) |
| Cross-model voters | `codex` — gate passed (`is_high: true`: 23 files, 3005 added lines) |
| Consensus method | `single` (config) — one enabled reviewer, so the 2-pass redaction protocol is skipped: there is no cross-reviewer anchoring bias to mitigate |
| Findings | 1 × P1, 1 × P2 (both fixed), 1 cross-model finding (PIDA-rejected) |

---

## 🔍 Drift Findings

`drift_verdict: scope_violation`. Every item was known before the gate ran, but two had been
recorded only as prose in the PLAN and one had not been recorded at all.

### Changed but outside PLAN scope (P1)

| File | Status |
|---|---|
| `src/ui/App.tsx` | **Documented.** Passes `storage={browserStorage()}` to `MatchHost`. The PLAN listed `MatchHost.tsx (mount + flag read)` and not its caller; without this line the sheet is fully tested and reachable by nothing. |
| `tests/ui/effect-visibility.test.tsx` | **Documented.** Its hand-off test asserted an announcement that ADR-004 now queues behind the card banner. The claim is unchanged; only its timing moved. |

### In PLAN scope but not changed

| File | Status |
|---|---|
| `tests/ui/tokens.test.ts` | **Explained.** `game-feel.test.tsx` already asserts every `--motion-*-duration` is zeroed under `reduce` and that every animation rule goes through a token, so the new token was gated the moment it was declared. |
| `e2e/single-player.spec.ts` | **Explained.** Forcing the computer to hold a playable card in a browser is not reliable; a conditional assertion would report green on runs that never reached it. Covered precisely in `card-banner.test.tsx` with a stubbed search. |
| `e2e/a11y.spec.ts` | **NOT explained — a real miss, fixed during this review.** Phase 5 was marked DONE with a deliverable its own scope named still unwritten (`[fail:design] phase-done-deliverable-never-written`). The banner carried `role="status" aria-live="polite"` and nothing asserted it. The assertion now lives in `turn-shape.spec.ts`, beside the deterministic card fixture — `a11y.spec.ts` reaches the board through `startMatch` and its random seed, so it cannot reliably get a card played. The PLAN's Phase 5 scope line was corrected rather than left to look satisfied. |

`common_ground_marks` is absent from the PLAN frontmatter, so the Step 2.5 silent-intent-miss
hook does not apply.

---

## ✅ Consensus Findings

`consensus: single` — the one enabled reviewer's findings are the consensus. Both were fixed.

### P1 — the impact ring took the legal-move dot's pseudo-element
`src/ui/styles.css:1484` (as written in round 1)

**OBSERVE.** `.square[data-legal-kind='move']::after` (the legal-move dot, line 1357) and
`.square[data-impact='true']::after` (the impact ring, line 1484) are both
single-class-plus-attribute selectors of equal specificity. The later declaration wins on every
element matching both.

**TRACE.** `data-impact` is set whenever a square is in `impacted` — up to `CARD_BANNER_MS`
after a card resolves. `data-legal-kind='move'` is set independently from `reachable`. Nothing
makes the two mutually exclusive.

**INFER.** ADR-005 deliberately leaves the human path ungated so the player can pick the move
their card still owes *while the banner is up*. A square a card just freed is exactly what the
next move targets.

**CONCLUDE.** The move-target indicator was silently replaced by a ring during the one moment
this feature exists for.

> The code carried a comment asserting this overlap was unreachable — "the ring belongs to the
> ply that just ended". That argument contradicted the feature's own ADR.
> `[fail:design] comment-claims-unbuilt-safeguard`.

**Fix.** The ring is a child element (`.impact-ring`), not a pseudo-element. Both of a square's
pseudo-elements were already spoken for — `[data-last]` owns `::before`, the legal-move dot owns
`::after` — so moving it to the other one would only have relocated the collision. Pinned by
`the ring does not take the legal-move dot's place` in `turn-shape.spec.ts`, which selects the
piece that owes its move while the ring is up and asserts the dot is still drawn.

### P2 — the card-name fallback could put a raw id on screen
`src/ui/MatchHost.tsx:1594` (as written in round 1)

`name={t(content.skillCards.get(...)?.nameKey ?? cardNotice.play.cardId)}` handed the raw
`skill.*` id to `t()` on a lookup miss, and `makeTranslate` returns the key verbatim — so the id
would render, breaking AC-009 on the one path built to degrade gracefully. The existing test
asserts the id never reaches the player, but only where the record exists.

**Fix.** The record is resolved once and its absence suppresses the banner. No placeholder key
was introduced: a key reachable only from an unreachable branch is
`[fail:design] declared-but-inert-vocabulary` (count:7). If there is no record, there is nothing
to name.

---

## ⚠️ Weak Consensus

None.

## 📝 Manual-Only Findings

None from the reviewers. One **orchestrator observation**, recorded because it was seen and
should not be lost, and labelled as not a reviewer finding:

- **Pre-existing e2e flake under high parallelism.** At the default worker count the full suite
  fails 1–2 specs per run, a *different* pair each time, always in the `useSliceContent` →
  editor-import path (`a11y`, `delete`), always at a navigation click, and every one passes in
  isolation. The suite is green at `--workers=4` (430 passed). None of the affected specs touch
  code changed here — but this change does add two e2e tests, which raises load on the single
  dev server, so it may make the flake more likely to surface. Worth its own look; not a defect
  of this change.

## 🤝 Disagreements

None on severity. One on reachability, resolved by the PIDA gate — see Section 7: `codex` and
`code-reviewer` independently raised the same raw-id fallback, `codex` as a live exposure and
`code-reviewer` as a defensive path that breaks its own guarantee. PIDA refuted the live-exposure
framing; the fix addresses the defensive-path framing, which survives.

---

## 🧊 Cross-model findings (frozen @ round 1)

```yaml
frozen_at_round: 1
models: [codex]
findings:
  - id: c2b60e487dfb56cb
    source: codex
    severity: P2
    file: src/ui/MatchHost.tsx
    line: 1594
    summary: >-
      The card-name fallback renders the raw content id when the skill-card record is
      absent, violating AC-009.
    evidence: >-
      `name={t(content.skillCards.get(cardNotice.play.cardId)?.nameKey ?? cardNotice.play.cardId)}`
      falls back to displaying/translating the content ID itself when the referenced record
      is absent.
    needs_relaxation: false
    disposition: rejected
    oracle_result: >-
      engine.ts:1142 sets turnCard from action.cardId validated against the same content the
      play_card action was legalized under; App.tsx:543 remounts MatchHost on content/preset
      change, so within one mount content.skillCards.get(cardNotice.play.cardId) cannot miss —
      the fallback branch is unreachable.
    status: resolved
```

Reconciliation: input set 1, dispositions returned 1, ids matched, none dropped, none invented,
no collisions. Mode-B `stats` consistent (`1 = 0 + 1 + 0 + 0`). Recorded at the base root; the
invoker printed no `disposition rows NOT recorded` warning.

Oracle for this finding was weak and did not carry the verdict: `tsc` clean (exit 0), and the
vitest path filter matched no test file (exit 1 = "no tests found" for a non-test source path,
correctly read as absent rather than failing). The rejection rests on the architecture trace.

**`rejected` → dropped, never a voter.** It therefore contributes nothing to the grade, and does
not set `unverified_severe`. Note that `code-reviewer` reached the same code independently at the
same severity; that finding is a voter and is counted above.

---

## Iteration 2 (Grade: B → A)

Fixes applied: 3

| # | Severity | Summary | File | Status |
|---|----------|---------|------|--------|
| 1 | P1 | Impact ring moved off `.square::after` to its own child element | `src/ui/styles.css`, `src/ui/MatchHost.tsx` | Applied · caused_by=none |
| 2 | P2 | Card record resolved once; absence suppresses the banner instead of showing an id | `src/ui/MatchHost.tsx` | Applied · caused_by=none |
| 3 | P1 | `impacted` gated on `cardBannerUp`, not the latch alone | `src/ui/MatchHost.tsx` | Applied · caused_by=#2 |

Remaining: 0 | New issues introduced: 1 (fix #3, found by the round-2 re-review and fixed)

**Fix #3 is the one worth reading.** Round 2 re-reviewed only the two fixes. It found that
making the *banner* depend on the card's record had not been carried to the *ring*: `impacted`
still read the latch alone, so an unresolvable card would have drawn rings with no banner
anywhere — while a different notice held the slot. The comment three lines above already
promised the two share a lifetime; only the code did not. This is
`[fail:design] fix-introduced-defect-passes-all-gates`, produced by a fix and caught because the
round re-reviewed the fix rather than the feature.

The triggering scenario cannot be reached through the component's API — the engine only stores a
validated card id and `App.tsx` remounts on a content change — so it has no scenario test.
Pinned instead as an **invariant**: `never draws a ring without the banner that explains it`
samples the banner/ring pair before a card, while it is announced, and after it clears, and
requires agreement at each point.

---

## Review Iteration Summary

| Iteration | Grade | Fixes Applied | Remaining | New |
|-----------|-------|---------------|-----------|-----|
| 1 (init)  | B     | —             | 2         | —   |
| 2         | A     | 3             | 0         | 1   |

Final grade: **A**
Iterations used: 2 / 2
Exit reason: converged
Status: **APPROVED**
human_review_needed: **false**
Counters (see §5): unreviewed 1 · prior-fix 1 · unattributed 0

`unreviewed 1` — fix #3 was applied in the terminal round and the loop had no round left to
re-review it. It is a one-condition change (`cardNotice` → `cardBannerUp && cardNotice`) covered
by a new invariant test, but it is unreviewed and recorded as such rather than counted as
settled.

`unverified_severe` = **false**: no `manual-only` or `weak-consensus` finding at P0/P1 exists.
The single cross-model finding was `rejected`, not `unresolved`, so the carve-out does not apply
and nothing is being waved through by it.

### Verification at exit

| Check | Result |
|---|---|
| `npm run typecheck` | clean |
| `npx vitest run tests/ui` | 76 files / **874 tests** passed |
| `npx playwright test --workers=4` | **430 passed**, 0 failed (mobile-portrait · desktop · mobile-webkit) |
| `src/engine/**`, `src/content/**`, `src/balance/**` | unmodified |
| `git log` | no commit created by this stage |
