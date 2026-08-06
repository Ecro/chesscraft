
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
