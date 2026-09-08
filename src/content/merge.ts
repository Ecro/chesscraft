import type { ContentSource } from './load'

/**
 * Delivering newly shipped bundled records to a browser that has already saved.
 *
 * The defect this exists for: `STORAGE_KEY` holds the ENTIRE `ContentSource`,
 * and the app returns it whenever it validates, so the first editor save freezes
 * that browser's catalogue forever. New presets, boards, pieces and cards then
 * appear on a fresh install and nowhere else.
 *
 * `bundle − saved` cannot fix it on its own, because the saved document has no
 * provenance: an id the bundle has and the saved set lacks is either a record
 * the AUTHOR DELETED or a record that is NEW. Guessing either way is wrong in a
 * way the author can see — resurrecting a deleted room, or never shipping again.
 *
 * So the missing fact is stored: the **set of bundled ids as of the author's
 * last save** (the stamp). With it the whole merge is one line —
 *
 *     merged = saved  +  { bundle records : id ∉ stamp ∧ id ∉ saved }
 *
 * — which is ADR-001's seven-row membership table collapsed, because every row
 * but one says "keep whatever the saved document has".
 *
 * ADR-001 is deliberately ADDITIVE-ONLY. It never refreshes a bundled record
 * that is already there, so a later fix to a shipped piece does not reach an
 * install that has saved. That cost bought the removal of fingerprints, canonical
 * form and their whole failure surface — including a canonicaliser that would have
 * let the bundle overwrite an author's edit to a piece's movement. An author's
 * record cannot be overwritten by this feature: it is structurally impossible
 * here, not guarded against.
 *
 * This module is pure — no storage, no DOM, no clock. `src/editor/storage.ts`
 * persists the stamp and `src/ui/App.tsx` decides when to merge; the rule itself
 * has to be testable without either.
 */

/**
 * The collections a `ContentSource` carries, in the order they are declared.
 *
 * Exported because `App.tsx`'s repair loop walks the same six, and a second
 * hand-written tuple there would not be forced to change when a seventh
 * collection arrives — the scan would silently skip it (round-1 review, P2).
 */
export const COLLECTIONS = ['pieces', 'squareTypes', 'ruleCards', 'skillCards', 'boards', 'presets'] as const

type CollectionName = (typeof COLLECTIONS)[number]

/**
 * Which bundled ids existed when the author last saved (ADR-002).
 *
 * Stored under its own key rather than as a field on the document, because
 * `importContent` rebuilds the source field by field and would silently drop it
 * on the very next read.
 *
 * A FLAT set of ids, not one set per collection. `contentId` is `<kind>.<slug>`,
 * so a cross-collection collision needs an author to hand-write an id with
 * another kind's prefix — and if they do, the flat set is the conservative
 * reading: the bundled record is skipped rather than added beside theirs. A
 * skipped addition is a no-op; the alternative direction is a document the
 * author did not ask for.
 */
export interface BundleStamp {
  ids: string[]
}

export interface MergeResult {
  source: ContentSource
  /** Ids actually taken from the bundle. Empty on every load but the first after an upgrade. */
  added: string[]
}

/** `id` of a record, or null when it has none a merge could key on. */
function idOf(record: unknown): string | null {
  if (record && typeof record === 'object' && 'id' in record) {
    const id = (record as { id: unknown }).id
    if (typeof id === 'string' && id.length > 0) return id
  }
  return null
}

/**
 * Every id the given bundle ships.
 *
 * Two callers, and they are the same fact from opposite ends: the save path
 * records it as the new stamp, and the load path SYNTHESISES it when no stamp is
 * stored. That synthesis is the whole of the absent case (ADR-003) — every
 * install that exists today has a saved document and no stamp, and stamping the
 * current bundle means nothing is new relative to it, so nothing is added and no
 * deletion is resurrected. `mergeBundled` never learns the stamp was missing.
 */
export function stampOf(bundle: ContentSource): BundleStamp {
  const ids: string[] = []
  for (const name of COLLECTIONS) {
    for (const record of bundle[name]) {
      const id = idOf(record)
      if (id !== null && !ids.includes(id)) ids.push(id)
    }
  }
  return { ids }
}

/**
 * The saved document, plus the bundled records that are new since `stamp`.
 *
 * `declined` is ADR-004's repair channel: an addition can dangle — the bundle
 * ships `preset.cavalry`, which references a skill card this author deleted — and
 * failing to start is far worse than not merging. The caller validates, declines,
 * and re-merges to a fixed point; the worst fixed point is the saved document,
 * which is valid by construction.
 *
 * Pure. The three inputs are never mutated, and an added record is DEEP-COPIED
 * rather than aliased: `bundledContentSource` is a module-level singleton and the
 * editor mutates whatever it is handed, so a shared reference would let one
 * child's edit rewrite the shipped catalogue for the rest of the session.
 */
export function mergeBundled(
  saved: ContentSource,
  bundle: ContentSource,
  stamp: BundleStamp,
  declined: ReadonlySet<string> = new Set(),
): MergeResult {
  const known = new Set(stamp.ids)
  const held = new Set<string>()
  for (const name of COLLECTIONS) {
    for (const record of saved[name]) {
      const id = idOf(record)
      if (id !== null) held.add(id)
    }
  }

  const added: string[] = []
  const source = {
    // The merged document holds bundle-vintage records, so it must declare at
    // least the bundle's version. It can never exceed the running build's,
    // because the bundle IS this build.
    schemaVersion: Math.max(saved.schemaVersion, bundle.schemaVersion),
  } as ContentSource

  // A normalized v16 loadout is intentionally allowed to retain its legacy
  // replace-all playback until the author rewrites it as an exact-square v17
  // slot. Dropping this marker during the additive bundle merge makes the same
  // already-validated save fail on its next load.
  if (saved.legacyLoadoutV16 === true) source.legacyLoadoutV16 = true

  // The author's renames, verbatim. The bundle ships no `strings` at all —
  // bundled text lives in `src/i18n/ko.ts`, a code file that is always current —
  // so there is nothing to merge in, and the only real risk runs the other way:
  // a bundle-first merge would drop everything the author typed.
  if (saved.strings !== undefined) source.strings = saved.strings

  for (const name of COLLECTIONS) {
    const merged: unknown[] = [...saved[name]]
    for (const record of bundle[name]) {
      const id = idOf(record)
      if (id === null) continue
      if (known.has(id) || held.has(id) || declined.has(id)) continue
      merged.push(structuredClone(record))
      added.push(id)
    }
    source[name as CollectionName] = merged
  }

  return { source, added }
}
