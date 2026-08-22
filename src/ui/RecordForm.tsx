import { useMemo, useState } from 'react'
import type { ContentSource, ValidationError } from '@content/load'
import type { ContentStrings } from '@content/schema'
import { type DraftKind, blankDraft, commitDraft, editorContext, openDraft, validateDraft } from '@editor/draft'
import { type StringField, clearString, deriveKey, readString, rekeyStrings, writeString } from '@editor/strings'
import { forkOnEdit, isPristineOfficial } from '@editor/fork'
import { visibleIds } from '@editor/visibility'
import { officialIds } from '@content/provenance'
import { bundledContentSource } from '@content/sets/bundled'
import { DEFAULT_LOCALE, makeTranslate, useTranslate } from './i18n'
import { recordLabel, recordLabels } from './recordLabel'
import { type Mark, resolveMark } from './art/resolve'
import { artRegistry } from './art/registry'
import { PlacementPainter, type PaintedSquare, type Placed, paintSquare, togglePlacement } from './PlacementPainter'
import { MarkBody } from './art/MarkBody'
import { ImageMark } from './art/ImageMark'
import {
  Cell,
  DIRECTIONS,
  type Dir8,
  describeMovementEditor,
  GRID_RANGE,
  type MovementEditorState,
  hasMovementEditorMoves,
  hasMovementEditorTakes,
  cycleAt,
  paintAt,
  rayOf,
  readMovementEditor,
  writeMovementEditor,
} from './PieceMoves'
import { TurningSlideEditor } from './TurningSlideEditor'
import { readSentence } from './CardRecipe'
import { SentenceEditor, describeRecord, sentenceText } from './SentenceSlot'
import { RecordGrade } from './RecordGrade'
import { MakerGallery, type Picked } from './MakerGallery'

/**
 * One content record, open for editing (PLAN Phase 9a).
 *
 * This is `Edit.tsx`'s Phase 5 body, moved rather than rewritten. That is a
 * deliberate constraint and it has a check: the ADR-006 vocabulary-coverage
 * gate mounts the editor and drives these controls by test id, and it passes
 * UNCHANGED across this phase. Controls were RE-GROUPED — browse moved out to
 * the library, transfer moved up to the shell, the room's own fields moved to
 * `RoomDetail` — and nothing in the vocabulary palette was re-authored.
 *
 * Three things this phase adds:
 *
 * 1. **The child types a name, not a key** (ADR-020). `editor-name` writes the
 *    Korean text into the document's `strings` overlay and derives the record's
 *    `nameKey` from its id. The raw key fields survive under the advanced
 *    disclosure (`ui.editor.form.advanced`) because
 *    an author who imported someone else's set may need them, and because the
 *    ADR-006 gate authors through them.
 *
 * 2. **The opened id is threaded into `commitDraft`** (R10). Without it a
 *    changed id APPENDS a second record and orphans the first; with it the save
 *    replaces, and `rekeyStrings` carries the text across.
 *
 * 3. **The record's own key fields are re-derived on a rename.** Phase 8 moved
 *    the OVERLAY's keys; nothing moved the `nameKey` stored on the record, so a
 *    renamed piece kept pointing at text that had just moved out from under it
 *    and rendered a dotted key on every square it stood on. The overlay half
 *    passed its unit test the whole time — this is the wiring that half needed.
 */

type Draft = Record<string, unknown>

const EFFECT_BEARING: readonly DraftKind[] = ['piece', 'squareType', 'ruleCard', 'skillCard']

/** Which key of an action holds a destination. `promote_piece.to` is a piece id, not one. */
const GRID = [3, 2, 1, 0, -1, -2, -3]

/** Records whose schema carries a `textKey`. Boards and rooms have a name only. */
const HAS_TEXT: readonly DraftKind[] = ['piece', 'squareType', 'ruleCard', 'skillCard']

/** Does anything OTHER than this document answer for `key`? */
function bundleResolves(key: string): boolean {
  return makeTranslate()(key) !== key
}

interface TextSlot {
  field: StringField
  slot: 'nameKey' | 'textKey'
  typed: boolean
  value: string
  active: boolean
}

type FoldResult =
  | { ok: true; strings: ContentStrings | undefined }
  | { ok: false; slot: string }

/**
 * Folds what the author typed into the document's overlay.
 *
 * Two rules, and both exist because a save used to conflate three different
 * intentions into one condition (`value !== ''`):
 *
 * 1. **Only a field the author TYPED IN is written.** Otherwise editing the raw
 *    key under the advanced disclosure also re-writes the old text at the new
 *    key, clobbering whatever every other record sharing that key was saying.
 * 2. **Clearing a field means "un-say it", and un-saying is not always
 *    available.** The overlay cannot hold an empty string (`z.string().min(1)`),
 *    so the entry is DROPPED — which for a shipped record is exactly the undo
 *    the author wanted, since the bundle answers again. For a record the author
 *    invented there is nothing underneath, and dropping would paint the dotted
 *    key across the board. That save is refused, with the field named.
 */
function foldText(
  strings: ContentStrings | undefined,
  next: Record<string, unknown>,
  id: string,
  slots: readonly TextSlot[],
): FoldResult {
  let out = strings
  for (const s of slots) {
    if (!s.active || !s.typed) continue
    const key = slotFor(next[s.slot], id, s.field)
    const value = s.value.trim()
    if (value !== '') {
      next[s.slot] = key
      out = writeString(out, DEFAULT_LOCALE, key, value)
      continue
    }
    if (!bundleResolves(key)) return { ok: false, slot: s.slot }
    next[s.slot] = key
    out = clearString(out, DEFAULT_LOCALE, key)
  }
  return { ok: true, strings: out }
}

/**
 * Everything about a record this form is responsible for not clobbering.
 *
 * The record AND the text it resolves to, because those live in two different
 * places in the document. The first version of this guard compared only the
 * record and was defeated by the very case it was written for: an import that
 * changes a name changes the `strings` OVERLAY, while the record — which
 * carries only the KEY — is byte-identical. It refused nothing and the test
 * that named the scenario is what found it.
 */
export interface RecordSnapshot {
  record: unknown
  name: string
  text: string
}

export function snapshotOf(source: ContentSource, kind: DraftKind, id: string | null): RecordSnapshot {
  const record = id ? openDraft(source, kind, id) : null
  return {
    record: record ?? null,
    name: readString(source.strings, DEFAULT_LOCALE, String(record?.nameKey ?? '')) ?? '',
    text: readString(source.strings, DEFAULT_LOCALE, String(record?.textKey ?? '')) ?? '',
  }
}

export function sameSnapshot(a: RecordSnapshot, b: RecordSnapshot): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

/**
 * Where a record's typed text is stored.
 *
 * The record's OWN key when it has one, and a derived `<id>.<field>` only when
 * it does not. Deriving unconditionally looks tidier and is wrong twice:
 *
 * - A shipped record already keys its text `<its id>.name`, and writing the
 *   overlay at that key is precisely what lets a child RENAME a bundled record
 *   (ADR-020) rather than shadow it from a parallel namespace.
 * - An imported set may key its text anywhere at all. Re-deriving would point
 *   the record at a fresh key and leave the author's original entry stranded in
 *   the overlay — text that is still in the document and reachable by nothing.
 *
 * On a rename the caller has already moved the record's key onto the new id, so
 * "its own key" is the new one by the time this is asked.
 */
function slotFor(current: unknown, id: string, field: StringField): string {
  return typeof current === 'string' && current !== '' ? current : deriveKey(id, field)
}

export function RecordForm({
  source,
  kind,
  initialId,
  commit,
  onDirtyChange,
  onOpenedIdChange,
  errors,
  setErrors,
  bundle = bundledContentSource,
  official,
  hidden,
}: {
  source: ContentSource
  kind: DraftKind
  /** What counts as ours (ADR-003). Injected so a test can state it. */
  bundle?: ContentSource
  /**
   * Ids the bundle ships. Passed in rather than derived here so the shell
   * computes it once — and so a test can hand this form a document where
   * nothing is official without also having to fake a bundle.
   */
  official?: ReadonlySet<string>
  /** Records this browser has tucked away (ADR-005 surface 4). */
  hidden?: ReadonlySet<string>
  /** The record this form opened on, or null for a blank one. */
  initialId: string | null
  commit: (next: ContentSource) => void
  /**
   * Whether this form holds unsaved work. Reported in BOTH directions: an edit
   * raises it and a successful save clears it. A one-way latch would leave the
   * shell asking "discard unsaved work?" about a form that has none.
   */
  onDirtyChange?: (dirty: boolean) => void
  /**
   * The id this form is responsible for, reported whenever it changes.
   *
   * The shell cannot derive it: a save made INSIDE the form moves `openedId`
   * (a new record gets one, a rename changes it) and the shell's own
   * `library.id` is set only by navigation. Anything the shell decides from
   * that lagging value — including whether a delete should close this form —
   * is deciding from a stale fact.
   */
  onOpenedIdChange?: (id: string | null) => void
  errors: ValidationError[]
  setErrors: (errors: ValidationError[]) => void

}) {
  const t = useTranslate()
  // The shell computes this once and passes it down; deriving it here when it is
  // absent keeps every existing call site working unchanged.
  const officialSet = useMemo(() => official ?? officialIds(bundle), [official, bundle])

  // Read ONCE, at mount. The caller remounts (via `key`) to open a different
  // record, so there is no prop-to-state sync to get wrong — and a save that
  // rewrites `source` cannot yank the buffer out from under a half-typed edit.
  const [draft, setDraft] = useState<Draft>(() => (initialId ? (openDraft(source, kind, initialId) ?? blankDraft(kind)) : blankDraft(kind)))
  /**
   * WHICH record a save replaces. Tracks the id the form is currently
   * responsible for — the one it opened on, and after a rename, the new one.
   * Never falls back to the draft's own id: that fallback is the data-loss bug
   * `commitDraft` documents.
   */
  const [openedId, setOpenedId] = useState<string | null>(initialId)
  /**
   * The record as it looked when this form opened, kept so a save can tell
   * whether the document moved underneath it (Phase 9a review, P0).
   *
   * `openedId` alone is not enough. The form snapshots its draft at mount but
   * reads `source` LIVE at save time, and nothing remounts it when the document
   * is replaced — so after an import (or after the other panel edited the same
   * record) `commitDraft` matches the stale `openedId` against the NEW list and
   * overwrites a record this form never saw, reporting success. The export →
   * edit → re-import round trip is exactly the flow the transfer controls exist
   * for, which is what made it reachable rather than theoretical.
   *
   * Compared rather than remounted-away: remounting on every document change
   * would throw away a half-typed edit the author is in the middle of, which
   * trades one silent loss for another. Refusing the save keeps the buffer and
   * hands the decision back.
   */
  const [openedSnapshot, setOpenedSnapshot] = useState<RecordSnapshot>(() => snapshotOf(source, kind, initialId))

  // The visible fields start from the same snapshot the guard compares against,
  // so "what the author saw" and "what the guard defends" cannot drift apart.
  const [nameText, setNameText] = useState(openedSnapshot.name)
  const [bodyText, setBodyText] = useState(openedSnapshot.text)
  /**
   * Whether the author actually typed in the two visible text fields.
   *
   * A save used to write the overlay whenever the field was non-empty, which
   * conflates "this is the text" with "I am setting this text" — and the two
   * come apart the moment the author edits the raw KEY under the advanced
   * disclosure instead. There the field still holds the text resolved through
   * the OLD key, so a save re-pointed the record AND wrote that old text over
   * whatever already lived at the destination key, globally, for every record
   * sharing it. Writing only what was typed is the difference.
   */
  const [nameTyped, setNameTyped] = useState(false)
  const [textTyped, setTextTyped] = useState(false)



  /**
   * Whether the gallery is still the thing on screen (ADR-027's sibling
   * decision, AC-009). Only ever true for a record that does not exist yet —
   * opening an existing record goes straight to the form, because the gallery's
   * question has already been answered.
   *
   * The form below stays MOUNTED behind it, `hidden` rather than absent, for the
   * same reason the expert panel does: the ADR-006 coverage gate reaches its
   * controls by test id, and an editor that unmounted them would fail a gate
   * that is about the vocabulary, not about this screen.
   */
  const [choosing, setChoosing] = useState(initialId === null)

  // `effectIndex` / `actionIndex` / `patternIndex` are gone with the indexed form
  // (PLAN Phase 7). They were cursors into arrays the author had to navigate before
  // they could edit anything, which is the single thing about that form a child
  // could not be taught. `attackIndex` survives because the attack grid is still
  // per-pattern.
  const [attackIndex, setAttackIndex] = useState(0)
  const [saved, setSaved] = useState<string | null>(null)
  const [paintType, setPaintType] = useState('')
  const [pendingPair, setPendingPair] = useState<string | null>(null)
  const [pairHint, setPairHint] = useState(false)
  /**
   * Which of the two things a board is gets painted right now.
   *
   * The room maker has always split these into two steps — `ui.editor.step.board`
   * and `ui.editor.step.place`; this screen used to do both at once, two tiny
   * buttons per square. One question at a time is the whole reason for the split.
   */
  const [boardMode, setBoardMode] = useState<'place' | 'paint'>('place')
  /** Which of a piece's two questions the one grid is currently answering (ADR-003). */
  const [moveMode, setMoveMode] = useState<'move' | 'capture'>('move')
  const [placePiece, setPlacePiece] = useState('')
  const [placeSide, setPlaceSide] = useState<'white' | 'black'>('white')

  const ctx = useMemo(() => editorContext(source), [source])

  const pairedTypes = useMemo(
    () =>
      new Set(
        source.squareTypes
          .filter((ty) => (ty as { paired?: unknown }).paired === true)
          .map((ty) => String((ty as { id: string }).id)),
      ),
    [source],
  )

  /** Every mutation goes through a clone, so no state object is ever edited in place. */
  const update = (mutate: (d: Draft) => void) => {
    setDraft((prev) => {
      const next = structuredClone(prev)
      mutate(next)
      return next
    })
    setSaved(null)
    onDirtyChange?.(true)
  }

  const attacks = (draft.attack as Draft[] | undefined) ?? []

  // --- field-anchored validation (#25) --------------------------------------

  /**
   * The error belonging to one field of THIS record, or none.
   *
   * A list of `presets.preset.foo.pieceIds — array must contain at least 1
   * element` under the save button is a sentence about a document format. The
   * same error rendered beside the control the author was last touching is a
   * sentence about what they just did — so the list stays (the shell renders
   * it) and this puts a copy where the eye already is.
   */
  const errorFor = (field: string): ValidationError | undefined =>
    errors.find((e) => e.path === field || e.path.endsWith(`.${field}`))

  const fieldError = (field: string) => {
    const found = errorFor(field)
    if (!found) return null
    return (
      <p className="field-error" data-testid={`editor-field-error-${field}`}>
        {found.message}
      </p>
    )
  }

  // The vocabulary palette and the effect/action parameter controls used to live
  // here. Both are gone with the indexed form (PLAN Phase 7): the palette's job is
  // the sentence's slot sheets, and each parameter now renders inside the sheet of
  // the slot that owns it (ADR-004). `SentenceSlot.tsx` holds both.

  const numberField = (testid: string, labelKey: string, value: unknown, apply: (n: number | null) => void) => (
    <label key={testid}>
      {t(labelKey)}
      <input
        type="number"
        data-testid={testid}
        value={typeof value === 'number' ? String(value) : ''}
        onChange={(e) => apply(e.target.value === '' ? null : Number(e.target.value))}
      />
    </label>
  )

  /**
   * A record's name for the screen.
   *
   * This used to be a PRIVATE copy of `recordLabel` — same shape, same raw-id
   * fallback, importing nothing — and it backed the room composition picker
   * below. ADR-002's guarantee is a required `kind` argument on `recordLabel`,
   * which the compiler enforces only for call sites that go through it, so a
   * lookalike here was invisible to that guarantee and kept rendering
   * a bare id at a child. It is now one function; `tests/ui/no-raw-ids.test.tsx`
   * mounts this form specifically because a test scoped to the browse lists
   * passed against the defect.
   */
  const pieceLabel = (id: string) => {
    const found = source.pieces.find((p) => (p as { id?: unknown }).id === id) as { nameKey?: unknown } | undefined
    return recordLabel(t, 'piece', id, found?.nameKey)
  }

  // --- movement / attack grids ---------------------------------------------

  function toggleVector(vectors: number[][], df: number, dr: number): number[][] {
    const at = vectors.findIndex((v) => v[0] === df && v[1] === dr)
    if (at >= 0) return vectors.filter((_, i) => i !== at)
    return [...vectors, [df, dr]]
  }

  function vectorGrid(prefix: string, vectors: number[][], onToggle: (df: number, dr: number) => void) {
    return (
      <div className="vector-grid" role="group">
        {GRID.map((dr) => (
          <div key={dr} className="vector-row">
            {GRID.map((df) => df).map((df) =>
              df === 0 && dr === 0 ? (
                <span key={df} className="vector-origin">
                  ●
                </span>
              ) : (
                <button
                  key={df}
                  type="button"
                  data-testid={`${prefix}-${df}_${dr}`}
                  data-on={vectors.some((v) => v[0] === df && v[1] === dr)}
                  onClick={() => onToggle(df, dr)}
                >
                  {vectors.some((v) => v[0] === df && v[1] === dr) ? '×' : ''}
                </button>
              ),
            )}
          </div>
        ))}
      </div>
    )
  }

  // --- board painting -------------------------------------------------------

  const boardSquares = () => {
    const width = Number(draft.width ?? 6)
    const height = Number(draft.height ?? 6)
    const rows: string[][] = []
    for (let rank = height; rank >= 1; rank -= 1) {
      const row: string[] = []
      for (let file = 0; file < width; file += 1) row.push(`${String.fromCharCode(97 + file)}${rank}`)
      rows.push(row)
    }
    return rows
  }

  /**
   * The mark a record draws with, for the painter's cells and its palette.
   * Same resolution the room maker uses — the two screens must not disagree
   * about what a piece looks like.
   */
  const markOfRecord = (collection: 'pieces' | 'squareTypes', id: string, side?: 'white' | 'black'): Mark => {
    const record = (source[collection] as Array<Record<string, unknown>>).find((r) => r.id === id)
    return resolveMark(t, record as { artKey?: string; iconKey?: string } | undefined, {
      registry: artRegistry,
      side,
      fallback: 'none',
    })
  }

  const paint = (square: string) => {
    // Shared with the room (see `paintSquare`). This used to be its own reducer
    // and the two had drifted in two ways that both produced documents the
    // loader refuses: painting over one half of a portal pair replaced that
    // entry in place and left the other half pointing at a square that no
    // longer paired back, and tapping the same square twice while arming a pair
    // wrote two entries for one square, each paired with itself.
    const list = ((draft.squares as Draft[] | undefined) ?? []) as unknown as PaintedSquare[]
    const result = paintSquare(list, square, paintType, (id) => pairedTypes.has(id), pendingPair)
    setPendingPair(result.pendingPair)
    setPairHint(result.pendingPair !== null)
    if (result.squares) {
      const squares = result.squares
      update((d) => {
        d.squares = squares as unknown as Draft[]
      })
    }
  }

  const place = (square: string) => {
    // Shared with the room, deliberately — see `togglePlacement`. This used to
    // be its own reducer that replaced on a piece mismatch where the room
    // cleared, so one tap meant two different things on two screens.
    update((d) => {
      d.placements = togglePlacement(
        ((d.placements as Draft[] | undefined) ?? []) as unknown as Placed[],
        square,
        placePiece,
        placeSide,
      ) as unknown as Draft[]
    })
  }

  // --- room bundling (kept here so a room is still editable as a record) ----

  const toggleInList = (field: string, id: string) =>
    update((d) => {
      const list = (d[field] as string[] | undefined) ?? []
      const at = list.indexOf(id)
      if (at >= 0) list.splice(at, 1)
      else list.push(id)
      d[field] = list
    })

  /**
   * One picker, with the hidden set applied (ADR-005) and its exemption.
   *
   * `keepSelected` is what the record ALREADY holds for this field. Without it a
   * hidden-but-selected record simply vanishes from the list with its box
   * unticked, and the next save writes the record back without it — a silent
   * deletion caused by a display preference.
   */
  const checkboxList = (
    field: string,
    entryKind: DraftKind,
    legendKey: string,
    testidPrefix: string,
    allEntries: Array<[string, unknown]>,
  ) => {
    const chosen = (draft[field] as string[] | undefined) ?? []
    const entries = visibleIds(allEntries, hidden ?? new Set(), chosen)
    // Per LIST, not per row: two unnamed records must be numbered apart, and an
    // ordinal is a position among siblings that a single row does not have.
    const labels = recordLabels(t, entryKind, entries)
    return (
    <fieldset>
      <legend>{t(legendKey)}</legend>
      {entries.map(([id, nameKey]) => (
        <label key={id}>
          <input
            type="checkbox"
            data-testid={`${testidPrefix}-${id}`}
            checked={((draft[field] as string[] | undefined) ?? []).includes(id)}
            onChange={() => toggleInList(field, id)}
          />
          {labels.get(id)}
        </label>
      ))}
      {fieldError(field)}
    </fieldset>
    )
  }

  const named = (records: unknown[]): Array<[string, unknown]> =>
    records.map((r) => [String((r as { id?: unknown }).id ?? ''), (r as { nameKey?: unknown }).nameKey])

  // --- save -----------------------------------------------------------------

  /**
   * Folds the typed Korean text into the document and saves.
   *
   * The order matters and is the whole subtlety of a rename. The record's own
   * key fields are re-derived FIRST, then the overlay is re-keyed, and only
   * then is the new text written — so the freshly typed name lands on the key
   * the record now points at rather than on the one it just left.
   */
  /**
   * The record this form holds is no longer in the document.
   *
   * Deleted — from this panel or the other one, which stays mounted. The 9a
   * stale-snapshot guard already refuses the save, but it refuses it with a
   * message about the document moving, which is true of an import and misleading
   * about a deletion the child just performed. Saying so on the screen, at the
   * moment it becomes true, is the display half of the same rule.
   */
  const subjectDeleted = openedId !== null && openDraft(source, kind, openedId) === null

  /**
   * The document a save would build, and the record it would put in it.
   *
   * Extracted so that live validation (ADR-033) runs THIS pipeline rather than
   * a lookalike. The raw draft is not what gets validated on save — its
   * `nameKey`/`textKey` are derived from the typed name first — so validating
   * the raw draft would report "must be a dotted lowercase i18n key" against
   * every half-finished record and teach the child to ignore red text. Two
   * derivations would have drifted; one has nothing to drift from.
   */
  const prepared = ():
    | { base: ContentSource; next: Draft; id: string; forked: boolean }
    | { slot: string; id: string } => {
    const next = structuredClone(draft)
    const id = String(next.id ?? '')
    const renaming = openedId !== null && id !== '' && id !== openedId

    if (renaming) {
      for (const field of ['nameKey', 'textKey', 'iconKey']) {
        const value = next[field]
        if (typeof value === 'string' && value.startsWith(`${openedId}.`)) {
          next[field] = `${id}${value.slice(openedId!.length)}`
        }
      }
    }

    /*
     * Editing what we shipped gives the child their own copy (ADR-001).
     *
     * Here rather than inside `commitDraft` for two reasons. The record half
     * could live either place; the TEXT half cannot — the words are resolved
     * through `t`, which only this layer has, and a copy that kept the
     * original's keys would rename the original the next time the child renamed
     * the copy. And `commitDraft` is the single save path for all six kinds, so
     * leaving it untouched is the cheaper risk.
     *
     * `officialSet` empty means nothing forks, which is exactly what a document
     * with no bundle behind it should do.
     */
    // Resolved through `makeTranslate(source.strings)` rather than the component's
    // `t`: the copy's words must come from the OVERLAY first and the locale
    // bundle second, and a context-provided `t` is not guaranteed to have been
    // handed this document's overlay. Getting that wrong is silent — the copy is
    // simply born nameless.
    const fork = forkOnEdit(
      source,
      kind,
      next,
      openedId,
      bundle,
      officialSet,
      makeTranslate(source.strings),
      DEFAULT_LOCALE,
    )
    const forkedDraft = fork.forked ? fork.draft : next
    const forkedId = fork.forked ? String(forkedDraft['id'] ?? '') : id

    let strings = renaming ? rekeyStrings(fork.strings, openedId!, id) : fork.strings

    const folded = foldText(strings, forkedDraft, forkedId, [
      { field: 'name', slot: 'nameKey', typed: nameTyped, value: nameText, active: id !== '' },
      {
        field: 'text',
        slot: 'textKey',
        typed: textTyped,
        value: bodyText,
        active: id !== '' && HAS_TEXT.includes(kind),
      },
    ])
    if (!folded.ok) return { slot: folded.slot, id: forkedId }
    strings = folded.strings

    // Assigned only when there IS an overlay: `strings` is exactly-optional, so
    // writing `undefined` into it is a different document from omitting it.
    const base = strings !== undefined && strings !== source.strings ? { ...source, strings } : source
    return { base, next: forkedDraft, id: forkedId, forked: fork.forked }
  }

  const save = () => {
    if (subjectDeleted) {
      setErrors([{ contentId: openedId ?? '', path: '', message: t('ui.editor.form.deleted') }])
      setSaved(null)
      return
    }
    // The document must still be the one this form opened against. A record
    // that changed or vanished under an open form means the save would silently
    // discard someone else's write — including the author's own import.
    if (openedId !== null && !sameSnapshot(snapshotOf(source, kind, openedId), openedSnapshot)) {
      setErrors([{ contentId: openedId, path: '', message: t('ui.editor.form.stale') }])
      setSaved(null)
      return
    }

    const ready = prepared()
    if ('slot' in ready) {
      setErrors([{ contentId: ready.id, path: ready.slot, message: t('ui.editor.form.name-needed') }])
      setSaved(null)
      return
    }
    const { base, next, id, forked } = ready

    // A fork APPENDS. Passing `openedId` would make `commitDraft` replace the
    // record at that slot — which is the shipped original, and losing it is the
    // one thing ADR-001 exists to prevent.
    const result = commitDraft(base, kind, next, forked ? undefined : (openedId ?? undefined))
    if (!result.ok) {
      setErrors(result.errors)
      setSaved(null)
      return
    }
    setErrors([])
    setDraft(next)
    setOpenedId(id)
    onOpenedIdChange?.(id)
    // The snapshot moves forward with the save, or the NEXT save would compare
    // against a version this form itself superseded and refuse every time.
    setOpenedSnapshot(snapshotOf(result.source, kind, id))
    // The buffer is now what the document says, so nothing is pending.
    setNameTyped(false)
    setTextTyped(false)
    onDirtyChange?.(false)
    setSaved(id)
    commit(result.source)
  }

  /**
   * `anchor: false` for the two KEY fields under the advanced disclosure — an
   * error rendered
   * inside a collapsed `<details>` is an error nobody sees, so those two anchor
   * beside the name and description inputs the child actually used instead.
   * Rendering both would put two nodes under one test id, which is a broken
   * selector rather than redundancy.
   */
  const textField = (field: string, testid: string, labelKey: string, anchor = true, readOnly = false) => (
    <label>
      {t(labelKey)}
      <input
        data-testid={testid}
        value={String(draft[field] ?? '')}
        readOnly={readOnly}
        onChange={(e) =>
          update((d) => {
            d[field] = e.target.value
          })
        }
      />
      {anchor && fieldError(field)}
    </label>
  )

  /**
   * An official record's id is not editable (ADR-007).
   *
   * This was a live data-loss path, not a tidiness question. Typing in the id
   * field re-derives `nameKey`/`textKey`/`iconKey` to follow the new id, and
   * `commitDraft` then REPLACES the record sitting at `openedId` — so a child
   * who renamed our king's id overwrote the shipped king and it was gone.
   *
   * Locking it also makes ADR-001's fork comparison unambiguous: with the id
   * fixed, `draft.id === openedId === the bundled id` on every commit that
   * reaches the fork branch, so there is no question of which shipped record the
   * copy is being compared against. A record the child forked is theirs, and its
   * id unlocks again.
   *
   * Asked through `isPristineOfficial`, the SAME predicate the fork uses. Keying
   * on id membership alone disagreed with the fork exactly where it matters: an
   * imported set carrying its own record under one of our ids would have that id
   * locked with no shipped original to protect, taking away the tidy-up ADR-007
   * explicitly meant to keep.
   */
  const idLocked = isPristineOfficial(source, kind, openedId, bundle, officialSet)


  // --- the simple views (Chess Craft redesign) -------------------------------

  /**
   * Which surface this record renders on, and therefore which art it may point
   * at. A rule card offered a square's picture would render fine and be
   * legibility-checked against the wrong background — see `art-key.test.ts`.
   */
  const ART_SURFACE: Partial<Record<DraftKind, 'piece' | 'square' | 'card'>> = {
    piece: 'piece',
    squareType: 'square',
    ruleCard: 'card',
    skillCard: 'card',
  }

  /**
   * The mark this record shows, picked from the app's raster catalogue.
   *
   * Not a text field for the art id. The id is `art.homeward` and the picture is
   * a house — a child cannot map one to the other by reading, and there is no
   * reason to make them: the whole catalogue fits on one screen at display size
   * while the imported sources stay high-resolution.
   */
  function artPicker() {
    const surface = ART_SURFACE[kind]
    if (!surface) return null
    const options = [...artRegistry.entries()].filter(([, entry]) => entry.surface === surface)
    if (options.length === 0) return null
    const chosen = typeof draft.artKey === 'string' ? draft.artKey : ''
    return (
      <fieldset className="art-picker">
        <legend>{t('ui.editor.field.art')}</legend>
        <div className="palette wrap">
          {options.map(([artId, entry]) => {
            const src = entry.kind === 'sided' ? entry.white : entry.src
            return (
              <button
                key={artId}
                type="button"
                data-testid={`editor-art-${artId}`}
                data-selected={chosen === artId}
                aria-pressed={chosen === artId}
                aria-label={artId}
                onClick={() =>
                  update((d) => {
                    // Tapping the chosen one clears it: `artKey` is optional, and
                    // a picker with no way back to "no picture" makes the absent
                    // case unreachable the moment it is used once.
                    if (d.artKey === artId) delete d.artKey
                    else d.artKey = artId
                  })
                }
              >
                <ImageMark src={src} />
              </button>
            )
          })}
        </div>
      </fieldset>
    )
  }

  /**
   * One line saying what the record currently is — the pinned "preview".
   *
   * NOT the engine preview board. `PiecePreview` is a 7x7 grid; pinning it would
   * spend most of a 390x844 viewport on the thing the child is scrolling PAST the
   * form to see, which defeats the purpose of pinning anything. What a pinned line
   * can carry is the answer to "what am I making right now", read from the same
   * models the editors write — `describeGrid` for a piece's movement, `sentenceText`
   * for what a record does — so it cannot drift from either.
   */
  function summaryLine(): string {
    /*
     * The movement clause stays here, and only here.
     *
     * Dropping it was tried, on the reading that AC-001's "top-of-form summary"
     * was a fifth derived view of the drawing. An e2e caught what that actually
     * produced: a fully authored piece whose sticky anchor read "you have not
     * decided anything yet". The anchor is form chrome for every record kind —
     * it exists because this form is several screens tall on a 390x844 phone, so
     * what you are making has to stay reachable — and a chrome element that lies
     * is worse than the redundancy AC-001 is aimed at.
     *
     * What DID go is `piece-summary`, the dex line inside the movement fieldset,
     * which retold the drawing to someone already looking at it.
     */
    const parts: string[] = []
    if (kind === 'piece') {
      const editor = readMovementEditor(draft)
      if (editor) parts.push(describeMovementEditor(t, editor))
    }
    const sentence = EFFECT_BEARING.includes(kind) ? readSentence(draft) : null
    if (sentence) {
      const said = sentenceText(t, sentence, kind)
      if (said !== '') parts.push(said)
    }
    return parts.length === 0 ? t('ui.editor.form.summary-empty') : parts.join(' / ')
  }

  /** Every direction off. `slides` is a total record, so `{}` is not a valid value. */
  const emptySlides = (): Record<Dir8, Cell> =>
    Object.fromEntries(DIRECTIONS.map((d) => [d, Cell.None])) as Record<Dir8, Cell>

  /** How this piece moves, as one grid. See `PieceMoves.tsx` for the mapping. */
  function pieceGridView() {
    if (kind !== 'piece') return null
    const editor = readMovementEditor(draft)
    // Refusing to open beats flattening — see the header of `PieceMoves.tsx`. Only
    // THIS control yields; the rest of the record stays editable, and the movement
    // it could not read passes through the draft untouched.
    if (!editor) return readOnlyMovesView()
    const grid = editor.grid

    const commit = (next: MovementEditorState) => {
      const written = writeMovementEditor(next)
      update((d) => {
        if (!written.ok) {
          // An empty grid is WRITTEN, not swallowed.
          //
          // This branch used to `return` and leave the draft alone, reasoning
          // that a document with no movement will not load (`movement` carries
          // `.min(1)`) so the draft should keep its last valid one. The effect
          // was the exact opposite of the intent: the draft never changed, so
          // `readGrid` handed back the same grid, so the cell re-rendered LIT
          // and `piece-no-moves` — the note this comment promised would explain
          // things — never rendered, because it is computed from that same
          // grid. Tapping the one seeded cell of a brand-new piece did nothing
          // at all, silently, on a child's first interaction with the maker.
          //
          // Writing the empty state instead makes every downstream signal true:
          // the cell goes dark, `hasMoves` goes false so the hint appears, and
          // `validateDraft` reports the movement floor through the same
          // validator the save button uses (ADR-033). An unsaveable draft that
          // says so is a state an author can leave; an ignored click is not.
          d.movement = []
          // `attack` goes with it, and keeping it was tried and reverted.
          //
          // The appeal is obvious — clearing the movement half to start over
          // should not throw away authored capture squares. What defeats it is
          // that the remaining `attack` cannot be told apart from an artefact:
          // an omitted `attack` means captures follow the movement, so the
          // moment the two axes diverge the promotion is MATERIALISED into a
          // real capture set. Cycling the seeded cell off therefore leaves a
          // capture square nobody asked for, and holding it suppresses the
          // promotion for every square the author paints next — a piece that
          // quietly stopped capturing where it walks.
          delete d.attack
          return
        }
        d.movement = written.movement
        if (written.attack === undefined) delete d.attack
        else d.attack = written.attack
      })
    }

    // Computed over BOTH controls: a piece that only slides has somewhere to go
    // even with an empty grid, and saying otherwise would be the old bug wearing
    // a different hat.
    const noMoves = !hasMovementEditorMoves(editor)
    const noTakes = !hasMovementEditorTakes(editor)
    /**
     * Whether this record captures wherever it walks (ADR-008).
     *
     * True exactly when the draft carries no `attack`, which is the schema's way of saying
     * "takes on its movement" and what makes `readGrid` promote every move cell to both. Read
     * off the draft rather than inferred from the grid, because the grid has already been
     * promoted by the time this renders — asking it would be asking the answer.
     */
    const capturesFollowMovement = (draft as { attack?: unknown }).attack === undefined
    const moveAxis = moveMode === 'move' ? Cell.Move : Cell.Capture

    return (
      <fieldset className="piece-moves" data-testid="editor-moves">
        <legend>{t('ui.editor.piece.how')}</legend>
        <p className="hint">{t('ui.editor.piece.how-hint')}</p>
        {/* One question on screen at a time (ADR-003). A cell answers "how does
            it get there"; this answers "which of the two am I drawing". Leaving
            the capture side unpainted means captures follow the movement, which
            is what the schema means by omitting `attack`. */}
        <div className="move-modes" data-testid="piece-modes">
          {(['move', 'capture'] as const).map((m) => (
            <button
              key={m}
              type="button"
              data-testid={`piece-mode-${m}`}
              data-selected={moveMode === m}
              aria-pressed={moveMode === m}
              onClick={() => setMoveMode(m)}
            >
              {t(`ui.editor.piece.mode.${m}`)}
            </button>
          ))}
        </div>
        {moveMode === 'capture' && capturesFollowMovement && (
          <p className="hint" data-testid="piece-capture-follows">
            {t('ui.editor.piece.capture-follows')}
          </p>
        )}
        {/* One map, not two (PLAN Phase 8, ADR-007).
            The cells and the eight slide directions used to be two separate pictures of the
            same thing, and reading them together was the author's job. They are now one
            drawing: the 7x7 of cells with the directions on the ring around it, so a slide
            reads as "and keeps going that way" from the square it starts on. The MODEL is
            untouched — `readGrid` / `writeGrid` / `PieceGrid` / `REACH_VALUES` and every
            `data-testid` are exactly as they were, which is what ADR-007 froze. */}
        <div className="move-map">
          <div className="move-grid">
          {GRID_RANGE.map((dr) =>
            GRID_RANGE.map((df) => {
              const centre = df === 0 && dr === 0
              const value = grid.cells[`${df},${dr}`] ?? Cell.None
              if (centre) {
                return (
                  <span key={`${df},${dr}`} className="move-cell" data-centre="true" aria-hidden="true">
                    <MarkBody mark={resolveMark(t, draft as { artKey?: string; iconKey?: string }, { registry: artRegistry, side: 'white', fallback: 'none' })} />
                  </span>
                )
              }
              /*
               * No ghosting, and the reason is worth keeping: the plan expected
               * an empty capture grid and a "first tap silently narrows capture
               * to only here" cliff, and neither exists. An omitted `attack`
               * means captures follow the movement, and `readGrid` PROMOTES every
               * move square to both — so the capture grid already shows the
               * squares this record captures on, truthfully, and a tap ADDS to
               * them rather than replacing them. Drawing a faded copy of the
               * movement axis instead would have made the picture disagree with
               * what a tap does, which is the bug the ghost was invented to
               * prevent.
               */
              const paint = paintAt(grid, moveAxis, df, dr)
              return (
                <button
                  key={`${df},${dr}`}
                  type="button"
                  className="move-cell"
                  data-testid={`piece-cell-${df},${dr}`}
                  /* Scoped to the axis being drawn, so the existing cell-state
                     colours mean "painted for THIS question" rather than showing
                     a movement square as lit while the capture grid is open. */
                  data-value={paint.kind === 'leap' ? moveAxis : Cell.None}
                  data-cells={value}
                  data-paint={paint.kind}
                  data-tip={paint.kind === 'ray' ? paint.tip : false}
                  data-endless={paint.kind === 'ray' ? paint.endless : false}
                  data-ray={rayOf(df, dr)?.dir ?? ''}
                  aria-label={`${df},${dr}`}
                  aria-pressed={paint.kind !== 'none'}
                  onClick={() => commit({ ...editor, grid: cycleAt(grid, moveAxis, df, dr) })}
                />
              )
            }),
          )}
          </div>

        </div>

        {/* What survives the deletion, and why each one had to be moved rather
            than dropped with the container it lived in.

            Both were affordances that existed ONLY inside the block this phase
            removes, which is the exact shape of a recorded loss: `grid.forward`
            sat in the model since ADR-027 with no control on the grid, and
            clear-all vanished with the indexed form and left a shipped piece
            needing twenty-four taps to reset. `piece-use-summary` was the third
            such affordance and is deliberately NOT rehoused — it copied the
            generated movement prose into the record's description, and there is
            no prose to copy once the dex line is gone. That is a decision on the
            record rather than a loss nobody noticed. */}
        <div className="move-tools">
          {/*
            * Clear empties the question ON SCREEN, not both of them.
            *
            * In movement mode that leaves the record with nowhere to walk, which
            * the schema refuses — and it should: `piece-no-moves` appears and the
            * save says so through the same validator, which is a state an author
            * can see and leave. In capture mode it empties only the capture
            * squares, and an empty capture set equals the movement set, so
            * `attack` is omitted and the piece captures wherever it walks again.
            * That is the schema's own default, reached by a control rather than
            * only by never having touched it.
            */}
          <button
            type="button"
            data-testid="piece-clear"
            onClick={() => {
              const keep = moveMode === 'move' ? Cell.Capture : Cell.Move
              const cells: Record<string, Cell> = {}
              for (const [k, v] of Object.entries(grid.cells)) {
                const next = (v & keep) as Cell
                if (next !== Cell.None) cells[k] = next
              }
              const slides = { ...grid.slides }
              for (const d of DIRECTIONS) slides[d] = (slides[d] & keep) as Cell
              const turning =
                moveMode === 'move'
                  ? { ...editor.turning, move: [] }
                  : { ...editor.turning, capture: [] }
              commit({ ...editor, grid: { ...grid, cells, slides }, turning })
            }}
          >
            {t(moveMode === 'move' ? 'ui.editor.piece.clear' : 'ui.editor.piece.clear-capture')}
          </button>

          <label className="grid-forward">
            {t('ui.editor.piece.forward')}
            <input
              type="checkbox"
              data-testid="piece-forward"
              checked={grid.forward}
              onChange={() => commit({ ...editor, grid: { ...grid, forward: !grid.forward } })}
            />
          </label>
          <p className="hint">{t('ui.editor.piece.forward-hint')}</p>
        </div>

        <TurningSlideEditor
          axis={moveMode}
          rows={editor.turning[moveMode]}
          onChange={(rows) =>
            commit({
              ...editor,
              turning: { ...editor.turning, [moveMode]: rows },
            })
          }
          t={t}
        />

        {noMoves && (
          <p className="refusal" data-testid="piece-no-moves">
            {t('ui.editor.piece.no-moves')}
          </p>
        )}
        {noTakes && !noMoves && <p className="hint">{t('ui.editor.piece.no-takes')}</p>}
      </fieldset>
    )
  }

  /** What this card does, as four blocks. See `CardRecipe.tsx`. */
  /**
   * Whether each half of the record can be depicted — asked SEPARATELY.
   *
   * An earlier version OR-ed the two and disabled the save button whenever either
   * was unreadable. Two things killed that. First, a SHIPPED piece in one of the
   * content sets carries two effects, so that piece became uneditable — a
   * functional regression on shipped content, which is exactly what ADR-003's
   * ordering exists to prevent, and which was invisible until the e2e suite ran
   * because the measurement behind it had looked at one content set out of three.
   * (The record is named in `recipe-bundled-coverage.test.ts`, not here: ADR-001
   * keeps content ids out of the UI, and a comment counts.) Second, the
   * save block was never load-bearing: a save writes the DRAFT, and the draft is a
   * faithful clone. The flatten risk comes from an EDITOR rewriting a part it
   * misread — the grid rewrites `movement`, the sentence rewrites `effects` — so
   * suppressing the editor for the unreadable half is sufficient on its own, and
   * byte-stability of that half is what proves it (AC-007's oracle, unchanged).
   *
   * So: each half yields to a read-only description independently, the other half
   * stays editable, and saving stays enabled. A record whose movement cannot be
   * drawn is still a record whose name, art and effects a child may fix.
   */
  const unshowableEffects = EFFECT_BEARING.includes(kind) && readSentence(draft) === null
  /**
   * The movement this screen cannot draw, in words.
   *
   * Not an empty box: the first version reused the effects description here, and
   * for a piece with no effects that rendered a heading over an empty list — the
   * screen claiming to say what the record does and saying nothing. Each pattern
   * is named by its kind and how many squares it names, which is what the grid
   * would have shown.
   */
  function readOnlyMovesView() {
    const patterns = (draft.movement as Draft[] | undefined) ?? []
    return (
      <div className="note-box" data-testid="editor-readonly-moves">
        <strong>{t('ui.editor.readonly.moves-title')}</strong>
        <p>{t('ui.editor.readonly.hint')}</p>
        <ul data-testid="editor-readonly-moves-lines">
          {patterns.map((pattern, i) => (
            <li key={i}>
              {t('ui.editor.readonly.moves-line')
                .replace('{kind}', t(`ui.editor.vocab.movement.${String(pattern.kind)}`))
                .replace('{count}', String(((pattern.vectors as unknown[] | undefined) ?? []).length))}
            </li>
          ))}
        </ul>
      </div>
    )
  }

  /**
   * What the record does, in words, with nothing to edit.
   *
   * Not "this was made in the detailed form" — that named a destination and told
   * the child nothing about what they had opened. Every effect is described
   * through the same formatter the editable sentence uses, so the two cannot say
   * different things about the same effect.
   */
  function readOnlyView() {
    return (
      <div className="note-box" data-testid="editor-readonly">
        <strong>{t('ui.editor.readonly.title')}</strong>
        <p>{t('ui.editor.readonly.hint')}</p>
        <ul data-testid="editor-readonly-lines">
          {describeRecord(t, draft, kind).map((line, i) => (
            <li key={i}>{line}</li>
          ))}
        </ul>
      </div>
    )
  }

  /**
   * What this record does, as one sentence (ADR-001/007).
   *
   * The four-slot `<select>` view this replaces could not say six things the
   * vocabulary contains, which is why a second tab existed. `SentenceEditor` owns
   * the whole grammar; this function owns only the decision to show it, and the
   * refusal when the record is one the sentence cannot depict.
   */
  function recipeView() {
    // Every kind whose schema admits effects, not just the two card kinds
    // (PLAN Phase 3). The four-slot view was gated to `ruleCard | skillCard`,
    // which left `squareType` with NO easy front door at all: a special square's
    // whole content IS its effects, and the only editor it ever had was the
    // indexed palette. `piece` gains the same sentence for the effects it may
    // carry, beside its move grid.
    if (!EFFECT_BEARING.includes(kind)) return null
    // Only THIS half yields. The grid keeps its own answer (`unshowableMoves`),
    // and a record whose effects cannot be drawn is still one whose movement,
    // name and art a child may fix.
    if (unshowableEffects) return readOnlyView()
    return (
      <SentenceEditor draft={draft} kind={kind} ctx={ctx} t={t} pieceLabel={pieceLabel} update={update} />
    )
  }

  // Recomputed on every render, which is every edit. The document is tens of
  // records and the preview already needs a validated set, so the cost is
  // shared rather than added; if it ever shows, debounce the RENDER and never
  // the authority.
  const ready = prepared()
  /**
   * Memoised, and keyed on the RECORD rather than on the document.
   *
   * `validateDraft` clones and revalidates the whole document, so running it on
   * every render is the cost the review flagged. The first attempt at this memo
   * keyed on `JSON.stringify(ready)` — which serialises `ready.base`, the entire
   * content set — and so paid a full document walk per render to avoid a full
   * document walk per render. `ready.next` is one record; `source` changes
   * identity only when the document actually does.
   */
  const recordKey = 'slot' in ready ? '' : JSON.stringify(ready.next)
  const liveErrors = useMemo(
    () => ('slot' in ready ? [] : validateDraft(ready.base, kind, ready.next, openedId ?? undefined)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [source, recordKey, kind, openedId],
  )

  const takePick = (picked: Picked) => {
    setDraft(picked.draft)
    setNameText(picked.name)
    setBodyText(picked.text)
    // Marked as typed so a save writes the words at the COPY's own keys. A
    // remix that left them untyped would save a record pointing at text it
    // never wrote, which renders as a dotted key the moment the source is
    // renamed.
    setNameTyped(picked.name !== '')
    setTextTyped(picked.text !== '')
    setSaved(null)
    setChoosing(false)
    // NOT dirty. Answering "what do you want to start from" is navigation, not
    // an edit — nothing the author typed exists yet, and one click puts any
    // other starting point on screen. Marking it dirty made the shell's
    // discard guard fire on the way OUT: pick "start from nothing", change your
    // mind, click an existing record, and you are asked whether to throw away
    // work you never did. When that prompt is declined the open is refused, so
    // the blank draft stays and the next save fails on an empty `nameKey` —
    // which is how this surfaced, as eleven e2e saves rejecting a record the
    // test thought it had opened.
  }

  return (
    <section className="record-form" data-testid="record-form">
      {choosing && <MakerGallery source={source} kind={kind} t={t} onPick={takePick} hidden={hidden} />}

      <div className="form-body" hidden={choosing}>
      {/* The grade describes the record being edited, so it belongs INSIDE the
          form body: while the gallery is still asking what to start from there
          is no record to grade, and a badge rendered next to that question would
          be scoring the previous answer. */}
      {/* `draft` as well as the saved id: a cost is a pure function of the declaration
          (ADR-012), so the "why does it cost this" answer can follow the author's edits
          instead of waiting for a save that has not happened yet (ADR-009). */}
      <RecordGrade source={source} kind={kind} recordId={openedId} draft={draft as Record<string, unknown>} />
      <label>
        {t('ui.editor.field.name')}
        <input
          data-testid="editor-name"
          value={nameText}
          onChange={(e) => {
            setNameText(e.target.value)
            setNameTyped(true)
            setSaved(null)
            onDirtyChange?.(true)
          }}
        />
      </label>
      {fieldError('nameKey')}

      {HAS_TEXT.includes(kind) && (
        <label>
          {t('ui.editor.field.text')}
          <textarea
            data-testid="editor-text"
            rows={2}
            value={bodyText}
            onChange={(e) => {
              setBodyText(e.target.value)
              setTextTyped(true)
              setSaved(null)
              onDirtyChange?.(true)
            }}
          />
        </label>
      )}
      {HAS_TEXT.includes(kind) && fieldError('textKey')}

      {/* The id stays on the surface while the two KEY fields go under the
          disclosure. It is tempting to hide all three — an id is machinery —
          but the id is also required for a save, so hiding it means a blank
          save fails with an error anchored to a control the child cannot see.
          A hint carries the format instead. */}
      {textField('id', 'editor-id', 'ui.editor.field.id', true, idLocked)}
      <p className="hint">{t('ui.editor.field.id-hint')}</p>

      {/* The `editor-advanced` disclosure and its two raw KEY slots are gone (PLAN
          Phase 7).
          Nothing on this screen has to be opened before it can be used, which is the
          last clause of AC-001.
          What that removes, deliberately: the ability to point a record at a key in
          someone else's namespace by hand. `slotFor` still DERIVES a missing key
          from the id at save time, and the rename path still re-points a record's own
          keys when its id changes — so every key a child can produce is
          `<their id>.name`. Editing a foreign key is now an export/import job, which
          is a maintainer's task and not a child's.
          It also removes the only UI route to an INVALID key, which two tests were
          named after; both now author an invalid `id` instead, because that is a
          field a child can actually type into. */}

      {/* ONE surface (PLAN Phase 6). The tab strip and the two `form-panel`
          wrappers are gone; every control they held renders unconditionally, in a
          deliberate order — picture, then what the record DOES, then the small
          scalars, then the per-kind machinery, then the errors and the save.

          The wrappers were not the effects palette's container. `form-panel-expert`
          also held `royal`, `promotion`, the indexed movement editor, the `attack`
          grid, the whole board painter and the room controls — and for `board` and
          `preset` it was never hidden, so it WAS their only surface. Unwrapping it
          therefore deletes nothing; PLAN Phase 7 does the deleting, and its scope
          names these five explicitly as things it must NOT touch.

          ADR-030's "two windows onto one draft" is retired by construction rather
          than by argument: there is one window now, so nothing can drift. */}
      {/* The three anchors (PLAN Phase 8). On a 390x844 phone this form is several
          screens tall, so what the child is making, why they cannot save, and the
          save itself have to stay reachable from anywhere in it.

          Sticky resolves against the nearest scrolling ancestor, which is `.editor`
          (`overflow-y: auto`). `.phone`'s `overflow: hidden` sits OUTSIDE that, so it
          is not the scrollport here — the arrangement that produced
          `[fail:render] sticky-inert-under-overflow-ancestor` was the other way
          round, with the unwanted scrollport nearer than the intended one. */}
      <div className="form-summary" data-testid="form-summary">
        <span className="kicker">{t('ui.editor.form.summary')}</span>
        <p data-testid="form-summary-text">{summaryLine()}</p>
      </div>

        {artPicker()}
        {pieceGridView()}
        {recipeView()}

        {/* Small scalars a child changes on purpose, not schema machinery. How
            many times a skill card can be used is the second question anyone
            asks about one; it was in the expert panel only because of where the
            panel boundary happened to fall, which the e2e suite caught and jsdom
            could not — `fireEvent` ignores visibility, Playwright does not. */}
        {kind === 'skillCard' &&
          numberField('editor-uses', 'ui.editor.field.uses', draft.uses, (n) =>
            update((d) => {
              d.uses = n ?? 1
            }),
          )}

        {kind === 'skillCard' && (
          <label>
            {t('ui.editor.field.royal-follow-up')}
            <select
              data-testid="editor-royal-follow-up"
              value={draft.royalFollowUp === 'preserve-existing' ? 'preserve-existing' : 'preserve'}
              onChange={(e) => update((d) => { d.royalFollowUp = e.target.value })}
            >
              <option value="preserve">{t('ui.editor.royal-follow-up.preserve')}</option>
              <option value="preserve-existing">{t('ui.editor.royal-follow-up.preserve-existing')}</option>
            </select>
          </label>
        )}

        {kind === 'skillCard' && (
          <label>
            {t('ui.editor.field.protect-relocated')}
            <input
              type="checkbox"
              data-testid="editor-protect-relocated"
              checked={draft.protectRelocatedAfterPlay === true}
              onChange={() => update((d) => { d.protectRelocatedAfterPlay = d.protectRelocatedAfterPlay !== true })}
            />
          </label>
        )}

        {/*
          v12's relocation lock needs its own control for the same reason the one
          above has one: a schema field an author cannot set is a field that only
          bundled content can ever use, which is the declared-but-inert shape one
          layer up. This sits beside its sibling rather than opening a new
          surface — the PLAN's non-goal is a redesign, not a checkbox.
        */}
        {kind === 'skillCard' && (
          <label>
            {t('ui.editor.field.lock-relocated')}
            <input
              type="checkbox"
              data-testid="editor-lock-relocated"
              checked={draft.lockRelocatedAfterPlay === true}
              onChange={() => update((d) => { d.lockRelocatedAfterPlay = d.lockRelocatedAfterPlay !== true })}
            />
          </label>
        )}

        {kind === 'squareType' && (
          <label>
            {t('ui.editor.field.paired')}
            <input
              type="checkbox"
              data-testid="editor-paired"
              checked={draft.paired === true}
              onChange={() =>
                update((d) => {
                  d.paired = d.paired !== true
                })
              }
            />
          </label>
        )}

      {/* The `cost` control is gone as of schema v8. It let an author type their
          own balance number, which nothing ever read — and a number the author
          picks could never have been the objective index the grade needs to be.
          A record's strength is now measured (ADR-002) and recomputed rather
          than stored (ADR-007), so there is nothing here for a form to collect.
          The field stays optional in the schema so older documents still load. */}



      {/* The indexed effects palette is GONE (PLAN Phase 7): the effect index
          cursor, the action index cursor, the five palettes and their parameter
          blocks. Everything it authored is in the sentence, which the ADR-006
          gate now measures directly — and the shape it authored that nothing
          uses, a record with several effects, falls to the read-only path rather
          than to a second form. */}

      {kind === 'piece' && (
        <>
          <label>
            {t('ui.editor.field.royal')}
            <input
              type="checkbox"
              data-testid="editor-royal"
              checked={draft.royal === true}
              onChange={() =>
                update((d) => {
                  if (d.royal === true) delete d.royal
                  else d.royal = true
                })
              }
            />
          </label>
          <label>
            {t('ui.editor.field.promotion-rank')}
            <input
              data-testid="editor-promotion-onRank"
              value={String((draft.promotion as Draft | undefined)?.onRank ?? '')}
              onChange={(e) =>
                update((d) => {
                  const raw = e.target.value
                  if (raw === '') {
                    delete d.promotion
                    return
                  }
                  const existingTo = (d.promotion as Draft | undefined)?.to
                  d.promotion = {
                    onRank: raw === 'last' ? 'last' : Number(raw),
                    to: existingTo ?? ctx.pieceIds[0] ?? '',
                  }
                })
              }
            />
          </label>
          <label>
            {t('ui.editor.field.promotion-to')}
            <select
              data-testid="editor-promotion-to"
              value={String((draft.promotion as Draft | undefined)?.to ?? '')}
              onChange={(e) =>
                update((d) => {
                  const p = (d.promotion as Draft | undefined) ?? { onRank: 'last' }
                  p.to = e.target.value
                  d.promotion = p
                })
              }
            >
              <option value="">{t('ui.editor.board.none')}</option>
              {ctx.pieceIds.map((id) => (
                <option key={id} value={id}>
                  {pieceLabel(id)}
                </option>
              ))}
            </select>
          </label>

          {/* The indexed pattern editor is GONE (PLAN Phase 7). It was the only
              control that could author a `jump`, a second pattern with its own
              reach cap, or a per-pattern `forward` — and each of those was either
              retired (ADR-006) or moved onto the grid, where the model already
              held it. `fieldError('movement')` moves to the grid, which is now the
              only thing that writes `movement`. */}
        </>
      )}

      {kind === 'board' && (
        <fieldset>
          <legend>{t('ui.editor.kind.board')}</legend>
          {numberField('board-width', 'ui.editor.board.width', draft.width, (n) =>
            update((d) => {
              d.width = n ?? 6
            }),
          )}
          {numberField('board-height', 'ui.editor.board.height', draft.height, (n) =>
            update((d) => {
              d.height = n ?? 6
            }),
          )}
          {numberField('board-territory-depth', 'ui.editor.board.territory-depth', draft.territoryDepth, (n) =>
            update((d) => {
              d.territoryDepth = n ?? 1
            }),
          )}
          {numberField('board-promotion-depth', 'ui.editor.board.promotion-depth', draft.promotionDepth, (n) =>
            update((d) => {
              d.promotionDepth = n ?? 1
            }),
          )}
          {/* Two modes rather than two buttons per square, matching the room's
              own two steps. The painter itself is the room's — see
              `PlacementPainter`'s header for why its ids are prefixed here. */}
          <div className="build-steps" data-testid="board-modes">
            {(['place', 'paint'] as const).map((m) => (
              <button
                key={m}
                type="button"
                data-testid={`board-mode-${m}`}
                data-selected={boardMode === m}
                aria-pressed={boardMode === m}
                onClick={() => setBoardMode(m)}
              >
                {t(`ui.editor.step.${m === 'place' ? 'place' : 'board'}`)}
              </button>
            ))}
          </div>

          {boardMode === 'paint' ? (
            <PlacementPainter
              mode="paint"
              testIdPrefix="board-"
              width={Number(draft.width ?? 6)}
              height={Number(draft.height ?? 6)}
              hint={t('ui.editor.step.board-hint')}
              t={t}
              cellOf={(square) => {
                const hit = ((draft.squares as Draft[] | undefined) ?? []).find((s) => s.square === square)
                return {
                  mark: hit ? markOfRecord('squareTypes', String(hit.typeId)) : null,
                  painted: Boolean(hit),
                  arming: pendingPair === square,
                }
              }}
              onSquare={paint}
              paletteHeading={t('ui.editor.paint.palette')}
              includeErase
              palette={named(source.squareTypes).map(([id, nameKey]) => ({
                id,
                label: recordLabel(t, 'squareType', id, nameKey),
                mark: markOfRecord('squareTypes', id),
              }))}
              selected={paintType}
              onSelect={(id) => {
                setPaintType(id)
                setPendingPair(null)
                setPairHint(false)
              }}
              afterGrid={pairHint && <p data-testid="editor-pair-hint">{t('ui.editor.board.pair-hint')}</p>}
            />
          ) : (
            <PlacementPainter
              mode="place"
              testIdPrefix="board-"
              width={Number(draft.width ?? 6)}
              height={Number(draft.height ?? 6)}
              hint={t('ui.editor.step.place-hint')}
              t={t}
              cellOf={(square) => {
                const here = ((draft.placements as Draft[] | undefined) ?? []).find((p) => p.square === square)
                const hit = ((draft.squares as Draft[] | undefined) ?? []).find((s) => s.square === square)
                return {
                  mark: here
                    ? markOfRecord('pieces', String(here.pieceId), here.side as 'white' | 'black')
                    : hit
                      ? markOfRecord('squareTypes', String(hit.typeId))
                      : null,
                  painted: Boolean(hit),
                  side: (here?.side as 'white' | 'black' | undefined) ?? '',
                }
              }}
              onSquare={place}
              side={placeSide}
              onSide={setPlaceSide}
              counts={{
                white: ((draft.placements as Draft[] | undefined) ?? []).filter((p) => p.side === 'white').length,
                black: ((draft.placements as Draft[] | undefined) ?? []).filter((p) => p.side === 'black').length,
              }}
              /* Every piece the source has, not a room's subset — a board record
                 stands alone and has no room to scope by (ADR-004). */
              palette={ctx.pieceIds.map((id) => ({
                id,
                label: pieceLabel(id),
                mark: markOfRecord('pieces', id, placeSide),
              }))}
              selected={placePiece}
              onSelect={setPlacePiece}
              onClear={() =>
                update((d) => {
                  d.placements = []
                })
              }
            />
          )}
        </fieldset>
      )}

      {kind === 'preset' && (
        <fieldset>
          <legend>{t('ui.editor.kind.preset')}</legend>
          <label>
            {t('ui.editor.room.board')}
            <select
              data-testid="preset-board"
              value={String(draft.boardId ?? '')}
              onChange={(e) =>
                update((d) => {
                  d.boardId = e.target.value
                })
              }
            >
              <option value="">{t('ui.editor.board.none')}</option>
              {named(source.boards).map(([id, nameKey]) => (
                <option key={id} value={id}>
                  {recordLabel(t, 'board', id, nameKey)}
                </option>
              ))}
            </select>
            {fieldError('boardId')}
          </label>
          {checkboxList('pieceIds', 'piece', 'ui.editor.room.pieces', 'preset-piece', named(source.pieces))}
          {checkboxList('ruleCardIds', 'ruleCard', 'ui.editor.room.rules', 'preset-rule', named(source.ruleCards))}
          {checkboxList('skillCardIds', 'skillCard', 'ui.editor.room.skills', 'preset-skill', named(source.skillCards))}
        </fieldset>
      )}

      {/* Why you cannot save, next to the save (PLAN Phase 8). They were three
          separate places in the flow — an error list near the top, the button at the
          bottom — which on a tall form meant scrolling between the refusal and the
          control it refuses. One bar, pinned. */}
      <div className="form-actions" data-testid="form-actions">
        {liveErrors.length > 0 && (
          <ul className="refusal" data-testid="editor-live-errors">
            {liveErrors.map((e) => (
              <li key={`${e.path}:${e.message}`}>{e.message}</li>
            ))}
          </ul>
        )}

        {subjectDeleted && (
          <p className="refusal" data-testid="editor-deleted-notice">
            {t('ui.editor.form.deleted')}
          </p>
        )}

        <button type="button" data-testid="editor-save" onClick={save} disabled={subjectDeleted}>
          {t('ui.editor.form.save')}
        </button>
        {saved && <p data-testid="editor-saved">{t('ui.editor.form.saved')}</p>}
      </div>

      {/* The draft's raw JSON stays in the DOM and off the screen (#19).
          A child reading `{"movement":[{"kind":"step"...` learns nothing and is
          told, wrongly, that the format is the point. It is not deleted because
          the ADR-006 vocabulary-coverage gate reads exactly this node to prove
          each control wrote its own value — deleting it would trade a real CI
          guard for a cosmetic one. `hidden` is what makes the two claims the
          same claim rather than a contradiction. */}
      <pre hidden data-testid="editor-draft-json">{JSON.stringify(draft)}</pre>
      </div>
    </section>
  )
}
