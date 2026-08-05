import { describe, expect, it } from 'vitest'
import { createMatch, currentState } from '@engine/match'
import { deserializeState, legalActions, serializeState } from '@engine/engine'
import { referenceContent } from '../helpers/content'
import { startedState } from '../helpers/match'

const content = referenceContent()

/** AC-001 — the match starts from the Los Alamos 6x6 base position. */
describe('AC-001 initial position', () => {
  const state = currentState(createMatch({ content, presetId: 'preset.default', seed: 1 }))

  it('is a 6x6 board holding exactly 24 pieces', () => {
    expect(state.width).toBe(6)
    expect(state.height).toBe(6)
    expect(state.board.size).toBe(24)
  })

  it('gives each side 1 king, 1 queen, 2 rooks, 2 knights and 6 pawns, and no bishops', () => {
    for (const side of ['white', 'black'] as const) {
      const mine = [...state.board.values()].filter((p) => p.side === side)
      expect(mine).toHaveLength(12)
      const count = (pieceId: string) => mine.filter((p) => p.pieceId === pieceId).length
      expect(count('piece.king')).toBe(1)
      expect(count('piece.queen')).toBe(1)
      expect(count('piece.rook')).toBe(2)
      expect(count('piece.knight')).toBe(2)
      expect(count('piece.pawn')).toBe(6)
      expect(mine.some((p) => p.pieceId.includes('bishop'))).toBe(false)
    }
  })

  it('offers no castling, no pawn double-step and no en passant', () => {
    // Board actions only unblock once both opening drafts are picked (AC-005).
    const playable = startedState(content)
    const pawnMoves = legalActions(playable, content).filter(
      (a) => a.kind === 'move' && playable.board.get(a.from)?.pieceId === 'piece.pawn',
    )
    expect(pawnMoves.length).toBeGreaterThan(0)
    for (const m of pawnMoves) {
      if (m.kind !== 'move') continue
      expect(Math.abs(Number(m.to[1]) - Number(m.from[1]))).toBe(1)
    }
    // The vocabulary has no castling or en-passant action at all.
    expect(legalActions(playable, content).every((a) => a.kind === 'move' || a.kind === 'play_card')).toBe(true)
  })
})

/** AC-013 (serialization half) — a round-tripped state generates identical actions. */
describe('state serialization round-trip', () => {
  it('preserves the legal-action set exactly', () => {
    const state = currentState(createMatch({ content, presetId: 'preset.default', seed: 7 }))
    const revived = deserializeState(serializeState(state))
    expect(JSON.stringify(legalActions(revived, content))).toBe(JSON.stringify(legalActions(state, content)))
  })
})
