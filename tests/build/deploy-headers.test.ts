import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ROUTES, routeToPath } from '@ui/router'

/**
 * The cache policy the deployed origin serves, asserted over the BUILT `dist/_headers`.
 *
 * Over the build output rather than over `public/_headers`, for the same reason
 * `precache.test.ts` reads `dist/sw.js`: the source file can be perfectly correct and the
 * deployed site still carry no policy at all, because what decides the answer is whether
 * Vite copied `public/` into the bundle. A source-level test passes on a build where the
 * file never shipped.
 *
 * What it is guarding is not a preference. Get the two directions backwards — HTML cached
 * hard, hashed assets not — and a returning visitor is pinned to an old `index.html` whose
 * script tags name bundles that no longer exist, and whose `sw.js` registration points at
 * a worker that has been replaced. The app 404s on its own assets and there is no user
 * action that recovers it, because the stale shell is what the cache keeps handing back.
 * That failure does not appear in any local run: it needs a *second* deploy to exist.
 *
 * `_headers` is Cloudflare's format and applies to asset responses only — never to
 * responses a Worker generates. This project ships an assets-only Worker (no `main`), so
 * every response is an asset response and the file governs all of them. If a Worker script
 * is ever added, this test keeps passing while the policy silently stops applying to
 * whatever that script serves — which is why the wrangler-side assertion in
 * `tests/structure/deploy-config.test.ts` pins the absence of `main`.
 */

const DIST = join(process.cwd(), 'dist')

/** One rule block from `_headers`: the path pattern and the headers under it. */
interface Rule {
  readonly path: string
  readonly headers: ReadonlyMap<string, string>
}

/**
 * Parse the `_headers` format.
 *
 * Indentation-sensitive: an unindented line opens a path pattern, and the indented lines
 * under it are that pattern's headers. Parsing rather than substring-matching is
 * deliberate — `expect(text).toContain('immutable')` passes on a file where `immutable`
 * sits under the wrong path, which is the exact mistake this file exists to catch.
 *
 * Pure, and separated from the file read, so the parser can be tested against fixtures.
 * A hand-rolled parser inside a test file is a place where a bug turns a real failure into
 * a pass — specifically, mis-attributing an indented line to the wrong preceding block
 * would let the "nothing else is immutable" assertion below succeed against a file where
 * something else IS immutable. `parses each block against its own path` is what closes it.
 * A parser this small does not need a test; a parser that decides whether other assertions
 * mean anything does.
 */
export function parseHeaders(text: string): Rule[] {
  const parsed: Rule[] = []
  let current: { path: string; headers: Map<string, string> } | null = null

  for (const raw of text.split('\n')) {
    if (raw.trim() === '' || raw.trimStart().startsWith('#')) continue

    if (!/^\s/.test(raw)) {
      if (current) parsed.push(current)
      current = { path: raw.trim(), headers: new Map() }
      continue
    }

    expect(current, `header line "${raw.trim()}" appears before any path pattern`).toBeTruthy()
    const [name, ...rest] = raw.trim().split(':')
    current!.headers.set(name!.trim().toLowerCase(), rest.join(':').trim())
  }
  if (current) parsed.push(current)

  return parsed
}

function rules(): Rule[] {
  const file = join(DIST, '_headers')
  expect(
    existsSync(file),
    'dist/_headers is missing — either `public/_headers` does not exist, or the build did not copy it. Run `npm run build` first (npm run verify does).',
  ).toBe(true)

  return parseHeaders(readFileSync(file, 'utf8'))
}

function ruleFor(path: string): Rule {
  const found = rules().find((r) => r.path === path)
  expect(
    found,
    `dist/_headers has no rule for "${path}" — patterns present: ${rules()
      .map((r) => r.path)
      .join(', ')}`,
  ).toBeTruthy()
  return found!
}

/**
 * Everything a browser must revalidate rather than reuse from disk.
 *
 * The route paths are DERIVED from the router rather than typed out. Every route is
 * rewritten to the same `index.html` by the edge, so every route is the shell and every
 * route must revalidate — and a hand-written list is a list that goes stale the first time
 * someone adds a route. It went stale before it was ever written: the first version of this
 * array named only `/`, leaving `/lobby`, `/play`, `/dex` and `/edit` — the four addresses
 * ADR-003 exists to make shareable — with no asserted policy at all. Deriving them means
 * adding a route without a `_headers` entry fails here instead of shipping uncovered.
 *
 * `/` is still listed by the router (as `boot`'s and `home`'s path) rather than separately
 * from `/index.html`, because a navigation asks for the URL, not for the file — the same
 * reason `vite-plugin-sw.ts` precaches `/` by hand.
 */
const MUST_REVALIDATE = [
  ...new Set(ROUTES.map(routeToPath)),
  '/index.html',
  '/sw.js',
  '/manifest.webmanifest',
]

describe('the _headers parser these assertions rest on', () => {
  it('attributes each header to the block it is indented under, not to a neighbour', () => {
    const parsed = parseHeaders(
      ['# a comment', '/a/*', '  Cache-Control: public, immutable', '', '/b', '  Cache-Control: no-cache'].join('\n'),
    )

    expect(parsed.map((r) => r.path)).toEqual(['/a/*', '/b'])
    expect(parsed[0]!.headers.get('cache-control')).toBe('public, immutable')
    /*
     * The load-bearing half. If the parser leaked `/a/*`'s value into `/b`, the
     * "nothing outside /assets/* is immutable" assertion below would be checking a
     * value that never appeared in the file, and would pass on a file that violates it.
     */
    expect(parsed[1]!.headers.get('cache-control')).toBe('no-cache')
  })

  it('keeps a header value containing a colon intact', () => {
    // `split(':')` on `max-age=0, s-maxage=1` is fine, but a value with a colon in it
    // (a URL in a CSP, say) would be truncated by a naive `[name, value] = split`.
    const parsed = parseHeaders(['/x', '  Content-Security-Policy: default-src https://example.com'].join('\n'))
    expect(parsed[0]!.headers.get('content-security-policy')).toBe('default-src https://example.com')
  })
})

describe('deploy cache policy', () => {
  it('serves hashed assets as immutable, so a returning visitor re-downloads nothing', () => {
    const cacheControl = ruleFor('/assets/*').headers.get('cache-control')

    expect(cacheControl, '/assets/* carries no Cache-Control').toBeTruthy()
    expect(cacheControl, `/assets/* is not immutable: "${cacheControl}"`).toContain('immutable')
    expect(cacheControl, `/assets/* has no long max-age: "${cacheControl}"`).toMatch(/max-age=31536000/)
  })

  it.each(MUST_REVALIDATE)('makes %s revalidate, so a new build is never hidden behind a cache', (path) => {
    const cacheControl = ruleFor(path).headers.get('cache-control')

    expect(cacheControl, `${path} carries no Cache-Control`).toBeTruthy()
    /*
     * `no-cache` means "revalidate before reuse", NOT "do not store" — that is `no-store`,
     * which would also defeat the offline cache the service worker exists to fill. The
     * distinction is the whole point of the header, and getting it wrong here would break
     * the PWA while looking like a more cautious choice.
     */
    expect(cacheControl, `${path} must revalidate: "${cacheControl}"`).toContain('no-cache')
    expect(cacheControl, `${path} must not be no-store — that defeats the offline cache: "${cacheControl}"`).not.toContain(
      'no-store',
    )
  })

  it('does not mark anything under / as immutable by a broader rule', () => {
    /*
     * The dangerous shape is a catch-all `/*` block carrying `immutable` that later
     * revalidating rules are assumed to override. Cloudflare applies EVERY matching rule,
     * so such a file would send two conflicting Cache-Control values and the outcome stops
     * being something this repo decides. Assert no rule outside /assets/* claims immutable.
     */
    const offenders = rules()
      .filter((r) => r.path !== '/assets/*')
      .filter((r) => (r.headers.get('cache-control') ?? '').includes('immutable'))
      .map((r) => r.path)

    expect(offenders, `these non-asset paths claim immutable: ${offenders.join(', ')}`).toEqual([])
  })
})
