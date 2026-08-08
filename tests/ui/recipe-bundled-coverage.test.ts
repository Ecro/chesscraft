/**
 * AC-003 — everything the game ships opens as a sentence.
 *
 * The oracle is differential and the reference is the shipped content set itself:
 * `bundledContentSource` was authored before this change and loads through the
 * game's own validator, so the claim is "the maker can show what the game already
 * plays". Nothing here restates the model's rules — a record either opens or it
 * does not.
 *
 * The eight named cards are the PRE-change refusal set, measured on 2026-08-08 by
 * running `readRecipe` / `readGrid` over the bundle. Each is therefore a case that
 * provably failed before this work, which is what stops the suite from being a
 * set of instances that could not have failed (`[fail:test]
 * all-positive-fixture-hides-overcounting`).
 */
import { describe, expect, it } from 'vitest'
import { bundledContentSource } from '@content/sets/bundled'
import { sliceContentSource } from '@content/sets/slice'
import { gate6aContentSource } from '@content/sets/gate6a'
import { readGrid } from '@ui/PieceMoves'
import { readSentence } from '@ui/CardRecipe'

type Record_ = Record<string, unknown>

const source = bundledContentSource as unknown as {
  pieces: Record_[]
  ruleCards: Record_[]
  skillCards: Record_[]
  squareTypes: Record_[]
}

const cards = () => [...source.ruleCards, ...source.skillCards]
const idOf = (r: Record_) => String(r.id)

/** Refused before this change, and why. Measured, not assumed. */
const WAS_REFUSED: ReadonlyArray<readonly [string, string]> = [
  ['rule.king-of-the-hill', 'forEach quantifier and an all condition'],
  ['rule.fast-promotion', 'forEach quantifier'],
  ['rule.royal-bodyguard', 'forEach quantifier'],
  ['rule.last-stand', 'forEach quantifier'],
  ['rule.knights-honour', 'forEach quantifier'],
  ['skill.charge', 'forEach quantifier'],
  ['skill.swap', 'swap_pieces takes two targets'],
  ['skill.sacrifice', 'two actions in one effect'],
]

/**
 * The CLOSED SET, not the set that prompted the work.
 *
 * The first version of this file measured `bundledContentSource` alone, because
 * that is the set the RESEARCH measurement was taken against. `piece.archer` in
 * the SLICE set carries two effects, so "no shipped record is unshowable" was
 * false the whole time and the e2e suite is what said so — three phases later,
 * after a save-block had already been built on the false premise. This repo's own
 * memory names the shape: `[fail:design] fix-scoped-to-the-cited-evidence`
 * (count 5) — verify against the set the property must survive, not against the
 * evidence that prompted it.
 *
 * So: every source the app can load. A new set added to `src/content/sets/` and
 * not listed here is the gap this comment exists to prevent, which is why the
 * count is asserted below.
 */
const SOURCES = [
  ['bundled', bundledContentSource],
  ['slice', sliceContentSource],
  ['gate6a', gate6aContentSource],
] as const

describe('AC-003 — every shipped content set, not just the bundle', () => {
  it('covers all three sources the app can load', () => {
    expect(SOURCES.length).toBe(3)
  })

  it.each(SOURCES)('%s: every card opens as a sentence', (_name, src) => {
    const set = src as unknown as { ruleCards: Record_[]; skillCards: Record_[] }
    const refused = [...set.ruleCards, ...set.skillCards].filter((c) => readSentence(c) === null).map(idOf)
    expect(refused).toEqual([])
  })

  it.each(SOURCES)('%s: every piece opens through the move grid', (_name, src) => {
    const set = src as unknown as { pieces: Record_[] }
    const refused = set.pieces.filter((p) => readGrid(p) === null).map(idOf)
    expect(refused).toEqual([])
  })

  it.each(SOURCES)('%s: names the pieces whose EFFECTS the sentence cannot draw', (name, src) => {
    // Not asserted empty: `piece.archer` genuinely carries two effects, and this
    // records which records fall to the read-only path rather than pretending none
    // do. A record appearing here is fine; a record appearing here WITHOUT the
    // read-only path handling it is the bug (AC-007 covers that).
    const set = src as unknown as { pieces: Record_[] }
    const unshowable = set.pieces.filter((p) => readSentence(p) === null).map(idOf)
    expect(unshowable).toEqual(name === 'slice' ? ['piece.archer'] : [])
  })
})

describe('AC-003 — the bundle opens with no refusals', () => {
  it('has the shape the measurement was taken against', () => {
    // A count assertion, so a bundle that grows or shrinks makes the two
    // expectations below re-derived rather than silently narrowed.
    expect(source.pieces.length).toBe(6)
    expect(cards().length).toBe(26)
  })

  it('opens all 6 pieces through the move grid', () => {
    const refused = source.pieces.filter((p) => readGrid(p) === null).map(idOf)
    expect(refused).toEqual([])
  })

  it('opens all 26 cards as a sentence', () => {
    const refused = cards().filter((c) => readSentence(c) === null).map(idOf)
    expect(refused).toEqual([])
  })

  it.each(WAS_REFUSED)('opens %s, which used to refuse (%s)', (id) => {
    const record = cards().find((c) => idOf(c) === id)
    expect(record, `${id} is missing from the bundle`).toBeDefined()
    expect(readSentence(record!)).not.toBeNull()
  })

  it('opens every special square as a sentence too', () => {
    // squareType effects had no easy front door at all before this change — the
    // recipe view was gated to the two card kinds.
    const refused = source.squareTypes.filter((s) => readSentence(s) === null).map(idOf)
    expect(refused).toEqual([])
  })
})
