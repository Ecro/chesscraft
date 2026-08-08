import { SKILL_TRIGGER } from '@content/schema'
import type { DraftKind, EditorContext } from './draft'
import { writeRecipe, type SlotId } from '@ui/CardRecipe'

/**
 * Cards that are already saying something, offered instead of a blank one.
 *
 * A blank card asks a child to invent a trigger, a condition, an action and a
 * target before anything on screen means anything — four decisions with no
 * feedback between them. Starting from a card that already works turns that into
 * one decision at a time: change the "to whom", see the sentence change, keep
 * going. It is the same reason the piece maker opens on a gallery.
 *
 * Templates are declared as SLOT VALUES, not as literal `effects` arrays, and
 * are built through `writeRecipe` — the same function the four-slot view uses.
 * A hand-written effects array would be a second account of what a card can say,
 * and the failure mode is a template the recipe view refuses to open, which is
 * exactly what AC-010 exists to prevent. Building them through the shared writer
 * makes that failure unreachable by construction rather than by vigilance.
 */

export interface CardTemplate {
  /** Stem of the id a fresh record gets: `<kind>.<stem>`. */
  stem: string
  /** Locale key for the button. */
  labelKey: string
  host: Extract<DraftKind, 'ruleCard' | 'skillCard'>
  when: string
  cond: string
  then: string
  /** `''` when the action lands on nobody the author picks. */
  who: string
}

export const CARD_TEMPLATES: readonly CardTemplate[] = [
  {
    stem: 'zap',
    labelKey: 'ui.editor.template.zap',
    host: 'skillCard',
    when: SKILL_TRIGGER,
    cond: 'always',
    then: 'destroy_piece',
    who: 'chosen_enemy',
  },
  {
    stem: 'hold',
    labelKey: 'ui.editor.template.hold',
    host: 'skillCard',
    when: SKILL_TRIGGER,
    cond: 'always',
    then: 'freeze_piece',
    who: 'chosen_enemy',
  },
  {
    stem: 'hop',
    labelKey: 'ui.editor.template.hop',
    host: 'skillCard',
    when: SKILL_TRIGGER,
    cond: 'always',
    then: 'teleport_piece',
    who: 'chosen_friendly',
  },
  {
    stem: 'toll',
    labelKey: 'ui.editor.template.toll',
    host: 'ruleCard',
    when: 'on_capture',
    cond: 'always',
    then: 'destroy_piece',
    who: 'mover',
  },
  {
    stem: 'tar',
    labelKey: 'ui.editor.template.tar',
    host: 'ruleCard',
    when: 'on_enter',
    cond: 'always',
    then: 'freeze_piece',
    who: 'entering',
  },
  {
    stem: 'guard',
    labelKey: 'ui.editor.template.guard',
    host: 'ruleCard',
    when: 'end_of_ply',
    cond: 'always',
    then: 'block_capture',
    who: 'mover',
  },
]

export function templatesFor(kind: DraftKind): readonly CardTemplate[] {
  return CARD_TEMPLATES.filter((tpl) => tpl.host === kind)
}

/**
 * Fills a blank draft in from a template.
 *
 * The slots are applied in the order the writer needs rather than the order the
 * sentence reads: `then` builds the action, so `who` has something to land on,
 * and the trigger goes last because changing it must not rebuild what came
 * before it.
 */
export function applyTemplate(base: Record<string, unknown>, tpl: CardTemplate, ctx: EditorContext): Record<string, unknown> {
  const draft = structuredClone(base)
  const order: Array<[SlotId, string]> = [
    ['then', tpl.then],
    ['who', tpl.who],
    ['cond', tpl.cond],
    ['when', tpl.when],
  ]
  for (const [slot, value] of order) {
    // A template whose action takes no target leaves the slot alone rather than
    // writing an empty one — `writeRecipe` would no-op, but an empty string in
    // the draft is a different document from an absent target.
    if (slot === 'who' && value === '') continue
    draft.effects = writeRecipe(draft, slot, value, ctx)
  }
  return draft
}
