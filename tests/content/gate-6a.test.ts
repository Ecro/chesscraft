import { describe, expect, it } from 'vitest'
import { GATE6A_PRESET_ID, loadGate6aContent } from '@content/sets/gate6a'
import { apply, legalActions } from '@engine/engine'
import { createPosition } from '@engine/match'
import type { Action, GameState, Side } from '@engine/types'

/**
 * PLAN Phase 6a exit criterion (b) — one scenario fixture per gated item.
 *
 * "Plays correctly" is this file passing. Each test drives the item's effect
 * from a constructed position and asserts the resolved board state, because the
 * five items were chosen precisely for the parts of the vocabulary nobody has
 * exercised yet — a card that merely validates proves nothing about them.
 *
 * Ranking and selection: work-docs/RISK-RANKING-variant-chess-6x6-cards.md
 */

interface PositionOpts {
  sideToMove: Side
  ruleCardId?: string | null
  placements: Array<{ square: string; pieceId: string; side: Side }>
  held?: Partial<Record<Side, string[]>>
}

function position(opts: PositionOpts): GameState {
  return createPosition({
    content: loadGate6aContent(),
    presetId: GATE6A_PRESET_ID,
    seed: 42,
    sideToMove: opts.sideToMove,
    ruleCardId: opts.ruleCardId === undefined ? null : opts.ruleCardId,
    placements: opts.placements,
    ...(opts.held ? { held: opts.held } : {}),
  })
}

function move(state: GameState, from: string, to: string): GameState {
  const content = loadGate6aContent()
  const action = legalActions(state, content).find((a) => a.kind === 'move' && a.from === from && a.to === to)
  if (!action) throw new Error(`no legal move ${from}->${to} for ${state.sideToMove} at ply ${state.plyCount}`)
  return apply(state, action, content)
}

function play(state: GameState, cardId: string, targets: string[]): GameState {
  const content = loadGate6aContent()
  const action: Action = { kind: 'play_card', cardId, targets }
  const legal = legalActions(state, content).some(
    (a) => a.kind === 'play_card' && a.cardId === cardId && a.targets.length === targets.length && a.targets.every((t, i) => t === targets[i]),
  )
  if (!legal) throw new Error(`${cardId} on ${targets.join(',')} is not legal`)
  return apply(state, action, content)
}

// ---------------------------------------------------------------------------
// Rank 1 — R2 삼체크. A `win` driven by a counter, not by a board position, and
// the only gated item that needs an engine capability rather than vocabulary.
// ---------------------------------------------------------------------------

describe('rule.three-check', () => {
  /**
   * The rook chases the black king between the d- and e-files. Ply 3 is a
   * deliberate DUD — white moves the archer and gives no check — because
   * without it, an implementation that counted "the mover completed a ply"
   * instead of "the mover delivered check" would satisfy every assertion here.
   */
  function checkSequence(): GameState[] {
    let state = position({
      sideToMove: 'white',
      ruleCardId: 'rule.three-check',
      placements: [
        { square: 'a3', pieceId: 'piece.king', side: 'white' },
        { square: 'a1', pieceId: 'piece.rook', side: 'white' },
        { square: 'f1', pieceId: 'piece.archer', side: 'white' },
        { square: 'd6', pieceId: 'piece.king', side: 'black' },
      ],
    })
    const states = [state]
    for (const [from, to] of [
      ['a1', 'd1'], // 1 — check
      ['d6', 'e6'], // 2
      ['f1', 'f2'], // 3 — white moves, no check
      ['e6', 'd6'], // 4
      ['d1', 'd2'], // 5 — check
      ['d6', 'e6'], // 6
      ['d2', 'e2'], // 7 — check
    ] as const) {
      if (state.result) break
      state = move(state, from, to)
      states.push(state)
    }
    return states
  }

  it('counts a check only when the mover actually gives one', () => {
    const states = checkSequence()
    expect(states[1]!.checkCount.white).toBe(1)
    expect(states[2]!.checkCount.white).toBe(1) // black's reply changes nothing
    // The dud. A per-ply counter would read 2 here.
    expect(states[3]!.checkCount.white).toBe(1)
    expect(states[5]!.checkCount.white).toBe(2)
    // Black never checked anybody.
    expect(states[2]!.checkCount.black).toBe(0)
    expect(states[5]!.checkCount.black).toBe(0)
  })

  it('does not win on the second check', () => {
    const states = checkSequence()
    expect(states[5]!.result).toBeNull()
  })

  it('wins on the third check', () => {
    const states = checkSequence()
    const final = states[states.length - 1]!
    expect(final.checkCount.white).toBe(3)
    expect(final.result).toEqual({ kind: 'win', winner: 'white', reason: 'win_action' })
  })

  it('still counts checks without the card — the card gates only the win', () => {
    // The counter is base engine state; `check_count_at_least` is what the rule
    // card supplies. Separating the two is what stops a future card from
    // needing its own bespoke counter.
    let state = position({
      sideToMove: 'white',
      ruleCardId: null,
      placements: [
        { square: 'a3', pieceId: 'piece.king', side: 'white' },
        { square: 'a1', pieceId: 'piece.rook', side: 'white' },
        { square: 'd6', pieceId: 'piece.king', side: 'black' },
      ],
    })
    state = move(state, 'a1', 'd1')
    expect(state.checkCount.white).toBe(1)
    expect(state.result).toBeNull()
  })

  it('does not count a check against a royal that cannot be captured', () => {
    // Cross-item: the archer's passive blocks capture of its neighbours, so a
    // king standing beside one is not capturable — and therefore not in check.
    // Tested against a control with the archer moved away, so the assertion is
    // about the protection rather than about the position.
    const attacked = (guard: boolean) => {
      const state = position({
        sideToMove: 'white',
        ruleCardId: 'rule.three-check',
        placements: [
          { square: 'a3', pieceId: 'piece.king', side: 'white' },
          { square: 'a1', pieceId: 'piece.rook', side: 'white' },
          { square: 'd6', pieceId: 'piece.king', side: 'black' },
          { square: guard ? 'c6' : 'f5', pieceId: 'piece.archer', side: 'black' },
        ],
      })
      return move(state, 'a1', 'd1').checkCount.white
    }

    expect(attacked(false)).toBe(1)
    expect(attacked(true)).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// Rank 2 — R14 왕의 호위. A rule card reaching into E1 generation, which is only
// possible once an effect with no owner square can bind a piece as its subject.
// ---------------------------------------------------------------------------

describe('rule.royal-bodyguard', () => {
  const guarded: PositionOpts = {
    sideToMove: 'black',
    placements: [
      { square: 'd1', pieceId: 'piece.king', side: 'white' },
      { square: 'd2', pieceId: 'piece.archer', side: 'white' },
      { square: 'd4', pieceId: 'piece.rook', side: 'black' },
      { square: 'a6', pieceId: 'piece.king', side: 'black' },
    ],
  }

  it('is capturable when the rule card is not drawn', () => {
    const state = position({ ...guarded, ruleCardId: null })
    const capture = legalActions(state, loadGate6aContent()).find(
      (a) => a.kind === 'move' && a.from === 'd4' && a.to === 'd2',
    )
    expect(capture).toBeDefined()
  })

  it('protects a piece standing next to its own king', () => {
    const state = position({ ...guarded, ruleCardId: 'rule.royal-bodyguard' })
    const capture = legalActions(state, loadGate6aContent()).find(
      (a) => a.kind === 'move' && a.from === 'd4' && a.to === 'd2',
    )
    expect(capture).toBeUndefined()
  })

  it('protects both sides — it is a public rule, not a gift to one player', () => {
    const state = position({
      sideToMove: 'white',
      ruleCardId: 'rule.royal-bodyguard',
      placements: [
        { square: 'd1', pieceId: 'piece.rook', side: 'white' },
        { square: 'a1', pieceId: 'piece.king', side: 'white' },
        { square: 'd5', pieceId: 'piece.archer', side: 'black' },
        { square: 'd6', pieceId: 'piece.king', side: 'black' },
      ],
    })
    const capture = legalActions(state, loadGate6aContent()).find(
      (a) => a.kind === 'move' && a.from === 'd1' && a.to === 'd5',
    )
    expect(capture).toBeUndefined()
  })

  it('does not protect a piece that is not next to a king', () => {
    const state = position({
      sideToMove: 'black',
      ruleCardId: 'rule.royal-bodyguard',
      placements: [
        { square: 'a1', pieceId: 'piece.king', side: 'white' },
        { square: 'd2', pieceId: 'piece.archer', side: 'white' },
        { square: 'd4', pieceId: 'piece.rook', side: 'black' },
        { square: 'a6', pieceId: 'piece.king', side: 'black' },
      ],
    })
    const capture = legalActions(state, loadGate6aContent()).find(
      (a) => a.kind === 'move' && a.from === 'd4' && a.to === 'd2',
    )
    expect(capture).toBeDefined()
  })
})

// ---------------------------------------------------------------------------
// Rank 3 — S5 부활. Creation of pieces, from state the engine used to discard.
// ---------------------------------------------------------------------------

describe('skill.revive', () => {
  function afterCapture(): GameState {
    const state = position({
      sideToMove: 'black',
      placements: [
        { square: 'd1', pieceId: 'piece.king', side: 'white' },
        { square: 'c4', pieceId: 'piece.pawn', side: 'white' },
        { square: 'c6', pieceId: 'piece.rook', side: 'black' },
        { square: 'a6', pieceId: 'piece.king', side: 'black' },
      ],
      held: { white: ['skill.revive'] },
    })
    return move(state, 'c6', 'c4')
  }

  it('retains a captured piece rather than discarding it', () => {
    const state = afterCapture()
    expect(state.captured.white).toEqual(['piece.pawn'])
    expect(state.captured.black).toEqual([])
  })

  it('brings the captured piece back onto its own back rank', () => {
    const revived = play(afterCapture(), 'skill.revive', [])
    // a1 is the first empty square on white's back rank; d1 holds the king.
    expect(revived.board.get('a1')).toEqual({ pieceId: 'piece.pawn', side: 'white' })
    expect(revived.captured.white).toEqual([])
  })

  it('is not playable with an empty graveyard', () => {
    const state = position({
      sideToMove: 'white',
      placements: [
        { square: 'd1', pieceId: 'piece.king', side: 'white' },
        { square: 'a6', pieceId: 'piece.king', side: 'black' },
      ],
      held: { white: ['skill.revive'] },
    })
    const offered = legalActions(state, loadGate6aContent()).some(
      (a) => a.kind === 'play_card' && a.cardId === 'skill.revive',
    )
    // A card that resolves to nothing must not be offered — a spent turn for
    // no effect is the "declared but inert" failure wearing a different hat.
    expect(offered).toBe(false)
  })

  it('makes the revived piece enter its square like any other arrival', () => {
    // G-6: a piece that appears on a hostile square is subject to it. Without
    // this, revival is the one way onto a bomb square unharmed.
    //
    // f1 is the gate board's bomb square, and every earlier file is occupied,
    // so the revived pawn's only landing square is the one that kills it.
    const state = position({
      sideToMove: 'black',
      placements: [
        { square: 'a1', pieceId: 'piece.archer', side: 'white' },
        { square: 'b1', pieceId: 'piece.archer', side: 'white' },
        { square: 'c1', pieceId: 'piece.archer', side: 'white' },
        { square: 'd1', pieceId: 'piece.king', side: 'white' },
        { square: 'e1', pieceId: 'piece.archer', side: 'white' },
        { square: 'c4', pieceId: 'piece.pawn', side: 'white' },
        { square: 'c6', pieceId: 'piece.rook', side: 'black' },
        { square: 'a6', pieceId: 'piece.king', side: 'black' },
      ],
      held: { white: ['skill.revive'] },
    })
    const captured = move(state, 'c6', 'c4')
    const revived = play(captured, 'skill.revive', [])
    expect(revived.board.has('f1')).toBe(false)
    expect(revived.log.some((l) => l.startsWith('on_enter:square:'))).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Rank 4 — S12 귀환. `own_back_rank` was declared in the schema and ignored by
// the interpreter: a card that validated, drew, played, and did nothing.
// ---------------------------------------------------------------------------

describe('skill.recall', () => {
  it('pulls the chosen piece back to its own back rank', () => {
    const state = position({
      sideToMove: 'white',
      placements: [
        { square: 'd1', pieceId: 'piece.king', side: 'white' },
        { square: 'c4', pieceId: 'piece.archer', side: 'white' },
        { square: 'a6', pieceId: 'piece.king', side: 'black' },
      ],
      held: { white: ['skill.recall'] },
    })
    const after = play(state, 'skill.recall', ['c4'])
    expect(after.board.has('c4')).toBe(false)
    // a1 is the first empty square on white's back rank; d1 holds the king.
    expect(after.board.get('a1')).toEqual({ pieceId: 'piece.archer', side: 'white' })
  })

  it("uses the owner's back rank, not the mover's", () => {
    // Black's back rank is rank 6. A destination that silently meant "rank 1"
    // would put a black piece in white's camp and still look plausible.
    const state = position({
      sideToMove: 'black',
      placements: [
        { square: 'd1', pieceId: 'piece.king', side: 'white' },
        { square: 'c3', pieceId: 'piece.archer', side: 'black' },
        { square: 'a6', pieceId: 'piece.king', side: 'black' },
      ],
      held: { black: ['skill.recall'] },
    })
    const after = play(state, 'skill.recall', ['c3'])
    expect(after.board.get('b6')).toEqual({ pieceId: 'piece.archer', side: 'black' })
  })

  it('is not offered when the back rank is full', () => {
    const files = ['a', 'b', 'c', 'd', 'e', 'f']
    const state = position({
      sideToMove: 'white',
      placements: [
        ...files.map((f) => ({ square: `${f}1`, pieceId: 'piece.archer', side: 'white' as Side })),
        { square: 'c4', pieceId: 'piece.archer', side: 'white' },
        { square: 'a6', pieceId: 'piece.king', side: 'black' },
      ],
      held: { white: ['skill.recall'] },
    })
    const offered = legalActions(state, loadGate6aContent()).some(
      (a) => a.kind === 'play_card' && a.cardId === 'skill.recall',
    )
    expect(offered).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Rank 5 — R1 언덕의 왕. A content-defined win that must LOSE to king capture on
// the same ply (ADR-012).
// ---------------------------------------------------------------------------

describe('rule.king-of-the-hill', () => {
  it('wins when the king reaches a centre square', () => {
    const state = position({
      sideToMove: 'white',
      ruleCardId: 'rule.king-of-the-hill',
      placements: [
        { square: 'c2', pieceId: 'piece.king', side: 'white' },
        { square: 'a6', pieceId: 'piece.king', side: 'black' },
      ],
    })
    const after = move(state, 'c2', 'c3')
    expect(after.result).toEqual({ kind: 'win', winner: 'white', reason: 'win_action' })
  })

  it('does not fire for a king off the hill', () => {
    const state = position({
      sideToMove: 'white',
      ruleCardId: 'rule.king-of-the-hill',
      placements: [
        { square: 'c2', pieceId: 'piece.king', side: 'white' },
        { square: 'a6', pieceId: 'piece.king', side: 'black' },
      ],
    })
    expect(move(state, 'c2', 'b2').result).toBeNull()
  })

  it('loses to a king capture resolved on the same ply', () => {
    // ADR-012: the royal capture short-circuits at E3, so the E7 win action
    // never evaluates. Both wins go to white here — the point is the REASON,
    // which is what a future card awarding the win to the other side turns on.
    const state = position({
      sideToMove: 'white',
      ruleCardId: 'rule.king-of-the-hill',
      placements: [
        { square: 'c3', pieceId: 'piece.king', side: 'white' },
        { square: 'b5', pieceId: 'piece.archer', side: 'white' },
        { square: 'b3', pieceId: 'piece.king', side: 'black' },
      ],
    })
    const after = move(state, 'b5', 'b3')
    expect(after.result).toEqual({ kind: 'win', winner: 'white', reason: 'king_capture' })
  })
})
