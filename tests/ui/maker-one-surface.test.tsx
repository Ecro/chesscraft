// @vitest-environment jsdom
/**
 * AC-001 + AC-004 + AC-011 — the maker has ONE surface, and nothing points at the
 * surfaces it used to have.
 *
 * Three claims, one file, because they are the same claim from three sides: the
 * split is gone from the DOM (AC-001), the form it hid is gone from the code
 * (AC-004), and the copy that named them is gone from the string table (AC-011).
 * Leaving any one of the three passes a screen that still tells a child to visit a
 * tab that no longer exists.
 *
 * The expected value in each case is the empty set over a list of ids/terms named
 * from the PRE-change source, not discovered from the post-change render — so a
 * refactor that renames the old form rather than removing it still fails.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import React from 'react'
import { bundledContentSource } from '@content/sets/bundled'
import type { DraftKind } from '@editor/draft'
import { ko } from '../../src/i18n/ko'
import { Edit } from '../../src/ui/Edit'

afterEach(cleanup)

/** Every kind the maker can open. */
const DRAFT_KINDS: DraftKind[] = ['piece', 'squareType', 'ruleCard', 'skillCard', 'board', 'preset']

/** What "the screen is split" looked like, named from the pre-change source. */
const SPLIT_IDS = ['form-tab-simple', 'form-tab-expert', 'form-panel-simple', 'form-panel-expert']

/** The indexed form, likewise. */
const INDEXED_IDS = [
  'editor-add-effect',
  'editor-effect-0',
  'editor-action-0',
  'editor-clear-movement',
  'movement-select-0',
  'param-move-maxDistance',
  'param-move-forward',
  'vocab-action-destroy_piece',
  'vocab-condition-always',
  'vocab-trigger-end_of_ply',
]

function open(kind: DraftKind) {
  render(
    React.createElement(Edit, {
      source: structuredClone(bundledContentSource),
      onCommit: () => {},
    }),
  )
  fireEvent.change(screen.getByTestId('editor-kind'), { target: { value: kind } })
}

describe('AC-001 — no tab or hidden panel renders for any draft kind', () => {
  it.each(DRAFT_KINDS)('%s renders no split', (kind) => {
    open(kind)
    for (const id of SPLIT_IDS) expect(screen.queryByTestId(id), id).toBeNull()
  })

  it.each(DRAFT_KINDS)('%s hides no authoring control behind a disclosure', (kind) => {
    open(kind)
    // `<details>` is the other way to split a screen, and the maker had one — the
    // `고급 설정` box over the two raw KEY fields. It went with the tab strip, so the
    // claim is now total: nothing on this screen has to be opened before it can be
    // used. Written as "no details anywhere" rather than "not that one", because the
    // next disclosure someone adds is the one this should catch.
    expect(Array.from(document.querySelectorAll('details')).length, kind).toBe(0)
  })
})

describe('AC-004 — the indexed palette form is absent', () => {
  it.each(DRAFT_KINDS)('%s renders none of the indexed controls', (kind) => {
    open(kind)
    for (const id of INDEXED_IDS) expect(screen.queryByTestId(id), id).toBeNull()
  })

  it('leaves the sentence as the only structural editor for an effect-bearing kind', () => {
    open('skillCard')
    expect(screen.getByTestId('editor-sentence')).toBeTruthy()
  })
})

describe('AC-011 — no string names a surface the UI no longer has', () => {
  /**
   * Terms taken from the pre-change string table, not from what happens to be left
   * in it. The check is directional on purpose: it fails when copy survives its
   * referent, which is how the old refusal hint would otherwise keep telling a
   * child to open a tab that is gone.
   */
  const REMOVED_SURFACE_TERMS = ['자세히', '고급 설정']
  const REMOVED_KEY_PREFIXES = [
    'ui.editor.form.tab.',
    'ui.editor.card.complex',
    'ui.editor.piece.complex',
    'ui.editor.movement.',
    'ui.editor.palette.',
    'ui.editor.effects.',
    'ui.editor.form.advanced',
    'ui.editor.field.name-slot',
    'ui.editor.field.text-slot',
  ]

  it('has no key for a deleted surface', () => {
    const survivors = Object.keys(ko).filter((k) => REMOVED_KEY_PREFIXES.some((p) => k.startsWith(p)))
    expect(survivors).toEqual([])
  })

  it('has no editor copy naming a deleted surface', () => {
    const offenders = Object.entries(ko)
      .filter(([key]) => key.startsWith('ui.editor.'))
      .filter(([, text]) => REMOVED_SURFACE_TERMS.some((term) => text.includes(term)))
      .map(([key]) => key)
    expect(offenders).toEqual([])
  })

  it('would catch a survivor, so the two assertions above are not vacuous', () => {
    // The negative instance, named rather than assumed: if the terms matched
    // nothing at all the checks would pass on an empty table.
    const sample = { 'ui.editor.demo': '위쪽 자세히 탭에서 고쳐 주세요' }
    const offenders = Object.entries(sample).filter(([, text]) =>
      REMOVED_SURFACE_TERMS.some((term) => text.includes(term)),
    )
    expect(offenders).toHaveLength(1)
  })
})
