import { describe, expect, it } from 'vitest'
import { ART_ASSETS, BRAND_ART, CHROME_ART } from '@ui/art/assets'
import { artRegistry } from '@ui/art/registry'

describe('bundled raster art inventory', () => {
  const assetName = (src: string) => src.split('/').pop()?.split('?')[0] ?? ''

  it('S1 ships a complete sided piece set and neutral surface sets', () => {
    expect(Object.keys(ART_ASSETS.piece)).toHaveLength(37)
    expect(Object.keys(ART_ASSETS.square)).toHaveLength(27)
    expect(Object.keys(ART_ASSETS.card)).toHaveLength(90)
    expect(Object.keys(CHROME_ART)).toEqual(['navPlay', 'navBuild', 'navDex', 'erase'])
    expect(Object.keys(BRAND_ART)).toEqual(['crest'])

    for (const [name, piece] of Object.entries(ART_ASSETS.piece)) {
      expect(assetName(piece.white)).toBe(`piece-${name}-white.webp`)
      expect(assetName(piece.black)).toBe(`piece-${name}-black.webp`)
      expect(piece.white).not.toBe(piece.black)
    }
    for (const [name, src] of Object.entries(ART_ASSETS.square)) {
      expect(assetName(src)).toBe(`square-${name}.webp`)
    }
    for (const [name, src] of Object.entries(ART_ASSETS.card)) {
      expect(assetName(src)).toBe(`card-${name}.webp`)
    }
    const chromeFiles = { navPlay: 'chrome-nav-play.webp', navBuild: 'chrome-nav-build.webp', navDex: 'chrome-nav-dex.webp', erase: 'chrome-erase.webp' }
    for (const [name, src] of Object.entries(CHROME_ART)) {
      expect(assetName(src)).toBe(chromeFiles[name as keyof typeof chromeFiles])
    }
    expect(assetName(BRAND_ART.crest)).toBe('chrome-brand.webp')
  })

  it('S2 routes every registry entry to an explicit imported image surface', () => {
    expect(artRegistry).toHaveLength(154)
    const imported = new Set([
      ...Object.values(ART_ASSETS.piece).flatMap((pair) => [pair.white, pair.black]),
      ...Object.values(ART_ASSETS.square),
      ...Object.values(ART_ASSETS.card),
    ])
    for (const entry of artRegistry.values()) {
      expect(['piece', 'square', 'card']).toContain(entry.surface)
      if (entry.surface === 'piece') {
        expect(entry.kind).toBe('sided')
        if (entry.kind !== 'sided') continue
        expect(imported.has(entry.white)).toBe(true)
        expect(imported.has(entry.black)).toBe(true)
      } else {
        expect(entry.kind).toBe('neutral')
        if (entry.kind !== 'neutral') continue
        expect(imported.has(entry.src)).toBe(true)
      }
    }
  })
})
