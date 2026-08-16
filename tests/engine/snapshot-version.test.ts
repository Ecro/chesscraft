import { describe, expect, it } from 'vitest'
import { BUNDLED_PRESET_ID } from '@content/sets/bundled'
import {
  MATCH_SNAPSHOT_VERSION,
  deserializeState,
  serializeState,
} from '@engine/engine'
import { createMatch, currentState } from '@engine/match'
import { shippedContent } from '../helpers/shipped'

describe('versioned match snapshots', () => {
  it('round-trips the current snapshot format with a stable version marker', () => {
    const content = shippedContent()
    const state = currentState(createMatch({ content, presetId: BUNDLED_PRESET_ID, seed: 17 }))
    const json = serializeState(state)
    const raw = JSON.parse(json) as Record<string, unknown>

    expect(raw.snapshotVersion).toBe(MATCH_SNAPSHOT_VERSION)
    expect(serializeState(deserializeState(json))).toBe(json)
  })

  it('migrates a legacy snapshot without recurring-award fields', () => {
    const content = shippedContent()
    const state = currentState(createMatch({ content, presetId: BUNDLED_PRESET_ID, seed: 23 }))
    const raw = JSON.parse(serializeState(state)) as Record<string, unknown>
    delete raw.snapshotVersion
    const drafts = raw.drafts as Record<string, Record<string, unknown>>
    for (const side of ['white', 'black']) {
      drafts[side]!.completedTurns = 9
      delete drafts[side]!.nextSkillTurn
      delete drafts[side]!.awardCount
    }

    const migrated = deserializeState(JSON.stringify(raw))
    expect(migrated.drafts.white.nextSkillTurn).toBe(10)
    expect(migrated.drafts.white.awardCount).toBe(0)
    expect(migrated.drafts.black.nextSkillTurn).toBe(10)
    expect(migrated.drafts.black.awardCount).toBe(0)
    expect(JSON.parse(serializeState(migrated)).snapshotVersion).toBe(MATCH_SNAPSHOT_VERSION)
  })

  it('rejects unsupported versions and malformed board entries', () => {
    const content = shippedContent()
    const state = currentState(createMatch({ content, presetId: BUNDLED_PRESET_ID, seed: 29 }))
    const raw = JSON.parse(serializeState(state)) as Record<string, unknown>

    expect(() => deserializeState(JSON.stringify({ ...raw, snapshotVersion: MATCH_SNAPSHOT_VERSION + 1 }))).toThrow(
      /unsupported match snapshot version/,
    )
    expect(() => deserializeState(JSON.stringify({ ...raw, board: [['a1', { pieceId: 'piece.king', side: 'white' }], ['a1', { pieceId: 'piece.rook', side: 'white' }]] }))).toThrow(
      /invalid match snapshot board entry/,
    )
    expect(() => deserializeState(JSON.stringify({ ...raw, board: [['g1', { pieceId: 'piece.king', side: 'white' }]] }))).toThrow(
      /invalid match snapshot board entry/,
    )
    expect(() => deserializeState(JSON.stringify({ ...raw, width: 0 }))).toThrow(/invalid match snapshot dimensions/)
    expect(() => deserializeState(JSON.stringify({ ...raw, board: [['a1', { pieceId: 'piece.king', side: 'green' }]] }))).toThrow(
      /invalid match snapshot piece/,
    )
  })
})
