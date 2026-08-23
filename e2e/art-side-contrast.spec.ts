import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

type Pair = {
  name: string
  white: string
  black: string
  affected: boolean
  metrics: {
    source: {
      whiteOpaque: number
      blackOpaque: number
      sharedWarmOverlap: number
      opponentMargin: number
      maskIou: number
      sideValueRatio: number
      whiteMeanY: number
      blackMeanY: number
    }
  }
}

type Fixture = {
  version: number
  baselineSha: string
  pairs: Pair[]
}

const FIXTURE = JSON.parse(
  readFileSync(resolve(process.cwd(), 'tests/fixtures/art-side-contrast-targets.json'), 'utf8'),
) as Fixture

const ASSET_ROOT = resolve(process.cwd())
const ALPHA_FLOOR = 16
const SIDE_VALUE_FLOOR = 2.75
const OPPONENT_MARGIN_FLOOR = 0.2
const SHARED_WARM_OVERLAP_CEILING = 0.12
const BASELINE_FLOAT_PRECISION = 5
const EXPECTED_AFFECTED = [
  'archer',
  'banner',
  'bow',
  'lantern',
  'orb',
  'queen',
  'shield',
  'staff',
  'talon',
  'urn',
  'watchtower',
  'wheel',
].sort()

function dataUrl(relativePath: string) {
  const bytes = readFileSync(resolve(ASSET_ROOT, relativePath))
  return 'data:image/webp;base64,' + bytes.toString('base64')
}

type SourcePair = { name: string; white: string; black: string; affected: boolean }
type BoardSize = '192' | '28' | '40' | '55'
type Measurement = {
  whiteOpaque: number
  blackOpaque: number
  sharedWarmOverlap: number
  opponentMargin: number
  maskIou: number
  sideValueRatio: number
  whiteMeanY: number
  blackMeanY: number
}
type Measurements = Record<BoardSize, Measurement>

async function measurePair(page: import('@playwright/test').Page, pair: SourcePair) {
  return page.evaluate(
    async ({ pair, alphaFloor }) => {
      const srgb = (channel: number) => {
        const value = channel / 255
        return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
      }
      const luminance = (r: number, g: number, b: number) =>
        0.2126 * srgb(r) + 0.7152 * srgb(g) + 0.0722 * srgb(b)
      const ratio = (a: number, b: number) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
      const load = (src: string) =>
        new Promise<HTMLImageElement>((resolve, reject) => {
          const image = new Image()
          image.onload = () => resolve(image)
          image.onerror = () => reject(new Error('could not decode ' + src.slice(0, 48)))
          image.src = src
        })
      const draw = (image: HTMLImageElement, size: number) => {
        const canvas = document.createElement('canvas')
        canvas.width = size
        canvas.height = size
        const context = canvas.getContext('2d')!
        context.clearRect(0, 0, size, size)
        context.drawImage(image, 0, 0, size, size)
        return context.getImageData(0, 0, size, size).data
      }
      const summarize = (data: Uint8ClampedArray) => {
        let opaque = 0
        let warm = 0
        let blue = 0
        let red = 0
        let meanY = 0
        const mask = new Uint8Array(data.length / 4)
        for (let i = 0, pixel = 0; i < data.length; i += 4, pixel += 1) {
          if (data[i + 3]! < alphaFloor) continue
          const r = data[i]!
          const g = data[i + 1]!
          const b = data[i + 2]!
          mask[pixel] = 1
          opaque += 1
          meanY += luminance(r, g, b)
          if (r >= 96 && r - g >= 25 && r - b >= 25) warm += 1
          if (b - Math.max(r, g) >= 18) blue += 1
          if (r - Math.max(g, b) >= 18) red += 1
        }
        return {
          opaque,
          warm,
          blue,
          red,
          meanY: opaque ? meanY / opaque : 0,
          blueShare: opaque ? blue / opaque : 0,
          redShare: opaque ? red / opaque : 0,
          mask,
        }
      }
      const compare = (whiteData: Uint8ClampedArray, blackData: Uint8ClampedArray) => {
        const white = summarize(whiteData)
        const black = summarize(blackData)
        let shared = 0
        let warmBoth = 0
        let intersection = 0
        let union = 0
        for (let i = 0; i < white.mask.length; i += 1) {
          const whiteOpaque = white.mask[i] === 1
          const blackOpaque = black.mask[i] === 1
          if (whiteOpaque || blackOpaque) union += 1
          if (whiteOpaque && blackOpaque) {
            shared += 1
            intersection += 1
            if (
              whiteData[i * 4]! >= 96 &&
              whiteData[i * 4]! - whiteData[i * 4 + 1]! >= 25 &&
              whiteData[i * 4]! - whiteData[i * 4 + 2]! >= 25 &&
              blackData[i * 4]! >= 96 &&
              blackData[i * 4]! - blackData[i * 4 + 1]! >= 25 &&
              blackData[i * 4]! - blackData[i * 4 + 2]! >= 25
            ) {
              warmBoth += 1
            }
          }
        }
        return {
          whiteOpaque: white.opaque,
          blackOpaque: black.opaque,
          sharedWarmOverlap: shared ? warmBoth / shared : 1,
          opponentMargin: Math.min(white.blueShare - black.blueShare, black.redShare - white.redShare),
          maskIou: union ? intersection / union : 0,
          sideValueRatio: ratio(white.meanY, black.meanY),
          whiteMeanY: white.meanY,
          blackMeanY: black.meanY,
        }
      }

      const whiteImage = await load(pair.white)
      const blackImage = await load(pair.black)
      const measurements: Measurements = {
        '192': compare(draw(whiteImage, 192), draw(blackImage, 192)),
        '28': compare(draw(whiteImage, 28), draw(blackImage, 28)),
        '40': compare(draw(whiteImage, 40), draw(blackImage, 40)),
        '55': compare(draw(whiteImage, 55), draw(blackImage, 55)),
      }
      return {
        name: pair.name,
        naturalSize: {
          white: [whiteImage.naturalWidth, whiteImage.naturalHeight],
          black: [blackImage.naturalWidth, blackImage.naturalHeight],
        },
        measurements,
      }
    },
    {
      pair: {
        name: pair.name,
        white: dataUrl(pair.white),
        black: dataUrl(pair.black),
        affected: pair.affected,
      },
      alphaFloor: ALPHA_FLOOR,
    },
  )
}

test('S1d baseline inventory contains every sided piece pair', async ({ page }) => {
  expect(FIXTURE.version).toBe(1)
  expect(FIXTURE.pairs).toHaveLength(33)
  expect(FIXTURE.pairs.map((pair) => pair.name)).toContain('archer')

  const measured = []
  for (const pair of FIXTURE.pairs) measured.push(await measurePair(page, pair))

  expect(measured).toHaveLength(33)
  expect(measured.every((pair) => pair.naturalSize.white.join('x') === '192x192')).toBe(true)
  expect(measured.every((pair) => pair.naturalSize.black.join('x') === '192x192')).toBe(true)
  expect(FIXTURE.pairs.map((pair) => pair.name).sort()).toEqual(
    [...new Set(FIXTURE.pairs.map((pair) => pair.name))].sort(),
  )
  for (let index = 0; index < FIXTURE.pairs.length; index += 1) {
    const pair = FIXTURE.pairs[index]!
    const current = measured[index]!.measurements['192']
    if (pair.affected) continue
    for (const key of ['whiteOpaque', 'blackOpaque'] as const) {
      expect(current[key], pair.name + ' unchanged baseline ' + key).toBe(pair.metrics.source[key])
    }
    for (const key of [
      'sharedWarmOverlap',
      'opponentMargin',
      'maskIou',
      'sideValueRatio',
      'whiteMeanY',
      'blackMeanY',
    ] as const) {
      // WebKit and Chromium can decode the same WebP into luminance values
      // that differ below the meaningful pixel threshold. Keep exact checks
      // for counts while allowing that engine-level floating-point noise.
      expect(current[key], pair.name + ' unchanged baseline ' + key).toBeCloseTo(
        pair.metrics.source[key],
        BASELINE_FLOAT_PRECISION,
      )
    }
  }
})

test('S1e affected pairs keep side identity at source and board sizes', async ({ page }) => {
  expect(FIXTURE.pairs.find((pair) => pair.name === 'archer')?.affected).toBe(true)
  const affected = FIXTURE.pairs.filter((pair) => pair.affected)
  expect(affected.map((pair) => pair.name).sort()).toEqual(EXPECTED_AFFECTED)

  for (const pair of affected) {
    const measured = await measurePair(page, pair)
    const source = measured.measurements['192']
    expect(source.maskIou, pair.name + ' silhouette').toBeGreaterThanOrEqual(0.98)
    expect(source.sharedWarmOverlap, pair.name + ' warm overlap').toBeLessThan(SHARED_WARM_OVERLAP_CEILING)
    expect(source.opponentMargin, pair.name + ' opponent margin').toBeGreaterThanOrEqual(OPPONENT_MARGIN_FLOOR)
    expect(source.sideValueRatio, pair.name + ' source side value').toBeGreaterThanOrEqual(SIDE_VALUE_FLOOR)
    expect(source.whiteMeanY, pair.name + ' blue-side value order').toBeGreaterThan(source.blackMeanY)

    for (const size of ['28', '40', '55'] as const) {
      const rendered = measured.measurements[size]
      expect(rendered.sharedWarmOverlap, pair.name + ' ' + size + 'px warm overlap').toBeLessThan(
        SHARED_WARM_OVERLAP_CEILING,
      )
      expect(rendered.opponentMargin, pair.name + ' ' + size + 'px opponent margin').toBeGreaterThanOrEqual(
        OPPONENT_MARGIN_FLOOR,
      )
      expect(rendered.sideValueRatio, pair.name + ' ' + size + 'px side value').toBeGreaterThanOrEqual(
        SIDE_VALUE_FLOOR,
      )
      expect(rendered.whiteMeanY, pair.name + ' ' + size + 'px value order').toBeGreaterThan(
        rendered.blackMeanY,
      )
    }
  }
})
