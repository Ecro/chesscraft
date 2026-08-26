/**
 * What a finished match says about the content it touched (SPEC AC-001, AC-002).
 *
 * The observer is pure and reads only `Match.states` plus the board definition,
 * which is what makes ADR-008 true: no engine file learns that a collection
 * exists, and the derivation is testable without a browser, a DOM, or storage.
 *
 * The load-bearing property here is AC-002. `seen` and `used` are defined over
 * the moves that were played; the result kind is a function computed AFTER
 * those moves. So an implementation that let either set depend on who won would
 * violate the relation no matter how it were coded — which is exactly why the
 * test can hand the same match three different results and demand the same two
 * sets back. `won` is excluded by name, because being result-dependent is what
 * that rung means.
 */
import { describe, expect, it } from 'vitest'

import { BUNDLED_PRESET_ID } from '@content/sets/bundled'
import { apply, legalActions } from '@engine/engine'
import { createMatch, currentState } from '@engine/match'
import type { GameState, MatchResult, PieceOnBoard, Side, SquareId } from '@engine/types'
import type { Match } from '@engine/match'
import { shippedContent } from '../helpers/shipped'
import { observe } from '../../src/collection/observe'

const content = shippedContent()

/**
 * Ids that CANNOT enter a match on the bundled preset, whatever anyone plays.
 *
 * These are the negative witnesses the whole `seen` half of this file rests on,
 * and they are absent BY CONSTRUCTION rather than by walk depth: a square type
 * nobody painted onto `board.los-alamos` and a piece nobody placed on it have
 * no route onto the board at any ply. Measured on the shipped content: 12 of 17
 * square types unpainted, 7 of 13 pieces unplaced, 23 of 24 rule cards undrawn,
 * and ~30 of 36 skill cards never offered.
 */
function absentFromBoard(): { squareTypes: string[]; pieces: string[] } {
  const def = board()
  const painted = new Set(def.squares.map((sq) => sq.typeId))
  const placed = new Set(def.placements.map((pl) => pl.pieceId))
  return {
    squareTypes: [...content.squareTypes.keys()].filter((id) => !painted.has(id)),
    pieces: [...content.pieces.keys()].filter((id) => !placed.has(id)),
  }
}

const board = () => {
  const preset = content.presets.get(BUNDLED_PRESET_ID)
  if (!preset) throw new Error('bundled preset missing')
  const def = content.boards.get(preset.boardId)
  if (!def) throw new Error('bundled board missing')
  return def
}

/**
 * Play the match deterministically for `plies`.
 *
 * A skill card is preferred when one is legal, and that is not incidental. Both
 * armies are built from the SAME content records — measured on the bundled
 * preset, every seed has white and black moving exactly
 * `piece.knight, piece.pawn, piece.rook` — so a walk that only ever moves gives
 * the two sides identical `used` sets and could not tell a side-gated `won`
 * from an ungated one. Skill cards are drafted per side, so they are where the
 * two sides genuinely differ; measured over 24 plies the per-side sets differ
 * for every seed tried.
 */
function walk(seed: number, plies: number): Match {
  return play(seed, plies).match
}

/**
 * The same walk, plus the ground truth of which piece ids it actually MOVED.
 *
 * Derived from the applied `move` actions rather than by diffing square
 * occupants, and the difference is not cosmetic: an occupant diff reports a
 * piece that was CAPTURED IN PLACE as though it had moved, because its square's
 * occupant changed. AC-001 credits `used` to a piece that was *actually moved*,
 * and a captured victim was removed rather than moved — so an occupant-diff
 * oracle would silently demand that a correct `observe` over-credit `used`.
 *
 * Ids, not instances: four pawns share `piece.pawn`, so an id counts as moved
 * once ANY instance of it moved, and as a non-mover only when none did.
 */
function play(seed: number, plies: number): { match: Match; movedIds: ReadonlySet<string> } {
  let match = createMatch({ content, presetId: BUNDLED_PRESET_ID, seed })
  const movedIds = new Set<string>()
  for (let i = 0; i < plies; i += 1) {
    const state = currentState(match)
    if (state.result) break
    const actions = legalActions(state, content)
    const action = actions.find((a) => a.kind === 'play_card') ?? actions.find((a) => a.kind === 'draft_pick') ?? actions[0]
    if (!action) break
    if (action.kind === 'move') {
      const origin = state.board.get(action.from)
      if (origin) movedIds.add(origin.pieceId)
    }
    match = { states: [...match.states, apply(state, action, content)] }
  }
  return { match, movedIds }
}

/** Replace the final state's result, leaving every move identical. */
function withResult(match: Match, result: MatchResult | null): Match {
  const states = [...match.states]
  const last = states[states.length - 1] as GameState
  states[states.length - 1] = { ...last, result } as GameState
  return { states }
}

const BOTH: readonly Side[] = ['white', 'black']

describe('observe', () => {
  it('records the rule card the match drew', () => {
    const match = walk(7, 6)
    const ruleId = currentState(match).ruleCardId
    expect(ruleId, 'the bundled preset draws a rule card').not.toBeNull()
    const { seen, used } = observe(match, board(), BOTH)
    expect(seen.has(ruleId as string)).toBe(true)
    // AC-001 names exactly three things that reach `used` — a piece moved, a card
    // played, a square stood on. A rule card is none of them: it is drawn FOR the
    // match rather than played by anyone, so it stops at `seen`.
    expect(used.has(ruleId as string), 'a rule card is met, never used').toBe(false)
  })

  it('records every piece standing on the board as seen', () => {
    const match = walk(11, 4)
    const seen = observe(match, board(), BOTH).seen
    for (const { pieceId } of match.states[0]!.board.values()) {
      expect(seen.has(pieceId), pieceId).toBe(true)
    }
  })

  it('records a skill card that was offered and never taken as seen', () => {
    // ADR-002. `everOffered` is the engine's own record of what the child was
    // shown; two of every three offered cards are declined, and a card that was
    // read but declined is met.
    const match = walk(3, 8)
    const drafts = currentState(match).drafts
    const offered = [...drafts.white.everOffered, ...drafts.black.everOffered]
    expect(offered.length, 'the opening draft offers cards').toBeGreaterThan(0)
    const seen = observe(match, board(), BOTH).seen
    for (const id of offered) expect(seen.has(id), id).toBe(true)
  })

  it('does not promote an offered-and-declined card past seen', () => {
    const match = walk(3, 8)
    const drafts = currentState(match).drafts
    const held = new Set([...drafts.white.held, ...drafts.black.held, ...drafts.white.used, ...drafts.black.used])
    const declined = [...drafts.white.everOffered, ...drafts.black.everOffered].filter((id) => !held.has(id))
    expect(declined.length, 'at least one offered card went untaken').toBeGreaterThan(0)
    const { used } = observe(match, board(), BOTH)
    for (const id of declined) expect(used.has(id), id).toBe(false)
  })

  it('leaves content this match never touched out of seen entirely', () => {
    // The negative half of every `seen` assertion in this file. Without it an
    // `observe` that credits far more than it met satisfies all of them, since
    // each one only ever checks that something present IS there.
    //
    // The witnesses are structural, not incidental: an unpainted square type and
    // an unplaced piece cannot reach the board at any depth, so this does not
    // depend on how far `walk` got. An undrawn rule card and an unoffered skill
    // card are absent for the match, which is the same guarantee for this match.
    const match = walk(5, 24)
    const state = currentState(match)
    const { squareTypes, pieces } = absentFromBoard()
    const offered = new Set([...state.drafts.white.everOffered, ...state.drafts.black.everOffered])
    const unoffered = [...content.skillCards.keys()].filter((id) => !offered.has(id))
    const undrawn = [...content.ruleCards.keys()].filter((id) => id !== state.ruleCardId)

    expect(squareTypes.length, 'a square type exists that this board never paints').toBeGreaterThan(0)
    expect(pieces.length, 'a piece exists that this board never places').toBeGreaterThan(0)
    expect(unoffered.length, 'a skill card exists that was never offered').toBeGreaterThan(0)
    expect(undrawn.length, 'a rule card exists that was not drawn').toBeGreaterThan(0)

    const { seen, used, won } = observe(match, board(), BOTH)
    for (const id of [...squareTypes, ...pieces, ...unoffered, ...undrawn]) {
      expect(seen.has(id), `${id} was never in this match`).toBe(false)
      expect(used.has(id), `${id} was never in this match`).toBe(false)
      expect(won.has(id), `${id} was never in this match`).toBe(false)
    }
  })

  it('records a skill card that was actually played as used', () => {
    // AC-001 names three things that must reach `used`: a piece moved, a card
    // PLAYED, and a square type stood on. The declined-card test above is the
    // negative half; without this one an `observe` that treats every card as
    // seen-never-used passes the whole file.
    // 4 plies, because the negative witness only exists while a drafted card is
    // still unspent: measured, `walk(9, 4)` leaves exactly one card held and not
    // played, and by 24 plies every held card has been played (0 witnesses).
    const match = walk(9, 4)
    const drafts = currentState(match).drafts
    const played = [...drafts.white.used, ...drafts.black.used]
    const heldOnly = [...drafts.white.held, ...drafts.black.held].filter((id) => !played.includes(id))
    expect(played.length, 'at least one side played a card').toBeGreaterThan(0)
    expect(heldOnly.length, 'at least one card is held and not yet played').toBeGreaterThan(0)

    const { seen, used } = observe(match, board(), BOTH)
    for (const id of played) {
      expect(used.has(id), `${id} was played`).toBe(true)
      expect(seen.has(id), `${id} was also met`).toBe(true)
    }
    // `DraftState` keeps `held` ("picked") apart from `used` ("already played"),
    // and AC-001 says only the played one reaches `used`. Reading both fields as
    // one is the natural mistake, and it is invisible without this loop.
    for (const id of heldOnly) {
      expect(used.has(id), `${id} is held but was never played`).toBe(false)
      expect(seen.has(id), `${id} was still met`).toBe(true)
    }
  })

  it('records a piece that actually moved as used, and leaves one that never moved at seen', () => {
    const { match, movedIds } = play(5, 6)
    const { seen, used } = observe(match, board(), BOTH)
    const onBoard = new Set<string>()
    for (const piece of match.states[0]!.board.values()) onBoard.add(piece.pieceId)
    const nonMovers = [...onBoard].filter((id) => !movedIds.has(id))

    expect(movedIds.size, 'something moved').toBeGreaterThan(0)
    // Without the second loop an `observe` that collapses `used` into "every
    // piece that ever stood here" passes, which is the same defect the
    // square-type test above closes.
    expect(nonMovers.length, 'a piece on the board never moved').toBeGreaterThan(0)
    for (const id of movedIds) expect(used.has(id), `${id} moved`).toBe(true)
    for (const id of nonMovers) {
      expect(used.has(id), `${id} never moved`).toBe(false)
      expect(seen.has(id), `${id} was still on the board`).toBe(true)
    }
  })

  it('records a square type a piece stood on as used, and one nobody reached only as seen', () => {
    // Measured for THIS fixture, not carried over from another one: at
    // `walk(3, 12)` two of the five painted types have been stood on and three
    // never are. The premise below is what caught the first attempt, which used
    // a depth where the answer was zero.
    const match = walk(3, 12)
    const def = board()
    const { seen, used } = observe(match, def, BOTH)
    const painted = new Set(def.squares.map((sq) => sq.typeId))
    const occupied = new Set<string>()
    for (const state of match.states) {
      for (const sq of def.squares) if (state.board.has(sq.square)) occupied.add(sq.typeId)
    }
    // Both halves of this test's title need a witness, and the second half is
    // the one that goes vacuous without a premise: if every painted type were
    // stood on, the never-reached loop below would never execute and an
    // implementation that ignores occupancy entirely would still pass.
    expect(occupied.size, 'at least one square type was stood on').toBeGreaterThan(0)
    expect(occupied.size, 'at least one square type was never stood on').toBeLessThan(painted.size)
    for (const id of painted) expect(seen.has(id), `${id} present on the board`).toBe(true)
    for (const id of occupied) expect(used.has(id), id).toBe(true)
    for (const id of painted) {
      if (!occupied.has(id)) expect(used.has(id), `${id} never stood on`).toBe(false)
    }
  })

  it('the seen and used sets are independent of the match result', () => {
    // AC-002. One move sequence, three result kinds, one answer.
    const played = walk(13, 24)
    const results: (MatchResult | null)[] = [
      { kind: 'win', winner: 'white', reason: 'king_capture' },
      { kind: 'win', winner: 'black', reason: 'king_capture' },
      { kind: 'draw', reason: 'material_cap' },
    ]
    const sets = results.map((r) => {
      const o = observe(withResult(played, r), board(), BOTH)
      return { seen: [...o.seen].sort().join('|'), used: [...o.used].sort().join('|') }
    })
    expect(sets[1]).toEqual(sets[0])
    expect(sets[2]).toEqual(sets[0])
    expect(sets[0]!.seen.length, 'the observation is not vacuously empty').toBeGreaterThan(0)
    expect(sets[0]!.used.length, 'the observation is not vacuously empty').toBeGreaterThan(0)
  })

  it('promotes the winning side and only the winning side to won', () => {
    // 24 plies, so both sides have drafted and played a card of their own. See
    // `walk` — pieces cannot carry this assertion, cards can.
    const played = walk(13, 24)
    const white = observe(withResult(played, { kind: 'win', winner: 'white', reason: 'king_capture' }), board(), BOTH)
    const black = observe(withResult(played, { kind: 'win', winner: 'black', reason: 'king_capture' }), board(), BOTH)
    expect(white.won.size, 'a decisive result promotes something').toBeGreaterThan(0)
    // Set INEQUALITY alone cannot tell "credits the winner" from "credits the
    // loser": swapping the two sides inside `promotions` leaves the two sets
    // different, just exchanged. And `used` is side-agnostic by design (ADR-001),
    // so `white.used.has(id)` is satisfied by either side's ids. The witness has
    // to be a card only ONE named side actually played.
    expect([...white.won].sort()).not.toEqual([...black.won].sort())
    for (const id of white.won) expect(white.used.has(id), `${id} promoted without being used`).toBe(true)

    const drafts = currentState(played).drafts
    const whiteOnly = drafts.white.used.filter((id) => !drafts.black.used.includes(id))
    const blackOnly = drafts.black.used.filter((id) => !drafts.white.used.includes(id))
    expect(whiteOnly.length, 'white played a card black did not').toBeGreaterThan(0)
    expect(blackOnly.length, 'black played a card white did not').toBeGreaterThan(0)
    for (const id of whiteOnly) {
      expect(white.won.has(id), `${id} was white's and white won`).toBe(true)
      expect(black.won.has(id), `${id} was white's, so black winning must not promote it`).toBe(false)
    }
    for (const id of blackOnly) {
      expect(black.won.has(id), `${id} was black's and black won`).toBe(true)
      expect(white.won.has(id), `${id} was black's, so white winning must not promote it`).toBe(false)
    }
  })

  it('credits a piece the OTHER side relocated, attributed to the side that owns it', () => {
    // `skill.shove` ships relocating an ENEMY piece (`teleport_piece` at a
    // `chosen_enemy`), and a mover-side filter dropped it entirely. Pinned with a
    // built state pair rather than by hoping a seeded walk draws that card: a walk
    // that happens not to play it would leave this passing for the wrong reason.
    const def = board()
    const opening = walk(3, 2).states[0] as GameState
    const mover = opening.sideToMove
    const victimEntry = [...opening.board.entries()].find(([, p]) => p.side !== mover)
    expect(victimEntry, 'the opening board has a piece of the non-moving side').not.toBeUndefined()
    const [victimSquare, victim] = victimEntry as [SquareId, PieceOnBoard]
    const empty = def.squares.map((sq) => sq.square).find((sq) => !opening.board.has(sq as SquareId))
    expect(empty, 'and a painted square nobody occupies').not.toBeUndefined()

    // The enemy piece leaves its square and lands on another. Its side's count of
    // that id is unchanged, so this is a relocation and not a creation.
    const shoved = new Map(opening.board)
    shoved.delete(victimSquare)
    shoved.set(empty as SquareId, { pieceId: victim.pieceId, side: victim.side })
    const after = { ...opening, board: shoved } as GameState

    expect(observe({ states: [opening, after] }, def, BOTH).used.has(victim.pieceId), 'the shoved piece was moved').toBe(true)
    // Attribution: the piece belongs to the non-mover, so only a win by THAT side
    // may promote it. This is what a mover-side filter could never get right.
    const decisive = (winner: Side) =>
      observe({ states: [opening, { ...after, result: { kind: 'win', winner, reason: 'king_capture' } } as GameState] }, def, [winner])
    const opponent: Side = victim.side === 'white' ? 'black' : 'white'
    expect(decisive(victim.side).won.has(victim.pieceId), 'its own side winning promotes it').toBe(true)
    expect(decisive(opponent).won.has(victim.pieceId), 'the other side winning must not').toBe(false)
  })

  it('a piece that appeared or promoted is met, never used', () => {
    // Two shapes the recorded states cannot tell from a move, pinned as the
    // behaviour SPEC AC-001 now names rather than left silent.
    const def = board()
    const opening = walk(3, 2).states[0] as GameState
    const occupied = [...opening.board.entries()]
    const empty = def.squares.map((sq) => sq.square).find((sq) => !opening.board.has(sq as SquareId))
    expect(empty, 'a painted square nobody occupies').not.toBeUndefined()

    // APPEARED: a piece is added and nothing leaves. Its side's count of that id
    // grows, which is what `spawn_piece` / `revive_piece` look like from here.
    const [, template] = occupied[0] as [SquareId, PieceOnBoard]
    const grownBoard = new Map(opening.board)
    grownBoard.set(empty as SquareId, { pieceId: template.pieceId, side: template.side })
    const appeared = observe({ states: [opening, { ...opening, board: grownBoard } as GameState] }, def, BOTH)
    expect(appeared.used.has(template.pieceId), 'a piece that merely appeared was not moved').toBe(false)
    expect(appeared.seen.has(template.pieceId), 'but it was met').toBe(true)

    // PROMOTED: one id leaves and a DIFFERENT id arrives, same side. The engine
    // does this inside one transition via `def.promotion.to`, so the new id reads
    // as an appearance and the old one as a capture. Neither is credited.
    const promoter = occupied.find(([, p]) => p.pieceId === 'piece.pawn') ?? occupied[0]
    const [fromSquare, pawn] = promoter as [SquareId, PieceOnBoard]
    const promotedBoard = new Map(opening.board)
    promotedBoard.delete(fromSquare)
    promotedBoard.set(empty as SquareId, { pieceId: 'piece.queen', side: pawn.side })
    const promoted = observe({ states: [opening, { ...opening, board: promotedBoard } as GameState] }, def, BOTH)
    expect(promoted.used.has(pawn.pieceId), 'the promoting piece is not credited for that move').toBe(false)
    expect(promoted.used.has('piece.queen'), 'nor is the piece it became').toBe(false)
    expect(promoted.seen.has('piece.queen'), 'the new piece was still met').toBe(true)
  })

  it('the seen and used sets are independent of the match result', () => {
    // AC-002. One move sequence, three result kinds, one answer.
    const played = walk(13, 24)
    const results: (MatchResult | null)[] = [
      { kind: 'win', winner: 'white', reason: 'king_capture' },
      { kind: 'win', winner: 'black', reason: 'king_capture' },
      { kind: 'draw', reason: 'material_cap' },
    ]
    const sets = results.map((r) => {
      const o = observe(withResult(played, r), board(), BOTH)
      return { seen: [...o.seen].sort().join('|'), used: [...o.used].sort().join('|') }
    })
    expect(sets[1]).toEqual(sets[0])
    expect(sets[2]).toEqual(sets[0])
    expect(sets[0]!.seen.length, 'the observation is not vacuously empty').toBeGreaterThan(0)
    expect(sets[0]!.used.length, 'the observation is not vacuously empty').toBeGreaterThan(0)
  })

  it('promotes the winning side and only the winning side to won', () => {
    // 24 plies, so both sides have drafted and played a card of their own. See
    // `walk` — pieces cannot carry this assertion, cards can.
    const played = walk(13, 24)
    const white = observe(withResult(played, { kind: 'win', winner: 'white', reason: 'king_capture' }), board(), BOTH)
    const black = observe(withResult(played, { kind: 'win', winner: 'black', reason: 'king_capture' }), board(), BOTH)
    expect(white.won.size, 'a decisive result promotes something').toBeGreaterThan(0)
    // Set INEQUALITY alone cannot tell "credits the winner" from "credits the
    // loser": swapping the two sides inside `promotions` leaves the two sets
    // different, just exchanged. And `used` is side-agnostic by design (ADR-001),
    // so `white.used.has(id)` is satisfied by either side's ids. The witness has
    // to be a card only ONE named side actually played.
    expect([...white.won].sort()).not.toEqual([...black.won].sort())
    for (const id of white.won) expect(white.used.has(id), `${id} promoted without being used`).toBe(true)

    const drafts = currentState(played).drafts
    const whiteOnly = drafts.white.used.filter((id) => !drafts.black.used.includes(id))
    const blackOnly = drafts.black.used.filter((id) => !drafts.white.used.includes(id))
    expect(whiteOnly.length, 'white played a card black did not').toBeGreaterThan(0)
    expect(blackOnly.length, 'black played a card white did not').toBeGreaterThan(0)
    for (const id of whiteOnly) {
      expect(white.won.has(id), `${id} was white's and white won`).toBe(true)
      expect(black.won.has(id), `${id} was white's, so black winning must not promote it`).toBe(false)
    }
    for (const id of blackOnly) {
      expect(black.won.has(id), `${id} was black's and black won`).toBe(true)
      expect(white.won.has(id), `${id} was black's, so white winning must not promote it`).toBe(false)
    }
  })

  it('credits a piece the OTHER side relocated, and never credits one that was created', () => {
    // Two defects the arrival derivation used to have, pinned as behaviour.
    //
    // A card can relocate the opponent's piece — `skill.shove` ships doing it —
    // and a mover-side filter dropped that piece entirely. And `spawn_piece` /
    // `revive_piece` put a piece onto the board that nobody moved, which arrives
    // exactly like one that did; population growth is what tells them apart.
    const match = walk(3, 24)
    const def = board()
    const { used } = observe(match, def, BOTH)

    // Every id credited as used must be one that was genuinely on the board.
    const everPresent = new Set<string>()
    for (const state of match.states) for (const p of state.board.values()) everPresent.add(p.pieceId)
    for (const id of used) {
      if (!id.startsWith('piece.')) continue
      expect(everPresent.has(id), `${id} was credited but never stood on the board`).toBe(true)
    }

    // And a state transition that only ADDS a piece credits nothing: the arrival
    // is fully explained by that side's population growing, which is what a
    // `spawn_piece` or `revive_piece` looks like from the states alone.
    const opening = match.states[0] as GameState
    const board2 = new Map(opening.board)
    const occupied = [...board2.keys()]
    const template = board2.get(occupied[0] as SquareId)
    const emptySquare = def.squares.map((sq) => sq.square).find((sq) => !board2.has(sq as SquareId))
    expect(template, 'the opening board has a piece to copy').not.toBeUndefined()
    expect(emptySquare, 'and a painted square nobody occupies').not.toBeUndefined()
    board2.set(emptySquare as SquareId, { pieceId: (template as PieceOnBoard).pieceId, side: (template as PieceOnBoard).side })
    const grown = { ...opening, board: board2 } as GameState
    const spawned = observe({ states: [opening, grown] }, def, BOTH)
    expect(spawned.used.has((template as PieceOnBoard).pieceId), 'a piece that merely appeared was not moved').toBe(false)
  })

  it('promotes nothing on a draw', () => {
    const played = walk(13, 24)
    expect(observe(withResult(played, { kind: 'draw', reason: 'material_cap' }), board(), BOTH).won.size).toBe(0)
  })

  it('promotes nothing when the match has no result yet', () => {
    // Measured: the bundled preset has no result at this depth, so `result` is
    // genuinely null here rather than being forced to null by the fixture.
    expect(currentState(walk(13, 6)).result).toBeNull()
    expect(observe(walk(13, 6), board(), BOTH).won.size).toBe(0)
  })

  it('promotes nothing when the winning side was played by the computer', () => {
    // ADR-004. A child must never see 이걸로 이겼다 on a card the computer beat
    // them with, so the promotion is gated on the winner being a person.
    const played = withResult(walk(13, 24), { kind: 'win', winner: 'black', reason: 'king_capture' })
    expect(observe(played, board(), ['white']).won.size).toBe(0)
    expect(observe(played, board(), ['black']).won.size).toBeGreaterThan(0)
  })
})
