/**
 * Which records this browser has tucked away (ADR-004, ADR-006).
 *
 * Official content is hidden rather than deleted, so nothing we ship can be
 * lost from a device. The set of hidden ids is therefore a per-browser
 * PREFERENCE, not content — and it lives under its own key for a reason the
 * stamp already learned the hard way: `importContent` rebuilds `ContentSource`
 * field by field, so an unknown top-level field is silently dropped on the very
 * next read (`src/editor/storage.ts:79-84`). A hidden set stored on the document
 * would survive exactly one save.
 *
 * Its own key also keeps an EXPORT clean: a document handed to another child
 * should not carry this device's idea of what to look at.
 *
 * Every failure — absent, corrupt, wrong shape, storage denied — resolves to
 * "nothing hidden". That direction is the safe one: the worst outcome is a
 * record the author had tucked away coming back, and the other direction would
 * make content disappear on a bad read.
 */

export const HIDDEN_KEY = 'strange-chess.hidden.v1'

/**
 * The hidden set, or an empty one when there isn't a usable answer.
 *
 * Reads only — a load that wrote a default would turn the first render into a
 * save, stamping "nothing is hidden" over a state nobody chose. Every install
 * alive today is in the absent case, which is why `tests/editor/hidden.test.ts`
 * opens with it rather than tucking it in among the corrupt-input cases.
 */
export function loadHidden(storage: Storage): ReadonlySet<string> {
  let raw: string | null
  try {
    raw = storage.getItem(HIDDEN_KEY)
  } catch {
    return new Set()
  }
  if (raw === null) return new Set()

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return new Set()
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return new Set()
  const ids = (parsed as { ids?: unknown }).ids
  if (!Array.isArray(ids)) return new Set()
  // Filtered rather than rejected wholesale. A list with one bad entry reads as
  // a version skew far more often than as a corrupt file, and throwing the good
  // entries away would un-hide records the author deliberately hid.
  return new Set(ids.filter((id): id is string => typeof id === 'string' && id !== ''))
}

/**
 * Replace the hidden set. Never throws.
 *
 * Sorted, so two equal sets serialise to one string and a no-op save does not
 * churn the key.
 *
 * Silent on failure for the same reason `saveStamp` is: by the time this runs
 * the author's content is already stored, and a browser that denies storage
 * would otherwise turn a successful save into a crash. The cost of a lost write
 * is one record not staying hidden.
 */
export function saveHidden(storage: Storage, ids: ReadonlySet<string>): void {
  try {
    storage.setItem(HIDDEN_KEY, JSON.stringify({ ids: [...ids].sort() }))
  } catch {
    // Intentionally silent — see above.
  }
}
