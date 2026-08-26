// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { type ContentSet, loadContentSet } from '@content/load'
import { bundledContentSource } from '@content/sets/bundled'
import { officialIds } from '@content/provenance'
import { emptyCollection, mergeUp } from '../../src/collection/record'
import { TIER_ORDER } from '../../src/collection/tiers'
import { ko } from '../../src/i18n/ko'
import { Rules } from '../../src/ui/Rules'

/**
 * 도감 as a shelf with gaps (PLAN Phase 4; SPEC AC-003, AC-004).
 *
 * The screen has always listed every record in the loaded set. What is new is
 * that each entry now carries a tier, the shelf says how much of its own kind
 * has been met, and what the child MADE is marked as theirs.
 *
 * Authorship is derived, not stored (ADR-006 leans on `officialIds`): an id is
 * the child's exactly when the running build's bundle does not ship it. That is
 * what makes AC-004 hold for every collection log including the empty one, and
 * it is why nobody who has played before this feature shipped has to migrate
 * anything — their own records are theirs the moment it lands.
 */

afterEach(cleanup)

const set = (() => {
  const loaded = loadContentSet(bundledContentSource)
  if (!loaded.ok) throw new Error('bundled content must load')
  return loaded.set
})()

const official = officialIds(bundledContentSource)

const AUTHORED_ID = 'piece.my-own'

/**
 * The bundled set plus one piece the child made.
 *
 * A duplicate of a shipped piece under a new id, which is a normal editor
 * action — `officialIds` derives authorship from id membership in the SHIPPED
 * bundle and never looks at a record's content, so this is exactly the shape it
 * is specified to call authored.
 */
function withAuthoredPiece(): ContentSet {
  const first = [...set.pieces.keys()][0] as string
  const template = set.pieces.get(first)
  if (!template) throw new Error('the bundled set must have a piece to copy')
  return { ...set, pieces: new Map(set.pieces).set(AUTHORED_ID, { ...template, id: AUTHORED_ID }) }
}

/** Every entry tile currently on screen, keyed by the id it renders. */
function tiles(): Map<string, HTMLElement> {
  const found = new Map<string, HTMLElement>()
  for (const node of document.querySelectorAll<HTMLElement>('[data-entry]')) {
    const id = node.getAttribute('data-entry')
    if (id) found.set(id, node)
  }
  return found
}

describe('the tier vocabulary', () => {
  it('has a Korean label for every rung on the ladder', () => {
    // `tiers.ts` says its purpose is to be the one place the ladder is written
    // down, but the LABELS are a second list in `ko.ts`, joined only by an
    // untyped template literal (`ui.dex.tier.${tier}`). Without this, a rung
    // added to `TIER_ORDER` renders its raw key on screen and nothing fails.
    for (const tier of TIER_ORDER) {
      expect(ko[`ui.dex.tier.${tier}`], `ui.dex.tier.${tier} must exist`).toBeTruthy()
    }
  })
})

describe('the dex as a collection', () => {
  it('shows a met-over-total count for the tab on screen, not one total across kinds', () => {
    // AC-003 and ADR-005. A count that mixed the kinds would describe a shelf
    // nobody is looking at, and would read as the single number representing the
    // child that the SPEC's non-goals rule out.
    const pieces = [...set.pieces.keys()]
    const squares = [...set.squareTypes.keys()]
    expect(pieces.length, 'the bundled set has pieces').toBeGreaterThan(1)
    expect(squares.length, 'and square types, which is what makes this test bite').toBeGreaterThan(0)
    // Two ids of DIFFERENT kinds. Seeding only a piece would make |seen| and
    // |seen ∩ pieces| both 1, so a `Rules` that ignores the kind entirely and
    // reports the raw set size would pass — which is precisely the aggregate
    // ADR-005 forbids.
    const collection = mergeUp(emptyCollection(), {
      seen: new Set([pieces[0] as string, squares[0] as string]),
      used: new Set(),
      won: new Set(),
    })
    render(<Rules content={set} official={official} collection={collection} onClose={() => {}} />)

    const count = screen.getByTestId('dex-count')
    expect(count.getAttribute('data-met'), 'one PIECE has been met, though two records have').toBe('1')
    expect(count.getAttribute('data-total'), 'the total is this kind only').toBe(String(pieces.length))
    // A cross-kind total would be larger than any one kind's list.
    expect(Number(count.getAttribute('data-total'))).toBeLessThan(
      set.pieces.size + set.squareTypes.size + set.ruleCards.size + set.skillCards.size,
    )
  })

  it('keeps an unmet entry in the grid and marks it apart from a met one', () => {
    // AC-003. A shelf with no empty places is not a collection — the gap is the
    // point. The pixel-level difference is asserted in e2e/collection.spec.ts,
    // because a differing ATTRIBUTE is not a differing rendering; here the
    // contract is that the two states are distinguishable at all and that the
    // unmet tile keeps its position.
    const pieces = [...set.pieces.keys()]
    const met = pieces[0] as string
    const unmet = pieces[1] as string
    const collection = mergeUp(emptyCollection(), { seen: new Set([met]), used: new Set(), won: new Set() })
    render(<Rules content={set} official={official} collection={collection} onClose={() => {}} />)

    const all = tiles()
    expect(all.size, 'every record still has a tile').toBe(pieces.length)
    expect(all.get(met)?.getAttribute('data-tier')).toBe('seen')
    expect(all.get(unmet)?.getAttribute('data-tier')).toBe('unencountered')
    // Order is unchanged: the unmet tile holds its place rather than sorting to
    // the end or vanishing.
    expect([...all.keys()]).toEqual(pieces)
  })

  it('carries the tier a record has actually reached, not merely met-or-not', () => {
    const pieces = [...set.pieces.keys()]
    expect(pieces.length, 'three distinct records are needed').toBeGreaterThan(2)
    const [a, b, c] = pieces as [string, string, string]
    const collection = mergeUp(emptyCollection(), {
      seen: new Set([a]),
      used: new Set([b]),
      won: new Set([c]),
    })
    render(<Rules content={set} official={official} collection={collection} onClose={() => {}} />)
    const all = tiles()
    expect(all.get(a)?.getAttribute('data-tier')).toBe('seen')
    expect(all.get(b)?.getAttribute('data-tier')).toBe('used')
    expect(all.get(c)?.getAttribute('data-tier')).toBe('won')
  })

  it('marks an authored record as the child’s and never renders it unmet', () => {
    // AC-004, including its migration case: the collection log here is EMPTY,
    // which is the state of every install that predates this feature.
    const authored = withAuthoredPiece()
    const authoredId = AUTHORED_ID
    render(<Rules content={authored} official={official} collection={emptyCollection()} onClose={() => {}} />)

    const tile = tiles().get(authoredId)
    expect(tile, 'the authored record is on the shelf').not.toBeUndefined()
    expect(tile?.getAttribute('data-authored'), 'it is marked as the child’s').toBe('true')
    expect(tile?.getAttribute('data-tier'), 'and never reads as unmet').not.toBe('unencountered')
    // A shipped record with the same empty log is the control: without it this
    // test would pass an implementation that marks EVERYTHING as authored.
    const shipped = tiles().get([...set.pieces.keys()][0] as string)
    expect(shipped?.getAttribute('data-authored')).toBe('false')
    expect(shipped?.getAttribute('data-tier')).toBe('unencountered')
  })

  it('counts an authored record as met, so the shelf total and the tiles agree', () => {
    const authored = withAuthoredPiece()
    const authoredId = AUTHORED_ID
    render(<Rules content={authored} official={official} collection={emptyCollection()} onClose={() => {}} />)
    const count = screen.getByTestId('dex-count')
    // Exactly one: the authored record. Every shipped piece is unmet on an
    // empty log, so any other number means the two surfaces disagree.
    expect(count.getAttribute('data-met')).toBe('1')
    expect(count.getAttribute('data-total')).toBe(String(authored.pieces.size))
  })
})
