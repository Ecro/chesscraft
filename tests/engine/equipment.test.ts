import { describe, expect, it } from 'vitest'
import { loadBundledContent, BUNDLED_PRESET_ID } from '@content/sets/bundled'
import { createMatch, currentState } from '@engine/match'
import type { EffectiveEquipment } from '@engine/loadout'

describe('effective equipment is an explicit deterministic match input', () => {
  const content = loadBundledContent()
  const preset = content.presets.get(BUNDLED_PRESET_ID)!
  const board = content.boards.get(preset.boardId)!
  const equipment: EffectiveEquipment = {
    white: { pieceId: 'piece.pawn-plus', replaces: 'piece.pawn', square: 'a2' },
  }

  it('changes exactly the selected square and never mutates content', () => {
    const before = structuredClone(board.placements)
    const state = currentState(createMatch({ content, presetId: BUNDLED_PRESET_ID, seed: 11, effectiveEquipment: equipment }))
    const baseline = currentState(createMatch({ content, presetId: BUNDLED_PRESET_ID, seed: 11 }))
    const expected = new Map(baseline.board)
    expected.set('a2', { pieceId: 'piece.pawn-plus', side: 'white' })
    expect([...state.board.entries()]).toEqual([...expected.entries()])
    expect(board.placements).toEqual(before)
  })

  it('is replay-stable for the same document, preset, seed, and equipment', () => {
    // This preservation invariant is allowed to pass before implementation: the
    // RED sibling above requires equipment to become observable, after which an
    // implementation that applies it nondeterministically makes this fail.
    const first = currentState(createMatch({ content, presetId: BUNDLED_PRESET_ID, seed: 11, effectiveEquipment: equipment }))
    const second = currentState(createMatch({ content, presetId: BUNDLED_PRESET_ID, seed: 11, effectiveEquipment: equipment }))
    expect([...second.board.entries()]).toEqual([...first.board.entries()])
    expect(second.drafts).toEqual(first.drafts)
  })

})
