---
type: research
task_slug: veil-effect-move-persistence
status: complete
created: 2026-09-01
tags: [strange-chess, research, typescript, engine, grants, movement]
mtime_warn_days: 7
libs_fetched: []
sources: []
related_docs: ["[[RESEARCH-movement-lock-8x8-and-rule-cards]]", "[[PLAN-movement-lock-8x8-and-rule-cards]]", "[[REVIEW-movement-lock-8x8-and-rule-cards-2026-08-14]]"]
summary: "Move durationed capture protection with its beneficiary across every relocation path."
---

## 🎯 Recommended Direction

Treat a durationed `block_capture` grant as protection attached to its beneficiary piece, and move that grant whenever the engine relocates the beneficiary from one square to another. Keep `forbid_movement`, `grant_movement`, and `frozenUntil` square-anchored. This is the smallest semantic distinction that matches the shipped card text (for example, `skill.veil` says the chosen piece cannot be captured) without introducing persistent piece-instance IDs or special-casing one card. The main impact is user-facing: the visible shield and capture immunity remain on the piece the player selected after it moves.

## 🔍 Refinement Decisions

- Discovery lens: Technical architecture / implementation; Risk / regression.
- In scope: durationed capture protection created in `state.grants`, normal moves, captures, teleport-style relocations, swaps, UI effect location, AI position hashing, and snapshot round-trips.
- Out of scope: changing effect duration arithmetic, royal immunity, content schema vocabulary, or the existing square ownership of movement locks, movement grants, and freezes.
- Internal memory surfaced: `[wiki:settlement-grants-and-board-size]` is directly relevant; `[wiki:piece-maker-split-axes]` and `[wiki:turning-slide]` concern movement generation but not persistent-effect ownership.

## 🛠️ Approaches Found

### Approach A — Relocate durationed capture protection at the engine movement seams (recommended)

| Field | Content |
|---|---|
| Approach | Move every live `block_capture` grant whose `square` is the relocation origin and whose `beneficiarySide` matches the relocated piece. |
| Assumption | A durationed capture block protects the selected/entering piece, while other grant kinds remain properties of a square. |
| Evidence | `skill.veil` is described as cover "for one piece" and targets `chosen_friendly` (`src/content/sets/bundled.ts:1545-1559`); Korean copy likewise names the chosen piece (`src/i18n/ko.ts:187-188`). `ActiveGrant` is currently keyed only by `square` (`src/engine/types.ts:30-58`), and the normal move branch changes `board` from `from` to `to` without changing `m.grants` (`src/engine/engine.ts:1320-1368`). Teleport and swap likewise mutate the board directly (`src/engine/engine.ts:1040-1120`). |
| Trade-off | Every relocation path must call one shared helper; missing one would preserve the bug on that path. The helper and tests must cover move, teleport, swap, and removal/capture non-transfer. |
| Compatibility | High. No content-schema change is required, and the serialized `ActiveGrant` shape can remain unchanged. UI derives badges from `grant.square`, so it follows automatically once the engine updates that field (`src/ui/liveEffects.ts:59-73`). AI hashing already reads the square and will distinguish the moved effect (`src/engine/ai/search.ts:257-259`). |
| Risk | low-medium |

### Approach B — Add explicit grant anchoring metadata

| Field | Content |
|---|---|
| Approach | Add `anchor: piece | square` (or equivalent) to `ActiveGrant` and set it when actions create durationed effects. Relocate only piece-anchored grants. |
| Assumption | Authors need both piece-bound and square-bound durationed instances of the same action kind. |
| Evidence | The current model deliberately makes all grants square-keyed (`src/engine/types.ts:30-37`), while the reported behavior proves that at least `block_capture` sometimes has piece semantics. Explicit metadata would represent that distinction rather than deriving it from `kind`. |
| Trade-off | Clearer future extensibility, but it expands runtime state, serialization/migration, all grant fixtures, AI hashing, and authoring semantics. No current content demonstrates a durationed `block_capture` that should remain on an emptied square. |
| Compatibility | Medium. Old snapshots and hand-built test fixtures need a default, and a content-level authoring field would require schema/editor changes if exposed. |
| Risk | medium |

### Approach C — Introduce stable piece-instance IDs and key effects by piece

| Field | Content |
|---|---|
| Approach | Give each board piece an identity token and store piece-bound effects against that token rather than a square. |
| Assumption | The engine will soon need durable identity across move, promotion, destruction, revival, and same-kind duplicates. |
| Evidence | Existing comments repeatedly identify the absence of piece identities as the reason effects use square keys (`src/engine/types.ts:30-37`, `src/engine/engine.ts:851-879`). Stable identity would solve the general problem rather than transferring square keys procedurally. |
| Trade-off | Architecturally strongest but far beyond this bug: board snapshots, setup, promotion, revival, AI keys, UI comparisons, match observation, and many fixtures would change. Identity semantics for promotion and revival would need separate decisions. |
| Compatibility | Low for this work unit. It changes a core engine contract and snapshot format. |
| Risk | high |

## ⚠️ Pitfalls

1. **Moving every grant would change established board hazards.** The current design intentionally lets `forbid_movement`, `grant_movement`, and freezes remain on squares. The repair must be restricted to durationed capture protection unless a later plan explicitly changes those contracts (`src/engine/types.ts:30-58`; `[[PLAN-movement-lock-8x8-and-rule-cards]]`).
2. **Normal moves are not the only relocation path.** `teleport_piece` and `swap_pieces` mutate the board in `executeActions`; a fix only in the main move branch would create path-dependent effect ownership (`src/engine/engine.ts:1040-1120`).
3. **Do not infer ownership from the caster.** Existing `beneficiarySide` work deliberately derives protection ownership from the occupant/event subject so shielding an enemy remains meaningful. Transfer must match that recorded beneficiary, not `sideToMove` (`src/engine/engine.ts:1130-1164`; `tests/engine/grant-beneficiary.test.ts`).
4. **Do not leave a duplicate at the origin.** A copy-to-destination implementation would make one card protect multiple future occupants. The operation must replace the grant's square atomically.
5. **Do not transfer after destruction.** If an `on_leave` or `on_capture` effect removes the mover before placement, the current engine intentionally leaves nothing to place. Protection must not reappear on the destination without the beneficiary (`src/engine/engine.ts:1357-1368`).
6. **Existing green tests are insufficient evidence.** The targeted baseline passed 108 tests, but none asserts protection after beneficiary movement. New tests need an independent oracle: compare the protected piece's destination against an attacker's legal captures and assert the vacated origin carries no live shield.

## ❓ Open Questions

1. Should all durationed `block_capture` effects follow their beneficiary, including cover acquired from `square.mist` and lower-cost `skill.guard`/`skill.ward` variants? Recommended default: yes; their target and prose describe protection of an occupant/piece, and no current durationed capture block declares lingering-square semantics.
2. Should the implementation centralize all board relocations behind a helper now, or add a narrower helper called at the three existing relocation sites? Recommended default: a narrow `moveAttachedGrants(from, to, piece)` helper called by normal move, teleport, and both swap directions; do not refactor unrelated board mutation.
3. When a protected piece promotes on landing, should protection remain? Recommended default: yes; promotion changes its definition, not its side or continuity within the relocation, and the user selected the moving piece.
4. Does the visible remaining-count convention need to change? Recommended default: no; this bug concerns location/ownership only, and current absolute `untilPly` arithmetic is already used by UI and engine.

## 📚 Sources

- No external web or library sources were required; the project code and committed design artifacts are authoritative for this engine bug.
- `src/engine/types.ts` — `ActiveGrant` square-keyed state and beneficiary ownership.
- `src/engine/engine.ts` — grant creation, move, teleport, swap, settlement, and state serialization paths.
- `src/content/sets/bundled.ts` and `src/i18n/ko.ts` — `skill.veil` behavior and player-facing wording.
- `src/ui/liveEffects.ts` and `src/engine/ai/search.ts` — downstream consumers of `grant.square`.
- `tests/engine/grant-beneficiary.test.ts`, `tests/engine/card-liveness.test.ts`, and `tests/ui/effect-visibility.test.tsx` — current coverage and the missing move-persistence scenario.

## 🔗 Related Internal Docs

- [[RESEARCH-movement-lock-8x8-and-rule-cards]]
- [[PLAN-movement-lock-8x8-and-rule-cards]]
- [[REVIEW-movement-lock-8x8-and-rule-cards-2026-08-14]]
- [wiki:settlement-grants-and-board-size]
