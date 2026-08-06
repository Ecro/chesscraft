import { useMemo, useState } from 'react'
import type { ContentSource, ValidationError } from '@content/load'
import { type DraftKind, EDITABLE_KINDS, deleteRecord } from '@editor/draft'
import { isOrphaned } from '@editor/references'
import { RecordForm } from './RecordForm'
import { deleteRefusal } from './deleteMessage'
import { namedRecords, recordLabel } from './recordLabel'
import { useTranslate } from './i18n'

/**
 * The library tab: everything the author has made, browsable by kind.
 *
 * This is the editor's OLD front door, demoted (ADR-019). Six flat record
 * kinds behind a picker was the whole editor, which is why nothing in the
 * product ever said what a room was — the one record kind that IS the product's
 * unit sat in the list as `preset`, between `board` and nothing.
 *
 * Browse → detail: the list on the left of the form, the form below it, both on
 * screen at once. A record is opened by remounting `RecordForm` under a new
 * `key`, so a half-typed draft can never bleed from one record into the next —
 * the failure `openDraft`'s clone comment describes, one level up.
 *
 * The badge is ADR-026's black-hole guard. Content is shared across rooms and a
 * record can therefore belong to none, which is a perfectly legal state and an
 * invisible one: the child made a piece, no room uses it, and nothing anywhere
 * would ever mention it again. `isOrphaned` walks the same transitive path 9b's
 * delete guard walks, from the same module, so "unused" and "safe to delete"
 * cannot come apart.
 */

const COLLECTION_OF: Record<DraftKind, keyof ContentSource> = {
  piece: 'pieces',
  squareType: 'squareTypes',
  ruleCard: 'ruleCards',
  skillCard: 'skillCards',
  board: 'boards',
  preset: 'presets',
}

/**
 * Which record the form holds.
 *
 * `seq` is what makes "open the record I already have open" a real reset:
 * without it, clicking a record twice after typing into the form would remount
 * nothing and the typing would survive as if it had been saved.
 */
export interface LibraryOpen {
  kind: DraftKind
  id: string | null
  seq: number
}

export function EditorLibrary({
  source,
  open,
  onOpen,
  onDirtyChange,
  commit,
  errors,
  setErrors,
}: {
  source: ContentSource
  /** Controlled by the shell, so a room's "make a new record" button can steer it. */
  open: LibraryOpen
  /** Returns false when the shell refused — the author declined to discard unsaved work. */
  onOpen: (kind: DraftKind, id: string | null, force?: boolean) => boolean
  /** Whether the open form holds unsaved work. Both directions: an edit sets it, a save clears it. */
  onDirtyChange: (dirty: boolean) => void
  commit: (next: ContentSource) => void
  errors: ValidationError[]
  setErrors: (errors: ValidationError[]) => void
}) {
  const t = useTranslate()
  /**
   * The id `RecordForm` actually holds.
   *
   * The shell cannot derive it — a save made inside the form moves that id (a new
   * record acquires one, a rename changes it) while `open.id` is set only by
   * navigation. It is stamped with the `seq` it was reported under, so a later
   * navigation makes the stale report fall away by itself rather than needing to
   * be cleared: a report from a previous form instance simply no longer matches.
   */
  const [reported, setReported] = useState<{ seq: number; id: string | null } | null>(null)
  const formHolds = reported !== null && reported.seq === open.seq ? reported.id : open.id
  /**
   * WHAT was refused, not the sentence that was produced.
   *
   * A stored sentence is a fact frozen at the moment it was true, and both
   * panels stay mounted — so freeing the record in the Rooms tab left the
   * library still naming a room that had let go. Storing the subject and
   * re-deriving the message each render means the refusal disappears exactly
   * when it stops being true, with nothing to remember to clear.
   */
  const [refusedSubject, setRefusedSubject] = useState<{ kind: DraftKind; id: string } | null>(null)
  const refusal = useMemo(() => {
    if (refusedSubject === null) return null
    const check = deleteRecord(source, refusedSubject.kind, refusedSubject.id)
    return check.ok ? null : deleteRefusal(t, source, check)
  }, [refusedSubject, source, t])

  const entries = namedRecords(source[COLLECTION_OF[open.kind]] as unknown[])

  const openRecord = (kind: DraftKind, id: string | null) => {
    // Errors are cleared only if the navigation actually happened; a refused
    // one leaves the author exactly where they were, message and all.
    if (onOpen(kind, id)) {
      setErrors([])
      setRefusedSubject(null)
    }
  }

  /**
   * Deletes a record, or says which room is holding it.
   *
   * Same confirm as the room list, and the same refusal wording, because the
   * two panels are describing one rule. When the deleted record is the one the
   * form is showing, the form is sent back to a blank draft — leaving it open on
   * something the document no longer contains would let the next save push it
   * straight back in.
   */
  const remove = (id: string, label: string) => {
    setRefusedSubject(null)
    if (!window.confirm(`${label} — ${t('ui.editor.delete.confirm')}`)) return
    const result = deleteRecord(source, open.kind, id)
    if (!result.ok) {
      setRefusedSubject({ kind: open.kind, id })
      return
    }
    // Closed BEFORE the commit and WITHOUT asking. Two bugs are being replaced
    // here, and they are the two halves of one cluster. First: `onOpen` can
    // REFUSE — it asks about discarding unsaved work — and its answer was being
    // ignored, so "yes, delete" followed by "no, keep my edits" deleted the
    // record and left the form sitting on it. A form whose record is being
    // deleted has nothing left to discard, so the dirty flag is dropped first
    // and the question never gets asked. Second: what decides is the id the FORM
    // holds, not the shell's `open.id`, which a save made inside the form leaves
    // behind — that lag is why deleting a just-created record left the form open
    // on a phantom.
    if (formHolds === id) {
      onOpen(open.kind, null, true)
      setReported(null)
    }
    commit(result.source)
  }

  return (
    <section className="library" data-testid="editor-library">
      <h2>{t('ui.editor.library.title')}</h2>
      <p className="intro">{t('ui.editor.library.intro')}</p>

      <label>
        {t('ui.editor.library.kind')}
        <select
          data-testid="editor-kind"
          value={open.kind}
          onChange={(e) => openRecord(e.target.value as DraftKind, null)}
        >
          {EDITABLE_KINDS.map((k) => (
            <option key={k} value={k}>
              {t(`ui.editor.kind.${k}`)}
            </option>
          ))}
        </select>
      </label>

      <ul className="library-list" data-testid="library-list">
        {entries.map(([id, nameKey]) => (
          <li key={id}>
            <button
              type="button"
              data-testid={`library-open-${id}`}
              data-selected={id === open.id}
              onClick={() => openRecord(open.kind, id)}
            >
              {recordLabel(t, id, nameKey)}
            </button>
            {isOrphaned(source, open.kind, id) && (
              <span className="badge" data-testid={`library-unused-${id}`}>
                {t('ui.editor.library.unused')}
              </span>
            )}
            <button
              type="button"
              className="danger"
              data-testid={`library-delete-${id}`}
              onClick={() => remove(id, recordLabel(t, id, nameKey))}
            >
              {t('ui.editor.delete.label')}
            </button>
          </li>
        ))}
        {entries.length === 0 && <li className="empty">{t('ui.editor.library.empty')}</li>}
      </ul>

      {refusal !== null && (
        <p className="refusal" data-testid="library-delete-refusal">
          {refusal}
        </p>
      )}

      <button type="button" data-testid="editor-new" onClick={() => openRecord(open.kind, null)}>
        {t('ui.editor.form.new')}
      </button>

      <RecordForm
        key={`${open.kind}:${open.id ?? ''}:${open.seq}`}
        source={source}
        kind={open.kind}
        initialId={open.id}
        commit={commit}
        onDirtyChange={onDirtyChange}
        onOpenedIdChange={(id) => setReported({ seq: open.seq, id })}
        errors={errors}
        setErrors={setErrors}
      />
    </section>
  )
}
