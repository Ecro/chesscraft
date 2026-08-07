---
type: research
task_slug: web-server-deployment
status: complete
created: 2026-08-07
tags: [strange-chess, research, cloudflare, vite, pwa, deployment, desktop-layout, multiplayer]
mtime_warn_days: 7
libs_fetched: []
sources:
  - https://developers.cloudflare.com/workers/static-assets/
  - https://developers.cloudflare.com/workers/static-assets/routing/single-page-application/
  - https://developers.cloudflare.com/workers/static-assets/migration-guides/migrate-from-pages/
  - https://developers.cloudflare.com/durable-objects/concepts/what-are-durable-objects/
  - https://developers.cloudflare.com/durable-objects/best-practices/rules-of-durable-objects/
  - https://blog.cloudflare.com/cloudflare-acquires-partykit
  - https://mecanik.dev/en/posts/cloudflare-pages-vs-workers-which-to-use-in-2026/
  - https://dev.to/rickcogley/cloudflare-pages-vs-workers-in-2026-migration-guide-ka7
  - https://www.devtoolreviews.com/reviews/vercel-vs-netlify-vs-cloudflare-pages-pricing-comparison-2026
  - https://danubedata.ro/blog/cloudflare-pages-vs-netlify-vs-vercel-static-hosting-2026
  - https://vite-pwa-org.netlify.app/guide/service-worker-precache.html
  - https://github.com/vite-pwa/vite-plugin-pwa/issues/33
  - https://github.com/ornicar/lichess-layout
  - https://blog.logrocket.com/container-queries-2026/
related_docs:
  - "[[PLAN-ui-ux-productization]]"
  - "[[RESEARCH-ui-ux-productization]]"
  - "[[REVIEW-chess-craft-pixel-redesign-2026-08-07]]"
summary: "Ship on Cloudflare Workers Static Assets now; same deployment grows a Durable Object per room later."
---

# RESEARCH — Web server deployment + desktop UI/UX

## 🎯 Recommended Direction

**Deploy the existing `dist/` on Cloudflare Workers with Static Assets, and treat the
desktop layout as a separate, larger workstream than the deploy.**

The user's constraint is "static now, online multiplayer eventually, make expansion
cheap." Only one option makes those the *same* deployment rather than two: Workers with
Static Assets serves the SPA from the edge for free today, and adding realtime later is a
new binding in the same `wrangler.jsonc` plus a Durable Object class — no host migration,
no second vendor, no CORS/origin split. Cloudflare's own current guidance for greenfield
projects is Workers rather than Pages ([mecanik.dev](https://mecanik.dev/en/posts/cloudflare-pages-vs-workers-which-to-use-in-2026/),
[Cloudflare migration guide](https://developers.cloudflare.com/workers/static-assets/migration-guides/migrate-from-pages/)).

The deploy itself is small (a config file, a `_headers`-equivalent, a CI step). The
desktop work is not: **there is currently no desktop layout at all.** At ≥900px the shell
box widens to `min(94vw, 1100px)` and every child inside it is still the 390px phone
layout stretched (`src/ui/styles.css:147-152`; nothing inside `.phone` has a desktop
branch). Calling it a "redesign" is accurate — this is new layout, not a repair.

Two facts bind the whole task together and are easy to miss:

1. **The app has no URL routing.** Navigation is one `useState` union (type at
   `src/ui/App.tsx:61`, state at `:99`, guarded transition at `:141-148`); there is a
   single URL. An online match needs a
   shareable room link, so multiplayer forces URL routing, which in turn is what makes
   the host's SPA-fallback setting matter. Doing the routing work at deploy time is
   cheaper than retrofitting it.
2. **The engine is already multiplayer-shaped, the match container is not.** `apply(state,
   action, content) → GameState` is a pure reducer (`src/engine/engine.ts:648`),
   `legalActions` (`:345`), `serializeState`/`deserializeState` (`:875`, `:879`),
   `viewFor(state, side)` (`:885`, currently identity — "the seam a future fog rule
   needs"), and `rngFor(seed, ...domain)` gives per-domain deterministic substreams
   (`src/engine/rng.ts:30`). But `Match` is `{ readonly states: readonly GameState[] }`
   (`src/engine/match.ts:11-13`) — a *state history*, not an action log. A
   server-authoritative room wants the action log.

## 🔍 Refinement Decisions

Scope was confirmed with the user before searching:

- **Server scope** — "최종은 온라인대전까지 되어야해. 근데 지금 당장은 정적 배포로도
  괜찮아. 확장이 쉽도록만." → static deploy now; architecture must not foreclose realtime
  multiplayer.
- **Desktop UX goal** — "전면 데스크톱 레이아웃 재설계" → full desktop layout design, not
  a breakage audit.
- **Autopilot** — another Claude session is open in this project, so this run stays gated.

**Discovery lens:** Technical architecture / implementation (primary — hosting + backend
evolution path, layout system), Risk / compliance (secondary — PWA service-worker and
cache-header failure modes on a new origin), User-workflow / product opportunity
(secondary — how comparable board-game web clients use a wide screen).

**Local capability × user artifact:** the only user artifacts this app touches are
browser-local — `localStorage` (`src/ui/settings.ts`, `src/ui/coach.ts`,
`src/editor/storage.ts`) and the `CRAFT-…` share string, which the pixel redesign
deliberately made a long self-contained payload "because a short code is a handle into a
server this app is built not to need" ([wiki:architecture]
`chess-craft-pixel-redesign`). Going online reverses that decision knowingly: a room code
becomes a server handle, and share strings and room codes then need to coexist.

## 🛠️ Approaches Found

### Group A — hosting and the path to a server

#### A1. Cloudflare Workers + Static Assets → Durable Objects later ★ recommended

| Field | Content |
|---|---|
| Approach | One Worker serves `dist/` from the edge. Later, the *same* Worker routes `/room/*` to a Durable Object per match. |
| Assumption | Multiplayer will be room-scoped and turn-based — one authoritative actor per match, low message rate, long idle gaps. That is exactly the DO model. |
| Evidence | Workers serve static assets natively and static-asset requests are free, same as Pages ([Cloudflare](https://developers.cloudflare.com/workers/static-assets/)). DOs are documented for "chat rooms, game servers" ([Cloudflare](https://developers.cloudflare.com/durable-objects/concepts/what-are-durable-objects/)). WebSocket Hibernation removes duration billing during idle — the dominant cost of a turn-based game ([Cloudflare](https://developers.cloudflare.com/durable-objects/best-practices/rules-of-durable-objects/)). Cloudflare acquired PartyKit, consolidating this as the platform's multiplayer story ([blog.cloudflare.com](https://blog.cloudflare.com/cloudflare-acquires-partykit)). Free tier: unlimited bandwidth, 500 builds/mo, commercial use allowed ([DevToolReviews](https://www.devtoolreviews.com/reviews/vercel-vs-netlify-vs-cloudflare-pages-pricing-comparison-2026)). |
| Trade-off | Vendor concentration — hosting, realtime, and storage all become Cloudflare. Durable Objects are not portable; a later exit is a rewrite of the room layer (the engine itself stays portable, since it is pure). DO usage requires a paid Workers plan (~$5/mo) at the point multiplayer ships, not today. |
| Compatibility | High. `npm run build` is unchanged; the SPA is unchanged; `wrangler.jsonc` + `not_found_handling: "single-page-application"` ([Cloudflare](https://developers.cloudflare.com/workers/static-assets/routing/single-page-application/)). Custom domain at the apex means `start_url: "/"` and `scope: "/"` in `public/manifest.webmanifest` stay valid untouched. |
| Risk | **low** for the static phase; **medium** for the multiplayer phase (new failure surface: reconnection, authority, cheat resistance — none of which exist yet). |

#### A2. Cloudflare Pages / Netlify / Vercel static, backend later on a separate service

| Field | Content |
|---|---|
| Approach | Deploy the SPA to a conventional static host; when multiplayer arrives, stand up Supabase Realtime or a separate WS service and call it cross-origin. |
| Assumption | The frontend host and the game server can be independent without cost. |
| Evidence | All three offer git-push deploys and SPA fallback. Netlify free = 100GB bandwidth + 300 build min; Vercel Hobby = 100GB but **non-commercial only** ([DanubeData](https://danubedata.ro/blog/cloudflare-pages-vs-netlify-vs-vercel-static-hosting-2026), [DevToolReviews](https://www.devtoolreviews.com/reviews/vercel-vs-netlify-vs-cloudflare-pages-pricing-comparison-2026)). Cloudflare Pages remains fully supported with no forced migration deadline, but is no longer the recommendation for new projects ([Cloudflare](https://developers.cloudflare.com/workers/static-assets/migration-guides/migrate-from-pages/)). |
| Trade-off | The split origin is the cost, and it is paid entirely in phase 2: CORS, a second deploy pipeline, a second bill, WS origin/auth config, and a dev setup that no longer matches production. This is precisely the "확장이 쉽도록" the user asked to avoid. |
| Compatibility | High for phase 1 (identical to A1), lower for phase 2. |
| Risk | **low** now, **medium** later — the risk is deferred, not removed. |

#### A3. GitHub Pages — **not viable as a project page**

| Field | Content |
|---|---|
| Approach | Push `dist/` to `gh-pages` on `Ecro/chesscraft`, served at `ecro.github.io/chesscraft/`. |
| Assumption | The app tolerates a sub-path base. **It does not.** |
| Evidence | Three absolute-root dependencies, all first-hand: `public/manifest.webmanifest` declares `"start_url": "/"` and `"scope": "/"`; `index.html` links `/manifest.webmanifest` and `/icons/icon-192.png`; and `vite-plugin-sw.ts` bakes a precache list of `'/'`, `'/manifest.webmanifest'`, `'/icons/*'` plus `` `/${filename}` `` for every bundle entry. Because `cache.addAll` is atomic, **one 404 in that list means nothing is cached at all** ([wiki:architecture] `pwa-service-worker-and-updates`, and [vite-pwa](https://vite-pwa-org.netlify.app/guide/service-worker-precache.html) documents the same class of failure). Under `/chesscraft/` every one of those paths 404s. |
| Trade-off | Fixable only by threading a base path through `vite.config.ts`, `index.html`, the manifest, and the SW generator — four artifacts, for a host that can never run the phase-2 server anyway. |
| Compatibility | Low. Viable **only** at a repo-root user page or a custom apex domain. |
| Risk | **high** — the failure is silent offline breakage, not a build error. |

#### A4. Self-hosted Node/VPS with a WebSocket server

| Field | Content |
|---|---|
| Approach | One box, nginx or a Node server serving `dist/` and terminating WS. |
| Assumption | Ops time is available. |
| Evidence | No external citation needed; the trade-off is well understood. |
| Trade-off | Full control and zero vendor lock-in, paid for with TLS renewal, uptime, patching, backups, and a single point of failure — for a project whose current runtime dependency list is `react` + `zod`. |
| Compatibility | High technically, poor against the project's demonstrated preference for a small maintained surface. |
| Risk | **medium** — nothing fails fast; it degrades through neglect. |

### Group B — the desktop layout

Current state, measured: at 1920×1080 the shell is a **1100×900 box** (`styles.css:149-150`)
with ~820px of pure backdrop beside it; inside, the board resolves to ~880px
(`.board-frame { width: min(100%, calc(100dvh - 200px)) }`, `styles.css:1129`) and
everything else is a single flex column (`.play`, `styles.css:866-872`). There is **no
two-column CSS anywhere in the file** despite `e2e/layout.spec.ts:250-265` describing one
— it did not survive the pixel redesign, and the assertions written for it now pass
vacuously (see Pitfalls).

#### B1. Adaptive 1→2→3 column shell (the lichess model) ★ likely direction

| Field | Content |
|---|---|
| Approach | Lift the 1100px shell cap on true desktop. Board takes the largest square the *height* allows and centres; a persistent side rail carries what is today stacked below it (turn bar, rule card, hands, tool row); a third rail appears past ~1600px for history/roster. |
| Assumption | The board is the focal object and should scale with the window — the same premise `e2e/layout.spec.ts:280-283` already asserts. |
| Evidence | The archived lichess layout goals state exactly this: responsive 1→3 columns, phone to large desktop, with "the board occupying as much space as possible" ([ornicar/lichess-layout](https://github.com/ornicar/lichess-layout)). |
| Trade-off | Directly contradicts the comment block at `src/ui/styles.css:20-21` — "The phone is the layout … A chess board stretched to 1400px is not a better chess board." That was a recorded decision and reversing it is a design call, not a bug fix. Also retires the 390×844 "device frame" aesthetic on desktop. |
| Compatibility | Medium. `App.tsx` renders one tree with no route wrapper (`:196-347`), so a grid can be introduced at `.phone` without restructuring React — but the tab bar (`TabBar.tsx`, bottom-anchored, `styles.css:395-403`) is a phone idiom that a side rail replaces. |
| Risk | **medium** — largest surface, but the surface is CSS plus one nav component. |

#### B2. Container-query component reflow inside a fluid shell

| Field | Content |
|---|---|
| Approach | Widen the shell, then let each component reflow off *its own* width via `@container` rather than off the viewport. |
| Assumption | Components are placed in varying-width slots — which only becomes true once B1 introduces rails. |
| Evidence | 2026 guidance: container queries for component-level reflow, media queries for page-level layout ([LogRocket](https://blog.logrocket.com/container-queries-2026/)). The repo already uses one (`.board { container-type: inline-size }`, `styles.css:1174`), so the pattern is established here. |
| Trade-off | Not an alternative to B1 — it is the *implementation technique* for B1's children. On its own it changes nothing, because today every component sits in the same single column. |
| Compatibility | High. |
| Risk | **low**. |

#### B3. Audit-and-patch only (keep the phone column, fix what breaks)

| Field | Content |
|---|---|
| Approach | Keep the 1100px shell; fix the specific desktop defects (the 390px-capped notice, the shell-scoped sheet scrim, missing hover/keyboard affordances). |
| Assumption | The phone-shell-on-a-backdrop presentation is acceptable. |
| Evidence | It is the currently recorded intent (`styles.css:20-21`, `:84-90`). |
| Trade-off | Cheapest by far, and explicitly **not what the user asked for** ("전면 데스크톱 레이아웃 재설계"). Recorded here as the fallback if the redesign has to be descoped, and because its defect list is work B1 must do anyway. |
| Compatibility | High. |
| Risk | **low**. |

## ⚠️ Pitfalls

**Deployment / PWA**

1. **`cache.addAll` is atomic — one 404 kills the entire precache, silently.** The
   generated worker precaches `/`, `/manifest.webmanifest` and three icons by hand,
   because `public/` is copied outside the Rollup bundle and never appears in
   `Object.keys(bundle)`; the maskable icon was already missed once on the first pass
   ([wiki:architecture] `pwa-service-worker-and-updates`; `vite-plugin-sw.ts:29-45`).
   Any base-path change, host rewrite, or asset move re-arms this.
2. **`index.html` must be `no-cache` while hashed assets are `immutable`.** The standard
   split is `Cache-Control: max-age=31536000, immutable` for fingerprinted assets and a
   revalidating header for HTML; get it backwards and returning users are pinned to an old
   shell whose `sw.js` registration points at deleted bundles
   ([Cloudflare](https://developers.cloudflare.com/workers/static-assets/), [vite-pwa#33](https://github.com/vite-pwa/vite-plugin-pwa/issues/33)).
   `sw.js` itself must never be long-cached.
3. **SPA fallback that *redirects* to `/index.html` breaks service-worker registration.**
   The documented failure is not host-specific — any host that redirects rather than
   rewrites hits it. Cloudflare's `not_found_handling: "single-page-application"` rewrites
   for navigation requests (`Sec-Fetch-Mode: navigate`) and does not redirect
   ([Cloudflare](https://developers.cloudflare.com/workers/static-assets/routing/single-page-application/)).
4. **`_headers` does not apply to Worker-generated responses** — if the phase-2 Worker
   ever serves assets through code rather than the asset binding, headers must be set in
   code ([Cloudflare](https://developers.cloudflare.com/workers/static-assets/)).
5. **Vercel's Hobby tier is non-commercial only** — a licensing trap if this ever earns
   money ([DevToolReviews](https://www.devtoolreviews.com/reviews/vercel-vs-netlify-vs-cloudflare-pages-pricing-comparison-2026)).
6. **iOS installability is untested by construction.** The e2e PWA suite is Chromium-only
   (`playwright.pwa.config.ts:34`, Pixel 7), so `apple-mobile-web-app-capable` — which is
   the only thing making Add-to-Home-Screen chrome-less below iOS 16.4 — has no automated
   gate. A new origin is exactly when to re-check it by hand.

**Desktop layout**

7. **`[fail:design] condition-narrower-than-its-case` — the recorded, already-paid failure
   here.** A complete two-column desktop layout existed for phases and never rendered,
   because its query was `(orientation: landscape) and (max-height: 560px)` — a phone held
   sideways. It read as "desktop was never built" rather than "desktop is unreachable."
   The generalization applies directly: **grep before building.** And when a bound is
   widened, check what *else* it now matches — a 915×412 landscape phone satisfies
   `min-width: 900px`, so a desktop block without a height floor silently steals a viewport
   `e2e/layout.spec.ts:142` is pinning.
8. **The existing desktop assertions no longer measure anything.** `e2e/layout.spec.ts:280-283`
   checks `mainWidth > 700` — but `main` is `width: 100%` unconditionally
   (`styles.css:60-82`), so at 1440px this is true no matter what the layout does. The
   "no hole in the side column" test (`:291-320`) measures gaps between `.play > *`
   children of a layout that has been single-column since the pixel redesign; it passes
   vacuously. **These tests will not fail during a desktop regression.** Same shape as
   pitfall 7: a green gate that cannot see its subject.
9. **Desktop viewport coverage is one size, one screen.** Distinct viewports across the
   whole suite: 412×915 (default, both configs), 360×640, 768×1024, 915×412, 1440×900.
   Only 1440×900 is desktop, exercised by three tests, **all on the match board**. Home,
   Lobby, Editor, RoomDetail, Rules/dex, Result and Sheet have zero desktop coverage, and
   1920×1080 is never tested at all.
10. **Board height is computed against the wrong box.** `.board-frame` uses
    `calc(100dvh - 200px)` — `100dvh` is the *viewport*, but at ≥900px the board's actual
    container is `.phone` at `min(94vh, 900px)` (`styles.css:150`). At 1920×1080 that asks
    for 880px inside a 900px shell that also holds the turn bar, foe strip, hotbar and a
    54px tool row; the surplus is absorbed by `.play-body { overflow-y: auto }`. Result:
    the board can require scrolling in a shell *shorter than the viewport the cap was
    derived from*. Any desktop layout must re-derive this against its own container.
11. **Fixed-pixel design assets do not scale with the shell.** `--font-size-*` are all
    absolute px with no `clamp()`/`vw` (`tokens.css:262-269`); `.notice` is capped at
    `max-width: 390px` (`styles.css:458`) inside a 1100px shell; `.dex-grid` is
    `repeat(4, 1fr)` at every width (`:2468`); `.build-grid` 300px (`:2162`), `.move-grid`
    294px (`:2346`). The sole fluid grid in the file is `.palette.wrap`
    (`repeat(auto-fill, minmax(48px, 1fr))`, `:2218`). A desktop redesign needs a type
    scale and a set of fluid grids that do not exist yet.
12. **The sheet is a phone idiom and is scoped to the phone.** `.sheet-scrim` is
    `position: absolute` inside `.phone` (`styles.css:1622-1630`), so on desktop it dims
    only the 1100px column and leaves the backdrop lit; `.sheet` has no `max-width` and no
    centring (`:1726-1736`), rendering as an 1100px slab pinned to the bottom edge.
    `Sheet.tsx` exposes no placement prop.
13. **No hover state exists, by design** — `styles.css:253-254`: "A block that lights up
    on hover would look like glass." Every control's shape is its bevel. Desktop users
    expect pointer feedback, so this is a design decision to re-open deliberately, not an
    omission to patch. Keyboard support today exists only inside `Sheet.tsx` (Tab trap +
    Escape).
14. **Squares opt out of the 44px minimum** (`.square { min-height: 0 }`, `styles.css:1203-1207`,
    against `button { min-height: 44px }` at `:241`), and the glyph is capped at
    `min(34px, 11cqw)` (`:1211-1220`) "so it doesn't balloon on a desktop." A larger
    desktop board will render 34px marks on ~130px squares unless that cap is revisited.

**Multiplayer readiness**

15. **`Match` stores full states, not actions.** `{ readonly states: readonly GameState[] }`
    (`match.ts:11-13`), and `undo` pops one (`:20-24`). A server-authoritative room wants
    an action log it can replay through `apply` to validate a move and to reconstruct state
    after hibernation; shipping whole `GameState` snapshots over a socket is both fat and
    trust-shaped wrong. `serializeState` also hand-rolls the `board: Map` round-trip
    (`engine.ts:875-882`), which becomes a wire format the moment it crosses a network.
16. **`viewFor(state, side)` is identity** (`engine.ts:885-887`). It is documented as the
    per-player seam, and today it hands every client the full state — fine for
    pass-and-play, a hidden-information leak the moment two browsers are involved.
17. **No URL routing means no shareable room link and no deep link.** `App.tsx:61` is a
    `useState` union over six routes with no `pushState` anywhere. This also means today's
    SPA-fallback config is untested by any real path — the first `/room/ABC123` will be the
    first request that ever exercises it.

## ❓ Open Questions

These block `/hm:plan` from locking architecture:

1. **Custom domain, or a `*.workers.dev` subdomain?** This is the single highest-leverage
   answer: an apex custom domain keeps `start_url: "/"` / `scope: "/"` valid with zero code
   change and keeps GitHub Pages nominally on the table; a sub-path deploy forces a base-path
   change across four artifacts (pitfall in A3).
2. **Does the desktop redesign keep the 390×844 device-frame aesthetic anywhere?** It is
   currently the design's stated identity (`styles.css:20-21`, `:84-90`) and B1 retires it
   above 900px. Reversing a recorded decision should be explicit in an ADR.
3. **Is portrait mobile still the *primary* target, or are mobile and desktop now peers?**
   This decides whether the desktop layout is an enhancement layer over the phone CSS or a
   sibling layout — and whether the Playwright default project stays `Pixel 7` alone.
4. **Which desktop widths are in scope?** 1280 / 1440 / 1920 behave differently given the
   1100px cap. Naming the floor and ceiling gives the layout its bounds and the e2e suite
   its viewport matrix.
5. **Multiplayer model: realtime WebSocket, or asynchronous/correspondence?** A turn-based
   game with children as the audience may be better served by async play (make a move,
   come back later) than by a live socket. This changes the phase-2 design more than the
   hosting choice does, and it is worth deciding *before* the URL-routing work, since
   routing is shared by both.
6. **Identity and moderation.** The manifest describes the audience as children playing
   with friends. Any online room raises account/nickname handling, room privacy, abuse
   reporting, and possibly COPPA-adjacent obligations — none of which exist today. Even if
   phase 2 is far off, the answer constrains what the room link may encode.
7. **Does the CI/deploy pipeline gate on `npm run verify`?** That script chains typecheck,
   build, vitest, build-tests, e2e and e2e-pwa. There is no CI config in the repo today, so
   "deploy" currently means "someone's laptop."
8. **Locale.** `index.html` is `lang="ko"` and the manifest is Korean-only. A public URL
   raises whether `src/i18n/` grows a second locale; out of scope unless the user says
   otherwise.

## 📚 Sources

- Cloudflare — [Workers Static Assets](https://developers.cloudflare.com/workers/static-assets/)
- Cloudflare — [SPA routing for static assets](https://developers.cloudflare.com/workers/static-assets/routing/single-page-application/)
- Cloudflare — [Migrate from Pages to Workers](https://developers.cloudflare.com/workers/static-assets/migration-guides/migrate-from-pages/)
- Cloudflare — [What are Durable Objects?](https://developers.cloudflare.com/durable-objects/concepts/what-are-durable-objects/)
- Cloudflare — [Rules of Durable Objects](https://developers.cloudflare.com/durable-objects/best-practices/rules-of-durable-objects/)
- Cloudflare Blog — [Cloudflare acquires PartyKit](https://blog.cloudflare.com/cloudflare-acquires-partykit)
- mecanik.dev — [Cloudflare Pages vs Workers: Which to Use in 2026](https://mecanik.dev/en/posts/cloudflare-pages-vs-workers-which-to-use-in-2026/)
- DEV — [Cloudflare Pages vs Workers in 2026: Migration Guide](https://dev.to/rickcogley/cloudflare-pages-vs-workers-in-2026-migration-guide-ka7)
- DevToolReviews — [Vercel vs Netlify vs Cloudflare Pages Pricing 2026](https://www.devtoolreviews.com/reviews/vercel-vs-netlify-vs-cloudflare-pages-pricing-comparison-2026)
- DanubeData — [Cloudflare Pages vs Netlify vs Vercel (2026)](https://danubedata.ro/blog/cloudflare-pages-vs-netlify-vs-vercel-static-hosting-2026)
- Vite PWA — [Service Worker Precache](https://vite-pwa-org.netlify.app/guide/service-worker-precache.html)
- GitHub — [vite-plugin-pwa#33: Bust cache after a release?](https://github.com/vite-pwa/vite-plugin-pwa/issues/33)
- GitHub — [ornicar/lichess-layout](https://github.com/ornicar/lichess-layout)
- LogRocket — [Container queries in 2026: powerful, but not a silver bullet](https://blog.logrocket.com/container-queries-2026/)

## 🔗 Related Internal Docs

- [[PLAN-ui-ux-productization]] — the plan whose Constraints section names portrait mobile
  web as the primary layout target ("device at arm's length rather than a desktop
  monitor", `work-docs/PLAN-ui-ux-productization.md:249`). B1 reopens that constraint.
- [[RESEARCH-ui-ux-productization]] — prior UI/UX research for the same shell.
- [[REVIEW-chess-craft-pixel-redesign-2026-08-07]] — the redesign that removed the earlier
  two-column play layout and set the single-theme / bevel language a desktop layout must
  keep.
- Memory `[wiki:architecture] pwa-service-worker-and-updates` — the authoritative account
  of the hand-built SW, its precache atomicity, and the update handshake.
- Memory `[wiki:architecture] chess-craft-pixel-redesign` — records the deliberate
  "no server" choice behind the long `CRAFT-…` share string.
- Memory `[fail:design] condition-narrower-than-its-case` — the desktop layout that existed
  and never rendered.
