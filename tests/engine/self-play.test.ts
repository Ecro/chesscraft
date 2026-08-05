import { describe, expect, it } from 'vitest'
import { BUNDLED_PRESET_ID } from '@content/sets/bundled'
import { playOut } from '@engine/agent'
import { PLY_CAP } from '@engine/engine'
import { shippedContent } from '../helpers/shipped'

/**
 * AC-012 — 1000 self-play matches: median at most 40 plies, maximum at most 60.
 *
 * The oracle here is differential, not golden: nobody can write down the right
 * median in advance. What makes the number meaningful is that the agent is
 * uniform-random over `legalActions` and shares no code with move generation or
 * evaluation, so the distribution measures the CONTENT, not a heuristic that
 * happens to agree with the engine. It also draws from its own PRNG substream
 * (ADR-014), which is why running the agent cannot perturb the draft offers it
 * plays against.
 *
 * Measured against the SHIPPED bundle. A median from the Phase 3 slice would be
 * a number about content no player receives.
 *
 * The remedy if this fails is content-level only (PLAN Risk R-4): the 60-ply
 * cap and the Los Alamos array are SPEC-fixed. The per-rule-card table below
 * exists to make that remedy actionable — it names which card to look at.
 */

const content = shippedContent()
const SEEDS = 1000

interface Sample {
  seed: number
  plies: number
  ruleCardId: string | null
  result: string
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!
}

const samples: Sample[] = []
for (let seed = 1; seed <= SEEDS; seed += 1) {
  const out = playOut(content, BUNDLED_PRESET_ID, seed)
  samples.push({
    seed,
    plies: out.plies,
    ruleCardId: out.state.ruleCardId,
    result: out.result ? `${out.result.kind}:${out.result.reason}` : 'none',
  })
}

const lengths = samples.map((s) => s.plies)

describe('AC-012 self-play match length', () => {
  it('finishes every one of the 1000 matches', () => {
    // Reported before the length assertions on purpose: an unfinished match has
    // no meaningful length, so a median computed over one is not a measurement.
    const unfinished = samples.filter((s) => s.result === 'none')
    expect(unfinished.map((s) => s.seed).slice(0, 10)).toEqual([])
  })

  it('has a median of at most 40 plies', () => {
    expect(median(lengths)).toBeLessThanOrEqual(40)
  })

  it('has a maximum of at most 60 plies', () => {
    expect(Math.max(...lengths)).toBeLessThanOrEqual(PLY_CAP)
  })

  it('reports the length distribution per rule card, so a miss names its cause', () => {
    // Not a threshold — a REPORT. PLAN Risk R-4 permits content-level remedies
    // only, and "the median is too high" is not actionable without knowing
    // which card carries the tail.
    const byCard = new Map<string, number[]>()
    for (const s of samples) {
      const key = s.ruleCardId ?? '(none)'
      byCard.set(key, [...(byCard.get(key) ?? []), s.plies])
    }

    const rows = [...byCard.entries()]
      .map(([card, plies]) => ({
        card,
        n: plies.length,
        median: median(plies),
        max: Math.max(...plies),
      }))
      .sort((a, b) => b.median - a.median)

    // eslint-disable-next-line no-console
    console.table(rows)

    // Every rule card in the shipped preset must actually have been drawn, or
    // the report has a blind spot and a slow card could be hiding in it.
    const preset = content.presets.get(BUNDLED_PRESET_ID)!
    expect([...byCard.keys()].sort()).toEqual([...preset.ruleCardIds].sort())
    for (const row of rows) expect(row.n, `${row.card} was drawn too rarely to report on`).toBeGreaterThan(10)
  })

  it('ends by more than one route, so the cap is not doing all the work', () => {
    // If every match ended at the material cap, the median would be 60 and the
    // win conditions would be decorative. Conversely, a suite that only checked
    // the median could pass with every match ending the same way.
    const routes = new Set(samples.map((s) => s.result))
    expect(routes.size).toBeGreaterThan(1)
    const capped = samples.filter((s) => s.result.endsWith('material_cap')).length
    expect(capped / SEEDS, 'nearly every match ran to the ply cap').toBeLessThan(0.9)
  })
})
