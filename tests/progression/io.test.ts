import { describe, expect, it } from 'vitest'
import { PROGRESSION_KEY } from '@progression/record'
import { loadProgression } from '@progression/record'
import { exportProgressionBackup, restoreProgressionBackup } from '@progression/io'
import { memoryStorage, profile, refusingStorage } from './helpers'

describe('progression backup restore', () => {
  it('requires confirmation and otherwise performs no write', () => {
    const storage = memoryStorage()
    const current = profile({ sparks: 2 })
    const backup = exportProgressionBackup(profile({ sparks: 5 }))
    expect(restoreProgressionBackup(storage, current, backup, false)).toEqual({
      ok: false,
      reason: 'confirmation-required',
      profile: current,
    })
    expect(storage.map.has(PROGRESSION_KEY)).toBe(false)
  })

  it('replaces every field with a validated snapshot rather than merging', () => {
    const storage = memoryStorage({ 'chess-craft.content.v1': 'content', 'chess-craft.collection.v1': 'collection' })
    const current = profile({
      sparks: 1,
      ownedUpgradeIds: ['piece.rook-plus'],
      equipped: { 'preset.current': { white: { upgradeId: 'piece.rook-plus', square: 'a2' } } },
      nextOfferNonce: 9,
      recentClaimIds: ['later-claim'],
    })
    const snapshot = profile({
      sparks: 5,
      ownedUpgradeIds: ['piece.pawn-plus'],
      pendingOffer: { nonce: 1, upgradeIds: ['piece.knight-plus'] },
      equipped: { 'preset.missing-is-retained': { black: { upgradeId: 'piece.pawn-plus', square: 'z99' } } },
      nextOfferNonce: 2,
      recentClaimIds: ['old-claim'],
    })
    const result = restoreProgressionBackup(storage, current, exportProgressionBackup(snapshot), true)
    expect(result).toEqual({ ok: true, profile: snapshot })
    expect(result.profile.ownedUpgradeIds).not.toContain('piece.rook-plus')
    expect(result.profile.recentClaimIds).not.toContain('later-claim')
    expect(loadProgression(storage)).toEqual({ ok: true, profile: snapshot })
    expect(storage.map.get('chess-craft.content.v1')).toBe('content')
    expect(storage.map.get('chess-craft.collection.v1')).toBe('collection')
  })

  it('explicitly rolls an older post-spend backup back, including Sparks and ownership', () => {
    const storage = memoryStorage()
    const current = profile({ sparks: 0, ownedUpgradeIds: ['piece.pawn-plus', 'piece.rook-plus'], recentClaimIds: ['new'] })
    const older = profile({ sparks: 5, ownedUpgradeIds: ['piece.pawn-plus'], recentClaimIds: ['old'] })
    const result = restoreProgressionBackup(storage, current, exportProgressionBackup(older), true)
    expect(result).toEqual({ ok: true, profile: older })
  })

  it.each([
    ['not JSON', '{bad', 'corrupt'],
    ['future version', JSON.stringify({ ...profile(), version: 2 }), 'future'],
    ['unknown catalog id', JSON.stringify(profile({ ownedUpgradeIds: ['piece.fake-plus'] })), 'invalid'],
    ['duplicate offer', JSON.stringify(profile({ pendingOffer: { nonce: 0, upgradeIds: ['piece.pawn-plus', 'piece.pawn-plus'] }, nextOfferNonce: 1 })), 'invalid'],
  ])('rejects %s atomically', (_label, backup, reason) => {
    const current = profile({ sparks: 4 })
    const storage = memoryStorage({ [PROGRESSION_KEY]: JSON.stringify(current) })
    const before = storage.map.get(PROGRESSION_KEY)
    expect(restoreProgressionBackup(storage, current, backup, true)).toEqual({ ok: false, reason, profile: current })
    expect(storage.map.get(PROGRESSION_KEY)).toBe(before)
  })

  it('keeps the current snapshot when the validated replacement cannot persist', () => {
    const current = profile({ sparks: 4 })
    const replacement = profile({ sparks: 1, ownedUpgradeIds: ['piece.pawn-plus'] })
    expect(restoreProgressionBackup(refusingStorage(), current, exportProgressionBackup(replacement), true)).toEqual({
      ok: false,
      reason: 'quota',
      profile: current,
    })
  })
})
