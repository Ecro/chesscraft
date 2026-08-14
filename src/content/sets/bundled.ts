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
/**
 * One rank short of promotion on a six-rank board, counted from the pawn's own
 * side — so white reads it as rank 5 and black as rank 2.
 *
 * This used to be a flat `on_square` list holding BOTH of those ranks, which is
 * wrong in the worst possible way: white's opening pawn line stands on rank 2,
 * which the list contained, so with the quantifier working every white pawn
 * promoted on move one. `on_square` has no way to know which side it is asking
 * about, and no other condition knows absolute sides either, so the card needed
 * a vocabulary entry rather than a better list.
 */
const NEAR_PROMOTION_RANK = 5

export const BUNDLED_PRESET_ID = 'preset.default'
export const BUNDLED_BOARD_ID = 'board.los-alamos'

const backRank = ['piece.rook', 'piece.knight', 'piece.queen', 'piece.king', 'piece.archer', 'piece.rook']
const files = ['a', 'b', 'c', 'd', 'e', 'f']

/**
 * A mirrored 6x6 opening from one back rank.
 *
 * Every room this set ships is the same shape — two full pawn ranks and a back
 * rank each — so what makes a room is which SIX pieces stand behind the pawns,
 * not a different geometry. Ranks 3 and 4 are left empty by construction, which
 * is the property every painted square in this file depends on (ADR-003): a
 * square under a piece at setup is neither reachable nor visible.
 */
function openingFor(rank: readonly string[], pawnId = 'piece.pawn') {
  return openingOn(files, 6, rank, pawnId)
}

/**
 * The same opening on any square board (v12, for the 8x8 room).
 *
 * Generalised rather than copied: a second `openingFor8` would be one
 * vocabulary with two code paths, which is `[fail:design]
 * shared-vocabulary-unshared-code-path` — recorded four times here, once in this
 * very task when `editor/io.ts` turned out to hold a stale copy of the loader's
 * normalization. The 6x6 helper above is now a call into this one.
 */
function openingOn(
  fileNames: readonly string[],
  height: number,
  rank: readonly string[],
  pawnId = 'piece.pawn',
) {
  const placements: Array<{ square: string; pieceId: string; side: 'white' | 'black' }> = []
  for (const [i, file] of fileNames.entries()) {
    placements.push({ square: `${file}1`, pieceId: rank[i]!, side: 'white' })
    placements.push({ square: `${file}2`, pieceId: pawnId, side: 'white' })
    placements.push({ square: `${file}${height - 1}`, pieceId: pawnId, side: 'black' })
    placements.push({ square: `${file}${height}`, pieceId: rank[i]!, side: 'black' })
  }
  return placements
}

const files8 = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']
/**
 * Eight behind eight. `piece.lancer` rather than a bishop: on eight ranks a full
 * diagonal slider crosses the board on move one, and the lancer's two-square cap
 * keeps the piece a flanker instead of an opening threat.
 */
const grandRank = [
  'piece.rook',
  'piece.knight',
  'piece.lancer',
  'piece.queen',
  'piece.king',
  'piece.lancer',
  'piece.knight',
  'piece.rook',
]

const bastionRank = ['piece.rook', 'piece.warden', 'piece.queen', 'piece.king', 'piece.warden', 'piece.rook']
const cavalryRank = ['piece.charger', 'piece.knight', 'piece.queen', 'piece.king', 'piece.knight', 'piece.charger']
const covenantRank = ['piece.acolyte', 'piece.marksman', 'piece.queen', 'piece.king', 'piece.shade', 'piece.lancer']

/** The two-square diagonal leap the marksman shoots along, and the dart grants. */
const DIAGONAL_TWO: Array<[number, number]> = [
  [2, 2],
  [2, -2],
  [-2, 2],
  [-2, -2],
]

/** A camel's leap — the same idea as a knight's, one square longer, so it lands on the other colour. */
const CAMEL: Array<[number, number]> = [
  [1, 3],
  [3, 1],
  [3, -1],
  [1, -3],
  [-1, -3],
  [-3, -1],
  [-3, 1],
  [-1, 3],
]

export const bundledContentSource: ContentSource = {
  schemaVersion: 12,

  pieces: [
    {
      id: 'piece.king',
      nameKey: 'piece.king.name',
      textKey: 'piece.king.text',
      artKey: 'art.king',
      movement: [{ kind: 'step', vectors: [...ORTHOGONAL, ...DIAGONAL] }],
      royal: true,
      effects: [],
    },
    {
      id: 'piece.queen',
      nameKey: 'piece.queen.name',
      textKey: 'piece.queen.text',
      artKey: 'art.queen',
      movement: [{ kind: 'slide', vectors: [...ORTHOGONAL, ...DIAGONAL] }],
      effects: [],
    },
    {
      id: 'piece.rook',
      nameKey: 'piece.rook.name',
      textKey: 'piece.rook.text',
      artKey: 'art.rook',
      movement: [{ kind: 'slide', vectors: ORTHOGONAL }],
      effects: [],
    },
    {
      id: 'piece.knight',
      nameKey: 'piece.knight.name',
      textKey: 'piece.knight.text',
      artKey: 'art.knight',
      movement: [{ kind: 'jump', vectors: KNIGHT }],
      effects: [],
    },
    {
      id: 'piece.pawn',
      nameKey: 'piece.pawn.name',
      textKey: 'piece.pawn.text',
      artKey: 'art.pawn',
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
      artKey: 'art.archer',
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
      /**
       * A short-range diagonal slider. Deliberately NOT a bishop: capping the
       * slide at two keeps it on the same colour without letting it cross the
       * whole board on move one, which on six ranks a full bishop does.
       */
      id: 'piece.lancer',
      nameKey: 'piece.lancer.name',
      textKey: 'piece.lancer.text',
      artKey: 'art.lance',
      movement: [{ kind: 'slide', vectors: DIAGONAL, maxDistance: 2 }],
      effects: [],
    },
    {
      /**
       * The archer's opposite number: it steps orthogonally and shoots on the
       * diagonal, so the two cover disjoint squares and a room holding both is
       * genuinely harder to walk into than a room holding two archers.
       */
      id: 'piece.marksman',
      nameKey: 'piece.marksman.name',
      textKey: 'piece.marksman.text',
      artKey: 'art.crossbow',
      movement: [{ kind: 'step', vectors: ORTHOGONAL }],
      attack: [{ kind: 'jump', vectors: DIAGONAL_TWO }],
      effects: [],
    },
    {
      /** Runs forward and takes to the side — a piece that cannot retreat. */
      id: 'piece.charger',
      nameKey: 'piece.charger.name',
      textKey: 'piece.charger.text',
      artKey: 'art.warhorse',
      movement: [{ kind: 'slide', vectors: [[0, 1]], maxDistance: 3, forward: true }],
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
      effects: [],
    },
    {
      /**
       * The archer's guard shape at half the reach. Same proven effect — a
       * `generate_moves` block on adjacent friends — because a defensive piece
       * whose defence silently does nothing is the exact failure this set has
       * hit five times.
       */
      id: 'piece.warden',
      nameKey: 'piece.warden.name',
      textKey: 'piece.warden.text',
      artKey: 'art.watchtower',
      movement: [{ kind: 'slide', vectors: ORTHOGONAL, maxDistance: 2 }],
      effects: [
        {
          trigger: 'generate_moves',
          condition: { kind: 'always' },
          actions: [{ kind: 'block_capture', target: { kind: 'adjacent_friendly' } }],
        },
      ],
    },
    {
      /** A diagonal footman that grows into a rook rather than a queen. */
      id: 'piece.acolyte',
      nameKey: 'piece.acolyte.name',
      textKey: 'piece.acolyte.text',
      artKey: 'art.censer',
      movement: [{ kind: 'step', vectors: DIAGONAL }],
      promotion: { onRank: 'last', to: 'piece.rook' },
      effects: [],
    },
    {
      /** A leaper one square longer than a knight, so it changes square colour. */
      id: 'piece.shade',
      nameKey: 'piece.shade.name',
      textKey: 'piece.shade.text',
      artKey: 'art.cloak',
      movement: [{ kind: 'jump', vectors: CAMEL }],
      effects: [],
    },
  ],

  squareTypes: [
    {
      id: 'square.bomb',
      nameKey: 'square.bomb.name',
      textKey: 'square.bomb.text',
      /**
       * Art on every record, and no `iconKey` behind it (Chess Craft redesign).
       *
       * `iconKey` used to stay as the fallback for a build whose asset failed to
       * load. A pixel sprite has no such build: it is 12 rows of characters in
       * `pixels.ts`, so there is nothing for the bundler to emit, the service
       * worker to precache or the network to lose. What the emoji actually cost
       * is recorded in `ko.ts`'s archer note — an emoji is drawn from a colour
       * font that ignores `color` and `font-weight`, which are two of the three
       * cues ADR-007 spends separating the two armies, so both sides' archers
       * rendered identically.
       *
       * The chain is not gone, only shortened: an art id the catalogue does not
       * know still falls through, now to the monogram, which inherits both cues
       * the emoji threw away.
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
      artKey: 'art.portal',
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
      artKey: 'art.shrine',
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
      artKey: 'art.sanctuary',
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
      artKey: 'art.mire',
      paired: false,
      effects: [
        {
          trigger: 'on_enter',
          condition: { kind: 'always' },
          actions: [{ kind: 'freeze_piece', target: { kind: 'entering' }, plies: 2 }],
        },
      ],
    },
    {
      /**
       * Throws whatever steps on it back to its own home rank — WHEN that rank
       * has room.
       *
       * The caveat is in the player-facing text on purpose. `own_back_rank`
       * resolves through `homeRankVacancy`, which returns null on a full rank and
       * lets execution continue, so at the opening — when every home rank is
       * full — the effect fires and changes nothing: driving a pawn onto b3 of
       * `board.cavalry` logs `on_enter:square:square.geyser` and leaves the pawn
       * standing there. That is the declared-but-inert shape this repo has hit
       * five times, and the rule it taught is that a safe-looking default is what
       * makes the failure invisible. A square effect has no `cardResolves` to
       * gate it, so the remedy available to CONTENT is to stop the behaviour
       * being a surprise: the card text now states the condition, and
       * `square-liveness.test.ts` pins both branches.
       */
      id: 'square.geyser',
      nameKey: 'square.geyser.name',
      textKey: 'square.geyser.text',
      artKey: 'art.geyser',
      paired: false,
      effects: [
        {
          trigger: 'on_enter',
          condition: { kind: 'always' },
          actions: [{ kind: 'teleport_piece', target: { kind: 'entering' }, to: { kind: 'own_back_rank' } }],
        },
      ],
    },
    {
      /**
       * Lethal to footmen and harmless to everything else.
       *
       * The bomb kills whatever arrives, which makes it a square nobody ever
       * walks onto. Killing only pawns makes it a square you walk onto with the
       * RIGHT piece, which is a decision rather than a wall.
       */
      id: 'square.thorns',
      nameKey: 'square.thorns.name',
      textKey: 'square.thorns.text',
      artKey: 'art.thorns',
      paired: false,
      effects: [
        {
          trigger: 'on_enter',
          condition: { kind: 'piece_is', pieceId: 'piece.pawn' },
          actions: [{ kind: 'destroy_piece', target: { kind: 'entering' } }],
        },
      ],
    },
    {
      /**
       * Stand here and you can leap (v12).
       *
       * `grant_movement` at `generate_moves` with no duration, so the geometry
       * is lent for exactly as long as the piece stands on the square — the
       * same shape `rule.siege` uses to give rooks a diagonal. No square type
       * had used the grant actions before this one; the eight shipped before it
       * covered four triggers and none of the generation-time three.
       */
      id: 'square.springboard',
      nameKey: 'square.springboard.name',
      textKey: 'square.springboard.text',
      artKey: 'art.springboard',
      paired: false,
      effects: [
        {
          trigger: 'generate_moves',
          condition: { kind: 'always' },
          actions: [{ kind: 'grant_movement', target: { kind: 'occupant' }, pattern: { kind: 'jump', vectors: KNIGHT } }],
        },
      ],
    },
    {
      /**
       * A muster point: step on it and a footman reports to your home rank.
       *
       * INERT WHEN THE HOME RANK IS FULL, and the card text says so — the
       * `square.geyser` lesson, which resolved through the same `own_back_rank`
       * vacancy lookup and quietly did nothing for the whole opening because
       * every home rank starts full. A square effect has no `cardResolves` to
       * gate it, so the only remedy available to CONTENT is to stop the
       * behaviour being a surprise.
       */
      id: 'square.levy',
      nameKey: 'square.levy.name',
      textKey: 'square.levy.text',
      artKey: 'art.levy',
      paired: false,
      effects: [
        {
          trigger: 'on_enter',
          condition: { kind: 'always' },
          actions: [{ kind: 'spawn_piece', pieceId: 'piece.pawn', side: 'mover', at: { kind: 'own_back_rank' } }],
        },
      ],
    },
    {
      /**
       * Whatever climbs onto it comes off a knight — a promotion that is also a
       * demotion, so it is a decision rather than a reward. `square.shrine`
       * only ever improves a pawn; this one will happily turn a queen into a
       * knight, and the text says which way it cuts.
       *
       * Its inert branch is a piece that is ALREADY a knight: `promote_piece`
       * writes the same `pieceId` and nothing observable happens.
       */
      id: 'square.altar',
      nameKey: 'square.altar.name',
      textKey: 'square.altar.text',
      artKey: 'art.altar',
      paired: false,
      effects: [
        {
          trigger: 'on_enter',
          condition: { kind: 'always' },
          actions: [{ kind: 'promote_piece', target: { kind: 'entering' }, to: 'piece.knight' }],
        },
      ],
    },
    {
      /** Cover you carry with you: whatever steps in cannot be taken for a while. */
      id: 'square.mist',
      nameKey: 'square.mist.name',
      textKey: 'square.mist.text',
      artKey: 'art.mist',
      paired: false,
      effects: [
        {
          trigger: 'on_enter',
          condition: { kind: 'always' },
          actions: [{ kind: 'block_capture', target: { kind: 'entering' }, duration: 3 }],
        },
      ],
    },
  ],

  ruleCards: [
    {
      id: 'rule.king-of-the-hill',
      nameKey: 'rule.king-of-the-hill.name',
      textKey: 'rule.king-of-the-hill.text',
      artKey: 'art.hill',
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
      artKey: 'art.three',
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
      artKey: 'art.skull',
      cost: 5,
      effects: [
        /*
         * `n: 4`, raised from 2 (PLAN Phase 6).
         *
         * A side starts with twelve pieces, and the threshold decides whether this card's one
         * and only clause can ever fire. Measured over 600 self-play matches: a side is reduced
         * to two pieces in 1% of them, to three in 5%, to four in 14%. At the old threshold the
         * card promised "그 즉시 이긴다" and delivered it three times in forty-seven matches —
         * near-inert, while reading as one of the strongest cards in the set.
         *
         * Four keeps the premise (a side down to its king and three) and puts the clause within
         * reach of real play. The threshold is not taste: it is the smallest value whose
         * reachability was measured above the noise, and the card's own text was corrected in
         * the same change so the number a player reads is the number the engine uses.
         */
        {
          trigger: 'end_of_ply',
          condition: { kind: 'piece_count_at_most', side: 'opponent', n: 4 },
          actions: [{ kind: 'win', side: 'mover' }],
        },
      ],
    },
    {
      id: 'rule.fast-promotion',
      nameKey: 'rule.fast-promotion.name',
      textKey: 'rule.fast-promotion.text',
      artKey: 'art.upgrade',
      cost: 3,
      effects: [
        {
          trigger: 'end_of_ply',
          forEach: { kind: 'piece', pieceId: 'piece.pawn', side: 'mover' },
          condition: { kind: 'on_own_rank', n: NEAR_PROMOTION_RANK },
          actions: [{ kind: 'promote_piece', target: { kind: 'self' }, to: 'piece.queen' }],
        },
      ],
    },
    {
      id: 'rule.royal-bodyguard',
      nameKey: 'rule.royal-bodyguard.name',
      textKey: 'rule.royal-bodyguard.text',
      artKey: 'art.crest',
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
      artKey: 'art.flame',
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
      artKey: 'art.ranks',
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
      /**
       * Replaces `rule.blood-toll`, which destroyed the capturing piece.
       *
       * A NEW id rather than an edit in place: the old one names "the piece that
       * captured disappears too", and this card does not do that. Its measured
       * profile was never the problem — 20% of its matches ended on the clock
       * against a 25% set baseline, mid-pack — so this is a taste change, and
       * the taste complaint was that losing the taker made captures feel dead
       * rather than expensive. A freeze keeps the cost and keeps the piece.
       *
       * `mover`, not `entering`: at `on_capture` the subject is the VICTIM, and
       * the piece this card is about is the one that took it. The write is
       * DEFERRED to settlement (ADR-001) because the capturer is still standing
       * on `action.from` when this fires — writing here would freeze the square
       * it is about to leave, which is exactly how the card it replaces spent
       * four months inert.
       */
      id: 'rule.blood-toll',
      nameKey: 'rule.recoil.name',
      textKey: 'rule.recoil.text',
      artKey: 'art.recoil',
      cost: 4,
      effects: [
        {
          trigger: 'on_capture',
          condition: { kind: 'always' },
          // 3, not 2. The write is deferred and settles at `state.plyCount`, so a
          // 2-ply freeze expires exactly as the capturer's own next turn begins
          // and costs it nothing — the card would read as a tax and charge none.
          actions: [{ kind: 'freeze_piece', target: { kind: 'mover' }, plies: 3 }],
        },
      ],
    },
    {
      /**
       * The people, not the king (v12).
       *
       * Written with `piece_kind_count_at_most`, which exists for this clause:
       * `piece_count_at_most` cannot filter by kind and its `n` is `positive()`,
       * and a `forEach` over pawns cannot fire when there are none to bind.
       *
       * ONE clause, matching `rule.duel`. A second, mover-side clause would make
       * it symmetric within a single ply, and a two-effect card cannot be opened
       * by the recipe view — `readSentence` reads one effect, and every bundled
       * card opening as a sentence is an invariant the suite enforces. The cost
       * is a one-ply delay in the mirror case: a side that loses its own last
       * pawn is not declared beaten until its opponent's ply evaluates the same
       * clause from the other end. The match still ends, one half-move later.
       *
       * King capture still ends the match; this is an additional way to lose, not
       * a replacement for that one.
       */
      id: 'rule.democracy',
      nameKey: 'rule.democracy.name',
      textKey: 'rule.democracy.text',
      artKey: 'art.democracy',
      cost: 4,
      effects: [
        {
          trigger: 'end_of_ply',
          condition: { kind: 'piece_kind_count_at_most', side: 'opponent', pieceId: 'piece.pawn', n: 0 },
          actions: [{ kind: 'win', side: 'mover' }],
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
      artKey: 'art.bolt',
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
      artKey: 'art.horse',
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
      artKey: 'art.swords',
      cost: 5,
      effects: [
        {
          trigger: 'end_of_ply',
          condition: { kind: 'piece_count_at_most', side: 'opponent', n: 8 },
          actions: [{ kind: 'win', side: 'mover' }],
        },
      ],
    },
    {
      /**
       * Cross the board with the king. `on_own_rank` counts from the king's own
       * home rank, so rank 6 is the opponent's back rank for either side — the
       * one thing a flat square list cannot say.
       */
      id: 'rule.beacon',
      nameKey: 'rule.beacon.name',
      textKey: 'rule.beacon.text',
      artKey: 'art.beacon',
      effects: [
        {
          trigger: 'end_of_ply',
          forEach: { kind: 'piece', pieceId: 'piece.king', side: 'mover' },
          condition: { kind: 'on_own_rank', n: 6 },
          actions: [{ kind: 'win', side: 'mover' }],
        },
      ],
    },
    {
      /** Every capture is paid for with a fresh footman on the home rank. */
      id: 'rule.tribute',
      nameKey: 'rule.tribute.name',
      textKey: 'rule.tribute.text',
      artKey: 'art.tribute',
      effects: [
        {
          trigger: 'on_capture',
          condition: { kind: 'always' },
          actions: [{ kind: 'spawn_piece', pieceId: 'piece.pawn', side: 'mover', at: { kind: 'own_back_rank' } }],
        },
      ],
    },
    {
      /** Both queens are pinned where they stand. */
      id: 'rule.eclipse',
      nameKey: 'rule.eclipse.name',
      textKey: 'rule.eclipse.text',
      artKey: 'art.eclipse',
      effects: [
        {
          trigger: 'generate_moves',
          forEach: { kind: 'piece', pieceId: 'piece.queen', side: 'any' },
          condition: { kind: 'always' },
          actions: [{ kind: 'forbid_movement', target: { kind: 'self' } }],
        },
      ],
    },
    {
      /** Footmen on both sides cannot be taken — the board fills up and stays full. */
      id: 'rule.oath',
      nameKey: 'rule.oath.name',
      textKey: 'rule.oath.text',
      artKey: 'art.oath',
      effects: [
        {
          trigger: 'generate_moves',
          forEach: { kind: 'piece', pieceId: 'piece.pawn', side: 'any' },
          condition: { kind: 'always' },
          actions: [{ kind: 'block_capture', target: { kind: 'self' } }],
        },
      ],
    },
    {
      /** Rooks besiege on the diagonal too. */
      id: 'rule.siege',
      nameKey: 'rule.siege.name',
      textKey: 'rule.siege.text',
      artKey: 'art.siege',
      effects: [
        {
          trigger: 'generate_moves',
          forEach: { kind: 'piece', pieceId: 'piece.rook', side: 'any' },
          condition: { kind: 'always' },
          actions: [{ kind: 'grant_movement', target: { kind: 'self' }, pattern: { kind: 'slide', vectors: DIAGONAL } }],
        },
      ],
    },
    {
      /** A footman that reaches the middle is promoted on the spot. */
      id: 'rule.harvest',
      nameKey: 'rule.harvest.name',
      textKey: 'rule.harvest.text',
      artKey: 'art.harvest',
      effects: [
        {
          trigger: 'end_of_ply',
          forEach: { kind: 'piece', pieceId: 'piece.pawn', side: 'mover' },
          condition: { kind: 'on_square', squares: CENTRE },
          actions: [{ kind: 'promote_piece', target: { kind: 'self' }, to: 'piece.knight' }],
        },
      ],
    },
  ],

  skillCards: [
    {
      id: 'skill.teleport',
      nameKey: 'skill.teleport.name',
      textKey: 'skill.teleport.text',
      artKey: 'art.warp',
      cost: 4,
      uses: 1,
      royalFollowUp: 'preserve-existing',
      protectRelocatedAfterPlay: false,
      lockRelocatedAfterPlay: true,
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
      artKey: 'art.arrows',
      cost: 4,
      uses: 1,
      royalFollowUp: 'preserve-existing',
      protectRelocatedAfterPlay: false,
      lockRelocatedAfterPlay: true,
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
      artKey: 'art.sprout',
      cost: 6,
      uses: 1,
      royalFollowUp: 'preserve-existing',
      protectRelocatedAfterPlay: false,
      lockRelocatedAfterPlay: false,
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
      artKey: 'art.ice',
      cost: 4,
      uses: 1,
      royalFollowUp: 'preserve',
      protectRelocatedAfterPlay: false,
      lockRelocatedAfterPlay: false,
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
      artKey: 'art.trap',
      cost: 2,
      uses: 1,
      royalFollowUp: 'preserve',
      protectRelocatedAfterPlay: false,
      lockRelocatedAfterPlay: false,
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
      artKey: 'art.crown',
      cost: 5,
      uses: 1,
      royalFollowUp: 'preserve-existing',
      protectRelocatedAfterPlay: false,
      lockRelocatedAfterPlay: false,
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
      artKey: 'art.horse-leap',
      cost: 3,
      uses: 1,
      royalFollowUp: 'preserve-existing',
      protectRelocatedAfterPlay: false,
      lockRelocatedAfterPlay: false,
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
      artKey: 'art.horn',
      cost: 4,
      uses: 1,
      royalFollowUp: 'preserve-existing',
      protectRelocatedAfterPlay: false,
      lockRelocatedAfterPlay: false,
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
      artKey: 'art.wall',
      cost: 3,
      uses: 1,
      royalFollowUp: 'preserve',
      protectRelocatedAfterPlay: false,
      lockRelocatedAfterPlay: false,
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
      artKey: 'art.chain',
      cost: 4,
      uses: 1,
      royalFollowUp: 'preserve',
      protectRelocatedAfterPlay: false,
      lockRelocatedAfterPlay: false,
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
      artKey: 'art.homeward',
      cost: 3,
      uses: 1,
      royalFollowUp: 'preserve-existing',
      protectRelocatedAfterPlay: false,
      lockRelocatedAfterPlay: false,
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
      artKey: 'art.fist',
      cost: 3,
      uses: 1,
      royalFollowUp: 'preserve-existing',
      protectRelocatedAfterPlay: false,
      lockRelocatedAfterPlay: false,
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
      artKey: 'art.plus',
      cost: 4,
      uses: 1,
      royalFollowUp: 'preserve-existing',
      protectRelocatedAfterPlay: false,
      lockRelocatedAfterPlay: false,
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
      artKey: 'art.arrow',
      cost: 6,
      uses: 1,
      royalFollowUp: 'preserve-existing',
      protectRelocatedAfterPlay: false,
      lockRelocatedAfterPlay: false,
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
      artKey: 'art.dagger',
      cost: 5,
      uses: 1,
      royalFollowUp: 'preserve-existing',
      protectRelocatedAfterPlay: false,
      lockRelocatedAfterPlay: false,
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
    {
      /** Pinned, not frozen: it may still be taken, it simply cannot leave. */
      id: 'skill.leash',
      nameKey: 'skill.leash.name',
      textKey: 'skill.leash.text',
      artKey: 'art.leash',
      uses: 1,
      royalFollowUp: 'preserve',
      protectRelocatedAfterPlay: false,
      lockRelocatedAfterPlay: false,
      effects: [
        {
          trigger: 'on_play',
          condition: { kind: 'always' },
          actions: [{ kind: 'forbid_movement', target: { kind: 'chosen_enemy' }, duration: 3 }],
        },
      ],
    },
    {
      /**
       * A two-square leap in a straight line, granted rather than performed.
       *
       * It was authored as `teleport_piece` to an `offset` destination and that
       * is a trap the engine does not close: `cardResolves` validates
       * `own_back_rank` destinations and nothing else, so the card is offered for
       * EVERY friendly piece — including one on the far rank, whose destination is
       * off the board. Playing it there consumes the card and moves nothing.
       * Verified by driving it: a rook on c5 is offered the play, the rook stays
       * on c5, and `drafts.white.used` records the card as spent.
       *
       * `skill.shove` has shipped with the same shape since the original set, so
       * this is not a new engine defect — but it is a new INSTANCE of one, and a
       * grant always resolves. Same idea (reach two squares in a straight line,
       * over whatever is between), no silent no-op.
       */
      id: 'skill.blink',
      nameKey: 'skill.blink.name',
      textKey: 'skill.blink.text',
      artKey: 'art.blink',
      uses: 1,
      royalFollowUp: 'preserve-existing',
      protectRelocatedAfterPlay: false,
      lockRelocatedAfterPlay: false,
      effects: [
        {
          trigger: 'on_play',
          condition: { kind: 'always' },
          actions: [
            {
              kind: 'grant_movement',
              target: { kind: 'chosen_friendly' },
              pattern: {
                kind: 'jump',
                vectors: [
                  [0, 2],
                  [0, -2],
                  [2, 0],
                  [-2, 0],
                ],
              },
              duration: 3,
            },
          ],
        },
      ],
    },
    {
      /** A cheaper revival than `skill.revive`: no rook comes back either. */
      id: 'skill.mend',
      nameKey: 'skill.mend.name',
      textKey: 'skill.mend.text',
      artKey: 'art.mend',
      uses: 1,
      royalFollowUp: 'preserve-existing',
      protectRelocatedAfterPlay: false,
      lockRelocatedAfterPlay: false,
      effects: [
        {
          trigger: 'on_play',
          condition: { kind: 'always' },
          actions: [
            {
              kind: 'revive_piece',
              side: 'mover',
              at: { kind: 'own_back_rank' },
              except: ['piece.king', 'piece.queen', 'piece.rook'],
            },
          ],
        },
      ],
    },
    {
      /** Throws an enemy anywhere empty — no capture, just a piece out of position. */
      id: 'skill.quake',
      nameKey: 'skill.quake.name',
      textKey: 'skill.quake.text',
      artKey: 'art.quake',
      uses: 1,
      royalFollowUp: 'preserve-existing',
      protectRelocatedAfterPlay: true,
      lockRelocatedAfterPlay: false,
      effects: [
        {
          trigger: 'on_play',
          condition: { kind: 'always' },
          actions: [{ kind: 'teleport_piece', target: { kind: 'chosen_enemy' }, to: { kind: 'chosen_empty' } }],
        },
      ],
    },
    {
      /** Three plies of cover for one piece. */
      id: 'skill.veil',
      nameKey: 'skill.veil.name',
      textKey: 'skill.veil.text',
      artKey: 'art.veil',
      uses: 1,
      royalFollowUp: 'preserve',
      protectRelocatedAfterPlay: false,
      lockRelocatedAfterPlay: false,
      effects: [
        {
          trigger: 'on_play',
          condition: { kind: 'always' },
          actions: [{ kind: 'block_capture', target: { kind: 'chosen_friendly' }, duration: 3 }],
        },
      ],
    },
    {
      /** Lends the marksman's diagonal shot to anything for three plies. */
      id: 'skill.dart',
      nameKey: 'skill.dart.name',
      textKey: 'skill.dart.text',
      artKey: 'art.dart',
      uses: 1,
      royalFollowUp: 'preserve-existing',
      protectRelocatedAfterPlay: false,
      lockRelocatedAfterPlay: false,
      effects: [
        {
          trigger: 'on_play',
          condition: { kind: 'always' },
          actions: [
            { kind: 'grant_movement', target: { kind: 'chosen_friendly' }, pattern: { kind: 'jump', vectors: DIAGONAL_TWO }, duration: 3 },
          ],
        },
      ],
    },
    {
      /** Two squares of orthogonal reach, which a footman has never had. */
      id: 'skill.tide',
      nameKey: 'skill.tide.name',
      textKey: 'skill.tide.text',
      artKey: 'art.tide',
      uses: 1,
      royalFollowUp: 'preserve-existing',
      protectRelocatedAfterPlay: false,
      lockRelocatedAfterPlay: false,
      effects: [
        {
          trigger: 'on_play',
          condition: { kind: 'always' },
          actions: [
            {
              kind: 'grant_movement',
              target: { kind: 'chosen_friendly' },
              pattern: { kind: 'slide', vectors: ORTHOGONAL, maxDistance: 2 },
              duration: 3,
            },
          ],
        },
      ],
    },
    {
      /** The one card that turns a footman into something this expansion added. */
      id: 'skill.brand',
      nameKey: 'skill.brand.name',
      textKey: 'skill.brand.text',
      artKey: 'art.brand',
      uses: 1,
      royalFollowUp: 'preserve-existing',
      protectRelocatedAfterPlay: false,
      lockRelocatedAfterPlay: false,
      effects: [
        {
          trigger: 'on_play',
          condition: { kind: 'piece_is', pieceId: 'piece.pawn' },
          actions: [{ kind: 'promote_piece', target: { kind: 'chosen_friendly' }, to: 'piece.lancer' }],
        },
      ],
    },
    {
      /** One more footman on the home rank, no condition attached. */
      id: 'skill.echo',
      nameKey: 'skill.echo.name',
      textKey: 'skill.echo.text',
      artKey: 'art.echo',
      uses: 1,
      royalFollowUp: 'preserve-existing',
      protectRelocatedAfterPlay: false,
      lockRelocatedAfterPlay: false,
      effects: [
        {
          trigger: 'on_play',
          condition: { kind: 'always' },
          actions: [{ kind: 'spawn_piece', pieceId: 'piece.pawn', side: 'mover', at: { kind: 'own_back_rank' } }],
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
      placements: openingFor(backRank),
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
    {
      id: 'board.bastion',
      nameKey: 'board.bastion.name',
      width: 6,
      height: 6,
      placements: openingFor(bastionRank),
      // Ranks 3 and 4 only — the rule every board in this file follows, so no
      // painted square starts under a piece and all six are reachable (ADR-003).
      squares: [
        { square: 'a3', typeId: 'square.mist' },
        { square: 'f3', typeId: 'square.mist' },
        { square: 'a4', typeId: 'square.sanctuary' },
        { square: 'f4', typeId: 'square.sanctuary' },
        { square: 'c3', typeId: 'square.thorns' },
        { square: 'd4', typeId: 'square.thorns' },
        { square: 'e3', typeId: 'square.levy' },
      ],
    },
    {
      id: 'board.cavalry',
      nameKey: 'board.cavalry.name',
      width: 6,
      height: 6,
      placements: openingFor(cavalryRank),
      squares: [
        { square: 'b3', typeId: 'square.geyser' },
        { square: 'e4', typeId: 'square.geyser' },
        { square: 'a4', typeId: 'square.portal', pairedWith: 'f3' },
        { square: 'f3', typeId: 'square.portal', pairedWith: 'a4' },
        { square: 'c4', typeId: 'square.mire' },
        { square: 'd3', typeId: 'square.mire' },
        { square: 'b4', typeId: 'square.springboard' },
      ],
    },
    {
      id: 'board.covenant',
      nameKey: 'board.covenant.name',
      width: 6,
      height: 6,
      placements: openingFor(covenantRank),
      squares: [
        { square: 'a3', typeId: 'square.shrine' },
        { square: 'f4', typeId: 'square.shrine' },
        { square: 'c4', typeId: 'square.bomb' },
        { square: 'd3', typeId: 'square.bomb' },
        { square: 'b4', typeId: 'square.mist' },
        { square: 'e3', typeId: 'square.mist' },
        { square: 'f3', typeId: 'square.altar' },
      ],
    },
    {
      /**
       * The 8x8 room (v12). The engine needed nothing for this — `inBounds`
       * reads `state.width`/`state.height` and the renderer sizes from them —
       * so a bigger board is a content record, which is what this one proves.
       *
       * Ranks 3..6 are the empty ones at setup, so every painted square is
       * reachable and none sits under a piece. The paint is MIRRORED across the
       * middle: an opening where one side starts nearer a sanctuary than the
       * other is not a fair room, and on 6x6 the four painted squares made that
       * easy to get right by accident. Sixteen files of paint would not be.
       */
      id: 'board.grand',
      nameKey: 'board.grand.name',
      width: 8,
      height: 8,
      placements: openingOn(files8, 8, grandRank),
      squares: [
        { square: 'c3', typeId: 'square.springboard' },
        { square: 'f6', typeId: 'square.springboard' },
        { square: 'f3', typeId: 'square.levy' },
        { square: 'c6', typeId: 'square.levy' },
        { square: 'a4', typeId: 'square.sanctuary' },
        { square: 'h5', typeId: 'square.sanctuary' },
        { square: 'h4', typeId: 'square.altar' },
        { square: 'a5', typeId: 'square.altar' },
        { square: 'd4', typeId: 'square.portal', pairedWith: 'e5' },
        { square: 'e5', typeId: 'square.portal', pairedWith: 'd4' },
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
      /**
       * What a loadout may cost in this room (ADR-004, ADR-012).
       *
       * In stars, which is the unit the player is shown. The shipped pieces run
       * one star (pawn) to four (queen) and the cards one to two, so six lets the
       * dearest piece travel with an ordinary card. What it forbids is the pair:
       * a four-star piece beside a three-star card is seven, and refused.
       */
      loadoutBudget: 6,
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
    {
      /**
       * Constraint play. The lowest budget in the set, so a loadout is one dear
       * thing or two cheap ones and never both — and the board answers with
       * cover rather than with threats.
       */
      id: 'preset.bastion',
      nameKey: 'preset.bastion.name',
      boardId: 'board.bastion',
      pieceIds: ['piece.king', 'piece.queen', 'piece.rook', 'piece.warden', 'piece.pawn', 'piece.marksman'],
      ruleCardIds: ['rule.oath', 'rule.royal-bodyguard', 'rule.duel', 'rule.eclipse', 'rule.last-stand', 'rule.siege'],
      loadoutBudget: 4,
      skillCardIds: ['skill.veil', 'skill.bulwark', 'skill.mend', 'skill.leash', 'skill.snare', 'skill.recall'],
    },
    {
      /**
       * The opposite lever. Twice the bastion's budget, so the dearest piece
       * travels beside a dear card — the pairing the default room refuses.
       */
      id: 'preset.cavalry',
      nameKey: 'preset.cavalry.name',
      boardId: 'board.cavalry',
      pieceIds: ['piece.king', 'piece.queen', 'piece.charger', 'piece.knight', 'piece.pawn', 'piece.shade'],
      ruleCardIds: ['rule.knights-honour', 'rule.blitz', 'rule.beacon', 'rule.harvest', 'rule.fast-promotion', 'rule.three-check'],
      loadoutBudget: 8,
      skillCardIds: ['skill.blink', 'skill.charge', 'skill.knight-leap', 'skill.dart', 'skill.tide', 'skill.shove', 'skill.teleport'],
    },
    {
      /** The default budget, spent on a board that keeps replacing what it kills. */
      id: 'preset.covenant',
      nameKey: 'preset.covenant.name',
      boardId: 'board.covenant',
      pieceIds: ['piece.king', 'piece.queen', 'piece.lancer', 'piece.acolyte', 'piece.pawn', 'piece.shade'],
      ruleCardIds: ['rule.tribute', 'rule.conscription', 'rule.blood-toll', 'rule.democracy', 'rule.sudden-death', 'rule.king-of-the-hill', 'rule.harvest'],
      loadoutBudget: 6,
      skillCardIds: ['skill.echo', 'skill.brand', 'skill.quake', 'skill.revive', 'skill.sacrifice', 'skill.coronation', 'skill.swap'],
    },
    {
      /**
       * The 8x8 room's card pool, and the exclusions are the interesting part.
       *
       * FOUR shipped rule cards encode 6x6 coordinates and are silently WRONG on
       * eight ranks, so none of them is dealt here:
       *   - `king-of-the-hill` and `harvest` name `CENTRE` = c3/c4/d3/d4, which
       *     on this board is off-centre;
       *   - `fast-promotion` reads `on_own_rank: 5`, one short of promotion on
       *     six ranks and three short on eight;
       *   - `beacon` reads `on_own_rank: 6`, the opponent's back rank on six
       *     ranks and two short of it here.
       * Each would still fire — just somewhere the card text does not describe,
       * which is worse than not firing. Making them board-relative is a schema
       * question (a rank counted from the far end) and belongs to its own unit.
       */
      id: 'preset.grand',
      nameKey: 'preset.grand.name',
      boardId: 'board.grand',
      pieceIds: ['piece.king', 'piece.queen', 'piece.rook', 'piece.knight', 'piece.lancer', 'piece.pawn'],
      ruleCardIds: [
        'rule.democracy',
        'rule.blood-toll',
        'rule.three-check',
        'rule.duel',
        'rule.conscription',
        'rule.tribute',
        'rule.siege',
      ],
      loadoutBudget: 6,
      skillCardIds: ['skill.teleport', 'skill.swap', 'skill.freeze', 'skill.bulwark', 'skill.knight-leap', 'skill.volley', 'skill.recall'],
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
