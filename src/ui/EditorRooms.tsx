import { useMemo, useState } from 'react'
import type { ContentSource } from '@content/load'
import { type DraftKind, deleteRecord } from '@editor/draft'
import { RoomDetail } from './RoomDetail'
import { deleteRefusal } from './deleteMessage'
import { partitionByOrigin, visibleIds } from '@editor/visibility'
import { namedRecords, recordLabels } from './recordLabel'
import { unnamedLabel } from './unnamed'
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
  onPlay,
  initialOpen,
  hidden,
  official,
  bundle,
  onHide,
}: {
  source: ContentSource
  commit: (next: ContentSource) => void
  /** Hands the child off to the library's form to author a new record. */
  onCreateRecord: (kind: DraftKind) => void
  /**
   * Save this room and go play it. Passed straight through to `RoomDetail`,
   * which owns the save — a "try it now" that played an unsaved room would show
   * the child something they could not get back to.
   */
  onPlay?: ((roomId: string) => void) | undefined
  /**
   * A room to open on mount, or `{ id: null }` to open a blank one.
   *
   * The title screen has two buttons — fix THIS room, and make a new one — and
   * before this they both landed on the list, which made them the same button
   * with different words on it.
   */
  initialOpen?: { id: string | null } | undefined
  /** Ids this browser has tucked away. Filtered out of the list, never out of the document. */
  hidden: ReadonlySet<string>
  /** Ids the bundle ships (ADR-003). Decides which control a row gets. */
  official: ReadonlySet<string>
  /** The bundle itself — `RoomDetail` compares RECORDS, not just ids (ADR-001). */
  bundle: ContentSource
  onHide: (kind: DraftKind, id: string) => { ok: true } | { ok: false; reason: string }
}) {
  const t = useTranslate()
  // `'new'` rather than a boolean beside an id: the two states are exclusive and
  // a boolean would let both be true.
  const [open, setOpen] = useState<{ id: string | null; seq: number } | null>(
    initialOpen ? { id: initialOpen.id, seq: 0 } : null,
  )
  // The SUBJECT of the refusal, not the sentence — re-derived every render, so
  // it disappears the moment it stops being true. Same reason as the library's.
  const [refusedId, setRefusedId] = useState<string | null>(null)
  const [hideRefusal, setHideRefusal] = useState<string | null>(null)
  const refusal = useMemo(() => {
    if (hideRefusal !== null) return hideRefusal
    if (refusedId === null) return null
    const check = deleteRecord(source, 'preset', refusedId)
    return check.ok ? null : deleteRefusal(t, source, check)
  }, [hideRefusal, refusedId, source, t])

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
  /**
   * Tuck a room we shipped out of the way (ADR-004).
   *
   * The refusal reuses `ui.editor.delete.*` rather than inventing a parallel
   * set: `canHide` returns the same `last-room` reason `deleteRecord` does,
   * because it IS the same rule, and a second sentence for it would read as a
   * second rule.
   */
  const hide = (id: string) => {
    setRefusedId(null)
    setHideRefusal(null)
    const result = onHide('preset', id)
    if (!result.ok) setHideRefusal(t(`ui.editor.delete.${result.reason}`))
  }

  const remove = (id: string, label: string) => {
    setHideRefusal(null)
    setRefusedId(null)
    if (!window.confirm(`${label} — ${t('ui.editor.delete.confirm')}`)) return
    const result = deleteRecord(source, 'preset', id)
    if (!result.ok) {
      setRefusedId(id)
      return
    }
    commit(result.source)
  }

  // Hidden rooms leave the LIST, never the document (ADR-005). `keepSelected`
  // is empty because this is a browse surface: there is nothing here that a
  // hidden room could already be part of.
  const rooms = visibleIds(namedRecords(source.presets), hidden, [])
  // Split rather than badged. BOTH sides always render, even empty: a section
  // that appears the first time the child saves reads as the screen changing
  // shape rather than as their work arriving.
  const sections = partitionByOrigin(rooms, official)
  // Labels for the whole list at once, so two unnamed rooms are numbered apart
  // rather than both rendering the same words (ADR-002).
  const labels = recordLabels(t, 'preset', rooms)

  if (open !== null) {
    return (
      <RoomDetail
        key={`${open.id ?? 'new'}:${open.seq}`}
        source={source}
        roomId={open.id}
        commit={commit}
        onBack={() => setOpen(null)}
        onCreateRecord={onCreateRecord}
        official={official}
        bundle={bundle}
        hidden={hidden}
        {...(onPlay ? { onPlay: () => onPlay(open.id ?? '') } : {})}
      />
    )
  }

  return (
    <section className="rooms" data-testid="editor-rooms">
      <h2>{t('ui.editor.rooms.title')}</h2>
      <p className="intro">{t('ui.editor.rooms.intro')}</p>

      {(['official', 'authored'] as const).map((side) => (
        <section key={side} className="room-list-section" data-testid={`room-section-${side}`}>
          <h3>{t(`ui.editor.section.${side}`)}</h3>
          <ul className="room-list" data-testid={`room-list-${side}`}>
            {sections[side].map(([id]) => (
              <li key={id}>
                <button
                  type="button"
                  data-testid={`room-open-${id}`}
                  onClick={() => setOpen((prev) => ({ id, seq: (prev?.seq ?? 0) + 1 }))}
                >
                  {labels.get(id)}
                </button>
                {side === 'official' ? (
                  <button type="button" data-testid={`room-hide-${id}`} onClick={() => hide(id)}>
                    {t('ui.editor.hide.label')}
                  </button>
                ) : (
                  <button
                    type="button"
                    className="danger"
                    data-testid={`room-delete-${id}`}
                    // Falling back to `id` here would put the very string ADR-002
                    // deletes into a confirm dialog. `labels` covers every row, so
                    // this branch is unreachable — it just must not be the id.
                    onClick={() => remove(id, labels.get(id) ?? unnamedLabel(t, 'preset'))}
                  >
                    {t('ui.editor.delete.label')}
                  </button>
                )}
              </li>
            ))}
            {sections[side].length === 0 && (
              <li className="empty">{t(`ui.editor.section.${side}-empty`)}</li>
            )}
          </ul>
        </section>
      ))}

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
