import { useMemo, useState } from 'react'
import { type ContentSource, loadContentSet } from '@content/load'
import { SLICE_PRESET_ID, sliceContentSource } from '@content/sets/slice'
import { Edit } from './Edit'
import { Play } from './Play'

/**
 * The Phase 3 harness shell: play the slice, or edit it.
 *
 * Editing restarts the match rather than patching the running one. Content that
 * changed mid-match would make the resolution log un-replayable, and replay is
 * what AC-004 and AC-013 are checked against.
 */
export function App() {
  const [source, setSource] = useState<ContentSource>(() => structuredClone(sliceContentSource))
  const [revision, setRevision] = useState(0)
  const [tab, setTab] = useState<'play' | 'edit'>('play')

  const loaded = useMemo(() => loadContentSet(source), [source])

  return (
    <main>
      <h1>Strange Chess</h1>
      <nav>
        <button data-testid="tab-play" onClick={() => setTab('play')}>
          play
        </button>
        <button data-testid="tab-edit" onClick={() => setTab('edit')}>
          edit
        </button>
      </nav>

      {!loaded.ok && <p data-testid="content-broken">content failed to load</p>}

      {loaded.ok && tab === 'play' && <Play key={revision} content={loaded.set} presetId={SLICE_PRESET_ID} />}

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
