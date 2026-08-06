import type { ContentStrings } from '@content/schema'

/**
 * The editor's half of ADR-020: the child types text, this derives the key.
 *
 * The derivation is deliberately NOT a new naming scheme. Content ids are
 * already `<kind>.<slug>` and the shipped bundle already keys its text
 * `piece.king.name` / `.text` / `.icon`, so `${id}.${field}` means an authored
 * record and a bundled one are indexed identically — which is what lets a
 * single `translate` lookup serve both, and what lets an overlay entry override
 * a bundled record's text rather than living in a parallel namespace.
 *
 * Every function here is pure and returns a new overlay. The editor's undo
 * story is "hold the previous source", and that only works while nothing edits
 * an overlay in place — the same reason `commitDraft` never mutates its base.
 */

export type StringField = 'name' | 'text' | 'icon'

/** `piece.rabbit` + `name` -> `piece.rabbit.name`. */
export function deriveKey(id: string, field: StringField): string {
  return `${id}.${field}`
}

export function readString(
  strings: ContentStrings | undefined,
  locale: string,
  key: string,
): string | undefined {
  return strings?.[locale]?.[key]
}

/** Returns a NEW overlay carrying `text` at `key`; creates one when absent. */
export function writeString(
  strings: ContentStrings | undefined,
  locale: string,
  key: string,
  text: string,
): ContentStrings {
  return { ...strings, [locale]: { ...strings?.[locale], [key]: text } }
}

/**
 * Moves every key belonging to `fromId` onto `toId`, in every locale.
 *
 * The boundary is the DOT, not the prefix. `piece.rabbit` is a prefix of
 * `piece.rabbitfoot`, so a bare `startsWith` would quietly rename a different
 * record's text — and the damage would only surface as a blank name on a
 * screen nobody was looking at.
 */
export function rekeyStrings(
  strings: ContentStrings | undefined,
  fromId: string,
  toId: string,
): ContentStrings | undefined {
  if (!strings || fromId === toId) return strings
  return mapEntries(strings, (key) => (belongsTo(key, fromId) ? `${toId}${key.slice(fromId.length)}` : key))
}

/**
 * Drops ONE key from ONE locale, returning a new overlay.
 *
 * This is what "clear the name I typed" means. The overlay cannot hold an empty
 * string — the schema is `z.string().min(1)`, deliberately, because a blank name
 * renders as a blank square and reads as a rendering bug rather than as content
 * nobody has named. So the only way to un-say something is to stop saying it,
 * and what the record then shows is whatever the bundle answers for that key.
 * The caller is responsible for checking that something still answers.
 */
export function clearString(
  strings: ContentStrings | undefined,
  locale: string,
  key: string,
): ContentStrings | undefined {
  const bucket = strings?.[locale]
  if (!bucket || !(key in bucket)) return strings
  const next: ContentStrings = { ...strings }
  const { [key]: _dropped, ...rest } = bucket
  next[locale] = rest
  return next
}

/** Drops every key belonging to `id`, in every locale. */
export function dropStrings(strings: ContentStrings | undefined, id: string): ContentStrings | undefined {
  if (!strings) return strings
  return mapEntries(strings, (key) => (belongsTo(key, id) ? null : key))
}

function belongsTo(key: string, id: string): boolean {
  return key.startsWith(`${id}.`)
}

/** Rewrites (or drops, on `null`) every key of every locale. */
function mapEntries(strings: ContentStrings, rename: (key: string) => string | null): ContentStrings {
  const next: ContentStrings = {}
  for (const [locale, entries] of Object.entries(strings)) {
    const bucket: Record<string, string> = {}
    for (const [key, text] of Object.entries(entries)) {
      const renamed = rename(key)
      if (renamed !== null) bucket[renamed] = text
    }
    next[locale] = bucket
  }
  return next
}
