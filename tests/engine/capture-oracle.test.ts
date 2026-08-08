import { describe, expect, it } from 'vitest'
import { apply, legalActions } from '@engine/engine'
import { chooseAction } from '@engine/agent'
import { createMatch, createPosition, currentState } from '@engine/match'
import { coords, squareId, type GameState, type Side, type SquareId } from '@engine/types'
import { type ContentSet, loadContentSet } from '@content/load'
import type { MovePattern, PieceDef } from '@content/schema'
import { BUNDLED_PRESET_ID, bundledContentSource } from '@content/sets/bundled'
import { shippedContent } from '../helpers/shipped'

/**
 * PLAN Phase 3 (ADR-004) — a differential oracle for "it should have been able to take that".
 *
 * The report this exists for: a pawn or a rook is standing where it plainly could take
 * something, and no capture marker appears. Intermittent, in LOCAL two-player play, with no
 * position the author could name — which rules out the AI turn model and the stale-board
 * overlay and leaves move generation and the UI highlight. This file is the move-generation
 * half; `tests/ui/capture-highlight.test.tsx` is the other.
 *
 * **This file changes no production behaviour.** It observes.
 *
 * The oracle is a SECOND reading of the same declarations. `naiveCaptures` interprets
 * `MovePattern` on its own — vectors, `forward` mirroring, slide distance, blocking — and
 * shares nothing with `movesFor` except `squareId`/`coords`, which are address arithmetic
 * rather than pattern semantics. An oracle that called into the engine's own generator
 * would agree with it by construction, including where both are wrong.
 *
 * The comparison is differential because a capture can be suppressed for perfectly good
 * reasons, and `generationModifiers` — where they live — is private. So instead of asking the
 * engine WHY it refused, the engine is run twice: once against the shipped content, and once
 * against the same content with **every effect removed** (`effectFree`). With no effects there
 * is nothing to suppress a capture, so move generation is pure geometry and the oracle has a
 * counterpart it can be compared to honestly.
 *
 * The first draft of this file stripped only the RULE CARD and asserted the residue was
 * empty. It failed immediately, on a black knight that could not take a white pawn — and the
 * engine was right: the pawn stood next to its own king, and two shipped PIECES carry a
 * `generate_moves` / `block_capture: adjacent_friendly` passive. A control that removes cards
 * but keeps piece passives and square types is not a control for a geometry claim
 * (`[fail:test] control-arm-is-not-a-control`, recorded here). That near-miss is why the
 * suppression sweep below asserts a positive count: a differential whose two arms never
 * differ measures nothing, and this one has to be able to SEE a suppression to be trusted
 * when it reports none.
 *
 * The fixtures below come first and matter as much as the sweep: they are the positive
 * control on the ORACLE. `[fail:test] control-arm-is-not-a-control` is recorded in this repo
 * for a measurement rig whose two arms were accidentally identical, and the mirror risk here
 * is an oracle so wrong that it reports nothing. Each fixture is a case where both readings
 * must produce a specific, hand-checked answer.
 */

const content = shippedContent()

/**
 * The same content with every effect removed.
 *
 * Built by transforming the SOURCE and re-loading it through the game's own validator, so
 * this cannot become content the engine would reject. Cards are left in place: nothing holds
 * one in these positions, and removing them would change two things at once.
 */
const effectFree: ContentSet = (() => {
  // `ContentSource`'s record arrays are deliberately loose — the same cast the other
  // content-set tests use.
  const src = bundledContentSource as unknown as {
    pieces: Array<Record<string, unknown>>
    squareTypes: Array<Record<string, unknown>>
  }
  const bare = {
    ...bundledContentSource,
    pieces: src.pieces.map((p) => ({ ...p, effects: [] })),
    squareTypes: src.squareTypes.map((s) => ({ ...s, effects: [] })),
  }
  const loaded = loadContentSet(bare as unknown as Parameters<typeof loadContentSet>[0])
  if (!loaded.ok) throw new Error(`effect-free content did not load: ${JSON.stringify(loaded.errors)}`)
  return loaded.set
})()

/** `from`+`to`, the shape both sides of the comparison produce. */
type Move = string
const mv = (from: SquareId, to: SquareId): Move => `${from}${to}`

/**
 * A pattern's vectors for a given side.
 *
 * `forward: true` mirrors the rank component for black, which is what makes a pawn a pawn.
 * Independently written; the engine's own version is `orient`.
 */
function vectorsFor(pattern: MovePattern, side: Side): Array<[number, number]> {
  const mirror = pattern.forward === true && side === 'black' ? -1 : 1
  return pattern.vectors.map(([df, dr]) => [df, dr * mirror] as [number, number])
}

/**
 * Enemy-occupied squares this pattern set can take on, from the declaration alone.
 *
 * A slide walks until it leaves the board or meets an occupant: an enemy there is
 * capturable, a friend blocks. Anything else is one step and lands where it lands, over
 * whatever is in between.
 */
function reach(
  state: GameState,
  from: SquareId,
  side: Side,
  patterns: readonly MovePattern[],
  out: Set<SquareId>,
): void {
  const origin = coords(from)
  for (const pattern of patterns) {
    for (const [df, dr] of vectorsFor(pattern, side)) {
      const limit = pattern.kind === 'slide' ? (pattern.maxDistance ?? Math.max(state.width, state.height)) : 1
      for (let step = 1; step <= limit; step += 1) {
        const file = origin.file + df * step
        const rank = origin.rank + dr * step
        if (file < 0 || rank < 0 || file >= state.width || rank >= state.height) break
        const sq = squareId(file, rank)
        const occupant = state.board.get(sq)
        if (!occupant) continue
        if (occupant.side !== side) out.add(sq)
        break
      }
    }
  }
}

/** Every capture the side to move could make, read off the piece definitions. */
function naiveCaptures(state: GameState, set: ContentSet): Set<Move> {
  const out = new Set<Move>()
  for (const [from, piece] of state.board) {
    if (piece.side !== state.sideToMove) continue
    const def = set.pieces.get(piece.pieceId) as PieceDef | undefined
    if (!def) continue
    const squares = new Set<SquareId>()
    // A piece with a separate attack set takes ONLY through it; without one it takes
    // wherever it walks. That is the schema's own rule, not an engine detail.
    reach(state, from, piece.side, def.attack ?? def.movement, squares)
    for (const to of squares) out.add(mv(from, to))
  }
  return out
}

/** Every capture the engine actually offers. */
function engineCaptures(state: GameState, set: ContentSet): Set<Move> {
  const out = new Set<Move>()
  for (const action of legalActions(state, set)) {
    if (action.kind !== 'move') continue
    const target = state.board.get(action.to)
    if (target && target.side !== state.sideToMove) out.add(mv(action.from, action.to))
  }
  return out
}

/**
 * The same board and side with no card, grant, freeze or pending draft — built against
 * whichever content set the caller is measuring, so the position and the rules travel
 * together. Carries the real ply count: a control that silently reports ply 0 makes every
 * divergence look like an opening position, which is how the first draft of this file
 * mis-read its own output.
 */
function bareBoard(state: GameState, set: ContentSet): GameState {
  return createPosition({
    content: set,
    presetId: state.presetId,
    seed: state.seed,
    sideToMove: state.sideToMove,
    plyCount: state.plyCount,
    placements: [...state.board].map(([square, piece]) => ({ square, pieceId: piece.pieceId, side: piece.side })),
    ruleCardId: null,
  })
}

interface Divergence {
  seed: number
  ply: number
  kind: 'engine-missing' | 'engine-extra'
  move: Move
  pieceId: string
}

function diverge(state: GameState, seed: number, set: ContentSet): Divergence[] {
  const naive = naiveCaptures(state, set)
  const engine = engineCaptures(state, set)
  const out: Divergence[] = []
  const nameOf = (m: Move) => state.board.get(m.slice(0, 2))?.pieceId ?? '?'
  for (const m of naive) if (!engine.has(m)) out.push({ seed, ply: state.plyCount, kind: 'engine-missing', move: m, pieceId: nameOf(m) })
  for (const m of engine) if (!naive.has(m)) out.push({ seed, ply: state.plyCount, kind: 'engine-extra', move: m, pieceId: nameOf(m) })
  return out
}

// ---------------------------------------------------------------------------
// The oracle's own positive control
// ---------------------------------------------------------------------------

const at = (square: string, pieceId: string, side: Side) => ({ square, pieceId, side })

function position(sideToMove: Side, placements: Array<{ square: string; pieceId: string; side: Side }>): GameState {
  return createPosition({ content, presetId: BUNDLED_PRESET_ID, seed: 7, sideToMove, placements, ruleCardId: null })
}

describe('the oracle reads the declarations correctly (PLAN Phase 3 positive control)', () => {
  it('has a pawn take diagonally and refuse the square straight ahead', () => {
    // Board: white pawn b2, black pieces on b3 (ahead) and c3 (diagonal).
    const state = position('white', [
      at('b2', 'piece.pawn', 'white'),
      at('b3', 'piece.rook', 'black'),
      at('c3', 'piece.rook', 'black'),
      at('a1', 'piece.king', 'white'),
      at('f6', 'piece.king', 'black'),
    ])
    const naive = naiveCaptures(state, content)
    expect([...naive].sort()).toEqual(['b2c3'])
    // And the engine agrees — which is the point of a control.
    expect([...engineCaptures(state, content)].sort()).toEqual(['b2c3'])
  })

  it('mirrors a forward pattern for black', () => {
    const state = position('black', [
      at('b5', 'piece.pawn', 'black'),
      at('c4', 'piece.rook', 'white'),
      at('c6', 'piece.rook', 'white'),
      at('a1', 'piece.king', 'white'),
      at('f6', 'piece.king', 'black'),
    ])
    // Black's forward is down the board, so c4 is the diagonal and c6 is behind it.
    expect([...naiveCaptures(state, content)].sort()).toEqual(['b5c4'])
    expect([...engineCaptures(state, content)].sort()).toEqual(['b5c4'])
  })

  it('stops a slide at a friendly piece and takes the first enemy along it', () => {
    // The d-file, chosen deliberately: the shipped board PAINTS a3, a4, f3, f4, b3 and e4,
    // and `square.sanctuary` on a4 makes its occupant uncapturable. The first draft of this
    // fixture slid a rook up the a-file into a4 and failed — correctly. A geometry fixture
    // has to stand on unpainted squares or it is measuring the paint.
    const blocked = position('white', [
      at('d1', 'piece.rook', 'white'),
      at('d2', 'piece.pawn', 'white'),
      at('d4', 'piece.rook', 'black'),
      at('f1', 'piece.king', 'white'),
      at('f6', 'piece.king', 'black'),
    ])
    expect([...naiveCaptures(blocked, content)]).toEqual([])
    expect([...engineCaptures(blocked, content)]).toEqual([])

    // Remove the blocker and the same rook reaches the same enemy.
    const open = position('white', [
      at('d1', 'piece.rook', 'white'),
      at('d4', 'piece.rook', 'black'),
      at('f1', 'piece.king', 'white'),
      at('f6', 'piece.king', 'black'),
    ])
    expect([...naiveCaptures(open, content)].sort()).toEqual(['d1d4'])
    expect([...engineCaptures(open, content)].sort()).toEqual(['d1d4'])
  })

  /**
   * The answer to the report, pinned.
   *
   * Nothing can be captured on the sanctuary square — not by a slide from any distance, not
   * by a jump, and not when the occupant is the enemy king. That is what the square says it
   * does, and it is the mechanism behind "it was plainly able to take that and the marker
   * never appeared". The engine is right; the SCREEN is what Phase 4 changes.
   *
   * Written as a comparison against the same board with the paint's effects removed, so it
   * cannot pass because the pieces could not reach the square anyway.
   */
  it('lets nothing capture a piece standing on the sanctuary square, from any direction', () => {
    const sanctuary = 'a4'
    const painted = position('white', [
      at('a1', 'piece.rook', 'white'), // slides up the file, three squares
      at('b2', 'piece.knight', 'white'), // jumps straight onto it
      at('f1', 'piece.king', 'white'),
      at(sanctuary, 'piece.rook', 'black'),
      at('f6', 'piece.king', 'black'),
    ])
    const onto = [...engineCaptures(painted, content)].filter((m) => m.endsWith(sanctuary))
    expect(onto, 'something captured a piece on the sanctuary square').toEqual([])

    // The premise, and the half that makes this not a vacuous test: with the paint's effects
    // removed, both of those pieces DO take it — so the refusal above is the square's doing
    // and not a geometry accident.
    const bare = bareBoard(painted, effectFree)
    const ontoBare = [...engineCaptures(bare, effectFree)].filter((m) => m.endsWith(sanctuary)).sort()
    expect(ontoBare, 'with the paint removed nothing reached the square either').toEqual(['a1a4', 'b2a4'])
  })

  it('reads a piece whose attack set differs from its movement', () => {
    // The bundled set has such a piece; find it rather than naming one, so this test does
    // not go vacuous the day that record is renamed.
    const separate = [...content.pieces.values()].find((p) => p.attack !== undefined)
    expect(separate, 'no bundled piece has a separate attack set — this test measures nothing').toBeDefined()
    const def = separate!
    // Place it alone with enemies on every square it could possibly touch, then assert the
    // oracle's answer is exactly its attack reach and never its movement reach.
    const state = position('white', [
      at('c3', def.id, 'white'),
      at('a1', 'piece.king', 'white'),
      at('f6', 'piece.king', 'black'),
    ])
    const filled = { ...state, board: new Map(state.board) }
    for (let f = 0; f < state.width; f += 1) {
      for (let r = 0; r < state.height; r += 1) {
        const sq = squareId(f, r)
        if (!filled.board.has(sq)) filled.board.set(sq, { pieceId: 'piece.pawn', side: 'black' })
      }
    }
    const byAttack = new Set<SquareId>()
    reach(filled, 'c3', 'white', def.attack!, byAttack)
    const byMovement = new Set<SquareId>()
    reach(filled, 'c3', 'white', def.movement, byMovement)
    // The premise: the two really do differ on this board, or the assertion is trivial.
    expect([...byAttack].sort(), 'the attack and movement reaches coincide here').not.toEqual([...byMovement].sort())

    const naive = [...naiveCaptures(filled, content)].filter((m) => m.startsWith('c3')).sort()
    expect(naive).toEqual([...byAttack].map((sq) => mv('c3', sq)).sort())
  })
})

// ---------------------------------------------------------------------------
// The sweep
// ---------------------------------------------------------------------------

const SEEDS = 120
/** Positions sampled per match, spread across its length rather than taken from the front. */
const PER_MATCH = 4

/** Replays a match, keeping the states rather than only the last one. */
function statesOf(seed: number): GameState[] {
  const DRAFT_ACTIONS = 4
  let match = createMatch({ content, presetId: BUNDLED_PRESET_ID, seed })
  const out: GameState[] = []
  for (let step = 0; step < 2 * 60 + DRAFT_ACTIONS; step += 1) {
    const state = currentState(match)
    if (state.result) break
    out.push(state)
    const action = chooseAction(state, content, seed)
    if (!action) break
    match = { ...match, states: [...match.states, apply(state, action, content)] }
  }
  return out
}

const sampled: Array<{ seed: number; state: GameState }> = []
for (let seed = 1; seed <= SEEDS; seed += 1) {
  const states = statesOf(seed).filter((s) => !s.result)
  if (states.length === 0) continue
  const stride = Math.max(1, Math.floor(states.length / PER_MATCH))
  for (let i = 0; i < states.length; i += stride) sampled.push({ seed, state: states[i]! })
}

describe('AC-CAPTURE — every capture the declarations promise is offered (PLAN Phase 3)', () => {
  it('sampled enough live positions to be a sweep', () => {
    // Stated first: every assertion below is over this set, and an empty set passes them all.
    expect(sampled.length).toBeGreaterThan(200)
  })

  it('finds live positions where a capture is actually available', () => {
    // Otherwise the sweep could be green because nothing anywhere could take anything —
    // `[fail:test] all-positive-fixture-hides-overcounting`, recorded in this repo.
    const withCaptures = sampled.filter(({ state }) => engineCaptures(state, content).size > 0)
    expect(withCaptures.length).toBeGreaterThan(50)
  })

  it('offers every capture the declarations promise, with no effect able to suppress one', () => {
    // THE claim of this file. With every effect removed, move generation is geometry and
    // nothing else, so the engine and an independent reading of the same patterns must
    // produce the same capture set. A divergence here is a move-generation defect.
    const found: Divergence[] = []
    for (const { seed, state } of sampled) {
      found.push(...diverge(bareBoard(state, effectFree), seed, effectFree))
      if (found.length > 12) break
    }
    expect(found).toEqual([])
  })

  it('sees content effects suppress captures, so the comparison above can detect one', () => {
    // The positive control on the differential. If no shipped effect ever suppressed a
    // capture, the two arms would be identical everywhere and the test above would be
    // measuring nothing — `[fail:test] control-arm-is-not-a-control`, recorded here, is the
    // rig that got this wrong three times in one unit.
    //
    // It is also the finding Phase 4 acts on: every one of these is a capture a player can
    // see is available and cannot make, and today the screen answers "that piece cannot reach
    // that square", which is not what happened.
    const suppressed: Divergence[] = []
    for (const { seed, state } of sampled) {
      const withEffects = diverge(bareBoard(state, content), seed, content)
      const without = new Set(diverge(bareBoard(state, effectFree), seed, effectFree).map((d) => `${d.kind}${d.move}`))
      for (const d of withEffects) {
        if (d.kind === 'engine-missing' && !without.has(`${d.kind}${d.move}`)) suppressed.push(d)
      }
    }
    expect(suppressed.length, 'no shipped effect ever suppressed a capture in this sweep').toBeGreaterThan(0)
  })
})
