import { COACH_SEEN_KEY } from '../../src/ui/coach'

/**
 * Marks onboarding as already seen, so a test lands on the title screen.
 *
 * The app opens on `boot` for anyone whose browser has no record of having been
 * here — that is the whole point of the screen, and it means every test that
 * mounts `<App />` to look at something else now starts one tap away from it.
 *
 * A helper rather than a `localStorage.setItem` in each file, because the KEY is
 * the thing that must not be duplicated: it is versioned (`…seen.v1`), and a
 * bump would otherwise leave a dozen tests silently onboarding again and
 * failing on selectors that are one screen away.
 *
 * `beforeEach` in the calling file, not here. A test that wants to SEE
 * onboarding — `ftue.test.tsx` — must be able to not call it.
 */
export function skipOnboarding(): void {
  localStorage.setItem(COACH_SEEN_KEY, '1')
}
