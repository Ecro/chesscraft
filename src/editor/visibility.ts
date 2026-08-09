import type { ContentSource } from '@content/load'
import { isOfficial } from '@content/provenance'
import type { DraftKind } from './draft'

/**
 * What a list shows, and what may be hidden (ADR-004, ADR-005).
 *
 * Separate from `hidden.ts` on purpose: that module owns the BYTES, this one
 * owns the RULE. The rule has to be testable without a `Storage`, and the bytes
 * have to be testable without a document.
 *
 * The whole of ADR-005 is that hiding filters lists and never the document.
 * That is what makes it unable to produce a set the loader refuses, and
 * therefore unable to refuse for a reference the way `deleteRecord` must — a
 * room that still uses a hidden piece keeps playing, and its own form keeps
 * showing that piece (see `keepSelected`).
 */

const COLLECTION_OF: Record<DraftKind, keyof ContentSource> = {
  piece: 'pieces',
  squareType: 'squareTypes',
  ruleCard: 'ruleCards',
  skillCard: 'skillCards',
  board: 'boards',
  preset: 'presets',
}

/** `[id, nameKey]` pairs, as every list surface already carries them. */
export type Entry = [string, unknown]

/**
 * The entries a surface should render.
 *
 * **`keepSelected` is required, and that is deliberate.** It is ADR-005's
 * exemption: a picker always shows a record the thing being edited ALREADY
 * selects, hidden or not. Two failures follow from omitting it, and the second
 * is worse than the first — the checkbox merely goes missing, which reads as the
 * selection having been lost and makes the next save lose it for real; and in
 * `RoomDetail` the record instead falls into the existing "vanished" path
 * (`VanishedRows`, `ChipList`'s tail), whose `known` set is built from the
 * rendered array, so the child is told their own piece is a broken reference.
 *
 * Making the parameter required turns a surface that forgot the exemption into
 * a compile error rather than a subtly wrong render. Browse surfaces pass `[]`.
 *
 * An id in `keepSelected` that is not in `entries` stays absent: this is an
 * exemption from hiding, not a source of records, so a genuinely dangling
 * reference keeps being reported as one.
 */
export function visibleIds(
  entries: readonly Entry[],
  hidden: ReadonlySet<string>,
  keepSelected: readonly string[],
): Entry[] {
  if (hidden.size === 0) return [...entries]
  const kept = new Set(keepSelected)
  return entries.filter(([id]) => !hidden.has(id) || kept.has(id))
}

/**
 * The same list, split into what we ship and what the author made.
 *
 * Document order is preserved within each side, so the split re-groups a list
 * without reordering it.
 *
 * Both sides are always arrays, never undefined: the list surfaces render a
 * heading for each, and an empty authored side has to be able to say "you have
 * not made one yet" rather than vanish.
 */
export function partitionByOrigin(
  entries: readonly Entry[],
  official: ReadonlySet<string>,
): { official: Entry[]; authored: Entry[] } {
  const ours: Entry[] = []
  const theirs: Entry[] = []
  for (const entry of entries) {
    if (isOfficial(entry[0], official)) ours.push(entry)
    else theirs.push(entry)
  }
  return { official: ours, authored: theirs }
}

export type HideResult = { ok: true } | { ok: false; reason: 'authored' | 'missing' | 'last-room' }

/**
 * May this record be hidden?
 *
 * Three refusals, and note which one is ABSENT: there is no reference check.
 * `deleteRecord` needs one because a delete can produce a document that will not
 * load; hiding cannot, because it never touches the document (ADR-005). A child
 * hiding a piece three rooms use gets no lecture, and those rooms keep working.
 *
 * `last-room` is the same rule `deleteRecord` enforces at `draft.ts:269` and
 * carries the same `reason`, so both refusals reach the child as one sentence
 * from `deleteMessage.ts`. It counts VISIBLE rooms rather than all of them —
 * counting `presets.length` would let the author hide every room but one, then
 * hide that one too, and land on a title screen with nothing to play and no
 * indication why.
 */
export function canHide(
  source: ContentSource,
  kind: DraftKind,
  id: string,
  hidden: ReadonlySet<string>,
  official: ReadonlySet<string>,
): HideResult {
  const list = source[COLLECTION_OF[kind]] as unknown[]
  if (!list.some((record) => (record as { id?: unknown }).id === id)) {
    return { ok: false, reason: 'missing' }
  }
  // Authored records are DELETED, not hidden. Offering both would leave a child
  // with two controls and no way to tell which one keeps their work.
  if (!isOfficial(id, official)) return { ok: false, reason: 'authored' }

  if (kind === 'preset') {
    const visible = source.presets.filter((p) => {
      const pid = (p as { id?: unknown }).id
      return typeof pid === 'string' && !hidden.has(pid)
    })
    if (visible.length <= 1) return { ok: false, reason: 'last-room' }
  }

  return { ok: true }
}
