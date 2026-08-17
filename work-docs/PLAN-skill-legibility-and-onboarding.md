---
type: plan
task_slug: skill-legibility-and-onboarding
status: complete
created: 2026-08-13
tags: [chess-craft, plan, react, typescript, ui-affordance, onboarding, motion]
interview_rounds: 4
adrs: 7
validator_outcome: NEEDS_REVISION_RESOLVED
summary: "Name the card that just fired, teach the turn on first entry, and let the board react."
---

# PLAN — Skill legibility and first-entry onboarding

## 🎯 Executive Summary

**TL;DR.** The board already draws *what* an effect is doing. Nothing on screen ever says
*which card did it, just now*. Three additions close that: a one-shot banner naming the card
the moment it fires, an impact flourish on the squares it touched, and a one-time in-match
sheet that explains the turn shape a player is about to meet.

**What.**
1. **First-match rule sheet.** On the first match a player ever opens, a dismissible sheet
   names this match's rule card and states the turn shape — *play a card and you still move*
   — plus the one line that makes the rest of this feature discoverable: the opponent's card
   will be announced. Gated by its own storage flag, folded into a single onboarding-key
   registry (ADR-006).
2. **Card banner.** A card play — either side's — raises a 1.2s banner carrying the card's
   mark, name and text. Derived from `match.states`, not from the click that produced it
   (ADR-002). It takes priority over every other notice, and a hand-off it displaces is
   queued rather than dropped (ADR-004).
3. **Impact flourish.** The squares a card actually changed get a one-shot expanding ring and
   the arriving badge gets a flash. CSS only, mid-intensity, `prefers-reduced-motion`-aware
   (ADR-007).

**Why.** The user's report is exact: *"현재는 상대가 어떤 스킬을 사용했는지 알기 어려움."*
Verified in the tree — `MatchHost.tsx` renders four notices (`rule-banner`, `hand-off`,
`ai-thinking`, `ai-degraded`) and **none of them names a card**. The only trace a played card
leaves is a dimmed tile in the opponent's hand strip (`MatchHost.tsx:982-1004`) and a badge
that appears silently on a square. Against the AI the situation is worse: the AI's turn runs
a card search and a move search back to back (`MatchHost.tsx:489-511`), so both land inside
one perceptual beat and the position appears to change by itself — the exact symptom
`AI_MIN_THINK_MS` was introduced to fight for *moves*, never extended to *cards*.

**Key decisions.** ADR-001 (banner, not a persistent log), ADR-002 (derive from state
history), ADR-003 (what counts as an impacted square), ADR-004 (notice stack order),
ADR-005 (AI beat; human turn stays non-blocking), ADR-006 (one onboarding-key registry),
ADR-007 (motion budget).

**Estimated impact.** 3 new source files, ~6 files edited, 4 new/extended test files,
2 e2e specs touched, 1 test helper and 1 Playwright config entry. No engine change: the
`Match` contract, `GameState` and every `src/engine/` file are untouched.

---

## 📚 Prior Work

- `work-docs/PLAN-skill-then-move-and-effect-visibility.md` (2026-08-08, 7 ADRs) shipped the
  substrate this builds on: `frozenUntil`/`ActiveGrant` carry a `sourceId` + `layer`, and
  `src/ui/liveEffects.ts` is the single derivation the badge, the legend chip and the peek
  sheet all read. Its ADR-005 explicitly listed "a card firing gets a one-shot flourish" —
  the flourish that landed is `arrived` (`MatchHost.tsx:333-355`), which highlights *squares*
  but never *names the card*. This PLAN finishes that sentence.
- `work-docs/PLAN-ui-ux-productization.md` ADR-015 set the sequencing principle used again
  here: lifecycle before juice. The user's own ordering (rule sheet → banner → effects)
  matches it.
- `[wiki:architecture] effect-carries-its-source` — the flourish key
  `square:kind:sourceId:(remaining + plyCount)` is reused verbatim by Phase 2; the note on
  why `remaining` alone is wrong is load-bearing and must not be re-derived.
- `[fail:design] rule-keyed-to-event-not-state` (count:3, with a UI instance) — the direct
  precedent for ADR-002. Both recorded instances failed by attaching behaviour to *the event
  that usually causes a state*, and both were found by a route nobody enumerated. A banner
  raised inside `push()` would be the fourth instance: the AI's card play, an undo, and a
  future replay all reach "a card was played" without passing through the human click path.
- `[wiki:architecture] royal-skill-turn-safety` — a skill can be refused on a royal, so a
  card play that resolves may change nothing at all on some squares. Phase 2's impact set
  must tolerate an empty result rather than assume every card touches a square.
- `tests/ui/chrome-i18n.test.tsx` — no Hangul codepoint may appear in any `src/ui/` file.
  Every new string in this PLAN is a `ui.*` key in `src/i18n/ko.ts`.

---

## 🎙️ Interview Transcript

| # | Topic | Category | Question | Options | Choice | Note | → ADR |
|---|-------|----------|----------|---------|--------|------|-------|
| 1 | Announcement surface | Architecture | What announces the opponent's card, given the match screen does not scroll? | one-shot banner+impact / persistent log row / both / card-flight animation | **one-shot banner + impact** | Board height is preserved; nothing permanent is added to the chrome | ADR-001 |
| 2 | Onboarding scope | Scope | What does "show the rules on first entry" mean? | first-match sheet / extra Boot step / in-match coach marks / sheet+marks | **first-match rule sheet** | Separate flag from `Boot`; explained where the board actually is | ADR-006 |
| 3 | Motion budget | Risk tolerance | How much UI effect? | restrained / mid (ring+flash) / heavy (particles, shake) | **mid — impact ring + flash** | CSS-only; no canvas, no extra DOM node per particle | ADR-007 |
| 4 | AI banner timing | Architecture | Banner vs move order on an AI turn? | card→banner(1.2s)→move / banner overlapping move / one summary after the turn / end interview | **card → banner → move** | Causal order is the whole point; AI turn lengthens by ≤1.2s | ADR-005 |
| 5 | Announcement scope | Scope boundaries | Which card plays raise a banner? | both sides / opponent only / plus effect expiry | **both sides** | Hot-seat shares one screen, so "opponent" is not a stable referent | ADR-001 |
| 6 | Sheet re-entry | Scope boundaries | Is there a way to reopen the first-match sheet? | `?` button in match / once only, dex afterwards / re-show per new rule card | **once only, dex afterwards** | No new chrome button — avoids the `PLAN-button-label-truncation` surface | ADR-006 |
| 7 | Human-turn blocking | Risk tolerance | Does a player wait 1.2s for their own card's banner? | non-blocking / blocking both sides / hot-seat only | **non-blocking** | You already know what you played; the banner informs the *other* person | ADR-005 |
| 8 | Notice stack | Contract shape | What happens when the card banner collides with an existing notice? | card wins, others suppressed / card then hand-off queued / different position | **card banner, then hand-off** | No information is dropped; `MatchHost.tsx:436-438` records why stacking is banned | ADR-004 |
| 9 | Phase order | Implementation phasing | Which axis ships first? | banner→effects→sheet / **sheet→banner→effects** / banner+effects fused, sheet parallel | **sheet → banner → effects** | User's call; each axis is independently shippable | — |
| 10 | Banner lifetime | Architecture | Validator warning: how is the 1.2s duration held once `match.states` advances? | revise (name the idiom) / accept as risk / redesign to "until next action" | **revise — name the existing idiom** | Reuse `MatchHost.tsx:382-401`; two interaction test cases added to Phase 3 | ADR-002 (amended) |
| 11 | Phase 3 dependency | Implementation phasing | Validator warning: Phase 3 shares hazard files with Phase 1 but does not depend on it | `depends_on: [1, 2]` / keep `[2]`, document hazard serialization | **`depends_on: [1, 2]`** | Matches the ordering already chosen at #9; parallelism was notional anyway | — |
| 12 | Non-Goals | Scope boundaries | Validator suggestion: boundaries are scattered across ADR consequences | consolidate into one section / leave in place | **consolidate** | Faster audit at `/hm:review` | — |

**Defaults taken without asking** (recorded as assumptions, not decisions):

- The banner reads `match.states`, not a new engine record — precedent is `arrived`, which
  already diffs the last two states for exactly this class of question.
- A `card` entry is added to `SOUND_EVENTS` (`src/ui/sound.ts:17`). The event vocabulary is
  already open and a card play is at least as notable as `draft`, which has one.
- Under `prefers-reduced-motion: reduce` the banner still appears with full text for its full
  duration; only the ring and flash are suppressed. The existing `prefersReducedMotion()`
  helper (`MatchHost.tsx:194`) is reused rather than duplicated.

---

## 📐 Architecture Decision Records

### ADR-001: Card plays are announced by a one-shot banner, not a persistent action log
**Status:** Accepted (2026-08-13, via /hm:plan interview)
**Context:** The match screen deliberately does not scroll (`MatchHost.tsx:31`), so any
always-on surface is subtracted from the board. The player needs to know which card fired.
**Decision:** A transient banner (1.2s) names the card — mark, name, text — for **both**
sides' plays. No persistent history row is added, and `Match` gains no action log.
**Consequences:**
- ✅ Board height is unchanged; nothing competes with the position for space.
- ✅ Symmetric across hot-seat and single-player — "opponent" is never hard-coded.
- ⚠️ A player who looks away misses it. Mitigated, not solved: the effect badge and its peek
  sheet already name the source card permanently (`peekEffect`, `MatchHost.tsx:832`), so the
  information survives for any card that leaves a durationed effect.
- ⚠️ A card leaving no durationed effect (a destroy, a relocate) is recoverable only from the
  board itself once the banner clears. Accepted as a Non-Goal for this cycle.
**Rejected alternatives:**
- Persistent "recent actions" row — rejected on board height, the one budget this screen has.
- Card-flight animation as the primary channel — rejected because it carries no information
  under `prefers-reduced-motion`, which would need a second surface anyway.
**Source:** Interview #1, #5

### ADR-002: The banner is derived from state history, never raised from the input event
**Status:** Accepted (2026-08-13, via /hm:plan interview)
**Context:** `[fail:design] rule-keyed-to-event-not-state` has three recorded instances in
this repo, one of them in this very component. Four distinct routes reach "a card was
played": the human commit path (`clickSquare`), the no-target commit button (`use-card`), the
AI's `push(move.action)`, and `undo` stepping backwards across a card play.
**Decision:** A new pure module `src/ui/cardPlays.ts` answers "was a card played between
these two states, and which one" by comparing `match.states[n-1]` and `match.states[n]`.
`MatchHost` renders the banner from that derivation. No `setBanner`-style call is added to
any handler.
**Consequences:**
- ✅ Every route to the state — including ones not yet written — is covered by construction.
- ✅ Unit-testable without React: the module takes two `GameState`s and returns a value.
- ✅ Undo cannot leave a stale banner describing a play that no longer happened, the bug that
  forced `setLastMove(null)` into `doUndo` (`MatchHost.tsx:537`).
- ⚠️ Target squares are not in `GameState`, so the impacted set must be inferred (ADR-003).

**Amendment (2026-08-13, Interview #10 — validator warning).** What is banned is a handler
writing *which card was played*. A **visibility flag** is a separate concern and is allowed,
provided it is driven by the derivation rather than by a click. The mechanism is the idiom
this component already uses twice — `banner` (`MatchHost.tsx:300`, `382-386`) and `handOff`
(`MatchHost.tsx:298`, `397-401`): a `useState` boolean cleared by a `useEffect(setTimeout)`
keyed on a derived trigger. `lastMove` (`MatchHost.tsx:310`, written at 435, reset at 411 and
537) is the counter-example — a handler-written mirror of derived truth — and is exactly what
this ADR rejects. Without the flag the banner's lifetime would be whatever the human's next
move happened to be: gone in 200ms for a fast player, still up after 5s for a slow one.
**Rejected alternatives:**
- Adding an action log to `Match` — rejected: an engine contract change for a UI affordance,
  and `undo`'s two-state rewind (`match.ts:37-44`) would need a matching rewind.
- A `useState` mirror written by each handler — rejected as the fourth instance of the
  recorded failure.
**Source:** Interview #1, #4

### ADR-003: An impacted square is one whose effects or occupancy changed across the card play
**Status:** Accepted (2026-08-13, via /hm:plan interview)
**Context:** The card's own target list is consumed by the engine and is not retained in
`GameState`, so the ring has to be derived. `liveEffects` alone is insufficient: a card that
destroys or relocates a piece leaves no `grants` entry at all.
**Decision:** impacted = (squares whose live-effect key set changed, using the existing
`square:kind:sourceId:(remaining + plyCount)` key) ∪ (squares whose occupancy string changed
between the two states). An empty impacted set is legal and renders no ring.
**Consequences:**
- ✅ Covers freeze/grant/forbid/shield, destroy, spawn and relocate with one rule.
- ✅ Reuses the flourish key whose derivation is already documented and tested.
- ⚠️ A card refused on a royal (`[wiki:architecture] royal-skill-turn-safety`) may impact
  nothing; the banner still fires and the board stays still. That is accurate.
- ⚠️ Over-inclusive by design: a cascading card marks every square it moved a piece through.
  Preferred over under-reporting, which is the current behaviour and the reported defect.
**Rejected alternatives:**
- Effect-arrival squares only — rejected: silently draws nothing for three shipped card
  shapes, which reads as the feature being broken rather than absent.
**Source:** Interview #1

**Correction (2026-08-13, Phase A.5 round 2 — all three lenses).** The draft said the
absolute-expiry key was load-bearing *inside* `cardPlayBetween`. **It is not, and the claim
was wrong.** `engine.ts:1129-1150`'s `play_card` branch does not advance `plyCount` (only the
`move` branch does), and `cardPlayBetween` is only ever handed the adjacent pair straddling a
card play — so `prev.plyCount === next.plyCount` on every reachable invocation, which makes
`remaining` and `remaining + plyCount` **numerically identical on both sides of every diff
this function performs**. A `remaining`-keyed implementation is therefore indistinguishable
through this module's public API, and a test claiming to catch one cannot.

Where the rule genuinely binds is `MatchHost.tsx:333-355`'s pre-existing `arrived`
derivation, which diffs across *moves* — there `plyCount` really does advance, and keying on
`remaining` really would mark every surviving effect as newly arrived on every ply. That code
is unchanged by this PLAN and already correct.

Consequence for Phase 2: the key builder is **exported** (`effectKey`) and its encoding is
pinned by a direct unit test, rather than inferred from a state pair that cannot express the
difference. Widening the module surface by one pure function is the cost of making the
property observable at all; the alternative on offer was asserting behaviour on a
`plyCount`-advancing card play, which the engine cannot emit.

### ADR-004: The card banner outranks every other notice, and a displaced hand-off is queued
**Status:** Accepted (2026-08-13, via /hm:plan interview)
**Context:** `MatchHost.tsx:436-438` records the notice-stack bug: two announcements at the
same coordinates. Today three notices are mutually suppressed by ad-hoc conditions
(`handOff && !banner && !aiSide`). A fourth added the same way is a fourth condition on every
existing one.
**Decision:** Notice selection becomes a single ordered resolution — card banner > rule
banner > hand-off > ai-thinking — computed in one place. A hand-off suppressed by a card
banner is **not dropped**: its timer starts when the card banner clears.

**Correction (2026-08-13, Phase A.5 round 2 — coverage lens).** There is a **fifth** notice,
`ai-degraded` (`MatchHost.tsx:1490`), and the draft above did not mention it. It is
deliberately **outside** the ordered pick: it is a persistent line about the MATCH (the seed
no longer replays it, AC-011) rather than a transient one about the ply, and it renders away
from the stack's coordinates, so it may legitimately coexist with any stack member. Left
unstated, "outside the list" and "forgotten from the list" are indistinguishable — which is
the ambiguity the notice-stack bug came from — so Phase 3 pins the coexistence with a test.
**Consequences:**
- ✅ One place to read the priority; adding a fifth notice is one list entry.
- ✅ "Whose turn is it" is never lost to a card play, which was the failure mode of simply
  suppressing it.
- ⚠️ Turn changeover after a card play is up to 1.2s longer before the hand-off appears.
  Accepted — the hand-off is a nudge, the card is news.
**Rejected alternatives:**
- Card banner in a different screen position so both coexist — rejected: the free space is
  over the board, which would cover the impact rings the same event just raised.
**Source:** Interview #8

### ADR-005: The AI waits out the banner; the human never does
**Status:** Accepted (2026-08-13, via /hm:plan interview)
**Context:** The AI turn re-enters its effect after the card play and immediately searches
for the move (`MatchHost.tsx:469-524`), so card and move land inside one beat.
`AI_MIN_THINK_MS` (650ms) already exists as a floor and its comment states the exact reason —
"the position appears to have changed by itself."
**Decision:** The AI effect's dwell floor becomes `CARD_BANNER_MS` (1200) instead of
`AI_MIN_THINK_MS` when the state it is acting on carries `turnCard !== null`, i.e. the search
now running is the move owed after a card. The human path adds **no** gate: the banner renders
and every control stays live.
**Consequences:**
- ✅ Cause is on screen before effect, on the one path where the player did not cause it.
- ✅ Reuses the existing dwell mechanism — no new timer, no new cancellation path, and the
  existing cleanup (`clearTimeout(dwell)`) already covers it.
- ⚠️ An AI turn containing a card is ~550ms longer than today. Bounded and only on card turns.
- ⚠️ The floor does not bound the search (nodes do, per the AI PLAN's ADR-003); a slow search
  is never made slower because the wait is taken *after* the search returns.
**Rejected alternatives:**
- Blocking human input for 1.2s — rejected at Interview #7: you already know what you played.
- One summary banner after the whole AI turn — rejected: it explains a board that has already
  changed, which solves only half the reported problem.
**Source:** Interview #4, #7

### ADR-006: One onboarding-key registry; the first-match sheet is a second flag inside it
**Status:** Accepted (2026-08-13, via /hm:plan interview)
**Context:** `COACH_SEEN_KEY` is referenced in three places that must agree:
`src/ui/coach.ts`, `tests/helpers/onboarding.ts`, and — as a **hardcoded string literal** —
`playwright.config.ts:58`. The helper's own comment says the key "is the thing that must not
be duplicated". A second, independently-added flag reproduces that hazard immediately: every
one of the ~40 UI tests that mounts `MatchHost` would start behind an undismissed sheet.
**Decision:** A new module `src/ui/onboarding.ts` exports `ONBOARDING_KEYS` (the coach key
plus the new `chess-craft.match-intro.seen.v1`) and the shared read/write helpers.
`coach.ts` re-exports from it for compatibility; `tests/helpers/onboarding.ts` and
`playwright.config.ts` both iterate the registry instead of naming keys.
**Consequences:**
- ✅ A third onboarding flag cannot be added without both test surfaces picking it up.
- ✅ The `hasSeenCoach` write-probe logic (the zero-quota case, `coach.ts:15-20`) is written
  once and inherited, rather than copy-pasted and subtly wrong the second time.
- ⚠️ `playwright.config.ts` gains an import from `src/`. Acceptable — it is already TypeScript
  compiled by the same `tsconfig`.
**Rejected alternatives:**
- A standalone `matchIntro.ts` mirroring `coach.ts` — rejected: it is the duplication the
  existing comment warns against, and the failure is silent (tests time out on a selector one
  sheet away, pointing at nothing).
- Reusing `COACH_SEEN_KEY` for both — rejected: an existing player who already saw `Boot`
  would never see the in-match sheet, which is the population that most needs it.
**Source:** Interview #2, #6

### ADR-007: Mid-intensity, CSS-only motion, with text surviving reduced-motion
**Status:** Accepted (2026-08-13, via /hm:plan interview)
**Context:** The stylesheet already carries seven keyframe sets and a
`prefers-reduced-motion` block (`styles.css:3208`). The art pipeline renders pixel sprites
with `crispEdges`, and `motion.spec.ts` records that smoothly-eased sprites antialias exactly
the edges that choice exists to keep hard.
**Decision:** Two new keyframe sets — an expanding impact ring on a square pseudo-element and
a badge flash — plus a banner enter/exit. Durations come from `tokens.css` variables, as the
existing move animation does. No canvas, no per-particle DOM node, no screen shake. Under
`reduce`, the banner keeps its full text and duration; ring and flash are suppressed via the
existing `prefersReducedMotion()` gate, matching how `arrived` already behaves.
**Consequences:**
- ✅ Frame budget on low-end mobile is unchanged in kind — it is the same compositor work the
  board already does.
- ✅ `motion.spec.ts` can probe the new durations the same way it probes the move duration.
- ⚠️ Cascading cards can raise many rings at once. Bounded by board size (6×6 = 36 max).
**Rejected alternatives:**
- Particles / screen shake — rejected at Interview #3 on the low-end mobile frame budget.
- Suppressing the banner entirely under `reduce` — rejected: that removes *information*, and
  the media query asks for less motion, not less content.
**Source:** Interview #3

---

## 🏗️ Technical Design

### Current State

| Concern | Where it lives today | Gap |
|---|---|---|
| Live effects → badge / chip / sheet | `src/ui/liveEffects.ts` (108 lines) | Complete. Reused as-is. |
| Effect arrival flourish | `MatchHost.tsx:333-355` (`arrived`) | Highlights squares; names no card. |
| Effect source attribution | `peekEffect`, `MatchHost.tsx:832-841` | Correct, but tap-only and only for durationed effects. |
| Notices | `MatchHost.tsx:1426-1494` | Four notices, ad-hoc mutual suppression, none about cards. |
| AI turn pacing | `MatchHost.tsx:469-524`, `AI_MIN_THINK_MS` | Floors the *move*; a card+move turn gets one floor for two actions. |
| Onboarding | `src/ui/Boot.tsx`, `src/ui/coach.ts`, `App.tsx:213-217` | Global, home-screen, pre-board. Never mentions cards or the turn shape. |
| Sound | `src/ui/sound.ts:17` | `move capture draft undo illegal win draw` — no `card`. |
| Card play in state | `GameState.turnCard` (`types.ts:104`) | Present; nothing reads it for display except a hint line. |

### Affected Components

**New**
- `src/ui/onboarding.ts` — the key registry and shared seen/mark helpers (ADR-006).
- `src/ui/cardPlays.ts` — pure derivation: `cardPlayBetween(prev, next)` → `{ cardId, side, impacted } | null` (ADR-002, ADR-003).
- `src/ui/MatchIntro.tsx` — the first-match sheet, built on the existing `Sheet`.
- `src/ui/CardBanner.tsx` — the notice body (mark + name + text).

**Edited**
- `src/ui/MatchHost.tsx` — notice resolution (ADR-004), banner render, impact attribute on squares, AI dwell floor (ADR-005), intro sheet mount.
- `src/ui/coach.ts` — re-export from `onboarding.ts`; no behaviour change.
- `src/ui/sound.ts` — `card` event + `synthFor` case.
- `src/ui/styles.css`, `src/ui/tokens.css` — banner, ring, flash, durations.
- `src/i18n/ko.ts` — `ui.card.played.*`, `ui.intro.*`.
- `tests/helpers/onboarding.ts`, `playwright.config.ts` — iterate `ONBOARDING_KEYS`.

**Untouched, deliberately:** everything under `src/engine/`, `src/content/`, `src/balance/`.
No schema change, no `MEASUREMENT_REVISION` bump, no grade invalidation.

### Data Flow

```
match.states[n-1] ──┐
                    ├─► cardPlays.cardPlayBetween ─► { cardId, side, impacted }
match.states[n]   ──┘                                        │
                                                             ├─► CardBanner (name/text via content + i18n)
                                                             ├─► square[data-impact] ─► CSS ring
                                                             └─► play('card', settings)

notice resolution (one ordered pick):
  cardPlay ? 'card' : banner&&rule ? 'rule' : handOff&&!aiSide ? 'handoff' : aiThinking ? 'ai' : none
  └─ hand-off timer is started by the card banner's clear, not suppressed outright (ADR-004)
```

### API Changes

None external. Internal module surface added:

```ts
// src/ui/onboarding.ts
export const COACH_SEEN_KEY = 'chess-craft.coach.seen.v1'
export const MATCH_INTRO_SEEN_KEY = 'chess-craft.match-intro.seen.v1'
export const ONBOARDING_KEYS: readonly string[]
export function hasSeen(storage: Storage, key: string): boolean
export function markSeen(storage: Storage, key: string): void

// src/ui/cardPlays.ts
export interface CardPlay {
  readonly cardId: string
  readonly side: Side
  readonly impacted: ReadonlySet<SquareId>
}
export function cardPlayBetween(prev: GameState, next: GameState): CardPlay | null
```

### Design Decisions

- The banner's *identity* for the timer is `${plyCount}:${statesLength}:${cardId}`, not
  `cardId` alone — two plays of the same card in one match must restart the timer, the same
  reasoning that put the absolute expiry into the flourish key (ADR-003, and the note in
  `[wiki:architecture] effect-carries-its-source`).
- `cardPlayBetween` detects a play as `next.turnCard !== null && next.turnCard !== prev.turnCard`.
  The acting side is `prev.sideToMove`, because a card play does not hand the board over
  (ADR-001/002 of the prior PLAN) — reading `next.sideToMove` is correct today and would break
  silently if that ever changed.
- `MatchIntro` renders **over** the board rather than instead of it, matching how the result
  summary already behaves (`MatchHost.tsx:1496-1499`) — a child should see the thing being
  described.
- **Banner lifetime is a `useState` flag cleared by a timer, keyed on the derived identity**
  (ADR-002 amendment). Concretely, mirroring `MatchHost.tsx:382-401`:

  ```ts
  const play = cardPlayBetween(previousState, state)          // derived, never written
  const playKey = play ? `${match.states.length}:${play.cardId}` : null
  const [cardNoticeKey, setCardNoticeKey] = useState<string | null>(null)
  useEffect(() => { if (playKey) setCardNoticeKey(playKey) }, [playKey])
  useEffect(() => {
    if (!cardNoticeKey) return
    const id = setTimeout(() => setCardNoticeKey(null), CARD_BANNER_MS)
    return () => clearTimeout(id)
  }, [cardNoticeKey])
  ```

  The flag holds the banner for its full 1.2s independently of when the player acts next, and
  `playKey` includes `match.states.length` so a second play of the same card restarts the
  timer rather than inheriting the remainder of the first one's — the same reasoning as the
  `handOff` effect's `state.plyCount` dependency.

---

## 🚫 Non-Goals

Consolidated from the ADR consequences and the Technical Design table (Interview #12). Each
line is a boundary already argued above; this section exists so an auditor reads one list.

| Not doing | Where it was decided | Why |
|---|---|---|
| A persistent action log / move history row | ADR-001 | The match screen does not scroll; board height is the budget |
| Recovering *which card* fired for a card that leaves no durationed effect, once the banner clears | ADR-001 | The peek sheet already covers durationed effects; the rest is a later cycle |
| An action record on `Match`, or any `src/engine/**` change | ADR-002, Technical Design | An engine contract change for a UI affordance, with an `undo` rewind to match |
| A card-flight animation from hand to target | ADR-001 | Carries no information under `prefers-reduced-motion`, so a second surface would be needed anyway |
| Announcing effect **expiry** ("the freeze wore off") | Interview #5 | Chosen scope is card plays only; expiry would make the banner frequent |
| A `?` button or any new chrome control to reopen the intro sheet | ADR-006 | Once only; the dex is the standing reference. Avoids the `PLAN-button-label-truncation` surface |
| Particles, screen shake, canvas, or per-particle DOM nodes | ADR-007 | Low-end mobile frame budget |
| Suppressing the banner text under reduced motion | ADR-007 | The media query asks for less motion, not less content |
| Any schema change, `MEASUREMENT_REVISION` bump, or grade invalidation | Technical Design | Nothing here touches content or balance |

## 📝 Implementation Plan

### Phase 1 — Onboarding key registry + first-match rule sheet

- **Status:** DONE (2026-08-13)
- **Exit evidence:** `npm run typecheck` clean; `npx vitest run tests/ui` → **74 files / 839 tests
  passed** (the whole-suite run is what proves risk R1 did not fire — the storage-injection prop
  kept every direct-mount board test off the sheet); `E2E_PORT=5199 npx playwright test
  e2e/ftue.spec.ts` → **15 passed** across mobile-portrait / desktop / mobile-webkit.
- **Phase A.5:** 2 rounds. Round 1 FAIL — all three lenses; two blocking issues after merge
  (an `expect(rendered).toContain(t(key))` tautology that the i18n key-fallback satisfies on
  both sides, and `playwright.config.ts` sitting outside the anti-drift scan). Both repaired;
  round 2 PASS on all three.
- **Implementation note (not in the drafted scope):** `App.tsx` now passes
  `storage={browserStorage()}` to `MatchHost`. The PLAN listed `MatchHost.tsx (mount + flag
  read)` but not its caller, and without that one line the sheet is `[fail:design]
  built-but-not-wired` — fully tested and reachable by nothing.
- **Phase D.5:** not applicable. Phase 1 is new-feature work, not a repair, so there is no
  newly-reachable input window to name.
- **depends_on:** `[]`
- **parallel_group:** `serial-a`
- **merge_hazards:** `src/ui/MatchHost.tsx` (shared with Phases 3–4), `src/i18n/ko.ts`
  (shared with Phase 3), `playwright.config.ts` (single-line, but every e2e spec depends on it)
- **Scope (in):** `src/ui/onboarding.ts` (new), `src/ui/coach.ts`, `src/ui/MatchIntro.tsx`
  (new), `src/ui/MatchHost.tsx` (mount + flag read), `src/i18n/ko.ts` (`ui.intro.*`),
  `src/ui/styles.css` (sheet layout only), `tests/helpers/onboarding.ts`,
  `playwright.config.ts`, `tests/ui/match-intro.test.tsx` (new), `e2e/ftue.spec.ts`
- **Scope (out):** any card-banner work, any keyframes, `src/engine/**`
- **Exit criterion:**
  `npm run typecheck && npx vitest run tests/ui/match-intro.test.tsx tests/ui/ftue.test.tsx tests/ui/chrome-i18n.test.tsx && npx vitest run tests/ui && npx playwright test e2e/ftue.spec.ts`
  — all green, and the full `tests/ui` run proves no existing test regressed behind the new
  sheet (this is the phase's real risk, not the sheet itself).
- **Risk:** `medium` — the failure mode is ~40 unrelated UI tests timing out on selectors one
  sheet away, with nothing in the output naming the cause.
- **Rollback point:** the branch tip before Phase 1. The registry is additive; reverting
  restores the literal-key form in both test surfaces.

### Phase 2 — `cardPlays.ts` derivation (no UI)

- **Status:** DONE (2026-08-13)
- **Exit evidence:** `npm run typecheck` clean; `npx vitest run tests/ui/card-plays.test.ts` →
  **16 passed**.
- **Phase A.5:** 3 rounds (the operator authorised one past the 2-round cap; recorded on the
  ledger with `--reason`). Each round found exactly one real defect and all three lenses
  converged on it every time:
  - R1 — the `side` assertion was vacuous (a card play never flips `sideToMove`, so
    `prev`/`next` are indistinguishable on any engine-built pair), and ADR-003's
    absolute-expiry rationale was untested.
  - R2 — the test written for that second point **also** could not discriminate, for a
    sharper reason: `play_card` does not advance `plyCount`, so both key encodings agree on
    every pair this function is ever handed. This invalidated a claim in the drafted ADR-003;
    see the Correction appended to that ADR.
  - R3 — the `effectKey` block held `square`, `sourceId` and `layer` constant, so a key that
    dropped all three still passed. Repaired with one case per dimension.
  - **The R3 repair was not independently re-reviewed.** It is three assertions symmetric to
    one the same lenses had already cleared (`kind`), and the implementation includes all four
    fields. Recorded rather than glossed: a fourth round was judged not to earn its cost, and
    that judgement is mine, not a reviewer's.
- **Scope change:** `effectKey` is exported from `cardPlays.ts`, which the draft did not
  anticipate. It is the only way the key encoding is observable at all (see the ADR-003
  Correction). `MatchHost.tsx:333-355`'s `arrived` still has its own inline copy of this key —
  folding it onto `effectKey` would retire a duplicate and is the kind of thing
  `[fail:design] shared-vocabulary-unshared-code-path` (count:4) is about, but it edits
  `MatchHost.tsx`, which Phase 2 declares out of scope. Deferred to Phase 3.
- **Phase D.5:** not applicable — new module, not a repair.
- **depends_on:** `[]`
- **parallel_group:** `serial-b`
- **merge_hazards:** `none` — one new file plus one new test file
- **Scope (in):** `src/ui/cardPlays.ts` (new), `tests/ui/card-plays.test.ts` (new)
- **Scope (out):** every rendering concern; `MatchHost.tsx` is not opened in this phase
- **Exit criterion:**
  `npm run typecheck && npx vitest run tests/ui/card-plays.test.ts` green, with cases for:
  freeze card (effect-key change), a destroy/relocate card (occupancy change only), a card
  refused on a royal (play detected, `impacted` empty), two plays of the same card id, and
  the `prev.sideToMove` attribution.
- **Risk:** `low` — pure function, no React, no timers.
- **Rollback point:** Phase 1 tip.

### Phase 3 — Card banner, notice resolution, sound, AI beat

- **Status:** DONE (2026-08-13)
- **Exit evidence:** `npm run typecheck` clean; the six-file exit command → **64 passed**;
  `npx vitest run tests/ui` → **76 files / 870 tests passed**.
- **Phase A.5:** 3 rounds (operator authorised one past the cap; recorded on the ledger with
  `--reason`). R1 six findings, R2 seven, R3 three — every round converged and every finding
  was real. The three most valuable were all of one kind: **tests that would have passed
  without the implementation.** The dwell test sampled at a moment outside both the old and
  the new floor; `stub.cancels` rises on any unmount so it could not see a leaked timer; and
  the rule-banner assertion was satisfied by a pre-existing `setBanner(false)`.
  - Two round-3 repairs deliberately **weaken** a claim rather than add one: the vacuous
    `length === 1` assertion was deleted, and the leak check now states plainly that timer
    hygiene is unobserved from outside. A timer-id spy was tried and abandoned — the dwell is
    scheduled before any spy installed there could see it, so the set came up empty and the
    assertion passed vacuously, which is the same failure a third time.
  - The R3 repairs were not independently re-reviewed. Three of five reduce claims; two
    mirror patterns already cleared.
- **Scope corrections found during the phase:**
  - `tests/ui/game-feel.test.tsx` — added to scope (round-2 coverage finding). Its
    `SOUND_EVENTS` sweep would have failed the moment `card` joined the union. `card` ended up
    in that file's `REACHED_BY_OTHER_PATHS` after checking rather than assuming: seed 7 deals
    the mover only `skill.recall`, which has no legal play on turn one, so the sweep cannot
    arm a card at all. It is genuinely driven through a mounted component in
    `tests/ui/card-banner.test.tsx`, which is the bar that list sets.
  - `tests/ui/effect-visibility.test.tsx` — its hand-off test needed updating. The hand-off is
    now queued behind the card banner (ADR-004), and that fixture plays a card and then the
    move it owes, so the announcement arrives 1.2s later than it used to. The test's claim is
    unchanged; only when it becomes visible moved.
- **Phase D.5 — newly-reachable window (this phase FOUND a defect here):**
  1. **Window:** the banner latch outlives the history pair that produced it — deliberately,
     since that is what keeps it up when a fast player moves immediately. The AI beat widens
     the same window from 650ms to 1200ms. Newly reachable inside it: unmount, **undo**, and
     starting a new match.
  2. **Tests:** unmount is covered by the ai-abort dwell case; the hand-off queue by two
     tests. **Undo was not covered, and was broken.** `doUndo` cleared `lastMove` and
     `handOff` but not the latch, so an undone card went on being announced for the rest of
     its second — a card the player had just taken back. Found only by asking this question:
     typecheck, the six-file exit command and all 869 tests were green at that moment. This is
     `[fail:design] fix-introduced-defect-passes-all-gates` and it is why the step exists.
  3. Fixed in `doUndo` and `startNew`; pinned by `stops naming a card that was taken back`,
     which was RED before the fix.
- **depends_on:** `[1, 2]`  *(Interview #11 — `1` added so the graph, not just the hazard
  prose, forbids Phases 1 and 3 racing on `MatchHost.tsx`)*
- **parallel_group:** `serial-c`
- **merge_hazards:** `src/ui/MatchHost.tsx` (also touched by Phases 1 and 4),
  `src/i18n/ko.ts` (also Phase 1), `src/ui/sound.ts`
- **Scope (in):** `src/ui/CardBanner.tsx` (new), `src/ui/MatchHost.tsx` (notice resolution
  per ADR-004, `CARD_BANNER_MS`, hand-off queueing, AI dwell floor per ADR-005),
  `src/ui/sound.ts` (`card` event), `src/i18n/ko.ts` (`ui.card.played.*`),
  `src/ui/styles.css` (banner layout only — no keyframes yet),
  `tests/ui/card-banner.test.tsx` (new), `tests/ui/ai-abort.test.tsx` (dwell-floor case),
  **`tests/ui/game-feel.test.tsx`** — added 2026-08-13 (Phase A.5 round 2, coverage lens).
  The drafted list was wrong: that file sweeps `SOUND_EVENTS` and asserts every member is
  reached by driving the component, against a short, deliberate exclusion list. Adding `card`
  to the union therefore makes its sweep fail unless the sweep also plays a card — which
  would have surfaced at Phase D as an unexplained regression in a file this phase never
  claimed to touch. The sweep now plays one rather than taking an exclusion-list entry; an
  entry there is an admission that a path is undriven, and this one is one tap away.
- **Scope (out):** impact rings, badge flash, any `@keyframes`
- **Exit criterion:**
  `npm run typecheck && npx vitest run tests/ui/card-banner.test.tsx tests/ui/ai-abort.test.tsx tests/ui/game-feel.test.tsx tests/ui/effect-visibility.test.tsx tests/ui/no-raw-ids.test.tsx tests/ui/chrome-i18n.test.tsx`
  — `game-feel.test.tsx` appended 2026-08-13: it was added to the phase's scope after the
  round-2 coverage finding but left out of the command that gates the phase, which would have
  let its `SOUND_EVENTS` sweep regress unnoticed.
  green, asserting: a banner appears naming the card for a **human** play with input still
  accepted during it; a banner appears for an **AI** play and the AI's move lands only after
  it; a hand-off displaced by a banner still appears afterwards; the banner shows a card
  *name*, never an id. Plus the two lifetime cases from Interview #10, both with fake timers:
  **(a)** a human plays a card and moves again after 200ms — the banner is still on screen and
  still names the card played, and clears at 1.2s from the play; **(b)** a human plays a card
  and does not move for 5s — the banner is gone by 1.2s, not still up.
- **Risk:** `high` — this is the phase that touches the AI turn's timer path, the one place in
  the component with a documented cancellation contract (`MatchHost.tsx:514-522`). A dwell
  change that escapes the existing cleanup leaves a timer firing on an unmounted match.
- **Rollback point:** Phase 2 tip. The banner is purely additive to render; reverting removes
  the notice-resolution refactor along with it.

### Phase 4 — Impact ring and badge flash

- **Status:** DONE (2026-08-13)
- **Exit evidence:** `npm run typecheck` clean; `npx vitest run tests/ui` → **76 files / 873
  tests passed**.
- **Scope reduced, deliberately:** the drafted phase said "impact ring **and badge flash**".
  The badge already has an arrival animation — `pop`, fired by `[data-effect-new]`
  (`styles.css:1844`) — so a second animation on the same element would be motion for its own
  sake. Only the ring was built. What was genuinely missing is a mark on squares that carry
  **no** badge: a swap moves two pieces and writes no effect state at all, so before this the
  board's only reaction to it was the pieces being elsewhere.
- **Phase A.5:** not re-dispatched. Two existing gates already constrain this phase's whole
  surface, and neither is one I wrote: `game-feel.test.tsx`'s reduced-motion test asserts that
  **every** `--motion-*-duration` token is zeroed in the reduce block **and** that every
  `transition`/`animation` rule in component CSS goes through such a token, so the new
  `--motion-impact-duration` was gated the moment it was declared. The three behavioural tests
  went into `tests/ui/card-banner.test.tsx` rather than the drafted `game-feel.test.tsx`,
  because that is where the card fixtures live.
- **Phase D.5:** not applicable — presentation only, no repair.
- **depends_on:** `[3]`
- **parallel_group:** `serial-d`
- **merge_hazards:** `src/ui/MatchHost.tsx`, `src/ui/styles.css`, `src/ui/tokens.css`
- **Scope (in):** `src/ui/tokens.css` (ring/flash duration variables + `reduce` overrides),
  `src/ui/styles.css` (two keyframe sets, the `[data-impact]` and badge-flash rules),
  `src/ui/MatchHost.tsx` (emit `data-impact` on impacted squares, gated by
  `prefersReducedMotion()`), `tests/ui/game-feel.test.tsx`, `tests/ui/tokens.test.ts`
- **Scope (out):** any new information surface; this phase adds no text
- **Exit criterion:**
  `npm run typecheck && npx vitest run tests/ui/game-feel.test.tsx tests/ui/tokens.test.ts && npm run test`
  green, plus: with reduced motion asserted on, no square carries `data-impact` and the banner
  text is still present for its full duration.
- **Risk:** `medium` — CSS regressions are invisible to type checking; the pixel-art
  `crispEdges` constraint is easy to break with a transform on the wrong element.
- **Rollback point:** Phase 3 tip. Pure presentation — reverting cannot change behaviour.

### Phase 5 — End-to-end and motion coverage

- **Status:** DONE (2026-08-13)
- **Exit evidence:** `npm run verify:ci` green (build + 873 unit + 21 build tests);
  `npx playwright test --workers=4` → **427 passed, 0 failed** across mobile-portrait,
  desktop and mobile-webkit.
- **Two e2e added, one deliberately not:**
  - `turn-shape.spec.ts` — the banner names the card that was actually spent (read off the
    hand tile's `aria-label`, since the draft is seeded per run), carries no raw id and no
    unresolved key, and does not block the move that follows.
  - `turn-shape.spec.ts`, in a motion-enabled `describe` — the ring is drawn and its
    animation duration is non-zero once the preference allows it.
  - **The AI card→banner→move ordering was NOT added to `single-player.spec.ts`.** Forcing
    the computer to hold a playable card in a browser is not reliable, and a conditional
    assertion would report green on every run that never reached it — the hazard
    `turn-shape.spec.ts`'s own header already records. It is covered precisely in
    `tests/ui/card-banner.test.tsx` with a stubbed search, which is the only place the
    in-flight window can be held open at all.
- **Flake found and diagnosed, not papered over:** the ring's motion check first lived in
  `e2e/motion.spec.ts`. It passed in isolation and failed the full suite on two of three
  projects, because that file reaches the board through `startMatch`, which deals from a
  **random** seed — so the card in hand varies per run and sometimes cannot be played at all.
  Moved beside the seeded slice content and its card-to-square table, with a pointer left in
  `motion.spec.ts` explaining why it is not there.
- **Pre-existing full-suite flake, unrelated:** at the default worker count two specs failed
  per run and a different two each time (`a11y`, `delete`, both untouched here), each at a
  navigation click; all pass in isolation and the whole suite passes at `--workers=4`. This
  is load on the single dev server, not a regression — recorded rather than silently re-run.
- **Phase D.5:** not applicable — tests only.
- **depends_on:** `[1, 4]`
- **parallel_group:** `serial-e`
- **merge_hazards:** `e2e/motion.spec.ts`, `e2e/single-player.spec.ts`, `e2e/turn-shape.spec.ts`
- **Scope (in):** `e2e/turn-shape.spec.ts` (banner named on a human card play),
  `e2e/single-player.spec.ts` (AI card → banner → move ordering),
  `e2e/motion.spec.ts` (ring duration is declared once motion is allowed),
  ~~`e2e/a11y.spec.ts` (the banner's live region)~~ — **wrong file, corrected during review.**
  That spec reaches the board through `startMatch` and its random seed, so it cannot
  reliably get a card played; the live-region assertion went into `turn-shape.spec.ts`
  beside the deterministic card fixture instead. The drift gate caught this as an
  unexplained incomplete-phase item — the phase had been marked DONE with a deliverable
  its own scope named still unwritten (`[fail:design] phase-done-deliverable-never-written`).
- **Scope (out):** new source files; this phase is tests only
- **Exit criterion:** `npm run verify:ci && npx playwright test` green on both projects.
- **Risk:** `medium` — the AI-ordering assertion is the one timing-sensitive test in the set;
  it must assert *order* (banner visible before the board changes), never a wall-clock
  duration.
- **Rollback point:** Phase 4 tip.

---

## 🧪 Testing Strategy

**Unit (vitest, `tests/ui/`)**
- `card-plays.test.ts` — the derivation, five cases listed in Phase 2. No DOM.
- `match-intro.test.tsx` — first mount shows the sheet, second does not; a storage that
  refuses writes reports "already seen" (the zero-quota case inherited from `coach.ts`).
- `card-banner.test.tsx` — banner content, both-sides coverage, non-blocking human input,
  hand-off queueing, timer restart on a repeated card id.
- `tokens.test.ts` / `game-feel.test.tsx` — the new duration tokens exist and are zeroed under
  `reduce`.

**Regression gates already in the tree that this work must not break**
- `chrome-i18n.test.tsx` — no Hangul in `src/ui/**`.
- `no-raw-ids.test.tsx` — the banner must render a translated name.
- `effect-visibility.test.tsx` — the three existing effect surfaces are unchanged.
- `ai-abort.test.tsx` — the AI cancellation contract survives the dwell change.

**E2E (Playwright)**
- `ftue.spec.ts` — the in-match sheet on a genuinely first visit, and its absence on reload.
- `turn-shape.spec.ts` — a human card play raises a banner naming the card.
- `single-player.spec.ts` — on an AI card turn, the banner is visible **before** the board
  changes. Ordering assertion, not a timing one.
- `motion.spec.ts` — the ring's animation duration is non-zero with motion allowed.

**Manual**
1. Hot-seat, two cards played in succession by opposite sides — banners do not stack, the
   hand-off still arrives.
2. Single-player on the easiest level (fastest search) — the card is readable before the reply.
3. Play a card, then undo — no stale banner.
4. OS-level reduced motion on — banner text still readable, board still.
5. A card refused on a royal — the banner fires, no ring, nothing looks broken.

---

## ⚠️ Risks & Mitigation

| # | Risk | Likelihood | Impact | Mitigation |
|---|------|-----------|--------|------------|
| R1 | The new onboarding flag silently breaks ~40 UI tests that mount `MatchHost` | High | High | ADR-006's registry; Phase 1's exit criterion runs the *whole* `tests/ui` suite, not just the new file |
| R2 | The AI dwell change escapes the existing cleanup → timer on an unmounted match | Medium | High | Reuse the existing `dwell` variable and its `clearTimeout`; add no second timer. `ai-abort.test.tsx` covers it |
| R3 | Banner raised from a handler instead of the derivation → the fourth instance of `rule-keyed-to-event-not-state` | Medium | High | ADR-002; Phase 2 lands the derivation *before* any render code exists to be tempted |
| R4 | Impact ring on a transform breaks pixel-art `crispEdges` | Medium | Medium | Ring on a pseudo-element, never on the sprite; `art-rendered-contrast.spec.ts` and `motion.spec.ts` are the gates |
| R5 | Notice-resolution refactor changes when the *existing* three notices appear | Medium | Medium | Phase 3 keeps every current condition verbatim inside the new ordered pick; `match-lifecycle.test.tsx` is the regression gate |
| R6 | AI turns feel sluggish at +550ms | Low | Medium | Bounded to card turns only, and only for the move that follows a card. Reversible by one constant |
| R7 | `playwright.config.ts` importing from `src/` breaks the config's own resolution | Low | Medium | Verified in Phase 1 by running any single e2e spec before touching the rest |

---

## ✅ Success Criteria

- [x] A card play by **either** side raises a banner carrying that card's mark, name and text.
- [x] On an AI turn containing a card, the banner is on screen before the board changes.
- [x] A human playing a card is never blocked from moving during the banner.
- [x] A hand-off displaced by a card banner still appears, after it.
- [x] Squares a card actually changed show a one-shot ring; a card that changed nothing shows
      none and nothing looks broken.
- [x] The first match a player ever opens shows a sheet naming this match's rule card and the
      turn shape; the second does not; there is no new chrome button.
- [x] Under `prefers-reduced-motion: reduce`, banner text is unchanged and no ring animates.
- [x] `npm run verify:ci` and `npx playwright test` are green.
- [x] `src/engine/**`, `src/content/**` and `src/balance/**` are unmodified — `git diff --stat`
      names no file under them.

---

## 🔍 Plan Validation

**Cross-model second opinion:** skipped. `hm high_diff classify` returned
`{"boundary": false, "is_high": false}` for the working tree at plan time, and the Side
preset's ADR-003 matrix runs enabled models only on a high-diff change.

| Model | Status | Reason |
|---|---|---|
| `codex` | `skipped` | not a high-diff change (`is_high: false`, `boundary: false`) |

**Validator outcome:** `NEEDS_REVISION` on pass 1 → **resolved**. No critical critiques; two
warnings and one suggestion, all resolved by revision rather than accepted as risk.

| # | Critique | Severity | Resolution |
|---|---|---|---|
| 1 | The 1.2s banner duration had no stated mechanism. A purely-derived banner would live for however long the player took to act next — 200ms for a fast player, 5s for a slow one — contradicting the duration promised in three places. | warning | **Revised** (Interview #10). ADR-002 gains an explicit amendment separating *derived identity* (banned from handlers) from *visibility flag* (allowed, driven by the derivation); Technical Design now names the `MatchHost.tsx:382-401` idiom with the concrete hook shape; Phase 3 gains two fake-timer test cases for the fast-player and slow-player paths. |
| 2 | Phase 3 declared `MatchHost.tsx` and `ko.ts` as hazards shared with Phase 1, but its `depends_on` was `[2]` — so a scheduler treating `merge_hazards` as advisory could run them concurrently. | warning | **Revised** (Interview #11). `depends_on: [1, 2]`. The parallelism lost was notional — the chosen phase order already put 1 before 3. |
| 3 | Scope boundaries were scattered across seven ADRs' consequences and one Technical Design row; only one clause used the words "Non-Goal". | suggestion | **Revised** (Interview #12). New `## 🚫 Non-Goals` section consolidating nine boundaries, each citing where it was decided. |

**Validator findings that held up on inspection** (recorded because they are the load-bearing
premises this PLAN would fail on if wrong, and the validator checked them against the engine
rather than taking the draft's word):

- `GameState.turnCard` is set on a card play and cleared by every turn close-out including
  the royal-capture short-circuit; `undo` (`match.ts:32-46`) pops one state mid-turn when
  `turnCard !== null`. `cardPlayBetween`'s premise is sound.
- ADR-005's dwell floor is reachable exactly where claimed: the AI effect's deps include
  `state`, so it re-fires after a card push with `state.turnCard` set, and
  `MatchHost.tsx:509` is the single site needing the conditional floor.
- Every test file named in a phase exit criterion already exists in the tree — this PLAN
  extends real regression gates rather than inventing paths.

**Clean categories:** adr-completeness, risk-register, rollback-strategy,
missing-interview-rounds.
