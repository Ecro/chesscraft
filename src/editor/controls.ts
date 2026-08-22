import { LIFECYCLE_EVENTS, SKILL_TRIGGER } from '@content/schema'
import type { DraftKind, EditorContext } from './draft'
import { MOVEMENT_KINDS, type VocabAxis, enumerateVocabulary } from './vocabulary'

/**
 * One editor control per vocabulary entry (ADR-006).
 *
 * The palette the UI renders IS this table — the buttons are `.map`ped from it
 * rather than written out by hand, so "the control exists" and "the table says
 * it exists" cannot come apart. What each control writes lives here too, beside
 * the entry it writes, which is the only place a reader can check the two
 * against each other.
 *
 * `hosts` is trigger availability made concrete (ADR-003): a control the
 * current content kind's schema does not admit renders disabled rather than
 * absent, so an author can see that the vocabulary is wider than this form.
 */

export type { EditorContext }

export interface VocabularyControl {
  axis: VocabAxis
  kind: string
  testid: string
  /** Content kinds whose schema admits this entry. */
  hosts: readonly DraftKind[]
  /**
   * The value inserted on click. `current` is the value being replaced, which
   * only the wrapping conditions (`not` / `all` / `any`) need.
   */
  make(ctx: EditorContext, current?: unknown): unknown
}

export function controlTestId(axis: VocabAxis, kind: string): string {
  return `vocab-${axis}-${kind}`
}

const EFFECT_HOSTS: readonly DraftKind[] = ['piece', 'squareType', 'ruleCard', 'skillCard']
/** `squareEffect` admits only these four of the seven lifecycle events. */
const SQUARE_TRIGGERS = new Set(['generate_moves', 'on_enter', 'on_leave', 'end_of_ply'])

const SELF = { kind: 'self' } as const

/** First id, or a placeholder that fails validation rather than one that passes. */
function firstPiece(ctx: EditorContext): string {
  return ctx.pieceIds[0] ?? ''
}

const MAKERS: Record<string, (ctx: EditorContext, current?: unknown) => unknown> = {
  // targets
  'target:self': () => ({ kind: 'self' }),
  'target:mover': () => ({ kind: 'mover' }),
  'target:entering': () => ({ kind: 'entering' }),
  'target:occupant': () => ({ kind: 'occupant' }),
  'target:adjacent_friendly': () => ({ kind: 'adjacent_friendly' }),
  'target:chosen_friendly': () => ({ kind: 'chosen_friendly' }),
  'target:chosen_enemy': () => ({ kind: 'chosen_enemy' }),
  'targetFilter:non_royal': () => ({ kind: 'non_royal' }),
  'targetFilter:exclude_piece_ids': (ctx) => ({ kind: 'exclude_piece_ids', pieceIds: [firstPiece(ctx)] }),
  'targetFilter:allowed_piece_ids': (ctx) => ({ kind: 'allowed_piece_ids', pieceIds: [firstPiece(ctx)] }),
  'relation:adjacent_to_choice': () => ({ kind: 'adjacent_to_choice', choiceIndex: 0 }),

  // destinations
  'destination:paired_square': () => ({ kind: 'paired_square' }),
  'destination:chosen_empty': () => ({ kind: 'chosen_empty' }),
  'destination:square': (ctx) => ({ kind: 'square', square: ctx.squares[0] ?? 'a1' }),
  'destination:own_back_rank': () => ({ kind: 'own_back_rank' }),
  'destination:offset': () => ({ kind: 'offset', df: 0, dr: 1 }),
  'destinationRegion:any': () => 'any',
  'destinationRegion:own_territory': () => 'own_territory',
  'destinationRegion:opponent_territory': () => 'opponent_territory',
  'destinationRegion:local': () => 'local',

  // conditions
  'condition:always': () => ({ kind: 'always' }),
  'condition:piece_is': (ctx) => ({ kind: 'piece_is', pieceId: firstPiece(ctx) }),
  'condition:piece_side': () => ({ kind: 'piece_side', side: 'mover' }),
  'condition:in_promotion_zone': () => ({ kind: 'in_promotion_zone' }),
  // Empty until the author paints a square: a condition that matches nowhere
  // must fail validation, not quietly match everywhere.
  'condition:on_square': () => ({ kind: 'on_square', squares: [] }),
  'condition:on_own_rank': () => ({ kind: 'on_own_rank', n: 1 }),
  'condition:check_count_at_least': () => ({ kind: 'check_count_at_least', n: 1 }),
  'condition:piece_count_at_most': () => ({ kind: 'piece_count_at_most', side: 'mover', n: 1 }),
  // Seeded at n:0 — "none left" is the reading this entry exists for, and the
  // one its sibling cannot express.
  'condition:piece_kind_count_at_most': (ctx) => ({
    kind: 'piece_kind_count_at_most',
    side: 'opponent',
    pieceId: ctx.pieceIds[0] ?? '',
    n: 0,
  }),
  'condition:not': (_ctx, current) => ({ kind: 'not', of: current ?? { kind: 'always' } }),
  'condition:all': (_ctx, current) => ({ kind: 'all', of: [current ?? { kind: 'always' }] }),
  'condition:any': (_ctx, current) => ({ kind: 'any', of: [current ?? { kind: 'always' }] }),

  // actions
  'action:destroy_piece': () => ({ kind: 'destroy_piece', target: { ...SELF } }),
  'action:teleport_piece': () => ({ kind: 'teleport_piece', target: { ...SELF }, to: { kind: 'chosen_empty' } }),
  'action:promote_piece': (ctx) => ({ kind: 'promote_piece', target: { ...SELF }, to: firstPiece(ctx) }),
  'action:spawn_piece': (ctx) => ({
    kind: 'spawn_piece',
    pieceId: firstPiece(ctx),
    side: 'mover',
    at: { kind: 'chosen_empty' },
  }),
  'action:block_capture': () => ({ kind: 'block_capture', target: { ...SELF } }),
  'action:freeze_piece': () => ({ kind: 'freeze_piece', target: { ...SELF }, plies: 1 }),
  'action:grant_movement': () => ({
    kind: 'grant_movement',
    target: { ...SELF },
    pattern: { kind: 'step', vectors: [[0, 1]] },
  }),
  'action:forbid_movement': () => ({ kind: 'forbid_movement', target: { ...SELF } }),
  'action:swap_pieces': () => ({ kind: 'swap_pieces', a: { kind: 'chosen_friendly' }, b: { kind: 'chosen_enemy' } }),
  'action:revive_piece': () => ({ kind: 'revive_piece', side: 'mover', at: { kind: 'own_back_rank' } }),
  'action:win': () => ({ kind: 'win', side: 'mover' }),

  // Straight movement patterns start empty until the author paints a square;
  // turning_slide starts on one outer ray, whose second leg is automatic.
  'movement:slide': () => ({ kind: 'slide', vectors: [] }),
  'movement:step': () => ({ kind: 'step', vectors: [] }),
  'movement:turning_slide': () => ({ kind: 'turning_slide', vectors: [[0, 1]], turn: 'any' }),
  // No `movement:jump`. Retired with `MOVEMENT_KINDS` (ADR-006) — the reason is
  // recorded at BOTH removal sites on purpose, so a reader who finds one half
  // does not restore it from the other.

  // the forEach quantifier
  'forEach:piece': () => ({ kind: 'piece' }),
}

function hostsFor(axis: VocabAxis, kind: string): readonly DraftKind[] {
  if (axis === 'movement') return ['piece']
  if (axis === 'trigger') {
    if (kind === SKILL_TRIGGER) return ['skillCard']
    const hosts: DraftKind[] = ['piece', 'ruleCard']
    if (SQUARE_TRIGGERS.has(kind)) hosts.splice(1, 0, 'squareType')
    return hosts
  }
  return EFFECT_HOSTS
}

export const VOCABULARY_CONTROLS: readonly VocabularyControl[] = enumerateVocabulary().map(({ axis, kind }) => ({
  axis,
  kind,
  testid: controlTestId(axis, kind),
  hosts: hostsFor(axis, kind),
  make:
    axis === 'trigger'
      ? () => kind
      : (MAKERS[`${axis}:${kind}`] ??
        (() => {
          // A vocabulary entry with no maker is an editor that cannot author it;
          // fail loudly at module load rather than render a button that does
          // nothing, which is the failure mode this whole file exists to avoid.
          throw new Error(`no editor control defined for ${axis}:${kind}`)
        })),
}))

export function controlsFor(axis: VocabAxis): VocabularyControl[] {
  return VOCABULARY_CONTROLS.filter((c) => c.axis === axis)
}

/** Sanity: every lifecycle event and movement kind has a control. */
export const CONTROL_COUNT = VOCABULARY_CONTROLS.length
export const TRIGGER_KINDS = [...LIFECYCLE_EVENTS, SKILL_TRIGGER]
export { MOVEMENT_KINDS }
