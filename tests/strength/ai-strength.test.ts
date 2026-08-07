import { describe, expect, it, vi } from 'vitest'

// Hours-scale by design (ADR-011). This suite is excluded from `npm run verify`
// and runs behind `npm run test:strength`.
vi.setConfig({ testTimeout: 3_600_000 })

import { type Player, seedRange, tally } from '../helpers/tournament'
import { shippedContent } from '../helpers/shipped'

/**
 * AC-005 — the difficulty ladder, measured.
 *
 * This is the detector for `declared-but-inert-vocabulary` (recorded four times
 * in this repo): three levels that all play identically would satisfy every
 * other file in the suite while being one opponent wearing three names.
 *
 * It cannot live in `npm run verify`. At the production budget one self-play
 * match is ~30s and the full protocol is hours of CPU; even at the surrogate
 * budget it is tens of minutes. So it runs at `SURROGATE_NODE_BUDGET` in its
 * own suite, and `verify` keeps the sign-only smoke next door (ADR-011).
 *
 * What that buys, and what it does not: the ladder is proven AT THE SURROGATE
 * BUDGET. That the ordering carries to the production budget is an assumption,
 * re-checked once per release in Phase 5 rather than on every commit.
 *
 * `SEEDS` is overridable so a developer can get a signal in a minute instead of
 * half an hour. The default is the SPEC's protocol; a smaller run is a probe,
 * not a pass.
 */

const content = shippedContent()
const SEEDS = Number(process.env.STRENGTH_SEEDS ?? 200)

const ai = (difficulty: 'easy' | 'medium' | 'hard'): Player => ({ kind: 'ai', difficulty })
const random: Player = { kind: 'random' }

interface Pairing {
  name: string
  subject: Player
  reference: Player
  /** Point estimate the subject must clear. */
  threshold: number
}

const PAIRINGS: readonly Pairing[] = [
  { name: 'hard vs medium', subject: ai('hard'), reference: ai('medium'), threshold: 0.58 },
  { name: 'medium vs easy', subject: ai('medium'), reference: ai('easy'), threshold: 0.58 },
  { name: 'easy vs uniform-random', subject: ai('easy'), reference: random, threshold: 0.65 },
]

describe('AC-005 — each level outscores the one below it', () => {
  for (const pairing of PAIRINGS) {
    it(`${pairing.name}: score > ${pairing.threshold} with a 95% CI above 0.50`, () => {
      const result = tally(content, pairing.subject, pairing.reference, seedRange(SEEDS))
      console.log(`[strength] ${pairing.name} ${JSON.stringify(result)}`)

      // Premise: the protocol actually ran, both colours, every seed.
      expect(result.games).toBe(SEEDS * 2)
      // A run where nothing ever finished would be measuring the ply cap rather
      // than either player, and every score would sit at the 0.5 draw default.
      expect(result.unfinished).toBeLessThan(result.games * 0.5)

      expect(result.score).toBeGreaterThan(pairing.threshold)
      expect(result.ciLow).toBeGreaterThan(0.5)
    })
  }
})
