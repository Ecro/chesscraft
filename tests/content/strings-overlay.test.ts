import { describe, expect, it } from 'vitest'
import { loadContentSet } from '@content/load'
import { SCHEMA_VERSION } from '@content/schema'
import { sliceContentSource } from '@content/sets/slice'

/**
 * PLAN Phase 8, ADR-020 — authored content carries its own text.
 *
 * The overlay is the only thing standing between a child typing "토끼" into the
 * editor and the board rendering `piece.rabbit.name`. Content records still
 * store keys only (AC-016 is intact); the text lives beside them, keyed by
 * locale, so it travels with an export and a translator can still own it.
 *
 * The ABSENT case is the load-bearing half, not the present one. Every document
 * in this repo predates the field — `slice.ts` declares schema version 1 and
 * `gate6a.ts` declares 2 — and CLAUDE.md's 2026-06-08 correction is precisely
 * about features that activate on an optional field and silently never fire for
 * the data that predates it. So "loads unchanged with no overlay" is asserted
 * against a real in-tree document, not a fixture written to make it true.
 */

function withStrings(strings: unknown): unknown {
  return { ...structuredClone(sliceContentSource), strings }
}

describe('the content-level strings overlay', () => {
  it('carries an authored overlay through the loader onto the set', () => {
    const result = loadContentSet(
      withStrings({ ko: { 'piece.archer.name': '토끼', 'piece.archer.text': '깡충 뛴다.' } }),
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.set.strings.ko?.['piece.archer.name']).toBe('토끼')
    expect(result.set.strings.ko?.['piece.archer.text']).toBe('깡충 뛴다.')
  })

  it('loads a document that declares no overlay at all, and gives it an empty one', () => {
    // `sliceContentSource` is schema version 1 and has never had a `strings`
    // field. If the loader required one, or crashed reading one, every document
    // written before this phase would stop loading — which is the whole risk.
    expect('strings' in sliceContentSource).toBe(false)
    const result = loadContentSet(structuredClone(sliceContentSource))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.set.strings).toEqual({})
  })

  it('refuses an overlay entry whose value is not text, naming the locale and key', () => {
    const result = loadContentSet(withStrings({ ko: { 'piece.archer.name': 42 } }))
    expect(result.ok).toBe(false)
    if (result.ok) return
    const offending = result.errors.find((e) => e.path === 'strings.ko.piece.archer.name')
    expect(offending, JSON.stringify(result.errors)).toBeDefined()
  })

  it('refuses an empty string, because a blank name renders as a blank square', () => {
    const result = loadContentSet(withStrings({ ko: { 'piece.archer.name': '' } }))
    expect(result.ok).toBe(false)
  })

  it('refuses an overlay key that is not an i18n key', () => {
    // The overlay is keyed by the SAME dotted keys the records carry. A literal
    // as the key would mean the editor derived nothing and wrote free text on
    // both sides, which is the shape AC-016 exists to forbid.
    const result = loadContentSet(withStrings({ ko: { Archer: '토끼' } }))
    expect(result.ok).toBe(false)
  })

  it('refuses an overlay whose top level is not keyed by locale', () => {
    const result = loadContentSet(withStrings({ 'not a locale': { 'piece.archer.name': '토끼' } }))
    expect(result.ok).toBe(false)
  })

  it('refuses an overlay that is not an object', () => {
    const result = loadContentSet(withStrings('토끼'))
    expect(result.ok).toBe(false)
  })

  it('advanced the schema version, so a document carrying an overlay can declare it', () => {
    // `io.ts:44` refuses any document declaring a version this build does not
    // know. Without the bump, an export that carries `strings` and honestly
    // says so would be rejected by the build that wrote it.
    expect(SCHEMA_VERSION).toBeGreaterThanOrEqual(6)
  })
})
