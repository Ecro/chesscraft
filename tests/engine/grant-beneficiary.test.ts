import { describe, expect, it } from 'vitest'
import { apply, legalActions, sideInCheck } from '@engine/engine'
import { createPosition } from '@engine/match'
import { contentWith } from '../helpers/content'
import type { ContentSet } from '@content/load'
import type { ActiveGrant, GameState, Side, SquareId } from '@engine/types'

/**
 * PLAN Phase 3 — a grant records who it is FOR (ADR-004, SPEC AC-005).
 *
 * `block_capture` grants are keyed by square and were never re-checked against
 * the occupant, so protection outlived the piece it was granted to: a friendly
 * piece takes cover, walks away, an ENEMY piece steps onto the same square, and
 * it cannot be captured. Square-keying is a declared choice and it is right for
 * freeze — a lingering penalty the next occupant inherits — but for protection
 * it inverts and hands a benefit to the opponent.
 *
 * The two arms below differ in exactly one bit: which side occupies the square.
 * A fix that merely expires the grant early passes one arm and fails the other.
 */

type Place = { square: SquareId; pieceId: string; side: Side }
const at = (square: SquareId, pieceId: string, side: Side = 'white'): Place => ({ square, pieceId, side })

function position(content: ContentSet, placements: Place[], sideToMove: Side = 'white'): GameState {
  return createPosition({
    content,
    presetId: 'preset.default',
    seed: 1,
    sideToMove,
    placements,
    ruleCardId: null,
    held: { white: [] },
    captured: { white: [] },
  })
}

/** A `square.mist`-shaped square type: cover you pick up by stepping on it. */
function withMist(square: SquareId): ContentSet {
  return contentWith((src) => {
    src.squareTypes.push({
      id: 'square.mist',
      nameKey: 'square.mist.name',
      textKey: 'square.mist.text',
      paired: false,
      effects: [
        {
          trigger: 'on_enter',
          condition: { kind: 'always' },
          actions: [{ kind: 'block_capture', target: { kind: 'entering' }, duration: 3 }],
        },
      ],
    })
    src.boards[0]!.squares.push({ square, typeId: 'square.mist' })
  })
}

const canCapture = (state: GameState, content: ContentSet, from: SquareId, to: SquareId): boolean =>
  legalActions(state, content).some((a) => a.kind === 'move' && a.from === from && a.to === to)

// ---------------------------------------------------------------------------
// AC-005 — protection belongs to the side it was granted to
// ---------------------------------------------------------------------------

describe('AC-005: a block_capture grant protects only its beneficiary', () => {
  const content = contentWith(() => {})

  /**
   * Hand-built rather than driven, because the two arms must differ in ONE bit.
   * Driving a piece onto a mist square and walking it off would also advance the
   * ply count, move other pieces and re-enter the square — several bits at once,
   * and then a failure would not say which one mattered. The grant's own
   * creation is driven end to end in the next block.
   */
  function withGrant(occupantSide: Side): GameState {
    const base = position(content, [
      at('a1', 'piece.king'),
      at('d1', 'piece.rook'),
      at('f6', 'piece.king', 'black'),
      at('d3', 'piece.rook', occupantSide),
    ])
    const grant: ActiveGrant = {
      kind: 'block_capture',
      square: 'd3',
      untilPly: base.plyCount + 3,
      sourceId: 'square.mist',
      layer: 'square',
      beneficiarySide: 'white',
    }
    return { ...base, grants: [grant] }
  }

  it('lets the enemy be captured on a square whose protection belongs to white', () => {
    const state = withGrant('black')
    expect(canCapture(state, content, 'd1', 'd3'), 'black borrowed white’s cover — it must not hold').toBe(true)
  })

  it('still protects white on that same live grant', () => {
    // The control. Same grant, same attacker, same window — only the occupant's
    // side differs, so this arm fails for any fix that just expires the grant.
    const state = withGrant('white')
    expect(canCapture(state, content, 'd1', 'd3'), 'white’s own cover holds (and it is not a capture anyway)').toBe(
      false,
    )

    const asBlack: GameState = { ...state, sideToMove: 'black' }
    expect(canCapture(asBlack, content, 'f6', 'd3'), 'and black cannot take the protected white rook').toBe(false)
  })
})

// ---------------------------------------------------------------------------
// The grant records its beneficiary from the OCCUPANT, driven end to end
// ---------------------------------------------------------------------------

describe('ADR-004: the beneficiary is read off the occupant, not the caster', () => {
  it('stamps the entering piece’s side when a square grants cover', () => {
    const content = withMist('d3')
    const before = position(content, [
      at('a1', 'piece.king'),
      at('d2', 'piece.rook'),
      at('f6', 'piece.king', 'black'),
    ])
    const move = legalActions(before, content).find((a) => a.kind === 'move' && a.from === 'd2' && a.to === 'd3')
    if (!move) throw new Error('d2->d3 is not legal — the fixture is wrong, not the engine')
    const after = apply(before, move, content)

    const grant = after.grants.find((g) => g.kind === 'block_capture' && g.square === 'd3')
    expect(grant, 'the mist granted cover').toBeDefined()
    expect(grant?.beneficiarySide, 'to the white piece that stepped in').toBe('white')
  })

  it('protects an ENEMY piece when a card deliberately covers one', () => {
    // The rejected alternative, pinned: keying the beneficiary to the CASTER
    // would silently break a card written to shield an opponent's piece.
    const content = contentWith((src) => {
      src.skillCards.push({
        id: 'skill.truce',
        nameKey: 'skill.truce.name',
        textKey: 'skill.truce.text',
        uses: 1,
        effects: [
          {
            trigger: 'on_play',
            condition: { kind: 'always' },
            actions: [{ kind: 'block_capture', target: { kind: 'chosen_enemy' }, duration: 3 }],
          },
        ],
      })
      src.presets[0]!.skillCardIds.push('skill.truce')
    })
    const before = createPosition({
      content,
      presetId: 'preset.default',
      seed: 1,
      sideToMove: 'white',
      placements: [
        at('a1', 'piece.king'),
        at('d1', 'piece.rook'),
        at('d3', 'piece.rook', 'black'),
        at('f6', 'piece.king', 'black'),
      ],
      ruleCardId: null,
      held: { white: ['skill.truce'] },
      captured: { white: [] },
    })
    const play = legalActions(before, content).find(
      (a) => a.kind === 'play_card' && a.cardId === 'skill.truce' && a.targets[0] === 'd3',
    )
    if (!play) throw new Error('skill.truce on d3 is not legal — the fixture is wrong, not the engine')
    const after = apply(before, play, content)

    const grant = after.grants.find((g) => g.kind === 'block_capture' && g.square === 'd3')
    expect(grant?.beneficiarySide, 'the beneficiary is the covered piece, not the player who paid').toBe('black')
    expect(canCapture(after, content, 'd1', 'd3'), 'and the cover actually holds against its caster').toBe(false)
  })
})

// ---------------------------------------------------------------------------
// D.5 absent case — the target square is EMPTY when the grant is created
// ---------------------------------------------------------------------------

describe('ADR-004: an empty target square falls back to the event subject, never the caster', () => {
  it('names the VICTIM at on_capture, so the capturer does not inherit cover', () => {
    // The absent case is SYSTEMATIC here, not an edge: the victim is removed
    // before `on_capture` runs, so a grant placed at its square always sees an
    // empty one. Falling back to the acting side would name the CAPTURER — who
    // then moves onto that very square and would be shielded by its victim's
    // death, inverting the whole rule.
    const content = contentWith((src) => {
      src.ruleCards.push({
        id: 'rule.deathward',
        nameKey: 'rule.deathward.name',
        textKey: 'rule.deathward.text',
        effects: [
          {
            trigger: 'on_capture',
            condition: { kind: 'always' },
            actions: [{ kind: 'block_capture', target: { kind: 'entering' }, duration: 3 }],
          },
        ],
      })
      src.presets[0]!.ruleCardIds.push('rule.deathward')
    })
    const before = createPosition({
      content,
      presetId: 'preset.default',
      seed: 1,
      sideToMove: 'white',
      placements: [
        at('a1', 'piece.king'),
        at('d1', 'piece.rook'),
        at('d5', 'piece.rook', 'black'),
        at('d6', 'piece.rook', 'black'),
        at('f6', 'piece.king', 'black'),
      ],
      ruleCardId: 'rule.deathward',
      held: { white: [] },
      captured: { white: [] },
    })
    const move = legalActions(before, content).find((a) => a.kind === 'move' && a.from === 'd1' && a.to === 'd5')
    if (!move) throw new Error('d1->d5 is not a legal capture — the fixture is wrong, not the engine')
    const after = apply(before, move, content)

    const grant = after.grants.find((g) => g.kind === 'block_capture' && g.square === 'd5')
    expect(grant, 'the card fired and left cover on the victim’s square').toBeDefined()
    expect(grant?.beneficiarySide, 'which belongs to the side that DIED there, not the one that killed').toBe('black')

    // And the observable consequence: the white capturer now standing on d5 is
    // not shielded by it.
    const blackToMove: GameState = { ...after, sideToMove: 'black', turnCard: null }
    expect(canCapture(blackToMove, content, 'd6', 'd5'), 'black can still take the capturer').toBe(true)
  })

  it('drops a block_capture whose square is empty with no event subject to name', () => {
    // The card `on_play` path has no event at all, so there is no honest
    // fallback — `ctx.subject` there is the CASTER's first chosen target, which
    // ADR-004's rejected alternatives rule out. Protection with no beneficiary
    // protects nobody, so it is dropped rather than guessed.
    const content = contentWith((src) => {
      src.skillCards.push({
        id: 'skill.warp-ward',
        nameKey: 'skill.warp-ward.name',
        textKey: 'skill.warp-ward.text',
        uses: 1,
        effects: [
          {
            trigger: 'on_play',
            condition: { kind: 'always' },
            actions: [
              { kind: 'teleport_piece', target: { kind: 'chosen_friendly' }, to: { kind: 'chosen_empty' } },
              // Resolves to the PRE-teleport square, which the teleport just emptied.
              { kind: 'block_capture', target: { kind: 'entering' }, duration: 3 },
            ],
          },
        ],
      })
      src.presets[0]!.skillCardIds.push('skill.warp-ward')
    })
    const before = createPosition({
      content,
      presetId: 'preset.default',
      seed: 1,
      sideToMove: 'white',
      placements: [at('a1', 'piece.king'), at('d1', 'piece.rook'), at('f6', 'piece.king', 'black')],
      ruleCardId: null,
      held: { white: ['skill.warp-ward'] },
      captured: { white: [] },
    })
    const play = legalActions(before, content).find(
      (a) => a.kind === 'play_card' && a.cardId === 'skill.warp-ward' && a.targets[0] === 'd1',
    )
    if (!play) throw new Error('skill.warp-ward on d1 is not legal — the fixture is wrong, not the engine')
    const after = apply(before, play, content)

    expect(
      after.grants.some((g) => g.kind === 'block_capture'),
      'no beneficiary could be named, so no protection was created',
    ).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// The one observable check-detection case (ADR-004, narrowed twice)
// ---------------------------------------------------------------------------

describe('ADR-004: sideInCheck reads the beneficiary too', () => {
  const content = contentWith(() => {})

  /**
   * A black king on a square carrying a live `block_capture` grant, with a white
   * rook bearing on it. Only the grant's beneficiary differs between the arms.
   *
   * The grant must predate this ply: `settled` at the check tally is built
   * without `m.grants` (PLAN Risk 12), so a same-ply grant is invisible to the
   * tally under ANY implementation and a fixture built that way would pass
   * regardless. Square- and rule-layer grants are also the only ones that can
   * reach a royal at all — `engine.ts:55` drops skill-layer grants on royals.
   */
  function kingOnGrant(beneficiarySide: Side): GameState {
    const base = position(
      content,
      [at('a1', 'piece.king'), at('d1', 'piece.rook'), at('d4', 'piece.king', 'black')],
      'white',
    )
    const grant: ActiveGrant = {
      kind: 'block_capture',
      square: 'd4',
      untilPly: base.plyCount + 3,
      sourceId: 'square.mist',
      layer: 'square',
      beneficiarySide,
    }
    return { ...base, grants: [grant] }
  }

  it('leaves the king in check when the cover belongs to the enemy', () => {
    expect(sideInCheck(kingOnGrant('white'), content, 'black'), 'white’s cover does not shield a black king').toBe(
      true,
    )
  })

  it('and out of check when the cover is its own', () => {
    expect(sideInCheck(kingOnGrant('black'), content, 'black'), 'its own cover does shield it').toBe(false)
  })
})
