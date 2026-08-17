import { describe, expect, it } from 'vitest'
import { ART_ASSETS } from '@ui/art/assets'
import { artRegistry } from '@ui/art/registry'

/**
 * Source-level guard for the raster contrast gate.
 *
 * The real luminance measurement belongs to `e2e/art-rendered-contrast.spec.ts`:
 * it composites the loaded WebP at the board's CSS size over the actual square.
 * This unit gate keeps that browser check from becoming vacuous by proving that
 * both side-specific sources are present and that every registry entry is a
 * bundled WebP before the browser tries to measure it.
 */
describe('raster art contrast inputs', () => {
  it('keeps a distinct white/black source for every piece', () => {
    const pieces = Object.entries(ART_ASSETS.piece)
    expect(pieces.length).toBe(33)
    for (const [name, pair] of pieces) {
      expect(pair.white, `${name} white asset`).toMatch(/piece-.+-white\.webp$/)
      expect(pair.black, `${name} black asset`).toMatch(/piece-.+-black\.webp$/)
      expect(pair.white).not.toBe(pair.black)
    }
  })

  it('gives the rendered contrast gate only non-empty WebP registry sources', () => {
    for (const [id, entry] of artRegistry) {
      const urls = entry.kind === 'sided' ? [entry.white, entry.black] : [entry.src]
      for (const url of urls) expect(url, `${id} has no raster source`).toMatch(/\.webp(?:$|\?)/)
    }
  })
})
