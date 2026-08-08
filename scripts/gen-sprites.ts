import * as gates from '../src/ui/art/gates.ts'

/**
 * The spare-sprite pipeline (PLAN-preset-content-expansion, ADR-004 + ADR-005).
 *
 * The record form's art picker offers exactly the catalogue entries whose
 * `surface` matches the record being authored. Before this work every one of
 * them was claimed — 6 piece / 5 square / 26 card pictures against exactly that
 * many records — so an author creating a new piece could only steal another
 * piece's picture or fall back to a `?` monogram. This script exists to keep a
 * surplus, and to keep it honest.
 *
 * **It refuses what the suite refuses, by importing the suite's own module.**
 * `GATES` is re-exported so `sprite-generator.test.ts` can assert module
 * IDENTITY. A generator holding its own copy of "12x12, palette-only, at most 60
 * rects" passes a behavioural test the day it is written and drifts afterwards;
 * the first sign of the drift is a committed sprite failing CI.
 *
 * **The sheet aggregate is checked per candidate, not at the end.** `runs <
 * pixels / 1.8` is a property of the WHOLE sheet, so a batch of individually
 * legal noisy sprites breaks it globally — and would break it at commit time,
 * after everything had been drawn. Scoring each candidate against the sheet so
 * far moves that failure to generation time, where it costs one sprite.
 *
 * **What it does not do is decide whether a picture is any good.** ADR-004: a
 * human keeps only the candidates they can name in one word, because an art id
 * must name what the picture depicts (`art.<one-segment>`, never echoing a
 * content id) — a sprite nobody can identify cannot be given a legal id at all.
 *
 * Run it with node's own type stripping, from the repo root:
 *
 *     node --experimental-strip-types scripts/gen-sprites.ts
 */

/** The gate module, re-exported so the suite can pin that it is the same one. */
export const GATES = gates

export type Surface = 'piece' | 'square' | 'card'

/** A sprite offered to the gates. `rows` is 12 rows of 12 characters when valid. */
export type Candidate = {
  name: string
  surface: Surface
  rows: readonly string[]
}

export type Rejection = Candidate & { errors: string[] }

export type GenerateContext = {
  /** The sheet this batch is being added to — the aggregate starts from here. */
  sheet: readonly (readonly string[])[]
  /**
   * Resolves a `tokens.css` custom-property name to its `#rrggbb` value.
   *
   * A resolver rather than a colour list, so the SURFACE decides which
   * backgrounds and tints a candidate is measured against — `generate` reads
   * `candidate.surface` and looks the names up itself. The first version took
   * the colours directly and never read `surface` at all, which meant a card
   * candidate could be cleared against one convenient background while failing
   * the two it actually lands on, and a piece could be measured against a single
   * tint when it is drawn in both. The gates were right and the caller chose
   * their inputs; that is not an enforced invariant, it is a convention.
   */
  token: (name: string) => string
}

export type GenerateResult = {
  accepted: Candidate[]
  rejected: Rejection[]
  /** The sheet after the accepted candidates were folded in. */
  sheet: (readonly string[])[]
}

/**
 * Six authored columns become twelve symmetric ones.
 *
 * Halves the authoring and makes the symmetry exact. Most of what this sheet
 * depicts — shields, crowns, gates, urns, scales — is symmetric anyway, and a
 * hand-drawn near-symmetry reads as a wobble rather than as a decision.
 */
export function mirror(half: readonly string[]): string[] {
  const width = gates.SPRITE_SIZE / 2
  return half.map((row, y) => {
    if (row.length !== width) throw new Error(`row ${y} is ${row.length} chars, a half must be ${width}`)
    return row + [...row].reverse().join('')
  })
}

/**
 * Score every candidate; emit only the ones that clear every gate.
 *
 * Nothing partial is returned to the caller as output — `accepted` is what may
 * be committed and `rejected` carries the reasons. A generator that emitted its
 * best effort with a warning is how a broken sprite reaches a commit.
 */
export function generate(candidates: readonly Candidate[], ctx: GenerateContext): GenerateResult {
  const accepted: Candidate[] = []
  const rejected: Rejection[] = []
  const sheet: (readonly string[])[] = [...ctx.sheet]

  for (const candidate of candidates) {
    const errors = gates.spriteErrors(candidate.name, candidate.rows)

    // Contrast only means something once the shape is valid — a ragged sprite
    // would otherwise report a confusing second failure about its own colours.
    if (errors.length === 0) {
      // The surface picks the backgrounds AND the tints. A piece is drawn in
      // both army colours and stands on every board tone; a painted square only
      // ever appears on a painted square; a card face lands on three panels.
      const backgrounds = gates.SURFACES[candidate.surface].map(ctx.token)
      const tints =
        candidate.surface === 'piece'
          ? [ctx.token('pix-tint-white'), ctx.token('pix-tint-black')]
          : [ctx.token('pix-tint')]
      errors.push(...gates.contrastErrors(candidate.name, candidate.rows, backgrounds, tints))
    }

    // The aggregate, measured with this candidate folded in. Checked last
    // because it is the only rule whose verdict depends on what came before.
    if (errors.length === 0) {
      const { runs, pixels, ok } = gates.sheetCompression([...sheet, candidate.rows])
      if (!ok) {
        errors.push(
          `${candidate.name} pushes the sheet aggregate to ${runs} runs for ${pixels} pixels, ` +
            `over the floor of ${(pixels / gates.SHEET_DIVISOR).toFixed(0)}`,
        )
      }
    }

    if (errors.length === 0) {
      accepted.push(candidate)
      sheet.push(candidate.rows)
    } else {
      rejected.push({ ...candidate, errors })
    }
  }

  return { accepted, rejected, sheet }
}

/** The accepted candidates as the source line a sheet entry is written as. */
export function toSource(candidates: readonly Candidate[]): string {
  return candidates
    .map((c) => `  '${c.name}': [\n${c.rows.map((row) => `    '${row}',`).join('\n')}\n  ],`)
    .join('\n')
}
