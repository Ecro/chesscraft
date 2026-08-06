// @vitest-environment jsdom
import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { loadContentSet } from '../../src/content/load'
import { bundledContentSource } from '../../src/content/sets/bundled'
import { App } from '../../src/ui/App'
import { COACH_SEEN_KEY, hasSeenCoach, markCoachSeen } from '../../src/ui/coach'
import { Rules } from '../../src/ui/Rules'

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
    const { container } = render(<Rules content={content} onClose={() => {}} />)
    for (const [group, expected] of [
      ['piece', content.pieces.size],
      ['square', content.squareTypes.size],
      ['rule', content.ruleCards.size],
      ['skill', content.skillCards.size],
    ] as const) {
      const rows = container.querySelectorAll(`[data-testid="rules-${group}"] [data-entry]`)
      expect(rows.length, `${group} rows`).toBe(expected)
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
    const { container } = render(<Rules content={loaded.set} onClose={() => {}} />)
    const rows = container.querySelectorAll('[data-testid="rules-piece"] [data-entry]')
    expect(rows.length).toBe(content.pieces.size + 1)
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

describe('a detour does not restart the introduction', () => {
  it('resumes the coach at the step it was on after visiting the rules screen', () => {
    // The coach used to hold its own step index, and the rules route unmounts
    // it — so a child who read a card, tapped through to see what it meant, and
    // came back was shown the sequence again from the top.
    window.localStorage.clear()
    render(<App />)
    fireEvent.click(screen.getByTestId('coach-next'))
    const midway = screen.getByTestId('coach-done')
    expect(midway).toBeTruthy()

    fireEvent.click(screen.getByTestId('open-rules'))
    fireEvent.click(screen.getByTestId('rules-close'))

    // Still on the last card, not back on the first.
    expect(screen.queryByTestId('coach-done')).not.toBeNull()
  })
})

describe('the rules screen can be left', () => {
  it('closes through its own control', () => {
    let closed = false
    render(<Rules content={content} onClose={() => (closed = true)} />)
    fireEvent.click(screen.getByTestId('rules-close'))
    expect(closed).toBe(true)
  })

  it('groups entries under headings a reader can scan', () => {
    const { container } = render(<Rules content={content} onClose={() => {}} />)
    for (const group of ['piece', 'square', 'rule', 'skill']) {
      const section = container.querySelector(`[data-testid="rules-${group}"]`)
      expect(section, group).not.toBeNull()
      expect(within(section as HTMLElement).getByRole('heading').textContent).toMatch(/[가-힣]/)
    }
  })
})
