---
type: cardset-specification
task_slug: variant-chess-6x6-cards
phase: 6a
created: 2026-08-05
plan: "[[PLAN-variant-chess-6x6-cards]]"
research: "[[RESEARCH-variant-chess-6x6-cards]]"
gaps: "[[VOCAB-GAPS-variant-chess-6x6-cards]]"
status: complete
summary: "Intended behaviour of all 14 rule and 14 skill cards, with the vocabulary each needs"
---

# Card set specification — PLAN Phase 6a, deliverable (a0)

ADR-011's premise: **a risk ranking cannot rank content that does not exist.** So the whole
set is written down first — one line of intended effect each — and only then ranked. The
`Vocabulary needed` column is what turns the ranking from taste into evidence: an item that
needs something the schema cannot say is, by definition, the schema risk.

Sources: RESEARCH R1–R14 and S1–S11. S12 (Counterspell) is **cut** — it resolves in response
to an opponent's card, which the SPEC's card-timing constraint forbids outright (it is the
MTG priority stack the whole design avoids). Three skill cards are newly designed here to
reach fourteen: **S12 Recall**, **S13 Shove**, **S14 Recruit**.

Legend for `Status`:

- **expressible** — authorable against the Phase 1 vocabulary as it stands today.
- **needs-extension** — authorable once a named gap closes; the gap is given.
- **needs-subsystem** — requires engine capability that does not exist in any form. These
  are decisions, not tasks.

---

## Rule cards (public, one drawn at random per match)

| # | Name (ko) | Intended effect, one line | Vocabulary needed | Status |
|---|---|---|---|---|
| R1 | 언덕의 왕 | 내 킹이 중앙 4칸(c3/c4/d3/d4)에 서 있는 채로 턴이 끝나면 즉시 승리 | `end_of_ply` + `on_square` + `win` | **expressible** |
| R2 | 삼체크 | 상대를 세 번 체크하면 승리 | `check_count_at_least` **evaluated**, not inert | needs-subsystem — check detection (G-7) |
| R3 | 오리 | 매 수 뒤 중립 오리를 빈 칸으로 옮긴다; 오리 칸은 지나갈 수 없다(나이트는 넘는다) | 중립 진영, 매 플라이 강제 배치, 경로 차단 | needs-subsystem — third side + path blocking |
| R4 | 빠른 승격 | 폰이 5행에 닿으면 승격한다 | 룰카드가 기물 정의를 덮어쓰기 | needs-extension — G-9 (rule-card quantifier) |
| R5 | 폰 돌격 | 모든 폰은 첫 이동에 두 칸 전진할 수 있다 | `generate_moves` + `grant_movement` + "아직 움직인 적 없음" 조건 | needs-extension — G-9 + 기물별 이동 이력 |
| R6 | 나이트 축제 | 모든 폰은 게임 중 한 번 나이트처럼 움직일 수 있다 | G-9 + 기물별 1회 사용 카운터 | needs-extension — G-9 + per-piece counter |
| R7 | 합체와 분리 | 같은 편 기물끼리 합칠 수 있고, 합친 기물은 둘 중 하나로 움직이거나 다시 나뉜다 | 한 칸에 두 기물, 합성 기물 정의 | needs-subsystem — square occupancy model |
| R8 | 재활용 | 잡은 폰은 자기 뒷줄 빈 칸에 다시 놓을 수 있다 | 포획 이력 + `own_back_rank` 목적지 | needs-extension — graveyard + G-12 |
| R9 | 폭탄칸 | 대각선 모서리 두 칸은 폭탄칸이다 — 들어간 기물은 사라진다 | `on_enter` + `destroy_piece` (square type) | **expressible** |
| R10 | 모서리 포탈 | 네 모서리는 서로 연결되어 있다 | `paired_square` + 대칭 페어링(ADR-010) + 캐스케이드 | **expressible** |
| R11 | 최후의 저항 | 내 기물이 킹 포함 셋 이하가 되면 킹이 퀸처럼 움직인다 | G-9 + 진영별 기물 수 조건 | needs-extension — G-9 + G-13 (count condition) |
| R12 | 속공 턴 | 다섯 턴마다 한 번, 두 플레이어 모두 두 수를 연속으로 둔다 | 턴 구조 변경 | needs-subsystem — turn structure is engine-owned |
| R13 | 반쪽 안개 | 상대 진영 두 줄은 보이지 않는다 | `viewFor` 리댁션 | needs-subsystem — per-player view redaction |
| R14 | 왕의 호위 | 킹에 인접한 자기 기물은 잡히지 않는다 | G-9 + `adjacent_friendly` + `block_capture` | needs-extension — G-9 |

## Skill cards (private, drafted 1-of-3 twice)

| # | Name (ko) | Intended effect, one line | Vocabulary needed | Status |
|---|---|---|---|---|
| S1 | 순간이동 | 내 기물 하나를 아무 빈 칸으로 옮긴다 | `teleport_piece` + `chosen_friendly` → `chosen_empty` | **expressible** |
| S2 | 자리바꿈 | 내 기물 둘의 위치를 맞바꾼다 | 두 기물의 동시 교환 | needs-extension — G-14 (swap action) |
| S3 | 방패 | 다음에 잡힐 내 기물 하나가 잡히지 않고 살아남는다 (1회) | 지속되는 대체 효과 | needs-subsystem — replacement effects |
| S4 | 연속 이동 | 이번 턴에 두 번 움직인다 | 턴 구조 변경 | needs-subsystem — turn structure |
| S5 | 부활 | 잡힌 내 기물 하나를 뒷줄 빈 칸에 되살린다 (퀸 제외) | 포획 이력 + `own_back_rank` | needs-extension — graveyard + G-12 |
| S6 | 결박 | 상대 기물 하나를 두 턴간 묶는다 | `freeze_piece` + `chosen_enemy` | **expressible** |
| S7 | 대관식 | 내 폰 하나를 즉시 승격시킨다 | `promote_piece` + `chosen_friendly` | **expressible** |
| S8 | 기사의 도약 | 내 기물 하나가 나이트처럼 한 번 움직인다 | `grant_movement`가 카드 발동을 넘겨 지속 | needs-extension — G-15 (durable grant) |
| S9 | 장벽 | 빈 칸 하나에 세 턴간 벽을 세운다 | 카드가 칸을 칠하기 + 지속시간 | needs-subsystem — runtime square painting |
| S10 | 돌진 | 내 폰들은 항상 두 칸 전진할 수 있다 (지속) | G-9 + G-15 | needs-extension |
| S11 | 희생 | 내 기물 하나를 버리고 그에 인접한 상대 기물 하나를 없앤다 | `destroy_piece` ×2 + 인접 제약 | needs-extension — G-16 (targets must be adjacent) |
| S12 | 귀환 | 내 기물 하나를 내 뒷줄 빈 칸으로 옮긴다 | `own_back_rank` 목적지가 **실제로 동작** | needs-extension — G-12 |
| S13 | 밀치기 | 인접한 상대 기물 하나를 곧장 한 칸 뒤로 민다 | 상대 위치 기준 오프셋 목적지 | needs-extension — G-4 |
| S14 | 징집 | 내 뒷줄 빈 칸에 폰 하나를 불러낸다 | `spawn_piece` + `own_back_rank` | needs-extension — G-12 |

---

## What writing the set down actually revealed

Counting the `Status` column is the finding, and it is not the one the PLAN expected:

| Status | Rule | Skill | Total |
|---|---|---|---|
| expressible today | 3 | 3 | **6 of 28** |
| needs-extension | 5 | 7 | 12 |
| needs-subsystem | 6 | 4 | 10 |

**Six of twenty-eight cards can be authored against the vocabulary as it stands.** AC-010
requires ≥10 rule and ≥14 skill cards all schema-valid, so the bundled set cannot be reached
by writing content — it is gated on closing gaps. That is precisely the risk ADR-011 put this
phase before Phase 5 to find, and finding it here rather than in Phase 6b is the phase paying
for itself.

Three gaps dominate, by how many cards they unblock:

1. **G-9 — a rule card cannot act on pieces.** A rule-card effect has no owner square, so
   every piece-relative target (`self`, `adjacent_friendly`) resolves to nothing. Six cards
   (R4, R5, R6, R11, R14, S10) are blocked on this one thing. It is the single highest-value
   extension in the set, and it is well-shaped: a quantifier that binds each matching piece
   as the subject.
2. **G-12 — `own_back_rank` is declared in the schema but the interpreter ignores it.** Three
   cards (R8, S5, S12, S14) name it. It parses and validates, so an author gets a card that
   passes every check and silently does nothing — the worst failure shape available.
3. **A graveyard does not exist.** Two cards (R8, S5) need captured pieces to come back.
   `GameState` discards them.

## New gaps this phase surfaced

Recorded here and folded into [[VOCAB-GAPS-variant-chess-6x6-cards]]:

- **G-9** — rule-card effects cannot bind a piece as subject (no quantifier).
- **G-12** — `destination: own_back_rank` validates but is unimplemented; a card using it is
  silently inert. Same shape as G-7, and both are the "declared but not wired" class.
- **G-13** — no condition over a side's piece count.
- **G-14** — no swap action; two teleports cannot express it (each needs its destination empty).
- **G-15** — `grant_movement` / `forbid_movement` / `block_capture` are consumed at E1 only,
  so a **skill card** carrying them is a no-op: the card resolves at `on_play` and nothing
  survives to the next generation pass. Four cards assume otherwise.
- **G-16** — no adjacency constraint between two chosen targets.

G-15 deserves emphasis. Three of the nine actions in the vocabulary are **unusable from the
content kind most likely to want them**, and nothing in the schema says so — `skillEffect`
accepts all nine. An author writing 방패 or 기사의 도약 gets a card that validates, draws,
plays, and does nothing.

## Decisions (user, 2026-08-06)

**The four cuts below are approved.** The three `needs-subsystem` items escalated by the risk
ranking — S3 방패, S9 장벽, R3 오리 — are **held**, neither built nor cut. They stay in this document
as specified-but-unbuilt so the decision can be revisited with the cost known.

**Consequence the approval carries, and it is not cosmetic:**

| | after cuts | AC-010 requires |
|---|---|---|
| rule cards | 11 (R1–R14 less R7, R12, R13) | ≥ 10 ✅ |
| skill cards | **13** (S1–S14 less S4) | ≥ 14 ❌ |

Cutting S4 연속 이동 leaves the skill set **one card short**. Phase 6b must design one more, and it
should be drawn from the already-expressible action set (`destroy` / `teleport` / `promote` / `spawn`
/ `freeze` with `chosen_*` targets) so the count does not become a fifth dependency on a gap. Held
items do not count toward the total while they are held — counting an unbuilt card is how AC-010
passes on paper and fails in a match.

## Deliberate cuts

- **S12 Counterspell** — cut, per the SPEC card-timing constraint (no response cards).
- **R12 속공 턴 / S4 연속 이동** — turn structure is engine-owned and outside the content
  vocabulary by design (ADR-001 admits no code hook). Both would need `movesMadeLastPly` to
  become content-controlled. Recommend cutting from the MVP set rather than extending.
- **R13 반쪽 안개** — `viewFor` exists as the seam but redaction is unimplemented. Recommend
  deferring past MVP; it is the only card that changes what a player is allowed to *see*, and
  getting that wrong leaks information irreversibly.
- **R7 합체와 분리** — needs two pieces on one square. Recommend cutting; it is a different
  occupancy model, not a card.
