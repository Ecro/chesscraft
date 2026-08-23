import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ART_ASSETS } from '@ui/art/assets'

type Review = {
  reviewer: string
  previewSizes: number[]
  grayscaleReviewed: boolean
  disposition: 'include' | 'exclude'
  rationale: string
}

type Pair = {
  name: string
  white: string
  black: string
  affected: boolean
  borderline: boolean
  metrics: Record<string, unknown>
  manualReview?: Review
}

type Fixture = {
  version: number
  baselineSha: string
  pairs: Pair[]
}

const fixture = JSON.parse(
  readFileSync(resolve(process.cwd(), 'tests/fixtures/art-side-contrast-targets.json'), 'utf8'),
) as Fixture
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
const EXPECTED_BASELINE_METRICS_SHA256 = 'd638baf7ea4d33c1bea6647ce2197376860f31ab2ab482ecc31d7635368def28'

describe('art side-contrast inventory', () => {
  it('S1a freezes every sided piece pair and its affected-pair decision', () => {
    expect(fixture.version).toBe(1)
    expect(fixture.baselineSha).toBe('d50289114a92dc363aca7c90f060600884efab04')
    expect(fixture.pairs).toHaveLength(33)

    const names = fixture.pairs.map((pair) => pair.name)
    expect(new Set(names).size).toBe(33)
    expect(names).toContain('archer')
    expect(names).toEqual(Object.keys(ART_ASSETS.piece).sort())
    expect(fixture.pairs.filter((pair) => pair.affected).map((pair) => pair.name).sort()).toEqual(EXPECTED_AFFECTED)
    expect(
      createHash('sha256')
        .update(JSON.stringify(fixture.pairs.map(({ name, metrics }) => ({ name, metrics }))))
        .digest('hex'),
    ).toBe(EXPECTED_BASELINE_METRICS_SHA256)

    for (const pair of fixture.pairs) {
      expect(pair.white, pair.name + ' white source').toMatch(/^src\/ui\/art\/assets\/piece-.+-white\.webp$/)
      expect(pair.black, pair.name + ' black source').toMatch(/^src\/ui\/art\/assets\/piece-.+-black\.webp$/)
      expect(pair.white).toBe(`src/ui/art/assets/piece-${pair.name}-white.webp`)
      expect(pair.black).toBe(`src/ui/art/assets/piece-${pair.name}-black.webp`)
      expect(typeof pair.affected).toBe('boolean')
      expect(typeof pair.borderline).toBe('boolean')
      expect(existsSync(resolve(process.cwd(), pair.white)), pair.name + ' white file').toBe(true)
      expect(existsSync(resolve(process.cwd(), pair.black)), pair.name + ' black file').toBe(true)
    }
  })

  it('S1b does not leave a borderline visual decision without evidence', () => {
    const borderline = fixture.pairs.filter((pair) => pair.borderline)
    expect(borderline.length).toBeGreaterThan(0)
    expect(fixture.pairs.find((pair) => pair.name === 'archer')?.borderline).toBe(true)

    for (const pair of borderline) {
      const review = pair.manualReview
      expect(review, pair.name + ' has no manual review').toBeDefined()
      expect(review!.reviewer, pair.name + ' reviewer').toBe('Codex')
      expect(review!.previewSizes, pair.name + ' preview sizes').toEqual(expect.arrayContaining([192, 28, 40, 55]))
      expect(review!.grayscaleReviewed, pair.name + ' grayscale review').toBe(true)
      expect(review!.disposition, pair.name + ' disposition').toMatch(/^(include|exclude)$/)
      expect(review!.rationale.trim().length, pair.name + ' rationale').toBeGreaterThan(12)
    }
  })

  it('S1c keeps archer in the affected set even if a metric implementation changes', () => {
    expect(fixture.pairs.find((pair) => pair.name === 'archer')?.affected).toBe(true)
  })
})
