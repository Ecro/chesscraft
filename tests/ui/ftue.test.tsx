// @vitest-environment jsdom
import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { loadContentSet } from '../../src/content/load'
import { bundledContentSource } from '../../src/content/sets/bundled'
import { App } from '../../src/ui/App'
import { COACH_SEEN_KEY, hasSeenCoach, markCoachSeen } from '../../src/ui/coach'
import { Rules } from '../../src/ui/Rules'
import { skipOnboarding } from '../helpers/onboarding'

/**
 * The dex is four tabs over one grid now, so a "list everything" assertion has
 * to visit each tab. `rules-<kind>` survived the rebuild as the tab's own test
 * id — the groups still exist, they are just not all on screen at once.
 */
function openGroup(group: string) {
  fireEvent.click(screen.getByTestId(`rules-${group}`))
  return document.querySelectorAll('.dex-grid [data-entry]')
}

/**
 * PLAN Phase 3 — the first-time experience.
 *
 * The rules screen is asserted by COUNT against the loaded content set rather
 * than against a list of the bundle's current pieces. That is the whole design
 * constraint restated as a test: a piece someone authors in the editor has to
 * appear in the rules without anyone editing this file, and a hand-written
 * expected list would pass while quietly documenting only what shipped in 2026.
 *
 * The coach-mark assertions are about the SEQUENCE, not the copy. Progressive
 * disclosure is the one onboarding rule the sources agree on, and the failure
 * mode is showing everything at once — so what is pinned is that exactly one
 * step is on screen at a time, that skipping ends the whole thing, and that a
 * second visit is silent.
 */

const content = (() => {
  const loaded = loadContentSet(bundledContentSource)
  if (!loaded.ok) throw new Error('bundled content must load')
  return loaded.set
})()

function memoryStorage(): Storage {
  const map = new Map<string, string>()
  return {
    get length() {
      return map.size
    },
    clear: () => map.clear(),
    getItem: (k) => map.get(k) ?? null,
    key: (i) => [...map.keys()][i] ?? null,
    removeItem: (k) => void map.delete(k),
    setItem: (k, v) => void map.set(k, v),
  } as Storage
}

describe('the rules screen is generated from the content set, not written down', () => {
  it('lists every piece, square type, rule card and skill card the set holds', () => {
    render(<Rules content={content} onClose={() => {}} />)
    for (const [group, expected] of [
      ['piece', content.pieces.size],
      ['square', content.squareTypes.size],
      ['rule', content.ruleCards.size],
      ['skill', content.skillCards.size],
    ] as const) {
      expect(openGroup(group).length, `${group} rows`).toBe(expected)
    }
    // A guard against the counts all being zero together, which would satisfy
    // every equality above while listing nothing.
    expect(content.pieces.size).toBeGreaterThan(0)
    expect(content.skillCards.size).toBeGreaterThan(0)
  })

  it('names nothing itself — every entry reads its words from the content (ADR-011)', () => {
    const { container } = render(<Rules content={content} onClose={() => {}} />)
    const text = container.textContent ?? ''
    // A raw key on screen means the entry rendered an id instead of its name.
    expect(text).not.toMatch(/\b(piece|skill|rule|square)\.[a-z-]+\.(name|text)\b/)
    expect(text).toMatch(/[가-힣]/)
  })

  it('shows an authored piece with no change to this component', () => {
    const authored = structuredClone(bundledContentSource)
    authored.pieces.push({
      ...structuredClone(authored.pieces[0]!),
      id: 'piece.testonly',
      nameKey: 'piece.testonly.name',
      textKey: 'piece.testonly.text',
    })
    const loaded = loadContentSet(authored)
    if (!loaded.ok) throw new Error(`authored set must load: ${JSON.stringify(loaded.errors)}`)
    render(<Rules content={loaded.set} onClose={() => {}} />)
    expect(openGroup('piece').length).toBe(content.pieces.size + 1)
  })
})

describe('the coach marks introduce one thing at a time', () => {
  let storage: Storage
  beforeEach(() => {
    storage = memoryStorage()
  })

  it('reports unseen on a first visit and seen after it is marked', () => {
    expect(hasSeenCoach(storage)).toBe(false)
    markCoachSeen(storage)
    expect(hasSeenCoach(storage)).toBe(true)
    expect(storage.getItem(COACH_SEEN_KEY)).not.toBeNull()
  })

  it('treats a storage that can read but not write as already seen', () => {
    // The case the first version of coach.ts got wrong, and the reason it was
    // wrong is that reads and writes were assumed to fail together. A zero-quota
    // storage answers getItem (null — nothing was ever stored) and throws on
    // setItem, so guarding only the read gave not-seen on every load and an
    // unrecordable dismissal every time: the replay-forever loop the module is
    // supposed to prevent. Shipped without this test, the guard's own docstring
    // was the only thing claiming it worked.
    const readOnly = {
      getItem: () => null,
      setItem: () => {
        throw new Error('quota')
      },
      removeItem: () => {},
    } as unknown as Storage
    expect(hasSeenCoach(readOnly)).toBe(true)
  })

  it('survives a storage that refuses to co-operate', () => {
    // A browser in private mode throws on setItem. Onboarding is not worth
    // taking the app down for, so the flag degrades to "already seen" rather
    // than trapping a player in a tutorial that cannot record its own end.
    const hostile = {
      getItem: () => {
        throw new Error('denied')
      },
      setItem: () => {
        throw new Error('denied')
      },
    } as unknown as Storage
    expect(() => hasSeenCoach(hostile)).not.toThrow()
    expect(() => markCoachSeen(hostile)).not.toThrow()
  })
})

describe('onboarding shows one card at a time and happens once', () => {
  /*
   * This used to assert that a DETOUR — reading a coach card, tapping through to
   * the rules screen, coming back — did not restart the sequence, because the
   * coach was an overlay on the home screen and the rules route unmounted it.
   * Onboarding is its own route now with nowhere to detour to, so that hazard is
   * gone by construction and the test would pin nothing. What is still worth
   * pinning is what the old file's header said the coach assertions were about:
   * exactly one card on screen at a time, and a second visit that is silent.
   */
  it('advances one card at a time and lands on the title screen', () => {
    window.localStorage.clear()
    render(<App />)
    // The guard is structural in `Boot` — it can only render `STEPS[step]` —
    // and this is the observable half of it.
    expect(document.querySelectorAll('[data-testid^="boot-step-"]')).toHaveLength(1)
    fireEvent.click(screen.getByTestId('boot-next'))
    expect(document.querySelectorAll('[data-testid^="boot-step-"]')).toHaveLength(1)
    fireEvent.click(screen.getByTestId('boot-next'))
    // Last card: skip is gone, because it would do exactly what the other button
    // does and a child cannot tell what "skip" skips when nothing is left.
    expect(screen.queryByTestId('boot-skip')).toBeNull()
    fireEvent.click(screen.getByTestId('boot-done'))
    expect(screen.getByTestId('home')).toBeTruthy()
  })

  it('is silent on a second visit', () => {
    skipOnboarding()
    render(<App />)
    expect(screen.queryByTestId('boot-step-build')).toBeNull()
    expect(screen.getByTestId('home')).toBeTruthy()
  })

  it('can be skipped, and skipping still counts as having seen it', () => {
    window.localStorage.clear()
    render(<App />)
    fireEvent.click(screen.getByTestId('boot-skip'))
    expect(screen.getByTestId('home')).toBeTruthy()
    expect(hasSeenCoach(window.localStorage)).toBe(true)
  })
})

describe('the rules screen can be left', () => {
  it('closes through its own control', () => {
    let closed = false
    render(<Rules content={content} onClose={() => (closed = true)} />)
    fireEvent.click(screen.getByTestId('rules-close'))
    expect(closed).toBe(true)
  })

  it('names every group in words a reader can scan', () => {
    // The four groups are tabs rather than headings since the rebuild, so what
    // is asserted moved from `role="heading"` to the tab's own label — the claim
    // is unchanged: each of the four kinds is named, in Korean, on screen.
    render(<Rules content={content} onClose={() => {}} />)
    for (const group of ['piece', 'square', 'rule', 'skill']) {
      const tab = screen.getByTestId(`rules-${group}`)
      expect(tab.textContent, group).toMatch(/[가-힣]/)
    }
    // And the grid below actually follows the tab, rather than four tabs all
    // showing the pieces.
    expect(openGroup('skill').length).toBe(content.skillCards.size)
    expect(openGroup('square').length).toBe(content.squareTypes.size)
  })
})
