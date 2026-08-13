import { describe, expect, it } from 'vitest'
import { loadContentSet } from '@content/load'
import { BUNDLED_PRESET_ID, bundledContentSource } from '@content/sets/bundled'
import { apply, legalActions } from '@engine/engine'
import { createPosition } from '@engine/match'
import type { GameState } from '@engine/types'
import type { LiveEffect } from '../../src/ui/liveEffects'
import { cardPlayBetween, effectKey } from '../../src/ui/cardPlays'

/**
 * PLAN Phase 2 — "was a card played between these two states, and which one".
 *
 * A pure function over two `GameState`s, and it is pure on purpose (ADR-002).
 * Four distinct routes reach "a card was played": the human commit path, the
 * no-target commit button, the AI's `push(move.action)`, and `undo` stepping
 * back across one. `[fail:design] rule-keyed-to-event-not-state` is at count:3
 * in this repo — twice in the engine, once in this very component — and every
 * instance failed by attaching behaviour to the input that USUALLY produces a
 * state instead of to the state. Deriving from the history covers routes nobody
 * has enumerated, including ones not yet written.
 *
 * The impacted set is the half that cannot be read off `liveEffects` alone
 * (ADR-003). A freeze leaves a `frozenUntil` entry; a swap leaves no effect
 * state at all and is visible only as two squares changing hands. Both are
 * shipped cards, so a derivation that handled one and not the other would draw
 * nothing for a third of the deck — which reads as the feature being broken
 * rather than absent.
 */

const content = (() => {
  const loaded = loadContentSet(bundledContentSource)
  if (!loaded.ok) throw new Error('bundled content must load')
  return loaded.set
})()

/**
 * A position with white holding one named card, and enough black material for
 * that card to have somewhere to land.
 *
 * Built rather than dealt: an opening does not reliably offer a chosen card,
 * and the point here is the card, not the deal.
 */
function positionHolding(...cardIds: string[]): GameState {
  return createPosition({
    content,
    presetId: BUNDLED_PRESET_ID,
    seed: 7,
    sideToMove: 'white',
    held: { white: cardIds, black: [] },
    placements: [
      { square: 'a1', pieceId: 'piece.king', side: 'white' },
      { square: 'b1', pieceId: 'piece.rook', side: 'white' },
      { square: 'c3', pieceId: 'piece.pawn', side: 'white' },
      { square: 'f6', pieceId: 'piece.king', side: 'black' },
      { square: 'e6', pieceId: 'piece.rook', side: 'black' },
      { square: 'd4', pieceId: 'piece.pawn', side: 'black' },
    ],
  })
}

/**
 * Plays the named card at whatever the engine says is legal for it.
 *
 * The action is looked up and asserted BEFORE applying, because `apply` returns
 * the state UNCHANGED for an illegal action rather than throwing — so a fixture
 * whose card cannot be played would silently produce `prev === next` and every
 * "no card play detected" assertion below would pass for the wrong reason.
 * That is `[fail:test] setup-action-silently-refused`, recorded here.
 */
function playCard(state: GameState, cardId: string): GameState {
  const action = legalActions(state, content).find((a) => a.kind === 'play_card' && a.cardId === cardId)
  expect(action, `${cardId} must be playable from this position`).toBeTruthy()
  const next = apply(state, action!, content)
  expect(next, 'the card play must actually change the state').not.toBe(state)
  return next
}

/** The first legal board move, for the ply that closes a turn. */
function playMove(state: GameState): GameState {
  const action = legalActions(state, content).find((a) => a.kind === 'move')
  expect(action, 'this position must have a legal move').toBeTruthy()
  const next = apply(state, action!, content)
  expect(next, 'the move must actually change the state').not.toBe(state)
  return next
}

describe('a card play is read off the history, not off the click', () => {
  it('names the card and the side that played it', () => {
    const before = positionHolding('skill.freeze')
    const after = playCard(before, 'skill.freeze')

    const play = cardPlayBetween(before, after)
    expect(play, 'a card play must be detected').not.toBeNull()
    expect(play!.cardId).toBe('skill.freeze')
    // The side is asserted here too, but this fixture CANNOT tell the two
    // readings apart — see the next test, which is the one that does.
    expect(play!.side).toBe(before.sideToMove)
  })

  it('attributes the play to whoever was to move BEFORE it, not after', () => {
    /*
     * The only fixture in this file that discriminates the two readings.
     *
     * A card play does not hand the board over — the move that follows does
     * (ADR-001/002 of the skill-then-move PLAN) — so on every transition the
     * real engine can produce, `prev.sideToMove === next.sideToMove`. That makes
     * `expect(side).toBe(before.sideToMove)` on an engine-built pair vacuous:
     * `side: next.sideToMove`, the cheaper reading ADR-002 rejects, passes it
     * identically. `[fail:test] assertion-equals-its-own-default`, count:6.
     *
     * So the divergence is forced by hand. The state is not one the engine
     * emits today, and that is exactly the point: the assertion has to fail if
     * the wrong field is read, and it can only do that where the two differ.
     */
    const before = positionHolding('skill.freeze')
    expect(before.sideToMove).toBe('white')
    const after: GameState = { ...before, turnCard: 'skill.freeze', sideToMove: 'black' }

    const play = cardPlayBetween(before, after)
    expect(play, 'a card play must still be detected').not.toBeNull()
    expect(play!.side, 'the card belongs to the side that spent it').toBe('white')
  })

  it('marks the square a durationed effect landed on', () => {
    const before = positionHolding('skill.freeze')
    const after = playCard(before, 'skill.freeze')

    const play = cardPlayBetween(before, after)!
    const frozen = Object.keys(after.frozenUntil).filter((sq) => after.frozenUntil[sq]!.untilPly > after.plyCount)
    expect(frozen.length, 'the fixture must actually freeze something').toBeGreaterThan(0)
    for (const square of frozen) expect([...play.impacted]).toContain(square)
  })

  it('marks squares that only changed hands, with no effect state to read', () => {
    /*
     * The case `liveEffects` cannot see. A swap writes no `grants` and no
     * `frozenUntil` entry — the whole of what it did is that two squares hold
     * different pieces than they did. A derivation built on the effect list
     * alone returns an empty set here and the board stays silent for a card
     * that visibly moved two pieces.
     */
    const before = positionHolding('skill.swap')
    const after = playCard(before, 'skill.swap')

    const moved = [...new Set([...before.board.keys(), ...after.board.keys()])].filter((sq) => {
      const a = before.board.get(sq)
      const b = after.board.get(sq)
      return a?.pieceId !== b?.pieceId || a?.side !== b?.side
    })
    expect(moved.length, 'the fixture must actually move pieces').toBeGreaterThan(0)
    expect(after.grants.length, 'a swap must leave no grant, or this fixture proves nothing').toBe(0)

    const play = cardPlayBetween(before, after)!
    expect(play.cardId).toBe('skill.swap')
    for (const square of moved) expect([...play.impacted]).toContain(square)
  })

  it('reports a play that changed nothing on the board, with an empty impacted set', () => {
    /*
     * Hand-built, because the engine will not readily produce it: a skill
     * refused on a royal (`[wiki:architecture] royal-skill-turn-safety`) spends
     * the card and leaves the position untouched. The banner must still fire —
     * a player who spent a card is owed the news that it did nothing — and the
     * ring must draw nowhere rather than everywhere.
     */
    const before = positionHolding('skill.freeze')
    const after: GameState = { ...before, turnCard: 'skill.freeze' }

    const play = cardPlayBetween(before, after)
    expect(play).not.toBeNull()
    expect(play!.cardId).toBe('skill.freeze')
    expect([...play!.impacted]).toEqual([])
  })

  it('leaves an effect that is merely still running out of a later play', () => {
    /*
     * A card that lands while an OLDER effect is still running reports only its
     * own squares.
     *
     * Note what this does NOT prove. An earlier version of this comment claimed
     * it was the fixture that distinguishes ADR-003's absolute-expiry key from
     * the cheaper `remaining`, and that was wrong: `play_card` does not advance
     * `plyCount` (only `move` does, `engine.ts:1129-1150` vs `:1166`), and
     * `cardPlayBetween` only ever sees the pair straddling a card play — so
     * both encodings are numerically identical on every diff this function
     * performs, and both pass this test. The encoding is pinned directly
     * instead, in the `effectKey` block below.
     *
     * What survives is still worth having: whatever the key, a live effect the
     * current card did not touch must not be reported as this card's doing.
     *
     * The sequence: white freezes d4 (live until ply 4), white moves, black
     * moves, and white then plays an unrelated swap on ply 2 while the freeze
     * still has two plies to run.
     */
    const s0 = positionHolding('skill.freeze', 'skill.swap')
    const s1 = playCard(s0, 'skill.freeze')
    const frozen = Object.keys(s1.frozenUntil)
    expect(frozen, 'the fixture must freeze exactly one square').toHaveLength(1)
    const square = frozen[0]!

    const s3 = playMove(playMove(s1))
    expect(
      s3.frozenUntil[square]!.untilPly > s3.plyCount,
      'the freeze must still be running when the second card lands',
    ).toBe(true)
    const s4 = playCard(s3, 'skill.swap')

    const play = cardPlayBetween(s3, s4)!
    expect(play.cardId).toBe('skill.swap')
    expect([...play.impacted], 'the swap must still mark what it moved').not.toEqual([])
    expect([...play.impacted], 'a surviving freeze is not news about this card').not.toContain(square)
  })

  it('detects a card played again later in the match', () => {
    /*
     * Detection is per TRANSITION, never "has this id been seen before". A
     * derivation that remembered would go silent on the second play — and a
     * card with more than one use is exactly when a player most needs telling.
     */
    const before = positionHolding('skill.freeze')
    const spent: GameState = {
      ...before,
      drafts: { ...before.drafts, white: { ...before.drafts.white, used: ['skill.freeze'] } },
    }
    const after: GameState = { ...spent, turnCard: 'skill.freeze' }

    expect(cardPlayBetween(spent, after)?.cardId).toBe('skill.freeze')
  })
})

describe('the effect key is the absolute expiry, not the countdown', () => {
  /*
   * Tested directly, because it cannot be tested through `cardPlayBetween`.
   *
   * The rule ADR-003 inherits from `MatchHost`'s `arrived` derivation is that
   * an effect's identity is `remaining + plyCount` — the absolute ply it ends
   * on — and never `remaining` alone, which ticks down every ply and would mark
   * every surviving effect as newly arrived on every single ply. A board that
   * flashes constantly says nothing at all.
   *
   * That distinction is invisible from `cardPlayBetween`'s own call sites: a
   * card play does not advance `plyCount`, so the two encodings agree on every
   * pair it is ever handed. Exporting the builder is what makes the property
   * observable, and one exported pure function is a smaller price than a test
   * asserting behaviour on a state the engine cannot produce.
   */
  const frozenAt = (remaining: number): LiveEffect => ({
    square: 'd4',
    kind: 'frozen',
    remaining,
    sourceId: 'skill.freeze',
    layer: 'skill',
  })

  it('is unchanged for an effect that is merely one ply older', () => {
    const younger = frozenAt(2)
    const older = frozenAt(1)
    // The inputs really do differ in the field the cheaper encoding reads —
    // without this the assertion below could hold for an encoding that ignores
    // both, and would prove nothing.
    expect(older.remaining).not.toBe(younger.remaining)
    expect(effectKey(older, 3), 'one ply on, the same effect is the same effect').toBe(effectKey(younger, 2))
  })

  it('changes when something pushes the expiry out', () => {
    // Re-freezing a frozen square, or a second card extending a live grant. The
    // square and the source are unchanged; only the expiry moves, and that is
    // the whole of what makes it news.
    expect(effectKey(frozenAt(3), 2)).not.toBe(effectKey(frozenAt(1), 2))
  })

  /*
   * The expiry alone is not an identity, and neither is any one other field.
   *
   * Each case below holds every dimension fixed but one, so a key that drops
   * that dimension fails exactly here and nowhere else. Without them, an
   * `effectKey` of `kind + expiry` — ignoring square, source and layer
   * entirely — passes the three tests above, because every fixture in this
   * block would share the dropped fields. Two squares frozen by one card, or
   * two cards' effects landing on one square with the same expiry, would then
   * collide under a single key and one of them would go unreported.
   */
  const varies: ReadonlyArray<[string, LiveEffect]> = [
    ['kind', { ...frozenAt(2), kind: 'shielded' }],
    ['square', { ...frozenAt(2), square: 'e6' }],
    ['sourceId', { ...frozenAt(2), sourceId: 'square.ice' }],
    ['layer', { ...frozenAt(2), layer: 'square' }],
  ]

  for (const [field, other] of varies) {
    it(`separates two effects that differ only in ${field}`, () => {
      const base = frozenAt(2)
      // The fixture must really differ in the field it names — a spread that
      // silently wrote the same value would make the assertion below vacuous.
      expect(other[field as keyof LiveEffect]).not.toBe(base[field as keyof LiveEffect])
      expect(effectKey(other, 2)).not.toBe(effectKey(base, 2))
    })
  }
})

describe('everything that is not a card play reads as one', () => {
  it('a plain move is not a card play', () => {
    const before = positionHolding('skill.freeze')
    expect(cardPlayBetween(before, playMove(before))).toBeNull()
  })

  it('the move that CLOSES a card turn is not a second card play', () => {
    /*
     * The transition most likely to be double-counted. After the card, the
     * board still owes a move; that move clears `turnCard`, so a derivation
     * keyed on "turnCard is set on either side" would announce the same card
     * twice — once when it fired and once when the turn ended.
     */
    const before = positionHolding('skill.freeze')
    const carded = playCard(before, 'skill.freeze')
    expect(carded.turnCard, 'the fixture must leave a card pending').toBe('skill.freeze')
    const closed = playMove(carded)
    expect(closed.turnCard, 'the move must close the turn').toBeNull()

    expect(cardPlayBetween(carded, closed)).toBeNull()
  })

  it('two identical states are not a card play', () => {
    const before = positionHolding('skill.freeze')
    expect(cardPlayBetween(before, before)).toBeNull()
  })
})
