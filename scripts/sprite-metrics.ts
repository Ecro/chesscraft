/**
 * The three properties a sprite needs that `gates.ts` cannot see, plus a CLI to score
 * candidates against them (PLAN-art-grid-resolution Phase 4).
 *
 * `gates.ts` reads a sprite's CHARACTERS. That is a complete account of shape and palette
 * and a badly incomplete account of whether a drawing works at the size the board draws it.
 * These three closed the two holes that actually cost this project a round each:
 *
 * - **`subBlockDetail`** — art drawn at 12x12 and doubled has every aligned 2x2 block
 *   uniform. It passes every gate in `gates.ts` and adds nothing the mechanical migration
 *   had not already delivered. Three sprites shipped that way before this existed.
 * - **`outlineShare`** — and then optimising for the metric above produced one-cell
 *   outlines, which at 1.4 device pixels per cell stop occupying the rendered probe's
 *   bottom decile. Nine board squares failed `e2e/art-rendered-contrast.spec.ts` while the
 *   character gate stayed green. The two metrics pull in opposite directions ON PURPOSE:
 *   detail in the interior, mass on the silhouette.
 * - **`tintShare`** — a piece whose silhouette carries little `$` renders nearly the same
 *   for both armies, which is the distinction ADR-007 exists to protect.
 *
 * `tests/ui/art-refined-pieces.test.ts` enforces them on the twelve bundled piece sprites.
 * Run the CLI while drawing:
 *
 *     node --experimental-strip-types scripts/sprite-metrics.ts --current king pawn
 *     node --experimental-strip-types scripts/sprite-metrics.ts candidates.json --show
 */
import { readFileSync } from 'node:fs'
import * as G from '../src/ui/art/gates.ts'
import { PIXEL_SPRITES } from '../src/ui/art/pixels.ts'
import { mirror } from './gen-sprites.ts'

const TOKENS = readFileSync('src/ui/tokens.css', 'utf8')
const tok = (n: string) => new RegExp(`--${n}:\\s*(#[0-9a-fA-F]{6})`).exec(TOKENS)![1]!.toLowerCase()
const BG = G.SURFACES.piece.map(tok)
const TINTS = [tok('pix-tint-white'), tok('pix-tint-black')]

/**
 * How much of the drawing lives BELOW the 2x2 block a mechanical upscale produces.
 *
 * The whole point of the resolution change: a sprite drawn at 12 and doubled has every
 * aligned 2x2 block uniform, so this reads 0% and the sprite adds nothing Phase 2 did not
 * already deliver. The two hand-refined references score 51% (king) and 32% (pawn).
 */
export function subBlockDetail(rows: string[]): number {
  let total = 0
  let mixed = 0
  for (let y = 0; y < rows.length; y += 2) {
    for (let x = 0; x < rows[0]!.length; x += 2) {
      const cells = new Set([rows[y]![x], rows[y]![x + 1], rows[y + 1]![x], rows[y + 1]![x + 1]])
      total += 1
      if (cells.size > 1) mixed += 1
    }
  }
  return (100 * mixed) / total
}

/**
 * Share of ink that is the dark outline — the thing that actually carries board legibility.
 *
 * `e2e/art-rendered-contrast.spec.ts` rasterises a mark at its real size and takes the 10th
 * and 90th percentile of every pixel that differs from the backdrop. The outline is what
 * puts the 10th percentile down where it clears the floor. Trade outline mass away for
 * interior detail and the p10 rises into blended mid-tones, and the mark fails as RENDERED
 * while still passing the character-level gate — the exact split
 * `[fail:test] measured-the-artifact-not-the-rendering` is about.
 *
 * The floor is 35%: the pre-migration sheet ran 41-59% for these pieces, the untouched
 * controls still do (bomb 42.6%, portal 36.6%, shrine 64.9%), and the first refinement pass
 * dropped some to 14.5% and broke the rendered gate on nine squares.
 */
export const outlineShare = (rows: string[]) =>
  (100 * rows.join('').split('').filter((c) => c === 'o').length) / G.drawnPixels(rows)

/** Cells that take the side tint. A silhouette with none of it looks the same for both armies. */
export const tintShare = (rows: string[]) =>
  (100 * rows.join('').split('').filter((c) => c === '$').length) / G.drawnPixels(rows)

export function report(name: string, full: string[], show: boolean) {
  const errs = G.spriteErrors(name, full)
  const worst = errs.length ? Number.NaN : Math.min(...BG.flatMap((b) => TINTS.map((t) => G.bestEdge(full, t, b))))
  const detail = errs.length ? Number.NaN : subBlockDetail(full)
  const tint = errs.length ? Number.NaN : tintShare(full)
  const outline = errs.length ? Number.NaN : outlineShare(full)
  const ok = errs.length === 0 && worst >= G.BOARD_MIN && detail >= 20 && tint >= 30 && outline >= 35
  console.log(
    `${ok ? 'PASS' : 'FAIL'} ${name.padEnd(11)} runs=${String(G.rectCount(full)).padStart(3)}/${G.RECT_CAP}` +
      ` worstEdge=${Number.isNaN(worst) ? '  -  ' : worst.toFixed(2)}/${G.BOARD_MIN}` +
      ` subBlockDetail=${Number.isNaN(detail) ? ' -  ' : detail.toFixed(1).padStart(4)}%/20%` +
      ` tint=${Number.isNaN(tint) ? ' -  ' : tint.toFixed(1).padStart(4)}%/30%` +
      ` outline=${Number.isNaN(outline) ? ' -  ' : outline.toFixed(1).padStart(4)}%/35%` +
      (errs.length ? `  ${errs.join(' | ')}` : ''),
  )
  if (show) for (const r of full) console.log('   |' + r.replace(/\./g, ' ') + '|')
}

// The CLI runs only when this file IS the entry point. Without this the block below
// executed on plain `import` too, so a test that wanted the metrics got the usage error
// instead of the functions.
if (process.argv[1]?.endsWith('sprite-metrics.ts')) {
  const args = process.argv.slice(2)
  const show = args.includes('--show')
  const current = args.indexOf('--current')
  if (current !== -1) {
    // What this sprite looks like RIGHT NOW (the 2x-migrated form you are refining).
    for (const n of args.slice(current + 1).filter((a) => !a.startsWith('--'))) {
      report(n, PIXEL_SPRITES[n as never] as string[], true)
    }
  } else {
    // A JSON file of candidates: { "<name>": { "half": [12 x 12ch] } | { "rows": [24 x 24ch] } }
    const file = args.find((a) => !a.startsWith('--'))
    if (!file) throw new Error('usage: _probe-sprite.ts <candidates.json> [--show]  |  --current <name>...')
    const cands: Record<string, { half?: string[]; rows?: string[] }> = JSON.parse(readFileSync(file, 'utf8'))
    for (const [name, c] of Object.entries(cands)) {
      if (c.half) {
        if (c.half.length !== 24) throw new Error(`${name}: half must be 24 rows, got ${c.half.length}`)
        c.half.forEach((r, i) => {
          if (r.length !== 12) throw new Error(`${name}: half row ${i} is ${r.length} chars, must be 12`)
        })
      }
      report(name, c.half ? mirror(c.half) : c.rows!, show)
    }
  }
}
