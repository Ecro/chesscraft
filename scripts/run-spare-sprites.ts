import { readFileSync } from 'node:fs'
import { PIXEL_SPRITES } from '../src/ui/art/pixels.ts'
import { type Candidate, GATES, generate, toSource } from './gen-sprites.ts'
import { RECORD_ART, SPARES } from './spare-sprites.ts'

/**
 * Run the spare batch through the gates and print what may be committed.
 *
 *     node --experimental-strip-types scripts/run-spare-sprites.ts
 *
 * Reading `tokens.css` lives here rather than in the gate module: ADR-021 keeps
 * `tokens.css` the only place a colour is named, and the gates stay free of the
 * filesystem so the same predicates run in a browser test.
 *
 * The already-shipped sheet seeds the aggregate, because `runs < pixels / 1.8`
 * is a property of the whole sheet and a spare has to be affordable against what
 * is already there — not against an empty page.
 */

const TOKENS = readFileSync(new URL('../src/ui/tokens.css', import.meta.url), 'utf8')

function token(name: string): string {
  const m = new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`).exec(TOKENS)
  if (!m) throw new Error(`no --${name} in tokens.css`)
  return m[1]!.toLowerCase()
}

// Seed from what is already committed, MINUS anything this batch is about to
// re-offer. Without the subtraction a re-run after a commit counts every spare
// twice and reports an aggregate that describes no real sheet — the script is a
// regeneration tool, so being run against its own output is the normal case.
const batch = [...SPARES, ...RECORD_ART]
const reoffered = new Set(batch.map((c) => c.name))
const sheet: (readonly string[])[] = Object.entries(PIXEL_SPRITES)
  .filter(([name]) => !reoffered.has(name))
  .map(([, rows]) => rows)
const accepted: Candidate[] = []
const rejected: { name: string; errors: string[] }[] = []

// One candidate at a time, so the running sheet carries every acceptance —
// including the ones from other surfaces. The aggregate does not care which
// surface a sprite is for.
for (const candidate of batch) {
  // Only the sheet and the token resolver — which backgrounds and which tints
  // this candidate must clear is the generator's decision, read off its surface.
  const out = generate([candidate], { sheet, token })
  if (out.accepted.length === 1) {
    accepted.push(candidate)
    sheet.push(candidate.rows)
  } else {
    rejected.push({ name: candidate.name, errors: out.rejected[0]?.errors ?? ['unknown'] })
  }
}

const bySurface = (s: Candidate['surface']) => accepted.filter((c) => c.surface === s).length
const aggregate = GATES.sheetCompression(sheet)

console.log(`accepted ${accepted.length}/${SPARES.length + RECORD_ART.length}`)
console.log(`  piece ${bySurface('piece')}  square ${bySurface('square')}  card ${bySurface('card')}`)
console.log(`  sheet: ${aggregate.runs} runs / ${aggregate.pixels} pixels (floor ${(aggregate.pixels / GATES.SHEET_DIVISOR).toFixed(0)})`)

if (rejected.length > 0) {
  console.log(`\nrejected ${rejected.length}:`)
  for (const r of rejected) console.log(`  ${r.name}: ${r.errors.join('; ')}`)
}

if (process.argv.includes('--source')) {
  console.log('\n--- sheet entries ---')
  console.log(toSource(accepted))
  console.log('\n--- registry entries ---')
  for (const c of accepted) {
    console.log(`  ['art.${c.name}', { kind: 'pixel', sprite: '${c.name}', surface: '${c.surface}' }],`)
  }
}
