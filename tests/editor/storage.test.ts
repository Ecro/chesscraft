import { describe, expect, it } from 'vitest'
import { STAMP_KEY, STORAGE_KEY, loadStamp, loadStoredContent, saveContent, saveStamp } from '@editor/storage'
import { sliceContentSource } from '@content/sets/slice'
import { importContent } from '@editor/io'

/**
 * Browser-local storage for authored content (PLAN Phase 5 scope).
 *
 * The decision recorded in the PLAN's default-assumptions block is the thing
 * under test here: exceeding the quota REFUSES the save and reports it. A
 * storage layer that swallows the exception loses an author's work with a
 * success-looking UI, which is the one failure mode that cannot be recovered
 * from afterwards.
 *
 * `Storage` is injected rather than read off `window`, so these run in the
 * default node environment and the quota case is reachable at all — a real
 * browser quota cannot be provoked deterministically.
 */

class FakeStorage implements Storage {
  private readonly map = new Map<string, string>()
  /** Bytes accepted before writes start throwing, mimicking a browser quota. */
  constructor(private readonly capacity = Number.POSITIVE_INFINITY) {}

  get length(): number {
    return this.map.size
  }
  key(i: number): string | null {
    return [...this.map.keys()][i] ?? null
  }
  getItem(k: string): string | null {
    return this.map.get(k) ?? null
  }
  setItem(k: string, v: string): void {
    const used = [...this.map.entries()].filter(([mk]) => mk !== k).reduce((n, [, mv]) => n + mv.length, 0)
    if (used + v.length > this.capacity) {
      const err = new Error('quota') as Error & { name: string }
      err.name = 'QuotaExceededError'
      throw err
    }
    this.map.set(k, v)
  }
  removeItem(k: string): void {
    this.map.delete(k)
  }
  clear(): void {
    this.map.clear()
  }
}

describe('browser-local content storage', () => {
  it('round-trips a content source through storage', () => {
    const storage = new FakeStorage()
    const source = structuredClone(sliceContentSource)

    expect(saveContent(storage, source)).toEqual({ ok: true })
    const loaded = loadStoredContent(storage)
    expect(loaded.ok).toBe(true)
    if (!loaded.ok) return
    const migrated = importContent(JSON.stringify(source))
    expect(migrated.ok).toBe(true)
    if (!migrated.ok) return
    expect(loaded.source).toEqual(migrated.source)
  })

  it('reports nothing stored rather than failing, on a first run', () => {
    const loaded = loadStoredContent(new FakeStorage())
    expect(loaded.ok).toBe(false)
    if (loaded.ok) return
    expect(loaded.reason).toBe('absent')
  })

  it('refuses the save and reports quota rather than losing the work', () => {
    const storage = new FakeStorage(64)
    const result = saveContent(storage, structuredClone(sliceContentSource))

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('quota')
    expect(result.message.length).toBeGreaterThan(0)
  })

  it('leaves the previously saved content intact when a later save exceeds quota', () => {
    // The failure this pins: a save that clears the slot before writing loses
    // the last good content on the write that fails.
    const small = { ...structuredClone(sliceContentSource), skillCards: [], presets: [], boards: [] }
    const storage = new FakeStorage(JSON.stringify(small).length + 40)

    expect(saveContent(storage, small)).toEqual({ ok: true })
    expect(saveContent(storage, structuredClone(sliceContentSource)).ok).toBe(false)

    const loaded = loadStoredContent(storage)
    expect(loaded.ok).toBe(true)
    if (!loaded.ok) return
    expect(loaded.source.skillCards).toEqual([])
  })

  it('reports corrupt stored content instead of handing it to the loader', () => {
    const storage = new FakeStorage()
    storage.setItem(STORAGE_KEY, '{ not json')

    const loaded = loadStoredContent(storage)
    expect(loaded.ok).toBe(false)
    if (loaded.ok) return
    expect(loaded.reason).toBe('corrupt')
  })

  it('reports stored content that no longer validates, rather than starting a broken session', () => {
    const storage = new FakeStorage()
    const broken = structuredClone(sliceContentSource) as unknown as { pieces: { movement: unknown }[] }
    broken.pieces[0]!.movement = []
    storage.setItem(STORAGE_KEY, JSON.stringify(broken))

    const loaded = loadStoredContent(storage)
    expect(loaded.ok).toBe(false)
    if (loaded.ok || loaded.reason !== 'invalid') {
      expect.fail(`expected an invalid-content report, got ${JSON.stringify(loaded)}`)
      return
    }
    expect(loaded.errors.length).toBeGreaterThan(0)
  })

  it('reports an unavailable storage (private mode) without throwing', () => {
    const denied: Storage = {
      length: 0,
      key: () => null,
      getItem: () => {
        throw new Error('SecurityError')
      },
      setItem: () => {
        throw new Error('SecurityError')
      },
      removeItem: () => {},
      clear: () => {},
    }
    const saved = saveContent(denied, structuredClone(sliceContentSource))
    expect(saved.ok).toBe(false)
    if (saved.ok) return
    expect(saved.reason).toBe('unavailable')

    const loaded = loadStoredContent(denied)
    expect(loaded.ok).toBe(false)
    if (loaded.ok) return
    expect(loaded.reason).toBe('unavailable')
  })
})

/**
 * The bundle stamp (PLAN-bundled-content-merge ADR-002, ADR-003).
 *
 * A SECOND key beside the content, holding which bundled ids existed when the
 * author last saved. It is deliberately not a field on the document: the read
 * path goes through `importContent`, which rebuilds the source field by field,
 * so an extra top-level field is silently dropped on the very next read.
 *
 * Everything here is a variation on one invariant — **the stamp may lag the
 * content, never lead it.** A lagging stamp is self-healing (the affected id is
 * ADR-001 row 5, so the saved record, already the newer copy, is kept, and the
 * next successful save re-synchronises). A LEADING stamp makes a record the
 * author can see look like one they deleted, and it disappears. So every failure
 * mode here — corrupt, absent, denied, quota — must resolve toward "no stamp",
 * never toward "a stamp we guessed at".
 */
describe('the bundle stamp', () => {
  it('round-trips through its own key, leaving the content key alone', () => {
    const storage = new FakeStorage()
    saveContent(storage, structuredClone(sliceContentSource))
    const before = storage.getItem(STORAGE_KEY)

    saveStamp(storage, { ids: ['piece.king', 'preset.classic'] })
    expect(loadStamp(storage)).toEqual({ ids: ['piece.king', 'preset.classic'] })
    expect(STAMP_KEY).not.toBe(STORAGE_KEY)
    expect(storage.getItem(STORAGE_KEY)).toBe(before)
  })

  it('reads as absent on a first run', () => {
    expect(loadStamp(new FakeStorage())).toBeNull()
  })

  it('reads a corrupt stamp as absent rather than throwing', () => {
    const storage = new FakeStorage()
    storage.setItem(STAMP_KEY, '{ not json')
    expect(loadStamp(storage)).toBeNull()
  })

  it.each([
    ['an array', '[]'],
    ['a bare string', '"piece.king"'],
    ['null', 'null'],
    ['no ids field', '{}'],
    ['ids that is not an array', '{"ids":"piece.king"}'],
    ['ids holding non-strings', '{"ids":["piece.king",7]}'],
  ])('reads a stamp shaped like %s as absent', (_label, json) => {
    // Absent, not "partially usable". A stamp read too permissively is a stamp
    // that can lead the content, which is the one direction that loses records.
    const storage = new FakeStorage()
    storage.setItem(STAMP_KEY, json)
    expect(loadStamp(storage)).toBeNull()
  })

  it('reads as absent when the browser denies storage, rather than throwing', () => {
    const denied: Storage = {
      length: 0,
      key: () => null,
      getItem: () => {
        throw new Error('SecurityError')
      },
      setItem: () => {
        throw new Error('SecurityError')
      },
      removeItem: () => {},
      clear: () => {},
    }
    expect(loadStamp(denied)).toBeNull()
    // And the write is not allowed to take the app down with it: the stamp is a
    // nicety, the content save it accompanies is not.
    expect(() => saveStamp(denied, { ids: ['piece.king'] })).not.toThrow()
  })

  it('swallows a quota failure on the stamp write, keeping the previous stamp', () => {
    const stamp = { ids: ['piece.king'] }
    const storage = new FakeStorage(JSON.stringify(stamp).length + 20)
    saveStamp(storage, stamp)
    expect(loadStamp(storage)).toEqual(stamp)

    expect(() => saveStamp(storage, { ids: Array.from({ length: 200 }, (_, i) => `piece.p${i}`) })).not.toThrow()
    expect(loadStamp(storage)).toEqual(stamp)
  })
})
