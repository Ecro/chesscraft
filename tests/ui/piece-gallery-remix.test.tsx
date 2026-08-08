// @vitest-environment jsdom
/**
 * AC-009 — the maker opens on a gallery, and a remix does not mutate its source.
 *
 * The non-mutation claim is an invariant over the stored document, not over the
 * remix implementation: the source record must be byte-identical before and
 * after, and the new id must differ. It holds for any correct remix and fails
 * for the import-then-edit overwrite this repo has already shipped once.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import React from 'react'
import type { ContentSource } from '@content/load'
import { bundledContentSource } from '@content/sets/bundled'
import { openDraft } from '@editor/draft'
import { readString } from '@editor/strings'
import { remixOf } from '@ui/MakerGallery'
import { Edit } from '../../src/ui/Edit'

afterEach(cleanup)

const SOURCE_ID = 'piece.rook'

function mount() {
  const committed: { value: ContentSource | null } = { value: null }
  render(
    React.createElement(Edit, {
      source: structuredClone(bundledContentSource),
      onCommit: (next: ContentSource) => {
        committed.value = next
      },
    }),
  )
  fireEvent.change(screen.getByTestId('editor-kind'), { target: { value: 'piece' } })
  return committed
}

describe('AC-009 — the gallery is the way in', () => {
  it('offers the document’s own pieces, with a blank one among them', () => {
    mount()
    expect(screen.getByTestId('maker-gallery')).toBeTruthy()
    expect(screen.getByTestId(`gallery-remix-${SOURCE_ID}`)).toBeTruthy()
    expect(screen.getByTestId('gallery-blank')).toBeTruthy()
    // The form is standing by, not gone. Mounted-but-hidden is what keeps the
    // ADR-006 coverage gate able to reach the vocabulary controls.
    expect(screen.getByTestId('editor-name')).toBeTruthy()
  })

  it('hides the form until something is picked, and reveals it after', () => {
    mount()
    const body = screen.getByTestId('editor-name').closest('.form-body')
    expect(body?.hasAttribute('hidden'), 'the form was on screen before a choice was made').toBe(true)

    fireEvent.click(screen.getByTestId('gallery-blank'))
    expect(body?.hasAttribute('hidden')).toBe(false)
    expect(screen.queryByTestId('maker-gallery')).toBeNull()
  })

  it('a remix carries the source’s shape under a different id', () => {
    mount()
    fireEvent.click(screen.getByTestId(`gallery-remix-${SOURCE_ID}`))

    const draft = JSON.parse(screen.getByTestId('editor-draft-json').textContent ?? 'null')
    const original = openDraft(bundledContentSource, 'piece', SOURCE_ID)
    expect(original).not.toBeNull()
    expect(draft.id).not.toBe(SOURCE_ID)
    expect(draft.movement).toEqual(original!.movement)
    // Its OWN keys, not the source's — else renaming the copy renames the rook.
    expect(draft.nameKey).not.toBe(original!.nameKey)
    expect(String(draft.nameKey).startsWith(String(draft.id))).toBe(true)
  })

  it('leaves the source record byte-identical after the copy is saved', () => {
    const committed = mount()
    const before = structuredClone(openDraft(bundledContentSource, 'piece', SOURCE_ID))
    const beforeName = readString(bundledContentSource.strings, 'ko', String(before!.nameKey))

    fireEvent.click(screen.getByTestId(`gallery-remix-${SOURCE_ID}`))
    fireEvent.change(screen.getByTestId('editor-name'), { target: { value: '내 성' } })
    fireEvent.click(screen.getByTestId('editor-save'))

    expect(screen.queryByTestId('editor-errors')?.textContent ?? '', 'the remix was rejected').toBe('')
    expect(committed.value, 'save produced no content').not.toBeNull()

    const after = openDraft(committed.value!, 'piece', SOURCE_ID)
    expect(after).toEqual(before)
    // And the rook is still called what it was called, which is the half a
    // record-only comparison cannot see (ADR-020 keeps the words elsewhere).
    expect(readString(committed.value!.strings, 'ko', String(before!.nameKey))).toBe(beforeName)
  })

  it('never reuses an id, however many copies are taken', () => {
    // Exercised through the pure helper: the ids must keep stepping even when
    // the document already holds an earlier copy.
    let doc = structuredClone(bundledContentSource)
    const ids: string[] = []
    for (let n = 0; n < 3; n += 1) {
      const picked = remixOf(doc, 'piece', SOURCE_ID)
      expect(picked).not.toBeNull()
      ids.push(String(picked!.draft.id))
      ;(doc.pieces as unknown[]).push(picked!.draft)
    }
    expect(new Set(ids).size).toBe(3)
    expect(ids).not.toContain(SOURCE_ID)
  })
})
