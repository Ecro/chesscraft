---
type: research
task_slug: ai-opponent-singleplayer
status: complete
created: 2026-08-07
tags: [strange-chess, research, typescript, game-ai, tree-search, web-worker, determinism]
mtime_warn_days: 7
libs_fetched:
  - vite.dev/guide/features#web-workers
  - developer.mozilla.org/Web/API/Window/requestIdleCallback
  - developer.mozilla.org/Web/API/Worker/postMessage
  - chessprogramming.org/Transposition_Table
sources:
  - https://arxiv.org/abs/2310.16581
  - https://mlanctot.info/files/papers/cig14-immcts.pdf
  - https://pure.york.ac.uk/portal/en/publications/information-set-monte-carlo-tree-search/
  - https://vite.dev/guide/features
  - https://web.dev/articles/optimize-long-tasks
  - https://developer.mozilla.org/en-US/docs/Web/API/Window/requestIdleCallback
  - https://www.jameslmilner.com/posts/web-worker-performance/
  - https://www.chessprogramming.org/Transposition_Table
  - https://github.com/CSSLab/maia-chess
  - http://incompleteideas.net/book/ebook/node17.html
related_docs:
  - "[[SPEC-variant-chess-6x6-cards]]"
  - "[[PLAN-variant-chess-6x6-cards]]"
  - "[[RESEARCH-variant-chess-6x6-cards]]"
  - "[[PLAN-ui-ux-productization]]"
summary: "Alpha-beta + content-derived eval in a Web Worker; MCTS is excluded by a measured 164us/node engine"
---

# RESEARCH — Single-player AI opponent

## 🎯 Recommended Direction

**Iterative-deepening alpha-beta (negamax) over the existing `legalActions`/`apply` pipeline,
running in a Vite module Web Worker, with an evaluation function *derived from content* rather
than hand-tuned, and difficulty expressed as softmax temperature over ranked root moves.**

The literature's default answer for "AI for rules-I-cannot-predict" is MCTS — General Game
Playing settled on it precisely because minimax
> "requires game-specific heuristics to estimate state-values"
([arXiv 2310.16581](https://arxiv.org/abs/2310.16581)). That reasoning does not survive contact
with this engine's measured speed. MCTS pays for its heuristic-freedom in *simulation volume*,
and this engine delivers roughly **21,000 node expansions per second** (§Measurements). A single
random playout costs ~2.1 ms, so a 1-second budget buys **~470 playouts** — about twenty per root
move. That is noise, not a search. The same budget buys alpha-beta a genuine **4-ply** lookahead
with headroom, which is what actually matters on a 6×6 board where a hanging king ends the match
immediately.

The eval-function objection is also weaker here than in general GGP: the content schema exposes
each piece's movement grid, so material weights can be *computed* from mobility instead of tuned
by hand — the pipeline stays the single source of truth (which is what
`RESEARCH-variant-chess-6x6-cards.md:255-257` warned about), and no new card can silently
invalidate a hard-coded piece table.

**This is a scope change, not an implementation task.** An AI opponent is an explicit, twice-recorded
**Non-Goal** of the shipped SPEC (§Open Questions Q1). `plan` cannot proceed until that is reversed
deliberately.

---

## 🔍 Refinement Decisions

`--deep` not requested; Phase 0/0.5 interview skipped.

**Discovery lens (Phase 0.75):** ① Technical architecture / implementation (primary — engine API,
determinism contract, browser execution model); ② User-workflow / product opportunity (secondary —
how a solo mode lands on a shell built for hot-seat pass-and-play).

**Added beyond the lens plan:** direct empirical measurement of the engine's search throughput.
Every algorithm recommendation in the external literature is conditional on simulator speed, and
that number was unknown. It turned out to be the deciding fact.

---

## 📐 Measurements (this repo, not literature)

Measured with a temporary vitest probe against `loadBundledContent()` / `preset.default`, warm-up
plus 5×10,000-iteration medians, results consumed to defeat dead-code elimination. Run under Node
on WSL2; browser V8 should be comparable, mobile slower.

> ⚠️ **Corrected 2026-08-08.** The first pass of these timings was taken while three
> research subagents were running concurrently on the same machine, and it overstated node
> cost by roughly 3×. The numbers below are the re-measurement on a quiet machine at commit
> `23e866d`, confirmed stable across three consecutive rounds (node cost 46.8 / 48.0 /
> 57.9 µs). **The lesson generalizes:** a micro-benchmark run under CPU contention measures
> the contention. Branching and action counts were unaffected — those are properties of the
> content, not of the machine — but they shifted slightly on their own because `bundled.ts`
> changed in the same interval.

| Quantity | First pass (contended) | **Corrected** |
|---|---|---|
| Branching factor (mean over 40 self-play matches) | 22.9 (1,717 decisions) | **21.6** (1,784 decisions) |
| Branching p50 / p90 / max | 20 / 34 / 200 | **20 / 32 / 200** |
| Actions per complete match | ~43 | **~45** |
| `legalActions(state, content)` | 68 µs | **~15 µs** |
| `apply(state, action, content)` | 96 µs | **~32 µs** |
| Node cost (`legalActions` + `apply`) | ~164 µs | **~47 µs** → **~21,000 nodes/s** |

`apply` still re-derives `legalActions` internally to re-check legality
(`engine.ts:675-676`), so of its ~32 µs about 15 µs is that duplicate check; a trusted path
that skips it puts a node at roughly **32 µs**.

Derived search budgets (alpha-beta with good move ordering ≈ `b^(3d/4)`, b = 21.6):

| Depth | Leaves | Time @47 µs | Time @32 µs (trusted-apply path) |
|---|---|---|---|
| 3 | 1,001 | 0.05 s | 0.03 s |
| **4** | **10,008** | **0.47 s** | **0.32 s** |
| 5 | 100,098 | 4.70 s | 3.20 s |

So **depth 4 is comfortable inside a 1-second budget** — the conclusion the first pass could
only call plausible — and depth 5 is out of reach for a per-move budget but not absurd.

Two consequences:

1. **Depth 4 is the working target** at a ~1 s per-move budget, with real headroom — a
   20,000-node budget costs ~0.64 s on the trusted path. Depth 5 needs ~10× more and is not
   reachable by constant-factor work alone.
2. **`apply` re-validates.** `apply` calls `describeRejection` → `legalActions` internally
   (`src/engine/engine.ts:675-676`), so roughly half its cost is a legality check the search has
   already done. A search-internal trusted-apply path is worth a measured **~1.5×** — the single
   highest-leverage optimization available, and it needs an ADR because it deliberately bypasses a
   guard.

The **max branching of 200** comes from `cardPlays` enumerating the Cartesian product of target
slots (`src/engine/engine.ts:301-322`). One such node inside the tree multiplies the subtree by
10×. Card-target combinations will need capping or ordering.

---

## 🛠️ Approaches Found

### A. Iterative-deepening alpha-beta + content-derived eval — **recommended**

| Field | Content |
|---|---|
| **Approach** | Negamax + alpha-beta, iterative deepening to a wall-clock budget, move ordering (captures first, killer moves), fixed-size typed-array transposition table. Eval = piece material weighted by mobility computed from each piece's `MovePattern`, plus king-safety and `checkCount` terms read from state. |
| **Assumption** | That a *derived* eval is good enough. Justified here because `materialResult` (`engine.ts:640-646`) already establishes piece count as the game's own tiebreak, and the content schema exposes movement patterns to weight it. |
| **Evidence** | Measured 6,100 nodes/s makes depth-4 alpha-beta affordable and MCTS unaffordable (§Measurements). Counter-evidence acknowledged: minimax "requires game-specific heuristics" ([arXiv 2310.16581](https://arxiv.org/abs/2310.16581)). |
| **Trade-off** | Buys tactical soundness on a king-capture board; pays with an evaluator that must be re-derived whenever the content schema gains a new dimension. A card whose effect is strategic rather than material will be under-valued. |
| **Compatibility** | High. Consumes `legalActions`/`apply` unchanged, so `shared-vocabulary-unshared-code-path` (`failures.md:33-35`) cannot recur. Only new engine surface is the optional trusted-apply path. |
| **Risk** | **medium** — eval quality is the unknown; depth 4 with a weak eval can still play badly. |

### B. MCTS / UCT with random playouts — **excluded by measurement**

| Field | Content |
|---|---|
| **Approach** | UCT tree with uniform-random rollouts to terminal, reusing the existing `chooseAction` agent as the rollout policy (it already exists and is already ADR-014-correct). |
| **Assumption** | That thousands of playouts fit in the move budget. **This assumption is false here.** |
| **Evidence** | ~45 actions/match × 47 µs = ~2.1 ms per full playout → **~470 playouts/s**, i.e. ~22 per root move at b = 21.6 in a one-second budget. (The first, contended measurement put this at ~10; the correction doubles it and does not change the verdict — 22 samples per root move is still noise, while the same budget buys alpha-beta a full depth-4 search.) Literature support for MCTS is real but conditional: it "does not depend on game-specific heuristics" ([arXiv 2310.16581](https://arxiv.org/abs/2310.16581)) while also running "a higher risk than full-width minimax search of missing individual moves and falling into traps in tactical situations" ([Lanctot et al.](https://mlanctot.info/files/papers/cig14-immcts.pdf)) — the exact failure mode of a 6×6 king-capture game. |
| **Trade-off** | Zero eval-authoring cost, and genuinely anytime; pays with statistical meaninglessness at this simulator speed. |
| **Compatibility** | High in shape, low in effect. |
| **Risk** | **high** — would ship an opponent indistinguishable from the random fixture, which is the same trap as `unasserted-fixture-premise` (`failures.md:57-58`). |
| **Reconsider if** | Node cost drops by ~50× (a dedicated fast-path board representation). Not plausible without abandoning the shared pipeline. |

### C. Hybrid MCTS + shallow minimax leaf check

| Field | Content |
|---|---|
| **Approach** | [arXiv 2310.16581](https://arxiv.org/abs/2310.16581)'s design: UCT backbone, 1–2 ply minimax at the rollout boundary to avoid immediate blunders, Gaussian sampling over root estimates for difficulty. |
| **Assumption** | Same playout-volume assumption as B, plus extra per-leaf cost. |
| **Evidence** | The paper reports it "outperformed UCT" on Reversi but notes "it needs enhancements to outperform the UCT baseline on games where the initial moves are decisive." |
| **Trade-off** | Best-of-both on paper; strictly *slower per iteration* than B, so it inherits B's disqualifying constraint and worsens it. |
| **Compatibility** | Medium. |
| **Risk** | **high** at current node cost. |
| **Worth stealing** | Its **difficulty mechanism** is orthogonal to the search algorithm and should be adopted regardless — see Pitfall 4. |

---

## ⚠️ Pitfalls

1. **A time-budgeted search breaks the replay contract.** AC-004 asserts full-match replay
   determinism and ADR-024 surfaces the seed as a shareable artifact
   (`PLAN-ui-ux-productization.md:533-535`: an e2e "asserts the active seed is on screen and
   copyable"). A wall-clock-budgeted search visits a different node count under different machine
   load, so *same seed ≠ same move*. Mitigation: budget by **fixed iteration/node count** in the
   deterministic mode the tests and replay use, wall-clock only in live play — and decide
   explicitly whether a shared seed is still supposed to reproduce an AI match.

2. **`apply` returns the input state on an illegal action rather than throwing**
   (`engine.ts:649`). A search bug that constructs an off-list action produces a silent no-op
   node, not a crash — an infinite-looking search that quietly evaluates the same position. Assert
   `next !== state` in the search, or use the trusted path where the action provenance is known.

3. **The AI reads everything, including the opponent's hand and the future.** `viewFor` is an
   identity function (`engine.ts:884-887`), `GameState.drafts` holds both sides' `held` and
   `offers`, and all randomness is derivable from `state.seed` via `rngFor` (`rng.ts:30`) — so a
   forward-simulating AI can compute the human's *future draft offers* exactly. Harmless in
   hot-seat, where the state is shared by construction; in single-player it is the difference
   between a strong opponent and a cheating one. This needs a decision, not a default.

4. **Depth-limiting alone makes a weak AI feel alien, not weak.** The documented complaint about
   nerfed engines: "Stockfish seems to make the occasional silly move in order to play down to
   relatively low levels" ([Lichess forum](https://lichess.org/forum/general-chess-discussion/maia-chess-a-human-like-neural-network-chess-engine)),
   versus "The aim of maia is to make a human like blunder, not a random blunder"
   ([maia-chess](https://github.com/CSSLab/maia-chess)). Prefer softmax/temperature over *ranked*
   root moves ([Sutton & Barto](http://incompleteideas.net/book/ebook/node17.html): "High
   temperatures cause the actions to be all (nearly) equiprobable"), clamped so Easy never hangs
   its king in one — a catastrophic blunder on a 6×6 board reads as broken, not gentle.

5. **`requestIdleCallback` is not an alternative to a worker.** MDN is explicit that it runs work
   "on the main thread", and warns that without a `timeout` "it's possible multiple seconds will
   elapse before the callback is fired". Anything over 50 ms is a long task by
   [web.dev's definition](https://web.dev/articles/optimize-long-tasks). A 1.3 s depth-4 search on
   the main thread is 26 consecutive dropped frames.

6. **Vite's worker detection is syntactically fragile.** Vite requires that "The worker detection
   will only work if the `new URL()` constructor is used directly inside the `new Worker()`
   declaration" and "all options parameters must be static values"
   ([Vite features](https://vite.dev/guide/features)). Hoisting the URL into a variable silently
   produces a runtime fetch instead of a bundled chunk — which then is not precached and breaks
   offline. *Local mitigation already in place:* `vite-plugin-sw.ts:25` precaches
   `Object.keys(bundle)`, so a properly-emitted worker chunk is offline-safe with no plugin change.
   A runtime-fetched one is not.

7. **Structured-clone cost is a non-issue — don't optimize it.** "Sending an object of 1000 keys or
   less via `postMessage` comes in sub-millisecond"
   ([Milner](https://www.jameslmilner.com/posts/web-worker-performance/)); this state is a Map over
   ~6 occupied squares plus small records. Send the state; send the *content set* once at worker
   init. `SharedArrayBuffer` would drag in COOP/COEP headers, which contradicts the no-server
   non-goal (`SPEC:194`).

8. **An unbounded transposition table is a mobile tab-kill.** "it is necessary to have a scheme by
   which the program can decide which entries would be most valuable to keep"
   ([chessprogramming](https://www.chessprogramming.org/Transposition_Table)). Use a fixed-size
   typed array with mask indexing and a depth-preferred replacement policy, not a growing `Map`.
   Note Zobrist keys must be re-derived per match, since the piece set changes with content.

9. **The counter-as-proxy failure is pre-loaded here.** `failures.md:71-72` records that
   `plyCount > 0` was the wrong discard guard because a draft pick is an action that does not
   advance plies; the correct predicate is `match.states.length > 1`. An AI mode adds new
   transitions (thinking, aborting) — any new guard must use the state predicate, not a counter.

10. **A degenerate AI passes every test that exists.** `failures.md:57-58` records exactly this
    near-miss: an agent written as `legalActions[0]` satisfied a whole statistical file meant to
    measure uniform-random play. Strength must be tested as a *distribution* — Hard beats Easy over
    N seeded matches with a statistical threshold — never as an assertion on a specific move.

11. **Worst-case branching is 200, not 34.** `cardPlays` enumerates a Cartesian product of target
    slots (`engine.ts:301-322`). Unbounded, one such node costs the search an order of magnitude.

---

## ❓ Open Questions

**Q1 — Does the SPEC's Non-Goal get reversed? (blocking)**
`specs/SPEC-variant-chess-6x6-cards.md:197` states: *"**AI opponent.** The random-action agent
exists for testing (AC-012, AC-013), not as a playable opponent."* — restated in
`PLAN-variant-chess-6x6-cards.md:844-845`. This is a settled decision, not an oversight. `plan`
needs either a SPEC amendment or a new SPEC that supersedes that line. Nothing else in this
document is actionable until this is answered.

**Q2 — Is a seeded single-player match still supposed to be reproducible?**
Determines whether the search budget is wall-clock or fixed-iteration, and whether AI-mode matches
keep the shareable-seed affordance from ADR-024. Cheapest answer: fixed **node budget**, not
milliseconds — deterministic *and* still anytime-ish.

**Q3 — Is the AI allowed to see what the human cannot?**
It can currently read the opponent's `held`/`offers` and derive future offers from the seed
(Pitfall 3). Options: (a) accept — it is an open-information game today; (b) mask via `viewFor`,
which exists as "the seam a future fog rule needs"; (c) mask only the *future* (forbid the AI from
simulating past a draft boundary). Affects both perceived fairness and search legality.

**Q4 — Does the AI draft its own skill cards, and how?**
`draft_pick` is a first-class action (`types.ts:95`) and drafts gate board play. A card-selection
policy is a different problem from move search (no lookahead value without a game-length model).
Simplest defensible answer: search-based pick with a very short horizon, or a value heuristic over
the card's own effect schema.

**Q5 — What replaces the hand-off announcement in single-player?**
The full-screen curtain is already gone; what remains is a `turn-toast` hand-off banner
(`MatchHost.tsx:891-909`, `data-testid="hand-off"`). Announcing "black's turn" to a solo player is
noise. Does the banner become an AI-thinking indicator, or disappear? Note `App.tsx` — not
`MatchHost` — owns match lifecycle and unmount, so the mode selection belongs upstream.

**Q6 — How many difficulty levels, and is Easy allowed to lose on purpose?**
Pitfall 4 recommends temperature over ranked moves with a no-catastrophic-blunder clamp. The number
of levels and whether the clamp exists are product calls.

**Q7 — Is bypassing `apply`'s legality re-validation acceptable inside the search?**
Worth a measured 1.7×. It trades a safety guard for depth, so it is an ADR, not a refactor.

**Q8 — Which side does the human play, and is it chosen or random?**
White moves first (`match.ts:64`). Trivial, but it changes the entry-screen surface and the e2e
`data-side` assertions.

---

## 📚 Sources

**External — read directly, verbatim quotes reliable:**
- [Vite — Features (Web Workers)](https://vite.dev/guide/features)
- [MDN — `requestIdleCallback`](https://developer.mozilla.org/en-US/docs/Web/API/Window/requestIdleCallback)
- [MDN — `Worker.postMessage`](https://developer.mozilla.org/en-US/docs/Web/API/Worker/postMessage)
- [web.dev — Optimize long tasks](https://web.dev/articles/optimize-long-tasks)
- [Chessprogramming — Transposition Table](https://www.chessprogramming.org/Transposition_Table)
- [Examining Web Worker Performance — James Milner](https://www.jameslmilner.com/posts/web-worker-performance/)
- [Chrome for Developers — Transferable objects](https://developer.chrome.com/blog/transferable-objects-lightning-fast)
- [Hybrid Minimax-MCTS and Difficulty Adjustment for GGP (arXiv 2310.16581)](https://arxiv.org/abs/2310.16581) — abstract read directly

**External — quotes are search-index summaries, wording approximate, facts standard:**
- [MCTS with Heuristic Evaluations — Lanctot et al.](https://mlanctot.info/files/papers/cig14-immcts.pdf)
- [Information Set MCTS — Cowling, Powley, Whitehouse 2012](https://pure.york.ac.uk/portal/en/publications/information-set-monte-carlo-tree-search/) ([PDF](https://eprints.whiterose.ac.uk/id/eprint/75048/1/CowlingPowleyWhitehouse2012.pdf))
- [CadiaPlayer — simulation-based GGP](http://ggp.stanford.edu/readings/cadiaplayer.pdf) — *TLS certificate mismatch; not fetchable directly*
- [Sutton & Barto — Softmax action selection](http://incompleteideas.net/book/ebook/node17.html) — *self-signed certificate*
- [Maia Chess (CSSLab)](https://github.com/CSSLab/maia-chess) · [Lichess forum thread](https://lichess.org/forum/general-chess-discussion/maia-chess-a-human-like-neural-network-chess-engine)
- [Determinization and ISMCTS for Dou Di Zhu](https://www.semanticscholar.org/paper/Determinization-and-information-set-Monte-Carlo-for-Whitehouse-Powley/67e1f4795c461a5467d6009b1efdaa36aad03a40)

**Internal — read directly:**
- `src/engine/engine.ts:18,301,345,640,648,884` · `src/engine/types.ts:42,57,92` ·
  `src/engine/agent.ts:28,39` · `src/engine/match.ts:43,64` · `src/engine/rng.ts:30`
- `src/ui/MatchHost.tsx:295,891` · `vite.config.ts` · `vite-plugin-sw.ts:25`
- `specs/SPEC-variant-chess-6x6-cards.md:194,197`
- `.claude/memory/failures.md:33,57,71` · `.claude/memory/wiki.md:33,35`

**Measurements:** temporary vitest probes, not retained in the tree; raw output at
`scratchpad/probe.json`, `scratchpad/bench.json`. Reproducible from the table in §Measurements.

---

## 🔗 Related Internal Docs

- [[SPEC-variant-chess-6x6-cards]] — §Non-Goals:197 declares the AI opponent out of scope (Q1)
- [[PLAN-variant-chess-6x6-cards]] — ADR-012 (layered win pipeline), ADR-013 (undo outside
  `legalActions`), ADR-014 (domain-separated PRNG substreams; the `'agent'` domain is already
  reserved), Non-Goals rollup:844
- [[RESEARCH-variant-chess-6x6-cards]] — :255-257 already raised this exact question and it was
  never closed by an ADR: *"a 6x6 search that understands arbitrary rule cards is not [easy] — the
  modifier pipeline makes move generation dynamic, so the AI must consume the same pipeline"*
- [[PLAN-ui-ux-productization]] — ADR-024 (injected seed provider), :533 (seed-on-screen e2e),
  :1117 (`e2e/content.ts` bootstrap invariant)
- [[CARDSET-variant-chess-6x6-cards]] — the content surface an auto-derived evaluator must read
