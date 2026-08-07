import { describe, expect, it } from 'vitest'
import { bandOf } from '@balance/bands'
import { GRADE_SEEDS, measureAll } from '@balance/measure'
import { attackedSquares, calibrate, capturesAtRange, movableSquares, pieceFeatures, predict } from '@balance/predict'
import { BUNDLED_BOARD_ID, BUNDLED_PRESET_ID } from '@content/sets/bundled'
import { shippedContent } from '../helpers/shipped'

/**
 * Whether the predictor has earned the right to show a provisional grade.
 *
 * The answer today is NO, and this file is where that is recorded rather than
 * assumed. It was measured three ways and the fit never beat "always answer
 * zero" on data it had not seen: one feature at 5 samples, four features at 5,
 * and four features plus nearest-neighbour at 15 (ten synthetic pieces spanning
 * the space). The display path is built and gated on this verdict, so a future
 * feature set that DOES qualify lights it up with no further code change — and
 * this test goes red the moment that happens, which is the point.
 */

const content = shippedContent()
const board = content.boards.get(BUNDLED_BOARD_ID)!
const preset = content.presets.get(BUNDLED_PRESET_ID)!
const band = (delta: number) => bandOf(delta, { width: 6 })

describe('the features separate the things that were collapsed', () => {
  it('no longer reads a ranged attacker as though it barely moved', () => {
    // The bug that made the first fit put the strongest piece in the game near
    // the bottom: `attack ?? movement` returned the archer's four jump vectors
    // and threw away that it also steps in all eight directions.
    const archer = content.pieces.get('piece.archer')!
    expect(attackedSquares(archer, board)).toBeLessThan(movableSquares(archer, board))
    expect(capturesAtRange(archer)).toBe(true)
  })

  it('gives a piece with no separate attack the same reach as its movement', () => {
    const rook = content.pieces.get('piece.rook')!
    expect(attackedSquares(rook, board)).toBe(movableSquares(rook, board))
    expect(capturesAtRange(rook)).toBe(false)
  })

  it('offers a distinct feature per axis, so a fit can price them separately', () => {
    const archer = pieceFeatures(content.pieces.get('piece.archer')!, board)
    const rook = pieceFeatures(content.pieces.get('piece.rook')!, board)
    expect(archer).toHaveLength(4)
    expect(archer[1]).not.toBe(archer[2])
    expect(rook[1]).toBe(rook[2])
    expect(archer[3]).toBe(1)
    expect(rook[3]).toBe(0)
  })
})

describe('the fit is scored on data it did not see, and does not pass', () => {
  const graded = measureAll(
    content,
    {
      presetId: BUNDLED_PRESET_ID,
      referencePieceId: preset.grading!.referencePieceId,
      referenceSkillCardId: preset.grading!.referenceSkillCardId,
    },
    { seeds: GRADE_SEEDS, budgetMs: 600_000 },
  )
  const samples = [...graded.entries()]
    .filter(([id, outcome]) => outcome.ok && content.pieces.has(id))
    .map(([id, outcome]) => ({
      id,
      features: pieceFeatures(content.pieces.get(id)!, board),
      delta: outcome.ok ? outcome.measurement.delta : 0,
    }))

  it('fits every shipped piece in sample, including the ranged one', () => {
    // The features DID fix the ordering: the archer is no longer predicted near
    // the bottom. In-sample agreement is not evidence of anything on its own,
    // which is why it is reported here and gated below.
    const cal = calibrate(samples, band)
    const archer = samples.find((s) => s.id === 'piece.archer')!
    const pawn = samples.find((s) => s.id === 'piece.pawn')!
    expect(predict(cal.predictor, archer.features)).toBeGreaterThan(predict(cal.predictor, pawn.features))
  })

  it('does not beat the trivial predictor out of sample, so it is not usable', () => {
    const cal = calibrate(samples, band)
    expect(cal.accuracy).toBeLessThanOrEqual(cal.baseline)
    expect(cal.usable, `LOO ${cal.accuracy} vs baseline ${cal.baseline} — if this now passes, turn the badge on`).toBe(
      false,
    )
  })

  it('refuses to score itself at all below three samples', () => {
    // Two points and four coefficients is not a weak fit, it is an undefined
    // one, and a score computed from it would be a number with no content.
    const cal = calibrate(samples.slice(0, 2), band)
    expect(cal.usable).toBe(false)
    expect(cal.accuracy).toBe(0)
  })
})
