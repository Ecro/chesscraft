import { describe, expect, it } from 'vitest'
import {
  explainPieceCost,
  explainSkillCardCost,
  pieceCost,
  replayExplanation,
  skillCardCost,
} from '@balance/cost'
import { shippedContent } from '../helpers/shipped'

/**
 * PLAN Phase 9 (ADR-009) — the star rating explains itself, out of the arithmetic that
 * produced it.
 *
 * `cost.ts` has claimed explainability as a design goal since ADR-012 and no screen ever said
 * a word of it: `declared-but-inert-vocabulary`, this repo's most-recurring failure, at
 * count 6. The guard against the obvious wrong fix — writing the weights into help text —
 * is the assertion below that the explanation REPLAYS to the price. A prose description
 * cannot be replayed, which is precisely why it goes stale.
 *
 * The card path is not a sum, and that distinction is the whole reason `steps` exists.
 * `skillCardCost` multiplies by `uses`, divides by the card divisor and rounds, so a card's
 * terms cannot add up to its price — a fact found by the plan validator, against
 * `skill.teleport`: one effect worth 36, one use, and a shipped price of 5 rather than 4.5.
 * An explanation that quietly dropped the half point would be lying in the arithmetic.
 */

const content = shippedContent()
const board = content.boards.get([...content.presets.values()][0]!.boardId)!

describe('every shipped record replays to its own price', () => {
  it('has records to measure on all three surfaces', () => {
    // The premise. Every assertion below is a per-record loop, and an empty set passes them.
    expect(content.pieces.size).toBeGreaterThan(6)
    expect(content.skillCards.size).toBeGreaterThan(6)
  })

  it('adds a piece up to exactly its cost', () => {
    const wrong: string[] = []
    for (const piece of content.pieces.values()) {
      const explanation = explainPieceCost(piece, board)
      if (replayExplanation(explanation) !== pieceCost(piece, board)) wrong.push(piece.id)
      if (explanation.total !== pieceCost(piece, board)) wrong.push(`${piece.id}:total`)
    }
    expect(wrong).toEqual([])
  })

  it('runs a card through its discount to exactly its cost', () => {
    const wrong: string[] = []
    for (const card of content.skillCards.values()) {
      const explanation = explainSkillCardCost(card)
      if (replayExplanation(explanation) !== skillCardCost(card)) wrong.push(card.id)
      if (explanation.total !== skillCardCost(card)) wrong.push(`${card.id}:total`)
    }
    expect(wrong).toEqual([])
  })

  it('finds at least one card whose terms do NOT sum to its price', () => {
    // The positive control on the `steps` design. If every shipped card happened to divide
    // evenly by the card divisor, this file would pass with `steps` unimplemented and the
    // rounding would surface later, on a card nobody had priced yet.
    const rounded = [...content.skillCards.values()].filter((card) => {
      const explanation = explainSkillCardCost(card)
      const sum = explanation.terms.reduce((n, t) => n + t.amount, 0)
      return sum !== explanation.total
    })
    expect(rounded.length, 'no shipped card needs its discount explained').toBeGreaterThan(0)
  })

  it('names the term that dominates a queen, and it is what she does with it', () => {
    // A specific record with a hand-checkable answer, so the loops above are not the only
    // thing standing between this feature and a plausible-looking wrong decomposition.
    const queen = content.pieces.get('piece.queen')
    expect(queen, 'the shipped set has no queen').toBeDefined()
    const terms = explainPieceCost(queen!, board).terms
    const dominant = [...terms].sort((a, b) => b.amount - a.amount)[0]!
    expect(dominant.kind).toBe('take')
    // And it is bigger than walking, because taking is what the model weights double.
    const walk = terms.find((t) => t.kind === 'walk')!
    expect(dominant.amount).toBeGreaterThan(walk.amount)
  })

  it('explains a piece with a separate attack set as having one', () => {
    const separate = [...content.pieces.values()].find((p) => p.attack !== undefined)
    expect(separate, 'no shipped piece has a separate attack set').toBeDefined()
    const kinds = explainPieceCost(separate!, board).terms.map((t) => t.kind)
    expect(kinds).toContain('separate-attack')

    // And a piece WITHOUT one does not claim the surcharge — the negative half, without which
    // this assertion would pass on an explanation that always adds it.
    const plain = [...content.pieces.values()].find((p) => p.attack === undefined)
    expect(plain).toBeDefined()
    expect(explainPieceCost(plain!, board).terms.map((t) => t.kind)).not.toContain('separate-attack')
  })
})
