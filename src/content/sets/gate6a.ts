import { type ContentSet, type ContentSource, loadContentSet } from '../load'

/**
 * The five highest-schema-risk items, authored (PLAN Phase 6a, ADR-011).
 *
 * Selection and scores: work-docs/RISK-RANKING-variant-chess-6x6-cards.md.
 * The whole 28-card set and what each card needs: work-docs/CARDSET-*.md.
 *
 * These are real cards headed for the bundled set, not fixtures — the point of
 * gating them here is that authoring them is what proves the schema v2 additions
 * (`forEach`, `revive_piece`, a working `own_back_rank`, an evaluated
 * `check_count_at_least`) are the right shape before Phase 5 builds forms over
 * them and Phase 6b writes the other twenty-three.
 */

const ORTHOGONAL: Array<[number, number]> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
]
const DIAGONAL: Array<[number, number]> = [
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
]

export const GATE6A_PRESET_ID = 'preset.gate6a'
export const GATE6A_BOARD_ID = 'board.gate6a'

export const gate6aContentSource: ContentSource = {
  schemaVersion: 2,

  pieces: [
    {
      id: 'piece.king',
      nameKey: 'piece.king.name',
      textKey: 'piece.king.text',
      movement: [{ kind: 'step', vectors: [...ORTHOGONAL, ...DIAGONAL] }],
      royal: true,
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
      id: 'piece.archer',
      nameKey: 'piece.archer.name',
      textKey: 'piece.archer.text',
      movement: [{ kind: 'step', vectors: [...ORTHOGONAL, ...DIAGONAL] }],
      attack: [
        {
          kind: 'jump',
          vectors: [
            [2, 0],
            [-2, 0],
            [0, 2],
            [0, -2],
          ],
        },
      ],
      effects: [
        {
          trigger: 'generate_moves',
          condition: { kind: 'always' },
          actions: [{ kind: 'block_capture', target: { kind: 'adjacent_friendly' } }],
        },
      ],
    },
    {
      id: 'piece.pawn',
      nameKey: 'piece.pawn.name',
      textKey: 'piece.pawn.text',
      movement: [{ kind: 'step', vectors: [[0, 1]], forward: true }],
      attack: [
        {
          kind: 'step',
          vectors: [
            [1, 1],
            [-1, 1],
          ],
          forward: true,
        },
      ],
      promotion: { onRank: 'last', to: 'piece.rook' },
      effects: [],
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
  ],

  ruleCards: [
    {
      // Rank 1 — a `win` driven by a counter rather than a board position, and
      // the reason check detection exists at all.
      id: 'rule.three-check',
      nameKey: 'rule.three-check.name',
      textKey: 'rule.three-check.text',
      cost: 5,
      effects: [
        {
          trigger: 'end_of_ply',
          condition: { kind: 'check_count_at_least', n: 3 },
          actions: [{ kind: 'win', side: 'mover' }],
        },
      ],
    },
    {
      // Rank 2 — the card `forEach` exists for. A rule card owns no square, so
      // before v2 `adjacent_friendly` here resolved to nothing at all. Bound per
      // king and for BOTH sides: a public rule is not a gift to one player.
      id: 'rule.royal-bodyguard',
      nameKey: 'rule.royal-bodyguard.name',
      textKey: 'rule.royal-bodyguard.text',
      cost: 4,
      effects: [
        {
          trigger: 'generate_moves',
          forEach: { kind: 'piece', pieceId: 'piece.king', side: 'any' },
          condition: { kind: 'always' },
          actions: [{ kind: 'block_capture', target: { kind: 'adjacent_friendly' } }],
        },
      ],
    },
    {
      // Rank 5 — a content-defined win that must lose to king capture on the
      // same ply (ADR-012). Quantified so it sees any of the mover's kings, not
      // only the piece that happened to move.
      id: 'rule.king-of-the-hill',
      nameKey: 'rule.king-of-the-hill.name',
      textKey: 'rule.king-of-the-hill.text',
      cost: 4,
      effects: [
        {
          trigger: 'end_of_ply',
          forEach: { kind: 'piece', pieceId: 'piece.king', side: 'mover' },
          condition: { kind: 'on_square', squares: ['c3', 'c4', 'd3', 'd4'] },
          actions: [{ kind: 'win', side: 'mover' }],
        },
      ],
    },
  ],

  skillCards: [
    {
      // Rank 3 — creation of pieces, out of state the engine used to discard.
      // The queen exclusion is the card's balance lever, expressed as data.
      id: 'skill.revive',
      nameKey: 'skill.revive.name',
      textKey: 'skill.revive.text',
      cost: 6,
      uses: 1,
      effects: [
        {
          trigger: 'on_play',
          condition: { kind: 'always' },
          actions: [{ kind: 'revive_piece', side: 'mover', at: { kind: 'own_back_rank' }, except: ['piece.king'] }],
        },
      ],
    },
    {
      // Rank 4 — `own_back_rank` validated and did nothing until v2. This card
      // is the one that would have shipped broken.
      id: 'skill.recall',
      nameKey: 'skill.recall.name',
      textKey: 'skill.recall.text',
      cost: 3,
      uses: 1,
      effects: [
        {
          trigger: 'on_play',
          condition: { kind: 'always' },
          actions: [{ kind: 'teleport_piece', target: { kind: 'chosen_friendly' }, to: { kind: 'own_back_rank' } }],
        },
      ],
    },
  ],

  boards: [
    {
      id: GATE6A_BOARD_ID,
      nameKey: 'board.gate6a.name',
      width: 6,
      height: 6,
      placements: [
        { square: 'd1', pieceId: 'piece.king', side: 'white' },
        { square: 'a1', pieceId: 'piece.rook', side: 'white' },
        { square: 'c2', pieceId: 'piece.pawn', side: 'white' },
        { square: 'd6', pieceId: 'piece.king', side: 'black' },
        { square: 'a6', pieceId: 'piece.rook', side: 'black' },
        { square: 'c5', pieceId: 'piece.pawn', side: 'black' },
      ],
      // f1 makes the "a revived piece enters its square" case reachable: fill
      // the earlier files and the only landing square is the one that kills.
      squares: [{ square: 'f1', typeId: 'square.bomb' }],
    },
  ],

  presets: [
    {
      id: GATE6A_PRESET_ID,
      nameKey: 'preset.gate6a.name',
      boardId: GATE6A_BOARD_ID,
      pieceIds: ['piece.king', 'piece.rook', 'piece.archer', 'piece.pawn'],
      ruleCardIds: ['rule.three-check', 'rule.royal-bodyguard', 'rule.king-of-the-hill'],
      skillCardIds: ['skill.revive', 'skill.recall'],
    },
  ],
}

export function loadGate6aContent(): ContentSet {
  const result = loadContentSet(gate6aContentSource)
  if (!result.ok) {
    throw new Error(`gate 6a content is invalid: ${JSON.stringify(result.errors, null, 2)}`)
  }
  return result.set
}
