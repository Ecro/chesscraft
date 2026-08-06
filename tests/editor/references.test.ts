import { describe, expect, it } from 'vitest'
import type { ContentSource } from '@content/load'
import { roomsReferencing } from '@editor/references'

/**
 * PLAN Phase 9a — "which rooms reference this record".
 *
 * Two callers ask this question and they must not answer it differently: the
 * library tab's "어느 방에도 안 들어감" badge (9a) and the delete guard (9b).
 * That is the whole reason it is one module and not two inline `.some()` calls.
 *
 * The transitive path is the part that is easy to get wrong and expensive to
 * get wrong. A room names its pieces in `pieceIds`, but its BOARD also names
 * pieces in `placements[].pieceId` and square types in `squares[].typeId`, and
 * nothing in the schema requires the two lists to agree. A guard that only read
 * the four direct id fields would report "no room uses this" about a piece
 * standing on a room's opening position — and in 9b that answer deletes it,
 * leaving a document that no longer loads.
 *
 * Every fixture below is built as a `ContentSource` literal rather than through
 * `loadContentSet`, because the interesting cases are exactly the ones a
 * validator may refuse: this function's job is to describe a document as it
 * actually is, including one that is already inconsistent.
 */

const EMPTY: ContentSource = {
  schemaVersion: 6,
  pieces: [],
  squareTypes: [],
  ruleCards: [],
  skillCards: [],
  boards: [],
  presets: [],
}

function sourceWith(over: Partial<ContentSource>): ContentSource {
  return { ...structuredClone(EMPTY), ...over }
}

/** A room whose board carries neither placements nor painted squares. */
function room(id: string, over: Record<string, unknown> = {}) {
  return {
    id,
    nameKey: `${id}.name`,
    boardId: 'board.one',
    pieceIds: ['piece.king'],
    ruleCardIds: [] as string[],
    skillCardIds: [] as string[],
    ...over,
  }
}

function board(id: string, over: Record<string, unknown> = {}) {
  return { id, nameKey: `${id}.name`, width: 6, height: 6, placements: [], squares: [], ...over }
}

describe('roomsReferencing', () => {
  it('reports nothing for a record no room mentions on any path', () => {
    const source = sourceWith({
      boards: [board('board.one')],
      presets: [room('preset.a')],
    })
    expect(roomsReferencing(source, 'piece', 'piece.ghost')).toEqual([])
    expect(roomsReferencing(source, 'skillCard', 'skill.unused')).toEqual([])
  })

  it('reports the room that names a piece directly', () => {
    const source = sourceWith({
      boards: [board('board.one')],
      presets: [room('preset.a', { pieceIds: ['piece.king', 'piece.archer'] })],
    })
    expect(roomsReferencing(source, 'piece', 'piece.archer')).toEqual(['preset.a'])
  })

  it('reports the room for a piece reachable ONLY through that room board placements', () => {
    // `pieceIds` deliberately omits it. This is the case a direct-fields-only
    // guard gets wrong, and getting it wrong in 9b deletes a piece that is
    // standing on the opening position of a room.
    const source = sourceWith({
      boards: [board('board.one', { placements: [{ square: 'a1', pieceId: 'piece.ghost', side: 'white' }] })],
      presets: [room('preset.a', { pieceIds: ['piece.king'] })],
    })
    expect(roomsReferencing(source, 'piece', 'piece.ghost')).toEqual(['preset.a'])
  })

  it('reports the room for a square type reachable only through that room board squares', () => {
    const source = sourceWith({
      boards: [board('board.one', { squares: [{ square: 'c3', typeId: 'square.beacon' }] })],
      presets: [room('preset.a')],
    })
    expect(roomsReferencing(source, 'squareType', 'square.beacon')).toEqual(['preset.a'])
  })

  it('does not reach through a board no room plays on', () => {
    // The board exists and paints the type; no room points at that board, so
    // nothing about the type is in play. A walk over every board rather than
    // over each ROOM'S board would answer "preset.a" here and badge a genuinely
    // orphaned record as used.
    const source = sourceWith({
      boards: [
        board('board.one'),
        board('board.other', { squares: [{ square: 'c3', typeId: 'square.beacon' }] }),
      ],
      presets: [room('preset.a', { boardId: 'board.one' })],
    })
    expect(roomsReferencing(source, 'squareType', 'square.beacon')).toEqual([])
  })

  it('reports the room that plays on a board, and only that room', () => {
    const source = sourceWith({
      boards: [board('board.one'), board('board.two')],
      presets: [room('preset.a', { boardId: 'board.one' }), room('preset.b', { boardId: 'board.two' })],
    })
    expect(roomsReferencing(source, 'board', 'board.two')).toEqual(['preset.b'])
  })

  it('reports rule and skill cards from the pools a room draws from', () => {
    const source = sourceWith({
      boards: [board('board.one')],
      presets: [room('preset.a', { ruleCardIds: ['rule.rush'], skillCardIds: ['skill.warp'] })],
    })
    expect(roomsReferencing(source, 'ruleCard', 'rule.rush')).toEqual(['preset.a'])
    expect(roomsReferencing(source, 'skillCard', 'skill.warp')).toEqual(['preset.a'])
  })

  it('reports every room that reaches the record, once each, in document order', () => {
    // Once each: `preset.b` reaches the piece BOTH ways, and a room named twice
    // in a refusal message reads as a bug to the child it is explaining itself
    // to — and inflates any count a caller derives from the length.
    const source = sourceWith({
      boards: [board('board.one', { placements: [{ square: 'a1', pieceId: 'piece.ghost', side: 'white' }] })],
      presets: [
        room('preset.a', { pieceIds: ['piece.king'] }),
        room('preset.b', { pieceIds: ['piece.ghost'] }),
        room('preset.c', { pieceIds: ['piece.ghost'], boardId: 'board.missing' }),
      ],
    })
    expect(roomsReferencing(source, 'piece', 'piece.ghost')).toEqual(['preset.a', 'preset.b', 'preset.c'])
  })

  it('answers for a room itself with nothing — rooms do not reference rooms', () => {
    const source = sourceWith({ boards: [board('board.one')], presets: [room('preset.a')] })
    expect(roomsReferencing(source, 'preset', 'preset.a')).toEqual([])
  })

  it('survives a room whose board id names nothing, rather than throwing', () => {
    // A dangling `boardId` is reachable in the editor between two saves, and
    // the library badge renders on every keystroke. Throwing here would take
    // the editor down while the child is mid-edit.
    const source = sourceWith({ boards: [], presets: [room('preset.a', { boardId: 'board.missing' })] })
    expect(roomsReferencing(source, 'piece', 'piece.king')).toEqual(['preset.a'])
    expect(roomsReferencing(source, 'squareType', 'square.beacon')).toEqual([])
  })
})
