import { describe, expect, it } from 'vitest'
import { BUNDLED_PRESET_ID, loadBundledContent } from '@content/sets/bundled'
import { apply, legalActions } from '@engine/engine'
import { createPosition } from '@engine/match'
import type { ActiveGrant, GameState, PieceOnBoard, Side, SquareId } from '@engine/types'

/**
 * Capture protection names a beneficiary, not a floor tile.
 *
 * AC-001/002/004/005 are RED on the shipped engine: board relocations update
 * `m.board` without updating `m.grants`. AC-003 is the deliberate negative
 * control and is allowed to stay GREEN because its RED siblings drive the same
 * teleport seam while proving that only capture protection may move.
 */

const content = loadBundledContent()
type Place = { square: SquareId; pieceId: string; side: Side }
const at = (square: SquareId, pieceId: string, side: Side = 'white'): Place => ({ square, pieceId, side })
const piece = (pieceId: string, side: Side = 'white'): PieceOnBoard => ({ pieceId, side })

function position(placements: Place[], held: string[] = []): GameState {
  return createPosition({
    content,
    presetId: BUNDLED_PRESET_ID,
    seed: 41,
    sideToMove: 'white',
    placements,
    held: { white: held, black: [] },
  })
}

function protectedAt(
  state: GameState,
  square: SquareId,
  sourceId = 'skill.veil',
  beneficiarySide: Side = 'white',
): ActiveGrant {
  return {
    kind: 'block_capture',
    square,
    untilPly: state.plyCount + 3,
    sourceId,
    layer: 'skill',
    beneficiarySide,
  }
}

function withGrants(state: GameState, grants: ActiveGrant[]): GameState {
  return { ...state, grants }
}

function playCard(state: GameState, cardId: string, targets: SquareId[]): GameState {
  const action = legalActions(state, content).find(
    (candidate) =>
      candidate.kind === 'play_card' &&
      candidate.cardId === cardId &&
      candidate.targets.length === targets.length &&
      candidate.targets.every((target, index) => target === targets[index]),
  )
  if (!action) throw new Error(`${cardId} on [${targets.join(', ')}] is not legal — the fixture is wrong`)
  return apply(state, action, content)
}

function move(state: GameState, from: SquareId, to: SquareId): GameState {
  const action = legalActions(state, content).find(
    (candidate) => candidate.kind === 'move' && candidate.from === from && candidate.to === to,
  )
  if (!action) throw new Error(`${from}->${to} is not legal — the fixture is wrong`)
  return apply(state, action, content)
}

const protection = (state: GameState): ActiveGrant[] =>
  state.grants.filter((grant) => grant.kind === 'block_capture')

const canCapture = (state: GameState, from: SquareId, to: SquareId): boolean =>
  legalActions(state, content).some(
    (candidate) => candidate.kind === 'move' && candidate.from === from && candidate.to === to,
  )

describe('AC-001: durationed capture protection follows a normal move', () => {
  it('moves the real veil grant and keeps the beneficiary out of enemy captures', () => {
    const before = position(
      [
        at('a1', 'piece.king'),
        at('b1', 'piece.rook'),
        at('b4', 'piece.rook', 'black'),
        at('f6', 'piece.king', 'black'),
      ],
      ['skill.veil'],
    )
    const veiled = playCard(before, 'skill.veil', ['b1'])
    expect(protection(veiled).map((grant) => grant.square)).toEqual(['b1'])

    const after = move(veiled, 'b1', 'b2')

    expect(protection(after).map((grant) => grant.square), 'one shield follows the chosen rook').toEqual(['b2'])
    expect(canCapture(after, 'b4', 'b2'), 'black cannot capture the still-veiled rook').toBe(false)
  })
})

describe('AC-002: capture protection follows every engine relocation path', () => {
  it('follows a teleport to the relocated piece', () => {
    const base = position(
      [at('a1', 'piece.king'), at('b1', 'piece.rook'), at('f6', 'piece.king', 'black')],
      ['skill.teleport'],
    )
    const before = withGrants(base, [protectedAt(base, 'b1')])

    const after = playCard(before, 'skill.teleport', ['b1', 'd3'])

    expect(after.board.get('d3')).toEqual(piece('piece.rook'))
    expect(protection(after).map((grant) => grant.square)).toEqual(['d3'])
  })

  it('moves each swap endpoint from the original grant snapshot exactly once', () => {
    const base = position(
      [
        at('a1', 'piece.king'),
        at('c2', 'piece.rook'),
        at('d3', 'piece.knight'),
        at('e4', 'piece.bishop'),
        at('f6', 'piece.king', 'black'),
      ],
      ['skill.swap'],
    )
    const before = withGrants(base, [
      protectedAt(base, 'c2', 'fixture.cover.rook'),
      protectedAt(base, 'd3', 'fixture.cover.knight'),
      protectedAt(base, 'e4', 'fixture.cover.unrelated'),
    ])

    const after = playCard(before, 'skill.swap', ['c2', 'd3'])
    const grants = protection(after)

    expect(after.board.get('d3')).toEqual(piece('piece.rook'))
    expect(after.board.get('c2')).toEqual(piece('piece.knight'))
    expect(grants, 'swap neither duplicates nor drops a protection grant').toHaveLength(3)
    expect(grants.map((grant) => `${grant.sourceId}:${grant.square}`).sort()).toEqual([
      'fixture.cover.knight:c2',
      'fixture.cover.rook:d3',
      'fixture.cover.unrelated:e4',
    ])
  })

  it('keeps a terminal royal-capture snapshot aligned with its final board', () => {
    const base = position([
      at('a1', 'piece.king'),
      at('b1', 'piece.rook'),
      at('b6', 'piece.king', 'black'),
    ])
    const before = withGrants(base, [protectedAt(base, 'b1')])

    const after = move(before, 'b1', 'b6')

    expect(after.result).toEqual({ kind: 'win', winner: 'white', reason: 'king_capture' })
    expect(after.board.get('b6')).toEqual(piece('piece.rook'))
    expect(protection(after).map((grant) => grant.square)).toEqual(['b6'])
  })
})

describe('AC-003: square-anchored effects do not start following pieces', () => {
  it('leaves movement grants, movement forbids and freezes at the teleport origin', () => {
    const base = position(
      [at('a1', 'piece.king'), at('b1', 'piece.rook'), at('f6', 'piece.king', 'black')],
      ['skill.teleport'],
    )
    const before: GameState = {
      ...base,
      frozenUntil: {
        b1: { untilPly: base.plyCount + 3, sourceId: 'fixture.freeze', layer: 'rule' },
      },
      grants: [
        {
          kind: 'forbid_movement',
          square: 'b1',
          untilPly: base.plyCount + 3,
          sourceId: 'fixture.forbid',
          layer: 'rule',
          beneficiarySide: 'white',
        },
        {
          kind: 'grant_movement',
          square: 'b1',
          untilPly: base.plyCount + 3,
          sourceId: 'fixture.grant',
          layer: 'rule',
          beneficiarySide: 'white',
          pattern: { kind: 'step', vectors: [[1, 1]] },
        },
      ],
    }

    const after = playCard(before, 'skill.teleport', ['b1', 'd3'])

    expect(after.frozenUntil.b1).toBeDefined()
    expect(after.frozenUntil.d3).toBeUndefined()
    expect(after.grants.find((grant) => grant.sourceId === 'fixture.forbid')?.square).toBe('b1')
    expect(after.grants.find((grant) => grant.sourceId === 'fixture.grant')?.square).toBe('b1')
  })
})

describe('AC-005: an entry-destroyed beneficiary leaves no lingering protection', () => {
  it('drops protection when the shipped bomb leaves the destination empty', () => {
    const base = position([
      at('c1', 'piece.king'),
      at('a2', 'piece.rook'),
      at('b2', 'piece.rook'),
      at('a5', 'piece.rook', 'black'),
      at('f6', 'piece.king', 'black'),
    ])
    const before = withGrants(base, [protectedAt(base, 'a2')])

    const after = move(before, 'a2', 'a3')

    expect(after.board.has('a3'), 'the bomb destroys the entering rook').toBe(false)
    expect(
      protection(after).filter((grant) => grant.square === 'a2' || grant.square === 'a3'),
      'there is no shield for a later occupant to inherit',
    ).toEqual([])

    const afterBlackTurn = move(after, 'f6', 'f5')
    const replacementArrived = move(afterBlackTurn, 'b2', 'a2')
    expect(replacementArrived.board.get('a2')).toEqual(piece('piece.rook'))
    expect(
      canCapture(replacementArrived, 'a5', 'a2'),
      'a later same-side occupant does not inherit the destroyed rook shield',
    ).toBe(true)
  })
})
