---
type: review
task_slug: chess-craft-image-art
status: APPROVED
created: 2026-08-17
review_base: f56e001dc68f27198e2998bec44bc8138c337bed
freeze_ref: refs/hm-freeze/v1/chess-craft-image-art-base
review_run_id: 20260817T094536Z
reviewers_invoked:
  - code-reviewer (design, functionality, robustness, consistency)
  - codex (cross-model second opinion)
consensus_method: cross-check
final_grade: A
human_review_needed: false
drift_verdict:
  result: clean
  scope_violations: []
  scenario_misses: []
  task_slug: chess-craft-image-art
  computed_at: 2026-08-17T19:15:00+09:00
---

# Review: Chess Craft raster art migration

## Scope and method

The review was frozen against `f56e001dc68f27198e2998bec44bc8138c337bed`. The task has no
machine SPEC; the PLAN is the governing contract. The Side conditional route exercised the
four core lenses through `code-reviewer`: design, functionality, robustness, and consistency.
Lens coverage passed for all four. Codex was invoked once as the cross-model second opinion and
was not re-invoked.

The final scope includes the complete imported game-art registry, direct chrome art, the Chess
Craft crest and PWA identity, the image rendering boundary, storage compatibility cleanup, and
the associated unit, build, browser, and offline contracts. The PLAN was amended during review
to make those intentionally changed product-identity and compatibility surfaces explicit.

## Round 1 — initial result

The four core lenses reported four findings before the final active-set consolidation:

| ID | Severity | Location | Finding | Final state |
|---|---|---|---|---|
| `5e943007bc20b551` | P1 | `src/ui/art/ImageMark.tsx:8` | Broken raster assets had no runtime fallback. | Resolved: image load failure renders the visible `?` fallback. |
| `6f74352f034021ea` | P2 | `src/ui/art/ImageMark.tsx:17` | One inline size was shared by incompatible surfaces. | Resolved: sizing moved to CSS, with full-size crest rules. |
| `86923604a979b8e9` | P2 | `src/ui/art/MarkBody.tsx:28` | Accessibility comment generalized `aria-hidden` incorrectly. | Resolved: comment now distinguishes decorative image semantics from piece labels. |
| `74fabd70f628d8da` | P2 | `src/ui/styles.css:615` | Boot crest comment still described retired sprite sizing. | Resolved: comment now describes the imported raster frame. |

The resolved changes were already applied before the final active-set result. No additional P2
implementation was made after the user's instruction to leave P2 findings unchanged.

## Remaining manual-only finding

### P2 — the rendered contrast gate samples one match, not the full raster catalogue

`e2e/art-rendered-contrast.spec.ts:26` · source `codex` · PIDA disposition `accepted` · status
`pending`

The browser gate measures the images rendered by one newly started match and asserts that more
than six images were sampled. That proves the live board/card path, but it does not enumerate
the full 150-entry / 183-file catalogue, including most editor-only assets. The source-level
asset tests still cover URL and inventory shape. This P2 remains manual-only and was deliberately
left unfixed per user direction.

The final consensus command was run over this pending active finding and returned:

```json
{"counts":{"P0":0,"P1":0,"P2":0,"P3":0},"grade":"A","human_review_needed":false}
```

The finding is `manual-only`, so it does not enter the graded consensus population.

## Frozen cross-model set (round 1)

The Codex voter was invoked once. The PIDA verifier accepted the finding. The frozen record is
kept with its evidence and oracle result; it contains no synthetic vendor fields.

```json
{
  "frozen_at_round": 1,
  "models": ["codex"],
  "findings": [
    {
      "id": "210a866700512fd9",
      "source": "codex",
      "severity": "P2",
      "file": "e2e/art-rendered-contrast.spec.ts",
      "line": 26,
      "summary": "The rendered contrast gate samples only one match instead of validating the full raster catalogue.",
      "evidence": "The test only queries images in one freshly started match and asserts the result count is greater than 6; the 150 logical / 183-file catalogue, including most bundled and editor-only assets, never reaches the contrast assertion. The unit test checks URL shapes only.",
      "needs_relaxation": false,
      "disposition": "accepted",
      "oracle_result": "The test queries only images rendered in one started match; it does not enumerate the full 150-entry/183-file catalogue.",
      "status": "pending"
    }
  ]
}
```

`second_opinion_results`: Codex `invoked`; the accepted finding remains pending and manual-only.

## Review iteration summary

| Iteration | Active grade | Fixes applied | Remaining | New |
|---|---|---:|---:|---:|
| 1 | A | 4 resolved findings | 1 manual-only P2 | 0 |

Final grade: **A**  
Iterations used: 1 / 2  
Exit reason: **converged**  
Status: **APPROVED**  
`human_review_needed`: **false**  
Counters: unreviewed fixes 4 · regression-attributed 0 · attribution-unknown 0  
Confirmation pass: not run

## Verification evidence and explicit override

- `npm run test -- --testTimeout=60000`: 165 files, 1763 tests passed.
- `npm run typecheck`: passed.
- `npm run build`: passed; normal Vite native-loader and chunk-size warnings remain.
- `npm run test:build`: 4 files, 21 tests passed.
- Targeted rendered-contrast e2e: desktop, mobile portrait, and mobile WebKit passed in the
  focused run.
- A later full `npm run e2e` run reached one desktop `art-rendered-contrast` failure and was
  stopped by explicit user instruction before completion; `npm run e2e:pwa` was not started.

The user explicitly requested stopping the remaining browser tests and proceeding with wrapup
and push. This is recorded as a verification override, not as a passing full-e2e result. No
production code or P2 finding was changed to obtain the override.

