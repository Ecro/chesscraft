import { useMemo, useState } from 'react'
import type { ContentSource, ValidationError } from '@content/load'
import { type DraftKind, commitDraft, openDraft } from '@editor/draft'
import { clearString, deriveKey, rekeyStrings, writeString } from '@editor/strings'
import { type RecordSnapshot, sameSnapshot, snapshotOf } from './RecordForm'
import { namedRecords, recordLabel } from './recordLabel'
import { DEFAULT_LOCALE, makeTranslate, useTranslate } from './i18n'

/**
 * One room, open (PLAN Phase 9a).
 *
 * A room is a `preset` — a board, the pieces in play, and the two pools the
 * rule draw and the skill drafts come from. The library can still edit one as a
 * flat record; this screen is the same data said in the product's own words,
 * because "assemble a room, name it, keep several, play one" is the axis the
 * whole editor is supposed to sit on and a six-kind picker never says it.
 *
 * Two guards live here rather than in the schema, and both exist because the
 * validator's version of the message is unusable by the person who will hit it:
 *
 * - **A room cannot lose its last piece.** `pieceIds` carries `.min(1)`, so an
 *   empty room is a document that will not load. The form refuses the untick
 *   itself, BEFORE the save, and says why in words — `pieceIds: array must
 *   contain at least 1 element` arrives after the fact and names a field the
 *   child has never seen.
 * - **A new room is seeded, not blank.** Same `.min(1)`: a room created empty
 *   is a room that cannot be saved, so creation picks the first board and the
 *   first piece. The child then changes them, which is a different experience
 *   from being told their brand-new room is invalid.
 */

const MAX_SEEDED_ROOMS = 999

/**
 * A free id for a new room.
 *
 * Derived, not typed. The child names the room in Korean and the name lives in
 * the `strings` overlay (ADR-020); the id is machinery, and asking a
 * nine-year-old to invent a unique dotted ASCII token is asking them to do the
 * schema's job. Counting up from 1 rather than using a timestamp keeps it
 * short, readable in an export, and stable enough to talk about.
 */
export function nextRoomId(source: ContentSource): string {
  const taken = new Set(source.presets.map((p) => String((p as { id?: unknown }).id ?? '')))
  for (let n = 1; n <= MAX_SEEDED_ROOMS; n += 1) {
    const id = `preset.room-${n}`
    if (!taken.has(id)) return id
  }
  // Unreachable in practice; a collision-free fallback beats an infinite loop.
  return `preset.room-${MAX_SEEDED_ROOMS + 1}`
}

type Draft = Record<string, unknown>

function seedRoom(source: ContentSource): Draft {
  const firstBoard = String((source.boards[0] as { id?: unknown } | undefined)?.id ?? '')
  const firstPiece = String((source.pieces[0] as { id?: unknown } | undefined)?.id ?? '')
  const id = nextRoomId(source)
  return {
    id,
    nameKey: deriveKey(id, 'name'),
    boardId: firstBoard,
    // Seeded rather than empty — see the note on `.min(1)` above. An empty
    // array here is a room the child cannot save and was never warned about.
    pieceIds: firstPiece === '' ? [] : [firstPiece],
    ruleCardIds: [],
    skillCardIds: [],
  }
}

export function RoomDetail({
  source,
  roomId,
  commit,
  onBack,
  onCreateRecord,
}: {
  source: ContentSource
  /** The room being edited, or null to create one. */
  roomId: string | null
  commit: (next: ContentSource) => void
  onBack: () => void
  onCreateRecord: (kind: DraftKind) => void
}) {
  const t = useTranslate()

  const [draft, setDraft] = useState<Draft>(
    () => (roomId ? (openDraft(source, 'preset', roomId) ?? seedRoom(source)) : seedRoom(source)),
  )
  const [openedId, setOpenedId] = useState<string | null>(roomId)
  // The room as it looked when this screen opened — see the long note on
  // `openedSnapshot` in `RecordForm`. Identical hazard, identical guard: a room
  // stays mounted across an import, and its save would otherwise overwrite the
  // imported room of the same id with a draft from the previous document.
  const [openedSnapshot, setOpenedSnapshot] = useState<RecordSnapshot>(() => snapshotOf(source, 'preset', roomId))
  const [nameText, setNameText] = useState(openedSnapshot.name)
  // Same rule as `RecordForm`: only a field the author typed in is written,
  // and clearing one means dropping the overlay entry rather than storing an
  // empty string the schema refuses.
  const [nameTyped, setNameTyped] = useState(false)
  const [errors, setErrors] = useState<ValidationError[]>([])
  const [saved, setSaved] = useState(false)
  const [lastPieceRefused, setLastPieceRefused] = useState(false)

  const pieces = useMemo(() => namedRecords(source.pieces), [source])
  const rules = useMemo(() => namedRecords(source.ruleCards), [source])
  const skills = useMemo(() => namedRecords(source.skillCards), [source])
  const boards = useMemo(() => namedRecords(source.boards), [source])

  const list = (field: string): string[] => (draft[field] as string[] | undefined) ?? []

  const update = (mutate: (d: Draft) => void) => {
    setDraft((prev) => {
      const next = structuredClone(prev)
      mutate(next)
      return next
    })
    setSaved(false)
  }

  const toggle = (field: string, id: string) => {
    // The refusal is checked BEFORE the mutation, and it clears on any other
    // change: a notice that stays up after the child has fixed the situation
    // teaches them to ignore notices.
    if (field === 'pieceIds' && list(field).length === 1 && list(field)[0] === id) {
      setLastPieceRefused(true)
      return
    }
    setLastPieceRefused(false)
    update((d) => {
      const current = (d[field] as string[] | undefined) ?? []
      const at = current.indexOf(id)
      if (at >= 0) current.splice(at, 1)
      else current.push(id)
      d[field] = current
    })
  }

  /**
   * The tick-list, plus a row for anything this draft holds that the document
   * no longer does.
   *
   * Those rows are the point. The lists are built from the current `source`, and
   * this screen stays mounted while the library deletes things — so a record
   * ticked here but not yet SAVED could be deleted underneath (no committed room
   * references it, so the delete is correct), and the id stayed in the draft with
   * no checkbox left to untick it. The save then failed validation and the only
   * way out was to abandon the room. A row that exists purely to be unticked is
   * what turns that dead end back into a decision.
   */
  const tickList = (field: string, legendKey: string, prefix: string, entries: Array<[string, unknown]>) => {
    const present = new Set(entries.map(([id]) => id))
    const vanished = list(field).filter((id) => !present.has(id))
    return (
      <fieldset>
        <legend>{t(legendKey)}</legend>
        {entries.map(([id, nameKey]) => (
          <label key={id}>
            <input
              type="checkbox"
              data-testid={`${prefix}-${id}`}
              checked={list(field).includes(id)}
              onChange={() => toggle(field, id)}
            />
            {recordLabel(t, id, nameKey)}
          </label>
        ))}
        {vanished.map((id) => (
          <label key={id} className="vanished">
            <input
              type="checkbox"
              data-testid={`${prefix}-${id}`}
              checked
              onChange={() => toggle(field, id)}
            />
            {`${id} (${t('ui.editor.room.missing-entry')})`}
          </label>
        ))}
        {entries.length === 0 && vanished.length === 0 && <p className="empty">{t('ui.editor.library.empty')}</p>}
      </fieldset>
    )
  }

  /**
   * Saves the room and folds the typed name into the document's overlay.
   *
   * Same order as `RecordForm.save`, for the same reason: the record's own
   * `nameKey` is re-derived first if the id moved, then the overlay is re-keyed,
   * then the new text is written — so the name lands on the key the room now
   * points at. A room reached through this screen never changes its own id
   * today, but the room is also editable as a flat record in the library, and
   * the two paths must not disagree about what a rename means.
   */
  /** This room is no longer in the document — deleted, from here or the library. */
  const roomDeleted = openedId !== null && openDraft(source, 'preset', openedId) === null

  const save = () => {
    if (roomDeleted) {
      setErrors([{ contentId: openedId ?? '', path: '', message: t('ui.editor.room.deleted') }])
      setSaved(false)
      return
    }
    if (openedId !== null && !sameSnapshot(snapshotOf(source, 'preset', openedId), openedSnapshot)) {
      setErrors([{ contentId: openedId, path: '', message: t('ui.editor.form.stale') }])
      setSaved(false)
      return
    }

    const next = structuredClone(draft)
    const id = String(next.id ?? '')
    const renaming = openedId !== null && id !== '' && id !== openedId

    if (renaming && typeof next.nameKey === 'string' && next.nameKey.startsWith(`${openedId}.`)) {
      next.nameKey = `${id}${next.nameKey.slice(openedId!.length)}`
    }

    let strings = renaming ? rekeyStrings(source.strings, openedId!, id) : source.strings
    if (id !== '' && nameTyped) {
      // The room's own key when it has one — same rule as `RecordForm`'s
      // `slotFor`, and for the same reason: a shipped room's name is keyed
      // `preset.slice.name`, and overriding THAT key is what renaming means.
      const existing = next.nameKey
      const key = typeof existing === 'string' && existing !== '' ? existing : deriveKey(id, 'name')
      const value = nameText.trim()
      if (value === '' && makeTranslate()(key) === key) {
        // A room with no name is a blank entry in Home's picker — the one
        // control the whole product funnels through. Refusing beats shipping it.
        setErrors([{ contentId: id, path: 'nameKey', message: t('ui.editor.form.name-needed') }])
        setSaved(false)
        return
      }
      next.nameKey = key
      strings = value === '' ? clearString(strings, DEFAULT_LOCALE, key) : writeString(strings, DEFAULT_LOCALE, key, value)
    }
    // Narrowed rather than spread blindly: `strings` is exactly-optional, so a
    // document with `strings: undefined` is a DIFFERENT document from one that
    // omits the field, and the schema tells the two apart.
    const base = strings !== undefined && strings !== source.strings ? { ...source, strings } : source

    const result = commitDraft(base, 'preset', next, openedId ?? undefined)
    if (!result.ok) {
      setErrors(result.errors)
      setSaved(false)
      return
    }
    setErrors([])
    setDraft(next)
    setOpenedId(id)
    setOpenedSnapshot(snapshotOf(result.source, 'preset', id))
    setNameTyped(false)
    setSaved(true)
    commit(result.source)
  }

  return (
    <section className="room-detail" data-testid="room-detail">
      <button type="button" data-testid="room-back" onClick={onBack}>
        {t('ui.editor.room.back')}
      </button>

      <label>
        {t('ui.editor.room.name')}
        <input
          data-testid="room-name"
          value={nameText}
          onChange={(e) => {
            setNameText(e.target.value)
            setNameTyped(true)
            setSaved(false)
          }}
        />
      </label>
      <p className="hint">{t('ui.editor.room.name-hint')}</p>

      <label>
        {t('ui.editor.room.board')}
        <select
          data-testid="room-board"
          value={String(draft.boardId ?? '')}
          onChange={(e) =>
            update((d) => {
              d.boardId = e.target.value
            })
          }
        >
          <option value="">{t('ui.editor.board.none')}</option>
          {boards.map(([id, nameKey]) => (
            <option key={id} value={id}>
              {recordLabel(t, id, nameKey)}
            </option>
          ))}
        </select>
      </label>

      {tickList('pieceIds', 'ui.editor.room.pieces', 'room-piece', pieces)}
      {lastPieceRefused && <p data-testid="room-last-piece-notice">{t('ui.editor.room.last-piece')}</p>}
      <button type="button" data-testid="room-new-piece" onClick={() => onCreateRecord('piece')}>
        {t('ui.editor.room.new-piece')}
      </button>

      {tickList('ruleCardIds', 'ui.editor.room.rules', 'room-rule', rules)}
      <button type="button" data-testid="room-new-rule" onClick={() => onCreateRecord('ruleCard')}>
        {t('ui.editor.room.new-rule')}
      </button>

      {tickList('skillCardIds', 'ui.editor.room.skills', 'room-skill', skills)}
      <button type="button" data-testid="room-new-skill" onClick={() => onCreateRecord('skillCard')}>
        {t('ui.editor.room.new-skill')}
      </button>

      {roomDeleted && (
        <p className="refusal" data-testid="room-deleted-notice">
          {t('ui.editor.room.deleted')}
        </p>
      )}

      <button
        type="button"
        className="primary"
        data-testid="room-save"
        onClick={save}
        disabled={roomDeleted}
      >
        {t('ui.editor.room.save')}
      </button>
      {saved && <p data-testid="room-saved">{t('ui.editor.room.saved')}</p>}

      {errors.length > 0 && (
        <ul data-testid="room-errors">
          {errors.map((e, i) => (
            <li key={`${e.path}-${i}`}>{e.message}</li>
          ))}
        </ul>
      )}
    </section>
  )
}
