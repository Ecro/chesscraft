import { describe, expect, it } from 'vitest'
import { STORAGE_KEY, loadStoredContent, saveContent } from '@editor/storage'
import { sliceContentSource } from '@content/sets/slice'

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
    expect(loaded.source).toEqual(source)
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
