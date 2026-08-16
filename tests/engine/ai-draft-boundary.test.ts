import { describe, expect, it } from 'vitest'
import { BUNDLED_PRESET_ID } from '@content/sets/bundled'
import type { ContentSet } from '@content/load'
import { wouldRevealDraft } from '@engine/ai/search'
import { SKILL_AWARD_INTERVAL, apply, legalActions } from '@engine/engine'
import { createPosition } from '@engine/match'
import type { GameState } from '@engine/types'
import { shippedContent } from '../helpers/shipped'

const base = shippedContent()

function contentWithWhiteLoadout(cardId: string): ContentSet {
  const preset = base.presets.get(BUNDLED_PRESET_ID)!
  const withLoadout = {
    ...preset,
    skillCardIds: preset.skillCardIds.filter((id) => id !== cardId),
    loadout: { white: { pieceId: 'piece.knight', replaces: 'piece.knight', skillCardId: cardId } },
  }
  return { ...base, presets: new Map(base.presets).set(BUNDLED_PRESET_ID, withLoadout) }
}

/** White is one completed turn short of its next automatic award. */
function atBoundary(content: ContentSet, opts: { poolLeft: number; held?: string[] }): GameState {
  const preset = content.presets.get(BUNDLED_PRESET_ID)!
  const held = opts.held ?? []
  const shared = preset.skillCardIds.filter((id) => !held.includes(id))
  const burn = shared.slice(0, Math.max(0, shared.length - opts.poolLeft))
  const state = createPosition({
    content,
    presetId: BUNDLED_PRESET_ID,
    seed: 11,
    sideToMove: 'white',
    held: { white: held, black: [] },
    placements: [
      { square: 'a1', pieceId: 'piece.king', side: 'white' },
      { square: 'c3', pieceId: 'piece.rook', side: 'white' },
      { square: 'f6', pieceId: 'piece.king', side: 'black' },
    ],
  })
  return {
    ...state,
    drafts: {
      ...state.drafts,
      white: {
        ...state.drafts.white,
        completedTurns: SKILL_AWARD_INTERVAL - 1,
        nextSkillTurn: SKILL_AWARD_INTERVAL,
        awardCount: 0,
        draftIndex: 1,
        offers: null,
        everOffered: [...burn, ...held],
      },
    },
  }
}

function awardDrawnOnClose(state: GameState, content: ContentSet): { predicted: boolean; actual: boolean } {
  const closing = legalActions(state, content).find((action) => action.kind === 'move')
  expect(closing, 'the fixture needs a move to close the turn with').toBeDefined()
  const predicted = wouldRevealDraft(state, closing!, content)
  const beforeHeld = state.drafts.white.held.length
  const after = apply(state, closing!, content)
  return { predicted, actual: after.drafts.white.held.length > beforeHeld }
}

describe('wouldRevealDraft follows recurring skill awards', () => {
  it('agrees when the award pool has an eligible card', () => {
    const state = atBoundary(base, { poolLeft: 6 })
    const { predicted, actual } = awardDrawnOnClose(state, base)
    expect(actual).toBe(true)
    expect(predicted).toBe(actual)
  })

  it('agrees when the award pool is exhausted', () => {
    const state = atBoundary(base, { poolLeft: 0 })
    const { predicted, actual } = awardDrawnOnClose(state, base)
    expect(actual).toBe(false)
    expect(predicted).toBe(actual)
  })

  it('includes a side-specific loadout card in the award pool', () => {
    const content = contentWithWhiteLoadout('skill.volley')
    const preset = content.presets.get(BUNDLED_PRESET_ID)!
    expect(preset.skillCardIds).not.toContain('skill.volley')
    const state = atBoundary(content, { poolLeft: 0 })
    const { predicted, actual } = awardDrawnOnClose(state, content)
    expect(actual).toBe(true)
    expect(predicted).toBe(actual)
  })
})
