---
type: plan
task_slug: archer-side-contrast
status: complete
created: 2026-08-23
tags: [chess-craft, plan, imagegen, webp, accessibility, contrast]
interview_rounds: 6
adrs: 5
asset_baseline_sha: d50289114a92dc363aca7c90f060600884efab04
validator_outcome: MAJOR_REVISION_TERMINAL
summary: "Rework warm-red piece pairs so blue/red side identity survives small rendered sizes"
---

# PLAN — archer-side-contrast

## 🎯 Executive Summary

**TL;DR:** Audit all 33 sided piece pairs, replace only the pairs whose intrinsic warm-red pixels compete with the blue/red side cue, and make archer the mandatory acceptance case.

**What:** Preserve the existing piece file and registry contract while improving the raster variants for every affected pair. The blue-side (white) image will carry a dominant cool side palette and stronger lightness separation; the red-side (black) image will carry a dominant red/coral palette and a darker value mass. Intrinsic warm accents remain only where they do not erase the side signal.

**Why:** The current archer pair shares a large red visual mass, so a player can mistake the side identity even though the files are distinct. The same failure mode can exist in other pair assets. A CSS tint or corner badge would not repair the pixels at the small board size and would move the fix outside the user-requested image boundary.

**Key decisions:** Scope is an audit-driven affected-pair allowlist (ADR-001); side identity is drawn into the same-silhouette raster pair with hue plus value, not hue alone (ADR-002); filenames, registry entries, schema, and runtime rendering boundaries remain unchanged while the browser measures the emitted WebP pixels (ADR-003); each independently observable acceptance obligation has its own scenario ID and dedicated test (ADR-005).

**Estimated impact:** Medium/high asset-production effort proportional to the audited pair count, two WebP replacements per affected piece, one audit record, one test fixture, and one browser-side contrast spec. No content, API, schema, or runtime component change.

## 📚 Prior Work

- PLAN-chess-craft-image-art established the 33-piece sided registry, static imported WebP files, 192×192 transparent assets, same-silhouette variants, and the 2.75:1 side-separation intent.
- ART-SPEC-mobile-grade-graphics remains the active art contract: piece assets must clear the 3.30:1 rendered surface floor, the sided-pair target is 2.75:1 mean separation, and a heavy outline plus generous transparent margin is required.
- The memory entry [wiki:architecture] chess-craft-pixel-redesign says side identity must not depend on hue alone. The [fail:render] glyph-opts-out-of-its-styling entry records that a styling rule can become inert after a renderer changes element type; it also records that raster image marks need an image-valid effect such as drop-shadow rather than text-only styling. This plan therefore fixes the source pixels and measures the actual browser render.
- The current source inventory contains 33 white/black piece pairs, all 192×192. The existing browser tests check that side-specific WebPs load and that rendered marks separate from their surfaces, but they do not measure pair-specific warm-red overlap or side identity.
- A read-only baseline pixel audit found archer warm-red shares of approximately 0.35 (white) and 0.43 (black) with mean brightness around 63.4 and 54.4. A preliminary shared-warm audit also flags examples such as bow, chalice, queen, shield, talon, urn, watchtower, and wheel; banner, lantern, and staff are near the review boundary. Phase 1 freezes the final list instead of relying on this preliminary list.

## 🎙️ Interview Transcript

| # | Topic | Category | Question | Options | Choice | Note | → ADR |
|---|---|---|---|---|---|---|---|
| 1 | Affected asset scope | Scope boundaries | Which piece images should receive the side-contrast treatment? | all 33 pairs / archer pair only / all warm-red-conflict pairs | **all warm-red-conflict pairs** | Audit all 33 pairs, include archer unconditionally, and modify only the resulting affected allowlist. | ADR-001 |
| 2 | Test scenario traceability | Testing contract | How should the bundled S1 obligations be represented after A.5 rejected duplicate IDs? | consolidate into one test / split into explicit IDs / supporting-only checks | **split into explicit IDs** | The user accepted Path B: assign one dedicated test to each obligation as S1a inventory, S1b borderline evidence, S1c archer inclusion, S1d browser source inventory, and S1e rendered side identity. | ADR-005 |
| 3 | Regression-gate phasing | Implementation phasing | When should the S1e side-identity assertion become a passing gate? | Phase 1 baseline / Phase 3 after asset replacement / both phases | **Phase 3 after asset replacement** | Phase 1 records and reviews the RED S1e ownership; Phase 3 runs it after the candidate WebPs exist, so the baseline cannot be mistaken for a finished-asset pass. | — |
| 4 | Manual evidence completeness | Testing depth | Which preview sizes must be persisted before freezing borderline selection? | 192px and 55px / 192px, 28px, 40px, and 55px / full screenshot set | **192px, 28px, 40px, and 55px** | Use the complete terminal-finding evidence set in Phase 1 and keep grayscale/value-only review as a separate field. | — |
| 5 | Worktree diff scope | Risk tolerance | How should final path checks treat unrelated user-owned worktree changes? | unscoped repository diff / task path allowlist / discard unrelated changes | **task path allowlist** | Compare only planned paths and preserve any unrelated pre-existing entries; never make execution alter user-owned work outside the task. | — |
| 6 | Test-name ownership | Testing contract | What makes the S1a–S1e ownership map mechanically reviewable? | prose-only map / exact test-title table plus unique-ID check / new runtime registry | **exact test-title table plus unique-ID check** | Keep the map in the PLAN and require the five literal test titles plus a source check that finds exactly one owner for each ID. | — |

## 📐 Architecture Decision Records

### ADR-001: Use an audit-driven affected-pair allowlist

**Status:** Accepted (2026-08-23, via /hm:plan interview)

**Context:** The user identified archer as a representative failure but asked for all images with the same intrinsic-red problem. Reworking every pair would create unnecessary visual churn, while changing only archer would leave the repeated failure mode elsewhere.

**Decision:** Phase 1 audits all 33 pairs and writes an explicit affected-pair list with baseline metrics. Archer is a hard include. A pair is included when the shared opaque-pixel warm-red overlap is at least 0.20, when its baseline side-value ratio is below 1.25:1, or when manual review finds the side cue visually dominated by the same warm-red mass. The audit output is the source of truth for the files changed in later phases.

**Consequences:**

- ✅ The user-visible scope follows the actual defect rather than the piece name.
- ✅ The exact diff is deterministic and reviewable before any generated asset replaces a source file.
- ⚠️ A future piece added to the registry needs the same audit if it introduces a warm-red side collision.

**Rejected alternatives:**

- Rework all 33 pairs — rejected because it spends asset-production effort on pairs that do not exhibit the reported collision.
- Rework archer only — rejected because the user explicitly selected the affected-pair class.

**Source:** Interview #1

### ADR-002: Carry side identity in palette and value while preserving silhouette

**Status:** Accepted (2026-08-23, implementation default from Interview #1)

**Context:** The current paired images share intrinsic warm-red areas. Hue-only replacement is not robust for players with red/green color-vision differences, and different silhouettes would make the piece itself harder to recognize.

**Decision:** Keep each pair's alpha silhouette, framing, outline weight, and subject details aligned. Make the blue-side (white) variant's central body or largest mass visibly cool blue/indigo and lighter; make the red-side (black) variant's corresponding mass visibly red/coral and darker. Keep gold, wood, skin, and other intrinsic accents subordinate to the side palette. The post-change gate requires both side-color dominance and a non-hue value separation.

**Consequences:**

- ✅ Players can use silhouette first and side palette/value second.
- ✅ The blue-side variant no longer presents a large warm-red field that competes with the red side.
- ⚠️ Generated images may need several candidate iterations to keep the silhouette and style stable.

**Rejected alternatives:**

- Hue-only recoloring — rejected because it repeats the accessibility failure.
- Different side-specific silhouettes — rejected because the same piece would look like two different pieces.
- CSS filters, rings, or overlays as the primary fix — rejected because they do not change intrinsic raster pixels and can disappear or collide at the board's smallest render size.

**Source:** Interview #1 implementation default

### ADR-003: Preserve the existing raster/registry boundary and test in the browser

**Status:** Accepted (2026-08-23, implementation default from Interview #1)

**Context:** The app already resolves a piece art key and side to a statically imported WebP. The browser, not the TypeScript source, decodes and composites those pixels. Changing registry or content contracts would turn a visual correction into an unrelated migration.

**Decision:** Replace only existing piece WebP files at their current names and paths. Do not add art keys, alter the registry, change schema/content records, or introduce a new runtime marker. Add test-only audit/measurement code that decodes the same files in a browser canvas at source and board CSS sizes.

**Consequences:**

- ✅ Saved content and offline precaching continue to use the existing contract.
- ✅ The test measures the pixels players actually see, including alpha and small-size resampling.
- ⚠️ The test fixture must keep its file inventory synchronized with the static 33-pair contract.

**Rejected alternatives:**

- New side-specific art ids or a registry migration — rejected because the existing pair mapping already carries side identity.
- A CSS-only implementation — rejected because the reported defect is in the raster content.

**Source:** Interview #1 implementation default

### ADR-004: Freeze one executable pixel-metric contract

**Status:** Accepted (2026-08-23, validator follow-up revision)

**Context:** The side-contrast decision depends on transparent-pixel handling, color-space conversion, shared-pair denominators, and several numeric floors. Leaving those details implicit would let the audit and the regression gate classify the same asset differently.

**Decision:** Use the following contract for every source-size metric. Decode each WebP to RGBA at 192×192. A pixel is included in an individual image's opaque set when alpha is at least 16/255; a pair pixel is included in the shared set only when both variants meet that rule. RGB thresholds use the decoded sRGB bytes. Warm-red is true when R is at least 96, R−G is at least 25, and R−B is at least 25. Shared warm-red overlap is the count of shared pixels warm-red in both variants divided by the shared-pixel count. Convert each included channel to linear light with the sRGB 0.04045 breakpoint, calculate Y = 0.2126R + 0.7152G + 0.0722B, and use the mean Y of each side. The side-value ratio is (max(meanY)+0.05)/(min(meanY)+0.05). Blue-dominant pixels satisfy B−max(R,G) at least 18; red-dominant pixels satisfy R−max(G,B) at least 18. The opponent margin is the smaller of (blueShareWhite−blueShareBlack) and (redShareBlack−redShareWhite). Alpha-mask IoU is intersection/union of the alpha-included sets. Compare unrounded values; report all ratios/shares to three decimals. Source gates are shared warm-red overlap below 0.12, opponent margin at least 0.20, mask IoU at least 0.98, and side-value ratio at least 2.75:1.

For rendered-size measurements, draw each source into a transparent canvas at 28px, 40px, and 55px, use the same alpha inclusion rule on the resampled output, and apply the value/order and opponent-color checks to the resulting pixels. The grayscale review discards hue scores and checks only that the blue-side mean Y remains the lighter member with the required side-value ratio.

**Consequences:**

- ✅ The audit, generated-art gate, and later regressions share one reproducible calculation.
- ✅ Antialiased transparent edges are handled consistently instead of being counted as background.
- ⚠️ The browser fixture owns a small amount of measurement code and must document any browser-only decoding limitation.

**Rejected alternatives:**

- Mean raw sRGB channel values — rejected because they do not represent perceived lightness or the active contrast contract.
- A hue-only score — rejected because it cannot support the grayscale/value-only accessibility check.
- A dynamically selected post-edit target list — rejected because it can make a failed asset disappear from the gate.

**Source:** Validator follow-up for critiques metrics-not-defined-enough-to-implement and artifact-and-fixture-contract-gap

### ADR-005: Give each acceptance obligation a distinct scenario ID

**Status:** Accepted (2026-08-23, via /hm:plan follow-up after /hm:execute A.5 escalation)

**Context:** The Phase 1 exit criterion bundles several independently observable obligations. A.5 rejected the first RED-stage tests because five dedicated tests across unit and browser suites all claimed the same `S1` scenario identity.

**Decision:** Split the bundled scenario into five explicit IDs and keep one dedicated test for each: `S1a` canonical 33-pair fixture inventory, `S1b` borderline-review evidence, `S1c` unconditional archer inclusion, `S1d` browser-decoded source inventory and dimensions, and `S1e` affected-pair side identity at source and rendered sizes. Supporting assertions may remain inside the owning test but may not reuse another scenario ID.

**Consequences:**

- ✅ Unit and browser coverage remain separate while each acceptance obligation has unambiguous ownership.
- ✅ A.5 and later review can trace every test to one PLAN obligation without treating layered boundary checks as duplicate scenarios.
- ⚠️ Adding a new independently observable obligation requires a new scenario ID and a dedicated test.

**Rejected alternatives:**

- Consolidate all assertions into one test — rejected because it would weaken failure localization and blur the unit/browser boundary in ADR-003.
- Keep one `S1` test and rename the others as untracked support — rejected because it preserves ambiguous acceptance ownership.

**Source:** Interview #2 and execute escalation Path B

## 🏗️ Technical Design

### Current State

The static art manifest imports 66 piece WebPs and the registry resolves each piece art key to a white/black pair. The application renders those URLs through the existing image mark path. Surface contrast is measured by e2e/art-rendered-contrast.spec.ts, and loading/source ownership is checked by e2e/contrast.spec.ts. No live test measures whether both variants retain the same silhouette while their side-defining palette and value dominate shared intrinsic red.

### Affected Components

- Piece WebP files under src/ui/art/assets/ for the Phase 1 affected allowlist.
- tests/fixtures/art-side-contrast-targets.json as the canonical machine-readable fixture holding all 33 pair rows, frozen affected names, baseline metrics, and manual dispositions.
- scripts/audit-art-side-contrast.mjs as the deterministic generator for the canonical JSON fixture and its Markdown projection.
- scripts/recolor-art-side-contrast.mjs as the source-preserving palette transformer for the authorized affected WebPs.
- tests/ui/art-side-contrast-inventory.test.ts for fixture cardinality, archer inclusion, and manual-disposition completeness.
- e2e/art-side-contrast.spec.ts for browser decoding, pair metrics, and rendered-size checks.
- work-docs/ART-AUDIT-archer-side-contrast.md for the auditable pre/post inventory.
- work-docs/ART-REVIEW-archer-side-contrast.md for candidate previews, per-pair review decisions, and rejected-candidate notes.
- work-docs/art-previews/ for persisted borderline color and value-only preview evidence.
- work-docs/art-candidates/ for rejected imagegen proof-of-concept evidence.
- Existing asset and content tests remain the contract checks; registry and content source files are not edited.

### Dependencies

- The existing imagegen capability for source-preserving raster edits.
- The current 192×192 WebP and transparent-alpha export contract.
- Playwright/Vite browser decoding for WebP measurement.
- Existing ART-SPEC surface and side thresholds; no threshold is lowered.

### Architecture

The data path remains:

piece artKey + side → artRegistry sided entry → statically imported WebP URL → ImageMark img → browser compositing → side/surface pixel metrics.

The new audit path branches only in tests:

33 pair filenames → browser image fixture → alpha intersection and color/value metrics → affected allowlist → generated asset review → same emitted URL path.

### Design Decisions

- The pair list is discovered from the existing piece-name-white.webp and piece-name-black.webp naming contract; it is not copied from a hand-maintained list of piece names.
- ADR-004 is the executable pixel contract: alpha >= 16/255 defines included pixels; warm-red uses R >= 96, R-G >= 25, and R-B >= 25; shared overlap divides by the shared alpha set; luminance is linearized sRGB with the 0.04045 breakpoint; opponent colors use an 18-byte dominance margin; IoU is alpha-set intersection over union; all comparisons use unrounded values and reports use three decimals.
- The side gate uses the ADR-004 relative-luminance mean ratio, shared-warm overlap, and blue/red opponent-color dominance. It also checks alpha-mask similarity so a color repair cannot silently become a silhouette redesign.
- Full-color review uses hue/opponent scores. Grayscale review uses only mean-Y ordering and the side-value ratio; it never claims that blue/red hue is visible after desaturation.
- The generated assets are inspected before replacement. The imagegen prompt preserves the existing subject, outline, transparent margin, and 192px framing while explicitly assigning the cool/light versus red/dark side masses.

### Data Flow

Phase 1 produces the affected allowlist and baseline metrics. Phase 2 generates candidate pair assets from the existing local sources and normalizes them to the current WebP contract. Phase 3 loads the changed files in a browser, compares each pair at source and rendered sizes, and rejects any candidate that fails side or surface gates. Phase 4 runs the application and offline build checks without changing how content resolves art.

### API Changes

None. No public API, content schema, art key, registry shape, route, or runtime component changes.

## 📝 Implementation Plan

### Phase 1 — Freeze the affected-pair inventory

- **depends_on:** []
- **Status:** DONE — Path B splits the five independently observable obligations into `S1a`–`S1e`; the user selected accepted-risk continuation (Option A) for the five terminal plan findings. The audit froze 33 complete pairs, 9 borderline review rows, and 12 affected pairs; Vitest S1a–S1c and Playwright S1d are GREEN. S1e remains the Phase 3 post-edit gate.
- **parallel_group:** serial-1
- **merge_hazards:** The affected allowlist and the audit report must be produced from the same baseline; no generated asset work may start against a stale pair list.
- **Scope in:** All 33 piece white/black WebP pairs, the existing static asset manifest, scripts/audit-art-side-contrast.mjs, tests/fixtures/art-side-contrast-targets.json, tests/ui/art-side-contrast-inventory.test.ts, a test-only browser inventory helper, work-docs/ART-AUDIT-archer-side-contrast.md, and work-docs/art-previews/.
- **Scope out:** Any image replacement, registry edit, schema/content edit, CSS edit, and UI marker.
- **Work:** Run scripts/audit-art-side-contrast.mjs --write. It reads all 33 pairs and writes the canonical JSON fixture, Markdown projection, and deterministic borderline color/value-only previews through temporary files and atomic rename; the browser test reads the JSON and never writes TypeScript source. Apply ADR-004; record dimensions, alpha-mask agreement, mean relative luminance, warm-red overlap, and side-color dominance. Include archer regardless of score. A borderline row is any row within 0.03 of a selection threshold or flagged by the visual pass. For each borderline row, the reviewer is Codex, previews are inspected at 192px, 28px, 40px, and 55px plus grayscale/value-only, and the fixture stores reviewer, preview sizes, preview paths, include/exclude disposition, and a one-sentence rationale. Generate the human-readable audit report from that fixture; later phases consume the frozen JSON and must not rediscover targets. The Phase 1 acceptance obligations are traced as `S1a` fixture inventory, `S1b` borderline evidence, `S1c` archer inclusion, `S1d` browser source inventory/dimensions, and `S1e` affected-pair source/rendered side identity. `S1e` is a RED regression test owned by Phase 3 and is not expected to pass before asset replacement.
- **Exit criterion:** node scripts/audit-art-side-contrast.mjs --write followed by npx --no-install playwright test e2e/art-side-contrast.spec.ts --project=desktop --grep "S1d" reports 33 complete pairs, names archer, and reads the generated JSON; npx --no-install vitest run tests/ui/art-side-contrast-inventory.test.ts proves the dedicated `S1a`, `S1b`, and `S1c` checks for 33 unique rows, archer inclusion, and reviewer/preview/disposition/rationale evidence; `test "$(rg -n "['\"]S1[a-e][^'\"]*['\"]" tests/ui/art-side-contrast-inventory.test.ts e2e/art-side-contrast.spec.ts | wc -l)" -eq 5` and a unique-ID check find exactly one literal test title for each of `S1a`–`S1e`; `S1e` is recorded as the Phase 3 post-edit gate and is not a Phase 1 pass condition.
- **Risk:** medium
- **Rollback point:** baseline at asset_baseline_sha. Before proceeding, path-scope any cleanup to scripts/audit-art-side-contrast.mjs, tests/fixtures/art-side-contrast-targets.json, tests/ui/art-side-contrast-inventory.test.ts, e2e/art-side-contrast.spec.ts, and work-docs/ART-AUDIT-archer-side-contrast.md; leave unrelated worktree files untouched.

### Phase 2 — Generate and normalize the affected raster pairs

- **depends_on:** [1]
- **Status:** DONE — frozen allowlist is `archer, banner, bow, lantern, orb, queen, shield, staff, talon, urn, watchtower, wheel`; the imagegen proof-of-concept was rejected for alpha/framing drift, and the source-preserving palette transformer produced reviewed 192×192 transparent WebPs. The review artifact records all 12 accepted rows and the rejected candidate evidence.
- **parallel_group:** affected-asset-batches
- **merge_hazards:** Candidate files share the same src/ui/art/assets directory and style reference; each batch must write disjoint white/black filenames and the audit allowlist must remain unchanged.
- **Scope in:** The two WebP files for every Phase 1 affected name, with archer treated as the visual reference and acceptance pair, scripts/recolor-art-side-contrast.mjs, work-docs/ART-REVIEW-archer-side-contrast.md, work-docs/art-candidates/, and named candidate/final previews under work-docs/art-previews/.
- **Scope out:** Unaffected piece pairs, square/card/chrome assets, registry/import files, CSS side tokens, content data, and runtime components.
- **Work:** Inspect every local source before editing. Trial imagegen on archer as the visual reference; reject any candidate that changes framing or emits opaque checkerboard/background pixels. Use scripts/recolor-art-side-contrast.mjs for the source-preserving fallback: retain the original alpha mask and pixel silhouette, assign a dominant cool/light plane to the blue-side variant and a dominant red/dark plane to the red-side variant, and clear sub-floor alpha noise. Convert candidates to 192×192 transparent WebP at the existing lossless target. For each candidate pair, record source path, candidate path, preview dimensions, silhouette result, full-color side result, value-only result, reviewer disposition, and rejection reason if applicable in the review artifact. Replace an authorized target only after its review row is complete.
- **Exit criterion:** Every affected filename remains present, each pair is 192×192 with transparent corners and matching framing, every affected pair has a completed review row with full-color and value-only dispositions, and npx --no-install vitest run tests/ui/art-contrast.test.ts tests/content/art-key.test.ts tests/ui/art-side-contrast-inventory.test.ts exits 0.
- **Risk:** high
- **Rollback point:** Phase 1 audit. For the explicit affected paths recorded in the audit, run git restore --source d50289114a92dc363aca7c90f060600884efab04 -- src/ui/art/assets/piece-<name>-white.webp src/ui/art/assets/piece-<name>-black.webp; preserve the audit and review artifacts, and remove no other asset.

### Phase 3 — Add the side-cue regression gate

- **depends_on:** [2]
- **Status:** DONE — S1e passes on desktop, mobile-portrait, and mobile-webkit; existing rendered-surface and loaded-raster contrast specs also pass.
- **parallel_group:** serial-3
- **merge_hazards:** The measurement constants, affected allowlist, and e2e fixture must agree; a test that re-discovers targets after editing would make the gate vacuous.
- **Scope in:** e2e/art-side-contrast.spec.ts consuming tests/fixtures/art-side-contrast-targets.json, plus the Phase 1 inventory test and the human-readable audit/review artifacts.
- **Scope out:** Product rendering code, CSS side markers, registry, content schema, and unrelated art tests.
- **Work:** Make the fixture load every selected pair through the browser's WebP decoder. Apply ADR-004 exactly: alpha >= 16/255 inclusion, shared-pixel denominator, sRGB linearization, stated warm-red/opponent predicates, unrounded comparisons, and three-decimal reporting. Assert 192×192 dimensions, alpha-mask IoU at least 0.98, shared warm-red overlap below 0.12 after the edit, and a blue/red opponent-color dominance margin of at least 0.20 in the side-defining mass. Assert the selected pair's mean relative-luminance ratio is at least 2.75:1, without lowering the active ART-SPEC threshold. Measure the actual 28px, 40px, and 55px board-size render as well as the 192px source. Full-color checks use opponent scores; the value-only check uses grayscale mean-Y order and the same side-value ratio. Keep the existing 3.30:1 surface gate active. This phase owns the passing `S1e` test after Phase 2 has supplied the candidate WebPs.
- **Rollback procedure:** If the browser URL strategy or metric implementation is invalid, remove only the newly added e2e/art-side-contrast.spec.ts with apply_patch, retain tests/fixtures/art-side-contrast-targets.json and both work-docs artifacts, and leave all changed WebP files untouched for a corrected gate.
- **Exit criterion:** npx --no-install playwright test e2e/art-side-contrast.spec.ts --project=desktop --grep "S1e" plus the existing surface/contrast specs exits 0 and reports archer plus every frozen affected pair; the `S1e` title is the sole owner of the affected-pair source/rendered side-identity gate.
- **Risk:** medium
- **Rollback point:** Phase 2; remove only the new test fixture/spec if its browser URL strategy is wrong, leaving validated asset replacements available for a corrected gate.

### Phase 4 — Run application, build, and visual handoff checks

- **depends_on:** [3]
- **Status:** DONE — typecheck, production build, targeted asset/content tests, build/precache tests, full Vitest, desktop/mobile side gates, rendered-surface contrast, loaded-raster checks, and all six PWA/offline tests are GREEN.
- **parallel_group:** serial-4
- **merge_hazards:** Build/precache output and browser screenshots must be produced after the final WebP bytes; running them against a stale dev-server graph is not evidence for the committed files.
- **Scope in:** Targeted unit tests, typecheck/build, precache tests, selected e2e specs, and manual visual review at mobile portrait, desktop, and grayscale/value-only views.
- **Scope out:** New gameplay behavior, balance changes, content migrations, and unrelated test failures outside the asset/render surface.
- **Work:** Run the targeted asset/content tests, typecheck, production build, build/precache tests, and the relevant PWA/offline check. Inspect the archer pair and every affected pair at board scale. In full color, record blue/red hue and opponent-mass judgments; in grayscale or reduced saturation, record only the lighter-blue-side value order, value ratio, silhouette, and subject-recognition judgments. Record final metrics, changed filenames, preview paths, completed reviewer rows, and any pre-existing unrelated failure in the audit report/review artifacts.
- **D.5 newly-reachable window:** The repair makes the frozen 12-pair affected set reachable as a side-identity assertion at source size and at 28px, 40px, and 55px board renders; before the repair these same browser-decoded pixels carried shared warm-red mass or insufficient side-value separation. `e2e/art-side-contrast.spec.ts:186:1 › S1e affected pairs keep side identity at source and board sizes` enters every affected pair and every size in this window in the same change. The absent case is preserved explicitly: the other 21 of the 33 audited rows remain outside the affected allowlist, are not rewritten, and are still covered by S1d inventory plus the frozen fixture.
- **Exit criterion:** npm run typecheck, npm run build, npx --no-install vitest run tests/ui/art-contrast.test.ts tests/content/art-key.test.ts, npx --no-install vitest run --config=vitest.build.config.ts, and the selected browser/PWA checks all exit 0; path-scoped `git diff --name-only HEAD -- src/ui/art/assets scripts/audit-art-side-contrast.mjs scripts/recolor-art-side-contrast.mjs tests/fixtures tests/ui/art-side-contrast-inventory.test.ts e2e/art-side-contrast.spec.ts work-docs/ART-AUDIT-archer-side-contrast.md work-docs/ART-REVIEW-archer-side-contrast.md work-docs/art-previews work-docs/art-candidates` plus `git ls-files --others --exclude-standard -- src/ui/art/assets scripts/audit-art-side-contrast.mjs scripts/recolor-art-side-contrast.mjs tests/fixtures tests/ui/art-side-contrast-inventory.test.ts e2e/art-side-contrast.spec.ts work-docs/ART-AUDIT-archer-side-contrast.md work-docs/ART-REVIEW-archer-side-contrast.md work-docs/art-previews work-docs/art-candidates` reports only planned task paths. Unrelated pre-existing worktree entries are preserved and excluded from this comparison.
- **Risk:** low
- **Rollback point:** Phase 3. If build or offline checks fail, path-scope restoration to the Phase 3 test/audit/review files or the explicit affected WebP list; preserve unrelated worktree edits and preserve the failing report for diagnosis.

## 🚧 Contract Boundaries

### Do not change

- `src/ui/art/registry.ts` — preserve art ids, sided entry shape, and existing URL ownership.
- `src/ui/art/assets.ts` — preserve the static manifest keys and imports; only the already-authorized target WebP bytes may change.
- `src/content/` — preserve content records, schema version, saved-document compatibility, and artKey values.
- `src/ui/tokens.css` — preserve the existing blue/red side tokens and their non-hue cues.
- `src/ui/styles.css` — do not add a CSS-only tint, ring, filter, or overlay as the primary correction.
- Advisory: Keep all generated files inside the current 192px transparent WebP contract and do not lower the 2.75:1 side or 3.30:1 rendered-surface thresholds.

## 🧪 Testing Strategy

### Unit and inventory

- Run tests/ui/art-contrast.test.ts, tests/content/art-key.test.ts, and tests/ui/art-side-contrast-inventory.test.ts to preserve the 33-pair filename, URL, registry, canonical-fixture, and manual-disposition invariants. The inventory file owns one dedicated scenario each for `S1a`, `S1b`, and `S1c`.
- Keep tests/fixtures/art-side-contrast-targets.json baseline metrics immutable so a post-edit reclassification cannot hide a failed pair; scripts/audit-art-side-contrast.mjs is the only generator, and the Markdown audit is its human-readable projection rather than a second source of truth.
- Run the build/precache test to prove the replaced imported WebPs still land in the production worker inventory.

### Scenario ownership map

| ID | Owner | Exact dedicated test title | Passing phase |
|---|---|---|---|
| S1a | tests/ui/art-side-contrast-inventory.test.ts | `S1a freezes every sided piece pair and its affected-pair decision` | Phase 1 |
| S1b | tests/ui/art-side-contrast-inventory.test.ts | `S1b does not leave a borderline visual decision without evidence` | Phase 1 |
| S1c | tests/ui/art-side-contrast-inventory.test.ts | `S1c keeps archer in the affected set even if a metric implementation changes` | Phase 1 |
| S1d | e2e/art-side-contrast.spec.ts | `S1d baseline inventory contains every sided piece pair` | Phase 1 |
| S1e | e2e/art-side-contrast.spec.ts | `S1e affected pairs keep side identity at source and board sizes` | Phase 3 |

The Phase 1 source check must find exactly one dedicated title for each ID and no bare `S1` title. Supporting assertions stay inside their owning test and do not claim another ID.

### Browser integration

- scripts/audit-art-side-contrast.mjs generates the frozen JSON fixture from all 33 pairs; e2e/art-side-contrast.spec.ts reads that JSON without rediscovery, assigns `S1d` to browser source inventory/dimensions and `S1e` to affected-pair source/rendered side identity, compares alpha masks, applies ADR-004 formulas, measures warm-red overlap and blue/red dominance, and evaluates the 2.75:1 side-value floor at source and 28px/40px/55px board sizes.
- e2e/art-rendered-contrast.spec.ts continues to composite actual loaded images over their real surfaces and enforce the 3.30:1 floor.
- e2e/contrast.spec.ts continues to prove that the board uses loaded side-specific raster pieces and no runtime SVG piece marks.
- Run the side/art subset on mobile portrait and desktop; include mobile WebKit in the final handoff if the changed browser fixture remains stable there.

### Manual visual review

- Inspect the archer pair first, then every pair in the frozen allowlist, at 192px and at approximately 28px/40px/55px rendered previews. Record each result in ART-REVIEW-archer-side-contrast.md, including the reviewer, candidate path, disposition, and rationale.
- In full color check silhouette sameness, recognizable piece subject, dominant cool/light versus red/dark masses, transparent margins, and absence of text or accidental background. In grayscale/reduced saturation check only value order, value separation, silhouette, and subject recognition; do not use hue as the grayscale oracle. Persist 192px, 28px, 40px, and 55px preview references for every borderline selection row.
- Review board placement on both checker tones and painted stripes so the side cue is not achieved by sacrificing surface contrast.

## ⚠️ Risks & Mitigation

| Risk | Impact | Mitigation |
|---|---|---|
| Imagegen changes the subject or silhouette | A side fix makes the piece harder to recognize | Use source-preserving edits, compare alpha masks at IoU ≥ 0.98, and manually reject drift before replacement. |
| The blue-side variant still contains a large warm-red field | Red and blue sides remain confusable | Freeze a warm-red overlap metric, require a cool/light side mass, and inspect a grayscale/reduced-saturation view. |
| A strict side threshold encourages an outline-only trick | The mean improves while the actual side cue remains weak | Measure the side-defining mass separately from the outline and retain the existing surface gate. |
| Target discovery changes after generation | A failed pair disappears from the test set | Make tests/fixtures/art-side-contrast-targets.json the canonical Phase 1 output, keep its baseline fields immutable, and have both the audit report and e2e gate consume it without rediscovery. |
| WebP conversion drops alpha or dimensions | Edges gain a box or become soft at board size | Assert 192×192 dimensions, transparent corners, natural image size, and rendered-size measurements. |
| Static imports or precache drift | The art works in dev but fails offline | Do not edit the manifest; run content, build, precache, and PWA checks after the final bytes are present. |
| Candidate review is performed but not evidenced | A visually wrong generated asset can pass file-level checks | Require a completed per-pair row in ART-REVIEW-archer-side-contrast.md with preview path, full-color decision, value-only decision, and rationale before replacement. |
| The browser fixture is flaky across engines | The visual gate becomes noisy | Keep measurement deterministic, wait for natural image completion, run Chromium first, and record any WebKit-only harness limitation separately. |
| A future test reuses a broad scenario ID | A.5 cannot distinguish layered boundary coverage from duplicate acceptance coverage | Keep the `S1a`–`S1e` ownership map in the PLAN and require one dedicated test per independently observable obligation. |

## ✅ Success Criteria

- All 33 piece pairs are audited, the final affected allowlist is persisted, and archer is included.
- The canonical fixture contains a disposition and rationale for every borderline pair, and the audit report is generated from that fixture.
- Only affected pair WebPs are replaced; unaffected pair bytes, registry entries, art keys, schema, CSS tokens, and content records remain unchanged.
- Every changed pair remains a same-silhouette 192×192 transparent WebP pair.
- Each changed pair has a dominant cool/light blue-side mass and dominant red/dark red-side mass, with shared warm-red overlap below 0.12 and side-color dominance margin at least 0.20.
- Each changed pair clears the active 2.75:1 mean side-value target and does not regress the 3.30:1 rendered surface floor.
- The browser gate measures source pixels and actual 28–55px board renders, not only file names or CSS declarations.
- Full-color review records hue/opponent-mass distinction; grayscale/reduced-saturation review records only value order, value separation, silhouette, and subject recognition.
- Every affected pair has a completed candidate-review row before its WebP replacement is accepted.
- Existing asset, content, build/precache, and side-specific loading tests pass.
- Manual mobile, desktop, and reduced-saturation review confirms that archer and every affected pair are distinguishable without adding a new UI marker.
- The PLAN-to-test map remains one-to-one for `S1a`–`S1e`, with no dedicated test reusing another scenario ID.

## 🔍 Plan Validation

- Pass 1 outcome: MAJOR_REVISION.
- Follow-up round dispositions: A (revise plan) for every queued critique; no scope change and no risk accepted in place of the missing contract.

| Critique | Disposition | Resolution |
|---|---|---|
| Record borderline-pair review | A — revise plan | Phase 1 now stores include/exclude disposition and rationale for every borderline fixture row, and the inventory test checks completeness. |
| Record candidate visual review | A — revise plan | Phase 2 now requires ART-REVIEW-archer-side-contrast.md, optional named previews, and a completed per-pair row before replacement. |
| Define metric formulas | A — revise plan | ADR-004 fixes alpha, sRGB, warm-red, luminance, opponent, IoU, denominator, rounding, source-size, and rendered-size rules. |
| Separate color and grayscale review | A — revise plan | Technical Design, Phase 4, Testing Strategy, and Success Criteria now use full-color hue/opponent checks and grayscale value-only checks as separate judgments. |
| Make the fixture canonical | A — revise plan | Phase 1 produces tests/fixtures/art-side-contrast-targets.json as the canonical source; the audit report and e2e gate consume it without rediscovery. |
| Specify path-scoped rollback | A — revise plan | Phase 2 names the exact baseline restore shape; Phase 1/3/4 name path-scoped cleanup and preservation rules. |

- Cross-model second opinion: skipped because second_opinion.models is empty; high_diff classified the pre-plan worktree as boundary=false, is_high=false, with no changed files. The validator output echoed this skipped status with an empty reconciliation.
- Pass 2 terminal outcome: MAJOR_REVISION. plan_rounds outcome reported progress: 6 first-pass critiques resolved and 2 new terminal critiques survived. The two-pass cap ended validation; no third pass is permitted.

| Terminal finding | Severity | Execution handoff |
|---|---|---|
| Phase 1 cannot reliably generate the canonical TypeScript fixture | P0 | Before implementing the asset audit, define a dedicated deterministic generator with an explicit output format and write boundary. The browser measurement must read generated fixture data; it must not write TypeScript source. Freeze the generated fixture only after the generation command and inventory test pass. |
| Phase 1 manual-review selection remains unverifiable | P1 | Before freezing the affected allowlist, define the reviewer identity, preview dimensions (192px, 28px, 40px, 55px), per-row include/exclude rationale, and persisted evidence path. A manual selection without those fields is not an eligible Phase 1 output. |

- Cross-model second opinion: skipped on both validator passes because second_opinion.models is empty; high_diff classified the pre-plan worktree as boundary=false, is_high=false, with no changed files. Both validator outputs echoed this skipped status with empty reconciliation.

- Execute A.5 blocker and resolution: the retry cap was exhausted after two FAIL rounds. Round 1 required non-empty fixture evidence and scenario IDs; Round 2 found five dedicated tests reusing `S1`. The user selected Path B, so this plan revision assigns `S1a`–`S1e` and keeps the unit/browser boundary intact before the A.5 retry.

| Execute gate finding | Disposition | Resolution |
|---|---|---|
| Five dedicated tests reused `S1` across unit and browser suites | A — revise plan | ADR-005 defines `S1a` canonical fixture inventory, `S1b` borderline evidence, `S1c` archer inclusion, `S1d` browser source inventory/dimensions, and `S1e` affected-pair source/rendered side identity; each test is renamed to its owning ID. |
| S1e was nominally listed in Phase 1 without a passing phase | A — revise plan | Phase 1 now owns the RED declaration and `S1d` baseline inventory; Phase 3 owns the passing `S1e` regression gate after asset replacement. |
| Borderline evidence omitted 28px and 40px previews | A — revise plan | Phase 1 and the inventory/manual-review contract now require persisted 192px, 28px, 40px, and 55px evidence. |
| Unscoped diff check could collide with unrelated user changes | A — revise plan | Phase 4 now scopes status/diff inspection to the explicit task path allowlist and preserves unrelated worktree entries. |
| Scenario ownership depended on grep labels alone | A — revise plan | The Testing Strategy now lists exact dedicated test titles, owner files, passing phases, and a unique-ID source check. |

- Revision validator pass 2 outcome: `MAJOR_REVISION` terminal. `hm plan_rounds outcome` reports `progress` with 4 prior findings resolved and 5 new terminal findings. The frontmatter value `validator_outcome: MAJOR_REVISION_TERMINAL` intentionally matches this final validator state; the findings below are not silently treated as resolved.

| Terminal finding | Severity | Execution handoff |
|---|---|---|
| Opponent-color metric denominator and side-defining mass remain undefined | P0 | Define the exact blue/red share denominator, side-mass mask, and outline/background exclusion before implementing the side gate; do not accept a margin that can be produced by outline or transparent/background pixels. |
| Rendered-size acceptance thresholds are not fully specified | P1 | State the numeric rendered-size predicates for 28px, 40px, and 55px before the browser gate is considered executable. |
| Phase 2 review-artifact completion is not mechanically verifiable | P1 | Add a deterministic review-artifact schema/cardinality/path/disposition check or a named manual gate with persisted evidence before replacing any WebP. |
| Phase 4 selected browser/PWA checks are not named | P1 | Name exact browser specs/projects and the offline/precache command, including a fixed WebKit decision rule, before the final handoff. |
| Validator status metadata contradicts the revised-plan state | P2 | The current frontmatter now records the terminal result explicitly; any future accepted-risk continuation must preserve this terminal finding table rather than relabeling it approved. |

- Cross-model second opinion for the revision: `codex` skipped because `high_diff` classified `boundary=false,is_high=false`; verdict is validator-only for that model.

- Accepted-risk continuation (2026-08-23): the user selected Option A after terminal plan validation. The five terminal findings remain recorded as known execution risks; they are not revalidated or silently marked resolved. Execute may continue to the A.5 gate, and any implementation must still preserve ADR-004 and the contract boundaries.
