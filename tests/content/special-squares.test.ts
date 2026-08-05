import { describe, expect, it } from 'vitest'
import { apply, legalActions } from '@engine/engine'
import { createPosition } from '@engine/match'
import { contentWith, referenceContent } from '../helpers/content'

const content = referenceContent()

const KINGS = [
  { square: 'a1', pieceId: 'piece.king', side: 'white' as const },
  { square: 'f1', pieceId: 'piece.king', side: 'black' as const },
]

/**
 * AC-018 — special squares are content data with content-defined abilities.
 *
 * Each expected outcome is derived from the square type's own written ability
 * and 6x6 geometry, authored before any square-effect code existed. The final
 * case is a null-effect control: it fails if the square layer perturbs
 * unrelated move generation.
 */
describe('AC-018 special squares', () => {
  it('destroys a piece that enters a destroy-on-enter square', () => {
    const set = contentWith((src) => {
      src.boards[0]!.squares = [{ square: 'd4', typeId: 'square.bomb' }]
    })
    const state = createPosition({
      content: set,
      presetId: 'preset.default',
      seed: 1,
      sideToMove: 'white',
      placements: [{ square: 'd1', pieceId: 'piece.rook', side: 'white' }, ...KINGS],
    })
    const onto = legalActions(state, set).find((a) => a.kind === 'move' && a.to === 'd4')!
    const after = apply(state, onto, set)
    expect(after.board.has('d4')).toBe(false) // the rook is gone
    expect(after.sideToMove).toBe('black') // the move still consumed the turn
  })

  it('teleports a piece entering a portal to its paired square', () => {
    const set = contentWith((src) => {
      src.boards[0]!.squares = [
        { square: 'd4', typeId: 'square.portal', pairedWith: 'a6' },
        { square: 'a6', typeId: 'square.portal', pairedWith: 'd4' },
      ]
    })
    const state = createPosition({
      content: set,
      presetId: 'preset.default',
      seed: 1,
      sideToMove: 'white',
      placements: [{ square: 'd1', pieceId: 'piece.rook', side: 'white' }, ...KINGS],
    })
    const onto = legalActions(state, set).find((a) => a.kind === 'move' && a.to === 'd4')!
    const after = apply(state, onto, set)
    expect(after.board.has('d4')).toBe(false)
    expect(after.board.get('a6')?.pieceId).toBe('piece.rook')
  })

  it('promotes a pawn that enters a promote-on-enter square, one rank early', () => {
    const set = contentWith((src) => {
      src.squareTypes.push({
        id: 'square.shrine',
        nameKey: 'square.shrine.name',
        textKey: 'square.shrine.text',
        paired: false,
        effects: [
          {
            trigger: 'on_enter',
            condition: { kind: 'piece_is', pieceId: 'piece.pawn' },
            actions: [{ kind: 'promote_piece', target: { kind: 'entering' }, to: 'piece.queen' }],
          },
        ],
      } as never)
      src.boards[0]!.squares = [{ square: 'd5', typeId: 'square.shrine' }]
    })
    const state = createPosition({
      content: set,
      presetId: 'preset.default',
      seed: 1,
      sideToMove: 'white',
      placements: [{ square: 'd4', pieceId: 'piece.pawn', side: 'white' }, ...KINGS],
    })
    const onto = legalActions(state, set).find((a) => a.kind === 'move' && a.to === 'd5')!
    expect(apply(state, onto, set).board.get('d5')?.pieceId).toBe('piece.queen')
  })

  it('makes the occupant of a sanctuary square uncapturable', () => {
    const set = contentWith((src) => {
      src.squareTypes.push({
        id: 'square.sanctuary',
        nameKey: 'square.sanctuary.name',
        textKey: 'square.sanctuary.text',
        paired: false,
        effects: [
          {
            trigger: 'generate_moves',
            condition: { kind: 'always' },
            actions: [{ kind: 'block_capture', target: { kind: 'occupant' } }],
          },
        ],
      } as never)
      src.boards[0]!.squares = [{ square: 'b2', typeId: 'square.sanctuary' }]
    })
    const state = createPosition({
      content: set,
      presetId: 'preset.default',
      seed: 1,
      sideToMove: 'black',
      placements: [
        { square: 'b2', pieceId: 'piece.pawn', side: 'white' },
        { square: 'b6', pieceId: 'piece.rook', side: 'black' },
        ...KINGS,
      ],
    })
    const targets = legalActions(state, set)
      .filter((a) => a.kind === 'move' && a.from === 'b6')
      .map((a) => (a.kind === 'move' ? a.to : ''))
    expect(targets).not.toContain('b2')
    expect(targets).toContain('b3')
  })

  /**
   * Null-effect control: a square whose type declares no `generate_moves`
   * effect must not perturb move generation at all. Without this, a square
   * layer that quietly filtered or reordered moves would pass every case above.
   */
  it('leaves move generation identical when no square type touches generation', () => {
    const bare = contentWith((src) => {
      src.boards[0]!.squares = []
    })
    const bombed = contentWith((src) => {
      // square.bomb triggers on_enter only — it must be invisible to generation.
      src.boards[0]!.squares = [{ square: 'd4', typeId: 'square.bomb' }]
    })
    const placements = [{ square: 'd1', pieceId: 'piece.rook', side: 'white' as const }, ...KINGS]
    const a = createPosition({ content: bare, presetId: 'preset.default', seed: 1, sideToMove: 'white', placements })
    const b = createPosition({ content: bombed, presetId: 'preset.default', seed: 1, sideToMove: 'white', placements })
    expect(JSON.stringify(legalActions(b, bombed))).toBe(JSON.stringify(legalActions(a, bare)))
  })
})
