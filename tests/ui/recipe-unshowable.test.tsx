// @vitest-environment jsdom
/**
 * AC-007 — a record the sentence cannot show is read-only, not flattened.
 *
 * The oracle is byte-stability under a no-op session: serialise, open, close,
 * serialise, require equality. It holds for any record regardless of how the
 * maker is implemented, and it is exactly what silent flattening violates — a
 * maker that reduces a two-effect card to one passes every rendering assertion
 * and fails this one.
 *
 * BOTH halves of the ADR-002 tail are covered, because SPEC's Non-Goals assigns
 * both to this path: a record with two effects, and a piece whose movement lies
 * outside the grid-plus-direction model. The fixtures are CONSTRUCTED from bundled
 * records rather than found, because the whole point of Phase 1 was that no
 * bundled record is in this set any more — a "found" fixture would be a set with
 * no instance capable of failing.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import React from 'react'
import type { ContentSource } from '@content/load'
import { bundledContentSource } from '@content/sets/bundled'
import { readSentence } from '@ui/CardRecipe'
import { readGrid } from '@ui/PieceMoves'
import { Edit } from '../../src/ui/Edit'

afterEach(cleanup)

type Record_ = Record<string, unknown>

/**
 * A skill card with two effects — legal in the schema, unshowable as one sentence.
 *
 * Named explicitly rather than `find(...) ?? [0]`: a fallback turns a renamed
 * record into a silently different fixture, and this one has to be the card whose
 * effect gets duplicated.
 */
function twoEffectCard(): Record_ {
  const source = bundledContentSource as unknown as { skillCards: Record_[] }
  const base = structuredClone(source.skillCards.find((c) => c.id === 'skill.teleport')!)
  const effects = base.effects as Record_[]
  base.effects = [structuredClone(effects[0]!), structuredClone(effects[0]!)]
  return base
}

/**
 * A piece with two slide patterns capped differently.
 *
 * The grid carries ONE shared reach cap across its eight directions, so two
 * slides with different caps is precisely a movement the grid cannot depict —
 * `readGrid` returns null and the record falls to this path.
 */
function twoCapPiece(): Record_ {
  const source = bundledContentSource as unknown as { pieces: Record_[] }
  const base = structuredClone(source.pieces[0]!)
  base.movement = [
    { kind: 'slide', vectors: [[0, 1]], maxDistance: 1 },
    { kind: 'slide', vectors: [[1, 0]], maxDistance: 2 },
  ]
  delete base.attack
  return base
}

/** Mounts the editor on a document whose record has been replaced by `record`. */
function mountWith(kind: 'skillCard' | 'piece', record: Record_) {
  const source = structuredClone(bundledContentSource) as unknown as Record<string, Record_[]>
  const list = source[kind === 'skillCard' ? 'skillCards' : 'pieces']!
  const at = list.findIndex((r) => r.id === record.id)
  list[at] = structuredClone(record)

  const committed: { value: ContentSource | null } = { value: null }
  render(
    React.createElement(Edit, {
      source: source as unknown as ContentSource,
      onCommit: (next: ContentSource) => {
        committed.value = next
      },
    }),
  )
  fireEvent.change(screen.getByTestId('editor-kind'), { target: { value: kind } })
  // The gallery lists what the document has; open the record under test by id.
  const opener = screen.queryByTestId(`gallery-open-${String(record.id)}`) ?? screen.queryByTestId(`library-open-${String(record.id)}`)
  if (opener) fireEvent.click(opener)
  return { committed, source: source as unknown as ContentSource }
}

const CASES = [
  ['skillCard', twoEffectCard, 'two effects in one record'],
  ['piece', twoCapPiece, 'two slide patterns with different reach caps'],
] as const

describe('AC-007 — the fixtures are genuinely unshowable', () => {
  it('a two-effect card is refused by the sentence', () => {
    const card = twoEffectCard()
    expect((card.effects as unknown[]).length).toBe(2)
    expect(readSentence(card)).toBeNull()
  })

  it('a two-cap piece is refused by the grid, while its sentence half is fine', () => {
    const piece = twoCapPiece()
    expect(readGrid(piece)).toBeNull()
    // The point of covering this half separately: the effects side reads fine, so
    // a maker that only consulted the sentence would offer an editable form and
    // rewrite the movement on save.
    expect(readSentence(piece)).not.toBeNull()
  })
})

describe('AC-007 — read-only, with the reason and the meaning shown', () => {
  it('a card whose effects cannot be drawn shows them read-only instead of an editor', () => {
    mountWith('skillCard', twoEffectCard())
    expect(screen.getByTestId('editor-readonly')).toBeTruthy()
    expect(screen.queryByTestId('editor-sentence')).toBeNull()
  })

  it('a piece whose MOVEMENT cannot be drawn yields only the grid, not the sentence', () => {
    // The two halves are independent. An earlier version OR-ed them and disabled
    // the save button, which made `piece.archer` — a SHIPPED piece with two
    // effects — uneditable. The e2e suite caught it; the unit suite could not,
    // because the Phase 1 measurement only looked at the bundled content set.
    mountWith('piece', twoCapPiece())
    expect(screen.getByTestId('editor-readonly-moves')).toBeTruthy()
    expect(screen.queryByTestId('editor-moves')).toBeNull()
    // Its effects side reads fine, so that half stays editable.
    expect(screen.getByTestId('editor-sentence')).toBeTruthy()
  })

  it('describes the movement it cannot draw, one line per pattern', () => {
    // Never an empty box. The first version reused the effects description here,
    // and a piece with no effects rendered a heading over an empty list — the
    // screen claiming to say what the record does and saying nothing.
    mountWith('piece', twoCapPiece())
    const lines = screen.getByTestId('editor-readonly-moves-lines').querySelectorAll('li')
    expect(lines.length).toBe(2)
    for (const line of lines) expect(line.textContent ?? '').not.toMatch(/[{}]/)
  })

  it.each(CASES)('%s (%s) still lets the author save the halves they CAN edit', (kind, make) => {
    // AC-007 as amended: suppressing the editor for the unreadable half is what
    // prevents the flatten, because a save writes the draft and the draft carries
    // that half untouched. Blocking the save was over-broad and cost a shipped
    // record its editability.
    mountWith(kind, make())
    expect((screen.getByTestId('editor-save') as HTMLButtonElement).disabled).toBe(false)
  })

  it('describes what the record does, one line per effect', () => {
    mountWith('skillCard', twoEffectCard())
    const lines = screen.getByTestId('editor-readonly-lines').querySelectorAll('li')
    // Two effects, two lines: a count that silently collapsed would read as "this
    // record does less than it does".
    expect(lines.length).toBe(2)
    for (const line of lines) {
      expect(line.textContent ?? '').not.toBe('')
      expect(line.textContent ?? '').not.toMatch(/[{}]/)
    }
  })

  it('names nothing the UI no longer has', () => {
    // The old note pointed at a tab. Phase 7 deletes the tab; a note that outlives
    // its destination is worse than no note.
    mountWith('skillCard', twoEffectCard())
    const box = screen.getByTestId('editor-readonly').textContent ?? ''
    expect(box).not.toContain('자세히')
  })
})

describe('AC-007 — the maker can no longer PRODUCE an unshowable record', () => {
  /**
   * This describe block used to prove the narrower half of a save-block: a draft
   * the author made unshowable in this session still saves. It reached that state
   * through the indexed form (`editor-add-effect` → `vocab-condition-all`, which
   * wraps a single leaf).
   *
   * PLAN Phase 7 deleted that form, and with it the last UI path to an unshowable
   * draft — which is worth asserting rather than assuming, because it is what makes
   * the read-only path purely a READER of records that arrived from elsewhere. The
   * sentence caps effects at one and actions at two; the grid cannot express two
   * different reach caps. So the property is: no sequence of edits the maker offers
   * takes a showable record to an unshowable one.
   */
  it('has no control left that can make a draft unshowable', () => {
    const source = structuredClone(bundledContentSource) as unknown as ContentSource
    render(React.createElement(Edit, { source, onCommit: () => {} }))
    fireEvent.change(screen.getByTestId('editor-kind'), { target: { value: 'skillCard' } })
    fireEvent.click(screen.getByTestId('gallery-blank'))

    // The controls that could author the shapes the sentence refuses are gone.
    for (const id of ['editor-add-effect', 'editor-effect-0', 'editor-action-0', 'vocab-condition-all', 'editor-clear-movement']) {
      expect(screen.queryByTestId(id), id).toBeNull()
    }
    // And what IS on screen keeps the draft showable.
    expect(readSentence(JSON.parse(screen.getByTestId('editor-draft-json').textContent ?? 'null'))).not.toBeNull()
  })

  // 20s, and the number is the point rather than padding: this walks every option of
  // every slot, re-rendering the sheet each time, and measured 5.4s on a saturated
  // machine — which is ON vitest's 5s default. A test that only fails when the box is
  // busy is worse than a slow one, and the alternative (sampling the options) would
  // trade the property for speed.
  it('keeps the draft showable across every slot the sentence offers', () => {
    // Quantified over the slots rather than sampled: a single sequence proves one
    // path, and the claim is about all of them.
    const source = structuredClone(bundledContentSource) as unknown as ContentSource
    render(React.createElement(Edit, { source, onCommit: () => {} }))
    fireEvent.change(screen.getByTestId('editor-kind'), { target: { value: 'skillCard' } })
    fireEvent.click(screen.getByTestId('gallery-blank'))

    const slots = ['when', 'each', 'cond', 'cond2', 'op', 'then', 'then2']
    for (const slot of slots) {
      const chip = screen.queryByTestId(`slot-${slot}`)
      if (chip === null) continue
      chip.focus()
      fireEvent.click(chip)
      // Every option of every slot, not just the first.
      for (const option of Array.from(document.querySelectorAll(`[data-testid^="opt-${slot}-"]`))) {
        fireEvent.click(option)
        const draft = JSON.parse(screen.getByTestId('editor-draft-json').textContent ?? 'null')
        expect(readSentence(draft), `${slot} → ${option.getAttribute('data-testid')}`).not.toBeNull()
      }
    }
  }, 20_000)

  it('still shows the read-only view for a record that ARRIVED unshowable', () => {
    // The read-only path is now a reader only, so the one thing that must still
    // reach it is an imported or shipped record.
    mountWith('skillCard', twoEffectCard())
    expect(screen.queryByTestId('editor-sentence')).toBeNull()
    expect(screen.getByTestId('editor-readonly')).toBeTruthy()
  })
})

describe('AC-007 — the record is byte-stable once opened', () => {
  /**
   * Compared against the DRAFT the form is holding, not against the source
   * document. The document is a prop and React does not mutate it, so a
   * source-vs-source comparison would pass no matter what the form did — a
   * fixture with no instance capable of failing. The mechanism by which a flatten
   * would actually enter is the form normalising the draft on open and a save
   * writing that back, so the draft is what has to be byte-identical.
   */
  it.each(CASES)('%s (%s) is unchanged in the draft the form holds', (kind, make) => {
    const record = make()
    mountWith(kind, record)

    const draft = JSON.parse(screen.getByTestId('editor-draft-json').textContent ?? 'null')
    // Key order is irrelevant to identity here; the content is not.
    const canonical = (value: unknown): string =>
      JSON.stringify(value, (_k, v) =>
        v && typeof v === 'object' && !Array.isArray(v)
          ? Object.fromEntries(Object.entries(v as object).sort(([a], [b]) => a.localeCompare(b)))
          : v,
      )
    expect(canonical(draft)).toBe(canonical(record))
  })

  it('commits the unshowable half UNCHANGED when the record is saved', () => {
    // The claim that replaced "saving is blocked", and the stronger one: a save is
    // allowed, so what it writes has to be proved. The two effects must come back
    // out of `onCommit` exactly as they went in.
    const record = twoEffectCard()
    const { committed } = mountWith('skillCard', record)
    fireEvent.click(screen.getByTestId('editor-save'))
    expect(committed.value).not.toBeNull()
    const saved = (committed.value!.skillCards as Record_[]).find((r) => r.id === record.id)
    expect(saved?.effects).toEqual(record.effects)
  })
})
