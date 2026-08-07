import { useEffect, useMemo, useState } from 'react'
import { type ContentSource, loadContentSet } from '@content/load'
import { BUNDLED_PRESET_ID, bundledContentSource } from '@content/sets/bundled'
import { browserStorage, loadStoredContent } from '@editor/storage'
import { Boot } from './Boot'
import { Edit } from './Edit'
import { Home } from './Home'
import { Lobby } from './Lobby'
import { MatchHost } from './MatchHost'
import { Rules } from './Rules'
import { TabBar } from './TabBar'
import { hasSeenCoach, markCoachSeen } from './coach'
import { type Route, isKnownPath, pathToRoute, routeToPath } from './router'
import { type Settings, DEFAULT_SETTINGS, loadSettings, saveSettings } from './settings'
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
 * Where the app can be.
 *
 * Chess Craft splits what used to be four routes into six, and the two new ones
 * are not decoration:
 *
 * - `boot` was the `Coach` overlay, which floated over a home screen a first
 *   visitor had not read yet. It is a screen now because the thing it teaches —
 *   that this is a game you BUILD — is the product, and it was competing with
 *   the title behind it.
 * - `lobby` is the step that did not exist. Two children shared a phone and the
 *   app never asked who they were, so the turn bar named a colour and the hand-off
 *   said nothing at all. Naming the players is what makes the curtain in
 *   `MatchHost` mean anything.
 *
 * The union itself, and the URL each member lives at, moved to `./router` when the
 * screens got real addresses (ADR-003) — a path table that the shell alone could see
 * would be a path table no test could iterate. `result` stays out of it for the reason
 * recorded there.
 */

/** The routes the bottom tab bar is part of, and the tab each one lights up. */
const TAB_OF: Partial<Record<Route, 'home' | 'edit' | 'dex'>> = {
  home: 'home',
  edit: 'edit',
  dex: 'dex',
}

/**
 * The app shell.
 *
 * The entry point resolves to `bundledContentSource` — that resolution IS the
 * product half of AC-010, and it is asserted rather than assumed.
 *
 * `MatchHost` is keyed on preset AND revision so that editing content or
 * switching preset rebuilds the match rather than patching a running one:
 * content that changed mid-match would make the resolution log un-replayable,
 * and replay is what AC-004 and AC-013 are checked against.
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

  /**
   * The first run opens on onboarding, every later run on the title screen.
   *
   * Read from the SAME flag the coach marks used, so a returning player is not
   * onboarded a second time by a redesign. A browser that denies storage reports
   * "already seen" rather than replaying the tutorial forever — see the note in
   * `coach.ts` on which way this fails.
   */
  const [route, setRouteState] = useState<Route>(() => {
    const storage = browserStorage()
    if (storage && !hasSeenCoach(storage)) return 'boot'
    return pathToRoute(window.location.pathname)
  })

  /**
   * Every route change, and the URL that goes with it.
   *
   * A wrapper around the raw setter rather than a push at each call site, because there
   * are ten call sites — the notice, the title screen's three controls, the lobby's two,
   * the board's two, the dex, and the builder's play button — and only the tab bar goes
   * through `go`. Pushing at each one means the URL is correct until someone adds an
   * eleventh, and a route change that forgets its push does not break anything visible:
   * the screen is right, the address bar is stale, and the next reload lands somewhere
   * else. That is `[fail:design] phase-scope-omits-wiring`, so the wiring lives at the one
   * point every caller already passes through.
   *
   * Guarded on the path rather than the route because `boot` and `home` share `/`, and
   * finishing onboarding must not push a duplicate entry that Back would then land on.
   */
  const setRoute = (to: Route) => {
    const path = routeToPath(to)
    if (path !== window.location.pathname) window.history.pushState(null, '', path)
    setRouteState(to)
  }

  /**
   * Makes the address bar honest about the screen that actually opened.
   *
   * Two cases, both at mount only. A first visitor deep-linked to `/edit` gets onboarding,
   * because the coach flag decides that and a URL must not be able to skip it — so the URL
   * has to stop claiming `/edit`. And an unknown path (`/room/ABC123`, a typo) reaches the
   * app rather than 404ing, since the edge serves the shell for everything; it renders home
   * and the URL must say so, or a reload disagrees with the display.
   *
   * `replaceState`, not `push`: neither case is a place the player navigated to, so neither
   * belongs in their history.
   */
  useEffect(() => {
    if (route === 'boot' || !isKnownPath(window.location.pathname)) {
      window.history.replaceState(null, '', routeToPath(route))
    }
    // Mount only — a later route change is the wrapper's business, not this effect's.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const [settings, setSettings] = useState<Settings>(() => {
    const storage = browserStorage()
    return storage ? loadSettings(storage) : DEFAULT_SETTINGS
  })

  /**
   * Settings are written through on every change, not on unmount.
   *
   * The two things stored here — the sound switch and the players' names — are
   * both set immediately before something that unmounts the screen that set
   * them, so a deferred write is a write that does not happen.
   */
  const updateSettings = (next: Settings) => {
    setSettings(next)
    const storage = browserStorage()
    if (storage) saveSettings(storage, next)
  }

  const finishBoot = () => {
    const storage = browserStorage()
    if (storage) markCoachSeen(storage)
    setRoute('home')
  }

  const [presetId, setPresetId] = useState(BUNDLED_PRESET_ID)
  /**
   * Which room the editor should open on, when it was reached by a control that
   * meant one. `undefined` is the tab bar — the list, as before.
   */
  const [editorTarget, setEditorTarget] = useState<{ id: string | null } | undefined>(undefined)
  // `tab-play` unmounts a running match exactly as `new-match` restarts one, so
  // the same guard belongs here. MatchHost reports whether there is anything to
  // lose.
  const [matchInProgress, setMatchInProgress] = useState(false)

  /**
   * Leaves the board, asking first when a match would be thrown away.
   *
   * Every route change out of `play` goes through here, including the tab bar —
   * which is new, and is the reason this takes a `Route` rather than the two
   * destinations it used to. A tab bar is a much easier thing to hit by accident
   * than a labelled button beside the board.
   */
  const go = (to: Route) => {
    if (route === 'play' && matchInProgress && !window.confirm(t('ui.confirm.discard'))) return
    // The tab bar means "the list", never a particular room — otherwise leaving
    // the editor and tapping the tab again would silently reopen the room the
    // title screen had sent them to a screen ago.
    if (to === 'edit') setEditorTarget(undefined)
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

  /**
   * The Back button, and the one thing about it that is not like `go`.
   *
   * `go` can refuse: it asks, and on "no" it returns having moved nothing. `popstate`
   * cannot. By the time this runs the browser has ALREADY changed the URL, so declining is
   * not an early return — it is pushing the entry back and leaving the screen where it was.
   * Without that push the board stays on screen under a URL that says `/lobby`, which looks
   * like nothing is wrong right up until the player reloads and the match is gone. On a
   * phone the gesture that triggers this is a swipe from the edge, so it is not a rare path.
   *
   * `setRouteState`, not `setRoute` — the URL is already where it needs to be, and the
   * wrapper would push a duplicate entry that Back would then have to walk back through.
   *
   * Declared here rather than beside `go` because the dependency array evaluates `t`
   * eagerly, and `t` is memoized on the content source a few lines above.
   */
  useEffect(() => {
    const onPop = () => {
      if (route === 'play' && matchInProgress && !window.confirm(t('ui.confirm.discard'))) {
        window.history.pushState(null, '', routeToPath(route))
        return
      }
      const next = pathToRoute(window.location.pathname)
      // Same reset as `go`, for the same reason: arriving at the editor without naming a
      // room means the list, not whatever room the last visit left open.
      if (next === 'edit') setEditorTarget(undefined)
      setRouteState(next)
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [route, matchInProgress, t])

  const loaded = useMemo(() => loadContentSet(source), [source])
  const presetIds = loaded.ok ? [...loaded.set.presets.keys()] : []
  // A preset the author deleted must not leave the board pointing at nothing.
  const activePreset = presetIds.includes(presetId) ? presetId : (presetIds[0] ?? BUNDLED_PRESET_ID)

  return (
    <TranslateContext.Provider value={t}>
      {/* The route is on the shell so CSS can size and frame each screen without
          a second wrapper per screen — and so the phone-shaped body can drop its
          chrome on the two screens (`boot`, `play`) that fill it edge to edge. */}
      <main data-route={route}>
        {/*
          The phone body. Everything the app draws lives inside it, INCLUDING the
          tab bar — which is why it is a wrapper rather than each screen sizing
          itself. The bar used to be a sibling of the screen under a centring
          `main`, so it shrank to fit its three labels and each tab measured 24px
          wide against a 44px minimum. A control's size should not depend on how
          long its word is.
        */}
        <div className="phone">
        {/* Visually hidden, and still the document's only `<h1>`. The title
            screen draws the wordmark as a styled block rather than as a heading,
            because a screen reader given both would announce the app's name
            twice and offer two headings for one thing. */}
        <h1 className="sr-only">{t('ui.app.title')}</h1>

        {!loaded.ok && <p data-testid="content-broken">{t('ui.content.broken')}</p>}

        {/* One stack, not two independently-fixed siblings. Both notices are
            `position: fixed` at the same coordinates, and their conditions are
            unrelated — a content bundle that failed to load and a pending build
            are exactly the pair that ships together — so two of them landed
            exactly on top of each other and the one underneath became invisible
            and unclickable. */}
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

        {route === 'boot' && <Boot onDone={finishBoot} />}

        {loaded.ok && route === 'home' && (
          <Home
            content={loaded.set}
            presetId={activePreset}
            onPresetChange={setPresetId}
            onPlay={() => setRoute('lobby')}
            onEditRoom={(roomId) => {
              setEditorTarget({ id: roomId })
              setRoute('edit')
            }}
            onNewRoom={() => {
              setEditorTarget({ id: null })
              setRoute('edit')
            }}
          />
        )}

        {loaded.ok && route === 'lobby' && (
          <Lobby
            content={loaded.set}
            source={source}
            presetId={activePreset}
            names={settings.names}
            onNamesChange={(names) => updateSettings({ ...settings, names })}
            onImport={(next) => {
              setSource(next)
              setRevision((r) => r + 1)
            }}
            onStart={() => setRoute('play')}
            onBack={() => setRoute('home')}
          />
        )}

        {loaded.ok && route === 'play' && (
          <MatchHost
            key={`${revision}-${activePreset}`}
            content={loaded.set}
            presetId={activePreset}
            names={settings.names}
            settings={settings}
            onSettingsChange={updateSettings}
            onHome={() => setRoute('home')}
            onEditRoom={() => {
              setEditorTarget({ id: activePreset })
              setRoute('edit')
            }}
            onProgressChange={setMatchInProgress}
          />
        )}

        {loaded.ok && route === 'dex' && <Rules content={loaded.set} onClose={() => setRoute('home')} />}

        {route === 'edit' && (
          <Edit
            // Keyed on the target, so arriving from a DIFFERENT control remounts
            // the editor on the room that control meant. Without the key the
            // second visit would keep whatever the first one left open.
            key={editorTarget === undefined ? 'list' : `room:${editorTarget.id ?? 'new'}`}
            initialRoom={editorTarget}
            source={source}
            onCommit={(next) => {
              setSource(next)
              setRevision((r) => r + 1)
            }}
            // Straight to the board, past the lobby. The child has just spent
            // five steps on this room and the question the button answers is
            // "does it work" — asking them to name two players first is the
            // wrong thing to put between the two. `MatchHost` falls back to the
            // sides' own words when nobody has been named.
            onPlay={(roomId) => {
              if (roomId !== '') setPresetId(roomId)
              setRoute('play')
            }}
          />
        )}

        {/* Three destinations, always in the same place, and absent on the two
            screens that are not destinations. Onboarding has nowhere to go yet,
            and a match is a thing you are IN — a tab bar under the board is an
            invitation to lose the position by accident, which is why leaving
            `play` at all goes through `go` and its confirm. */}
        {TAB_OF[route] && <TabBar active={TAB_OF[route]} onNavigate={go} />}
        </div>
      </main>
    </TranslateContext.Provider>
  )
}
