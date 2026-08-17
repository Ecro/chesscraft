import { describe, expect, it } from 'vitest'
import { SCHEMA_VERSION } from '@content/schema'
import { type ContentSource, loadContentSet } from '@content/load'
import { sliceContentSource } from '@content/sets/slice'
import { bundledContentSource } from '@content/sets/bundled'
import { artRegistry } from '@ui/art/registry'
import { exportContent, importContent } from '@editor/io'
import { artKeysOf, textKeysOf } from '@ui/i18n'

/**
 * Schema v7 — `artKey` (PLAN-mobile-grade-graphics ADR-006).
 *
 * The axis exists because `iconKey` resolves through the locale bundle to a
 * TEXT glyph, and raster illustration is neither text nor locale-varying. The
 * two must not share a slot: a record has to be able to carry art AND keep a
 * glyph behind it, which is the fallback chain ADR-006 specifies and this file
 * pins at the schema level.
 *
 * The version bump is not cosmetic. `io.ts:44` refuses any document declaring a
 * version above `SCHEMA_VERSION`, so leaving the constant at 6 while adding the
 * field ships a build that cannot re-import its own export.
 */

/** A v6 document — the shape every previously-exported file has. */
function v6Document(): ContentSource {
  const source = structuredClone(sliceContentSource) as ContentSource
  source.schemaVersion = 6
  return source
}

function currentDocument(): ContentSource {
  const source = structuredClone(sliceContentSource) as ContentSource
  source.schemaVersion = SCHEMA_VERSION
  source.skillCards = source.skillCards.map((card) => ({
    ...(card as object),
    royalFollowUp: 'preserve',
    protectRelocatedAfterPlay: false,
    lockRelocatedAfterPlay: false,
  }))
  return source
}

describe('schema v7 artKey', () => {
  it('is available — the axis landed in v7 and the build has not regressed below it', () => {
    // A statement about the artKey axis, not about today's version number.
    // Pinning the exact constant here made every schema bump edit this file for
    // no reason artKey cares about; the literal-vs-constant drift check that
    // pinning was standing in for lives, and is reasoned about, in
    // `tests/content/bundled.test.ts`.
    expect(SCHEMA_VERSION).toBeGreaterThanOrEqual(7)
  })

  it('loads a v6 document without inventing art while migrating the writer shape', () => {
    const doc = v6Document()
    const result = importContent(exportContent(doc))

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.source.schemaVersion).toBe(SCHEMA_VERSION)
    // Not merely "it imported": nothing may have acquired an artKey by default.
    for (const piece of result.source.pieces) {
      expect(piece).not.toHaveProperty('artKey')
    }
  })

  it('round-trips artKey on all four content kinds', () => {
    const doc = currentDocument()
    // Each kind is asserted separately because `strictObject` rejects an unknown
    // key per-shape — adding the field to `pieceDef` alone would pass a
    // pieces-only test while every card still refused its own art.
    ;(doc.pieces[0] as Record<string, unknown>).artKey = 'art.king'
    ;(doc.squareTypes[0] as Record<string, unknown>).artKey = 'art.bomb'
    ;(doc.ruleCards[0] as Record<string, unknown>).artKey = 'art.blitz'
    ;(doc.skillCards[0] as Record<string, unknown>).artKey = 'art.teleport'

    const result = importContent(exportContent(doc))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.source).toEqual(doc)
  })

  it('still refuses a document from a future build', () => {
    const doc = structuredClone(sliceContentSource) as ContentSource
    doc.schemaVersion = SCHEMA_VERSION + 1

    const result = importContent(exportContent(doc))
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.errors[0]?.path).toBe('schemaVersion')
  })
})

describe('artKey is not a text key', () => {
  it('textKeysOf ignores artKey', () => {
    const doc = currentDocument()
    ;(doc.pieces[0] as Record<string, unknown>).artKey = 'art.king'

    const loaded = loadContentSet(doc)
    expect(loaded.ok).toBe(true)
    if (!loaded.ok) return

    // An art id is not translatable, so counting it as a text key would make
    // AC-016's coverage check demand a locale entry for a picture and report
    // every art-bearing record as untranslated.
    expect(textKeysOf(loaded.set)).not.toContain('art.king')
  })

  it('artKeysOf collects declared art ids across all four kinds', () => {
    const doc = currentDocument()
    ;(doc.pieces[0] as Record<string, unknown>).artKey = 'art.king'
    ;(doc.squareTypes[0] as Record<string, unknown>).artKey = 'art.bomb'

    const loaded = loadContentSet(doc)
    expect(loaded.ok).toBe(true)
    if (!loaded.ok) return

    const ids = artKeysOf(loaded.set)
    expect(ids).toContain('art.king')
    expect(ids).toContain('art.bomb')
    // Registry coverage is the whole point of this walker, so it must not
    // report an id twice and inflate a "how many are unregistered" count.
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('artKeysOf is empty for a set that declares no art', () => {
    const loaded = loadContentSet(v6Document())
    expect(loaded.ok).toBe(true)
    if (!loaded.ok) return
    expect(artKeysOf(loaded.set)).toEqual([])
  })
})

describe('the art catalogue and the content that points at it', () => {
  const contentIds = () => {
    const src = bundledContentSource as unknown as Record<string, { id: string }[]>
    return ['pieces', 'squareTypes', 'ruleCards', 'skillCards', 'boards'].flatMap((c) => src[c]!.map((r) => r.id))
  }

  it('names pictures, never content — no art id may echo a content id', () => {
    /*
     * `no-content-in-engine.test.ts` scans `src/ui` for bundled content ids and
     * caught the first entry here written as `art.square.bomb`, which contains
     * `square.bomb`. That guard is a substring scan over files, so it will keep
     * working — but it reports a FILE, and by the time 43 entries land the
     * useful message is which ID is wrong. This is that message, and it is the
     * reason the convention (`art.bomb`, one segment, the picture's name) is
     * worth stating twice.
     */
    const offences = [...artRegistry.keys()].flatMap((artId) =>
      contentIds().filter((id) => artId.includes(id)).map((id) => `${artId} echoes content id ${id}`),
    )
    expect(offences).toEqual([])
  })

  it('registers every art id the bundled set actually declares', () => {
    // The resolver falls through to the glyph for an unregistered id, so this
    // can never break a board — which is exactly why it needs a test. A typo'd
    // artKey ships silently as "the art just did not show up".
    const loaded = loadContentSet(bundledContentSource)
    expect(loaded.ok).toBe(true)
    if (!loaded.ok) return

    const unregistered = artKeysOf(loaded.set).filter((id) => !artRegistry.has(id))
    expect(unregistered).toEqual([])
  })

  it('keeps a surplus on every surface an author can point at', () => {
    /*
     * AC-008. The record form builds its picker by filtering this catalogue on
     * `surface`, so "how many pictures can an author choose from" is literally
     * "how many entries of that surface no record has taken". Before this
     * expansion the answer was ZERO on all three — 6 piece / 5 square / 26 card
     * entries against exactly that many records — and a new piece could only
     * steal another piece's picture or fall back to a `?` monogram.
     *
     * The floors are what the expansion committed to leave FREE, which is why
     * this task had to bring art for its own 24 records rather than spending the
     * pool: a surplus that the next feature eats is not a surplus.
     */
    const loaded = loadContentSet(bundledContentSource)
    expect(loaded.ok).toBe(true)
    if (!loaded.ok) return

    const claimed = new Set(artKeysOf(loaded.set))
    const free = { piece: 0, square: 0, card: 0 }
    for (const [id, entry] of artRegistry) {
      if (claimed.has(id)) continue
      free[entry.surface] += 1
    }

    expect(free.piece, `only ${free.piece} unclaimed piece pictures`).toBeGreaterThanOrEqual(20)
    expect(free.square, `only ${free.square} unclaimed square pictures`).toBeGreaterThanOrEqual(10)
    expect(free.card, `only ${free.card} unclaimed card pictures`).toBeGreaterThanOrEqual(30)
  })

  it('uses one segment after `art.` — the schema, not just convention, forbids a content-shaped id', () => {
    // The echo test above only catches ids containing a CURRENT content id.
    // `art.piece.rabbit` embeds none and is still the mirrored form the rule
    // forbids, so the segment count has to be checked on its own — the PLAN
    // claimed the catalogue was enforced and only half of it was.
    for (const id of artRegistry.keys()) {
      expect(id, `${id} must be art.<picture>, one segment`).toMatch(/^art\.[a-z0-9-]+$/)
    }
  })

  it('points each record at art meant for the surface that record renders on', () => {
    /*
     * Nothing else stops a rule card from pointing at a square's art: it would
     * render perfectly on a card face while being legibility-checked only
     * against painted board squares, and pass while being unreadable where it
     * actually appears. The registry carries the surface explicitly and the
     * imported filename prefix mirrors that contract for build-time inspection.
     */
    const expected: Record<string, { prefix: string; surface: 'piece' | 'square' | 'card' }> = {
      pieces: { prefix: 'piece-', surface: 'piece' },
      squareTypes: { prefix: 'square-', surface: 'square' },
      // Rule cards and skill cards render on the same surfaces — a badge, a
      // sheet, a dex tile — so they share one value.
      ruleCards: { prefix: 'card-', surface: 'card' },
      skillCards: { prefix: 'card-', surface: 'card' },
    }
    const src = bundledContentSource as unknown as Record<string, { id: string; artKey?: string }[]>

    const offences: string[] = []
    for (const [collection, { prefix, surface }] of Object.entries(expected)) {
      for (const record of src[collection] ?? []) {
        if (!record.artKey) continue
        const entry = artRegistry.get(record.artKey)
        if (!entry) continue // the unregistered case is the test above
        if (entry.surface !== surface) {
          offences.push(`${record.id} (${collection}) points at a ${entry.surface} asset`)
          continue
        }
        const urls = entry.kind === 'sided' ? [entry.white, entry.black] : [entry.src]
        for (const url of urls) {
          const name = url.split('/').pop() ?? ''
          if (!name.startsWith(prefix)) {
            offences.push(`${record.id} (${collection}) points at ${name}, which is not a \`${prefix}\` asset`)
          }
        }
      }
    }
    expect(offences, offences.join('\n')).toEqual([])
  })

  it('gives every registered entry something that will actually draw', () => {
    // An imported asset that is removed while its registry entry remains keeps
    // an empty value, and `<img src="">` re-fetches the document. Every source
    // must therefore be non-empty and must still be a bundled WebP URL.
    for (const [id, entry] of artRegistry) {
      const urls = entry.kind === 'sided' ? [entry.white, entry.black] : [entry.src]
      for (const url of urls) {
        expect(url, `${id} has an empty asset url`).toBeTruthy()
        expect(url, `${id} does not point at a WebP`).toMatch(/\.webp(?:$|\?)/)
      }
      expect(entry.kind === 'sided' ? entry.surface : entry.surface).toBeTruthy()
    }
  })
})
