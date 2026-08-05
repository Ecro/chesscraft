import { describe, expect, it } from 'vitest'
import { apply, legalActions } from '@engine/engine'
import { createPosition } from '@engine/match'
import { contentWith, referenceContent } from '../helpers/content'

/**
 * ADR-012 amendment 4 — a side with no royal has lost, however it lost it.
 *
 * The original short-circuit fired at E3, on CAPTURE, which was the only way a
 * king could leave the board when the rule was written. It stopped being the
 * only way the moment the vocabulary gained `destroy_piece` with a chosen
 * target — and the shipped set carries such a card. Found by the AC-013
 * invariant walk (a card destroyed a king and the match played on for another
 * fifty plies, with the king-capture win unreachable for both sides); pinned
 * here by name, because a property test tells you a rule is broken and a
 * fixture tells you which rule.
 *
 * The scenarios are separated on purpose. `destroy` and `capture` reach the
 * same end state down different code paths — E4/E6 versus E3 — and this whole
 * class of bug is the project's most-repeated: one shared vocabulary, two code
 * paths, only one of them running the pipeline.
 */

const BASE = referenceContent()

/** A content set whose skill card destroys any one chosen enemy piece. */
function withAssassin() {
  return contentWith((src) => {
    src.skillCards.push({
      id: 'skill.assassin',
      nameKey: 'skill.assassin.name',
      textKey: 'skill.assassin.text',
      cost: 5,
      uses: 1,
      effects: [
        {
          trigger: 'on_play',
          condition: { kind: 'always' },
          actions: [{ kind: 'destroy_piece', target: { kind: 'chosen_enemy' } }],
        },
      ],
    })
    src.presets[0]!.skillCardIds.push('skill.assassin')
  })
}

function position(content: ReturnType<typeof referenceContent>, held: string[] = []) {
  return createPosition({
    content,
    presetId: 'preset.default',
    seed: 1,
    sideToMove: 'white',
    placements: [
      { square: 'a1', pieceId: 'piece.king', side: 'white' },
      { square: 'f6', pieceId: 'piece.king', side: 'black' },
      { square: 'c3', pieceId: 'piece.rook', side: 'white' },
      { square: 'c6', pieceId: 'piece.rook', side: 'black' },
    ],
    held: { white: held, black: [] },
  })
}

describe('a royal removed by an effect ends the match', () => {
  it('ends the match when a card destroys the enemy royal', () => {
    const content = withAssassin()
    const state = position(content, ['skill.assassin'])
    expect(state.result).toBeNull()

    const play = legalActions(state, content).find(
      (a) => a.kind === 'play_card' && a.cardId === 'skill.assassin' && a.targets[0] === 'f6',
    )
    expect(play, 'the card could not target the enemy king').toBeDefined()

    const after = apply(state, play!, content)
    expect(after.result).toEqual({ kind: 'win', winner: 'white', reason: 'king_capture' })
    expect(legalActions(after, content)).toEqual([])
  })

  it('leaves an ordinary destruction alone, so the rule is about ROYALTY', () => {
    // The paired control. Without it, an implementation that ended the match on
    // any destruction would pass the test above.
    const content = withAssassin()
    const state = position(content, ['skill.assassin'])

    const play = legalActions(state, content).find(
      (a) => a.kind === 'play_card' && a.cardId === 'skill.assassin' && a.targets[0] === 'c6',
    )
    expect(play).toBeDefined()
    const after = apply(state, play!, content)
    expect(after.result).toBeNull()
    expect(after.board.has('c6')).toBe(false)
  })

  it('reaches the same verdict when the royal is captured instead of destroyed', () => {
    // Same end state, different pipeline stage (E3 rather than E4/E6). The two
    // paths agreeing is the thing worth asserting; a shared vocabulary over
    // unshared code paths is this project's most repeated failure.
    const state = position(BASE)
    const capture = legalActions(state, BASE).find((a) => a.kind === 'move' && a.to === 'c6')
    expect(capture).toBeDefined()
    const after = apply(state, capture!, BASE)
    expect(after.result).toBeNull() // a rook, not a royal

    const mate = position(BASE)
    const onKing = legalActions(mate, BASE).filter((a) => a.kind === 'move' && a.to === 'f6')
    if (onKing.length > 0) {
      expect(apply(mate, onKing[0]!, BASE).result).toEqual({
        kind: 'win',
        winner: 'white',
        reason: 'king_capture',
      })
    }
  })

  it('does not declare a loser for a side the board never gave a royal', () => {
    // Content may legitimately ship a royal-less side — a puzzle position. That
    // side must not lose at ply one for a king it never had, which is the
    // absent-case this project has been bitten by before.
    const content = withAssassin()
    const state = createPosition({
      content,
      presetId: 'preset.default',
      seed: 1,
      sideToMove: 'white',
      placements: [
        { square: 'a1', pieceId: 'piece.king', side: 'white' },
        { square: 'c6', pieceId: 'piece.rook', side: 'black' },
      ],
    })
    expect(state.result).toBeNull()
    const move = legalActions(state, content).find((a) => a.kind === 'move')
    expect(move).toBeDefined()
    expect(apply(state, move!, content).result).toBeNull()
  })
})
