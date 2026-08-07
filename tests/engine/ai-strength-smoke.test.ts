import { describe, expect, it, vi } from 'vitest'

vi.setConfig({ testTimeout: 600_000 })

import { type Player, seedRange, tally } from '../helpers/tournament'
import { shippedContent } from '../helpers/shipped'

/**
 * The sign-only half of AC-005, small enough for `npm run verify` (ADR-011).
 *
 * The full tournament next door is the gate; this is the thing that runs on
 * every commit, and it exists because a ladder checked only in a suite nobody
 * runs is a ladder that regresses silently. Its job is to catch a COLLAPSE —
 * the three levels becoming one opponent under three names — not to certify the
 * margins.
 *
 * So it asserts the sign, and it asserts the premise that makes the sign
 * meaningful, and it deliberately does NOT assert AC-005's thresholds: at this
 * sample size the interval is far too wide to say anything about 0.58, and a
 * threshold that flaps would train everyone to re-run until green.
 */

const content = shippedContent()
const SEEDS = 12

const ai = (difficulty: 'easy' | 'medium' | 'hard'): Player => ({ kind: 'ai', difficulty })

describe('AC-005 smoke — the levels have not collapsed into each other', () => {
  it('the easiest level still beats the uniform-random fixture', () => {
    // The floor, and the sharpest signal available cheaply: a search that had
    // stopped searching would land near 0.5 here.
    const result = tally(content, ai('easy'), { kind: 'random' }, seedRange(SEEDS))
    console.log(`[strength-smoke] easy vs random ${JSON.stringify(result)}`)
    expect(result.games).toBe(SEEDS * 2)
    expect(result.score).toBeGreaterThan(0.5)
  })

  it('the hardest level does not lose to the easiest', () => {
    const result = tally(content, ai('hard'), ai('easy'), seedRange(SEEDS))
    console.log(`[strength-smoke] hard vs easy ${JSON.stringify(result)}`)
    // `>=` rather than `>`: at 24 games a genuine advantage can still tie, and
    // the claim being made here is "not inverted", not "measurably ahead".
    expect(result.score).toBeGreaterThanOrEqual(0.5)
  })

  it('the three levels are not the same agent wearing three names', () => {
    // The `declared-but-inert-vocabulary` detector, stated directly: if every
    // level produced identical play, every pairing above would sit at exactly
    // 0.5 and both assertions would still pass on the `>=`.
    const hardVsEasy = tally(content, ai('hard'), ai('easy'), seedRange(SEEDS))
    const mediumVsEasy = tally(content, ai('medium'), ai('easy'), seedRange(SEEDS))
    expect([hardVsEasy.score, mediumVsEasy.score].some((s) => s !== 0.5)).toBe(true)
  })
})
