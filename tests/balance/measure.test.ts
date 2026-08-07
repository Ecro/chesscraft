import { describe, expect, it } from 'vitest'
import { classify } from '@balance/bands'
import { measureAll, measureRecord } from '@balance/measure'
import { BUNDLED_PRESET_ID } from '@content/sets/bundled'
import { shippedContent } from '../helpers/shipped'

/**
 * PLAN Phase 2 — the measurement harness.
 *
 * ADR-002 defines a record's grade as the win-rate delta it produces against a
 * fixed baseline, so what has to be true of this module is narrower than "it
 * returns a number": the number must be reproducible, and it must be ZERO when
 * the record changes nothing.
 *
 * The zero case is the sharp one. The repo's own card survey found that 3 of 4
 * broken cards DID change state — just the wrong state — so a probe asking only
 * "did the number move?" clears the failures that matter. A no-op candidate that
 * measures exactly 0.0 is what proves the rig is measuring the record rather
 * than its own construction.
 */

const content = shippedContent()
const SEEDS = 40
const REFERENCE_PIECE = 'piece.pawn'
const REFERENCE_SKILL = 'skill.teleport'
const BASELINE = {
  presetId: BUNDLED_PRESET_ID,
  referencePieceId: REFERENCE_PIECE,
  referenceSkillCardId: REFERENCE_SKILL,
} as const

describe('PLAN Phase 2 — reproducibility', () => {
  it('returns identical numbers for the same record and the same seed base', () => {
    const candidate = { kind: 'piece', pieceId: 'piece.queen', replaces: REFERENCE_PIECE } as const
    const a = measureRecord(
      content,
      BASELINE, candidate, { seeds: SEEDS })
    const b = measureRecord(
      content,
      BASELINE, candidate, { seeds: SEEDS })
    expect(a).toEqual(b)
  })

  it('reports the sample count it actually used', () => {
    const out = measureRecord(
      content,
      BASELINE,
      { kind: 'skill', skillCardId: 'skill.volley' },
      { seeds: SEEDS },
    )
    expect(out.ok, out.ok ? '' : out.reason).toBe(true)
    if (!out.ok) return
    expect(out.measurement.n).toBe(SEEDS)
  })
})

describe('PLAN Phase 2 — a record that changes nothing measures exactly nothing', () => {
  it('measures 0.0 with 0.0 error for the reference skill card — the origin of the scale', () => {
    const out = measureRecord(content, BASELINE, { kind: 'skill', skillCardId: REFERENCE_SKILL }, { seeds: SEEDS })
    expect(out.ok, out.ok ? '' : out.reason).toBe(true)
    if (!out.ok) return
    expect(out.measurement.delta).toBe(0)
    expect(out.measurement.stderr).toBe(0)
    expect(out.measurement.everChanged, 'the reference card differed from itself').toBe(false)
  })

  it('measures 0.0 with 0.0 error when a piece replaces itself', () => {
    const out = measureRecord(
      content,
      BASELINE,
      { kind: 'piece', pieceId: REFERENCE_PIECE, replaces: REFERENCE_PIECE },
      { seeds: SEEDS },
    )
    expect(out.ok, out.ok ? '' : out.reason).toBe(true)
    if (!out.ok) return
    expect(out.measurement.delta).toBe(0)
    expect(out.measurement.stderr).toBe(0)
  })

})

describe('PLAN Phase 2 — the skill axis is capable of measuring something', () => {
  /**
   * The test this replaces asserted the opposite and was WRONG in a way that
   * hid a dead axis: it pinned "a skill card the shared pool already deals
   * measures 0.0" as correct. Every bundled skill card is in that pool, so the
   * whole skill half of `measureAll` returned 0.00 ± 0.00 for all fourteen
   * cards and the suite was green — one test asserting the zero, the rest
   * asserting only that the numbers were finite.
   *
   * A grade axis that cannot produce a non-zero number is not a lenient grade
   * axis, it is an absent one, and this is the assertion whose absence let it
   * through.
   */
  const graded = measureAll(content, BASELINE, { seeds: SEEDS })

  it('does not grade every bundled skill card identically', () => {
    const deltas = [...content.skillCards.keys()].map((id) => {
      const outcome = graded.get(id)
      return outcome?.ok ? outcome.measurement.delta : Number.NaN
    })
    expect(deltas.length).toBeGreaterThan(1)
    expect(new Set(deltas).size, `all ${deltas.length} skill cards graded the same — the axis is inert`).toBeGreaterThan(1)
  })

  it('moves at least one skill card off zero', () => {
    const nonZero = [...content.skillCards.keys()].filter((id) => {
      const outcome = graded.get(id)
      return outcome?.ok === true && outcome.measurement.delta !== 0
    })
    expect(nonZero.length, 'every skill card measured exactly zero').toBeGreaterThan(0)
  })
})

describe('PLAN Phase 2 — the sign of the delta tracks the direction of the change', () => {
  it('scores a strictly stronger army above the baseline', () => {
    const out = measureRecord(
      content,
      BASELINE,
      { kind: 'piece', pieceId: 'piece.queen', replaces: REFERENCE_PIECE },
      { seeds: SEEDS },
    )
    expect(out.ok, out.ok ? '' : out.reason).toBe(true)
    if (!out.ok) return
    // Every white pawn becomes a queen. The assertion is directional rather than
    // a tuned threshold (ADR-002 rejects invented numbers), but it is tied to the
    // measurement's OWN error: `> 0` alone cannot tell a real effect from noise
    // that happened to land positive, and `> stderr` can.
    expect(out.measurement.delta).toBeGreaterThan(out.measurement.stderr)
  })
})

describe('PLAN Phase 2 — every bundled record can be graded', () => {
  const graded = measureAll(content, BASELINE, { seeds: SEEDS })

  it('grades every non-royal bundled piece and every bundled skill card', () => {
    const preset = content.presets.get(BUNDLED_PRESET_ID)!
    const expectedPieces = preset.pieceIds.filter((id) => !content.pieces.get(id)?.royal)
    for (const id of expectedPieces) expect(graded.has(id), `no grade for piece ${id}`).toBe(true)
    for (const id of content.skillCards.keys()) expect(graded.has(id), `no grade for skill ${id}`).toBe(true)
  })

  it('never grades a royal piece — it cannot be replaced, so it has no band to match', () => {
    for (const [id, piece] of content.pieces) {
      if (piece.royal) expect(graded.has(id), `${id} is royal and must not be graded`).toBe(false)
    }
  })

  it('produces a finite delta and a non-negative error for every graded record', () => {
    const rows: Array<{ id: string; delta: number; stderr: number }> = []
    for (const [id, outcome] of graded) {
      expect(outcome.ok, `${id}: ${outcome.ok ? '' : outcome.reason}`).toBe(true)
      if (!outcome.ok) continue
      expect(Number.isFinite(outcome.measurement.delta), `${id} delta is not finite`).toBe(true)
      expect(outcome.measurement.stderr).toBeGreaterThanOrEqual(0)
      rows.push({ id, delta: outcome.measurement.delta, stderr: outcome.measurement.stderr })
    }
    // A REPORT, not a threshold — Phase 3 derives the band boundaries from this
    // distribution, and a bare pass/fail here would hide the shape it needs.
    rows.sort((a, b) => b.delta - a.delta)
    // eslint-disable-next-line no-console
    console.table(rows)
  })
})

describe('PLAN Phase 2 — a runaway record is refused rather than run forever', () => {
  it('gives up inside its budget and says why', () => {
    const out = measureRecord(
      content,
      BASELINE,
      { kind: 'piece', pieceId: 'piece.queen', replaces: REFERENCE_PIECE },
      { seeds: 100000, budgetMs: 1 },
    )
    expect(out.ok).toBe(false)
    if (out.ok) return
    expect(out.reason).toMatch(/budget/i)
  })
})

describe('PLAN Phase 2 — the arms differ in exactly one thing', () => {
  /**
   * The confound this pins cost two wrong implementations to find.
   *
   * `pickDistinct` indexes with `Math.floor(rng() * pool.length)`, so a control
   * pool one card shorter than the candidate's re-indexes every draw from the
   * first one — white's whole opening hand differs between arms and the paired
   * difference stops cancelling. `everChanged` then reads true for every skill
   * card whether or not the card does anything, which is precisely the signal
   * `classify()` needs to tell an inert record from a mild one.
   *
   * A real measurement of the reference card against itself is the fixture that
   * can see it: identical arms are the ONLY way to get `everChanged === false`.
   */
  it('classifies the reference skill card as inert through a real measurement', () => {
    const out = measureRecord(content, BASELINE, { kind: 'skill', skillCardId: REFERENCE_SKILL }, { seeds: 200 })
    expect(out.ok, out.ok ? '' : out.reason).toBe(true)
    if (!out.ok) return
    expect(classify(out.measurement)).toBe('inert')
  }, 60_000)

  it('does not report a skill card as having changed a match unless it did', () => {
    // Not every card may read as live: if pool-length noise were back, every one
    // of them would, and this is the cheapest way to notice.
    const graded = measureAll(content, BASELINE, { seeds: SEEDS })
    const live = [...content.skillCards.keys()].filter((id) => {
      const outcome = graded.get(id)
      return outcome?.ok === true && outcome.measurement.everChanged
    })
    expect(live.length, 'no skill card changed anything — the rig is measuring nothing').toBeGreaterThan(0)
    expect(live.length, 'every skill card changed something — pool-length noise is back').toBeLessThan(
      content.skillCards.size,
    )
  }, 120_000)
})

describe('PLAN Phase 2 — a measurement with no samples is refused, not returned as NaN', () => {
  it.each([0, 1, -5, 1.5])('refuses seeds = %s', (seeds) => {
    const out = measureRecord(content, BASELINE, { kind: 'skill', skillCardId: 'skill.volley' }, { seeds })
    expect(out.ok).toBe(false)
    if (out.ok) return
    expect(out.reason).toMatch(/at least 2 seeds/)
  })
})
