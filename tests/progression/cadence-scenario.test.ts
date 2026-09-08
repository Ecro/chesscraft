import { describe, expect, it } from 'vitest'
import { UPGRADE_PIECE_IDS } from '@progression/catalog'
import { progressionAffordances } from '@progression/affordances'
import { chooseOffer, forgeUpgrade, grantCompletedMatch, purchaseReveal } from '@progression/rewards'
import type { ProgressionProfileV1 } from '@progression/model'
import { profile } from './helpers'

type Outcome = 'white-win' | 'black-win' | 'draw'

function finish(current: ProgressionProfileV1, outcome: Outcome, number: number): ProgressionProfileV1 {
  const result = grantCompletedMatch(current, `${outcome}-${number}`)
  expect(result).toMatchObject({ ok: true, granted: true })
  if (!result.ok) throw new Error(result.reason)
  return result.profile
}

describe('provisional 3/5 Spark cadence', () => {
  it('keeps reveal unavailable through claim 2 and makes it explicitly affordable at claim 3', () => {
    let current = profile()
    current = finish(current, 'white-win', 1)
    current = finish(current, 'black-win', 2)
    expect(progressionAffordances(current)).toMatchObject({ canPurchaseReveal: false })
    expect(current).not.toHaveProperty('pendingOffer')

    current = finish(current, 'draw', 3)
    expect(progressionAffordances(current)).toMatchObject({ canPurchaseReveal: true })
    expect(current.sparks).toBe(3)
    expect(current).not.toHaveProperty('pendingOffer')

    const revealed = purchaseReveal(current)
    expect(revealed.ok).toBe(true)
    if (!revealed.ok) return
    expect(revealed.profile.sparks).toBe(0)
    expect(revealed.profile.pendingOffer?.upgradeIds).toHaveLength(3)
    const chosen = chooseOffer(revealed.profile, revealed.profile.pendingOffer!.upgradeIds[0]!)
    expect(chosen.ok).toBe(true)
    if (!chosen.ok) return
    expect(chosen.profile.ownedUpgradeIds).toHaveLength(1)
    expect(chosen.profile.sparks).toBeGreaterThanOrEqual(0)
  })

  it('makes every named unowned upgrade forgeable after five saved claims', () => {
    let current = profile()
    const outcomes: Outcome[] = ['white-win', 'black-win', 'draw', 'white-win', 'draw']
    outcomes.forEach((outcome, index) => { current = finish(current, outcome, index + 1) })

    expect(current.sparks).toBe(5)
    expect(current).not.toHaveProperty('pendingOffer')
    expect(progressionAffordances(current).forgeableUpgradeIds).toEqual(UPGRADE_PIECE_IDS)

    const forged = forgeUpgrade(current, 'piece.rook-plus')
    expect(forged.ok).toBe(true)
    if (!forged.ok) return
    expect(forged.profile).toMatchObject({ sparks: 0, ownedUpgradeIds: ['piece.rook-plus'] })
  })

  it('advances every result equally and keeps balances and inventory bounded without duplicates', () => {
    const afterFive = (outcome: Outcome) => {
      let current = profile()
      for (let index = 1; index <= 5; index += 1) current = finish(current, outcome, index)
      return current
    }
    expect(afterFive('white-win').sparks).toBe(5)
    expect(afterFive('black-win').sparks).toBe(5)
    expect(afterFive('draw').sparks).toBe(5)

    let current = profile({ sparks: 20 })
    for (const upgradeId of UPGRADE_PIECE_IDS) {
      const forged = forgeUpgrade(current, upgradeId)
      expect(forged.ok).toBe(true)
      if (!forged.ok) return
      current = forged.profile
      expect(current.sparks).toBeGreaterThanOrEqual(0)
      expect(new Set(current.ownedUpgradeIds).size).toBe(current.ownedUpgradeIds.length)
      expect(current.ownedUpgradeIds.length).toBeLessThanOrEqual(UPGRADE_PIECE_IDS.length)
    }
    expect(current.sparks).toBe(0)
    expect(current.ownedUpgradeIds).toEqual(UPGRADE_PIECE_IDS)
    expect(forgeUpgrade(current, UPGRADE_PIECE_IDS[0]!)).toMatchObject({
      ok: false,
      reason: 'already-owned',
      profile: current,
    })
  })
})
