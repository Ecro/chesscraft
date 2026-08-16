import { describe, expect, it } from 'vitest'
import { apply, describeRejection, legalActions } from '@engine/engine'
import { createPosition } from '@engine/match'
import { SCHEMA_VERSION } from '@content/schema'
import { contentWith } from '../helpers/content'

describe('board-relative promotion-zone semantics', () => {
  it('uses each board depth and piece side instead of absolute rank lists', () => {
    const content = contentWith((source) => {
      source.schemaVersion = SCHEMA_VERSION
      for (const card of source.skillCards) {
        card.royalFollowUp = 'preserve-existing'
        card.protectRelocatedAfterPlay = false
        card.lockRelocatedAfterPlay = false
      }
      source.boards[0]!.territoryDepth = 3
      source.boards[0]!.promotionDepth = 2
      source.boards[0]!.zones = {}
      source.skillCards.push({
        id: 'skill.promotion-zone-contract',
        nameKey: 'skill.promotion-zone-contract.name',
        textKey: 'skill.promotion-zone-contract.text',
        uses: 1,
        royalFollowUp: 'preserve-existing',
        protectRelocatedAfterPlay: false,
        lockRelocatedAfterPlay: false,
        effects: [
          {
            trigger: 'on_play',
            condition: { kind: 'in_promotion_zone' },
            actions: [
              {
                kind: 'promote_piece',
                target: { kind: 'chosen_friendly', filter: { kind: 'allowed_piece_ids', pieceIds: ['piece.pawn'] } },
                to: 'piece.queen',
              },
            ],
          },
        ],
      })
      source.presets[0]!.skillCardIds.push('skill.promotion-zone-contract')
    })
    const state = createPosition({
      content,
      presetId: 'preset.default',
      seed: 23,
      sideToMove: 'white',
      held: { white: ['skill.promotion-zone-contract'], black: [] },
      placements: [
        { square: 'a1', pieceId: 'piece.king', side: 'white' },
        { square: 'b5', pieceId: 'piece.pawn', side: 'white' },
        { square: 'c4', pieceId: 'piece.pawn', side: 'white' },
        { square: 'f6', pieceId: 'piece.king', side: 'black' },
      ],
    })
    const legal = legalActions(state, content).filter((action) => action.kind === 'play_card' && action.cardId === 'skill.promotion-zone-contract')
    expect(legal.some((action) => action.kind === 'play_card' && action.targets[0] === 'b5')).toBe(true)
    expect(legal.some((action) => action.kind === 'play_card' && action.targets[0] === 'c4')).toBe(false)
    const forged = { kind: 'play_card' as const, cardId: 'skill.promotion-zone-contract', targets: ['c4'] }
    expect(describeRejection(state, forged, content)).toBe('card-bad-targets')
    expect(apply(state, forged, content)).toEqual(state)
    const valid = legal.find((action) => action.kind === 'play_card' && action.targets[0] === 'b5')!
    expect(apply(state, valid, content).board.get('b5')?.pieceId).toBe('piece.queen')
  })
})
