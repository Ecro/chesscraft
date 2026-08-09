import { describe, expect, it } from 'vitest'
import type { ContentSource } from '@content/load'
import { COLLECTIONS } from '@content/merge'
import { bundledContentSource } from '@content/sets/bundled'
import { officialIds } from '@content/provenance'
import { forkOnEdit } from '@editor/fork'

/**
 * PLAN-content-provenance-and-room-delete Phase 6 / ADR-001 — editing an
 * official record's RULES produces the child's own copy; renaming it does not.
 *
 * The subtlety this file exists for is not the record — it is the TEXT. A record
 * carries `nameKey`/`textKey`, never words, and the words live either in the
 * locale bundle (ours) or in `source.strings` (theirs). A fork that copies the
 * record and nothing else leaves the copy pointing at the ORIGINAL's keys, and
 * then renaming the copy renames the original everywhere it is used — the exact
 * failure ADR-001 exists to prevent, arriving through the text layer.
 *
 * `resolve` is injected rather than imported so this stays a pure unit: the real
 * caller passes the app's `t`, which reaches both the overlay and `ko.ts`.
 */

function bundle(): ContentSource {
  return {
    schemaVersion: 10,
    pieces: [
      {
        id: 'piece.king',
        nameKey: 'piece.king.name',
        textKey: 'piece.king.text',
        effects: [],
        movement: [{ kind: 'step', vectors: [[0, 1]] }],
      },
    ],
    squareTypes: [],
    ruleCards: [],
    skillCards: [],
    boards: [],
    presets: [{ id: 'preset.default', nameKey: 'preset.default.name', boardId: 'board.a' }],
  }
}

/** The bundle as the author holds it, plus one piece of their own. */
function saved(): ContentSource {
  const source = bundle()
  source.pieces.push({
    id: 'piece.dragon',
    nameKey: 'piece.dragon.name',
    textKey: 'piece.dragon.text',
    effects: [],
    movement: [{ kind: 'step', vectors: [[1, 1]] }],
  })
  return source
}

/** Words the locale bundle answers for — what `t` would return. */
const WORDS: Record<string, string> = {
  'piece.king.name': '왕',
  'piece.king.text': '한 칸씩 움직인다.',
}
const resolve = (key: string) => WORDS[key] ?? key

const official = () => officialIds(bundle())
const openPiece = (source: ContentSource, id: string) =>
  structuredClone(source.pieces.find((p) => (p as { id: string }).id === id)) as Record<string, unknown>

describe('forkOnEdit — when it fires', () => {
  it('does NOT fork an unchanged official record', () => {
    // Opening a record and saving it untouched must not multiply the catalogue.
    const source = saved()
    const out = forkOnEdit(source, 'piece', openPiece(source, 'piece.king'), 'piece.king', bundle(), official(), resolve, 'ko')
    expect(out.forked).toBe(false)
    expect(out.draft['id']).toBe('piece.king')
  })

  it('forks when a RULE changes', () => {
    const source = saved()
    const draft = openPiece(source, 'piece.king') as { movement: Array<{ vectors: number[][] }> } & Record<string, unknown>
    draft.movement[0]!.vectors = [
      [0, 1],
      [1, 1],
    ]
    const out = forkOnEdit(source, 'piece', draft, 'piece.king', bundle(), official(), resolve, 'ko')
    expect(out.forked).toBe(true)
    expect(out.draft['id']).toBe('piece.king-2')
  })

  it('does NOT fork a record the author made, however much it changed', () => {
    const source = saved()
    const draft = openPiece(source, 'piece.dragon') as { movement: unknown } & Record<string, unknown>
    draft.movement = [{ kind: 'step', vectors: [[2, 2]] }]
    const out = forkOnEdit(source, 'piece', draft, 'piece.dragon', bundle(), official(), resolve, 'ko')
    expect(out.forked).toBe(false)
    expect(out.draft['id']).toBe('piece.dragon')
  })

  it('does NOT fork a record that only WEARS an official id', () => {
    // An imported set may ship its own `piece.king` with a different definition
    // (`e2e/content.ts` says exactly this about the slice document). That record
    // is the child's, not ours: there is no pristine original to protect, so
    // editing it — including renaming it — must not fork.
    const source = saved()
    source.pieces[0] = {
      id: 'piece.king',
      nameKey: 'piece.king.name',
      textKey: 'piece.king.text',
      effects: [],
      movement: [{ kind: 'step', vectors: [[3, 3]] }],
    }
    const draft = openPiece(source, 'piece.king') as { movement: Array<{ vectors: number[][] }> } & Record<string, unknown>
    draft.movement[0]!.vectors = [[1, 1]]
    const out = forkOnEdit(source, 'piece', draft, 'piece.king', bundle(), official(), resolve, 'ko')
    expect(out.forked).toBe(false)
    expect(out.draft['id']).toBe('piece.king')
  })

  it('does NOT fork a brand-new record (no opened id)', () => {
    const source = saved()
    const out = forkOnEdit(source, 'piece', { id: 'piece.new' }, null, bundle(), official(), resolve, 'ko')
    expect(out.forked).toBe(false)
  })

  it('does NOT fork when a nameless official record merely GAINS a key', () => {
    /*
     * Phase 6 exit case 4, asserted rather than assumed — and the assumption
     * turned out to be about the wrong thing.
     *
     * The first version of this test claimed the protection was the ORDER of
     * `forkOnEdit` and `foldText` in `RecordForm`. It is not. `foldText` assigns
     * a key only when the record HAS none (`slotFor`), and `nameKey` is
     * `i18nKey` — required, not optional — in every record schema
     * (`src/content/schema.ts:345`). So a record we ship always carries one, and
     * `foldText` has nothing to assign; swapping the two calls would change
     * nothing. The bundle invariant is what makes case 4 true, and
     * `the shipped bundle` block below asserts THAT.
     *
     * What stays here is the narrower fact this function owns: a key appearing
     * on a record IS a structural difference, so if such a record could ever
     * reach here mid-rename it would fork — which is why the invariant matters.
     */
    const shipped = bundle()
    shipped.pieces[0] = { id: 'piece.king', effects: [], movement: [{ kind: 'step', vectors: [[0, 1]] }] }
    const source = saved()
    source.pieces[0] = structuredClone(shipped.pieces[0])

    const untouched = structuredClone(source.pieces[0]) as Record<string, unknown>
    expect(forkOnEdit(source, 'piece', untouched, 'piece.king', shipped, official(), resolve, 'ko').forked).toBe(false)

    const keyed = { ...untouched, nameKey: 'piece.king.name' }
    expect(
      forkOnEdit(source, 'piece', keyed, 'piece.king', shipped, official(), resolve, 'ko').forked,
      'a key appearing on the record is a structural difference',
    ).toBe(true)
  })

  it('walks past an id the document already holds', () => {
    const source = saved()
    source.pieces.push({ id: 'piece.king-2', nameKey: 'x', textKey: 'y', effects: [], movement: [] })
    const draft = openPiece(source, 'piece.king') as { movement: Array<{ vectors: number[][] }> } & Record<string, unknown>
    draft.movement[0]!.vectors = [[2, 0]]
    const out = forkOnEdit(source, 'piece', draft, 'piece.king', bundle(), official(), resolve, 'ko')
    expect(out.draft['id']).toBe('piece.king-3')
  })
})

describe('forkOnEdit — the copy takes its own text (the ADR-001 amendment)', () => {
  const forkedKing = () => {
    const source = saved()
    const draft = openPiece(source, 'piece.king') as { movement: Array<{ vectors: number[][] }> } & Record<string, unknown>
    draft.movement[0]!.vectors = [[2, 0]]
    return forkOnEdit(source, 'piece', draft, 'piece.king', bundle(), official(), resolve, 'ko')
  }

  it('re-points the copy at ITS OWN keys, not the original\'s', () => {
    // The whole point. Sharing `piece.king.name` would make a later rename of
    // the copy rewrite the original's name everywhere it is used.
    const out = forkedKing()
    expect(out.draft['nameKey']).toBe('piece.king-2.name')
    expect(out.draft['textKey']).toBe('piece.king-2.text')
  })

  it('copies the CURRENT words to the new keys, so the copy is not born nameless', () => {
    const out = forkedKing()
    expect(out.strings?.['ko']?.['piece.king-2.name']).toBe('왕')
    expect(out.strings?.['ko']?.['piece.king-2.text']).toBe('한 칸씩 움직인다.')
  })

  it('leaves the ORIGINAL\'s entries untouched', () => {
    // `writeString` returns a new object; if it ever mutated, the original's
    // name would move with the copy.
    const out = forkedKing()
    expect(out.strings?.['ko']?.['piece.king.name']).toBeUndefined()
    const source = saved()
    expect(source.pieces[0]).toMatchObject({ id: 'piece.king', nameKey: 'piece.king.name' })
  })

  it('copies the author\'s OVERLAY text when they had renamed the original', () => {
    // A child who renamed our king to 임금님 and then changes its movement must
    // get a copy called 임금님 — not one called 왕, and not a nameless one.
    const source = saved()
    source.strings = { ko: { 'piece.king.name': '임금님' } }
    const draft = openPiece(source, 'piece.king') as { movement: Array<{ vectors: number[][] }> } & Record<string, unknown>
    draft.movement[0]!.vectors = [[2, 0]]
    const overlayResolve = (key: string) => source.strings?.['ko']?.[key] ?? WORDS[key] ?? key
    const out = forkOnEdit(source, 'piece', draft, 'piece.king', bundle(), official(), overlayResolve, 'ko')
    expect(out.strings?.['ko']?.['piece.king-2.name']).toBe('임금님')
    // And the original still says it, so the rename did not travel with the copy.
    expect(out.strings?.['ko']?.['piece.king.name']).toBe('임금님')
  })

  it('writes no entry for a key nothing can resolve', () => {
    // `resolve` falls back to the key by design. Writing that INTO the overlay
    // would put a dotted key on screen as if it were a name — the ADR-002 leak,
    // re-created by the fork.
    const source = saved()
    const draft = openPiece(source, 'piece.king') as Record<string, unknown>
    draft['textKey'] = 'piece.king.nothing-answers-this'
    ;(draft as { movement: Array<{ vectors: number[][] }> }).movement[0]!.vectors = [[2, 0]]
    const out = forkOnEdit(source, 'piece', draft, 'piece.king', bundle(), official(), resolve, 'ko')
    expect(out.strings?.['ko']?.['piece.king-2.text']).toBeUndefined()
    // The key field still moves, so a later rename lands on the copy's own key.
    expect(out.draft['textKey']).toBe('piece.king-2.text')
  })

  it('leaves `strings` ABSENT rather than empty when there was nothing to copy', () => {
    // `strings` is exactly-optional: a document with `strings: undefined` is a
    // different document from one that omits the field, and the schema tells
    // them apart. This is the absent case, stated.
    const source = saved()
    const draft = openPiece(source, 'piece.king') as Record<string, unknown>
    draft['nameKey'] = ''
    draft['textKey'] = ''
    ;(draft as { movement: Array<{ vectors: number[][] }> }).movement[0]!.vectors = [[2, 0]]
    const out = forkOnEdit(source, 'piece', draft, 'piece.king', bundle(), official(), resolve, 'ko')
    expect(out.forked).toBe(true)
    expect(out.strings).toBeUndefined()
  })

  it('never mutates the draft or the source it was given', () => {
    const source = saved()
    const draft = openPiece(source, 'piece.king') as { movement: Array<{ vectors: number[][] }> } & Record<string, unknown>
    draft.movement[0]!.vectors = [[2, 0]]
    const draftBefore = JSON.stringify(draft)
    const sourceBefore = JSON.stringify(source)
    forkOnEdit(source, 'piece', draft, 'piece.king', bundle(), official(), resolve, 'ko')
    expect(JSON.stringify(draft)).toBe(draftBefore)
    expect(JSON.stringify(source)).toBe(sourceBefore)
  })
})

describe('forkOnEdit — rooms fork too (ADR-004 applies to all six kinds)', () => {
  it('forks an official room whose composition changed', () => {
    const source = saved()
    const draft = structuredClone(source.presets[0]) as Record<string, unknown>
    draft['boardId'] = 'board.b'
    const out = forkOnEdit(source, 'preset', draft, 'preset.default', bundle(), official(), resolve, 'ko')
    expect(out.forked).toBe(true)
    expect(out.draft['id']).toBe('preset.default-2')
    expect(out.draft['nameKey']).toBe('preset.default-2.name')
  })

  it('does not invent a textKey for a kind that has none', () => {
    // Rooms and boards carry a name only. Deriving `preset.x-2.text` would put a
    // field on the record the schema does not admit, and `commitDraft` would
    // refuse the save with a message about a field the child never typed in.
    const source = saved()
    const draft = structuredClone(source.presets[0]) as Record<string, unknown>
    draft['boardId'] = 'board.b'
    const out = forkOnEdit(source, 'preset', draft, 'preset.default', bundle(), official(), resolve, 'ko')
    expect(out.draft).not.toHaveProperty('textKey')
  })
})

describe('the shipped bundle keeps case 4 unreachable', () => {
  /*
   * The real guarantee behind Phase 6's exit case 4.
   *
   * `foldText` assigns a `nameKey` only to a record that lacks one, so it can
   * never make an official record fork on a pure rename — PROVIDED every record
   * we ship carries its keys. That is a property of the bundle, not of any call
   * order, and it is the thing that would actually break: ship one record
   * without a `nameKey` and the guarantee is gone with nothing else to notice.
   *
   * Asserted over the REAL bundle, not a fixture. A fixture would assert that
   * the fixture is well-formed.
   */
  it('gives every shipped record a non-empty nameKey', () => {
    const offenders: string[] = []
    for (const name of COLLECTIONS) {
      for (const record of bundledContentSource[name]) {
        const r = record as { id?: unknown; nameKey?: unknown }
        if (typeof r.nameKey !== 'string' || r.nameKey === '') offenders.push(String(r.id))
      }
    }
    expect(offenders, 'a shipped record with no nameKey would let a rename fork it').toEqual([])
  })

  it('gives every shipped record that HAS a textKey a non-empty one', () => {
    const offenders: string[] = []
    for (const name of COLLECTIONS) {
      for (const record of bundledContentSource[name]) {
        const r = record as { id?: unknown; textKey?: unknown }
        if ('textKey' in r && (typeof r.textKey !== 'string' || r.textKey === '')) offenders.push(String(r.id))
      }
    }
    expect(offenders).toEqual([])
  })
})
