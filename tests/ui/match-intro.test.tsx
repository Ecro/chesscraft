// @vitest-environment jsdom
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { loadContentSet } from '@content/load'
import { BUNDLED_PRESET_ID, bundledContentSource } from '@content/sets/bundled'
import { createMatch } from '@engine/match'
import { ko } from '../../src/i18n/ko'
import { MatchHost } from '../../src/ui/MatchHost'
import { makeTranslate } from '../../src/ui/i18n'
import { MATCH_INTRO_SEEN_KEY, ONBOARDING_KEYS } from '../../src/ui/onboarding'
import { skipOnboarding } from '../helpers/onboarding'

/**
 * PLAN Phase 1 — the sheet a player meets the first time they open a board.
 *
 * `Boot` already exists and runs on the HOME screen, before there is a board or
 * a card to point at. It says what the app is; it cannot say what a turn is.
 * This sheet is the other half, and it lives where the thing it describes is.
 *
 * Two properties are load-bearing and the rest is copy.
 *
 * **It names the rule card this match actually drew**, read from the loaded
 * content set — not a written-down string. A hand-maintained sentence would go
 * stale the first time anyone authors a room, which is the product's whole
 * point (the same argument `Rules.tsx` makes for generating the dex).
 *
 * **A `MatchHost` with no storage shows nothing.** That is not a convenience:
 * roughly fifteen unit tests mount this component directly to look at a board,
 * and a component that read `localStorage` on its own would put every one of
 * them behind an undismissed sheet — failing on selectors one tap away, with
 * nothing in the output naming the cause (PLAN risk R1). Storage is injected,
 * the same shape `newSeed` / `createAi` / `initialState` already use.
 */

afterEach(cleanup)

const content = (() => {
  const loaded = loadContentSet(bundledContentSource)
  if (!loaded.ok) throw new Error('bundled content must load')
  return loaded.set
})()

const t = makeTranslate()

/** A `Storage` that lives in a Map — no jsdom global, no cross-test leakage. */
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
  }
}

/**
 * A storage that reads but refuses to write — the zero-quota browser.
 *
 * `getItem` SUCCEEDS and returns null, because nothing was ever stored, while
 * `setItem` throws. `coach.ts` documents this as the case its first version got
 * wrong: guarding only the read produced a replay-forever loop. The registry
 * inherits that logic, so the same case has to be pinned here.
 */
function refusingStorage(): Storage {
  const base = memoryStorage()
  return {
    ...base,
    get length() {
      return base.length
    },
    setItem: () => {
      throw new DOMException('quota', 'QuotaExceededError')
    },
  }
}

/**
 * The bundle's text for a chrome key, and a loud failure when there isn't any.
 *
 * NOT `t(key)`. `makeTranslate` resolves `overlay ?? BUNDLES[locale][key] ?? key`
 * — on a miss it returns the KEY ITSELF. So an implementation that calls
 * `t('ui.intro.turn.body')` in the component but never adds that entry to
 * `src/i18n/ko.ts` renders the literal string `ui.intro.turn.body` on screen,
 * and `expect(rendered).toContain(t('ui.intro.turn.body'))` compares that
 * fallback against itself and passes. Both halves of the comparison would be
 * wrong in the same direction, which is `[fail:test] assertion-equals-its-own-default`.
 *
 * Reading the bundle directly breaks the symmetry: an absent key fails here,
 * before the DOM is ever consulted.
 */
function copy(key: string): string {
  const text = (ko as Record<string, string>)[key]
  expect(text, `${key} must exist in src/i18n/ko.ts — a missing key renders as the key itself`).toBeTruthy()
  return text!
}

/** The rule card this seed deals, named by the content set rather than by hand. */
function ruleNameFor(seed: number): string {
  const match = createMatch({ content, presetId: BUNDLED_PRESET_ID, seed })
  const id = match.states[0]!.ruleCardId
  expect(id, 'the bundled preset must deal a rule card').toBeTruthy()
  const card = content.ruleCards.get(id!)
  expect(card, `content set must define ${id}`).toBeTruthy()
  return t(card!.nameKey)
}

describe('the first board a player opens explains itself', () => {
  it('names the rule card this match drew, and the turn shape', () => {
    const storage = memoryStorage()
    render(<MatchHost content={content} presetId={BUNDLED_PRESET_ID} newSeed={() => 1} storage={storage} />)

    const intro = screen.getByTestId('match-intro')
    // The rule this match actually drew — derived, so an authored room works too.
    expect(intro.textContent).toContain(ruleNameFor(1))
    // The turn shape, which is the one rule no content set can state for itself.
    expect(intro.textContent).toContain(copy('ui.intro.turn.body'))
    // The line that makes the card banner discoverable before it first fires.
    expect(intro.textContent).toContain(copy('ui.intro.opponent.body'))
    /*
     * And no raw key reaches the child.
     *
     * The independent half of the guard above: `copy()` proves the bundle HAS
     * the entry, this proves the component is not also printing some OTHER
     * unresolved `ui.intro.*` key beside it. Neither assertion can be satisfied
     * by the resolver's key-fallback, which is the whole point.
     */
    expect(intro.textContent, 'an unresolved key must never reach the screen').not.toMatch(/ui\.intro\./)
  })

  it('is shown once — dismissing it records the visit', () => {
    const storage = memoryStorage()
    const first = render(<MatchHost content={content} presetId={BUNDLED_PRESET_ID} newSeed={() => 1} storage={storage} />)
    fireEvent.click(screen.getByTestId('match-intro-close'))
    expect(screen.queryByTestId('match-intro'), 'dismissal must close it').toBeNull()
    expect(storage.getItem(MATCH_INTRO_SEEN_KEY), 'the visit must be recorded').not.toBeNull()
    first.unmount()

    render(<MatchHost content={content} presetId={BUNDLED_PRESET_ID} newSeed={() => 1} storage={storage} />)
    expect(screen.queryByTestId('match-intro'), 'a second board must be silent').toBeNull()
  })

  it('stays silent for a browser that cannot remember the answer', () => {
    // Failing to "already seen" costs a first-time player the sheet once.
    // Failing the other way costs every returning player, every match.
    render(<MatchHost content={content} presetId={BUNDLED_PRESET_ID} newSeed={() => 1} storage={refusingStorage()} />)
    expect(screen.queryByTestId('match-intro')).toBeNull()
  })

  it('stays silent when no storage is injected at all', () => {
    // The guard that keeps ~15 direct-mount board tests off this screen.
    render(<MatchHost content={content} presetId={BUNDLED_PRESET_ID} newSeed={() => 1} />)
    expect(screen.queryByTestId('match-intro')).toBeNull()
  })
})

describe('the onboarding key registry is the only place a flag is named', () => {
  it('carries both flags', () => {
    expect(ONBOARDING_KEYS).toContain('chess-craft.coach.seen.v1')
    expect(ONBOARDING_KEYS).toContain(MATCH_INTRO_SEEN_KEY)
  })

  it('is what the test helper marks, so a new flag cannot be missed', () => {
    const before = ONBOARDING_KEYS.filter((k) => localStorage.getItem(k) !== null)
    expect(before, 'this test must start from an unmarked storage').toEqual([])
    skipOnboarding()
    for (const key of ONBOARDING_KEYS) {
      expect(localStorage.getItem(key), `${key} must be marked by skipOnboarding()`).not.toBeNull()
    }
    localStorage.clear()
  })

  it('contains every seen-flag literal written anywhere under src/ui', () => {
    /*
     * The anti-drift half, and the reason the registry exists at all.
     *
     * `tests/helpers/onboarding.ts` and `playwright.config.ts` both have to know
     * every flag, and the helper's own comment says the key "is the thing that
     * must not be duplicated". A third flag added as its own literal would leave
     * both surfaces silently short — and the failure is a timeout on a selector
     * one sheet away, which points at nothing. So the literals are enumerated
     * from the source rather than trusted.
     */
    const dir = join(__dirname, '../../src/ui')
    const pattern = /'(chess-craft\.[a-z0-9.-]*seen\.v\d+)'/g
    const found = new Set<string>()
    for (const name of readdirSync(dir)) {
      if (!name.endsWith('.ts') && !name.endsWith('.tsx')) continue
      const body = readFileSync(join(dir, name), 'utf8')
      for (const m of body.matchAll(pattern)) found.add(m[1]!)
    }
    expect(found.size, 'the scan must find the flags it is policing').toBeGreaterThan(0)
    expect([...found].sort()).toEqual([...ONBOARDING_KEYS].sort())
  })

  it('is what the Playwright suite pre-seeds, so e2e does not land behind a sheet', async () => {
    /*
     * The second surface ADR-006 names, and the one the src/ui scan above cannot
     * see: `playwright.config.ts` sets a suite-wide `storageState` so that the
     * other e2e specs are not each one tap away from onboarding.
     *
     * `ftue.spec.ts` deliberately opts OUT of that default and clears storage
     * itself, so e2e cannot catch a short list either — the spec that would
     * notice is precisely the one that does not use it. Checked here instead,
     * against the real config object rather than its text, so a config that
     * derives the list from `ONBOARDING_KEYS` and one that hardcodes the right
     * strings both pass, and one that forgets a flag does not.
     */
    const config = (await import('../../playwright.config')).default as {
      use?: { storageState?: { origins?: Array<{ localStorage?: Array<{ name: string }> }> } }
    }
    const origins = config.use?.storageState?.origins ?? []
    expect(origins.length, 'the suite-wide storageState must still exist').toBe(1)
    const seeded = (origins[0]!.localStorage ?? []).map((e) => e.name)
    expect(seeded.sort()).toEqual([...ONBOARDING_KEYS].sort())
  })
})
