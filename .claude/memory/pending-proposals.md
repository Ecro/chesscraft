
## Proposal: a sampling/negative-instance check in the test-review gate (2026-08-06)
**Triggered by:** [fail:test] all-positive-fixture-hides-overcounting (count: 3)
**Proposed mechanism:** rule update to the `test-reviewer` agent's rubric
**Rationale:** Three occurrences, three disguises, one root cause — a fixture or a
sample that contains no instance capable of failing. (1) A three-check win condition
whose every move genuinely delivered check, so a counter that ignored the predicate
passed. (2) A duration-expiry fixture that moved the subject piece, so a square-keyed
store orphaned it and the test passed with no expiry logic at all. (3) A contrast probe
using Playwright `.first()`, which bound to a correctly-rendering rook, so the one glyph
that structurally could not pass — an emoji ignoring CSS `color` — was never measured.
Each was caught by a reviewer reading the code, never by the suite. The gate already
asks "is this assertion tautological"; it does not ask "does the set under test contain
an instance that would fail if the implementation were wrong". Two concrete checks would
have caught all three: for any fixture, name the negative instance; for any sample
(`.first()`, `[0]`, `head`, `LIMIT 1`), justify why the sampled element is the one at
risk, or iterate.

## Proposal: a closed-set sweep before any fix is declared resolved (2026-08-06)
**Triggered by:** [fail:design] fix-scoped-to-the-cited-evidence (count: 3)
**Proposed mechanism:** rule update — a step in `/hm:review`'s auto-fix loop
**Rationale:** All three instances share one shape: the remedy was verified
against the evidence that prompted it rather than against the closed set the
property has to survive. ADR numbers were checked against the three files the
validator cited while `match.ts` and `rng.ts` already owned two of the new
numbers; a `[data-theme='light']` override was hand-copied from the tokens the
author was looking at and shipped missing two; a focus ring was moved from
`outline` to `box-shadow` to escape two rules that clobbered it, into a property
a third rule was already setting at identical specificity. Every one of the
three was mechanically decidable by a sweep that takes under a minute — a
tree-wide grep for the identifier, a diff of two token blocks' key sets, a grep
for the property scoped to the element. The proposed step: before logging a fix
as applied, when the finding's subject is plural (a namespace, an override set,
a shared CSS property, a set of callers), run and record the sweep that
enumerates the whole set, and paste its output into the fix log. The tell to
match on is a finding whose subject is plural paired with a verification that is
singular.

## Proposal: derive phase scope from reachability, not prose (2026-08-06)
**Triggered by:** [fail:design] phase-scope-omits-wiring (count: 3)
**Proposed mechanism:** rule update to `/hm:plan` + a check in `/hm:execute` Step 1

**Rationale:** Five phases of one PLAN have now come back `scope_violation`, and not
once because something wrong was changed — every time because the scope list named an
OUTCOME ("overlay-aware `translate`") and omitted the files that carry it (the five
components whose every call site the change touches). The drift gate then reports a
violation that is real by its own rule and meaningless as a signal, which is the worse
failure: a gate that cries wolf five times stops being read.

Phases 4 and 5 are the only two in this PLAN whose drift came back `clean`, and both
got there the same way — by asking, before writing the scope list, *which files must
change for this to be true*, rather than describing the change.

Two concrete forms:
1. `/hm:plan` — when a phase's scope names a function whose signature changes, the
   scope list must enumerate its call sites (`rg` the symbol) or state why they are
   exempt. The PLAN already prices this risk in prose ("touches every rendering call
   site") while omitting it from the list the gate reads.
2. `/hm:execute` Step 1 — after parsing the phase, name the files the exit criterion
   makes reachable and diff that against the scope list. Surfacing the delta BEFORE
   the work is a 30-second check; surfacing it after is a drift verdict nobody acts on.
