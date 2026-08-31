---
type: spec
task_slug: veil-effect-move-persistence
status: approved
created: 2026-09-01
tier: 2
tags: [strange-chess, spec, typescript, engine, grants, movement]
test_framework: vitest
research_doc: "[[RESEARCH-veil-effect-move-persistence]]"
summary: "Keep durationed capture protection attached to its beneficiary across relocation."
---

# SPEC — Capture-protection relocation

## 🎯 Intent

`skill.veil` promises that the chosen piece cannot be captured for three plies, but the engine stores that protection on the piece's current square. A normal move therefore leaves the shield behind. This change makes durationed capture protection follow its beneficiary without changing the established square semantics of movement locks, movement grants, and freezes.

## 🌅 Outcomes

- A piece protected by `skill.veil`, `skill.bulwark`, `skill.guard`, `skill.ward`, or durationed square cover remains protected after it relocates.
- The live-effect badge and legend identify the piece's current square, never its vacated square.
- Other square-keyed effects keep their current behavior.
- Existing snapshots and content definitions remain compatible.

## 📋 In-Scope Scenarios

### AC-001: durationed capture protection follows a normal move

**Given** a non-royal white piece on `b1` has a live durationed `block_capture` grant whose beneficiary is white
**When** that piece makes a legal move from `b1` to `b2`
**Then** the live grant names `b2` and no equivalent grant remains on `b1`
**And** an otherwise legal enemy capture of the piece on `b2` is excluded while the grant remains live

### AC-002: capture protection follows every engine relocation path

**Given** a live durationed `block_capture` grant belongs to a non-royal piece
**When** the piece is relocated by a normal move, `teleport_piece`, or either half of `swap_pieces`
**Then** exactly one grant follows that piece to its final surviving square
**And** unrelated grants on the origin or destination are unchanged

### AC-003: square-anchored effects do not start following pieces

**Given** a piece stands on a square carrying a live `forbid_movement`, `grant_movement`, or `frozenUntil` entry
**When** an engine relocation moves or removes that piece by a path on which the effect does not prevent the relocation
**Then** those entries retain their existing square keys
**And** no new copy appears on the piece's destination

### AC-004: visible capture protection moves with the beneficiary

**Given** `liveEffects` reports a live shield on the protected piece's origin
**When** the piece relocates and the next state is rendered
**Then** `liveEffects` reports the shield on the final occupied destination
**And** it reports no shield on the vacated origin

### AC-005: an entry-destroyed beneficiary leaves no lingering protection

**Given** a protected piece begins a move or card relocation toward a destroy-on-enter square
**When** the destination entry cascade destroys that piece and leaves the destination empty
**Then** no live `block_capture` grant remains at either origin or destination
**And** a piece that enters the destination on a later transition cannot inherit the expired attachment

## 🚫 Non-Goals

- Changing protection duration or `untilPly` arithmetic.
- Adding stable piece-instance IDs.
- Changing royal skill immunity or allowing veil to target royals.
- Moving `forbid_movement`, `grant_movement`, or `frozenUntil` with a piece.
- Changing content schema, editor vocabulary, card text, or card costs.
- Refactoring unrelated board mutation or event-settlement logic.

## ⚠️ Constraints

| Constraint | Value | Rationale |
|---|---|---|
| Test framework | `vitest` | Repository-standard TypeScript unit framework from `package.json`. |
| Performance | O(number of live grants) per relocation; no additional move-generation traversal | Match states already carry a small grant array, and relocation is not a search inner loop by itself. |
| Security | No external input or privilege boundary changes | The change is deterministic in-memory game-state logic. |
| Compatibility | Preserve `ActiveGrant` serialized shape and snapshot version | The recommended repair changes only `square` values during transitions. |
| Contract | Durationed `block_capture` follows its beneficiary; other persistent effect kinds remain square-anchored | Matches player-facing card language while preserving existing hazards. |

## ✅ Verification Criteria

| Scenario | Verification mode | Test name / manual step |
|---|---|---|
| AC-001 | unit | `tests/engine/grant-relocation.test.ts` — normal move moves the grant and capture legality |
| AC-002 | unit | `tests/engine/grant-relocation.test.ts` — normal move, teleport, and both swap endpoints |
| AC-003 | unit | `tests/engine/grant-relocation.test.ts` — non-protection effects remain on origin |
| AC-004 | unit | `tests/ui/effect-visibility.test.tsx` — `liveEffects` destination/origin exact set |
| AC-005 | unit | `tests/engine/grant-relocation.test.ts` — entry-destroyed subject leaves no lingering grant |

### Oracle assignments

- **AC-001 — property:** moving an object-bound protection from `from` to `to` must preserve exactly one protection at `to`; the card text and move relation define this independently of storage.
- **AC-002 — property:** relocation mechanism cannot change ownership semantics; normal move, teleport, and swap must obey the same one-beneficiary/one-grant invariant.
- **AC-003 — golden:** the pre-existing contract in `ActiveGrant` comments and `PLAN-movement-lock-8x8-and-rule-cards` fixes the expected origin keys for non-protection effects.
- **AC-004 — differential:** `liveEffects(after)` must expose the engine state's grant square exactly, while the before/after set difference proves the origin entry disappeared.
- **AC-005 — property:** an effect cannot remain attached to a beneficiary that has no final board location; after all entry cascades, an empty destination implies zero capture-protection grants there.

## ❓ Open Questions

- None. The user authorized autonomous defaults and requested the pipeline continue without questions.

## 🔍 Refinement Decisions

- Intent and outcome inherited from `RESEARCH-veil-effect-move-persistence`.
- All durationed `block_capture` grants follow their beneficiary, including square-acquired cover; there is no current content declaring lingering-square capture protection.
- Implementation must use one narrow relocation helper at existing movement seams rather than stable piece identities or a broad board-mutation refactor.
- Protection survives promotion because promotion occurs after relocation and preserves side/continuity; removal before a surviving destination prevents transfer.
- Verification tier 2 is sufficient: deterministic engine and UI unit tests plus the full repository CI suite.
