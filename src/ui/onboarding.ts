/**
 * Every "has this player been shown around yet" flag, in one place.
 *
 * This module exists because the KEY is the thing that must not be duplicated,
 * and there are now two of them. Three surfaces have to agree on the full list:
 * this module, `tests/helpers/onboarding.ts`, and `playwright.config.ts`'s
 * suite-wide `storageState`. When there was one flag they agreed by accident —
 * the key was a literal in all three. A second flag added the same way leaves
 * both test surfaces silently short, and the failure has no signature: every
 * spec that opens a board lands one tap behind an undismissed sheet and times
 * out on a selector, with nothing in the output naming the cause.
 *
 * So `ONBOARDING_KEYS` is the registry both test surfaces iterate, and a unit
 * test scans `src/ui/` for seen-flag literals and asserts the set matches. A
 * third flag cannot be added without both surfaces picking it up.
 *
 * ## Which way the storage checks fail
 *
 * Both functions swallow their errors, and the direction is the decision worth
 * stating. Failing to "already seen" costs a first-time player their onboarding
 * once; failing the other way costs every returning player, every time.
 * Onboarding is also never worth taking the app down for, which is why neither
 * call is allowed to propagate.
 *
 * The subtle case, and the one the first version of `coach.ts` got wrong: reads
 * and writes do not fail together. A storage with a zero quota lets `getItem`
 * SUCCEED — returning null, because nothing was ever stored — while `setItem`
 * throws. Guarding only the read therefore reproduced exactly the replay-forever
 * loop this module exists to prevent: not-seen on every load, unrecordable on
 * every dismissal. So the check probes whether the flag COULD be written, and a
 * storage that cannot keep the answer is treated as having already given it.
 */

/** The home-screen tour (`Boot.tsx`), shown once per browser. */
export const COACH_SEEN_KEY = 'chess-craft.coach.seen.v1'

/**
 * The in-match sheet, shown on the first board a player ever opens.
 *
 * A separate flag from the coach's rather than a reuse of it: a player who
 * already saw `Boot` before this sheet existed would otherwise never meet it,
 * and that is exactly the population it is for.
 */
export const MATCH_INTRO_SEEN_KEY = 'chess-craft.match-intro.seen.v1'

/** Every flag, for the two test surfaces that must pre-seed all of them. */
export const ONBOARDING_KEYS: readonly string[] = [COACH_SEEN_KEY, MATCH_INTRO_SEEN_KEY]

export function hasSeen(storage: Storage, key: string): boolean {
  try {
    if (storage.getItem(key) !== null) return true
    // A returning player may still have a dismissal flag from the old brand.
    // Reading it avoids replaying onboarding during the namespace migration.
    const legacyKey = key.replace('chess-craft', 'strange-chess')
    if (legacyKey !== key && storage.getItem(legacyKey) !== null) return true
  } catch {
    return true
  }
  // The flag is absent. Whether that means "new player" or "this browser cannot
  // remember anything" is decided by trying, not assumed.
  return !isWritable(storage, key)
}

function isWritable(storage: Storage, key: string): boolean {
  const probe = `${key}.probe`
  try {
    storage.setItem(probe, '1')
    storage.removeItem(probe)
    return true
  } catch {
    return false
  }
}

export function markSeen(storage: Storage, key: string): void {
  try {
    storage.setItem(key, '1')
  } catch {
    // Nothing to do — see the note above on which way this fails.
  }
}
