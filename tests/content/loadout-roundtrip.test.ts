import { describe, expect, it } from 'vitest'
import { type ContentSource, loadContentSet } from '@content/load'
import { SCHEMA_VERSION } from '@content/schema'
import { BUNDLED_PRESET_ID, bundledContentSource } from '@content/sets/bundled'
import { exportContent, importContent } from '@editor/io'
import { playOut } from '@engine/agent'
import { createMatch, currentState } from '@engine/match'
import type { GameState } from '@engine/types'

/**
 * AC-015 for the loadout axis — the criterion PLAN Phase 1 left open.
 *
 * "Survives export → import" was already covered for a document without one.
 * What was never driven is the part the loadout adds: that the imported room
 * PLAYS the same, which is a stronger claim than that the JSON matches. A field
 * the exporter kept and the engine ignored would pass a byte comparison and fail
 * here, and that is the failure this file exists for.
 *
 * The import and concrete legacy-playback assertions intentionally pass before
 * v17 exists. They are preservation invariants paired with the RED normalized-
 * shape assertions below: once migration exists, either dropping data or
 * changing replace-all playback makes these siblings fail.
 */

const OWN_CARD = 'skill.probe-own'

function roomWithLoadout(): ContentSource {
  const source = structuredClone(bundledContentSource) as ContentSource
  source.schemaVersion = 16
  ;(source.skillCards as unknown[]).push({
    id: OWN_CARD,
    nameKey: 'skill.probe-own.name',
    textKey: 'skill.probe-own.text',
    uses: 1,
    royalFollowUp: 'preserve',
    protectRelocatedAfterPlay: false,
    lockRelocatedAfterPlay: false,
    effects: [
      {
        trigger: 'on_play',
        condition: { kind: 'always' },
        actions: [{ kind: 'destroy_piece', target: { kind: 'chosen_enemy' } }],
      },
    ],
  })
  const preset = source.presets.find((p) => (p as { id: string }).id === BUNDLED_PRESET_ID) as Record<string, unknown>
  preset.loadout = { white: { pieceId: 'piece.archer', replaces: 'piece.knight', skillCardId: OWN_CARD } }
  return source
}

/** The board as a comparable string, so a mismatch names the square. */
function boardOf(state: GameState): string {
  return [...state.board.entries()]
    .map(([square, piece]) => `${square}:${piece.side}:${piece.pieceId}`)
    .sort()
    .join(',')
}

describe('schema v16 → v17 loadout migration', () => {
  const original = roomWithLoadout()
  const imported = importContent(exportContent(original))

  it('imports without error', () => {
    expect(imported.ok, imported.ok ? '' : JSON.stringify(imported.errors.slice(0, 5), null, 2)).toBe(true)
  })

  it('writes the current schema with independent axes', () => {
    expect(imported.ok).toBe(true)
    if (!imported.ok) return
    expect(imported.source.schemaVersion).toBe(SCHEMA_VERSION)
    const preset = imported.source.presets.find((entry) => (entry as { id: string }).id === BUNDLED_PRESET_ID) as Record<string, unknown>
    expect((preset.loadout as Record<string, unknown>).white).toEqual({
      piece: { pieceId: 'piece.archer', replaces: 'piece.knight' },
      skillCardId: OWN_CARD,
    })
  })

  it('carries the loadout into the loaded set, not just into the JSON', () => {
    expect(imported.ok).toBe(true)
    if (!imported.ok) return
    const loaded = loadContentSet(imported.source)
    expect(loaded.ok, loaded.ok ? '' : JSON.stringify(loaded.errors.slice(0, 5), null, 2)).toBe(true)
    if (!loaded.ok) return
    const slot = loaded.set.presets.get(BUNDLED_PRESET_ID)?.loadout?.white
    expect(slot).toEqual({ piece: { pieceId: 'piece.archer', replaces: 'piece.knight' }, skillCardId: OWN_CARD })
  })
})

describe('AC-015 — the imported room plays identically under the same seed', () => {
  const before = loadContentSet(roomWithLoadout())
  const roundTripped = importContent(exportContent(roomWithLoadout()))
  if (!before.ok) throw new Error('the fixture must load')
  if (!roundTripped.ok) throw new Error('the fixture must import')
  const after = loadContentSet(roundTripped.source)
  if (!after.ok) throw new Error('the imported fixture must load')

  it('starts from the identical position', () => {
    const a = currentState(createMatch({ content: before.set, presetId: BUNDLED_PRESET_ID, seed: 7 }))
    const b = currentState(createMatch({ content: after.set, presetId: BUNDLED_PRESET_ID, seed: 7 }))
    expect(boardOf(b)).toBe(boardOf(a))
    expect(a.board.get('b1')).toEqual({ pieceId: 'piece.archer', side: 'white' })
    expect(a.board.get('e1')).toEqual({ pieceId: 'piece.archer', side: 'white' })
    expect([...a.board.values()].filter((piece) => piece.side === 'white' && piece.pieceId === 'piece.knight')).toHaveLength(0)
    expect(b.drafts.white.offers).toEqual(a.drafts.white.offers)
    expect(b.drafts.black.offers).toEqual(a.drafts.black.offers)
  })

  it('plays to the identical finish over a spread of seeds', () => {
    // A whole match rather than the opening position: the loadout changes the
    // draft pool as well as the board, and a pool that survived the round trip
    // in shape but not in ORDER would deal differently from ply one while the
    // starting position still matched.
    for (let seed = 1; seed <= 25; seed += 1) {
      const a = playOut(before.set, BUNDLED_PRESET_ID, seed)
      const b = playOut(after.set, BUNDLED_PRESET_ID, seed)
      expect(boardOf(b.state), `seed ${seed} ended on a different board`).toBe(boardOf(a.state))
      expect(b.result, `seed ${seed} ended differently`).toEqual(a.result)
      expect(b.plies, `seed ${seed} ran a different length`).toBe(a.plies)
    }
  })

  it('is not vacuously equal — the loadout really did change the match', () => {
    // The guard that makes the two tests above mean something. If the loadout
    // were ignored by the engine, both arms would equal the plain room and every
    // assertion above would still pass.
    const plain = loadContentSet(bundledContentSource)
    expect(plain.ok).toBe(true)
    if (!plain.ok) return
    const withLoadout = currentState(createMatch({ content: after.set, presetId: BUNDLED_PRESET_ID, seed: 7 }))
    const without = currentState(createMatch({ content: plain.set, presetId: BUNDLED_PRESET_ID, seed: 7 }))
    expect(boardOf(withLoadout)).not.toBe(boardOf(without))
  })
})
