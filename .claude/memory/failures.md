---
generated_by: harness-maker
harness_maker_version: 0.47.0
generated_at: '2026-01-01T00:00:00+00:00'
source_template: memory/failures.ko.md.j2
provenance: official
---
# Failures Log — Side preset

> 이 프로젝트에서 반복된 실수 / 함정을 기록합니다. wrapup 스테이지가 자동 추가합니다.
>
> **검색:** `rg -F "[fail:" .claude/memory/failures.md`
>
> **형식:**
> ```
> ## [fail:<category>] <slug> | <YYYY-MM-DD> | count:<N>
> <재현 조건 + 원인 + 해결책 한 단락>
> - [<YYYY-MM-DD>] <2번째 발생 한 줄 노트>
> - [<YYYY-MM-DD>] <3번째 발생 한 줄 노트>
> ```
> - `category`: import / test / render / hook / lint / type / runtime / design / other
> - `count`: 동일 실수 반복 시 헤딩만 업데이트 — 같은 slug → count++ (중복 섹션 금지). wrapup 이 기존 slug 를 먼저 검색해 일치하는 것을 재사용하므로 재발이 분산되지 않고 누적됨.
> - 반복마다 원본 본문 아래에 날짜별 발생 bullet 한 줄이 추가됨 (헤딩의 first-seen date 는 보존) — 따라서 `count:N` 엔트리는 N−1 개의 발생 근거 줄을 담음.
> - count ≥ 3 이면 wrapup 이 `.claude/memory/pending-proposals.md` 에 개선 제안 추가

---

<!-- @hm:user:entries -->
(아직 기록된 실패 없음)
## [fail:design] empty-collection-is-not-absent | 2026-08-05 | count:1
A feature that ACTIVATES on a filtered collection silently produces an EMPTY activation instead of no activation, and the empty form is truthy. Concretely: the second skill draft filters the card pool by "not already offered, not already held"; with a pool of exactly one offer's worth the filter empties, `pickDistinct` returned `[]`, and `offers = []` still gated board play while yielding zero `draft_pick` actions — a match with no result and no legal action, reachable from perfectly valid content. Fix was two-part and both parts matter: the producer refuses to open an offer it cannot fill (`drawn.length === DRAFT_OFFER_SIZE`), and the consumer treats an empty collection as absent (`(offers?.length ?? 0) > 0`, not `offers ?`). The guard that actually catches this class is a loop-invariant assertion over randomized play — "if the match has no result, it has at least one legal action" — not a scripted line, which never reaches the boundary. Generalization: whenever a filter feeds a fixed-size requirement, write down what happens when the filter empties, and assert the invariant rather than the happy path.
## [fail:design] shared-vocabulary-unshared-code-path | 2026-08-05 | count:2
One shared vocabulary, two code paths — and only one of them ran the pipeline. `apply` routed a board move through the E1..E7 lifecycle but sent a card play straight to E6/E7, so the SAME declarative action (`teleport_piece`) fired the destination square's `on_enter` when a square or piece owned it and silently skipped it when a card owned it. A warp became the only way to walk onto a hostile square unharmed, and nothing in the schema showed that — the two actions are literally the same word. The cost is not the bug, it is that no content author could ever have found it: the vocabulary promised sameness the interpreter did not keep. Fix: extract the cascade (`cascadeEnter`) and route both branches plus E5 promotion through it. The regression test that pins it asserts a board move and a card-driven move produce the SAME resolution log. Generalization: when a design claims "X means the same thing regardless of who owns it", write the test that drives X from each owner and compares, because a shared grammar over unshared code paths is the failure that hides best. `spawn_piece` still has this shape and is recorded as an open gap rather than quietly fixed.
- [2026-08-05] Second instance, same root cause: spawn_piece (and the new revive_piece) put a piece on a square without running E4 entry, so creation was the remaining safe way onto a hostile square. Closed in Phase 6a by draining an arrived-squares list through the same cascade.
## [fail:tooling] spec-machine-binding-is-pytest-only | 2026-08-05 | count:1
`hm spec_machine mark-tested` validates every `--test-id` through `pytest --collect-only`, so in a TypeScript project (vitest + Playwright) NO acceptance criterion can ever be forward-bound: it prints `rule-3: test_id does not resolve via pytest --collect-only` and leaves the machine SPEC untouched. The trap is not the rejection, it is what the untouched file then says — all 18 ACs sit at `pending_test: true`, which reads as "nothing is tested" when in fact 10 of them have passing vitest/Playwright tests. Anything downstream that trusts `pending_test` (coverage reports, an unbound-AC audit, a future gate) will draw the wrong conclusion in the safe-looking direction. Do NOT hand-edit `pending_test` to compensate — that trades a wrong-but-visible state for a wrong-and-invisible one. Until the tool grows a non-pytest collector, the AC-to-test mapping for this repo lives in the PLAN's acceptance checklist, and any wrapup must say out loud that the machine SPEC's binding state is structurally stale rather than reporting "0 bound" as a finding.
## [fail:design] declared-but-inert-vocabulary | 2026-08-05 | count:1
A schema entry that validates but that no interpreter ever reads is worse than a missing one: the author gets a card that passes every check, draws, plays, and does nothing, with no signal anywhere. Two instances shipped this way — `check_count_at_least` (a condition hardcoded to return false because check detection did not exist) and `destination: own_back_rank` (declared in the grammar, never handled in the action switch). Both were caught only by trying to author a card that used them. A third is still open: `grant_movement`, `forbid_movement` and `block_capture` are consumed at move-generation time only, so a skill card carrying any of them is a silent no-op while the skill-card schema happily accepts all nine actions. The rule that would have prevented all three: every vocabulary entry needs either a test that drives it end to end from real content, or an explicit rejection at validation time saying it is not available in this position — returning a safe-looking default (false, null, no-op) is what makes the failure invisible. When adding an entry ahead of its implementation, make the validator refuse it until the implementation lands.
## [fail:test] all-positive-fixture-hides-overcounting | 2026-08-05 | count:1
A fixture in which every instance is a positive cannot detect an implementation that ignores the predicate entirely. Concretely: a three-check win condition was tested with a move sequence where every one of the mover's moves genuinely delivered check, so an engine that incremented the counter on "the mover completed a ply" — never evaluating whether check was actually given — produced the identical counter sequence and passed the whole describe block including the win-on-third assertion. The reviewer caught it before implementation; had it landed, the bug would have shipped behind a green suite. Fix: insert a deliberate DUD into the sequence (a mover move that does not satisfy the predicate) and assert the counter is unchanged across it. Generalization: for any counter, filter, or guard, the load-bearing fixture is the negative instance interleaved with the positives — not more positives, and not a separate happy-path test. The same reasoning produced the paired control elsewhere in that file: assert the protected case AND the identical position with the protection removed, so the assertion is about the mechanism rather than about the position.
<!-- @hm:/user:entries -->
