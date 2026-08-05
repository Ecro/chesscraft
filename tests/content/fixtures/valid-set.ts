/**
 * The reference valid content source.
 *
 * Hand-authored before the validator exists (SPEC oracle evidence for AC-011).
 * It is deliberately small — the bundled 10 rule / 14 skill / 4 square set is
 * Phase 6b work — but it exercises every axis and every cross-reference the
 * validator must check.
 */

type Vec = readonly [number, number]

const ORTHOGONAL: Vec[] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
]
const DIAGONAL: Vec[] = [
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
]
const KNIGHT: Vec[] = [
  [1, 2],
  [2, 1],
  [2, -1],
  [1, -2],
  [-1, -2],
  [-2, -1],
  [-2, 1],
  [-1, 2],
]

const backRank = ['piece.rook', 'piece.knight', 'piece.queen', 'piece.king', 'piece.knight', 'piece.rook']
const files = ['a', 'b', 'c', 'd', 'e', 'f']

function losAlamosPlacements() {
  const placements: Array<{ square: string; pieceId: string; side: 'white' | 'black' }> = []
  for (const [i, file] of files.entries()) {
    placements.push({ square: `${file}1`, pieceId: backRank[i]!, side: 'white' })
    placements.push({ square: `${file}2`, pieceId: 'piece.pawn', side: 'white' })
    placements.push({ square: `${file}5`, pieceId: 'piece.pawn', side: 'black' })
    placements.push({ square: `${file}6`, pieceId: backRank[i]!, side: 'black' })
  }
  return placements
}

export const validContentSource = {
  schemaVersion: 1,

  pieces: [
    {
      id: 'piece.king',
      nameKey: 'piece.king.name',
      textKey: 'piece.king.text',
      movement: [{ kind: 'step', vectors: [...ORTHOGONAL, ...DIAGONAL] }],
      effects: [],
    },
    {
      id: 'piece.queen',
      nameKey: 'piece.queen.name',
      textKey: 'piece.queen.text',
      movement: [{ kind: 'slide', vectors: [...ORTHOGONAL, ...DIAGONAL] }],
      effects: [],
    },
    {
      id: 'piece.rook',
      nameKey: 'piece.rook.name',
      textKey: 'piece.rook.text',
      movement: [{ kind: 'slide', vectors: ORTHOGONAL }],
      effects: [],
    },
    {
      id: 'piece.knight',
      nameKey: 'piece.knight.name',
      textKey: 'piece.knight.text',
      movement: [{ kind: 'jump', vectors: KNIGHT }],
      effects: [],
    },
    {
      id: 'piece.pawn',
      nameKey: 'piece.pawn.name',
      textKey: 'piece.pawn.text',
      movement: [{ kind: 'step', vectors: [[0, 1]], forward: true }],
      attack: [{ kind: 'step', vectors: [[1, 1], [-1, 1]], forward: true }],
      promotion: { onRank: 'last', to: 'piece.queen' },
      effects: [],
    },
    {
      // Movement and attack deliberately differ, and a passive is attached —
      // this is the piece AC-009's golden table calls `custom_archer`.
      id: 'piece.archer',
      nameKey: 'piece.archer.name',
      textKey: 'piece.archer.text',
      movement: [{ kind: 'step', vectors: [...ORTHOGONAL, ...DIAGONAL] }],
      attack: [{ kind: 'jump', vectors: [[2, 0], [-2, 0], [0, 2], [0, -2]] }],
      effects: [
        {
          trigger: 'generate_moves',
          condition: { kind: 'always' },
          actions: [{ kind: 'block_capture', target: { kind: 'adjacent_friendly' } }],
        },
      ],
    },
  ],

  squareTypes: [
    {
      id: 'square.bomb',
      nameKey: 'square.bomb.name',
      textKey: 'square.bomb.text',
      paired: false,
      effects: [
        {
          trigger: 'on_enter',
          condition: { kind: 'always' },
          actions: [{ kind: 'destroy_piece', target: { kind: 'entering' } }],
        },
      ],
    },
    {
      id: 'square.portal',
      nameKey: 'square.portal.name',
      textKey: 'square.portal.text',
      paired: true,
      effects: [
        {
          trigger: 'on_enter',
          condition: { kind: 'always' },
          actions: [{ kind: 'teleport_piece', target: { kind: 'entering' }, to: { kind: 'paired_square' } }],
        },
      ],
    },
  ],

  ruleCards: [
    {
      id: 'rule.king-of-the-hill',
      nameKey: 'rule.king-of-the-hill.name',
      textKey: 'rule.king-of-the-hill.text',
      cost: 3,
      effects: [
        {
          trigger: 'end_of_ply',
          condition: {
            kind: 'all',
            of: [
              { kind: 'piece_is', pieceId: 'piece.king' },
              { kind: 'on_square', squares: ['c3', 'c4', 'd3', 'd4'] },
            ],
          },
          actions: [{ kind: 'win', side: 'mover' }],
        },
      ],
    },
  ],

  skillCards: [
    {
      id: 'skill.teleport',
      nameKey: 'skill.teleport.name',
      textKey: 'skill.teleport.text',
      cost: 4,
      uses: 1,
      effects: [
        {
          trigger: 'on_play',
          condition: { kind: 'always' },
          actions: [{ kind: 'teleport_piece', target: { kind: 'chosen_friendly' }, to: { kind: 'chosen_empty' } }],
        },
      ],
    },
    {
      id: 'skill.freeze',
      nameKey: 'skill.freeze.name',
      textKey: 'skill.freeze.text',
      cost: 4,
      uses: 1,
      effects: [
        {
          trigger: 'on_play',
          condition: { kind: 'always' },
          actions: [{ kind: 'freeze_piece', target: { kind: 'chosen_enemy' }, plies: 2 }],
        },
      ],
    },
    {
      id: 'skill.coronation',
      nameKey: 'skill.coronation.name',
      textKey: 'skill.coronation.text',
      cost: 3,
      uses: 1,
      effects: [
        {
          trigger: 'on_play',
          condition: { kind: 'piece_is', pieceId: 'piece.pawn' },
          actions: [{ kind: 'promote_piece', target: { kind: 'chosen_friendly' }, to: 'piece.queen' }],
        },
      ],
    },
  ],

  boards: [
    {
      id: 'board.los-alamos',
      nameKey: 'board.los-alamos.name',
      width: 6,
      height: 6,
      placements: losAlamosPlacements(),
      squares: [
        { square: 'a1', typeId: 'square.portal', pairedWith: 'f6' },
        { square: 'f6', typeId: 'square.portal', pairedWith: 'a1' },
      ],
    },
  ],

  presets: [
    {
      id: 'preset.default',
      nameKey: 'preset.default.name',
      boardId: 'board.los-alamos',
      pieceIds: ['piece.king', 'piece.queen', 'piece.rook', 'piece.knight', 'piece.pawn'],
      ruleCardIds: ['rule.king-of-the-hill'],
      skillCardIds: ['skill.teleport', 'skill.freeze', 'skill.coronation'],
    },
  ],
}

export type ContentSource = typeof validContentSource

/** Deep-clones the reference source so a fixture can corrupt exactly one field. */
export function cloneValid(): ContentSource {
  return structuredClone(validContentSource) as ContentSource
}
