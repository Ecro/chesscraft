// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import React from 'react'
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
  it('shows a bundled piece its stars, with no wait', () => {
    mount(bundledContentSource)
    openLibrary()
    fireEvent.change(screen.getByTestId('editor-kind'), { target: { value: 'piece' } })
    fireEvent.click(screen.getByTestId('library-open-piece.queen'))

    const badge = screen.getByTestId('record-grade')
    expect(badge.getAttribute('data-status')).toBe('graded')
    // Positive, always: a record that costs nothing would make the budget a
    // formality, which is the state the analytic price exists to rule out.
    const filled = (badge.textContent?.match(/★/g) ?? []).length
    expect(filled).toBeGreaterThanOrEqual(1)
    expect(filled + (badge.textContent?.match(/☆/g) ?? []).length).toBe(5)
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

  it('prices an unsaved draft, with the band and the price describing that same draft', () => {
    /*
     * This assertion used to be "no badge at all, because there is nothing to measure", and
     * the premise stopped being true. A cost is a pure function of the declaration (ADR-012),
     * so an unsaved draft has a price — what it does not have is a BAND, because a band is
     * relative to a ceiling derived from the room's own pieces and a draft is not in the room
     * yet. PLAN Phase 9 / ADR-009 shows the arithmetic before the first save deliberately:
     * "why does it cost this" is loudest while the author is still choosing.
     *
     * The replacement is stricter about the thing the old test actually protected. It names
     * the star element specifically, so inventing a band for an unsaved record fails here —
     * where the old wording would have passed the moment any badge appeared for any reason.
     */
    mount(bundledContentSource)
    openLibrary()
    fireEvent.change(screen.getByTestId('editor-kind'), { target: { value: 'piece' } })
    fireEvent.click(screen.getByTestId('editor-new'))

    /*
     * Superseded once more, by round-1 review. This asserted NO band for an unsaved draft; that
     * rule is what allowed a saved band to sit beside a draft price and contradict it, so the
     * band now follows the record being priced. The check that survives is the one whose failure
     * was actually reported: both halves describe the same record, and `data-from` names it.
     */
    const badge = screen.getByTestId('record-grade')
    const why = screen.getByTestId('record-cost-why')
    expect(why, 'an unsaved draft explained nothing').toBeTruthy()
    expect(why.getAttribute('data-from'), 'the price did not come from the draft').toBe('draft')
    expect(badge.querySelector('[data-stars]'), 'the price came from the draft and the band from nowhere').not.toBeNull()
  })
})
