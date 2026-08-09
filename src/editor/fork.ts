import type { ContentSource } from '@content/load'
import type { ContentStrings } from '@content/schema'
import { COLLECTIONS } from '@content/merge'
import { bundledRecord, differsFromBundled, forkId, isOfficial } from '@content/provenance'
import type { DraftKind } from './draft'
import { type StringField, deriveKey, writeString } from './strings'

/**
 * Editing what we shipped gives the child their own copy (ADR-001).
 *
 * The record half is the easy half: clone it under a free id and let
 * `commitDraft` APPEND rather than replace, so the original survives untouched.
 *
 * The hard half is the TEXT, and it is why this is a module rather than four
 * lines at a call site. A record carries `nameKey` / `textKey` / `iconKey`,
 * never words; the words live in the locale bundle (ours) or in
 * `source.strings` (theirs). A fork that copied only the record would leave the
 * copy pointing at the ORIGINAL's keys — and `slotFor` (`src/ui/RecordForm.tsx`)
 * writes a rename to "the record's own key", so renaming the copy would rewrite
 * the original's name everywhere it is used. That is the failure ADR-001 exists
 * to prevent, arriving one layer down.
 *
 * So the copy is given its own derived keys and the CURRENT words are carried
 * across. This is the same answer `MakerGallery`'s remix already reached for the
 * same reason, and `RoomDetail`'s `forkBoard` reached half of — that one
 * re-derives the key and drops the words, which is why a forked board comes back
 * nameless.
 *
 * ONE implementation, used by both save paths. Two copies of a rule this subtle
 * is `[fail:design] shared-vocabulary-unshared-code-path` waiting to happen.
 *
 * Pure: `resolve` is injected (the app passes its `t`), nothing here reads
 * storage or the DOM, and neither `source` nor `draft` is mutated.
 */

const COLLECTION_OF: Record<DraftKind, keyof ContentSource> = {
  piece: 'pieces',
  squareType: 'squareTypes',
  ruleCard: 'ruleCards',
  skillCard: 'skillCards',
  board: 'boards',
  preset: 'presets',
}

/** The record's three text slots, and the `StringField` each derives from. */
const TEXT_SLOTS: ReadonlyArray<[string, StringField]> = [
  ['nameKey', 'name'],
  ['textKey', 'text'],
  ['iconKey', 'icon'],
]

export interface ForkResult {
  /** Did this edit produce a copy? `false` means save exactly as before. */
  forked: boolean
  /** The draft to commit — the original object when `forked` is false. */
  draft: Record<string, unknown>
  /**
   * The document's text after the copy's entries were added, or the input
   * unchanged. Exactly-optional: `undefined` is a different document from `{}`,
   * so a fork with nothing to carry leaves it absent.
   */
  strings: ContentStrings | undefined
}

/** Every id the document holds, so a fork cannot land on one. */
function takenIds(source: ContentSource): Set<string> {
  const ids = new Set<string>()
  for (const name of COLLECTIONS) {
    for (const record of source[name]) {
      const id = (record as { id?: unknown }).id
      if (typeof id === 'string' && id !== '') ids.add(id)
    }
  }
  return ids
}

/**
 * Is the record at `openedId` genuinely one of OURS, unmodified?
 *
 * Id membership alone is not enough: an imported set may ship its own
 * `piece.king` with a different definition, and that record is the child's. Both
 * rules that treat a record as ours — the fork (ADR-001) and the id lock
 * (ADR-007) — must ask the SAME question, or they disagree exactly here: the id
 * would be locked on a record with no shipped original to protect, taking away a
 * legitimate tidy-up of an imported id for nothing.
 */
export function isPristineOfficial(
  source: ContentSource,
  kind: DraftKind,
  id: string | null,
  bundle: ContentSource,
  official: ReadonlySet<string>,
): boolean {
  if (id === null || !isOfficial(id, official)) return false
  const shipped = bundledRecord(bundle, COLLECTION_OF[kind] as never, id)
  const stored = (source[COLLECTION_OF[kind]] as unknown[]).find(
    (record) => (record as { id?: unknown }).id === id,
  )
  return !differsFromBundled(stored, shipped)
}

export function forkOnEdit(
  source: ContentSource,
  kind: DraftKind,
  draft: Record<string, unknown>,
  openedId: string | null,
  bundle: ContentSource,
  official: ReadonlySet<string>,
  resolve: (key: string) => string,
  /**
   * Which locale the carried words are written under. A parameter rather than an
   * import: `DEFAULT_LOCALE` lives in `src/ui/i18n.ts`, and an editor module
   * reaching into the UI layer for it would invert the dependency this file is
   * on the clean side of.
   */
  locale: string,
): ForkResult {
  const unchanged: ForkResult = { forked: false, draft, strings: source.strings }

  // A new record is nobody's copy.
  if (openedId === null) return unchanged
  // The child's own record is edited in place, as it always was.
  if (!isOfficial(openedId, official)) return unchanged

  /*
   * Is the record in the document actually OURS, or merely wearing our id?
   * Finding that out cost two green tests — see `isPristineOfficial`.
   */
  if (!isPristineOfficial(source, kind, openedId, bundle, official)) return unchanged

  const shipped = bundledRecord(bundle, COLLECTION_OF[kind] as never, openedId)

  // Structural difference is the rest of the rule (ADR-001). A rename writes
  // into `strings` and leaves the record byte-identical, so it lands here as "no
  // difference" without any per-kind list of fields to ignore.
  if (!differsFromBundled(draft, shipped)) return unchanged

  const newId = forkId(openedId, takenIds(source))
  const next = structuredClone(draft)
  next['id'] = newId

  let strings = source.strings
  for (const [slot, field] of TEXT_SLOTS) {
    const current = next[slot]
    // Only slots the record ACTUALLY has. Deriving a `textKey` for a room would
    // put a field on the record the schema does not admit, and the save would be
    // refused over a field the child never typed in.
    if (typeof current !== 'string' || current === '') continue
    const newKey = deriveKey(newId, field)
    next[slot] = newKey
    const word = resolve(current)
    // `resolve` falls back to the key by design. Writing that into the overlay
    // would put a dotted key on screen as if it were a name — ADR-002's leak,
    // re-created by the fork.
    if (word !== current) strings = writeString(strings, locale, newKey, word)
  }

  return { forked: true, draft: next, strings }
}
