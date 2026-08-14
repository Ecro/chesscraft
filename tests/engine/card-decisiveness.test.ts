import { describe, expect, it } from 'vitest'
import { playOut } from '@engine/agent'
import { BUNDLED_PRESET_ID } from '@content/sets/bundled'
import { shippedContent } from '../helpers/shipped'

/**
 * PLAN Phase 5 (ADR-002) — which cards leave a match undecided.
 *
 * The report: "룰카드 중 승부가 않나거나 모순이 되는것들이 있어서". `card-liveness.test.ts`
 * already observes whether each card CHANGES anything; nothing observes what it does to the
 * OUTCOME. A card can fire correctly, alter the board, and still be the reason a match ends by
 * counting material at the ply cap instead of by anyone winning.
 *
 * This file measures, per rule card:
 *
 * - `capped` — the match ran to the ply cap and was settled by `materialResult`. Nobody won;
 *   the clock did.
 * - `drawn` — settled with no winner at all.
 * - `median` — plies to whatever ending it got.
 *
 * The assertions are against MEASURED values, which is the idiom `card-liveness.test.ts`
 * established here: the suite is green on today's numbers on purpose, and any change to the
 * engine or the card set makes it loud. The suspect list this produces is what Phase 6 plays by
 * hand — a number is a reason to look, not a verdict, which is the whole of ADR-002.
 *
 * Deliberately NOT asserted: a threshold on the cap rate. The shipped set's own baseline is
 * ~54%, so a "must be under X" line drawn today would encode this engine's current balance as a
 * requirement and fail the next honest content change. What IS asserted is the shape: every card
 * is sampled, and the ordering of the worst offenders is pinned so a card getting worse shows up.
 */

const content = shippedContent()
const SEEDS = 600

interface Row {
  card: string
  n: number
  capped: number
  drawn: number
  /** Endings produced by a card's own `win` action, rather than by capture or the clock. */
  wonByCard: number
  median: number
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!
}

interface Sample {
  ruleCardId: string | null
  plies: number
  reason: string
  winner: string
}

const samples: Sample[] = []
for (let seed = 1; seed <= SEEDS; seed += 1) {
  const out = playOut(content, BUNDLED_PRESET_ID, seed)
  samples.push({
    ruleCardId: out.state.ruleCardId,
    plies: out.plies,
    reason: out.result ? out.result.reason : 'unfinished',
    winner: out.result && out.result.kind === 'win' ? out.result.winner : '-',
  })
}

const byCard = new Map<string, Sample[]>()
for (const s of samples) {
  const key = s.ruleCardId ?? '(no rule card)'
  byCard.set(key, [...(byCard.get(key) ?? []), s])
}

const rows: Row[] = [...byCard.entries()]
  .map(([card, group]) => ({
    card,
    n: group.length,
    capped: group.filter((s) => s.reason === 'material_cap').length,
    drawn: group.filter((s) => s.winner === '-').length,
    wonByCard: group.filter((s) => s.reason === 'win_action').length,
    median: median(group.map((s) => s.plies)),
  }))
  // Ranked by MEDIAN, not by cap rate — changed 2026-08-13 with `PLY_CAP` 60 ->
  // 160. The cap rate was the signal while the clock decided a third of every
  // room's matches; it now decides 0-4% of them, so ranking on it sorts noise.
  // Median plies still has real spread (22 to 58) and answers the same question
  // the survey was written to ask: which card's matches drag.
  .sort((a, b) => b.median - a.median)

describe('AC-CARDS — what each rule card does to the outcome (PLAN Phase 5)', () => {
  it('finished every sampled match', () => {
    // First, because a per-card rate computed over unfinished matches is not a measurement.
    expect(samples.filter((s) => s.reason === 'unfinished').length).toBe(0)
  })

  it('drew every rule card in the preset often enough to report on', () => {
    // The self-play suite makes the same demand for the same reason: a card seen twice has no
    // rate. A card missing from this list entirely would silently drop out of the survey.
    const thin = rows.filter((r) => r.n <= 10).map((r) => `${r.card} n=${r.n}`)
    expect(thin).toEqual([])
  })

  it('covers every rule card the room can deal', () => {
    const dealt = new Set(rows.map((r) => r.card))
    const declared = content.presets.get(BUNDLED_PRESET_ID)!.ruleCardIds
    const missing = declared.filter((id) => !dealt.has(id))
    expect(missing, 'a rule card in the preset was never dealt in 600 seeds').toEqual([])
  })

  it('names the cards whose matches run longest', () => {
    // Measured 2026-08-09 over 600 seeds. The four worst are pinned as an ORDERED list, so a
    // card getting worse or better moves it and this fails — which is the signal to re-measure
    // and re-play, not to edit the list. The rates themselves are deliberately not asserted:
    // pinning them would make every content change a failure here.
    const worst = rows.slice(0, 4).map((r) => r.card)
    expect(worst).toEqual(SUSPECTS)
  })

  it('has a card whose own win clause now decides matches, where it used to be unreachable', () => {
    /*
     * The Phase 6 repair, pinned so a revert is loud.
     *
     * `rule.sudden-death` is one clause: the mover wins once the opponent is down to `n` pieces.
     * At `n: 2` that was reached in 1% of 600 measured matches — the card promised an immediate
     * win and delivered three in forty-seven, while reading as one of the strongest in the set.
     * At `n: 4` (14% reachable) its clause actually fires.
     *
     * A count, not a rate, and a floor rather than an equality: the exact number moves with the
     * agent's PRNG and pinning it would make this fail on unrelated engine work. Zero or near-zero
     * is the state that must not come back.
     */
    const row = rows.find((r) => r.card === 'rule.sudden-death')
    expect(row, 'rule.sudden-death was never dealt').toBeDefined()
    expect(row!.wonByCard, 'the win clause has gone unreachable again').toBeGreaterThan(8)
  })

  it('has a set-wide cap rate worth recording next to the per-card ones', () => {
    // Context for the numbers above: without the baseline, "54% capped" reads as a defect in
    // whichever card is being looked at rather than as the set's normal.
    const capped = samples.filter((s) => s.reason === 'material_cap').length
    const rate = capped / samples.length
    expect(rate).toBeGreaterThan(0)
    expect(rate).toBeLessThan(1)
  })
})

/**
 * The four rule cards under whose rule a match runs longest.
 *
 * **Re-measured 2026-08-13 with `PLY_CAP` 60 -> 160**, and the raise changed what
 * this list can even mean. While the cap was 60 the clock decided 25-31% of
 * matches and the ranking was "who rides to the clock"; at 160 it decides 0-4%,
 * so that ranking became a sort over noise. The survey now ranks by MEDIAN
 * PLIES, which still separates the set cleanly and answers the question the cap
 * rate was a proxy for.
 *
 * | rule card | median plies | on the clock |
 * |---|---|---|
 * | `royal-bodyguard` | 57.5 | 3% |
 * | `knights-honour` | 57 | 1% |
 * | `fast-promotion` | 54 | 4% |
 * | `blood-toll` | 53 | 0% |
 * | `last-stand` | 50 | 0% |
 * | `sudden-death` | 49 | 0% |
 * | `conscription` | 45.5 | 0% |
 * | `king-of-the-hill` | 38 | 0% |
 * | `three-check` | 27 | 0% |
 * | `duel` | 23 | 0% |
 * | `blitz` | 22 | 0% |
 *
 * These four are recorded as SUSPECTS and deliberately left alone, for the same
 * reason as before: the assignment is not randomised against a control — which
 * rule card is dealt correlates with which others are in the pool — so part of
 * any difference is the company a card keeps. Changing content on that signal is
 * what `[fail:test] control-arm-is-not-a-control` is recorded here for.
 *
 * `rule.democracy` is absent on purpose: it ships on `preset.covenant` and this
 * survey measures `BUNDLED_PRESET_ID`. Its own decisiveness is UNMEASURED.
 */
const SUSPECTS: string[] = [
  'rule.royal-bodyguard',
  'rule.knights-honour',
  'rule.fast-promotion',
  'rule.blood-toll',
]
