import { describe, expect, it } from 'vitest'
import { BUNDLED_PRESET_ID, loadBundledContent } from '@content/sets/bundled'
import { apply, legalActions } from '@engine/engine'
import { createPosition } from '@engine/match'
import type { Action, GameState, Side } from '@engine/types'

/**
 * PLAN Phase 6b — the four capabilities schema v3 adds, driven through the
 * cards that needed them.
 *
 * Phase 6a's card-set specification found the bundled set unreachable by
 * writing content: five cards were blocked on vocabulary that did not exist.
 * These are the gaps that had to close for AC-010's counts to be honest rather
 * than padded, so each is tested through a real shipped card rather than a
 * synthetic fixture — a capability nobody's card uses is not worth having.
 */

function position(opts: {
  sideToMove: Side
  ruleCardId?: string | null
  placements: Array<{ square: string; pieceId: string; side: Side }>
  held?: Partial<Record<Side, string[]>>
  plyCount?: number
}): GameState {
  return createPosition({
    content: loadBundledContent(),
    presetId: BUNDLED_PRESET_ID,
    seed: 9,
    sideToMove: opts.sideToMove,
    ruleCardId: opts.ruleCardId === undefined ? null : opts.ruleCardId,
    placements: opts.placements,
    ...(opts.plyCount !== undefined ? { plyCount: opts.plyCount } : {}),
    ...(opts.held ? { held: opts.held } : {}),
  })
}

function play(state: GameState, cardId: string, targets: string[]): GameState {
  const content = loadBundledContent()
  const action: Action = { kind: 'play_card', cardId, targets }
  const ok = legalActions(state, content).some(
    (a) =>
      a.kind === 'play_card' &&
      a.cardId === cardId &&
      a.targets.length === targets.length &&
      a.targets.every((t, i) => t === targets[i]),
  )
  if (!ok) throw new Error(`${cardId} on [${targets.join(',')}] is not legal`)
  return apply(state, action, content)
}

function movesFrom(state: GameState, square: string): string[] {
  return legalActions(state, loadBundledContent())
    .filter((a) => a.kind === 'move' && a.from === square)
    .map((a) => (a.kind === 'move' ? a.to : ''))
}

function step(state: GameState, from: string, to: string): GameState {
  const content = loadBundledContent()
  const action = legalActions(state, content).find((a) => a.kind === 'move' && a.from === from && a.to === to)
  if (!action) throw new Error(`no legal move ${from}->${to}`)
  return apply(state, action, content)
}

// ---------------------------------------------------------------------------
// G-14 — swap. Two teleports cannot express it: each needs its destination
// empty, and in a swap neither is.
// ---------------------------------------------------------------------------

describe('skill.swap', () => {
  const base = {
    sideToMove: 'white' as Side,
    placements: [
      { square: 'a1', pieceId: 'piece.king', side: 'white' as Side },
      { square: 'b2', pieceId: 'piece.pawn', side: 'white' as Side },
      { square: 'c3', pieceId: 'piece.rook', side: 'white' as Side },
      { square: 'f6', pieceId: 'piece.king', side: 'black' as Side },
    ],
    held: { white: ['skill.swap'] },
  }

  it('exchanges two friendly pieces that are both occupied', () => {
    const after = play(position(base), 'skill.swap', ['b2', 'c3'])
    expect(after.board.get('b2')).toEqual({ pieceId: 'piece.rook', side: 'white' })
    expect(after.board.get('c3')).toEqual({ pieceId: 'piece.pawn', side: 'white' })
  })

  it('leaves the piece count untouched — a swap creates and destroys nothing', () => {
    const before = position(base)
    const after = play(before, 'skill.swap', ['b2', 'c3'])
    expect(after.board.size).toBe(before.board.size)
    expect(after.captured.white).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// G-4 — a destination relative to the piece being moved, rather than a literal
// square. Without it every square-type and push effect is board-specific.
// ---------------------------------------------------------------------------

describe('skill.shove', () => {
  it("pushes an enemy piece one square towards its own back rank", () => {
    const state = position({
      sideToMove: 'white',
      placements: [
        { square: 'a1', pieceId: 'piece.king', side: 'white' },
        { square: 'c4', pieceId: 'piece.rook', side: 'black' },
        { square: 'f6', pieceId: 'piece.king', side: 'black' },
      ],
      held: { white: ['skill.shove'] },
    })
    // Black's back rank is rank 6, so "back" for a black piece is upward.
    const after = play(state, 'skill.shove', ['c4'])
    expect(after.board.has('c4')).toBe(false)
    expect(after.board.get('c5')).toEqual({ pieceId: 'piece.rook', side: 'black' })
  })

  it('orients the push by the pushed piece, not by the player', () => {
    // The same card played by black against a white piece must push it the
    // other way. A fixed offset would move both pieces the same direction and
    // still look correct in one of the two tests.
    const state = position({
      sideToMove: 'black',
      placements: [
        { square: 'a1', pieceId: 'piece.king', side: 'white' },
        { square: 'c4', pieceId: 'piece.rook', side: 'white' },
        { square: 'f6', pieceId: 'piece.king', side: 'black' },
      ],
      held: { black: ['skill.shove'] },
    })
    const after = play(state, 'skill.shove', ['c4'])
    expect(after.board.get('c3')).toEqual({ pieceId: 'piece.rook', side: 'white' })
  })

  it('is refused when the square behind is occupied', () => {
    const state = position({
      sideToMove: 'white',
      placements: [
        { square: 'a1', pieceId: 'piece.king', side: 'white' },
        { square: 'c4', pieceId: 'piece.rook', side: 'black' },
        { square: 'c5', pieceId: 'piece.pawn', side: 'black' },
        { square: 'f6', pieceId: 'piece.king', side: 'black' },
      ],
      held: { white: ['skill.shove'] },
    })
    const after = play(state, 'skill.shove', ['c4'])
    // Blocked, so nothing moved — and nothing was destroyed to make room.
    expect(after.board.get('c4')).toEqual({ pieceId: 'piece.rook', side: 'black' })
    expect(after.board.get('c5')).toEqual({ pieceId: 'piece.pawn', side: 'black' })
  })
})

// ---------------------------------------------------------------------------
// G-15 — a movement grant that survives the card that gave it. Three of the
// nine actions were consumed at move-generation only, so a skill card carrying
// one resolved to nothing at all.
// ---------------------------------------------------------------------------

describe('skill.knight-leap', () => {
  function granted(): GameState {
    const state = position({
      sideToMove: 'white',
      placements: [
        { square: 'a1', pieceId: 'piece.king', side: 'white' },
        { square: 'c3', pieceId: 'piece.rook', side: 'white' },
        { square: 'f6', pieceId: 'piece.king', side: 'black' },
      ],
      held: { white: ['skill.knight-leap'] },
    })
    return play(state, 'skill.knight-leap', ['c3'])
  }

  it('reaches the player on the turn the card was played (ADR-002)', () => {
    // It used to reach them only on the NEXT turn, because a card consumed its
    // own. Since ADR-001 the turn continues, and since ADR-002 the whole turn is
    // one ply — so the grant is live for the move the player makes next. A grant
    // that expired before it could be used is the no-op G-15 names, and "the
    // player has to wait a full turn to use what they paid a card for" was the
    // milder version of the same complaint.
    expect(movesFrom(granted(), 'c3')).toContain('d5')
  })

  it('does not grant the move to a piece that was not chosen', () => {
    expect(movesFrom(granted(), 'a1')).not.toContain('b3')
  })

  it('expires while the granted piece stays exactly where it was', () => {
    // The granted piece must NOT move: a grant store keyed by square would be
    // orphaned the moment the rook left c3, and this test would then pass with
    // no expiry logic implemented at all. Plies are burned with the king so the
    // only thing that changes is the clock.
    let state = granted() // white, card played, still to move — ply 0
    expect(movesFrom(state, 'c3'), 'grant should be live on the turn it was bought').toContain('d5')

    state = step(state, 'a1', 'a2') // white closes its turn, rook untouched — ply 1
    state = step(state, 'f6', 'f5') // black — ply 2
    expect(movesFrom(state, 'c3'), 'grant should still be live here').toContain('d5')

    state = step(state, 'a2', 'a1') // white burns a ply — ply 3
    state = step(state, 'f5', 'f6') // black burns a ply — ply 4
    expect(state.board.get('c3')).toEqual({ pieceId: 'piece.rook', side: 'white' })
    expect(movesFrom(state, 'c3')).not.toContain('d5')
  })
})

// ---------------------------------------------------------------------------
// G-13 — a condition over how much material a side has left. Every comeback
// rule in the research drafts needed it.
// ---------------------------------------------------------------------------

describe('rule.last-stand', () => {
  const king = { square: 'c1', pieceId: 'piece.king', side: 'white' as Side }
  const enemy = { square: 'f6', pieceId: 'piece.king', side: 'black' as Side }

  it('lets the king slide once the side is down to three pieces', () => {
    const state = position({
      sideToMove: 'white',
      ruleCardId: 'rule.last-stand',
      placements: [king, { square: 'a1', pieceId: 'piece.pawn', side: 'white' }, { square: 'b1', pieceId: 'piece.pawn', side: 'white' }, enemy],
    })
    // c4 is three squares away — reachable only with the granted slide.
    expect(movesFrom(state, 'c1')).toContain('c4')
  })

  it('does nothing while the side still has material', () => {
    const state = position({
      sideToMove: 'white',
      ruleCardId: 'rule.last-stand',
      placements: [
        king,
        { square: 'a1', pieceId: 'piece.pawn', side: 'white' },
        { square: 'b1', pieceId: 'piece.pawn', side: 'white' },
        { square: 'd1', pieceId: 'piece.pawn', side: 'white' },
        enemy,
      ],
    })
    expect(movesFrom(state, 'c1')).not.toContain('c4')
  })

  it('counts the bound side alone, not every piece on the board', () => {
    // White is down to three while black still fields six, so the board total
    // is nine. The two readings diverge here in opposite directions: counting
    // the mover fires the grant, counting the board withholds it. The earlier
    // fixtures cannot tell them apart because both totals sit above n=3.
    const state = position({
      sideToMove: 'white',
      ruleCardId: 'rule.last-stand',
      placements: [
        king,
        { square: 'a1', pieceId: 'piece.pawn', side: 'white' },
        { square: 'b1', pieceId: 'piece.pawn', side: 'white' },
        enemy,
        { square: 'e5', pieceId: 'piece.pawn', side: 'black' },
        { square: 'f5', pieceId: 'piece.pawn', side: 'black' },
        { square: 'e4', pieceId: 'piece.pawn', side: 'black' },
        { square: 'f4', pieceId: 'piece.pawn', side: 'black' },
        { square: 'e3', pieceId: 'piece.pawn', side: 'black' },
      ],
    })
    expect(movesFrom(state, 'c1')).toContain('c4')
  })
})
