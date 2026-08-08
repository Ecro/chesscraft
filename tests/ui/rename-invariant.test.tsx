// @vitest-environment jsdom
/**
 * AC-008 / ADR-005 — keys are derived, and a key that was never derived is left alone.
 *
 * PLAN Phase 7 deleted the two raw KEY fields, so every key a child can produce is
 * `<their id>.name`. That is the easy half. The hazard is the other half: a
 * derivation that fires unconditionally re-homes a record whose keys sit in a
 * namespace unrelated to its id — and this repo has already had exactly that bug
 * once, in the rename repair (`[fail:design] fix-scoped-to-the-cited-evidence`,
 * instance (a): "a rename repair re-derived `<id>.name` unconditionally, correct for
 * the derived-key record that motivated it, silently re-homing a record keyed in a
 * foreign namespace").
 *
 * The oracle is an invariant, not a golden value: opening a record and saving it
 * without touching its name or text must leave `nameKey` / `textKey` byte-identical,
 * whatever they were. It holds for any record and cannot be satisfied by reading the
 * implementation.
 *
 * The fixture set contains BOTH shapes on purpose — a record whose keys match its id
 * and one whose keys do not — because a set containing only the first could not fail
 * if the derivation were unconditional.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import React from 'react'
import type { ContentSource } from '@content/load'
import { bundledContentSource } from '@content/sets/bundled'
import { Edit } from '../../src/ui/Edit'

afterEach(cleanup)

type Record_ = Record<string, unknown>

const CASES = [
  ['derived', 'skill.volley.name', 'skill.volley.text'],
  // A foreign namespace: the keys share nothing with the id. This is the instance
  // that can fail, and the reason the case list is not one row long.
  ['foreign', 'legacy.pack.alpha.title', 'legacy.pack.alpha.body'],
] as const

/** Opens `skill.volley` with the given keys, and returns what a save commits. */
function openWithKeys(nameKey: string, textKey: string) {
  const source = structuredClone(bundledContentSource) as unknown as {
    skillCards: Record_[]
    strings?: Record<string, Record<string, string>>
  }
  const card = source.skillCards.find((c) => c.id === 'skill.volley')!
  card.nameKey = nameKey
  card.textKey = textKey
  // The text has to resolve, or the save is refused for a different reason and the
  // invariant is never exercised — a green test that measured nothing.
  source.strings = { ...(source.strings ?? {}) }
  source.strings.ko = { ...(source.strings.ko ?? {}), [nameKey]: '일제사격', [textKey]: '상대 기물 하나를 없앤다.' }

  const committed: { value: ContentSource | null } = { value: null }
  render(
    React.createElement(Edit, {
      source: source as unknown as ContentSource,
      onCommit: (next: ContentSource) => {
        committed.value = next
      },
    }),
  )
  fireEvent.change(screen.getByTestId('editor-kind'), { target: { value: 'skillCard' } })
  fireEvent.click(screen.getByTestId('library-open-skill.volley'))
  return committed
}

describe('AC-008 — no key field renders at all', () => {
  it('offers no way to type a key', () => {
    openWithKeys('skill.volley.name', 'skill.volley.text')
    expect(screen.queryByTestId('editor-nameKey')).toBeNull()
    expect(screen.queryByTestId('editor-textKey')).toBeNull()
  })
})

describe('AC-008 — opening and saving does not move a key', () => {
  it.each(CASES)('a %s-keyed record survives open-and-save unchanged', (_shape, nameKey, textKey) => {
    const committed = openWithKeys(nameKey, textKey)

    // The visible fields resolved the keys, so the form is showing the record's own
    // words rather than a dotted key — the state in which the old bug fired.
    expect((screen.getByTestId('editor-name') as HTMLInputElement).value).toBe('일제사격')

    fireEvent.click(screen.getByTestId('editor-save'))
    expect(screen.queryByTestId('editor-errors')?.textContent ?? '').toBe('')
    expect(committed.value).not.toBeNull()

    const saved = (committed.value!.skillCards as Record_[]).find((c) => c.id === 'skill.volley')!
    expect(saved.nameKey).toBe(nameKey)
    expect(saved.textKey).toBe(textKey)
  })

  it('leaves the words where they were, not copied to a derived key', () => {
    // The other half of the same failure: even if the key survives, a save that
    // ALSO wrote the text at `<id>.name` would strand a duplicate that nothing
    // reaches and that a later rename would resurrect.
    const committed = openWithKeys('legacy.pack.alpha.title', 'legacy.pack.alpha.body')
    fireEvent.click(screen.getByTestId('editor-save'))

    const strings = (committed.value!.strings ?? {}) as Record<string, Record<string, string>>
    expect(strings.ko?.['legacy.pack.alpha.title']).toBe('일제사격')
    expect(strings.ko?.['skill.volley.name']).toBeUndefined()
  })
})
