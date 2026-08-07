import { type ContentSet, type ContentSource, type ValidationError, loadContentSet } from '@content/load'
import type { ContentStrings } from '@content/schema'
import { roomsReferencing } from './references'
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
    // No `cost`. It is optional and deprecated as of schema v8, the form no
    // longer collects it, and nothing reads it — seeding one would put a field
    // on every new card that the author can neither see nor change, which is the
    // shape the deprecation exists to remove.
    case 'ruleCard':
      return { ...common }
    case 'skillCard':
      return { ...common, uses: 1 }
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

/**
 * Why a delete was refused, and what the UI needs to say about it.
 *
 * `rooms` carries the referring preset IDS rather than a boolean, because the
 * sentence a child has to read is "이 방들이 쓰고 있어요" with their rooms named.
 * A guard that only says no leaves them to open every room and guess which one
 * is holding on — and the whole reason this returns instead of just refusing is
 * that the caller can then take them straight there.
 */
export type DeleteResult =
  | { ok: true; source: ContentSource; set: ContentSet }
  | {
      ok: false
      /**
       * `referenced` — at least one room reaches it. `last-room` — it is the only
       * room left. `missing` — nothing by that id. `invalid` — the reference walk
       * allowed it and the LOADER refused the result.
       */
      reason: 'referenced' | 'last-room' | 'missing' | 'invalid'
      rooms: string[]
      errors: ValidationError[]
    }

const NO_ROOMS: string[] = []
const NO_ERRORS: ValidationError[] = []

/**
 * Removes one record, or explains why it cannot.
 *
 * Deletion is the least-precedented thing this editor does — nothing here
 * deleted anything before Phase 9b — and its failure mode is the worst one
 * available: not a broken screen but a document that will not load, which takes
 * the whole app down rather than one room. So this is built as three gates in
 * series, and the third is the one that makes the first two safe to be wrong:
 *
 * 1. **The last room is refused**, and that guard has NO schema backstop —
 *    `presets` carries no array minimum, so a document with zero rooms
 *    validates perfectly and leaves nothing to play and no way back except the
 *    editor the child just emptied.
 * 2. **A referenced record is refused, with the rooms named.** `references.ts`
 *    is the single owner of that question, shared with the library's unused
 *    badge, so "safe to delete" and "not used by anything" cannot drift apart.
 * 3. **The result goes back through `loadContentSet`** — the same validator the
 *    game loads with, exactly as `commitDraft` does. This is not belt-and-braces
 *    with gate 2: `references.ts` walks only boards a room actually plays on,
 *    while the loader checks EVERY board's `placements`, so a piece standing on
 *    a board no room uses passes gate 2 and is caught here.
 *
 * `base` is never mutated — on any refusal the caller still holds a document
 * that loads.
 */
export function deleteRecord(base: ContentSource, kind: DraftKind, id: string): DeleteResult {
  const collection = COLLECTION_OF[kind]
  const list = base[collection] as unknown[]
  if (!list.some((record) => idOf(record) === id)) {
    return { ok: false, reason: 'missing', rooms: NO_ROOMS, errors: NO_ERRORS }
  }

  if (kind === 'preset' && base.presets.length <= 1) {
    return { ok: false, reason: 'last-room', rooms: NO_ROOMS, errors: NO_ERRORS }
  }

  const rooms = roomsReferencing(base, kind, id)
  if (rooms.length > 0) {
    return { ok: false, reason: 'referenced', rooms, errors: NO_ERRORS }
  }

  const next = structuredClone(base)
  // Spliced in place rather than reassigned through the indexed key: the union
  // of `ContentSource`'s value types collapses to `never` under an indexed
  // write, and casting the assignment away would cast away the collection check
  // with it.
  const target = next[collection] as unknown[]
  for (let i = target.length - 1; i >= 0; i -= 1) {
    if (idOf(target[i]) === id) target.splice(i, 1)
  }

  // The record's text goes with the record — but only the text that is now
  // UNREACHABLE, and reachability is decided by what the surviving records point
  // at, never by the deleted id's namespace.
  //
  // Dropping by the `${id}.` prefix looks equivalent and is not. Since Phase 9a
  // a record's keys need not derive from its id (`slotFor` exists precisely so
  // an imported set keeps its own namespace), so an id-prefix drop does both
  // halves wrong at once: it leaves the deleted record's real entries orphaned,
  // and it removes `<id>.name` even when a DIFFERENT surviving record is the one
  // pointing at it. Asking "does anything still reference this key" cannot make
  // either mistake, and it degenerates to the prefix answer in the ordinary case
  // where keys are derived.
  const dropped = dropUnreferenced(next.strings, keysOwnedBy(base, kind, id), next)
  if (dropped !== undefined) next.strings = dropped

  const result = loadContentSet(next)
  if (!result.ok) return { ok: false, reason: 'invalid', rooms: NO_ROOMS, errors: result.errors }
  return { ok: true, source: next, set: result.set }
}

/** The i18n keys a single record points at. */
function keysOwnedBy(source: ContentSource, kind: DraftKind, id: string): string[] {
  const record = (source[COLLECTION_OF[kind]] as unknown[]).find((r) => idOf(r) === id)
  return keysOf(record)
}

function keysOf(record: unknown): string[] {
  if (record === null || typeof record !== 'object') return []
  const r = record as Record<string, unknown>
  return ['nameKey', 'textKey', 'iconKey']
    .map((field) => r[field])
    .filter((value): value is string => typeof value === 'string' && value !== '')
}

/** Every i18n key the document still points at, across every collection. */
function keysStillUsed(source: ContentSource): Set<string> {
  const used = new Set<string>()
  for (const collection of Object.values(COLLECTION_OF)) {
    for (const record of source[collection] as unknown[]) {
      for (const key of keysOf(record)) used.add(key)
    }
  }
  return used
}

/**
 * Drops `candidates` from every locale, except any key something still uses.
 *
 * Returns the original overlay unchanged when nothing was dropped, so a document
 * with no overlay stays a document with no overlay — `strings` is
 * exactly-optional and an empty object is a different document from an absent
 * field.
 */
function dropUnreferenced(
  strings: ContentStrings | undefined,
  candidates: readonly string[],
  after: ContentSource,
): ContentStrings | undefined {
  if (strings === undefined || candidates.length === 0) return strings
  const used = keysStillUsed(after)
  const orphaned = candidates.filter((key) => !used.has(key))
  if (orphaned.length === 0) return strings

  const next: ContentStrings = {}
  for (const [locale, entries] of Object.entries(strings)) {
    const bucket: Record<string, string> = {}
    for (const [key, text] of Object.entries(entries)) {
      if (!orphaned.includes(key)) bucket[key] = text
    }
    next[locale] = bucket
  }
  return next
}
