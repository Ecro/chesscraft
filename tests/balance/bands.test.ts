import { describe, expect, it } from 'vitest'
import { bandOf, bandScaleFrom, bandValue, classify } from '@balance/bands'
import { GRADE_SEEDS, measureAll, measureRecord, type Measurement } from '@balance/measure'
import { attackedSquares, fitLeastSquares, pieceFeatures, predict, skillFeatures } from '@balance/predict'
import { BUNDLED_BOARD_ID, BUNDLED_PRESET_ID } from '@content/sets/bundled'
import { shippedContent } from '../helpers/shipped'

/**
 * PLAN Phase 3 — the band scale, the fitted predictor, and inert-vs-gentle.
 *
 * The band width is not asserted against a number written here; it is asserted
 * to be at least twice the worst standard error in the distribution it came
 * from. That is exit criterion 1, and stating it as a relationship rather than a
 * constant is what stops it from being an assertion equal to its own default.
 */

const content = shippedContent()
const REFERENCE_PIECE = 'piece.pawn'
const REFERENCE_SKILL = 'skill.teleport'
const BASELINE = {
  presetId: BUNDLED_PRESET_ID,
  referencePieceId: REFERENCE_PIECE,
  referenceSkillCardId: REFERENCE_SKILL,
} as const
const board = content.boards.get(BUNDLED_BOARD_ID)!

function measurement(over: Partial<Measurement> = {}): Measurement {
  return { delta: 0, stderr: 0, n: 1, everChanged: true, ...over }
}

describe('PLAN Phase 3 (1) — the band width is derived, not chosen', () => {
  it('is at least twice the worst standard error in the distribution', () => {
    const outcomes = [
      { ok: true, measurement: measurement({ stderr: 1.2 }) },
      { ok: true, measurement: measurement({ stderr: 2.4 }) },
      { ok: false, reason: 'unmeasurable' },
    ] as const
    const scale = bandScaleFrom(outcomes)
    expect(scale.width).toBeGreaterThanOrEqual(2 * 2.4)
  })

  it('never returns a zero width, even when every record is a no-op', () => {
    const scale = bandScaleFrom([{ ok: true, measurement: measurement({ stderr: 0 }) }])
    expect(scale.width).toBeGreaterThan(0)
  })

  it('puts a delta and its band representative within half a band of each other', () => {
    const scale = { width: 5 }
    for (const delta of [-7.4, -2.4, 0, 1.2, 6.1, 21.5]) {
      expect(Math.abs(bandValue(delta, scale) - delta)).toBeLessThanOrEqual(scale.width / 2)
    }
  })

  it('charges the same for two deltas the scale calls the same grade', () => {
    const scale = { width: 5 }
    expect(bandOf(6.1, scale)).toBe(bandOf(7.4, scale))
    expect(bandValue(6.1, scale)).toBe(bandValue(7.4, scale))
  })

  it('puts "changes nothing" at the origin', () => {
    expect(bandOf(0, { width: 5 })).toBe(0)
    expect(bandValue(0, { width: 5 })).toBe(0)
  })
})

/**
 * One grading pass at the real seed count, shared by every test below that needs
 * a distribution. Measured once because it is the expensive thing in this file
 * and because two passes would be measuring the same constant twice.
 */
const graded = measureAll(content, BASELINE, { seeds: GRADE_SEEDS, budgetMs: 600_000 })
const scale = bandScaleFrom(graded.values())

describe('PLAN Phase 3 (1) — the scale actually discriminates at GRADE_SEEDS', () => {
  // The anti-degenerate guard. A scale whose bands are wider than the whole
  // distribution grades everything identically and constrains nothing, which is
  // exactly what 200 seeds produced and why GRADE_SEEDS is what it is.

  it('separates the shipped records into more than two bands', () => {
    const bands = new Set(
      [...graded.values()].filter((o) => o.ok).map((o) => bandOf((o as { measurement: Measurement }).measurement.delta, scale)),
    )
    expect(bands.size, `every shipped record fell into ${bands.size} band(s) at width ${scale.width}`).toBeGreaterThan(2)
  })

  it('does not put the reference piece and the strongest piece in the same band', () => {
    const strongest = [...graded.entries()]
      .filter(([id, o]) => o.ok && content.pieces.has(id))
      .sort((a, b) => (b[1] as { measurement: Measurement }).measurement.delta - (a[1] as { measurement: Measurement }).measurement.delta)[0]!
    const reference = graded.get(REFERENCE_PIECE)!
    expect(reference.ok && strongest[1].ok).toBe(true)
    if (!reference.ok || !strongest[1].ok) return
    expect(bandOf(strongest[1].measurement.delta, scale)).not.toBe(bandOf(reference.measurement.delta, scale))
  })
})

describe('PLAN Phase 3 (3) — inert is separated from gentle', () => {
  it('calls a record that never changed a match inert, however small its delta', () => {
    expect(classify(measurement({ delta: 0, stderr: 0, everChanged: false }))).toBe('inert')
  })

  it('calls a record that changed matches but won nothing gentle, not inert', () => {
    expect(classify(measurement({ delta: 0.4, stderr: 2.4, everChanged: true }))).toBe('gentle')
  })

  it('does not call a real effect gentle just because it is positive', () => {
    expect(classify(measurement({ delta: 16.75, stderr: 2.4, everChanged: true }))).toBe('graded')
  })

  it('classifies a piece that replaces itself as inert, from a real measurement', () => {
    // The one fixture guaranteed inert by construction: `placementsFor` maps a
    // self-replacement to the identical placement, so no seed can differ.
    const out = measureRecord(
      content,
      BASELINE,
      { kind: 'piece', pieceId: REFERENCE_PIECE, replaces: REFERENCE_PIECE },
      { seeds: 40 },
    )
    expect(out.ok, out.ok ? '' : out.reason).toBe(true)
    if (!out.ok) return
    expect(classify(out.measurement)).toBe('inert')
  })

  it('classifies a materially stronger army as graded, from a real measurement', () => {
    const out = measureRecord(
      content,
      BASELINE,
      { kind: 'piece', pieceId: 'piece.queen', replaces: REFERENCE_PIECE },
      { seeds: 200 },
    )
    expect(out.ok, out.ok ? '' : out.reason).toBe(true)
    if (!out.ok) return
    expect(out.measurement.everChanged).toBe(true)
    expect(classify(out.measurement)).toBe('graded')
  }, 60_000)
})

describe('PLAN Phase 3 (2) — the predictor is fitted, never hand-set', () => {
  it('recovers a linear relationship it was fitted to', () => {
    // Sanity for the solver itself, on data whose answer is known: y = 3 + 2x.
    const samples = [0, 1, 2, 3, 4].map((x) => ({ features: [1, x], delta: 3 + 2 * x }))
    const [intercept, slope] = fitLeastSquares(samples)
    expect(intercept).toBeCloseTo(3, 2)
    expect(slope).toBeCloseTo(2, 2)
  })

  it('orders the shipped pieces by attacked squares the way the board does', () => {
    const queen = attackedSquares(content.pieces.get('piece.queen')!, board)
    const rook = attackedSquares(content.pieces.get('piece.rook')!, board)
    const pawn = attackedSquares(content.pieces.get('piece.pawn')!, board)
    expect(queen).toBeGreaterThan(rook)
    expect(rook).toBeGreaterThan(pawn)
  })

  /**
   * The empirical finding this pins, and it is a negative one.
   *
   * The published jumper estimate `33N + 0.69N²` does NOT order this game's
   * pieces. Measured at 600 seeds: `piece.archer` scores +20.1 on N = 2.67 while
   * `piece.queen` scores +8.5 on N = 16.11 — the strongest piece has almost the
   * smallest attacked-square count, because the archer captures at range without
   * moving and a square count cannot see that. PLAN R-4 named this outcome in
   * advance and named the remedy: the predictor is demoted to a hint, the badge
   * says so, and the measurement governs.
   *
   * Asserted as a REPORT rather than as a threshold. Forcing `queen > pawn` here
   * would have meant fitting the assertion to the answer we wanted, and the fit
   * would still have been wrong about the archer.
   */
  it('reports how well the fitted piece predictor orders the measured grades', () => {
    const samples = [...graded.entries()]
      .filter(([id, o]) => o.ok && content.pieces.has(id))
      .map(([id, o]) => ({
        id,
        features: pieceFeatures(content.pieces.get(id)!, board),
        delta: (o as { measurement: Measurement }).measurement.delta,
      }))
    expect(samples.length).toBeGreaterThan(2)

    const coefficients = fitLeastSquares(samples)
    const predictor = { coefficients, actionKinds: [], samples: samples.length }
    const rows = samples
      .map((s) => ({ id: s.id, measured: s.delta, predicted: predict(predictor, s.features) }))
      .sort((a, b) => b.measured - a.measured)
    // eslint-disable-next-line no-console
    console.table(rows)

    const agreeing = rows.filter((r) => bandOf(r.predicted, scale) === bandOf(r.measured, scale)).length
    // The only claim made: the fit produces a finite number for every piece. Band
    // agreement is reported, not gated — PLAN Phase 3 exit criterion 2 asked for
    // 80% and the data says the feature cannot deliver it, so the honest record is
    // the number rather than a threshold bent to fit it.
    for (const row of rows) expect(Number.isFinite(row.predicted), `${row.id} predicted a non-number`).toBe(true)
    // eslint-disable-next-line no-console
    console.log(`piece predictor band agreement: ${agreeing}/${rows.length}`)
  })

  it('gives a skill card a stable feature width whatever actions it uses', () => {
    const kinds = ['destroy_piece', 'freeze_piece', 'teleport_piece']
    for (const card of content.skillCards.values()) {
      expect(skillFeatures(card, kinds)).toHaveLength(kinds.length + 1)
    }
  })

  it('counts the actions a card actually carries', () => {
    // `skill.sacrifice` destroys twice in one effect — a count, not a flag.
    const features = skillFeatures(content.skillCards.get('skill.sacrifice')!, ['destroy_piece'])
    expect(features[1]).toBe(2)
  })
})
