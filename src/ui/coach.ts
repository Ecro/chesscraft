import { COACH_SEEN_KEY, hasSeen, markSeen } from './onboarding'

/**
 * The home-screen tour's seen-flag, as its existing callers already spell it.
 *
 * The logic moved to `./onboarding` when a second flag appeared — the write
 * probe, the fail-to-"seen" direction, and the zero-quota case are written once
 * there and inherited rather than copy-pasted (and subtly wrong the second
 * time). This file stays because `App.tsx`, `tests/ui/ftue.test.tsx` and
 * `tests/helpers/onboarding.ts` name these three symbols, and a rename would be
 * churn in service of nothing.
 */

export { COACH_SEEN_KEY } from './onboarding'

export function hasSeenCoach(storage: Storage): boolean {
  return hasSeen(storage, COACH_SEEN_KEY)
}

export function markCoachSeen(storage: Storage): void {
  markSeen(storage, COACH_SEEN_KEY)
}
