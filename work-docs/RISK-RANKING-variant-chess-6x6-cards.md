---
type: risk-ranking
task_slug: variant-chess-6x6-cards
phase: 6a
created: 2026-08-05
cardset: "[[CARDSET-variant-chess-6x6-cards]]"
plan: "[[PLAN-variant-chess-6x6-cards]]"
status: complete
summary: "Schema-risk ranking of the 28-card set, and the five items Phase 6a authors"
---

# Schema-risk ranking — PLAN Phase 6a, deliverable (c)

Ranked by **schema risk**, not by design difficulty or balance. The question each row answers
is: *if we are wrong about the vocabulary, does this card find out?* A card that is hard to
balance but trivially expressible carries no schema risk and belongs in Phase 6b.

Scoring inputs, from the PLAN's own list of what 6a exists to stress: multi-layer
interaction, cross-references, status effects with duration, resurrection/creation of pieces,
and any `win` action. Added after writing the set down: **declared-but-inert** vocabulary —
schema entries that validate and then do nothing, which is the failure shape no author can
see (G-7, G-12, G-15 all have it).

| Rank | Card | Risk drivers | Score | Authored in 6a? |
|---|---|---|---|---|
| 1 | R2 삼체크 | `win` action; `check_count_at_least` is **declared and inert**; needs an engine capability that does not exist in any form | 9 | **yes** |
| 2 | R14 왕의 호위 | multi-layer (rule card reaching into E1 generation beside piece passives); blocked on G-9, which alone unblocks six cards | 9 | **yes** |
| 3 | S5 부활 | creation of pieces; needs state the engine throws away (captured pieces); also rides on G-12 | 8 | **yes** |
| 4 | S12 귀환 | `own_back_rank` is **declared and inert** — validates, draws, plays, does nothing | 7 | **yes** |
| 5 | R1 언덕의 왕 | `win` action; must lose to king capture on the same ply (ADR-012 precedence) | 7 | **yes** |
| 6 | R10 모서리 포탈 | cross-references, symmetric pairing (ADR-010), cascade under the once-per-ply rules | 7 | no — already proven |
| 7 | S3 방패 | replacement effect that persists across turns; G-15 | 7 | no — needs-subsystem |
| 8 | S9 장벽 | a card painting a square at runtime, with a duration | 7 | no — needs-subsystem |
| 9 | R3 오리 | third (neutral) side; forced placement every ply; path blocking | 7 | no — needs-subsystem |
| 10 | R8 재활용 | graveyard + G-12 | 6 | no — same drivers as S5 |
| 11 | S8 기사의 도약 | G-15 durable grant | 6 | no — same driver as S3 |
| 12 | S2 자리바꿈 | G-14; two teleports cannot express it | 5 | no |
| 13 | S11 희생 | G-16 adjacency between two chosen targets | 5 | no |
| 14 | R11 최후의 저항 | G-9 + G-13 count condition | 5 | no |
| 15 | S13 밀치기 | G-4 offset destination | 4 | no |
| 16 | R4 빠른 승격 / R5 폰 돌격 / R6 나이트 축제 / S10 돌진 | all G-9, no driver R14 does not already carry | 4 | no |
| 17 | S14 징집 | G-12, no driver S12 does not already carry | 3 | no |
| 18 | R12 속공 턴 / S4 연속 이동 / R13 반쪽 안개 / R7 합체와 분리 | turn structure, view redaction, occupancy model — outside the content vocabulary by design | — | no — recommended cuts |
| 19 | R9 폭탄칸 / S1 순간이동 / S6 결박 / S7 대관식 | expressible today, no unknowns | 1 | no — Phase 6b |

## Why these five

Ranks 1–5 are authored. Together they cover **every** risk driver the PLAN named, with no
two items covering the same one twice:

- `win` action → R2 and R1, deliberately both: R1 tests that a content-defined win **loses**
  to king capture on the same ply (ADR-012), and R2 tests a win that fires from a *counter*
  rather than from a board position.
- multi-layer interaction → R14 (a rule card reaching into E1 generation alongside piece
  passives, which is where the layer order stops being theoretical).
- creation of pieces → S5.
- declared-but-inert vocabulary → R2 and S12, the two known instances.

Ranks 6–9 score as high as rank 5 but are **not** authored, for two different reasons, and
the difference matters:

- **R10 (rank 6)** is already proven. `tests/content/special-squares.test.ts` drives paired
  portals, and Phase 3 hardened the cascade rules against them. Authoring it again would
  spend the gate's budget re-confirming a resolved question.
- **S3, S9, R3 (ranks 7–9)** are *needs-subsystem*. Authoring them is not a content task at
  all — each is a new engine capability (replacement effects, runtime square painting, a
  third side). Attempting them inside a content gate would smuggle a subsystem decision in as
  an implementation detail. **They are escalated to the user as scope decisions**, which is
  what the ranking is for.

## What this phase must land besides the five cards

Exit criterion (d) requires the gap list to be empty or the ADR-005 extension to have landed.
The five items need exactly these, and this is the whole list:

| Gap | What lands | Driven by |
|---|---|---|
| G-7 | check detection + a per-side check counter; `check_count_at_least` stops evaluating false | R2 |
| G-9 | a quantifier binding each matching piece as the effect's subject, so a rule card can act on pieces | R14 |
| G-12 | `own_back_rank` resolves to real squares | S5, S12 |
| — | captured pieces are retained in `GameState` | S5 |
| G-6 | `spawn_piece` enters the square it spawns onto, like every other arrival | S5 (a revived piece must not walk onto a bomb square unharmed) |
| G-5 | **decided, not coded**: a piece-layer effect fires once per owning piece, and owner-relative targets bind to *that* piece. Written into ADR-002, and the resolution log gains the owner square so it is auditable | R14 makes it acute — per-king firing is the correct reading, so the semantics become intentional rather than accidental |

Still deferred, with the driver that would force them:

- **G-3** (owner-relative side comparison) — no authored item needs it; G-9 supplies the owner
  binding R14 wanted. Forced by any "when an *enemy* piece does X" passive.
- **G-4** (offset destination) — forced by S13 밀치기.
- **G-13, G-14, G-15, G-16** — forced by R11, S2, S3/S8, S11 respectively. **G-15 is the one
  to watch**: it makes three of the nine actions silently inert on skill cards, and the schema
  advertises all nine.
