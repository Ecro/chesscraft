import type { DraftKind, EditorContext } from '@editor/draft'
import { VOCABULARY_CONTROLS } from '@editor/controls'

/**
 * A record's effect as one readable sentence — the maker's ONLY structural editor.
 *
 * ## Why this file grew
 *
 * The first version was four fixed slots: when / only-if / then / to-whom. That is
 * one `Effect` with one action, which is what every bundled skill card and nine of
 * the eleven rule cards already are — and it REFUSED to open anything else,
 * pointing at a 45-control indexed form behind a second tab (`form-tab-expert`).
 * That tab was not a teaching aid; it existed because the sentence could not say
 * everything. So the sentence learned to say everything (ADR-002, ADR-007) and
 * the tab goes away.
 *
 * Four things were measured as missing against the bundle (2026-08-08): the
 * `forEach` quantifier (6 cards), two actions in one effect (1), a two-target
 * action (1), and a compound `all` condition (1). Three more were missing against
 * the VOCABULARY, which is what ADR-006's coverage gate actually measures and
 * which the four-slot view never covered at all because they only ever existed in
 * the indexed form: the `destination` axis (5 gate rows), `condition: 'not'`, and
 * every parameter a kind carries.
 *
 * ## What it still refuses
 *
 * Refusing beats flattening — a child who opens a card must not see it quietly
 * reduced to a third of itself. `readSentence` returns `null` for: two or more
 * effects, three or more actions in one effect, a condition nested more than one
 * level deep, and a `forEach` over anything but a piece. Those records render
 * read-only (AC-007), with their bytes untouched.
 *
 * `null` is NOT the empty case. A brand-new card has `effects: []` and reads back
 * as a sentence with empty slots, because the sentence is the editor: "nothing
 * said yet" is a state to fill in, not a record we cannot show. The old
 * `readRecipe` conflated the two and a fresh card therefore rendered the
 * "made in the detailed form" note on a child's first tap.
 *
 * ## Params are preserved, never rebuilt
 *
 * Every write reuses the raw condition and action VALUES and rebuilds one only
 * when its `kind` actually changes. Rebuilding from the maker on every edit would
 * reset `freeze_piece`'s ply count each time the author changed who it lands on —
 * silently, while they were looking at a different control.
 *
 * Every option comes from `VOCABULARY_CONTROLS`, the same table the coverage gate
 * enumerates (ADR-006). A second list of "what a card can say" is a second thing
 * to keep in step with the schema, and its failure mode is a slot offering
 * something the validator refuses.
 */

/** Which part of the sentence a write addresses. */
export type SlotId =
  // the shared frame
  | 'when'
  | 'each'
  // the condition: two leaves, each independently negatable, joined by `op`
  | 'cond'
  | 'not'
  | 'cond2'
  | 'not2'
  | 'op'
  // the first action, its target(s) and its destination
  | 'then'
  | 'who'
  | 'whoB'
  | 'where'
  // the second action, likewise
  | 'then2'
  | 'who2'
  | 'who2B'
  | 'where2'

/** One condition leaf: a discriminator, plus whether it is inverted. */
export interface SentenceCond {
  kind: string
  not: boolean
}

/** One action: a discriminator, its target slots in order, and its destination. */
export interface SentenceAction {
  kind: string
  /** `[]`, `['self']`, or two entries for a two-target action like `swap_pieces`. */
  targets: string[]
  /** The destination discriminator, or `''` for an action that takes none. */
  dest: string
}

export interface Sentence {
  /** A lifecycle event, `on_play` for a skill card, or `''` when not chosen yet. */
  when: string
  /** The quantifier's kind, or `''` when the effect applies once. */
  each: string
  /** How two condition leaves join. `''` for a single leaf or none. */
  op: 'all' | 'any' | ''
  /** One leaf, two leaves, or none at all on a brand-new record. */
  cond: SentenceCond[]
  /** One action, two, or none at all on a brand-new record. */
  actions: SentenceAction[]
}

type Draft = Record<string, unknown>
type Effect = {
  trigger?: unknown
  condition?: unknown
  actions?: unknown
  forEach?: unknown
}

/** Conditions that wrap another condition — expressed by the toggle and `op`. */
const WRAPPING = new Set(['not', 'all', 'any'])

/** Which key of an action holds its destination. Explicit, because `promote_piece.to` is a piece id, not a place. */
const DESTINATION_KEY: Readonly<Record<string, string>> = {
  teleport_piece: 'to',
  spawn_piece: 'at',
  revive_piece: 'at',
}

/**
 * Actions the four-slot view could not show. Kept ONLY for the back-compat shims
 * at the bottom of this file; `optionsFor` no longer filters it, because a second
 * to-whom slot is exactly what this model added.
 */
const LEGACY_EXCLUDED_ACTIONS = new Set(['swap_pieces'])

const kindsFor = (axis: 'trigger' | 'condition' | 'action' | 'target' | 'destination' | 'forEach', host: DraftKind): string[] =>
  VOCABULARY_CONTROLS.filter((c) => c.axis === axis && c.hosts.includes(host)).map((c) => c.kind)

/** What each slot may hold, for a given content kind. */
export function optionsFor(slot: SlotId, host: DraftKind): string[] {
  switch (slot) {
    case 'when':
      // Derived from the control table's own `hosts`, not from LIFECYCLE_EVENTS
      // directly: `squareEffect` admits only four of the seven events, and a slot
      // offering the other three would offer something the validator refuses.
      return kindsFor('trigger', host)
    case 'each':
      return kindsFor('forEach', host)
    case 'cond':
    case 'cond2':
      return kindsFor('condition', host).filter((k) => !WRAPPING.has(k))
    case 'op':
      return ['all', 'any']
    case 'not':
    case 'not2':
      // A toggle, not a picker — its two states are "" and anything else.
      return []
    case 'then':
    case 'then2':
      return kindsFor('action', host)
    case 'who':
    case 'whoB':
    case 'who2':
    case 'who2B':
      return kindsFor('target', host)
    case 'where':
    case 'where2':
      return kindsFor('destination', host)
  }
}

function make(
  axis: 'condition' | 'action' | 'target' | 'destination' | 'forEach',
  kind: string,
  ctx: EditorContext,
  current?: unknown,
): unknown {
  const control = VOCABULARY_CONTROLS.find((c) => c.axis === axis && c.kind === kind)
  return control ? control.make(ctx, current) : undefined
}

function kindOf(value: unknown): string {
  return value && typeof value === 'object' ? String((value as { kind?: unknown }).kind ?? '') : ''
}

/**
 * Which keys of THIS action value hold targets, in slot order.
 *
 * Read from the value rather than from a per-kind table so the reader never needs
 * an `EditorContext`: `readSentence(record)` is called on bundled records and in
 * tests with nothing else to hand. `targetCount` below answers the same question
 * for a kind that has not been built yet, which is what the UI needs.
 */
function targetKeysOf(action: Record<string, unknown>): string[] {
  if ('a' in action || 'b' in action) return ['a', 'b']
  return 'target' in action ? ['target'] : []
}

/** How many target slots an action of this kind carries: 0, 1, or 2. */
export function targetCount(actionKind: string, ctx: EditorContext): number {
  const built = make('action', actionKind, ctx)
  return built ? targetKeysOf(built as Record<string, unknown>).length : 0
}

/** Whether an action of this kind lands on a target the author picks. */
export function takesTarget(actionKind: string, ctx: EditorContext): boolean {
  return targetCount(actionKind, ctx) > 0
}

/** Whether an action of this kind sends its target somewhere the author picks. */
export function takesDestination(actionKind: string, _ctx: EditorContext): boolean {
  return DESTINATION_KEY[actionKind] !== undefined
}

// --- reading ----------------------------------------------------------------

/** A leaf plus the raw value it was read from, so a write can preserve params. */
interface RawLeaf {
  kind: string
  not: boolean
  /** The condition object WITHOUT any `not` wrapper. */
  value: unknown
}

interface RawCond {
  leaves: RawLeaf[]
  op: 'all' | 'any' | ''
}

function readLeaf(value: unknown): RawLeaf | null {
  const kind = kindOf(value)
  if (kind === 'not') {
    const inner = (value as { of?: unknown }).of
    const innerKind = kindOf(inner)
    // A `not` around another wrapper is two levels of nesting; the sentence shows
    // one, so it refuses rather than dropping the outer one.
    if (innerKind === '' || WRAPPING.has(innerKind)) return null
    return { kind: innerKind, not: true, value: inner }
  }
  if (kind === '' || WRAPPING.has(kind)) return null
  return { kind, not: false, value }
}

function readCond(condition: unknown): RawCond | null {
  if (condition === undefined) return { leaves: [], op: '' }
  const kind = kindOf(condition)
  if (kind === 'all' || kind === 'any') {
    const of = ((condition as { of?: unknown }).of as unknown[] | undefined) ?? []
    // Exactly two: one leaf under `all` is a compound with nothing to compound,
    // and three or more has no third slot to show it in.
    if (of.length !== 2) return null
    const leaves = of.map(readLeaf)
    if (leaves.some((leaf) => leaf === null)) return null
    return { leaves: leaves as RawLeaf[], op: kind }
  }
  const leaf = readLeaf(condition)
  return leaf === null ? null : { leaves: [leaf], op: '' }
}

interface RawEffect {
  when: string
  each: string
  cond: RawCond
  actions: Record<string, unknown>[]
  /** The raw quantifier value, preserved across unrelated edits. */
  forEach: unknown
}

/** The one place that decides whether a record is showable. */
function parse(draft: Draft): RawEffect | null {
  const effects = (draft.effects as Effect[] | undefined) ?? []
  if (effects.length === 0) {
    return { when: '', each: '', cond: { leaves: [], op: '' }, actions: [], forEach: undefined }
  }
  if (effects.length !== 1) return null

  const effect = effects[0]!

  let each = ''
  if (effect.forEach !== undefined) {
    each = kindOf(effect.forEach)
    if (each !== 'piece') return null
  }

  const cond = readCond(effect.condition)
  if (cond === null) return null

  const raw = ((effect.actions as unknown[] | undefined) ?? []) as Record<string, unknown>[]
  if (raw.length > 2) return null
  if (raw.some((action) => kindOf(action) === '')) return null

  return { when: String(effect.trigger ?? ''), each, cond, actions: raw, forEach: effect.forEach }
}

function toSentenceAction(action: Record<string, unknown>): SentenceAction {
  const destKey = DESTINATION_KEY[String(action.kind)]
  return {
    kind: String(action.kind),
    targets: targetKeysOf(action).map((key) => kindOf(action[key])),
    dest: destKey === undefined ? '' : kindOf(action[destKey]),
  }
}

/**
 * Reads a record's effect as a sentence, or `null` when it cannot be shown.
 *
 * `null` means the ADR-002 tail — the record is real, valid and playable, and this
 * screen cannot edit it. It does NOT mean empty: see the header.
 */
export function readSentence(draft: Draft): Sentence | null {
  const parsed = parse(draft)
  if (parsed === null) return null
  return {
    when: parsed.when,
    each: parsed.each,
    op: parsed.cond.op,
    cond: parsed.cond.leaves.map(({ kind, not }) => ({ kind, not })),
    actions: parsed.actions.map(toSentenceAction),
  }
}

// --- writing ----------------------------------------------------------------

function buildLeaf(leaf: RawLeaf): unknown {
  return leaf.not ? { kind: 'not', of: leaf.value } : leaf.value
}

function buildCond(cond: RawCond): unknown {
  if (cond.leaves.length === 0) return undefined
  if (cond.leaves.length === 1) return buildLeaf(cond.leaves[0]!)
  return { kind: cond.op === '' ? 'all' : cond.op, of: cond.leaves.map(buildLeaf) }
}

function writeCondSlot(cond: RawCond, slot: SlotId, value: string, ctx: EditorContext): RawCond {
  const leaves = [...cond.leaves]
  let op = cond.op

  const leafAt = (index: number): RawLeaf =>
    leaves[index] ?? { kind: 'always', not: false, value: make('condition', 'always', ctx) }

  const retype = (index: number, kind: string): RawLeaf => {
    const existing = leafAt(index)
    // Only rebuild when the kind actually changes, so a leaf's params (`n`,
    // `side`, `squares`) survive a negation or a join-operator edit.
    return existing.kind === kind ? existing : { kind, not: existing.not, value: make('condition', kind, ctx) }
  }

  switch (slot) {
    case 'cond':
      leaves[0] = retype(0, value)
      break
    case 'not':
      leaves[0] = { ...leafAt(0), not: value !== '' }
      break
    case 'cond2':
      if (value === '') {
        leaves.length = 1
        op = ''
      } else {
        leaves[1] = retype(1, value)
        if (op === '') op = 'all'
      }
      break
    case 'not2':
      if (leaves[1]) leaves[1] = { ...leaves[1], not: value !== '' }
      break
    case 'op':
      op = value === 'any' ? 'any' : 'all'
      break
    default:
      break
  }

  return { leaves, op: leaves.length < 2 ? '' : op }
}

/** Which action index and which axis a slot addresses. */
const ACTION_SLOTS: Readonly<Record<string, { index: 0 | 1; axis: 'kind' | 'target0' | 'target1' | 'dest' }>> = {
  then: { index: 0, axis: 'kind' },
  who: { index: 0, axis: 'target0' },
  whoB: { index: 0, axis: 'target1' },
  where: { index: 0, axis: 'dest' },
  then2: { index: 1, axis: 'kind' },
  who2: { index: 1, axis: 'target0' },
  who2B: { index: 1, axis: 'target1' },
  where2: { index: 1, axis: 'dest' },
}

function writeActionSlot(
  actions: Record<string, unknown>[],
  slot: SlotId,
  value: string,
  ctx: EditorContext,
): Record<string, unknown>[] {
  const addressed = ACTION_SLOTS[slot]
  if (addressed === undefined) return actions
  const { index, axis } = addressed
  const next = [...actions]

  if (axis === 'kind') {
    if (value === '') {
      // Clearing an action removes it. Clearing the FIRST of two promotes the
      // second rather than leaving a hole, because an effect's actions are an
      // array and a hole would fail validation with nothing on screen to blame.
      next.splice(index, 1)
      return next
    }
    const existing = next[index]
    if (existing !== undefined && kindOf(existing) === value) return next
    const built = make('action', value, ctx) as Record<string, unknown> | undefined
    if (built === undefined) return next
    if (existing !== undefined) {
      // Carry the target across a kind change when both kinds take one: "freeze
      // the enemy I pick" becoming "destroy the enemy I pick" must not silently
      // retarget itself at the card's owner.
      const from = targetKeysOf(existing)
      const to = targetKeysOf(built)
      for (let i = 0; i < Math.min(from.length, to.length); i += 1) {
        built[to[i]!] = existing[from[i]!]
      }
    }
    next[index] = built
    return next
  }

  const action = next[index]
  if (action === undefined) return next

  if (axis === 'dest') {
    const key = DESTINATION_KEY[String(action.kind)]
    if (key === undefined || value === '') return next
    // Only rebuild when the KIND actually changes — the same guard the action
    // axis above has, and for the same reason. A destination carries parameters
    // (`square`, and `df`/`dr`/`forward` on an offset), they are edited in the
    // very sheet that lists these options, and the chosen option is marked as
    // chosen — so re-tapping it is a natural "yes, that one". Without this guard
    // that tap silently reset `{offset, df: 2, dr: -1, forward: true}` to the
    // maker's `{offset, df: 0, dr: 1}`.
    if (kindOf(action[key]) === value) return next
    next[index] = { ...action, [key]: make('destination', value, ctx) }
    return next
  }

  const keys = targetKeysOf(action)
  const key = keys[axis === 'target0' ? 0 : 1]
  if (key === undefined || value === '') return next
  // Same guard. Every target is a bare `{kind}` today, so rebuilding one loses
  // nothing — but "loses nothing" is a property of the current vocabulary, not of
  // this function, and the axis that DID carry parameters is how the bug above
  // got here.
  if (kindOf(action[key]) === value) return next
  next[index] = { ...action, [key]: make('target', value, ctx) }
  return next
}

/**
 * Writes one slot back, returning the record's new `effects` array.
 *
 * The trigger is NEVER invented. An earlier version defaulted it to
 * `SKILL_TRIGGER` whenever the draft had none, which was invisible while a fresh
 * card could not be opened as a sentence at all — every card arrived from a
 * template that set `when` first. Now that a blank record opens as an empty
 * sentence, that default would silently stamp `on_play` onto a rule card the
 * moment the author touched any OTHER slot, and `on_play` is not a lifecycle
 * event a rule card admits. An unset trigger fails the live validator with a
 * message pointing at the slot the author still has to fill, which is a state
 * they can act on.
 */
export function writeSentence(draft: Draft, slot: SlotId, value: string, ctx: EditorContext): unknown[] {
  const parsed = parse(draft)
  const base: RawEffect =
    parsed ?? { when: '', each: '', cond: { leaves: [], op: '' }, actions: [], forEach: undefined }

  let when = base.when
  let each = base.each
  let forEach = base.forEach
  let cond = base.cond
  let actions = base.actions

  switch (slot) {
    case 'when':
      when = value
      break
    case 'each':
      if (value === '') {
        each = ''
        forEach = undefined
      } else if (each !== value) {
        each = value
        forEach = make('forEach', value, ctx)
      }
      break
    case 'cond':
    case 'not':
    case 'cond2':
    case 'not2':
    case 'op':
      cond = writeCondSlot(cond, slot, value, ctx)
      break
    default:
      actions = writeActionSlot(actions, slot, value, ctx)
      break
  }

  // `always` IS seeded, unlike the trigger. It is the neutral element of the
  // condition axis and is valid for every host, so seeding it commits the author
  // to nothing — whereas leaving the axis empty would fail validation for a
  // choice they were never asked to make. The trigger has no neutral value:
  // every option is a real, host-specific commitment.
  if (cond.leaves.length === 0) {
    cond = { leaves: [{ kind: 'always', not: false, value: make('condition', 'always', ctx) }], op: '' }
  }

  const effect: Effect = { actions }
  if (when !== '') effect.trigger = when
  const condition = buildCond(cond)
  if (condition !== undefined) effect.condition = condition
  if (forEach !== undefined) effect.forEach = forEach

  return [effect]
}

// The word-assembly half of this file — the rendered sentence and the
// `ui.editor.card.line.*` keys it needs — arrives with the VIEW in Phase 2, not
// ahead of it: `src/i18n/ko.ts` is out of Phase 1's scope, and a formatter with
// no keys and no caller is dead code that reads as a finished feature. Phase 1
// owns the MODEL — read, write, refuse — which is what the round-trip property is
// stated over. `recipeSentence` below still renders today's four-slot text.

// --- back-compat shims (removed in PLAN Phase 2) ----------------------------
//
// `RecordForm.tsx` is explicitly OUT of Phase 1's scope, so the four-slot API it
// imports stays alive here — delegating to the model above rather than keeping a
// second implementation, which is the only version of "both surfaces read the
// same state" that cannot drift. Phase 2 replaces the view and deletes these.

/** @deprecated the four-slot shape; use {@link Sentence}. */
export interface Recipe {
  when: string
  cond: string
  then: string
  who: string
}

/** @deprecated use {@link readSentence}. Preserves the old null semantics exactly. */
export function readRecipe(draft: Draft): Recipe | null {
  const sentence = readSentence(draft)
  if (sentence === null) return null
  // Everything the four-slot view could not show, refused as it always was: no
  // quantifier, exactly one action, one un-negated leaf, no two-target action.
  if (sentence.each !== '') return null
  if (sentence.actions.length !== 1) return null
  if (sentence.op !== '' || sentence.cond.length !== 1 || sentence.cond[0]!.not) return null
  const action = sentence.actions[0]!
  if (LEGACY_EXCLUDED_ACTIONS.has(action.kind)) return null
  return { when: sentence.when, cond: sentence.cond[0]!.kind, then: action.kind, who: action.targets[0] ?? '' }
}

/** @deprecated use {@link writeSentence}. */
export const writeRecipe = writeSentence

/** @deprecated the four-slot text; Phase 2's `sentenceText` replaces it. */
export function recipeSentence(t: (key: string) => string, recipe: Recipe, host: DraftKind): string {
  const label = (axis: string, kind: string) => (kind === '' ? '' : t(`ui.editor.vocab.${axis}.${kind}`))
  return t(host === 'skillCard' ? 'ui.editor.card.sentence.skill' : 'ui.editor.card.sentence.rule')
    .replace('{when}', label('trigger', recipe.when))
    .replace('{cond}', label('condition', recipe.cond))
    .replace('{then}', label('action', recipe.then))
    .replace('{who}', label('target', recipe.who))
    .trim()
}
