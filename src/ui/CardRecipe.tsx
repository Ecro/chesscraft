import { LIFECYCLE_EVENTS, SKILL_TRIGGER } from '@content/schema'
import type { DraftKind, EditorContext } from '@editor/draft'
import { VOCABULARY_CONTROLS } from '@editor/controls'

/**
 * A card as four blocks you slot together (Chess Craft redesign).
 *
 * When / only-if / then / to-whom — a trigger, a condition, an action, and
 * who the action lands on. That is one `Effect` with one action in it, which is
 * what every bundled skill card and nine of the eleven rule cards already are.
 *
 * The detailed form below it is unchanged and still authors the full grammar:
 * several effects, several actions each, nested `not`/`all`/`any` conditions,
 * the `forEach` quantifier. This is a front door, not a replacement — and like
 * the piece grid, it REFUSES to open on anything it cannot round-trip rather
 * than flattening it. A child who opens the bodyguard rule (a `forEach` over kings) sees
 * a note pointing at the detailed form, not a card quietly reduced to one third
 * of what it was.
 *
 * Every option below is produced by `VOCABULARY_CONTROLS`, the same table the
 * palette renders from (ADR-006). A second list of "what a card can say" is a
 * second thing to keep in step with the schema, and the failure mode is a slot
 * offering something the validator refuses.
 */

/** Which slot of the sentence. */
export type SlotId = 'when' | 'cond' | 'then' | 'who'

export interface Recipe {
  /** A lifecycle event, or `on_play` for a skill card. */
  when: string
  /** The condition's discriminator — `always`, `piece_side`, and so on. */
  cond: string
  /** The action's discriminator. */
  then: string
  /** The target's discriminator, or `''` when the action takes no target. */
  who: string
}

type Draft = Record<string, unknown>
type Effect = { trigger?: unknown; condition?: unknown; actions?: unknown; forEach?: unknown }

/** Conditions this view cannot show: they nest another condition inside. */
const WRAPPING = new Set(['not', 'all', 'any'])

/**
 * Actions this view does not offer.
 *
 * `swap_pieces` takes TWO targets (`a` and `b`), and there is one to-whom slot.
 * Offering it would mean either a fifth slot that is blank for every other
 * action, or silently picking the second target — so it stays in the detailed
 * form, where both are visible.
 */
const EXCLUDED_ACTIONS = new Set(['swap_pieces'])

const kindsFor = (axis: 'condition' | 'action' | 'target', host: DraftKind): string[] =>
  VOCABULARY_CONTROLS.filter((c) => c.axis === axis && c.hosts.includes(host)).map((c) => c.kind)

/** What each slot may hold, for a given content kind. */
export function optionsFor(slot: SlotId, host: DraftKind): string[] {
  switch (slot) {
    case 'when':
      // A skill card resolves only on its own play (the SPEC's card-timing
      // constraint — this is what keeps an MTG-style priority stack out of the
      // engine), so its trigger slot has exactly one option and is shown inert.
      return host === 'skillCard' ? [SKILL_TRIGGER] : [...LIFECYCLE_EVENTS]
    case 'cond':
      return kindsFor('condition', host).filter((k) => !WRAPPING.has(k))
    case 'then':
      return kindsFor('action', host).filter((k) => !EXCLUDED_ACTIONS.has(k))
    case 'who':
      return kindsFor('target', host)
  }
}

/** Whether an action of this kind lands on a target the author picks. */
export function takesTarget(actionKind: string, ctx: EditorContext): boolean {
  return 'target' in (make('action', actionKind, ctx) as Record<string, unknown>)
}

function make(axis: 'condition' | 'action' | 'target', kind: string, ctx: EditorContext, current?: unknown): unknown {
  const control = VOCABULARY_CONTROLS.find((c) => c.axis === axis && c.kind === kind)
  return control ? control.make(ctx, current) : undefined
}

function kindOf(value: unknown): string {
  return value && typeof value === 'object' ? String((value as { kind?: unknown }).kind ?? '') : ''
}

/**
 * Reads a record's effects into the four slots, or null when they do not fit.
 *
 * Null for: no effect at all, more than one effect, more than one action, a
 * `forEach` quantifier, and a nested condition. Each of those is authorable in
 * the detailed form and none survives a round-trip through four slots.
 */
export function readRecipe(draft: Draft): Recipe | null {
  const effects = (draft.effects as Effect[] | undefined) ?? []
  if (effects.length !== 1) return null
  const effect = effects[0]!
  if (effect.forEach !== undefined) return null
  const actions = (effect.actions as unknown[] | undefined) ?? []
  if (actions.length !== 1) return null

  const cond = kindOf(effect.condition)
  if (cond === '' || WRAPPING.has(cond)) return null
  const then = kindOf(actions[0])
  if (then === '' || EXCLUDED_ACTIONS.has(then)) return null

  const target = (actions[0] as { target?: unknown }).target
  return {
    when: String(effect.trigger ?? ''),
    cond,
    then,
    who: target === undefined ? '' : kindOf(target),
  }
}

/**
 * Writes one slot back, returning the record's new `effects` array.
 *
 * Parameters are PRESERVED when a slot's kind does not change. Rebuilding the
 * action from its maker on every edit would reset `freeze_piece`'s ply count
 * every time the author changed who it lands on — the number is in a control
 * further down the detailed form, and it would have silently reverted while
 * they were looking somewhere else.
 */
export function writeRecipe(draft: Draft, slot: SlotId, value: string, ctx: EditorContext): unknown[] {
  const effects = (draft.effects as Effect[] | undefined) ?? []
  const current = effects[0]
  const action = ((current?.actions as unknown[] | undefined) ?? [])[0] as Record<string, unknown> | undefined

  const next: Effect = {
    trigger: current?.trigger ?? SKILL_TRIGGER,
    condition: current?.condition ?? make('condition', 'always', ctx),
    actions: action ? [action] : [],
  }

  if (slot === 'when') next.trigger = value
  if (slot === 'cond' && kindOf(next.condition) !== value) next.condition = make('condition', value, ctx)
  if (slot === 'then' && kindOf(action) !== value) {
    const built = make('action', value, ctx) as Record<string, unknown>
    // The target survives an action change when the new action also takes one —
    // "freeze the enemy I pick" becoming "destroy the enemy I pick" should not
    // silently retarget itself at the card's owner.
    if (built && 'target' in built && action && 'target' in action) built.target = action.target
    next.actions = built ? [built] : []
  }
  if (slot === 'who') {
    const built = ((next.actions as unknown[])[0] ?? {}) as Record<string, unknown>
    if ('target' in built) built.target = make('target', value, ctx)
  }

  return [next]
}

/**
 * The sentence the four slots spell out.
 *
 * Assembled from `ui.*` keys with `{…}` placeholders rather than composed here,
 * because Korean puts the verb last and an English-order concatenation of four
 * fragments produces something no child would read twice.
 */
export function recipeSentence(t: (key: string) => string, recipe: Recipe, host: DraftKind): string {
  const label = (axis: string, kind: string) => (kind === '' ? '' : t(`ui.editor.vocab.${axis}.${kind}`))
  return t(host === 'skillCard' ? 'ui.editor.card.sentence.skill' : 'ui.editor.card.sentence.rule')
    .replace('{when}', label('trigger', recipe.when))
    .replace('{cond}', label('condition', recipe.cond))
    .replace('{then}', label('action', recipe.then))
    .replace('{who}', label('target', recipe.who))
    .trim()
}
