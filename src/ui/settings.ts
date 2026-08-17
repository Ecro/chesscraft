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

export const SETTINGS_KEY = 'chess-craft.settings.v1'
const LEGACY_SETTINGS_KEY = 'strange-chess.settings.v1'

/** How long a player may make their name. Long enough for a nickname, short
 *  enough that the turn bar and the hand-off curtain cannot be overflowed. */
export const MAX_NAME_LENGTH = 8

export interface Settings {
  sound: boolean
  haptics: boolean
  /**
   * What the two hot-seat players are called (Chess Craft redesign).
   *
   * Persisted, and that is the point: the same two children play on the same
   * phone over and over, and re-typing both names before every match is exactly
   * the friction that makes a lobby screen feel like a form. An empty string is
   * a legitimate stored value meaning "never set" — the UI falls back to the
   * side's own name from the locale bundle rather than showing a blank chip, so
   * nothing here has to invent a default person.
   *
   * Not in the content document. A name is about who is holding the phone, and
   * `ContentSource` is about what the game IS — putting it there would ship a
   * child's nickname inside every exported room code.
   */
  names: { white: string; black: string }
}

/**
 * `theme` used to live here. Chess Craft is single-theme (see `tokens.css`), so
 * the field, the toggle in the nav and the `data-theme` layers all went at once.
 * A stored value from an older build is simply ignored by the reader below —
 * which is the same thing it already did for anything it did not recognise.
 */
export const DEFAULT_SETTINGS: Settings = { sound: false, haptics: true, names: { white: '', black: '' } }

/** Trims, caps the length, and refuses anything that is not a string. */
function readName(value: unknown): string {
  return typeof value === 'string' ? value.trim().slice(0, MAX_NAME_LENGTH) : ''
}

export function loadSettings(storage: Storage): Settings {
  try {
    const raw = storage.getItem(SETTINGS_KEY) ?? storage.getItem(LEGACY_SETTINGS_KEY)
    if (!raw) return structuredClone(DEFAULT_SETTINGS)
    const parsed = JSON.parse(raw) as Partial<Settings>
    const names = (parsed.names ?? {}) as Partial<Settings['names']>
    return {
      sound: typeof parsed.sound === 'boolean' ? parsed.sound : DEFAULT_SETTINGS.sound,
      haptics: typeof parsed.haptics === 'boolean' ? parsed.haptics : DEFAULT_SETTINGS.haptics,
      // Read through `readName` rather than trusted: this value is rendered into
      // the turn bar and the hand-off curtain, and a hand-edited storage entry
      // holding a number or a thousand characters should degrade to "unnamed"
      // rather than break the layout it lands in.
      names: { white: readName(names.white), black: readName(names.black) },
    }
  } catch {
    // Unreadable storage or a value someone hand-edited into nonsense — either
    // way the defaults are a better answer than a crash on the home screen.
    // Cloned, not spread: `names` is nested, and a shallow copy would hand every
    // caller the same object to mutate.
    return structuredClone(DEFAULT_SETTINGS)
  }
}

export function saveSettings(storage: Storage, settings: Settings): void {
  try {
    storage.setItem(SETTINGS_KEY, JSON.stringify(settings))
  } catch {
    // See the note above on which way this fails.
  }
}
