// @vitest-environment jsdom
import { fireEvent, render, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { loadContentSet } from '@content/load'
import { bundledContentSource } from '@content/sets/bundled'
import { HIDDEN_KEY } from '@editor/hidden'
import { App } from '../../src/ui/App'
import { skipOnboarding } from '../helpers/onboarding'

/**
 * PLAN-content-provenance-and-room-delete Phase 7 — the title screen's carousel
 * (interview round 2, question 7).
 *
 * Two claims, and the second is the one with teeth. A hidden room leaves the
 * carousel AND its dot count; and hiding the room the carousel is CURRENTLY
 * showing must move it to another room rather than blank the screen. That second
 * one is risk R5: `App` clamps the active preset, and a clamp that walked the
 * unfiltered list would keep pointing at a room no longer on the carousel.
 *
 * Driven through `App` rather than `Home`, because the thing under test is the
 * clamp, and the clamp lives in `App`.
 */

/** Rooms the shipped bundle carries — the ones a fresh install sees. */
const shippedRooms = () => {
  const loaded = loadContentSet(bundledContentSource)
  if (!loaded.ok) throw new Error('the shipped bundle must load')
  return [...loaded.set.presets.keys()]
}

const dots = (container: HTMLElement) => container.querySelectorAll('.room-dots li').length
const cardRoom = (container: HTMLElement) =>
  container.querySelector('[data-testid="room-card"]')?.getAttribute('data-room') ?? null

beforeEach(() => {
  localStorage.clear()
  skipOnboarding()
  vi.spyOn(window, 'confirm').mockReturnValue(true)
})
afterEach(() => {
  vi.restoreAllMocks()
  localStorage.clear()
})

describe('the premise', () => {
  it('the shipped bundle carries more than one room, or these tests assert nothing', () => {
    expect(shippedRooms().length).toBeGreaterThan(1)
  })
})

describe('the carousel leaves out rooms this browser has hidden', () => {
  it('drops the room from the card, the dots, and the count', () => {
    const rooms = shippedRooms()
    const before = render(<App />)
    const total = dots(before.container)
    expect(total).toBe(rooms.length)
    before.unmount()

    // A room hidden on a previous visit — the state the key exists to carry.
    localStorage.setItem(HIDDEN_KEY, JSON.stringify({ ids: [rooms[1]] }))
    const { container } = render(<App />)
    expect(dots(container)).toBe(total - 1)
    // Stepping through every remaining room must never land on the hidden one.
    const seen = new Set<string>()
    for (let i = 0; i < total; i += 1) {
      const room = cardRoom(container)
      if (room !== null) seen.add(room)
      fireEvent.click(within(container).getByTestId('room-next'))
    }
    expect(seen.has(rooms[1]!)).toBe(false)
    expect(seen.size).toBe(total - 1)
  })

  it('does NOT remove the room from the document', () => {
    // ADR-005. The room is still there; it is only not on this screen.
    const rooms = shippedRooms()
    localStorage.setItem(HIDDEN_KEY, JSON.stringify({ ids: [rooms[1]] }))
    render(<App />)
    const stored = localStorage.getItem('strange-chess.content.v1')
    // Nothing was written to the content key at all — hiding is not a save.
    expect(stored).toBeNull()
  })

  it('moves to another room rather than blanking when the ACTIVE room is hidden (risk R5)', () => {
    const rooms = shippedRooms()
    localStorage.setItem(HIDDEN_KEY, JSON.stringify({ ids: [rooms[0]] }))
    const { container } = render(<App />)
    const shown = cardRoom(container)
    expect(shown, 'the carousel must still show a room').not.toBeNull()
    expect(shown).not.toBe(rooms[0])
  })

  it('carries the clamp to screens that have no fallback of their own (risk R5)', () => {
    /*
     * The assertion above is NOT enough on its own, and the reason is worth
     * writing down. `Home` recomputes its index as `Math.max(0, findIndex(...))`
     * over its OWN filtered list, so it lands on a visible room whether or not
     * `App`'s clamp is correct — it would go green against the exact defect R5
     * names.
     *
     * The lobby has no such self-heal: it renders `presetId` verbatim
     * (`data-room` on `lobby-room`). So this is where `App`'s clamp is actually
     * observable, and it is also where a wrong clamp would do damage — the match
     * that starts from here is the one the child plays.
     */
    const rooms = shippedRooms()
    localStorage.setItem(HIDDEN_KEY, JSON.stringify({ ids: [rooms[0]] }))
    const { container } = render(<App />)
    fireEvent.click(within(container).getByTestId('start-match'))

    const lobby = container.querySelector('[data-testid="lobby-room"]')
    expect(lobby, 'the lobby must have a room to start from').not.toBeNull()
    expect(lobby?.getAttribute('data-room')).not.toBe(rooms[0])
    expect(shippedRooms()).toContain(lobby?.getAttribute('data-room'))
  })

  it('still shows a room when EVERY room is hidden, rather than an empty screen', () => {
    // The degenerate case. The editor refuses to hide the last visible room, so
    // this state needs a corrupted or hand-edited key to reach — and reaching it
    // must not leave a child on a screen with nothing on it and no way back.
    localStorage.setItem(HIDDEN_KEY, JSON.stringify({ ids: shippedRooms() }))
    const { container } = render(<App />)
    expect(cardRoom(container), 'a fallback room must still be offered').not.toBeNull()
  })
})

describe('the carousel offers a way into room management', () => {
  it('lands on the editor\'s room LIST, not on a room', () => {
    // Deliberately the list: hiding and deleting are implemented in exactly one
    // place, and a second confirm flow on the carousel would be a second rule.
    const { container } = render(<App />)
    fireEvent.click(within(container).getByTestId('manage-rooms'))
    expect(within(container).queryByTestId('editor-rooms')).not.toBeNull()
    // Not `room-detail`, which is where the card's own edit button goes.
    expect(within(container).queryByTestId('room-detail')).toBeNull()
  })

  it('a room hidden from that list disappears from the carousel without a reload', () => {
    // The reason the hidden set is owned by `App` and not by `Edit`. Two copies
    // would let the carousel keep offering a room the editor had just hidden.
    const rooms = shippedRooms()
    const { container } = render(<App />)
    const before = dots(container)

    fireEvent.click(within(container).getByTestId('manage-rooms'))
    fireEvent.click(within(container).getByTestId(`room-hide-${rooms[1]}`))
    fireEvent.click(within(container).getByTestId('tab-play'))

    expect(dots(container)).toBe(before - 1)
  })
})
