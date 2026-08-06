import { useMemo, useState } from 'react'
import { type ContentSource, loadContentSet } from '@content/load'
import { BUNDLED_PRESET_ID, bundledContentSource } from '@content/sets/bundled'
import { browserStorage, loadStoredContent } from '@editor/storage'
import { Edit } from './Edit'
import { translate } from './i18n'
import { Play } from './Play'

/**
 * Content the author saved in this browser, or the shipped set on a first run.
 *
 * Stored content that no longer validates is DISCARDED rather than loaded: a
 * build whose schema moved on must still start, and a half-loaded set is the
 * boundary AC-011 exists to hold. The author's work is not silently deleted —
 * it stays in storage until the next save overwrites it.
 */
function initialSource(): ContentSource {
  const storage = browserStorage()
  if (storage) {
    const stored = loadStoredContent(storage)
    if (stored.ok) return stored.source
  }
  return structuredClone(bundledContentSource)
}

/**
 * The app shell: play the shipped content set, or edit it.
 *
 * The entry point resolves to `bundledContentSource` — that resolution IS the
 * product half of AC-010, and it is asserted rather than assumed
 * (`tests/content/ships-the-bundle.test.ts`). Until Phase 7 this file loaded
 * the Phase 3 throwaway slice, so the bundle validated, was fully tested, and
 * reached no player: an artifact every count-based criterion called shipped.
 *
 * Editing restarts the match rather than patching the running one. Content that
 * changed mid-match would make the resolution log un-replayable, and replay is
 * what AC-004 and AC-013 are checked against.
 */
export function App() {
  const [source, setSource] = useState<ContentSource>(initialSource)
  const [revision, setRevision] = useState(0)
  const [tab, setTab] = useState<'play' | 'edit'>('play')
  const [presetId, setPresetId] = useState(BUNDLED_PRESET_ID)

  const loaded = useMemo(() => loadContentSet(source), [source])
  const presetIds = loaded.ok ? [...loaded.set.presets.keys()] : []
  // A preset the author deleted must not leave the board pointing at nothing.
  const activePreset = presetIds.includes(presetId) ? presetId : (presetIds[0] ?? BUNDLED_PRESET_ID)

  return (
    <main>
      <h1>{translate('ui.app.title')}</h1>
      <nav>
        <button data-testid="tab-play" onClick={() => setTab('play')}>
          {translate('ui.tab.play')}
        </button>
        <button data-testid="tab-edit" onClick={() => setTab('edit')}>
          {translate('ui.tab.edit')}
        </button>
      </nav>

      {!loaded.ok && <p data-testid="content-broken">{translate('ui.content.broken')}</p>}

      {loaded.ok && tab === 'play' && (
        <>
          <label>
            {translate('ui.preset.label')}
            <select data-testid="preset-select" value={activePreset} onChange={(e) => setPresetId(e.target.value)}>
              {presetIds.map((id) => (
                <option key={id} value={id}>
                  {id}
                </option>
              ))}
            </select>
          </label>
          <Play key={`${revision}-${activePreset}`} content={loaded.set} presetId={activePreset} />
        </>
      )}

      {tab === 'edit' && (
        <Edit
          source={source}
          onCommit={(next) => {
            setSource(next)
            setRevision((r) => r + 1)
          }}
        />
      )}
    </main>
  )
}
