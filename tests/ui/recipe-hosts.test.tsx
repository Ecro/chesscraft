// @vitest-environment jsdom
/**
 * AC-006 — piece and squareType author effects as sentences.
 *
 * The four-slot view was gated to `ruleCard | skillCard` (`RecordForm.tsx`'s
 * `kind !== 'ruleCard' && kind !== 'skillCard'` early return), while
 * `EFFECT_HOSTS` in `controls.ts` — the schema's own answer to "who can carry
 * effects" — has four entries. The gap was not a decision anyone made: a special
 * square's whole content IS its effects, and the only editor it ever had was the
 * indexed palette that PLAN Phase 7 deletes. So the asymmetry had to close before
 * the deletion, not after it.
 *
 * The oracle is `EFFECT_HOSTS` itself, read from the source of truth rather than
 * restated here, so a kind added to the schema fails this test instead of quietly
 * shipping without a sentence.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import React from 'react'
import type { ContentSource } from '@content/load'
import { bundledContentSource } from '@content/sets/bundled'
import { VOCABULARY_CONTROLS } from '@editor/controls'
import type { DraftKind } from '@editor/draft'
import { readSentence } from '@ui/CardRecipe'
import { Edit } from '../../src/ui/Edit'

afterEach(cleanup)

/** Derived, not restated: every kind the control table says may carry an effect. */
const EFFECT_HOSTS: DraftKind[] = [
  ...new Set(VOCABULARY_CONTROLS.filter((c) => c.axis === 'action').flatMap((c) => [...c.hosts])),
]

function mount(kind: DraftKind) {
  const committed: { value: ContentSource | null } = { value: null }
  render(
    React.createElement(Edit, {
      source: structuredClone(bundledContentSource),
      onCommit: (next: ContentSource) => {
        committed.value = next
      },
    }),
  )
  fireEvent.change(screen.getByTestId('editor-kind'), { target: { value: kind } })
  return committed
}

describe('AC-006 — the sentence hosts every effect-bearing kind', () => {
  it('names all four hosts, so the sweep below cannot go vacuous', () => {
    expect([...EFFECT_HOSTS].sort()).toEqual(['piece', 'ruleCard', 'skillCard', 'squareType'])
  })

  it.each(EFFECT_HOSTS)('%s opens the sentence editor', (kind) => {
    mount(kind)
    expect(screen.getByTestId('editor-sentence')).toBeTruthy()
    expect(screen.queryByTestId('editor-recipe-complex')).toBeNull()
  })

  it.each(EFFECT_HOSTS)('%s offers only the triggers its own schema admits', (kind) => {
    // `squareEffect` admits four of the seven lifecycle events. A slot offering
    // the other three would offer something the validator refuses — which is the
    // failure mode that made `optionsFor` derive from the control table's `hosts`
    // rather than from LIFECYCLE_EVENTS directly.
    mount(kind)
    const chip = screen.getByTestId('slot-when')
    chip.focus()
    fireEvent.click(chip)

    const admitted = VOCABULARY_CONTROLS.filter((c) => c.axis === 'trigger' && c.hosts.includes(kind)).map((c) => c.kind)
    const refused = VOCABULARY_CONTROLS.filter((c) => c.axis === 'trigger' && !c.hosts.includes(kind)).map((c) => c.kind)

    expect(admitted.length, `${kind} admits no trigger at all`).toBeGreaterThan(0)
    for (const trigger of admitted) expect(screen.getByTestId(`opt-when-${trigger}`), trigger).toBeTruthy()
    for (const trigger of refused) expect(screen.queryByTestId(`opt-when-${trigger}`), trigger).toBeNull()
  })
})

describe('AC-006 — a special square authored as a sentence round-trips', () => {
  it('writes an effect a bundled square already uses, and reads it back', () => {
    mount('squareType')

    for (const [slot, option] of [
      ['when', 'on_enter'],
      ['cond', 'always'],
      ['then', 'destroy_piece'],
      ['who', 'entering'],
    ] as const) {
      const chip = screen.getByTestId(`slot-${slot}`)
      chip.focus()
      fireEvent.click(chip)
      fireEvent.click(screen.getByTestId(`opt-${slot}-${option}`))
    }

    const draft = JSON.parse(screen.getByTestId('editor-draft-json').textContent ?? 'null')
    const sentence = readSentence(draft)
    expect(sentence).not.toBeNull()
    expect(sentence!.when).toBe('on_enter')
    expect(sentence!.actions).toEqual([{ kind: 'destroy_piece', targets: ['entering'], dest: '' }])
  })

  it('opens every bundled special square without a refusal', () => {
    const squares = (bundledContentSource as unknown as { squareTypes: Record<string, unknown>[] }).squareTypes
    expect(squares.length).toBeGreaterThan(0)
    for (const square of squares) {
      expect(readSentence(square), String(square.id)).not.toBeNull()
    }
  })
})

describe('AC-006 — the piece keeps its grid AND gains the sentence', () => {
  it('shows the move grid and the sentence together, not one instead of the other', () => {
    mount('piece')
    // The grid is the piece's movement; the sentence is what it DOES beyond
    // moving. Replacing one with the other would lose half the record.
    expect(screen.getByTestId('editor-sentence')).toBeTruthy()
    expect(screen.queryByTestId('editor-moves-complex')).toBeNull()
    expect(screen.getByTestId('piece-cell-0,1')).toBeTruthy()
  })
})
