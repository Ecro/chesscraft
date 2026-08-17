---
type: spec
task_slug: ai-opponent-singleplayer
status: approved
created: 2026-08-07
tier: 2
tags: [chess-craft, spec, typescript, vitest, game-ai, single-player]
test_framework: vitest
research_doc: "[[RESEARCH-ai-opponent-singleplayer]]"
summary: "Single-player mode: a deterministic search-based AI opponent with three difficulty levels"
---

# SPEC — Single-player AI opponent

## 🎯 Intent

The game today is hot-seat only: it takes two people in the same room. A player alone has
nothing to open the app for. This SPEC adds a single-player mode in which one of the two sides is
driven by a search-based agent that plays through the *same* `legalActions` / `apply` pipeline the
human uses — so every rule card, skill card and board a player authors is automatically understood
by the opponent, with no per-card AI work.

This **supersedes** the Non-Goal recorded at `SPEC-variant-chess-6x6-cards.md:197`
(*"AI opponent. The random-action agent exists for testing (AC-012, AC-013), not as a playable
opponent."*). That line is amended by this work (AC-010) rather than left to contradict it.

## 🌅 Outcomes

A player alone can:

- Start a match against the computer from the home screen and pick one of three difficulty levels.
- Play a full match to a result — the AI drafts its own skill cards, moves its own pieces and plays
  its own skill cards, all through the existing action space.
- Reproduce or share that match: the same seed and difficulty always produce the same AI moves, so
  the seed-sharing affordance from ADR-024 keeps working in single-player.
- Beat the easiest level as a beginner without the AI ever making a move that looks broken, and
  lose to the hardest level often enough for it to be worth replaying.

What they cannot do today: any of the above. The only non-human agent in the tree is a
uniform-random test fixture (`src/engine/agent.ts`), explicitly documented as unplayable.

## 📋 In-Scope Scenarios

### AC-001: A single-player match can be started and identifies itself as one

**Given** the home screen with no match in progress
**When** the player chooses single-player and a difficulty level, then starts the match
**Then** a match begins with the human on `white` and the AI on `black`
**And** the machine-readable mode and difficulty are exposed as data attributes alongside the
existing `data-phase` / `data-side` enums, so the e2e suite can assert on them without reading
translated text
**And** the active seed remains on screen and copyable, exactly as in hot-seat

### AC-002: The AI takes its own turns through the shared action pipeline

**Given** a single-player match where it is the AI's turn — whether the pending action is a
`draft_pick`, a `move`, or a `play_card`
**When** the AI is asked for its action
**Then** it submits exactly one action that is a member of `legalActions(state, content)` for that
state
**And** the resulting state is the one `apply` produces for that action — the AI adds no code path
of its own for legality, movement or effects

### AC-003: A seeded single-player match is reproducible

**Given** a seed `S`, a difficulty `D`, and a content set inside the complexity envelope of AC-011
**When** the same sequence of human actions is replayed against a match created with `(S, D)`
**Then** the AI produces an identical action at every one of its turns, and the final state is
identical
**And** this holds regardless of how fast or how loaded the machine is, because the search is
bounded by a fixed node budget rather than by wall-clock time

*Precondition, stated rather than assumed:* the guarantee holds for content inside the envelope. A
content set that passes the envelope but still trips the wall-clock safety valve yields a
best-so-far action instead, and that match is marked non-reproducible (AC-011).

### AC-004: The AI never returns an illegal or absent action while the match is live

**Given** any reachable, non-terminal state in any loadable content set — including states where
the only legal actions are `draft_pick`s, and states where a card's target enumeration produces an
unusually wide action list
**When** the AI is asked for its action
**Then** it returns a member of `legalActions(state, content)`
**And** it returns `null` if and only if `legalActions(state, content)` is empty

### AC-005: Difficulty is monotonic in strength

**Given** the three difficulty levels, searching at the reduced surrogate node budget the strength
suite uses
**When** each level plays 200 seeds against the level below it, **each seed played twice with the
colours swapped** (400 games per pairing), so first-move advantage cancels within each pair rather
than across the sample
**Then** the stronger level scores above 0.58 in every adjacent pairing, counting a win as 1 and a
draw as 0.5, **with the lower bound of the 95% confidence interval above 0.50**
**And** the easiest level scores above 0.65 against the existing uniform-random agent over the same
paired protocol, again with a 95% CI lower bound above 0.50

*Why a surrogate budget:* at the production budget one self-play match costs roughly a minute, so
this protocol would take hours and could not gate a commit. The tournament therefore runs in its own
suite outside `npm run verify`; a smaller subset runs inside it and asserts only the sign of the
ordering. That the ladder carries from the surrogate budget to the production budget is an
assumption, checked once per release rather than per commit.

### AC-006: The easiest level plays weakly, not brokenly

**Given** a state in which at least one legal action loses the AI's king on the opponent's
immediate reply, and at least one legal action does not
**When** **any** difficulty chooses its action — the clamp applies at every level, not only the
easiest, because a clamp on one level alone can make it beat an unclamped level above it in
tactically decisive positions
**Then** it does not choose a king-losing action
**And** over 200 seeded matches its chosen action is the search's top-ranked action in more than 25%
of its turns — weakness comes from sampling temperature over the ranked list, not from discarding
the search, which a uniform-random agent at the measured mean branching factor of 23 would clear
only about 4% of the time

### AC-007: The interface stays alive while the AI thinks

**Given** a single-player match where the AI has begun searching
**When** the search is running
**Then** a dedicated thinking indicator is shown for the AI's side
**And** the hot-seat hand-off banner is **not** shown — the player is not being asked to pass the
device to anyone
**And** the interface still responds to input while the search runs: a control activated during the
search produces its visible effect within 200 ms, without waiting for the AI's move

### AC-008: Abandoning a match mid-search is clean

**Given** a single-player match with at least one applied action, where the AI is mid-search
**When** the player activates 새 판, 처음으로, or the top-level play tab
**Then** the existing confirm-before-discard dialog appears, gated on the same
`match.states.length > 1` predicate as hot-seat — no new counter is introduced
**And** on confirmation the search is abandoned and its result is discarded: no action from the
cancelled search is ever applied to any match
**And** on dismissal the match continues and the AI still produces its move

### AC-009: The AI does not see the future

**Given** two matches identical in every respect the player can observe at the AI's turn — same
position, same cards held by both sides, same open offers — but differing in draft offers that have
not yet been revealed to anyone
**When** the AI scores and chooses its action in each
**Then** the **root-action score vector is exactly equal** in both — the same actions with the same
scores, not merely the same ordering
**And** at the hardest difficulty — where selection is argmax and draws no random number — the
chosen action is identical in both

*Rationale: all randomness derives from `state.seed` via `rngFor`, so a search that simulated past a
draft boundary could compute the human's future offers. Any difference in the scores is the
observable signature of having done so.*

*Why the scores and not only the chosen action:* the two matches differ in their latent draft
stream, which means they differ in seed, which means the temperature sampler's own substream differs
too. At the two sampled levels a differing action would therefore prove nothing. Scoring is
deterministic and draws no random number, so it is sampler-independent; the hardest level's argmax
is likewise. Together they test the property without the confound.

*Why exact scores and not just the ordering:* the search's evaluation, move ordering and
transposition keys are all restricted to a projection of the state that excludes latent draft data,
so a correct implementation produces bit-identical scores. Asserting only the ordering would admit a
leak that shifts score magnitudes without swapping ranks — and magnitudes are not inert here,
because the two sampled difficulties draw from a softmax over those magnitudes.

*What the test must control:* both positions are constructed directly and each is searched with a
fresh transposition table. A table carried across two differing match histories would let path
differences reach the scores, breaking exact equality for a reason that has nothing to do with the
information boundary this criterion is about.

### AC-010: The superseded Non-Goal is amended, not left contradictory

**Given** the repository after this work
**When** `specs/SPEC-variant-chess-6x6-cards.md` is read at its Non-Goals section
**Then** the AI-opponent Non-Goal entry names this SPEC as superseding it, so the two documents do
not state opposite things about the same feature

### AC-011: Content too expensive to search is refused, not endured

**Given** a content set that passes schema validation but whose search cost — board area, movement
pattern reach, or card-target product — exceeds the calibrated complexity envelope
**When** the player attempts to start a single-player match with it
**Then** the match is refused with a message naming the offending content and the reason, and
hot-seat remains available for that same content
**And** given content that passes the envelope but still exceeds the wall-clock safety valve during
a search, the AI plays its best action found so far and the match is marked non-reproducible

*Rationale: content is user-authored, and schema validity does not bound computation. A fixed node
budget bounds nodes, not time. Without this, a legal board can freeze the tab, and the determinism
AC-003 promises would be true only of the bundled content it was measured on.*

## 🚫 Non-Goals

- **Online / networked play.** Unchanged from the parent SPEC: no server, no matchmaking, no
  authoritative remote state.
- **AI vs AI as a player-facing mode.** Self-play remains a test harness, not a screen.
- **A learned or trained evaluator.** No neural network, no weights file, no training pipeline. The
  evaluation is derived from content at runtime.
- **Per-card AI knowledge.** No card-specific heuristics or hand-written tables keyed to individual
  rule or skill cards; a new card must require no AI change.
- **Difficulty beyond three levels**, adaptive difficulty, or rubber-band balancing.
- **Opening books, endgame tablebases, or pondering on the human's turn.**
- **Changing the human-visible information model.** `viewFor` stays an identity function; this SPEC
  does not introduce fog-of-war or hide anything currently rendered.
- **Making the AI stronger than a 1-second node budget allows.** Search-speed optimization beyond
  what AC-003's budget requires is out of scope.

## ⚠️ Constraints

| Constraint | Value | Rationale |
|---|---|---|
| Test framework | `vitest` (unit/property), `@playwright/test` (e2e) | Matches the parent SPEC and the existing `npm run verify` pipeline; no new runner. |
| Search budget | Fixed **node count**, not wall-clock | AC-003. A time-budgeted search visits a different node count under different load, which would break replay determinism and make the suite flaky. |
| Response time | Median ≤ 1.0 s, p95 ≤ 1.5 s per AI action on the development desktop | Interviewed decision. Measured node cost is ~164 µs, so the node budget is chosen to land inside this; the node count is the contract, the time is the tuning target it is chosen against. |
| Interface responsiveness | No blocked input during search | AC-007. A ~1 s synchronous search on the main thread is ~26 dropped frames. |
| Randomness | Own `rngFor` substream, keyed like the existing `'agent'` domain | ADR-014. AI draws must not perturb rule draws or draft offers. |
| Action space | AI may only emit members of `legalActions` | ADR-013 — undo is outside the action space and must stay unreachable to the AI. |
| Evaluation source | Derived from the content schema at runtime | Non-Goals. A hard-coded piece table silently goes stale whenever a card ships. |
| Content complexity | A calibrated envelope gates single-player; a wall-clock valve backs it | AC-011. Schema validity does not bound computation, and a node budget bounds nodes, not time. |
| Strength-suite runtime | The tournament runs outside `npm run verify`, at a reduced surrogate budget | AC-005. At the production budget the protocol is hours of CPU and cannot gate a commit. |
| Offline | Fully functional with no network | Parent SPEC: no server. Any emitted chunk must be precached by `vite-plugin-sw`. |
| Compatibility | Existing `data-*` enum contract and `e2e/content.ts` bootstrap keep passing | The parent work's recorded lesson: a UI restructure is one unit of work with the whole e2e suite. |
| Locale | `ko` only | Parent SPEC. |

## ✅ Verification Criteria

| Scenario | Verification mode | Test name / manual step |
|---|---|---|
| AC-001 | e2e | `e2e/single-player.spec.ts` — start a single-player match, assert mode/difficulty/side data attributes and the seed control |
| AC-002 | property (unit) | `tests/engine/ai-agent.test.ts` — over generated states, the chosen action is a member of `legalActions`, and `apply` of it equals the committed state |
| AC-003 | unit + e2e | `tests/engine/ai-determinism.test.ts` — two independent runs of `(seed, difficulty)` produce identical action sequences; e2e replays a recorded human sequence |
| AC-004 | property (unit) | `tests/engine/ai-agent.test.ts` — `fast-check` over reachable states incl. draft-only and wide-branch card states; null iff no legal actions |
| AC-005 | differential (`npm run test:strength`) | `tests/engine/ai-strength.test.ts` — paired reciprocal tournament at the surrogate budget, each level vs the level below and vs `chooseAction`; asserts a point estimate plus a CI lower bound, never a specific move. Sign-only smoke subset in `tests/engine/ai-strength-smoke.test.ts` runs inside `npm run verify` |
| AC-006 | property (unit) | `tests/engine/ai-blunder-clamp.test.ts` — constructed positions with a king-losing and a safe action; **every** level never picks the former; plus the easiest level's top-rank rate |
| AC-007 | e2e | `e2e/single-player.spec.ts` — thinking indicator present, `hand-off` absent, a control responds while the search runs |
| AC-008 | e2e + unit | `e2e/single-player.spec.ts` — confirm dialog appears mid-search and the guard uses the states predicate; unit asserts a cancelled search's action is never applied |
| AC-009 | property (unit) | `tests/engine/ai-information-boundary.test.ts` — metamorphic: perturb only the unrevealed future draft substream, assert the root ranking is unchanged at every level and the argmax action is unchanged at the hardest |
| AC-010 | unit | `tests/docs/spec-consistency.test.ts` — the parent SPEC's Non-Goal entry references this slug |
| AC-011 | unit + e2e | `tests/engine/ai-complexity.test.ts` — the envelope score classifies fixture content on both sides of the bound; `e2e/single-player.spec.ts` — over-budget content refuses the mode with a reason while hot-seat still starts |

## ❓ Open Questions

None. All interview items were resolved; architecture decisions deferred to `plan` are listed below
as inputs, not as unresolved requirements.

**Deferred to `/hm:plan` as ADR material (how, not what):**
- Execution model for AC-007 — Web Worker vs main-thread yielding, and the offline-precache
  consequence of whichever emits a chunk.
- Whether the search bypasses `apply`'s internal legality re-validation for a measured ~1.7×
  (RESEARCH Q7) — a guard traded for depth, so it needs an ADR.
- How the derived evaluation reads the content schema, and how card-target enumeration is bounded
  when a single node's action list reaches the measured worst case of 200.
- The concrete node-budget constant and the three temperature values.

## 🔍 Refinement Decisions

- **Round 1 (Outcomes / Constraints)** — Three difficulty levels implemented as sampling temperature
  over ranked actions, plus a clamp so the easiest never hangs its king in one; the AI reads the
  full current state but must not derive unrevealed future draft offers; the search budget is a
  fixed node count rather than wall-clock, which preserves the parent SPEC's replay determinism; the
  target response time is ~1 s per action.
- **Round 2 (Scenarios / Non-Goals / Verification)** — Draft picks go through the same search as
  every other action, with no separate card-valuation code path; the AI's turn shows a dedicated
  thinking indicator and suppresses the hot-seat hand-off banner; a mid-search abort is allowed
  immediately and reuses the existing confirm dialog and its `states.length > 1` predicate; the
  parent SPEC's AI-opponent Non-Goal is amended in place to name this SPEC.
- **§2.5 inequality gate** — no candidate passed all five terms for two consecutive attempts; the
  remaining slots were either settled by Round 1/2 answers or belong to `plan` rather than `spec`.
- **Round 3 (amendments forced by plan-stage validation)** — a cross-model second opinion plus the
  plan validator found four defects in criteria this document had already called approved, and all
  four are amended above rather than left for `execute` to discover. AC-005's protocol was
  computationally infeasible as written (~8 h of CPU) and statistically underpowered near its own
  threshold: it is now a paired reciprocal 400-game tournament at a reduced surrogate budget, in its
  own suite, with a confidence-interval rule. AC-009's original assertion was confounded — the two
  matches it compares necessarily differ in seed, so the sampler's own randomness differs too; it
  now asserts the sampler-independent ranking plus the argmax action at the level that draws no
  random number. AC-006's clamp moved from the easiest level to every level, because a clamp on one
  level alone can invert the ladder it exists to support. AC-003 gained the content-complexity
  precondition it had been silently assuming, and AC-011 was added to make that boundary an
  observable behaviour instead of an unstated limit.
