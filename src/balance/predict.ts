import type { BoardDef, MovePattern, PieceDef, SkillCardDef } from '@content/schema'

/**
 * The fast estimate the editor shows while the real measurement runs
 * (PLAN ADR-002, ADR-005).
 *
 * This is a PREDICTOR, not an authority. Its coefficients are fitted against
 * measured grades rather than chosen, which is the whole point: the moment a
 * developer types a number here, the grade stops being objective and becomes
 * that developer's opinion with a decimal point on it. Where predictor and
 * measurement disagree, the measurement is right by definition and the
 * predictor is refit.
 *
 * The piece feature is the published closed-form estimate for jumpers,
 * `33N + 0.69N²` in squares attacked, which is a *shape* borrowed from prior art
 * rather than a value — the fit decides what it is worth in this game, on this
 * board, at this ply cap.
 */

export interface Predictor {
  /** Fitted coefficients, first entry the intercept. */
  coefficients: number[]
  /** Action kinds the skill feature vector counts, in order. Empty for the piece model. */
  actionKinds: string[]
  /** How many measured records the fit was based on. Below a handful, treat output as decorative. */
  samples: number
}

export interface FitSample {
  features: number[]
  delta: number
}

/**
 * Ridge least squares, solved by Gaussian elimination on the normal equations.
 *
 * Ridged rather than plain because the skill model has almost as many action
 * kinds as there are cards to fit them from; unregularised, it would reproduce
 * the training deltas exactly and predict noise for anything new. The penalty is
 * small and uniform — enough to keep the system solvable, not enough to flatten
 * a real signal.
 */
export function fitLeastSquares(samples: FitSample[], lambda = 1e-3): number[] {
  const width = samples[0]?.features.length ?? 0
  if (width === 0 || samples.length === 0) return []

  const ata: number[][] = Array.from({ length: width }, (_, i) =>
    Array.from({ length: width }, (_, j) => (i === j ? lambda : 0)),
  )
  const atb: number[] = new Array(width).fill(0)
  for (const sample of samples) {
    for (let i = 0; i < width; i += 1) {
      atb[i]! += sample.features[i]! * sample.delta
      for (let j = 0; j < width; j += 1) ata[i]![j]! += sample.features[i]! * sample.features[j]!
    }
  }

  // Gaussian elimination with partial pivoting.
  for (let col = 0; col < width; col += 1) {
    let pivot = col
    for (let row = col + 1; row < width; row += 1) {
      if (Math.abs(ata[row]![col]!) > Math.abs(ata[pivot]![col]!)) pivot = row
    }
    if (Math.abs(ata[pivot]![col]!) < 1e-12) continue
    ;[ata[col], ata[pivot]] = [ata[pivot]!, ata[col]!]
    ;[atb[col], atb[pivot]] = [atb[pivot]!, atb[col]!]
    for (let row = 0; row < width; row += 1) {
      if (row === col) continue
      const factor = ata[row]![col]! / ata[col]![col]!
      if (factor === 0) continue
      for (let k = col; k < width; k += 1) ata[row]![k]! -= factor * ata[col]![k]!
      atb[row]! -= factor * atb[col]!
    }
  }

  return Array.from({ length: width }, (_, i) =>
    Math.abs(ata[i]![i]!) < 1e-12 ? 0 : atb[i]! / ata[i]![i]!,
  )
}

export function predict(predictor: Predictor, features: number[]): number {
  return predictor.coefficients.reduce((sum, c, i) => sum + c * (features[i] ?? 0), 0)
}

// ---------------------------------------------------------------------------
// Features
// ---------------------------------------------------------------------------

function squaresReachable(pattern: MovePattern, file: number, rank: number, width: number, height: number): number {
  let count = 0
  for (const [df, dr] of pattern.vectors) {
    if (pattern.kind === 'slide') {
      const cap = pattern.maxDistance ?? Math.max(width, height)
      for (let step = 1; step <= cap; step += 1) {
        const f = file + df * step
        const r = rank + dr * step
        if (f < 0 || r < 0 || f >= width || r >= height) break
        count += 1
      }
    } else {
      const f = file + df
      const r = rank + dr
      if (f >= 0 && r >= 0 && f < width && r < height) count += 1
    }
  }
  return count
}

/** Squares reachable by a pattern set, averaged over every square of an empty board. */
function averageReach(patterns: readonly MovePattern[], board: Pick<BoardDef, 'width' | 'height'>): number {
  let total = 0
  for (let file = 0; file < board.width; file += 1) {
    for (let rank = 0; rank < board.height; rank += 1) {
      for (const pattern of patterns) total += squaresReachable(pattern, file, rank, board.width, board.height)
    }
  }
  return total / (board.width * board.height)
}

/**
 * Squares this piece attacks, averaged over an EMPTY board.
 *
 * Empty rather than the starting position: a piece's value should not depend on
 * which of its own pieces happen to be in the way at setup. Both sides' mirroring
 * cancels in the average, so `forward` needs no special case.
 */
export function attackedSquares(piece: PieceDef, board: Pick<BoardDef, 'width' | 'height'>): number {
  return averageReach(piece.attack ?? piece.movement, board)
}

/** Squares this piece can MOVE to, which is a different question from what it attacks. */
export function movableSquares(piece: PieceDef, board: Pick<BoardDef, 'width' | 'height'>): number {
  return averageReach(piece.movement, board)
}

/**
 * Whether this piece takes without stepping onto the square it took.
 *
 * The feature the first version was missing, and the reason its fit was wrong
 * about the strongest piece in the game. `attackedSquares` reads
 * `attack ?? movement`, so for a piece with a separate attack it returned the
 * attack alone — for the archer, four jump vectors, N = 2.67 — and threw away
 * that the same piece also moves in all eight directions. Half its strength was
 * invisible, and the other half is qualitative rather than a count: a piece that
 * captures at range never stands where it struck, so it is not exposed to the
 * recapture every other piece pays for.
 */
export function capturesAtRange(piece: PieceDef): boolean {
  return piece.attack !== undefined
}

/**
 * `[intercept, mobility term, reach term, ranged flag]`.
 *
 * The published jumper shape `33N + 0.69N²` is kept for both count features — it
 * is prior art about how value grows with squares, and the fit decides what it is
 * worth on this board at this ply cap. What the fit CANNOT recover is a term that
 * was never offered, which is what made the single-feature version wrong.
 */
export function pieceFeatures(piece: PieceDef, board: Pick<BoardDef, 'width' | 'height'>): number[] {
  const shape = (n: number) => 33 * n + 0.69 * n * n
  return [1, shape(movableSquares(piece, board)), shape(attackedSquares(piece, board)), capturesAtRange(piece) ? 1 : 0]
}

/** Every action kind a card's effects use, so the feature vector has a stable width. */
export function skillFeatures(card: SkillCardDef, actionKinds: readonly string[]): number[] {
  const counts = new Map<string, number>()
  for (const effect of card.effects) {
    for (const action of effect.actions) counts.set(action.kind, (counts.get(action.kind) ?? 0) + 1)
  }
  return [1, ...actionKinds.map((kind) => counts.get(kind) ?? 0)]
}

// ---------------------------------------------------------------------------
// Earning the right to be shown
// ---------------------------------------------------------------------------

export interface Calibration {
  predictor: Predictor
  /** Leave-one-out band agreement, 0..1. */
  accuracy: number
  /** What always predicting zero would have scored on the same data. */
  baseline: number
  /** True when the fit beat the trivial predictor on data it did not see. */
  usable: boolean
}

export interface LabelledSample extends FitSample {
  id: string
}

/**
 * Fits a predictor and measures whether it is worth showing.
 *
 * A provisional grade is a promise, and a wrong one is worse than a wait — the
 * first version of this module fitted a single feature that put the strongest
 * piece in the game near the bottom, and nothing in the system could tell. So the
 * fit is scored by LEAVE-ONE-OUT: each sample is predicted by a model that never
 * saw it, which is the only score a handful of points can honestly produce.
 *
 * The bar is the trivial predictor — always answer zero. Beating it is a low bar
 * and deliberately so: below it the fit is actively misleading, and the caller's
 * correct response is to show nothing at all. `usable` is that decision, made
 * from data rather than from confidence.
 */
export function calibrate(samples: LabelledSample[], bandOf: (delta: number) => number, lambda = 1e-3): Calibration {
  const coefficients = fitLeastSquares(samples, lambda)
  const predictor: Predictor = { coefficients, actionKinds: [], samples: samples.length }

  // Fewer than three points cannot leave one out and still fit anything; the
  // honest answer there is "not usable yet", not a score computed from nothing.
  if (samples.length < 3) return { predictor, accuracy: 0, baseline: 0, usable: false }

  let hits = 0
  let baselineHits = 0
  for (let i = 0; i < samples.length; i += 1) {
    const held = samples[i]!
    const rest = samples.filter((_, j) => j !== i)
    const fold = { coefficients: fitLeastSquares(rest, lambda), actionKinds: [], samples: rest.length }
    if (bandOf(predict(fold, held.features)) === bandOf(held.delta)) hits += 1
    if (bandOf(0) === bandOf(held.delta)) baselineHits += 1
  }

  const accuracy = hits / samples.length
  const baseline = baselineHits / samples.length
  return { predictor, accuracy, baseline, usable: accuracy > baseline }
}
