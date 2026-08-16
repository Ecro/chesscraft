import { describe, expect, it } from 'vitest'
import { loadContentSet } from '@content/load'
import { bundledContentSource } from '@content/sets/bundled'

describe('pre-Phase-2 bundled census', () => {
  it('keeps every selectable rule, skill, piece, and terrain record reachable', () => {
    const loaded = loadContentSet(bundledContentSource)
    if (!loaded.ok) throw new Error(JSON.stringify(loaded.errors))
    const presetRuleIds = new Set([...loaded.set.presets.values()].flatMap((preset) => preset.ruleCardIds))
    const presetSkillIds = new Set([...loaded.set.presets.values()].flatMap((preset) => preset.skillCardIds))
    const presetPieceIds = new Set([...loaded.set.presets.values()].flatMap((preset) => preset.pieceIds))
    const paintedSquareIds = new Set(
      [...loaded.set.boards.values()].flatMap((board) => board.squares.map((square) => square.typeId)),
    )
    for (const id of loaded.set.ruleCards.keys()) expect(presetRuleIds.has(id), `${id} is not in a preset`).toBe(true)
    for (const id of loaded.set.skillCards.keys()) expect(presetSkillIds.has(id), `${id} is not in a preset`).toBe(true)
    for (const id of loaded.set.pieces.keys()) expect(presetPieceIds.has(id), `${id} is not in a preset`).toBe(true)
    for (const id of loaded.set.squareTypes.keys()) expect(paintedSquareIds.has(id), `${id} is not painted`).toBe(true)
  })
})
