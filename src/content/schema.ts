import { z } from 'zod'

/**
 * The declarative content vocabulary (ADR-001, ADR-003).
 *
 * One `Effect` grammar is shared by every effect-bearing content kind — pieces,
 * rule cards, skill cards and special-square types. The owner decides which
 * triggers are *available*; the grammar, the interpreter and the editor form
 * family are one.
 *
 * Adding expressiveness means adding to this vocabulary and bumping
 * SCHEMA_VERSION (ADR-005). There is no code escape hatch and no generic
 * "do arbitrary thing" action — that would be a code hook wearing a schema
 * costume.
 */

/**
 * Bumped 1 -> 2 in Phase 6a (ADR-005). Writing the whole card set down showed
 * only 6 of 28 cards were expressible; version 2 adds `forEach`, `revive_piece`,
 * and wires the two entries that validated while doing nothing.
 *
 * Bumped 2 -> 3 in Phase 6b. After 6a's cuts and holds the research drafts left
 * 4 rule and 6 skill cards authorable against AC-010's 10 and 14, so v3 adds the
 * four things the remaining specified cards needed and nothing else: a swap
 * action, a destination relative to the piece being moved, a duration on the
 * three generation-time actions, and a condition over a side's material.
 *
 * Bumped 4 -> 5 for the rest of ADR-017's icon axis. v4 gave `iconKey` to
 * pieces only, which left the three other things a player has to recognise —
 * the rule in play, a skill card in a hand of four, a painted square — as walls
 * of Korean prose distinguishable only by reading them. The board could say
 * "something happens here" but never WHAT, and the UI cannot supply the missing
 * half itself: a `.square[data-square-type='square.bomb']` rule would put a
 * content id in a stylesheet, which is the one thing ADR-011 forbids. So the
 * icon is content, exactly as the piece glyph is.
 *
 * Every field is optional and every v4 document still loads unchanged.
 */
export const SCHEMA_VERSION = 5

/**
 * Lifecycle events, in resolution order (ADR-002). Resolution is a total order
 * over (event x owner layer): the engine walks E1..E7 in this sequence, and
 * within each event it resolves the owner layers board square -> piece passive
 * -> rule card -> skill card.
 */
export const LIFECYCLE_EVENTS = [
  'generate_moves', // E1
  'on_leave', // E2 — origin square vacated
  'on_capture', // E3 — occupant removed (king capture short-circuits here)
  'on_enter', // E4 — destination occupied
  'on_promote', // E5
  'on_remove', // E6 — deferred destructions
  'end_of_ply', // E7
] as const
export type LifecycleEvent = (typeof LIFECYCLE_EVENTS)[number]

/**
 * A skill card resolves on its own play, never in response to another card
 * (SPEC card-timing constraint — this is what keeps an MTG-style priority stack
 * out of the engine).
 */
export const SKILL_TRIGGER = 'on_play' as const

/** Maximum cascade depth before a content set is treated as malformed (ADR-002). */
export const MAX_CASCADE_DEPTH = 8

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

/**
 * Player-facing text is always an i18n key, never a literal (AC-016). Keys are
 * dotted lowercase ASCII, which no natural-language string satisfies.
 */
export const i18nKey = z
  .string()
  .regex(/^[a-z][a-z0-9]*(?:\.[a-z0-9-]+)+$/, 'must be a dotted lowercase i18n key, not literal text')

export const contentId = z.string().regex(/^[a-z]+\.[a-z0-9-]+$/, 'must be `<kind>.<slug>`')

/** Algebraic square notation, e.g. `c3`. Bounds are checked against the board. */
export const squareRef = z.string().regex(/^[a-z][1-9][0-9]*$/, 'must be algebraic square notation')

export const vector = z.tuple([z.number().int(), z.number().int()])

export const movePattern = z.strictObject({
  kind: z.enum(['slide', 'step', 'jump']),
  vectors: z.array(vector).min(1),
  /** Slide range cap; omitted means "to the board edge". */
  maxDistance: z.number().int().positive().optional(),
  /** When true, vectors are mirrored by the owning side's forward direction. */
  forward: z.boolean().optional(),
})
export type MovePattern = z.infer<typeof movePattern>

// ---------------------------------------------------------------------------
// Effect grammar: trigger / condition / action
// ---------------------------------------------------------------------------

export const target = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('self') }),
  z.strictObject({ kind: z.literal('mover') }),
  z.strictObject({ kind: z.literal('entering') }),
  z.strictObject({ kind: z.literal('occupant') }),
  z.strictObject({ kind: z.literal('adjacent_friendly') }),
  z.strictObject({ kind: z.literal('chosen_friendly') }),
  z.strictObject({ kind: z.literal('chosen_enemy') }),
])
export type Target = z.infer<typeof target>

export const destination = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('paired_square') }),
  z.strictObject({ kind: z.literal('chosen_empty') }),
  z.strictObject({ kind: z.literal('square'), square: squareRef }),
  z.strictObject({ kind: z.literal('own_back_rank') }),
  /**
   * A square relative to the piece being moved (v3). `forward` mirrors `dr` by
   * the piece's own side, so one card can mean "one square backwards" for both
   * players instead of being written twice or pinned to a board.
   */
  z.strictObject({
    kind: z.literal('offset'),
    df: z.number().int(),
    dr: z.number().int(),
    forward: z.boolean().optional(),
  }),
])

export type Condition =
  | { kind: 'always' }
  | { kind: 'piece_is'; pieceId: string }
  | { kind: 'piece_side'; side: 'mover' | 'opponent' }
  | { kind: 'on_square'; squares: string[] }
  | { kind: 'check_count_at_least'; n: number }
  | { kind: 'piece_count_at_most'; side: 'mover' | 'opponent'; n: number }
  | { kind: 'not'; of: Condition }
  | { kind: 'all'; of: Condition[] }
  | { kind: 'any'; of: Condition[] }

export const condition: z.ZodType<Condition> = z.lazy(() =>
  z.discriminatedUnion('kind', [
    z.strictObject({ kind: z.literal('always') }),
    z.strictObject({ kind: z.literal('piece_is'), pieceId: contentId }),
    z.strictObject({ kind: z.literal('piece_side'), side: z.enum(['mover', 'opponent']) }),
    z.strictObject({ kind: z.literal('on_square'), squares: z.array(squareRef).min(1) }),
    z.strictObject({ kind: z.literal('check_count_at_least'), n: z.number().int().positive() }),
    z.strictObject({
      kind: z.literal('piece_count_at_most'),
      side: z.enum(['mover', 'opponent']),
      n: z.number().int().positive(),
    }),
    z.strictObject({ kind: z.literal('not'), of: condition }),
    z.strictObject({ kind: z.literal('all'), of: z.array(condition).min(1) }),
    z.strictObject({ kind: z.literal('any'), of: z.array(condition).min(1) }),
  ]),
)

export const action = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('destroy_piece'), target }),
  z.strictObject({ kind: z.literal('teleport_piece'), target, to: destination }),
  z.strictObject({ kind: z.literal('promote_piece'), target, to: contentId }),
  z.strictObject({
    kind: z.literal('spawn_piece'),
    pieceId: contentId,
    side: z.enum(['mover', 'opponent']),
    at: destination,
  }),
  /**
   * `duration` (v3) is what makes these three usable from a skill card at all.
   * They are consumed at move generation, so without it a card carrying one
   * resolved at `on_play` and left nothing behind — it validated, drew, played
   * and did nothing. Omitted means "this generation pass only", which is what a
   * piece passive or a rule card wants.
   */
  z.strictObject({ kind: z.literal('block_capture'), target, duration: z.number().int().positive().optional() }),
  z.strictObject({ kind: z.literal('freeze_piece'), target, plies: z.number().int().positive() }),
  z.strictObject({
    kind: z.literal('grant_movement'),
    target,
    pattern: movePattern,
    duration: z.number().int().positive().optional(),
  }),
  z.strictObject({ kind: z.literal('forbid_movement'), target, duration: z.number().int().positive().optional() }),
  /**
   * Exchanges two pieces (v3). Not expressible as two teleports: each requires
   * its destination empty, and in a swap neither one is.
   */
  z.strictObject({ kind: z.literal('swap_pieces'), a: target, b: target }),
  /**
   * Returns a captured piece to the board (schema v2). Separate from
   * `spawn_piece` because it consumes the graveyard rather than creating from
   * nothing — a card that can revive what was lost is a comeback mechanic, and
   * one that conjures new material is not.
   */
  z.strictObject({
    kind: z.literal('revive_piece'),
    side: z.enum(['mover', 'opponent']),
    at: destination,
    /** Piece ids this card refuses to bring back, e.g. the queen. */
    except: z.array(contentId).optional(),
  }),
  /** Victory is an ordinary action in the shared vocabulary (ADR-012). */
  z.strictObject({ kind: z.literal('win'), side: z.enum(['mover', 'opponent']) }),
])
export type Action = z.infer<typeof action>

/**
 * Trigger availability is per owner (ADR-003 consequence) — without it, authors
 * can write triggers that never fire, which is a silent absent-case bug.
 */
/**
 * Binds each matching board piece as the effect's owner and subject (schema v2).
 *
 * A rule-card effect has no square of its own, so every piece-relative target
 * (`self`, `adjacent_friendly`) resolved to nothing — six of the fourteen rule
 * cards were blocked on that one hole. `forEach` is the quantifier the grammar
 * was missing: with it, "pieces standing next to their own king are safe" is
 * one effect evaluated once per king, not a special case in the engine.
 */
export const forEachSelector = z.strictObject({
  kind: z.literal('piece'),
  pieceId: contentId.optional(),
  side: z.enum(['mover', 'opponent', 'any']).optional(),
})
export type ForEachSelector = z.infer<typeof forEachSelector>

function effectFor(triggers: readonly [string, ...string[]]) {
  return z.strictObject({
    trigger: z.enum(triggers),
    condition,
    actions: z.array(action).min(1),
    forEach: forEachSelector.optional(),
  })
}

const lifecycleEffect = effectFor(LIFECYCLE_EVENTS)
const squareEffect = effectFor(['generate_moves', 'on_enter', 'on_leave', 'end_of_ply'])
const skillEffect = effectFor([SKILL_TRIGGER])

export type Effect = z.infer<typeof lifecycleEffect>

// ---------------------------------------------------------------------------
// The five content axes
// ---------------------------------------------------------------------------

export const pieceDef = z.strictObject({
  id: contentId,
  nameKey: i18nKey,
  textKey: i18nKey,
  /**
   * The glyph the board draws for this piece (ADR-017), resolved through the
   * same locale bundle as every other key so the UI keeps naming no piece.
   *
   * Optional, and the absent case is the common one rather than an edge: every
   * document written before v4 lacks it, and so does every piece an author
   * creates until the editor grows the control. The renderer falls back to the
   * first grapheme of the translated name — never a blank square.
   */
  iconKey: i18nKey.optional(),
  movement: z.array(movePattern).min(1),
  /** Omitted means captures use the movement patterns. */
  attack: z.array(movePattern).min(1).optional(),
  /**
   * Capturing a royal piece ends the match immediately (AC-002, ADR-012).
   * Royalty is declared by content so no engine source names a specific piece.
   */
  royal: z.boolean().optional(),
  promotion: z
    .strictObject({
      onRank: z.union([z.literal('last'), z.number().int().positive()]),
      to: contentId,
    })
    .optional(),
  effects: z.array(lifecycleEffect),
})
export type PieceDef = z.infer<typeof pieceDef>

export const squareTypeDef = z.strictObject({
  id: contentId,
  nameKey: i18nKey,
  textKey: i18nKey,
  /**
   * The mark the board draws on a square of this type (v5).
   *
   * Without it every painted type is the same violet stripe, so a board can say
   * "something happens here" and never which thing — and the five bundled types
   * range from "your pawn becomes a queen" to "your piece is destroyed".
   */
  iconKey: i18nKey.optional(),
  /** Paired types require a symmetric partner on every board (ADR-010). */
  paired: z.boolean(),
  effects: z.array(squareEffect),
})
export type SquareTypeDef = z.infer<typeof squareTypeDef>

export const ruleCardDef = z.strictObject({
  id: contentId,
  nameKey: i18nKey,
  textKey: i18nKey,
  /** The mark shown beside the rule in play, and on the board's rule badge (v5). */
  iconKey: i18nKey.optional(),
  /** Balance budget, in the Knightmare Chess sense. Unused by the MVP engine. */
  cost: z.number().int().nonnegative(),
  effects: z.array(lifecycleEffect),
})
export type RuleCardDef = z.infer<typeof ruleCardDef>

export const skillCardDef = z.strictObject({
  id: contentId,
  nameKey: i18nKey,
  textKey: i18nKey,
  /** The mark on the card face, in the draft sheet and in the tray tile (v5). */
  iconKey: i18nKey.optional(),
  cost: z.number().int().nonnegative(),
  uses: z.number().int().positive(),
  effects: z.array(skillEffect),
})
export type SkillCardDef = z.infer<typeof skillCardDef>

export const boardDef = z
  .strictObject({
    id: contentId,
    nameKey: i18nKey,
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    placements: z.array(
      z.strictObject({
        square: squareRef,
        pieceId: contentId,
        side: z.enum(['white', 'black']),
      }),
    ),
    squares: z.array(
      z.strictObject({
        square: squareRef,
        typeId: contentId,
        pairedWith: squareRef.optional(),
      }),
    ),
  })
  .superRefine((board, ctx) => {
    const inBounds = (sq: string) => {
      const parsed = parseSquare(sq)
      return parsed !== null && parsed.file < board.width && parsed.rank < board.height
    }
    board.placements.forEach((p, i) => {
      if (!inBounds(p.square)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['placements', i],
          message: `square ${p.square} is outside the ${board.width}x${board.height} board`,
        })
      }
    })
    board.squares.forEach((s, i) => {
      if (!inBounds(s.square)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['squares', i],
          message: `square ${s.square} is outside the ${board.width}x${board.height} board`,
        })
      }
    })
  })
export type BoardDef = z.infer<typeof boardDef>

export const presetDef = z.strictObject({
  id: contentId,
  nameKey: i18nKey,
  boardId: contentId,
  pieceIds: z.array(contentId).min(1),
  ruleCardIds: z.array(contentId),
  skillCardIds: z.array(contentId),
})
export type PresetDef = z.infer<typeof presetDef>

/** Zero-based file/rank, or null when the notation is unparseable. */
export function parseSquare(sq: string): { file: number; rank: number } | null {
  const m = /^([a-z])([1-9][0-9]*)$/.exec(sq)
  if (!m) return null
  return { file: m[1]!.charCodeAt(0) - 97, rank: Number(m[2]) - 1 }
}

export const COLLECTIONS = {
  pieces: pieceDef,
  squareTypes: squareTypeDef,
  ruleCards: ruleCardDef,
  skillCards: skillCardDef,
  boards: boardDef,
  presets: presetDef,
} as const

export type CollectionName = keyof typeof COLLECTIONS
