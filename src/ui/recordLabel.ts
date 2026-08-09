import type { DraftKind } from '@editor/draft'
import type { Translate } from './i18n'
import { unnamedLabel } from './unnamed'

/**
 * What to print on a control that stands for a content record.
 *
 * The record's own name when something can resolve it, and a Korean
 * kind-name otherwise (ADR-002). Never the bare key — `translate` falls back to
 * the key by design, so a room button would read `preset.slice.name` — and never
 * the id, which is what this used to do.
 *
 * **`kind` is required, and that is the point.** It is not needed to resolve a
 * name; it is needed to name the fallback, and making it required turns a call
 * site that has not been converted into a type error. That guarantee only
 * reaches call sites that come through here, which is why Phase 2 also deleted
 * the private lookalike in `RecordForm` and the `|| id` in `MakerGallery` — a
 * duplicate that never calls this function is invisible to the compiler, and
 * `tests/ui/no-raw-ids.test.tsx` is the net under all three.
 */
export function recordLabel(
  t: Translate,
  kind: DraftKind,
  id: string,
  nameKey: unknown,
  ordinal?: number,
): string {
  if (typeof nameKey === 'string' && nameKey !== '') {
    const resolved = t(nameKey)
    if (resolved !== nameKey) return resolved
  }
  return unnamedLabel(t, kind, ordinal)
}

/** `[id, nameKey]` for every record in a raw source collection, in document order. */
export function namedRecords(records: readonly unknown[]): Array<[string, unknown]> {
  return records.map((r) => [String((r as { id?: unknown }).id ?? ''), (r as { nameKey?: unknown }).nameKey])
}

/**
 * Labels for a whole list, with unnamed records numbered so they are tellable
 * apart.
 *
 * A list is the only place the ordinal can be computed — it is a position among
 * siblings, not a property of the record — so every surface that renders more
 * than one record at a time goes through here rather than calling
 * `recordLabel` per row. The numbering counts only the UNNAMED ones, so adding a
 * named record between two unnamed ones does not renumber them.
 */
export function recordLabels(
  t: Translate,
  kind: DraftKind,
  entries: ReadonlyArray<[string, unknown]>,
): Map<string, string> {
  const out = new Map<string, string>()
  const anyUnnamed = entries.filter(([, nameKey]) => !resolves(t, nameKey))
  // A single unnamed record in the list needs no number: a lone entry ending in
  // `1` reads as though a second one is missing.
  const numbering = anyUnnamed.length > 1
  let n = 0
  for (const [id, nameKey] of entries) {
    if (resolves(t, nameKey)) {
      out.set(id, recordLabel(t, kind, id, nameKey))
    } else {
      n += 1
      out.set(id, recordLabel(t, kind, id, nameKey, numbering ? n : undefined))
    }
  }
  return out
}

function resolves(t: Translate, nameKey: unknown): boolean {
  return typeof nameKey === 'string' && nameKey !== '' && t(nameKey) !== nameKey
}
