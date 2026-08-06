import { describe, expect, it } from 'vitest'
import type { ContentSource } from '@content/load'
import { deleteRecord } from '@editor/draft'
import { readString } from '@editor/strings'

/**
 * PLAN Phase 9b — deletion, and every way it must refuse.
 *
 * Nothing in this editor deleted anything until now, which is exactly why this
 * is the riskiest subsystem in the plan: the failure mode is not a broken
 * screen, it is a document that no longer loads, and a document that no longer
 * loads takes the whole app down rather than one room. So `deleteRecord`
 * revalidates through `loadContentSet` — the same validator the game loads
 * with — for the same reason `commitDraft` does.
 *
 * The refusals carry the referring ROOM IDS rather than a boolean, because the
 * message the child has to read is "이 방들이 쓰고 있어요" with the rooms named.
 * A guard that only says no leaves them to guess which of their rooms is the
 * one holding on.
 *
 * Fixtures are `ContentSource` literals rather than loader output, for the same
 * reason `references.test.ts` uses them: the interesting cases include
 * documents a validator would refuse, and the guard has to describe the
 * document as it actually is.
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

function piece(id: string) {
  return {
    id,
    nameKey: `${id}.name`,
    textKey: `${id}.text`,
    movement: [{ kind: 'step', vectors: [[0, 1]] }],
    effects: [],
  }
}

function board(id: string, over: Record<string, unknown> = {}) {
  return { id, nameKey: `${id}.name`, width: 6, height: 6, placements: [], squares: [], ...over }
}

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

function squareType(id: string) {
  return { id, nameKey: `${id}.name`, textKey: `${id}.text`, paired: false, effects: [] }
}

/** A document that loads: two rooms, two pieces, one board, one spare square type. */
function base(): ContentSource {
  return {
    ...structuredClone(EMPTY),
    pieces: [piece('piece.king'), piece('piece.archer')],
    squareTypes: [squareType('square.beacon')],
    boards: [board('board.one'), board('board.two')],
    presets: [
      room('preset.a', { pieceIds: ['piece.king'] }),
      room('preset.b', { boardId: 'board.two', pieceIds: ['piece.king'] }),
    ],
    strings: { ko: { 'piece.archer.name': '궁수', 'piece.archer.text': '두 칸 떨어진 적을 쏜다' } },
  }
}

describe('deleteRecord', () => {
  it('deletes a record no room reaches, and the result still loads', () => {
    const result = deleteRecord(base(), 'piece', 'piece.archer')
    expect(result.ok, 'an unreferenced record must be deletable').toBe(true)
    if (!result.ok) return

    expect(result.source.pieces.map((p) => (p as { id: string }).id)).toEqual(['piece.king'])
    // Revalidated, not merely spliced — `set` only exists when the whole
    // document went back through the loader.
    expect(result.set.pieces.has('piece.archer')).toBe(false)
    expect(result.set.pieces.has('piece.king')).toBe(true)
  })

  it('takes the record text with it, leaving nothing keyed to a record that is gone', () => {
    // Without this a delete leaves overlay entries nothing can ever reach again —
    // invisible on screen, and carried through every export and re-import.
    const result = deleteRecord(base(), 'piece', 'piece.archer')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(readString(result.source.strings, 'ko', 'piece.archer.name')).toBeUndefined()
    expect(readString(result.source.strings, 'ko', 'piece.archer.text')).toBeUndefined()
  })

  it('never mutates the document it was given', () => {
    const source = base()
    const before = JSON.stringify(source)
    deleteRecord(source, 'piece', 'piece.archer')
    expect(JSON.stringify(source)).toBe(before)
  })

  it('refuses a referenced record and names every room holding it', () => {
    const result = deleteRecord(base(), 'piece', 'piece.king')
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('referenced')
    // The ids, not a boolean — the UI turns these into names the child reads.
    expect(result.rooms).toEqual(['preset.a', 'preset.b'])
  })

  it('refuses a piece reachable ONLY through a room board placements', () => {
    // `pieceIds` deliberately omits it. A guard reading only the four direct
    // preset fields would delete a piece standing on a room's opening square,
    // and the document would stop loading on the next boot.
    const source = base()
    source.pieces.push(piece('piece.ghost'))
    source.boards[0] = board('board.one', {
      placements: [{ square: 'a1', pieceId: 'piece.ghost', side: 'white' }],
    })
    const result = deleteRecord(source, 'piece', 'piece.ghost')
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('referenced')
    expect(result.rooms).toEqual(['preset.a'])
  })

  it('refuses a square type reachable ONLY through a room board squares', () => {
    const source = base()
    source.boards[0] = board('board.one', { squares: [{ square: 'c3', typeId: 'square.beacon' }] })
    const result = deleteRecord(source, 'squareType', 'square.beacon')
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('referenced')
    expect(result.rooms).toEqual(['preset.a'])
  })

  it('deletes a room that other rooms do not depend on', () => {
    const result = deleteRecord(base(), 'preset', 'preset.b')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect([...result.set.presets.keys()]).toEqual(['preset.a'])
  })

  it('refuses the sole remaining room, which no schema rule would catch', () => {
    // `presets` carries no array minimum, so a document with zero rooms VALIDATES
    // — and then there is nothing to play and no way back except the editor the
    // child just emptied. This guard has no backstop underneath it.
    const source = base()
    source.presets = [room('preset.only')]
    const result = deleteRecord(source, 'preset', 'preset.only')
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('last-room')
    expect(result.rooms).toEqual([])
  })

  it("refuses a room's last piece, naming the room rather than the array bound", () => {
    // Reachable only as a refusal: `pieceIds` carries `.min(1)`, so the room
    // cannot give this piece up either. Both doors are shut, and the message the
    // child gets has to be about their room, not about an array minimum.
    const source = base()
    source.presets = [room('preset.a', { pieceIds: ['piece.king'] }), room('preset.b', { pieceIds: ['piece.archer'] })]
    const result = deleteRecord(source, 'piece', 'piece.archer')
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('referenced')
    expect(result.rooms).toEqual(['preset.b'])
  })

  it('refuses a board a room plays on, naming that room', () => {
    // The fourth reference path, and the only one the eleven original cases left
    // unreached through `deleteRecord` — `references.ts` covers it, but a delete
    // that never asked would have shipped behind a green `references.test.ts`.
    const result = deleteRecord(base(), 'board', 'board.two')
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('referenced')
    expect(result.rooms).toEqual(['preset.b'])
  })

  it('deletes a board no room plays on', () => {
    const source = base()
    source.boards.push(board('board.spare'))
    const result = deleteRecord(source, 'board', 'board.spare')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect([...result.set.boards.keys()]).toEqual(['board.one', 'board.two'])
  })

  it('leaves text a surviving record still points at, and takes the text nothing points at', () => {
    // Keys that do NOT derive from their record's id — an imported set, which
    // Phase 9a's `slotFor` exists to support. Dropping by the `${id}.` prefix
    // gets BOTH halves wrong here at once: it would strand `shared.name` (the
    // deleted record's real entry) and remove `piece.gone.name`, which a
    // DIFFERENT surviving record is the one pointing at.
    const source = base()
    source.pieces.push(
      { ...piece('piece.gone'), nameKey: 'shared.name', textKey: 'shared.text' },
      { ...piece('piece.stays'), nameKey: 'piece.gone.name', textKey: 'piece.gone.text' },
    )
    source.strings = {
      ko: {
        'shared.name': '사라질 것',
        'shared.text': '사라질 설명',
        'piece.gone.name': '남을 것',
        'piece.gone.text': '남을 설명',
      },
    }

    const result = deleteRecord(source, 'piece', 'piece.gone')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    // Its own entries are gone — nothing points at them any more.
    expect(readString(result.source.strings, 'ko', 'shared.name')).toBeUndefined()
    expect(readString(result.source.strings, 'ko', 'shared.text')).toBeUndefined()
    // And the surviving record still reads.
    expect(readString(result.source.strings, 'ko', 'piece.gone.name')).toBe('남을 것')
    expect(readString(result.source.strings, 'ko', 'piece.gone.text')).toBe('남을 설명')
  })

  it('keeps a shared key that DOES sit in the deleted id namespace', () => {
    // The shared key is `piece.one.name` — inside the deleted record's own
    // namespace, and pointed at by a record that survives. That is what makes
    // this a regression test rather than a description: a drop-by-`${id}.`
    // implementation removes it and breaks `piece.two`, while asking "does
    // anything still point at this" keeps it. A shared key OUTSIDE the deleted
    // namespace would have survived either implementation and guarded nothing.
    const source = base()
    source.pieces.push(
      { ...piece('piece.one'), nameKey: 'piece.one.name', textKey: 'piece.one.text' },
      { ...piece('piece.two'), nameKey: 'piece.one.name', textKey: 'piece.one.text' },
    )
    source.strings = { ko: { 'piece.one.name': '둘이 같이 쓰는 이름', 'piece.one.text': '설명' } }

    const result = deleteRecord(source, 'piece', 'piece.one')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(readString(result.source.strings, 'ko', 'piece.one.name')).toBe('둘이 같이 쓰는 이름')
    expect(readString(result.source.strings, 'ko', 'piece.one.text')).toBe('설명')
  })

  it('refuses a record that is not there rather than reporting a successful delete', () => {
    const result = deleteRecord(base(), 'piece', 'piece.nobody')
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('missing')
  })

  it('refuses a delete the reference walk allowed but the loader will not accept', () => {
    // The backstop, and NOT a duplicate of the reference guard — this is the gap
    // between them. `references.ts` answers "which ROOMS use this", so a board no
    // room plays on is invisible to it; but the loader checks EVERY board's
    // placements, including that one's. Delete the piece it stands on and the
    // reference walk says yes while the document stops loading. Splicing the
    // record out would have shipped exactly that.
    const source = base()
    source.boards[1] = board('board.two', {
      placements: [{ square: 'a1', pieceId: 'piece.archer', side: 'white' }],
    })
    source.presets = [room('preset.a', { boardId: 'board.one', pieceIds: ['piece.king'] })]

    const result = deleteRecord(source, 'piece', 'piece.archer')
    expect(result.ok, 'the loader must have the last word').toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('invalid')
    expect(result.rooms).toEqual([])
    expect(result.errors.length).toBeGreaterThan(0)
    expect(result.errors.map((e) => e.path).join(' ')).toContain('board.two')
  })
})
