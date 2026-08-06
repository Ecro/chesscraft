import { describe, expect, it } from 'vitest'
import { loadContentSet } from '@content/load'
import { sliceContentSource } from '@content/sets/slice'
import { makeTranslate, missingKeys } from '@ui/i18n'

/**
 * PLAN Phase 8, ADR-020 — `translate` consults the content overlay first, then
 * the built-in bundle, then falls back to the key.
 *
 * The precedence is asserted with a key the BUNDLE ALSO RESOLVES. An overlay
 * entry for a key nothing else knows would pass against an implementation that
 * checked the bundle first and the overlay second, so the only assertion that
 * pins the order is one where the two disagree.
 */

const load = (src: unknown) => {
  const r = loadContentSet(src)
  if (!r.ok) throw new Error(`content must load: ${JSON.stringify(r.errors)}`)
  return r.set
}

describe('overlay-aware resolution', () => {
  it('prefers the content overlay over the built-in bundle', () => {
    const bundleOnly = makeTranslate()
    expect(bundleOnly('piece.archer.name')).toBe('궁수')

    const t = makeTranslate({ ko: { 'piece.archer.name': '토끼' } })
    expect(t('piece.archer.name')).toBe('토끼')
  })

  it('falls back to the bundle for a key the overlay does not carry', () => {
    const t = makeTranslate({ ko: { 'piece.archer.name': '토끼' } })
    expect(t('piece.king.name')).toBe('왕')
    expect(t('ui.app.title')).toBe(makeTranslate()('ui.app.title'))
  })

  it('still echoes a key nothing resolves, loudly', () => {
    const t = makeTranslate({ ko: { 'piece.archer.name': '토끼' } })
    expect(t('skill.nonexistent.text')).toBe('skill.nonexistent.text')
  })

  it('does not let another locale leak into the active one', () => {
    const t = makeTranslate({ en: { 'piece.archer.name': 'Rabbit' } }, 'ko')
    expect(t('piece.archer.name')).toBe('궁수')
  })

  it('behaves exactly as the bundle-only path when there is no overlay', () => {
    // ADR-020's absent-case rule, at the resolution boundary rather than the
    // loader's: an undefined overlay must not change a single answer.
    const before = makeTranslate()
    const after = makeTranslate(undefined)
    for (const key of ['piece.king.name', 'ui.app.title', 'nothing.resolves.this']) {
      expect(after(key)).toBe(before(key))
    }
  })
})

describe('missingKeys accounts for the overlay', () => {
  it('counts a key the overlay supplies as present, not missing', () => {
    // A set whose text lives entirely in its own overlay is fully translated.
    // Reporting those keys as missing would make AC-016's own check fire on
    // exactly the content this phase exists to make possible.
    const source = structuredClone(sliceContentSource) as unknown as Record<string, unknown>
    source.pieces = [
      ...(source.pieces as unknown[]),
      {
        id: 'piece.rabbit',
        nameKey: 'piece.rabbit.name',
        textKey: 'piece.rabbit.text',
        movement: [{ kind: 'step', vectors: [[0, 1]] }],
        effects: [],
      },
    ]

    const withoutOverlay = load(structuredClone(source))
    expect(missingKeys(withoutOverlay)).toEqual(
      expect.arrayContaining(['piece.rabbit.name', 'piece.rabbit.text']),
    )

    source.strings = { ko: { 'piece.rabbit.name': '토끼', 'piece.rabbit.text': '깡충 뛴다.' } }
    const withOverlay = load(source)
    expect(missingKeys(withOverlay)).toEqual([])
  })
})
