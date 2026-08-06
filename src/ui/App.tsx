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
import { applyUpdate, registerServiceWorker } from './sw-update'

/**
 * Content the author saved in this browser, or the shipped set on a first run.
 *
 * Stored content that no longer validates is DISCARDED rather than loaded: a
 * build whose schema moved on must still start, and a half-loaded set is the
 * boundary AC-011 exists to hold. The author's work is not silently deleted —
 * it stays in storage until the next save overwrites it.
 */
function initialSource(): { source: ContentSource; failedToLoad: boolean } {
  const storage = browserStorage()
  if (storage) {
    const stored = loadStoredContent(storage)
    if (stored.ok) return { source: stored.source, failedToLoad: false }
    // `absent` is a first run, not a failure. Every other reason means the
    // author HAS saved something and it did not come back — which until now was
    // handled by silently starting on the shipped set, so a child whose content
    // failed a schema bump simply found their work gone with no explanation.
    if (stored.reason !== 'absent') {
      return { source: structuredClone(bundledContentSource), failedToLoad: true }
    }
  }
  return { source: structuredClone(bundledContentSource), failedToLoad: false }
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
  const [initial] = useState(initialSource)
  const [source, setSource] = useState<ContentSource>(initial.source)
  // Dismissible, and dismissal is not persisted: the stored content is still
  // broken next time, and saying so once per session is the honest cadence.
  const [noticeDismissed, setNoticeDismissed] = useState(false)
  // The waiting registration, kept so the update button has something to take.
  const [updateReady, setUpdateReady] = useState<ServiceWorkerRegistration | null>(null)
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

  /**
   * Registers the service worker once, and remembers the registration so the
   * update button has a worker to hand over to.
   *
   * `navigator.serviceWorker` is undefined on an older browser and in an
   * insecure context; `registerServiceWorker` returns null there rather than
   * throwing, so this never takes the app down over an offline feature.
   */
  useEffect(() => {
    let live = true
    void registerServiceWorker(navigator.serviceWorker, () => {
      if (live) {
        void navigator.serviceWorker.getRegistration().then((reg) => {
          if (live) setUpdateReady(reg ?? null)
        })
      }
    }).then((reg) => {
      // A worker that was ALREADY waiting when this page loaded resolves
      // through the callback above too, but the registration comes back here.
      if (live && reg?.waiting) setUpdateReady(reg)
    })
    return () => {
      live = false
    }
  }, [])

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

      {/* One stack, not two independently-fixed siblings. Both notices are
          `position: fixed` at the same coordinates, and their conditions are
          unrelated — a content bundle that failed to load and a pending build
          are exactly the pair that ships together — so two of them landed
          exactly on top of each other and the one underneath became invisible
          and unclickable. Fixing the reflow defect created an overlap defect
          that the in-flow version never had, because siblings in flow stack for
          free. */}
      <div className="notice-stack">
      {updateReady && (
        <section className="notice" data-testid="update-prompt">
          <strong>{translate('ui.update.title')}</strong>
          <p>{translate('ui.update.body')}</p>
          <div className="notice-actions">
            <button data-testid="update-apply" onClick={() => applyUpdate(updateReady, navigator.serviceWorker)}>
              {translate('ui.update.apply')}
            </button>
            <button data-testid="update-later" onClick={() => setUpdateReady(null)}>
              {translate('ui.update.later')}
            </button>
          </div>
        </section>
      )}

      {initial.failedToLoad && !noticeDismissed && (
        <section className="notice" data-testid="content-notice">
          <strong>{translate('ui.content.notice.title')}</strong>
          <p>{translate('ui.content.notice.body')}</p>
          <div className="notice-actions">
            <button data-testid="notice-open-editor" onClick={() => setRoute('edit')}>
              {translate('ui.content.notice.open-editor')}
            </button>
            <button data-testid="notice-dismiss" onClick={() => setNoticeDismissed(true)}>
              {translate('ui.content.notice.dismiss')}
            </button>
          </div>
        </section>
      )}
      </div>

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
