import { describe, expect, it } from 'vitest'
import { loadBundledContent, bundledContentSource } from '@content/sets/bundled'
import { loadContentSet } from '@content/load'
import { mergeBundled, stampOf } from '@content/merge'
import { createPosition } from '@engine/match'
import { legalActions } from '@engine/engine'
import { emptyProgression, parseProgressionProfile } from '@progression/model'
import { UPGRADE_CATALOG, UPGRADE_PIECE_IDS } from '@progression/catalog'
import { upgradePractice } from '@progression/practice'
import { chooseOffer, forgeUpgrade, purchaseReveal, equipUpgrade } from '@progression/rewards'
import { loadProgression, persistProgression, PROGRESSION_KEY } from '@progression/record'
import { exportProgressionBackup, restoreProgressionBackup } from '@progression/io'
import { resolveEquipment } from '@progression/equipment'
import { standardEligibility } from '@progression/eligibility'
import { memoryStorage } from './helpers'

const additions = [
  ['piece.pawn-scout', 'piece.pawn', ['b4', 'd4'], ['b3', 'd3']],
  ['piece.pawn-retreat', 'piece.pawn', ['c2'], ['c5']],
  ['piece.knight-diagonal', 'piece.knight', ['b2', 'b4', 'd2', 'd4'], ['b3', 'b5', 'd3', 'd5']],
  ['piece.knight-spring', 'piece.knight', ['a3', 'c1', 'c5', 'e3'], ['a4', 'c2', 'c6', 'e4']],
  ['piece.bishop-spring', 'piece.bishop', ['a3', 'c1', 'c5', 'e3'], ['a4', 'c2', 'c6', 'e4']],
  ['piece.bishop-scout', 'piece.bishop', ['b5', 'd5'], ['b2', 'd2']],
  ['piece.rook-spring', 'piece.rook', ['a5', 'e1', 'e5'], ['a2', 'a6', 'e2', 'e6']],
  ['piece.rook-scout', 'piece.rook', ['b5', 'd5'], ['b2', 'd2']],
] as const
const oldIds = ['piece.pawn-plus', 'piece.knight-plus', 'piece.bishop-plus', 'piece.rook-plus']
const allIds = [...oldIds, ...additions.map(([id]) => id)]
const content = loadBundledContent()
type Placement = Parameters<typeof createPosition>[0]['placements'][number]
function moves(id: string, side: 'white' | 'black', extras: Placement[] = []) {
  const from = side === 'white' ? 'c3' : 'c4'
  const state = createPosition({ content, presetId: 'preset.default', seed: 17, sideToMove: side, placements: [
    { square: from, pieceId: id, side },
    { square: 'a1', pieceId: 'piece.king', side: 'white' },
    { square: 'f6', pieceId: 'piece.king', side: 'black' }, ...extras,
  ] })
  return legalActions(state, content).flatMap(a => a.kind === 'move' && a.from === from ? [a.to] : []).sort()
}

describe('twelve upgrade expansion', () => {
  it('ships twelve stable IDs and three distinct alternatives per base', async () => {
    expect(UPGRADE_PIECE_IDS).toEqual(allIds)
    const { upgradesForBase, upgradeForBase } = await import('@progression/catalog')
    for (const base of ['piece.pawn', 'piece.knight', 'piece.bishop', 'piece.rook']) {
      const family = upgradesForBase(base)
      expect(family).toHaveLength(3)
      expect(family.map(u => u.id)).toEqual(UPGRADE_CATALOG.filter(u => u.basePieceId === base).map(u => u.id))
      expect(upgradeForBase(base)).toEqual(family[0])
      expect(new Set(family.map(u => JSON.stringify(content.pieces.get(u.id)!.movement))).size).toBe(3)
    }
    expect(upgradesForBase('piece.king')).toEqual([])
  })

  it.each(additions)('%s has exact added moves for both sides and unchanged captures', (id, base, white, black) => {
    expect(content.pieces.has(id)).toBe(true)
    expect(upgradePractice(id)?.addedTargets).toEqual(white)
    for (const [side, added] of [['white', white], ['black', black]] as const) {
      const ordinary = moves(base, side)
      expect(moves(id, side)).toEqual(expect.arrayContaining(ordinary))
      expect(moves(id, side).filter(s => !ordinary.includes(s))).toEqual(added)
      // Every occupied destination on the board is an independent capture probe.
      for (let rank = 1; rank <= 6; rank++) for (const file of 'abcdef') {
        const square = file + rank
        if (['a1', 'f6', side === 'white' ? 'c3' : 'c4'].includes(square)) continue
        const target: Placement = { square, pieceId: 'piece.pawn', side: side === 'white' ? 'black' : 'white' }
        expect(moves(id, side, [target]).includes(square), id + side + square).toBe(moves(base, side, [target]).includes(square))
      }
    }
    const def = content.pieces.get(id)!
    const baseDef = content.pieces.get(base)!
    expect(def.attack).toEqual(baseDef.attack ?? baseDef.movement)
    expect(def.promotion).toEqual(baseDef.promotion)
  })

  it.each(additions.filter(([id]) => id.includes('spring') || id.endsWith('scout') && !id.startsWith('piece.pawn')))('%s jumps blockers but never lands on friendly pieces', (id, _base, targets) => {
    expect(content.pieces.has(id)).toBe(true)
    const blockers: Placement[] = [{ square: 'c4', pieceId: 'piece.pawn', side: 'white' }, { square: 'd4', pieceId: 'piece.pawn', side: 'white' }]
    expect(moves(id, 'white', blockers)).toEqual(expect.arrayContaining([...targets]))
    const target = targets[0]!
    expect(moves(id, 'white', [{ square: target, pieceId: 'piece.pawn', side: 'white' }])).not.toContain(target)
  })

  it('persists twelve owned IDs and new equipment and restores a backup without relaxing validation', () => {
    const next = { ...emptyProgression(), sparks: 7, ownedUpgradeIds: allIds, equipped: { 'preset.default': { white: { upgradeId: 'piece.pawn-scout', square: 'b2' } } } }
    const storage = memoryStorage()
    expect(persistProgression(storage, emptyProgression(), next)).toEqual({ ok: true, profile: next })
    expect(loadProgression(storage)).toEqual({ ok: true, profile: next })
    expect(restoreProgressionBackup(memoryStorage(), emptyProgression(), exportProgressionBackup(next), true)).toEqual({ ok: true, profile: next })
    expect(parseProgressionProfile({ ...next, ownedUpgradeIds: [...allIds, 'piece.fake'] }).ok).toBe(false)
    expect(parseProgressionProfile({ ...next, ownedUpgradeIds: [...allIds.slice(1), allIds[1]] }).ok).toBe(false)
  })

  it('keeps a valid old offer intact and opens eight new possibilities for an old complete collection', () => {
    const oldPending = { ...emptyProgression(), sparks: 2, ownedUpgradeIds: ['piece.pawn-plus'], pendingOffer: { nonce: 1, upgradeIds: ['piece.rook-plus', 'piece.knight-plus'] }, nextOfferNonce: 2 }
    const bytes = JSON.stringify(oldPending)
    const storage = memoryStorage({ [PROGRESSION_KEY]: bytes })
    expect(loadProgression(storage)).toEqual({ ok: true, profile: oldPending })
    expect(storage.getItem(PROGRESSION_KEY)).toBe(bytes)
    const oldComplete = { ...emptyProgression(), sparks: 3, ownedUpgradeIds: oldIds }
    expect(parseProgressionProfile(oldComplete).ok).toBe(true)
    const offer = purchaseReveal(oldComplete)
    expect(offer.ok).toBe(true)
    if (!offer.ok) throw new Error(offer.reason)
    expect(offer.profile.pendingOffer!.upgradeIds).toHaveLength(3)
    expect(offer.profile.pendingOffer!.upgradeIds.every(id => additions.some(row => row[0] === id))).toBe(true)
  })

  it.each(additions)('%s can be revealed as the last item, chosen, forged, equipped and saved', (id, base) => {
    const before = { ...emptyProgression(), sparks: 5, ownedUpgradeIds: allIds.filter(x => x !== id) }
    const offer = purchaseReveal(before)
    expect(offer.ok).toBe(true)
    if (!offer.ok) throw new Error(offer.reason)
    expect(offer.profile.pendingOffer!.upgradeIds).toEqual([id])
    const chosen = chooseOffer(offer.profile, id)
    const forged = forgeUpgrade(before, id)
    expect(forged.ok).toBe(true)
    expect(chosen.ok).toBe(true)
    if (!chosen.ok || !forged.ok) throw new Error('acquisition failed')
    expect(chosen.profile.sparks).toBe(2)
    expect(forged.profile.sparks).toBe(0)
    // The default compact room has no bishop; use the shipped frontier room.
    const presetId = base === 'piece.bishop' ? 'preset.frontier' : 'preset.default'
    const preset = content.presets.get(presetId)!
    const square = content.boards.get(preset.boardId)!.placements.find(p => p.pieceId === base && p.side === 'white')!.square
    const equipped = equipUpgrade(chosen.profile, presetId, 'white', id, square)
    expect(equipped.ok).toBe(true)
    if (!equipped.ok) throw new Error(equipped.reason)
    const storage = memoryStorage()
    expect(persistProgression(storage, emptyProgression(), equipped.profile).ok).toBe(true)
    expect(loadProgression(storage)).toEqual({ ok: true, profile: equipped.profile })
    const resolved = resolveEquipment({ content, bundle: content, presetId, profile: equipped.profile, humanSides: ['white'] })
    expect(resolved.effectiveEquipment.white).toEqual({ pieceId: id, replaces: base, square })
    expect(standardEligibility({ content, bundle: content, presetId, effectiveEquipment: resolved.effectiveEquipment }).eligible).toBe(true)
    expect(purchaseReveal({ ...equipped.profile, sparks: 3 })).toMatchObject({ ok: false, reason: 'all-owned' })
  })

  it('merges eight additions into a valid older document without discarding authored data', () => {
    const older = structuredClone(bundledContentSource)
    older.pieces = older.pieces.filter(p => !additions.some(([id]) => id === (p as { id: string }).id))
    older.pieces.push({ id: 'piece.my-token', nameKey: 'mine.name', textKey: 'mine.text', movement: [{ kind: 'step', vectors: [[0, 1]] }], effects: [] })
    expect(loadContentSet(older).ok).toBe(true)
    const merged = mergeBundled(older, bundledContentSource, stampOf(older)).source
    const result = loadContentSet(merged)
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('invalid merged fixture')
    expect(result.set.pieces.has('piece.my-token')).toBe(true)
    for (const [id] of additions) expect(result.set.pieces.has(id)).toBe(true)
  })
})
