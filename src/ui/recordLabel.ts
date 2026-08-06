import type { Translate } from './i18n'

/**
 * What to print on a control that stands for a content record.
 *
 * The record's own name when something can resolve it, and its id otherwise.
 * Never the bare key: `translate` falls back to the key by design, so a room
 * button would read `preset.slice.name` — which is the same class of leak the
 * editor's schema-word labels were, arriving by a different door.
 *
 * The id is an acceptable last resort precisely because it is the thing the
 * author typed. A record that has not been named yet has nothing better to be
 * called, and an empty button is unclickable in practice.
 */
export function recordLabel(t: Translate, id: string, nameKey: unknown): string {
  if (typeof nameKey === 'string' && nameKey !== '') {
    const resolved = t(nameKey)
    if (resolved !== nameKey) return resolved
  }
  return id
}

/** `[id, nameKey]` for every record in a raw source collection, in document order. */
export function namedRecords(records: readonly unknown[]): Array<[string, unknown]> {
  return records.map((r) => [String((r as { id?: unknown }).id ?? ''), (r as { nameKey?: unknown }).nameKey])
}
