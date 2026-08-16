import { describe, expect, it } from 'vitest'
import { apply, legalActions } from '@engine/engine'
import { createPosition } from '@engine/match'
import { contentWith } from '../helpers/content'
import { shippedContent } from '../helpers/shipped'

function atTurn(content: ReturnType<typeof shippedContent>, side: 'white' | 'black', completedTurns: number, awardCount: number, held: string[]) {
  const state = createPosition({
    content,
    presetId: 'preset.default',
    seed: 41,
    sideToMove: side,
    held: { white: side === 'white' ? held : [], black: side === 'black' ? held : [] },
    placements: [
      { square: 'a1', pieceId: 'piece.king', side: 'white' },
      { square: 'b1', pieceId: 'piece.rook', side: 'white' },
      { square: 'f6', pieceId: 'piece.king', side: 'black' },
      { square: 'e6', pieceId: 'piece.rook', side: 'black' },
    ],
  })
  const draft = state.drafts[side]
  return {
    ...state,
    drafts: {
      ...state.drafts,
      [side]: {
        ...draft,
        completedTurns,
        nextSkillTurn: completedTurns + (completedTurns % 5 === 4 ? 1 : 5 - (completedTurns % 5)),
        awardCount,
        everOffered: [...held],
      },
    },
  }
}

function closeTurn(state: ReturnType<typeof atTurn>, content: ReturnType<typeof shippedContent>) {
  const move = legalActions(state, content).find((action) => action.kind === 'move')
  if (!move) throw new Error('fixture must have a legal move')
  return apply(state, move, content)
}

describe('recurring per-side skill awards', () => {
  it('awards exactly one new card at turns 5, 10, and 15 without opening a draft gate', () => {
    const content = shippedContent()
    const first = closeTurn(atTurn(content, 'white', 4, 0, ['skill.teleport']), content)
    expect(first.drafts.white.completedTurns).toBe(5)
    expect(first.drafts.white.awardCount).toBe(1)
    expect(first.drafts.white.nextSkillTurn).toBe(10)
    expect(first.drafts.white.held).toHaveLength(2)
    expect(first.drafts.white.held[1]).not.toBe('skill.teleport')
    expect(first.drafts.white.offers).toBeNull()
    expect(legalActions(first, content).some((action) => action.kind === 'draft_pick')).toBe(false)

    const second = closeTurn(
      {
        ...first,
        sideToMove: 'black',
        drafts: {
          ...first.drafts,
          white: { ...first.drafts.white, completedTurns: 9, nextSkillTurn: 10 },
        },
      },
      content,
    )
    // The black move closes black's turn; white remains at its threshold. Run
    // a white move from a state that restores white to the side to move.
    const whiteAgain = { ...second, sideToMove: 'white' as const }
    const tenth = closeTurn(whiteAgain, content)
    expect(tenth.drafts.white.completedTurns).toBe(10)
    expect(tenth.drafts.white.awardCount).toBe(2)
    expect(tenth.drafts.white.nextSkillTurn).toBe(15)
    expect(tenth.drafts.white.held).toHaveLength(3)
  })

  it('is independent per side and deterministic across board positions', () => {
    const content = shippedContent()
    const white = closeTurn(atTurn(content, 'white', 4, 0, ['skill.teleport']), content)
    const black = closeTurn(atTurn(content, 'black', 4, 0, ['skill.teleport']), content)
    expect(white.drafts.white.held[1]).toBeDefined()
    expect(black.drafts.black.held[1]).toBeDefined()
    expect(black.drafts.black.held[1]).not.toBe('skill.teleport')

    const differentBoard = {
      ...atTurn(content, 'white', 4, 0, ['skill.teleport']),
      board: new Map([
        ...atTurn(content, 'white', 4, 0, ['skill.teleport']).board,
        ['c3', { pieceId: 'piece.pawn', side: 'white' as const }],
      ]),
    }
    const varied = closeTurn(differentBoard, content)
    expect(varied.drafts.white.held[1]).toBe(white.drafts.white.held[1])
  })

  it('advances exhausted thresholds without gating board play', () => {
    const content = contentWith((source) => {
      source.presets[0]!.skillCardIds = ['skill.teleport']
    })
    const state = atTurn(content, 'white', 4, 0, ['skill.teleport'])
    const after = closeTurn(state, content)
    expect(after.drafts.white.completedTurns).toBe(5)
    expect(after.drafts.white.awardCount).toBe(1)
    expect(after.drafts.white.nextSkillTurn).toBe(10)
    expect(after.drafts.white.held).toEqual(['skill.teleport'])
    expect(after.drafts.white.offers).toBeNull()
    expect(legalActions(after, content).some((action) => action.kind === 'draft_pick')).toBe(false)
  })
})
