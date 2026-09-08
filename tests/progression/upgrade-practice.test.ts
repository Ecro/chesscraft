import { describe, expect, it } from 'vitest'

describe('canonical one-move upgrade experiments', () => {
  it.each([
    ['piece.pawn-plus', ['b3', 'd3'], 'c4'],
    ['piece.knight-plus', ['b3', 'c2', 'c4', 'd3'], 'e4'],
    ['piece.bishop-plus', ['b3', 'c2', 'c4', 'd3'], 'd4'],
    ['piece.rook-plus', ['b2', 'b4', 'd2', 'd4'], 'c4'],
  ])('%s exposes the exact new empty-square moves and keeps its base move', async (id, added, ordinary) => {
    const { upgradePractice } = await import('../../src/progression/practice')
    const example = upgradePractice(id as string)!
    expect(example.addedTargets).toEqual(added)
    expect(example.baseTargets).toContain(ordinary)
    expect(example.upgradeTargets).toEqual(expect.arrayContaining(example.baseTargets))
    expect(example.upgradeTargets).not.toContain('a1')
    expect(example.upgradeTargets).not.toContain('f6')
    expect(example.upgradeTargets).not.toContain('c3')
    expect(upgradePractice('piece.not-in-catalog')).toBeNull()
  })
})
