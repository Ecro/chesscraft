import { describe, expect, it } from 'vitest'
import { BUNDLED_PRESET_ID } from '@content/sets/bundled'
import { apply, describeRejection, deserializeState, legalActions, serializeState } from '@engine/engine'
import { createPosition, undo } from '@engine/match'
import { contentWith } from '../helpers/content'
import { shippedContent } from '../helpers/shipped'

const content = shippedContent()

function position(cardId: string, placements: Parameters<typeof createPosition>[0]['placements']) {
  return createPosition({
    content,
    presetId: BUNDLED_PRESET_ID,
    seed: 17,
    sideToMove: 'white',
    placements,
    held: { white: [cardId], black: [] },
  })
}

const W_KING = { square: 'a1', pieceId: 'piece.king', side: 'white' as const }
const B_KING = { square: 'f6', pieceId: 'piece.king', side: 'black' as const }

describe('skill-layer royal immunity', () => {
  it('omits an enemy royal from a destroy card while retaining an ordinary enemy target', () => {
    const before = position('skill.volley', [W_KING, B_KING, { square: 'e5', pieceId: 'piece.rook', side: 'black' }])
    const plays = legalActions(before, content).filter(
      (action) => action.kind === 'play_card' && action.cardId === 'skill.volley',
    )

    expect(plays.some((action) => action.kind === 'play_card' && action.targets[0] === 'f6')).toBe(false)
    expect(plays.some((action) => action.kind === 'play_card' && action.targets[0] === 'e5')).toBe(true)

    const illegal = { kind: 'play_card', cardId: 'skill.volley', targets: ['f6'] } as const
    expect(describeRejection(before, illegal, content)).toBe('royal-skill-immune')
    expect(apply(before, illegal, content)).toBe(before)
  })

  it('omits a friendly royal from a teleport card while retaining an ordinary friendly target', () => {
    const before = position('skill.teleport', [
      W_KING,
      { square: 'b1', pieceId: 'piece.rook', side: 'white' },
      B_KING,
    ])
    const plays = legalActions(before, content).filter(
      (action) => action.kind === 'play_card' && action.cardId === 'skill.teleport',
    )

    expect(plays.some((action) => action.kind === 'play_card' && action.targets[0] === 'a1')).toBe(false)
    expect(plays.some((action) => action.kind === 'play_card' && action.targets[0] === 'b1')).toBe(true)
    expect(
      describeRejection(
        before,
        { kind: 'play_card', cardId: 'skill.teleport', targets: ['b1', 'a1'] },
        content,
      ),
    ).toBe('card-bad-targets')
  })

  it('does not transfer persistent skill markers to a royal that later occupies the square', () => {
    const before = createPosition({
      content,
      presetId: BUNDLED_PRESET_ID,
      seed: 43,
      sideToMove: 'white',
      placements: [
        { square: 'd4', pieceId: 'piece.king', side: 'white' },
        { square: 'e5', pieceId: 'piece.rook', side: 'black' },
        B_KING,
        { square: 'a5', pieceId: 'piece.pawn', side: 'black' },
      ],
      held: { white: ['skill.freeze'], black: [] },
    })
    const freeze = legalActions(before, content).find(
      (action) => action.kind === 'play_card' && action.cardId === 'skill.freeze' && action.targets[0] === 'e5',
    )
    expect(freeze).toBeDefined()
    const frozen = apply(before, freeze!, content)
    const capture = legalActions(frozen, content).find(
      (action) => action.kind === 'move' && action.from === 'd4' && action.to === 'e5',
    )
    expect(capture).toBeDefined()
    const blackTurn = apply(frozen, capture!, content)
    const blackMove = legalActions(blackTurn, content).find(
      (action) => action.kind === 'move' && action.from === 'a5' && action.to === 'a4',
    )
    expect(blackMove).toBeDefined()
    const whiteAgain = apply(blackTurn, blackMove!, content)

    expect(whiteAgain.frozenUntil.e5?.layer).toBe('skill')
    expect(legalActions(whiteAgain, content).some((action) => action.kind === 'move' && action.from === 'e5')).toBe(true)
    expect(describeRejection(whiteAgain, { kind: 'move', from: 'e5', to: 'e4' }, content)).toBeNull()

    const skillForbidden = {
      ...whiteAgain,
      grants: [{ kind: 'forbid_movement' as const, square: 'e5', untilPly: 9, sourceId: 'skill.probe', layer: 'skill' as const }],
    }
    const ruleForbidden = {
      ...skillForbidden,
      grants: [{ ...skillForbidden.grants[0]!, sourceId: 'rule.probe', layer: 'rule' as const }],
    }
    expect(legalActions(skillForbidden, content).some((action) => action.kind === 'move' && action.from === 'e5')).toBe(true)
    expect(legalActions(ruleForbidden, content).some((action) => action.kind === 'move' && action.from === 'e5')).toBe(false)
  })

  it('prevents a movement grant from creating a same-turn royal capture', () => {
    const before = position('skill.knight-leap', [
      W_KING,
      { square: 'c3', pieceId: 'piece.rook', side: 'white' },
      { square: 'd5', pieceId: 'piece.king', side: 'black' },
    ])
    expect(legalActions(before, content).some((action) => action.kind === 'move' && action.from === 'c3' && action.to === 'd5')).toBe(false)

    const play = legalActions(before, content).find(
      (action) => action.kind === 'play_card' && action.cardId === 'skill.knight-leap' && action.targets[0] === 'c3',
    )
    expect(play).toBeDefined()
    const mid = apply(before, play!, content)

    expect(legalActions(mid, content).some((action) => action.kind === 'move' && action.from === 'c3' && action.to === 'd5')).toBe(false)
    expect(
      describeRejection(mid, { kind: 'move', from: 'c3', to: 'd5' }, content),
    ).toBe('royal-followup-blocked')
  })

  it('keeps an exact royal capture that was legal before a preserve-existing card', () => {
    const before = position('skill.volley', [
      W_KING,
      { square: 'f1', pieceId: 'piece.rook', side: 'white' },
      B_KING,
      { square: 'b6', pieceId: 'piece.rook', side: 'black' },
    ])
    expect(before.royalCaptureBaseline).toBeNull()
    expect(legalActions(before, content).some((action) => action.kind === 'move' && action.from === 'f1' && action.to === 'f6')).toBe(true)

    const play = legalActions(before, content).find(
      (action) => action.kind === 'play_card' && action.cardId === 'skill.volley' && action.targets[0] === 'b6',
    )
    expect(play).toBeDefined()
    const mid = apply(before, play!, content)

    expect(legalActions(mid, content).some((action) => action.kind === 'move' && action.from === 'f1' && action.to === 'f6')).toBe(true)
    expect(deserializeState(serializeState(mid)).royalCaptureBaseline).toEqual(mid.royalCaptureBaseline)
    expect(apply(before, play!, content).royalCaptureBaseline).toEqual(mid.royalCaptureBaseline)
    expect(undo({ states: [before, mid] }).states.at(-1)?.royalCaptureBaseline).toBeNull()

    const capture = legalActions(mid, content).find(
      (action) => action.kind === 'move' && action.from === 'f1' && action.to === 'f6',
    )
    const terminal = apply(mid, capture!, content)
    expect(terminal.result).toEqual({ kind: 'win', winner: 'white', reason: 'king_capture' })
    expect(terminal.royalCaptureBaseline).toBeNull()
  })

  it('clears a non-empty baseline on a forced end turn', () => {
    const fresh = createPosition({
      content,
      presetId: BUNDLED_PRESET_ID,
      seed: 19,
      sideToMove: 'white',
      placements: [W_KING, B_KING],
    })
    const pending = {
      ...fresh,
      turnCard: 'skill.volley',
      royalCaptureBaseline: ['a1>a2'],
      frozenUntil: { a1: { untilPly: 2, sourceId: 'fixture.rule', layer: 'rule' as const } },
    }
    expect(legalActions(pending, content)).toEqual([{ kind: 'end_turn' }])
    const after = apply(pending, { kind: 'end_turn' }, content)
    expect(after.royalCaptureBaseline).toBeNull()
    expect(after.turnCard).toBeNull()
  })

  it('clears the computed baseline when the card itself ends the match', () => {
    const terminalContent = contentWith((source) => {
      source.schemaVersion = 11
      for (const card of source.skillCards) {
        card.royalFollowUp = 'preserve'
        card.protectRelocatedAfterPlay = false
      }
      source.skillCards.push({
        id: 'skill.terminal-probe',
        nameKey: 'skill.terminal-probe.name',
        textKey: 'skill.terminal-probe.text',
        uses: 1,
        royalFollowUp: 'preserve-existing',
        protectRelocatedAfterPlay: false,
        effects: [{ trigger: 'on_play', condition: { kind: 'always' }, actions: [{ kind: 'win', side: 'mover' }] }],
      })
      source.presets[0]!.skillCardIds.push('skill.terminal-probe')
    })
    const before = createPosition({
      content: terminalContent,
      presetId: 'preset.default',
      seed: 23,
      sideToMove: 'white',
      placements: [W_KING, { square: 'f1', pieceId: 'piece.rook', side: 'white' }, B_KING],
      held: { white: ['skill.terminal-probe'], black: [] },
    })
    const play = legalActions(before, terminalContent).find(
      (action) => action.kind === 'play_card' && action.cardId === 'skill.terminal-probe',
    )
    const after = apply(before, play!, terminalContent)
    expect(after.result).toEqual({ kind: 'win', winner: 'white', reason: 'win_action' })
    expect(after.turnCard).toBeNull()
    expect(after.royalCaptureBaseline).toBeNull()
  })

  it('does not offer a quantified skill when every bound subject is royal', () => {
    const quantified = contentWith((source) => {
      source.skillCards.push({
        id: 'skill.royal-probe',
        nameKey: 'skill.royal-probe.name',
        textKey: 'skill.royal-probe.text',
        uses: 1,
        effects: [
          {
            trigger: 'on_play',
            forEach: { kind: 'piece', pieceId: 'piece.king', side: 'mover' },
            condition: { kind: 'always' },
            actions: [
              { kind: 'destroy_piece', target: { kind: 'self' } },
              { kind: 'spawn_piece', pieceId: 'piece.pawn', side: 'mover', at: { kind: 'own_back_rank' } },
            ],
          },
        ],
      } as (typeof source.skillCards)[number])
      source.presets[0]!.skillCardIds.push('skill.royal-probe')
    })
    const before = createPosition({
      content: quantified,
      presetId: 'preset.default',
      seed: 5,
      sideToMove: 'white',
      placements: [W_KING, B_KING],
      held: { white: ['skill.royal-probe'], black: [] },
    })
    const play = legalActions(before, quantified).find(
      (action) => action.kind === 'play_card' && action.cardId === 'skill.royal-probe',
    )
    expect(play).toBeUndefined()
    expect(before.drafts.white.used).not.toContain('skill.royal-probe')
  })

  it('does not offer a revive skill when the captured pool contains only a royal', () => {
    const reviveOnlyRoyal = contentWith((source) => {
      source.skillCards.push({
        id: 'skill.revive-royal-probe',
        nameKey: 'skill.revive-royal-probe.name',
        textKey: 'skill.revive-royal-probe.text',
        uses: 1,
        effects: [
          {
            trigger: 'on_play',
            condition: { kind: 'always' },
            actions: [{ kind: 'revive_piece', side: 'mover', at: { kind: 'own_back_rank' } }],
          },
        ],
      } as (typeof source.skillCards)[number])
      source.presets[0]!.skillCardIds.push('skill.revive-royal-probe')
    })
    const before = createPosition({
      content: reviveOnlyRoyal,
      presetId: 'preset.default',
      seed: 47,
      sideToMove: 'white',
      placements: [W_KING, B_KING],
      held: { white: ['skill.revive-royal-probe'], black: [] },
      captured: { white: ['piece.king'], black: [] },
    })

    expect(
      legalActions(before, reviveOnlyRoyal).some(
        (action) => action.kind === 'play_card' && action.cardId === 'skill.revive-royal-probe',
      ),
    ).toBe(false)
  })

  it('backs up relocation, swap, promotion, freeze, grant, and protection actions', () => {
    const guarded = contentWith((source) => {
      const forPawn = { kind: 'piece', pieceId: 'piece.pawn', side: 'mover' } as const
      const nearby = { kind: 'adjacent_friendly' } as const
      source.skillCards.push({
        id: 'skill.royal-action-probe',
        nameKey: 'skill.royal-action-probe.name',
        textKey: 'skill.royal-action-probe.text',
        uses: 1,
        effects: [
          { trigger: 'on_play', forEach: forPawn, condition: { kind: 'always' }, actions: [{ kind: 'teleport_piece', target: nearby, to: { kind: 'square', square: 'c3' } }] },
          { trigger: 'on_play', forEach: forPawn, condition: { kind: 'always' }, actions: [{ kind: 'promote_piece', target: nearby, to: 'piece.queen' }] },
          { trigger: 'on_play', forEach: forPawn, condition: { kind: 'always' }, actions: [{ kind: 'freeze_piece', target: nearby, plies: 2 }] },
          { trigger: 'on_play', forEach: forPawn, condition: { kind: 'always' }, actions: [{ kind: 'grant_movement', target: nearby, pattern: { kind: 'jump', vectors: [[1, 2]] }, duration: 2 }] },
          { trigger: 'on_play', forEach: forPawn, condition: { kind: 'always' }, actions: [{ kind: 'block_capture', target: nearby, duration: 2 }] },
          { trigger: 'on_play', forEach: forPawn, condition: { kind: 'always' }, actions: [{ kind: 'swap_pieces', a: nearby, b: { kind: 'self' } }] },
        ],
      } as (typeof source.skillCards)[number])
      source.presets[0]!.skillCardIds.push('skill.royal-action-probe')
    })
    const before = createPosition({
      content: guarded,
      presetId: 'preset.default',
      seed: 31,
      sideToMove: 'white',
      placements: [W_KING, { square: 'b2', pieceId: 'piece.pawn', side: 'white' }, B_KING],
      held: { white: ['skill.royal-action-probe'], black: [] },
    })
    const play = legalActions(before, guarded).find(
      (action) => action.kind === 'play_card' && action.cardId === 'skill.royal-action-probe',
    )
    expect(play).toBeDefined()
    const after = apply(before, play!, guarded)

    expect(after.board.get('a1')).toEqual({ pieceId: 'piece.king', side: 'white' })
    expect(after.board.get('b2')).toEqual({ pieceId: 'piece.pawn', side: 'white' })
    expect(after.board.has('c3')).toBe(false)
    expect(after.frozenUntil.a1).toBeUndefined()
    expect(after.grants.some((grant) => grant.square === 'a1')).toBe(false)
  })

  it('does not extend skill immunity to a hostile square effect', () => {
    const before = createPosition({
      content,
      presetId: BUNDLED_PRESET_ID,
      seed: 29,
      sideToMove: 'white',
      placements: [
        { square: 'b2', pieceId: 'piece.king', side: 'white' },
        B_KING,
      ],
    })
    const stepOnBomb = legalActions(before, content).find(
      (action) => action.kind === 'move' && action.from === 'b2' && action.to === 'a3',
    )
    expect(stepOnBomb).toBeDefined()
    const after = apply(before, stepOnBomb!, content)

    expect(after.board.has('a3')).toBe(false)
    expect(after.result).toEqual({ kind: 'win', winner: 'black', reason: 'king_capture' })
  })
})
