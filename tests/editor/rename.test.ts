import { describe, expect, it } from 'vitest'
import type { ContentSource } from '@content/load'
import { sliceContentSource } from '@content/sets/slice'
import { commitDraft } from '@editor/draft'

/**
 * PLAN Phase 8 (R10) — the rename primitive.
 *
 * `commitDraft` has matched records solely on the DRAFT'S OWN id since Phase 3.
 * That is fine while an id never changes, and wrong the moment one does: the
 * changed id matches nothing, so the save APPENDS a second record and the
 * original is orphaned in the document forever. Nothing surfaced it because
 * nothing in the editor could change an id yet.
 *
 * ADR-020 turns that latent defect into a visible one — the orphan takes its
 * text with it — so the primitive lands here, one phase before the form that
 * reaches it (Phase 9a threads the opened id through).
 *
 * The absent case is asserted too: `openedId` is optional, and every existing
 * call site omits it. If omitting it changed behaviour, Phase 3's editor would
 * have regressed on a phase that was supposed to leave it alone.
 */

function sourceWithRabbit() {
  const base: ContentSource = {
    ...structuredClone(sliceContentSource),
    strings: { ko: { 'piece.rabbit.name': '토끼', 'piece.rabbit.text': '깡충 뛴다.', 'piece.king.name': '왕' } },
  }
  const draft = {
    id: 'piece.rabbit',
    nameKey: 'piece.rabbit.name',
    textKey: 'piece.rabbit.text',
    movement: [{ kind: 'step', vectors: [[0, 1]] }],
    effects: [],
  }
  const created = commitDraft(base, 'piece', draft)
  if (!created.ok) throw new Error(`fixture must commit: ${JSON.stringify(created.errors)}`)
  return { source: created.source, draft }
}

const pieceIds = (source: ContentSource) => source.pieces.map((p) => (p as { id: string }).id)

describe('renaming a record through commitDraft', () => {
  it('replaces the record rather than appending a second one', () => {
    const { source, draft } = sourceWithRabbit()
    const before = pieceIds(source).length

    const renamed = commitDraft(
      source,
      'piece',
      { ...draft, id: 'piece.hare', nameKey: 'piece.hare.name', textKey: 'piece.hare.text' },
      'piece.rabbit',
    )
    expect(renamed.ok, renamed.ok ? '' : JSON.stringify(renamed.errors)).toBe(true)
    if (!renamed.ok) return

    const ids = pieceIds(renamed.source)
    expect(ids).toContain('piece.hare')
    expect(ids).not.toContain('piece.rabbit')
    expect(ids.length).toBe(before)
    expect(ids.filter((id) => id === 'piece.hare')).toHaveLength(1)
  })

  it('moves the record’s text with it, leaving no orphaned strings', () => {
    const { source, draft } = sourceWithRabbit()
    const renamed = commitDraft(
      source,
      'piece',
      { ...draft, id: 'piece.hare', nameKey: 'piece.hare.name', textKey: 'piece.hare.text' },
      'piece.rabbit',
    )
    expect(renamed.ok).toBe(true)
    if (!renamed.ok) return

    const ko = renamed.source.strings?.ko
    expect(ko?.['piece.hare.name']).toBe('토끼')
    expect(ko?.['piece.hare.text']).toBe('깡충 뛴다.')
    expect(ko?.['piece.rabbit.name']).toBeUndefined()
    expect(ko?.['piece.rabbit.text']).toBeUndefined()
    // Another record's text is not collateral.
    expect(ko?.['piece.king.name']).toBe('왕')
    // And the renamed record's name actually resolves off the loaded set.
    expect(renamed.set.strings.ko?.['piece.hare.name']).toBe('토끼')
  })

  it('leaves the base document untouched, as every other commit does', () => {
    const { source, draft } = sourceWithRabbit()
    const snapshot = structuredClone(source)
    commitDraft(source, 'piece', { ...draft, id: 'piece.hare' }, 'piece.rabbit')
    expect(source).toEqual(snapshot)
  })

  it('refuses a rename that would break a reference, and changes nothing', () => {
    // `piece.king` is placed on the slice's board and listed in its preset.
    // Renaming it must fail the SAME validator a normal save runs, rather than
    // producing a document whose board points at a piece that no longer exists.
    const { source } = sourceWithRabbit()
    const snapshot = structuredClone(source)
    const king = (source.pieces as Array<{ id: string }>).find((p) => p.id === 'piece.king')!
    const result = commitDraft(source, 'piece', { ...king, id: 'piece.monarch' }, 'piece.king')
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.errors.some((e) => e.message.includes('piece.king'))).toBe(true)
    // The name of this test promises immutability on the REJECTED path, and an
    // implementation that mutated `base` before validating would satisfy every
    // other assertion here. Asserted, not implied.
    expect(source).toEqual(snapshot)
  })

  it('without an opened id, behaves exactly as it did before this phase', () => {
    const { source, draft } = sourceWithRabbit()
    const before = pieceIds(source).length

    // Same id — replace in place.
    const replaced = commitDraft(source, 'piece', { ...draft, textKey: 'piece.rabbit.text' })
    expect(replaced.ok).toBe(true)
    if (!replaced.ok) return
    expect(pieceIds(replaced.source).length).toBe(before)

    // New id — append, because no caller said which record was opened.
    const appended = commitDraft(source, 'piece', {
      ...draft,
      id: 'piece.hare',
      nameKey: 'piece.hare.name',
      textKey: 'piece.hare.text',
    })
    expect(appended.ok).toBe(true)
    if (!appended.ok) return
    expect(pieceIds(appended.source).length).toBe(before + 1)
  })

  it('refuses a stale save whose typed id already belongs to another record', () => {
    // The defect this closes was found by a cross-model reviewer and confirmed
    // by running it, after a Claude reviewer had cleared the same lines as
    // "checks out against the seven cases in rename.test.ts" — which was true,
    // and irrelevant: none of the seven collided, so the tests could not see it.
    //
    // The buffer was opened on a record another path has since deleted, and the
    // author typed an id that ALREADY exists. Matching by the draft's own id
    // found that other record and overwrote it; the save VALIDATED, so a child
    // saw a successful save and someone else's piece was silently gone.
    const { source, draft } = sourceWithRabbit()
    const created = commitDraft(source, 'piece', {
      ...draft,
      id: 'piece.hare',
      nameKey: 'piece.hare.name',
      textKey: 'piece.hare.text',
    })
    expect(created.ok).toBe(true)
    if (!created.ok) return
    const before = structuredClone(created.source)

    const stale = commitDraft(
      created.source,
      'piece',
      { ...draft, id: 'piece.hare', nameKey: 'piece.hare.name', textKey: 'piece.hare.text', movement: [{ kind: 'step', vectors: [[0, 9]] }] },
      'piece.gone',
    )
    expect(stale.ok).toBe(false)
    if (stale.ok) return
    expect(stale.errors.some((e) => e.message.includes('duplicate id piece.hare'))).toBe(true)
    expect(created.source).toEqual(before)
  })

  it('refuses a rename onto an id another record already owns', () => {
    // The REPLACE path's collision, distinct from the push path above: the
    // opened record IS found, so its slot is overwritten with a record now
    // carrying an id a third record already holds.
    //
    // Added because the re-review that raised it said it had verified this by
    // INSPECTION. That is the same instrument that cleared the defect this
    // round fixed — true about the code it read, blind to the case no test
    // reached. Inspection-confidence is converted to measurement here rather
    // than carried.
    const { source, draft } = sourceWithRabbit()
    const before = structuredClone(source)
    const result = commitDraft(
      source,
      'piece',
      { ...draft, id: 'piece.king', nameKey: 'piece.king.name', textKey: 'piece.king.text' },
      'piece.rabbit',
    )
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.errors.some((e) => e.message.includes('duplicate id piece.king'))).toBe(true)
    expect(source).toEqual(before)
  })

  it('appends when the opened id names a record the document does not have', () => {
    // A stale editor buffer must not silently drop the save.
    const { source, draft } = sourceWithRabbit()
    const before = pieceIds(source).length
    const result = commitDraft(
      source,
      'piece',
      { ...draft, id: 'piece.hare', nameKey: 'piece.hare.name', textKey: 'piece.hare.text' },
      'piece.gone',
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(pieceIds(result.source)).toContain('piece.hare')
    expect(pieceIds(result.source).length).toBe(before + 1)
  })
})
