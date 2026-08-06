import { describe, expect, it } from 'vitest'
import { makeTranslate } from '@ui/i18n'
import { type ArtEntry, resolveMark } from '@ui/art/resolve'

/**
 * The mark a record renders (PLAN-mobile-grade-graphics ADR-006).
 *
 * Six branches, and the interesting ones are the two DEGENERATE cases rather
 * than the happy path. `artKey` is a plain string in the schema — nothing
 * validates it against the registry, and nothing stops a piece and a square
 * type from sharing one id — so the resolver, not the type system, is where a
 * bad id is made safe. Both degenerate cases resolve to the glyph, never to a
 * broken `<img>`.
 *
 * The registry is injected rather than imported, for the same reason
 * `browserStorage` and `AudioBackend` are: a test that had to reach into the
 * real catalogue could only assert what the shipped art happens to be, and the
 * unknown-id branch would be untestable by construction.
 */

const t = makeTranslate({ ko: { 'piece.k.name': '왕', 'piece.k.icon': '♚', 'card.c.icon': '⚡' } })

const sided: ArtEntry = { kind: 'sided', white: '/w.webp', black: '/b.webp' }
const neutral: ArtEntry = { kind: 'neutral', src: '/n.webp' }

const registry = new Map<string, ArtEntry>([
  ['art.k', sided],
  ['art.s', neutral],
])

describe('resolveMark — art level', () => {
  it('renders registered sided art for the side asked for', () => {
    const def = { artKey: 'art.k', iconKey: 'piece.k.icon', nameKey: 'piece.k.name' }
    expect(resolveMark(t, def, { registry, side: 'white', fallback: 'monogram' })).toEqual({ kind: 'art', src: '/w.webp' })
    expect(resolveMark(t, def, { registry, side: 'black', fallback: 'monogram' })).toEqual({ kind: 'art', src: '/b.webp' })
  })

  it('renders registered neutral art when no side is asked for', () => {
    const def = { artKey: 'art.s', iconKey: 'card.c.icon' }
    expect(resolveMark(t, def, { registry, fallback: 'none' })).toEqual({ kind: 'art', src: '/n.webp' })
  })
})

describe('resolveMark — degenerate art, which must never reach the DOM as an <img>', () => {
  it('falls through to the glyph when the artKey is not registered', () => {
    // The path a typo takes: an imported document, or a hand-edited export.
    const def = { artKey: 'art.typo', iconKey: 'piece.k.icon', nameKey: 'piece.k.name' }
    expect(resolveMark(t, def, { registry, side: 'white', fallback: 'monogram' })).toEqual({ kind: 'glyph', text: '♚' })
  })

  it('falls through to the glyph when a neutral entry is read for a sided piece', () => {
    // Reachable the moment one artKey string is shared by a piece and a square
    // type — nothing in the schema forbids it.
    const def = { artKey: 'art.s', iconKey: 'piece.k.icon', nameKey: 'piece.k.name' }
    expect(resolveMark(t, def, { registry, side: 'white', fallback: 'monogram' })).toEqual({ kind: 'glyph', text: '♚' })
  })

  it('falls through to the glyph when a sided entry is read with no side', () => {
    const def = { artKey: 'art.k', iconKey: 'card.c.icon' }
    expect(resolveMark(t, def, { registry, fallback: 'none' })).toEqual({ kind: 'glyph', text: '⚡' })
  })

  it('falls through to the glyph when the entry carries an empty url', () => {
    // The third degenerate case, and the only one that would still have reached
    // the DOM: `<img src="">` resolves against the document URL, so the browser
    // draws a broken image or re-fetches the page. One removed asset import
    // with its registry entry left behind produces exactly this.
    const half = new Map<string, ArtEntry>([
      ['art.half', { kind: 'sided', white: '', black: '/b.webp' }],
      ['art.blank', { kind: 'neutral', src: '' }],
    ])
    const piece = { artKey: 'art.half', iconKey: 'piece.k.icon', nameKey: 'piece.k.name' }
    expect(resolveMark(t, piece, { registry: half, side: 'white', fallback: 'monogram' })).toEqual({ kind: 'glyph', text: '♚' })
    // ...and the populated side of the same entry still works.
    expect(resolveMark(t, piece, { registry: half, side: 'black', fallback: 'monogram' })).toEqual({ kind: 'art', src: '/b.webp' })
    expect(resolveMark(t, { artKey: 'art.blank', iconKey: 'card.c.icon' }, { registry: half, fallback: 'none' })).toEqual({
      kind: 'glyph',
      text: '⚡',
    })
  })
})

describe('resolveMark — glyph and monogram levels, unchanged from schema v5', () => {
  it('uses the glyph when no artKey is declared', () => {
    const def = { iconKey: 'piece.k.icon', nameKey: 'piece.k.name' }
    expect(resolveMark(t, def, { registry, side: 'white', fallback: 'monogram' })).toEqual({ kind: 'glyph', text: '♚' })
  })

  it('falls to a monogram when neither art nor a resolvable icon exists', () => {
    const def = { iconKey: 'piece.k.missing', nameKey: 'piece.k.name' }
    expect(resolveMark(t, def, { registry, side: 'white', fallback: 'monogram' })).toEqual({ kind: 'monogram', text: '왕' })
  })

  it('falls to ? when even the name does not resolve', () => {
    // `makeTranslate` echoes an unresolved key, so without this branch the board
    // would show the first letter of `piece.ghost.name` — a bare `p`.
    const def = { nameKey: 'piece.ghost.name' }
    expect(resolveMark(t, def, { registry, side: 'white', fallback: 'monogram' })).toEqual({ kind: 'monogram', text: '?' })
  })

  it('renders nothing for a card or square that declares no icon', () => {
    // `fallback: 'none'` is the iconOf rule: inventing a glyph for content that
    // did not ask for one makes every unmarked card look alike.
    expect(resolveMark(t, { nameKey: 'piece.k.name' }, { registry, fallback: 'none' })).toEqual({ kind: 'none' })
    expect(resolveMark(t, undefined, { registry, fallback: 'none' })).toEqual({ kind: 'none' })
  })
})

describe('resolveMark — an empty registry is the shipping state until the art batch', () => {
  it('leaves every record on the glyph path', () => {
    const empty = new Map<string, ArtEntry>()
    const def = { artKey: 'art.k', iconKey: 'piece.k.icon', nameKey: 'piece.k.name' }
    expect(resolveMark(t, def, { registry: empty, side: 'white', fallback: 'monogram' })).toEqual({ kind: 'glyph', text: '♚' })
  })
})
