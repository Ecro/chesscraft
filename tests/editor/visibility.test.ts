import { describe, expect, it } from 'vitest'
import type { ContentSource } from '@content/load'
import { officialIds } from '@content/provenance'
import { canHide, partitionByOrigin, visibleIds } from '@editor/visibility'

/**
 * PLAN-content-provenance-and-room-delete Phase 3 — ADR-005's rules, as pure
 * functions over lists.
 *
 * Hiding is a VIEW concern: it filters what the author browses and picks from,
 * and never touches the document. That is what makes it unable to produce an
 * unloadable set, and therefore unable to refuse for a reference the way
 * `deleteRecord` must.
 */

function bundle(): ContentSource {
  return {
    schemaVersion: 10,
    pieces: [
      { id: 'piece.king', nameKey: 'piece.king.name' },
      { id: 'piece.rook', nameKey: 'piece.rook.name' },
    ],
    squareTypes: [],
    ruleCards: [],
    skillCards: [],
    boards: [{ id: 'board.a', nameKey: 'board.a.name' }],
    presets: [
      { id: 'preset.one', nameKey: 'preset.one.name' },
      { id: 'preset.two', nameKey: 'preset.two.name' },
    ],
  }
}

/** The document as the author has it: the bundle plus something of their own. */
function saved(): ContentSource {
  const source = bundle()
  source.pieces.push({ id: 'piece.dragon', nameKey: 'piece.dragon.name' })
  source.presets.push({ id: 'preset.mine', nameKey: 'preset.mine.name' })
  return source
}

const entriesOf = (records: unknown[]): Array<[string, unknown]> =>
  records.map((r) => [String((r as { id: string }).id), (r as { nameKey: unknown }).nameKey])

describe('visibleIds', () => {
  const pieces = () => entriesOf(saved().pieces)

  it('drops hidden records', () => {
    const out = visibleIds(pieces(), new Set(['piece.rook']), [])
    expect(out.map(([id]) => id)).toEqual(['piece.king', 'piece.dragon'])
  })

  it('is the identity when nothing is hidden', () => {
    expect(visibleIds(pieces(), new Set(), []).map(([id]) => id)).toEqual([
      'piece.king',
      'piece.rook',
      'piece.dragon',
    ])
  })

  it('KEEPS a hidden record the caller already selects (the ADR-005 exemption)', () => {
    // The load-bearing case. A picker that dropped an already-selected record
    // would render its checkbox missing, which reads as the selection having
    // been lost — and the next save of that form would actually lose it.
    const out = visibleIds(pieces(), new Set(['piece.rook']), ['piece.rook'])
    expect(out.map(([id]) => id)).toEqual(['piece.king', 'piece.rook', 'piece.dragon'])
  })

  it('keeps the exempted record IN PLACE rather than appending it', () => {
    // Position matters: a picker that moved the already-selected record to the
    // end would reshuffle the list every time something was hidden.
    const out = visibleIds(pieces(), new Set(['piece.rook']), ['piece.rook'])
    expect(out.map(([id]) => id).indexOf('piece.rook')).toBe(1)
  })

  it('does not resurrect a record that is not in the list, even if selected', () => {
    // `keepSelected` is an exemption from HIDING, not a source of records. A
    // dangling reference stays dangling, and the surfaces that report one keep
    // reporting it.
    const out = visibleIds(pieces(), new Set(), ['piece.deleted'])
    expect(out.map(([id]) => id)).not.toContain('piece.deleted')
  })

  it('never mutates its input', () => {
    const input = pieces()
    const before = JSON.stringify(input)
    visibleIds(input, new Set(['piece.rook']), [])
    expect(JSON.stringify(input)).toBe(before)
  })
})

describe('partitionByOrigin', () => {
  it('splits a list into what we ship and what the author made, preserving order', () => {
    const official = officialIds(bundle())
    const { official: ours, authored: theirs } = partitionByOrigin(entriesOf(saved().pieces), official)
    expect(ours.map(([id]) => id)).toEqual(['piece.king', 'piece.rook'])
    expect(theirs.map(([id]) => id)).toEqual(['piece.dragon'])
  })

  it('puts everything in `authored` when the bundle ships nothing of that id', () => {
    const { official: ours, authored: theirs } = partitionByOrigin(
      entriesOf(saved().pieces),
      new Set<string>(),
    )
    expect(ours).toEqual([])
    expect(theirs).toHaveLength(3)
  })

  it('leaves `authored` EMPTY rather than absent when the author has made nothing', () => {
    // The empty-collection case, asserted because the list surfaces render a
    // heading for each side and an absent array would make one vanish rather
    // than say it is empty.
    const { official: ours, authored: theirs } = partitionByOrigin(
      entriesOf(bundle().pieces),
      officialIds(bundle()),
    )
    expect(ours).toHaveLength(2)
    expect(theirs).toEqual([])
  })
})

describe('canHide', () => {
  const official = () => officialIds(bundle())

  it('allows hiding a room we ship', () => {
    expect(canHide(saved(), 'preset', 'preset.one', new Set(), official())).toEqual({ ok: true })
  })

  it('refuses a record the author made — those are deleted, not hidden', () => {
    expect(canHide(saved(), 'preset', 'preset.mine', new Set(), official())).toEqual({
      ok: false,
      reason: 'authored',
    })
  })

  it('refuses an id that is in no document', () => {
    expect(canHide(saved(), 'preset', 'preset.nope', new Set(), official())).toEqual({
      ok: false,
      reason: 'missing',
    })
  })

  it('refuses hiding the last VISIBLE room, counting hidden rooms as gone', () => {
    // The same rule `deleteRecord` enforces (`src/editor/draft.ts:269`) and the
    // same `reason`, so one sentence covers both. Counting `presets.length`
    // instead would let the author hide every room but one and then hide that
    // one too, leaving a title screen with nothing to play.
    const source = saved() // preset.one, preset.two, preset.mine
    const hidden = new Set(['preset.one'])
    expect(canHide(source, 'preset', 'preset.two', hidden, official())).toEqual({ ok: true })
    const nearlyAll = new Set(['preset.one', 'preset.mine'])
    expect(canHide(source, 'preset', 'preset.two', nearlyAll, official())).toEqual({
      ok: false,
      reason: 'last-room',
    })
  })

  it('does NOT refuse a piece a room still uses — hiding cannot break a document', () => {
    // The consequence that separates hiding from deleting (ADR-005). The
    // document is untouched, so there is no reference to protect and no refusal
    // for the child to decode.
    expect(canHide(saved(), 'piece', 'piece.king', new Set(), official())).toEqual({ ok: true })
  })

  it('allows hiding the last piece, because the last-room rule is about rooms', () => {
    const onePiece: ContentSource = { ...bundle(), pieces: [{ id: 'piece.king', nameKey: 'x' }] }
    expect(canHide(onePiece, 'piece', 'piece.king', new Set(), officialIds(onePiece))).toEqual({
      ok: true,
    })
  })
})
