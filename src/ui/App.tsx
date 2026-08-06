import { useEffect, useMemo, useState } from 'react'
import { type ContentSource, loadContentSet } from '@content/load'
import { BUNDLED_PRESET_ID, bundledContentSource } from '@content/sets/bundled'
import { browserStorage, loadStoredContent } from '@editor/storage'
import { Edit } from './Edit'
import { Coach } from './Coach'
import { Home } from './Home'
import { MatchHost } from './MatchHost'
import { Rules } from './Rules'
import { hasSeenCoach, markCoachSeen } from './coach'
import { type Theme, loadSettings, saveSettings } from './settings'
import { translate } from './i18n'

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
 * The app shell: home, play, or edit.
 *
 * The entry point resolves to `bundledContentSource` — that resolution IS the
 * product half of AC-010, and it is asserted rather than assumed.
 *
 * Phase 2 put a home route in front of the board. The app used to open on a
 * live match, which is why it had no way to start a second one: there was no
 * screen a match could end back into. `MatchHost` is keyed on preset AND
 * revision so that editing content or switching preset rebuilds the match
 * rather than patching a running one — content that changed mid-match would
 * make the resolution log un-replayable, and replay is what AC-004 and AC-013
 * are checked against.
 */
export function App() {
  const [source, setSource] = useState<ContentSource>(initialSource)
  const [revision, setRevision] = useState(0)
  const [route, setRoute] = useState<'home' | 'play' | 'edit' | 'rules'>('home')
  // A browser that denies storage reports "already seen" rather than replaying
  // the tutorial forever — see the note in `coach.ts` on which way this fails.
  const [coaching, setCoaching] = useState(() => {
    const storage = browserStorage()
    return storage ? !hasSeenCoach(storage) : false
  })

  const [coachStep, setCoachStep] = useState(0)
  const [theme, setTheme] = useState<Theme>(() => {
    const storage = browserStorage()
    return storage ? loadSettings(storage).theme : 'system'
  })

  /**
   * `data-theme` lives on the document element, which React does not own — so
   * this is an effect, not a render. `system` REMOVES the attribute rather than
   * writing a value, because the whole point of the third cascade layer is to
   * be absent when the player has not chosen.
   */
  useEffect(() => {
    const root = document.documentElement
    if (theme === 'system') root.removeAttribute('data-theme')
    else root.setAttribute('data-theme', theme)
  }, [theme])

  const cycleTheme = () => {
    const next: Theme = theme === 'system' ? 'light' : theme === 'light' ? 'dark' : 'system'
    setTheme(next)
    const storage = browserStorage()
    if (storage) saveSettings(storage, { ...loadSettings(storage), theme: next })
  }

  const endCoaching = () => {
    const storage = browserStorage()
    if (storage) markCoachSeen(storage)
    setCoaching(false)
  }
  const [presetId, setPresetId] = useState(BUNDLED_PRESET_ID)
  // `tab-play` unmounts a running match exactly as `new-match` restarts one, so the
  // same guard belongs here. MatchHost reports whether there is anything to lose.
  const [matchInProgress, setMatchInProgress] = useState(false)

  const leaveMatch = (to: 'home' | 'edit') => {
    if (route === 'play' && matchInProgress && !window.confirm(translate('ui.confirm.discard'))) return
    setRoute(to)
  }

  const loaded = useMemo(() => loadContentSet(source), [source])
  const presetIds = loaded.ok ? [...loaded.set.presets.keys()] : []
  // A preset the author deleted must not leave the board pointing at nothing.
  const activePreset = presetIds.includes(presetId) ? presetId : (presetIds[0] ?? BUNDLED_PRESET_ID)

  return (
    <main>
      <h1>{translate('ui.app.title')}</h1>
      <nav>
        <button data-testid="tab-play" onClick={() => leaveMatch('home')}>
          {translate('ui.tab.play')}
        </button>
        <button data-testid="theme-toggle" data-theme-choice={theme} onClick={cycleTheme}>
          {translate(`ui.theme.${theme}`)}
        </button>
        <button data-testid="tab-edit" onClick={() => leaveMatch('edit')}>
          {translate('ui.tab.edit')}
        </button>
      </nav>

      {!loaded.ok && <p data-testid="content-broken">{translate('ui.content.broken')}</p>}

      {loaded.ok && route === 'home' && (
        <Home
          content={loaded.set}
          presetId={activePreset}
          onPresetChange={setPresetId}
          onStart={() => setRoute('play')}
          onOpenRules={() => setRoute('rules')}
        />
      )}

      {loaded.ok && route === 'home' && coaching && (
        <Coach index={coachStep} onNext={() => setCoachStep((i) => i + 1)} onDone={endCoaching} />
      )}

      {loaded.ok && route === 'rules' && <Rules content={loaded.set} onClose={() => setRoute('home')} />}

      {loaded.ok && route === 'play' && (
        <MatchHost
          key={`${revision}-${activePreset}`}
          content={loaded.set}
          presetId={activePreset}
          onHome={() => setRoute('home')}
          onProgressChange={setMatchInProgress}
        />
      )}

      {route === 'edit' && (
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
