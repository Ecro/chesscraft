/**
 * Player preferences that survive a reload (PLAN Phase 5).
 *
 * `Storage` is a parameter, not a module-level `localStorage` read — the same
 * choice `src/editor/storage.ts` and `src/ui/coach.ts` made, and for the same
 * reason: it is what makes the refusing-browser path reachable in a test.
 *
 * The defaults are a decision, not an oversight. Sound starts OFF because the
 * first thing this app has to survive is being opened in a classroom, and a
 * game that announces itself gets closed. Haptics start ON because a buzz is
 * private to the hand holding the phone.
 *
 * Failure direction: a storage that cannot be read or written yields the
 * defaults and swallows the error. Preferences are not worth taking the app
 * down for, and unlike the coach flag there is no replay-forever trap here —
 * the cost of forgetting is that a player re-flips one switch.
 */

export const SETTINGS_KEY = 'strange-chess.settings.v1'

export interface Settings {
  sound: boolean
  haptics: boolean
}

export const DEFAULT_SETTINGS: Settings = { sound: false, haptics: true }

export function loadSettings(storage: Storage): Settings {
  try {
    const raw = storage.getItem(SETTINGS_KEY)
    if (!raw) return { ...DEFAULT_SETTINGS }
    const parsed = JSON.parse(raw) as Partial<Settings>
    return {
      sound: typeof parsed.sound === 'boolean' ? parsed.sound : DEFAULT_SETTINGS.sound,
      haptics: typeof parsed.haptics === 'boolean' ? parsed.haptics : DEFAULT_SETTINGS.haptics,
    }
  } catch {
    // Unreadable storage or a value someone hand-edited into nonsense — either
    // way the defaults are a better answer than a crash on the home screen.
    return { ...DEFAULT_SETTINGS }
  }
}

export function saveSettings(storage: Storage, settings: Settings): void {
  try {
    storage.setItem(SETTINGS_KEY, JSON.stringify(settings))
  } catch {
    // See the note above on which way this fails.
  }
}
