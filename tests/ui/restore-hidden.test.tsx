// @vitest-environment jsdom
import { fireEvent, render, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { loadContentSet } from '@content/load'
import { bundledContentSource } from '@content/sets/bundled'
import { HIDDEN_KEY, loadHidden } from '@editor/hidden'
import { App } from '../../src/ui/App'
import { skipOnboarding } from '../helpers/onboarding'

/**
 * PLAN-content-provenance-and-room-delete Phase 8 — putting back what was tucked
 * away (ADR-004).
 *
 * Hiding is only reversible if the child can reach the undo without a developer.
 * The reset button next to it destroys their own work; this one destroys
 * nothing, which is why it sits above the reset rather than beside it.
 *
 * Driven through `App` because the hidden set is owned there — a test that
 * mounted `Edit` alone would prove the control renders and nothing about whether
 * the carousel agrees.
 */

const shippedRooms = () => {
  const loaded = loadContentSet(bundledContentSource)
  if (!loaded.ok) throw new Error('the shipped bundle must load')
  return [...loaded.set.presets.keys()]
}

const dots = (container: HTMLElement) => container.querySelectorAll('.room-dots li').length

beforeEach(() => {
  localStorage.clear()
  skipOnboarding()
  vi.spyOn(window, 'confirm').mockReturnValue(true)
})
afterEach(() => {
  vi.restoreAllMocks()
  localStorage.clear()
})

describe('the restore control', () => {
  it('is ABSENT when nothing is hidden, rather than an empty box', () => {
    const { container } = render(<App />)
    fireEvent.click(within(container).getByTestId('tab-edit'))
    expect(within(container).queryByTestId('hidden-restore')).toBeNull()
  })

  it('appears once something is hidden, naming it in Korean', () => {
    const rooms = shippedRooms()
    localStorage.setItem(HIDDEN_KEY, JSON.stringify({ ids: [rooms[1]] }))
    const { container } = render(<App />)
    fireEvent.click(within(container).getByTestId('tab-edit'))

    const panel = within(container).getByTestId('hidden-restore')
    expect(panel).not.toBeNull()
    // The row names the room, and never with its id (ADR-002).
    const row = within(container).getByTestId(`hidden-restore-${rooms[1]}`)
    expect(row.textContent ?? '').not.toContain(rooms[1])
    expect((row.textContent ?? '').trim()).not.toBe('')
  })

  it('round-trips: hide, restore, and the room is back on the carousel', () => {
    const rooms = shippedRooms()
    const { container } = render(<App />)
    const before = dots(container)

    fireEvent.click(within(container).getByTestId('manage-rooms'))
    fireEvent.click(within(container).getByTestId(`room-hide-${rooms[1]}`))
    expect(within(container).queryByTestId(`room-open-${rooms[1]}`)).toBeNull()
    expect([...loadHidden(localStorage)]).toEqual([rooms[1]])

    fireEvent.click(within(container).getByTestId(`hidden-restore-${rooms[1]}`))

    // Back in the editor's own list...
    expect(within(container).queryByTestId(`room-open-${rooms[1]}`)).not.toBeNull()
    // ...back in storage...
    expect([...loadHidden(localStorage)]).toEqual([])
    // ...and back on the screen the whole product funnels through.
    fireEvent.click(within(container).getByTestId('tab-play'))
    expect(dots(container)).toBe(before)
  })

  it('disappears again once the last hidden record is restored', () => {
    const rooms = shippedRooms()
    localStorage.setItem(HIDDEN_KEY, JSON.stringify({ ids: [rooms[1]] }))
    const { container } = render(<App />)
    fireEvent.click(within(container).getByTestId('tab-edit'))
    fireEvent.click(within(container).getByTestId(`hidden-restore-${rooms[1]}`))
    expect(within(container).queryByTestId('hidden-restore')).toBeNull()
  })

  it('lists a hidden record whose kind is not a room', () => {
    // ADR-004 is all six kinds, so the restore list cannot be rooms-only — a
    // hidden piece with no way back would be exactly the black hole hiding was
    // introduced to avoid.
    localStorage.setItem(HIDDEN_KEY, JSON.stringify({ ids: ['piece.king'] }))
    const { container } = render(<App />)
    fireEvent.click(within(container).getByTestId('tab-edit'))
    const row = within(container).getByTestId('hidden-restore-piece.king')
    expect(row.textContent ?? '').not.toContain('piece.king')
    expect((row.textContent ?? '').trim()).not.toBe('')
  })

  it('lists an id the document no longer holds, so the key can always be emptied', () => {
    // A stale entry — the record was hidden, then the document was replaced by
    // an import that does not contain it. Without a row, the id would sit in the
    // key forever with nothing able to clear it but a full reset.
    localStorage.setItem(HIDDEN_KEY, JSON.stringify({ ids: ['piece.long-gone'] }))
    const { container } = render(<App />)
    fireEvent.click(within(container).getByTestId('tab-edit'))
    expect(within(container).queryByTestId('hidden-restore-piece.long-gone')).not.toBeNull()
    fireEvent.click(within(container).getByTestId('hidden-restore-piece.long-gone'))
    expect([...loadHidden(localStorage)]).toEqual([])
  })
})
