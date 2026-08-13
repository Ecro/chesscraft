import { ONBOARDING_KEYS } from '../../src/ui/onboarding'

/**
 * Marks every onboarding surface as already seen, so a test lands on the screen
 * it is actually about.
 *
 * The app opens on `boot` for anyone whose browser has no record of having been
 * here, and the first board opens behind a rule sheet for the same reason —
 * which is the whole point of both, and it means every test that mounts `<App/>`
 * to look at something else now starts one or two taps away from them.
 *
 * Iterating `ONBOARDING_KEYS` rather than naming a key, because the LIST is the
 * thing that must not be duplicated: it is versioned (`…seen.v1`), it has grown
 * once already, and a flag added without a matching line here would leave a
 * dozen tests silently onboarding again and failing on selectors one screen
 * away — with nothing in the output pointing at the cause.
 *
 * `beforeEach` in the calling file, not here. A test that wants to SEE
 * onboarding — `ftue.test.tsx`, `match-intro.test.tsx` — must be able to not
 * call it.
 */
export function skipOnboarding(): void {
  for (const key of ONBOARDING_KEYS) localStorage.setItem(key, '1')
}
