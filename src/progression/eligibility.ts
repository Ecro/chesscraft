import { checkLoadoutGrades } from '@balance/legal'
import { costCeiling, exceedsCeiling, pieceCost, pieceStars, skillCardCost, skillCardStars } from '@balance/cost'
import type { ContentSet } from '@content/load'
import { differsFromBundled } from '@content/provenance'
import type { Side } from '@engine/types'
import { type EffectiveEquipment, placementsFor } from '@engine/loadout'
import { upgradeById } from './catalog'
import { canonicalAuthoredCeiling } from './power'

export type EligibilityReason =
  | 'legacy-replace-all-loadout'
  | 'curated-upgrade-requires-owned-equipment'
  | 'authored-piece-over-ceiling'
  | 'invalid-effective-equipment'
  | 'loadout-grade-or-budget-invalid'

export type StandardEligibility =
  | { eligible: true }
  | { eligible: false; reasons: EligibilityReason[] }

export interface StandardEligibilityInput {
  content: ContentSet
  /** Pristine running bundle, never the saved/editor document. */
  bundle: ContentSet
  presetId: string
  /** Ownership-validated overrides produced by the progression resolver. */
  effectiveEquipment?: EffectiveEquipment
}

const REASON_ORDER: readonly EligibilityReason[] = [
  'legacy-replace-all-loadout',
  'curated-upgrade-requires-owned-equipment',
  'authored-piece-over-ceiling',
  'invalid-effective-equipment',
  'loadout-grade-or-budget-invalid',
]

function isPristineCatalogPiece(content: ContentSet, bundle: ContentSet, pieceId: string): boolean {
  if (!upgradeById(pieceId)) return false
  const active = content.pieces.get(pieceId)
  const pristine = bundle.pieces.get(pieceId)
  return active !== undefined && pristine !== undefined && !differsFromBundled(active, pristine)
}

function add(reasons: Set<EligibilityReason>, reason: EligibilityReason): void {
  reasons.add(reason)
}

export function standardEligibility({
  content,
  bundle,
  presetId,
  effectiveEquipment = {},
}: StandardEligibilityInput): StandardEligibility {
  const preset = content.presets.get(presetId)
  if (!preset) return { eligible: false, reasons: ['invalid-effective-equipment'] }
  const board = content.boards.get(preset.boardId)
  if (!board) return { eligible: false, reasons: ['invalid-effective-equipment'] }

  const reasons = new Set<EligibilityReason>()
  let hasLegacy = false
  const activeCeiling = costCeiling(
    preset.pieceIds
      .map((pieceId) => content.pieces.get(pieceId))
      .filter((piece): piece is NonNullable<typeof piece> => piece !== undefined),
    board,
  )
  const validEffectiveSides = new Set<Side>()
  for (const side of ['white', 'black'] as const) {
    const roomPiece = preset.loadout?.[side]?.piece
    if (roomPiece && roomPiece.square === undefined) {
      hasLegacy = true
      add(reasons, 'legacy-replace-all-loadout')
    }
    if (roomPiece && isPristineCatalogPiece(content, bundle, roomPiece.pieceId)) {
      add(reasons, 'curated-upgrade-requires-owned-equipment')
    }

    const equipment = effectiveEquipment[side]
    if (!equipment) continue
    const catalog = upgradeById(equipment.pieceId)
    const exactBase = board.placements.some(
      (placement) =>
        placement.side === side &&
        placement.square === equipment.square &&
        placement.pieceId === equipment.replaces,
    )
    if (
      !catalog ||
      catalog.basePieceId !== equipment.replaces ||
      !exactBase ||
      !isPristineCatalogPiece(content, bundle, equipment.pieceId)
    ) {
      add(reasons, 'invalid-effective-equipment')
      continue
    }
    validEffectiveSides.add(side)

    // Equipment replaces the room's piece axis, but its price is still judged
    // in the active room. Curated upgrades intentionally need not have the same
    // star grade as their base; the ceiling and the side's combined piece/card
    // budget are the progression safety envelope instead.
    const equippedPiece = content.pieces.get(equipment.pieceId)!
    const roomCardId = preset.loadout?.[side]?.skillCardId
    const roomCard = roomCardId ? content.skillCards.get(roomCardId) : undefined
    const overCeiling = exceedsCeiling(pieceCost(equippedPiece, board), activeCeiling)
      || (roomCard !== undefined && exceedsCeiling(skillCardCost(roomCard), activeCeiling))
    const spent = pieceStars(equippedPiece, board, activeCeiling)
      + (roomCard ? skillCardStars(roomCard, activeCeiling) : 0)
    if (overCeiling || preset.loadoutBudget === undefined || spent > preset.loadoutBudget) {
      add(reasons, 'loadout-grade-or-budget-invalid')
    }
  }

  for (const placement of board.placements) {
    if (isPristineCatalogPiece(content, bundle, placement.pieceId)) {
      add(reasons, 'curated-upgrade-requires-owned-equipment')
    }
  }

  const ceiling = canonicalAuthoredCeiling(bundle)
  for (const placement of placementsFor(board, preset, effectiveEquipment)) {
    const active = content.pieces.get(placement.pieceId)
    if (!active || active.royal || isPristineCatalogPiece(content, bundle, placement.pieceId)) continue
    const pristine = bundle.pieces.get(placement.pieceId)
    if (pristine !== undefined && !differsFromBundled(active, pristine)) continue
    if (pieceCost(active, board) > ceiling) add(reasons, 'authored-piece-over-ceiling')
  }

  // Existing authored loadout legality remains a standard-play constraint. A
  // pristine curated direct slot already has the more actionable acquisition
  // reason, so do not add a second generic label for the same axis.
  const hasDirectCurated = (['white', 'black'] as readonly Side[]).some((side) => {
    const pieceId = preset.loadout?.[side]?.piece?.pieceId
    return pieceId !== undefined && isPristineCatalogPiece(content, bundle, pieceId)
  })
  const authoredGradeErrors = checkLoadoutGrades(preset, content).filter((error) => {
    for (const side of validEffectiveSides) {
      if (error.path.includes(`.loadout.${side}`)) return false
    }
    return true
  })
  if (!hasLegacy && !hasDirectCurated && authoredGradeErrors.length > 0) {
    add(reasons, 'loadout-grade-or-budget-invalid')
  }

  if (reasons.size === 0) return { eligible: true }
  return { eligible: false, reasons: REASON_ORDER.filter((reason) => reasons.has(reason)) }
}
