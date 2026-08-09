---
generated_by: harness-maker
harness_maker_version: 0.51.0
generated_at: '2026-01-01T00:00:00+00:00'
source_template: claude-md/Side.ko.md.j2
provenance: official
content_hash: 890dba189c84bed4f51125bbaaaa4f43054b8a8339089e3461b9ca1bf68975c5
---
# CLAUDE.md — Side preset

> Phase 3 stub. Phase 6에서 locale별 + preset별로 본문이 채워집니다.

## 워크플로우

stage 연결은 `/hm:loop` 또는 autopilot 이 담당합니다. 융합 워크플로우 명령은 없습니다. <!-- @hm:axis-removed -->

## 캐싱

`agent-aware` — Phase 6에서 prompt cache 전략 문서화.

## 메모리

per-repo memory 활성화 여부는 `harness.yaml` 참조.

## 출력 언어

> **Output language.** Respond to the user in **ko**
> (en→English, ko→Korean, ja→Japanese, others→English fallback) on **every turn** —
> the live chat output and the start/end summary banners, not only the onboarding
> interview. Code, identifiers, file paths, and the persisted deliverable documents
> (PLAN / RESEARCH / REVIEW / SPEC) stay in **English**.
<!-- @hm:output_language -->


## Context discipline


도구가 반환한 것은 세션이 끝날 때까지 컨텍스트에 남아 매 턴 다시 읽힙니다. 아래 두 습관이 그 무게의 약 20%를 차지하며, 둘 다 피하는 데 비용이 들지 않습니다.

- **검색·조회 출력에 상한을 걸 것.** `rg` / `grep` / `find` / `ls` / `cat` / `head` 의 출력은 전량 컨텍스트로 들어옵니다. 호출 시점에 자릅니다 — Grep 도구의 `head_limit` 을 우선 쓰고, raw `rg` 는 `| head -50` 을 통과시킵니다. 상한을 늘리기 전에 패턴을 좁히십시오. 한 가지를 찾으려고 파일을 `cat` 하지 마십시오 — offset 을 준 Read 나 grep 을 쓰십시오.
- **컨텍스트가 이미 가진 파일을 다시 보내지 말 것.** 기존 파일에 대한 `Write` 는 사전 `Read` 를 요구하므로, 전체 재작성은 본문을 두 번 넣습니다. **이미 읽은** 파일의 수정에는 `Edit` 을 쓰고, `Write` 는 새 파일과 내용 대부분이 실제로 바뀌는 재작성에만 씁니다. PLAN/SPEC/REVIEW 같은 큰 문서에서 차이가 가장 큽니다 — 재작성 한 번이 수만 자를 복제합니다.



<!-- @hm:user:project-rules -->
<!-- 프로젝트 고유 규칙 (코딩 스타일, 도메인 용어, 에이전트 호출 관례 등). harness-maker 업데이트 시 보존. -->
<!-- @hm:/user:project-rules -->

<!-- @hm:user:extensions -->
<!-- Free-form CLAUDE.md additions. Preserved across harness-maker upgrades. -->
<!-- @hm:/user:extensions -->
