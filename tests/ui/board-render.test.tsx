// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { loadContentSet } from '../../src/content/load'
import { SCHEMA_VERSION } from '../../src/content/schema'
import { BUNDLED_PRESET_ID, bundledContentSource } from '../../src/content/sets/bundled'
import { SLICE_PRESET_ID, sliceContentSource } from '../../src/content/sets/slice'
import { MatchHost } from '../../src/ui/MatchHost'
import { makeTranslate } from '../../src/ui/i18n'

/** Bundle-only, matching what `MatchHost` resolves with no provider above it. */
const translate = makeTranslate()

/**
 * PLAN Phase 4 — the board stops rendering pieces as their own names.
 *
 * The fallback is the load-bearing test, not the glyph. `iconKey` is optional
 * and two content documents in this repo predate it (`slice.ts` declares schema
 * version 1, `gate6a.ts` declares 2), so "a piece with no icon" is not a
 * hypothetical fixture — it is what every older document, and every piece an
 * author creates until the editor grows the control in Phase 9, will be. A
 * blank square is the failure this guards, and the 2026-06-08 correction in
 * CLAUDE.md is precisely about features that activate on an optional field.
 */

const load = (src: Parameters<typeof loadContentSet>[0]) => {
  const r = loadContentSet(src)
  if (!r.ok) throw new Error(`content must load: ${JSON.stringify(r.errors)}`)
  return r.set
}

const bundled = load(bundledContentSource)
const slice = load(sliceContentSource)

const squares = (c: HTMLElement) => [...c.querySelectorAll('[data-testid^="sq-"]')]
const occupied = (c: HTMLElement) => squares(c).filter((s) => (s.getAttribute('data-piece') ?? '') !== '')

describe('a piece renders as a glyph, never as a blank square', () => {
  it('renders the resolved icon, not the piece name', () => {
    // "Not blank" was the first version of this assertion, and it could never
    // fail: the board already rendered the full translated name, so a square
    // occupied by a piece was non-empty before Phase 4 existed. What is new is
    // WHICH text appears, so that is what is asserted.
    const { container } = render(<MatchHost content={bundled} presetId={BUNDLED_PRESET_ID} newSeed={() => 7} />)
    const seen = occupied(container).map((s) => {
      const def = bundled.pieces.get(s.getAttribute('data-piece') ?? '')
      return {
        square: s.getAttribute('data-testid'),
        text: (s.textContent ?? '').trim(),
        icon: def?.iconKey ? translate(def.iconKey) : null,
        name: def ? translate(def.nameKey) : '',
      }
    })
    expect(seen.length).toBeGreaterThan(0)
    for (const { square, text, icon, name } of seen) {
      expect(icon, `${square} — the bundled set must carry an icon`).toBeTruthy()
      // `translate` returns the KEY when it cannot resolve one, and the expected
      // value above is computed the same way — so a typo'd iconKey made both
      // sides equal and the comparison passed while the board painted
      // `piece.foo.icon` across a square.
      expect(icon, `${square} — iconKey did not resolve`).not.toMatch(/^piece\./)
      expect(text, square ?? '').toBe(icon)
      expect(text, `${square} still shows the name`).not.toBe(name)
    }
  })

  it('falls back to a monogram for a document that predates iconKey', () => {
    // slice.ts is schemaVersion 1 — no piece in it can carry an icon.
    const { container } = render(<MatchHost content={slice} presetId={SLICE_PRESET_ID} newSeed={() => 7} />)
    const rendered = occupied(container).map((s) => (s.textContent ?? '').trim())
    expect(rendered.length).toBeGreaterThan(0)
    for (const text of rendered) expect(text).not.toBe('')
    // Asserted as EQUALITY with the first grapheme, not as a length bound. The
    // slice's pieces are '왕' (1 char) and '궁수' (2), so `length <= 2` is true of
    // the untruncated names too — an implementation that never truncates would
    // have passed it, which is the '12px word in a square' defect this replaces.
    const expected = [...slice.pieces.values()].map((p) => [...translate(p.nameKey)][0])
    for (const text of rendered) expect(expected).toContain(text)
    expect(new Set(expected).size).toBeGreaterThan(0)
  })
})

describe('coordinates leave the squares', () => {
  it('renders no square containing its own coordinate', () => {
    const { container } = render(<MatchHost content={bundled} presetId={BUNDLED_PRESET_ID} newSeed={() => 7} />)
    const offenders = squares(container)
      .map((s) => [s.getAttribute('data-testid')?.replace('sq-', '') ?? '', (s.textContent ?? '').trim()] as const)
      .filter(([coord, text]) => coord !== '' && text.includes(coord))
    expect(offenders).toEqual([])
  })

  it('still shows the coordinates somewhere — on the board edge', () => {
    const { container } = render(<MatchHost content={bundled} presetId={BUNDLED_PRESET_ID} newSeed={() => 7} />)
    const files = container.querySelector('[data-testid="board-files"]')
    const ranks = container.querySelector('[data-testid="board-ranks"]')
    expect(files, 'file rail').not.toBeNull()
    expect(ranks, 'rank rail').not.toBeNull()
    // Moving them off the squares must not mean deleting them.
    expect((files?.textContent ?? '').toLowerCase()).toContain('a')
    expect(ranks?.textContent ?? '').toContain('1')
  })
})

describe('the board reads as a board (#41)', () => {
  it('alternates square parity across files and ranks', () => {
    const { container } = render(<MatchHost content={bundled} presetId={BUNDLED_PRESET_ID} newSeed={() => 7} />)
    const parities = new Map<string, string>()
    for (const s of squares(container)) {
      const id = s.getAttribute('data-testid')?.replace('sq-', '') ?? ''
      parities.set(id, s.getAttribute('data-parity') ?? '')
    }
    expect(new Set(parities.values())).toEqual(new Set(['0', '1']))
    // Adjacent squares must differ, or "alternating" is just two colours
    // sprinkled about — a1/b1 are neighbours, a1/b2 are diagonal twins.
    expect(parities.get('a1')).not.toBe(parities.get('b1'))
    expect(parities.get('a1')).not.toBe(parities.get('a2'))
    expect(parities.get('a1')).toBe(parities.get('b2'))
  })

  it('has a stylesheet rule that actually paints the two parities differently', () => {
    // The DOM attribute alone is the shape this project already shipped once as
    // a dead token: `--color-board-dark` existed in three cascade layers and no
    // selector referenced it, so the board was flat while the tokens implied a
    // checker. The attribute and the rule have to arrive together.
    const css = readFileSync(join(__dirname, '../../src/ui/styles.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
    // Comments stripped first, and the token required INSIDE the parity rule's
    // own block. Two independent greps passed on a `/* TODO: wire
    // --color-board-dark into [data-parity="1"] */`, which is a weaker check
    // than the dead-token bug this cites as its reason for existing.
    expect(css).toMatch(/\[data-parity=['"]?1['"]?\][^{}]*\{[^}]*background[^}]*var\(--color-board-dark\)[^}]*\}/)
  })
})

describe('schema v4 carries the icon', () => {
  it('bumped the version the editor gates imports on', () => {
    // `src/editor/io.ts` refuses any document declaring a version above this
    // constant, so a v4 export that the app cannot re-import is the failure.
    expect(SCHEMA_VERSION).toBeGreaterThanOrEqual(4)
    expect(bundledContentSource.schemaVersion).toBe(SCHEMA_VERSION)
  })

  it('ships icon data on the bundled set', () => {
    // A content-authoring claim, kept separate from the schema claim below: if
    // the field lands and the bundle is never authored, exactly one of these
    // two tests should go red, and it should be this one.
    const withIcon = bundledContentSource.pieces.filter((p) => (p as { iconKey?: string }).iconKey)
    expect(withIcon.length).toBe(bundledContentSource.pieces.length)
  })

  it('treats iconKey as optional — a piece without one still loads', () => {
    // Independent of whether anyone authored icons: strip it and the document
    // must still validate, because every pre-v4 document in this repo is that
    // document.
    const src = structuredClone(bundledContentSource)
    for (const p of src.pieces) delete (p as { iconKey?: string }).iconKey
    const r = loadContentSet(src)
    expect(r.ok, r.ok ? '' : JSON.stringify(r.errors)).toBe(true)
  })
})
