import { describe, expect, it } from 'vitest'
import { apply, legalActions } from '@engine/engine'
import { createPosition } from '@engine/match'
import { contentWith, referenceContent } from '../helpers/content'

const content = referenceContent()

/**
 * AC-002 — a match is won by capturing the king.
 *
 * The expected winner is fixed by the hand-authored fixture position, written
 * before the termination code existed; it reads no engine output.
 */
describe('AC-002 king capture', () => {
  it('ends the match immediately when the king is captured', () => {
    const state = createPosition({
      content,
      presetId: 'preset.default',
      seed: 1,
      sideToMove: 'white',
      placements: [
        { square: 'a1', pieceId: 'piece.king', side: 'white' },
        { square: 'a2', pieceId: 'piece.rook', side: 'white' },
        { square: 'a5', pieceId: 'piece.king', side: 'black' },
      ],
    })
    const capture = legalActions(state, content).find((a) => a.kind === 'move' && a.to === 'a5')
    expect(capture, 'rook should be able to reach the enemy king').toBeDefined()

    const after = apply(state, capture!, content)
    expect(after.result).toEqual({ kind: 'win', winner: 'white', reason: 'king_capture' })
  })

  it('lets a piece move onto an attacked square — there is no check restriction', () => {
    const state = createPosition({
      content,
      presetId: 'preset.default',
      seed: 1,
      sideToMove: 'white',
      placements: [
        { square: 'a1', pieceId: 'piece.king', side: 'white' },
        { square: 'c3', pieceId: 'piece.rook', side: 'black' },
        { square: 'f6', pieceId: 'piece.king', side: 'black' },
      ],
    })
    // a1 -> b1 walks into the black rook's file/rank coverage; still legal.
    expect(legalActions(state, content).some((a) => a.kind === 'move' && a.from === 'a1' && a.to === 'b1')).toBe(true)
  })
})

/**
 * ADR-012 — king capture short-circuits at event E3, so no later effect can
 * change the winner. Without the short-circuit, the rule card below would award
 * the match to black on the very ply white captures the king.
 */
describe('ADR-012 terminal precedence', () => {
  const withHostileRule = contentWith((src) => {
    src.ruleCards.length = 0
    src.ruleCards.push({
      id: 'rule.black-always-wins',
      nameKey: 'rule.black-always-wins.name',
      textKey: 'rule.black-always-wins.text',
      cost: 0,
      effects: [
        {
          trigger: 'end_of_ply',
          condition: { kind: 'always' },
          actions: [{ kind: 'win', side: 'opponent' }],
        },
      ],
    })
    src.presets[0]!.ruleCardIds = ['rule.black-always-wins']
  })

  it('awards the king capture even when a later-layer effect would win for the other side', () => {
    const state = createPosition({
      content: withHostileRule,
      presetId: 'preset.default',
      seed: 1,
      sideToMove: 'white',
      ruleCardId: 'rule.black-always-wins',
      placements: [
        { square: 'a1', pieceId: 'piece.king', side: 'white' },
        { square: 'a2', pieceId: 'piece.rook', side: 'white' },
        { square: 'a5', pieceId: 'piece.king', side: 'black' },
      ],
    })
    const capture = legalActions(state, withHostileRule).find((a) => a.kind === 'move' && a.to === 'a5')!
    const after = apply(state, capture, withHostileRule)
    expect(after.result).toEqual({ kind: 'win', winner: 'white', reason: 'king_capture' })
  })

  it('still applies the end-of-ply win action on a ply with no king capture', () => {
    const state = createPosition({
      content: withHostileRule,
      presetId: 'preset.default',
      seed: 1,
      sideToMove: 'white',
      ruleCardId: 'rule.black-always-wins',
      placements: [
        { square: 'a1', pieceId: 'piece.king', side: 'white' },
        { square: 'c1', pieceId: 'piece.rook', side: 'white' },
        { square: 'f6', pieceId: 'piece.king', side: 'black' },
      ],
    })
    const quiet = legalActions(state, withHostileRule).find((a) => a.kind === 'move' && a.to === 'c2')!
    const after = apply(state, quiet, withHostileRule)
    expect(after.result).toEqual({ kind: 'win', winner: 'black', reason: 'win_action' })
  })
})

/** ADR-012 — a rule-card win condition is additive, never a replacement. */
describe('ADR-012 additive win conditions', () => {
  it('keeps king capture winning while a King-of-the-Hill rule card is in play', () => {
    const state = createPosition({
      content,
      presetId: 'preset.default',
      seed: 1,
      sideToMove: 'white',
      ruleCardId: 'rule.king-of-the-hill',
      placements: [
        { square: 'a1', pieceId: 'piece.king', side: 'white' },
        { square: 'a2', pieceId: 'piece.rook', side: 'white' },
        { square: 'a5', pieceId: 'piece.king', side: 'black' },
      ],
    })
    const capture = legalActions(state, content).find((a) => a.kind === 'move' && a.to === 'a5')!
    expect(apply(state, capture, content).result?.reason).toBe('king_capture')
  })

  it('also wins by walking the king into the centre', () => {
    const state = createPosition({
      content,
      presetId: 'preset.default',
      seed: 1,
      sideToMove: 'white',
      ruleCardId: 'rule.king-of-the-hill',
      placements: [
        { square: 'c2', pieceId: 'piece.king', side: 'white' },
        { square: 'f6', pieceId: 'piece.king', side: 'black' },
      ],
    })
    const toHill = legalActions(state, content).find((a) => a.kind === 'move' && a.to === 'c3')!
    expect(apply(state, toHill, content).result).toEqual({ kind: 'win', winner: 'white', reason: 'win_action' })
  })
})

/** AC-003 — the 60-ply cap ends the match by material count. */
describe('AC-003 ply cap', () => {
  const capPosition = (extra: Array<{ square: string; pieceId: string; side: 'white' | 'black' }>) =>
    createPosition({
      content,
      presetId: 'preset.default',
      seed: 1,
      sideToMove: 'white',
      plyCount: 59,
      placements: [
        { square: 'a1', pieceId: 'piece.king', side: 'white' },
        { square: 'f6', pieceId: 'piece.king', side: 'black' },
        ...extra,
      ],
    })

  it('awards the side with more pieces when ply 60 completes', () => {
    const state = capPosition([{ square: 'c1', pieceId: 'piece.rook', side: 'white' }])
    const quiet = legalActions(state, content).find((a) => a.kind === 'move' && a.from === 'c1')!
    expect(apply(state, quiet, content).result).toEqual({ kind: 'win', winner: 'white', reason: 'material_cap' })
  })

  it('awards black when black has more pieces', () => {
    const state = capPosition([
      { square: 'c6', pieceId: 'piece.rook', side: 'black' },
      { square: 'd6', pieceId: 'piece.rook', side: 'black' },
    ])
    const quiet = legalActions(state, content).find((a) => a.kind === 'move' && a.from === 'a1')!
    expect(apply(state, quiet, content).result).toEqual({ kind: 'win', winner: 'black', reason: 'material_cap' })
  })

  it('draws on an equal piece count', () => {
    const state = capPosition([])
    const quiet = legalActions(state, content).find((a) => a.kind === 'move' && a.from === 'a1')!
    expect(apply(state, quiet, content).result).toEqual({ kind: 'draw', reason: 'material_cap' })
  })

  it('never applies the cap when a king is captured on the same ply', () => {
    const state = createPosition({
      content,
      presetId: 'preset.default',
      seed: 1,
      sideToMove: 'white',
      plyCount: 59,
      placements: [
        { square: 'a1', pieceId: 'piece.king', side: 'white' },
        { square: 'a2', pieceId: 'piece.rook', side: 'white' },
        { square: 'a5', pieceId: 'piece.king', side: 'black' },
        // Black is ahead on material, so the cap would award black.
        { square: 'c6', pieceId: 'piece.rook', side: 'black' },
        { square: 'd6', pieceId: 'piece.rook', side: 'black' },
        { square: 'e6', pieceId: 'piece.rook', side: 'black' },
      ],
    })
    const capture = legalActions(state, content).find((a) => a.kind === 'move' && a.to === 'a5')!
    expect(apply(state, capture, content).result).toEqual({ kind: 'win', winner: 'white', reason: 'king_capture' })
  })
})
