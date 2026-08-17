---
type: plan
task_slug: mobile-grade-graphics
status: complete
created: 2026-08-06
tags: [chess-craft, plan, react, content-schema, game-art, pwa, raster-assets]
research_doc: "[[RESEARCH-mobile-grade-graphics]]"
interview_rounds: 3
adrs: 13
validator_outcome: NEEDS_REVISION_RESOLVED
summary: "Land the art contract (schema v7 artKey + registry + fallback chain), prove the pipeline with one asset"
---

# PLAN — Mobile-grade graphics: the art contract

## 🎯 Executive Summary

**What:** Land the *contract* that lets illustrated raster art replace the
current emoji/Unicode icon axis — schema v7 `artKey`, a UI-side art registry, a
three-level fallback chain, and one real asset proving the bundler → service
worker → render pipeline end to end. The 37-icon art batch itself is **not** in
this cycle.

**Why:** `RESEARCH-mobile-grade-graphics` established that the renderer is not
the quality ceiling — 31 of 37 content icons are OS emoji (`src/i18n/ko.ts:47-141`),
so the art direction is currently decided by the player's phone. The user
sequenced Phases 9a/9b/10 (rooms) ahead of the art batch, which creates a
re-skin hazard: the room editor UI would be built against a token surface that
is about to change. Landing the contract first means Phase 9/10 builds toward
the final surface instead of away from it.

**Key decisions:**
- DOM renderer stays; distribution is web + Google Play TWA, Apple excluded (ADR-001).
- Fidelity target is illustrated/storybook, produced as AI-generated raster (ADR-002, ADR-004).
- This cycle lands the contract only; art production is a later phase (ADR-005).
- `artKey` is a **new** schema axis, not a reuse of `iconKey` — the glyph fallback chain survives (ADR-006).
- Side is carried by **two art variants per piece**, not a CSS treatment (ADR-007).
- Art is **bundler-imported**, never dropped in `public/` (ADR-009).

**Estimated impact:** 4 phases. Touches `src/content/schema.ts`, `src/ui/i18n.ts`,
`src/editor/io.ts` (version constant only), adds `src/ui/art/`, wires exactly one
record in `src/content/sets/bundled.ts`, and adds one e2e spec. No CSS material
work, no editor UI, no `MatchHost` layout change.

## 📚 Prior Work

- `RESEARCH-mobile-grade-graphics` — the renderer-vs-art analysis, the
  chessground precedent (DOM is not the ceiling), and the lichess Capacitor →
  Flutter failure that separates "renderer" from "container".
- `PLAN-ui-ux-productization` — ADR-011 (UI names no content), ADR-017
  (`iconKey` as content + its absent-case rule), ADR-021 (token ownership),
  ADR-022 (PWA first).

**Baseline shifted after this PLAN was written (2026-08-07).** Phases 9a and 9b
landed on `master` as `475c77f` ("rooms a child can build, name and play") and
`7ed86a2` ("deleting, and noticing when what you are looking at is gone"), and
the user **cancelled Phase 10** outright. `SCHEMA_VERSION` is still 6 — Phase 9
did not touch the schema — so every file:line citation below was re-verified
against `7ed86a2` and still holds. What did *not* survive is half of ADR-005's
rationale; see the amendment recorded there.

**Lessons carried in:**
- `[wiki:architecture] board-glyph-rendering` — the board checker and the glyph
  contrast trade against each other on one axis; never improve one number
  without recomputing the other. Directly drives Phase 4.
- `[fail:render] fixed-overlay-blocks-what-it-only-dims` (count:2) — no phase
  here adds a fixed overlay, and none may.
- `[fail:design] plan-contradicts-its-own-adr` — ADR-022 is *not* amended by
  this plan; TWA distribution requires no wrapper, so the "Capacitor later"
  decision stands untouched. Stated explicitly so no later scope line reads
  ADR-001 as permission to wrap.
- Global correction 2026-06-08 (absent-case = feature black hole) — `artKey` is
  optional and its absent case is the *common* case for the entire life of this
  plan. ADR-006's fallback chain and Phase 2's exit criterion exist for that.

## 🎙️ Interview Transcript

| # | Topic | Category | Question | Options | Choice | Note | → ADR |
|---|---|---|---|---|---|---|---|
| 1 | Distribution target | Scope boundaries | How far does this product ship? | web+PWA / web+Play(TWA) / iOS App Store required / undecided | **Web + Google Play (TWA)** | Apple excluded → no wrapper, no native rewrite | ADR-001 |
| 2 | Fidelity target | Scope boundaries | What defines "commercial mobile game" here? | flat vector casual / illustrated storybook / near-3D premium | **Illustrated / storybook** | Highest art cost, accepted | ADR-002 |
| 3 | Sequencing vs Phases 9/10 | Implementation phasing | Graphics first, or rooms first? | graphics first / 9-10 first / art axis only | **Phases 9/10 first** | Re-skin hazard accepted, mitigated by ADR-005 | ADR-003 |
| 4 | Art production method | Dependencies | How are 37 illustrated icons produced? | AI→WebP raster / Claude draws SVG / hybrid / commission | **AI-generated → WebP raster** | Raster cannot follow colour tokens — see ADR-007 | ADR-004 |
| 5 | Landing scope this cycle | Scope boundaries | Given 9/10 runs first, what lands now? | contract only / PLAN doc only / reverse the order / end interview | **Contract only** | Phase 9/10 builds toward the final surface | ADR-005 |
| 6 | Art contract axis | Contract shape | How does raster art attach to content? | new `artKey` / reuse `iconKey` value / literal asset path | **New `artKey` axis** | Glyph fallback chain survives intact | ADR-006 |
| 7 | Side distinction | Contract shape | How do白/黑 separate once pieces are illustrations? | two variants per piece / one variant + CSS base ring / both | **Two variants per piece** | 6 → 12 piece assets; luminance constraint moves into the art prompt | ADR-007 |
| 8 | Editor art picker | Scope boundaries | Can an authored piece choose art? | contract only, picker later / picker now / authored stays monogram | **Contract only, picker later** | Editor IA is rebuilt in Phase 9/10 anyway | ADR-008 |

Two candidate questions were **not** asked, per the 5-term gate:
- *Art licensing / copyleft* — failed EIG. Storybook-illustrated art has no free
  chess-set equivalent, and 31 of 37 icons (궁수, 폭탄칸, 포탈, 신전, 성역, 늪,
  26 cards) have no chess equivalent at all, so sourcing was already moot before
  the question could change anything. Recorded as an assumption.
- *File format / resolution* — failed common-ground. WebP at 2× with a
  bundler-emitted hashed filename is the only choice consistent with an existing
  Vite build that already hashes and precaches. Defaulted, then promoted to
  ADR-009 because the `public/` alternative is a live footgun.

## 📐 Architecture Decision Records

### ADR-001: The DOM renderer stays; distribution is web + Google Play (TWA)
**Status:** Accepted (2026-08-06, via /hm:plan interview)
**Context:** The user asked whether HTML is the right path to a quality app on
both web and store. That question can only be answered against a distribution
target, and none had been stated.
**Decision:** Ship to the browser, to installed PWA, and to Google Play via TWA.
Apple's App Store is out of scope. The board keeps rendering as DOM elements
styled by CSS.
**Consequences:**
- ✅ Everything already paid for survives: the ARIA grid
  (`.board-row { display: contents }`, `styles.css:430-435`), the pointer-event
  input model chosen because HTML5 drag is dead on iOS Safari, and the Playwright
  suite's square-based selectors (~149 occurrences of `.square` / `data-square*`
  across 12 files under `e2e/`).
- ✅ No wrapper is needed at all — Play accepts a PWA through TWA — so ADR-022
  ("Capacitor stays a later wrapper") is untouched rather than amended.
- ⚠️ iOS users get a home-screen PWA, never a store listing. Guideline 4.2.2
  blocks web clippings and Apple has no TWA equivalent; reversing this later
  means opening the container axis, not the renderer axis.
**Rejected alternatives:**
- Canvas/WebGL (PixiJS) — rejected: the surfaces that read as cheap are all
  renderer-independent (RESEARCH capability table), and canvas costs the a11y
  grid, the iOS-safe pointer model, and every `.square` selector.
- Flutter rewrite — rejected, and doubly so for this repo: the core is 4,287
  lines of DOM-free TypeScript (`src/engine`, `src/content`, `src/editor`,
  `src/i18n`), which Flutter would force into a Dart re-implementation. React
  Native would preserve it; neither is warranted without an Apple requirement.
**Source:** Interview #1

### ADR-002: Fidelity target is illustrated / storybook
**Status:** Accepted (2026-08-06, via /hm:plan interview)
**Context:** "상용 모바일 게임 느낌" spans flat-vector casual to rendered 3D, and
the choice sets art cost and format.
**Decision:** Illustrated, storybook-styled art for pieces, square types and
cards, targeting an elementary-school audience.
**Consequences:**
- ✅ Matches the stated audience better than flat vector.
- ⚠️ The most expensive of the three options — 37 icons at illustration quality,
  and 43 once ADR-007's side variants are counted.
**Rejected alternatives:**
- Flat vector casual — rejected by the user despite lower cost and full SVG
  theming.
- Near-3D premium — rejected: raster asset weight versus a PWA that must work
  offline.
**Source:** Interview #2

### ADR-003: The **art batch** sequences after Phases 9a/9b/10 — the contract does not
**Status:** Accepted (2026-08-06, via /hm:plan interview)
**Context:** Rooms, deletion and room-makeability are unbuilt. Doing art first
would delay them; doing them first risks building editor UI against a token
surface about to change.
**Decision:** Phases 9a/9b/10 run first. This plan's art batch follows them.
**Consequences:**
- ✅ The room feature — the content-platform thesis — is not delayed by art.
- ⚠️ Re-skin hazard: editor UI built in 9/10 will be restyled later. Mitigated,
  not removed, by ADR-005.
**Rejected alternatives:**
- Graphics first — rejected by the user.
**Amendment (2026-08-07):** satisfied and closed. Phases 9a/9b merged
(`475c77f`, `7ed86a2`) and Phase 10 was cancelled by the user, so nothing in
`PLAN-ui-ux-productization` now sequences ahead of the art batch. The remaining
blocker on that batch is **capability, not ordering**: ADR-004 requires generated
illustration and this session has no image-generation tool, so the 43 assets
cannot be produced here regardless of when they are scheduled.
**Source:** Interview #3

### ADR-004: Art is AI-generated raster (WebP), not vector
**Status:** Accepted (2026-08-06, via /hm:plan interview)
**Context:** Storybook illustration at 37+ icons has to come from somewhere, and
the production method dictates the contract shape.
**Decision:** Generate illustrated art and ship it as WebP raster.
**Consequences:**
- ✅ Fastest route to the chosen fidelity; no 37-icon hand-drawing effort.
- ⚠️ **Raster cannot follow colour tokens.** Dark mode does not restyle an
  illustration, which is precisely why ADR-007 moves side distinction into the
  art itself.
- ⚠️ Bundle weight and service-worker precache become live concerns — see ADR-009.
**Rejected alternatives:**
- Claude-drawn SVG — rejected: theming-friendly and precache-free, but weaker at
  the storybook look and repetitive across 37 icons.
- Commission / asset store — rejected: 궁수, 폭탄칸 and 26 cards have no
  off-the-shelf equivalent, so most of it would be bespoke anyway.
**Source:** Interview #4

### ADR-005: This cycle lands the contract only
**Status:** Accepted (2026-08-06, via /hm:plan interview)
**Context:** ADR-003 puts the art batch after rooms, but leaving *nothing*
landed means Phase 9/10 builds against today's emoji surface and gets restyled.
**Decision:** Land the schema axis, the registry, the fallback chain and one
proving asset now. Produce the 43-asset batch in a later phase.
**Consequences:**
- ✅ The expensive, irreversible part (art production) is deferred until the
  surface it targets is stable.
- ⚠️ The app looks exactly as it does today — the visible payoff of this plan is
  zero until the later batch.
**Amendment (2026-08-07) — half this ADR's rationale expired unused.** It was
written to stop Phase 9/10 building against a surface about to change ("Phase
9/10 can read and write `artKey` from the day it starts"). Phases 9a/9b shipped
**before** this contract landed and Phase 10 was cancelled, so that benefit
never occurred and cannot. Recorded rather than quietly dropped, because the
decision now rests on one leg instead of two: the contract is still the
prerequisite for the art batch and still the right thing to land, but it no
longer prevents any re-skin. Anyone re-reading this should not infer that
landing it early paid off — it did not.
**Rejected alternatives:**
- PLAN document only, no code — rejected: leaves the re-skin hazard fully intact,
  which was the entire reason to plan this now.
**Source:** Interview #5

### ADR-006: `artKey` is a new schema axis (v7), not a reuse of `iconKey`
**Status:** Accepted (2026-08-06, via /hm:plan interview)
**Context:** `iconKey` (ADR-017, schema v4/v5) resolves through the locale
bundle to a text glyph. Raster art is not text and not locale-varying.
**Decision:** Add `artKey: string` as a separate optional field on `pieceDef`,
`squareTypeDef`, `ruleCardDef` and `skillCardDef`. `SCHEMA_VERSION` goes 6 → 7.
`artKey` is an **art id**, resolved against a UI-side registry — it is *not* an
i18n key and is *not* walked by `textKeysOf`.
**Absent-case rule (mandatory):** resolution is a three-level chain —
`artKey` → registered art; else `iconKey` → translated glyph; else first grapheme
of the translated `nameKey` as a monogram; else `?`. Two degenerate cases fall
through to the glyph level rather than rendering a broken image:
- an **unknown** `artKey` — present in content, absent from the registry;
- a **shape-mismatched** entry — an id registered as `{neutral}` but read for a
  sided piece, or an id registered as `{white,black}` but read for a square type
  or card. Nothing in the schema can stop a piece and a square type from sharing
  one `artKey` string, so the **resolver**, not the type system, is where that is
  made safe.

Tests assert every level and both degenerate cases.
**Consequences:**
- ✅ The existing glyph path and its tests stay alive and keep working for every
  record without art — which is all of them until the later batch.
- ✅ ADR-011 survives: content chooses an art id; the UI owns the catalogue of
  ids and still names no piece, card or square type.
- ✅ `src/editor/io.ts` refuses documents declaring a version above
  `SCHEMA_VERSION`, so the bump is what lets a v7 export be re-imported.
- ⚠️ Two icon-ish fields now exist. The precedence rule above is the only thing
  preventing "which one wins?" ambiguity, so it is tested, not documented.
**Rejected alternatives:**
- Reuse the `iconKey` value as an art id — rejected: glyph and art would share
  one slot, so a record could have one or the other but never a glyph fallback
  behind its art, breaking the chain that is already under test.
- Literal asset path in content — rejected: collides with AC-016's literal ban
  and lets an imported document name an arbitrary path.
**Source:** Interview #6

### ADR-007: Side is carried by two art variants per piece
**Status:** Accepted (2026-08-06, via /hm:plan interview)
**Context:** Today the two sides separate by hue **and** weight **and** lightness
(`tokens.css:82`, `styles.css:616-620`) — deliberately, because roughly one in
twelve boys reads red/green poorly. Raster art cannot inherit those tokens.
**Decision:** Each piece art id resolves to two assets, one per side. The
registry is keyed `(artId, side)`. Non-sided content (square types, cards)
resolves to a single asset.
**Consequences:**
- ✅ The non-hue safeguard survives, because the luminance separation moves into
  the generated art itself.
- ✅ No CSS tinting of illustrations, which never looks intentional.
- ⚠️ 6 pieces become 12 assets, and the constraint "the two sides must differ in
  luminance, not only in hue" becomes a *generation-prompt* requirement that
  nothing enforces automatically — which is why Phase 4 builds a harness that
  measures it.
**Rejected alternatives:**
- One variant + CSS side ring/base — rejected: halves the assets and keeps colour
  tokens live, but leaves the two armies looking identical, which is a worse
  failure on a board than anywhere else.
- Two variants *and* a base ring — rejected: full cost of both, and the RESEARCH
  pitfall on cue saturation says the board's visual channels are nearly spent.
**Source:** Interview #7

### ADR-008: The editor's art picker is deferred; authored records use the fallback chain
**Status:** Accepted (2026-08-06, via /hm:plan interview)
**Context:** ADR-017's absent-case rule exists so authored content is never
second-class, and the global 2026-06-08 correction says an optional-field feature
must define its absent case explicitly.
**Decision:** No editor UI in this cycle. An authored record has no `artKey` and
renders through the glyph → monogram chain, exactly as today.
**Consequences:**
- ✅ No editor UI is built now and rebuilt by Phase 9/10's IA restructure.
- ⚠️ Once the art batch lands, authored pieces will visibly differ from bundled
  ones until the picker ships. That gap is a **required scope item of the art
  batch phase**, not an open question — recorded here so it cannot be forgotten.
**Rejected alternatives:**
- Picker now — rejected: Phase 9/10 (ADR-019/ADR-026) rebuilds the editor's
  browse→detail IA, so the control would be built against a screen that is about
  to be replaced.
**Source:** Interview #8

### ADR-009: Art assets are bundler-imported, never placed in `public/`
**Status:** Accepted (2026-08-06, defaulted — not asked, failed common-ground)
**Context:** `vite-plugin-sw.ts:30-40` states it outright: `public/` is copied
outside the Rollup bundle, so the generated worker's `...assets` list never
contains it and every such file must be enumerated by hand — and records that the
maskable icon was missed on the first pass.
**Decision:** Every art asset is imported from `src/ui/art/`, so Vite emits it
into the bundle with a hashed filename and the service worker precaches it
automatically.
**Consequences:**
- ✅ The offline app cannot ship with art that renders in dev and vanishes when
  installed — the highest-probability defect in this whole plan.
- ✅ Cache busting is free; a changed asset changes the precache hash and the
  worker's cache name.
- ⚠️ Assets are import-time module references, so a dynamically-composed art id
  cannot resolve to a file that was never imported. The registry must therefore
  be an explicit static map, not a template-string path builder.
**Rejected alternatives:**
- `public/art/` + hand-maintained precache list — rejected: the plugin's own
  comment records that exact list going stale once already.
**Source:** Defaulted from RESEARCH pitfall #3

### ADR-010: The contract lands with exactly one real asset as a pipeline proof
**Status:** Accepted (2026-08-06, defaulted — not asked, failed EIG)
**Context:** ADR-005 defers art production, but a contract whose only exercised
path is the *absent* case is precisely the black hole the 2026-06-08 correction
describes — and ADR-009's failure mode (asset missing from the precache) is
invisible until a real asset is in a real production build.
**Decision:** Phase 3 wires exactly one bundled **square type** to real art and
verifies the emitted `sw.js` precache contains it. A square type, not a piece:
the square mark is already its own visual layer, so one illustrated mark among
emoji does not make the board incoherent the way one illustrated king would.
**Consequences:**
- ✅ Bundler → hashed emit → precache → render → dark mode is proven, not assumed.
- ⚠️ One bundled square type looks different from the other four until the batch
  lands. Accepted, and reversible by removing one `artKey` line.
**Rejected alternatives:**
- Zero real assets (test fixtures only) — rejected: a fixture imported only by a
  test never enters the production bundle, so the precache path stays untested.
- One illustrated piece — rejected: pieces are the board's primary read, and
  ADR-007 would require two assets to prove one thing.
**Source:** Defaulted from the 2026-06-08 absent-case correction

### ADR-011: An art id names the picture and may never echo a content id
**Status:** Accepted (2026-08-07, discovered during /hm:execute)
**Context:** The first registry entry was written `art.square.bomb`, mirroring
the content id under an `art.` prefix. `tests/structure/no-content-in-engine.test.ts`
substring-scans `src/ui` for every bundled content id and failed the build: the
mirrored id CONTAINS the content id, so by that test's rule the UI named a
square type. The rule is right and predates this work.
**Decision:** An art id is `art.` plus ONE segment naming the thing depicted.
Never the record's `<kind>.<slug>` form. `art-key.test.ts` enforces it over the
whole catalogue, so the batch of 43 cannot reintroduce it one file at a time.
**Consequences:**
- ✅ ADR-011 of `PLAN-ui-ux-productization` survives contact with the art axis.
- ✅ The failure message names the offending ID, not just the file.
- ⚠️ The scan does not distinguish code from prose, so **comments in
  `src/ui` cannot spell out content ids either** — the second thing it caught was
  the comment written to explain the first. Documented in `registry.ts`.
**Rejected alternatives:**
- Allow-list `registry.ts` in the structural guard — rejected: it would exempt
  the one file most likely to accumulate content names.
**Source:** Discovered by an existing test in /hm:execute Phase D

### ADR-012: Surface contrast is measured per-surface, at the mark's edges, not as a mean
**Status:** Accepted (2026-08-07, discovered during /hm:execute)
**Context:** Phase 4's harness as planned measured each asset's mean luminance
against every board tone. Run against the first real asset it produced two
failures, and BOTH were the harness being wrong rather than the art:
1. It gated a square-type mark against the plain checker. A square mark is only
   ever drawn on a PAINTED square, so it was rejecting art for failing on a
   background it never touches. Strict in the wrong direction is still wrong —
   it would train everyone to add exceptions instead of contrast.
2. Against the correct (painted) tones it still failed, because a **mean**
   cannot see an outline. `tokens.css` records that this board's whole legibility
   strategy is the opposite: the glyph's EDGE carries contrast while the fill
   carries hue, and the move dot goes further with a black-on-white sandwich so
   that whatever the square is, one tone separates. A cream mark with a near-black
   ring averages to "cream" and scores as invisible on a light background it in
   fact reads perfectly well against.
**Decision:** Surfaces are derived per asset from a filename prefix
(`piece-` → checker **and** painted, since a piece stands anywhere; `square-` →
painted only; `card-` → surface tokens), and an unclassified filename is a
failure, not a skip. Contrast is measured at the **10th and 90th percentile** of
opaque-pixel luminance, and an asset clears a surface when EITHER end does.
Percentiles rather than min/max so a few antialiased pixels cannot satisfy it.
The side-pair test keeps the **mean**, because "do the two armies differ in
overall lightness" is genuinely a question about the whole mark.
**Consequences:**
- ✅ The gate now encodes the design this board already uses, instead of a
  different one that would have rejected it.
- ✅ Verified in both directions: it passes the real asset, and still rejects a
  flat equal-luminance pair on both the pair rule and the surface rule — a flat
  fill has no edge, so the percentile relaxation cannot rescue it.
- ⚠️ The filename prefix is now load-bearing contract, not convention.
**Rejected alternatives:**
- Declare the surface in the registry entry — cleaner in principle, but the e2e
  harness reads files from disk and cannot import the TS module through
  Playwright's transform. Revisit if the batch needs a surface the prefix cannot
  express.
- Keep the mean and lower the threshold — rejected outright: that is the
  "improve one contrast number by regressing the other" this area's standing
  rule forbids.
**Amendment (2026-08-07, /hm:review round 1).** Two further corrections, both
found by review and both the same class of error as the two above — the metric
measuring something other than what a player sees:
- **Measured at RENDER size, not the asset's native 192px.** Detail that is real
  in the file can be gone once the browser has scaled it into a square on a
  phone; the gate was crediting contrast nobody sees. `renderPxFor` derives the
  box from each wrapper's fixed font-size × `MarkBody`'s `1.15em`.
- **Every visible pixel is COMPOSITED over the surface before measuring.**
  Discarding α<128 and reading the rest uncomposited scored a half-opacity dark
  edge as near-black, when what it renders as is halfway to the square beneath —
  and dropped a 49%-opacity edge from the sample entirely. The profile is now
  re-measured per surface, because compositing makes it depend on the background.

A limit this deliberately does **not** close: the asset is gated at its
**primary** render size, not at the ~13.8px corner badge. No reasonable
illustration carries a 3.3:1 outline unaided at that size, so demanding it would
reject every usable asset while the real rendering is fine. The badge's ring is
carried by CSS instead (`.square-mark[data-occupied='true'] img`, a
`drop-shadow` — `text-shadow` is a text property and was dead on an `<img>`,
so the badge had shipped with no ring at all) and asserted by its own e2e test.
**Source:** Discovered by the harness's own first run in /hm:execute Phase 4;
extended by /hm:review round 1 (code-reviewer + ux-reviewer consensus, codex)

### ADR-013: The pipeline-proof asset is a flat placeholder, not the ADR-002 target
**Status:** Accepted (2026-08-07, capability constraint found during /hm:execute)
**Context:** ADR-010 requires one real asset in the build. ADR-002/ADR-004 make
the target illustrated/storybook via image generation. The executing session has
no image-generation capability, so the storybook asset could not be produced.
**Decision:** Ship a deliberately-designed **flat** mark for the one proving
record, generated programmatically and checked in beside the script that made it
(`src/ui/art/square-bomb.gen.py`), rather than either faking illustration or
shipping no asset and leaving ADR-010's pipeline unproven.
**Consequences:**
- ✅ The whole chain is proven with a real file: bundler → hashed emit → SW
  precache → render → both themes → offline decode.
- ✅ Better than the emoji it replaces on the one axis that matters here — it is
  platform-independent and its contrast is measured rather than inherited.
- ⚠️ It is **not** the fidelity ADR-002 chose. It must be replaced by the batch,
  and it is one line in `bundled.ts` to remove if it should not ship before then.
- ⚠️ The generator script is Python inside a TypeScript source tree. Kept there
  deliberately, next to the asset: the alternative is an undocumented binary
  blob nobody can regenerate.
**Rejected alternatives:**
- No asset, tests only — rejected: a fixture imported solely by a test never
  enters the production bundle, so ADR-009's failure mode stays untested. That
  was verified, not assumed: swapping the import for a `public/`-style path
  string builds and renders fine, and only the build-output test catches it.
**Source:** /hm:execute Phase 3

## 🏗️ Technical Design

**Current state.** `pieceGlyph` and `iconOf` (`src/ui/MatchHost.tsx:38-72`) take a
content def, read its optional `iconKey`, resolve it through `translate`, and
return a string — falling back to the first grapheme of the translated name, then
to `?`. `textKeysOf` (`src/ui/i18n.ts:64-95`) walks `iconKey` on all four content
kinds so an unresolved icon fails AC-016's coverage check. `SCHEMA_VERSION` is
**6** (`src/content/schema.ts:54`); `src/editor/io.ts:44` refuses any document
declaring a higher version.

**Affected components.**

| Component | Change |
|---|---|
| `src/content/schema.ts` | `artKey: z.string().optional()` on 4 defs; `SCHEMA_VERSION` 6 → 7 |
| `src/ui/art/registry.ts` *(new)* | static `Map<artId, {white,black} \| {neutral}>` of bundler-imported URLs |
| `src/ui/art/resolve.ts` *(new)* | the ADR-006 three-level chain, pure, side-aware |
| `src/ui/MatchHost.tsx` | `pieceGlyph`/`iconOf` call the resolver; render `<img>` when art, `<span>` when glyph |
| `src/ui/Rules.tsx` | same resolver for the rules list icons |
| `src/ui/i18n.ts` | `artKeysOf` walker (registry coverage), separate from `textKeysOf` |
| `src/content/sets/bundled.ts` | one square type gains an `artKey` (Phase 3 only) |
| `src/editor/io.ts` | no logic change — it reads the bumped constant |

**Data flow.** content `artKey` → `resolveMark(artKey, iconKey, nameKey, side, t)`
→ one of `{kind:'art', src}` / `{kind:'glyph', text}` / `{kind:'monogram', text}`.
The renderer switches on `kind`. The UI never sees a content id, only an art id
it already has in its own catalogue — ADR-011 holds.

**API changes.** Content schema gains one optional field on four record types;
the on-disk document version becomes 7. A v6 document loads unchanged (`artKey`
absent → glyph path). A v7 document is refused by a v6 build, which is the
existing, intended behaviour of `io.ts:44`.

## 📝 Implementation Plan

### Phase 1 — Schema v7 `artKey` + coverage walker + migration
- **Status:** DONE (2026-08-07)
- **depends_on:** `[]`
- **parallel_group:** `serial-schema`
- **merge_hazards:** `src/content/schema.ts` (the `SCHEMA_VERSION` constant), `src/editor/io.ts`
- **Scope in:** `src/content/schema.ts`, `src/ui/i18n.ts` (`artKeysOf` only), `tests/content/`, `tests/editor/`
- **Scope out:** any rendering, any asset, any editor control
- **Exit criterion:** `npm run typecheck && npx vitest run tests/content tests/editor` — with new tests asserting (a) a v6 document imports unchanged with `artKey` absent, (b) a v7 document round-trips through export→import, (c) `textKeysOf` does **not** include `artKey`, (d) `io.ts` still refuses version 8.
- **Risk:** low
- **Rollback point:** branch HEAD before Phase 1

### Phase 2 — Art registry + three-level resolution, no assets
- **Status:** DONE (2026-08-07)
- **depends_on:** `[1]`
- **parallel_group:** `serial-render`
- **merge_hazards:** `src/ui/MatchHost.tsx` (`pieceGlyph`/`iconOf`), `src/ui/Rules.tsx`
- **Scope in:** `src/ui/art/registry.ts`, `src/ui/art/resolve.ts`, `src/ui/MatchHost.tsx`, `src/ui/Rules.tsx`, `tests/ui/`
- **Scope out:** assets, editor UI, CSS material work, any change to board layout or cue CSS
- **Exit criterion:** `npx vitest run tests/ui` — with tests asserting all six branches of ADR-006: registered `artKey` → art; **unknown** `artKey` → glyph (not a broken image); **shape-mismatched** registry entry (`{neutral}` read for a sided piece, and `{white,black}` read for a square type) → glyph; absent `artKey` + present `iconKey` → glyph; both absent → monogram; name unresolvable → `?`. Plus: an empty registry leaves every existing board-render test passing unchanged.
- **Risk:** low
- **Rollback point:** Phase 1

### Phase 3 — Pipeline proof: one real asset, end to end
- **Status:** DONE (2026-08-07) — with one honest deviation, see ADR-013
- **depends_on:** `[1, 2]`
- **parallel_group:** `serial-render`
- **merge_hazards:** `vite-plugin-sw.ts` (precache list), `src/content/sets/bundled.ts`
- **Scope in:** one WebP under `src/ui/art/`, `src/ui/art/registry.ts`, one `artKey` line in `src/content/sets/bundled.ts`, `tests/build/precache.test.ts` (new), `vitest.build.config.ts` (new), `package.json` (`test:build` + `verify` scripts), `e2e-pwa/offline.spec.ts`
- **Scope out:** the other 36 icons, piece art, side variants
- **`<img>` sizing (explicit, so it is not read as scope creep):** the art element is sized by an **inline style** on the `<img>` (`width:100%;height:100%;object-fit:contain`), not by a new rule in `styles.css`. An unstyled `<img>` renders at intrinsic size and would break the fixed-aspect square on this phase's own manual pass, so sizing is required here — but Phase 2's "no CSS material work" boundary holds because no stylesheet is touched.
- **Exit criterion:** a new `tests/build/precache.test.ts` reads the built `dist/sw.js` and asserts its `PRECACHE` array contains the asset's hashed filename. Because a fresh checkout has no `dist/`, leaving it in the default glob would break `npm run test` for every contributor who has not just built — so `tests/build/` is **excluded from `vitest.config.ts`** and run by its own `vitest.build.config.ts` behind a new `test:build` script. `verify` becomes `typecheck && build && test && test:build && e2e && e2e:pwa`, which is the only ordering where `dist/` is guaranteed to exist. Full criterion: `npm run verify` passes, `npm run e2e` renders the illustrated square mark, and `e2e-pwa/offline.spec.ts` asserts the asset's `<img>` has `naturalWidth > 0` **while offline** — a direct check, rather than inferring survival from `cache.addAll`'s all-or-nothing install semantics.
- **Risk:** medium — this is the phase that exercises ADR-009's failure mode
- **Rollback point:** Phase 2

### Phase 4 — Side-luminance harness for the later art batch
- **Status:** DONE (2026-08-07) — the metric changed during implementation, see ADR-012
- **depends_on:** `[3]`
- **parallel_group:** `serial-tooling`
- **merge_hazards:** none
- **Scope in:** `e2e/art-contrast.spec.ts`, `work-docs/ART-SPEC-mobile-grade-graphics.md`
- **Scope out:** generating the 43 assets; any change to `tokens.css`
- **Exit criterion:** `npm run e2e` includes a spec that, for every registry entry, draws the asset to a canvas in the browser and reads pixels via `page.evaluate` (Playwright is already a devDependency and the browser decodes WebP natively — no new packages), computing mean relative luminance over non-transparent pixels. Both thresholds are **traceable, not invented**: it **fails** when a sided pair's contrast ratio falls below **2.75:1** — the figure `tokens.css:38-44` records for the two sides against each other today — or when either side's ratio against both board tones falls below **3.30:1**, which is the checker figure recorded in that same block. 3.30 rather than WCAG's 3:1 non-text floor (which `e2e/board-render.spec.ts` already asserts elsewhere) because `[wiki:architecture] board-glyph-rendering` warns explicitly against regressing one of these two numbers while improving the other — art that scores 3.1:1 would pass WCAG and still be worse than what ships today. The spec must fail on a deliberately-bad fixture pair, proving it can fail.
- **Risk:** medium — the harness is what makes the later 43-asset batch verifiable instead of eyeballed; a harness that cannot fail is worse than none
- **Rollback point:** Phase 3

## 🧪 Testing Strategy

- **Unit (vitest).** Schema round-trip and version-refusal (Phase 1); the
  five-branch resolution chain (Phase 2). The unknown-`artKey` branch is the one
  that matters most — it is the only branch a malformed imported document can
  reach.
- **Integration (vitest + Testing Library).** Existing `tests/ui/board-render.test.tsx`
  must pass **unchanged** after Phase 2 with an empty registry; that is the
  regression proof that the glyph path was not disturbed.
- **Build-output test (Phase 3).** `tests/build/precache.test.ts` asserts over
  `dist/sw.js` after a real `npm run build`. Testing the plugin's source instead
  would pass while the offline app shipped without art — the exact defect ADR-009
  exists to prevent. It lives outside the default vitest include (own config +
  `test:build` script) so `npm run test` never depends on a `dist/` that may not
  exist; `verify` is the only place the two are ordered.
- **E2E (Playwright).** Phase 3 renders the asset; `e2e-pwa/offline.spec.ts`
  gains a **direct** `naturalWidth > 0` assertion on the new `<img>` while
  offline. The existing offline spec only checks that the board is visible and
  painted, so without that line the new asset's offline survival would rest on an
  untested assumption about `cache.addAll` failing atomically. Phase 4 adds the
  luminance harness, which runs in the browser precisely so no image-decoding
  dependency is added.
- **Reduced motion.** No phase here adds motion, so the existing
  `prefers-reduced-motion` token assertions are untouched. Any phase that finds
  itself adding a transition has left this plan's scope.
- **Manual.** One pass on a real phone in both themes after Phase 3, checking the
  illustrated square mark against a piece standing on it.

## ⚠️ Risks & Mitigation

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R1 | Asset missing from the SW precache → art renders in dev, blank when installed | high | high | ADR-009 (bundler import, never `public/`) + Phase 3's build-output assertion over `dist/sw.js` |
| R2 | `artKey` / `iconKey` precedence ambiguity produces a broken image on a typo'd key | medium | medium | ADR-006 makes unknown-`artKey` fall through to glyph; Phase 2 tests that branch explicitly |
| R3 | Generated side variants differ in hue only → the colour-blind safeguard silently regresses | high | high | ADR-007 puts the constraint in the art prompt; Phase 4's harness enforces it and must be proven able to fail |
| R4 | Raster art ignores dark mode; illustrations look pasted onto a dark board | medium | medium | Phase 3's manual pass covers both themes on one asset before 42 more are produced |
| R5 | Phase 9/10 ships editor UI that ignores `artKey`, so the contract lands and is never used | medium | medium | ADR-008 records the picker as required scope of the art-batch phase, not as an open question |
| R6 | Bundle weight from 43 WebP assets degrades first load / offline install | medium | medium | Out of this cycle's scope by ADR-005, but Phase 3 records the single asset's byte cost as the per-icon budget baseline |
| R7 | The art batch never happens, leaving a schema field with one user | low | medium | Accepted. The cost of the unused field is one optional property and its fallback test |

## ✅ Success Criteria

- [x] `SCHEMA_VERSION` is 7; a v6 document imports unchanged and a v7 document round-trips.
- [x] `textKeysOf` does not include `artKey`; a separate `artKeysOf` exists for registry coverage.
- [x] **Seven** branches of the ADR-006 resolution chain are covered by tests — the six planned plus the empty-url degenerate case review found (see the ADR's third bullet). Written as six; delivered as seven.
- [x] `tests/ui/board-render.test.tsx` passes unchanged with an empty registry.
- [x] A real `npm run build` emits a `dist/sw.js` whose `PRECACHE` contains the proving asset's hashed filename.
- [x] `npm run test` passes on a **fresh checkout with no `dist/`** — i.e. the build-output test is not in the default vitest include.
- [x] `npm run verify` passes (typecheck + build + unit + **test:build** + e2e + e2e:pwa).
- [x] `e2e-pwa/offline.spec.ts` asserts `naturalWidth > 0` on the new asset while offline.
- [x] Both Phase 4 thresholds are cited to `tokens.css`; no uncited number gates the art batch.
- [x] The Phase 4 harness fails on a deliberately-bad fixture pair.
- [x] No `public/` art directory exists.
- [x] `tokens.css` unchanged. **`styles.css` was NOT** — this criterion is met in the half that matters (no colour token moved, no existing cue rule altered) and **broken in the half as written**: two rules were ADDED, `.square-mark[data-occupied='true'] img` and `.square .piece img`. Review found that `text-shadow` — which both wrappers use for their legibility ring — does nothing to a replaced element, so raster art shipped with no ring in the most common board state. The criterion assumed art could land without touching the stylesheet; that assumption was wrong, and the honest record is the assumption failing rather than a ticked box.

## 🔧 Execution Record (2026-08-07)

All four phases GREEN. `npm run verify` (typecheck → build → 415 unit → 3
build-output → 75 e2e, 1 skipped → 4 PWA e2e) passes end to end.

`tests/ui/board-render.test.tsx` was **not edited** and passes — the regression
proof that the glyph path survived. Two existing tests did change, both because
the version bump made them wrong rather than because they were in the way:
`bundled.test.ts`'s schema-version literal (6 → 7, deliberately still a literal),
and nothing else.

**Phase A.5 (test-reviewer): PASS**, 14 scenarios covered, 0 blocking issues,
first attempt.

**Deviations from the PLAN as written**, each with its own ADR above: the art-id
naming rule (ADR-011), the surface-aware percentile metric (ADR-012), and the
flat placeholder asset (ADR-013).

One unplanned change outside the stated scope, recorded rather than folded in
silently: `playwright.config.ts` now reads the dev-server port from `E2E_PORT`
(default unchanged at 5173). The suite was unrunnable here because another
checkout already held 5173 — which the per-task worktree workflow makes routine,
since two tasks in two worktrees are two dev servers. Playwright then dies with
EADDRINUSE before a single test runs. Three lines, no behaviour change to
`npm run e2e`.

### Phase D.5 — newly-reachable window

The bulk of this work is new feature, not repair, so most of it skips D.5. Two
changes WERE repairs, and both are answered here.

**Repair 1 — the art id echo (ADR-011).**
1. *Window opened:* renaming ids from `art.<kind>.<slug>` to `art.<thing>` makes
   reachable, for the first time, a catalogue entry whose id is NOT derivable
   from the record that points at it. Nothing now couples the two strings, so a
   record can point at an id that does not exist, and two records of different
   kinds can point at one id.
2. *Test entering it:* `tests/content/art-key.test.ts` →
   `registers every art id the bundled set actually declares` (the dangling-id
   half) and `tests/ui/art-resolve.test.ts` →
   `falls through to the glyph when a neutral entry is read for a sided piece`
   (the shared-id half). Both are in this same change.
3. *Absent case:* the id is optional and absent on every record but one, which is
   `artKeysOf is empty for a set that declares no art` plus the whole glyph
   fallback chain.

**Repair 2 — the harness metric (ADR-012).**
1. *Window opened:* accepting an asset when EITHER luminance percentile clears
   the threshold newly admits art that a mean would have rejected — which is the
   point, but it also newly admits anything with a few dark pixels if the
   percentile is loose enough.
2. *Test entering it:* `e2e/art-contrast.spec.ts` →
   `the gate rejects a pair that differs in hue alone — proving it can fail`,
   extended in this same change to assert the SURFACE rule rejects a flat fill
   too, not only the pair rule. A flat fill has no edge, so both percentiles sit
   on the fill and neither can rescue it. That is the assertion standing between
   the relaxation and "everything passes".
3. *Absent case:* an asset with no opaque pixels throws rather than returning a
   silent zero; an art directory with no sided pairs **skips visibly** rather
   than passing vacuously.

**Not covered, stated rather than left silent:** the sided-pair rule
(`PAIR_MIN`) has no real asset to run against and is `test.skip`-ped with a
reason until the batch lands. Its predicate is exercised by the fixture proof,
but no shipped file has passed through it.

## 🔍 Plan Validation

**Cross-model second opinion:** `codex` — **skipped**. Side preset gates every
enabled model on a high-diff change; `hm high_diff classify` returned
`{"boundary": false, "is_high": false}` for this stage's diff. Verdict below is
Claude-only, which is valid without any second-opinion model.

**plan-validator outcome:** `NEEDS_REVISION` — 0 critical, 3 warnings, 3
suggestions. Clean categories: rollback-strategy, missing-interview-rounds,
risk-register. Every `file:line` citation in the draft was independently
re-checked by the validator and found accurate.

All six were resolved by **revising the plan**; none went to a follow-up
interview round, because each had exactly one defensible answer (the 5-term gate
scored them `confidence ≥ τ` with no user-facing trade-off), and none was
accepted as risk.

| # | Sev | Finding | Resolution |
|---|---|---|---|
| 1 | warning | Phase 3's `dist/sw.js` assertion named no runnable command; adding it to the default vitest glob would break `npm run test` on a fresh checkout with no `dist/` | Phase 3 now names `tests/build/precache.test.ts` + `vitest.build.config.ts` + a `test:build` script, and `verify` becomes the only place `build` and that test are ordered |
| 2 | warning | ADR-006's chain had no rule for a registry entry whose shape mismatches the content kind (`{neutral}` read for a sided piece) — unreachable until the art batch, i.e. after this plan closes | ADR-006 gains an explicit shape-mismatch rule (falls through to glyph, same as unknown); Phase 2's exit criterion goes from five branches to six |
| 3 | warning | Phase 4's `3.5:1` board-tone threshold was **invented** — `tokens.css:38-44` records 3.30:1 (checker) and 3.99:1 (painted), and no source in the repo states 3.5 | Replaced with **3.30:1**, cited. 3.30 rather than WCAG's 3:1 because `[wiki:architecture] board-glyph-rendering` forbids regressing one contrast number while improving the other |
| 4 | suggestion | Phase 3 is the first phase to paint a real `<img>` in a fixed-aspect square, but its scope named no sizing mechanism | Phase 3 gains an explicit `<img>` sizing line — inline style, no stylesheet touched, so Phase 2's "no CSS material work" boundary stays intact |
| 5 | suggestion | `e2e-pwa/offline.spec.ts` only checks the board is visible and painted, so offline art survival rested on `cache.addAll`'s atomic-install semantics | The offline spec gains a direct `naturalWidth > 0` assertion on the new asset |
| 6 | suggestion | ADR-001's "45+ Playwright specs keyed on `.square`" overstated precision — a literal `.square` grep hits 2 files | Softened to the figure a grep supports (~149 `.square` / `data-square*` occurrences across 12 files) |

No second validator pass was run: the resolution path is revision-only with no
critical findings, and the procedure's re-run is reserved for `MAJOR_REVISION`.
