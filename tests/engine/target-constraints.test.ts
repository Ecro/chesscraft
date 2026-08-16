import { describe, expect, it } from 'vitest'
import { apply, describeRejection, legalActions } from '@engine/engine'
import { createPosition } from '@engine/match'
import { contentWith } from '../helpers/content'

function constrainedContent() {
  return contentWith((source) => {
    source.skillCards.push(
      {
        id: 'skill.constraint-probe',
        nameKey: 'skill.constraint-probe.name',
        textKey: 'skill.constraint-probe.text',
        uses: 1,
        effects: [
          {
            trigger: 'on_play',
            condition: { kind: 'always' },
            actions: [
              {
                kind: 'teleport_piece',
                target: {
                  kind: 'chosen_friendly',
                  filter: { kind: 'allowed_piece_ids', pieceIds: ['piece.rook'] },
                },
                to: { kind: 'chosen_empty', region: 'own_territory' },
              },
            ],
          },
        ],
      },
      {
        id: 'skill.adjacency-probe',
        nameKey: 'skill.adjacency-probe.name',
        textKey: 'skill.adjacency-probe.text',
        uses: 1,
        effects: [
          {
            trigger: 'on_play',
            condition: { kind: 'always' },
            actions: [
              {
                kind: 'swap_pieces',
                a: { kind: 'chosen_friendly' },
                b: { kind: 'chosen_friendly', relation: { kind: 'adjacent_to_choice', choiceIndex: 0 } },
              },
            ],
          },
        ],
      },
      {
        id: 'skill.exclude-probe',
        nameKey: 'skill.exclude-probe.name',
        textKey: 'skill.exclude-probe.text',
        uses: 1,
        effects: [
          {
            trigger: 'on_play',
            condition: { kind: 'always' },
            actions: [{ kind: 'destroy_piece', target: { kind: 'chosen_friendly', filter: { kind: 'exclude_piece_ids', pieceIds: ['piece.pawn'] } } }],
          },
        ],
      },
      {
        id: 'skill.region-probe',
        nameKey: 'skill.region-probe.name',
        textKey: 'skill.region-probe.text',
        uses: 1,
        effects: [
          {
            trigger: 'on_play',
            condition: { kind: 'always' },
            actions: [
              {
                kind: 'teleport_piece',
                target: { kind: 'chosen_friendly', filter: { kind: 'non_royal' } },
                to: { kind: 'chosen_empty', region: 'opponent_territory' },
              },
            ],
          },
        ],
      },
      {
        id: 'skill.local-probe',
        nameKey: 'skill.local-probe.name',
        textKey: 'skill.local-probe.text',
        uses: 1,
        effects: [
          {
            trigger: 'on_play',
            condition: { kind: 'always' },
            actions: [
              {
                kind: 'teleport_piece',
                target: { kind: 'chosen_friendly', filter: { kind: 'non_royal' } },
                to: { kind: 'chosen_empty', region: 'local' },
              },
            ],
          },
        ],
      },
      {
        id: 'skill.spawn-region-probe',
        nameKey: 'skill.spawn-region-probe.name',
        textKey: 'skill.spawn-region-probe.text',
        uses: 1,
        effects: [
          {
            trigger: 'on_play',
            condition: { kind: 'always' },
            actions: [{ kind: 'spawn_piece', pieceId: 'piece.pawn', side: 'mover', at: { kind: 'chosen_empty', region: 'own_territory' } }],
          },
        ],
      },
      {
        id: 'skill.revive-region-probe',
        nameKey: 'skill.revive-region-probe.name',
        textKey: 'skill.revive-region-probe.text',
        uses: 1,
        effects: [
          {
            trigger: 'on_play',
            condition: { kind: 'always' },
            actions: [{ kind: 'revive_piece', side: 'mover', except: ['piece.king'], at: { kind: 'chosen_empty', region: 'own_territory' } }],
          },
        ],
      },
    )
    source.presets[0]!.skillCardIds.push(
      'skill.constraint-probe',
      'skill.adjacency-probe',
      'skill.exclude-probe',
      'skill.region-probe',
      'skill.local-probe',
      'skill.spawn-region-probe',
      'skill.revive-region-probe',
    )
  })
}

function position(content: ReturnType<typeof constrainedContent>, held: string[], placements: Array<{ square: string; pieceId: string; side: 'white' | 'black' }>) {
  return createPosition({
    content,
    presetId: 'preset.default',
    seed: 17,
    sideToMove: 'white',
    held: { white: held, black: [] },
    placements,
  })
}

describe('schema-v13 target and region constraints', () => {
  it('S1 keeps generated and forged target actions in parity for filters and own territory', () => {
    const content = constrainedContent()
    const before = position(content, ['skill.constraint-probe'], [
      { square: 'a1', pieceId: 'piece.king', side: 'white' },
      { square: 'b2', pieceId: 'piece.rook', side: 'white' },
      { square: 'c2', pieceId: 'piece.pawn', side: 'white' },
      { square: 'f6', pieceId: 'piece.king', side: 'black' },
    ])
    const legal = legalActions(before, content).filter((action) => action.kind === 'play_card' && action.cardId === 'skill.constraint-probe')

    expect(legal.some((action) => action.kind === 'play_card' && action.targets[0] === 'b2' && action.targets[1] === 'a2')).toBe(true)
    expect(legal.some((action) => action.kind === 'play_card' && action.targets[0] === 'c2')).toBe(false)
    expect(legal.some((action) => action.kind === 'play_card' && action.targets[1] === 'a6')).toBe(false)

    const valid = legal.find((action) => action.kind === 'play_card' && action.targets[0] === 'b2' && action.targets[1] === 'a2')!
    const moved = apply(before, valid, content)
    expect(moved.board.get('b2')).toBeUndefined()
    expect(moved.board.get('a2')).toEqual({ pieceId: 'piece.rook', side: 'white' })

    const forbiddenTarget = { kind: 'play_card' as const, cardId: 'skill.constraint-probe', targets: ['c2', 'a2'] }
    const forbiddenRegion = { kind: 'play_card' as const, cardId: 'skill.constraint-probe', targets: ['b2', 'a6'] }
    expect(describeRejection(before, forbiddenTarget, content)).toBe('card-bad-targets')
    expect(describeRejection(before, forbiddenRegion, content)).toBe('card-bad-targets')
    expect(apply(before, forbiddenTarget, content)).toEqual(before)
    expect(apply(before, forbiddenRegion, content)).toEqual(before)
  })

  it('S2 requires a chosen relation target to be adjacent to the earlier choice for both sides', () => {
    const content = constrainedContent()
    const before = position(content, ['skill.adjacency-probe'], [
      { square: 'a1', pieceId: 'piece.king', side: 'white' },
      { square: 'b2', pieceId: 'piece.rook', side: 'white' },
      { square: 'c3', pieceId: 'piece.pawn', side: 'white' },
      { square: 'd5', pieceId: 'piece.rook', side: 'white' },
      { square: 'f6', pieceId: 'piece.king', side: 'black' },
    ])
    const legal = legalActions(before, content).filter((action) => action.kind === 'play_card' && action.cardId === 'skill.adjacency-probe')

    expect(legal.some((action) => action.kind === 'play_card' && action.targets[0] === 'b2' && action.targets[1] === 'c3')).toBe(true)
    expect(legal.some((action) => action.kind === 'play_card' && action.targets[0] === 'b2' && action.targets[1] === 'd5')).toBe(false)
    expect(
      describeRejection(before, { kind: 'play_card', cardId: 'skill.adjacency-probe', targets: ['b2', 'd5'] }, content),
    ).toBe('card-bad-targets')
    const whiteForged = { kind: 'play_card' as const, cardId: 'skill.adjacency-probe', targets: ['b2', 'd5'] }
    expect(apply(before, whiteForged, content)).toEqual(before)
    const valid = legal.find((action) => action.kind === 'play_card' && action.targets[0] === 'b2' && action.targets[1] === 'c3')!
    const swapped = apply(before, valid, content)
    expect(swapped.board.get('b2')).toEqual({ pieceId: 'piece.pawn', side: 'white' })
    expect(swapped.board.get('c3')).toEqual({ pieceId: 'piece.rook', side: 'white' })

    const black = createPosition({
      content,
      presetId: 'preset.default',
      seed: 18,
      sideToMove: 'black' as const,
      held: { white: [], black: ['skill.adjacency-probe'] },
      placements: [
        { square: 'a1', pieceId: 'piece.king', side: 'white' },
        { square: 'f6', pieceId: 'piece.king', side: 'black' },
        { square: 'b5', pieceId: 'piece.rook', side: 'black' },
        { square: 'c4', pieceId: 'piece.pawn', side: 'black' },
        { square: 'd2', pieceId: 'piece.rook', side: 'black' },
      ],
    })
    const blackLegal = legalActions(black, content).filter((action) => action.kind === 'play_card' && action.cardId === 'skill.adjacency-probe')
    expect(blackLegal.some((action) => action.kind === 'play_card' && action.targets[0] === 'b5' && action.targets[1] === 'c4')).toBe(true)
    expect(blackLegal.some((action) => action.kind === 'play_card' && action.targets[0] === 'b5' && action.targets[1] === 'd2')).toBe(false)
    const blackValid = blackLegal.find((action) => action.kind === 'play_card' && action.targets[0] === 'b5' && action.targets[1] === 'c4')!
    const blackSwapped = apply(black, blackValid, content)
    expect(blackSwapped.board.get('b5')).toEqual({ pieceId: 'piece.pawn', side: 'black' })
    expect(blackSwapped.board.get('c4')).toEqual({ pieceId: 'piece.rook', side: 'black' })
    const blackForged = { kind: 'play_card' as const, cardId: 'skill.adjacency-probe', targets: ['b5', 'd2'] }
    expect(describeRejection(black, blackForged, content)).toBe('card-bad-targets')
    expect(apply(black, blackForged, content)).toEqual(black)
  })

  it('S3 does not let an effect with an allowed-piece filter target a royal through apply', () => {
    const content = constrainedContent()
    const before = position(content, ['skill.constraint-probe'], [
      { square: 'a1', pieceId: 'piece.king', side: 'white' },
      { square: 'b2', pieceId: 'piece.rook', side: 'white' },
      { square: 'f6', pieceId: 'piece.king', side: 'black' },
    ])
    const forged = { kind: 'play_card' as const, cardId: 'skill.constraint-probe', targets: ['a1', 'a2'] }
    expect(describeRejection(before, forged, content)).toBe('royal-skill-immune')
    expect(apply(before, forged, content).board).toEqual(before.board)
  })

  it('S5 applies chosen-empty regions to spawn and revive in generation and apply', () => {
    const content = constrainedContent()
    const spawn = position(content, ['skill.spawn-region-probe'], [
      { square: 'a1', pieceId: 'piece.king', side: 'white' },
      { square: 'f6', pieceId: 'piece.king', side: 'black' },
    ])
    const spawnLegal = legalActions(spawn, content).filter((action) => action.kind === 'play_card' && action.cardId === 'skill.spawn-region-probe')
    expect(spawnLegal.some((action) => action.kind === 'play_card' && action.targets[0] === 'a2')).toBe(true)
    expect(spawnLegal.some((action) => action.kind === 'play_card' && action.targets[0] === 'a5')).toBe(false)
    expect(apply(spawn, { kind: 'play_card', cardId: 'skill.spawn-region-probe', targets: ['a5'] }, content)).toEqual(spawn)
    const spawnMove = spawnLegal.find((action) => action.kind === 'play_card' && action.targets[0] === 'a2')!
    expect(apply(spawn, spawnMove, content).board.get('a2')).toEqual({ pieceId: 'piece.pawn', side: 'white' })

    const revive = createPosition({
      content,
      presetId: 'preset.default',
      seed: 17,
      sideToMove: 'white',
      held: { white: ['skill.revive-region-probe'], black: [] },
      captured: { white: ['piece.pawn'], black: [] },
      placements: [
        { square: 'a1', pieceId: 'piece.king', side: 'white' },
        { square: 'f6', pieceId: 'piece.king', side: 'black' },
      ],
    })
    const reviveLegal = legalActions(revive, content).filter((action) => action.kind === 'play_card' && action.cardId === 'skill.revive-region-probe')
    expect(reviveLegal.some((action) => action.kind === 'play_card' && action.targets[0] === 'a2')).toBe(true)
    expect(reviveLegal.some((action) => action.kind === 'play_card' && action.targets[0] === 'a5')).toBe(false)
    expect(apply(revive, { kind: 'play_card', cardId: 'skill.revive-region-probe', targets: ['a5'] }, content)).toEqual(revive)
  })
})

describe('promotion-zone condition', () => {
  it('S4 is board-relative and symmetric for white and black subjects, including forged apply', () => {
    const content = contentWith((source) => {
      source.skillCards.push({
        id: 'skill.promotion-zone-probe',
        nameKey: 'skill.promotion-zone-probe.name',
        textKey: 'skill.promotion-zone-probe.text',
        uses: 1,
        effects: [
          {
            trigger: 'on_play',
            condition: { kind: 'in_promotion_zone' },
            actions: [{ kind: 'promote_piece', target: { kind: 'chosen_friendly', filter: { kind: 'allowed_piece_ids', pieceIds: ['piece.pawn'] } }, to: 'piece.queen' }],
          },
        ],
      })
      source.presets[0]!.skillCardIds.push('skill.promotion-zone-probe')
    })

    const white = createPosition({
      content,
      presetId: 'preset.default',
      seed: 2,
      sideToMove: 'white',
      held: { white: ['skill.promotion-zone-probe'], black: [] },
      placements: [
        { square: 'a1', pieceId: 'piece.king', side: 'white' },
        { square: 'b6', pieceId: 'piece.pawn', side: 'white' },
        { square: 'c3', pieceId: 'piece.pawn', side: 'white' },
        { square: 'f6', pieceId: 'piece.king', side: 'black' },
        { square: 'e1', pieceId: 'piece.pawn', side: 'black' },
      ],
    })
    const black = {
      ...white,
      sideToMove: 'black' as const,
      drafts: { white: { ...white.drafts.white, held: [] }, black: { ...white.drafts.black, held: ['skill.promotion-zone-probe'], everOffered: ['skill.promotion-zone-probe'] } },
    }

    expect(legalActions(white, content).some((action) => action.kind === 'play_card' && action.targets[0] === 'b6')).toBe(true)
    expect(legalActions(white, content).some((action) => action.kind === 'play_card' && action.targets[0] === 'e1')).toBe(false)
    expect(legalActions(black, content).some((action) => action.kind === 'play_card' && action.targets[0] === 'e1')).toBe(true)
    expect(legalActions(black, content).some((action) => action.kind === 'play_card' && action.targets[0] === 'b6')).toBe(false)

    const whiteValid = legalActions(white, content).find((action) => action.kind === 'play_card' && action.targets[0] === 'b6')!
    expect(apply(white, whiteValid, content).board.get('b6')?.pieceId).toBe('piece.queen')
    const whiteForged = { kind: 'play_card' as const, cardId: 'skill.promotion-zone-probe', targets: ['c3'] }
    expect(describeRejection(white, whiteForged, content)).toBe('card-bad-targets')
    expect(apply(white, whiteForged, content)).toEqual(white)
    const blackValid = legalActions(black, content).find((action) => action.kind === 'play_card' && action.targets[0] === 'e1')!
    expect(apply(black, blackValid, content).board.get('e1')?.pieceId).toBe('piece.queen')
    const blackWithOutOfZonePawn = {
      ...black,
      board: new Map([...black.board, ['e2', { pieceId: 'piece.pawn', side: 'black' as const }]]),
    }
    const blackForged = { kind: 'play_card' as const, cardId: 'skill.promotion-zone-probe', targets: ['e2'] }
    expect(describeRejection(blackWithOutOfZonePawn, blackForged, content)).toBe('card-bad-targets')
    expect(apply(blackWithOutOfZonePawn, blackForged, content)).toEqual(blackWithOutOfZonePawn)
  })

  it('S5 covers excluded ids, opponent territory, and a bounded local region', () => {
    const content = constrainedContent()
    const before = position(content, ['skill.exclude-probe'], [
      { square: 'a1', pieceId: 'piece.king', side: 'white' },
      { square: 'b2', pieceId: 'piece.rook', side: 'white' },
      { square: 'c2', pieceId: 'piece.pawn', side: 'white' },
      { square: 'f6', pieceId: 'piece.king', side: 'black' },
    ])
    const excludeActions = legalActions(before, content).filter((action) => action.kind === 'play_card' && action.cardId === 'skill.exclude-probe')
    expect(excludeActions.some((action) => action.kind === 'play_card' && action.targets[0] === 'b2')).toBe(true)
    expect(excludeActions.some((action) => action.kind === 'play_card' && action.targets[0] === 'c2')).toBe(false)
    const excludedForged = { kind: 'play_card' as const, cardId: 'skill.exclude-probe', targets: ['c2'] }
    expect(describeRejection(before, excludedForged, content)).toBe('card-bad-targets')
    expect(apply(before, excludedForged, content)).toEqual(before)

    const regionState = position(content, ['skill.region-probe'], [
      { square: 'a1', pieceId: 'piece.king', side: 'white' },
      { square: 'b2', pieceId: 'piece.rook', side: 'white' },
      { square: 'f6', pieceId: 'piece.king', side: 'black' },
    ])
    const regionActions = legalActions(regionState, content).filter((action) => action.kind === 'play_card' && action.cardId === 'skill.region-probe')
    expect(regionActions.some((action) => action.kind === 'play_card' && action.targets[0] === 'b2' && action.targets[1] === 'a6')).toBe(true)
    expect(regionActions.some((action) => action.kind === 'play_card' && action.targets[1] === 'a2')).toBe(false)
    const regionValid = regionActions.find((action) => action.kind === 'play_card' && action.targets[0] === 'b2' && action.targets[1] === 'a6')!
    expect(apply(regionState, regionValid, content).board.get('a6')).toEqual({ pieceId: 'piece.rook', side: 'white' })
    const regionForged = { kind: 'play_card' as const, cardId: 'skill.region-probe', targets: ['b2', 'a2'] }
    expect(describeRejection(regionState, regionForged, content)).toBe('card-bad-targets')
    expect(apply(regionState, regionForged, content)).toEqual(regionState)

    const localState = position(content, ['skill.local-probe'], [
      { square: 'a1', pieceId: 'piece.king', side: 'white' },
      { square: 'b2', pieceId: 'piece.rook', side: 'white' },
      { square: 'f6', pieceId: 'piece.king', side: 'black' },
    ])
    const localActions = legalActions(localState, content).filter((action) => action.kind === 'play_card' && action.cardId === 'skill.local-probe')
    expect(localActions.some((action) => action.kind === 'play_card' && action.targets[0] === 'b2' && action.targets[1] === 'c3')).toBe(true)
    expect(localActions.some((action) => action.kind === 'play_card' && action.targets[0] === 'b2' && action.targets[1] === 'e6')).toBe(false)
    const localValid = localActions.find((action) => action.kind === 'play_card' && action.targets[0] === 'b2' && action.targets[1] === 'c3')!
    expect(apply(localState, localValid, content).board.get('c3')).toEqual({ pieceId: 'piece.rook', side: 'white' })
    const localForged = { kind: 'play_card' as const, cardId: 'skill.local-probe', targets: ['b2', 'e6'] }
    expect(describeRejection(localState, localForged, content)).toBe('card-bad-targets')
    expect(apply(localState, localForged, content)).toEqual(localState)
  })

  it('S6 mirrors target filters, regions, and forged promotion checks for black', () => {
    const content = constrainedContent()
    const ownState = position(content, ['skill.constraint-probe'], [
      { square: 'a1', pieceId: 'piece.king', side: 'white' },
      { square: 'b5', pieceId: 'piece.rook', side: 'black' },
      { square: 'c5', pieceId: 'piece.pawn', side: 'black' },
      { square: 'f6', pieceId: 'piece.king', side: 'black' },
    ])
    const blackOwn = {
      ...ownState,
      sideToMove: 'black' as const,
      drafts: {
        white: { ...ownState.drafts.white, held: [] },
        black: { ...ownState.drafts.black, held: ['skill.constraint-probe'], everOffered: ['skill.constraint-probe'] },
      },
    }
    const ownActions = legalActions(blackOwn, content).filter((action) => action.kind === 'play_card' && action.cardId === 'skill.constraint-probe')
    expect(ownActions.some((action) => action.kind === 'play_card' && action.targets[0] === 'b5' && action.targets[1] === 'a6')).toBe(true)
    expect(ownActions.some((action) => action.kind === 'play_card' && action.targets[0] === 'f6')).toBe(false)
    expect(ownActions.some((action) => action.kind === 'play_card' && action.targets[1] === 'a2')).toBe(false)
    const ownValid = ownActions.find((action) => action.kind === 'play_card' && action.targets[0] === 'b5' && action.targets[1] === 'a6')!
    expect(apply(blackOwn, ownValid, content).board.get('a6')).toEqual({ pieceId: 'piece.rook', side: 'black' })
    const ownForged = { kind: 'play_card' as const, cardId: 'skill.constraint-probe', targets: ['b5', 'a2'] }
    expect(describeRejection(blackOwn, ownForged, content)).toBe('card-bad-targets')
    expect(apply(blackOwn, ownForged, content)).toEqual(blackOwn)

    const excludeBase = { ...blackOwn, drafts: { ...blackOwn.drafts, black: { ...blackOwn.drafts.black, held: ['skill.exclude-probe'], everOffered: ['skill.exclude-probe'] } } }
    const blackExclude = legalActions(excludeBase, content).filter((action) => action.kind === 'play_card' && action.cardId === 'skill.exclude-probe')
    expect(blackExclude.some((action) => action.kind === 'play_card' && action.targets[0] === 'b5')).toBe(true)
    expect(blackExclude.some((action) => action.kind === 'play_card' && action.targets[0] === 'c5')).toBe(false)
    const excludeForged = { kind: 'play_card' as const, cardId: 'skill.exclude-probe', targets: ['c5'] }
    expect(describeRejection(excludeBase, excludeForged, content)).toBe('card-bad-targets')
    expect(apply(excludeBase, excludeForged, content)).toEqual(excludeBase)

    const regionBase = { ...blackOwn, drafts: { ...blackOwn.drafts, black: { ...blackOwn.drafts.black, held: ['skill.region-probe'], everOffered: ['skill.region-probe'] } } }
    const blackRegion = legalActions(regionBase, content).filter((action) => action.kind === 'play_card' && action.cardId === 'skill.region-probe')
    expect(blackRegion.some((action) => action.kind === 'play_card' && action.targets[0] === 'b5' && action.targets[1] === 'a2')).toBe(true)
    expect(blackRegion.some((action) => action.kind === 'play_card' && action.targets[1] === 'a6')).toBe(false)
    const regionForged = { kind: 'play_card' as const, cardId: 'skill.region-probe', targets: ['b5', 'a6'] }
    expect(describeRejection(regionBase, regionForged, content)).toBe('card-bad-targets')
    expect(apply(regionBase, regionForged, content)).toEqual(regionBase)

    const localBase = { ...blackOwn, drafts: { ...blackOwn.drafts, black: { ...blackOwn.drafts.black, held: ['skill.local-probe'], everOffered: ['skill.local-probe'] } } }
    const blackLocal = legalActions(localBase, content).filter((action) => action.kind === 'play_card' && action.cardId === 'skill.local-probe')
    expect(blackLocal.some((action) => action.kind === 'play_card' && action.targets[0] === 'b5' && action.targets[1] === 'c4')).toBe(true)
    expect(blackLocal.some((action) => action.kind === 'play_card' && action.targets[1] === 'e1')).toBe(false)
    const localForged = { kind: 'play_card' as const, cardId: 'skill.local-probe', targets: ['b5', 'e1'] }
    expect(describeRejection(localBase, localForged, content)).toBe('card-bad-targets')
    expect(apply(localBase, localForged, content)).toEqual(localBase)

    const royalBase = { ...blackOwn, drafts: { ...blackOwn.drafts, black: { ...blackOwn.drafts.black, held: ['skill.constraint-probe'], everOffered: ['skill.constraint-probe'] } } }
    const royalForged = { kind: 'play_card' as const, cardId: 'skill.constraint-probe', targets: ['f6', 'a6'] }
    expect(describeRejection(royalBase, royalForged, content)).toBe('royal-skill-immune')
    expect(apply(royalBase, royalForged, content)).toEqual(royalBase)

    const promotion = contentWith((source) => {
      source.skillCards.push({
        id: 'skill.black-promotion-probe',
        nameKey: 'skill.black-promotion-probe.name',
        textKey: 'skill.black-promotion-probe.text',
        uses: 1,
        effects: [{ trigger: 'on_play', condition: { kind: 'in_promotion_zone' }, actions: [{ kind: 'promote_piece', target: { kind: 'chosen_friendly', filter: { kind: 'allowed_piece_ids', pieceIds: ['piece.pawn'] } }, to: 'piece.queen' }] }],
      })
      source.presets[0]!.skillCardIds.push('skill.black-promotion-probe')
    })
    const promotionState = createPosition({
      content: promotion,
      presetId: 'preset.default',
      seed: 19,
      sideToMove: 'black',
      held: { white: [], black: ['skill.black-promotion-probe'] },
      placements: [
        { square: 'a1', pieceId: 'piece.king', side: 'white' },
        { square: 'e1', pieceId: 'piece.pawn', side: 'black' },
        { square: 'e2', pieceId: 'piece.pawn', side: 'black' },
        { square: 'f6', pieceId: 'piece.king', side: 'black' },
      ],
    })
    const promotionForged = { kind: 'play_card' as const, cardId: 'skill.black-promotion-probe', targets: ['e2'] }
    expect(describeRejection(promotionState, promotionForged, promotion)).toBe('card-bad-targets')
    expect(apply(promotionState, promotionForged, promotion)).toEqual(promotionState)
  })
})
