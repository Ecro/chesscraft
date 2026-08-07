import { describe, expect, it } from 'vitest'
import { ROUTES, isKnownPath, pathToRoute, routeToPath } from '@ui/router'
import type { Route } from '@ui/router'

/**
 * The path ↔ route mapping, as pure functions.
 *
 * Pure, and tested here rather than through the browser, because the mapping is where the
 * mistakes are and the browser is where they are expensive to find. An e2e can tell you
 * that Back went somewhere wrong; it cannot cheaply tell you that `/edit/` and `/edit`
 * disagree, or that a route was added to the union and never given a path. Driving that
 * through Playwright would also mean the rule is only checked for the paths someone
 * thought to click, which is the shape of `[fail:test] gate-enumerates-one-axis-blind-to-others`.
 *
 * The round-trip is the property worth having: every route the user can navigate to must
 * survive being turned into a URL and read back. `boot` is the one deliberate exception,
 * and it is asserted as an exception rather than omitted — an omitted case reads as an
 * oversight to the next person, and the whole reason it is excluded is a decision.
 */

/** Every route the user can navigate to. `boot` is excluded — see the exception test. */
const NAVIGABLE = ROUTES.filter((r) => r !== 'boot')

describe('route ↔ path mapping', () => {
  it.each(NAVIGABLE)('round-trips %s', (route) => {
    expect(pathToRoute(routeToPath(route))).toBe(route)
  })

  it('gives every route in the union a path, so adding one cannot silently lose its URL', () => {
    /*
     * Guards the absent case rather than the present one. Adding a seventh route and
     * forgetting its entry would leave `routeToPath` returning undefined, and every
     * assertion above would still pass because they only iterate the routes that HAVE
     * paths. This iterates the union itself.
     */
    for (const route of ROUTES) {
      expect(routeToPath(route), `route "${route}" has no path`).toMatch(/^\//)
    }
  })

  it('sends boot to the root, and never resolves a path back to it', () => {
    /*
     * `boot` is onboarding — a state of the first visit, not a place. It is reachable
     * only by having no `coach.seen` flag, so a URL that produced it would let anyone
     * replay the tutorial by typing a path, and would show a returning player onboarding
     * again after sharing a link. It therefore has a path to WRITE (the root, so the URL
     * is honest about where you are) and no path that READS back to it.
     */
    expect(routeToPath('boot')).toBe('/')
    expect(pathToRoute('/')).toBe('home')
  })

  it.each([
    ['/edit/', 'edit'],
    ['/edit', 'edit'],
    ['/dex/', 'dex'],
  ] as const)('reads %s as %s, so a trailing slash is not a different screen', (path, route) => {
    expect(pathToRoute(path)).toBe(route)
  })

  it.each(['/nonsense', '/play/extra', '/room/ABC123', ''])(
    'falls back to home for %s rather than rendering nothing',
    (path) => {
      /*
       * The edge serves index.html for every unmatched path (wrangler.jsonc's
       * single-page-application handling), so an unknown path reaches the app rather than
       * 404ing. Something has to render. Home is the only answer that is never a dead end.
       *
       * `/room/ABC123` is in this list on purpose: it is the shape the multiplayer room
       * link will take, and until that route exists the app must degrade to home rather
       * than to a blank screen. When the route IS added this case moves out of the
       * fallback list, and its presence here is what will make that obvious.
       */
      expect(pathToRoute(path)).toBe('home')
    },
  )

  it('reports which paths are known, so the shell can normalize the ones that are not', () => {
    /*
     * Distinct from `pathToRoute` returning 'home', and the distinction is load-bearing:
     * both `/` and `/nonsense` resolve to home, but only one of them is a URL the app
     * should leave in the address bar. Without this the fallback is indistinguishable
     * from a hit and `/nonsense` stays visible while showing home.
     */
    expect(isKnownPath('/')).toBe(true)
    expect(isKnownPath('/edit')).toBe(true)
    expect(isKnownPath('/edit/')).toBe(true)
    expect(isKnownPath('/nonsense')).toBe(false)
    expect(isKnownPath('/room/ABC123')).toBe(false)
  })

  it('does not treat a query string or hash as part of the path', () => {
    // Nothing writes these today, but a share link with a `?utm_source=` on it is the
    // most ordinary thing in the world, and it must not turn /edit into an unknown path.
    expect(pathToRoute('/edit?from=twitter')).toBe('edit')
    expect(pathToRoute('/dex#cards')).toBe('dex')
    expect(isKnownPath('/edit?from=twitter')).toBe(true)
  })
})

describe('the Route union', () => {
  it('lists exactly the six screens the shell renders', () => {
    /*
     * A change detector by design, and worth it for this one value: ROUTES is what every
     * `it.each` above iterates, so a route silently dropped from it would make those
     * loops shrink and stay green. Pinning the set means the loops cannot quietly stop
     * covering something.
     */
    const expected: Route[] = ['boot', 'home', 'lobby', 'play', 'dex', 'edit']
    expect([...ROUTES].sort()).toEqual([...expected].sort())
  })
})
