import { type ContentSet, type ContentSource, loadContentSet } from '../load'

/**
 * The Phase 3 vertical slice — the project's first real content set.
 *
 * Its job is not breadth. It is authored so that ONE ply resolves an effect
 * owned by every one of ADR-002's four layers, which is the only way to find out
 * whether the Phase 1 vocabulary actually orders them the way the ADR says.
 *
 * The line it exercises: warp a piece onto c3 -> the beacon there carries it to
 * d4 (layer 1) -> the archer's volley fires at c3 and finds it empty (layer 2)
 * -> the rule card sees a piece standing on d4 and ends the match (layer 3),
 * with the skill card that started it all at layer 4. Reverse any two of those
 * and the board comes out different, which is what makes the order testable
 * rather than merely documented.
 *
 * Kept deliberately to 2 pieces / 1 square type / 1 rule card / 3 skill cards.
 * Three is the smallest pool that can form one conforming AC-005 offer; it is
 * also, by construction, too small for AC-006's disjoint second offer, which is
 * the absent case `bumpTurns` has to handle rather than deadlock on.
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

/** The square the beacon throws you to, and the square the rule card watches. */
const GOAL_SQUARE = 'd4'
/** The contested square: the beacon's pad, and the archers' field of fire. */
const BEACON_SQUARE = 'c3'

export const SLICE_PRESET_ID = 'preset.slice'
export const SLICE_BOARD_ID = 'board.slice'

export const sliceContentSource: ContentSource = {
  schemaVersion: 1,

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
      // Movement and attack deliberately differ: the archer steps one square in
      // any direction but never captures that way — it shoots two squares out.
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
        // Layer 2 at E1 — friends standing next to an archer cannot be captured.
        {
          trigger: 'generate_moves',
          condition: { kind: 'always' },
          actions: [{ kind: 'block_capture', target: { kind: 'adjacent_friendly' } }],
        },
        // Layer 2 at E4 — the volley. Anything that is still standing on the
        // contested square when the piece layer resolves is shot. The beacon
        // resolves first (layer 1), so a piece the beacon could move survives;
        // one it could not move does not. That gap IS the layer order.
        {
          trigger: 'on_enter',
          condition: { kind: 'on_square', squares: [BEACON_SQUARE] },
          actions: [{ kind: 'destroy_piece', target: { kind: 'entering' } }],
        },
      ],
    },
  ],

  squareTypes: [
    {
      // Layer 1 at E4.
      id: 'square.beacon',
      nameKey: 'square.beacon.name',
      textKey: 'square.beacon.text',
      paired: false,
      effects: [
        {
          trigger: 'on_enter',
          condition: { kind: 'always' },
          actions: [
            { kind: 'teleport_piece', target: { kind: 'entering' }, to: { kind: 'square', square: GOAL_SQUARE } },
          ],
        },
      ],
    },
  ],

  ruleCards: [
    {
      // Layer 3 at E7. A content-defined victory (ADR-012) that is additive to
      // king capture, and the reason a slice match ends quickly.
      id: 'rule.beacon-rush',
      nameKey: 'rule.beacon-rush.name',
      textKey: 'rule.beacon-rush.text',
      cost: 4,
      effects: [
        {
          trigger: 'end_of_ply',
          condition: {
            kind: 'all',
            of: [
              { kind: 'piece_side', side: 'mover' },
              { kind: 'on_square', squares: [GOAL_SQUARE] },
            ],
          },
          actions: [{ kind: 'win', side: 'mover' }],
        },
      ],
    },
  ],

  // Layer 4. Three cards: one that moves a piece, one that denies a piece, one
  // that adds a piece — enough to cover the action shapes the UI must render.
  skillCards: [
    {
      id: 'skill.warp',
      nameKey: 'skill.warp.name',
      textKey: 'skill.warp.text',
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
      id: 'skill.hold',
      nameKey: 'skill.hold.name',
      textKey: 'skill.hold.text',
      cost: 3,
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
      id: 'skill.rally',
      nameKey: 'skill.rally.name',
      textKey: 'skill.rally.text',
      cost: 5,
      uses: 1,
      effects: [
        {
          trigger: 'on_play',
          condition: { kind: 'always' },
          actions: [{ kind: 'spawn_piece', pieceId: 'piece.archer', side: 'mover', at: { kind: 'chosen_empty' } }],
        },
      ],
    },
  ],

  boards: [
    {
      id: SLICE_BOARD_ID,
      nameKey: 'board.slice.name',
      width: 6,
      height: 6,
      placements: [
        { square: 'b1', pieceId: 'piece.archer', side: 'white' },
        { square: 'c1', pieceId: 'piece.archer', side: 'white' },
        { square: 'd1', pieceId: 'piece.king', side: 'white' },
        { square: 'e1', pieceId: 'piece.archer', side: 'white' },
        { square: 'b6', pieceId: 'piece.archer', side: 'black' },
        { square: 'c6', pieceId: 'piece.archer', side: 'black' },
        { square: 'd6', pieceId: 'piece.king', side: 'black' },
        { square: 'e6', pieceId: 'piece.archer', side: 'black' },
      ],
      squares: [{ square: BEACON_SQUARE, typeId: 'square.beacon' }],
    },
  ],

  presets: [
    {
      id: SLICE_PRESET_ID,
      nameKey: 'preset.slice.name',
      boardId: SLICE_BOARD_ID,
      pieceIds: ['piece.king', 'piece.archer'],
      ruleCardIds: ['rule.beacon-rush'],
      skillCardIds: ['skill.warp', 'skill.hold', 'skill.rally'],
    },
  ],
}

/** Loads the slice, failing loudly rather than shipping a half-loaded set. */
export function loadSliceContent(): ContentSet {
  const result = loadContentSet(sliceContentSource)
  if (!result.ok) {
    throw new Error(`slice content set is invalid: ${JSON.stringify(result.errors, null, 2)}`)
  }
  return result.set
}
