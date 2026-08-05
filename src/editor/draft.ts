import { type ContentSet, type ContentSource, type ValidationError, loadContentSet } from '@content/load'

/**
 * The editor's first pass (PLAN Phase 3), over the four content kinds the slice
 * uses. Phase 5 owns the full five-axis forms; what this establishes is the
 * boundary they will all sit behind.
 *
 * A save runs the WHOLE source through `loadContentSet` — the same validator the
 * game loads with, not a lenient editor-side copy. Two consequences, both
 * intended: a save cannot produce content the engine will later choke on, and a
 * draft that breaks a cross-reference (a card naming a piece nobody defined) is
 * caught at save time rather than mid-match. A per-record check could not do the
 * second one at all.
 */

export type DraftKind = 'piece' | 'squareType' | 'ruleCard' | 'skillCard'

export const EDITABLE_KINDS: readonly DraftKind[] = ['piece', 'squareType', 'ruleCard', 'skillCard']

const COLLECTION_OF: Record<DraftKind, keyof ContentSource> = {
  piece: 'pieces',
  squareType: 'squareTypes',
  ruleCard: 'ruleCards',
  skillCard: 'skillCards',
}

/**
 * A skeleton with every required field present and empty.
 *
 * Empty rather than pre-filled with something plausible: a blank draft must fail
 * validation until the author has actually said something, otherwise the first
 * save silently ships a placeholder.
 */
export function blankDraft(kind: DraftKind): Record<string, unknown> {
  const common = { id: '', nameKey: '', textKey: '', effects: [] as unknown[] }
  switch (kind) {
    case 'piece':
      return { ...common, movement: [] }
    case 'squareType':
      return { ...common, paired: false }
    case 'ruleCard':
      return { ...common, cost: 0 }
    case 'skillCard':
      return { ...common, cost: 0, uses: 1 }
  }
}

export type CommitResult =
  | { ok: true; source: ContentSource; set: ContentSet }
  | { ok: false; errors: ValidationError[] }

function idOf(draft: unknown): unknown {
  return draft && typeof draft === 'object' ? (draft as { id?: unknown }).id : undefined
}

/**
 * Adds or replaces one record and revalidates the whole document.
 *
 * `base` is never mutated: on failure the caller still holds the last content
 * that loaded, so a rejected save cannot leave the session in a state that no
 * longer starts a match.
 */
export function commitDraft(base: ContentSource, kind: DraftKind, draft: unknown): CommitResult {
  const next = structuredClone(base)
  const list = next[COLLECTION_OF[kind]] as unknown[]

  const id = idOf(draft)
  const at = list.findIndex((record) => idOf(record) === id)
  const record = structuredClone(draft)
  if (at >= 0) list[at] = record
  else list.push(record)

  const result = loadContentSet(next)
  if (!result.ok) return { ok: false, errors: result.errors }
  return { ok: true, source: next, set: result.set }
}
