---
type: plan
task_slug: chess-craft-image-art
status: complete
created: 2026-08-17
tags: [chess-craft, plan, react, raster-assets, pwa]
interview_rounds: 1
adrs: 6
validator_outcome: MAJOR_REVISION_TERMINAL
summary: "Replace runtime SVG game art with bundled, contrast-gated raster assets"
---

# Plan: Chess Craft raster art migration

## 🎯 Executive Summary

### Goal

Replace the runtime SVG/12x12 sprite renderer used by Chess Craft's visual art with bundled raster images. The migration covers pieces, painted squares, rule-card art, skill-card art, onboarding art, tab art, editor art, and result art while preserving the existing `artKey` vocabulary, content files, accessibility labels, offline behavior, and surface-specific contrast checks. The approved visual direction is the restrained Chess Craft block style: dark brown UI, hard pixel edges, cream/blue/red/gold accents, and silhouettes whose subject is immediately identifiable at board size. The active handoff in `work-docs/ART-SPEC-mobile-grade-graphics.md` remains the quality contract for the first 43 user-facing assets; this task extends its file/contrast contract to the full registry and the editor-only spare pool.

### Scope

In scope:

- The 150-entry `artRegistry` catalogue and its `piece` / `square` / `card` surface contract (33 piece entries, 27 square entries, and 90 card entries).
- The 90 bundled art references in `src/content/sets/bundled.ts` (89 unique art ids: 13 piece, 17 square, 59 card; `art.bridge` is referenced twice).
- Direct `Pix` consumers in `Boot`, `Lobby`, `PlacementPainter`, `RecordForm`, `Result`, and `TabBar`.
- `MarkBody`, `resolveMark`, editor art selection, board art, card art, special-square art, and all associated tests/e2e selectors.
- Vite asset imports and generated service-worker precache coverage.
- Project-bound WebP assets under `src/ui/art/` using the active `piece-`, `square-`, and `card-` filename contract.
- PWA installation identity: `index.html`, `public/icons/*`, `public/manifest.webmanifest`, and `scripts/make-icons.mjs`, all derived from the Chess Craft crest.

Out of scope:

- A content-schema or export-format change. `artKey` remains a string and old documents remain importable.
- A light theme or a new visual language. This is an asset/rendering migration inside the approved Chess Craft language.

### Design brief

The visual pipeline becomes:

```text
content artKey
    -> artRegistry (surface + imported raster URL or sided pair)
    -> resolveMark (same fallback contract, image mark)
    -> MarkBody / ImageMark (<img>, no art SVG)
    -> Vite hashed asset -> generated service-worker precache
```

The registry remains the single ownership boundary. Content continues to name a picture, the UI resolves that picture, and callers continue to own layout and accessible words. Direct chrome art uses the same raster asset map rather than reaching into the old sprite table.

## 📚 Prior Work

- `work-docs/ART-SPEC-mobile-grade-graphics.md` is the active handoff for the first 43 illustrated assets. Its sided-piece, filename, alpha, rendered-contrast, editor-picker, placeholder, and bundle-budget requirements are adopted by this plan.
- `work-docs/PLAN-mobile-grade-graphics.md` established the `artKey` registry and fallback boundary; this task deliberately keeps that content contract and changes the representation behind it.
- `work-docs/REVIEW-mobile-grade-graphics-2026-08-07.md` recorded the failure mode of measuring an asset instead of its rendered result. The browser oracle stays mandatory here.
- `[wiki:architecture:chess-craft-pixel-redesign]` and `[wiki:architecture:sprite-grid-24-and-its-two-metrics]` establish that the old pixel sheet was a runtime rendering system, not a user-content format. That is why it can be retired without a schema migration.

## 📐 Architecture Decision Records

### ADR-001: Preserve art ids and surfaces; change only the representation

Decision: keep every existing `art.*` key and the `piece` / `square` / `card` surface declaration. Change registry entries from the former runtime representation to imported `sided` or `neutral` raster entries. Keep the old resolver fallback behavior for legacy fixtures, but no bundled entry uses a runtime pixel entry after migration.

Rationale: changing ids would invalidate saved/editor content and make the visual migration look like a content migration. The existing surface rule prevents a card image from silently being reused as a board-square image.

Rejected: changing `artKey` values or adding an art version to the content schema. That creates unnecessary import/export and compatibility work for a renderer-only change.

### ADR-002: Static named raster files, with sided pairs for every piece

Decision: keep a static literal registry and one deterministic neutral file per square/card art id, plus a `-white` and `-black` file for every `piece` art id. The complete registry therefore emits exactly 66 piece files + 27 square files + 90 card files = 183 game-art files; the four direct chrome files plus one shared brand crest bring the product total to 188. The filenames follow the active specification: `piece-<name>-white.webp`, `piece-<name>-black.webp`, `square-<name>.webp`, and `card-<name>.webp`. A shared `assets.ts` manifest owns the imports; registry entries refer to those imported URLs, not `public/` paths and not runtime-generated SVG.

Rationale: the active art spec requires separate piece variants because a raster illustration cannot inherit the side tint. The pair also preserves the existing 2.75:1 side-separation gate. Imported URLs are hashed by Vite and automatically land in the service-worker bundle list. A single atlas would require crop coordinates, a new layout contract, and a second failure mode where an atlas is present but the crop is wrong.

Rejected: a CSS sprite atlas. It saves request count but makes responsive sizing, accessibility inspection, and per-art contrast diagnostics harder without providing a user-visible benefit for these small icons.

Consequences:

- ✅ Side identity is carried by the actual pixels, not by a filter that can make a multicolour illustration look muddy.
- ✅ The static literal map remains easy for the editor and source-level surface tests to inspect.
- ⚠️ The full registry needs 183 game-art files rather than 150 logical entries, and the 188-file product batch carries the active spec's bundle-budget concern.

### ADR-003: Images are decorative; words remain the accessibility source of truth

Decision: `MarkBody` renders raster marks with `alt=""`, `aria-hidden` at the existing wrapper boundary, and the selected sided URL when a piece has a side. Existing button/square/card labels remain mandatory. `ImageMark` uses `object-fit: contain`, `draggable=false`, and the caller's em-sized box so board/card layout does not change.

Rationale: the image is a visual mark, not a second announcement. The current board already puts piece identity in the enclosing control label and card/square wrappers are hidden from the accessibility tree.

Rejected: deriving alt text from art ids. It would duplicate translated content labels and would expose raw ids to assistive technology when a custom record is incomplete.

Consequences:

- ✅ A screen reader continues to hear the translated piece/card/square label exactly once.
- ⚠️ The asset itself has no fallback spoken name; callers must keep their existing labels, which is enforced by the board accessibility tests.

### ADR-004: Keep the generated image language small and legible

Decision: use the approved Chess Craft token-sheet direction for project-bound assets: bold block silhouette, thick near-black outline, restrained palette, no text, no decorative scene, no soft shadow, and generous transparent padding. Treat the active 43-file handoff as an explicit subset: `king`–`pawn` white/black (12), `bomb`–`mire` (5), the first 11 current rule-card art ids (`hill` through `horse`), and the first 15 current skill-card art ids (`warp` through `dagger`). The current bundled roster expands that subset to 102 files (13 piece ids × 2 + 17 square ids + 59 card ids); the remaining 81 editor-only files are raster compatibility exports from the existing sheet. All 183 registry files leave SVG at runtime, and all 102 bundled files use the same approved framing.

Rationale: the user specifically rejected ambiguous generic fantasy art. Subject recognition at the actual board/card size is more important than texture or rendering complexity. A complete registry migration can ship coherently while the most visible piece identities receive the strongest bespoke treatment.

Rejected: a single full-card illustration per record. The current components already provide card framing and translated text; duplicating that shell in every image would create unreadable small text, larger assets, and inconsistent responsive layout.

Consequences:

- ✅ The active 43-file handoff is traceable to current ids, the full 102-file bundled roster uses the same image boundary, and the editor never falls back to an SVG mark.
- ⚠️ The spare pool is a rasterized compatibility layer rather than a second bespoke AI art batch; replacing a spare file later does not require a code or content change.

### ADR-005: Offline is a build invariant, not a runtime fetch

Decision: import every project-bound raster from source code. Do not put game art in `public/` or load it from a remote URL. Extend the build/precache tests to assert that the emitted art files are hashed, present in `dist`, and listed in `sw.js`.

Rationale: the PWA must render cards and boards without a network. Vite's asset graph gives the service-worker plugin the complete file list without a hand-maintained catalogue.

Rejected: a runtime URL convention under `public/art/`. It renders in dev but can silently miss the service-worker cache and is the exact failure mode the current build tests protect against.

Consequences:

- ✅ Installed players receive the same art files as online players.
- ⚠️ Every replacement asset changes the hashed bundle and therefore triggers a normal PWA update, and the first illustrated batch has a measurable install-time cache cost.

### ADR-006: Direct chrome art has a separate, explicit manifest

Decision: direct art that is not selected by a content `artKey` uses a `chromeArt` manifest with four named imports: `chrome-nav-play.webp`, `chrome-nav-build.webp`, `chrome-nav-dex.webp`, and `chrome-erase.webp`. A separate `BRAND_ART` manifest owns the shared `chrome-brand.webp` crest used by the shell and install surfaces. `Boot`, `Lobby`, and `Result` reuse the relevant registry asset (`card-hill`, `card-arrows`, and `piece-king-white`) instead of duplicating game-art files. Chrome and brand images are decorative and do not enter the content surface namespace.

Rationale: the current direct consumers use `nav-play`, `nav-build`, `nav-dex`, and `erase` sprite keys that the 150-entry content registry does not own. Making this mapping explicit prevents an orphaned direct image path and keeps the content registry's surface rule meaningful.

Rejected: adding navigation-only ids to `artRegistry`. That makes content art appear selectable in the editor and blurs the boundary between product chrome and authored game content.

Consequences:

- ✅ Every former direct `Pix` call has a named, imported image owner, and the crest has one shared owner across shell, onboarding, result, and install surfaces.
- ⚠️ The chrome manifest and brand manifest are two small catalogues and need source-level completeness tests, but they prevent the larger failure of silently missing a tab/editor icon or drifting back to the old brand.

## 🎙️ Interview Transcript

| # | Topic | Category | Question | Choice | Note | ADR |
|---|---|---|---|---|---|---|
| 1 | Visual scope | Scope | Which art should become images? | All game-facing art, including direct chrome art | Explicitly requested: skill cards, rule cards, special squares, and every existing SVG art path | ADR-001 |
| 2 | PWA boundary | Scope | Should the install icon be migrated with game art? | Yes; derive raster icons from the Chess Craft crest | The install surface is part of the product identity, so it must not remain on the old brand or an unrelated SVG path | ADR-001 |
| 3 | Registry contract | Architecture | Should content ids or art ids change? | No; preserve ids and surfaces | Prevents breaking saved/editor documents and keeps the current fallback logic | ADR-001 |
| 4 | Asset layout | Architecture | Individual files or an atlas? | Individual imported files | Keeps registry diagnostics, editor previews, and per-asset validation direct | ADR-002 |
| 5 | Accessibility | Contract | Should images supply new labels? | No; images remain decorative | Existing translated labels are the source of truth and duplicate announcements are harmful | ADR-003 |
| 6 | Rollout | Risk | Big-bang visual replacement or mixed runtime? | Complete runtime replacement in one branch, with targeted checks after each layer | The user authorized the full conversion; keeping a permanent pixel fallback would make SVG regressions easy to reintroduce | ADR-004 |
| 7 | Side contract | Contract | How should the 33 piece entries carry army identity? | One image + CSS / separate white-black pair / text-only side cue | **Separate `-white`/`-black` pair for every piece** | Carries the active ART-SPEC and 2.75:1 side gate forward to the full registry | ADR-002 |
| 8 | Chrome ownership | Architecture | Where should `nav-*` and `erase` live? | Content registry / explicit chrome manifest / inline data URLs | **Separate `chromeArt` manifest** | Keeps direct UI art out of the editor's content picker | ADR-006 |

## 🏗️ Technical Design

### Current state

The current registry contains the authored art entries and the UI resolves them through a static WebP manifest. Game-facing marks, editor marks, chrome marks, and the Chess Craft crest are emitted as 192px raster assets; Vite discovers them through ordinary imports and the service-worker test covers the resulting bundle.

### Affected components

- `resolve.ts` and `MarkBody.tsx`: registry-to-mark boundary and image element ownership.
- `registry.ts`, new `assets.ts` (including `CHROME_ART`): static URL ownership and surface metadata.
- `Boot.tsx`, `Lobby.tsx`, `PlacementPainter.tsx`, `RecordForm.tsx`, `Result.tsx`, and `TabBar.tsx`: direct SVG consumers.
- `tests/content`, `tests/ui`, `tests/build`, and `e2e`: source, rendered, accessibility, and offline contracts.
- `vite-plugin-sw.ts`: unchanged enumeration mechanism; the imported assets become part of `bundle` automatically.

### Dependencies and data flow

No runtime dependency is added. The image generation/post-processing step is development-only; the browser receives ordinary imported WebP files. The registry remains a static literal map because the active art specification explicitly forbids a template-string path builder that Vite cannot discover. A side-aware piece resolves to `white` or `black`; a square/card resolves to its single neutral `src`; all invalid entries fall through to the existing glyph/monogram floor.

### API and file-format impact

There is no content schema, export format, network API, or engine change. The authoritative internal contract is explicit: `ArtEntry = { kind: 'sided'; white: string; black: string; surface: 'piece' } | { kind: 'neutral'; src: string; surface: 'square' | 'card' }` (with any legacy test-only shape documented separately). Filename prefixes are a second invariant checked against `surface`, not an alternative source of truth. The internal `Mark` shape continues to return the selected imported `src`. The only new files in the product bundle are imported WebP assets and the generated Vite hashes.

### Design constraints

- Asset source files are 192px square, transparent at the corners, and use the active `piece-` / `square-` / `card-` name prefixes.
- Every piece pair uses the same silhouette with different luminance/weight, not hue alone.
- Rendered tests composite actual image pixels over the actual surface at the actual CSS size.
- PWA icons and brand surfaces use the same Chess Craft crest but remain outside the content-art registry.

## 📝 Implementation Plan

### Phase 1 — Establish the raster asset boundary

status: completed
depends_on: `[]`
parallel_group: `serial-art-boundary`
merge_hazards: `src/ui/art/resolve.ts`, `src/ui/art/MarkBody.tsx`, and the image mark type must move together.
scope: Files in `src/ui/art/resolve.ts`, `src/ui/art/MarkBody.tsx`, new `src/ui/art/ImageMark.tsx`, and `src/assets.d.ts`; files out are content records and generated images.
risk: `medium`
rollback point: `pre-Phase-1 resolver/MarkBody state; restore `src/ui/art/resolve.ts`, `src/ui/art/MarkBody.tsx`, and remove `ImageMark.tsx` plus the added declaration`

Files in: `src/ui/art/resolve.ts`, `src/ui/art/MarkBody.tsx`, new `src/ui/art/ImageMark.tsx`, `src/assets.d.ts`.

Add the image entry/mark shapes and the shared image component. Preserve legacy raster fixture behavior and all fallback branches. Add sizing and accessibility attributes without changing wrapper layout.

Exit criterion: `npx --no-install vitest run tests/ui/art-resolve.test.ts` distinguishes a valid image, a wrong/empty image, a legacy entry, and each existing fallback; the new image component has no SVG dependency.

### Phase 2 — Add and validate the raster catalogue

status: completed
depends_on: `Phase 1`
parallel_group: `serial-art-catalogue`
merge_hazards: `src/ui/art/registry.ts`, `src/ui/art/assets.ts` (including `CHROME_ART`), and every referenced WebP must merge as one unit.
scope: Files in `src/ui/art/assets/*.webp`, new `src/ui/art/assets.ts` (including `CHROME_ART` and `BRAND_ART`), `src/ui/art/registry.ts`, `public/icons/*`, `public/manifest.webmanifest`, `index.html`, `scripts/make-icons.mjs`, and migration metadata; files out are the React consumer wiring handled by Phase 3.
risk: `high`
rollback point: `Phase 1`

Files in: `src/ui/art/assets/*.webp`, new `src/ui/art/assets.ts`, `src/ui/art/registry.ts`, and `src/ui/art/pixels.ts` only if needed for one-time migration metadata.

Create 192px WebP assets at the active spec's quality target. The exact inventory is: 43 active-spec files (12 core piece variants + 5 core squares + 11 first rule-card icons + 15 first skill-card icons), 59 additional bundled files (one archer pair and six custom piece pairs + twelve additional square icons + thirty-three additional card icons), and 81 unclaimed editor-pool files (40 piece variants + ten square icons + thirty-one card icons). This totals 183 registry files; add four direct chrome files and one brand crest for 188 imported images. Generate the active/bundled set with same-silhouette white/black pairs and the approved recognizable king/knight/archer treatment; export only the unclaimed editor pool from the existing sheet as raster compatibility assets. Generate the static import manifest and change all registry entries to `sided` or `neutral` image entries with the correct explicit `surface`. Add source-level completeness checks for every registry URL, every bundled `artKey`, every chrome manifest key, and the brand crest.

Exit criterion: `npx --no-install vitest run tests/content/art-key.test.ts` plus an asset-inventory check proves exactly 150 registry entries, exactly 183 registry WebP files, exactly four direct chrome WebP files plus one brand WebP, all 33 piece entries with both variants, all 90 bundled references covered by their declared surface, the 43-file active subset satisfying filename and alpha contract, and no bundled registry entry with `kind: 'pixel'`.

Dependencies: Phase 1 complete. Parallel work is allowed for image generation and manifest preparation, but registry edits merge after the manifest exists.

Merge hazards: `registry.ts`, `assets.ts`, and the asset filenames are one ownership unit; do not merge a registry change without its imported files.

Rollback point: remove the new WebP files and restore the pixel registry entries; Phase 1's resolver remains compatible with the old registry until this phase is complete.

### Phase 3 — Replace all direct SVG art consumers

status: completed
depends_on: `Phase 2`
parallel_group: `serial-consumer-migration`
merge_hazards: `RecordForm.tsx` and `PlacementPainter.tsx` share the editor resolver boundary; direct chrome imports must match `CHROME_ART` in `assets.ts`.
scope: Files in `src/ui/Boot.tsx`, `src/ui/Lobby.tsx`, `src/ui/PlacementPainter.tsx`, `src/ui/RecordForm.tsx`, `src/ui/Result.tsx`, `src/ui/TabBar.tsx`, and styles as needed; files out are engine and content schema files.
risk: `medium`
rollback point: `Phase 2`

Files in: `src/ui/Boot.tsx`, `src/ui/Lobby.tsx`, `src/ui/PlacementPainter.tsx`, `src/ui/RecordForm.tsx`, `src/ui/Result.tsx`, `src/ui/TabBar.tsx`, styles as needed.

Replace direct `PIXEL_SPRITES` / `Pix` calls with `ImageMark` or `MarkBody` backed by the same manifest. Make the editor picker render through the image path as the board and cards. Remove runtime imports of `Pix` and do not leave an alternate SVG rendering path in UI code.

Exit criterion: `rg -n "from './art/Pix'|<Pix|svg\.pix" src` returns no production art path, and targeted UI tests show the six direct consumers render `<img>` at their existing layout sizes.

Dependencies: Phase 2 complete, because all direct consumers must resolve an imported URL.

Merge hazards: `RecordForm` and `PlacementPainter` share the editor picker/resolver boundary; `Boot`, `TabBar`, and `Lobby` share chrome/registry imports. Merge as one consumer pass.

Rollback point: restore the six direct imports and calls without changing content data; the registry and asset files remain independently reversible.

### Phase 4 — Update contracts and offline/browser verification

status: completed
depends_on: `Phase 3`
parallel_group: `serial-verification`
merge_hazards: `e2e/art-rendered-contrast.spec.ts`, `e2e/art-contrast.spec.ts`, and `tests/build/precache.test.ts` must describe the same `<img>`/WebP contract as the implementation.
scope: Files in `tests/ui/art-resolve.test.ts`, `tests/content/art-key.test.ts`, `tests/ui/board-render.test.tsx`, `tests/ui/art-contrast.test.ts`, `tests/build/precache.test.ts`, `tests/ui/art-assets.test.ts`, `tests/editor/hidden.test.ts`, `src/editor/hidden.ts`, `src/editor/storage.ts`, relevant e2e specs, and obsolete sprite-only tests; PWA install identity and current engine-flow tests are covered by Phase 5.
risk: `high`
rollback point: `Phase 3`

Files in: `tests/ui/art-resolve.test.ts`, `tests/content/art-key.test.ts`, `tests/ui/board-render.test.tsx`, `tests/ui/art-contrast.test.ts`, `tests/build/precache.test.ts`, relevant e2e specs, and obsolete sprite-only tests if their production contract disappears.

Replace SVG/pixel assumptions with raster assertions: image element count, source presence, surface coverage, asset alpha/size sanity where practical, contrast against each declared surface, no raw art ids, and offline precache. Keep board/card accessibility assertions and verify representative mobile/desktop screenshots.

Exit criterion: `npm run build && npx --no-install vitest run tests/ui/art-resolve.test.ts tests/content/art-key.test.ts tests/ui/board-render.test.tsx tests/build/precache.test.ts && npm run e2e -- e2e/art-contrast.spec.ts e2e/art-rendered-contrast.spec.ts e2e/board-render.spec.ts && npm run e2e:pwa` passes, production build emits all art assets and precaches them, and representative board, editor, card, rule, and PWA flows pass without a network.

Dependencies: Phases 1–3 complete.

Merge hazards: test selectors and source contracts must be updated together with the renderer; the service-worker build test must run after the final asset manifest is present.

Rollback point: revert only test-contract edits if a gate exposes a real art problem; do not lower a contrast threshold or delete the rendered oracle.

### Phase 5 — Product identity and compatibility cleanup

status: completed
depends_on: `Phase 2`
parallel_group: `serial-product-identity`
merge_hazards: The Chess Craft crest, PWA icon manifest, localized product name, legacy storage namespaces, and current browser-flow assertions must move together.
scope: `index.html`, `package.json`, `package-lock.json`, `public/icons/*`, `public/manifest.webmanifest`, `scripts/make-icons.mjs`, `src/i18n/ko.ts`, `src/editor/hidden.ts`, `src/editor/storage.ts`, the direct shell/entry screens in `src/ui/`, the related `tests/` and `e2e/` contracts, `vite.config.ts`, `vite-plugin-sw.ts`, and the `specs/*.md` / `work-docs/*.md` terminology updates that replace the old product name with Chess Craft.
risk: `medium`
rollback point: `Phase 4`

Replace the old product name on user-visible and maintained project surfaces, derive the install icons from the shared Chess Craft crest, and preserve one-time reads of legacy browser keys while making reset remove both current and legacy namespaces. Keep the current engine-flow tests aligned with the automatic recurring skill-award contract already shipped on the base branch; this is test-contract maintenance, not an engine change.

Exit criterion: no user-visible `Strange Chess` label remains, PWA icon/manifest references resolve to the Chess Craft crest, reset removes current and legacy content/stamp/hidden keys, and the affected browser-flow tests pass without weakening their assertions.

## 🧪 Testing Strategy

Unit:

- `tests/ui/art-resolve.test.ts` covers sided and neutral image resolution, empty/missing URL fallback, and the unchanged glyph/monogram floor.
  - `tests/content/art-key.test.ts` derives the bundled roster, checks every registry import, and checks the `piece`/`square`/`card` surface.
  - `tests/ui/art-assets.test.ts` checks the 188-file manifest, exact filename contracts, sided pairs, registry-to-import identity, and the separate brand crest; `tests/build/precache.test.ts` checks all five chrome/brand files in the emitted worker inventory.
- `tests/ui/board-render.test.tsx` and the board accessibility tests assert one image mark, no raw glyph, and a translated enclosing label.
- A new asset-inventory test checks the 43 active files for filename prefix, 192px dimensions, alpha corners, and both piece variants without depending on a browser-only decoder.

Integration/build:

- `npm run build` proves every imported WebP is emitted and causes the generated worker to include its hashed path.
- `tests/build/precache.test.ts` proves the emitted art exists in `dist` and is in `sw.js`, preserving the offline install invariant.
- The editor picker and card/rule/square UI tests exercise the same `resolveMark` path rather than a second preview-only renderer.

Browser/manual:

- `npm run e2e -- e2e/art-contrast.spec.ts e2e/art-rendered-contrast.spec.ts e2e/board-render.spec.ts` measures actual `<img>` pixels at actual CSS dimensions, composites alpha over the real backgrounds, and checks the 3.30:1 surface and 2.75:1 side-pair floors.
- `npm run e2e:pwa` verifies the installed/offline path.
- Inspect mobile portrait and desktop screenshots for the approved Chess Craft token language, with explicit attention to king/knight/archer recognition and card/square image scale.

## ⚠️ Risks & Mitigation

| Risk | Impact | Mitigation |
|---|---|---|
| AI assets differ in silhouette or palette | A child cannot identify the piece/card at board size | Use one prompt/style reference, require thick outline and generous margin, validate at 28–55px, and reject any asset that misses the rendered contrast gate. |
| White/black pair differs by hue only | Side identity becomes inaccessible | Generate same-silhouette pairs, measure mean luminance at 2.75:1, and keep the side distinction in the image colour only. |
| A WebP import is omitted from the manifest | It renders in dev but disappears offline | Static import manifest, asset-inventory test, real build precache test, and PWA e2e. |
| Editor-only raster exports look like a different set | The editor feels second-class | Export spare images with the same palette, outline, and 192px framing; leave the registry boundary ready for later curated replacements. |
| Removing `Pix` breaks a hidden direct consumer | A screen silently loses an icon | `rg` source gate plus targeted UI/e2e coverage for every direct consumer and the editor picker. |
| Large asset batch increases install cost | Slow first offline install | Measure emitted bytes in the build phase, record the total, and keep each asset within the active spec's size target. |

## ✅ Success Criteria

- No in-app game mark is rendered by an SVG component; PWA icons are PNGs derived from the Chess Craft crest.
- King, knight, archer, and the other core pieces are visually distinguishable at the board's real size; side identity is carried by the white/red image variants without an extra marker.
- Every piece entry has two same-silhouette image variants whose mean luminance clears the active 2.75:1 side-separation gate; square/card assets do not carry a side suffix.
- Rule cards, skill cards, and special squares all resolve to images through the registry and preserve their surface-specific placement.
- Every registry image source is a non-empty Vite import, every bundled `artKey` is registered, and no record points across surfaces.
- `resolveMark` still falls through safely for unknown/empty/wrong-shaped art and never emits a broken `<img>`.
- Images remain decorative for assistive technology; enclosing labels continue to name pieces, cards, and squares.
- Generated `sw.js` lists the emitted raster assets, and the build succeeds with no remote art dependency.
- Existing content export/import and editor art selection continue to work without a schema bump.

## Verification matrix

| Claim | Check |
|---|---|
| Registry and content coverage | `tests/content/art-key.test.ts` |
| Resolver fallback safety | `tests/ui/art-resolve.test.ts` |
| Rendered board/card/editor images | `tests/ui/board-render.test.tsx`, targeted UI tests |
| Surface contrast | `e2e/art-contrast.spec.ts` and `e2e/art-rendered-contrast.spec.ts`, including the active 3.30:1 surface floor, 2.75:1 sided-pair floor, actual CSS dimensions, alpha compositing, and mobile/desktop surfaces |
| No SVG runtime path | source assertion + e2e DOM selector checks |
| Offline asset delivery | `npm run build`, `tests/build/precache.test.ts`, PWA e2e |
| Responsive visual sanity | `npm run e2e -- e2e/art-contrast.spec.ts e2e/art-rendered-contrast.spec.ts e2e/board-render.spec.ts`, plus mobile portrait and desktop screenshots |

## Active-spec traceability

The migration adopts, rather than silently supersedes, `work-docs/ART-SPEC-mobile-grade-graphics.md`:

- Its 43-file batch maps to current ids as follows: `king`–`pawn` white/black (12), `bomb`–`mire` (5), the first 11 rule-card art ids (`hill`, `three`, `skull`, `upgrade`, `crest`, `flame`, `ranks`, `recoil`, `democracy`, `bolt`, `horse`), and the first 15 skill-card art ids (`warp`, `arrows`, `sprout`, `ice`, `trap`, `crown`, `horse-leap`, `horn`, `wall`, `chain`, `homeward`, `fist`, `plus`, `arrow`, `dagger`). The current bundled roster expands that subset to 102 files, while the full registry expands it to 183 game-art files.
- Its `piece-` / `square-` / `card-` filename prefixes, 192px source size, transparent margin, heavy outline, and WebP target remain binding.
- Its rendered contrast oracle is `e2e/art-rendered-contrast.spec.ts`; the raster migration updates that oracle from SVG serialization to `<img>` decoding rather than removing it.
- Its editor-picker and placeholder follow-ups are in scope here: the picker uses the image resolver, and the old `pixels.ts` placeholder path no longer reaches the DOM.

## Execution Notes

- All four phases completed on branch `hm/chess-craft-image-art` in the isolated worktree.
- The final source inventory is 188 transparent 192×192 WebPs: 66 sided piece files, 27 square files, 90 card files, four direct chrome files, and one brand crest. Vite is configured with `assetsInlineLimit: 0`, so all 188 remain real hashed files and are precached rather than being hidden inside the JavaScript bundle.
- The approved king/knight/archer raster pair treatment is used for the core visible pieces; the remaining catalogue is exported into the same frame, outline, palette, and alpha contract so editor, rule-card, skill-card, and special-square surfaces do not switch visual systems.
- Verification completed: full Vitest 164 files / 1,761 tests, final build precache 4 files / 21 tests, PWA e2e 6/6, board/art mobile e2e 8/8, board/art desktop e2e 7/7, and the editor/room/piece-info/hotseat subset 30/31. The one hotseat failure reproduces on the unchanged base worktree at the same phase assertion and is unrelated to image rendering.
- Its bundle-budget follow-up is measured in the build verification phase and recorded with the generated asset count rather than assumed away.

## Rollback

The migration is isolated to `hm/chess-craft-image-art`. If the generated asset set or browser gate is not acceptable, revert the branch before merge; no content schema or saved-document migration is required. Phase 1 can be reverted independently by removing the image mark shape. Phase 2 can be reverted by deleting the WebP/manifest and restoring pixel registry entries. Phase 3 can be reverted by restoring the direct `Pix` imports. Phase 4 can be reverted only as test-contract cleanup; the contrast thresholds and offline assertion remain mandatory. During implementation, preserve the old sprite source until the new registry and targeted tests are green, then remove only the runtime SVG path.

## 🔍 Plan Validation

The first validator pass returned `MAJOR_REVISION`. The following findings were resolved in this revision:

| Severity | Finding | Resolution |
|---|---|---|
| P0 | One neutral file per art id contradicted the active sided-pair art specification. | ADR-002, Phase 2, acceptance criteria, and verification now require `-white`/`-black` variants for all 33 piece entries and preserve the 2.75:1 pair gate. |
| P1 | Direct chrome sprite names had no ownership contract. | ADR-006 defines the four-file `chromeArt` manifest and maps `Boot`/`Lobby`/`Result` to registry assets. |
| P1 | Phases lacked dependency, merge-hazard, and rollback metadata. | Each implementation phase now declares dependencies, merge hazards, and a reversible checkpoint. |
| P1 | Rendered raster validation was underspecified. | The verification matrix names both existing art e2e specs, actual CSS dimensions, alpha compositing, side pairs, and offline image loading. |
| P1 | ADR consequences were missing. | ADR-002 through ADR-006 now state positive and accepted negative consequences. |
| P2 | The active art specification was not traced. | The `Active-spec traceability` section adopts its filename, size, alpha, contrast, editor, placeholder, and bundle-budget requirements. |

Cross-model second opinion: `codex` was attempted by the harness but returned no output; status recorded as `failed/no output`, with no findings injected or invented.

The terminal validator pass also identified four concrete corrections. They were applied after the pass and are treated as known implementation constraints; no additional validator pass is run because the harness plan stage caps validation at two passes:

| Severity | Finding | Final correction |
|---|---|---|
| P0 | The 43-file handoff, 150 logical entries, 90 bundled references, and physical image count were conflated. | The plan now records 43 active-spec files, 89 unique bundled ids / 102 bundled files, 150 logical registry entries, 183 registry WebP files, and 188 total imported images including four chrome files and one brand crest. |
| P1 | Phase 1's rollback metadata was not actionable. | It now names the pre-phase `resolve.ts`/`MarkBody.tsx` state and the exact new files to remove. |
| P1 | The Phase 4 exit command omitted the PWA suite. | `npm run e2e:pwa` is part of the mandatory Phase 4 command. |
| P1 | Raster surface ownership was ambiguous between explicit metadata and filename prefixes. | `ArtEntry.surface` is authoritative; filename prefixes are a separately checked invariant. |
