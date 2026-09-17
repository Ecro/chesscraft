---
generated_by: harness-maker
harness_maker_version: 0.57.1
generated_at: '2026-01-01T00:00:00+00:00'
source_template: skills/intent-layer/SKILL.md.j2
provenance: official
name: intent-layer
description: When the operator observed something, wants to close, approve or drop
  an objective, record a value, asks where things stand, what to do next or where
  the gaps are — run hm world verbs; ask first.
content_hash: 42a8ad6bd844f137d965395c57578b23e6699f05bd66c0a4fcecc931db15001f
---

# intent-layer

The operator does not have to remember a verb. When a request in prose fits one of the
situations in the description, translate it into exactly one of the `hm world` verbs below.


**Read freely, write only on an answer.** `hm world status --json` is read-only, LLM-free and
free to run whenever the operator asks where things stand. Every other verb writes a file.

## The verbs (full argument forms)

```
hm world status --json
hm world gap --json
hm world assume observe <id> --relation <confirms|supersedes|contradicts> --text --observed-at [--claim]
hm world assume resolve <id> --status --claim
hm world outcome record <id> --value --observed-at --evidence
hm world objective new <id> --title --hypothesis --scope --outcome [--non-scope] [--from-proposal --candidates <N> [--declined <title>]…]
hm world objective <approve|activate|drop|reopen> <id>
hm world objective close <id> --observed <met|missed|no_data> --note
hm world objective revisit <id> --json
hm world objective show <id> --json
```

Prefix each with `uv run --with $HOME/.claude/plugins/cache/harness-maker/harness-maker/0.57.1` as every other mandated call
in this harness does. `--observed-at` is a timezone-aware ISO-8601 timestamp; `supersedes`
needs `--claim`; `close` needs both `--observed` and `--note`.

## The rule for every write

1. Work out the verb and its arguments from what the operator said; read `status` first when
   an id is ambiguous.
2. Ask with `AskUserQuestion`, showing the exact arguments
   you are about to pass.
3. On an affirmative answer, run the write once with those arguments and show the CLI's
   `changed:` line.
4. Otherwise — on any other answer or no answer — write nothing. Do not retry, rephrase or infer consent.

## Proposing objectives (only when the operator asks what to do next / where the gaps are)

1. Run `hm world gap --json` — read-only, LLM-free. On `state: invalid` print the error and stop;
   on `not_filled_in` say the mission and outcomes are unwritten and stop.
2. Open with a **measure first** block: every outcome whose `reason` is `never_measured` or
   `stale_definition`, with its `how_measured` — those are gaps in evidence, not in the code.
   For the ones with `measure: true`, run `hm world outcome measure --all --dry-run` and show
   the table; the record call is `hm world outcome measure --all`, gated by
   "The rule for every write" above (ask once, run once on yes, otherwise write nothing).
3. Read the codebase against the measured outcomes' `gap` and propose **at most three**
   candidates, unranked, each with `title / hypothesis / scope / non_scope / outcome / evidence /
   overlaps-with`. A candidate for an unmeasured outcome carries
   `evidence: none — hypothesis only`. `overlaps-with` names any objective (any state,
   especially `closed` + `observed:
   missed`) or any `rejected[]` entry the candidate resembles — never silently re-propose it.
4. Then ask about each candidate in turn with `AskUserQuestion` (yes / no), and
   answer every candidate before the first write: the declined titles go into every accepted
   record's `rejected[]`.
5. Then, once per accepted candidate, show the exact arguments and run
   `hm world objective new <ID> … --from-proposal --candidates <N> --declined "<title>"…`
   (`N` = candidates shown; one `--declined` per no). Nothing else persists a candidate.
6. The record is `proposed`; the proposer never runs `approve` — that stamp is the operator's.

What the harness guarantees is narrow: the record changes only through these verbs, a terminal
objective never changes, and the autopilot gate reads the approval you record. Whether the work
serves the objective is the operator's judgment and `/hm:review`'s Step 3.3, not this skill's.
