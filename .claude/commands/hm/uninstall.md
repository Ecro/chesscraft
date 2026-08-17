---
generated_by: harness-maker
harness_maker_version: 0.52.5
generated_at: '2026-01-01T00:00:00+00:00'
source_template: commands/hm/uninstall.md.j2
provenance: official
description: Remove harness-maker's generated files from this project.
content_hash: a6db9d80a12053d58b19b68298ebb570ea88ff430afcb8acc0be7acaaafc71ef
---
# /hm:uninstall

> Remove harness-maker generated files from this project.

## Procedure

You (Claude) act as the orchestrator. Present consequences, confirm
intent, and dispatch the CLI.

### 1. Confirm intent

Use `AskQuestion` (Cursor) or `AskUserQuestion` (Claude Code):

> **Remove harness-maker from this project?**
>
> This will delete all harness-maker–generated files (agents, commands,
> hooks, skills, etc.) from `.claude/`. Files you customized (containing
> `@hm:user:` markers) will be **skipped** with a warning.

Options:
- **Remove generated files** — keep `harness.yaml` for future reinstall
- **Remove everything** — also delete `harness.yaml`
- **Cancel**

If **Cancel**, stop.

### 2. Preview (dry-run)

```bash
!uv run --with $HOME/.claude/plugins/cache/harness-maker/harness-maker/0.52.5 hm cli remove "$(pwd)" --dry-run
```

Show the user the file list.

### 3. Dispatch

Based on option selected:

```bash
# Keep harness.yaml
!uv run --with $HOME/.claude/plugins/cache/harness-maker/harness-maker/0.52.5 hm cli remove "$(pwd)"

# Remove everything
!uv run --with $HOME/.claude/plugins/cache/harness-maker/harness-maker/0.52.5 hm cli remove "$(pwd)" --remove-yaml
```

### 4. Post-removal

Report:
- Files removed
- Files skipped (user blocks)
- Whether `harness.yaml` was kept or removed
- "To reinstall: `/harness-maker:make`"

<!-- @hm:user:extensions -->
<!-- Project-specific /hm:uninstall overrides. Preserved across harness-maker upgrades. -->
<!-- @hm:/user:extensions -->
