import { describe, expect, it } from 'vitest'
import { apply, legalActions } from '@engine/engine'
import { createPosition } from '@engine/match'
import { contentWith } from '../helpers/content'
import type { ContentSet } from '@content/load'
import type { GameState, Side, SquareId } from '@engine/types'

/**
 * PLAN Phase 1 — the settlement step (ADR-001) and the swap cascade (ADR-008).
 *
 * Three things are pinned here, and they share a file because they share one
 * mechanism: the engine's answer to "which square is this effect actually
 * about, once the piece it names has finished moving?"
 *
 * 1. **AC-013** — a swapped piece enters the square it arrives on, like a
 *    teleported one. Teleport is the ORACLE: it already runs `cascadeEnter` on
 *    its destination (`engine.ts:1069`) and this change does not touch that
 *    path, so "swap must agree with teleport" is a claim about two code paths
 *    that only one of them is being edited.
 * 2. **Risk 13** — E5 promotion iterating the endpoint set must tolerate an
 *    endpoint emptied AFTER its own cascade returned. AC-013 cannot reach this
 *    (its preconditions require both swapped pieces to survive), so it gets its
 *    own fixture.
 * 3. **ADR-001 ordering** — settlement runs before E7, so a settled write
 *    survives on a square E7 then empties. This is the ONE arm that can go red:
 *    no condition kind reads `frozenUntil` (`effects.ts:142-173`), `sideInCheck`
 *    does not either (`engine.ts:223-244`), and the check tally reads
 *    `state.grants` rather than `m.grants` (`:1155`) — so neither the tally nor
 *    a rule-card condition can observe settlement's position at all.
 */

// ---------------------------------------------------------------------------
// Fixture content
// ---------------------------------------------------------------------------

/**
 * `skill.swap`, absent from the reference fixture, plus paint and pieces the
 * three probes need. Built once per test rather than shared, because
 * `contentWith` returns a fresh set and a shared one would let a mutation in
 * one probe leak into another.
 */
function withSwap(mutate?: (src: Parameters<Parameters<typeof contentWith>[0]>[0]) => void): ContentSet {
  return contentWith((src) => {
    src.skillCards.push({
      id: 'skill.swap',
      nameKey: 'skill.swap.name',
      textKey: 'skill.swap.text',
      cost: 4,
      uses: 1,
      effects: [
        {
          trigger: 'on_play',
          condition: { kind: 'always' },
          actions: [{ kind: 'swap_pieces', a: { kind: 'chosen_friendly' }, b: { kind: 'chosen_friendly' } }],
        },
      ],
    })
    src.presets[0]!.skillCardIds.push('skill.swap')
    mutate?.(src)
  })
}

/** Paints `square.bomb` (already in the fixture's vocabulary) onto given squares. */
function paintBombs(src: { boards: { squares: unknown[] }[] }, squares: SquareId[]): void {
  for (const square of squares) src.boards[0]!.squares.push({ square, typeId: 'square.bomb' })
}

/**
 * Paints a portal pair. This is the branch that separates a real settlement
 * from a re-keying shortcut: a bomb destroys IN PLACE, so with bombs alone the
 * pre-cascade square and the final square are always the same square and any
 * implementation that threads the pre-cascade target passes. A portal makes
 * them differ.
 */
function paintPortal(src: { boards: { squares: unknown[] }[] }, from: SquareId, to: SquareId): void {
  src.boards[0]!.squares.push({ square: from, typeId: 'square.portal', pairedWith: to })
  src.boards[0]!.squares.push({ square: to, typeId: 'square.portal', pairedWith: from })
}

type Place = { square: SquareId; pieceId: string; side: Side }
const at = (square: SquareId, pieceId: string, side: Side = 'white'): Place => ({ square, pieceId, side })
const K_W = at('a3', 'piece.king')
const K_B = at('f3', 'piece.king', 'black')

function position(content: ContentSet, placements: Place[], held: string[], ruleCardId: string | null = null): GameState {
  return createPosition({
    content,
    presetId: 'preset.default',
    seed: 1,
    sideToMove: 'white',
    placements,
    ruleCardId,
    held: { white: held },
    captured: { white: [] },
  })
}

/** Plays a card by id with the given targets, failing loudly when it is not legal. */
function playCard(state: GameState, content: ContentSet, cardId: string, targets: SquareId[]): GameState {
  const action = legalActions(state, content).find(
    (a) =>
      a.kind === 'play_card' &&
      a.cardId === cardId &&
      a.targets.length === targets.length &&
      a.targets.every((t, i) => t === targets[i]),
  )
  if (!action) throw new Error(`${cardId} on [${targets.join(', ')}] is not legal — the fixture is wrong, not the engine`)
  return apply(state, action, content)
}

// ---------------------------------------------------------------------------
// 1. AC-013 — a swapped piece enters the square it arrives on
// ---------------------------------------------------------------------------

describe('AC-013: a swapped piece enters the square it arrives on', () => {
  it('destroys the piece a swap moves onto a bomb square', () => {
    // c3 is painted; a rook already STANDS there (placed, never entered, so the
    // bomb has not fired on it). Swapping brings the knight in from d4.
    const content = withSwap((src) => paintBombs(src, ['c3']))
    const before = position(content, [K_W, at('c3', 'piece.rook'), at('d4', 'piece.knight'), K_B], ['skill.swap'])
    const after = playCard(before, content, 'skill.swap', ['c3', 'd4'])

    expect(after.board.has('c3'), 'the knight arrived on the bomb and should be gone').toBe(false)
    expect(after.board.get('d4'), 'the rook completed its half of the swap').toEqual({
      pieceId: 'piece.rook',
      side: 'white',
    })
    expect(after.captured.white, 'the destroyed knight is recorded as lost').toContain('piece.knight')
  })

  it('cascades BOTH endpoints, not just one', () => {
    // Both endpoints painted: a swap that cascaded only one would leave exactly
    // one piece standing, which is the half-implemented shape this pins.
    const content = withSwap((src) => paintBombs(src, ['c3', 'd4']))
    const before = position(content, [K_W, at('c3', 'piece.rook'), at('d4', 'piece.knight'), K_B], ['skill.swap'])
    const after = playCard(before, content, 'skill.swap', ['c3', 'd4'])

    expect(after.board.has('c3')).toBe(false)
    expect(after.board.has('d4')).toBe(false)
    expect([...after.captured.white].sort(), 'both swapped pieces entered a bomb').toEqual(
      ['piece.knight', 'piece.rook'].sort(),
    )
  })

  it('agrees with teleport — the same piece onto the same painted square', () => {
    // The differential. `skill.teleport` already cascades and this change does
    // not touch its path, so it is an oracle rather than a restatement.
    const content = withSwap((src) => paintBombs(src, ['c3']))

    const teleported = playCard(
      position(content, [K_W, at('d4', 'piece.knight'), K_B], ['skill.teleport']),
      content,
      'skill.teleport',
      ['d4', 'c3'],
    )
    const swapped = playCard(
      position(content, [K_W, at('c3', 'piece.rook'), at('d4', 'piece.knight'), K_B], ['skill.swap']),
      content,
      'skill.swap',
      ['c3', 'd4'],
    )

    expect(teleported.board.has('c3'), 'teleport onto the bomb — the reference outcome').toBe(false)
    expect(swapped.board.has('c3'), 'swap onto the same bomb must reach the same outcome').toBe(
      teleported.board.has('c3'),
    )
    expect(swapped.captured.white).toContain('piece.knight')
    expect(teleported.captured.white).toContain('piece.knight')
  })

  it('carries a swapped piece through a portal to the pair, not to the swap target', () => {
    // The SPEC's other half (AC-013: "the portal carries it to its pair"), and
    // the one branch where the pre-cascade square and the final square DIFFER.
    // With bombs alone an implementation that threads the swap's ORIGINAL
    // targets downstream is indistinguishable from one that threads
    // `cascadeEnter`'s return; here it is not.
    const content = withSwap((src) => paintPortal(src, 'c3', 'e1'))
    const before = position(content, [K_W, at('c3', 'piece.rook'), at('d4', 'piece.knight'), K_B], ['skill.swap'])
    const after = playCard(before, content, 'skill.swap', ['c3', 'd4'])

    expect(after.board.get('e1'), 'the knight entered c3 and the portal carried it to e1').toEqual({
      pieceId: 'piece.knight',
      side: 'white',
    })
    expect(after.board.has('c3'), 'the portal square itself is left empty').toBe(false)
    expect(after.board.get('d4')?.pieceId, 'the rook completed its half of the swap').toBe('piece.rook')
  })
})

// ---------------------------------------------------------------------------
// 1b. ADR-008 — E5 promotion iterates the endpoint SET
// ---------------------------------------------------------------------------

describe('ADR-008: promotion applies to swapped endpoints', () => {
  // `piece.pawn` promotes on the last rank (fixture: `onRank: 'last'`), which on
  // this 6x6 board is rank 6 for white.
  it('promotes a pawn swapped onto the promotion rank', () => {
    // The PLAN's own motivating example for ADR-008: "a teleported pawn reaching
    // the promotion rank promotes, a swapped one does not".
    const content = withSwap()
    const before = position(content, [K_W, at('c5', 'piece.pawn'), at('d6', 'piece.rook'), K_B], ['skill.swap'])
    const after = playCard(before, content, 'skill.swap', ['c5', 'd6'])

    expect(after.board.get('d6')?.pieceId, 'the pawn arrived on rank 6 and promotes').toBe('piece.queen')
    expect(after.board.get('c5')?.pieceId, 'the rook is unaffected by the promotion rule').toBe('piece.rook')
  })

  it('promotes BOTH endpoints when both land on the promotion rank', () => {
    // The discriminator for "E5 iterates the set" vs "E5 reads subjectSquare
    // alone": a half-fix that only promotes the last surviving endpoint leaves
    // exactly one pawn un-promoted here.
    const content = withSwap()
    const before = position(content, [K_W, at('c6', 'piece.pawn'), at('d6', 'piece.pawn'), K_B], ['skill.swap'])
    const after = playCard(before, content, 'skill.swap', ['c6', 'd6'])

    expect(after.board.get('c6')?.pieceId, 'first endpoint promoted').toBe('piece.queen')
    expect(after.board.get('d6')?.pieceId, 'second endpoint promoted — E5 read the whole set').toBe('piece.queen')
  })
})

// ---------------------------------------------------------------------------
// 2. Risk 13 — E5 tolerates an endpoint emptied after its own cascade
// ---------------------------------------------------------------------------

describe('Risk 13: an endpoint emptied after its cascade does not crash E5', () => {
  it('survives a swap whose second endpoint kills the first', () => {
    // `piece.reaper` carries an on_enter PASSIVE. A piece-layer effect has an
    // `ownerSide` (`effects.ts:121`) so `adjacent_friendly` resolves for it —
    // a square-layer effect has `ownerSide: null` (`:110`) and cannot express
    // this, which is why the fixture is a piece rather than paint.
    const content = withSwap((src) => {
      src.pieces.push({
        id: 'piece.reaper',
        nameKey: 'piece.reaper.name',
        textKey: 'piece.reaper.text',
        movement: [{ kind: 'step', vectors: [[0, 1]] }],
        effects: [
          {
            trigger: 'on_enter',
            condition: { kind: 'always' },
            actions: [{ kind: 'destroy_piece', target: { kind: 'adjacent_friendly' } }],
          },
        ],
      })
      src.presets[0]!.pieceIds.push('piece.reaper')
    })

    // c4 and d4 are adjacent. The reaper starts on c4 and is swapped to d4,
    // where its own arrival destroys the pawn that just landed on c4.
    const before = position(content, [K_W, at('c4', 'piece.reaper'), at('d4', 'piece.pawn'), K_B], ['skill.swap'])

    let after: GameState | undefined
    expect(() => {
      after = playCard(before, content, 'skill.swap', ['c4', 'd4'])
    }, 'E5 must not dereference an endpoint the second cascade emptied').not.toThrow()

    expect(after!.board.get('d4')?.pieceId, 'the reaper completed its half of the swap').toBe('piece.reaper')
    expect(after!.board.has('c4'), 'the pawn that landed on c4 was reaped').toBe(false)
    expect(after!.captured.white).toContain('piece.pawn')
  })
})

// ---------------------------------------------------------------------------
// 3. ADR-001 — settlement lands on the final square, and runs before E7
// ---------------------------------------------------------------------------

/**
 * One rule card carrying both halves of the ordering probe. Two cards cannot be
 * used: `ruleCardId` is singular.
 */
function orderingProbeCard(
  src: { ruleCards: unknown[]; presets: { ruleCardIds: string[] }[] },
  /**
   * The E7 half is opt-out: it destroys the piece at `subjectSquare`, which on a
   * cascading destination IS the final square — so a probe about *where* the
   * freeze landed would be reading a square the same card had just emptied.
   */
  withEndOfPlyDestroy = true,
): void {
  {
    src.ruleCards.push({
      id: 'rule.ordering-probe',
      nameKey: 'rule.ordering-probe.name',
      textKey: 'rule.ordering-probe.text',
      effects: [
        // Caller 3: at on_capture the capturer still stands on `action.from`
        // (`engine.ts:1007`), so an un-deferred write freezes the square it is
        // about to leave.
        {
          trigger: 'on_capture',
          condition: { kind: 'always' },
          actions: [{ kind: 'freeze_piece', target: { kind: 'mover' }, plies: 2 }],
        },
        // E7 then empties the destination. Settlement BEFORE E7 leaves the
        // freeze behind; settlement AFTER E7 drops it on the `board.has` guard.
        ...(withEndOfPlyDestroy
          ? [
              {
                trigger: 'end_of_ply',
                condition: { kind: 'always' },
                actions: [{ kind: 'destroy_piece', target: { kind: 'mover' } }],
              },
            ]
          : []),
      ],
    })
    src.presets[0]!.ruleCardIds.push('rule.ordering-probe')
  }
}

function orderingProbeContent(): ContentSet {
  return contentWith(orderingProbeCard)
}

describe('ADR-001: a mover-targeted freeze settles on the final square', () => {
  /** White rook d1 takes the black rook on d5; d1 is vacated, d5 is arrived at. */
  function capture(content: ContentSet): GameState {
    const before = position(
      content,
      [K_W, at('d1', 'piece.rook'), at('d5', 'piece.rook', 'black'), K_B],
      [],
      'rule.ordering-probe',
    )
    const move = legalActions(before, content).find((a) => a.kind === 'move' && a.from === 'd1' && a.to === 'd5')
    if (!move) throw new Error('d1->d5 is not a legal capture — the fixture is wrong, not the engine')
    return apply(before, move, content)
  }

  it('freezes the square the capturer arrives on, not the one it leaves', () => {
    const after = capture(orderingProbeContent())
    expect(after.frozenUntil['d5'], 'the freeze belongs to the destination').toBeDefined()
    expect(after.frozenUntil['d5']?.untilPly).toBe(after.plyCount + 1)
    expect(after.frozenUntil['d1'], 'the vacated square must carry nothing').toBeUndefined()
  })

  it('follows a cascading destination to the FINAL square', () => {
    // The discriminator ADR-001's rejected alternative demands. Re-keying
    // `frozenUntil[action.from]` onto `action.to` after the board move produces
    // the identical result to real deferral whenever the destination does not
    // cascade — which is every fixture above. Here d5 is a portal to b5, so the
    // two answers differ: re-keying freezes d5, deferral freezes b5.
    const content = contentWith((src) => {
      orderingProbeCard(src, false)
      src.boards[0]!.squares.push({ square: 'd5', typeId: 'square.portal', pairedWith: 'b5' })
      src.boards[0]!.squares.push({ square: 'b5', typeId: 'square.portal', pairedWith: 'd5' })
    })
    const after = capture(content)

    expect(after.board.get('b5')?.pieceId, 'the portal carried the capturer onward').toBe('piece.rook')
    expect(after.frozenUntil['b5'], 'the freeze belongs to the final square').toBeDefined()
    expect(after.frozenUntil['d5'], 'the portal entry square is not the final square').toBeUndefined()
    expect(after.frozenUntil['d1'], 'the vacated origin carries nothing').toBeUndefined()
  })

  it('applies the settled write before E7 can empty the square', () => {
    const after = capture(orderingProbeContent())
    // E7's destroy runs after settlement, so the destination is empty AND
    // carries the freeze.
    expect(after.board.has('d5'), 'E7 destroyed the capturer').toBe(false)
    expect(after.frozenUntil['d5'], 'the freeze was settled before E7 removed the piece').toBeDefined()
  })

  it('queues nothing when a card names `mover` — the absent case of the deferral', () => {
    // The absent case of the deferral condition (`ctx.moverSquare != null`),
    // asserted because a feature that activates on an optional input must define
    // what happens when the input is missing — this repo's most-recurring
    // failure class, count 8.
    //
    // What the engine actually does, measured rather than assumed: a card's
    // `on_play` builds its context with no `moverSquare` (no piece is mid-move),
    // so the write is NOT deferred; and `mover` then falls back to `ctx.subject`,
    // which for a card taking no chosen targets is null. The effect resolves to
    // no squares and freezes nothing.
    //
    // **That is a pre-existing declared-but-inert case, not one Phase 1
    // introduces**: `mover` is not a choice slot, so a card whose only action
    // names it takes no targets and has no subject to name. It is pinned here so
    // the settlement work is not later blamed for it, and so the absent case of
    // the deferral is provably safe — there is nothing to defer because there is
    // nothing to write.
    const content = contentWith((src) => {
      src.skillCards.push({
        id: 'skill.self-bind',
        nameKey: 'skill.self-bind.name',
        textKey: 'skill.self-bind.text',
        cost: 2,
        uses: 1,
        effects: [
          {
            trigger: 'on_play',
            condition: { kind: 'always' },
            actions: [{ kind: 'freeze_piece', target: { kind: 'mover' }, plies: 2 }],
          },
        ],
      })
      src.presets[0]!.skillCardIds.push('skill.self-bind')
    })
    const before = position(content, [K_W, at('d3', 'piece.rook'), K_B], ['skill.self-bind'])
    const after = playCard(before, content, 'skill.self-bind', [])

    expect(Object.keys(after.frozenUntil), 'nothing was frozen anywhere').toEqual([])
    expect(
      after.log.some((entry) => entry.startsWith('settle:')),
      'and nothing was queued — the deferral did not fire on a card ply',
    ).toBe(false)
    expect(after.log, 'the card DID play, so this is inert content and not an unplayed card').toContain(
      'on_play:skill:skill.self-bind',
    )
  })

  // -------------------------------------------------------------------------
  // Review round 1 regressions. Four P1 findings, one root cause: the deferral
  // queue resolved every write through the single global `subjectSquare`, and
  // its trigger test (`moverSquare != null`) was true far outside the window
  // where a piece is actually between squares.
  // -------------------------------------------------------------------------

  it('does not defer an end_of_ply freeze — settlement has already drained', () => {
    // consensus-passed [2/2] P1. E7 runs AFTER settlement and is handed
    // `subjectSquare` as `moverSquare`, so the old gate queued the write into a
    // list nobody drains again: no freeze, and no `settle:dropped` either,
    // while the log still claimed `end_of_ply:rule:<id>` fired. That is the
    // declared-but-inert class this whole PLAN exists to close, reopened by the
    // settlement change itself.
    const content = contentWith((src) => {
      src.ruleCards.push({
        id: 'rule.e7-freeze',
        nameKey: 'rule.e7-freeze.name',
        textKey: 'rule.e7-freeze.text',
        effects: [
          {
            trigger: 'end_of_ply',
            condition: { kind: 'always' },
            actions: [{ kind: 'freeze_piece', target: { kind: 'mover' }, plies: 2 }],
          },
        ],
      })
      src.presets[0]!.ruleCardIds.push('rule.e7-freeze')
    })
    const before = position(content, [K_W, at('d1', 'piece.rook'), K_B], [], 'rule.e7-freeze')
    const move = legalActions(before, content).find((a) => a.kind === 'move' && a.from === 'd1' && a.to === 'd3')
    if (!move) throw new Error('d1->d3 is not legal — the fixture is wrong, not the engine')
    const after = apply(before, move, content)

    expect(after.frozenUntil['d3'], 'the E7 freeze resolves immediately, at the square the mover ended on').toBeDefined()
    expect(
      after.log.some((entry) => entry.startsWith('settle:')),
      'and it was never queued, so settlement has nothing to say about it',
    ).toBe(false)
  })

  it('does not defer an on_enter freeze onto the OTHER swap endpoint', () => {
    // manual-only P1 (cross-model). `cascadeEnter` passes a non-null
    // `moverSquare` for every `on_enter`, so the old gate deferred a square
    // effect's freeze and settlement then wrote it to the last endpoint — on a
    // two-endpoint swap, that is the other piece.
    const content = withSwap((src) => {
      src.squareTypes.push({
        id: 'square.chill',
        nameKey: 'square.chill.name',
        textKey: 'square.chill.text',
        paired: false,
        effects: [
          {
            trigger: 'on_enter',
            condition: { kind: 'always' },
            actions: [{ kind: 'freeze_piece', target: { kind: 'mover' }, plies: 2 }],
          },
        ],
      })
      src.boards[0]!.squares.push({ square: 'c3', typeId: 'square.chill' })
    })
    const before = position(content, [K_W, at('c3', 'piece.rook'), at('e5', 'piece.knight'), K_B], ['skill.swap'])
    const after = playCard(before, content, 'skill.swap', ['c3', 'e5'])

    expect(after.frozenUntil['c3'], 'the piece that entered the chill square is the frozen one').toBeDefined()
    expect(after.frozenUntil['e5'], 'the other endpoint never touched it').toBeUndefined()
  })

  /*
   * NOT A TEST — a gap, recorded where the test would have been.
   *
   * Review finding (cross-model, P1): settlement's guard checked OCCUPANCY, not
   * identity, so an effect that destroys the subject and puts another piece on
   * the same square before settlement would freeze the replacement. The guard
   * now compares `pieceId` + `side` against the subject captured at defer time.
   *
   * **The fix is unverified by test.** Two fixtures were attempted — an
   * `on_capture` card doing freeze-then-destroy-then-spawn on the destination —
   * and neither reproduced the defect: both dropped the write for an unrelated
   * reason, which a mutation check caught (removing the identity comparison left
   * all 16 tests green). Rather than keep a test that proves nothing, the gap is
   * written down. Reproducing it needs a replacement to arrive at the mover's
   * FINAL square between the deferral and settlement, and the vocabulary's
   * ordering makes that hard to arrange from content alone.
   *
   * The guard is kept because it is strictly more correct than occupancy alone
   * and costs one comparison — but it is defended by reasoning, not by a probe,
   * and the next person to touch settlement should know which of those it is.
   */

  it('does not freeze the vacated origin when a card relocates and freezes in one effect', () => {
    // manual-only P1 (code-reviewer). On the card path `ctx.moverSquare` is
    // unset, so `mover` fell through to `ctx.subject` — a snapshot taken BEFORE
    // the actions ran, whose `.square` still names the pre-teleport origin.
    const content = contentWith((src) => {
      src.skillCards.push({
        id: 'skill.warp-bind',
        nameKey: 'skill.warp-bind.name',
        textKey: 'skill.warp-bind.text',
        uses: 1,
        effects: [
          {
            trigger: 'on_play',
            condition: { kind: 'always' },
            actions: [
              { kind: 'teleport_piece', target: { kind: 'chosen_friendly' }, to: { kind: 'chosen_empty' } },
              { kind: 'freeze_piece', target: { kind: 'mover' }, plies: 2 },
            ],
          },
        ],
      })
      src.presets[0]!.skillCardIds.push('skill.warp-bind')
    })
    const before = position(content, [K_W, at('a1', 'piece.rook'), at('e1', 'piece.knight'), K_B], ['skill.warp-bind'])
    const after = playCard(before, content, 'skill.warp-bind', ['a1', 'd4'])

    expect(after.board.get('d4')?.pieceId, 'the teleport landed').toBe('piece.rook')
    expect(after.frozenUntil['a1'], 'the vacated origin must carry nothing').toBeUndefined()
  })

  it('records settlement BEFORE end_of_ply in the ply trace', () => {
    // The end-state assertion above only pins the order for an implementation
    // that guards its write on board occupancy (the idiom `engine.ts:1106`
    // already uses). An unconditional deferred write would satisfy it under
    // EITHER order. `state.log` is the ply's own resolution trace
    // (`types.ts:135`), so ordering is asserted where ordering actually lives.
    const after = capture(orderingProbeContent())
    const settle = after.log.findIndex((entry) => entry.startsWith('settle:'))
    const endOfPly = after.log.indexOf('end_of_ply:rule:rule.ordering-probe')

    expect(settle, `no settlement entry in the trace: ${JSON.stringify(after.log)}`).toBeGreaterThanOrEqual(0)
    expect(endOfPly, `no end_of_ply entry in the trace: ${JSON.stringify(after.log)}`).toBeGreaterThanOrEqual(0)
    expect(settle, 'settlement resolves before end_of_ply').toBeLessThan(endOfPly)
  })
})
