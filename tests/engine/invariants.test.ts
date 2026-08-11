import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import { BUNDLED_PRESET_ID } from '@content/sets/bundled'
import type { ContentSet } from '@content/load'
import { chooseAction } from '@engine/agent'
import { PLY_CAP, apply, deserializeState, legalActions, serializeState } from '@engine/engine'
import { createMatch, currentState } from '@engine/match'
import type { GameState } from '@engine/types'
import { parseSquare } from '@content/schema'
import { shippedContent } from '../helpers/shipped'

/**
 * AC-013 — invariants that must hold at every ply of any reachable match.
 *
 * Scripted tests check positions someone thought of. These check the ones
 * nobody did, which is where this engine's real bugs have lived: the turn-six
 * draft deadlock came from a card pool nobody had sized, and the portal bounce
 * came from a square pair nobody had drawn. Both are invariant violations that
 * no hand-written fixture reached.
 *
 * The load-bearing one is I1. "Either the match is over or somebody can move"
 * is the property a deadlock breaks, and it is precisely what a scripted line
 * cannot assert, because a scripted line stops before the boundary.
 *
 * NOTE on plies vs actions, which an earlier draft of this file conflated: a
 * `draft_pick` is an action but NOT a ply, and `apply` leaves `plyCount` alone
 * for it. Since ADR-001 a card play is not a ply either — a turn is
 * `[play_card?] → move`, so a ply can cost TWO actions. A match therefore
 * consumes up to `2 * PLY_CAP + 4` actions: two per ply at the cap, plus two
 * opening drafts and two second drafts. Bounding the walk by plies made
 * cap-reaching seeds fail with a message blaming the engine; bounding it at one
 * action per ply does something worse — the walk quietly stops halfway and the
 * fall-through at the end of the loop fails for a reason that looks nothing
 * like the turn model.
 */

const content = shippedContent()

/** Opening drafts (2) plus second drafts (2) — actions that are not plies. */
const DRAFT_ACTIONS = 4

/** Actions per ply at the cap: a card play plus the move that closes it. */
const ACTIONS_PER_PLY = 2

function checkInvariants(state: GameState, content: ContentSet, seed: number, step: number) {
  const where = `seed ${seed}, step ${step}`
  const actions = legalActions(state, content)

  // I1 — no dead ends. A match with no result and no legal action is a game
  // that cannot be finished or continued, reachable from valid content.
  if (!state.result) {
    expect(actions.length, `${where}: no result and no legal action`).toBeGreaterThan(0)
  }

  // I2 — a finished match offers nothing further.
  if (state.result) expect(actions.length, `${where}: actions offered after the result`).toBe(0)

  // I3 — the cap is a bound, not a suggestion (AC-003).
  expect(state.plyCount, `${where}: ply count past the cap`).toBeLessThanOrEqual(PLY_CAP)
  if (state.plyCount >= PLY_CAP) expect(state.result, `${where}: cap reached with no result`).not.toBeNull()

  // I4 — no phantom material: every piece on the board is one the content set
  // defines, on a square inside the board. (One-piece-per-square needs no
  // assertion; the board is a Map keyed by square.)
  for (const [square, piece] of state.board) {
    expect(content.pieces.has(piece.pieceId), `${where}: ${square} holds undefined ${piece.pieceId}`).toBe(true)
    const parsed = parseSquare(square)
    expect(parsed, `${where}: unparseable square ${square}`).not.toBeNull()
    expect(parsed!.file, `${where}: ${square} off the file edge`).toBeLessThan(state.width)
    expect(parsed!.rank, `${where}: ${square} off the rank edge`).toBeLessThan(state.height)
  }

  for (const side of ['white', 'black'] as const) {
    const royals = [...state.board.values()].filter(
      (p) => p.side === side && content.pieces.get(p.pieceId)?.royal === true,
    )
    // I5 — at most one royal per side. `revive_piece` and `spawn_piece` can put
    // material back on the board, so "the king is unique" is a claim about the
    // engine, not a fact about the opening array.
    expect(royals.length, `${where}: ${side} has ${royals.length} royals`).toBeLessThanOrEqual(1)

    // I6 — a side with no royal left is a finished match (AC-002, ADR-012). The
    // engine short-circuits at E3; this catches a path that removes a king
    // without going through it.
    const startedWithRoyals = content.boards
      .get(state.boardId)!
      .placements.some((p) => p.side === side && content.pieces.get(p.pieceId)?.royal === true)
    if (startedWithRoyals && royals.length === 0) {
      expect(state.result, `${where}: ${side} has no royal but the match continues`).not.toBeNull()
    }
  }

  // I7 — serialization is a fixed point, and a round-tripped state is
  // behaviourally identical. Compared as the full action SET, not its size: a
  // deserializer that dropped `grants` or swapped a move's from/to yields the
  // same count with different moves, which is the bug this names.
  const json = serializeState(state)
  const back = deserializeState(json)
  expect(serializeState(back), `${where}: serialization is not a fixed point`).toBe(json)
  expect(JSON.stringify(legalActions(back, content)), `${where}: round trip changed the legal actions`).toBe(
    JSON.stringify(actions),
  )

  // I8 — bookkeeping never outlives the board it refers to.
  for (const square of Object.keys(state.frozenUntil)) {
    expect(parseSquare(square), `${where}: frozen square ${square} is unparseable`).not.toBeNull()
  }
}

describe('AC-013 engine invariants under random play', () => {
  it('holds every invariant at every ply of a randomly played match', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 2 ** 31 - 1 }), (seed) => {
        const startingMaterial = content.boards.get(
          currentState(createMatch({ content, presetId: BUNDLED_PRESET_ID, seed })).boardId,
        )!.placements.length

        let match = createMatch({ content, presetId: BUNDLED_PRESET_ID, seed })
        let previousSize = currentState(match).board.size

        for (let step = 0; step <= ACTIONS_PER_PLY * PLY_CAP + DRAFT_ACTIONS; step += 1) {
          const state = currentState(match)
          checkInvariants(state, content, seed, step)

          // I9 — material grows only where an effect resolved. A plain move
          // cannot create a piece, so an increase on a ply with an empty
          // resolution log is the engine duplicating material. This is the
          // checkable form of AC-013's "never exceeds the starting count plus
          // pieces created by resolved effects": the engine records no
          // per-creation event, but it does record whether anything resolved.
          if (state.board.size > previousSize) {
            expect(state.log.length, `seed ${seed}, step ${step}: material appeared with nothing resolved`).toBeGreaterThan(0)
          }
          // NOT bounded by the starting count: `spawn_piece` creates material
          // from nothing, which is the whole point of the conscription and
          // recruit cards. The bound that does hold is the board itself.
          expect(
            state.board.size,
            `seed ${seed}, step ${step}: more pieces than the board has squares`,
          ).toBeLessThanOrEqual(state.width * state.height)
          expect(startingMaterial).toBeGreaterThan(0)
          previousSize = state.board.size

          if (state.result) return
          const action = chooseAction(state, content, seed)
          expect(action, `seed ${seed}, step ${step}: no action to take`).not.toBeNull()
          match = { ...match, states: [...match.states, apply(state, action!, content)] }
        }
        // Falling out of the loop means the cap did not stop the match.
        expect(currentState(match).result, `seed ${seed}: ran past the cap without a result`).not.toBeNull()
      }),
      { numRuns: 40 },
    )
    // 40 random matches of up to 64 actions, each ply re-deriving legal actions
    // and round-tripping serialization. Comfortably over vitest's 5s default on
    // a loaded machine, and a timeout here reads as an engine failure.
  }, 120_000)

  it('advances the ply count on the action that closes the turn, and on nothing else', () => {
    // The transition invariant, three-way since ADR-001. Two of the branches are
    // there to stop a cheap fix: asserting +1 for EVERY action would make a
    // draft pick look like a ply, and asserting it for a card play would make
    // the card advance the ply — the alternative ADR-002 rejects, which halves
    // every authored duration and moves AC-003's cap under every measurement.
    let sawDraft = false
    let sawCard = false
    let sawClose = false
    for (const seed of [11, 202, 3003]) {
      let match = createMatch({ content, presetId: BUNDLED_PRESET_ID, seed })
      for (let i = 0; i < 60; i += 1) {
        const before = currentState(match)
        if (before.result) break
        const action = chooseAction(before, content, seed)
        if (!action) break
        match = { ...match, states: [...match.states, apply(before, action, content)] }
        const after = currentState(match)
        if (action.kind === 'draft_pick') {
          sawDraft = true
          expect(after.plyCount, 'a draft pick advanced the ply count').toBe(before.plyCount)
          expect(after.turnCard, 'a draft pick opened a turn').toBeNull()
        } else if (action.kind === 'play_card' && !after.result) {
          sawCard = true
          expect(after.plyCount, 'a card play advanced the ply count').toBe(before.plyCount)
          expect(after.sideToMove, 'a card play handed the board over').toBe(before.sideToMove)
          expect(after.turnCard, 'a card play left no pending turn').toBe(action.cardId)
          expect(after.royalCaptureBaseline).toEqual(
            content.skillCards.get(action.cardId)?.royalFollowUp === 'preserve-existing' ? expect.any(Array) : null,
          )
        } else if (!after.result) {
          sawClose = true
          expect(after.plyCount).toBe(before.plyCount + 1)
          expect(after.turnCard, 'the close-out left a stale pending card').toBeNull()
          expect(after.royalCaptureBaseline, 'the close-out left a stale royal baseline').toBeNull()
        }
      }
    }
    // All three branches must have been exercised, or a third of it is untested.
    expect({ sawDraft, sawCard, sawClose }).toEqual({ sawDraft: true, sawCard: true, sawClose: true })
  })

  it('never mutates the state it was given', () => {
    // ADR-004's immutability, asserted where it matters: `apply` receiving the
    // current state must not edit it, or undo and replay both read a state that
    // no longer describes that point in the match.
    for (const seed of [5, 61]) {
      let match = createMatch({ content, presetId: BUNDLED_PRESET_ID, seed })
      for (let i = 0; i < 20; i += 1) {
        const before = currentState(match)
        if (before.result) break
        const snapshot = serializeState(before)
        const action = chooseAction(before, content, seed)
        if (!action) break
        apply(before, action, content)
        expect(serializeState(before), `apply mutated its input on seed ${seed}`).toBe(snapshot)
        match = { ...match, states: [...match.states, apply(before, action, content)] }
      }
    }
  })
})
