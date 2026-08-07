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
  it('contains the hashed font, so the installed app reads right offline', () => {
    /*
     * This used to name the one raster art asset. The Chess Craft redesign draws
     * every mark from a sprite sheet in TypeScript, so there is no picture file
     * left to precache — but the claim these two tests exist to make is not
     * about pictures. It is that a non-code asset reaches the offline cache by
     * going through the BUNDLER rather than through `public/`, whose contents
     * `vite-plugin-sw.ts` has to enumerate by hand and has already gone stale on
     * once. The half-megabyte Korean pixel font is now the asset that claim is
     * about, and it fails far more visibly: without it an installed app reads in
     * the system face and stops looking like itself.
     */
    const listed = precache()
    // Hashed, so matched by shape rather than by name — asserting a literal
    // filename would be asserting the hash, which changes every build.
    const font = listed.filter((p) => /\/assets\/.*\.woff2$/.test(p))
    expect(font, `no font in PRECACHE:\n${listed.join('\n')}`).toHaveLength(1)
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

  it('emitted the font through the bundler, not through public/', () => {
    // The positive check above would also pass if someone hand-added a
    // `public/` path to the plugin's list. This is the structural half: the
    // asset must carry a content hash, which only the bundler adds.
    const emitted = readdirSync(join(DIST, 'assets')).filter((f) => f.endsWith('.woff2'))
    expect(emitted, 'no bundler-emitted font in dist/assets').toHaveLength(1)
    expect(emitted[0], 'font filename carries no content hash — it was copied, not bundled').toMatch(
      /-[A-Za-z0-9_-]{8,}\.woff2$/,
    )
  })
})
