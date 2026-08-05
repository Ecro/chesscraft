---
generated_by: harness-maker
harness_maker_version: 0.47.0
generated_at: '2026-01-01T00:00:00+00:00'
source_template: commands/hm/health.md.j2
provenance: official
description: Two-layer harness audit — structural integrity plus personalization drift.
content_hash: d03aa724d1c775b4637e4a41e82a301b7f27a08f1ca73a7e046bbc622dd6d414
---
# /hm:health

> Two-layer health audit (ADR-007 supersedes ADR-006; ADR-002 amended).
> Layer 1 Structural · Layer 2 Personalization.
> 100% structured-question gated — no auto-apply (ADR-001).

## Layers

| Layer | What it measures |
|-------|------------------|
| `structural`     | ai_readiness 3-layer score (CLAUDE.md, ADRs, frontmatter, etc.) + `silent_intent_miss_rate` sub-check |
| `personalization`| ADR-011 rubric: L1 conversion (0.4) + L2 stability (0.3) + L3 cadence (0.3) |

CVE detection lives in `/hm:verify` (`secscan/dependency_cves.py` via OSV.dev),
not here. ADR-0007 removed the external_risks layer after 2026-05-22 runtime
evidence showed 91% noise on a representative run.

### Layer 1 sub-check — `silent_intent_miss_rate` (ADR-008)

Reads `.claude/observability/silent-intent-miss-*.jsonl` audit logs (one per
task slug; appended by `harness_maker.observability.intent_miss.record_intent_miss`
when REVIEW flags mis-specification on a slot previously marked common-ground
at LLM-inference ≥ 0.95, or when a user reopens such a slot in-session).

Compute `silent_intent_miss_rate = miss_events / common_ground_marks_total` and
surface as a Layer 1 ActionItem when rate exceeds the calibrated threshold.
Initial default = `0.10` (10% miss); this is narrative-only for the first
release pending telemetry-driven calibration — promote to
`harness.yaml.observability.silent_intent_miss_threshold` when post-ship data
justifies a different value. When triggered, the suggested remediation is
either raising `interview.deep_gate.common_ground.llm_inference_threshold` or
flipping the ADR-012 kill-switch (`llm_inference_enabled: false`).

## Run

```bash
!uv run --with $HOME/.claude/plugins/cache/harness-maker/harness-maker/0.47.0 hm cli health . --session-id "$HM_SESSION_ID" --json-output .claude/observability/.health.tmp.json
```

Then read `.claude/observability/dashboard.md` to inspect the two sections.

## Worktree backlog drain (ADR-009)

Run the gated, biased-to-preserve worktree sweep here so the orphan-branch /
stale-marker backlog does not accumulate between `worktree create` calls (the
create-only trigger leaves it unbounded when a project pauses). It is advisory
and never deletes unmerged work — preserved branches surface as a count only.


```bash
!uv run --with $HOME/.claude/plugins/cache/harness-maker/harness-maker/0.47.0 hm worktree drain .
```


Surface the one-line summary as a Layer 1 ActionItem when the preserved count is
non-zero (`run prune-branches to review`).


## Autopilot auto-advance smoke check (PLAN-human-bottleneck-auto-advance P7, ADR-009)

`autonomy.level` is `auto_safe` (not `gated`), so autopilot CAN
auto-advance — verify it actually has. This is a **positive** check: an armed-but-never-firing
autopilot (a broken boundary CLI, a marker that never gets written, a chain that always
kill-switches) looks identical to "the user just never turned it on". Run the degradation probe:

```bash
!uv run --with $HOME/.claude/plugins/cache/harness-maker/harness-maker/0.47.0 hm autopilot_ledger smoke --root . --level auto_safe
```

Report the JSON as a Layer 1 ActionItem:
- `degraded: false` → pass (ledger has entries, or correctly off).
- `degraded: true` → **surface it**: autopilot is configured but `.claude/observability/auto-advance.jsonl`
  has zero `advanced`/`gate_blocked`/`halted_cap` entries across recent sessions — the feature
  is armed yet never fired. Likely causes: marker never written (`autopilot on` / the
  session-start picker not used), or the boundary CLI is failing. Investigate before trusting
  that "the pipeline just stops" is the user's intent.

<!-- @hm:economics-doctor -->
## Economics reader liveness (no score impact)

A **positive** smoke: a reader that silently stopped understanding the transcript format
looks exactly like "this project has no history". Measures the INSTRUMENT, never the spend
— it must never carry a cost threshold, and it feeds no readiness dimension.

```bash
!uv run --with $HOME/.claude/plugins/cache/harness-maker/harness-maker/0.47.0 hm economics doctor --root .
```

Report the JSON as a Layer 1 ActionItem:
- `status: ok` → pass. Mention `turns_priced` + `coverage`; a coverage well under ~0.9
  means partial format drift, so quote it even on a pass.
- `status: n/a` → **pass, not a finding.** No transcript store exists for this project —
  expected on a fresh clone, in CI, and under Cursor or Codex (neither writes Claude Code
  session transcripts).
- `status: fail` → **surface it.** Transcript files exist but zero turns priced: the
  reader is silently degraded, most likely a transcript-format change. Every economics
  figure reads as zero until it is fixed.
<!-- @hm:/economics-doctor -->

<!-- @hm:delivery-metrics -->
## Delivery-metrics narrative (1-2 lines, no score impact)

```bash
!uv run --with $HOME/.claude/plugins/cache/harness-maker/harness-maker/0.47.0 hm delivery_metrics trend --root . --limit 1
```

Surface ONE narrative line from the newest snapshot: CFR as raw `failed/total`
counts (+unit, or the `not_applicable` reason verbatim) and churn as
`churned/added` LOC (+`partial` flag or its `not_applicable` reason), with the
baseline deltas. Narrative-only by design — the readiness score is never
affected (Goodhart guard, SPEC Non-Goal 3). **Empty ledger (the feature has
never been run here) → print nothing but a one-line suggestion to run
`/hm:metrics` once** — the narrative only appears once there is data.
<!-- @hm:/delivery-metrics -->
## Per-item structured question (ADR-001 hard rule)

For each unresolved item across the two layers, present:
- **structural**: file-level remediation suggestion (e.g. "add docs/adr/").
- **personalization**: each ADR-011 ActionItem with priority P0/P1.

Use `AskQuestion` (Cursor) or `AskUserQuestion` (Claude Code) per item with three options:
- `accept` → apply the suggested change
- `reject` → record decision, leave alone
- `defer` → keep in queue

Append every answer to `.claude/observability/health/decisions.jsonl`.

Never auto-apply. Never batch into yes/no over multiple items.

## Autoloop behavior

Stop after writing the dashboard. The structured-question step requires
interactive mode; autoloop must not synthesize a default answer.

<!-- @hm:user:extensions -->
<!-- Project-specific /hm:health hooks. Preserved across harness-maker upgrades. -->
<!-- @hm:/user:extensions -->
