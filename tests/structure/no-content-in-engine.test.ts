import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { bundledContentSource } from '@content/sets/bundled'

/**
 * ADR-001's structural half: the engine interprets the vocabulary and names no
 * content.
 *
 * Every other test in the suite checks that content BEHAVES correctly, which a
 * special case in the engine would also satisfy — `if (pieceId === 'piece.king')`
 * passes the king tests and quietly makes the content system a lie. The claim
 * "content is data end to end" is structural, so this is where it is checked.
 *
 * It is also the guard that keeps the editor honest. If the engine may name a
 * piece, then an author who renames that piece in the editor gets content that
 * validates and then behaves differently for reasons no form can show.
 */

const ROOTS = ['src/engine', 'src/ui'] as const

function filesUnder(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry)
    return statSync(path).isDirectory() ? filesUnder(path) : [path]
  })
}

function contentIds(): string[] {
  const source = bundledContentSource as unknown as Record<string, { id: string }[]>
  return ['pieces', 'squareTypes', 'ruleCards', 'skillCards', 'boards'].flatMap((c) =>
    source[c]!.map((r) => r.id),
  )
}

describe('ADR-001 the engine names no content', () => {
  it('mentions no bundled piece, card, square type or board id anywhere in src/engine', () => {
    const ids = contentIds()
    expect(ids.length).toBeGreaterThan(30)

    const offences: string[] = []
    for (const file of filesUnder('src/engine')) {
      const text = readFileSync(file, 'utf8')
      for (const id of ids) if (text.includes(id)) offences.push(`${file} names ${id}`)
    }
    expect(offences).toEqual([])
  })

  it('names no content in the UI either, which renders from the content set', () => {
    // The UI is allowed to know about PRESETS — it has to pick one to start —
    // but not about the pieces, cards or squares inside them.
    const ids = contentIds()
    const offences: string[] = []
    for (const file of filesUnder('src/ui')) {
      const text = readFileSync(file, 'utf8')
      for (const id of ids) if (text.includes(id)) offences.push(`${file} names ${id}`)
    }
    expect(offences).toEqual([])
  })

  it('keeps the engine free of the content module itself, not merely of its ids', () => {
    // A rename would defeat the id scan above; importing the set at all is the
    // structural version of the same mistake.
    for (const file of filesUnder('src/engine')) {
      const text = readFileSync(file, 'utf8')
      expect(text.includes('content/sets'), `${file} imports a concrete content set`).toBe(false)
    }
  })
})

describe('AC-010 the entry point serves the shipped bundle', () => {
  it('loads the bundled set, not a throwaway fixture', () => {
    // The unit half of the guard; `e2e/bundle.spec.ts` holds the half that
    // reads it off the board. Both exist because for two phases the bundle was
    // complete, tested, and reachable by nobody.
    const app = readFileSync('src/ui/App.tsx', 'utf8')
    expect(app).toContain('bundledContentSource')
    expect(app.includes('sets/slice'), 'App.tsx still loads the Phase 3 slice').toBe(false)
  })

  for (const root of ROOTS) {
    it(`has no leftover import of the Phase 3 slice under ${root}`, () => {
      for (const file of filesUnder(root)) {
        expect(readFileSync(file, 'utf8').includes('sets/slice'), `${file} imports the slice`).toBe(false)
      }
    })
  }
})
