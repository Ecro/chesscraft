import type { Side } from '@engine/types'
import { upgradeById } from './catalog'

export interface UpgradeEquip {
  upgradeId: string
  square: string
}

export interface PendingOffer {
  nonce: number
  upgradeIds: string[]
}

export interface ProgressionProfileV1 {
  version: 1
  sparks: number
  ownedUpgradeIds: string[]
  pendingOffer?: PendingOffer
  equipped: Record<string, Partial<Record<Side, UpgradeEquip>>>
  nextOfferNonce: number
  recentClaimIds: string[]
}

export type ProfileParseResult =
  | { ok: true; profile: ProgressionProfileV1 }
  | { ok: false; reason: 'future' | 'invalid' }

export function emptyProgression(): ProgressionProfileV1 {
  return {
    version: 1,
    sparks: 0,
    ownedUpgradeIds: [],
    equipped: {},
    nextOfferNonce: 0,
    recentClaimIds: [],
  }
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function safeCounter(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}

function stringList(value: unknown, max: number): string[] | null {
  if (!Array.isArray(value) || value.length > max) return null
  const values: string[] = []
  for (const item of value) {
    if (typeof item !== 'string' || item.length === 0 || item.length > 128) return null
    values.push(item)
  }
  return values
}

const PROFILE_KEYS = new Set([
  'version', 'sparks', 'ownedUpgradeIds', 'pendingOffer', 'equipped', 'nextOfferNonce', 'recentClaimIds',
])

/** Strict whole-payload validation shared by storage and backup restore. */
export function parseProgressionProfile(value: unknown): ProfileParseResult {
  const source = record(value)
  if (!source) return { ok: false, reason: 'invalid' }
  if (typeof source.version === 'number' && source.version > 1) return { ok: false, reason: 'future' }
  if (source.version !== 1 || Object.keys(source).some((key) => !PROFILE_KEYS.has(key))) {
    return { ok: false, reason: 'invalid' }
  }
  if (!safeCounter(source.sparks) || !safeCounter(source.nextOfferNonce)) {
    return { ok: false, reason: 'invalid' }
  }

  const owned = stringList(source.ownedUpgradeIds, 4)
  const claims = stringList(source.recentClaimIds, 64)
  if (!owned || !claims || new Set(owned).size !== owned.length || new Set(claims).size !== claims.length) {
    return { ok: false, reason: 'invalid' }
  }
  if (owned.some((id) => upgradeById(id) === undefined)) return { ok: false, reason: 'invalid' }
  const ownedSet = new Set(owned)

  let pendingOffer: PendingOffer | undefined
  if (source.pendingOffer !== undefined) {
    const pending = record(source.pendingOffer)
    if (!pending || Object.keys(pending).some((key) => key !== 'nonce' && key !== 'upgradeIds')) {
      return { ok: false, reason: 'invalid' }
    }
    const ids = stringList(pending.upgradeIds, 3)
    if (
      !safeCounter(pending.nonce) ||
      pending.nonce >= source.nextOfferNonce ||
      !ids ||
      ids.length === 0 ||
      new Set(ids).size !== ids.length ||
      ids.some((id) => upgradeById(id) === undefined || ownedSet.has(id))
    ) return { ok: false, reason: 'invalid' }
    pendingOffer = { nonce: pending.nonce, upgradeIds: ids }
  }

  const rawEquipped = record(source.equipped)
  if (!rawEquipped) return { ok: false, reason: 'invalid' }
  const equipped: ProgressionProfileV1['equipped'] = {}
  for (const [presetId, rawSides] of Object.entries(rawEquipped)) {
    if (presetId.length === 0 || presetId.length > 128) return { ok: false, reason: 'invalid' }
    const sides = record(rawSides)
    if (!sides || Object.keys(sides).some((side) => side !== 'white' && side !== 'black')) {
      return { ok: false, reason: 'invalid' }
    }
    const parsedSides: Partial<Record<Side, UpgradeEquip>> = {}
    for (const side of ['white', 'black'] as const) {
      if (sides[side] === undefined) continue
      const rawEquip = record(sides[side])
      if (!rawEquip || Object.keys(rawEquip).some((key) => key !== 'upgradeId' && key !== 'square')) {
        return { ok: false, reason: 'invalid' }
      }
      if (
        typeof rawEquip.upgradeId !== 'string' ||
        !ownedSet.has(rawEquip.upgradeId) ||
        upgradeById(rawEquip.upgradeId) === undefined ||
        typeof rawEquip.square !== 'string' ||
        rawEquip.square.length === 0 ||
        rawEquip.square.length > 32
      ) return { ok: false, reason: 'invalid' }
      parsedSides[side] = { upgradeId: rawEquip.upgradeId, square: rawEquip.square }
    }
    equipped[presetId] = parsedSides
  }

  return {
    ok: true,
    profile: {
      version: 1,
      sparks: source.sparks,
      ownedUpgradeIds: owned,
      ...(pendingOffer ? { pendingOffer } : {}),
      equipped,
      nextOfferNonce: source.nextOfferNonce,
      recentClaimIds: claims,
    },
  }
}
