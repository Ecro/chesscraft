import { describe, expect, it } from 'vitest'
import { loadBundledContent } from '@content/sets/bundled'
import { apply, legalActions } from '@engine/engine'
import { createPosition } from '@engine/match'
import type { GameState, Side, SquareId } from '@engine/types'

/**
 * Every painted square, driven onto rather than read.
 *
 * `card-liveness.test.ts` surveys the rule and skill cards; the square types had
 * no such survey, and the gap cost exactly what the missing survey always costs.
 * A second-opinion review of PLAN-preset-content-expansion pointed at
 * `square.geyser`, and driving it confirmed the report: a pawn stepping onto b3
 * of `board.cavalry` logs `on_enter:square:square.geyser` and stays standing,
 * because `own_back_rank` resolves through a vacancy lookup that returns null on
 * a full rank — and at the opening every home rank IS full. The trigger fires,
 * the board does not change, and nothing anywhere says so. That is the shape of
 * `[fail:design] declared-but-inert-vocabulary`, and a card-only survey cannot
 * see it.
 *
 * These assert the OUTCOME directly instead of diffing against a control. A
 * square type has no "without the card" position to compare to — the paint is a
 * property of the board — so the honest probe names what the square promises and
 * checks the board for it.
 */

const content = loadBundledContent()

type Place = { square: SquareId; pieceId: string; side: Side }

function drive(presetId: string, placements: Place[], from: SquareId, to: SquareId): GameState {
  const state = createPosition({
    content,
    presetId,
    seed: 1,
    sideToMove: 'white',
    placements,
    ruleCardId: null,
    held: { white: [] },
    captured: { white: [] },
  })
  const move = legalActions(state, content).find((a) => a.kind === 'move' && a.from === from && a.to === to)
  if (!move) throw new Error(`${from}->${to} is not legal on ${presetId} — the fixture is wrong, not the engine`)
  return apply(state, move, content)
}

const K_W: Place = { square: 'a1', pieceId: 'piece.king', side: 'white' }
const K_B: Place = { square: 'f6', pieceId: 'piece.king', side: 'black' }
const at = (square: SquareId, pieceId: string, side: Side = 'white'): Place => ({ square, pieceId, side })

const countIn = (state: GameState, pieceId: string, side: Side): number =>
  [...state.board.values()].filter((p) => p.pieceId === pieceId && p.side === side).length

/**
 * A position with the mover still to move — for `generate_moves` effects, which
 * `drive` cannot show: it applies a move, so the state it returns belongs to the
 * OTHER side and the granted geometry has already gone out of scope.
 */
function standing(presetId: string, placements: Place[]): GameState {
  return createPosition({
    content,
    presetId,
    seed: 1,
    sideToMove: 'white',
    placements,
    ruleCardId: null,
    held: { white: [] },
    captured: { white: [] },
  })
}

/** Every square of white's home rank filled, so `own_back_rank` has no vacancy. */
const FULL_HOME: Place[] = ['a1', 'b1', 'c1', 'd1', 'e1', 'f1'].map((square, i) =>
  at(square as SquareId, i === 0 ? 'piece.king' : 'piece.rook'),
)

describe('the squares that remove a piece', () => {
  it('square.bomb destroys whatever arrives', () => {
    const after = drive('preset.covenant', [K_W, at('c3', 'piece.rook'), K_B], 'c3', 'c4')
    expect(after.board.has('c4'), 'the bomb square is occupied after the step').toBe(false)
    expect(after.board.has('c3')).toBe(false)
  })

  it('square.thorns kills a footman', () => {
    const after = drive('preset.bastion', [K_W, at('c2', 'piece.pawn'), K_B], 'c2', 'c3')
    expect(after.board.has('c3')).toBe(false)
  })

  it('square.thorns leaves anything else standing — the discriminating half', () => {
    // Without this, thorns and bomb are indistinguishable and a thorns that had
    // been mis-authored as "destroy everything" would pass the test above.
    const after = drive('preset.bastion', [K_W, at('c2', 'piece.rook'), K_B], 'c2', 'c3')
    expect(after.board.get('c3')?.pieceId).toBe('piece.rook')
  })
})

describe('the squares that change what a piece may do', () => {
  it('square.mire freezes what arrives', () => {
    const after = drive('preset.cavalry', [K_W, at('c3', 'piece.rook'), K_B], 'c3', 'c4')
    expect(after.board.has('c4')).toBe(true)
    expect(Object.keys(after.frozenUntil), 'nothing was frozen').toContain('c4')
  })

  it('square.mist covers what arrives', () => {
    const after = drive('preset.bastion', [K_W, at('a2', 'piece.rook'), K_B], 'a2', 'a3')
    expect(after.board.has('a3')).toBe(true)
    expect([...after.grants].some((g) => g.kind === 'block_capture'), 'no cover was granted').toBe(true)
  })

  it('square.sanctuary covers its occupant', () => {
    const after = drive('preset.default', [K_W, at('b4', 'piece.rook'), K_B], 'b4', 'a4')
    expect(after.board.has('a4')).toBe(true)
    // Sanctuary works at move generation, so the observable is that the enemy
    // cannot take it rather than a grant on the mover's side.
    const enemyTakes = legalActions({ ...after, sideToMove: 'black' }, content).some(
      (a) => a.kind === 'move' && a.to === 'a4',
    )
    expect(enemyTakes, 'the sanctuary occupant is capturable').toBe(false)
  })
})

describe('the squares that move a piece', () => {
  it('square.portal sends it to the paired square', () => {
    const after = drive('preset.default', [K_W, at('b2', 'piece.rook'), K_B], 'b2', 'b3')
    expect(after.board.has('b3'), 'the piece stayed on the portal').toBe(false)
    expect(after.board.get('e4')?.pieceId).toBe('piece.rook')
  })

  it('square.geyser throws a piece home WHEN the home rank has room', () => {
    const after = drive('preset.cavalry', [K_W, at('b2', 'piece.rook'), K_B], 'b2', 'b3')
    expect(after.board.has('b3'), 'the piece stayed on the geyser').toBe(false)
    const home = ['a1', 'b1', 'c1', 'd1', 'e1', 'f1'].filter((sq) => after.board.get(sq as SquareId)?.pieceId === 'piece.rook')
    expect(home.length, 'the rook is not on the home rank').toBe(1)
  })

  it('square.geyser does NOTHING when the home rank is full — and the text says so', () => {
    /*
     * The branch the second-opinion review found, pinned rather than hidden.
     * This is the OPENING state of every shipped room: all six home squares
     * occupied. `homeRankVacancy` returns null, execution continues, and the
     * piece stands on the geyser.
     *
     * Asserted as CURRENT behaviour on purpose, the same way
     * `card-liveness.test.ts` pins its survey: the day the engine grows a way to
     * refuse an unresolvable destination — or the day the record is re-aimed —
     * this test goes red and the change has to be deliberate. What is NOT
     * acceptable is the state this replaced, where the behaviour existed and
     * nothing, including the card text a player reads, mentioned it.
     */
    const after = drive('preset.cavalry', [...FULL_HOME, at('b2', 'piece.pawn'), K_B], 'b2', 'b3')
    expect(after.board.get('b3')?.pieceId, 'the piece was thrown despite a full home rank').toBe('piece.pawn')
    expect(after.log.some((entry) => entry.includes('square.geyser')), 'the effect did not even fire').toBe(true)
  })
})

describe('the square that promotes', () => {
  it('square.shrine promotes a footman', () => {
    const after = drive('preset.default', [K_W, at('f2', 'piece.pawn'), K_B], 'f2', 'f3')
    expect(after.board.get('f3')?.pieceId).toBe('piece.queen')
  })

  it('square.shrine leaves anything else alone', () => {
    const after = drive('preset.default', [K_W, at('f2', 'piece.rook'), K_B], 'f2', 'f3')
    expect(after.board.get('f3')?.pieceId).toBe('piece.rook')
  })
})

describe('the squares that change what a piece IS or can DO (v12)', () => {
  /** A knight's leap from b4 that a rook has no other way to make. */
  const LEAP_FROM_B4 = ['d5', 'd3', 'c6', 'a6', 'c2', 'a2']

  it('square.springboard lends a knight leap while the piece stands on it', () => {
    // `grant_movement` at `generate_moves`, so the geometry is lent for exactly
    // as long as the occupant is there. No square type used the generation-time
    // actions before this one.
    const state = standing('preset.cavalry', [K_W, at('b4', 'piece.rook'), K_B])
    const leaps = legalActions(state, content).filter(
      (a) => a.kind === 'move' && a.from === 'b4' && LEAP_FROM_B4.includes(a.to),
    )
    expect(leaps.length, 'a rook on the springboard can leap like a knight').toBeGreaterThan(0)
  })

  it('square.springboard takes the leap back when the piece stands elsewhere', () => {
    // The control that makes the first assertion mean something: the same rook,
    // the same board, one square over. A grant with no duration must belong to
    // the square rather than to the piece.
    const state = standing('preset.cavalry', [K_W, at('c4', 'piece.rook'), K_B])
    const leaps = legalActions(state, content).filter(
      (a) => a.kind === 'move' && a.from === 'c4' && ['e5', 'e3', 'd6', 'b6', 'd2', 'b2'].includes(a.to),
    )
    expect(leaps.length, 'the leap belonged to the square, not to the piece').toBe(0)
  })

  it('square.levy musters a pawn WHEN the home rank has room', () => {
    const after = drive('preset.bastion', [K_W, at('e2', 'piece.rook'), K_B], 'e2', 'e3')
    expect(countIn(after, 'piece.pawn', 'white'), 'a new footman reported for duty').toBe(1)
  })

  it('square.levy does NOTHING when the home rank is full — and the text says so', () => {
    // The `square.geyser` branch, pinned for the record that copied its shape.
    // `own_back_rank` resolves through the same vacancy lookup, so a full home
    // rank makes this square fire and change nothing — which is the OPENING
    // state of every shipped room.
    const after = drive('preset.bastion', [...FULL_HOME, at('e2', 'piece.pawn'), K_B], 'e2', 'e3')
    const pawns = [...after.board.values()].filter((p) => p.pieceId === 'piece.pawn' && p.side === 'white')
    expect(pawns.length, 'no muster is possible with a full home rank').toBe(1)
    expect(after.board.get('e3')?.pieceId, 'and the piece that stepped on it is untouched').toBe('piece.pawn')
  })

  it('square.altar turns whatever arrives into a knight', () => {
    const after = drive('preset.covenant', [K_W, at('f2', 'piece.rook'), K_B], 'f2', 'f3')
    expect(after.board.get('f3')?.pieceId, 'the rook came off the altar a knight').toBe('piece.knight')
  })

  it('square.altar changes nothing for a piece that is already a knight', () => {
    // Its inert branch: `promote_piece` writes the same id back. Pinned so the
    // no-op is a recorded behaviour rather than an unnoticed one.
    // Driven with a real knight move (d2 -> f3 is an L), because a knight
    // cannot step f2 -> f3 and the fixture would be asserting nothing.
    const after = drive('preset.covenant', [K_W, at('d2', 'piece.knight'), K_B], 'd2', 'f3')
    expect(after.board.get('f3')?.pieceId).toBe('piece.knight')
  })
})

describe('coverage', () => {
  it('drives every square type the bundled set ships', () => {
    // The hole this whole file exists to close: a hand-maintained list grows one
    // every time a square type is added, and the last one cost a shipped record
    // that fires and does nothing.
    const surveyed = new Set([
      'square.bomb',
      'square.thorns',
      'square.mire',
      'square.mist',
      'square.sanctuary',
      'square.portal',
      'square.geyser',
      'square.shrine',
      'square.springboard',
      'square.levy',
      'square.altar',
    ])
    expect([...content.squareTypes.keys()].filter((id) => !surveyed.has(id))).toEqual([])
  })
})
