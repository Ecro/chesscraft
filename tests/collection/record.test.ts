/**
 * The collection store (SPEC AC-005, AC-007).
 *
 * `Storage` is a parameter here for the same reason `src/editor/hidden.ts` and
 * `src/ui/settings.ts` make it one: it is what puts the refusing-browser path
 * inside a test rather than inside a browser nobody has.
 *
 * The failure direction under test is "resolves to an empty collection, never
 * throws, never removes". That direction is the safe one — the worst outcome of
 * a bad read is a shelf a child has to re-fill by playing, and the other
 * direction would erase a record of play that cannot be recovered.
 */
import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import {
  COLLECTION_KEY,
  type Collection,
  emptyCollection,
  loadCollection,
  mergeUp,
  rankOf,
  saveCollection,
  tierOf,
} from '../../src/collection/record'

/** A `Storage` backed by a Map, so a test can inspect what was written. */
function memoryStorage(seed: Record<string, string> = {}): Storage & { map: Map<string, string> } {
  const map = new Map(Object.entries(seed))
  return {
    map,
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

/** A `Storage` that refuses every operation, the way a denied browser does. */
function refusingStorage(name = 'QuotaExceededError'): Storage {
  const boom = () => {
    const e = new Error('denied')
    e.name = name
    throw e
  }
  return {
    length: 0,
    clear: boom,
    getItem: boom,
    key: boom,
    removeItem: boom,
    setItem: boom,
  } as unknown as Storage
}

const stored = (c: Collection): string => JSON.stringify({ seen: [...c.seen].sort(), used: [...c.used].sort(), won: [...c.won].sort() })

describe('loadCollection', () => {
  it('reads back what saveCollection wrote', () => {
    const s = memoryStorage()
    const c = mergeUp(emptyCollection(), { seen: new Set(['piece.a']), used: new Set(['card.b']), won: new Set(['card.b']) })
    saveCollection(s, c)
    const back = loadCollection(s)
    expect(stored(back)).toBe(stored(c))
  })

  it('resolves an absent key to an empty collection', () => {
    expect(tierOf(loadCollection(memoryStorage()), 'piece.a')).toBe('unencountered')
  })

  it('resolves unparseable JSON to an empty collection', () => {
    const s = memoryStorage({ [COLLECTION_KEY]: '{not json' })
    expect(tierOf(loadCollection(s), 'piece.a')).toBe('unencountered')
  })

  it('resolves a wrong-shaped payload to an empty collection', () => {
    for (const raw of ['[]', '"seen"', 'null', '3', '{"seen":"piece.a"}']) {
      const s = memoryStorage({ [COLLECTION_KEY]: raw })
      expect(tierOf(loadCollection(s), 'piece.a'), raw).toBe('unencountered')
    }
  })

  it('resolves a refusing storage to an empty collection rather than throwing', () => {
    expect(() => loadCollection(refusingStorage())).not.toThrow()
    expect(tierOf(loadCollection(refusingStorage()), 'piece.a')).toBe('unencountered')
  })

  it('filters one bad entry instead of discarding the good ones', () => {
    // The same choice `loadHidden` makes: a list with one bad entry reads as a
    // version skew far more often than as a corrupt file, and throwing the good
    // entries away would erase play the child actually did.
    const s = memoryStorage({ [COLLECTION_KEY]: JSON.stringify({ seen: ['piece.a', 3, '', null, 'piece.b'], used: [], won: [] }) })
    const c = loadCollection(s)
    expect(tierOf(c, 'piece.a')).toBe('seen')
    expect(tierOf(c, 'piece.b')).toBe('seen')
  })

  it('promotes an id listed in a higher tier even when the lower tiers omit it', () => {
    // A hand-edited or older payload may list `won` without `seen`. The ladder
    // is an ordering, so the highest listed tier decides.
    const s = memoryStorage({ [COLLECTION_KEY]: JSON.stringify({ seen: [], used: [], won: ['card.a'] }) })
    expect(tierOf(loadCollection(s), 'card.a')).toBe('won')
  })
})

describe('saveCollection', () => {
  it('never throws on a refusing storage', () => {
    expect(() => saveCollection(refusingStorage(), emptyCollection())).not.toThrow()
    expect(() => saveCollection(refusingStorage('NS_ERROR_DOM_QUOTA_REACHED'), emptyCollection())).not.toThrow()
  })

  it('writes under its own key and touches no other', () => {
    const s = memoryStorage({ 'chess-craft.content.v1': 'untouched', 'chess-craft.settings.v1': 'untouched' })
    saveCollection(s, mergeUp(emptyCollection(), { seen: new Set(['piece.a']), used: new Set(), won: new Set() }))
    expect(s.map.get('chess-craft.content.v1')).toBe('untouched')
    expect(s.map.get('chess-craft.settings.v1')).toBe('untouched')
    expect(s.map.has(COLLECTION_KEY)).toBe(true)
  })
})

describe('mergeUp', () => {
  it('raises a tier', () => {
    const a = mergeUp(emptyCollection(), { seen: new Set(['p']), used: new Set(), won: new Set() })
    const b = mergeUp(a, { seen: new Set(), used: new Set(['p']), won: new Set() })
    expect(tierOf(b, 'p')).toBe('used')
  })

  it('never lowers a tier', () => {
    const a = mergeUp(emptyCollection(), { seen: new Set(), used: new Set(), won: new Set(['p']) })
    const b = mergeUp(a, { seen: new Set(['p']), used: new Set(['p']), won: new Set() })
    expect(tierOf(b, 'p')).toBe('won')
  })

  it('entry state never regresses across any operation sequence', () => {
    // AC-005. The relation constrains every pair of consecutive observations,
    // not any particular stored value, so an implementation cannot satisfy it by
    // choosing what to store.
    const idArb = fc.constantFrom('piece.a', 'card.b', 'square.c')
    const obsArb = fc.record({
      seen: fc.array(idArb).map((xs) => new Set(xs)),
      used: fc.array(idArb).map((xs) => new Set(xs)),
      won: fc.array(idArb).map((xs) => new Set(xs)),
    })
    fc.assert(
      fc.property(fc.array(obsArb, { minLength: 1, maxLength: 12 }), (steps) => {
        const s = memoryStorage()
        let c = loadCollection(s)
        let previous = new Map<string, number>()
        for (const step of steps) {
          c = mergeUp(c, step)
          saveCollection(s, c)
          // A reload in the middle of the sequence must not lose a tier either.
          c = loadCollection(s)
          for (const id of ['piece.a', 'card.b', 'square.c']) {
            const now = rankOf(tierOf(c, id))
            expect(now).toBeGreaterThanOrEqual(previous.get(id) ?? 0)
            previous.set(id, now)
          }
        }
      }),
      { numRuns: 60 },
    )
  })

  it('a refusing storage never surfaces and never blocks', () => {
    // AC-007's store half: the caller gets a usable collection back and no throw
    // escapes, so a match can end on a browser that denies storage.
    const s = refusingStorage()
    let c = loadCollection(s)
    expect(() => {
      c = mergeUp(c, { seen: new Set(['piece.a']), used: new Set(), won: new Set() })
      saveCollection(s, c)
    }).not.toThrow()
    expect(tierOf(c, 'piece.a')).toBe('seen')
  })
})

describe('rankOf', () => {
  it('orders the ladder unencountered < seen < used < won', () => {
    expect(rankOf('unencountered')).toBeLessThan(rankOf('seen'))
    expect(rankOf('seen')).toBeLessThan(rankOf('used'))
    expect(rankOf('used')).toBeLessThan(rankOf('won'))
  })
})
