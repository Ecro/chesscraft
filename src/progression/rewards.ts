import { pickDistinct, rngFor } from '@engine/rng'
import type { Side } from '@engine/types'
import { UPGRADE_PIECE_IDS, upgradeById } from './catalog'
import type { ProgressionProfileV1 } from './model'

export const REVEAL_COST = 3
export const FORGE_COST = 5
export const MAX_RECENT_CLAIMS = 64

type FailureReason =
  | 'invalid-claim-id'
  | 'insufficient-sparks'
  | 'pending-offer'
  | 'all-owned'
  | 'nonce-exhausted'
  | 'not-offered'
  | 'already-owned'
  | 'unknown-upgrade'
  | 'not-owned'
  | 'invalid-equipment'

export type UpdateResult =
  | { ok: true; profile: ProgressionProfileV1 }
  | { ok: false; reason: FailureReason; profile: ProgressionProfileV1 }

export type GrantResult =
  | { ok: true; granted: boolean; profile: ProgressionProfileV1 }
  | { ok: false; reason: FailureReason; profile: ProgressionProfileV1 }

function failure(profile: ProgressionProfileV1, reason: FailureReason): UpdateResult {
  return { ok: false, reason, profile }
}

export function grantCompletedMatch(profile: ProgressionProfileV1, claimId: string): GrantResult {
  if (claimId.length === 0 || claimId.length > 128) return { ok: false, reason: 'invalid-claim-id', profile }
  if (profile.recentClaimIds.includes(claimId)) return { ok: true, granted: false, profile }
  const recentClaimIds = [...profile.recentClaimIds, claimId].slice(-MAX_RECENT_CLAIMS)
  return {
    ok: true,
    granted: true,
    profile: { ...profile, sparks: profile.sparks + 1, recentClaimIds },
  }
}

export function purchaseReveal(profile: ProgressionProfileV1): UpdateResult {
  if (profile.pendingOffer) return failure(profile, 'pending-offer')
  if (profile.sparks < REVEAL_COST) return failure(profile, 'insufficient-sparks')
  const candidates = UPGRADE_PIECE_IDS.filter((id) => !profile.ownedUpgradeIds.includes(id))
  if (candidates.length === 0) return failure(profile, 'all-owned')
  if (profile.nextOfferNonce >= Number.MAX_SAFE_INTEGER) return failure(profile, 'nonce-exhausted')
  const upgradeIds = pickDistinct(rngFor(profile.nextOfferNonce, 'progression-offer'), candidates, 3)
  return {
    ok: true,
    profile: {
      ...profile,
      sparks: profile.sparks - REVEAL_COST,
      pendingOffer: { nonce: profile.nextOfferNonce, upgradeIds },
      nextOfferNonce: profile.nextOfferNonce + 1,
    },
  }
}

export function chooseOffer(profile: ProgressionProfileV1, upgradeId: string): UpdateResult {
  if (!profile.pendingOffer?.upgradeIds.includes(upgradeId)) return failure(profile, 'not-offered')
  if (profile.ownedUpgradeIds.includes(upgradeId)) return failure(profile, 'already-owned')
  const { pendingOffer: _pendingOffer, ...withoutOffer } = profile
  return {
    ok: true,
    profile: {
      ...withoutOffer,
      ownedUpgradeIds: [...profile.ownedUpgradeIds, upgradeId],
    },
  }
}

export function forgeUpgrade(profile: ProgressionProfileV1, upgradeId: string): UpdateResult {
  if (!upgradeById(upgradeId)) return failure(profile, 'unknown-upgrade')
  if (profile.ownedUpgradeIds.includes(upgradeId)) return failure(profile, 'already-owned')
  if (profile.sparks < FORGE_COST) return failure(profile, 'insufficient-sparks')
  const remaining = profile.pendingOffer?.upgradeIds.filter((id) => id !== upgradeId)
  const { pendingOffer, ...withoutOffer } = profile
  return {
    ok: true,
    profile: {
      ...withoutOffer,
      sparks: profile.sparks - FORGE_COST,
      ownedUpgradeIds: [...profile.ownedUpgradeIds, upgradeId],
      ...(pendingOffer
        ? remaining && remaining.length > 0
          ? { pendingOffer: { ...pendingOffer, upgradeIds: remaining } }
          : {}
        : {}),
    },
  }
}

export function equipUpgrade(
  profile: ProgressionProfileV1,
  presetId: string,
  side: Side,
  upgradeId: string,
  square: string,
): UpdateResult {
  if (!profile.ownedUpgradeIds.includes(upgradeId)) return failure(profile, 'not-owned')
  if (!upgradeById(upgradeId) || presetId.length === 0 || square.length === 0) {
    return failure(profile, 'invalid-equipment')
  }
  return {
    ok: true,
    profile: {
      ...profile,
      equipped: {
        ...profile.equipped,
        [presetId]: {
          ...profile.equipped[presetId],
          [side]: { upgradeId, square },
        },
      },
    },
  }
}
