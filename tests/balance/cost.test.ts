import { describe, expect, it } from 'vitest'
import { MINIMUM_COST, gradeOf, pieceCost, pieceGrade, skillCardCost, skillCardGrade } from '@balance/cost'
import { playOutGrading } from '@balance/grading-agent'
import { type ContentSource, loadContentSet } from '@content/load'
import type { PieceDef } from '@content/schema'
import { BUNDLED_BOARD_ID, BUNDLED_PRESET_ID, bundledContentSource } from '@content/sets/bundled'
import { shippedContent } from '../helpers/shipped'

/**
 * The price, and the play that checks its order.
 *
 * The model is designed rather than measured — the weights are chosen — so what
 * keeps it honest is not that each number is derived from something, but that
 * the model's PROPERTIES are checkable and its ORDER is checked against actual
 * play. Where the two disagree the disagreement is recorded here rather than
 * smoothed away.
 */

const content = shippedContent()
const board = content.boards.get(BUNDLED_BOARD_ID)!
const piece = (id: string): PieceDef => content.pieces.get(id)!

describe('every record has a price, and no record is free', () => {
  it('prices every bundled piece at one or more', () => {
    for (const [id, def] of content.pieces) {
      expect(pieceCost(def, board), `${id} is free`).toBeGreaterThanOrEqual(MINIMUM_COST)
      expect(pieceGrade(def, board), `${id} grades at zero`).toBeGreaterThanOrEqual(1)
    }
  })

  it('prices every bundled card at one or more', () => {
    for (const [id, def] of content.skillCards) {
      expect(skillCardCost(def), `${id} is free`).toBeGreaterThanOrEqual(MINIMUM_COST)
      expect(skillCardGrade(def), `${id} grades at zero`).toBeGreaterThanOrEqual(1)
    }
  })

  it('never grades anything at zero, however small the cost', () => {
    for (const cost of [0, 0.4, 1, 14, 15, 16]) expect(gradeOf(cost)).toBeGreaterThanOrEqual(1)
  })
})

describe('the price moves with the thing it prices', () => {
  const withMovement = (vectors: Array<[number, number]>): PieceDef => ({
    ...piece('piece.knight'),
    movement: [{ kind: 'step', vectors }],
    attack: undefined,
  })

  it('charges more for more directions', () => {
    const two = withMovement([[0, 1], [0, -1]])
    const four = withMovement([[0, 1], [0, -1], [1, 0], [-1, 0]])
    expect(pieceCost(four, board)).toBeGreaterThan(pieceCost(two, board))
  })

  it('charges more for a longer slide', () => {
    const near: PieceDef = { ...piece('piece.rook'), movement: [{ kind: 'slide', vectors: [[1, 0]], maxDistance: 1 }] }
    const far: PieceDef = { ...piece('piece.rook'), movement: [{ kind: 'slide', vectors: [[1, 0]] }] }
    expect(pieceCost(far, board)).toBeGreaterThan(pieceCost(near, board))
  })

  it('charges more on a bigger board for the same unbounded slide', () => {
    const rook = piece('piece.rook')
    expect(pieceCost(rook, { width: 10, height: 10 })).toBeGreaterThan(pieceCost(rook, { width: 6, height: 6 }))
  })

  it('charges more for a broader condition', () => {
    const card = content.skillCards.get('skill.volley')!
    const narrow = { ...card, effects: card.effects.map((e) => ({ ...e, condition: { kind: 'piece_is' as const, pieceId: 'piece.pawn' } })) }
    expect(skillCardCost(card)).toBeGreaterThan(skillCardCost(narrow))
  })

  it('charges more for a broader target', () => {
    const card = content.skillCards.get('skill.volley')!
    const narrow = {
      ...card,
      effects: card.effects.map((e) => ({
        ...e,
        actions: e.actions.map((a) => ('target' in a ? { ...a, target: { kind: 'self' as const } } : a)),
      })),
    }
    expect(skillCardCost(card)).toBeGreaterThan(skillCardCost(narrow))
  })

  it('charges more for more uses', () => {
    const card = content.skillCards.get('skill.volley')!
    expect(skillCardCost({ ...card, uses: 3 })).toBeGreaterThan(skillCardCost({ ...card, uses: 1 }))
  })

  it('charges a card less than a piece of the same raw weight', () => {
    // The measured ratio: swapping a piece moved the win rate by five to
    // twenty-five points, the strongest bundled card by under three.
    expect(skillCardCost(content.skillCards.get('skill.volley')!)).toBeLessThan(pieceCost(piece('piece.queen'), board))
  })
})

describe('the same declaration always costs the same', () => {
  it('is a pure function of the record and the board', () => {
    const rook = piece('piece.rook')
    expect(pieceCost(rook, board)).toBe(pieceCost({ ...rook }, board))
  })
})

describe('play checks the order the price puts the pieces in', () => {
  /**
   * The validator the measurement rig became.
   *
   * It no longer produces the number — it audits it. The agent takes free
   * material and declines to hang its own, and evaluates a leaf by the piece
   * count `materialResult` already uses, so it imports no opinion about which
   * piece is better. That is the whole point: an agent scoring positions with
   * `ai/evaluate.ts` would rank pieces by `vectors × distance` and "confirm" a
   * model built from the same idea.
   */
  function scoreWith(sub: string, seeds: number): number {
    const source = structuredClone(bundledContentSource) as ContentSource
    const b = (source.boards as Array<Record<string, unknown>>)[0]!
    b.placements = (b.placements as Array<Record<string, unknown>>).map((p) =>
      p.side === 'white' && p.pieceId === 'piece.pawn' ? { ...p, pieceId: sub } : p,
    )
    const loaded = loadContentSet(source)
    if (!loaded.ok) throw new Error(`fixture must load: ${JSON.stringify(loaded.errors.slice(0, 3))}`)
    let score = 0
    for (let seed = 1; seed <= seeds; seed += 1) {
      const out = playOutGrading(loaded.set, BUNDLED_PRESET_ID, seed)
      if (out.result?.kind === 'draw') score += 0.5
      else if (out.result?.kind === 'win' && out.result.winner === 'white') score += 1
    }
    return (score / seeds) * 100
  }

  it('agrees that a queen beats a pawn, in play as well as in price', () => {
    const seeds = 40
    expect(pieceCost(piece('piece.queen'), board)).toBeGreaterThan(pieceCost(piece('piece.pawn'), board))
    expect(scoreWith('piece.queen', seeds)).toBeGreaterThan(scoreWith('piece.pawn', seeds))
  }, 120_000)

  it('records where price and play disagree, rather than hiding it', () => {
    // The standing disagreement. Play rates the archer close to the queen — it
    // was ABOVE it under random play — while the price cannot, because the
    // archer takes on four squares and the queen on forty. Structure is what the
    // price uses, and this test exists so that choice stays visible rather than
    // becoming an unexamined assumption.
    const seeds = 40
    const priceOrder = pieceCost(piece('piece.queen'), board) > pieceCost(piece('piece.archer'), board)
    const playOrder = scoreWith('piece.queen', seeds) > scoreWith('piece.archer', seeds)
    expect(priceOrder, 'the price should still rank the queen above the archer').toBe(true)
    if (playOrder !== priceOrder) {
      // eslint-disable-next-line no-console
      console.log('price and play disagree about queen vs archer — expected, and recorded by design')
    }
  }, 120_000)
})
