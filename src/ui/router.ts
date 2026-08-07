/**
 * The screens, and the URLs they live at.
 *
 * `result` is deliberately not here. The end of a match is rendered by `MatchHost`, over
 * the board it belongs to, because promoting it to a route would mean lifting the whole
 * match — position, hands, ply count — into `App` so the screen could report on it.
 *
 * `boot` is here but is not addressable: see `PATH_OF` below.
 */
export type Route = 'boot' | 'home' | 'lobby' | 'play' | 'dex' | 'edit'

/**
 * The union, as a value.
 *
 * TypeScript erases the type, so without this a test cannot iterate the routes and a route
 * added to the union without a path would be a runtime `undefined` that nothing catches.
 * `tests/ui/router.test.ts` walks this to assert every member has a path.
 */
export const ROUTES: readonly Route[] = ['boot', 'home', 'lobby', 'play', 'dex', 'edit']

/**
 * Route → the URL to WRITE for it.
 *
 * `boot` maps to the root rather than to a path of its own, and that asymmetry is the
 * point: onboarding is a state of the first visit, not a place. Giving it an address would
 * let anyone replay the tutorial by typing a path, and would show a returning player
 * onboarding again after following a shared link. It needs a URL to write — the address bar
 * should not say `/edit` while the tutorial is up — and no URL that reads back to it.
 */
const PATH_OF: Record<Route, string> = {
  boot: '/',
  home: '/',
  lobby: '/lobby',
  play: '/play',
  dex: '/dex',
  edit: '/edit',
}

/** Path → route. The inverse of `PATH_OF` minus `boot`, for the reason above. */
const ROUTE_OF: ReadonlyMap<string, Route> = new Map<string, Route>([
  ['/', 'home'],
  ['/lobby', 'lobby'],
  ['/play', 'play'],
  ['/dex', 'dex'],
  ['/edit', 'edit'],
])

/**
 * The comparable form of a pathname.
 *
 * Strips the query and hash — a link someone shared with `?utm_source=` on it must not read
 * as an unknown path — and drops a trailing slash, so `/edit/` and `/edit` are not two
 * different screens. The root keeps its slash, since stripping it leaves nothing to match.
 */
function normalize(pathname: string): string {
  const path = pathname.split('?')[0]!.split('#')[0]!
  const trimmed = path.length > 1 ? path.replace(/\/+$/, '') : path
  return trimmed === '' ? '/' : trimmed
}

/**
 * The screen a URL asks for, always.
 *
 * Total by construction. The edge serves `index.html` for every path that is not a file
 * (`wrangler.jsonc`'s single-page-application handling), so an unknown path REACHES the app
 * rather than 404ing, and something has to render. Home is the only answer that is never a
 * dead end. Callers that need to tell a real hit from this fallback ask `isKnownPath`.
 */
export function pathToRoute(pathname: string): Route {
  return ROUTE_OF.get(normalize(pathname)) ?? 'home'
}

export function routeToPath(route: Route): string {
  return PATH_OF[route]
}

/**
 * Whether the URL named a screen, as opposed to being absorbed by the fallback.
 *
 * Distinct from `pathToRoute` returning `'home'`, and the distinction is what lets the shell
 * clean up after itself: `/` and `/nonsense` both render home, but only one of them should
 * stay in the address bar. Leaving the other there promises a screen that was never shown,
 * and makes a reload disagree with what is on the display.
 */
export function isKnownPath(pathname: string): boolean {
  return ROUTE_OF.has(normalize(pathname))
}
