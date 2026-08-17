---
type: plan
task_slug: ai-opponent-singleplayer
status: complete
created: 2026-08-07
tags: [chess-craft, plan, typescript, game-ai, tree-search, web-worker]
spec: "[[SPEC-ai-opponent-singleplayer]]"
research_doc: "[[RESEARCH-ai-opponent-singleplayer]]"
interview_rounds: 2
adrs: 11
validator_outcome: APPROVED
summary: "Alpha-beta search in a worker, content-derived eval, temperature difficulty; 5 phases"
---

# PLAN — Single-player AI opponent

## 🎯 Executive Summary

**What.** Add a single-player mode in which `black` is driven by an iterative-deepening alpha-beta
search over the existing `legalActions` / `apply` pipeline, running in a dedicated Web Worker,
bounded by a fixed node count, with three difficulty levels expressed as sampling temperature over
the ranked root actions.

**Why.** The game requires two people in one room. A player alone has nothing to open.

**Key decisions.** Alpha-beta rather than MCTS, because this engine expands ~21,000 nodes/second and
MCTS would still get only ~22 playouts per root move (ADR-001). A worker rather than main-thread chunking,
because AC-007's responsiveness then holds by construction (ADR-002). A fixed node budget rather
than wall-clock, because the parent SPEC's replay determinism is a contract this feature must not
break (ADR-003) — bounded by a content-complexity envelope plus a wall-clock safety valve, because
a node count bounds nodes, not time, and the content is user-authored (ADR-010). Strength is proven
at a reduced surrogate budget in a separate suite, because proving it at the production budget would
take hours (ADR-011).

**Estimated impact.** ~6 new source modules under `src/engine/ai/`, one new engine export, three
touched UI files, seven new test files, one e2e spec, one amended SPEC line. No new runtime
dependency.

## 📚 Prior Work

- **[[RESEARCH-ai-opponent-singleplayer]]** — supplies the measurement that decides the algorithm.
  **Corrected 2026-08-08** on a quiet machine at `23e866d`: `legalActions` ~15 µs + `apply` ~32 µs =
  **~47 µs/node** (~21,000 nodes/s); mean branching 21.6, max 200; ~45 actions per complete match.
  The first pass read ~164 µs/node because it ran under subagent CPU contention.
- **[[SPEC-ai-opponent-singleplayer]]** — AC-001…AC-011.
- **[[PLAN-variant-chess-6x6-cards]]** — ADR-013 (undo outside `legalActions`), ADR-014 (domain-
  separated PRNG substreams; the `'agent'` domain is the precedent this work follows), ADR-004
  (immutable state history).
- **`.claude/memory/failures.md`**, five entries that bear directly on this work:
  - `mode-with-no-way-out` (2026-08-07) — *"A control that puts the UI into a mode must offer a way
    back out of that mode, and 'complete the thing' is not a way out when the thing may be
    impossible."* **"The AI is thinking" is a mode.** AC-008 buys its exit; ADR-009 makes the exit
    stop the computation, not merely discard its result.
  - `counter-as-proxy-for-a-state` — the discard guard stays on `match.states.length > 1`.
  - `unasserted-fixture-premise` — a degenerate agent satisfied an entire statistical file. AC-005
    and AC-006 are distribution assertions specifically to close this.
  - `declared-but-inert-vocabulary` (count:4) — three difficulty levels that all play the same way
    is precisely this failure; AC-005 is its detector.
  - `shared-vocabulary-unshared-code-path` (count:2) — ADR-002's "worker is transport only" clause
    exists to prevent it.
- **`.claude/memory/wiki.md`** — `overlayOwnsScreen = Boolean(state.result)`; the hand-off is now a
  1.6 s `.turn-toast` banner (`data-testid="hand-off"`, `pointer-events: none`); the full-screen
  curtain and `liftCurtain` are gone, so `e2e/nav.ts`'s `move()` is two taps.

## 🎙️ Interview Transcript

SPEC inheritance: **Case A** — the SPEC was `status: approved` with an empty Open Questions section,
so the six SPEC categories were not re-asked. Round 1 resolved the four architecture items the SPEC
deferred here. Round 2 resolved the two acceptance-criteria changes forced by validation.

| # | Topic | Category | Question | Options | Choice | Note | → ADR |
|---|---|---|---|---|---|---|---|
| 1 | Execution model | Architecture | Where does the search run, given AC-007's 200 ms bound? | Web Worker / main-thread chunked yielding / worker-with-fallback | **Web Worker** | Fallback rejected as a second code path | ADR-002 |
| 2 | Validation bypass | Contract | `apply` re-derives `legalActions` to re-check legality the search already did (~1.5× measured) | `applyTrusted` + equivalence property / no optimization / optional arg on `apply` | **`applyTrusted` + property test** | Strengthened in Round 2 to a branded type after validation showed a test cannot constrain production | ADR-004 |
| 3 | Evaluation source | Architecture | How far is the evaluator derived from content? | mobility-derived material + king safety / raw piece count + king safety / + held-card value | **mobility-derived material + king safety** | Held-card valuation rejected: raises per-card maintenance | ADR-005 |
| 4 | Branching blow-up | Risk | Card-target Cartesian products reach 200 actions at one node | prune to top-N inside search / no pruning / cards at root only | **prune to top-N inside search** | `legalActions` untouched — the human must still see every option | ADR-007 |
| 5 | Strength-test cost | Testing | 600 production-budget matches is hours of CPU and cannot sit in `npm run verify` | reduced-budget separate suite + smoke / reduced-budget inside verify / manual benchmark | **reduced-budget separate suite + smoke** | Accepts that the ladder is proven at a surrogate budget; ADR-011 records what that does and does not license | ADR-011 |
| 6 | Content cost ceiling | Risk | zod validity does not bound computation; a node budget bounds nodes, not time | complexity envelope + wall-clock valve / valve only / schema limits only / accept risk | **complexity envelope + wall-clock valve** | Determinism guaranteed inside the envelope; a tripped valve marks the match non-reproducible | ADR-010 |

**Round 1 exit** — no candidate passed the 5-term gate for a second round: worker message shape,
driver ownership, temperature RNG domain and phase ordering all resolved to common ground at
confidence ≥ 0.95. The concrete node budget and temperature values failed CLARITI — they are
measurements, scheduled as Phase 5 calibration.

**Round 2 exit** — opened by the validator's MAJOR_REVISION, not by a gate candidate. The remaining
validator findings were technical corrections with a single defensible answer and were applied
without a question: the ADR-001 arithmetic, the branded trusted-action type, the parent-side draft-
boundary check, worker termination on cancel, score normalization, and the tournament's statistical
protocol.

## 📐 Architecture Decision Records

### ADR-001: Iterative-deepening alpha-beta, not MCTS
**Status:** Accepted (2026-08-07, via /hm:plan — carried from RESEARCH measurement)
**Context:** The rules are user-authored, which is the General Game Playing regime where the
literature prefers MCTS precisely because minimax *"requires game-specific heuristics to estimate
state-values"* (arXiv 2310.16581). That recommendation is conditional on simulator speed, which was
unmeasured for this engine.
**Decision:** Use negamax with alpha-beta, iterative deepening, move ordering (transposition move,
then captures by victim value, then killer moves, then card plays by static score) and a fixed-size
transposition table.
**Consequences:**
- ✅ The qualitative conclusion is robust: MCTS's playout throughput is disqualified by an order of
  magnitude regardless of the exact alpha-beta exponent.
- ✅ The evaluation problem is tractable here because the content schema exposes movement patterns
  (ADR-005), which is not true in general GGP.
- ⚠️ **The reachable depth is an estimate, not a promise** — but the estimate improved once the
  measurement was taken on a quiet machine. At the corrected mean branching factor b = 21.6 and the
  usual `b^(3d/4)` heuristic, depth 4 is ~10,000 leaves — **~0.47 s** at the plain node cost of
  47 µs, **~0.32 s** with ADR-004's trusted path — before evaluation, ordering, internal nodes and
  messaging. Depth 5 is ~100,000 leaves (~3.2 s trusted) and stays out of reach for a per-move
  budget. So: **depth 4 is the working target with real headroom**, and Phase 1's benchmark
  confirms it rather than discovering it. The response-time SLO is still met by calibrating the node
  budget (Phase 5), never by asserting a depth.
- ⚠️ **The first measurement was wrong by ~3×, and the reason is worth carrying.** It was taken
  while three subagents ran on the same machine, so it measured CPU contention as if it were engine
  cost, and it made depth 4 look marginal (~1.3 s) when it is comfortable (~0.3 s). Any future
  re-measurement of this number must run on an idle machine.
- ⚠️ A card whose value is strategic rather than material will be under-valued by the evaluator.
**Rejected alternatives:**
- MCTS/UCT — at ~47 µs per node expansion and ~45 actions per match, one random playout costs
  ~2.1 ms, giving ~470 playouts per second, i.e. ~22 per root move at b = 21.6. That is noise, and
  the same budget buys a full depth-4 alpha-beta search.
- Hybrid MCTS + shallow minimax — strictly slower per iteration than plain MCTS.
**Source:** RESEARCH §Measurements; corrected in Round 2 after validation caught that the earlier
"~8,000 nodes" figure was `20^3`, not `23^3`.

### ADR-002: The search runs in a Web Worker, and the worker is transport only
**Status:** Accepted (2026-08-07, via /hm:plan interview #1)
**Context:** A ~1 s synchronous search on the main thread is ~26 dropped frames, and AC-007 requires
input to land within 200 ms during the search.
**Decision:** The search runs in a dedicated module worker. **The worker is a transport shell: all
search logic lives in a pure, DOM-free module that the worker imports and that tests import
directly.** The worker file contains only message plumbing.
**Consequences:**
- ✅ Tests call the pure core with no worker, no fake timers and no async flakiness, while play and
  the e2e suite exercise the same core through the worker.
- ✅ `vite-plugin-sw` precaches `Object.keys(bundle)`, so a Rollup-emitted worker chunk is
  offline-safe with no plugin change.
- ⚠️ Vite only detects the worker when `new URL()` is inline inside `new Worker()` with static
  option literals; hoisting the URL silently produces a runtime fetch that is *not* precached,
  breaking offline. Phase 3 asserts the emitted chunk appears in the precache list.
- ⚠️ A worker removes search from the main thread but does **not** by itself satisfy AC-007. The
  structured clone of state on `postMessage`, and the React commit of the returned action, are
  main-thread work. The content set is therefore sent **once at worker init**, not per request, and
  Phase 3 measures clone and commit latency against the largest content the envelope admits.
**Rejected alternatives:**
- Main-thread chunked yielding — `requestIdleCallback` runs *on the main thread* and MDN warns that
  without a `timeout` *"multiple seconds will elapse before the callback is fired"*.
- Worker with a main-thread fallback — two code paths for one vocabulary, the
  `shared-vocabulary-unshared-code-path` failure recorded twice in this repo's memory.
**Source:** Interview #1; hardened in Round 2

### ADR-003: The search budget is a fixed node count, never wall-clock
**Status:** Accepted (2026-08-07, via /hm:spec interview, promoted here)
**Context:** The parent SPEC's AC-004 asserts full-match replay determinism, and ADR-024 surfaces
the seed as a shareable artifact. A time-budgeted search visits a different node count under
different machine load.
**Decision:** The search terminates on a node counter. Wall-clock appears only as the target the
budget constant is calibrated against (Phase 5), and as ADR-010's safety valve — which is a failure
path, not a budget.
**Consequences:**
- ✅ `(seed, difficulty)` fully determines the AI's move sequence inside the content-complexity
  envelope, so seed-sharing keeps working and AC-003 is testable without timing tolerances.
- ✅ No flaky tests: the suite never races the clock.
- ⚠️ A slow device takes proportionally longer per move rather than playing weaker.
- ⚠️ Determinism is conditional on ADR-010's envelope. Outside it, the valve can fire and the match
  is marked non-reproducible. This is a real narrowing of the guarantee and AC-003 states it.
**Rejected alternatives:**
- Wall-clock budget as the primary bound — would make AI matches irreproducible and the strength
  tests machine-dependent.
**Source:** SPEC Constraints; RESEARCH Pitfall 1; narrowed in Round 2

### ADR-004: `applyTrusted` takes a branded action that only `legalActions` can mint
**Status:** Accepted (2026-08-07, via /hm:plan interview #2; strengthened Round 2)
**Context:** `apply` opens with `if (describeRejection(state, action, content) !== null) return
state` (`engine.ts:649`), re-deriving the full legal-action list. The search selects its action *from*
that list, so it pays the cost twice — measured ~32 µs, of which roughly half is the duplicate
check and ~17 µs the actual state transition.
**Decision:** Export `applyTrusted(state, action: TrustedAction, content)`, which performs the
transition without the legality pre-check. `TrustedAction` is an opaque branded type whose only
constructor is the engine's own generation step, so an action the generator did not produce **cannot
be passed to `applyTrusted` at compile time**. A property test additionally asserts
`applyTrusted(s, a) === apply(s, a)` for every `a` in `legalActions(s)` over generated states.
**Consequences:**
- ✅ ~1.5× more nodes in the same budget (a node falls from ~47 µs to ~32 µs).
- ✅ The guard is enforced by the type system in the shipped artifact, not by an assertion that a
  production build strips.
- ⚠️ Generation and expansion must stay adjacent — the search cannot cache an action across a state
  it was not generated for. The branded type makes this a convention the compiler cannot check;
  Phase 1 keeps mint-and-use in one function.
**Rejected alternatives:**
- A debug-build assertion (the Round-1 answer) — provides zero protection in production, where the
  described failure is a silent wrong-state corruption at an internal node that AC-002's root-only
  check cannot see.
- No optimization — costs ~40% of search depth at the same response time.
- An optional pre-computed-list parameter on `apply` — puts a performance-only argument in a
  signature every existing caller must read past.
**Source:** Interview #2; validator finding C8 / codex `c5bf941beddbc2e6`

### ADR-005: Evaluation is derived from content, never hand-tuned per card
**Status:** Accepted (2026-08-07, via /hm:plan interview #3)
**Context:** Rules and pieces are user-authored. A hard-coded piece-value table goes stale the moment
a card ships — the risk `RESEARCH-variant-chess-6x6-cards.md:255-257` raised and no ADR closed.
**Decision:** Evaluate as mobility-weighted material plus a king-safety term. A piece's weight is
computed from the reach of its `MovePattern` on the current board; the king term reads
`state.checkCount` and immediate king-capture availability. No table is keyed to a piece id, a rule
card id or a skill card id. **The evaluation returns a score on a fixed, documented scale** so
ADR-006's temperature has a stable meaning.
**Consequences:**
- ✅ A newly authored piece or card requires zero AI changes.
- ✅ Consistent with the engine's own tiebreak: `materialResult` already decides the ply cap by piece
  count.
- ⚠️ Held skill cards contribute nothing to the score, so draft picks are valued only through the
  short horizon the search can see.
**Rejected alternatives:**
- Raw piece count — treats a rook and a pawn identically.
- Adding held-card value — requires reading the card effect schema, edging toward the
  per-card-knowledge Non-Goal.
**Source:** Interview #3

### ADR-006: Difficulty is temperature over normalized ranked scores; the safety clamp applies to every level
**Status:** Accepted (2026-08-07, via /hm:spec interview, promoted and corrected here)
**Context:** Depth-limiting alone produces *alien* rather than *weak* play. But temperature is only
monotonic in strength if the score scale is well-behaved: saturated gaps make every temperature
behave like argmax, near-tied scores make every level near-uniform.
**Decision (amended 2026-08-08 by measurement).** Root actions are scored, the scores are
**normalized to a documented scale before softmax** (the scale is ADR-005's, and the candidate
support is the top-K actions, both named constants), and one action is sampled at a per-level
temperature (hardest = 0, i.e. argmax, deterministic without any RNG draw). **The king-safety clamp
applies at every level**, not only the easiest.

The original decision added "all three levels search with the same node budget" — difficulty as
selection, not sight. **That did not survive the tournament.** At the full 400-game protocol the
planned temperatures gave `hard vs medium 0.536` (95% CI 0.489–0.584, i.e. indistinguishable) and
`medium vs easy 0.564`; raising medium's temperature to clear the first collapsed the second to
0.538, because making the middle level weaker moves it away from the top and toward the bottom
simultaneously. The cause is the evaluator: it scores material and check and nothing else, so in
many positions every candidate scores identically, and a softmax over equal numbers is uniform at
any temperature. Temperature only bites where the evaluation already discriminates.

So the **reserved second knob is now in use**: `BUDGET_SHARE` — hard 1.0, medium 0.45, easy 0.15 of
whatever budget is passed.
**Consequences:**
- ✅ Weak play stays inside the plausible set; strength degrades on one knob.
- ✅ Applying the clamp uniformly removes the inversion the validator identified, where an
  easy-only clamp could beat an unclamped medium in tactically decisive positions. At the hardest
  level it is *usually* redundant, because a search that reaches the reply already scores the
  blunder away — but it is not unconditionally so: ADR-001 does not guarantee the depth, and
  ADR-007's expansion cap prunes some replies from view by construction. Where the search's bounded
  view missed the reply, the clamp is a safety net rather than a no-op.
- ✅ The hardest level draws no random number at all, which is what lets AC-009 be tested on a
  sampled action rather than only on rankings.
- ⚠️ **A shallower search can miss a tactic in a way that looks alien rather than weak** — the exact
  objection that made depth-limiting the rejected option below. Two things hold it: the clamp runs
  at every level, so the catastrophic version cannot happen, and the reduction is a fraction of the
  budget rather than a depth cap, so every level still completes a real search.
- ⚠️ The easier levels are now cheaper to run, which was not true of the original decision.
- ⚠️ **Monotonicity is an empirical outcome, not an architectural guarantee.** If AC-005 fails, the
  suspects are, in order: the normalization scale, the candidate support K, the temperatures, and
  only then the evaluator. Reserved second knob: a reduced node budget for the easier levels.
**Rejected alternatives:**
- Depth/iteration limiting per level — produces the alien-move failure.
- Random blunder injection — worst-feeling of the three in the reviewed sources.
- Easy-only clamp (the Round-1 answer) — creates a possible strength inversion.
**Source:** SPEC AC-005/AC-006; RESEARCH Pitfall 4; validator finding C6 / codex `c8a1temp`

### ADR-007: Card-target pruning lives in the search, never in `legalActions`
**Status:** Accepted (2026-08-07, via /hm:plan interview #4)
**Context:** `cardPlays` enumerates the Cartesian product of target slots (`engine.ts:301-322`),
measured at up to 200 actions in one node against a mean of 23.
**Decision:** The search orders card-play actions by a cheap static score and expands only the top N
per node. `legalActions` is not modified.
**Consequences:**
- ✅ Worst-case *expansion* branching becomes bounded.
- ✅ The human still sees every legal card target — the generator is untouched.
- ⚠️ **This bounds expansion, not generation.** `legalActions` has already materialized the full
  product by the time the search prunes it, so pruning does nothing for generation cost. That
  residual is what ADR-010 exists to bound.
- ⚠️ The AI can miss a card play whose value is invisible to the ordering heuristic.
**Rejected alternatives:**
- No pruning — a single wide node consumes the whole budget; reproducible, so it would never look
  like a bug.
- Cards at root only — blinds the search to the opponent's card replies.
**Source:** Interview #4

### ADR-008: The draft boundary is detected from the parent, and boundary nodes are scored on a projected state
**Status:** Accepted (2026-08-07, derived from SPEC AC-009; mechanism specified in Round 2)
**Context:** Draft offers are drawn inside `apply` as a side effect of ply completion (`bumpTurns`,
`engine.ts:837`), so a search that expands past the second draft *computes the human's future offers
exactly*. Detecting this after the transition is too late: by then the child state already carries
`offers` and `everOffered`, and any evaluation, move ordering or transposition key computed over the
full state reads them.
**Decision:** Two rules, both mechanical:
1. **Parent-side detection.** Before transitioning, the search asks whether the action would trigger
   the second draft for the moving side. This is a pure function of the parent:
   `draft.completedTurns + 1 === SECOND_DRAFT_AFTER_TURNS && draft.draftIndex === 1 &&
   draft.offers === null`, plus the pool-size test `bumpTurns` itself applies
   (`engine.ts:843-856`). Such an action is **not expanded**; the node is scored statically.
2. **Projection.** Evaluation, move ordering and transposition keys are computed over an observable
   projection of the state that excludes latent draft data, so no later code path can reintroduce
   the leak. **The projection excludes `state.seed` itself, not only `offers` and `everOffered`.**
   This is the non-obvious half: the two matches AC-009 compares necessarily differ in seed, so a
   Zobrist key or ordering heuristic that reads `seed` directly would diverge the node exploration
   order between them — and under a fixed node budget a different exploration order can exhaust the
   budget on different nodes and yield different scores, breaking AC-009 for a reason that looks
   nothing like an information leak. Per-match Zobrist derivation keys off the **content**, which
   is identical in both.
**Consequences:**
- ✅ AC-009 passes by construction rather than by an outcome-level coincidence, and the projection
  makes a regression localizable to the code that broke it. Because the projection makes scoring a
  pure function of observable state, AC-009 can assert **exact score equality**, not merely equal
  ranking — which closes the leak class that shifts magnitudes without swapping ranks, and those
  magnitudes matter because ADR-006's two sampled levels draw from a softmax over them.
- ✅ No masking layer is needed; `viewFor` stays the identity function the SPEC's Non-Goals require.
- ⚠️ Effective lookahead shortens as a side approaches its fifth completed turn.
- ⚠️ `SECOND_DRAFT_AFTER_TURNS` is 5, not 6; the check must read the constant, not a literal.
**Rejected alternatives:**
- Child-side detection — the leak the validator and codex both identified.
- Masking `GameState` through a real `viewFor` — a much larger engine change that would also hide
  from the AI information the screen already shows the player.
**Source:** SPEC AC-009; validator finding C3 / codex `4a289d4fa81dbcde`

### ADR-009: `App` owns the mode, `MatchHost` drives the AI turn, and cancelling terminates the worker
**Status:** Accepted (2026-08-07, derived from recorded component ownership; extended Round 2)
**Context:** `App` — not `MatchHost` — owns match lifecycle and unmount, and the confirm-before-
discard guard keys on `match.states.length > 1`. `MatchHost` owns `push` (`MatchHost.tsx:295`), the
single call site through which any action reaches the match.
**Decision:** Mode and difficulty are chosen on the home screen and passed by `App` into `MatchHost`
as props. `MatchHost` runs an effect that, when the side to move is the AI's and the match is live,
requests a move from the worker client and feeds the result through the **existing** `push`. The
client carries a monotonic `requestId` so a stale result is dropped, **and cancellation terminates
and respawns the worker** rather than only ignoring its answer.
**Consequences:**
- ✅ The discard guard, sound, hand-off classification and history keep working unchanged, because
  every action still arrives through one function.
- ✅ Terminating on cancel means the next request cannot queue behind abandoned work — the failure
  the validator identified, where `requestId` satisfies AC-008's letter while the single worker
  stays occupied and the *next* move breaches AC-007.
- ⚠️ Respawn costs a worker start and a content re-send per cancellation. Cancellation is rare
  (abort, unmount, undo), so this is paid on the exceptional path only.
**Rejected alternatives:**
- Driving the AI from `App` — `App` does not hold the position and would need a second commit path.
- `requestId` alone (the Round-1 answer) — stops application, not computation.
**Source:** `.claude/memory/wiki.md`; ADR-024 of PLAN-ui-ux-productization; validator finding C7 /
codex `ec4f299706252625`

### ADR-010: A content-complexity envelope, with a wall-clock valve behind it
**Status:** Accepted (2026-08-07, via /hm:plan interview #6)
**Context:** zod validity does not bound computation. A user-authored board, movement pattern or
card-target space can make one `legalActions` or `apply` call orders of magnitude slower than the
measured ~15/32 µs — and ADR-007's pruning cannot help, because generation has already happened. A
node budget bounds nodes, not time, so the response-time constraint has no floor under authored
content.
**Decision:** Two layers.
1. **Envelope.** At content load, compute a complexity score (board area, per-piece pattern reach,
   maximum card-target product) and compare it to a calibrated bound. **The bound is defined by
   time, not by the bundled content:** it is the score at which measured per-move search time
   reaches the p95 response-time SLO. Anchoring it to a multiple of the shipped preset would be
   circular — calibrating the gate against the very content the gate exists to admit — so the
   multiple in the provisional-constants table is a placeholder standing in for a measurement Phase
   5 makes, not the definition. Content inside the envelope carries the determinism guarantee and
   the response-time constraint. Content outside it **cannot start a single-player match**; the mode
   is refused with a reason naming the offending content.
   The score must itself be cheap — it is a static walk over the content's declarations, not a
   search — or the envelope reproduces the cost it exists to prevent.
2. **Valve.** The worker additionally holds a wall-clock ceiling well above the calibrated budget.
   Tripping it returns the best action found so far and marks the match non-reproducible in the UI.
   It is a backstop for content that passes the envelope and is still slow, not a budget.
**Consequences:**
- ✅ The determinism guarantee becomes true-as-stated rather than true-for-bundled-content.
- ✅ A refusal is a comprehensible message; a frozen tab is not.
- ⚠️ Some authored content will be playable in hot-seat but not against the AI. This is a real
  product limitation and the refusal copy must say so plainly.
- ⚠️ A tripped valve breaks AC-003 for that match by design; AC-003 states the precondition and
  AC-011 tests the refusal and the marking.
**Rejected alternatives:**
- Valve only — nothing refuses, but determinism silently degrades with no signal to the player.
- Schema-level limits only — pushes the constraint into the editor and can invalidate content
  players have already authored.
- Accept the risk — leaves the AI able to hang the tab on legal content.
**Source:** Interview #6; validator finding C4 / codex `ad00914a302dcbba`

### ADR-011: Strength is proven at a reduced surrogate budget, in a suite outside `npm run verify`
**Status:** Accepted (2026-08-07, via /hm:plan interview #5)
**Context:** AC-005 needs enough games for statistical power, but at the production budget
(~0.6 s/move × ~45 moves) one self-play match costs ~30 s and the full protocol is still hours of
CPU. It
cannot gate every commit.
**Decision:** The tournament runs at a **reduced node budget** (a named constant, orders of
magnitude below production) in `npm run test:strength`, a suite outside `npm run verify`. A much
smaller smoke subset runs inside `verify` and asserts only that the ordering has the right sign, not
the thresholds. The protocol is **paired reciprocal**: every seed is played twice with the colours
swapped, so first-move advantage cancels within the pair rather than being hoped away by seed
parity.
**Consequences:**
- ✅ The gate is affordable, well-powered and colour-unbiased.
- ✅ `npm run verify` stays fast, so the ordering is still checked on every commit at low resolution.
- ⚠️ **The ladder is proven at the surrogate budget, and that the ordering carries to the production
  budget is an assumption, not a result.** Phase 5 re-runs the full tournament once at the
  calibrated production budget as a release check and records the number; it is not a per-commit
  gate.
- ⚠️ A reduced budget shortens the search, so scores are noisier per game — which is exactly why the
  protocol is sized for power rather than at a round number.
**Rejected alternatives:**
- Reduced budget inside `verify` — the only affordable sample size there is too small to catch a
  ladder inversion.
- Production-budget manual benchmark only — removes the automated backstop against the
  `declared-but-inert-vocabulary` regression this AC exists to catch.
**Source:** Interview #5; validator finding C2

## 🏗️ Technical Design

### Current state

`src/engine/` is a pure, framework-free core: `legalActions(state, content)` generates,
`apply(state, action, content)` transitions, `Match` is the immutable state history, and
`rngFor(seed, ...domain)` supplies domain-separated determinism. `src/engine/agent.ts` holds a
uniform-random agent documented as a test fixture. `src/ui/MatchHost.tsx` owns `push(action)` at
line 295; `src/ui/App.tsx` owns lifecycle. There is no search, no evaluation and no worker anywhere.

### Affected components

| Component | Change |
|---|---|
| `src/engine/ai/evaluate.ts` (new) | Content-derived static evaluation on a documented scale (ADR-005) |
| `src/engine/ai/search.ts` (new) | Pure negamax + alpha-beta + ordering + TT + node budget + parent-side draft cut (ADR-001/003/007/008) |
| `src/engine/ai/difficulty.ts` (new) | Normalization, top-K support, temperature sampling, universal safety clamp (ADR-006) |
| `src/engine/ai/complexity.ts` (new) | Content-complexity score and envelope test (ADR-010) |
| `src/engine/ai/worker.ts` (new) | Message plumbing and the wall-clock valve only (ADR-002/010) |
| `src/engine/ai/client.ts` (new) | Request / cancel (terminate + respawn) / result, with `requestId` (ADR-009) |
| `src/engine/engine.ts` | Adds `applyTrusted` and the `TrustedAction` brand (ADR-004) |
| `src/ui/Home.tsx` | Mode + difficulty selection; envelope refusal copy |
| `src/ui/App.tsx` | Carries mode/difficulty into `MatchHost` (ADR-009) |
| `src/ui/MatchHost.tsx` | AI turn effect, thinking indicator, hand-off suppression, cancellation |
| `src/i18n/ko.ts`, `src/ui/styles.css` | Mode/difficulty/thinking/refusal strings and the indicator's style |
| `e2e/nav.ts` | An `awaitAiReply` helper — `move()` returns after two taps and the AI answers asynchronously |
| `specs/SPEC-variant-chess-6x6-cards.md` | Non-Goal amended (AC-010) |

### Dependencies

None added. Worker, `structuredClone` and typed arrays are platform features.

### Data flow

```
Home  --(mode:'single', difficulty)-->  App  --props-->  MatchHost
   |                                                        |
   +-- complexity.ts: envelope test                         | sideToMove === aiSide && !result
       (outside envelope -> refuse, with reason)            v
                                                      ai/client.ts
                        init once:  postMessage({content})   |   cancel: worker.terminate() + respawn
                        per turn :  postMessage({state, seed, difficulty, budget, requestId})
                                                            |
                                                    [ worker thread ]
                                            ai/worker.ts  (plumbing + wall-clock valve)
                                                            |
                                              search.ts  (pure; tests call here directly)
                                       legalActions / applyTrusted / evaluate / parent-side draft cut
                                                            |
                                        difficulty.ts (normalize -> top-K -> clamp -> temperature)
                                                            |
                                <--postMessage({action, nodes, requestId, valveTripped})--
                                                            |
                                                            v
                                        MatchHost.push(action)   <-- the ONLY commit path
```

### Design decisions

- The search core is imported by both the worker and the tests (ADR-002); no logic lives in
  `worker.ts` beyond plumbing and the valve.
- The AI's temperature draw uses `rngFor(seed, 'ai', plyCount, draftsResolved, side)` — its own
  substream keyed like the existing agent's, so replaying re-derives it without carrying state.
  At the hardest level the sampler is argmax and draws nothing.
- The content set is sent **once at worker init**; per-turn messages carry only the state.
- The transposition table is a preallocated typed array with mask indexing and depth-preferred
  replacement, sized once — not a growing `Map`.
- Zobrist keys are derived per match, because the piece set changes with content.

### API changes

Two new engine exports: `applyTrusted` and the `TrustedAction` brand. No change to `legalActions`,
`apply`, `Match`, `GameState` or `Action`. `MatchHost` gains two optional props (`aiSide`,
`difficulty`); absent means hot-seat, the existing behaviour.

### Provisional constants (Phase 1–4 use these; Phase 5 calibrates them)

| Constant | Provisional value | Set finally by |
|---|---|---|
| Production node budget | 20,000 (≈ 0.64 s on the trusted path at the corrected 32 µs/node) | Phase 5, against median ≤ 1.0 s / p95 ≤ 1.5 s |
| Surrogate tournament budget | **1,000** — set in Phase 1 from measurement, not guessed. Share of roots completing a depth ≥ 2 search: 250 → 0.52, 500 → 0.77, 1,000 → 1.00. The first guess of 250 left half the roots ranking by static evaluation, which is the degenerate surrogate ADR-011 exists to forbid | Phase 2, against suite runtime |
| Candidate support K | 6 | Phase 5, with the temperatures |
| Temperatures (hard/medium/easy) | 0 / 0.35 / 1.0 | Phase 5 |
| Card-target expansion cap N | 8 | Phase 5 |
| Wall-clock valve | 5 s | Phase 5 |
| Content-complexity bound | *definition:* the score at which measured per-move search time reaches the p95 SLO. Provisional placeholder while that measurement does not exist: 4× the bundled preset's score | Phase 5, from measurement |

## 📝 Implementation Plan

### Phase 1 — Search core, evaluation, and the trusted apply path
- **Status:** DONE (2026-08-08). Typecheck clean, `npm run build` clean, full suite 503/503 across
  59 files. Test-reviewer gate PASSed on attempt 3 — attempts 1 and 2 both caught real
  `unasserted-fixture-premise` holes (AC-002's `play_card` kind was never asserted; AC-004's
  wide-card-target premise was claimed in prose and not in code).
- **Notes:**
  - Two constants were set from measurement rather than the guesses this PLAN carried.
    `SURROGATE_NODE_BUDGET` moved 250 → 1,000: at 250 only **0.52** of roots completed a depth ≥ 2
    search, which is the degenerate surrogate ADR-011 forbids.
  - `tests/structure/no-content-in-engine.test.ts` caught a doc comment in `evaluate.ts` that named
    a bundled piece id — the parent PLAN's own "the engine names no content" rule, working.
  - Root children are searched with a FULL window rather than a narrowing one. Root-level pruning is
    given up on purpose: ADR-006 samples over the score vector and AC-009 asserts it is equal
    between two positions, and neither survives if most of the vector is a bound rather than a value.
- **depends_on:** `[]`
- **parallel_group:** `serial-core`
- **merge_hazards:** `src/engine/engine.ts` (adds two exports; no other phase edits this file)
- **Scope in:** `src/engine/ai/evaluate.ts`, `src/engine/ai/search.ts`, `src/engine/engine.ts`,
  `tests/engine/ai-agent.test.ts`, `tests/engine/ai-information-boundary.test.ts`,
  `tests/engine/apply-trusted.test.ts`, `tests/engine/ai-bench.test.ts`
- **Scope out:** `src/ui/`, the worker, difficulty sampling, the complexity envelope
- **Exit criterion:** `npx vitest run tests/engine/` passes, covering AC-002, AC-004, **both halves
  of AC-009** — the score-vector equality and the hardest level's argmax-action equality, the latter
  computed directly from `search.ts`'s own best-move output without needing `difficulty.ts` — and
  ADR-004's equivalence property — **and** `ai-bench.test.ts` writes a
  completed-depth distribution at the provisional budget, so ADR-001's depth-4 estimate is either
  confirmed or replaced with the measured number before any later phase depends on it
- **Risk:** medium — ADR-008's parent-side cut and the projection are the subtlest rules here
- **Rollback:** initial state of the branch

### Phase 2 — Difficulty layer and the strength tournament
- **Status:** DONE (2026-08-08), with **ADR-006 amended by measurement**.
- **Notes:**
  - **Temperature alone could not build the ladder.** Measured at the full 400-game protocol:
    `hard vs medium 0.536` (CI 0.489–0.584 — a coin flip) and `medium vs easy 0.564` at the planned
    temperatures. Raising medium's temperature to separate it from hard immediately collapsed it
    toward easy (0.579 / 0.538): making the middle weaker moves it away from the top and toward the
    bottom at once.
  - The cause is the evaluator, not the sampler. It scores material and check and nothing else, so
    in many positions every candidate scores IDENTICALLY — and a softmax over equal numbers is
    uniform at any temperature. ADR-006's own diagnosis order named this.
  - So the **second knob ADR-006 reserved was used**: `BUDGET_SHARE` (hard 1.0 / medium 0.45 /
    easy 0.15). The clamp at every level is what keeps a shallower search from looking alien rather
    than weak — the reason depth-limiting was rejected in the first place.
- **depends_on:** `[1]`
- **parallel_group:** `serial-core`
- **merge_hazards:** `package.json` (adds the `test:strength` script)
- **Scope in:** `src/engine/ai/difficulty.ts`, `tests/engine/ai-strength.test.ts`,
  `tests/engine/ai-strength-smoke.test.ts`, `tests/engine/ai-blunder-clamp.test.ts`, `package.json`
- **Scope out:** UI, worker, envelope
- **Exit criterion:** `npm run test:strength` passes at the surrogate budget — AC-005's three
  pairings each clear their point-estimate threshold with a 95% CI lower bound above 0.50 over 400
  paired games — and `npx vitest run tests/engine/ai-strength-smoke.test.ts
  tests/engine/ai-blunder-clamp.test.ts` passes inside the normal suite. **This pass is provisional
  pending Phase 5's calibration** (ADR-011).
- **Risk:** medium — if the levels do not separate, the suspects in order are normalization, K,
  temperatures, then the evaluator
- **Rollback:** Phase 1

### Phase 3 — Worker transport, cancellation, and the content-complexity envelope
- **Status:** DONE (2026-08-08). Build emits `worker-*.js` as its own 85 kB chunk; the build suite
  asserts it is in `sw.js`'s precache list AND absent from the entry chunk.
- **Notes:**
  - The worker is transport only: `engine-side.ts` holds the session and the tests import it
    directly, so the shipped path and the tested path are the same code.
  - `withinEnvelope` refuses an **unscoreable** preset rather than admitting it. A missing board
    scores zero, and zero is under every bound — `empty-collection-is-not-absent`, caught by writing
    the test before the implementation.
- **depends_on:** `[2]`
- **parallel_group:** `serial-core`
- **merge_hazards:** `vite.config.ts` if worker options prove necessary; the emitted chunk name
  affects `vite-plugin-sw`'s precache list
- **Scope in:** `src/engine/ai/worker.ts`, `src/engine/ai/client.ts`, `src/engine/ai/complexity.ts`,
  `tests/engine/ai-determinism.test.ts`, `tests/engine/ai-complexity.test.ts`,
  `tests/build/worker-precache.test.ts`
- **Scope out:** UI wiring
- **Exit criterion:** `npm run build && npx vitest run --config=vitest.build.config.ts` passes with
  an assertion that the emitted worker chunk appears in `sw.js`'s `PRECACHE`; AC-003 passes
  identically through the direct core call and the worker round-trip; a test asserts a cancelled
  request's worker is terminated and a following request is not queued behind it; measured
  `postMessage` clone and commit latency at the envelope's upper bound is recorded. **The
  complexity-envelope half of this pass is provisional pending Phase 5's calibration** — the
  fixtures straddle the provisional bound, and a calibrated bound can move one of them across it
- **Risk:** medium — Vite's `new URL()` inline requirement fails silently into a runtime fetch
- **Rollback:** Phase 2

### Phase 4 — Single-player UI
- **Status:** DONE (2026-08-08). `npx playwright test e2e/single-player.spec.ts` 6/6.
- **Notes:**
  - **A real bug the tests caught:** the AI-turn effect first keyed on `state.sideToMove`, which a
    draft pick does not advance — so the computer never made its own picks and the match simply
    stopped. The acting side during a draft is `pendingDraftSide(state)`. This is the same shape as
    `counter-as-proxy-for-a-state`: the obvious field is not the one that means what you need.
  - The e2e suite initially ran against **another session's dev server** on port 5173 and reported
    six failures against code that was not mine. `playwright.config.ts` already anticipates this —
    `E2E_PORT` — and a parallel worktree must pass it.
- **depends_on:** `[3]`
- **parallel_group:** `serial-ui`
- **merge_hazards:** **`src/ui/MatchHost.tsx` was rewritten on `master` in `cb41ebb` after this
  branch was cut** — rebase before starting. The same commit moved `src/i18n/ko.ts`,
  `src/ui/styles.css`, `e2e/nav.ts` (removing `liftCurtain`), `e2e/hotseat.spec.ts` and
  `e2e/motion.spec.ts`.
- **Scope in:** `src/ui/Home.tsx`, `src/ui/App.tsx`, `src/ui/MatchHost.tsx`, `src/i18n/ko.ts`,
  `src/ui/styles.css`, `e2e/nav.ts`, `e2e/single-player.spec.ts`, `tests/ui/ai-abort.test.tsx`
- **Scope out:** engine, worker internals
- **Exit criterion:** `npx playwright test e2e/single-player.spec.ts` and `npx vitest run tests/ui/`
  pass — AC-001, AC-007, AC-008 and AC-011's refusal path. **AC-011's half is provisional pending
  Phase 5's calibration**, for the same reason as Phase 3's: the over-budget fixture is over-budget
  only against the provisional bound
- **Risk:** high — the largest surface, the rebase, and the recorded lesson that a UI restructure is
  one unit of work with the whole e2e suite
- **Rollback:** Phase 3

### Phase 5 — Calibration and SPEC amendment
- **Status:** DONE (2026-08-08). Every provisional constant is now a measured one.
- **Measured, at `PRODUCTION_NODE_BUDGET = 20,000`** (per-move wall clock, development desktop,
  ~80 moves per level):

  | level | median | p95 | max |
  |---|---|---|---|
  | hard | **848 ms** | **1,142 ms** | 1,247 ms |
  | medium | 373 ms | 537 ms | 586 ms |
  | easy | 148 ms | 196 ms | 246 ms |

  Inside the SLO (median ≤ 1.0 s, p95 ≤ 1.5 s) with headroom, so the budget stands.
- **The complexity bound is a cliff, not a curve.** Each chosen-target slot on a card multiplies the
  action list by the board area: on 6x6 that is 36 → 1,296 → **46,656** for one, two and three
  slots. The shipped preset scores 3,024 and measures the p95 above; a third slot is a 15× jump in a
  single edit and nothing in between is reachable. `COMPLEXITY_BOUND` was therefore set to **20,000**
  — in the gap — rather than to the 250,000 placeholder this PLAN carried, which was loose enough to
  admit the cliff it exists to refuse.
- **Honest limit:** the bound is corroborated at ONE measured point, not fitted across many. That is
  what the wall-clock valve is for (ADR-010) — the envelope catches the structural blow-up, the
  valve catches what a single point could not predict.
- **AC-005 passes at the full protocol.** `npm run test:strength` — 3/3 pairings, 400 paired games
  each, 13m22s, every one clearing both its point-estimate threshold and its 95% CI lower bound.
  The ladder that temperature alone could not build (0.536 on `hard vs medium`) holds once the
  budget knob is in play.
- **depends_on:** `[2, 4]`
- **parallel_group:** `serial-ui`
- **merge_hazards:** `src/engine/ai/search.ts`, `src/engine/ai/difficulty.ts` (Phase 1–2),
  `src/engine/ai/complexity.ts`, `src/engine/ai/worker.ts` (Phase 3) — constants only, but every one
  of these files was authored by an earlier phase; `specs/SPEC-variant-chess-6x6-cards.md`
- **Scope in:** the constants in `src/engine/ai/search.ts`, `src/engine/ai/difficulty.ts`,
  `src/engine/ai/complexity.ts`, `src/engine/ai/worker.ts`;
  `specs/SPEC-variant-chess-6x6-cards.md`; `tests/docs/spec-consistency.test.ts`
- **Scope out:** algorithm changes
- **Exit criterion:** `npm run verify` passes end to end; measured per-move wall-clock has median
  ≤ 1.0 s and p95 ≤ 1.5 s on the development desktop at the chosen production budget; the complexity
  envelope bound is set from measurement; **AC-005, AC-006 and AC-011 are re-asserted at the final
  constants** — the surrogate tournament re-run plus one production-budget tournament recorded as a
  release number, and the complexity fixtures re-classified against the calibrated bound so a
  fixture that crosses it is caught rather than left on the Phase-3 value; AC-010's consistency test
  passes
- **Risk:** medium — this phase can invalidate Phase 2's provisional pass and reopen Phase 1/2 scope
- **Rollback:** Phase 4

## 🧪 Testing Strategy

- **Property (vitest + fast-check)** — AC-002, AC-004, AC-006, AC-009 and ADR-004's equivalence.
  These are load-bearing: each states a relation that holds for *any* search implementation, so none
  can be satisfied by an AI agreeing with itself.
- **Differential (vitest, `test:strength`)** — AC-005's paired reciprocal tournament at the surrogate
  budget against the pre-existing uniform-random agent and the adjacent level. Outside
  `npm run verify` per ADR-011; a sign-only smoke subset runs inside it.
- **Integration (vitest)** — AC-003 run through two independent match constructions and through the
  worker round-trip, asserting all three agree.
- **Benchmark (vitest, Phase 1)** — completed-depth distribution at the provisional budget, so
  ADR-001's estimate is replaced by a measurement before Phase 5 commits to the SLO.
- **e2e (playwright)** — AC-001, AC-007, AC-008, AC-011, including the responsiveness bound that
  only a real event loop can demonstrate, and an `awaitAiReply` step because `move()` returns before
  the AI has answered.
- **Build (vitest.build.config.ts)** — the worker chunk appears in the service worker's precache
  list.
- **Explicitly not done:** asserting specific AI moves. Every strength claim is statistical; every
  correctness claim is a relation.

## ⚠️ Risks & Mitigation

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R1 | The three difficulty levels do not measurably separate — `declared-but-inert-vocabulary`, count 4 | medium | high | AC-005 is the detector and a Phase 2 exit criterion. Failure is diagnosed in ADR-006's stated order — normalization, K, temperatures, then the evaluator — **not** attributed to the evaluator by default |
| R2 | `master` moved `MatchHost.tsx` (`cb41ebb`) after this branch was cut | **certain** | medium | Rebase before Phase 4; Phase 4's scope names every file that commit touched |
| R3 | Vite's worker detection fails silently into a runtime fetch, breaking offline | medium | high | Phase 3 asserts the chunk is in `sw.js`'s precache list rather than trusting the build |
| R4 | The AI-thinking mode has no exit — `mode-with-no-way-out`, recorded 2026-08-07 | medium | high | AC-008 tests abort mid-search; ADR-009 terminates the worker so the exit stops the work, not just its result |
| R5 | `applyTrusted` diverges from `apply` as the engine evolves | low | high | The equivalence property runs on every vitest; the branded type prevents off-list actions at compile time |
| R6 | Depth 4 is not reachable inside the response budget | **medium-high** | medium | ADR-001 no longer promises it. Phase 1's benchmark measures the real distribution before Phase 5 sets the SLO; depth 3 at ~0.11 s is the fallback and is still real tactical sight |
| R7 | The transposition table grows unbounded on mobile | low | high | Preallocated typed array with mask indexing, fixed at construction |
| R8 | Authored content makes generation or cloning orders of magnitude slower than measured | medium | high | ADR-010's envelope refuses it before a match starts; the valve is the backstop; Phase 3 measures at the envelope's upper bound |
| R9 | The surrogate-budget ladder does not carry to the production budget | medium | medium | Phase 5 re-runs the tournament once at the production budget and records the number as a release check (ADR-011) |
| R10 | Phase 5's calibration invalidates Phase 2's provisional pass and reopens earlier scope | medium | medium | Phase 2's pass is declared provisional up front; Phase 5's exit criterion re-asserts AC-005/AC-006 explicitly rather than relying on `npm run verify` to do it incidentally |
| R11 | The envelope refuses content players have already authored and enjoy in hot-seat | medium | medium | The refusal names the offending content and the reason; the bound is calibrated from measurement in Phase 5, not guessed |

## ✅ Success Criteria

- [x] AC-001 — single-player match starts; mode, difficulty and sides exposed as data attributes; seed still shown and copyable
- [x] AC-002 — every AI action is a `legalActions` member, committed through `apply`
- [x] AC-003 — `(seed, difficulty)` replays identically, through both the core and the worker, for content inside the envelope
- [x] AC-004 — null returned exactly when no action is legal, including draft-only and 200-wide nodes
- [x] AC-005 — each pairing clears its threshold with a 95% CI lower bound above 0.50 over 400 paired games at the surrogate budget; re-asserted at the production budget in Phase 5
- [x] AC-006 — the clamp holds at every level; the easiest level's top-rank rate exceeds 25%
- [x] AC-007 — thinking indicator shown, hand-off banner absent, input lands within 200 ms
- [x] AC-008 — confirm dialog on `states.length > 1`; a cancelled search is terminated and its action never applied
- [x] AC-009 — perturbing the unrevealed draft substream leaves the root-action score vector exactly equal, and the argmax action unchanged
- [x] AC-010 — the parent SPEC's Non-Goal names this SPEC as superseding it
- [x] AC-011 — content outside the complexity envelope refuses single-player with a reason; a tripped valve marks the match non-reproducible
- [x] `npm run verify` passes end to end; `npm run test:strength` passes at the surrogate budget

## 🔍 Plan Validation

**Validator:** `plan-validator`, run `pv-cb41ebb-aiop`, three passes.
**Pass 1 outcome:** `MAJOR_REVISION` — 4 critical, 4 warning, 1 suggestion.
**Pass 2 outcome:** `MAJOR_REVISION` — 8 of 9 pass-1 findings confirmed closed with cited resolving
text; 1 partial, plus 1 new warning and 2 suggestions.
**Pass 3 outcome:** `APPROVED` — all four pass-2 items confirmed closed with cited resolving text,
nothing broken by the edits, and the circularity probe on the provisional complexity bound answered
by the document's own text. Two optional suggestions were raised and both applied: the projection
must exclude `state.seed` itself (not only the draft fields), and Phase 1's exit criterion now names
both halves of AC-009.
The stage's rule is a single re-run; a third pass was dispatched on the user's explicit instruction
after pass 2 held at MAJOR_REVISION.
**Cross-model second opinion:** `codex`, status `invoked` on pass 1, 7 findings (2× P0, 5× P1). The
validator reconciled all seven: six `accepted`, one `partially-accepted` (the
temperature-normalization finding was merged into the tournament-power finding). Pass 2 ran without
a second opinion (`skipped`) — it was a re-review of a known finding set, not a fresh review, so the
verdict there is Claude-only by design.

| Critique | Severity | Resolution |
|---|---|---|
| Phase 2 gates on constants Phase 5 sets — undeclared circular dependency | critical | Provisional constants table added; Phase 2's pass declared provisional; Phase 5's exit criterion re-asserts AC-005/006 explicitly; Phase 5 risk raised to medium; R10 added |
| AC-005's tournament is hours of CPU and cannot sit in `verify` | critical | **Interview Round 2, Q5** → ADR-011: surrogate budget, separate `test:strength` suite, sign-only smoke in `verify`, paired reciprocal protocol |
| ADR-008's detection mechanism unspecified — child-side detection leaks | critical | ADR-008 rewritten: parent-side predicate quoted from `engine.ts:843-856`, plus an observable-state projection constraining evaluation, ordering and TT keys |
| No computational ceiling for schema-valid authored content | critical | **Interview Round 2, Q6** → ADR-010: complexity envelope refuses the mode, wall-clock valve as backstop; AC-003 narrowed; AC-011 added; R8/R11 added |
| ADR-001's arithmetic (`23^3 = 12,167`, not 8,000) | warning | ADR-001 corrected and de-promised; Phase 1 adds a benchmark that replaces the estimate with a measurement; R6 added |
| AC-005 underpowered; normalization unspecified; R1 misattributes failure | warning | Paired reciprocal 400-game protocol with a CI rule (ADR-011); normalization and top-K support specified in ADR-006; R1's diagnosis order rewritten |
| Cancellation stops application, not computation | warning | ADR-009 extended: `terminate()` + respawn, with a Phase 3 test that a new request is not queued behind cancelled work |
| ADR-004's guard is debug-build-only | warning | Replaced with a branded `TrustedAction` type enforced by the compiler in the shipped artifact |
| Phase 5's scope does not name its files | suggestion | Files named |

### Pass 2 — findings and their resolution

| Critique | Severity | Resolution |
|---|---|---|
| ADR-010's own calibrated bound was omitted from the Provisional constants table — the identical circular-dependency pattern pass 1 raised, reappearing in the material that revision added | critical | A `Content-complexity bound` row added (provisional: 4× the bundled preset's score, set finally in Phase 5); Phase 3's and Phase 4's complexity/refusal passes declared provisional; Phase 5's exit criterion re-asserts **AC-011** alongside AC-005/AC-006, re-classifying the fixtures against the calibrated bound |
| AC-009's rank-order assertion is weaker than ADR-008's projection guarantees, and misses a magnitude-only leak that the softmax samplers are sensitive to | warning | AC-009 strengthened to **exact root-action score-vector equality**, which subsumes the ordering check and costs nothing — the scores already exist and are RNG-independent |
| Phase 5's `merge_hazards` omitted `complexity.ts` and `worker.ts`, which its own scope edits | suggestion | Both added |
| ADR-006's "the clamp costs nothing at the hardest level" overclaims: ADR-001 does not guarantee the depth and ADR-007 prunes some replies by construction | suggestion | Softened to "usually redundant… a safety net rather than a no-op where the bounded view missed the reply" |

All four were confirmed closed by pass 3.

### Pass 3 — findings and their resolution

| Critique | Severity | Resolution |
|---|---|---|
| AC-009's exact-score equality is achievable only if the projection excludes `state.seed` itself, not just the draft fields — otherwise a Zobrist key or ordering heuristic reading `seed` diverges exploration order between the two matches, and under a fixed node budget that alone can change the scores | suggestion | ADR-008 decision #2 now names `state.seed` explicitly, with the reasoning; per-match Zobrist derivation keys off content, which is identical in both matches |
| Phase 1's exit criterion said "AC-009's score-equality half", implying a second half with no named owner | suggestion | Phase 1 now claims both halves, noting the argmax half comes from `search.ts`'s own best-move output and needs no `difficulty.ts` |
