import { useState } from 'react'
import type { ContentSource, ValidationError } from '@content/load'
import type { DraftKind } from '@editor/draft'
import { exportContent, importContent } from '@editor/io'
import { browserStorage, saveContent } from '@editor/storage'
import { EditorLibrary, type LibraryOpen } from './EditorLibrary'
import { EditorRooms } from './EditorRooms'
import { useTranslate } from './i18n'

/**
 * The editor shell (PLAN Phase 9a): two tabs, transfer, and the two things
 * both tabs have to agree about.
 *
 * Phase 5 put the whole editor in this file — six flat record kinds behind a
 * picker, which is a form over the schema rather than over the product. What
 * the product is about is rooms, so rooms is the front door and the six-kind
 * surface is now the library behind it (`ui.editor.tab.library`, ADR-019).
 *
 * **Both panels stay mounted, and the inactive one is `hidden`.** Two reasons,
 * and the second is the load-bearing one:
 *
 * 1. A half-assembled room survives a trip to the library to make the piece it
 *    needed. Unmounting the panel would throw the ticks away, and the child
 *    would learn not to leave the screen.
 * 2. `hidden` is what the browser hides and what Playwright refuses to click,
 *    so "the library is not on screen" and "the library's controls are still in
 *    the document" are both true — which is what lets the ADR-006
 *    vocabulary-coverage gate keep driving `editor-kind` and `editor-save` by
 *    test id, UNCHANGED, while the child never meets either one until they open
 *    the tab. The gate proves the controls were re-grouped, not re-authored;
 *    this is the mechanism that makes both claims simultaneously true rather
 *    than a contradiction to be argued about.
 *
 * `editor-errors` and `editor-storage-status` live HERE rather than in the
 * panels because they are one channel, not two: an import failure and a save
 * failure are the same question ("why did that not take?") and rendering them
 * twice would put two nodes with the same test id on the page, which is a
 * broken selector rather than a design choice.
 */
export function Edit({ source, onCommit }: { source: ContentSource; onCommit: (next: ContentSource) => void }) {
  const t = useTranslate()
  const [tab, setTab] = useState<'rooms' | 'library'>('rooms')
  const [library, setLibrary] = useState<LibraryOpen>({ kind: 'piece', id: null, seq: 0 })
  const [errors, setErrors] = useState<ValidationError[]>([])
  const [status, setStatus] = useState('')
  const [json, setJson] = useState('')
  // Whether the library's form holds work the author has not saved. Reported
  // upward — as a two-way signal, not a latch — because only the shell can
  // destroy it, and a flag that only ever goes true would confirm-prompt after
  // every successful save.
  const [libraryDirty, setLibraryDirty] = useState(false)

  const persist = (next: ContentSource) => {
    const storage = browserStorage()
    if (!storage) {
      setStatus(t('ui.editor.storage.unavailable'))
      return
    }
    const result = saveContent(storage, next)
    setStatus(result.ok ? t('ui.editor.storage.saved') : result.message)
  }

  /** Every accepted change goes out to the app AND down to storage, together. */
  const commit = (next: ContentSource) => {
    onCommit(next)
    persist(next)
  }

  /**
   * Opens something in the library, asking first when that would throw away
   * unsaved work. Returns whether it actually happened.
   *
   * The confirm lives HERE rather than at the call sites because every way to
   * change what the library holds remounts `RecordForm` — the kind picker, a
   * record in the list, the new-record button, and a room's shortcut. The first
   * version of this guard sat on the room's shortcut alone, which is the LEAST
   * travelled of the four: the author's normal way to leave a half-typed record
   * is to click the next one, and that path was still silently destroying it.
   * One gate on the one thing they all do is the only shape that cannot rot as
   * a fifth caller appears.
   */
  const openInLibrary = (kind: DraftKind, id: string | null, force = false): boolean => {
    // `force` is not "skip the safety check" — it is "there is nothing to ask
    // about". Its one caller is a delete of the very record the form is holding,
    // where the buffer's subject is going away with it. Clearing `libraryDirty`
    // first and then calling in normally does NOT work and is worth recording:
    // React has not re-rendered yet, so this closure still reads the old `true`
    // and prompts anyway.
    if (!force && libraryDirty && !window.confirm(t('ui.editor.form.discard-confirm'))) return false
    setLibrary((prev) => ({ kind, id, seq: prev.seq + 1 }))
    setLibraryDirty(false)
    return true
  }

  /**
   * A room asked for a record it does not have yet.
   *
   * The child is taken to the library with a blank form of that kind rather
   * than given a second form inside the room. One form in the document is worth
   * the tab switch: two would mean two `editor-save` buttons, and the room they
   * left is still exactly as they left it because the panel stayed mounted.
   */
  const createFromRoom = (kind: DraftKind) => {
    // No "am I already on a blank form of that kind" short-circuit. It looked
    // like a free optimisation and was a correctness hole: the shell's
    // `library.id` stays null after the library's own new-record button, so a
    // record CREATED and SAVED through that button still reads as blank here —
    // and the room's shortcut would have re-opened it instead of giving the
    // author the new record they asked for. A clean form costs nothing to
    // remount; a dirty one is asked about.
    if (!openInLibrary(kind, null)) return
    setErrors([])
    setTab('library')
  }

  const doExport = () => {
    setJson(exportContent(source))
    setErrors([])
  }

  const doImport = () => {
    const result = importContent(json)
    if (!result.ok) {
      setErrors(result.errors)
      return
    }
    setErrors([])
    commit(result.source)
  }

  return (
    <section className="editor" data-testid="editor">
      <nav className="editor-tabs">
        <button
          type="button"
          data-testid="editor-tab-rooms"
          data-selected={tab === 'rooms'}
          onClick={() => {
            // The error list lives at shell level, outside both panels, so a
            // failed library save would otherwise stay on screen describing a
            // field the Rooms tab does not contain.
            setErrors([])
            setTab('rooms')
          }}
        >
          {t('ui.editor.tab.rooms')}
        </button>
        <button
          type="button"
          data-testid="editor-tab-library"
          data-selected={tab === 'library'}
          onClick={() => {
            setErrors([])
            setTab('library')
          }}
        >
          {t('ui.editor.tab.library')}
        </button>
      </nav>

      <div hidden={tab !== 'rooms'}>
        <EditorRooms source={source} commit={commit} onCreateRecord={createFromRoom} />
      </div>

      <div hidden={tab !== 'library'}>
        <EditorLibrary
          source={source}
          open={library}
          onOpen={openInLibrary}
          onDirtyChange={setLibraryDirty}
          commit={commit}
          errors={errors}
          setErrors={setErrors}
        />
      </div>

      <p data-testid="editor-storage-status">{status}</p>

      {errors.length > 0 && (
        <ul data-testid="editor-errors">
          {errors.map((e, i) => (
            <li key={`${e.path}-${i}`}>{e.message}</li>
          ))}
        </ul>
      )}

      <fieldset className="transfer">
        <legend>{t('ui.editor.transfer.legend')}</legend>
        <p className="hint">{t('ui.editor.transfer.hint')}</p>
        <button type="button" data-testid="editor-export" onClick={doExport}>
          {t('ui.editor.transfer.export')}
        </button>
        <button type="button" data-testid="editor-import" onClick={doImport}>
          {t('ui.editor.transfer.import')}
        </button>
        <textarea data-testid="editor-json" value={json} onChange={(e) => setJson(e.target.value)} rows={4} />
      </fieldset>
    </section>
  )
}
