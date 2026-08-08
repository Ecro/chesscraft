// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import React, { useState } from 'react'
import type { ContentSource } from '@content/load'
import { sliceContentSource } from '@content/sets/slice'
import { ko } from '../../src/i18n/ko'
import { Edit } from '../../src/ui/Edit'
import { TranslateContext, makeTranslate } from '../../src/ui/i18n'

/**
 * PLAN Phase 9 (ADR-009) — the badge says why, on the screen where the record is made.
 *
 * The report: "기물 만들 때 별점이 왜 그렇게 매겨지는지 모르겠음". It could not be answered
 * from the screen, because the screen showed a star count and a generic caveat while
 * `cost.ts`'s own header claimed the model was explainable. The arithmetic behind the number
 * is now rendered, term by term, out of the same expressions that produce it.
 *
 * `Host` reproduces both halves of `App`'s contract — `Edit` is controlled, and the document's
 * own `strings` overlay resolves the keys. `[fail:test] harness-omits-production-wiring` is
 * recorded in this repo for editor tests that skipped exactly these two things and asserted
 * ids against ids while passing.
 */

function Host({ initial }: { initial: ContentSource }) {
  const [source, setSource] = useState(initial)
  const t = makeTranslate(source.strings)
  return (
    <TranslateContext.Provider value={t}>
      <Edit source={source} onCommit={setSource} />
    </TranslateContext.Provider>
  )
}

function mount(initial: ContentSource = sliceContentSource) {
  render(<Host initial={structuredClone(initial)} />)
  fireEvent.click(screen.getByTestId('editor-tab-library'))
}

afterEach(cleanup)

describe('the star badge explains its own arithmetic', () => {
  it('breaks a piece down into the terms that priced it', () => {
    mount()
    fireEvent.click(screen.getByTestId('library-open-piece.king'))

    const why = screen.getByTestId('record-cost-why')
    const terms = [...why.querySelectorAll('[data-term]')].map((el) => el.getAttribute('data-term'))
    // Walking and taking are what every piece is priced on, so both must be named for the
    // simplest record in the set — an explanation that omitted one would still add up.
    expect(terms).toContain('walk')
    expect(terms).toContain('take')

    // The words, not the keys: a missing bundle entry renders as the key and would otherwise
    // pass every structural assertion here.
    const text = why.textContent ?? ''
    expect(text, 'an untranslated key reached the screen').not.toContain('ui.editor.cost')
    expect(text).toContain(ko['ui.editor.cost.term.walk']!.replace('{n}', '').trim())
  })

  it('says out loud that a card is divided and rounded', () => {
    mount()
    fireEvent.click(screen.getByTestId('editor-kind'))
    fireEvent.change(screen.getByTestId('editor-kind'), { target: { value: 'skillCard' } })
    fireEvent.click(screen.getByTestId('library-open-skill.warp'))

    const why = screen.getByTestId('record-cost-why')
    const steps = [...why.querySelectorAll('[data-step]')].map((el) => el.getAttribute('data-step'))
    // A card's terms do NOT add up to its price. If the discount and its rounding are not
    // shown, the numbers on screen contradict the total beside them.
    expect(steps).toContain('card-divisor')
    expect(steps).toContain('rounded')
  })

  it('answers on a piece that has never been saved', () => {
    // The reason the explanation reads the draft: a cost is a pure function of the declaration
    // (ADR-012), and the question is loudest while the author is still choosing. Before this,
    // the badge withheld everything until the first save.
    mount()
    fireEvent.click(screen.getByTestId('editor-new'))

    const why = screen.queryByTestId('record-cost-why')
    expect(why, 'a fresh piece explained nothing').not.toBeNull()
    expect([...why!.querySelectorAll('[data-term]')].length).toBeGreaterThan(0)

    /*
     * This assertion used to read "and NO stars, because a band is relative to a ceiling the
     * draft is not in yet". Round-1 review superseded that: deriving the band from the saved
     * record while pricing the draft is what let the two contradict each other on screen, so the
     * band now follows whatever the explanation describes. A fresh draft therefore gets a band,
     * and the ceiling is the saved document's — one save behind, which moves the band by at most
     * a step and is the same staleness the price already accepted.
     *
     * What replaces it is the invariant that actually failed: band and price describe ONE
     * record, and `data-from` says which. That is checkable, where "no band" was a preference.
     */
    expect(why!.getAttribute('data-from'), 'the price did not come from the draft').toBe('draft')
    expect(
      screen.getByTestId('record-grade').querySelector('[data-stars]'),
      'the price came from the draft and the band came from nowhere',
    ).not.toBeNull()
  })

  it('moves the stars with the draft, so the band and the price describe one record', () => {
    /*
     * Round-1 review found this twice, independently. The band used to come from the SAVED
     * document while the explanation came from the live draft, so widening a saved piece's
     * movement jumped the price and left the star where it was — two numbers about two
     * different pieces inside one paragraph, with nothing saying so.
     */
    mount()
    fireEvent.click(screen.getByTestId('library-open-piece.king'))

    const starsNow = () => screen.getByTestId('record-grade').querySelector('[data-stars]')?.getAttribute('data-stars')
    const totalNow = () => screen.getByTestId('record-cost-why').querySelector('.cost-total')?.textContent ?? ''

    const before = { stars: starsNow(), total: totalNow() }
    // The premise: the record opened with a band AND a price.
    expect(before.stars, 'the saved record showed no band').toBeTruthy()
    expect(before.total, 'the saved record showed no price').not.toBe('')

    // Light up the whole grid, which is the cheapest way to make a piece far more expensive.
    for (const df of [-3, -2, -1, 1, 2, 3]) {
      for (const dr of [-3, -2, -1, 1, 2, 3]) fireEvent.click(screen.getByTestId(`piece-cell-${df},${dr}`))
    }

    const after = { stars: starsNow(), total: totalNow() }
    // The price moved — otherwise this test proves nothing about the band following it.
    expect(after.total, 'the explanation did not react to the edit').not.toBe(before.total)
    // And the band moved with it rather than staying on the saved record's answer.
    expect(after.stars, 'the band stayed on the saved record while the price moved').not.toBe(before.stars)
    expect(screen.getByTestId('record-cost-why').getAttribute('data-from')).toBe('draft')
  })

  it('says the price is unavailable rather than describing the saved record', () => {
    /*
     * Also round 1. When the draft stopped parsing, the panel silently fell back to the SAVED
     * declaration — a plausible price for a piece the author had already edited away, with no
     * marking. Clearing the movement makes the draft unpriceable (`movement` carries `.min(1)`).
     */
    mount()
    fireEvent.click(screen.getByTestId('library-open-piece.king'))
    expect(screen.queryByTestId('record-cost-why'), 'nothing was priced to begin with').not.toBeNull()

    fireEvent.click(screen.getByTestId('piece-clear'))

    expect(screen.queryByTestId('record-cost-why'), 'a stale saved price survived an unpriceable draft').toBeNull()
    expect(screen.queryByTestId('record-cost-unpriceable'), 'the panel went silent instead of saying why').not.toBeNull()
  })

  it('says nothing for a record that has no price', () => {
    // A rule card is not something a side brings, so it has no band and no cost line. An
    // explanation rendered here would imply a price the loadout rules never ask for.
    mount()
    fireEvent.change(screen.getByTestId('editor-kind'), { target: { value: 'ruleCard' } })
    fireEvent.click(screen.getByTestId('library-open-rule.beacon-rush'))
    expect(screen.queryByTestId('record-cost-why')).toBeNull()
  })
})
