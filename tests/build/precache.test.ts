import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ART_ASSETS, BRAND_ART, CHROME_ART } from '@ui/art/assets'

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
  it('contains the complete bundled raster catalogue and the font', () => {
    const listed = precache()
    // Hashed, so matched by shape rather than by name — asserting a literal
    // filename would be asserting the hash, which changes every build.
    const font = listed.filter((p) => /\/assets\/.*\.woff2$/.test(p))
    expect(font, `no font in PRECACHE:\n${listed.join('\n')}`).toHaveLength(1)
    const art = listed.filter((p) => /\/assets\/(?:piece|square|card|chrome)-.*\.webp$/.test(p))
    const expectedArt =
      Object.keys(ART_ASSETS.piece).length * 2 +
      Object.keys(ART_ASSETS.square).length +
      Object.keys(ART_ASSETS.card).length +
      Object.keys(CHROME_ART).length +
      Object.keys(BRAND_ART).length
    expect(art, `expected all ${expectedArt} raster files in PRECACHE:\n${listed.join('\n')}`).toHaveLength(expectedArt)
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
