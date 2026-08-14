import type { ContentSet } from '@content/load'
import type { PresetDef } from '@content/schema'
import { playOut } from '@engine/agent'

/**
 * What a record does to a match, measured (PLAN ADR-002).
 *
 * A record's grade is not a price somebody chose — it is the win-rate delta the
 * record produces against a fixed baseline under seeded random self-play. That
 * definition is the whole reason this module exists: for a piece there is a
 * published closed-form value estimate, but for a skill CARD there is none, and
 * any action-weight table would be a developer's invention wearing the word
 * "objective". Measurement is the only index both halves can share, and it puts
 * them in the same unit for free — percentage points of win rate.
 *
 * What it measures is STRUCTURAL strength and nothing else. The agent is
 * uniform-random by construction (`agent.ts`), so a record that is only broken
 * in skilled hands grades as mild. ADR-006 accepts that explicitly; anything
 * built on these numbers has to say so rather than let the word "grade" imply
 * more than was measured.
 */

export type Candidate =
  | { kind: 'piece'; pieceId: string; replaces: string }
  | { kind: 'skill'; skillCardId: string }

export interface Measurement {
  /** Win-rate change in percentage points. Positive = better for the side that brought it. */
  delta: number
  /** Standard error of `delta`, same unit. Paired, so a no-op measures 0 ± 0. */
  stderr: number
  /** Matches per arm. */
  n: number
  /**
   * Whether ANY seed ended differently from its control.
   *
   * This is what separates *inert* from *gentle*, and the separation is not
   * optional: the repo's card survey found 3 of 4 broken cards DID change
   * state — just the wrong state — so a delta near zero is ambiguous on its own.
   * A record that never once moved the final position is broken; a record that
   * moved it and still won nothing is merely mild, and only one of those is a
   * bug to report to its author.
   */
  everChanged: boolean
}

/**
 * How many matches per arm a confirmed grade is measured over.
 *
 * Chosen from the measured noise floor, not from taste. At 200 seeds the paired
 * standard error over bundled content is ~4.2 percentage points, which forces
 * bands ~9pp wide — wide enough that a pawn and a rook land in the same band and
 * ADR-008's replacement rule stops constraining anything. Error falls as
 * 1/sqrt(n), so 600 seeds brings it to ~2.4pp and bands to ~5pp, which separates
 * the shipped pieces into distinct grades.
 *
 * The cost is ~1200 matches, about 2.3s on a development machine and plausibly
 * 7-14s on a phone. That is precisely the wait ADR-005's provisional-then-
 * confirmed design exists to absorb, so buying resolution with it is the trade
 * that design already anticipated.
 */
export const GRADE_SEEDS = 600

export type MeasureOutcome = { ok: true; measurement: Measurement } | { ok: false; reason: string }

export interface MeasureOptions {
  seeds: number
  /**
   * Wall-clock ceiling for the whole measurement.
   *
   * A custom record cannot loop forever — `PLY_CAP` bounds every match at 160
   * plies — but it CAN make each ply expensive: a piece sliding along dozens of
   * vectors multiplies the legal-action set the agent has to build, on every
   * ply, in both arms. Bounding the clock covers that and every other way a
   * pathological record can be slow without needing to guess in advance which
   * shape of record is the slow one.
   */
  budgetMs?: number
}

const DEFAULT_BUDGET_MS = 30_000

/**
 * White's score in one match: 1 for a win, 0.5 for a draw, 0 for a loss.
 *
 * An unfinished match cannot happen — `playOut` runs to the ply cap and the cap
 * itself resolves by material — but if one ever did, scoring it as a draw would
 * quietly average away the case. It is a hard error instead.
 */
function whiteScore(result: ReturnType<typeof playOut>['result']): number {
  if (!result) throw new Error('a self-play match ended with no result; the measurement would be meaningless')
  if (result.kind === 'draw') return 0.5
  return result.winner === 'white' ? 1 : 0
}

/** One arm's per-seed outcome: the score, plus a digest of how the match ended. */
interface Arm {
  scores: number[]
  digests: string[]
}

/**
 * A cheap fingerprint of a finished match.
 *
 * The final position AND the result, because either alone loses a real case: two
 * matches can end on the same board with different results (a win action versus
 * the material cap), and two different boards can share a result.
 */
function digest(out: ReturnType<typeof playOut>): string {
  const squares = [...out.state.board.entries()]
    .map(([square, piece]) => `${square}:${piece.side}:${piece.pieceId}`)
    .sort()
    .join(',')
  const result = out.result ? `${out.result.kind}:${out.result.reason}` : 'none'
  return `${result}|${out.plies}|${squares}`
}

function armFor(content: ContentSet, presetId: string, seeds: number, deadline: number): Arm | null {
  const scores: number[] = []
  const digests: string[] = []
  for (let seed = 1; seed <= seeds; seed += 1) {
    if (Date.now() > deadline) return null
    const out = playOut(content, presetId, seed)
    scores.push(whiteScore(out.result))
    digests.push(digest(out))
  }
  return { scores, digests }
}

function withPreset(content: ContentSet, preset: PresetDef): ContentSet {
  const presets = new Map(content.presets)
  presets.set(preset.id, preset)
  return { ...content, presets }
}

/**
 * The fixed baseline a grade is measured against (ADR-002).
 *
 * Both reference records are REQUIRED, and both matter for the same reason: a
 * measurement must differ from its control in exactly one thing. The piece axis
 * always had this — every piece is graded as a replacement for the reference
 * piece — and the skill axis did not, which is what made its first two
 * implementations wrong in two different ways.
 */
export interface Baseline {
  presetId: string
  /** Every graded piece is measured as a replacement for this one. */
  referencePieceId: string
  /** Every graded skill card is measured as an alternative to this one. */
  referenceSkillCardId: string
}

/**
 * The two content sets one measurement compares.
 *
 * Two corrections are baked into this shape, and both were bugs that passed a
 * green suite:
 *
 * 1. **Both arms carry an explicit white loadout**, and black's is stripped. The
 *    first version used the untouched preset as the control, so a room that
 *    already had a loadout was measured as "candidate INSTEAD OF the existing
 *    loadout" rather than "candidate versus the baseline" — and a preset whose
 *    slot already held the candidate measured 0 ± 0.
 * 2. **Both arms deal a shared pool of the same LENGTH.** `pickDistinct` indexes
 *    with `Math.floor(rng() * pool.length)`, so a pool one card longer re-indexes
 *    every draw from the first one: white's whole opening hand differed between
 *    arms, the paired difference stopped cancelling, and `everChanged` was true
 *    for every skill card whether or not the card did anything. Withholding BOTH
 *    the reference card and the card under measurement from the shared pool, and
 *    appending exactly one of them per arm, keeps the lengths identical and
 *    leaves the loadout slot as the only difference.
 *
 * A candidate that IS the reference therefore measures exactly 0 ± 0 — the
 * origin of the scale, and the one real-measurement fixture guaranteed inert.
 */
function armsFor(
  content: ContentSet,
  baseline: Baseline,
  candidate: Candidate,
): { control: ContentSet; arm: ContentSet } | { error: string } {
  const preset = content.presets.get(baseline.presetId)
  if (!preset) return { error: `no preset ${baseline.presetId}` }
  if (!content.pieces.has(baseline.referencePieceId)) {
    return { error: `baseline piece ${baseline.referencePieceId} is not in this content set` }
  }
  if (!content.skillCards.has(baseline.referenceSkillCardId)) {
    return { error: `baseline skill card ${baseline.referenceSkillCardId} is not in this content set` }
  }

  const refPiece = baseline.referencePieceId
  const refSkill = baseline.referenceSkillCardId
  const measuredCard = candidate.kind === 'skill' ? candidate.skillCardId : null
  const shared = preset.skillCardIds.filter((id) => id !== refSkill && id !== measuredCard)
  const base = { ...preset, skillCardIds: shared }

  const controlSlot = { pieceId: refPiece, replaces: refPiece, skillCardId: refSkill }
  const armSlot =
    candidate.kind === 'piece'
      ? { pieceId: candidate.pieceId, replaces: candidate.replaces, skillCardId: refSkill }
      : { pieceId: refPiece, replaces: refPiece, skillCardId: candidate.skillCardId }

  return {
    control: withPreset(content, { ...base, loadout: { white: controlSlot } }),
    arm: withPreset(content, { ...base, loadout: { white: armSlot } }),
  }
}

function paired(control: Arm, candidate: Arm): Measurement {
  const n = control.scores.length
  const diffs = control.scores.map((c, i) => candidate.scores[i]! - c)
  const mean = diffs.reduce((a, b) => a + b, 0) / n
  // Paired differences, not two independent means: control and candidate run the
  // SAME seeds, so everything the two arms share cancels. That is what lets a
  // no-op measure exactly 0 ± 0 instead of 0 ± noise, which is the only probe
  // that can tell this rig apart from one measuring its own construction.
  const variance = n > 1 ? diffs.reduce((a, d) => a + (d - mean) ** 2, 0) / (n - 1) : 0
  return {
    delta: mean * 100,
    stderr: (Math.sqrt(variance / n) || 0) * 100,
    n,
    everChanged: control.digests.some((d, i) => d !== candidate.digests[i]),
  }
}

export function measureRecord(
  content: ContentSet,
  baseline: Baseline,
  candidate: Candidate,
  opts: MeasureOptions,
): MeasureOutcome {
  // A non-positive seed count would make `paired` divide 0 by 0 and return a NaN
  // delta as a SUCCESS, which the cache would then store as a grade. Refusing is
  // the only honest answer — "measured, and the answer is not a number" is not a
  // state any consumer can act on.
  if (!Number.isInteger(opts.seeds) || opts.seeds < 2) {
    return { ok: false, reason: `a measurement needs at least 2 seeds, got ${String(opts.seeds)}` }
  }

  const deadline = Date.now() + (opts.budgetMs ?? DEFAULT_BUDGET_MS)
  const built = armsFor(content, baseline, candidate)
  if ('error' in built) return { ok: false, reason: built.error }

  const control = armFor(built.control, baseline.presetId, opts.seeds, deadline)
  if (!control) return { ok: false, reason: 'measurement exceeded its time budget' }
  const arm = armFor(built.arm, baseline.presetId, opts.seeds, deadline)
  if (!arm) return { ok: false, reason: 'measurement exceeded its time budget' }

  return { ok: true, measurement: paired(control, arm) }
}

export interface MeasureAllOptions extends MeasureOptions {}

/**
 * Grades every replaceable piece and every skill card in one pass.
 *
 * Nothing is shared between records any more. Each candidate's control withholds
 * that candidate from the shared pool so the two arms stay the same length, which
 * makes the control a function of the candidate — the shared-control shortcut the
 * first version used is exactly what let a pool-length difference through.
 *
 * Royal pieces are absent from the result rather than graded as something.
 * ADR-003 bans `royal` from a loadout slot and ADR-008 refuses to replace one, so
 * a royal piece has no band to match and no slot to occupy; a number for it would
 * be a value nothing may use, which is how a declared-but-unread field starts.
 */
export function measureAll(
  content: ContentSet,
  baseline: Baseline,
  opts: MeasureAllOptions,
): Map<string, MeasureOutcome> {
  const out = new Map<string, MeasureOutcome>()
  const preset = content.presets.get(baseline.presetId)
  if (!preset) return out

  for (const pieceId of preset.pieceIds) {
    if (content.pieces.get(pieceId)?.royal) continue
    out.set(pieceId, measureRecord(content, baseline, { kind: 'piece', pieceId, replaces: baseline.referencePieceId }, opts))
  }
  for (const skillCardId of content.skillCards.keys()) {
    out.set(skillCardId, measureRecord(content, baseline, { kind: 'skill', skillCardId }, opts))
  }
  return out
}
