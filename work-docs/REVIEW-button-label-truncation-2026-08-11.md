---
type: review
task_slug: button-label-truncation
status: APPROVED
created: 2026-08-11
reviewers_invoked: [code-reviewer, ux-reviewer, codex]
consensus_method: cross-check
drift_verdict:
  result: clean
  scope_violations: []
  scenario_misses: []
  task_slug: button-label-truncation
  computed_at: 2026-08-11T00:55:00Z
---

## 🎯 Round 1 Summary

**Grade: B** (threshold B — met). One `consensus-passed` P1, found independently by two of the
three voices, fixed in this round. Zero P0. Status **APPROVED**, `human_review_needed: false`.

`reviewers.enabled` holds only `code-reviewer`. `ux-reviewer` was added for this run via the
per-invocation override, on the strength of `[wiki:tooling] review-grade-is-not-the-signal`,
which records that it "sat installed-but-disabled through a 68-file UI redesign while every
accessibility finding came from a general reviewer or a cross-model voter that happened to look."
That decision is the reason this review has a consensus finding at all: with one Claude reviewer
plus codex the pool is N=2 against K=2, and the same wiki entry records zero consensus findings
across three rounds at that setting. At N=3 the threshold is reachable, and it was reached.

**Read the flag, not the letter** — same wiki entry. Here they agree, but the letter alone would
not have distinguished "nothing found" from "nothing corroborated".

## 🔍 Drift Findings

Checked the diff against every PLAN phase's `Scope — in` / `Scope — out`.

- **Scope-in, all present.** All nine repaired selectors changed: `button` (base),
  `button.xl`, `.boot-actions button`, `.home-secondary button`, `.result-secondary button`,
  `.dex-tabs button`, `.match-tools button`, `.build-steps button`, `.palette button, .tile`,
  `.dex-grid button`.
- **Scope-out, all untouched.** `.editor-tabs`, `.side-picker`, `.reach-picker`,
  `.notice-actions`, `.move-modes` and `.tabbar .tab` appear in zero diff hunks — confirming the
  execute-time correction that these were never in the defect class (they declare `flex: 1` and
  no padding, or draw no bevel).
- **One drift found and resolved at source.** `e2e/button-label-fit.spec.ts` belonged to no
  phase's scope. It was added at execute after the defect was reproduced, which falsified
  ADR-004's premise. Rather than record a standing violation, Phase 4's `Scope — in` was amended
  to claim the file with the reversal's rationale, so the PLAN matches the diff. `result: clean`
  reflects the post-amendment state; the amendment itself is recorded in the PLAN.

No `common_ground_marks` in the PLAN frontmatter, so the Step 2.5 silent-intent-miss hook does
not apply.

## ✅ Consensus Findings

### P1 — the e2e sweep never rendered the two families the change squeezed hardest

**`consensus-passed` [2/3]** — `ux-reviewer` and `codex`, independently, same file, same line
(`e2e/button-label-fit.spec.ts:95`), same CONCLUDE.

> **OBSERVE.** The sweep built its coverage from `page.locator('.tabbar .tab')` and clicked each
> tab. `TabBar.tsx` lists three tabs — home, edit, dex. `App.tsx` mounts `MatchHost` (which owns
> `.match-tools`) only at `route === 'play'`, and does not render the tab bar on that route at
> all. `.build-steps` lives inside `RoomDetail`, reached by opening a specific room from inside
> the edit tab.
>
> **INFER.** `.match-tools button` and `.build-steps button` are exactly the two rules moved to
> the 5px dense tier — chosen *because* an 11px floor would have cost them too much label width,
> which is the PLAN's own Risk R2. The static guard cannot cover the gap either: its
> `naturalHeight` models one line at the base font, not six Korean labels sharing a 390px row.
>
> **CONCLUDE.** A regression that clipped a match-tools or build-steps label at a cramped
> viewport would pass every check this task added. The families most likely to break were the
> ones with no measurement.

**Severity note.** `ux-reviewer` filed P1. The codex adapter mapped its finding to P2 while the
finding's own text reads "P1 serious". Taking the adapted tier literally would have split the
pair across tiers and denied consensus on the one real finding of the review — the null-location
relaxation exists for exactly this class of adapter artifact, so they were clustered at P1.

**Fix applied (Round 1).** The sweep was split into two further tests that navigate to the
screens a tab click cannot reach:

| Test | Reaches | Guard against vacuity |
|---|---|---|
| `the match tools row` | starts a match through the lobby, scans, then opens the settings drawer for the two buttons behind it | asserts `.match-tools button` count > 3 before scanning |
| `the build steps strip` | opens the **shipped** document's first room and walks all five build steps | asserts `.build-steps button` count > 3, and that > 3 steps were actually visited |

The room is taken as `[data-testid^="room-open-"]`'s first match rather than a seeded fixture id
(the initial attempt used `preset.slice`, which only exists in specs that inject it, and timed
out). That follows the repo's recorded lesson that at least one test must mount the shipped
document unmodified — a fixture that adds a room deletes the case the product actually ships.

**Verification:** 5/5 in `mobile-portrait`; 147 passed across all three projects together with
`e2e/a11y.spec.ts` and `e2e/layout.spec.ts`; `tests/ui/button-label-fit.test.ts` 20/20.

## ⚠️ Weak Consensus

None.

## 📝 Manual-Only Findings

### P3 — factual error in an allowlist justification comment (fixed)

`code-reviewer`, single source. `R3_ICON_ONLY`'s entry for `.screen-head .back` described it as
"a chevron in a 34px box". The rule declares `height: 34px` but inherits `min-height: 44px` from
the base rule with nothing overriding it, so used height resolves to 44px and the control renders
at 44. The comment asserted something untrue about the code it exempts — the shape of
`[fail:design] comment-claims-unbuilt-safeguard` (count:9 in this repo). Comment corrected to
state the actual resolution. No behavioural change.

**Out of scope, recorded not acted on:** the same reviewer noted the 34px-vs-44px conflict in
`styles.css` itself predates this diff. Left alone — this task's scope is label clipping, and the
control renders at the larger, more accessible size either way.

## 🤝 Disagreements

None on substance. The only divergence was the severity tier of the consensus finding (P1 from
`ux-reviewer`, P2 after codex's adapter), resolved above and recorded rather than averaged.

## 🧊 Cross-model findings (frozen @ round 1)

Gate: side preset requires high-diff. Classification —
`{"boundary": false, "is_high": true, "reasons": ["file count 4 > 3", "added lines 1411 >= 400"]}`
→ every enabled model invoked.

`second_opinion_results`:
- `{ "model": "codex", "status": "invoked", "reason": null, "duration_s": 87.2 }`

| id | severity (adapted) | file:line | disposition | notes |
|---|---|---|---|---|
| `65a5812106321505` | P2 (text says "P1 serious") | `e2e/button-label-fit.spec.ts:95` | **accepted** → consensus voter | Verified directly before acceptance: `.match-tools` renders only in `MatchHost`, `.build-steps` only in `RoomDetail`/`RecordForm`, neither reachable by a tab click. Clustered with `ux-reviewer`'s P1. |

Codex was the first voice to raise this, and it raised it against the reviewer's own new test
file rather than the production change — the sort of finding a reviewer looking only at the CSS
would not reach.

## Review Iteration Summary

| Iteration | Grade | Fixes Applied | Remaining | New |
|-----------|-------|---------------|-----------|-----|
| 1 (init)  | B     | 2             | 0         | 0   |

Final grade: **B**
Iterations used: 1 / 2
Exit reason: converged
Status: **APPROVED**
human_review_needed: **false**
Counters (see §5): unreviewed 0 · prior-fix 0 · unattributed 0

Both fixes touch only test/comment surface — `e2e/button-label-fit.spec.ts` and a justification
string in `tests/ui/button-label-fit.test.ts`. No production CSS changed after review began, so
no re-review of the reviewed surface was required; the fixed files were re-run instead
(`unreviewed_fix_count: 0` because the sweep's own assertions cover them and both were executed
green across all three Playwright projects).

## Standing limitations carried out of this review

Recorded because a green review will otherwise be read as covering them:

1. **The static guard cannot prove any label fits** (ADR-004). It proves five rule shapes are
   absent. The e2e file is the compensating measurement, and it now reaches the dense families.
2. **`line-height: 0` is an unguarded axis**, named in the test file's header with its reason
   (sixteen legitimate sprite-button uses; a flat scan cannot separate them from a defect).
3. **The Phase A.5 test-reviewer gate exhausted its 2-round budget at FAIL.** Its last three
   findings were applied without a third lens pass, with the user's explicit go-ahead. All three
   were about resolver branches unreachable from the live stylesheets; each now has a synthetic-input
   test. This review's reviewers read those same files and raised nothing further about them.
