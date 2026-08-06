import { type ContentSet, type ContentSource, type ValidationError, loadContentSet } from '@content/load'
import { rekeyStrings } from './strings'

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

export type DraftKind = 'piece' | 'squareType' | 'ruleCard' | 'skillCard' | 'board' | 'preset'

export const EDITABLE_KINDS: readonly DraftKind[] = [
  'piece',
  'squareType',
  'ruleCard',
  'skillCard',
  'board',
  'preset',
]

const COLLECTION_OF: Record<DraftKind, keyof ContentSource> = {
  piece: 'pieces',
  squareType: 'squareTypes',
  ruleCard: 'ruleCards',
  skillCard: 'skillCards',
  board: 'boards',
  preset: 'presets',
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
      // One step forward, so a fresh piece is a piece rather than a statue.
      // Everything else stays empty; `id` alone keeps a blank save failing.
      return { ...common, movement: [{ kind: 'step', vectors: [[0, 1]] }] }
    case 'squareType':
      return { ...common, paired: false }
    case 'ruleCard':
      return { ...common, cost: 0 }
    case 'skillCard':
      return { ...common, cost: 0, uses: 1 }
    case 'board':
      return { id: '', nameKey: '', width: 6, height: 6, placements: [], squares: [] }
    case 'preset':
      return { id: '', nameKey: '', boardId: '', pieceIds: [], ruleCardIds: [], skillCardIds: [] }
  }
}

/**
 * The inverse of a save: pulls a stored record back out as an editable draft.
 *
 * A copy, never the stored object — an editor handed the live record would let
 * an abandoned edit mutate the document that is currently in play, and the
 * mutation would never pass through `commitDraft`'s validator.
 */
export function openDraft(source: ContentSource, kind: DraftKind, id: string): Record<string, unknown> | null {
  const list = source[COLLECTION_OF[kind]] as unknown[]
  const found = list.find((record) => idOf(record) === id)
  return found === undefined ? null : (structuredClone(found) as Record<string, unknown>)
}

/**
 * What the pickers in the editor may offer.
 *
 * Squares come from the boards the document actually carries, so an author
 * cannot pick a square that is off the edge of every board in the set — the
 * board bound is enforced at validation anyway, but a picker that offers an
 * invalid choice is a form that teaches the wrong thing.
 */
export function editorContext(source: ContentSource): EditorContext {
  const ids = (records: unknown[]): string[] =>
    records.map((r) => idOf(r)).filter((id): id is string => typeof id === 'string' && id.length > 0)

  const first = source.boards[0] as { width?: unknown; height?: unknown } | undefined
  const width = typeof first?.width === 'number' ? first.width : 6
  const height = typeof first?.height === 'number' ? first.height : 6

  const squares: string[] = []
  for (let file = 0; file < width; file += 1) {
    for (let rank = 1; rank <= height; rank += 1) squares.push(`${String.fromCharCode(97 + file)}${rank}`)
  }

  return { pieceIds: ids(source.pieces), squareTypeIds: ids(source.squareTypes), squares }
}

/** What the editor's pickers may offer, derived from the document being edited. */
export interface EditorContext {
  pieceIds: string[]
  squareTypeIds: string[]
  /** Every square on the document's board, in algebraic notation. */
  squares: string[]
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
 *
 * `openedId` is the rename primitive (PLAN Phase 8, R10). Without it this
 * matches solely on the DRAFT'S OWN id, which is correct while an id never
 * changes and wrong the moment one does: the changed id matches nothing, so the
 * save APPENDS a second record and the original is orphaned in the document
 * forever. Nothing surfaced it because nothing in the editor could change an id
 * yet — Phase 9a threads it through the form. ADR-020 is what makes the orphan
 * visible rather than merely present: it takes its text with it.
 *
 * Optional, and every existing call site omits it, so the pre-Phase-8 behaviour
 * is exactly what an omitted `openedId` still does.
 */
export function commitDraft(
  base: ContentSource,
  kind: DraftKind,
  draft: unknown,
  openedId?: string,
): CommitResult {
  const next = structuredClone(base)
  const list = next[COLLECTION_OF[kind]] as unknown[]

  const id = idOf(draft)
  // WHICH record this save replaces is decided by `openedId` ALONE once the
  // caller supplies one — never by falling back to the draft's own id.
  //
  // The fallback was the first version of this, and it is a data-loss bug:
  // when the opened record is gone (deleted through another path while the
  // buffer stayed open) and the author has typed an id that ALREADY belongs to
  // a different record, matching by the draft id finds that other record and
  // overwrites it. The save validates, so nothing reports anything — the
  // author sees a successful save and someone else's piece is gone.
  //
  // Not matching means the record is pushed instead, and `loadContentSet`
  // refuses the document with `duplicate id <x>`. Refusing a stale save is the
  // honest answer; the author is told the id is taken and picks another.
  const at = list.findIndex((record) => idOf(record) === (openedId ?? id))
  const record = structuredClone(draft)
  if (at >= 0) list[at] = record
  else list.push(record)

  // The text follows the record, and only a rename moves it.
  if (openedId !== undefined && typeof id === 'string' && openedId !== id) {
    // Assigned only when there IS an overlay: the field is exactly-optional,
    // so writing `undefined` into it is a different document from omitting it.
    const moved = rekeyStrings(next.strings, openedId, id)
    if (moved !== undefined) next.strings = moved
  }

  const result = loadContentSet(next)
  if (!result.ok) return { ok: false, errors: result.errors }
  return { ok: true, source: next, set: result.set }
}
