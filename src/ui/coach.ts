/**
 * The "has this player been shown around yet" flag (PLAN Phase 3).
 *
 * Storage is a parameter rather than a module-level `localStorage` read, the
 * same choice `src/editor/storage.ts` made and for the same reason: it is what
 * makes the refusing-browser path reachable in a test instead of a story.
 *
 * Both functions swallow their errors, and the direction they fail in is the
 * decision worth stating. Failing to "already seen" costs a first-time player
 * their coach marks once; failing the other way costs every returning player,
 * every time. Onboarding is also never worth taking the app down for, which is
 * why neither call is allowed to propagate.
 *
 * The subtle case, and the one the first version of this file got wrong: reads
 * and writes do not fail together. A storage with a zero quota lets `getItem`
 * SUCCEED — returning null, because nothing was ever stored — while `setItem`
 * throws. Guarding only the read therefore reproduced exactly the replay-forever
 * loop this module exists to prevent: not-seen on every load, unrecordable on
 * every dismissal. So the check probes whether the flag COULD be written, and a
 * storage that cannot keep the answer is treated as having already given it.
 */

export const COACH_SEEN_KEY = 'strange-chess.coach.seen.v1'

export function hasSeenCoach(storage: Storage): boolean {
  try {
    if (storage.getItem(COACH_SEEN_KEY) !== null) return true
  } catch {
    return true
  }
  // The flag is absent. Whether that means "new player" or "this browser cannot
  // remember anything" is decided by trying, not assumed.
  return !isWritable(storage)
}

function isWritable(storage: Storage): boolean {
  const probe = `${COACH_SEEN_KEY}.probe`
  try {
    storage.setItem(probe, '1')
    storage.removeItem(probe)
    return true
  } catch {
    return false
  }
}

export function markCoachSeen(storage: Storage): void {
  try {
    storage.setItem(COACH_SEEN_KEY, '1')
  } catch {
    // Nothing to do — see the note above on which way this fails.
  }
}
