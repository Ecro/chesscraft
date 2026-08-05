import { describe, expect, it } from 'vitest'
import { SLICE_PRESET_ID, loadSliceContent } from '@content/sets/slice'
import { apply, legalActions } from '@engine/engine'
import { createPosition } from '@engine/match'
import type { Action, GameState } from '@engine/types'

/**
 * PLAN Phase 3 exit criterion (a) — ADR-002's total order, driven by content.
 *
 * The slice is authored so that ONE ply resolves an effect owned by every one of
 * the four layers: the played skill card (layer 4, at its own `on_play` event),
 * the beacon square (layer 1 at E4), the archer's volley passive (layer 2 at E4)
 * and the drawn rule card (layer 3 at E7).
 *
 * A match that merely finishes proves nothing about ordering, so this asserts
 * both halves:
 *   1. the resolution log is exactly the four (event, layer) entries in order;
 *   2. the resulting BOARD is one that only the square-before-piece order can
 *      produce — the beacon lifts the archer off c3 before the volley resolves,
 *      so the volley finds an empty square. Swap those two layers and the archer
 *      dies on c3, never reaches d4, and no side wins.
 *
 * Note on granularity: the PLAN wrote this criterion as "one reachable *move*".
 * The Phase 1 trigger table (ADR-003) makes that impossible — a skill card is
 * `on_play`-only, so no board move can ever fire layer 4. The criterion is met
 * at the granularity of one **ply**, which is what actually exercises the order.
 * Recorded in work-docs/VOCAB-GAPS-variant-chess-6x6-cards.md.
 */

const WARP: Action = { kind: 'play_card', cardId: 'skill.warp', targets: ['e5', 'c3'] }

function positionWithArcherAndBlockedBeacon(blockD4: boolean): GameState {
  return createPosition({
    content: loadSliceContent(),
    presetId: SLICE_PRESET_ID,
    seed: 7,
    sideToMove: 'white',
    ruleCardId: 'rule.beacon-rush',
    placements: [
      { square: 'a1', pieceId: 'piece.king', side: 'white' },
      { square: 'e5', pieceId: 'piece.archer', side: 'white' },
      blockD4
        ? { square: 'd4', pieceId: 'piece.king', side: 'black' }
        : { square: 'f6', pieceId: 'piece.king', side: 'black' },
    ],
    held: { white: ['skill.warp'] },
  })
}

describe('ADR-002 layer order, driven by the slice content', () => {
  it('offers the four-layer play as a legal action', () => {
    const content = loadSliceContent()
    const state = positionWithArcherAndBlockedBeacon(false)
    const legal = legalActions(state, content)
    expect(
      legal.some(
        (a) => a.kind === 'play_card' && a.cardId === 'skill.warp' && a.targets[0] === 'e5' && a.targets[1] === 'c3',
      ),
    ).toBe(true)
  })

  it('resolves skill -> square -> piece -> rule in exactly that order on one ply', () => {
    const content = loadSliceContent()
    const next = apply(positionWithArcherAndBlockedBeacon(false), WARP, content)

    expect(next.log).toEqual([
      'on_play:skill:skill.warp',
      'on_enter:square:square.beacon',
      'on_enter:piece:piece.archer',
      'end_of_ply:rule:rule.beacon-rush',
    ])
  })

  it('produces the board that only square-before-piece can produce', () => {
    const content = loadSliceContent()
    const next = apply(positionWithArcherAndBlockedBeacon(false), WARP, content)

    // The beacon moved the archer off c3 first, so the volley hit nothing.
    expect(next.board.get('d4')).toEqual({ pieceId: 'piece.archer', side: 'white' })
    expect(next.board.has('c3')).toBe(false)
    expect(next.board.has('e5')).toBe(false)
    // ...and the rule card, resolving last, saw the archer standing on d4.
    expect(next.result).toEqual({ kind: 'win', winner: 'white', reason: 'win_action' })
  })

  it('lets the volley resolve when the beacon cannot move the piece', () => {
    const content = loadSliceContent()
    // d4 is occupied, so the beacon's teleport is refused. The square layer
    // still ran first — it simply had no effect — and the piece layer now
    // finds the archer where it landed.
    const next = apply(positionWithArcherAndBlockedBeacon(true), WARP, content)

    expect(next.log.slice(0, 3)).toEqual([
      'on_play:skill:skill.warp',
      'on_enter:square:square.beacon',
      'on_enter:piece:piece.archer',
    ])
    expect(next.board.has('c3')).toBe(false)
    expect(next.board.has('e5')).toBe(false)
    expect([...next.board.values()].some((p) => p.pieceId === 'piece.archer')).toBe(false)
    expect(next.result).toBeNull()
  })

  it('runs the same square pipeline for a board move as for a card-driven move', () => {
    // A quiet move onto c3 must be indistinguishable, layer-wise, from being
    // warped onto c3 — otherwise the vocabulary means different things depending
    // on which content kind caused the movement, which ADR-003 forbids.
    const content = loadSliceContent()
    const state = createPosition({
      content,
      presetId: SLICE_PRESET_ID,
      seed: 7,
      sideToMove: 'white',
      ruleCardId: 'rule.beacon-rush',
      placements: [
        { square: 'a1', pieceId: 'piece.king', side: 'white' },
        { square: 'c2', pieceId: 'piece.archer', side: 'white' },
        { square: 'f6', pieceId: 'piece.king', side: 'black' },
      ],
    })
    const step = legalActions(state, content).find((a) => a.kind === 'move' && a.from === 'c2' && a.to === 'c3')
    expect(step).toBeDefined()

    const next = apply(state, step!, content)
    expect(next.log).toEqual([
      'on_enter:square:square.beacon',
      'on_enter:piece:piece.archer',
      'end_of_ply:rule:rule.beacon-rush',
    ])
    expect(next.board.get('d4')).toEqual({ pieceId: 'piece.archer', side: 'white' })
    expect(next.result).toEqual({ kind: 'win', winner: 'white', reason: 'win_action' })
  })
})
