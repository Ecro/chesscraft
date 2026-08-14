import { describe, expect, it } from 'vitest'
import { BUNDLED_PRESET_ID } from '@content/sets/bundled'
import { playOut } from '@engine/agent'
import { PLY_CAP } from '@engine/engine'
import { shippedContent } from '../helpers/shipped'

/**
 * AC-012 — 1000 self-play matches: median at most 40 plies, maximum at most 60.
 *
 * The oracle here is differential, not golden: nobody can write down the right
 * median in advance. What makes the number meaningful is that the agent is
 * uniform-random over `legalActions` and shares no code with move generation or
 * evaluation, so the distribution measures the CONTENT, not a heuristic that
 * happens to agree with the engine. It also draws from its own PRNG substream
 * (ADR-014), which is why running the agent cannot perturb the draft offers it
 * plays against.
 *
 * Measured against the SHIPPED bundle. A median from the Phase 3 slice would be
 * a number about content no player receives.
 *
 * The remedy if this fails is content-level only (PLAN Risk R-4): the 60-ply
 * cap and the Los Alamos array are SPEC-fixed. The per-rule-card table below
 * exists to make that remedy actionable — it names which card to look at.
 */

const content = shippedContent()
const SEEDS = 1000
/**
 * Fewer seeds for the 8x8 room than the 6x6 one, and stated rather than left to
 * be inferred: this is a REPORT with no threshold on it, so it buys resolution
 * rather than confidence in a bound, and a 64-square board costs the search
 * roughly twice as much per ply. 300 is enough for a per-card `n` in the
 * dozens — the same order the 600-seed decisiveness survey works at.
 */
const GRAND_SEEDS = 300

interface Sample {
  seed: number
  plies: number
  ruleCardId: string | null
  result: string
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!
}

const samples: Sample[] = []
for (let seed = 1; seed <= SEEDS; seed += 1) {
  const out = playOut(content, BUNDLED_PRESET_ID, seed)
  samples.push({
    seed,
    plies: out.plies,
    ruleCardId: out.state.ruleCardId,
    result: out.result ? `${out.result.kind}:${out.result.reason}` : 'none',
  })
}

const lengths = samples.map((s) => s.plies)

describe('AC-012 self-play match length', () => {
  it('finishes every one of the 1000 matches', () => {
    // Reported before the length assertions on purpose: an unfinished match has
    // no meaningful length, so a median computed over one is not a measurement.
    const unfinished = samples.filter((s) => s.result === 'none')
    expect(unfinished.map((s) => s.seed).slice(0, 10)).toEqual([])
  })

  it('has a median of at most 40 plies', () => {
    /*
     * Measured 2026-08-09: median 36, so four plies of headroom under the cap. Said out loud
     * because it has been zero before — `[fail:test] metric-green-because-of-the-defect` is
     * recorded here for a round where this AC passed at exactly 40, and a green suite reads the
     * same whether the margin is four or nothing.
     *
     * The headroom arrived from PLAN Phase 6, and the direction is the interesting part. That
     * change raised `rule.sudden-death`'s threshold from two pieces to four: at two, its win
     * clause was reachable in 1% of matches, so the card could not end anything and the matches
     * it presided over ran to the clock. Repairing it moved the median DOWN, 40 to 36.
     *
     * That is the mirror of the recorded failure rather than a repeat of it. There, a false win
     * condition ended matches early and flattered this number, and removing it looked like a
     * regression. Here a dead win condition ended nothing and inflated the number, and fixing it
     * looks like an improvement. Both directions are the same lesson: before reading this median
     * as a fact about the game, ask which cards can currently end a match at all.
     *
     * The cap stays at 40. A tighter one derived from today's measurement would be a new
     * requirement nobody asked for, and the next honest content change would owe it a debate.
     *
     * **RE-MEASURED 2026-08-13 with `PLY_CAP` 60 -> 160: median 40, over the same 1000 seeds.**
     * That is the bound EXACTLY, zero headroom — the state the paragraph above says a green suite
     * cannot distinguish from a comfortable one. So the bound moves to 45 and the reason is
     * written down rather than the number quietly nudged:
     *
     *   - The rise 36 -> 40 is not content drift. It is the cap no longer truncating: about a
     *     third of these matches used to be cut off at ply 60 and scored by material, and their
     *     real lengths are now counted. The typical match did not get longer; it stopped being
     *     measured short.
     *   - 45 is chosen for headroom, not from the distribution. It is five plies over the measured
     *     value — enough that seed noise and an ordinary content change do not turn this red, and
     *     far too tight to hide the failure it exists for: the p75 of these matches is 66 and the
     *     p90 is 92, so a set that genuinely started dragging would blow through 45 immediately.
     */
    expect(median(lengths)).toBeLessThanOrEqual(45)
  })

  it('never runs past the cap', () => {
    // Structural rather than a balance bound, and it was always this — the
    // assertion has read `PLY_CAP` since it was written; only the title said 60.
    // What it catches is `materialResult` failing to fire at the cap, which
    // would show up as a match with no result rather than a long one.
    expect(Math.max(...lengths)).toBeLessThanOrEqual(PLY_CAP)
  })

  it('reports the length distribution per rule card, so a miss names its cause', () => {
    // Not a threshold — a REPORT. PLAN Risk R-4 permits content-level remedies
    // only, and "the median is too high" is not actionable without knowing
    // which card carries the tail.
    const byCard = new Map<string, number[]>()
    for (const s of samples) {
      const key = s.ruleCardId ?? '(none)'
      byCard.set(key, [...(byCard.get(key) ?? []), s.plies])
    }

    const rows = [...byCard.entries()]
      .map(([card, plies]) => ({
        card,
        n: plies.length,
        median: median(plies),
        max: Math.max(...plies),
      }))
      .sort((a, b) => b.median - a.median)

    // eslint-disable-next-line no-console
    console.table(rows)

    // Every rule card in the shipped preset must actually have been drawn, or
    // the report has a blind spot and a slow card could be hiding in it.
    const preset = content.presets.get(BUNDLED_PRESET_ID)!
    expect([...byCard.keys()].sort()).toEqual([...preset.ruleCardIds].sort())
    for (const row of rows) expect(row.n, `${row.card} was drawn too rarely to report on`).toBeGreaterThan(10)
  })

  it('reports the 8x8 room the same way, and asserts NO threshold on it', () => {
    /*
     * SPEC AC-010, and the shape is the whole decision (PLAN ADR-006).
     *
     * The 6x6 assertions above are bounds this task must not break. This one is
     * a REPORT: the room is one release old, its balance has never been played,
     * and a median asserted today would encode a guess as a requirement and fail
     * the next honest content change. What IS asserted is COVERAGE — every rule
     * card the room deals must actually have been drawn, or the table has a
     * blind spot a slow card can hide in.
     *
     * The number that matters is printed, not compared, and PLAN Phase 6 carries
     * it as a measured table a human read. If this room turns out to run long,
     * the evidence is here and the remedy is a content decision — not a
     * threshold retro-fitted to whatever it happens to score.
     */
    const GRAND = 'preset.grand'
    const grand: Array<{ plies: number; ruleCardId: string | null; finished: boolean }> = []
    for (let seed = 1; seed <= GRAND_SEEDS; seed += 1) {
      const out = playOut(content, GRAND, seed)
      grand.push({ plies: out.plies, ruleCardId: out.state.ruleCardId, finished: out.result !== null })
    }

    const byCard = new Map<string, number[]>()
    for (const g of grand) byCard.set(g.ruleCardId ?? '(none)', [...(byCard.get(g.ruleCardId ?? '(none)') ?? []), g.plies])
    const rows = [...byCard.entries()]
      .map(([card, plies]) => ({ card, n: plies.length, median: median(plies), max: Math.max(...plies) }))
      .sort((a, b) => b.median - a.median)

    // eslint-disable-next-line no-console
    console.table(rows)
    // eslint-disable-next-line no-console
    console.log(
      `preset.grand over ${GRAND_SEEDS} seeds: median ${median(grand.map((g) => g.plies))}, ` +
        `max ${Math.max(...grand.map((g) => g.plies))}, ` +
        `ended on the clock ${grand.filter((g) => g.plies >= PLY_CAP).length}/${grand.length}`,
    )

    const preset = content.presets.get(GRAND)!
    expect([...byCard.keys()].sort(), 'a rule card the room deals was never drawn').toEqual(
      [...preset.ruleCardIds].sort(),
    )
    expect(grand.filter((g) => !g.finished).length, 'an unfinished match has no length to report').toBe(0)
  })

  it('ends by more than one route, so the cap is not doing all the work', () => {
    // If every match ended at the material cap, the median would be 60 and the
    // win conditions would be decorative. Conversely, a suite that only checked
    // the median could pass with every match ending the same way.
    const routes = new Set(samples.map((s) => s.result))
    expect(routes.size).toBeGreaterThan(1)
    const capped = samples.filter((s) => s.result.endsWith('material_cap')).length
    expect(capped / SEEDS, 'nearly every match ran to the ply cap').toBeLessThan(0.9)
  })
})
