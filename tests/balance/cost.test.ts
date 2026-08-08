import { describe, expect, it } from 'vitest'
import { MAX_STARS, MINIMUM_COST, costCeiling, exceedsCeiling, pieceCost, pieceStars, skillCardCost, skillCardStars, starsOf } from '@balance/cost'
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
const ceiling = costCeiling(content.pieces.values(), board)

describe('every record has a price, and no record is free', () => {
  it('prices every bundled piece at one or more', () => {
    for (const [id, def] of content.pieces) {
      expect(pieceCost(def, board), `${id} is free`).toBeGreaterThanOrEqual(MINIMUM_COST)
      expect(pieceStars(def, board, ceiling), `${id} grades at zero`).toBeGreaterThanOrEqual(1)
    }
  })

  it('prices every bundled card at one or more', () => {
    for (const [id, def] of content.skillCards) {
      expect(skillCardCost(def), `${id} is free`).toBeGreaterThanOrEqual(MINIMUM_COST)
      expect(skillCardStars(def, ceiling), `${id} grades at zero`).toBeGreaterThanOrEqual(1)
    }
  })

  it('never grades anything at zero, however small the cost', () => {
    for (const cost of [0, 0.4, 1, 14, 15, 16]) expect(starsOf(cost, ceiling)).toBeGreaterThanOrEqual(1)
  })

  it('never shows more stars than the scale has', () => {
    // Above the ceiling the display stops at five and the REFUSAL takes over —
    // a sixth star would be a band the rules do not have.
    for (const cost of [ceiling, ceiling + 1, ceiling * 10]) expect(starsOf(cost, ceiling)).toBe(MAX_STARS)
  })

  it('leaves the top star for something dearer than anything shipped', () => {
    // Every shipped piece sits below five, so the last band is headroom for a
    // creation rather than a label the bundle already occupies.
    for (const [id, def] of content.pieces) {
      if (def.royal === true) continue
      expect(pieceStars(def, board, ceiling), `${id} already fills the top band`).toBeLessThan(MAX_STARS)
    }
  })

  it('refuses only what is past the ceiling', () => {
    expect(exceedsCeiling(ceiling, ceiling)).toBe(false)
    expect(exceedsCeiling(ceiling + 1, ceiling)).toBe(true)
  })

  it('derives the ceiling from the room rather than from a constant', () => {
    // A wider board makes an unbounded slide worth more, so the same pieces set
    // a higher ceiling — which is the point of deriving it.
    expect(costCeiling(content.pieces.values(), { width: 10, height: 10 })).toBeGreaterThan(ceiling)
  })

  it('spaces the stars geometrically, so each is twice the one below', () => {
    // Linear bands would put the pawn, knight, archer and rook all in the first
    // star: the shipped pieces span an eight-fold range.
    expect(starsOf(ceiling / 2, ceiling)).toBe(4)
    expect(starsOf(ceiling / 4, ceiling)).toBe(3)
    expect(starsOf(ceiling / 8, ceiling)).toBe(2)
    expect(starsOf(ceiling / 16, ceiling)).toBe(1)
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
   *
   * It measures the MATERIAL LEAD rather than the win rate, and that is a
   * variance decision rather than a taste one. A win is one bit per match: at 40
   * seeds it separated the queen from the pawn by barely two standard errors,
   * and the suite paid ~0.4s per match for that — the first version timed out at
   * 120s twice under full-suite contention. The final piece difference is
   * continuous and every match already computed it. Measured at 20 seeds it puts
   * the queen at 3.30 ± 0.56 against the pawn's -0.30 ± 0.28, which is five and a
   * half standard errors on half the matches; twelve keeps four and a half and
   * costs a third of the time.
   */
  const SEEDS = 12

  const leadCache = new Map<string, number>()

  /** Average (white pieces − black pieces) at the end, over `SEEDS` matches. */
  function leadWith(sub: string): number {
    const hit = leadCache.get(sub)
    if (hit !== undefined) return hit

    const source = structuredClone(bundledContentSource) as ContentSource
    const b = (source.boards as Array<Record<string, unknown>>)[0]!
    b.placements = (b.placements as Array<Record<string, unknown>>).map((p) =>
      p.side === 'white' && p.pieceId === 'piece.pawn' ? { ...p, pieceId: sub } : p,
    )
    const loaded = loadContentSet(source)
    if (!loaded.ok) throw new Error(`fixture must load: ${JSON.stringify(loaded.errors.slice(0, 3))}`)

    let total = 0
    for (let seed = 1; seed <= SEEDS; seed += 1) {
      const final = playOutGrading(loaded.set, BUNDLED_PRESET_ID, seed).state
      let white = 0
      let black = 0
      for (const p of final.board.values()) (p.side === 'white' ? (white += 1) : (black += 1))
      total += white - black
    }
    const lead = total / SEEDS
    leadCache.set(sub, lead)
    return lead
  }

  it('agrees that a queen beats a pawn, in play as well as in price', () => {
    expect(pieceCost(piece('piece.queen'), board)).toBeGreaterThan(pieceCost(piece('piece.pawn'), board))
    expect(leadWith('piece.queen')).toBeGreaterThan(leadWith('piece.pawn'))
  }, 180_000)

  it('records where price and play disagree, rather than hiding it', () => {
    // The standing disagreement. Play rates the archer close to the queen — it
    // was ABOVE it under random play — while the price cannot, because the
    // archer takes on four squares and the queen on forty. Structure is what the
    // price uses, and this test exists so that choice stays visible rather than
    // becoming an unexamined assumption.
    expect(pieceCost(piece('piece.queen'), board)).toBeGreaterThan(pieceCost(piece('piece.archer'), board))
    const queen = leadWith('piece.queen')
    const archer = leadWith('piece.archer')
    if (archer >= queen) {
      // eslint-disable-next-line no-console
      console.log(`price and play disagree about queen (${queen}) vs archer (${archer}) — expected, recorded by design`)
    }
    // The claim actually made: both are ahead of the pawn. Which of the two
    // leads is not asserted, because play and price genuinely differ there and
    // pinning it either way would be pinning noise.
    expect(queen).toBeGreaterThan(leadWith('piece.pawn'))
    expect(archer).toBeGreaterThan(leadWith('piece.pawn'))
  }, 180_000)
})
