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
import { TranslateContext, makeTranslate } from './i18n'
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
    if (route === 'play' && matchInProgress && !window.confirm(t('ui.confirm.discard'))) return
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

  /**
   * The resolver every screen below uses (ADR-020).
   *
   * Built from `source` rather than from `loaded.set`, and that is the reachable
   * difference: a document that FAILS to load still carries the text its author
   * typed, and the notice explaining the failure sits on the same screen. Taking
   * the overlay from the loaded set would drop it exactly when it is needed.
   *
   * `App` is the only place this can be built — it is the only thing that knows
   * which document is loaded — which is why the resolver is provided rather than
   * imported. A screen that reached for a bundle-only `translate` would silently
   * render shipped text over the author's, and nothing on screen would say so.
   */
  const t = useMemo(() => makeTranslate(source.strings), [source.strings])

  const loaded = useMemo(() => loadContentSet(source), [source])
  const presetIds = loaded.ok ? [...loaded.set.presets.keys()] : []
  // A preset the author deleted must not leave the board pointing at nothing.
  const activePreset = presetIds.includes(presetId) ? presetId : (presetIds[0] ?? BUNDLED_PRESET_ID)

  return (
    <TranslateContext.Provider value={t}>
    {/* The route is on the shell so CSS can treat the entry screen as a title
        screen — a big wordmark, the room picker and one obvious way in —
        without a second <h1> that would put the app's name on the page twice
        and give a screen reader two headings for one thing. */}
    <main data-route={route}>
      <h1>{t('ui.app.title')}</h1>
      {/*
        Destinations first, then the switch — they are not peers.

        The theme control used to sit BETWEEN the two tabs, so a row that reads
        "go here / change the look / go there" put an appearance setting at the
        same weight as the two places the app can be. It stays in the nav rather
        than moving into the match's settings drawer, because it has to be
        reachable from home, the rules screen and the editor as well, and that
        reach is the whole reason it lives up here. What changes is rank: last
        in the row, pushed to the far edge, and at ghost weight.
      */}
      <nav>
        <button data-testid="tab-play" onClick={() => leaveMatch('home')}>
          {t('ui.tab.play')}
        </button>
        <button data-testid="tab-edit" onClick={() => leaveMatch('edit')}>
          {t('ui.tab.edit')}
        </button>
        <button
          className="ghost nav-theme"
          data-testid="theme-toggle"
          data-theme-choice={theme}
          onClick={cycleTheme}
        >
          {t(`ui.theme.${theme}`)}
        </button>
      </nav>

      {!loaded.ok && <p data-testid="content-broken">{t('ui.content.broken')}</p>}

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
          <strong>{t('ui.update.title')}</strong>
          <p>{t('ui.update.body')}</p>
          <div className="notice-actions">
            <button data-testid="update-apply" onClick={() => applyUpdate(updateReady, navigator.serviceWorker)}>
              {t('ui.update.apply')}
            </button>
            <button data-testid="update-later" onClick={() => setUpdateReady(null)}>
              {t('ui.update.later')}
            </button>
          </div>
        </section>
      )}

      {initial.failedToLoad && !noticeDismissed && (
        <section className="notice" data-testid="content-notice">
          <strong>{t('ui.content.notice.title')}</strong>
          <p>{t('ui.content.notice.body')}</p>
          <div className="notice-actions">
            <button data-testid="notice-open-editor" onClick={() => setRoute('edit')}>
              {t('ui.content.notice.open-editor')}
            </button>
            <button data-testid="notice-dismiss" onClick={() => setNoticeDismissed(true)}>
              {t('ui.content.notice.dismiss')}
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
    </TranslateContext.Provider>
  )
}
