import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * AC-010 — two SPECs must not state opposite things about the same feature.
 *
 * The parent SPEC listed an AI opponent as a Non-Goal, twice over including the
 * PLAN's rollup. That was a real decision, not an oversight, and reversing it
 * without touching the document that recorded it would leave the repository
 * asserting both positions at once — with no way for a reader to tell which one
 * is current.
 *
 * A test rather than a note, because the failure mode is silence: nothing else
 * in the suite reads prose, so a future edit that restored the old wording
 * would break nothing and be noticed by nobody.
 */

const SPECS = join(process.cwd(), 'specs')
const read = (name: string) => readFileSync(join(SPECS, name), 'utf8')

/** The `## 🚫 Non-Goals` section of a SPEC, up to the next heading. */
function nonGoals(text: string): string {
  const start = text.indexOf('## 🚫 Non-Goals')
  expect(start, 'the Non-Goals heading moved — this test reads it by name').toBeGreaterThan(-1)
  const rest = text.slice(start + 1)
  const end = rest.indexOf('\n## ')
  return end === -1 ? rest : rest.slice(0, end)
}

describe('AC-010 — the superseded Non-Goal names what superseded it', () => {
  it("the parent SPEC's AI entry points at this SPEC", () => {
    const section = nonGoals(read('SPEC-variant-chess-6x6-cards.md'))
    // The premise: the entry is still there to be checked. A future edit that
    // simply deleted it would leave this test passing on an empty section.
    expect(section).toMatch(/AI opponent/)
    expect(section).toMatch(/ai-opponent-singleplayer/)
  })

  it('and does not still read as a flat refusal', () => {
    const section = nonGoals(read('SPEC-variant-chess-6x6-cards.md'))
    // The exact sentence that used to be there, which a careless revert would
    // restore. Matching it is what makes this a consistency check rather than a
    // spelling check.
    expect(section).not.toMatch(/The random-action agent exists for testing \(AC-012, AC-013\), not as a\s+playable\s+opponent\./)
  })

  it('the superseding SPEC says so from its own side too', () => {
    const child = read('SPEC-ai-opponent-singleplayer.md')
    expect(child).toMatch(/SPEC-variant-chess-6x6-cards\.md/)
    expect(child).toMatch(/supersedes/i)
  })
})
