// @vitest-environment jsdom
/**
 * AC-007 — an invalid draft is reported before save, not at save.
 *
 * The expected message is the one `loadContentSet` already produces, captured
 * from the validator itself rather than typed into the test. So a form that
 * invented a friendlier but DIFFERENT message fails: the criterion is "the same
 * problem, earlier", not "some problem, earlier".
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import React from 'react'
import { bundledContentSource } from '@content/sets/bundled'
import { loadContentSet } from '@content/load'
import { Edit } from '../../src/ui/Edit'

afterEach(cleanup)

/** An id in the wrong shape — the format a child reaches for first. */
const MALFORMED = 'mypiece'

/**
 * A new piece with its words filled in — the state a child reaches within
 * seconds of opening the maker.
 *
 * The name and the description are typed deliberately. A brand-new record with
 * neither IS invalid, and the form says so immediately, which is the feature
 * rather than noise: pressing save on it gives the same answer. Starting the
 * scenarios from a genuinely-valid draft is what makes the duplicate-id case
 * below about the id and nothing else.
 */
function mount() {
  render(React.createElement(Edit, { source: structuredClone(bundledContentSource), onCommit: () => {} }))
  fireEvent.change(screen.getByTestId('editor-kind'), { target: { value: 'piece' } })
  fireEvent.change(screen.getByTestId('editor-name'), { target: { value: '내 기물' } })
  fireEvent.change(screen.getByTestId('editor-text'), { target: { value: '한 칸 간다.' } })
}

/**
 * What the validator itself says about an id in the wrong shape.
 *
 * Read out of `loadContentSet` rather than typed here, so a form that invented
 * its own friendlier wording fails: the criterion is "the same problem,
 * earlier", not "some problem, earlier".
 */
function validatorSaysAboutMalformedId(): string {
  const src = structuredClone(bundledContentSource) as { pieces: Array<Record<string, unknown>> }
  const donor = src.pieces[0]
  if (!donor) throw new Error('the bundled fixture defines no pieces')
  src.pieces.push({ ...structuredClone(donor), id: MALFORMED })
  const result = loadContentSet(src as never)
  if (result.ok) throw new Error('a malformed id was accepted — this test has lost its subject')
  const about = result.errors.find((e) => e.path.endsWith('.id'))
  if (!about) throw new Error('the validator no longer complains about the id')
  return about.message
}

const liveText = () => screen.queryByTestId('editor-live-errors')?.textContent ?? ''
const saveText = () => screen.queryByTestId('editor-errors')?.textContent ?? ''

describe('AC-007 — the problem is named before the save', () => {
  it('says nothing while the draft is fine', () => {
    mount()
    fireEvent.change(screen.getByTestId('editor-id'), { target: { value: 'piece.brand-new' } })
    expect(liveText()).toBe('')
  })

  it('reports a malformed id without the author pressing save', () => {
    mount()
    fireEvent.change(screen.getByTestId('editor-id'), { target: { value: MALFORMED } })
    expect(liveText()).toContain(validatorSaysAboutMalformedId())
  })

  it('reports the SAME problem when save is pressed, not a different one', () => {
    mount()
    fireEvent.change(screen.getByTestId('editor-id'), { target: { value: MALFORMED } })
    const live = liveText()
    expect(live).not.toBe('')

    fireEvent.click(screen.getByTestId('editor-save'))
    const saved = saveText()
    expect(saved).not.toBe('')
    // Not string equality: the save list is document-wide and the live list is
    // narrowed to this record. The claim is that the live warning is not a
    // DIFFERENT complaint from the one that blocks the save.
    expect(saved).toContain(validatorSaysAboutMalformedId())
    expect(live).toContain(validatorSaysAboutMalformedId())
  })

  it('clears itself once the author fixes the id', () => {
    mount()
    fireEvent.change(screen.getByTestId('editor-id'), { target: { value: MALFORMED } })
    expect(liveText()).not.toBe('')
    fireEvent.change(screen.getByTestId('editor-id'), { target: { value: 'piece.mine' } })
    expect(liveText()).toBe('')
  })

  it('stays quiet about faults that are not this record', () => {
    // A pre-existing complaint elsewhere in the document must not be shown
    // against the control the child is touching.
    mount()
    fireEvent.change(screen.getByTestId('editor-id'), { target: { value: 'piece.mine' } })
    expect(screen.queryByTestId('editor-live-errors')).toBeNull()
  })

  it('names the missing words on a record that has none, before the save too', () => {
    // The other half of the same guarantee: an untouched new record is not
    // silently "fine until you press save".
    render(React.createElement(Edit, { source: structuredClone(bundledContentSource), onCommit: () => {} }))
    fireEvent.change(screen.getByTestId('editor-kind'), { target: { value: 'piece' } })
    fireEvent.change(screen.getByTestId('editor-id'), { target: { value: 'piece.wordless' } })
    const live = liveText()
    expect(live).not.toBe('')
    fireEvent.click(screen.getByTestId('editor-save'))
    expect(saveText()).not.toBe('')
  })
})
