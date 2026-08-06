// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import React from 'react'
import { sliceContentSource } from '@content/sets/slice'
import { Edit } from '../../src/ui/Edit'

/**
 * PLAN Phase 9a exit criterion — no schema field name reaches the child.
 *
 * The editor was written as a form over the schema, so its labels WERE the
 * field names: `kind`, `nameKey`, `textKey`, `pieceIds`. Every one of those is
 * a word from the document format, and the document format is not something a
 * nine-year-old has agreed to learn. AC-016 already forbids literal text inside
 * content; this is the same rule pointed at the editor's own chrome.
 *
 * VISIBLE is the operative word, and it is measured rather than assumed. The
 * draft's raw JSON is still in the DOM as a diagnostic (`editor-draft-json`,
 * which the ADR-006 coverage gate reads), and it necessarily contains
 * `"nameKey"` — so a `container.textContent` scan would either fail forever or
 * have to special-case the one node, and the special case is what rots. The
 * walk below skips exactly what the browser skips, which means #19's "the raw
 * JSON is no longer on screen" and this test are the SAME claim checked once.
 */

/** Text a sighted user can actually read: hidden subtrees contribute nothing. */
function visibleText(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? ''
  if (node.nodeType !== Node.ELEMENT_NODE) return ''
  const el = node as HTMLElement
  if (el.hasAttribute('hidden')) return ''
  if (el.getAttribute('aria-hidden') === 'true') return ''
  if (el.style.display === 'none' || el.style.visibility === 'hidden') return ''
  let out = ''
  for (const child of Array.from(el.childNodes)) out += `${visibleText(child)} `
  // A `<select>`'s options are readable copy too, and they are children, so the
  // recursion already has them; `value` attributes are not text and stay out.
  return out
}

/** Schema words the exit criterion names, plus the bare `kind` that labelled the picker. */
const SCHEMA_WORDS = [
  'nameKey',
  'textKey',
  'iconKey',
  'pieceIds',
  'ruleCardIds',
  'skillCardIds',
  'boardId',
  'squareTypes',
  'schemaVersion',
]

function offendersIn(text: string): string[] {
  const found = SCHEMA_WORDS.filter((word) => text.includes(word))
  // `kind` is checked as a standalone word: `kind` labelled the record picker,
  // while `data-kind` and the vocabulary word "kindness" would be false hits.
  if (/(^|\s)kinds?(\s|$)/.test(text)) found.push('kind')
  return found
}

function mount() {
  render(
    React.createElement(Edit, {
      source: structuredClone(sliceContentSource),
      onCommit: () => {},
    }),
  )
  return () => visibleText(screen.getByTestId('editor'))
}

afterEach(cleanup)

describe('the editor speaks Korean, not schema', () => {
  it('shows no schema field name on the rooms tab', () => {
    const read = mount()
    expect(offendersIn(read())).toEqual([])
  })

  it('shows no schema field name in a room detail', () => {
    const read = mount()
    fireEvent.click(screen.getByTestId('room-open-preset.slice'))
    expect(offendersIn(read())).toEqual([])
  })

  it('shows no schema field name in the library or in an open record', () => {
    const read = mount()
    fireEvent.click(screen.getByTestId('editor-tab-library'))
    expect(offendersIn(read())).toEqual([])

    fireEvent.click(screen.getByTestId('library-open-piece.king'))
    expect(offendersIn(read())).toEqual([])
  })

  it('does not put the draft JSON on screen (#19)', () => {
    const read = mount()
    fireEvent.click(screen.getByTestId('editor-tab-library'))
    fireEvent.click(screen.getByTestId('library-open-piece.king'))
    // The node still exists — the ADR-006 gate reads it — but a child never
    // meets it. Asserting both halves, because deleting the node and hiding it
    // are different changes and only one of them keeps the gate working.
    expect(screen.getByTestId('editor-draft-json')).toBeTruthy()
    expect(read()).not.toContain('"movement"')
  })

  it('renders resolved Korean copy rather than raw ui.* keys', () => {
    const read = mount()
    fireEvent.click(screen.getByTestId('editor-tab-library'))
    fireEvent.click(screen.getByTestId('library-open-piece.king'))
    const text = read()
    // A key that resolves to itself is the loud failure `makeTranslate` was
    // built to produce; this is where it gets caught.
    expect(text).not.toMatch(/\bui\.editor\./)
    expect(text).toMatch(/[가-힣]/)
  })
})
