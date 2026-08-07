// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import React from 'react'
import { memoryCache } from '@balance/cache'
import type { ContentSource } from '@content/load'
import { bundledContentSource } from '@content/sets/bundled'
import { Edit } from '../../src/ui/Edit'

/**
 * The grade, on the screen where the record was made.
 *
 * The badge closes the loop the room picker left open: an author finished a
 * piece and had to go somewhere else to find out whether it was reasonable.
 */

afterEach(cleanup)

function mount(source: ContentSource) {
  render(React.createElement(Edit, { source, onCommit: () => {} }))
}

function openLibrary() {
  const tab = screen.queryByTestId('editor-tab-library')
  if (tab) fireEvent.click(tab)
}

describe('the record form names what the record is worth', () => {
  it('shows a bundled piece its shipped grade, with no wait', () => {
    mount(bundledContentSource)
    openLibrary()
    fireEvent.change(screen.getByTestId('editor-kind'), { target: { value: 'piece' } })
    fireEvent.click(screen.getByTestId('library-open-piece.queen'))

    const badge = screen.getByTestId('record-grade')
    expect(badge.getAttribute('data-status')).toBe('graded')
    expect(badge.textContent).toMatch(/세기 \d/)
  })

  it('states the limit of what the number means', () => {
    mount(bundledContentSource)
    openLibrary()
    fireEvent.change(screen.getByTestId('editor-kind'), { target: { value: 'piece' } })
    fireEvent.click(screen.getByTestId('library-open-piece.queen'))
    expect(screen.getByTestId('record-grade').textContent).toMatch(/아무렇게나|사람이 잘 쓰면/)
  })

  it('offers no badge for a record kind that is never graded', () => {
    // A rule card is not something a side brings of its own, so it has no band
    // to sit in — an empty badge would imply a measurement that never runs.
    mount(bundledContentSource)
    openLibrary()
    fireEvent.change(screen.getByTestId('editor-kind'), { target: { value: 'ruleCard' } })
    fireEvent.click(screen.getByTestId('library-open-rule.three-check'))
    expect(screen.queryByTestId('record-grade')).toBeNull()
  })

  it('offers no badge before the first save, when there is nothing to measure', () => {
    mount(bundledContentSource)
    openLibrary()
    fireEvent.change(screen.getByTestId('editor-kind'), { target: { value: 'piece' } })
    fireEvent.click(screen.getByTestId('editor-new'))
    expect(screen.queryByTestId('record-grade')).toBeNull()
  })
})
