import { useMemo, useState } from 'react'
import type { ContentSource } from '@content/load'
import { type DraftKind, deleteRecord } from '@editor/draft'
import { RoomDetail } from './RoomDetail'
import { deleteRefusal } from './deleteMessage'
import { namedRecords, recordLabel } from './recordLabel'
import { useTranslate } from './i18n'

/**
 * The editor's front door: the rooms the child has made (PLAN Phase 9a).
 *
 * `preset` was the sixth entry in a record-kind picker, which is why nothing in
 * the product ever said what the unit of authoring is. It is a room: a board,
 * the pieces in it, and the card pools it draws from — the thing you assemble,
 * name, keep several of, and pick one of to play. This screen is that sentence
 * made into a screen.
 *
 * Opening a room remounts `RoomDetail` under a new `key` rather than syncing
 * props into state, so a half-edited room can never bleed into the next one.
 */
export function EditorRooms({
  source,
  commit,
  onCreateRecord,
}: {
  source: ContentSource
  commit: (next: ContentSource) => void
  /** Hands the child off to the library's form to author a new record. */
  onCreateRecord: (kind: DraftKind) => void
}) {
  const t = useTranslate()
  // `'new'` rather than a boolean beside an id: the two states are exclusive and
  // a boolean would let both be true.
  const [open, setOpen] = useState<{ id: string | null; seq: number } | null>(null)
  // The SUBJECT of the refusal, not the sentence — re-derived every render, so
  // it disappears the moment it stops being true. Same reason as the library's.
  const [refusedId, setRefusedId] = useState<string | null>(null)
  const refusal = useMemo(() => {
    if (refusedId === null) return null
    const check = deleteRecord(source, 'preset', refusedId)
    return check.ok ? null : deleteRefusal(t, source, check)
  }, [refusedId, source, t])

  /**
   * Deletes a room, or says which rule stopped it.
   *
   * Confirmed rather than undoable — undo is explicitly out of scope this cycle
   * — so the confirm is the only thing standing between a tap and a room that
   * is gone. `window.confirm` is what this app already uses for its other two
   * destructive moves (leaving a match, discarding a draft), and a third,
   * different-looking confirmation would teach the child that some of them mean
   * less than others.
   */
  const remove = (id: string, label: string) => {
    setRefusedId(null)
    if (!window.confirm(`${label} — ${t('ui.editor.delete.confirm')}`)) return
    const result = deleteRecord(source, 'preset', id)
    if (!result.ok) {
      setRefusedId(id)
      return
    }
    commit(result.source)
  }

  const rooms = namedRecords(source.presets)

  if (open !== null) {
    return (
      <RoomDetail
        key={`${open.id ?? 'new'}:${open.seq}`}
        source={source}
        roomId={open.id}
        commit={commit}
        onBack={() => setOpen(null)}
        onCreateRecord={onCreateRecord}
      />
    )
  }

  return (
    <section className="rooms" data-testid="editor-rooms">
      <h2>{t('ui.editor.rooms.title')}</h2>
      <p className="intro">{t('ui.editor.rooms.intro')}</p>

      <ul className="room-list" data-testid="room-list">
        {rooms.map(([id, nameKey]) => (
          <li key={id}>
            <button
              type="button"
              data-testid={`room-open-${id}`}
              onClick={() => setOpen((prev) => ({ id, seq: (prev?.seq ?? 0) + 1 }))}
            >
              {recordLabel(t, id, nameKey)}
            </button>
            <button
              type="button"
              className="danger"
              data-testid={`room-delete-${id}`}
              onClick={() => remove(id, recordLabel(t, id, nameKey))}
            >
              {t('ui.editor.delete.label')}
            </button>
          </li>
        ))}
        {rooms.length === 0 && <li className="empty">{t('ui.editor.rooms.empty')}</li>}
      </ul>

      {refusal !== null && (
        <p className="refusal" data-testid="room-delete-refusal">
          {refusal}
        </p>
      )}

      <button
        type="button"
        className="primary"
        data-testid="room-new"
        onClick={() => setOpen((prev) => ({ id: null, seq: (prev?.seq ?? 0) + 1 }))}
      >
        {t('ui.editor.rooms.new')}
      </button>
    </section>
  )
}
