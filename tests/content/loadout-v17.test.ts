import { describe, expect, it } from 'vitest'
import { type ContentSource, loadContentSet } from '@content/load'
import { SCHEMA_VERSION } from '@content/schema'
import { BUNDLED_PRESET_ID, bundledContentSource } from '@content/sets/bundled'
import { createMatch, currentState } from '@engine/match'

function sourceWith(mutator: (preset: Record<string, unknown>, source: ContentSource) => void): ContentSource {
  const source = structuredClone(bundledContentSource) as ContentSource
  source.schemaVersion = SCHEMA_VERSION
  const preset = source.presets.find((entry) => (entry as { id: string }).id === BUNDLED_PRESET_ID) as Record<string, unknown>
  mutator(preset, source)
  return source
}

function load(source: ContentSource) {
  const result = loadContentSet(source)
  expect(result.ok, result.ok ? '' : JSON.stringify(result.errors, null, 2)).toBe(true)
  if (!result.ok) throw new Error('fixture must load')
  return result.set
}

describe('schema v17 independent loadout axes', () => {
  it('is the current schema', () => {
    expect(SCHEMA_VERSION).toBe(17)
  })

  it('accepts a piece-only slot and changes exactly its named starting square', () => {
    const source = sourceWith((preset) => {
      preset.loadoutBudget = 100
      preset.loadout = {
        white: { piece: { pieceId: 'piece.archer', replaces: 'piece.knight', square: 'b1' } },
      }
    })
    const state = currentState(createMatch({ content: load(source), presetId: BUNDLED_PRESET_ID, seed: 1 }))
    const baseline = currentState(createMatch({ content: load(structuredClone(bundledContentSource) as ContentSource), presetId: BUNDLED_PRESET_ID, seed: 1 }))
    const expected = new Map(baseline.board)
    expected.set('b1', { pieceId: 'piece.archer', side: 'white' })
    expect([...state.board.entries()]).toEqual([...expected.entries()])
  })

  it('refuses an exact matching square when the replaced starting piece is royal', () => {
    const source = sourceWith((preset) => {
      preset.loadoutBudget = 100
      preset.loadout = {
        white: { piece: { pieceId: 'piece.archer', replaces: 'piece.king', square: 'd1' } },
      }
    })
    const result = loadContentSet(source)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.errors.some((error) => error.path === `presets.${BUNDLED_PRESET_ID}.loadout.white.piece.replaces`)).toBe(true)
  })

  it('accepts a skill-only slot without changing the board', () => {
    const source = sourceWith((preset, document) => {
      const probe = structuredClone(document.skillCards[0]) as Record<string, unknown>
      probe.id = 'skill.private-probe'
      probe.nameKey = 'skill.private-probe.name'
      probe.textKey = 'skill.private-probe.text'
      document.skillCards.push(probe as never)
      preset.loadoutBudget = 100
      preset.loadout = { white: { skillCardId: 'skill.private-probe' } }
    })
    const content = load(source)
    const state = currentState(createMatch({ content, presetId: BUNDLED_PRESET_ID, seed: 3 }))
    const plain = currentState(createMatch({ content: load(structuredClone(bundledContentSource) as ContentSource), presetId: BUNDLED_PRESET_ID, seed: 3 }))
    expect([...state.board.entries()]).toEqual([...plain.board.entries()])
    expect(content.presets.get(BUNDLED_PRESET_ID)?.loadout?.white).toEqual({ skillCardId: 'skill.private-probe' })
  })

  it.each([
    ['empty side object', { white: {} }, `presets.${BUNDLED_PRESET_ID}.loadout.white`],
    ['piece missing square', { white: { piece: { pieceId: 'piece.archer', replaces: 'piece.knight' } } }, `presets.${BUNDLED_PRESET_ID}.loadout.white.piece.square`],
    ['square with the wrong starting piece', { white: { piece: { pieceId: 'piece.archer', replaces: 'piece.knight', square: 'a2' } } }, `presets.${BUNDLED_PRESET_ID}.loadout.white.piece.square`],
    ['a second piece axis', { white: { piece: { pieceId: 'piece.archer', replaces: 'piece.knight', square: 'b1' }, piece2: { pieceId: 'piece.rook', replaces: 'piece.pawn', square: 'a2' } } }, `presets.${BUNDLED_PRESET_ID}.loadout.white.piece2`],
  ])('refuses %s with a located error', (_label, loadout, path) => {
    // The `piece2` row is an intentionally passing negative invariant before
    // v17: strict v16 already rejects the extra axis. RED positive siblings
    // above force the new `piece` construct to exist, so widening v17 to admit
    // a second piece axis makes this row fail at the named path.
    const source = sourceWith((preset) => {
      preset.loadoutBudget = 100
      preset.loadout = loadout
    })
    const result = loadContentSet(source)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.errors.some((error) => error.path === path), JSON.stringify(result.errors, null, 2)).toBe(true)
  })
})
