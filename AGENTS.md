<!-- harness-maker: content_hash=7367b67f289dc1bdb7d0a818bfe656fdbd26258f343749cbd8b8e23df9863bac version=0.52.1 generated_at=2026-08-16T11:08:14.178053+00:00 -->
# AGENTS.md — harness-maker workflow guide

> **Side** preset · task-driven mode
> harness-maker  — skills are in `.agents/skills/`.

## Workflow overview

harness-maker provides 7 atomic stages.
Invoke a stage by mentioning the skill name (e.g. `@hm-execute task-slug`).

### Atomic stages

| Skill | Purpose |
|-------|---------|
| `@hm-research` | Multi-source fact-gathering; writes RESEARCH doc |
| `@hm-spec` | Acceptance-criteria specification; writes SPEC doc |
| `@hm-plan` | Phase decomposition + ADRs; writes PLAN doc |
| `@hm-execute` | TDD implementation driven by PLAN; no commits |
| `@hm-review` | Deep code review; grades A–F; writes REVIEW doc |
| `@hm-verify` | Full check suite: tests + lint + type |
| `@hm-wrapup` | Final tests, drift gate, single commit |

### Autoloop

| Skill | Purpose |
|-------|---------|
| `@hm-loop` | Bounded autoloop: interview → iterate the configured atomic stages → wrapup |

## Configuration

- `harness.yaml` — worktree isolation, loop settings, reviewer list
- Worktree isolation: enabled
- Reviewers: standard verbosity

## Quality bar

All stage skills carry their own procedures. Each skill is self-contained —
you do not need to read AGENTS.md to execute a stage; invoke the stage skill
directly and follow the embedded procedure.

## Output Language

> **Output language.** Respond to the user in **ko**
> (en→English, ko→Korean, ja→Japanese, others→English fallback) on **every turn** —
> the live chat output and the start/end summary banners, not only the onboarding
> interview. Code, identifiers, file paths, and the persisted deliverable documents
> (PLAN / RESEARCH / REVIEW / SPEC) stay in **English**.
<!-- @hm:output_language -->


<!-- @hm:user:project-rules -->
<!-- Project-specific rules (coding style, domain terms, agent invocation conventions). Preserved across harness-maker upgrades. -->
<!-- @hm:/user:project-rules -->

<!-- @hm:user:extensions -->
<!-- Free-form AGENTS.md additions. Preserved across harness-maker upgrades. -->
<!-- @hm:/user:extensions -->
