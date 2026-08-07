import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * The AI search worker is a bundled chunk, and it is precached (ADR-002).
 *
 * This exists for a failure that is invisible everywhere else. Vite emits a
 * worker chunk only when `new URL()` sits directly inside `new Worker()` with
 * static options; violate that and the build silently switches to fetching the
 * module at runtime. Development works. A served build works. Only the offline
 * case breaks — and it breaks by the AI never answering, which reads as a hung
 * game rather than as a missing file.
 *
 * Asserted over the BUILT output for the same reason `precache.test.ts` is: the
 * source of `spawn.ts` can be perfectly correct while the bundler still decides
 * otherwise, and it is the bundler's decision that ships.
 */

const DIST = join(process.cwd(), 'dist')

function precache(): string[] {
  const sw = join(DIST, 'sw.js')
  expect(existsSync(sw), 'dist/sw.js is missing — run `npm run build` first (npm run verify does)').toBe(true)
  const text = readFileSync(sw, 'utf8')
  const match = text.match(/const PRECACHE = (\[[\s\S]*?\n\])/)
  expect(match, 'could not find the PRECACHE array in dist/sw.js — the worker template changed').toBeTruthy()
  return JSON.parse(match![1]!) as string[]
}

/** Every JS chunk Rollup emitted, by file name. */
function emittedChunks(): string[] {
  const assets = join(DIST, 'assets')
  if (!existsSync(assets)) return []
  return readdirSync(assets).filter((f) => f.endsWith('.js'))
}

describe('the AI search worker survives going offline', () => {
  it('was emitted as its own chunk rather than fetched at runtime', () => {
    const chunks = emittedChunks()
    // The worker chunk carries its entry name, so it is identifiable without
    // pinning a content hash that changes every build.
    const workerChunks = chunks.filter((f) => f.startsWith('worker'))
    expect(
      workerChunks.length,
      `no worker chunk in dist/assets — check that spawn.ts still inlines new URL() inside new Worker(). Chunks: ${chunks.join(', ')}`,
    ).toBeGreaterThan(0)
  })

  it('is in the service worker precache list', () => {
    const listed = precache()
    const workerChunks = emittedChunks().filter((f) => f.startsWith('worker'))
    for (const chunk of workerChunks) {
      expect(listed, `dist/assets/${chunk} is not precached`).toContain(`/assets/${chunk}`)
    }
  })

  it('did not land inside the main chunk instead', () => {
    // If the worker were inlined into the entry, the first test would fail —
    // but so would this, and this one says WHY: the search is ~all of the AI
    // code, and having it in the entry means every player downloads and parses
    // it whether or not they ever start a single-player match.
    const entry = emittedChunks().find((f) => f.startsWith('index'))
    expect(entry).toBeDefined()
    const text = readFileSync(join(DIST, 'assets', entry!), 'utf8')
    expect(text.includes('worker has no content set')).toBe(false)
  })
})
