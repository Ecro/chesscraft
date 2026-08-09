import { describe, expect, it } from 'vitest'
import { HIDDEN_KEY, loadHidden, saveHidden } from '@editor/hidden'
import { STAMP_KEY, STORAGE_KEY, clearStoredContent } from '@editor/storage'

/**
 * PLAN-content-provenance-and-room-delete Phase 3 / ADR-006 — the hidden set
 * lives under its own storage key.
 *
 * **The absent-key test comes first, and that ordering is the point.** No
 * install on earth has this key today, so "absent" is not an edge case here —
 * it is the state of every device. The repo's own record of this mistake is at
 * count:6 (`[fail:test] test-setup-hides-the-failure-path`), and its most
 * recent instance was precisely a storage-key test that sat inside a describe
 * block which SEEDED the key it was meant to prove absent.
 *
 * Every failure resolves to "nothing hidden", which is the safe direction: the
 * worst outcome is showing a record the author had tucked away, and the
 * alternative direction would make content disappear on a bad read.
 */

/** A `Storage` with no browser attached. */
function fakeStorage(seed: Record<string, string> = {}): Storage {
  const map = new Map(Object.entries(seed))
  return {
    get length() {
      return map.size
    },
    clear: () => map.clear(),
    getItem: (k: string) => map.get(k) ?? null,
    key: (i: number) => [...map.keys()][i] ?? null,
    removeItem: (k: string) => void map.delete(k),
    setItem: (k: string, v: string) => void map.set(k, v),
  }
}

/** A `Storage` that refuses — private mode, blocked third-party context. */
function hostileStorage(mode: 'read' | 'write' | 'both'): Storage {
  const inner = fakeStorage()
  return {
    ...inner,
    getItem: (k: string) => {
      if (mode === 'read' || mode === 'both') throw new DOMException('denied')
      return inner.getItem(k)
    },
    setItem: (k: string, v: string) => {
      if (mode === 'write' || mode === 'both') throw new DOMException('denied')
      inner.setItem(k, v)
    },
  } as Storage
}

describe('loadHidden', () => {
  it('THE ABSENT KEY: returns an empty set and writes nothing', () => {
    const storage = fakeStorage()
    expect([...loadHidden(storage)]).toEqual([])
    // Not merely empty — nothing was PERSISTED. A load that writes a default
    // turns the first render into a save, and on this key that would stamp
    // "nothing is hidden" over a state nobody chose.
    expect(storage.length).toBe(0)
  })

  it('reads back what was saved', () => {
    const storage = fakeStorage()
    saveHidden(storage, new Set(['preset.default', 'piece.king']))
    expect([...loadHidden(storage)].sort()).toEqual(['piece.king', 'preset.default'])
  })

  it('resolves corrupt JSON to nothing hidden', () => {
    expect([...loadHidden(fakeStorage({ [HIDDEN_KEY]: '{not json' }))]).toEqual([])
  })

  it('resolves a wrong SHAPE to nothing hidden', () => {
    // Each of these validates as JSON and is not a hidden set. A cast would
    // accept all four and hand a non-iterable to the filter.
    for (const raw of ['null', '[]', '{"ids":"preset.default"}', '{"ids":[1,2]}', '"preset.default"']) {
      expect([...loadHidden(fakeStorage({ [HIDDEN_KEY]: raw }))], raw).toEqual([])
    }
  })

  it('keeps the string entries of a partly-wrong list rather than the whole list', () => {
    // Stated so the choice is deliberate: a list with one bad entry is more
    // likely a version skew than a corrupt file, and dropping the good entries
    // un-hides records the author hid.
    expect([...loadHidden(fakeStorage({ [HIDDEN_KEY]: '{"ids":["piece.king",7,""]}' }))]).toEqual([
      'piece.king',
    ])
  })

  it('resolves a storage that throws on read to nothing hidden', () => {
    expect([...loadHidden(hostileStorage('read'))]).toEqual([])
  })
})

describe('saveHidden', () => {
  it('never throws when storage refuses', () => {
    // The content is already stored by the time this runs; losing a hidden-set
    // write costs the author one un-hidden record, and throwing here would
    // crash a save that had just succeeded.
    expect(() => saveHidden(hostileStorage('write'), new Set(['piece.king']))).not.toThrow()
  })

  it('writes a stable, sorted shape so two equal sets produce one string', () => {
    const a = fakeStorage()
    const b = fakeStorage()
    saveHidden(a, new Set(['piece.king', 'preset.default']))
    saveHidden(b, new Set(['preset.default', 'piece.king']))
    expect(a.getItem(HIDDEN_KEY)).toBe(b.getItem(HIDDEN_KEY))
  })
})

describe('clearStoredContent drops the hidden set too (ADR-006)', () => {
  it('leaves storage in the state a browser that has never been here is in', () => {
    // The consequence ADR-006 names: a reset that cleared the document and the
    // stamp but left this key would hand the child a "fresh" catalogue with
    // some of the shipped rooms still tucked away, and no way to tell why.
    const storage = fakeStorage({
      [STORAGE_KEY]: '{"schemaVersion":10}',
      [STAMP_KEY]: '{"ids":["piece.king"]}',
      [HIDDEN_KEY]: '{"ids":["preset.default"]}',
    })
    clearStoredContent(storage)
    expect(storage.getItem(STORAGE_KEY)).toBeNull()
    expect(storage.getItem(STAMP_KEY)).toBeNull()
    expect(storage.getItem(HIDDEN_KEY)).toBeNull()
    expect([...loadHidden(storage)]).toEqual([])
  })

  it('clears the later keys even when an earlier one throws', () => {
    // Separate `try` per key, for the same reason `storage.ts` already gives:
    // a failure on the first key must not skip the rest, or the reset leaves
    // exactly the inconsistent state it exists to escape.
    const inner = fakeStorage({ [STAMP_KEY]: 'x', [HIDDEN_KEY]: '{"ids":["preset.default"]}' })
    let first = true
    const flaky = {
      ...inner,
      removeItem: (k: string) => {
        if (first) {
          first = false
          throw new DOMException('denied')
        }
        inner.removeItem(k)
      },
    } as Storage
    clearStoredContent(flaky)
    expect(flaky.getItem(HIDDEN_KEY)).toBeNull()
  })
})
