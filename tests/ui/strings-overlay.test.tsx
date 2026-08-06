// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { type ContentSource, loadContentSet } from '@content/load'
import { SLICE_PRESET_ID, sliceContentSource } from '@content/sets/slice'
import { exportContent, importContent } from '@editor/io'
import { STORAGE_KEY } from '@editor/storage'
import { App } from '@ui/App'
import { MatchHost } from '@ui/MatchHost'
import { TranslateContext, makeTranslate } from '@ui/i18n'
import { COACH_SEEN_KEY } from '@ui/coach'

/**
 * PLAN Phase 8 exit criterion — the whole path, end to end.
 *
 * The claim ADR-020 makes is not "the loader keeps a strings field". It is that
 * a name a child typed survives an export, comes back through an import, and
 * appears on the board. Each of those three hops has dropped data before in
 * this repo — `importContent` rebuilds its result from a hard-coded collection
 * whitelist, so a field nobody added to that list round-trips as `undefined`
 * while every unit test on the schema stays green.
 *
 * The overlay entry deliberately overrides a key the SHIPPED BUNDLE ALSO
 * RESOLVES. An entry for an unknown key would render the same under an
 * implementation that consulted the bundle first, so the only assertion that
 * pins the precedence is one where the two answers differ.
 *
 * The last test renders `App` rather than `MatchHost`. A provider supplied by
 * the test proves the component can use an overlay; it proves nothing about
 * whether the app ever hands it one. That gap — the phase implements the
 * capability and omits the wiring — is `phase-scope-omits-wiring`, recorded
 * four times in this PLAN.
 */

const AUTHORED_NAME = '토끼'
const BUNDLED_NAME = '궁수'

function authoredSource(): ContentSource {
  return {
    ...structuredClone(sliceContentSource),
    strings: { ko: { 'piece.archer.name': AUTHORED_NAME, 'preset.slice.name': '토끼 놀이' } },
  }
}

const load = (src: ContentSource) => {
  const r = loadContentSet(src)
  if (!r.ok) throw new Error(`content must load: ${JSON.stringify(r.errors)}`)
  return r.set
}

const labels = (c: HTMLElement) =>
  [...c.querySelectorAll('[data-testid^="sq-"]')].map((s) => s.getAttribute('aria-label') ?? '')

function boardWith(source: ContentSource) {
  const set = load(source)
  const { container } = render(
    <TranslateContext.Provider value={makeTranslate(source.strings)}>
      <MatchHost content={set} presetId={SLICE_PRESET_ID} newSeed={() => 7} />
    </TranslateContext.Provider>,
  )
  return container
}

describe('authored text survives export, import, and reaches the board', () => {
  it('round-trips the overlay through the document and renders it', () => {
    const exported = exportContent(authoredSource())
    // The text must be IN the file. If export dropped it, the import below
    // would silently fall back to the bundle and the render assertion would
    // still have something to find.
    expect(exported).toContain(AUTHORED_NAME)

    const imported = importContent(exported)
    expect(imported.ok, imported.ok ? '' : JSON.stringify(imported.errors)).toBe(true)
    if (!imported.ok) return
    expect(imported.source.strings?.ko?.['piece.archer.name']).toBe(AUTHORED_NAME)

    const named = labels(boardWith(imported.source)).filter((l) => l.includes(AUTHORED_NAME))
    expect(named.length).toBeGreaterThan(0)
    expect(labels(boardWith(imported.source)).some((l) => l.includes(BUNDLED_NAME))).toBe(false)
  })

  it('renders the bundled text for a document that declares no overlay (ADR-020 absent case)', () => {
    // `sliceContentSource` is a schema-version-1 document with no `strings`
    // field, loaded by existing suites. This is what every document written
    // before this phase is, and it must render exactly as it did.
    const withoutOverlay = structuredClone(sliceContentSource)
    const seen = labels(boardWith(withoutOverlay))
    expect(seen.some((l) => l.includes(BUNDLED_NAME))).toBe(true)
    expect(seen.some((l) => l.includes(AUTHORED_NAME))).toBe(false)
  })
})

describe('the app hands the overlay to the screens', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('renders authored text on the board reached through the product path', () => {
    localStorage.setItem(STORAGE_KEY, exportContent(authoredSource()))
    // Not a first visit — the coach marks are Phase 3's and would sit in front
    // of the board this test is about.
    localStorage.setItem(COACH_SEEN_KEY, '1')

    const { container } = render(<App />)
    fireEvent.change(screen.getByTestId('preset-select'), { target: { value: SLICE_PRESET_ID } })
    fireEvent.click(screen.getByTestId('start-match'))

    expect(labels(container).some((l) => l.includes(AUTHORED_NAME))).toBe(true)
  })

  it('names a preset by the author’s own words on the home screen', () => {
    localStorage.setItem(STORAGE_KEY, exportContent(authoredSource()))
    localStorage.setItem(COACH_SEEN_KEY, '1')

    render(<App />)
    const option = [...screen.getByTestId('preset-select').querySelectorAll('option')].find(
      (o) => o.value === SLICE_PRESET_ID,
    )
    expect(option?.textContent).toBe('토끼 놀이')
  })
})
