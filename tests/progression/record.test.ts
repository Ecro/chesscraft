import { describe, expect, it } from 'vitest'
import { emptyProgression } from '@progression/model'
import { PROGRESSION_KEY, loadProgression, persistProgression } from '@progression/record'
import { purchaseReveal } from '@progression/rewards'
import { memoryStorage, profile, refusingStorage } from './helpers'

describe('progression storage boundary', () => {
  it.each([
    ['absent', memoryStorage(), 'absent'],
    ['corrupt JSON', memoryStorage({ [PROGRESSION_KEY]: '{no' }), 'corrupt'],
    ['future version', memoryStorage({ [PROGRESSION_KEY]: JSON.stringify({ ...profile(), version: 2 }) }), 'future'],
    ['wrong shape', memoryStorage({ [PROGRESSION_KEY]: JSON.stringify({ ...profile(), sparks: -1 }) }), 'invalid'],
    ['denied read', refusingStorage('SecurityError'), 'unavailable'],
  ])('reports %s explicitly and returns a safe empty profile', (_label, storage, reason) => {
    const result = loadProgression(storage)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe(reason)
    expect(result.profile).toEqual(emptyProgression())
  })

  it('rehydrates a paid offer byte-identically without duplicates', () => {
    const offered = purchaseReveal(profile({ sparks: 3 }))
    expect(offered.ok).toBe(true)
    if (!offered.ok) return
    const storage = memoryStorage({ [PROGRESSION_KEY]: JSON.stringify(offered.profile) })
    const loaded = loadProgression(storage)
    expect(loaded.ok).toBe(true)
    if (!loaded.ok) return
    expect(JSON.stringify(loaded.profile.pendingOffer)).toBe(JSON.stringify(offered.profile.pendingOffer))
    expect(new Set(loaded.profile.pendingOffer?.upgradeIds).size).toBe(loaded.profile.pendingOffer?.upgradeIds.length)
  })

  it('leaves Sparks and a pending offer untouched across navigation-style reloads', () => {
    const current = profile({
      sparks: 2,
      pendingOffer: { nonce: 4, upgradeIds: ['piece.pawn-plus', 'piece.rook-plus'] },
      nextOfferNonce: 5,
    })
    const storage = memoryStorage({ [PROGRESSION_KEY]: JSON.stringify(current) })
    let writes = 0
    const originalSet = storage.setItem.bind(storage)
    storage.setItem = (key, value) => { writes += 1; originalSet(key, value) }
    const firstScreen = loadProgression(storage)
    const secondScreen = loadProgression(storage)
    expect(firstScreen).toEqual({ ok: true, profile: current })
    expect(secondScreen).toEqual(firstScreen)
    expect(writes).toBe(0)
    expect(storage.map.get(PROGRESSION_KEY)).toBe(JSON.stringify(current))
  })

  it.each([
    ['unknown owned id', profile({ ownedUpgradeIds: ['piece.fake-plus'] })],
    ['duplicate offer id', profile({ pendingOffer: { nonce: 0, upgradeIds: ['piece.pawn-plus', 'piece.pawn-plus'] }, nextOfferNonce: 1 })],
    ['already-owned offer id', profile({ ownedUpgradeIds: ['piece.pawn-plus'], pendingOffer: { nonce: 0, upgradeIds: ['piece.pawn-plus'] }, nextOfferNonce: 1 })],
    ['invalid nonce relation', profile({ pendingOffer: { nonce: 3, upgradeIds: ['piece.pawn-plus'] }, nextOfferNonce: 3 })],
    ['equipment for unowned id', profile({ equipped: { 'preset.default': { white: { upgradeId: 'piece.pawn-plus', square: 'a2' } } } })],
  ])('rejects the whole stored profile for %s', (_label, value) => {
    const result = loadProgression(memoryStorage({ [PROGRESSION_KEY]: JSON.stringify(value) }))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('invalid')
  })

  it.each([
    ['quota', refusingStorage(), 'quota'],
    ['denied', refusingStorage('SecurityError'), 'unavailable'],
  ])('keeps the current profile when a %s write fails', (_label, storage, reason) => {
    const current = profile({ sparks: 3 })
    const transition = purchaseReveal(current)
    expect(transition.ok).toBe(true)
    if (!transition.ok) return
    const result = persistProgression(storage, current, transition.profile)
    expect(result).toEqual({ ok: false, reason, profile: current })
    expect(current.sparks).toBe(3)
  })

  it('detects a write that storage does not actually retain', () => {
    const storage = memoryStorage()
    storage.setItem = () => {}
    const current = profile({ sparks: 3 })
    const next = purchaseReveal(current)
    expect(next.ok).toBe(true)
    if (!next.ok) return
    expect(persistProgression(storage, current, next.profile)).toEqual({
      ok: false,
      reason: 'verification',
      profile: current,
    })
  })

  it('writes progression under its own key and leaves content and collection untouched', () => {
    const storage = memoryStorage({ 'chess-craft.content.v1': 'content', 'chess-craft.collection.v1': 'collection' })
    const current = profile()
    const next = profile({ sparks: 1 })
    expect(persistProgression(storage, current, next)).toEqual({ ok: true, profile: next })
    expect(storage.map.get('chess-craft.content.v1')).toBe('content')
    expect(storage.map.get('chess-craft.collection.v1')).toBe('collection')
    expect(loadProgression(storage)).toEqual({ ok: true, profile: next })
  })

  it('commits a reveal charge and pending offer as one persisted snapshot', () => {
    const storage = memoryStorage()
    const current = profile({ sparks: 4 })
    const transition = purchaseReveal(current)
    expect(transition.ok).toBe(true)
    if (!transition.ok) return
    expect(persistProgression(storage, current, transition.profile)).toEqual({ ok: true, profile: transition.profile })
    const loaded = loadProgression(storage)
    expect(loaded).toEqual({ ok: true, profile: transition.profile })
    if (!loaded.ok) return
    expect(loaded.profile.sparks).toBe(1)
    expect(loaded.profile.pendingOffer).toEqual(transition.profile.pendingOffer)
  })
})
