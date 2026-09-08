import { UPGRADE_PIECE_IDS } from './catalog'
import type { ProgressionProfileV1 } from './model'
import { FORGE_COST, REVEAL_COST } from './rewards'

export interface ProgressionAffordances {
  canPurchaseReveal: boolean
  forgeableUpgradeIds: string[]
  ownedCount: number
  totalCount: number
  complete: boolean
  revealRemaining: number
  forgeRemaining: number
}

/**
 * One read model for every UI that presents the provisional 3/5 cadence.
 * Keeping these guards beside the domain transitions prevents a button from
 * advertising an action that the corresponding update would refuse.
 */
export function progressionAffordances(profile: ProgressionProfileV1): ProgressionAffordances {
  const unowned = UPGRADE_PIECE_IDS.filter((upgradeId) => !profile.ownedUpgradeIds.includes(upgradeId))
  return {
    ownedCount: UPGRADE_PIECE_IDS.length - unowned.length,
    totalCount: UPGRADE_PIECE_IDS.length,
    complete: unowned.length === 0,
    revealRemaining: Math.max(0, REVEAL_COST - profile.sparks),
    forgeRemaining: Math.max(0, FORGE_COST - profile.sparks),
    canPurchaseReveal:
      profile.pendingOffer === undefined &&
      profile.sparks >= REVEAL_COST &&
      unowned.length > 0 &&
      profile.nextOfferNonce < Number.MAX_SAFE_INTEGER,
    forgeableUpgradeIds: profile.sparks >= FORGE_COST ? unowned : [],
  }
}
