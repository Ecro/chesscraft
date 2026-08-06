import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * The art asset is in the service worker's precache list (ADR-009/ADR-010).
 *
 * Asserted over the BUILT `dist/sw.js`, never over `vite-plugin-sw.ts`. That
 * distinction is the entire value of this file: the plugin's source can be
 * perfectly correct and the app still ship art it cannot show offline, because
 * what decides the answer is whether the asset went through the bundler at all.
 * `public/` is copied around Rollup, so anything there is absent from the
 * plugin's `...assets` and has to be listed by hand — which that plugin's own
 * comment records going stale once already, when the maskable icon was missed.
 *
 * A source-level test would have passed on that build. This one fails.
 */

const DIST = join(process.cwd(), 'dist')

/** The `PRECACHE` array the plugin bakes into the worker. */
function precache(): string[] {
  const sw = join(DIST, 'sw.js')
  expect(existsSync(sw), 'dist/sw.js is missing — run `npm run build` first (npm run verify does)').toBe(true)

  const text = readFileSync(sw, 'utf8')
  const match = text.match(/const PRECACHE = (\[[\s\S]*?\n\])/)
  expect(match, 'could not find the PRECACHE array in dist/sw.js — the worker template changed').toBeTruthy()
  return JSON.parse(match![1]!) as string[]
}

describe('service worker precache', () => {
  it('contains the hashed art asset, so the installed app can draw it offline', () => {
    const listed = precache()

    // Hashed, so matched by shape rather than by name — asserting a literal
    // filename would be asserting the hash, which changes every build.
    const art = listed.filter((p) => /\/assets\/.*square-bomb.*\.webp$/.test(p))
    expect(art, `no art asset in PRECACHE:\n${listed.join('\n')}`).toHaveLength(1)
  })

  it('lists an asset that actually exists on disk', () => {
    // A precache entry for a file that is not there fails `cache.addAll`
    // atomically, so the whole worker install fails and the app has no offline
    // mode at all — a far louder failure than a missing picture, and one this
    // catches at build time instead of on a phone.
    for (const path of precache()) {
      if (path === '/' || path.endsWith('/')) continue
      expect(existsSync(join(DIST, path.replace(/^\//, ''))), `PRECACHE lists ${path}, which is not in dist/`).toBe(true)
    }
  })

  it('emitted the art through the bundler, not through public/', () => {
    // The positive check above would also pass if someone hand-added a
    // `public/` path to the plugin's list. This is the structural half: the
    // asset must carry a content hash, which only the bundler adds.
    const emitted = readdirSync(join(DIST, 'assets')).filter((f) => f.includes('square-bomb'))
    expect(emitted, 'no bundler-emitted art in dist/assets').toHaveLength(1)
    expect(emitted[0], 'art filename carries no content hash — it was copied, not bundled').toMatch(
      /square-bomb-[A-Za-z0-9_-]{8,}\.webp$/,
    )
  })
})
