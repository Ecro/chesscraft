import { describe, expect, it } from 'vitest'
import { UPGRADE_PIECE_IDS } from '@progression/catalog'
import { FORGE_COST, MAX_RECENT_CLAIMS, REVEAL_COST, chooseOffer, equipUpgrade, forgeUpgrade, grantCompletedMatch, purchaseReveal } from '@progression/rewards'
import { profile } from './helpers'

describe('completed-match grants', () => {
  it('grants exactly one Spark, records the claim, and never auto-spends or opens an offer', () => {
    const current = profile({ sparks: 2 })
    const result = grantCompletedMatch(current, 'match-1')
    expect(result).toMatchObject({ ok: true, granted: true })
    if (!result.ok) return
    expect(result.profile).toEqual(profile({ sparks: 3, recentClaimIds: ['match-1'] }))
    expect(result.profile.pendingOffer).toBeUndefined()
    expect(current).toEqual(profile({ sparks: 2 }))
  })

  it('makes duplicate claims idempotent and bounds the recent-claim ring', () => {
    let current = profile()
    for (let index = 0; index < MAX_RECENT_CLAIMS + 5; index += 1) {
      const result = grantCompletedMatch(current, `match-${index}`)
      expect(result.ok).toBe(true)
      if (!result.ok) return
      current = result.profile
    }
    const duplicate = grantCompletedMatch(current, `match-${MAX_RECENT_CLAIMS + 4}`)
    expect(duplicate).toMatchObject({ ok: true, granted: false, profile: current })
    expect(current.recentClaimIds).toHaveLength(MAX_RECENT_CLAIMS)
    expect(current.recentClaimIds[0]).toBe('match-5')
  })
})

describe('three-Spark choice reveal', () => {
  it('deducts exactly three and deterministically offers up to three distinct unowned ids', () => {
    expect(REVEAL_COST).toBe(3)
    const current = profile({ sparks: 4, ownedUpgradeIds: ['piece.rook-plus'], nextOfferNonce: 7 })
    const first = purchaseReveal(current)
    const second = purchaseReveal(structuredClone(current))
    expect(first).toEqual(second)
    expect(first.ok).toBe(true)
    if (!first.ok) return
    expect(first.profile.sparks).toBe(1)
    expect(first.profile.pendingOffer?.nonce).toBe(7)
    expect(first.profile.nextOfferNonce).toBe(8)
    expect(first.profile.pendingOffer?.upgradeIds).toHaveLength(3)
    expect(new Set(first.profile.pendingOffer?.upgradeIds).size).toBe(3)
    expect(first.profile.pendingOffer?.upgradeIds).not.toContain('piece.rook-plus')
  })

  it.each([
    ['insufficient', profile({ sparks: 2 }), 'insufficient-sparks'],
    ['pending', profile({ sparks: 3, pendingOffer: { nonce: 0, upgradeIds: ['piece.pawn-plus'] }, nextOfferNonce: 1 }), 'pending-offer'],
    ['all owned', profile({ sparks: 9, ownedUpgradeIds: [...UPGRADE_PIECE_IDS] }), 'all-owned'],
  ])('rejects %s without charging or mutating', (_label, current, reason) => {
    const before = structuredClone(current)
    expect(purchaseReveal(current)).toEqual({ ok: false, reason, profile: current })
    expect(current).toEqual(before)
  })

  it('owns one offered id and clears the entire offer', () => {
    const offered = purchaseReveal(profile({ sparks: 3 }))
    expect(offered.ok).toBe(true)
    if (!offered.ok) return
    const picked = offered.profile.pendingOffer!.upgradeIds[1]!
    const chosen = chooseOffer(offered.profile, picked)
    expect(chosen.ok).toBe(true)
    if (!chosen.ok) return
    expect(chosen.profile.ownedUpgradeIds).toContain(picked)
    expect(chosen.profile.pendingOffer).toBeUndefined()
    expect(chosen.profile.sparks).toBe(0)
  })

  it('rejects a choice outside the pending offer without changing anything', () => {
    const current = profile({ pendingOffer: { nonce: 0, upgradeIds: ['piece.pawn-plus'] }, nextOfferNonce: 1 })
    const before = structuredClone(current)
    expect(chooseOffer(current, 'piece.rook-plus')).toEqual({ ok: false, reason: 'not-offered', profile: before })
    expect(current).toEqual(before)
  })
})

describe('five-Spark direct forge and equipment', () => {
  it('deducts exactly five and removes only the forged id from a pending offer', () => {
    expect(FORGE_COST).toBe(5)
    const current = profile({
      sparks: 6,
      pendingOffer: { nonce: 2, upgradeIds: ['piece.pawn-plus', 'piece.knight-plus', 'piece.bishop-plus'] },
      nextOfferNonce: 3,
    })
    const result = forgeUpgrade(current, 'piece.knight-plus')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.profile.sparks).toBe(1)
    expect(result.profile.ownedUpgradeIds).toEqual(['piece.knight-plus'])
    expect(result.profile.pendingOffer).toEqual({ nonce: 2, upgradeIds: ['piece.pawn-plus', 'piece.bishop-plus'] })
  })

  it.each([
    ['insufficient', profile({ sparks: 4 }), 'piece.pawn-plus', 'insufficient-sparks'],
    ['owned', profile({ sparks: 5, ownedUpgradeIds: ['piece.pawn-plus'] }), 'piece.pawn-plus', 'already-owned'],
    ['unknown', profile({ sparks: 5 }), 'piece.fake-plus', 'unknown-upgrade'],
  ])('rejects %s forge requests without charging', (_label, current, id, reason) => {
    const before = structuredClone(current)
    expect(forgeUpgrade(current, id)).toEqual({ ok: false, reason, profile: before })
    expect(current).toEqual(before)
  })

  it('equips only an owned upgrade and keeps each preset side independent', () => {
    const current = profile({ ownedUpgradeIds: ['piece.pawn-plus', 'piece.rook-plus'] })
    const white = equipUpgrade(current, 'preset.default', 'white', 'piece.pawn-plus', 'a2')
    expect(white.ok).toBe(true)
    if (!white.ok) return
    const black = equipUpgrade(white.profile, 'preset.default', 'black', 'piece.rook-plus', 'f5')
    expect(black.ok).toBe(true)
    if (!black.ok) return
    expect(black.profile.equipped).toEqual({
      'preset.default': {
        white: { upgradeId: 'piece.pawn-plus', square: 'a2' },
        black: { upgradeId: 'piece.rook-plus', square: 'f5' },
      },
    })
    const beforeRejected = structuredClone(current)
    expect(equipUpgrade(current, 'preset.default', 'white', 'piece.knight-plus', 'b1')).toEqual({
      ok: false,
      reason: 'not-owned',
      profile: beforeRejected,
    })
    expect(current).toEqual(beforeRejected)
  })
})
