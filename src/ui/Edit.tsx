import { useMemo, useState } from 'react'
import type { ContentSource, ValidationError } from '@content/load'
import { type DraftKind, EDITABLE_KINDS, openDraft } from '@editor/draft'
import { stampOf } from '@content/merge'
import { officialIds } from '@content/provenance'
import { bundledContentSource } from '@content/sets/bundled'
import { loadHidden, saveHidden } from '@editor/hidden'
import { canHide } from '@editor/visibility'
import { exportContent, importContent } from '@editor/io'
import { browserStorage, clearStoredContent, saveContent, saveStamp } from '@editor/storage'
import { EditorLibrary, type LibraryOpen } from './EditorLibrary'
import { EditorRooms } from './EditorRooms'
import { recordLabel } from './recordLabel'
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
export function Edit({
  source,
  onCommit,
  onPlay,
  initialRoom,
  bundle = bundledContentSource,
  hidden: hiddenProp,
  official: officialProp,
  onHiddenChange,
}: {
  source: ContentSource
  onCommit: (next: ContentSource) => void
  /**
   * What counts as ours (ADR-003). A parameter rather than a bare import for the
   * same reason `Storage` is one throughout this area: it makes "official" a
   * fact a test can state, instead of whatever the shipped catalogue happens to
   * hold on the day the test runs.
   */
  bundle?: ContentSource
  /** Take the child from a room they just saved straight into a match in it. */
  onPlay?: ((roomId: string) => void) | undefined
  /** A room to open straight away, threaded from the title screen's two buttons. */
  initialRoom?: { id: string | null } | undefined
  /**
   * Which records this browser has tucked away, and the way to change it.
   *
   * Owned by `App`, because the title screen's carousel reads the same set: a
   * copy in here would let the carousel keep offering a room the editor had just
   * hidden. Both are optional so a test can mount this panel on its own; when
   * they are absent the panel keeps its own state and reads the key itself,
   * which is the behaviour it had before the lift.
   */
  hidden?: ReadonlySet<string>
  official?: ReadonlySet<string>
  onHiddenChange?: (next: ReadonlySet<string>) => void
}) {
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

  /**
   * Which records this browser has tucked away (ADR-004).
   *
   * Owned HERE, not in either panel: both panels hide, both must see the same
   * set, and the persistence is one key. Read once on mount — a browser that
   * denies storage yields an empty set and every hide is then session-local,
   * which is the same graceful degrade the rest of this file already makes.
   */
  const [ownHidden, setOwnHidden] = useState<ReadonlySet<string>>(() => {
    const storage = browserStorage()
    return storage ? loadHidden(storage) : new Set()
  })
  const hidden = hiddenProp ?? ownHidden
  const setHidden = (next: ReadonlySet<string>) => {
    setOwnHidden(next)
    onHiddenChange?.(next)
  }
  const derivedOfficial = useMemo(() => officialIds(bundle), [bundle])
  const official = officialProp ?? derivedOfficial

  /**
   * Tuck an official record away, or say why not.
   *
   * Deliberately NOT confirmed. A confirm exists to stand between a tap and an
   * irreversible loss, and this is the one destructive-looking control in the
   * editor that loses nothing — the record stays in the document and comes back
   * from the transfer panel. Asking anyway would teach the child that the
   * confirms on the controls that DO lose work mean no more than this one.
   */
  const hide = (kind: DraftKind, id: string): { ok: true } | { ok: false; reason: string } => {
    const check = canHide(source, kind, id, hidden, official)
    if (!check.ok) return check
    const next = new Set(hidden)
    next.add(id)
    setHidden(next)
    const storage = browserStorage()
    if (storage) saveHidden(storage, next)
    return { ok: true }
  }

  /**
   * What is currently tucked away, named for the screen.
   *
   * Walks all six collections, because ADR-004 applies to all six kinds — a
   * restore list that only knew about rooms would leave a hidden piece with no
   * way back, which is the black hole hiding exists to avoid.
   *
   * An id the document NO LONGER HOLDS still gets a row. That happens when the
   * document is replaced by an import after something was hidden, and without a
   * row the id would sit in the key forever with nothing but a full reset able
   * to clear it.
   */
  const hiddenRows = useMemo(() => {
    const rows: Array<{ id: string; label: string }> = []
    for (const id of hidden) {
      let label: string | null = null
      for (const kind of EDITABLE_KINDS) {
        const record = openDraft(source, kind, id)
        if (record !== null) {
          label = recordLabel(t, kind, id, record['nameKey'])
          break
        }
      }
      rows.push({ id, label: label ?? t('ui.editor.hide.restore-unknown') })
    }
    return rows
  }, [hidden, source, t])

  /** Put back everything this browser has tucked away. */
  const restore = (id: string) => {
    const next = new Set(hidden)
    next.delete(id)
    setHidden(next)
    const storage = browserStorage()
    if (storage) saveHidden(storage, next)
  }

  const persist = (next: ContentSource) => {
    const storage = browserStorage()
    if (!storage) {
      setStatus(t('ui.editor.storage.unavailable'))
      return
    }
    const result = saveContent(storage, next)
    // The stamp advances here and nowhere else, and ONLY on the ok branch
    // (PLAN-bundled-content-merge ADR-003). `saveContent` refuses on quota
    // rather than throwing, so an unconditional write would leave the stamp
    // ahead of content that was never stored — and every record in this save
    // would read as one the author had deleted on the next load, and disappear.
    // The invariant is one-directional: the stamp may lag the content, never lead it.
    if (result.ok) saveStamp(storage, stampOf(bundledContentSource))
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

  /**
   * Throw this browser's saved content away and go back to the shipped set.
   *
   * The escape hatch, and the only control here that is not an inference. What
   * a device shows is decided by a saved document and a stamp, and both are
   * guesses about what the author meant; when the guess is wrong — or when a
   * device is simply stuck on a catalogue that will not move — someone has to be
   * able to say "start over" without a developer.
   *
   * Deliberately does NOT write. It clears both keys and hands the app the
   * shipped set in memory, so storage is left in the state a browser that has
   * never been here is in, and the next load takes the genuine first-run path.
   * Writing the bundle back would look identical today and diverge on the next
   * release — a saved copy of this build's bundle, with a stamp, receives
   * nothing new, which is the exact bug this whole feature exists to fix.
   *
   * Confirmed, and the confirm names the loss rather than asking "are you sure":
   * this destroys work a child may have spent hours on, and the export button is
   * two rows up.
   */
  const doReset = () => {
    if (!window.confirm(t('ui.editor.transfer.reset-confirm'))) return
    const storage = browserStorage()
    if (storage) clearStoredContent(storage)
    setErrors([])
    setJson('')
    setLibraryDirty(false)
    // `clearStoredContent` drops the key; this drops the copy React is holding.
    // Without both, a reset repaints the shipped catalogue with some of it still
    // tucked away and nothing on screen to explain why (ADR-006).
    setHidden(new Set())
    onCommit(structuredClone(bundledContentSource))
    setStatus(t('ui.editor.transfer.reset-done'))
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
        <EditorRooms
          source={source}
          commit={commit}
          onCreateRecord={createFromRoom}
          onPlay={onPlay}
          initialOpen={initialRoom}
          hidden={hidden}
          official={official}
          bundle={bundle}
          onHide={hide}
        />
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
          hidden={hidden}
          official={official}
          bundle={bundle}
          onHide={hide}
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

      {hiddenRows.length > 0 && (
        <fieldset className="hidden-restore" data-testid="hidden-restore">
          <legend>{t('ui.editor.hide.restore-legend')}</legend>
          <p className="hint">{t('ui.editor.hide.restore-hint')}</p>
          <ul>
            {hiddenRows.map(({ id, label }) => (
              <li key={id}>
                <button type="button" data-testid={`hidden-restore-${id}`} onClick={() => restore(id)}>
                  {label}
                </button>
              </li>
            ))}
          </ul>
        </fieldset>
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
        <button type="button" className="danger" data-testid="editor-reset" onClick={doReset}>
          {t('ui.editor.transfer.reset')}
        </button>
        <textarea data-testid="editor-json" value={json} onChange={(e) => setJson(e.target.value)} rows={4} />
      </fieldset>
    </section>
  )
}
