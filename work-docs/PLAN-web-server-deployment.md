---
type: plan
task_slug: web-server-deployment
status: complete
created: 2026-08-08
tags: [chess-craft, plan, cloudflare-workers, vite, pwa, routing, desktop-layout]
research_doc: "[[RESEARCH-web-server-deployment]]"
interview_rounds: 4
adrs: 9
validator_outcome: MAJOR_REVISION_RESOLVED
completed: 2026-08-08
summary: "Ship the SPA on Cloudflare Workers with real URLs, then build the ≥1280px desktop layout."
---

# PLAN — Web deployment + desktop layout

## 🎯 Executive Summary

**TL;DR** — Put the existing PWA on a public URL via Cloudflare Workers Static Assets and
give it real History-API routes (Phases 1–4); then build the desktop layout that does not
exist today, across all six routes, at ≥1280px (Phases 5–10).

**What.** Two tracks in one PLAN, sequenced. Track A makes `https://<name>.workers.dev`
serve the app, with per-screen URLs, correct cache headers, an offline-safe service worker
under client-side routing, and a GitHub Actions pipeline that refuses to deploy code that
fails `npm run verify`. Track B replaces the current "phone column stretched into a
1100×900 box" with a two-column desktop shell — left nav rail, board column, side rail —
and gives desktop its own type scale, pointer affordances, and test coverage.

**Why.** The app is a fully local React+Vite PWA with no server, no CI, and a single URL
(`src/ui/App.tsx:61` declares the `Route` union; `:99` holds it in `useState`). Nothing
about it is reachable by anyone else. And at ≥900px the only
thing that changes is the shell's box size (`src/ui/styles.css:147-152`); every child is
still the 390px phone layout. RESEARCH established both facts first-hand; see
[[RESEARCH-web-server-deployment]].

**Key decisions.**

| Decision | ADR |
|---|---|
| Cloudflare Workers + Static Assets (not Pages, not Vercel, not GH Pages) | [ADR-001](#adr-001-host-on-cloudflare-workers-with-static-assets) |
| Deploy track lands before desktop track, one PLAN | [ADR-002](#adr-002-deploy-first-desktop-second-in-one-plan) |
| History-API routing now, not deferred to multiplayer | [ADR-003](#adr-003-adopt-history-api-routing-now) |
| No multiplayer groundwork in this task; only a non-blocking constraint | [ADR-004](#adr-004-no-multiplayer-groundwork-only-a-non-blocking-constraint) |
| Two-column desktop at ≥1280px, all six routes, device frame retired above 1280 | [ADR-005](#adr-005-two-column-desktop-shell-at-1280px-across-every-route) |
| 1280px floor, no upper cap; 900px block deleted so 900–1280 is the phone frame | [ADR-006](#adr-006-1280px-floor-no-upper-cap-and-the-900px-block-is-deleted) |
| Pointer affordances expressed in the bevel language, gated on `hover: hover` | [ADR-007](#adr-007-pointer-affordances-in-the-bevel-language) |
| Desktop rules live in `src/ui/desktop.css`, one media query | [ADR-008](#adr-008-desktop-rules-live-in-a-separate-desktopcss-layer) |
| Deploy is automatic on `master` push, gated on `npm run verify` | [ADR-009](#adr-009-deploy-automatically-on-master-push-gated-on-npm-run-verify) |

**Estimated impact.** New: `wrangler.jsonc`, `public/_headers`, `src/ui/router.ts`,
`src/ui/desktop.css`, `.github/workflows/deploy.yml`, plus specs. Modified: `App.tsx`,
`TabBar.tsx`, `styles.css`, `vite-plugin-sw.ts`, `playwright.config.ts`,
`e2e/layout.spec.ts`, `package.json`. Untouched: `src/engine/`, `src/content/`,
`src/editor/` logic, `tokens.css` colour values.

## 🚫 Non-Goals

The canonical scope-drift list. A diff that touches anything below has exceeded its
authorization, whichever phase produced it.

| Not doing | Where the decision lives |
|---|---|
| Any multiplayer implementation — no server room, no WebSocket, no action log, no `viewFor` implementation | ADR-004 |
| Any change under `src/engine/` — `apply()` stays pure, `GameState` stays serializable, no game logic moves into a component | ADR-004 (binding constraint) |
| Any change to `src/content/`, `src/editor/` logic, or `src/i18n/` | Technical Design → Affected components |
| Any colour value change in `tokens.css`; any lowering of a contrast floor | ADR-007, and the pixel-redesign rule (move the colour, never the floor) |
| Adding a router library (`react-router` or equivalent) | ADR-003 |
| A three-column desktop layout | ADR-005 (rejected: no content for the third rail yet) |
| A tablet-specific layout band for 900–1280px | ADR-006 (rejected: that band becomes the phone frame) |
| Full board keyboard navigation (arrow-key square traversal) | ADR-007 (not rejected on merit; out of scope) |
| A custom domain | ADR-001 (attachable later with no code change) |
| A second locale | RESEARCH Open Question 8 (out of scope unless asked) |
| Per-screen CSS file split (`play.css`, `editor.css`, …) | ADR-008 (rejected: unreviewable diff) |

## 📚 Prior Work

- **[[RESEARCH-web-server-deployment]]** — the source for every citation below. Its
  Pitfalls section is treated as a requirements list, not as advice.
- **[[PLAN-ui-ux-productization]]** — `work-docs/PLAN-ui-ux-productization.md:249` names
  portrait mobile web as the primary layout target, "device at arm's length rather than a
  desktop monitor". ADR-005 reopens that constraint deliberately.
- **[[REVIEW-chess-craft-pixel-redesign-2026-08-07]]** — the redesign that removed the
  earlier two-column play layout and established the single-theme bevel language every
  desktop rule here must keep.
- **Memory `[fail:design] condition-narrower-than-its-case`** — a complete two-column
  desktop layout existed for phases and never rendered, because its query was
  `(orientation: landscape) and (max-height: 560px)`. Two consequences are wired into this
  PLAN: Phase 5 deletes the ambiguous 900px block rather than adding a third band beside
  it, and every new breakpoint gets an e2e assertion at both sides of its boundary.
- **Memory `[wiki:architecture] pwa-service-worker-and-updates`** — `cache.addAll` is
  atomic, `public/` assets never appear in `Object.keys(bundle)`, and cache reads match by
  URL string. Phase 3 exists because of this entry.
- **Memory `[fail:design] absent-case = feature black hole`** (global CLAUDE.md,
  2026-06-08) — a feature that activates on an optional condition must define the absent
  case. Applied here to the 900–1280 band: ADR-006 names what that band *is* rather than
  leaving it to fall through.

## 🎙️ Interview Transcript

| # | Topic | Category | Question | Options | Choice | Note | → ADR |
|---|---|---|---|---|---|---|---|
| 1 | Deploy vs desktop ordering | Phasing | 배포와 데스크톱 재설계의 순서 | deploy-first / desktop-first / all-at-once / deploy-only | **deploy-first** | 짧은 피드백 루프 우선; 초기 노출되는 데스크톱 미완성은 수용 | ADR-002 |
| 2 | Domain | Contract | 배포 도메인 | workers.dev / custom / decide-later | **workers.dev** | 루트 경로라 `scope:"/"`·SW precache 무변경 | ADR-001 |
| 3 | URL routing timing | Contract | History API 도입 시점 | now-history / now-hash / defer | **now, History API** | 방 링크의 전제이자 SPA fallback 의 유일한 실검증 경로 | ADR-003 |
| 4 | Multiplayer groundwork | Scope | `Match` 액션 로그 / `viewFor` 구현 | none / actions-only / actions+viewFor | **none** | 서버 설계 전 API 는 추측이 됨; 제약으로만 기록 | ADR-004 |
| 5 | Desktop topology | Architecture | play 화면 데스크톱 형태 | 2-col / 3-col adaptive / keep-cap | **2-column** | 3번째 레일에 넣을 콘텐츠(기보)가 아직 없음 | ADR-005 |
| 6 | Screen scope | Scope | 재설계 대상 화면 | all-6 / play+home / play-only / all+keyboard | **all 6 routes** | Result 오버레이·Sheet 포함 | ADR-005 |
| 7 | Width range | Constraint | 데스크톱 대상 폭 | 1280→∞ / 1280→1600 / 900→∞ | **1280 floor, no cap** | 915×412 가로 폰이 900 을 만족하는 문제 회피 | ADR-006 |
| 8 | Pointer affordance | Architecture | hover 도입 여부 | bevel-hover / none / hover+keyboard | **bevel hover** | 글로우 아닌 베벨 변형; `hover: hover` 게이트 | ADR-007 |
| 9 | Desktop navigation | Architecture | 데스크톱 탭바의 행방 | left rail / top header / keep bottom | **left vertical rail** | `TabBar.tsx` 재사용, CSS 전환 | ADR-005 |
| 10 | 900–1280 band | Risk | 중간 구간의 정체 | revert-to-frame / new-tablet-layout / keep-900-block | **revert to phone frame** | 상태를 딱 3개로; 900px 블록 삭제 | ADR-006 |
| 11 | Deploy trigger | Risk | 배포 트리거 | GH Actions auto / manual wrangler / Actions + dispatch | **Actions on master push** | `npm run verify` 통과가 배포 전제 | ADR-009 |
| 12 | Desktop CSS placement | Architecture | 데스크톱 CSS 위치 | desktop.css / inline-adjacent / per-screen split | **`desktop.css`** | 도달 범위 사고를 한 파일에서 감사 가능 | ADR-008 |
| 13 | Non-vacuity gate placement | Testing | 데스크톱 단언이 공허해지지 않았음을 보장하는 장치 | CI mutation job / in `verify` / one-time + evidence / structural only | **one-time + evidence** | validator MAJOR_REVISION 후속. 재발 방지는 포기하고 R5b 로 수용 | — (no boundary/contract change) |

**Assumptions taken without asking** (each was scored below the 5-term gate's thresholds
and is recorded here so review can challenge it):

- Playwright gains a dedicated `desktop-chrome` project rather than per-describe viewport
  overrides — a project is what makes desktop coverage a suite-wide default instead of an
  opt-in three tests remembered to take.
- Cache headers follow the standard split: hashed assets `max-age=31536000, immutable`;
  `/`, `index.html`, `sw.js`, `manifest.webmanifest` revalidating. Settled by RESEARCH
  Pitfall 2, not a live choice.
- Route path strings are `/`, `/lobby`, `/play`, `/dex`, `/edit`. `boot` and the `Result`
  overlay get no URL — `Result` is explicitly not a route (`src/ui/App.tsx:52-56`).
- The editor's desktop form is a two-column form + live preview, following ADR-005's
  two-column principle. Its detailed composition is an execute-stage design judgment, not
  an ADR (no component boundary or contract changes).
- Page-level layout uses media queries; component-level reflow inside a rail uses
  `@container`, extending the existing `.board { container-type: inline-size }` precedent
  (`src/ui/styles.css:1174`).

## 📐 Architecture Decision Records

### ADR-001: Host on Cloudflare Workers with Static Assets
**Status:** Accepted (2026-08-08, via /hm:plan interview)
**Context:** The app has no server and needs a public URL, but the stated end state is
online multiplayer. A host chosen only for the static phase would have to be replaced.
**Decision:** Serve `dist/` from a single Cloudflare Worker using the Static Assets
binding with `not_found_handling: "single-page-application"`, published to
`*.workers.dev` for now. A custom domain can be attached later without any code change,
since both are root-path origins.
**Consequences:**
- ✅ Phase 2 of the product (a Durable Object per match room) is a binding plus a class in
  the *same* deployment — no host migration, no second vendor, no cross-origin split.
- ✅ Static-asset requests are free with unlimited bandwidth on the free tier; commercial
  use is permitted.
- ✅ Root-path origin keeps `"start_url": "/"`, `"scope": "/"`, the absolute icon links in
  `index.html`, and the `/`-prefixed precache list in `vite-plugin-sw.ts` valid untouched.
- ⚠️ Vendor concentration: hosting, realtime and storage all become Cloudflare. The engine
  stays portable (it is pure functions); the future room layer would not be.
- ⚠️ Durable Objects require a paid Workers plan (~$5/mo) at the point multiplayer ships.
  Nothing in this task incurs it.
**Rejected alternatives:**
- *Cloudflare Pages* — fully supported with no forced migration, but Cloudflare's own
  guidance for greenfield projects is Workers, and Pages would need a migration precisely
  when the backend arrives.
- *Vercel / Netlify* — equivalent for the static phase, but the backend then lives on a
  separate origin, which is the "확장이 쉽도록" cost the user asked to avoid. Vercel's
  Hobby tier is additionally non-commercial only.
- *GitHub Pages (project page)* — actively broken here. `manifest.webmanifest` declares
  `scope: "/"`, `index.html` links `/manifest.webmanifest` and `/icons/*`, and
  `vite-plugin-sw.ts` precaches `/` plus `/${filename}`. Under `/chesscraft/` every one
  404s, and `cache.addAll` is atomic — the whole offline cache silently becomes empty.
- *Self-hosted VPS* — full control, paid for with TLS, uptime and patching on a project
  whose entire runtime dependency list is `react` and `zod`.
**Source:** Interview #2, RESEARCH Approaches A1–A4

### ADR-002: Deploy first, desktop second, in one PLAN
**Status:** Accepted (2026-08-08, via /hm:plan interview)
**Context:** The two tracks differ ~3× in size. Merging them hides the URL behind the
largest piece of work; splitting them into separate task slugs loses the shared decisions
(routing, breakpoints, test harness).
**Decision:** One PLAN, two tracks. Phases 1–4 put the app on a URL. Phases 5–10 build the
desktop layout. Phase 5 declares `depends_on: [4]`.
**Consequences:**
- ✅ A working URL exists after Phase 4, and the desktop work is then designed against a
  real deployed build rather than a dev server.
- ✅ Each track has its own rollback point; a stalled desktop track does not un-deploy.
- ⚠️ Between Phase 4 and Phase 10 the public URL renders the current desktop layout — a
  1100×900 box of stretched phone UI. This is accepted knowingly, not overlooked.
- ⚠️ `depends_on: [4]` on Phase 5 is a *sequencing* dependency from this ADR, not a
  technical one; the two tracks share no files. Execute must not infer a technical
  ordering from it. Phase 5 carries `sequencing_only: true` so the distinction is
  machine-readable: **if the harness ever prunes `depends_on` entries by file overlap to
  widen parallelism, this entry must be excluded from that pruning.** Phase 5's
  `merge_hazards` shows no overlap with Phases 1–4, so a naive optimizer would drop it and
  silently reverse this ADR.
**Rejected alternatives:**
- *Desktop first* — the biggest work item would proceed with no deployed-environment
  feedback, and the URL would arrive last.
- *Separate task slugs* — the breakpoint decisions and the Playwright desktop project are
  needed by both tracks; duplicating them across slugs invites drift.
**Source:** Interview #1

### ADR-003: Adopt History API routing now
**Status:** Accepted (2026-08-08, via /hm:plan interview)
**Context:** Navigation is a single `useState` union over six routes (`src/ui/App.tsx:61`,
held at `:99`)
with no `pushState` anywhere. There is one URL. A shareable room link is the first thing
online multiplayer needs, and the host's SPA-fallback setting has no code path that
exercises it today.
**Decision:** Introduce History-API routing in this task. Paths: `/` → home, `/lobby`,
`/play`, `/dex`, `/edit`. `boot` and the `Result` overlay stay URL-less.
**Consequences:**
- ✅ The browser Back button works, screens are linkable, and `/room/<id>` later is an
  added route rather than a routing retrofit.
- ✅ The Worker's `single-page-application` fallback becomes load-bearing immediately, so a
  misconfiguration surfaces in Phase 3 rather than on the first room link.
- ⚠️ The discard-confirm guard (`src/ui/App.tsx:141-148`, `window.confirm` when leaving an
  in-progress match) must now also intercept `popstate`, where the navigation has *already*
  happened. Cancelling means pushing the state back. This is the highest-risk detail in
  Track A and Phase 2 owns it.
- ⚠️ The service worker matches cached entries by URL **string**, so a navigation to
  `/edit` while offline does not match the precached `/`. Phase 3 owns this.
- ⚠️ No router library is added; `react-router` would be the project's third runtime
  dependency for five static paths.
**Rejected alternatives:**
- *Hash routing* — needs no host config and no SW change, but produces `/#/play` as the
  public share link and leaves the real fallback path still untested.
- *Defer to multiplayer* — keeps this task smaller, at the cost of the SPA fallback being
  first exercised by the first room link ever created.
**Source:** Interview #3

### ADR-004: No multiplayer groundwork, only a non-blocking constraint
**Status:** Accepted (2026-08-08, via /hm:plan interview)
**Context:** The engine is already multiplayer-shaped — `apply()` is a pure reducer
(`src/engine/engine.ts:648`), state serializes (`:875`), `viewFor(state, side)` is a
documented per-player seam (`:885`), and RNG has per-domain deterministic substreams
(`src/engine/rng.ts:30`). But `Match` is a state history, not an action log
(`src/engine/match.ts:11-13`), and `viewFor` is the identity function.
**Decision:** Change none of it in this task. Record the two gaps as constraints that
future work must not be blocked from closing.
**Consequences:**
- ✅ No speculative API is invented before the server design that would consume it exists.
- ✅ Track A and Track B stay free of engine churn, keeping `src/engine/` out of the diff
  entirely.
- ⚠️ **Binding constraint on every phase here:** nothing in this task may make `apply()`
  impure, may make `GameState` non-serializable, or may move game logic into a React
  component. Any of those would have to be undone before a server can replay a match.
  Review must check this explicitly.
- ⚠️ `viewFor` returning the full state is a hidden-information leak the moment two
  browsers are involved. Harmless today (pass-and-play), and recorded so it is not
  rediscovered as a security finding later.
**Rejected alternatives:**
- *Add the action log now* — the log's shape is determined by the server's validation and
  reconnection design, neither of which exists. Building it now means guessing, then
  rewriting.
- *Implement `viewFor` now* — requires first deciding whether the game has hidden
  information at all, which is a content design question, not an engineering one.
**Source:** Interview #4

### ADR-005: Two-column desktop shell at ≥1280px, across every route
**Status:** Accepted (2026-08-08, via /hm:plan interview)
**Context:** `src/ui/styles.css:20-21` records the opposite decision — "The phone is the
layout … A chess board stretched to 1400px is not a better chess board" — and `:84-90`
presents desktop as a 390×844 slab on a backdrop. At 1920×1080 that yields a 1100×900 box
with ~820px of pure backdrop and a single stretched column inside.
**Decision:** Reverse it above 1280px. The desktop shell is: a left vertical navigation
rail (the three `TabBar` destinations), a board/content column, and a right side rail
carrying what is currently stacked below the board (turn bar, rule bar, hands, tool row).
The 390×844 device frame does not apply at desktop. All six routes plus the `Result`
overlay and `Sheet` are in scope.
**Consequences:**
- ✅ The window is used. The board is sized by the space it actually has rather than by a
  1100px cap.
- ✅ `TabBar.tsx` is reused as-is; the rail is a CSS presentation change, not a second
  navigation component.
- ⚠️ Reverses a recorded design decision and retires the device-frame aesthetic above
  1280px. The frame survives 480–1280 (ADR-006).
- ⚠️ `Sheet` is a bottom-sheet with a scrim scoped to `.phone`
  (`src/ui/styles.css:1622-1630`, `position: absolute`) and no `max-width`
  (`:1726-1736`). At desktop it needs a centred-modal variant, so `Sheet.tsx` gains a
  presentation concern it does not have today.
- ⚠️ Largest single work item in the PLAN — four phases (6–9).
**Rejected alternatives:**
- *Three-column adaptive (the lichess model)* — the right long-term shape, but the third
  rail's natural content is move history, which this game does not record for display yet.
  Building an empty rail now is speculative.
- *Keep the 1100px cap, restructure inside it* — preserves the frame aesthetic and is much
  smaller, but leaves 820px of backdrop at 1920px, which is the complaint.
- *Play screen only* — cheapest, and explicitly rejected by the user in favour of full
  scope.
**Source:** Interview #5, #6, #9

### ADR-006: 1280px floor, no upper cap, and the 900px block is deleted
**Status:** Accepted (2026-08-08, via /hm:plan interview)
**Context:** Two viewport bands exist today: `(min-width: 480px) and (min-height: 700px)`
turns the shell into a device frame, and `(min-width: 900px)` lifts its cap to
`min(94vw, 1100px)`. The second band has no layout of its own — it is the phone layout in a
bigger box. A 915×412 landscape phone satisfies `min-width: 900px`, which is the exact
shape of the recorded failure `[fail:design] condition-narrower-than-its-case`.
**Decision:** Three states, no gaps and no overlaps.

| Band | Presentation |
|---|---|
| `< 480px`, or height `< 600px` | Phone column, full bleed |
| `≥ 480px and ≥ 700px`, below 1280px | Phone column inside the 390×844 device frame |
| `≥ 1280px and ≥ 600px` | Two-column desktop shell, no frame, no width cap |

The `@media (min-width: 900px)` block is **deleted**, not narrowed. The width axis is
partitioned exactly: the frame band's upper bound is the desktop band's literal
complement, `not (min-width: 1280px)`, rather than a `max-width: 1279.98px` epsilon —
viewport widths are fractional, and the epsilon idiom leaves `(1279.98, 1280)` matching
neither band, which renders as an unframed 390px column on a wide window. No integer-width
test can see that, so it is closed by construction.

**Amended during review — the two height floors differ, and originally did not.** Both
bands were given `min-height: 700px`, 700 being the frame band's number, which it needs
because it draws an 844px-tall device. The desktop band draws nothing of the sort and the
copied floor excluded a viewport nobody had considered: a maximized browser on a 1366×768
laptop has roughly 630px of viewport height. Those machines had been served by the deleted
`min-width: 900px` block, which carried no height term at all — so as first written this
ADR made a common budget laptop **worse** than before the change, handing it a 390px phone
column. The desktop floor is 600px. A landscape phone is ~412px tall and is excluded by the
1280px width in any case; `e2e/layout.spec.ts` pins both edges (1366×640 takes the desktop
shell, 915×412 does not).
**Consequences:**
- ✅ Every viewport belongs to exactly one named state; the absent-case black hole is
  closed by construction.
- ✅ No upper cap — 2560px keeps widening rather than snapping back to a centred column.
- ⚠️ Tablet-landscape (1024×768) now renders as the device frame rather than the 1100px
  box. That is a visible change for that viewport, and it is the intended one: nobody had
  designed the 900–1280 band.
- ⚠️ The desktop query's height floor must be asserted in e2e at both sides of each
  boundary (1279/1280, and 915×412), or the failure mode recurs unobserved.
**Rejected alternatives:**
- *A dedicated tablet layout for 900–1280* — one more state to design and test, for a form
  factor with no evidence of use here.
- *Keep the 900px block* — leaves the undesigned band exactly as it is.
**Source:** Interview #7, #10

### ADR-007: Pointer affordances in the bevel language
**Status:** Accepted (2026-08-08, via /hm:plan interview)
**Context:** `src/ui/styles.css:253-254` states there is deliberately no hover state: "A
block that lights up on hover would look like glass." Every control's shape *is* its bevel.
Desktop users get no feedback before clicking.
**Decision:** Add hover, expressed as a bevel change (lift or offset), never as a glow or
brightness shift. Gated on `@media (hover: hover)` so touch devices are unaffected.
**Consequences:**
- ✅ Mouse users get interactive feedback without the glass look the original rule was
  guarding against.
- ✅ `hover: hover` keeps the sticky-hover artefact off touch devices.
- ⚠️ Every hovered surface must still pass `tests/ui/art-contrast.test.ts`. The recorded
  rule from the pixel redesign holds: a colour that fails a contrast floor is moved, never
  is the floor lowered.
- ⚠️ Board squares carry `min-height: 0` (`styles.css:1203-1207`) to opt out of the 44px
  minimum; hover on a square must not change its box size or the board reflows on mouse
  move.
**Rejected alternatives:**
- *No hover* — preserves the recorded decision, leaves desktop users unable to tell what
  is interactive.
- *Hover plus full board keyboard navigation* — larger accessibility win, but a separate
  phase with its own tab-order conflicts. Not rejected on merit; out of scope here.
**Source:** Interview #8

### ADR-008: Desktop rules live in a separate `desktop.css` layer
**Status:** Accepted (2026-08-08, via /hm:plan interview)
**Context:** `src/ui/styles.css` is ~2,500 lines with three media queries. Adding desktop
variants for six routes inline would add dozens of `@media` blocks scattered through it.
**Decision:** A new `src/ui/desktop.css`, imported after `styles.css`, containing a single
`@media (min-width: 1280px) and (min-height: 600px)` block that holds every desktop
redefinition.

**Clarified during execute:** "one media query" means one query that can *reach* a
viewport. The pointer affordances (ADR-007) are wrapped in a nested
`@media (hover: hover)`, which cannot widen the band's reach — only narrow it from within —
and forbidding it would forbid the correct way to write a hover rule. The invariant
`tests/ui/shell-layout.test.ts` enforces is therefore: exactly one query carrying a viewport
*dimension*, and it must be the outermost one.
**Consequences:**
- ✅ "What does desktop change?" is answerable by reading one file, and the media query's
  reach is auditable in one place — the direct countermeasure to
  `condition-narrower-than-its-case`.
- ✅ Deleting the desktop layer wholesale is a one-line import removal, which makes the
  rollback for Phases 5–10 trivial.
- ⚠️ One component's rules now live in two files. Mitigation: `desktop.css` mirrors
  `styles.css`'s section order and comment headers so the counterpart is findable.
- ⚠️ Import order becomes load-bearing. `desktop.css` must be imported after `styles.css`;
  a lint-free reorder would silently drop specificity ties. An assertion in
  `tests/ui/shell-layout.test.ts` pins the order.
**Rejected alternatives:**
- *Inline adjacent blocks* — keeps a component's rules together, at the cost of a
  3,500-line file with scattered media queries and no single place to audit reach.
- *Per-screen CSS split* — cleanest end state, but a large unrelated file move that would
  make this task's diff unreviewable.
**Source:** Interview #12

### ADR-009: Deploy automatically on `master` push, gated on `npm run verify`
**Status:** Accepted (2026-08-08, via /hm:plan interview)
**Context:** There is no CI configuration in the repo. `npm run verify` chains typecheck,
build, vitest, build-tests, e2e and e2e-pwa, and is the authoritative gate — but it runs
only where someone remembers to run it.
**Decision:** `.github/workflows/deploy.yml` runs `npm run verify` on push to `master`,
and runs `wrangler deploy` only if it passes. The Cloudflare API token is a repository
secret.
**Consequences:**
- ✅ Unverified code cannot reach the public URL, by construction rather than by
  discipline.
- ✅ The deploy pipeline stops being "someone's laptop".
- ⚠️ `npm run verify` includes two Playwright suites, so CI needs a browser install step
  and a run takes minutes. Accepted: the alternative is a fast pipeline that proves less.
- ⚠️ A repository secret is introduced. It must be a scoped Workers-deploy token, never an
  account-global API key.
- ⚠️ A failing e2e blocks deploy. That is the intent, and it also means a flaky test blocks
  release — `playwright.config.ts:22` already sets `retries: 1` under CI.
**Rejected alternatives:**
- *Manual `wrangler deploy`* — fastest to first URL, no secret to manage, and leaves the
  verify gate optional.
- *Actions for verify, `workflow_dispatch` for deploy* — a reasonable middle, rejected
  because the release decision here has no stakeholder review step that would use the
  pause.
**Source:** Interview #11

## 🏗️ Technical Design

### Current state

- React 18 + Vite 8 SPA, TypeScript, runtime deps `react`, `react-dom`, `zod`, `galmuri`.
- No backend, no network calls: `fetch`/`WebSocket` appear nowhere in `src/`.
- Navigation is `useState<Route>` over `'boot' | 'home' | 'lobby' | 'play' | 'edit' | 'dex'`
  (type at `src/ui/App.tsx:61`, state at `:99`); one URL; no `pushState`.
- Hand-built service worker generated at build time by `vite-plugin-sw.ts`; precache list
  is `/`, `/manifest.webmanifest`, three icons, and every hashed bundle entry.
- Three media queries total (`styles.css:136`, `:147`, `:2515`); `tokens.css` has none.
- Playwright: one project, `Pixel 7` (412×915), in both configs. `e2e/layout.spec.ts`
  overrides to 360×640, 768×1024, 915×412, and 1440×900.
- No CI, no deploy configuration, no `wrangler` dependency.

### Affected components

| Area | Files | Track |
|---|---|---|
| Hosting config | `wrangler.jsonc` (new), `public/_headers` (new), `package.json` | A |
| Routing | `src/ui/router.ts` (new), `src/ui/App.tsx` | A |
| Service worker | `vite-plugin-sw.ts`, `e2e-pwa/` | A |
| CI | `.github/workflows/deploy.yml` (new) | A |
| Desktop layer | `src/ui/desktop.css` (new), `src/ui/main.tsx` (import), `src/ui/styles.css` (delete 900px block) | B |
| Navigation rail | `src/ui/TabBar.tsx`, `src/ui/App.tsx` | B |
| Screens | `styles.css` + `desktop.css` rules for play/home/lobby/rules/result/editor, `src/ui/Sheet.tsx` | B |
| Test harness | `playwright.config.ts`, `e2e/layout.spec.ts`, new desktop specs | B |

Explicitly untouched: `src/engine/`, `src/content/`, `src/editor/` logic,
`src/i18n/`, and every colour value in `tokens.css`.

### Dependencies

- **Added (dev):** `wrangler`. No new runtime dependency; no router library (ADR-003).
- **External:** a Cloudflare account and a scoped Workers-deploy API token stored as a
  GitHub repository secret (ADR-009).

### Architecture

```
 Browser ──GET /edit──▶ Cloudflare Worker
                          ├─ asset match?  ── yes ─▶ hashed asset, immutable
                          └─ navigate?     ── yes ─▶ index.html (rewrite, NOT redirect)
                                                        │
                                                  registers /sw.js
                                                        │
                              offline navigation to any path ─▶ precached '/'
```

```
 ≥1280 shell                       <1280 shell
 ┌────┬────────────┬────────┐      ┌──────────────┐
 │nav │            │ turn   │      │   screen     │
 │rail│   board    │ rule   │      │              │
 │    │            │ hands  │      ├──────────────┤
 │    │            │ tools  │      │  tab bar     │
 └────┴────────────┴────────┘      └──────────────┘
```

### Design decisions

- **Routing is a module, not a library** (ADR-003). `src/ui/router.ts` exports a pure
  `pathToRoute(pathname): Route` / `routeToPath(route): string` pair plus a
  `usePathRoute()` hook. Purity is deliberate: the mapping is unit-testable under vitest
  without a browser, which is where `[fail:test] test-setup-hides-the-failure-path` was
  learned.
- **The discard guard moves before the navigation** (ADR-003). `go()` can refuse
  in-process; `popstate` cannot — the URL has already changed. Phase 2 handles cancel by
  pushing the previous entry back, and an e2e asserts the match survives a cancelled Back.
- **SW navigation fallback matches by request mode, not by URL** (ADR-003 consequence).
  The worker's fetch handler gains: if `request.mode === 'navigate'` and the cache lookup
  misses, serve the precached `/`. This is the minimum change; the precache list itself is
  unchanged, so `cache.addAll`'s atomicity is not re-armed.
- **Desktop is one query in one file** (ADR-008), with a height floor (ADR-006).
- **Board sizing is re-derived against its container, not the viewport** — today
  `.board-frame { width: min(100%, calc(100dvh - 200px)) }` (`styles.css:1129`) measures
  `100dvh` against the *viewport* while the actual container is capped at
  `min(94vh, 900px)`. In the desktop shell the board column is a grid track, so the rule
  becomes a container-relative `min()` and the 200px chrome constant is replaced by the
  rail's own height, which is zero in the two-column layout.

### Data flow

Route state becomes a two-way binding with `window.location.pathname`:
`user action → go(route) → pushState + setRoute` and
`popstate → guard → setRoute`. Nothing else in the app reads or writes the URL. Game state
remains entirely in React state and `localStorage`; no state is encoded in the URL in this
task (the room code stays the existing long `CRAFT-…` share string).

### API changes

None. No HTTP API, no wire protocol, no schema. The only new contracts are
internal: `router.ts`'s two pure functions and the `_headers` cache policy.

## 📝 Implementation Plan

### Status — /hm:execute, 2026-08-08

| Phase | Status | Note |
|---|---|---|
| 1 Workers config + first deploy | **DONE (partial)** | Config, headers, script, ignore all landed; `wrangler deploy --dry-run` exits 0. **Blocked:** the real-deploy half of the exit criterion — see Blocker B1. |
| 2 History API routing | **DONE** | `src/ui/router.ts` + `App.tsx`; 17 unit, 6 e2e. |
| 3 Service worker under routing | **DONE (no code change)** | The worker's navigate branch was already correct — see the note below. Verification added: `e2e-pwa/routing-offline.spec.ts`. |
| 4 GitHub Actions verify-and-deploy | **DONE (partial)** | `.github/workflows/deploy.yml` written and structurally validated. **Blocked:** a green run — see Blocker B2. |
| 5 Breakpoint restructure + harness | **DONE** | `desktop.css`, 900px band deleted, frame band bounded, `desktop` Playwright project, vacuous assertions replaced. Negative check evidence: [[EVIDENCE-desktop-gate]]. |
| 6 Navigation rail + shell | **DONE** | CSS-only, `TabBar.tsx` untouched as ADR-005 said. Two-sided geometry assertions (rail beside the screen at 1440, bar under it at 1279), absent during a match at both. |
| 7 `play` two-column | **DONE (deviation)** | Board column + side column, board sizing and gap-free side column asserted at 1280/1440/1920. **ADR-005's content split was not achievable in CSS — see below.** |
| 8 Home/Lobby/Rules/Result/Sheet | **DONE** | Readable measure on the list screens; sheet became a centred dialog with a window-wide scrim; `.notice` uncapped and centred. |
| 9 Editor desktop | **DONE (deviation)** | Fixed-pixel grids unpinned (`build-grid` 300→520, `move-grid` 294→420, `tile-grid`/`palette` to auto-fill). **No form/preview split — see below.** |
| 10 Pointer + close-out | **DONE (partial scope)** | Bevel hover under a nested `@media (hover: hover)`, asserted two-sided across the touch and desktop projects. **No desktop type scale — see below.** |

**Phase 3 required no implementation, and that is the finding.** `vite-plugin-sw.ts`'s
fetch handler already branched on `request.mode === 'navigate'` and already fell back to
`caches.match('/')` — keyed on the literal string, not on the request — so an offline
navigation to `/edit` or `/room/ABC123` was always going to get the shell. The PLAN
budgeted a change here on the assumption the branch was written when `/` was the only
URL the app had. It was written for this case. What was missing was any test that entered
it, which is what the phase delivered instead. This is `[fail:design]
condition-narrower-than-its-case`'s stated remedy working as intended: grep before
building.

**Deviation from Phase 5's scope, recorded:** `e2e/layout.spec.ts:291` ("leaves no hole in
the side column beside a taller board") was **skipped**, not replaced. It measures a
two-column play layout that Phase 7 will build; deleting it would throw away the
`display: contents` flattening it carries, and leaving it running would keep a vacuous
pass in the suite. Phase 7 re-enabled it — and had to re-target its measurement, since it
selected the side column by excluding `.board-frame` by name, which stops being the right
exclusion once the board sits inside `.play-body`. It now excludes by grid column, which
survives the next reshuffle of which element holds the board.

**Deviation from ADR-005, recorded (Phase 7).** ADR-005 says the desktop side rail carries
"turn bar, rule bar, hands, tool row". Three of those four are siblings of `.play-body`;
**the hands are inside it**, beside the board. CSS can flatten a wrapper with
`display: contents` but cannot move a child out of one, so the ADR's split needs a JSX
reparent that Phase 7's scope-in (`desktop.css`, `styles.css`) does not authorize.

Flattening was tried and is worse than a different split, not merely different: with
`.play-body` set to `display: contents` its `overflow-y: auto` goes with it, leaving nothing
in the side column to scroll. Measured at 1440×900 the side column came to **1292px against
a 900px screen**, so the whole match scrolled — including the board, which had fit at 886px.

The shipped split follows the seam the DOM already has. **Column 1** is `.play-body`: the
board plus what is physically attached to it (the waiting player's strip above, the hint
line and the mover's hand below), keeping its scroller. **Column 2** is what was already a
sibling: the turn bar, the rule in play, the tools. Same intent — the board gets the room,
the chrome moves beside it — at no JSX cost. Moving the hands to the far rail is available
later as its own change, with its own reason.

**Two cascade traps hit in Phase 7, both already recorded in this repo's own CSS.**
`styles.css` carries the note that "`.phone > section` outranks a bare `.editor` or
`.home`, [so] that one declaration silently won over every screen that had asked to
scroll." The same trap fired twice here: `.phone > section { display: flex }` (0,1,1) beat
`.play { display: grid }` (0,1,0), so `grid-template-columns` applied while `display` did
not — a flex container holding column definitions nothing could use, rendering as the old
single column. And `.play-cover > *` (0,1,1) beat a bare `.play-body` (0,1,0), putting the
board's column in the side column. Both were found by measuring computed styles in the
browser rather than by reading the stylesheet.

**Deviation from Phase 9's exit criterion, recorded.** It asked for "form and preview side
by side" and for the "4,700px single-column scroll" to stop being the only mode. Both rest
on a premise that stopped being true before this task started: the Chess Craft redesign
replaced that scroll with a **five-step wizard** showing one step at a time, so there is no
long form left to split — and there is no preview component to place beside one. The board
painter *is* the preview for the board step; the other four steps are lists. A real preview
pane is new component work, not a CSS layer, and inventing one here would have been a
larger unreviewed change than the phase authorized. What shipped instead is the part that
was actually costing desktop users something: the fixed-pixel grids, which were sized so a
6×6 board of tappable cells fits a 390px phone and rendered as postage stamps at 1440px.

**Deviation from Phase 10's scope, recorded.** The desktop **type scale** was not built.
`tokens.css` declares every `--font-size-*` as an absolute px value with no `clamp()`, and
changing them under the desktop band would move text on every screen at once — including
inside `.square`, whose mark is capped at `min(34px, 11cqw)` precisely to stop it ballooning.
That is a visual-design pass with its own contrast obligations
(`tests/ui/art-contrast.test.ts` enforces measured floors and the recorded rule is *move the
colour, never lower the floor*), and it is separable from the layout work every other phase
delivered. The layout reads correctly at 1280–1920 with the existing scale; a type pass can
follow with its own before/after.

### Blockers

**B1 — Phase 1's real-deploy exit criterion.** `curl -sI https://<name>.workers.dev/` and
the manifest fetch cannot run: there is no Cloudflare account or API token in this
environment, and deploying is an outward-facing action that is the user's to authorize.
Everything locally verifiable was verified — `wrangler deploy --dry-run` exits 0 and reads
13 files from `dist/`, `dist/_headers` is asserted by `tests/build/deploy-headers.test.ts`,
and `wrangler.jsonc`'s three load-bearing choices by `tests/structure/deploy-config.test.ts`.
Unblocking needs: a Cloudflare account, `wrangler login` or an API token, and a decision on
the Worker name (`chesscraft` is assumed).

**B2 — Phase 4's green-run exit criterion.** Needs a push to `master` and two repository
secrets (`CLOUDFLARE_API_TOKEN`, scoped to Workers deploy, and `CLOUDFLARE_ACCOUNT_ID`).
The workflow's structure was validated instead: two jobs, `deploy` gated on `needs: verify`
and on `github.ref == 'refs/heads/master'`, deploying the artifact `verify` built rather
than rebuilding.

Neither blocker affects Phases 5–10.

### Phase 1 — Cloudflare Workers config and first manual deploy
- **depends_on:** `[]`
- **parallel_group:** `deploy-independent`
- **merge_hazards:** `package.json` (shared with no other phase in this group) — none
- **Scope in:** `wrangler.jsonc`, `public/_headers`, `package.json` (add `wrangler` dev
  dep + `deploy` script), `.gitignore` (add `.wrangler/`)
- **Scope out:** any `src/` file
- **Exit criterion:** `npx wrangler deploy --dry-run` exits 0; after a real deploy,
  `curl -sI https://<name>.workers.dev/` shows a revalidating `cache-control` and
  `curl -sI` on a hashed asset shows `immutable`; `curl -s .../manifest.webmanifest`
  returns the manifest; the URL loads the app in a browser.
- **Risk:** low
- **Rollback point:** pre-task `master`

### Phase 2 — History API routing
- **depends_on:** `[]`
- **parallel_group:** `deploy-independent`
- **merge_hazards:** `src/ui/App.tsx` — shared with Phase 6; those are serial, so none
  within this group
- **Scope in:** `src/ui/router.ts` (new), `src/ui/App.tsx`, `tests/ui/router.test.ts`
  (new), `e2e/routing.spec.ts` (new)
- **Scope out:** `vite-plugin-sw.ts`, any CSS
- **Exit criterion:** `npm run test` green including new unit tests for
  `pathToRoute`/`routeToPath` round-tripping every route; `npm run e2e` green including
  a spec asserting (a) a direct load of `/edit` opens the editor, (b) Back from `/edit`
  returns to `/`, (c) Back out of an in-progress match prompts, and cancelling leaves the
  match intact with the URL restored.
- **Risk:** medium — the `popstate` × discard-guard interaction (ADR-003)
- **Rollback point:** Phase 1

### Phase 3 — Service worker under client-side routing
- **depends_on:** `[1, 2]`
- **parallel_group:** `serial-deploy-3`
- **merge_hazards:** `vite-plugin-sw.ts` — sole owner
- **Scope in:** `vite-plugin-sw.ts`, `e2e-pwa/routing-offline.spec.ts` (new)
- **Scope out:** the precache list's membership (unchanged — do not re-arm `addAll`
  atomicity)
- **Exit criterion:** `npm run e2e:pwa` green including a spec that installs the worker,
  goes offline, navigates to `/edit`, and receives the app shell rather than a browser
  error; the existing update-prompt specs still pass.
- **Risk:** medium — memory records this file as the project's highest-footgun area
- **Rollback point:** Phase 2

### Phase 4 — GitHub Actions verify-and-deploy
- **depends_on:** `[3]`
- **parallel_group:** `serial-deploy-4`
- **merge_hazards:** `.github/workflows/deploy.yml` — new file, sole owner
- **Scope in:** `.github/workflows/deploy.yml` (new)
- **Scope out:** any application code
- **Exit criterion:** a push to `master` produces a green Actions run whose log shows
  `npm run verify` passing and `wrangler deploy` publishing; a deliberately failing test on
  a scratch branch produces a run that does **not** reach the deploy step.
- **Risk:** medium — Playwright browser install and CI runtime
- **Rollback point:** Phase 3 (the manual `deploy` script from Phase 1 still works)

### Phase 5 — Breakpoint restructure and desktop test harness
- **depends_on:** `[4]`
- **sequencing_only:** `true` — this dependency exists because ADR-002 wants deploy-first
  feedback, **not** because any file overlaps Phases 1–4. A scheduler that prunes
  dependencies by file overlap must treat this entry as pinned; dropping it violates
  ADR-002.
- **parallel_group:** `serial-desktop-5`
- **merge_hazards:** `src/ui/styles.css` (deletes the 900px block), `playwright.config.ts`,
  `e2e/layout.spec.ts` — all shared with later desktop phases; strictly serial
- **Scope in:** `src/ui/styles.css` (delete `@media (min-width: 900px)`),
  `src/ui/desktop.css` (new, shell grid only), `src/ui/main.tsx` (import order),
  `tests/ui/shell-layout.test.ts` (assert import order), `playwright.config.ts` (add a
  `desktop-chrome` project), `e2e/layout.spec.ts` (replace the vacuous desktop assertions)
- **Scope out:** any per-screen desktop rule
- **Disposition of the three existing desktop tests** (`e2e/layout.spec.ts:266-321`), stated
  explicitly so no test inside the restructured describe block is left to inference:
  - `:269-283` "uses the width instead of leaving a phone column" — **replaced**. Its
    `mainWidth > 700` is true unconditionally because `main` is `width: 100%`
    (`styles.css:60-82`).
  - `:285-289` "the board stays square" — **kept, moved** into the new `desktop-chrome`
    project unchanged. It is not vacuous: it measures a real aspect ratio and would fail on
    a broken board.
  - `:291-320` "leaves no hole in the side column" — **replaced**. It measures gaps between
    `.play > *` in a layout that has been single-column since the pixel redesign.
- **Exit criterion:** `npm run e2e` green with the new `desktop-chrome` project at
  1280×900, 1440×900 and 1920×1080. Boundary assertions are **two-sided** — at 1279 the
  device frame and bottom tab bar are present *and* the nav rail is absent; at 1280 the
  inverse; at 915×412 the phone layout holds (proving the height floor). Two-sidedness is
  what makes them structurally unable to pass without the desktop layer.
  **Plus a one-time negative check:** delete the `desktop.css` import, run the desktop
  specs, confirm they fail, restore the import — and attach the failing run's output to
  `work-docs/EVIDENCE-desktop-gate.md` as the phase's completion evidence. A self-reported
  pass is not acceptable here (see R5).
- **Risk:** medium
- **Rollback point:** Phase 4

### Phase 6 — Navigation rail and app shell
- **depends_on:** `[5]`
- **parallel_group:** `serial-desktop-6`
- **merge_hazards:** `src/ui/App.tsx` (shell markup), `src/ui/TabBar.tsx` — sole owner in
  this track
- **Scope in:** `src/ui/App.tsx`, `src/ui/TabBar.tsx`, `src/ui/desktop.css`
- **Scope out:** per-screen content layout
- **Exit criterion:** at 1440×900 every route that shows navigation renders the left rail
  and no bottom tab bar; `play` and `boot` show neither; `npm run e2e` a11y spec green
  (tab order follows visual order, rail items keep their `aria-current`); at 1279 the
  bottom tab bar returns.
- **Risk:** medium
- **Rollback point:** Phase 5

### Phase 7 — `play` screen two-column layout
- **depends_on:** `[6]`
- **parallel_group:** `serial-desktop-7`
- **merge_hazards:** `src/ui/desktop.css` — shared with Phases 8 and 9. The serialization
  is encoded in their `depends_on` chain (8 → 7, 9 → 8), not only in this prose.
- **Scope in:** `src/ui/desktop.css` (play section), `src/ui/styles.css` (only if the
  board-sizing rule must become container-relative)
- **Scope out:** Home, Lobby, Rules, Editor, Sheet
- **Exit criterion:** at 1280/1440/1920 the board is square within 2px, fully on screen
  without vertical scrolling inside `.play`, and grows with available height; no horizontal
  document scroll; the side rail shows turn bar, rule bar, hands and tools with no gap
  artefact; `tests/ui/art-contrast.test.ts` still green.
- **Risk:** medium-high — the board sizing maths is the subtlest part of Track B
- **Rollback point:** Phase 6

### Phase 8 — Home, Lobby, Rules, Result, Sheet
- **depends_on:** `[6, 7]`
- **parallel_group:** `serial-desktop-8`
- **merge_hazards:** `src/ui/desktop.css` — shared with Phases 7 and 9; serialized by the
  `depends_on: [6, 7]` above, which is the field a scheduler gates on.
- **Scope in:** `src/ui/desktop.css` (these screens), `src/ui/Sheet.tsx` (desktop
  presentation), `src/ui/styles.css` (`.notice` 390px cap, `.sheet-scrim` scoping)
- **Scope out:** Editor, play
- **Exit criterion:** at 1440×900 each of Home, Lobby, Rules renders without a stranded
  centred column; `Sheet` presents as a centred modal with a full-shell scrim; `.notice`
  is no longer pinned to 390px; the `Result` overlay covers the full desktop shell;
  focus-trap and Escape specs in `Sheet` still pass at desktop viewport.
- **Risk:** medium
- **Rollback point:** Phase 7

### Phase 9 — Editor desktop layout
- **depends_on:** `[6, 8]`
- **parallel_group:** `serial-desktop-9`
- **merge_hazards:** `src/ui/desktop.css` — shared with Phases 7 and 8; serialized by the
  `depends_on: [6, 8]` above, which is the field a scheduler gates on.
- **Scope in:** `src/ui/desktop.css` (editor section), `src/ui/styles.css` (fixed-width
  grids `.build-grid` 300px, `.move-grid` 294px, `.dex-grid` `repeat(4, 1fr)` get desktop
  variants)
- **Scope out:** editor logic, `src/editor/`
- **Exit criterion:** at 1440×900 the editor presents form and preview side by side; the
  4,700px single-column scroll is no longer the only mode; `RoomDetail`, `EditorLibrary`
  and `EditorRooms` each have a desktop e2e assertion; no `src/editor/` file appears in
  the diff.
- **Risk:** medium-high — largest screen, most fixed-width assets
- **Rollback point:** Phase 8

### Phase 10 — Pointer affordances, type scale, and close-out
- **depends_on:** `[7, 8, 9]`
- **parallel_group:** `serial-desktop-10`
- **merge_hazards:** `src/ui/desktop.css`, `src/ui/tokens.css` (desktop type scale)
- **Scope in:** `src/ui/desktop.css` (hover rules under `@media (hover: hover)`),
  `src/ui/tokens.css` (desktop font-size overrides), `src/ui/styles.css` (`.square` glyph
  cap `min(34px, 11cqw)` revisited)
- **Scope out:** any new layout
- **Exit criterion:** `npm run verify` fully green; hover changes bevel only (asserted by a
  computed-style e2e that no `filter`/`opacity`/`box-size` changes on hover); hovering a
  board square does not change its bounding box; `tests/ui/art-contrast.test.ts` green with
  no threshold lowered; a manual pass at 1280/1440/1920 on all six routes.
- **Risk:** low-medium
- **Rollback point:** Phase 9

## 🧪 Testing Strategy

**Unit (`vitest`, `npm run test`)**
- `tests/ui/router.test.ts` — `pathToRoute`/`routeToPath` round-trip for all five paths,
  unknown-path fallback, and that `boot`/`Result` have no path. Pure functions, no DOM.
- `tests/ui/shell-layout.test.ts` — extended to assert `desktop.css` is imported after
  `styles.css` (ADR-008's load-bearing order).
- `tests/ui/art-contrast.test.ts` — unchanged, and must stay green through every desktop
  and hover change. No threshold may be lowered (the recorded rule from the pixel
  redesign).

**Integration / E2E (`playwright`, `npm run e2e`)**
- New `desktop-chrome` project: 1280×900, 1440×900, 1920×1080.
- `e2e/routing.spec.ts` — direct load, Back navigation, cancelled-Back-out-of-match.
- `e2e/layout.spec.ts` — the vacuous desktop assertions at `:280-283` and `:291-320` are
  **replaced**, not extended. New boundary assertions at 1279/1280 and at 915×412.
- Per-screen desktop specs added in Phases 7–9.

**PWA E2E (`npm run e2e:pwa`)**
- `e2e-pwa/routing-offline.spec.ts` — install worker, go offline, navigate to a non-root
  path, receive the shell.
- Existing update-prompt specs must stay green.

**Manual**
- iOS Add-to-Home-Screen from the deployed URL. The PWA suite is Chromium-only
  (`playwright.pwa.config.ts:34`), so `apple-mobile-web-app-capable` has no automated gate
  — a new origin is exactly when to re-check it by hand.
- A pass at 1280/1440/1920 across all six routes at the end of Phase 10.

**Negative test the plan requires explicitly.** In Phase 5, delete the `desktop.css`
import and confirm the new desktop assertions **fail**, then restore it. A gate that cannot
fail is the defect Phase 5 exists to fix; adding new assertions without proving they can
fail would reproduce it. This runs **once**, and its evidence is not a self-report: the
failing run's output is committed to `work-docs/EVIDENCE-desktop-gate.md` so `/hm:review`
can check that it happened. It is deliberately **not** automated in CI — see R5b for the
residual risk that decision accepts.

## ⚠️ Risks & Mitigation

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R1 | `popstate` fires after navigation, so the discard-confirm guard cannot prevent it; cancelling leaves URL and state disagreeing | high | match state lost | Phase 2 pushes the previous entry back on cancel; a dedicated e2e asserts the match survives a cancelled Back |
| R2 | SW navigation fallback regression — offline navigation to a non-root path serves a browser error | medium | offline PWA broken, silently | Phase 3 matches on `request.mode === 'navigate'` and leaves the precache list untouched so `addAll` atomicity is not re-armed; `e2e:pwa` spec covers it |
| R3 | Cache headers inverted — `index.html` cached long, hashed assets not | medium | returning users pinned to a stale shell pointing at deleted bundles | Phase 1's exit criterion is a `curl -I` check on both, not just a successful deploy |
| R4 | New desktop breakpoint captures 915×412 landscape phones | medium | a viewport an existing spec pins gets the wrong layout | ADR-006's height floor + Phase 5 boundary assertions at 915×412 |
| R5 | New desktop assertions are as vacuous as the ones they replace | medium | desktop regressions ship unobserved | Two mitigations. Preventive: the boundary assertions are two-sided (present *and* absent at each side of 1279/1280), which cannot pass without the desktop layer. Detective: Phase 5's one-time negative check, with the failing run attached to `work-docs/EVIDENCE-desktop-gate.md` — a self-report is not accepted |
| R5b | The assertions become vacuous again *later*, after Phase 5's one-time check | medium | the exact recorded failure recurs, unobserved | **Accepted, not mitigated.** An automated mutation check in CI was offered and declined in favour of the one-time-plus-evidence approach. The two-sided assertion design is the only standing defence; a future refactor that weakens it has no gate. Review should re-read this row whenever `e2e/layout.spec.ts` or `desktop.css` changes shape |
| R6 | Board sizing at desktop keeps measuring `100dvh` against the viewport rather than its container | medium | board overflows or scrolls inside a shell shorter than the viewport | Phase 7 re-derives the rule container-relative; exit criterion asserts no vertical scroll inside `.play` at three viewports |
| R7 | A desktop or hover colour regresses a measured contrast floor | medium | accessibility regression | `tests/ui/art-contrast.test.ts` runs on every vitest; the rule is move the colour, never lower the floor |
| R8 | Cloudflare API token scoped too broadly | low | account-wide credential in a repo secret | ADR-009 requires a scoped Workers-deploy token; review checks the token's scope, not just its presence |
| R9 | CI runtime makes every push slow enough that the gate gets bypassed | medium | the verify gate erodes | Accepted with `retries: 1` already set under CI; if it becomes a problem the remedy is faster tests, not a weaker gate |
| R10 | Track B accidentally moves game logic into a component or makes `apply()` impure | low | forecloses the server-authoritative replay ADR-004 protects | ADR-004 states this as a binding constraint; review checks that `src/engine/` has no diff |
| R11 | Public URL exists from Phase 4 while desktop is still the stretched phone layout | certain | poor first impression on desktop | Accepted knowingly (ADR-002); the alternative is no URL until Phase 10 |
| R12 | `desktop.css` import order silently reordered by a later refactor | low | desktop rules lose specificity ties, layout subtly wrong | `tests/ui/shell-layout.test.ts` pins the order |

## ✅ Success Criteria

- ⛔ **BLOCKED (B1)** — the app loads at a public `https://<name>.workers.dev/` URL. Config,
      headers and `wrangler deploy --dry-run` are verified; the deploy itself needs a
      Cloudflare account and is the user's to authorize.
- [x] `/`, `/lobby`, `/play`, `/dex`, `/edit` each load directly and the Back button works.
- [x] Backing out of an in-progress match prompts; cancelling preserves both match and URL.
- [x] Hashed assets are served `immutable`; `/`, `index.html`, `sw.js` and the manifest are
      not.
- [x] Offline navigation to a non-root path serves the app shell.
- ⛔ **BLOCKED (B2)** — a push to `master` runs `npm run verify` and deploys only on success; a failing test
      blocks the deploy step. Workflow written and structurally validated; a green run needs
      the push and two repository secrets.
- [x] At ≥1280px (and ≥600px tall — amended, see ADR-006) the app renders the two-column shell with a left nav
      rail, no device frame, and no width cap.
- [x] At 1279px the device frame returns; at 915×412 the phone layout returns.
- [x] All six routes plus the `Result` overlay and `Sheet` have a desktop presentation and
      at least one desktop e2e assertion each.
- [x] Hover feedback exists on desktop, expressed as a bevel change, absent on touch.
- [x] The desktop assertions demonstrably fail when the desktop layer is removed.
- [x] `npm run verify` is green.
- [x] `src/engine/` has no diff.

## 🔍 Plan Validation

**Cross-model second opinion:** skipped for every enabled model.

| Model | Status | Reason |
|---|---|---|
| `codex` | `skipped` | Side-preset gate requires a high-diff change. `hm high_diff classify` returned `{"boundary": false, "is_high": false}` — the working tree contains only `work-docs/RESEARCH-web-server-deployment.md` with 0 added code lines, since planning precedes implementation. |

**Validator pass 1 — `MAJOR_REVISION`.** Seven critiques, all resolved before this PLAN was
finalized. The validator independently verified the PLAN's line-number citations against
the worktree and found two wrong; both are corrected here and one was corrected in
RESEARCH, where it originated.

| # | Severity | Issue | Resolution |
|---|---|---|---|
| 1 | critical | Phases 7/8/9 shared `parallel_group: desktop-screens` — the same marker Phases 1/2 use to signal fan-out — while their serialization existed only as prose inside `merge_hazards`. `depends_on` was `[6]` for all three, so a scheduler reading the contractual field would start 8 and 9 concurrently with 7 and collide on `src/ui/desktop.css`. | Fixed. Distinct groups `serial-desktop-7/8/9`; `depends_on` chained `[6]` → `[6,7]` → `[6,8]`. The prose is now redundant confirmation, not the sole encoding. |
| 2 | warning | Phase 5's negative test was an unverifiable one-time ritual with no artifact and no defence against later re-vacuification. | Resolved via Interview #13. The user chose one-time-plus-evidence over CI automation: the failing run is committed to `work-docs/EVIDENCE-desktop-gate.md`, and the boundary assertions were additionally made two-sided so they are structurally non-vacuous. The residual — no gate against a *future* weakening — is recorded as **accepted** risk R5b rather than papered over. |
| 3 | warning | ADR-002's "sequencing, not technical" distinction was prose-only, so a scheduler pruning `depends_on` by file overlap could silently reverse it. | Fixed. Phase 5 carries `sequencing_only: true`, and ADR-002's Consequences now state the pruning hazard explicitly. |
| 4 | warning | `src/ui/App.tsx:59` cited; line 59 is mid-comment. Error inherited from RESEARCH. | Fixed after two attempts — see pass 2. Correct citations: `:61` (the `Route` union), `:99` (the `useState` call). |
| 5 | suggestion | `styles.css:1177` should be `:1174` for `container-type: inline-size`. | Fixed after two attempts — see pass 2. |
| 6 | suggestion | Scope boundaries scattered across three locations. | Fixed. New `## 🚫 Non-Goals` section consolidates them. |
| 7 | suggestion | Phase 5 was silent on `e2e/layout.spec.ts:285-289` ("the board stays square"), a test inside the describe block being restructured. | Fixed. Phase 5 now states the disposition of all three existing desktop tests: two replaced, this one kept and moved. |

Validator confirmed clean: no `Accept?/OK?/Verify?/Should we?` phrasing anywhere in the
body; all nine ADRs carry two-sided consequences and rejected alternatives; the risk
register has no platitudes; the rollback chain is unbroken.

**Validator pass 2 — `NEEDS_REVISION`.** The re-run was asked to verify each claimed
resolution rather than trust the table, and that caught a real miss: the pass-1 fix for
critiques 4 and 5 was applied to some occurrences and not others, while the table asserted
it was complete and "verified directly". Three stale citations survived — `App.tsx:59` at
PLAN ADR-003's Context and at RESEARCH pitfall 17, and `styles.css:1177` at RESEARCH
approach B2. All three are now corrected, and the table above no longer over-claims.

Pass 2 confirmed the other five resolutions landed exactly as described, checked each
`## 🚫 Non-Goals` row against every phase's scope-in and found no contradiction, verified
the `6 → 7 → 8 → 9 → 10` dependency chain is internally consistent, and read
`e2e/layout.spec.ts` directly to confirm the three test ranges Phase 5 names are the three
that exist. It judged R5b an honest recording of a declared trade-off rather than a
dismissal of critique 2.

**Lesson recorded rather than hidden:** a "fixed everywhere" claim about a repeated string
is worth exactly as much as the grep behind it. Pass 1's fix edited the occurrences that
were visible in the editing context and asserted completeness without running the search.
The second pass existed precisely to catch that class of thing, and did.

**Cross-model second opinion:** skipped for every enabled model (see the table above);
the verdict is Claude-derived and valid without it.
