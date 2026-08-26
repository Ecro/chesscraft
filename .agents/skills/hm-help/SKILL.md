---
generated_by: harness-maker
harness_maker_version: 0.55.0
generated_at: '2026-01-01T00:00:00+00:00'
source_template: codex/help_skill.md.j2
provenance: official
name: hm-help
description: One-screen overview of all harness-maker commands, the recommended workflow
  path, and current harness settings. Locale-aware (en/ko).
content_hash: 78d009bb0058a2689cee1648fb27dc18ba8957d8f9689114fb81fac811875ea3
---

# @hm-help — harness-maker (ko)

> 사용 가능한 모든 `@hm-*` 명령, 추천 워크플로 경로, 현재 하네스 설정을
> 한 화면에 모아둔 도움말. 특정 명령의 상세는 `.claude/commands/hm/<name>.md` 참고.

## 📋 사용 가능한 명령

### Atomic stages (7)

| 명령 | 용도 |
|---|---|
| `@hm-research` | 컨텍스트·선행 작업·라이브러리 문서 조사 |
| `@hm-spec`     | 수용 기준 확정 (intent / outcomes / scenarios) |
| `@hm-plan`     | 깊은 인터뷰 → ADR → 단계 분해 |
| `@hm-execute`  | TDD 머신 — PLAN 단계별 RED → GREEN |
| `@hm-review`   | 다중 reviewer 합의 + grade gate + auto-fix |
| `@hm-wrapup`   | 단일 commit, CHANGELOG, 문서 갱신 |
| `@hm-verify`   | wrapup 전 독립 invariant 검증 |

### Meta

| 명령 | 용도 |
|---|---|
| `@hm-make`      | 전체 재렌더 (인터랙티브) |
| `@hm-configure` | 개별 설정 변경 (재인터뷰 없이) |
| `@hm-health`    | 3-layer 진단 (structural / external / personalization) |
| `@hm-loop`      | 안전 레일 있는 bounded autoloop |
| `@hm-uninstall` | 하네스 제거 |
| `@hm-help`      | (이 명령) |
| `@hm-metrics`   | Delivery metrics — CFR + churn 추이, LLM 해석 (수동, 읽기 전용) |
## 🔁 추천 워크플로

```
  research ─► spec ─► plan ─► execute ─► review ─► verify ─► wrapup
```

stage 연결은 `@hm-loop` 또는 autopilot 이 담당합니다 — 융합 워크플로우 명령은 없습니다. <!-- @hm:axis-removed -->

## ⚙️ 현재 설정

| 키 | 값 |
|---|---|
| preset | `Side` |
| locale | `ko` |
| targets | `claude-code, codex` |
| autopilot | `auto_safe`, 매 세션 자동 재무장 |

> **Codex CLI:** `@hm-*` 형식으로 호출 (예: `@hm-help`, `@hm-execute`). Skill 은 `.agents/skills/` 경로.


## 💡 다음 단계

- 처음이라면      →  `@hm-research` 로 시작해 위 stage 순서를 따르세요
- 설정 변경       →  `@hm-configure`
- 하네스 진단     →  `@hm-health`


<!-- @hm:user:extensions -->
<!-- Project-specific help additions. Preserved across upgrades. -->
<!-- @hm:/user:extensions -->
