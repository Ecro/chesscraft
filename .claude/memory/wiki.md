---
generated_by: harness-maker
harness_maker_version: 0.47.0
generated_at: '2026-01-01T00:00:00+00:00'
source_template: memory/wiki.ko.md.j2
provenance: official
---
# Wiki Index — Side preset

> 프로젝트별 패턴 / 컨벤션 인덱스. wrapup 스테이지가 자동 추가합니다.
>
> **검색:** `rg -F "[wiki:" .claude/memory/wiki.md`
>
> **형식:**
> ```
> ## [wiki:<category>] <slug> | <YYYY-MM-DD>
> <패턴 설명: 언제 쓰는지, 왜 이 방법인지 한 단락>
> ```
> - `category`: pattern / convention / gotcha / architecture / tooling / api / other
> - slug 는 kebab-case. 동일 패턴 업데이트 시 헤딩 날짜만 갱신 (중복 섹션 금지)

---

<!-- @hm:user:entries -->
(아직 기록된 항목 없음)
## [wiki:architecture] declarative-content-engine | 2026-08-05
A variant-chess engine where pieces, rule cards, skill cards and special squares are all data in one shared `trigger / condition / action` vocabulary (ADR-001), with no code escape hatch. Resolution is a total order over (lifecycle event x owner layer): events E1 `generate_moves` .. E7 `end_of_ply`, and within each event the layers board square -> piece passive -> rule card -> skill card (ADR-002). Two rules the implementation forced and that are load-bearing: each square's `on_enter` fires at most once per ply, and a teleport never returns a piece to a square it already occupied this ply — without them two squares that throw pieces at each other bounce one until the depth cap, and *parity* decides where it lands rather than the content. Royalty is a content flag (`pieceDef.royal`), so no engine source names a specific piece; a royal capture short-circuits at E3 (ADR-012). Every consumer draws from its own keyed PRNG substream `rngFor(seed, ...domain)` (ADR-014), so the self-play agent's draws cannot perturb draft offers. Undo lives outside `legalActions` (ADR-013), which is what keeps the 60-ply termination bound true. The UI names no piece, card or square type — it renders from `legalActions` + the content set + the i18n bundle — which is the property that lets the schema be extended beside the UI rather than after it.
<!-- @hm:/user:entries -->
