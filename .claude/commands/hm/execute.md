---
generated_by: harness-maker
harness_maker_version: 0.49.0
generated_at: '2026-01-01T00:00:00+00:00'
source_template: commands/hm/atomic_command.md.j2
provenance: official
description: Implement a PLAN's phases TDD-first. Stages, never commits.
content_hash: f72b4fad79885288219f250195c16fb6eccc71187b144be32d96e22b6a96c979
---
> **Before you begin — outline your plan.** First check whether an autoloop is
> active **for THIS session** (session-scoped — a loop in another session must
> not suppress your banner). Loop-mode is active iff `$HM_SESSION_ID` matches a
> `.claude/.hm-loop-*` marker's `claude_session_id:` content header, OR a legacy
> `<project-root>/.hm-loop-active` exists (degraded fallback). The project root is
> above `.worktrees/` if your cwd is inside a `.worktrees/<name>/` worktree (strip
> the `/.worktrees/<wt-name>/` suffix, or `git rev-parse --show-toplevel` then walk
> up out of `.worktrees/`).
> **If loop-mode is active for this session, skip this banner entirely and operate
> without it** — the autoloop runs silently and a per-iteration banner would flood
> the transcript. Otherwise, print the start banner below (in the configured output
> language), then begin.

<!-- @hm:banner:start -->
> 🎯 **Goal:** one line — what this command will accomplish for the user.
> 📋 **Plan:** a short numbered list of the top-level steps you intend to take —
> for a single stage, its `Step` / `Phase` / `Check` headings; for a fused
> workflow, **one line per stage** (the `## Stage:` entries), not every sub-step.
> Present them as **intended, conditional** steps — skip heuristics, early-exit /
> early-FAIL rules, and any stage's own `STOP — do not proceed` boundary override
> this plan; never treat the banner as a commitment to run past a STOP.


<!-- @hm:autopilot-picker -->
> **Autopilot session start (Claude Code only).** This harness is configured for
> autonomy (`autonomy.level: auto_safe`). If loop-mode is active for
> this session (see above), SKIP this. Otherwise, at the first eligible stage, ask the CLI
> whether autopilot is already active — **never decide this from whether the marker file
> exists.** Nothing collects a stale marker, so file-existence reads as "already armed"
> and autopilot silently never turns on; that is the usual reason it looks dead.
>
> `uv run --with $HOME/.claude/plugins/cache/harness-maker/harness-maker/0.49.0 hm autopilot status --root . --session-id "$HM_SESSION_ID"`
>
> Branch on **both** fields of the JSON (it always exits 0):
> - `active: true` → armed already. Skip the picker; do not re-arm.
> - `reason: "foreign"` or `"degraded-idless"` → the marker belongs to a different session
>   id (or this session cannot read its own — a known WSL2 hook failure). **You cannot tell
>   an active peer from a marker abandoned mid-pipeline**, so do not guess and do not
>   `--force` on your own initiative. State the fact — `idle_minutes` is how long the owner
>   has been silent; `null` = unknown (skewed clock), proving nothing — then ask the
>   user: *is another Claude session open in this project?* Only on **no**, re-run the arm
>   command below with `--force`. On yes, stay gated.
> - anything else → offer ONCE via `AskUserQuestion`: "Run the
>   `research → spec → plan → execute → review → verify → wrapup` pipeline on autopilot this session
>   (stages auto-advance when no mandatory gate is pending), or stay gated?" On **yes**:
>   `uv run --with $HOME/.claude/plugins/cache/harness-maker/harness-maker/0.49.0 hm autopilot on --level auto_safe --pipeline research,spec,plan,execute,review,verify,wrapup --session-id "$HM_SESSION_ID"`
>   On **no**, proceed gated — do not re-prompt unless the user asks.
>
> **Persistence:** the marker lives at the **project root** (so a stage inside
> `.worktrees/<slug>/` sees the one the picker wrote), is keyed to this session, and
> expires after 18h. `session_scoped: false` = the session id was unavailable (Cursor,
> Codex, hook failure) and a peer in this project may share it. Commit
> `autonomy.autopilot_persistent: true` to auto-arm every session; the default is `false`.
<!-- @hm:/autopilot-picker -->



> **Output language.** Respond to the user in **ko**
> (en→English, ko→Korean, ja→Japanese, others→English fallback) on **every turn** —
> the live chat output and the start/end summary banners, not only the onboarding
> interview. Code, identifiers, file paths, and the persisted deliverable documents
> (PLAN / RESEARCH / REVIEW / SPEC) stay in **English**.
<!-- @hm:output_language -->


# Stage: execute

> Atomic stage. TDD machine driven by PLAN. Phase A → A.5 → B → C → D, with worktree isolation and **NO commits** (wrapup owns commits).

## Communication Protocol

- Be direct. No flattery, no preamble.
- If a PLAN phase is under-specified, surface it before writing tests — don't guess.
- Don't hide test failures. Compiler/test errors go in the response verbatim.
- When Phase A.5 returns FAIL, treat the test-reviewer's reasoning as authoritative — rewrite, don't argue.

## Purpose

Apply the PLAN's phases to the codebase. When `tdd_active`, tests are written from SPEC's In-Scope Scenarios first, the implementation follows, and each PLAN phase exits only when its exit-criterion command is GREEN. Use `test_dep_map.build_test_hints()` to identify which tests are affected by each changed file — run only those tests during Phase D instead of the full suite on every edit.

## Usage


```
/hm:execute <slug> [--no-tdd]
```

- `<slug>` — task identifier matching `work-docs/PLAN-{slug}.md`. Required.
- `--no-tdd` — skip Phase A (test authoring), Phase A.5 (test-reviewer gate), and Phase B (RED gate). Phase C still loads SPEC reference. Use when:


  - Pure refactor (no behavior change — existing tests already cover).
  - Docs-only / config-only / typo fix.
  - Emergency fix where SPEC + tests are already present and correct.

  All other modes default to TDD. There is no second flag.


## Inputs

- `work-docs/PLAN-{slug}.md` (required — error if missing).
- From PLAN frontmatter:
  - `spec: "[[SPEC-{slug}]]"` → resolves to `specs/SPEC-{slug}.md`.
  - `research_doc: "[[RESEARCH-{slug}]]"` → resolves to `work-docs/RESEARCH-{slug}.md`.
- From SPEC frontmatter (when present):
  - `test_framework` (e.g., `pytest`, `gtest`, `vitest`) — Phase A writes tests against this.
  - `## 📋 In-Scope Scenarios` — drives Phase A test authoring.
  - `## ✅ Verification Criteria` — drives Phase B RED-gate command + Phase D regression check.
- Memory tiers (loaded below).

## Session Context Loading

Before any code edits, load memory in tier order (stops at first miss):

1. **Hot tier (compaction checkpoint only)** — Read `.claude/memory/session/<today>.md` if it exists, but inspect **only** the `checkpoint:compaction` entry — it means the prior session was interrupted mid-stage, so check `.claude-progress.json` for partial state and resume from the last in-progress phase. Ignore any historical `[decision:*]` blocks: they are legacy and no longer maintained.
2. **Warm tier** — Skim `.claude/memory/failures.md` first 60 lines; targeted: `rg -F "[fail:" .claude/memory/failures.md` for patterns relevant to the task.
3. **Warm tier** — Skim `.claude/memory/wiki.md` first 40 lines for conventions in the implementation area.


## Procedure

### Task worktree preflight (feature-branch workflow)

`harness.yaml worktree.enabled` is **on**: this stage operates inside the persistent per-task worktree `.worktrees/<slug>/` on branch `hm/<slug>` — shared by every `/hm:` stage for this task — NOT an ephemeral `execute-<uuid>` worktree. Claim/refresh it and surface concurrent work + drift:


```bash
!uv run --with $HOME/.claude/plugins/cache/harness-maker/harness-maker/0.49.0 hm worktree task-preflight <slug> "$(pwd)" --stage hm:execute --claude-session-id "$HM_SESSION_ID"
```


- **stdout** = the task worktree absolute path. **Treat that exact string as `<WT>`** for every Read/Write/Edit and every `!cd <WT> && …` in this stage. Do NOT use a shell variable.
- **stderr warnings**: `[preflight] … other active session(s)` = another session holds a task concurrently (informational, no action needed). `[preflight] … behind …` = the task branch drifted behind the base tip; to rebase it cleanly onto the base before working, run:


```bash
!uv run --with $HOME/.claude/plugins/cache/harness-maker/harness-maker/0.49.0 hm worktree task-refresh <slug> "$(pwd)"
```


  `task-refresh` rebases `hm/<slug>` onto the base tip (base HEAD, not a hardcoded `main`), preserving commits; a conflict aborts and leaves the branch untouched — resolve manually, then retry. Refuse to refresh a dirty worktree: commit or discard first.


### Step 1 — Load PLAN + flag parsing

```bash
PLAN=work-docs/PLAN-${slug}.md
[ -f "$PLAN" ] || { echo "ERROR: PLAN not found at $PLAN — run /hm:plan ${slug} first"; exit 1; }
```

Read PLAN fully. Extract:
- Phase list with scope / exit-criterion / risk / rollback for each.
- ADRs (binding constraints — must not be violated by implementation).
- Frontmatter `spec:` and `research_doc:` references.


Parse flags from `$ARGUMENTS`:
- `--no-tdd` → set `tdd_active = false`.
- Otherwise `tdd_active = true`.


### Step 1.5 — Parallel split assessment

Before editing, decide whether any work can safely run in parallel. Use the
PLAN phase metadata (`depends_on`, `parallel_group`, `merge_hazards`) as the
source of truth.

Proceed in parallel ONLY when all of these hold:
- The shards have disjoint file ownership OR are read-only analysis tasks.
- No shard touches shared generated files, snapshot baselines, migrations,
  public contracts, workflow registries, or global config.
- The PLAN's `merge_hazards` for the relevant phases is `none` or already
  resolved by a serial predecessor phase.

Force serial execution when:
- Two phases touch the same file.
- A phase changes shared API/schema/CLI contracts.
- A phase updates generated artifacts consumed by later phases.
- Ownership is unclear.

When parallel work is safe, assign explicit file ownership to each sub-agent
and require each worker to avoid reverting other workers' edits. When unsafe,
write a one-line serial justification in your progress notes and continue.

### Step 2 — Resolve SPEC + RESEARCH cache (when frontmatter references them)

Per PLAN frontmatter:

```bash
spec_field=$(yq '.spec' "$PLAN")            # e.g., "[[SPEC-mqtt-retry]]"
research_field=$(yq '.research_doc' "$PLAN") # e.g., "[[RESEARCH-mqtt-retry]]"
```

If `spec:` resolves to an existing file:
- Read SPEC fully.
- Extract `test_framework` from frontmatter — Phase A uses this verbatim.
- Extract `## 📋 In-Scope Scenarios` — Phase A authors one test per scenario.
- Extract `## ✅ Verification Criteria` — Phase B RED-gate uses the named test commands.

**Machine SPEC (forward binding — PLAN-spec-test-accumulation):** if a sibling
`specs/SPEC-{slug}.machine.yaml` also exists, load it and list the
`type: mechanical` ACs whose `executable_predicate` is a parseable Python
expression (the contract `hm spec_machine validate` enforces).
Call this set the **bindable mechanical ACs** — Phase A authors a real
predicate-bound test for each, and `/hm:wrapup` records the binding back. When
the file is absent or has zero bindable mechanical ACs, Phase A uses the scenario
path unchanged (silent fallback — task-driven / `--no-tdd` / trivial SPECs).

If `research_doc:` resolves to an existing file with mtime < `mtime_warn_days` (frontmatter, default 7):
- Read it; reuse `libs_fetched`, `sources` to skip duplicate context-fetching.
- Cache HIT → no re-retrieval.

If RESEARCH file is older than `mtime_warn_days`: warn the user, proceed with implementation, but note the staleness in the PLAN.

### Step 3 — Per-PLAN-phase TDD machine

For each phase in PLAN's `## 📝 Implementation Plan`, run Phases A → A.5 → B → C → D in order:

#### Phase A — Author tests (skipped when `tdd_active == false`)

Author the **union** of two test sets (PLAN-spec-test-accumulation ADR-001/002/006):

**(a) Bindable mechanical ACs** (when the machine SPEC has them — see Step 2):
for each bindable mechanical AC in scope of this PLAN phase:
1. Author the test at the AC's declared `test_ids[]` node id(s). If `test_ids` is
   empty, name it `test_<ac-id-lowercased>_<short>` (e.g. `test_ac_001_bounded_retry`)
   — `/hm:wrapup` records the chosen node back into the machine SPEC.
2. The assertion **is** the AC's `executable_predicate`, evaluated against the real
   subject under test — bind its free symbols to production objects. No tautology,
   no mock-only body.

**(b) Scenario tests** for every SPEC In-Scope Scenario NOT already covered by a
bindable mechanical AC above:
1. Write test file(s) using `test_framework` from SPEC.
2. Test function name encodes the scenario ID: `test_s1_<short-name>`, etc.
3. Assertions match the scenario's `**Then**` clause exactly.

**(c) Property ACs** (`type: property` — spec-tetrad ADR-001/002) for every AC whose
`oracle_source` is `property`:
1. **Python** (`test_framework: pytest`): author a **Hypothesis** property test from the
   AC's structured fields — `@given(<strategy for input_domain>)` generating inputs,
   the body applying `transformation`, and the assertion encoding `expected_relation`
   (the metamorphic relation / invariant). Honor `preconditions` via `assume(...)`.
   A metamorphic relation is the oracle — it needs no reference output, so it cannot
   be satisfied by reading the implementation (this is the whole point).
2. **Hypothesis profile contract** (ADR-002, do NOT bake determinism everywhere):
   register two settings profiles and select by env —
   - `ci` profile: `derandomize=True`, `database=...` (replay shrunk failures),
     explicit `@seed` capture → the **reproducible gate** the mutmut check runs under.
   - `dev` profile: broader generation, relaxed deadline → local **bug-finding**.
   Default to `ci` in CI (`HYPOTHESIS_PROFILE=ci`), `dev` locally.
3. **Non-Python targets** (Dart/TS/Rust): the plugin does NOT bundle a generator
   (ADR-002 — domain content owner = user). Author a conventional property test in the
   project's framework (`fast-check` / `proptest` / `glados`) from the same structured
   fields, and note the convention in the test file header.

**(d) Parametric ACs** (`type: parametric` — PLAN-nonmechanical-ac-binding ADR-003) for
every parametric AC with a `golden_table`:
1. **`golden_table` is the SSOT** — do NOT inline the rows into the test (that re-creates
   the drift this exists to remove). Load them at collection time via the harness helper:
   ```python
   from pathlib import Path
   from harness_maker.spec_machine import load_golden_table
   _ROWS = load_golden_table(Path(__file__).parents[N] / "specs/SPEC-{slug}.machine.yaml", "AC-0NN")
   ```
   **Path contract:** resolve the yaml **relative to the test file** (`Path(__file__).parents[N]`
   for the project root) — NEVER cwd (pytest runs from varying cwds; a cwd-relative path breaks
   collection). The consuming project must have `harness_maker` importable in its test env (a
   loud `ImportError` is the failure mode — install it as a test dep or vendor the helper).
2. **`@pytest.mark.parametrize`** over the rows with a STABLE `ids=` (derive from each row's
   `note`/index so reordering the table gives readable, stable failure names). Bind at
   **function level** — one `test_<ac-id>*` function = one `test_id` (per-row binding is out of
   scope; `mark_tested`/collect already strip the `[case]` suffix).
3. **`load_golden_table` is data-loading ONLY** — YOU author the oracle body. `f(**input) ==
   expected` is the DEFAULT example, NOT the contract: a row may expect an exception
   (`pytest.raises`), a partial/structural match, or multiple outputs. Bind free symbols to the
   real production object — no mock-only body.

There is no machine-readable scenario↔AC link, so deciding which scenarios are
"already covered" is a judgment call — do NOT write both an AC test and a scenario
test for the same observable; the Phase A.5 test-reviewer adjudicates the union for
duplication or coverage holes.

All tests MUST be RED initially — they import / depend on functions that do not yet
exist or are stubs. The implementation is written in Phase C. When no SPEC and no
machine SPEC exist, author tests from the PLAN phase's exit-criterion instead.

#### Phase A.5 — test-reviewer gate (skipped when `tdd_active == false`)

Invoke the `test-reviewer` agent on the just-authored test files:

```
Task(
  subagent_type="test-reviewer",
  description="Phase A.5 test-quality gate: {slug}",
  prompt="<SPEC body + bindable mechanical AC list (id + predicate, when present) + Phase A test file paths + test_framework name>\n\nThe AC list lets you adjudicate the scenario∪AC union for duplication / coverage holes.\n\nReturn ONLY the JSON output as specified in your instructions."
)
```

Resolution:
- `overall_assessment: PASS` → proceed to Phase B.
- `overall_assessment: FAIL` → for each entry in `blocking_issues[]`, rewrite the offending test (the `passing_tests[]` list is FROZEN — do not re-author them). For each `scenarios_missing[]`, author a new test. **Re-invoke test-reviewer** until PASS. Retry budget: **2 attempts**. After 2 FAILs in a row, surface the latest verdict and stop — escalate to user.

**Record every attempt (ADR-004).** One row per dispatch — including each retry, and
including the case where the dispatch never ran. This gate has ~42 lifetime dispatches and
**zero** ledger rows, so the question "is A.5 worth its barrier?" currently has no data at
all. Run this immediately after each attempt resolves, with `<run-id>` stable across the
retries of one Phase A.5 (use the task slug plus the phase number):


```bash
!cd <WT> && uv run --with $HOME/.claude/plugins/cache/harness-maker/harness-maker/0.49.0 hm stage_agent_ledger emit --run-id <run-id> --agent test-reviewer --stage execute --slug {slug} --pass <attempt-number> --verdict <PASS|FAIL> --terminal --duration-ms <elapsed> --barrier-index <segment>
```


- Omit `--terminal` on an attempt that will be retried; pass it on the one that ends the gate.
- If the dispatch **failed to launch or was skipped**, emit `--verdict dispatch-failed` or
  `--verdict dispatch-skipped` with `--reason "<why>"` and `--terminal`. The CLI rejects
  those verdicts without a reason — a sentinel row with a null reason is undiagnosable, which
  is the exact state `delegation_ledger` is in today.
- `--duration-ms` is wall-clock for the dispatch. **Omit it if you did not measure it** —
  do not pass `0`. Zero reads as "measured, instantly", and these rows are append-only.
- `--barrier-index` is which serial segment of the stage this dispatch sat in (A.5 is its own
  barrier, so `1` unless the stage layout changed).

#### Phase B — RED gate (skipped when `tdd_active == false`)

Run the test command from SPEC's `## ✅ Verification Criteria` table (or the PLAN phase's exit criterion if SPEC absent):


```bash
!cd <WT> && <test_command>
```


Expected result: tests FAIL for the right reasons (missing implementation, not syntax errors / import errors / framework misconfiguration). Verify by reading the failure output. If the test passes by accident → return to Phase A and rewrite (false-RED is a Phase A.5 escape).

#### Phase C — Implementation to GREEN

Write the implementation. No untested code paths — every public function added must be covered by a test from Phase A (or by an existing test, when `tdd_active == false`).

Constraints from PLAN's ADRs are binding: do NOT introduce a pattern that contradicts an ADR; surface as a Phase D blocker if the ADR turns out wrong.

Type-check once per FILE, when you finish that file — not after each edit. Include the output when surfacing progress.

#### Phase D — Post-GREEN verification

Select what to run, then run it as ONE call. `mode: full` → run everything and echo `reason` verbatim (fires when no test maps to a changed file, and for `pyproject.toml` / `uv.lock` / CI workflows / `harness.yaml` — selecting zero tests there would be weaker than today); `mode: targeted` → pass `node_ids`. `&&` short-circuits, so one call still surfaces the first failure:


```bash
!cd <WT> && uv run --with $HOME/.claude/plugins/cache/harness-maker/harness-maker/0.49.0 hm test_dep_map --root . --changed-file <f1> …
!cd <WT> && <lint> && <type> && <test> <nodes-or-empty>
```


Plus the PLAN phase's exit-criterion command. All must pass. If any fails:
- Compile / type / lint failure → fix in Phase C (re-edit, re-check); do NOT advance.
- Test failure that wasn't there before → regression. Find the offending change, fix or revert.
- Phase exit-criterion failure → the PLAN phase is not done. Either fix or escalate.

**T1 mutation gate (machine SPEC path only — ADR-003 of PLAN-spec-test-accumulation):**
when this PLAN phase authored bindable-mechanical-AC tests and the machine SPEC is
`verification_tier: 1`, run the tier-gated mutation check over its `paths_to_mutate`:


```bash
!cd <WT> && uv run --with $HOME/.claude/plugins/cache/harness-maker/harness-maker/0.49.0 hm spec_mutation gate --yaml specs/SPEC-{slug}.machine.yaml --tier 1
```


Exit 1 = the predicate tests are too weak (mutants survived). **Strengthen the
assertion — never lower the threshold.** T2/T3 mutation is deferred to `/hm:loop`
or sampling; do NOT run it on this hot path. If mutmut is not installed the gate
prints a skip notice and passes (non-gating) — that is intended, not a failure.

> **Surviving-mutant classification (spec-tetrad ADR-004).** A survivor is NOT
> automatically a test gap: `spec_mutation classify` tags each as `equivalent`
> (a documented runtime no-op, e.g. a `typing.cast` string mutation — excluded
> from the denominator **with a rule-id**), `real-not-killed` (a genuine gap —
> strengthen the assertion), or `pending-review` (unknown — the default; stays
> in the denominator, so kill-rate cannot be inflated by relabeling). The
> excluded-equivalent count is shown next to the score and exclusion-set GROWTH
> warns — never silently shrink the denominator to pass.

#### Phase D.5 — Newly-reachable window (ADR-003; runs only after a repair)

**Trigger:** this PLAN phase changed code in order to **fix a defect** — a bug, a review
finding, a failing test, a regression. Pure new-feature work skips this; say so in one line
and move on. When in doubt, run it: the cost is a paragraph.

Green gates do not measure your fix. They measure the coverage that existed *before* it.
`[fail:code] fix-introduced-defect-passes-all-gates` is at **count:4** in this repo —
ratios 11/22, 7/7, 5, 11/14, each on a four-gate run that was **entirely green**, one of
them alongside a 7/7 mutation check. Every one of those repairs shipped a second defect
through the same suite that had just approved the first. The remedy has been written in
memory for months and was a step in no stage template; this is that step.

Answer all three. Write them into the PLAN phase's notes — this is a **written** artifact,
not a reflection:

1. **What input window does this repair newly make reachable?** Before the fix, some inputs
   never reached the repaired code, or reached it and were rejected early. The fix changed
   that boundary. Name the window concretely — a value range, a state, a call order, an
   absent field, a length, a concurrency interleaving. "The bug no longer happens" is not a
   window; it is the absence of one.
2. **Which test enters that window, and is it in this same commit?** Name the test by node
   id. It must exercise the newly-reachable window itself, not merely re-assert the original
   symptom. A test that only proves the reported bug is gone leaves the window it opened
   untested — that is the shape of all four recurrences.
3. **If you cannot name one: STOP and say so explicitly.** Do not advance the phase on the
   strength of a green Phase D. Either add the test now, or file the gap as a blocker with
   the window from (1) named in it, so the next reader inherits the window rather than
   rediscovering it. Silence here is the failure mode; an explicit "no fixture, here is why"
   is an acceptable outcome that a reviewer can act on.

> **Absent-case (the repo's most-recurring class, count:8).** If the repair activates on an
> optional field or a value that predates the change, the newly-reachable window includes
> the case where that input is **absent**. State the absent-case behaviour — default,
> migration, or explicit skip — and cover it. A fixture that only exercises the present case
> means the fix never fires for the data that motivated it.

### Step 4 — Stage exit (NO commit — wrapup owns commits)

When all PLAN phases complete GREEN:
1. Verify the worktree's working tree is clean of unintended drift (no stray edits outside scope).
2. **Leave changes staged or unstaged on the worktree branch — DO NOT run `git commit`.** Wrapup stage owns the single user-facing commit.
3. Update PLAN with phase status (in-progress / done / blocked) — but do NOT commit the PLAN file edit either.

If a PLAN phase blocks (Phase A.5 retry exhausted, Phase D unfixable, or ADR conflict):
- Document the blocker inline in the PLAN under the affected phase.
- Surface to the user with the blocker's exact failure output.
- Do NOT silently change scope.

### Step 4.5 — Emit Gate 0 receipt (ADR-001, ADR-005)

You have completed the stage. Emit a receipt so the autoloop driver's Gate 0 can detect missing stages at the next convergence check. Pick `<verdict>`:

- **`pass`** — Step 4 exited cleanly (all Phase D checks GREEN, no blocker filed).
- **`fail`** — Step 4 raised a blocker (Phase D unfixable, ADR conflict, test-reviewer FAIL retry exhausted).
- **`skipped`** — **DO NOT emit this value from a stage prompt.** Reserved for the autoloop driver's auto-retry escape hatch (ADR-005 of PLAN-loop-mid-stop-and-review-skip).

The shell guard below makes the receipt a no-op when `.current-iter` is absent — that file is written only by the autoloop driver at iter start. Standalone runs (no autoloop), no-isolation runs, and post-`/compact` restoration before iter 1 all skip the write naturally. This is by design — Gate 0 only reads receipts written under `iter-N` for N≥1.


```bash
!if [ -f "<WT>/.claude/.hm-iter-receipts/.current-iter" ]; then \
   ITER=$(cat "<WT>/.claude/.hm-iter-receipts/.current-iter" 2>/dev/null); \
   if [ -n "$ITER" ]; then \
     uv run --with $HOME/.claude/plugins/cache/harness-maker/harness-maker/0.49.0 hm iter_receipts write \
       --iter "$ITER" --stage execute --verdict <verdict> --root "<WT>"; \
   fi; \
 fi
```


### Step 5 — Worktree finalize

Normal flow blocks a dirty base repo during Step 0 `worktree create`. Finalize
auto-stashes base dirt only when the user explicitly bypassed that guard with
`--allow-dirty-base` or when new base dirt appeared after create. Before
invoking finalize, run `git status --porcelain` in the **base** repo (parent
of `<WT>`'s `.worktrees/`). If non-empty, surface to the user,
informationally (no question — finalize proceeds):

> "다음 파일이 base 에 dirty 상태로 있어 finalize 가 자동 stash 후 복원합니다: {file list}
> **알림:** staged 파일은 unstaged 상태로 복원됩니다 — 필요시 다시 `git add` 하세요."

You **MAY** call `AskUserQuestion` (autoloop exception) **ONLY IF** the literal substring `[finalize] stash-pop conflict` OR `[finalize] untracked-file collision` appears in finalize's stderr. Any other failure: halt with stderr message, do NOT ask.

Pick **exactly one** finalize command. Substitute `<WT>` with the literal absolute path from Step 0.


```bash
# All phases GREEN — stage-merge the branch back (NO commit) + cleanup the worktree.
# /hm:wrapup will create the single user-facing commit (with proper message + Co-Authored-By).
!uv run --with $HOME/.claude/plugins/cache/harness-maker/harness-maker/0.49.0 hm worktree finalize <WT> stage-only
```

```bash
# Stage halted on a blocker — preserve the worktree for inspection:
!uv run --with $HOME/.claude/plugins/cache/harness-maker/harness-maker/0.49.0 hm worktree finalize <WT> fail
```


If Step 0 printed empty (no isolation engaged), skip both — there is nothing to finalize.

**Record the owned uuid for wrapup's pop (ADR-001, slug crumb).** After a stage-only
finalize that deferred a stash, record THIS session's worktree uuid into a slug-keyed
crumb so `/hm:wrapup`'s `post-commit-pop` restores **only your own** deferred stash
(machine-derived, works even in a fresh/recovered wrapup window). Substitute `<slug>`
(this `/hm:execute` arg) and `<WT>` (your `execute-<uuid>-<ts>` worktree from Step 0).
On the `worktree.enabled` (flag-on) path there is no deferred stash → `wt-uuid`
of a `hm/<slug>` task worktree is empty → nothing recorded, by design.


```bash
!uv run --with $HOME/.claude/plugins/cache/harness-maker/harness-maker/0.49.0 hm worktree owned-crumb-add "$(pwd)" <slug> "$(uv run --with $HOME/.claude/plugins/cache/harness-maker/harness-maker/0.49.0 hm worktree wt-uuid <WT>)"
```


**Sequences without wrapup** (e.g. `/hm:loop --per-iter-stages execute,review`): if you exit at this stage without wrapup running afterward, the staged changes remain uncommitted on the base branch. Either run `/hm:wrapup` to commit them, or commit manually:

```bash
git commit -m "<your message>"
```

If finalize reported a deferred stash handoff or wrote
`.claude/.hm-finalize-stash-*`, run the post-commit restore after the manual
commit; otherwise the user's pre-existing WIP remains in the stash queue:


```bash
!HM_OWNED_SESSION_UUIDS="$(uv run --with $HOME/.claude/plugins/cache/harness-maker/harness-maker/0.49.0 hm worktree owned-crumb-read "$(pwd)" <slug>)" uv run --with $HOME/.claude/plugins/cache/harness-maker/harness-maker/0.49.0 hm worktree post-commit-pop "$(pwd)"
```


## Outputs

- Code + tests **staged but not committed** (commit happens in `/hm:wrapup`).
- Updated PLAN with phase status (in-progress / done / blocked) — also uncommitted.
- Optional: a SESSION-{slug}.md log if the user passes `--session` (default OFF — PLAN is the primary artifact).

## Quality Bar

- All Phase D checks GREEN at stage exit, OR the blocker is documented in PLAN.
- Every SPEC In-Scope Scenario maps to a test (when `tdd_active`).
- Phase A.5 test-reviewer returned PASS (or `--no-tdd` was set).
- No diff outside the PLAN's stated scope — surprise edits are flagged.
- No `git commit` invoked from this stage. (Verify: `git log` shows no new commit relative to stage start.)
- Worktree finalized exactly once: success or fail.



<!-- @hm:autopilot-advance -->
## Auto-advance check (autopilot — Claude Code only)

Before the STOP banner below, check whether this session runs under **autopilot** (live
auto-advance, ADR-005) — **Claude-Code-only**: it needs the `.hm-autopilot` marker (armed
by the picker) and the `Skill` tool. **This section is a NO-OP** — fall straight through
to the STOP banner, running nothing below — **if any of: no `Skill` tool (Cursor/Codex),
no active marker, or loop-mode is on for THIS session (a `.claude/.hm-loop-*` marker
matches `$HM_SESSION_ID`, or a legacy `.hm-loop-active` exists).**

**Step 1 — mandatory gate FIRST (absent-case = STOP).** Evaluate THIS stage's gate
*before* anything else: No mandatory gate — execute may auto-advance.
If the gate is pending/unresolved → record it on the ledger, then **STOP** (print the
banner). Do NOT run the boundary check — a stage that stops at its gate must not record an
advance:

!uv run --with $HOME/.claude/plugins/cache/harness-maker/harness-maker/0.49.0 hm autopilot_caps gate-blocked --root . --stage execute --session-id "$HM_SESSION_ID"

**Step 2 — boundary check (ONLY when the gate is clear).** Run the deterministic check
(it enforces the Phase-5 runaway caps + kill switch, and on proceed records the advance it
authorizes — so it must run only after Step 1 clears):

If this stage has a slug, **append** it to the command below in single quotes — e.g.
` --slug 'my-task'`. Never a shell expression or a bracketed placeholder. Omit it
otherwise; the marker keeps the earlier stage's slug.

!uv run --with $HOME/.claude/plugins/cache/harness-maker/harness-maker/0.49.0 hm autopilot_caps boundary --root . --current execute --session-id "$HM_SESSION_ID" --step-cap 20 --time-cap-min 300

Read the JSON:
- `proceed: false` → **STOP** (print the banner) — **except `bad_slug`**. `step_cap`/
  `time_cap` = a runaway cap fired (`halted_cap` logged, marker cleared); `kill_switch` =
  autopilot off/expired; `merge_gate` = the next stage is human-gated (e.g. wrapup's
  merge/land — the marker was cleared, so invoke `/hm:wrapup` manually); `unknown_stage` =
  `--current` not in the pipeline; `pipeline_complete: true` = the pipeline finished and
  the marker was cleared.
  **`bad_slug` is yours to undo**: the `--slug` you passed is invalid; nothing was
  authorized. Do NOT print the banner — re-run with a corrected slug, or no flag.
- `proceed: true` → **auto-advance**: invoke `Skill(hm:<next_stage from the JSON>)` with
  the JSON's `task_slug` as its argument (omit when `null`), instead of the STOP banner.
  **This supersedes this stage's earlier "Stage terminal … STOP"** — that governs the
  gated path, and `proceed: true` IS the authorization it asks for. `task_slug_source:
  "persisted"` means the slug came from an earlier stage — name it before invoking, so
  another task's slug cannot advance silently.
<!-- @hm:/autopilot-advance -->

## Stage summary — print before you STOP

Skip this banner entirely if loop-mode is active for THIS session (a
`.claude/.hm-loop-*` marker matches `$HM_SESSION_ID`, or a legacy
`.hm-loop-active` exists — the autoloop uses machine receipts, not prose).
Otherwise emit it as your final output, in the configured output language:
<!-- @hm:banner:end -->
> ✅ **Done:** PLAN phases implemented to GREEN; changes staged, no commit
> 📁 **Artifacts:** staged worktree changes + updated PLAN phase status
> ➡️ **Next:** `/hm:review {slug}` or `/hm:wrapup` (STOP — user-initiated)


<!-- @hm:user:extra-quality-checks -->
<!-- Project-specific quality bar items. Preserved across harness-maker upgrades. -->
<!-- @hm:/user:extra-quality-checks -->



<!-- @hm:user:extensions -->
<!-- Free-form project-specific additions to the execute stage. Preserved across harness-maker upgrades. -->
<!-- @hm:/user:extensions -->
