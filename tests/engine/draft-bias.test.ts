import { describe, expect, it } from 'vitest'
import type { ContentSet } from '@content/load'
import { apply, legalActions } from '@engine/engine'
import { createPosition } from '@engine/match'
import type { GameState, Side } from '@engine/types'
import { contentWith } from '../helpers/content'
import { shippedContent } from '../helpers/shipped'

function atAward(content: ContentSet, side: Side, extra: boolean): GameState {
  const state = createPosition({
    content,
    presetId: 'preset.default',
    seed: 91,
    sideToMove: side,
    held: { white: side === 'white' ? ['skill.teleport'] : [], black: side === 'black' ? ['skill.teleport'] : [] },
    placements: [
      { square: 'a1', pieceId: 'piece.king', side: 'white' },
      { square: 'b1', pieceId: 'piece.rook', side: 'white' },
      { square: 'f6', pieceId: 'piece.king', side: 'black' },
      { square: 'e6', pieceId: 'piece.rook', side: 'black' },
      ...(extra ? [{ square: 'c3', pieceId: 'piece.pawn', side: 'white' as const }] : []),
    ],
  })
  return {
    ...state,
    drafts: {
      ...state.drafts,
      [side]: {
        ...state.drafts[side],
        completedTurns: 4,
        nextSkillTurn: 5,
        awardCount: 0,
        everOffered: ['skill.teleport'],
      },
    },
  }
}

function closeTurn(state: GameState, content: ContentSet): GameState {
  const move = legalActions(state, content).find((action) => action.kind === 'move')
  if (!move) throw new Error('fixture must have a legal move')
  return apply(state, move, content)
}

describe('recurring skill awards are position-independent', () => {
  it('draws the same award from the same seed despite a different board', () => {
    const content = shippedContent()
    const plain = closeTurn(atAward(content, 'white', false), content)
    const varied = closeTurn(atAward(content, 'white', true), content)

    expect(plain.drafts.white.awardCount).toBe(1)
    expect(plain.drafts.white.held[1]).toBeDefined()
    expect(plain.drafts.white.held[1]).not.toBe('skill.teleport')
    expect(varied.drafts.white.held[1]).toBe(plain.drafts.white.held[1])
  })

  it('uses an independent stream for each side and remains deterministic', () => {
    const content = shippedContent()
    const whiteA = closeTurn(atAward(content, 'white', false), content)
    const whiteB = closeTurn(atAward(content, 'white', false), content)
    const black = closeTurn(atAward(content, 'black', false), content)

    expect(whiteA.drafts.white.held).toEqual(whiteB.drafts.white.held)
    expect(black.drafts.black.awardCount).toBe(1)
    expect(black.drafts.black.held[1]).toBeDefined()
    expect(black.drafts.black.held[1]).not.toBe('skill.teleport')
  })

  it('advances an exhausted pool without creating an offer or deadlocking play', () => {
    const content = contentWith((source) => {
      source.presets[0]!.skillCardIds = ['skill.teleport']
    })
    const after = closeTurn(atAward(content, 'white', false), content)

    expect(after.drafts.white.completedTurns).toBe(5)
    expect(after.drafts.white.awardCount).toBe(1)
    expect(after.drafts.white.nextSkillTurn).toBe(10)
    expect(after.drafts.white.held).toEqual(['skill.teleport'])
    expect(after.drafts.white.offers).toBeNull()
    expect(legalActions(after, content).some((action) => action.kind === 'draft_pick')).toBe(false)
  })
})
