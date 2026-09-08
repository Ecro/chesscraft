import { pieceCost, pieceStars } from '@balance/cost'
import type { ContentSet } from '@content/load'
import type { PieceDef } from '@content/schema'
import { isProgressionOnlyPiece } from './catalog'

export const CANONICAL_BOARD = Object.freeze({ width: 6, height: 6 })

/**
 * Stable maker ceiling. Callers supply the pristine running bundle; authored
 * records and collectible upgrades are deliberately not another trusted field.
 */
export function canonicalAuthoredCeiling(content: Pick<ContentSet, 'pieces'>): number {
  let ceiling = 0
  for (const piece of content.pieces.values()) {
    if (piece.royal === true || isProgressionOnlyPiece(piece.id)) continue
    ceiling = Math.max(ceiling, pieceCost(piece, CANONICAL_BOARD))
  }
  return ceiling
}

export function isUpgradeWithinPowerLimit(upgrade: PieceDef, base: PieceDef, ceiling: number): boolean {
  return pieceStars(upgrade, CANONICAL_BOARD, ceiling) <= pieceStars(base, CANONICAL_BOARD, ceiling) + 1
}
