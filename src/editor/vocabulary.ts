import { LIFECYCLE_EVENTS, SKILL_TRIGGER, action, condition, destination, target } from '@content/schema'

/**
 * The vocabulary, enumerated (ADR-006).
 *
 * Derived from the Zod schemas rather than restated, so this file cannot drift
 * from the grammar it describes. What it does NOT do is decide whether the
 * editor supports an entry — that is `controls.ts`, and the gap between the two
 * is exactly what the coverage test measures.
 *
 * Note that enumerating KINDS is not the same as enumerating the vocabulary:
 * schema v3's headline addition was `duration`, a parameter on three existing
 * kinds. Parameters live with their controls, not here.
 */

export type VocabAxis =
  | 'trigger'
  | 'target'
  | 'targetFilter'
  | 'relation'
  | 'destination'
  | 'destinationRegion'
  | 'condition'
  | 'action'
  | 'movement'
  | 'forEach'

export interface VocabularyEntry {
  axis: VocabAxis
  kind: string
}

/** The `kind` literal of every option in a Zod discriminated union. */
function kindsOf(union: { options: readonly unknown[] }): string[] {
  return union.options.map((option) => {
    const shape = (option as { shape: { kind: { value: string } } }).shape
    return shape.kind.value
  })
}

/** `condition` is recursive, so it is wrapped in `z.lazy` — unwrap it first. */
function conditionKinds(): string[] {
  const inner = (condition as unknown as { _def: { getter: () => { options: readonly unknown[] } } })._def.getter()
  return kindsOf(inner)
}

/**
 * The movement kinds an author can still CHOOSE.
 *
 * `jump` retired here (ADR-006 of PLAN-unified-create-ux). The schema still accepts
 * it — `content/schema.ts` is an independent enum and existing documents load and
 * play unchanged — but nothing offers it any more, because the engine gives `step`
 * and `jump` the same `maxSteps` and branches on nothing else: a single-step move
 * has no square in between for a jump to jump over. The grid always emitted
 * `'step'` regardless, so the only control that could author a `jump` was the
 * indexed pattern editor that PLAN Phase 7 deletes, and leaving the entry
 * enumerated would have left the ADR-006 gate demanding a control that no longer
 * exists.
 *
 * Do NOT restore this without restoring an editor for it; the gate is what will
 * tell you, and it will be right.
 */
export const MOVEMENT_KINDS = ['slide', 'step'] as const

export function enumerateVocabulary(): VocabularyEntry[] {
  return [
    ...LIFECYCLE_EVENTS.map((kind) => ({ axis: 'trigger' as const, kind })),
    { axis: 'trigger' as const, kind: SKILL_TRIGGER },
    ...kindsOf(target as unknown as { options: readonly unknown[] }).map((kind) => ({ axis: 'target' as const, kind })),
    { axis: 'targetFilter' as const, kind: 'non_royal' },
    { axis: 'targetFilter' as const, kind: 'exclude_piece_ids' },
    { axis: 'targetFilter' as const, kind: 'allowed_piece_ids' },
    { axis: 'relation' as const, kind: 'adjacent_to_choice' },
    ...kindsOf(destination as unknown as { options: readonly unknown[] }).map((kind) => ({
      axis: 'destination' as const,
      kind,
    })),
    ...(['any', 'own_territory', 'opponent_territory', 'local'] as const).map((kind) => ({
      axis: 'destinationRegion' as const,
      kind,
    })),
    ...conditionKinds().map((kind) => ({ axis: 'condition' as const, kind })),
    ...kindsOf(action as unknown as { options: readonly unknown[] }).map((kind) => ({ axis: 'action' as const, kind })),
    ...MOVEMENT_KINDS.map((kind) => ({ axis: 'movement' as const, kind })),
    { axis: 'forEach' as const, kind: 'piece' },
  ]
}
