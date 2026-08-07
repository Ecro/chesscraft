import type { Measurement, MeasureOutcome } from './measure'

/**
 * Turning a measured delta into a grade (PLAN Phase 3, ADR-004, ADR-008).
 *
 * The band width is DERIVED from the measurements it will be applied to, never
 * chosen. A band narrower than the noise would sort two identical records into
 * different grades on a re-run, which is worse than a coarse scale: the player
 * would watch a grade change for no reason they can see. Width is therefore
 * twice the worst standard error in the distribution — the smallest step at
 * which two adjacent bands are telling the truth about being different.
 *
 * Resolution is bought with seed count, not with a narrower band: see
 * `GRADE_SEEDS` in `measure.ts` for why 600 and not 200.
 */

export interface BandScale {
  /** Grade step, in win-rate percentage points. */
  width: number
}

/**
 * Rounded up to a whole point.
 *
 * Whole rather than fractional because a band's representative value IS what the
 * budget charges, and `loadoutBudget` is an integer — a scale in halves would
 * make every cost a float compared against a whole number, which is a rounding
 * argument waiting to happen in the one place the player is told a rule.
 */
function roundUpToWhole(x: number): number {
  return Math.ceil(x)
}

/**
 * The scale a set of measurements supports.
 *
 * Uses the WORST standard error rather than the average: the scale has to be
 * honest about its least certain record, and averaging would let a crowd of
 * cheap-to-measure records license a band width that a noisy one cannot carry.
 */
export function bandScaleFrom(outcomes: Iterable<MeasureOutcome>): BandScale {
  let worst = 0
  for (const outcome of outcomes) {
    if (outcome.ok) worst = Math.max(worst, outcome.measurement.stderr)
  }
  // A floor, because a distribution of pure no-ops has zero error and a zero
  // width would make every band boundary a division by zero.
  return { width: Math.max(1, roundUpToWhole(2 * worst)) }
}

/** Which band a delta falls in. Band 0 straddles zero, so "changes nothing" is the origin. */
export function bandOf(delta: number, scale: BandScale): number {
  return Math.round(delta / scale.width)
}

/**
 * What the budget charges for a record (ADR-004, revised).
 *
 * The band's representative value, not the raw delta. Two records the UI calls
 * the same grade must cost the same, or the answer to "why does my B-grade
 * leave less skill budget than yours?" is a number the player cannot see.
 */
export function bandValue(delta: number, scale: BandScale): number {
  return bandOf(delta, scale) * scale.width
}

/**
 * Inert, gentle, or graded.
 *
 * `inert` is decided by whether the record ever changed a match at all, NOT by
 * its delta being small. The repo's card survey found 3 of 4 broken cards did
 * change state — the wrong state — so "the number is near zero" cannot tell a
 * dead record from a mild one, and only one of the two is something to tell an
 * author about.
 */
export type Liveness = 'inert' | 'gentle' | 'graded'

export function classify(measurement: Measurement): Liveness {
  if (!measurement.everChanged) return 'inert'
  return Math.abs(measurement.delta) <= measurement.stderr ? 'gentle' : 'graded'
}
