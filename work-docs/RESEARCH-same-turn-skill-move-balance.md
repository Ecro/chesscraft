---
type: research
task_slug: same-turn-skill-move-balance
status: complete
created: 2026-08-11
tags: [strange-chess, research, typescript, game-balance, turn-model, skill-cards, royal-capture]
mtime_warn_days: 7
libs_fetched: []
sources: []
related_docs: ["[[PLAN-skill-then-move-and-effect-visibility]]", "[[REVIEW-skill-then-move-and-effect-visibility-2026-08-08]]", "[[CARDSET-variant-chess-6x6-cards]]", "[[RESEARCH-custom-piece-skill-balance]]"]
summary: "Keep skill-plus-move, but give royals a response window during skill turns"
---

# RESEARCH — Same-turn skill and move balance

## 🎯 Recommended Direction

**Keep `[play_card?] → move`, but add a global royal response window: a turn that uses a skill may still make its mandatory move and capture ordinary pieces, but it may not remove a royal during either the card resolution or the follow-up move.**

The current problem is not the two-action turn by itself. It is that a skill can create and cash out a terminal threat before the opponent receives an action. This is demonstrated by shipped behavior, not only by the reported `skill.quake` line: `skill.volley` can select and destroy the enemy king during card resolution, and `skill.knight-leap` can grant a rook a new king capture that is taken immediately by the mandatory follow-up move (`tests/engine/skill-cards.test.ts:190-243`). A royal-only response window preserves the reason the turn model changed—skills no longer cost the player's entire move—and preserves same-turn combinations against non-royal material, while guaranteeing one reply before a skill-created threat can end the match. The main impact is user-facing match pacing and counterplay; the engine work is secondary.

This recommendation is informational. `/hm:plan` must decide the exact rule boundary, especially whether it is the simple teachable rule "a skill turn cannot remove a royal" or the narrower but more stateful rule "a skill turn cannot use a *newly created* royal capture."

## 🔍 Refinement Decisions

- Discovery lens: **User-workflow / product opportunity** — preserve the player's desired rhythm of using a skill and moving in one turn, while restoring a visible opportunity to respond.
- Discovery lens: **Technical architecture / implementation** — inspect the action generator, card-resolution branch, royal transition, and shipped card vocabulary.
- Discovery lens: **Risk / game-rule integrity** — ensure every route that removes a royal (direct destroy, capture, relocation onto a hostile square, or future vocabulary) obeys one rule.
- Scope in: terminal outcomes created or accelerated by a same-turn skill, especially royal removal in the capture-the-king ruleset.
- Scope out: reverting to "skill consumes the turn," adding reaction/interrupt turns, and globally weakening ordinary non-terminal captures before playtest evidence exists.

## 🛠️ Approaches Found

### Approach A — Royal response window (recommended)

| Field | Content |
|---|---|
| Approach | A skill turn keeps its follow-up move, but royal removal is unavailable until the opponent has received a turn. Ordinary captures remain legal. |
| Assumption | The reported frustration is primarily "the skill ends the match before I can answer," rather than all same-turn material gains being unacceptable. |
| Evidence | `GameState.turnCard` already marks the exact intermediate state between card and move (`src/engine/types.ts:92-104`). `legalActions` already changes the legal action set while it is non-null (`src/engine/engine.ts:461-475`). Royal removal is currently terminal both in the capture short-circuit and `royalTransition` (`src/engine/engine.ts:901-931, 1121-1135`). Existing tests prove both direct card kill and granted-movement kill paths (`tests/engine/skill-cards.test.ts:190-243`). |
| Trade-off | The simplest version also blocks an already-available king capture if the player unnecessarily uses a skill first. A narrower "new threat only" version avoids that edge case but needs a pre-card snapshot and is harder to explain. |
| Compatibility | High. It retains `[play_card?] → move`, one card per turn, the same ply accounting, and the current skill vocabulary. The UI can explain it as a one-turn royal shield. |
| Risk | **Medium.** Enforcement must cover all royal-removal paths, including indirect death after teleporting onto a bomb square; checking only `move` captures or only `destroy_piece` will be incomplete. |

Two possible contracts fit this approach:

1. **Simple contract:** "If you used a skill this turn, you cannot capture or destroy a king this turn." This is the best fit for the project's young audience and one-line-card design rule.
2. **Precision contract:** snapshot the legal royal captures before card play and allow only those same captures afterward. This avoids penalizing an unrelated skill before an existing win, but adds state, replay, undo, AI-key, and UI complexity.

### Approach B — Per-card timing (`before_move` / `after_move`)

| Field | Content |
|---|---|
| Approach | Buffs and defenses resolve before the move; displacement and destruction skills resolve after the mandatory move. The skill and move still occur in one turn. |
| Assumption | Offensive board mutation is the dangerous category and designers accept two timing classes. |
| Evidence | The shipped set naturally separates into movement grants/defenses and immediate board mutation (`src/content/sets/bundled.ts:718-1143`). Deferring `skill.quake` until after the move directly prevents "place beside attacker, then capture." |
| Trade-off | Card order becomes a per-card rule that children must learn. Target validity can change between choosing the card and making the move, requiring retarget, cancellation, or deterministic fallback behavior. It also does not automatically prevent `skill.volley` from ending the match after the move. |
| Compatibility | Medium. The turn remains skill-plus-move, but the engine needs pending card targets/effects rather than the current already-resolved `turnCard` marker. Undo, AI search, effect visualization, and replay semantics all widen. |
| Risk | **High.** It creates two timing models and makes future cards easy to misclassify. |

### Approach C — Content-only nerfs and targeting restrictions

| Field | Content |
|---|---|
| Approach | Edit individual cards: make royals untargetable, limit `skill.quake` destination range, shorten grants, narrow selectors, or raise declared costs. |
| Assumption | Only a small, stable list of shipped cards is problematic and custom-authored cards do not need the same protection. |
| Evidence | `skill.quake` is maximally permissive—any chosen enemy to any chosen empty square (`src/content/sets/bundled.ts:1042-1056`)—and `candidatesFor` includes every enemy piece, including royals (`src/engine/engine.ts:258-276`). Several other shipped cards expose the same pattern through destroy or movement grant actions. |
| Trade-off | Individual cards retain distinct identities and can be tuned cheaply, but the same failure returns with the next authored card or indirect combo. `cost` does not solve the no-response moment because it is a loadout/drafting balance input, not an in-turn payment or reaction window. |
| Compatibility | High for shipped-content edits, low as a complete rule for user-authored content. No turn-engine rewrite is required. |
| Risk | **High as the only solution; low as a follow-up audit.** It is a blacklist over instances rather than an invariant over terminal state. |

### Comparison

| Criterion | A. Royal response window | B. Per-card timing | C. Content-only tuning |
|---|---:|---:|---:|
| Keeps skill + move in one turn | Yes | Yes | Yes |
| Guarantees opponent response before skill-assisted king loss | **Yes** | Partial | No |
| Preserves ordinary same-turn combos | **Yes** | Mixed | Card-specific |
| Easy rule for players | **High** | Low | Medium |
| Covers future/custom skills | **High** | Medium | Low |
| Engine complexity | Medium | High | Low initially |

## ⚠️ Pitfalls

1. **Do not key protection only to the capture event.** A royal can leave the board through `destroy_piece`, a card-driven relocation followed by square-entry effects, or future removal vocabulary. The project already records this exact failure class as `[fail:design:rule-keyed-to-event-not-state]`: terminal rules must be audited against the state transition, not only the event that usually causes it.
2. **Do not make every skill effect wait until the next turn.** That recreates the old problem in another form: skills become a tempo loss, and the prior implementation measured eleven of thirteen cards as negative before `[play_card?] → move` (`[[PLAN-skill-then-move-and-effect-visibility]]`, implementation notes at lines 368-378).
3. **Do not solve terminal pacing with cost alone.** A higher draft/loadout cost can reduce frequency, but when the card appears the opponent still has zero response. Frequency balance and interaction quality are separate axes.
4. **Do not protect only explicitly selected kings.** `skill.knight-leap` proves that a friendly target can create the terminal move, while `skill.quake` can create it by relocating the enemy. Selector-based exceptions miss indirect geometry changes.
5. **Do not silently reject legal-looking targets.** If a royal response window removes a target or capture, the board preview and rejection text must state why. Otherwise the engine will be correct and the interaction will feel broken.
6. **Do not accidentally suppress unrelated alternate win rules.** A blanket "no result on a skill turn" could block a legitimate end-of-ply hill/check/material condition. The initial scope should be royal removal unless playtest evidence shows other terminal types have the same no-response problem.
7. **Do not use only random self-play to validate the fix.** The previous measurement rig was useful for broad deltas but tactical two-action combos are choice-dependent. Add scripted fixtures for each terminal path and playtest pacing separately from aggregate win rate.

## ❓ Open Questions

1. Is the intended player rule the simple, visible **"a skill turn cannot remove a royal"**, or the narrower **"a skill cannot create a new same-turn royal capture"**? The former is easier to teach; the latter preserves more tactical freedom.
2. May a skill directly move, freeze, or otherwise affect a royal as long as it cannot remove it that turn? For `skill.quake`, allowing relocation creates a strong threat but gives the opponent one reply; forbidding royal targets is simpler but removes a distinctive tactic.
3. Should direct royal-destroy cards such as `skill.volley` be unable to target royals, or should the royal survive with a visible one-turn shield? Target filtering is clearer; state protection is more future-proof.
4. Does the response window cover only `king_capture`, or also explicit `win_action` and alternate end-of-ply wins? Current evidence directly supports only royal removal.
5. Is one opponent action enough counterplay when the skill also freezes or pins the royal? A focused playtest matrix should include relocation, movement grant, line-opening, freeze/pin, direct destroy, and hostile-square relocation.
6. After the invariant is installed, which cards still need content tuning? `skill.quake` may still be too strong against queens or key blockers even when it cannot produce a same-turn royal capture.

## 📚 Sources

- No external web or library sources were fetched. The question is specific to the repository's implemented turn model, shipped cards, and terminal-state pipeline; those internal sources are authoritative for this stage.
- `src/engine/types.ts:92-104` — `turnCard` and `[play_card?] → move` state contract.
- `src/engine/engine.ts:258-276` — friendly/enemy selectors include every piece of the selected side.
- `src/engine/engine.ts:461-475` — legal-action split before and after a card.
- `src/engine/engine.ts:901-1054, 1121-1135` — capture short-circuit, card resolution, and royal transition.
- `src/content/sets/bundled.ts:718-1143` — shipped skill definitions, including direct destroy, movement grant, and unrestricted displacement.
- `tests/engine/skill-cards.test.ts:190-243` — executable evidence for direct card kill and skill-granted same-turn royal capture.

## 🔗 Related Internal Docs

- [[PLAN-skill-then-move-and-effect-visibility]] — accepted turn shape, same-turn effect semantics, and the measured reason not to return to skill-as-turn.
- [[REVIEW-skill-then-move-and-effect-visibility-2026-08-08]] — AI and state-model consequences of the two-action turn.
- [[CARDSET-variant-chess-6x6-cards]] — intended card behaviors and the one-line, own-turn-only interaction model.
- [[RESEARCH-custom-piece-skill-balance]] — structural, cost, and empirical balance approaches; useful for separating terminal counterplay from frequency/strength pricing.
- `[fail:design:rule-keyed-to-event-not-state]` — warm-memory warning that terminal logic must cover every route to royal loss.
- `[wiki:architecture:piece-info-affordances]` — related UI principle: explain restrictions through the existing state-driven affordance rather than a hidden event-only exception.
