/**
 * The 12x12 -> 24x24 sprite migration (PLAN-art-grid-resolution, ADR-001 / ADR-005).
 *
 * **This file's pure function is the whole of the migration.** Every sprite in this repo
 * is a hand-authored character table — `src/ui/art/pixels.ts` holds 125 of them and
 * `scripts/spare-sprites.ts` holds 84 of the same drawings again as generator candidates.
 * There is no procedural generator to re-run: `scripts/gen-sprites.ts` SCORES candidates
 * against the gates, it does not draw them. So raising the grid means rewriting 209
 * literal tables, and the only way to do that provably is one function applied to all of
 * them.
 *
 * **A pure upscale is deliberately a visual no-op.** Each cell becomes a k-by-k block, so
 * the silhouette is bit-identical and the picture does not improve — the point is to open
 * the detail budget that Phase 3 and Phase 4 then draw into by hand. Do not read a
 * migrated sheet as a finished result.
 *
 * `upscale` is exported separately from any codemod that applies it so the arithmetic can
 * be tested on its own (`tests/ui/art-upscale.test.ts`); the scaling law it satisfies is
 * what ADR-002 derives the gate constants from.
 */

/**
 * Expand every cell into a `k` by `k` block.
 *
 * Block expansion, never resampling. A sprite is characters indexing a palette, where `.`
 * is transparent and `$` takes the caller's tint — an image resampler would blend those
 * into tones that name nothing, and a nearest-neighbour pass at a non-integer factor would
 * turn a one-cell outline into an alternating one/two-cell edge. Both are why ADR-001
 * chose 24 (an exact 2x) over 16 (4/3, with no lossless path at all).
 *
 * Throws rather than repairing: a ragged table is an authoring mistake, and squaring it
 * silently would bake the mistake into 24 rows instead of 12.
 */
export function upscale(rows: readonly string[], k: number): string[] {
  if (!Number.isInteger(k) || k < 1) {
    throw new Error(`upscale factor must be a positive integer, got ${k}`)
  }

  const width = rows[0]?.length ?? 0
  rows.forEach((row, y) => {
    if (row.length !== width) {
      throw new Error(`ragged sprite: row ${y} is ${row.length} chars but row 0 is ${width}`)
    }
  })

  return rows.flatMap((row) => {
    const widened = [...row].flatMap((cell) => Array<string>(k).fill(cell)).join('')
    // The same widened row k times: vertical expansion is the horizontal one transposed,
    // and doing it by repetition rather than by index arithmetic makes the block-uniform
    // property true by construction instead of by care.
    return Array<string>(k).fill(widened)
  })
}

/* ────────────────────────────────────────────────────────────────────────────
 * The codemod, and the audit that proves it (Phase 2 / Phase 5).
 * ──────────────────────────────────────────────────────────────────────────── */

import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'

/**
 * The two files that hold the same drawings.
 *
 * `pixels.ts` is the shipped sheet; `spare-sprites.ts` re-authors 84 of them as generator
 * candidates, symmetric ones as half-width columns that `mirror` expands. Both migrate
 * through the one function above — if they migrated by different means they could diverge,
 * and the failure would be silent: the generator would score art the sheet does not ship.
 */
export const MIGRATED_FILES = ['src/ui/art/pixels.ts', 'scripts/spare-sprites.ts'] as const

/**
 * A sprite row, as it appears on its own line in the source.
 *
 * Deliberately narrow: whitespace, a quote, only palette characters plus `.` and `$`, a
 * quote, an optional comma, nothing else. Measured against the real files before being
 * trusted — it matches exactly 1500 lines in `pixels.ts` (125 sprites x 12 rows) and
 * exactly 1008 in `spare-sprites.ts` (84 x 12), and zero lines that are words rather than
 * art. `'square'` is six characters of the palette alphabet and WOULD match, which is why
 * the row must be alone on its line: surface arguments never are.
 */
const ROW_LINE = /^(\s*)'([.$a-zA-Z]+)'(,?)\s*$/

/** `'king': [` in the sheet, `sym('helm', …` / `full('urn', …` among the candidates. */
const NAME_LINE = /^\s*'([a-z0-9-]+)':\s*\[|\b(?:sym|full)\('([a-z0-9-]+)'/

export type Block = { name: string; rows: string[] }

/** Every sprite in one source file, in order, with the name it is stored under. */
export function extractBlocks(source: string): Block[] {
  const blocks: Block[] = []
  let pendingName = ''
  let current: Block | null = null

  for (const line of source.split('\n')) {
    const named = NAME_LINE.exec(line)
    if (named) pendingName = named[1] ?? named[2] ?? ''

    const row = ROW_LINE.exec(line)
    if (row) {
      if (!current) {
        current = { name: pendingName, rows: [] }
        blocks.push(current)
      }
      current.rows.push(row[2]!)
    } else if (!named) {
      // A non-row, non-name line ends the block. Name lines do not, because in
      // `spare-sprites.ts` the name and the first row can be one line apart with nothing
      // between them.
      current = null
    }
  }
  return blocks
}

/**
 * Rewrite every sprite row in place, preserving indentation, commas and comments.
 *
 * **Validates before it writes, and the check is not decorative.** `ROW_LINE` matches any
 * lone quoted string of palette characters, and ordinary words qualify — `'square'` is six
 * of them, `'spriteErrors'` is twelve. Being alone on its line is a formatting convention,
 * not a guarantee. So before touching the file this asserts that every matched line belongs
 * to a NAMED sprite block of uniform width, which is a property no stray literal has. A
 * codemod that widened a word into art would produce a file that still compiles.
 */
function applyTo(path: string, k: number): { file: string; rows: number } {
  const source = readFileSync(path, 'utf8')
  const blocks = extractBlocks(source)
  const inBlocks = blocks.reduce((n, b) => n + b.rows.length, 0)
  const matched = source.split('\n').filter((l) => ROW_LINE.test(l)).length
  if (matched !== inBlocks) {
    throw new Error(
      `${path}: ${matched} lines look like sprite rows but only ${inBlocks} sit inside a named ` +
        `block — refusing to rewrite. A stray quoted literal of palette characters is the usual cause.`,
    )
  }
  for (const b of blocks) {
    const widths = new Set(b.rows.map((r) => r.length))
    if (widths.size !== 1) throw new Error(`${path}: sprite '${b.name}' has ragged rows (${[...widths]})`)
    if (!b.name) throw new Error(`${path}: a sprite block has no name — cannot verify it later`)
  }
  console.log(`  ${path}: ${blocks.length} named blocks, ${inBlocks} rows, all accounted for`)

  const out: string[] = []
  let rows = 0
  for (const line of source.split('\n')) {
    const row = ROW_LINE.exec(line)
    if (!row) {
      out.push(line)
      continue
    }
    const [, indent, cells, comma] = row
    rows += 1
    // One source row becomes k rows of k-times-wider cells — the same expansion the pure
    // function performs, applied to text so the file keeps its comments.
    for (const widened of upscale([cells!], k)) out.push(`${indent}'${widened}'${comma}`)
  }
  writeFileSync(path, out.join('\n'))
  return { file: path, rows }
}

/** The pre-migration source of one file, read from an immutable ref. */
function atBaseline(sha: string, path: string): string {
  // NEVER `HEAD`. `HEAD` moves the moment this migration commits, at which point the
  // comparison below degenerates to `upscale(migrated) === migrated` and reports a total
  // failure for a correct migration. The SHA is pinned in the PLAN's frontmatter.
  return execFileSync('git', ['show', `${sha}:${path}`], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 })
}

export type VerifyReport = { checked: number; skipped: string[]; failures: string[]; total: number }

/** Every migrated table must equal the upscale of its pre-migration self. */
export function verify(sha: string, k: number, except: ReadonlySet<string>): VerifyReport {
  const report: VerifyReport = { checked: 0, skipped: [], failures: [], total: 0 }

  for (const path of MIGRATED_FILES) {
    const before = extractBlocks(atBaseline(sha, path))
    const after = extractBlocks(readFileSync(path, 'utf8'))
    report.total += before.length

    if (before.length !== after.length) {
      report.failures.push(`${path}: ${before.length} sprites at baseline, ${after.length} now`)
      continue
    }

    before.forEach((baseline, i) => {
      const current = after[i]!
      const label = `${path}:${baseline.name || `#${i}`}`
      if (baseline.name !== current.name) {
        report.failures.push(`${label}: order changed — now ${current.name || `#${i}`}`)
        return
      }
      // Hand-refined sprites are excluded BY NAME. Loosening the comparison instead would
      // void the audit for every table, which is the whole value it has.
      // `--except` names a sprite, and a sprite can live in BOTH files — so one entry can
      // exempt two independent tables. That is correct when a drawing was refined in both
      // copies and dangerous otherwise, so the reach is REPORTED per file rather than
      // collapsed to a name, and an entry matching nothing is an error (below).
      if (except.has(baseline.name)) {
        report.skipped.push(label)
        return
      }
      report.checked += 1
      const expected = upscale(baseline.rows, k)
      if (current.rows.join('\n') !== expected.join('\n')) {
        report.failures.push(`${label}: not the ${k}x upscale of its baseline`)
      }
    })
  }

  // A typo in `--except` would otherwise silently exempt nothing and read as a clean audit
  // of a table set the caller did not intend. Name it.
  // Every table found must be either checked or skipped. Without this the audit reports a
  // count with nothing to compare it against, and "191 because six sprites are refined in
  // both files" is indistinguishable from "191 because six were wrongly exempted" — a
  // reviewer read it the second way, which is exactly the ambiguity this closes.
  if (report.checked + report.skipped.length !== report.total) {
    report.failures.push(
      `accounting: ${report.total} tables found but ${report.checked} checked + ` +
        `${report.skipped.length} skipped = ${report.checked + report.skipped.length}`,
    )
  }

  const reached = new Set(report.skipped.map((l) => l.split(':').pop()))
  const unused = [...except].filter((n) => !reached.has(n))
  if (unused.length) report.failures.push(`--except matched no table: ${unused.join(', ')}`)

  return report
}

function flag(name: string): string | undefined {
  const i = process.argv.indexOf(name)
  return i === -1 ? undefined : process.argv[i + 1]
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop() ?? '\0')) {
  const k = Number(flag('--factor') ?? 2)

  if (process.argv.includes('--apply')) {
    for (const path of MIGRATED_FILES) {
      const { file, rows } = applyTo(path, k)
      console.log(`  ${file}: ${rows} rows -> ${rows * k} rows at ${k}x`)
    }
  } else if (process.argv.includes('--verify')) {
    const sha = flag('--baseline')
    if (!sha) throw new Error('--verify needs --baseline <sha>; never HEAD, see the PLAN frontmatter')
    const except = new Set((flag('--except') ?? '').split(',').filter(Boolean))
    const { checked, skipped, failures, total } = verify(sha, k, except)
    console.log(`  ${total} tables found: ${checked} checked against ${sha.slice(0, 7)} at ${k}x, ${skipped.length} skipped`)
    if (skipped.length) {
      console.log(`  skipped ${skipped.length} table(s) by name, file-qualified:`)
      for (const l of skipped) console.log(`    ${l}`)
    }
    for (const f of failures) console.error(`  FAIL ${f}`)
    if (failures.length) process.exit(1)
    console.log('  every checked table is the exact upscale of its baseline')
  } else {
    console.error('usage: --apply | --verify --baseline <sha> [--except a,b] [--factor 2]')
    process.exit(2)
  }
}
