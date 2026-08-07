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

/**
 * Squares this piece attacks, averaged over every square of an EMPTY board.
 *
 * Empty rather than the starting position: a piece's value should not depend on
 * which of its own pieces happen to be in the way at setup, and averaging over
 * the whole board is what makes the number a property of the definition. Both
 * sides' mirroring cancels in the average, so `forward` needs no special case.
 */
export function attackedSquares(piece: PieceDef, board: Pick<BoardDef, 'width' | 'height'>): number {
  const patterns = piece.attack ?? piece.movement
  let total = 0
  for (let file = 0; file < board.width; file += 1) {
    for (let rank = 0; rank < board.height; rank += 1) {
      for (const pattern of patterns) total += squaresReachable(pattern, file, rank, board.width, board.height)
    }
  }
  return total / (board.width * board.height)
}

/** `[intercept, 33N + 0.69N²]` — the prior-art shape, left for the fit to price. */
export function pieceFeatures(piece: PieceDef, board: Pick<BoardDef, 'width' | 'height'>): number[] {
  const n = attackedSquares(piece, board)
  return [1, 33 * n + 0.69 * n * n]
}

/** Every action kind a card's effects use, so the feature vector has a stable width. */
export function skillFeatures(card: SkillCardDef, actionKinds: readonly string[]): number[] {
  const counts = new Map<string, number>()
  for (const effect of card.effects) {
    for (const action of effect.actions) counts.set(action.kind, (counts.get(action.kind) ?? 0) + 1)
  }
  return [1, ...actionKinds.map((kind) => counts.get(kind) ?? 0)]
}
