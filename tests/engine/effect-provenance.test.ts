import { describe, expect, it } from 'vitest'
import { BUNDLED_PRESET_ID } from '@content/sets/bundled'
import { apply, deserializeState, legalActions, serializeState } from '@engine/engine'
import { createPosition } from '@engine/match'
import type { GameState } from '@engine/types'
import { shippedContent } from '../helpers/shipped'

/**
 * Every lasting effect names what created it (ADR-004).
 *
 * "Which skill did this?" was unanswerable: `frozenUntil` was a ply number and
 * `ActiveGrant` had no source, so a frozen piece on the board was a fact with no
 * cause attached. The UI needs the cause to say anything useful about it, and
 * the engine is the only place that knows — by the time a badge is drawn, the
 * card that froze the piece may be four turns spent.
 *
 * The layer matters as much as the id. A freeze from a SQUARE and a freeze from
 * a CARD look identical on the board, and telling a player "the mire did this"
 * versus "your opponent's snare did this" is the whole difference between a
 * board they can read and one they cannot.
 */

const content = shippedContent()

function position(opts: {
  sideToMove?: 'white' | 'black'
  held?: Partial<Record<'white' | 'black', string[]>>
  placements: ReadonlyArray<{ square: string; pieceId: string; side: 'white' | 'black' }>
}): GameState {
  return createPosition({
    content,
    presetId: BUNDLED_PRESET_ID,
    seed: 5,
    sideToMove: opts.sideToMove ?? 'white',
    placements: opts.placements,
    ...(opts.held ? { held: opts.held } : {}),
  })
}

describe('a freeze carries the record that caused it', () => {
  it('names the skill card and its layer', () => {
    const before = position({
      held: { white: ['skill.freeze'] },
      placements: [
        { square: 'a1', pieceId: 'piece.king', side: 'white' },
        { square: 'b1', pieceId: 'piece.rook', side: 'white' },
        { square: 'f6', pieceId: 'piece.king', side: 'black' },
        { square: 'e6', pieceId: 'piece.rook', side: 'black' },
      ],
    })
    const play = legalActions(before, content).find(
      (a) => a.kind === 'play_card' && a.cardId === 'skill.freeze' && a.targets[0] === 'e6',
    )
    expect(play, 'freeze should be playable on the black rook').toBeDefined()

    const after = apply(before, play!, content)
    expect(after.frozenUntil.e6).toEqual({ untilPly: before.plyCount + 4, sourceId: 'skill.freeze', layer: 'skill' })
  })

  it('names the square type when a square did it, not a card', () => {
    // `square.mire` sits on f4 of the bundled board and freezes whatever enters
    // it. A provenance that could only ever say "a skill card" would be a field
    // that answers the question it was asked in exactly one of the four cases.
    const before = position({
      placements: [
        { square: 'a1', pieceId: 'piece.king', side: 'white' },
        { square: 'f5', pieceId: 'piece.rook', side: 'white' },
        { square: 'a6', pieceId: 'piece.king', side: 'black' },
      ],
    })
    const step = legalActions(before, content).find((a) => a.kind === 'move' && a.from === 'f5' && a.to === 'f4')
    expect(step, 'the rook should be able to step onto the mire').toBeDefined()

    const after = apply(before, step!, content)
    expect(after.frozenUntil.f4).toEqual({ untilPly: before.plyCount + 2, sourceId: 'square.mire', layer: 'square' })
  })
})

describe('a grant carries the record that caused it', () => {
  it('names the card behind a movement grant', () => {
    const before = position({
      held: { white: ['skill.knight-leap'] },
      placements: [
        { square: 'a1', pieceId: 'piece.king', side: 'white' },
        { square: 'c3', pieceId: 'piece.rook', side: 'white' },
        { square: 'f6', pieceId: 'piece.king', side: 'black' },
      ],
    })
    const play = legalActions(before, content).find(
      (a) => a.kind === 'play_card' && a.cardId === 'skill.knight-leap' && a.targets[0] === 'c3',
    )!
    const after = apply(before, play, content)

    const grant = after.grants.find((g) => g.square === 'c3' && g.kind === 'grant_movement')
    expect(grant, 'the leap should leave a grant behind').toBeDefined()
    expect(grant!.sourceId).toBe('skill.knight-leap')
    expect(grant!.layer).toBe('skill')
  })

  it('names the card behind a capture block', () => {
    const before = position({
      held: { white: ['skill.bulwark'] },
      placements: [
        { square: 'a1', pieceId: 'piece.king', side: 'white' },
        { square: 'c3', pieceId: 'piece.rook', side: 'white' },
        { square: 'f6', pieceId: 'piece.king', side: 'black' },
      ],
    })
    const play = legalActions(before, content).find(
      (a) => a.kind === 'play_card' && a.cardId === 'skill.bulwark' && a.targets[0] === 'c3',
    )!
    const after = apply(before, play, content)

    const grant = after.grants.find((g) => g.square === 'c3' && g.kind === 'block_capture')
    expect(grant, 'bulwark should leave a block behind').toBeDefined()
    expect(grant!.sourceId).toBe('skill.bulwark')
    expect(grant!.layer).toBe('skill')
  })
})

describe('AC-013 — provenance survives serialization', () => {
  it('round-trips the source of every live effect', () => {
    // Two white rooks on purpose: one takes the card's grant, the other walks
    // onto the mire to close the turn. The round-tripped state then carries a
    // grant AND a freeze, from a skill AND from a square — all four combinations
    // of (structure, layer) in one payload.
    const before = position({
      held: { white: ['skill.knight-leap'] },
      placements: [
        { square: 'a1', pieceId: 'piece.king', side: 'white' },
        { square: 'c3', pieceId: 'piece.rook', side: 'white' },
        { square: 'f5', pieceId: 'piece.rook', side: 'white' },
        { square: 'a6', pieceId: 'piece.king', side: 'black' },
      ],
    })
    const play = legalActions(before, content).find(
      (a) => a.kind === 'play_card' && a.cardId === 'skill.knight-leap' && a.targets[0] === 'c3',
    )!
    const mid = apply(before, play, content)
    const onto = legalActions(mid, content).find((a) => a.kind === 'move' && a.from === 'f5' && a.to === 'f4')
    expect(onto, 'the second rook should be able to step onto the mire').toBeDefined()
    const after = apply(mid, onto!, content)

    const restored = deserializeState(serializeState(after))

    // Asserted against CONCRETE values, not against `after` itself. Comparing
    // the round-trip to its own input proves only that JSON preserves whatever
    // shape it was handed — which it does today, with no provenance in it at
    // all. The failure this guards against is a source that survives in memory
    // and vanishes across a serialize, and only a named field can see it.
    const grant = restored.grants.find((g) => g.square === 'c3' && g.kind === 'grant_movement')
    expect(grant).toBeDefined()
    expect(grant!.sourceId).toBe('skill.knight-leap')
    expect(grant!.layer).toBe('skill')
    expect(grant!.untilPly).toBe(before.plyCount + 3)

    expect(restored.frozenUntil.f4).toEqual({
      untilPly: mid.plyCount + 2,
      sourceId: 'square.mire',
      layer: 'square',
    })
    // The turn closed, so nothing is pending — the field that would otherwise
    // let a restored match resume mid-turn.
    expect(restored.turnCard).toBeNull()
  })
})
