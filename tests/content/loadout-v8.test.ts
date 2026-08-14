import { describe, expect, it } from 'vitest'
import { type ContentSource, loadContentSet } from '@content/load'
import { SCHEMA_VERSION } from '@content/schema'
import { BUNDLED_PRESET_ID, bundledContentSource } from '@content/sets/bundled'
import { exportContent, importContent } from '@editor/io'
import { createMatch, currentState } from '@engine/match'

/**
 * PLAN Phase 1 — schema v8 `preset.loadout`, honoured at match setup.
 *
 * The exit criterion has four parts and each gets a test here: (a) a v7 document
 * still loads unchanged, (b) a loadout substitutes the replaced piece on ONE side
 * only, (c) that side's draft pool carries its loadout skill card and the other
 * side's does not, (d) `cost` is genuinely retired at the type level.
 *
 * The v7 fixture is built explicitly rather than by reusing the shipped document.
 * The shipped document declares the CURRENT schema version — an invariant
 * `tests/ui/board-render.test.tsx` pins, because an export the app cannot
 * re-import is the failure that matters — so it stops being a v7 artifact the
 * moment the version moves. `v7Document()` strips every v8-only field, which is
 * what makes it a real v7 document and not merely one with an old number on it.
 */

/** A v7 document — the shape every file exported before this feature has. */
function v7Document(): ContentSource {
  const source = structuredClone(bundledContentSource) as ContentSource
  source.schemaVersion = 7
  for (const preset of source.presets as Array<Record<string, unknown>>) {
    delete preset.loadout
    delete preset.loadoutBudget
    delete preset.grading
  }
  return source
}

/** The shipped document with a white-side loadout bolted on. Never mutates the original. */
function withLoadout(): ContentSource {
  const next = structuredClone(bundledContentSource) as ContentSource
  next.schemaVersion = SCHEMA_VERSION

  // A skill card the preset's pool deliberately does NOT list, so "did this card
  // reach a side?" has exactly one possible route: the loadout.
  // It also omits `cost`, which is criterion (d) exercised from real content.
  next.skillCards.push({
    id: 'skill.custom-guard',
    nameKey: 'skill.custom-guard.name',
    textKey: 'skill.custom-guard.text',
    uses: 1,
    royalFollowUp: 'preserve',
    protectRelocatedAfterPlay: false,
    lockRelocatedAfterPlay: false,
    effects: [
      {
        trigger: 'on_play',
        condition: { kind: 'always' },
        actions: [{ kind: 'freeze_piece', target: { kind: 'chosen_enemy' }, plies: 2 }],
      },
    ],
  })

  const preset = next.presets.find((p) => (p as { id: string }).id === BUNDLED_PRESET_ID) as Record<string, unknown>
  preset.loadoutBudget = 100
  preset.loadout = {
    white: { pieceId: 'piece.archer', replaces: 'piece.knight', skillCardId: 'skill.custom-guard' },
  }
  return next
}

function squaresHolding(state: ReturnType<typeof currentState>, pieceId: string, side: 'white' | 'black'): string[] {
  return [...state.board.entries()]
    .filter(([, p]) => p.pieceId === pieceId && p.side === side)
    .map(([square]) => square)
    .sort()
}

describe('PLAN Phase 1 (a) — a v7 document still loads under a v8 build', () => {
  it('loads a v7 document without error', () => {
    const result = loadContentSet(v7Document())
    expect(result.ok, result.ok ? '' : JSON.stringify(result.errors.slice(0, 5), null, 2)).toBe(true)
  })

  it('migrates a v7 document to the current writer shape on import', () => {
    const doc = v7Document()
    const imported = importContent(exportContent(doc))
    expect(imported.ok, imported.ok ? '' : JSON.stringify(imported.errors.slice(0, 5), null, 2)).toBe(true)
    if (!imported.ok) return
    expect(imported.source.schemaVersion).toBe(SCHEMA_VERSION)
    expect(imported.source.skillCards).toEqual(
      doc.skillCards.map((card) => ({ ...(card as object), royalFollowUp: 'preserve', protectRelocatedAfterPlay: false, lockRelocatedAfterPlay: false })),
    )
  })

  it('carries no loadout on a v7 preset — absent, not an empty object', () => {
    const result = loadContentSet(v7Document())
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const preset = result.set.presets.get(BUNDLED_PRESET_ID)!
    expect('loadout' in preset).toBe(false)
    expect('loadoutBudget' in preset).toBe(false)
  })
})

describe('PLAN Phase 1 (b) — the loadout substitutes on one side only', () => {
  const loaded = loadContentSet(withLoadout())

  it('accepts a v8 document carrying a loadout', () => {
    expect(loaded.ok, loaded.ok ? '' : JSON.stringify(loaded.errors.slice(0, 5), null, 2)).toBe(true)
  })

  it('replaces every white knight with the loadout piece, and no black one', () => {
    expect(loaded.ok).toBe(true)
    if (!loaded.ok) return
    const base = currentState(createMatch({ content: loaded.set, presetId: BUNDLED_PRESET_ID, seed: 1 }))

    // The control: where the knights stand in the shipped document.
    const plain = loadContentSet(bundledContentSource)
    expect(plain.ok).toBe(true)
    if (!plain.ok) return
    const control = currentState(createMatch({ content: plain.set, presetId: BUNDLED_PRESET_ID, seed: 1 }))
    const whiteKnightSquares = squaresHolding(control, 'piece.knight', 'white')
    const blackKnightSquares = squaresHolding(control, 'piece.knight', 'black')
    expect(whiteKnightSquares.length).toBeGreaterThan(0)
    expect(blackKnightSquares.length).toBeGreaterThan(0)

    // White's knights are gone, replaced in place; black's are untouched.
    expect(squaresHolding(base, 'piece.knight', 'white')).toEqual([])
    expect(squaresHolding(base, 'piece.archer', 'white')).toEqual(
      [...squaresHolding(control, 'piece.archer', 'white'), ...whiteKnightSquares].sort(),
    )
    expect(squaresHolding(base, 'piece.knight', 'black')).toEqual(blackKnightSquares)
  })

  it('leaves the total piece count unchanged — a substitution, not an addition', () => {
    expect(loaded.ok).toBe(true)
    if (!loaded.ok) return
    const plain = loadContentSet(bundledContentSource)
    if (!plain.ok) return
    const withL = currentState(createMatch({ content: loaded.set, presetId: BUNDLED_PRESET_ID, seed: 1 }))
    const control = currentState(createMatch({ content: plain.set, presetId: BUNDLED_PRESET_ID, seed: 1 }))
    expect(withL.board.size).toBe(control.board.size)
  })
})

describe('PLAN Phase 1 (c) — the draft pool is per side', () => {
  const loaded = loadContentSet(withLoadout())

  it('never offers the loadout skill card to the side that did not bring it', () => {
    expect(loaded.ok).toBe(true)
    if (!loaded.ok) return
    let whiteSawIt = false
    for (let seed = 1; seed <= 200; seed += 1) {
      const state = currentState(createMatch({ content: loaded.set, presetId: BUNDLED_PRESET_ID, seed }))
      expect(state.drafts.black.everOffered, `seed ${seed} offered white's loadout card to black`).not.toContain(
        'skill.custom-guard',
      )
      if (state.drafts.white.everOffered.includes('skill.custom-guard')) whiteSawIt = true
    }
    expect(whiteSawIt, 'the loadout card never reached the side that brought it').toBe(true)
  })
})

describe('PLAN Phase 1 (d) — `cost` is retired at the type level', () => {
  it('loads a rule card and a skill card that omit `cost` entirely', () => {
    const source = structuredClone(bundledContentSource) as ContentSource
    source.schemaVersion = SCHEMA_VERSION
    for (const record of [...source.ruleCards, ...source.skillCards] as Array<Record<string, unknown>>) {
      delete record.cost
    }
    const result = loadContentSet(source)
    expect(result.ok, result.ok ? '' : JSON.stringify(result.errors.slice(0, 5), null, 2)).toBe(true)
  })
})

describe('PLAN Phase 1 — loadout ids are cross-checked like every other reference', () => {
  it('refuses a loadout naming a piece nobody defined, with a located error', () => {
    const source = withLoadout()
    const preset = source.presets.find((p) => (p as { id: string }).id === BUNDLED_PRESET_ID) as Record<string, unknown>
    ;(preset.loadout as Record<string, Record<string, string>>).white!.pieceId = 'piece.nonexistent'

    const result = loadContentSet(source)
    expect(result.ok).toBe(false)
    if (result.ok) return
    const hit = result.errors.find((e) => e.path === `presets.${BUNDLED_PRESET_ID}.loadout.white.pieceId`)
    expect(hit, JSON.stringify(result.errors.slice(0, 5), null, 2)).toBeDefined()
    expect(hit!.message).toContain('piece.nonexistent')
  })

  it('refuses a loadout naming a skill card nobody defined', () => {
    const source = withLoadout()
    const preset = source.presets.find((p) => (p as { id: string }).id === BUNDLED_PRESET_ID) as Record<string, unknown>
    ;(preset.loadout as Record<string, Record<string, string>>).white!.skillCardId = 'skill.nonexistent'

    const result = loadContentSet(source)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.errors.some((e) => e.path === `presets.${BUNDLED_PRESET_ID}.loadout.white.skillCardId`)).toBe(true)
  })
})
