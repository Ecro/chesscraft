import { type ContentSet, type ContentSource, loadContentSet } from '../load'

/**
 * The shipped content set (PLAN Phase 6b) — AC-010's ≥10 rule cards, ≥14 skill
 * cards and ≥4 square types.
 *
 * Selection starts from the RESEARCH R1–R14 / S1–S14 drafts and the Phase 6a
 * decisions: four cards cut as out-of-vocabulary, three held as needing engine
 * subsystems. That left four rule and six skill cards authorable, so the rest
 * are designed here against the vocabulary that actually exists — schema v3's
 * four additions, and nothing beyond them. A card that would need a fifth is a
 * card this set does not contain, on purpose: padding the count with content
 * the engine cannot resolve is how AC-010 passes on paper and fails in a match.
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
const KNIGHT: Array<[number, number]> = [
  [1, 2],
  [2, 1],
  [2, -1],
  [1, -2],
  [-1, -2],
  [-2, -1],
  [-2, 1],
  [-1, 2],
]
/** The four squares every "hold the middle" card agrees on. */
const CENTRE = ['c3', 'c4', 'd3', 'd4']
/** One rank short of promotion, from each side's point of view. */
const NEAR_PROMOTION = ['a5', 'b5', 'c5', 'd5', 'e5', 'f5', 'a2', 'b2', 'c2', 'd2', 'e2', 'f2']

export const BUNDLED_PRESET_ID = 'preset.default'
export const BUNDLED_BOARD_ID = 'board.los-alamos'

const backRank = ['piece.rook', 'piece.knight', 'piece.queen', 'piece.king', 'piece.archer', 'piece.rook']
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

export const bundledContentSource: ContentSource = {
  schemaVersion: 7,

  pieces: [
    {
      id: 'piece.king',
      nameKey: 'piece.king.name',
      textKey: 'piece.king.text',
      iconKey: 'piece.king.icon',
      movement: [{ kind: 'step', vectors: [...ORTHOGONAL, ...DIAGONAL] }],
      royal: true,
      effects: [],
    },
    {
      id: 'piece.queen',
      nameKey: 'piece.queen.name',
      textKey: 'piece.queen.text',
      iconKey: 'piece.queen.icon',
      movement: [{ kind: 'slide', vectors: [...ORTHOGONAL, ...DIAGONAL] }],
      effects: [],
    },
    {
      id: 'piece.rook',
      nameKey: 'piece.rook.name',
      textKey: 'piece.rook.text',
      iconKey: 'piece.rook.icon',
      movement: [{ kind: 'slide', vectors: ORTHOGONAL }],
      effects: [],
    },
    {
      id: 'piece.knight',
      nameKey: 'piece.knight.name',
      textKey: 'piece.knight.text',
      iconKey: 'piece.knight.icon',
      movement: [{ kind: 'jump', vectors: KNIGHT }],
      effects: [],
    },
    {
      id: 'piece.pawn',
      nameKey: 'piece.pawn.name',
      textKey: 'piece.pawn.text',
      iconKey: 'piece.pawn.icon',
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
      promotion: { onRank: 'last', to: 'piece.queen' },
      effects: [],
    },
    {
      id: 'piece.archer',
      nameKey: 'piece.archer.name',
      textKey: 'piece.archer.text',
      iconKey: 'piece.archer.icon',
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
  ],

  squareTypes: [
    {
      id: 'square.bomb',
      nameKey: 'square.bomb.name',
      textKey: 'square.bomb.text',
      iconKey: 'square.bomb.icon',
      /**
       * The one record carrying art in this cycle (ADR-010).
       *
       * It is here to prove the pipeline — bundler import, hashed emit, service
       * worker precache, render, both themes — because that chain's failure
       * mode is invisible without a real asset in a real build, and a contract
       * whose only exercised path is the ABSENT one is the black hole the
       * absent-case rule warns about. A square type rather than a piece: the
       * square mark is already its own layer, so one illustrated mark among
       * emoji does not make the board incoherent the way one illustrated king
       * would, and it needs one asset rather than ADR-007's two.
       *
       * `iconKey` stays. It is what every build without the asset falls back
       * to, and removing it would make this record depend on the catalogue.
       */
      artKey: 'art.bomb',
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
      iconKey: 'square.portal.icon',
      paired: true,
      effects: [
        {
          trigger: 'on_enter',
          condition: { kind: 'always' },
          actions: [{ kind: 'teleport_piece', target: { kind: 'entering' }, to: { kind: 'paired_square' } }],
        },
      ],
    },
    {
      id: 'square.shrine',
      nameKey: 'square.shrine.name',
      textKey: 'square.shrine.text',
      iconKey: 'square.shrine.icon',
      paired: false,
      effects: [
        {
          trigger: 'on_enter',
          condition: { kind: 'piece_is', pieceId: 'piece.pawn' },
          actions: [{ kind: 'promote_piece', target: { kind: 'entering' }, to: 'piece.queen' }],
        },
      ],
    },
    {
      id: 'square.sanctuary',
      nameKey: 'square.sanctuary.name',
      textKey: 'square.sanctuary.text',
      iconKey: 'square.sanctuary.icon',
      paired: false,
      effects: [
        {
          trigger: 'generate_moves',
          condition: { kind: 'always' },
          actions: [{ kind: 'block_capture', target: { kind: 'occupant' } }],
        },
      ],
    },
    {
      id: 'square.mire',
      nameKey: 'square.mire.name',
      textKey: 'square.mire.text',
      iconKey: 'square.mire.icon',
      paired: false,
      effects: [
        {
          trigger: 'on_enter',
          condition: { kind: 'always' },
          actions: [{ kind: 'freeze_piece', target: { kind: 'entering' }, plies: 2 }],
        },
      ],
    },
  ],

  ruleCards: [
    {
      id: 'rule.king-of-the-hill',
      nameKey: 'rule.king-of-the-hill.name',
      textKey: 'rule.king-of-the-hill.text',
      iconKey: 'rule.king-of-the-hill.icon',
      cost: 4,
      effects: [
        {
          trigger: 'end_of_ply',
          forEach: { kind: 'piece', pieceId: 'piece.king', side: 'mover' },
          // Standing on the hill is not enough. The centre is two king moves
          // from the home rank on a 6x6 board, so the bare version ended the
          // match on white's SECOND move — measured at a median of 3 plies.
          // Requiring the opponent to be worn down first makes it a late-game
          // win condition, which is what the card was always meant to be.
          condition: {
            kind: 'all',
            of: [
              { kind: 'on_square', squares: CENTRE },
              { kind: 'piece_count_at_most', side: 'opponent', n: 8 },
            ],
          },
          actions: [{ kind: 'win', side: 'mover' }],
        },
      ],
    },
    {
      id: 'rule.three-check',
      nameKey: 'rule.three-check.name',
      textKey: 'rule.three-check.text',
      iconKey: 'rule.three-check.icon',
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
      id: 'rule.sudden-death',
      nameKey: 'rule.sudden-death.name',
      textKey: 'rule.sudden-death.text',
      iconKey: 'rule.sudden-death.icon',
      cost: 5,
      effects: [
        {
          trigger: 'end_of_ply',
          condition: { kind: 'piece_count_at_most', side: 'opponent', n: 2 },
          actions: [{ kind: 'win', side: 'mover' }],
        },
      ],
    },
    {
      id: 'rule.fast-promotion',
      nameKey: 'rule.fast-promotion.name',
      textKey: 'rule.fast-promotion.text',
      iconKey: 'rule.fast-promotion.icon',
      cost: 3,
      effects: [
        {
          trigger: 'end_of_ply',
          forEach: { kind: 'piece', pieceId: 'piece.pawn', side: 'mover' },
          condition: { kind: 'on_square', squares: NEAR_PROMOTION },
          actions: [{ kind: 'promote_piece', target: { kind: 'self' }, to: 'piece.queen' }],
        },
      ],
    },
    {
      id: 'rule.royal-bodyguard',
      nameKey: 'rule.royal-bodyguard.name',
      textKey: 'rule.royal-bodyguard.text',
      iconKey: 'rule.royal-bodyguard.icon',
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
      id: 'rule.last-stand',
      nameKey: 'rule.last-stand.name',
      textKey: 'rule.last-stand.text',
      iconKey: 'rule.last-stand.icon',
      cost: 3,
      effects: [
        {
          trigger: 'generate_moves',
          forEach: { kind: 'piece', pieceId: 'piece.king', side: 'mover' },
          condition: { kind: 'piece_count_at_most', side: 'mover', n: 3 },
          actions: [
            { kind: 'grant_movement', target: { kind: 'self' }, pattern: { kind: 'slide', vectors: [...ORTHOGONAL, ...DIAGONAL] } },
          ],
        },
      ],
    },
    {
      id: 'rule.conscription',
      nameKey: 'rule.conscription.name',
      textKey: 'rule.conscription.text',
      iconKey: 'rule.conscription.icon',
      cost: 3,
      effects: [
        {
          trigger: 'end_of_ply',
          condition: { kind: 'piece_count_at_most', side: 'mover', n: 3 },
          actions: [{ kind: 'spawn_piece', pieceId: 'piece.pawn', side: 'mover', at: { kind: 'own_back_rank' } }],
        },
      ],
    },
    {
      id: 'rule.blood-toll',
      nameKey: 'rule.blood-toll.name',
      textKey: 'rule.blood-toll.text',
      iconKey: 'rule.blood-toll.icon',
      cost: 4,
      effects: [
        {
          trigger: 'on_capture',
          condition: { kind: 'always' },
          actions: [{ kind: 'destroy_piece', target: { kind: 'entering' } }],
        },
      ],
    },
    {
      // Replaces `rule.pawn-rush`, whose measured median was 59 plies. Phase 7
      // found that nine of eleven rule cards carried no alternate win condition
      // at all, so nine matches in eleven ran to the cap; the permitted remedy
      // (PLAN Risk R-4) is to raise the share of cards that can end a match.
      id: 'rule.blitz',
      nameKey: 'rule.blitz.name',
      textKey: 'rule.blitz.text',
      iconKey: 'rule.blitz.icon',
      cost: 4,
      effects: [
        {
          trigger: 'end_of_ply',
          condition: { kind: 'check_count_at_least', n: 2 },
          actions: [{ kind: 'win', side: 'mover' }],
        },
      ],
    },
    {
      id: 'rule.knights-honour',
      nameKey: 'rule.knights-honour.name',
      textKey: 'rule.knights-honour.text',
      iconKey: 'rule.knights-honour.icon',
      cost: 3,
      effects: [
        {
          trigger: 'generate_moves',
          forEach: { kind: 'piece', pieceId: 'piece.knight', side: 'any' },
          condition: { kind: 'always' },
          actions: [{ kind: 'grant_movement', target: { kind: 'self' }, pattern: { kind: 'step', vectors: [...ORTHOGONAL, ...DIAGONAL] } }],
        },
      ],
    },
    {
      // Replaces `rule.holy-ground` (median 59.5, the slowest card in the set).
      // That card made every centre piece uncapturable, so it did not merely
      // fail to end matches — it removed captures from the four squares play
      // passes through most.
      id: 'rule.duel',
      nameKey: 'rule.duel.name',
      textKey: 'rule.duel.text',
      iconKey: 'rule.duel.icon',
      cost: 5,
      effects: [
        {
          trigger: 'end_of_ply',
          condition: { kind: 'piece_count_at_most', side: 'opponent', n: 8 },
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
      iconKey: 'skill.teleport.icon',
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
      id: 'skill.swap',
      nameKey: 'skill.swap.name',
      textKey: 'skill.swap.text',
      iconKey: 'skill.swap.icon',
      cost: 4,
      uses: 1,
      effects: [
        {
          trigger: 'on_play',
          condition: { kind: 'always' },
          actions: [{ kind: 'swap_pieces', a: { kind: 'chosen_friendly' }, b: { kind: 'chosen_friendly' } }],
        },
      ],
    },
    {
      id: 'skill.revive',
      nameKey: 'skill.revive.name',
      textKey: 'skill.revive.text',
      iconKey: 'skill.revive.icon',
      cost: 6,
      uses: 1,
      effects: [
        {
          trigger: 'on_play',
          condition: { kind: 'always' },
          actions: [
            { kind: 'revive_piece', side: 'mover', at: { kind: 'own_back_rank' }, except: ['piece.king', 'piece.queen'] },
          ],
        },
      ],
    },
    {
      id: 'skill.freeze',
      nameKey: 'skill.freeze.name',
      textKey: 'skill.freeze.text',
      iconKey: 'skill.freeze.icon',
      cost: 4,
      uses: 1,
      effects: [
        {
          trigger: 'on_play',
          condition: { kind: 'always' },
          actions: [{ kind: 'freeze_piece', target: { kind: 'chosen_enemy' }, plies: 4 }],
        },
      ],
    },
    {
      id: 'skill.snare',
      nameKey: 'skill.snare.name',
      textKey: 'skill.snare.text',
      iconKey: 'skill.snare.icon',
      cost: 2,
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
      iconKey: 'skill.coronation.icon',
      cost: 5,
      uses: 1,
      effects: [
        {
          trigger: 'on_play',
          condition: { kind: 'piece_is', pieceId: 'piece.pawn' },
          actions: [{ kind: 'promote_piece', target: { kind: 'chosen_friendly' }, to: 'piece.queen' }],
        },
      ],
    },
    {
      id: 'skill.knight-leap',
      nameKey: 'skill.knight-leap.name',
      textKey: 'skill.knight-leap.text',
      iconKey: 'skill.knight-leap.icon',
      cost: 3,
      uses: 1,
      effects: [
        {
          trigger: 'on_play',
          condition: { kind: 'always' },
          actions: [
            { kind: 'grant_movement', target: { kind: 'chosen_friendly' }, pattern: { kind: 'jump', vectors: KNIGHT }, duration: 3 },
          ],
        },
      ],
    },
    {
      id: 'skill.charge',
      nameKey: 'skill.charge.name',
      textKey: 'skill.charge.text',
      iconKey: 'skill.charge.icon',
      cost: 4,
      uses: 1,
      effects: [
        {
          trigger: 'on_play',
          forEach: { kind: 'piece', pieceId: 'piece.pawn', side: 'mover' },
          condition: { kind: 'always' },
          actions: [
            {
              kind: 'grant_movement',
              target: { kind: 'self' },
              pattern: { kind: 'slide', vectors: [[0, 1]], maxDistance: 2, forward: true },
              duration: 5,
            },
          ],
        },
      ],
    },
    {
      id: 'skill.bulwark',
      nameKey: 'skill.bulwark.name',
      textKey: 'skill.bulwark.text',
      iconKey: 'skill.bulwark.icon',
      cost: 3,
      uses: 1,
      effects: [
        {
          trigger: 'on_play',
          condition: { kind: 'always' },
          actions: [{ kind: 'block_capture', target: { kind: 'chosen_friendly' }, duration: 3 }],
        },
      ],
    },
    {
      id: 'skill.shackle',
      nameKey: 'skill.shackle.name',
      textKey: 'skill.shackle.text',
      iconKey: 'skill.shackle.icon',
      cost: 4,
      uses: 1,
      effects: [
        {
          trigger: 'on_play',
          condition: { kind: 'always' },
          actions: [{ kind: 'forbid_movement', target: { kind: 'chosen_enemy' }, duration: 3 }],
        },
      ],
    },
    {
      id: 'skill.recall',
      nameKey: 'skill.recall.name',
      textKey: 'skill.recall.text',
      iconKey: 'skill.recall.icon',
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
    {
      id: 'skill.shove',
      nameKey: 'skill.shove.name',
      textKey: 'skill.shove.text',
      iconKey: 'skill.shove.icon',
      cost: 3,
      uses: 1,
      effects: [
        {
          trigger: 'on_play',
          condition: { kind: 'always' },
          actions: [
            { kind: 'teleport_piece', target: { kind: 'chosen_enemy' }, to: { kind: 'offset', df: 0, dr: -1, forward: true } },
          ],
        },
      ],
    },
    {
      id: 'skill.recruit',
      nameKey: 'skill.recruit.name',
      textKey: 'skill.recruit.text',
      iconKey: 'skill.recruit.icon',
      cost: 4,
      uses: 1,
      effects: [
        {
          trigger: 'on_play',
          condition: { kind: 'always' },
          actions: [{ kind: 'spawn_piece', pieceId: 'piece.pawn', side: 'mover', at: { kind: 'own_back_rank' } }],
        },
      ],
    },
    {
      id: 'skill.volley',
      nameKey: 'skill.volley.name',
      textKey: 'skill.volley.text',
      iconKey: 'skill.volley.icon',
      cost: 6,
      uses: 1,
      effects: [
        {
          trigger: 'on_play',
          condition: { kind: 'always' },
          actions: [{ kind: 'destroy_piece', target: { kind: 'chosen_enemy' } }],
        },
      ],
    },
    {
      id: 'skill.sacrifice',
      nameKey: 'skill.sacrifice.name',
      textKey: 'skill.sacrifice.text',
      iconKey: 'skill.sacrifice.icon',
      cost: 5,
      uses: 1,
      effects: [
        {
          trigger: 'on_play',
          condition: { kind: 'always' },
          actions: [
            { kind: 'destroy_piece', target: { kind: 'chosen_friendly' } },
            { kind: 'destroy_piece', target: { kind: 'chosen_enemy' } },
          ],
        },
      ],
    },
  ],

  boards: [
    {
      id: BUNDLED_BOARD_ID,
      nameKey: 'board.los-alamos.name',
      width: 6,
      height: 6,
      placements: losAlamosPlacements(),
      // Ranks 3 and 4 are the only empty ones at the start, so every painted
      // square is reachable and none sits under a piece at setup. The portal
      // pair deliberately avoids the four centre squares the hill cards use.
      squares: [
        { square: 'a3', typeId: 'square.bomb' },
        { square: 'f3', typeId: 'square.shrine' },
        { square: 'a4', typeId: 'square.sanctuary' },
        { square: 'f4', typeId: 'square.mire' },
        { square: 'b3', typeId: 'square.portal', pairedWith: 'e4' },
        { square: 'e4', typeId: 'square.portal', pairedWith: 'b3' },
      ],
    },
  ],

  presets: [
    {
      id: BUNDLED_PRESET_ID,
      nameKey: 'preset.default.name',
      boardId: BUNDLED_BOARD_ID,
      pieceIds: ['piece.king', 'piece.queen', 'piece.rook', 'piece.knight', 'piece.pawn', 'piece.archer'],
      ruleCardIds: [
        'rule.king-of-the-hill',
        'rule.three-check',
        'rule.sudden-death',
        'rule.fast-promotion',
        'rule.royal-bodyguard',
        'rule.last-stand',
        'rule.conscription',
        'rule.blood-toll',
        'rule.blitz',
        'rule.knights-honour',
        'rule.duel',
      ],
      skillCardIds: [
        'skill.teleport',
        'skill.swap',
        'skill.revive',
        'skill.freeze',
        'skill.snare',
        'skill.coronation',
        'skill.knight-leap',
        'skill.charge',
        'skill.bulwark',
        'skill.shackle',
        'skill.recall',
        'skill.shove',
        'skill.recruit',
        'skill.volley',
        'skill.sacrifice',
      ],
    },
  ],
}

export function loadBundledContent(): ContentSet {
  const result = loadContentSet(bundledContentSource)
  if (!result.ok) {
    throw new Error(`bundled content is invalid: ${JSON.stringify(result.errors, null, 2)}`)
  }
  return result.set
}
