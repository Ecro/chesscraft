
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
**Triggered by:** [fail:design] fix-scoped-to-the-cited-evidence (count: 5)
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

**Update (2026-08-06, count 3 -> 4).** The fourth instance fired the shape THREE
TIMES inside one work unit (PLAN phase 9a's review rounds), which raises the
proposal's priority and sharpens its trigger. (a) A rename repair re-derived
`<id>.name` unconditionally — correct for the derived-key record that motivated
it, silently re-homing a record keyed in a foreign namespace. (b) A
stale-document guard compared only the stored record, which its own motivating
case defeats: an import that changes a NAME leaves the record byte-identical
because the record carries only the key. (c) A discard-confirm was attached to
the one navigation path the finding named and left the three more-travelled
paths to the same remount unguarded. Note what (b) adds to the original
diagnosis: the closed set is not always a set of FILES or CALLERS that a grep
can enumerate — there it was the set of *representations a value can move
between* (record field vs overlay entry). So the sweep step needs a second
prompt beside "enumerate the callers": **name the set the reported case is one
member of, in the finding's own terms, before writing the guard.** In all three
of these the set was nameable in one sentence and was never written down.

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

## Proposal: a no-caller sweep on every symbol a fix replaces (2026-08-06)
**Triggered by:** [fail:design] declared-but-inert-vocabulary (count: 6)

**Updated 2026-08-08 — the harness now knows the shape, and still missed a whole
CONTENT KIND.** The per-record "play it and diff the board" harness the note below
asked for exists (`tests/engine/card-liveness.test.ts`, 41 cards, live AND
inert-where-it-must probes) and it did not see the 6th instance, because it
surveys CARDS and the defect was in a SQUARE TYPE. The SPEC criterion written to
prevent this class said "every new card" — authored by the same person who wrote
the square types. So the mechanism needs to be keyed on the CONTENT KIND ENUM
rather than on a hand-written noun: for every kind the schema defines
(`pieces`, `squareTypes`, `ruleCards`, `skillCards`), a coverage assertion that
every record of that kind has a probe. `square-liveness.test.ts` now does this for
square types, but it was written by hand after the fact, which is the same
position the card survey was in before its own instance.

**Updated 2026-08-07 — the mechanism above would not have caught the 4th
instance.** A no-caller sweep finds vocabulary nothing *invokes*; `rule.blood-toll`
is invoked, logs that it ran, and still does nothing, because at `on_capture` the
square its target resolves to is empty. Static analysis cannot see that — the
trigger is legal for the target, and only the runtime ordering makes it inert. So
the sweep needs a second half: **every content record must have a test that
observes a STATE CHANGE it caused**, not merely that its effect fired. The log
line `on_capture:rule:rule.blood-toll` was present and proved nothing. A
per-record "play it and diff the board" harness over the bundled set is the
shape; 26 cards is small enough to do exhaustively, and the survey has not been
run, so the number of inert cards is currently unknown.
**Proposed mechanism:** rule update — a step in `/hm:execute` Phase D and in
`/hm:review`'s fix loop
**Rationale:** All three instances are the same thing at different layers, and
the third was created BY the fix for the second. (1) `check_count_at_least` and
`own_back_rank` validated but no interpreter read them, so an authored card
passed every check and did nothing. (2) `--color-focus` and `--color-board-dark`
were declared in all three cascade layers and referenced by no selector — the
board token was the costly one, because it implied a checkered board that did
not exist and the flat board therefore read as intentional to everyone,
including the author of the audit that missed it. (3) A review finding said
deletion dropped overlay text by id prefix; the repair REPLACED that call with a
reachability walk and left `dropStrings` exported with no caller but its own
passing unit test, while the PLAN note written minutes earlier claimed the phase
had closed an instance of this very entry by giving `dropStrings` a caller.

What links them is not "dead code" in general — it is that each artifact was
left in a state that ADVERTISES capability it no longer has, and in every case a
green test or a clean validation is what made it look alive. Instance (3) adds
the trigger the first two did not have: **a fix that replaces a call site rather
than changing it makes the replaced symbol a candidate immediately**, and that
is mechanically detectable at the moment the edit is made.

The proposed step, at both sites: when a fix removes the last call to a symbol,
grep for remaining references; if the only ones are its own tests, delete the
symbol and the tests in the same change, or write down why it is being kept.
One `rg` per removed call site, and it would have caught (3) at the keystroke
rather than during a self-review two steps later. It does not catch (1) or (2),
which need the ADR-006-style coverage gates those entries already argue for —
so this proposal is the cheap half, not the whole answer.


## Proposal: assert the cue's OUTCOME, not the property that usually produces it (2026-08-07)
**Triggered by:** [fail:render] glyph-opts-out-of-its-styling (count: 3)
**Proposed mechanism:** a project e2e probe (`cue-outcome.spec.ts`) plus a note in the review rubric
**Rationale:** All three instances are the same shape and none was catchable by
reading CSS. A colour emoji ignored `color` and `font-weight`; form controls did
not inherit `color` and the UA substituted `buttontext`; an `<img>` ignored
`text-shadow`. In every case the stylesheet kept parsing, the rule stayed in the
file, and the only signal was pixels. Tests that assert the MECHANISM ("the rule
is applied", "the class is present", "the token is set") cannot see any of them,
which is why each was found by a human or a reviewer looking at a screenshot.

The probe would enumerate the elements that carry a legibility cue — board
marks, pieces, form controls — and assert the cue's *outcome* by computed style
and measured contrast: something separates this element from its background, by
whatever means. That single assertion catches all three past instances and does
not care which property delivers it, so it survives the next technology swap
too. The companion rubric line: **when one member of a styled set changes
rendering technology, grep the stylesheet for the properties the old technology
consumed** — `text-shadow`, `color`, `font-weight`, `letter-spacing`,
`-webkit-text-stroke` are all silently inert on `<img>`, `<canvas>`, `<svg>` and
`<iframe>`.

## Proposal: mutate every new guard once before believing it (2026-08-07)
**Triggered by:** [fail:test] assertion-equals-its-own-default (count: 4)
**Proposed mechanism:** rule update — a checklist item in `/hm:execute` Phase A.5 and in the review stage's auto-fix step
**Rationale:** All three instances are a test whose assertion is satisfied by the
state the code is already in, so no implementation could fail it. Reading the
test cannot reliably catch this — the fourth instance was written by someone who
had just read the failure entry and was deliberately avoiding it, and still
shipped a two-stop fixture where every position was a boundary. What DOES catch
it costs one command: break the thing the test guards, watch it go red, restore.
The rule would be "a new guard is not done until you have seen it fail", with the
mutant and its red output recorded in the PR body. Three of this session's
guards were validated exactly this way and two of them were vacuous until the
mutant proved it.

## Proposal: check the comment against the code it justifies (2026-08-07)
**Triggered by:** [fail:design] comment-claims-unbuilt-safeguard (count: 5)
**Proposed mechanism:** rule update — a review-stage heuristic, and a prompt line
for the `code-reviewer` agent
**Rationale:** Three instances, and the third landed *inside the fix for the
second*. The shape is stable enough to look for: a comment states an invariant in
the present tense ("identical hazard, identical guard", "a fork cannot be stale
by construction") and the code beneath implements a subset or the opposite. The
comment is the most reliable statement of intent in the file, which is exactly
what makes it dangerous — a reviewer reads it and stops. The heuristic is
mechanical: for every comment that asserts a property, name the line that
enforces it. When the answer is "the comment", that is the finding. Worth adding
to the reviewer's prompt because in all three cases the comment and the gap were
within ten lines of each other and a human reviewer found it in seconds once
looking for it.

## Proposal: flag a spec whose setup makes the asserted branch unreachable (2026-08-08)
**Triggered by:** [fail:test] test-setup-hides-the-failure-path (count: 4)
**Proposed mechanism:** rule update — a review-stage checklist item, plus a `/hm:execute` Phase A.5 prompt line
**Rationale:** All three instances share one shape and none was caught by running the suite,
because in every case the suite was GREEN. A clipboard spec granted the permission whose
absence was the risk; a routing spec asserted a discard-confirm in a match that had nothing
to discard, so no dialog ever appeared and BOTH outcomes it asserted are what happens with no
guard at all. The tell is mechanical and cheap to look for: the test's SETUP mentions the same
capability, state or precondition the code under test is optional about. A guard that asked
"does this test's arrange step guarantee the branch its assert step is about?" would have
caught all three at authoring time. The cheapest concrete form is an assertion that the
dangerous branch was ENTERED — count the dialogs, assert the rejected state, check the
fallback ran — rather than only asserting the outcome, since the outcome is usually reachable
without the mechanism.

## Proposal: fail a browser run that did not start its own server (2026-08-08)
**Triggered by:** [fail:test] suite-attached-to-a-foreign-server (count: 3)
**Proposed mechanism:** hook (pre-e2e) — or a `playwright.config.ts` `globalSetup`

**Rationale:** Three times now a browser suite has reported on a checkout nobody was
editing, and each time the cost was a full diagnosis cycle spent reading code that was
never loaded. `reuseExistingServer` is doing exactly what it advertises, so there is no
error to notice — the tell is the ABSENCE of one. The config already exposes `E2E_PORT`
for the parallel-worktree case and the file's own comment predicts this failure, which
helps only someone who reads it before debugging rather than after.

A guard costs two lines and cannot be forgotten: in `globalSetup`, when something is
already listening on the configured port, resolve the serving process's working directory
(`lsof -ti:<port>` then `ps -o args`) and **throw** unless it matches the repo root the
suite is running from. A worktree then fails immediately with "port 5173 is serving
/home/.../strange_chess, this suite is /home/.../.worktrees/<slug> — pass E2E_PORT",
which is the sentence three separate debugging sessions had to derive by hand.

The generalization is worth encoding beyond Playwright: any harness that can ATTACH to a
pre-existing process rather than starting one has this hazard, and the question to ask of
a green run is not "did it pass" but "what did it load".

## Proposal: bind non-pytest ACs, or say plainly that they are unbound (2026-08-08)
**Triggered by:** [fail:tooling] spec-machine-binding-is-pytest-only (count: 3)
**Proposed mechanism:** rule update — a wrapup Step 3.5 branch for non-pytest projects
**Rationale:** `spec_machine mark-tested` validates a node id through
`pytest --collect-only`, so on this TypeScript repo every AC keeps
`pending_test: true` no matter how green its vitest and Playwright tests are.
`find-unbound` then reports "OK — no missed binding", which is true of its own
model and false of the thing a reader takes from it: the machine SPEC looks
bound and is not. Three wrapups have now passed through that gap. The cheap fix
is not a vitest collector — it is honesty in the report: when the project's
`test_framework` is not pytest, the per-type coverage line should say
`bindable: 0 (framework is <name>, forward write-back is pytest-only)` instead
of a count that implies the binding was attempted and succeeded. Anything
stronger — resolving a vitest node id — is a real feature and should be priced
as one.
