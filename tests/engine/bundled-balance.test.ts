import { describe, expect, it } from 'vitest'
import { loadBundledContent } from '@content/sets/bundled'
import { apply, describeRejection, legalActions } from '@engine/engine'
import { createPosition } from '@engine/match'

const content = loadBundledContent()

function position(held: string[], placements: Array<{ square: string; pieceId: string; side: 'white' | 'black' }>, presetId = 'preset.default') {
  return createPosition({
    content,
    presetId,
    seed: 73,
    sideToMove: 'white',
    held: { white: held, black: [] },
    placements,
  })
}

function plays(state: ReturnType<typeof position>, cardId: string) {
  return legalActions(state, content).filter((action) => action.kind === 'play_card' && action.cardId === cardId)
}

describe('bundled card balance constraints', () => {
  it('keeps shrine promotion inside the covenant promotion band', () => {
    const before = createPosition({
      content,
      presetId: 'preset.covenant',
      seed: 74,
      sideToMove: 'white',
      placements: [
        { square: 'a1', pieceId: 'piece.king', side: 'white' },
        { square: 'f3', pieceId: 'piece.pawn', side: 'white' },
        { square: 'f6', pieceId: 'piece.king', side: 'black' },
      ],
    })
    const move = legalActions(before, content).find((action) => action.kind === 'move' && action.from === 'f3' && action.to === 'f4')
    expect(move).toBeDefined()
    expect(apply(before, move!, content).board.get('f4')).toEqual({ pieceId: 'piece.bishop', side: 'white' })
  })

  it('keeps teleport inside friendly territory and away from royals', () => {
    const before = position(['skill.teleport'], [
      { square: 'a1', pieceId: 'piece.king', side: 'white' },
      { square: 'b2', pieceId: 'piece.rook', side: 'white' },
      { square: 'f6', pieceId: 'piece.king', side: 'black' },
    ])
    const legal = plays(before, 'skill.teleport')
    expect(legal.some((action) => action.kind === 'play_card' && action.targets[0] === 'b2' && action.targets[1] === 'c3')).toBe(true)
    expect(legal.some((action) => action.kind === 'play_card' && action.targets[0] === 'a1')).toBe(false)
    expect(legal.some((action) => action.kind === 'play_card' && action.targets[1] === 'f5')).toBe(false)

    const forged = { kind: 'play_card' as const, cardId: 'skill.teleport', targets: ['b2', 'f5'] }
    expect(describeRejection(before, forged, content)).toBe('card-bad-targets')
    expect(apply(before, forged, content)).toEqual(before)
  })

  it('limits quake to a non-royal enemy and a small local destination', () => {
    const before = position(['skill.quake'], [
      { square: 'a1', pieceId: 'piece.king', side: 'white' },
      { square: 'e4', pieceId: 'piece.rook', side: 'black' },
      { square: 'f6', pieceId: 'piece.king', side: 'black' },
    ])
    const legal = plays(before, 'skill.quake')
    const valid = legal.find((action) => action.kind === 'play_card' && action.targets[0] === 'e4' && action.targets[1] === 'd4')
    expect(valid).toBeDefined()
    expect(legal.some((action) => action.kind === 'play_card' && action.targets[1] === 'a4')).toBe(false)
    expect(legal.some((action) => action.kind === 'play_card' && action.targets[0] === 'f6')).toBe(false)

    const forged = { kind: 'play_card' as const, cardId: 'skill.quake', targets: ['e4', 'a4'] }
    expect(describeRejection(before, forged, content)).toBe('card-bad-targets')
    const after = apply(before, valid!, content)
    expect(after.board.get('d4')).toEqual({ pieceId: 'piece.rook', side: 'black' })
    expect(after.frozenUntil['d4']).toBeUndefined()
  })

  it('keeps volley from deleting queens and sacrifice from trading a queen', () => {
    const volley = position(['skill.volley'], [
      { square: 'a1', pieceId: 'piece.king', side: 'white' },
      { square: 'd4', pieceId: 'piece.queen', side: 'black' },
      { square: 'e4', pieceId: 'piece.rook', side: 'black' },
      { square: 'f6', pieceId: 'piece.king', side: 'black' },
    ])
    const volleyPlays = plays(volley, 'skill.volley')
    expect(volleyPlays.some((action) => action.kind === 'play_card' && action.targets[0] === 'e4')).toBe(true)
    expect(volleyPlays.some((action) => action.kind === 'play_card' && action.targets[0] === 'd4')).toBe(false)
    expect(describeRejection(volley, { kind: 'play_card', cardId: 'skill.volley', targets: ['d4'] }, content)).toBe('card-bad-targets')

    const sacrifice = position(['skill.sacrifice'], [
      { square: 'a1', pieceId: 'piece.king', side: 'white' },
      { square: 'c3', pieceId: 'piece.rook', side: 'white' },
      { square: 'd3', pieceId: 'piece.rook', side: 'black' },
      { square: 'e3', pieceId: 'piece.queen', side: 'black' },
      { square: 'f6', pieceId: 'piece.king', side: 'black' },
    ])
    const sacrificePlays = plays(sacrifice, 'skill.sacrifice')
    expect(sacrificePlays.some((action) => action.kind === 'play_card' && action.targets[0] === 'c3' && action.targets[1] === 'd3')).toBe(true)
    expect(sacrificePlays.some((action) => action.kind === 'play_card' && action.targets[1] === 'e3')).toBe(false)
  })

  it('allows coronation only for a pawn already in the promotion zone', () => {
    const before = position(['skill.coronation'], [
      { square: 'a1', pieceId: 'piece.king', side: 'white' },
      { square: 'b6', pieceId: 'piece.pawn', side: 'white' },
      { square: 'c3', pieceId: 'piece.pawn', side: 'white' },
      { square: 'f6', pieceId: 'piece.king', side: 'black' },
    ])
    const legal = plays(before, 'skill.coronation')
    const valid = legal.find((action) => action.kind === 'play_card' && action.targets[0] === 'b6')
    expect(valid).toBeDefined()
    expect(legal.some((action) => action.kind === 'play_card' && action.targets[0] === 'c3')).toBe(false)
    expect(apply(before, valid!, content).board.get('b6')?.pieceId).toBe('piece.queen')
    expect(describeRejection(before, { kind: 'play_card', cardId: 'skill.coronation', targets: ['c3'] }, content)).toBe('card-bad-targets')
  })

  it('runs the same territory and royal guard checks on the 12x12 preset', () => {
    const before = position(['skill.teleport'], [
      { square: 'a1', pieceId: 'piece.king', side: 'white' },
      { square: 'b2', pieceId: 'piece.rook', side: 'white' },
      { square: 'l12', pieceId: 'piece.king', side: 'black' },
    ], 'preset.colossus')
    const legal = plays(before, 'skill.teleport')
    expect(legal.some((action) => action.kind === 'play_card' && action.targets[0] === 'b2' && action.targets[1] === 'c3')).toBe(true)
    expect(legal.some((action) => action.kind === 'play_card' && action.targets[0] === 'a1')).toBe(false)
    expect(legal.some((action) => action.kind === 'play_card' && action.targets[1] === 'l10')).toBe(false)
  })
})
