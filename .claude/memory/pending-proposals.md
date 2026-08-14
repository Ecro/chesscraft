# Pending proposals

Written by `/hm:wrapup` Step 5.3 when a `[fail:*]` slug reaches `count >= 3`. **Nothing reads
this file automatically** — verified 2026-08-14 against the harness-maker plugin source: 26 files
mention it, all of them documentation, and there is no CLI subcommand and no consumer. The README
says "the user reviews and decides whether to ingest", so the consumer is a person and there is no
tool to help them. harness-maker's own repo hit this first and recorded it in their CHANGELOG:
"held 17 proposals, the oldest three months old ... the escalation machinery detects recurrence
correctly, writes the recommendation, and **nothing ever read it**". Their fix was to sit down and
turn four of the seventeen into mechanical guards, and to record the reasoning for one they
implemented and then REJECTED. That is the shape of a triage pass, and this index exists so the
next one is cheap.

**Never delete an entry.** A proposal that was implemented and rejected is worth more than a
missing one — it stops the next reader re-deriving it. Merged entries keep their text in a
`<details>` block.

## Status index — triaged 2026-08-14

| Status | Proposal | Trigger count |
|---|---|---|
| **BUILT** | a no-caller sweep on every symbol a fix replaces — *partial* | declared-but-inert 8 |
| OPEN | mutate every new guard once before believing it (3 merged) | **10** combined |
| OPEN | a closed-set sweep before any fix is declared resolved | fix-scoped 7 |
| OPEN | check the comment against the code it justifies | comment-claims 10 |
| OPEN | grep the call sites when one rule has more than one caller | shared-vocabulary 5 |
| OPEN | flag a spec whose setup makes the asserted branch unreachable | test-setup-hides 6 |
| OPEN | fail a browser run that did not start its own server | foreign-server 6 |
| OPEN | a sampling/negative-instance check in the test-review gate | all-positive-fixture 3 |
| OPEN | derive phase scope from reachability, not prose | phase-scope-omits 4 |
| OPEN | assert the cue's OUTCOME, not the property that usually produces it | glyph-opts-out 3 |
| OPEN | bind non-pytest ACs, or say plainly that they are unbound | pytest-only 5 |
| OPEN | derive e2e sweep coverage from the changed selectors | gate-enumerates 3 |
| OPEN | re-evaluate persistent state at consumption | rule-keyed-to-event 3 |
| MERGED | revert the fix and watch the regression test go red | → mutate-every-new-guard |
| MERGED | revert-and-rerun as a step, not a habit | → mutate-every-new-guard |

**What the 2026-08-14 triage learned, and it applies to the whole file.** The OPEN entries split
cleanly into two kinds, and only one kind can ever be built here:

- **Repo-testable** — an invariant a test in *this* repo can assert. One was built this pass (see
  BUILT above). `bind non-pytest ACs` is also repo-adjacent but the fix belongs to the plugin.
- **Harness edits** — a step in a stage template or a line in CLAUDE.md. `mutate every new guard`
  (the highest-evidence entry in the file, combined count 10), `closed-set sweep`, `check the
  comment`, `grep the call sites` are all this kind. **They have sat here since 2026-08-06 because
  nobody can build them from inside this repo**, and that is worth saying once rather than letting
  each one look individually neglected. Ingesting them means editing the harness.

That split is the actionable output of this triage: eight of the thirteen open proposals are
blocked on a decision nobody has been asked to make, not on effort.

---
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
**Triggered by:** [fail:design] fix-scoped-to-the-cited-evidence (count: 7)
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

**Update (2026-08-08, count 5 -> 6).** The sixth instance is the cleanest statement of
the shape yet, and it survived three phases of a green suite. A measurement taken over
`bundledContentSource` — the set the RESEARCH phase happened to measure — was promoted to
the premise "no shipped record is unshowable", and a save-block was built on it. The app
loads THREE content sets; a slice piece with two effects was the counterexample, so the
block made a shipped piece uneditable. Nothing caught it until the e2e suite ran, because
every unit test was written against the same one set. What would have caught it in one
minute: the proposed sweep, plus one addition this instance argues for — **when the
closed set is a set of DATA SOURCES rather than callers, assert its cardinality**. The
fix here is `expect(SOURCES.length).toBe(3)` beside the sweep, so a fourth source cannot
join silently. That is the data-side twin of "enumerate the callers", and it is cheap.

## Proposal: derive phase scope from reachability, not prose (2026-08-06)
**Triggered by:** [fail:design] phase-scope-omits-wiring (count: 4)
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
**Status:** BUILT (partial) — see the 2026-08-14 note at the end of this entry.
**Triggered by:** [fail:design] declared-but-inert-vocabulary (count: 8)

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


**BUILT 2026-08-14 (partially) — `tests/engine/deferral-trigger-coverage.test.ts`.**
The 2026-08-08 update above concluded that the mechanism must be keyed on an ENUM rather than a
hand-written noun, because a harness surveying CARDS could not see a defect in a SQUARE TYPE. The
v12 unit produced the engine-side twin of that miss: a `freeze_piece` deferral gated on
`ctx.moverSquare != null` fired at `on_enter` (writing onto the wrong swap endpoint) and at
`end_of_ply` (queueing into an already-drained list, so the write vanished with no freeze and no
`settle:dropped` while the log still claimed the effect fired). Neither was caught by a suite;
both were caught by review.

The new test walks `LIFECYCLE_EVENTS` from the schema and asserts, per trigger, whether a
mover-targeted freeze defers — so a trigger added tomorrow joins the table without anyone
remembering to add it. It also asserts the invariant that made the `end_of_ply` bug SILENT: every
deferral must produce a settlement line, applied or dropped, because a queued write and an applied
write are otherwise indistinguishable from outside.

**Still open**, and the reason this is "partial": the content-kind coverage the 2026-08-08 update
asked for is still per-kind hand-written (`card-liveness`, `square-liveness`) rather than derived
from the schema's kind list, so a fifth content kind would repeat the original miss.

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

## Proposal: mutate every new guard once before believing it (2026-08-07, re-evidenced 2026-08-13 and 2026-08-14)
**Status:** OPEN — highest evidence in this file (combined count 10). Needs a harness edit, not a repo test.
**Also triggered by:** [fail:test] fixture-invalid-so-fallback-satisfies (count: 2) · [fail:test] green-test-that-cannot-discriminate (count: 1)
**Triggered by:** [fail:test] assertion-equals-its-own-default (count: 7)
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

**2026-08-09 — this proposal's own non-ingestion is now the evidence for it.**
`bundled-content-merge` ran the Phase A.5 `test-reviewer` gate four times, once per
PLAN phase. All four returned PASS with zero blocking issues, and **not one of them
mutated anything** — the gate reads tests, which is exactly the method this proposal
says cannot work. Two of the tests it certified could not fail. They were caught by a
cross-model voter, and then *confirmed* by mutation (`stampOf → { ids: [] }`, and
injecting the stamp-write-when-absent regression); both mutations were survived by the
originals and are killed by the rewrites. So the gate that exists to catch this class
has now passed it six times while a mechanism costing one command per guard sat
unadopted in this file for two days. Concrete ask, narrower than "add mutation
testing": make Phase A.5 require, for each authored guard, ONE named mutant and its red
output pasted into the gate's own JSON — a reviewer that cannot run code should be asked
for the mutant the AUTHOR ran, not for its own opinion about whether the assertion looks
live. Related: [[rule-checked-where-it-was-announced]], which is why reading is
structurally the wrong instrument here.

**MERGED 2026-08-14 — this entry now carries three proposals that were one idea.**
`revert the fix and watch the regression test go red` (2026-08-09,
`[fail:test] fixture-invalid-so-fallback-satisfies`) and `revert-and-rerun as a step,
not a habit` (2026-08-14, `[fail:test] green-test-that-cannot-discriminate`) said the
same thing in different words and are folded in here; their triggers are listed above.
Keeping them apart split the evidence for one mechanism across three entries and made
each look weaker than it is — combined count is 10, which makes this the highest-evidence
proposal in the file.

Three instances in the 2026-08-14 unit alone, all found by reverting and re-running, none
by review: a settlement identity guard whose removal left 16 tests green; an editor
cleared-field fallback whose removal left 96 green; and an AC whose fixtures all used a
square type that destroys IN PLACE, so pre- and post-cascade squares were never different
and an implementation threading the wrong one passed identically.

**Why it is still not built:** this is a process step, not a testable property — there is
nothing to assert about a suite from inside the suite. Its home is `/hm:execute` Phase D
prose or a CLAUDE.md line, which means it is an edit to the harness rather than to this
repo. That is the reason it has sat here since 2026-08-07 and it should be stated rather
than left implicit.

## Proposal: revert the fix and watch the regression test go red (2026-08-09)
**Status:** MERGED — MERGED into `mutate every new guard once before believing it` on 2026-08-14 — same mechanism, and splitting the evidence made both look weaker than the one they add up to.

<details><summary>original text, kept per this file's never-delete convention</summary>

**Triggered by:** [fail:test] fixture-invalid-so-fallback-satisfies (count: 2) — filed
below the count>=3 bar deliberately, because the mechanism is nearly free and this
instance was caught only by accident.
**Proposed mechanism:** rule update — one step in `/hm:execute` Phase D, for any phase
whose deliverable is described as a regression test
**Rationale:** A PLAN that says "this is the only test that would have failed before the
fix" is making a checkable claim, and nothing in the pipeline checks it. In
`bundled-content-merge` the claim was checked by hand — `initialSource` was reverted to
its pre-fix body and the file re-run — and it came back **3 of 4 failing**, with the one
passing test vacuous for a reason no gate could see: the fixture removed records without
pruning, so the document failed validation, execution took the `failedToLoad` fallback,
and that fallback returns the WHOLE current bundle, satisfying every "the new record is
present" assertion with the merge never invoked. Four green gates, a green typecheck, and
a passing test-quality review all held while that test proved nothing. The mechanism is
three commands: stash the fix, run the named test file, confirm it is red, restore. It
subsumes nothing that mutation testing does — it is cheaper and it targets the one claim
that matters for a regression gate — and unlike mutation it needs no tooling. Make it a
required Phase D line whenever a phase's exit criterion names a regression test, with the
pre-fix red output recorded next to it.

</details>

## Proposal: check the comment against the code it justifies (2026-08-07, re-evidenced 2026-08-13)
**Triggered by:** [fail:design] comment-claims-unbuilt-safeguard (count: 10)
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
**Triggered by:** [fail:test] test-setup-hides-the-failure-path (count: 6)
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
**Triggered by:** [fail:test] suite-attached-to-a-foreign-server (count: 6)
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

**Update (2026-08-08, count 5 -> 6).** Sixth instance, and the first where the wrong
target was a WORKTREE rather than a stale build. `playwright.config.ts` runs `npm run dev`
with `reuseExistingServer: !CI`, and port 5173 already held a Vite server started from the
MAIN checkout — so a worktree e2e run reported 20 failures measured against master's UI.
Two things make this instance worth the update. First, the tell was cheap and general: a
DOM probe found `form-panel-expert` live while `grep` said the source no longer contained
it, i.e. **the served tree disagreed with the read tree**. Second, and worse than the
failure: the same mechanism produces a false PASS, which nothing would have surfaced. The
per-task worktree workflow makes this reachable by default rather than by accident — any
two checkouts of this repo share port 5173. Concrete guard the proposal should now carry:
derive the e2e port from the worktree path (or refuse `reuseExistingServer` when
`git rev-parse --show-toplevel` differs from the running server's cwd).

## Proposal: bind non-pytest ACs, or say plainly that they are unbound (2026-08-08)
**Triggered by:** [fail:tooling] spec-machine-binding-is-pytest-only (count: 5)
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

**2026-08-10 (count 4):** fourth instance, wrapup Step 3.5 again — 13 of 13 ACs rejected by rule-3, machine SPEC left reading pending_test: true for a suite that is entirely green. Four instances is enough to say the mechanism is not "occasionally inconvenient" but structurally unusable on this repo; the proposal should be a non-pytest collector (vitest/Playwright node ids) rather than better reporting of the rejection.

## Proposal: grep the call sites when one rule has more than one caller (2026-08-10)
**Triggered by:** [fail:design] shared-vocabulary-unshared-code-path (count: 5)
**Proposed mechanism:** rule update (review checklist item) + a per-task grep step
**Rationale:** Three instances, and the third shows extraction is not the cure. The
first two were one vocabulary reaching two code paths (`apply` routing card plays
past the lifecycle; `spawn_piece` skipping entry). The third had the rule ALREADY
extracted into one module (`src/editor/fork.ts`) and still diverged, because what
differed was the ORDER each caller invoked it in: `RecordForm` forked then folded the
typed name onto the copy's key, `RoomDetail` folded first onto the ORIGINAL's key, and
renaming a shipped room while changing its rules renamed the shipped room too. A shared
function still has N call sites and the sequencing around each is per-site, so "we
factored it out" is not evidence.

What would have caught it is cheap and mechanical: when a rule gains a second caller,
`rg` the callers and write the test matrix over the CROSS PRODUCT of the actions each
site can perform in one operation — not one test per action. Here the room-fork test
changed composition and never renamed, the rename test changed no rule, and the
combination that broke it is one ordinary save for a child. Both per-action tests were
green and a cross-model reviewer found it by reading.

Concretely: add to the review checklist "does this change give an existing rule a second
call site? if so, name the call sites and the per-site sequencing", and make the PLAN's
phase scope list every caller rather than the module. The alternative — an automated
check — is not obviously buildable: no linter knows that two orderings of the same two
calls are semantically different.


**2026-08-10 (count 4):** now seen in the EDITOR, not just the engine — two hand-written reducers over one board model drifted on what a tap does, and extracting the shared MARKUP left both reducers duplicated. A guard would compare the reducers, not the components: any two call sites writing one schema path should be one function, and a lint or gate that flags a schema path with more than one writer would have caught all four instances.

## Proposal: derive e2e sweep coverage from the changed selectors, not from a nav affordance (2026-08-11)
**Triggered by:** [fail:test] gate-enumerates-one-axis-blind-to-others (count: 3)
**Proposed mechanism:** skill (a review/execute checklist item) + a reusable e2e helper
**Rationale:** All three recurrences share one move — the gate enumerated a MECHANISM
(`axis:kind` pairs, one-interaction pointer sequences, `.tabbar .tab` clicks) instead of the
SUBJECT it had to cover. The third instance is the cheapest to automate against: a sweep whose
coverage comes from clicking whatever navigation exists cannot reach a screen that navigation
does not expose, and it reports clean rather than reporting "unvisited". A helper that takes the
set of changed CSS selectors (or changed component files) and fails when any of them was never
rendered during the sweep would have caught it before review did. Cheaper intermediate step: make
every sweep assert a per-target "was this actually rendered at least once" counter, so the
absent case is a failure instead of a silent zero — the same shape as the `expect(count > 3)`
guards that were added by hand to this task's two new tests after the fact.

## Proposal: re-evaluate persistent state at consumption (2026-08-11)
**Triggered by:** [fail:design] rule-keyed-to-event-not-state (count: 3)
**Proposed mechanism:** rule update
**Rationale:** Three failures came from enforcing an invariant only at the event that normally creates a state, while alternate routes later reached or consumed that state without the guard. Require persistent effects to re-check their invariant at consumption time and add a transfer-path regression whenever state can outlive or change occupants.

<!-- appended 2026-08-13, wrapup of skill-legibility-and-onboarding -->

**Re-evidence for `assertion-equals-its-own-default` (count 7).** One work unit produced
five instances in a single gate, which is new information about the mechanism: they were
not careless one-offs but the *default* outcome of writing an assertion before the
implementation exists. With nothing to observe, the nearest available expected-value is
whatever the test itself can compute — which is the same thing the subject will compute.
The five were caught only by a reviewer asked the explicit question *"would this also pass
against a plausibly wrong implementation?"*, and two of them by that reviewer reading the
test's own COMMENT against what the assertion could observe. That is a cheaper trigger than
mutation testing and it belongs in the same checklist item: when a test's comment claims it
discriminates something, name the wrong implementation it would fail against, in the
comment. Where no such implementation can be named, the honest form is to say the property
is unobservable from there rather than to ship the claim.

**Re-evidence for `comment-claims-unbuilt-safeguard` (count 10).** The tenth instance
sharpens the detection heuristic: the comment argued unreachability from a *different
subsystem* than the one that decides it (a CSS rule claimed a square could never be both
impacted and a legal move target "because the ordered notice pick makes it unreachable" —
but legality is computed from the selected piece and knows nothing about notices), and the
feature's own ADR guaranteed the overlap it denied. Concrete, greppable form for a reviewer
prompt: **an unreachability claim that names a mechanism living outside the module it
constrains is a hope, not an invariant.** Both this and the `assertion-equals` cluster above
were found by the same review question, which argues for one checklist item covering both
rather than two.

## Proposal: revert-and-rerun as a step, not a habit (2026-08-14)
**Status:** MERGED — MERGED into `mutate every new guard once before believing it` on 2026-08-14, the day it was written — the search-before-write step that should have caught the duplicate ran over `failures.md` and not over this file.

<details><summary>original text, kept per this file's never-delete convention</summary>

**Triggered by:** [fail:test] green-test-that-cannot-discriminate (count: 1)
**Proposed mechanism:** rule update — one line in `/hm:execute` Phase D
**Rationale:** In a single unit, THREE fixes shipped with tests that stayed green when the
fix was reverted: a settlement identity guard, an editor cleared-field fallback, and an
AC whose fixtures all used a square type that destroys in place so pre- and post-cascade
squares were never different. None was caught by review; all three were caught by
reverting the change and re-running, which costs one command. The existing guidance says
to write discriminating tests — this is the cheap mechanical check that tells you whether
you did. Count is 1 because the entry is new, but the three instances are inside it, and
the same shape sits under `assertion-equals-its-own-default` (count 7) and
`test-setup-hides-the-failure-path` (count 6): both are what a revert-and-rerun would have
surfaced at the moment the test was written.

</details>
