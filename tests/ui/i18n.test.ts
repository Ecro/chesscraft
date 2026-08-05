import { describe, expect, it } from 'vitest'
import { loadSliceContent } from '@content/sets/slice'
import { missingKeys, textKeysOf, translate } from '@ui/i18n'

/**
 * PLAN Phase 4 — the display seam AC-016 needs.
 *
 * Phase 6b owns the breadth of the `ko` bundle; what this phase owns is the
 * mechanism: content carries keys, the UI resolves them, and a key with no
 * translation is VISIBLE rather than blank. A silent empty string would let an
 * untranslated card ship looking like a card with no text.
 */
describe('i18n resolution', () => {
  it('enumerates every player-facing text key the content declares', () => {
    const keys = textKeysOf(loadSliceContent())
    // Names and ability text for each kind, plus board and preset names.
    expect(keys).toContain('piece.archer.name')
    expect(keys).toContain('piece.archer.text')
    expect(keys).toContain('square.beacon.text')
    expect(keys).toContain('rule.beacon-rush.text')
    expect(keys).toContain('skill.warp.text')
    expect(keys).toContain('board.slice.name')
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('resolves every key the slice content uses in the ko bundle', () => {
    expect(missingKeys(loadSliceContent(), 'ko')).toEqual([])
  })

  it('returns real text, not the key, for a translated key', () => {
    const text = translate('square.beacon.text', 'ko')
    expect(text).not.toBe('square.beacon.text')
    expect(text.length).toBeGreaterThan(0)
  })

  it('falls back to the key itself when a translation is missing', () => {
    // Loud, not silent: an untranslated card must look wrong on screen.
    expect(translate('skill.nonexistent.text', 'ko')).toBe('skill.nonexistent.text')
  })
})
