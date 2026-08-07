// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { bundledContentSource } from '../../src/content/sets/bundled'
import { STORAGE_KEY } from '../../src/editor/storage'
import { App } from '../../src/ui/App'
import { skipOnboarding } from '../helpers/onboarding'

/**
 * PLAN Phase 6b — the designed-state half of the exit criterion (#18).
 *
 * The criterion says "content that fails to load produces a designed state with
 * a recovery action rather than a bare sentence", and the interesting part is
 * WHICH failure. `App`'s `content-broken` branch keys on `loadContentSet(source)`
 * failing — but `initialSource()` discards stored content that does not validate
 * and falls back to the shipped set, so `source` is always valid and that branch
 * is unreachable by any route a person can take. A test written against it would
 * be asserting a dead line.
 *
 * The failure a person actually hits is one level earlier: their saved content
 * did not load, and the app started on the bundled set with their work gone from
 * the screen and no explanation. That is the state this file pins — reachable by
 * seeding storage the way a schema change or a truncated write leaves it, which
 * is exactly how it happens in the wild.
 */

function seedStorage(value: string) {
  window.localStorage.clear()
  window.localStorage.setItem(STORAGE_KEY, value)
  // The clear above takes the onboarding flag with it, and the app opens on
  // onboarding for a browser that has never been here — so re-setting it is
  // part of seeding, not a separate concern of each test.
  skipOnboarding()
}

// The app opens on onboarding for a browser that has never been here.
// Every test below is about a screen behind it.
beforeEach(skipOnboarding)

describe('content that would not load is explained, not swallowed (#18)', () => {
  beforeEach(() => window.localStorage.clear())

  it('says so, and offers something to do about it', () => {
    // Valid JSON, invalid content — the shape a schema bump leaves behind, and
    // the one `loadStoredContent` reports as `invalid` rather than `corrupt`.
    seedStorage(JSON.stringify({ schemaVersion: 5, pieces: [], boards: [], presets: [] }))
    render(<App />)

    const notice = screen.getByTestId('content-notice')
    // A designed state, not a sentence: the criterion's whole point is that the
    // player is left with a next step.
    expect(within(notice).getAllByRole('button').length).toBeGreaterThan(0)
    expect(notice.textContent).toMatch(/[가-힣]/)
  })

  it('leaves the app playable while it says it', () => {
    seedStorage('{ not json at all')
    render(<App />)

    expect(screen.getByTestId('content-notice')).toBeTruthy()
    // The fallback already worked — the shipped set is loaded. The notice must
    // not be a dead end in front of it.
    expect(screen.getByTestId('home')).toBeTruthy()
  })

  it('stays quiet when there was nothing saved', () => {
    render(<App />)
    expect(screen.queryByTestId('content-notice')).toBeNull()
  })

  it('stays quiet when the saved content loaded fine', () => {
    // Round-trips the shipped set through storage: valid, loads, nothing to say.
    seedStorage(JSON.stringify(bundledContentSource))
    render(<App />)
    expect(screen.queryByTestId('content-notice')).toBeNull()
  })
})
