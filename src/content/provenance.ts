import type { ContentSource } from './load'
import type { CollectionName } from './schema'
import { COLLECTIONS } from './merge'

/**
 * Which records are ours and which are the author's (ADR-003).
 *
 * The saved document carries NO provenance — `merge.ts` says so at length, and
 * `[fail:design] saved-blob-forks-shipped-content` records the cost of that
 * absence. The obvious remedy is a field on the record at a new schema version,
 * and it is the wrong one: every document that exists today would be in the
 * field-absent state, which is this repo's most-recurring failure class
 * (absent-case = feature black hole, count:8). A feature that activates on an
 * optional field never fires for the data that predates it.
 *
 * So nothing is stored. An id is official iff the running build's bundle ships
 * it. There is no migration, no schema bump, and no absent case to define —
 * the answer is a function of code that is always current.
 *
 * What makes the derived answer EXACT rather than approximate is ADR-001 plus
 * ADR-007: an edit to an official record's rules forks to a NEW id, and an
 * official record's id field is read-only, so an official id always names a
 * record nobody has changed. Without those two, "official" would only mean
 * "started life as ours".
 *
 * Pure — no storage, no DOM, no clock. The bundle is a parameter rather than an
 * import so every rule here is testable against a two-record fixture.
 */

/** `id` of a record, or null when it has none a lookup could key on. */
function idOf(record: unknown): string | null {
  if (record && typeof record === 'object' && 'id' in record) {
    const id = (record as { id: unknown }).id
    if (typeof id === 'string' && id.length > 0) return id
  }
  return null
}

/**
 * Every id the given bundle ships, flat across all six collections.
 *
 * Flat rather than one set per collection, for the same reason `stampOf` is:
 * `contentId` is `<kind>.<slug>`, so a cross-collection collision takes an
 * author hand-writing another kind's prefix, and the flat reading is the
 * conservative one.
 */
export function officialIds(bundle: ContentSource): ReadonlySet<string> {
  const ids = new Set<string>()
  for (const name of COLLECTIONS) {
    for (const record of bundle[name]) {
      const id = idOf(record)
      if (id !== null) ids.add(id)
    }
  }
  return ids
}

/** Did we ship this id? */
export function isOfficial(id: string, official: ReadonlySet<string>): boolean {
  return official.has(id)
}

/**
 * A free id for the copy an edit forks off (ADR-001).
 *
 * `piece.king` → `piece.king-2` → `piece.king-3`, walking until the suffix is
 * free. Starting at 2 rather than 1 because the copy is the second of its name,
 * and `-1` reads as "the first one" to the child who will see it.
 *
 * The result satisfies `contentId` (`^[a-z]+\.[a-z0-9-]+$`) for any input that
 * did — digits and `-` are both in the slug class — so a fork can never produce
 * an id the loader refuses. Forking a fork appends again rather than
 * incrementing (`piece.king-2` → `piece.king-2-2`), which is ugly and correct:
 * parsing the existing suffix would make `piece.king-2` and a piece the author
 * genuinely named `king-2` the same case.
 */
export function forkId(id: string, taken: ReadonlySet<string>): string {
  let n = 2
  let candidate = `${id}-${n}`
  while (taken.has(candidate)) {
    n += 1
    candidate = `${id}-${n}`
  }
  return candidate
}

/** The shipped record of this id in this collection, or undefined. */
export function bundledRecord(
  bundle: ContentSource,
  collection: CollectionName,
  id: string,
): unknown | undefined {
  return (bundle[collection] as unknown[]).find((record) => idOf(record) === id)
}

/**
 * Has this draft moved away from the record we ship (ADR-001)?
 *
 * This is the whole fork rule, and its exemption for renames is STRUCTURAL
 * rather than a hand-maintained list of "rule fields" per kind. A rename is
 * `foldText` writing into `source.strings` at the record's existing `nameKey`
 * (`src/ui/RecordForm.tsx`); the record itself comes back byte-identical, so
 * this answers false and nothing forks. A list of fields to ignore would have to
 * be updated every time the schema gains one, and would be wrong in between.
 *
 * Key ORDER is ignored, key PRESENCE is not: the form rebuilds a draft field by
 * field, so order is not stable across a round trip and a `JSON.stringify`
 * comparison would fork on every save. Arrays compare by position, because a
 * reordered movement pattern is a different piece.
 *
 * An absent `bundled` is a difference. Stated rather than left to fall out of
 * the walk: nothing shipped to match means this is not an unchanged copy of
 * anything of ours.
 */
export function differsFromBundled(draft: unknown, bundled: unknown): boolean {
  if (bundled === undefined) return true
  return !deepEqual(draft, bundled)
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (typeof a !== typeof b) return false
  if (a === null || b === null) return false
  if (typeof a !== 'object') return false

  const aArray = Array.isArray(a)
  if (aArray !== Array.isArray(b)) return false
  if (aArray) {
    const x = a as unknown[]
    const y = b as unknown[]
    if (x.length !== y.length) return false
    return x.every((item, i) => deepEqual(item, y[i]))
  }

  const x = a as Record<string, unknown>
  const y = b as Record<string, unknown>
  const keys = Object.keys(x)
  if (keys.length !== Object.keys(y).length) return false
  // `in` rather than `y[key] !== undefined`: a key present and explicitly
  // undefined is a different document from a key that is absent, and the schema
  // has exactly-optional fields where that distinction is real.
  return keys.every((key) => key in y && deepEqual(x[key], y[key]))
}
