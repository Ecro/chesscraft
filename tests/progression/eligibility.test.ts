import { describe, expect, it } from 'vitest'
import { type ContentSource, loadContentSet } from '@content/load'
import { BUNDLED_BOARD_ID, BUNDLED_PRESET_ID, bundledContentSource, loadBundledContent } from '@content/sets/bundled'
import { standardEligibility } from '@progression/eligibility'
import { costCeiling, pieceCost } from '@balance/cost'

function loaded(mutator?: (source: ContentSource) => void) {
  const source = structuredClone(bundledContentSource) as ContentSource
  mutator?.(source)
  const result = loadContentSet(source)
  if (!result.ok) throw new Error(JSON.stringify(result.errors, null, 2))
  return result.set
}

const SIX_SLIDE_VECTORS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1]]
const NINE_SLIDE_VECTORS = [...SIX_SLIDE_VECTORS, [1, -1], [-1, 1], [2, 1]]

function addAuthoredSlider(source: ContentSource, id: string, vectors: number[][], square: string): void {
  const piece = structuredClone(source.pieces.find((entry) => (entry as { id: string }).id === 'piece.rook')) as Record<string, unknown>
  piece.id = id
  piece.nameKey = `${id}.name`
  piece.movement = [{ kind: 'slide', vectors }]
  source.pieces.push(piece as never)
  const board = source.boards.find((entry) => (entry as { id: string }).id === BUNDLED_BOARD_ID) as { placements: Array<{ square: string; pieceId: string; side: string }> }
  board.placements.find((entry) => entry.square === square)!.pieceId = id
}

describe('standard match eligibility', () => {
  const bundle = loadBundledContent()

  it('sandboxes a curated upgrade placed directly by a document', () => {
    const content = loaded((source) => {
      const board = source.boards.find((entry) => (entry as { id: string }).id === BUNDLED_BOARD_ID) as { placements: Array<{ square: string; pieceId: string; side: string }> }
      board.placements.find((entry) => entry.square === 'a2')!.pieceId = 'piece.pawn-plus'
    })
    expect(standardEligibility({ content, bundle, presetId: BUNDLED_PRESET_ID })).toEqual({
      eligible: false,
      reasons: ['curated-upgrade-requires-owned-equipment'],
    })
  })

  it('sandboxes a pristine curated upgrade injected through the preset piece slot', () => {
    const content = loaded((source) => {
      source.schemaVersion = 17
      const preset = source.presets.find((entry) => (entry as { id: string }).id === BUNDLED_PRESET_ID) as Record<string, unknown>
      preset.loadoutBudget = 100
      preset.loadout = {
        white: { piece: { pieceId: 'piece.pawn-plus', replaces: 'piece.pawn', square: 'a2' } },
      }
    })
    expect(standardEligibility({ content, bundle, presetId: BUNDLED_PRESET_ID })).toEqual({
      eligible: false,
      reasons: ['curated-upgrade-requires-owned-equipment'],
    })
  })

  it('treats a modified catalog-id definition as authored rather than pristine equipment', () => {
    const content = loaded((source) => {
      const upgrade = source.pieces.find((entry) => (entry as { id: string }).id === 'piece.pawn-plus') as Record<string, unknown>
      const pawn = source.pieces.find((entry) => (entry as { id: string }).id === 'piece.pawn') as Record<string, unknown>
      upgrade.movement = structuredClone(pawn.movement)
      upgrade.attack = structuredClone(pawn.attack)
      upgrade.promotion = structuredClone(pawn.promotion)
      upgrade.effects = structuredClone(pawn.effects)
      const board = source.boards.find((entry) => (entry as { id: string }).id === BUNDLED_BOARD_ID) as { placements: Array<{ square: string; pieceId: string; side: string }> }
      board.placements.find((entry) => entry.square === 'a2')!.pieceId = 'piece.pawn-plus'
    })
    expect(standardEligibility({ content, bundle, presetId: BUNDLED_PRESET_ID })).toEqual({ eligible: true })
  })

  it('admits the same pristine id only as a validated equipment override', () => {
    expect(standardEligibility({
      content: bundle,
      bundle,
      presetId: BUNDLED_PRESET_ID,
      effectiveEquipment: { white: { pieceId: 'piece.pawn-plus', replaces: 'piece.pawn', square: 'a2' } },
    })).toEqual({ eligible: true })
  })

  it('sandboxes valid equipment when its active-room side budget is too small', () => {
    const content = loaded((source) => {
      const preset = source.presets.find((entry) => (entry as { id: string }).id === BUNDLED_PRESET_ID) as Record<string, unknown>
      preset.loadoutBudget = 0
    })
    expect(standardEligibility({
      content,
      bundle,
      presetId: BUNDLED_PRESET_ID,
      effectiveEquipment: { white: { pieceId: 'piece.pawn-plus', replaces: 'piece.pawn', square: 'a2' } },
    })).toEqual({
      eligible: false,
      reasons: ['loadout-grade-or-budget-invalid'],
    })
  })

  it('sandboxes equipment that exceeds the active-room ceiling even within budget', () => {
    const content = loaded((source) => {
      const preset = source.presets.find((entry) => (entry as { id: string }).id === BUNDLED_PRESET_ID) as Record<string, unknown>
      preset.pieceIds = ['piece.pawn']
      preset.loadoutBudget = 100
    })
    const preset = content.presets.get(BUNDLED_PRESET_ID)!
    const board = content.boards.get(preset.boardId)!
    const ceiling = costCeiling(preset.pieceIds.map((id) => content.pieces.get(id)!), board)
    expect(pieceCost(content.pieces.get('piece.rook-plus')!, board)).toBeGreaterThan(ceiling)
    expect(standardEligibility({
      content,
      bundle,
      presetId: BUNDLED_PRESET_ID,
      effectiveEquipment: { white: { pieceId: 'piece.rook-plus', replaces: 'piece.rook', square: 'a1' } },
    })).toEqual({
      eligible: false,
      reasons: ['loadout-grade-or-budget-invalid'],
    })
  })

  it('judges an effective piece instead of the room-authored piece axis it overrides', () => {
    const content = loaded((source) => {
      const preset = source.presets.find((entry) => (entry as { id: string }).id === BUNDLED_PRESET_ID) as Record<string, unknown>
      preset.loadout = {
        white: { piece: { pieceId: 'piece.knight', replaces: 'piece.knight', square: 'b1' } },
      }
    })
    expect(standardEligibility({
      content,
      bundle,
      presetId: BUNDLED_PRESET_ID,
      effectiveEquipment: { white: { pieceId: 'piece.pawn-plus', replaces: 'piece.pawn', square: 'a2' } },
    })).toEqual({ eligible: true })
  })

  it('sandboxes migrated replace-all loadouts with a stable reason', () => {
    const content = loaded((source) => {
      source.schemaVersion = 16
      const preset = source.presets.find((entry) => (entry as { id: string }).id === BUNDLED_PRESET_ID) as Record<string, unknown>
      preset.loadoutBudget = 100
      preset.loadout = { white: { pieceId: 'piece.archer', replaces: 'piece.knight', skillCardId: 'skill.blink' } }
      ;(preset as { skillCardIds: string[] }).skillCardIds = (preset as { skillCardIds: string[] }).skillCardIds.filter((id) => id !== 'skill.blink')
    })
    expect(standardEligibility({ content, bundle, presetId: BUNDLED_PRESET_ID })).toEqual({
      eligible: false,
      reasons: ['legacy-replace-all-loadout'],
    })
  })

  it('reports an over-ceiling authored starting piece without blocking play', () => {
    const content = loaded((source) => {
      addAuthoredSlider(source, 'piece.authored-overcap', NINE_SLIDE_VECTORS, 'a2')
    })
    expect(standardEligibility({ content, bundle, presetId: BUNDLED_PRESET_ID })).toEqual({
      eligible: false,
      reasons: ['authored-piece-over-ceiling'],
    })
  })

  it('rechecks canonical-safe authored movement on the active large board', () => {
    const canonical = loaded((source) => {
      addAuthoredSlider(source, 'piece.authored-contextual', SIX_SLIDE_VECTORS, 'a2')
    })
    const largeBoard = loaded((source) => {
      const board = source.boards.find((entry) => (entry as { id: string }).id === BUNDLED_BOARD_ID) as { width: number; height: number }
      board.width = 8
      board.height = 8
      addAuthoredSlider(source, 'piece.authored-contextual', SIX_SLIDE_VECTORS, 'a2')
    })
    expect(standardEligibility({ content: canonical, bundle, presetId: BUNDLED_PRESET_ID })).toEqual({ eligible: true })
    expect(standardEligibility({ content: largeBoard, bundle, presetId: BUNDLED_PRESET_ID })).toEqual({
      eligible: false,
      reasons: ['authored-piece-over-ceiling'],
    })
  })

  it('returns multiple reasons in deterministic contract order', () => {
    const content = loaded((source) => {
      source.schemaVersion = 16
      const board = source.boards.find((entry) => (entry as { id: string }).id === BUNDLED_BOARD_ID) as { placements: Array<{ square: string; pieceId: string; side: string }> }
      board.placements.find((entry) => entry.square === 'a2')!.pieceId = 'piece.pawn-plus'
      addAuthoredSlider(source, 'piece.authored-overcap', NINE_SLIDE_VECTORS, 'b2')
      const preset = source.presets.find((entry) => (entry as { id: string }).id === BUNDLED_PRESET_ID) as Record<string, unknown>
      preset.loadoutBudget = 100
      preset.loadout = { white: { pieceId: 'piece.archer', replaces: 'piece.knight', skillCardId: 'skill.blink' } }
      ;(preset as { skillCardIds: string[] }).skillCardIds = (preset as { skillCardIds: string[] }).skillCardIds.filter((id) => id !== 'skill.blink')
    })
    expect(standardEligibility({ content, bundle, presetId: BUNDLED_PRESET_ID })).toEqual({
      eligible: false,
      reasons: [
        'legacy-replace-all-loadout',
        'curated-upgrade-requires-owned-equipment',
        'authored-piece-over-ceiling',
      ],
    })
  })
})
