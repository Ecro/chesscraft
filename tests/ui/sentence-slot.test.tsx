// @vitest-environment jsdom
/**
 * PLAN Phase 2 — the slot control.
 *
 * What this file owns is the CONTROL, not the model: the model's round-trip is
 * AC-002's property (`recipe-roundtrip.test.ts`), and re-asserting it through the
 * DOM would just be a slower copy. The claims here are the ones only a rendered
 * control can make:
 *
 *  - a slot's options live in a sheet, and choosing one writes the draft;
 *  - every slot behaves the same way, including the single-option and optional
 *    ones (ADR-001's "no exceptions" clause is a real assertion, not prose);
 *  - a parameter appears inside its own slot's sheet, under the chosen option
 *    (ADR-004), for every parameter the vocabulary carries (ADR-007);
 *  - focus returns to the chip that opened the sheet, which is the one thing
 *    `Sheet` has never been asked to do from a scrolling form before.
 */
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import React from 'react'
import { bundledContentSource } from '@content/sets/bundled'
import { blankDraft, editorContext } from '@editor/draft'
import { readSentence } from '@ui/CardRecipe'
import { SentenceEditor, sentenceText } from '@ui/SentenceSlot'
import { makeTranslate } from '@ui/i18n'

afterEach(cleanup)

const ctx = editorContext(bundledContentSource)
const t = makeTranslate()

/**
 * A live host: `SentenceEditor` is a controlled component, so a test that never
 * feeds the mutation back would assert against a frozen draft and pass whatever
 * the writer did.
 */
function Host({ kind, seed }: { kind: 'ruleCard' | 'skillCard'; seed: Record<string, unknown> | null }) {
  const [draft, setDraft] = React.useState<Record<string, unknown>>(
    () => seed ?? (blankDraft(kind) as Record<string, unknown>),
  )
  return React.createElement(
    React.Fragment,
    null,
    React.createElement(SentenceEditor, {
      draft,
      kind,
      ctx,
      t,
      pieceLabel: (id: string) => id,
      update: (mutate: (d: Record<string, unknown>) => void) =>
        setDraft((prev) => {
          const next = structuredClone(prev)
          mutate(next)
          return next
        }),
    }),
    React.createElement('output', { 'data-testid': 'sentence-draft' }, JSON.stringify(draft)),
  )
}

const mount = (kind: 'ruleCard' | 'skillCard' = 'skillCard', seed: Record<string, unknown> | null = null) =>
  render(React.createElement(Host, { kind, seed }))

/**
 * Opens a slot's sheet and returns the chip that opened it.
 *
 * The `focus()` is not decoration. `Sheet` captures `document.activeElement` when
 * it mounts so it can restore focus on close, and a real tap or Enter on a
 * `<button>` focuses it first — but jsdom's `fireEvent.click` dispatches the event
 * without moving focus, so without this the capture would see `<body>` and the
 * restore assertion would be measuring the test harness rather than the product.
 */
function openSlot(slot: string): HTMLElement {
  const chip = screen.getByTestId(`slot-${slot}`)
  chip.focus()
  fireEvent.click(chip)
  return chip
}

const pick = (slot: string, option: string) => {
  openSlot(slot)
  fireEvent.click(screen.getByTestId(`opt-${slot}-${option}`))
}

const draftJson = () => screen.getByTestId('sentence-text').textContent ?? ''
const draftData = () => JSON.parse(screen.getByTestId('sentence-draft').textContent ?? '{}') as Record<string, unknown>

describe('Phase 2 — a slot is a chip that opens a sheet', () => {
  it('shows no sheet until a chip is tapped', () => {
    mount()
    expect(screen.queryByTestId('slot-sheet-then')).toBeNull()
    openSlot('then')
    expect(screen.getByTestId('slot-sheet-then')).toBeTruthy()
  })

  it('offers exactly the vocabulary options for the slot, and writes the chosen one', () => {
    mount()
    openSlot('then')
    const sheet = screen.getByTestId('slot-sheet-then')
    // A sample of the axis, plus the one the four-slot view refused.
    expect(within(sheet).getByTestId('opt-then-destroy_piece')).toBeTruthy()
    expect(within(sheet).getByTestId('opt-then-swap_pieces')).toBeTruthy()

    fireEvent.click(screen.getByTestId('opt-then-freeze_piece'))
    expect(screen.getByTestId('slot-then').textContent).toBe(t('ui.editor.vocab.action.freeze_piece'))
  })

  it('opens a sheet for a SINGLE-option slot too (ADR-001, no exceptions)', () => {
    // A skill card resolves only on its own play, so its trigger has one option.
    // A control that behaved differently here would make the child re-learn the
    // row whose option list happens to be short.
    mount('skillCard')
    openSlot('when')
    const sheet = screen.getByTestId('slot-sheet-when')
    expect(within(sheet).getByTestId('opt-when-on_play')).toBeTruthy()
  })

  it('opens a sheet for an OPTIONAL slot, and offers a way back to nothing', () => {
    mount()
    pick('each', 'piece')
    expect(screen.getByTestId('slot-each').dataset.empty).toBe('false')

    openSlot('each')
    fireEvent.click(screen.getByTestId('opt-each-none'))
    expect(screen.getByTestId('slot-each').dataset.empty).toBe('true')
  })

  it('returns focus to the chip that opened the sheet', () => {
    // `Sheet` has only ever been opened from the match screen and the dex. From a
    // scrolling form, landing focus anywhere else drops the child at the top of a
    // long document (ADR-001's recorded risk).
    mount()
    const chip = openSlot('then')
    fireEvent.keyDown(screen.getByTestId('slot-sheet-then'), { key: 'Escape' })
    expect(document.activeElement).toBe(chip)
  })
})

describe('Phase 2 — the sentence grows the rows it needs', () => {
  it('shows a second target row ONLY for a two-target action', () => {
    mount()
    pick('then', 'destroy_piece')
    expect(screen.queryByTestId('slot-whoB')).toBeNull()

    pick('then', 'swap_pieces')
    expect(screen.getByTestId('slot-whoB')).toBeTruthy()
  })

  it('shows a destination row ONLY for an action that takes one', () => {
    mount()
    pick('then', 'destroy_piece')
    expect(screen.queryByTestId('slot-where')).toBeNull()

    pick('then', 'teleport_piece')
    expect(screen.getByTestId('slot-where')).toBeTruthy()
  })

  it('shows the join operator ONLY once a second condition exists', () => {
    mount()
    expect(screen.queryByTestId('slot-op')).toBeNull()
    pick('cond2', 'on_own_rank')
    expect(screen.getByTestId('slot-op')).toBeTruthy()
  })

  it('inverts a condition with a toggle rather than a sheet', () => {
    mount()
    pick('cond', 'piece_side')
    const toggle = screen.getByTestId('slot-not') as HTMLInputElement
    expect(toggle.checked).toBe(false)
    fireEvent.click(toggle)
    expect((screen.getByTestId('slot-not') as HTMLInputElement).checked).toBe(true)
  })

  it('adds a second action and its own target', () => {
    mount()
    pick('then', 'destroy_piece')
    expect(screen.queryByTestId('slot-who2')).toBeNull()
    pick('then2', 'block_capture')
    expect(screen.getByTestId('slot-who2')).toBeTruthy()
  })
})

describe('Phase 2 — every parameter has a home in its slot sheet (ADR-004/007)', () => {
  /**
   * The table is the point. ADR-007 exists because counting the coverage gate's
   * rows showed ~20 parameter controls that lived ONLY in the indexed form; each
   * row below is one of them, named by the slot whose sheet must now hold it.
   * A missing row here is a vocabulary entry that Phase 7's deletion would strand.
   */
  const CASES: ReadonlyArray<readonly [string, string, string, string]> = [
    // [slot, option to choose, param testid, what it settles]
    ['then', 'freeze_piece', 's-param-plies', 'how many plies'],
    ['then', 'block_capture', 's-param-duration', 'how long it lasts'],
    ['then', 'promote_piece', 's-param-to', 'which piece it becomes'],
    ['then', 'spawn_piece', 's-param-pieceId', 'which piece appears'],
    ['then', 'win', 's-param-side', 'who wins'],
    ['then', 'grant_movement', 's-param-pattern-slide', 'the granted pattern kind'],
    ['then', 'grant_movement', 's-param-pattern-cell-1_1', 'the granted pattern squares'],
    ['cond', 'piece_is', 's-param-cond-pieceId', 'which piece'],
    ['cond', 'piece_side', 's-param-cond-side', 'whose piece'],
    ['cond', 'on_own_rank', 's-param-cond-n', 'which rank'],
    ['cond', 'on_square', 's-param-cond-square-c3', 'which squares'],
    ['each', 'piece', 's-param-foreach-pieceId', 'which piece the quantifier walks'],
    ['each', 'piece', 's-param-foreach-side', 'whose pieces it walks'],
  ]

  it.each(CASES)('%s → %s carries %s (%s)', (slot, option, param) => {
    mount()
    pick(slot, option)
    // The sheet is still open on the slot that owns the parameter — that IS the
    // ADR-004 claim, so it is asserted by scoping the query to the sheet.
    const sheet = screen.getByTestId(`slot-sheet-${slot}`)
    expect(within(sheet).getByTestId(param)).toBeTruthy()
  })

  it('carries the destination parameters in the destination slot, not the action slot', () => {
    mount()
    pick('then', 'teleport_piece')
    pick('where', 'offset')
    const sheet = screen.getByTestId('slot-sheet-where')
    expect(within(sheet).getByTestId('s-param-df')).toBeTruthy()
    expect(within(sheet).getByTestId('s-param-dr')).toBeTruthy()
    expect(within(sheet).getByTestId('s-param-offset-forward')).toBeTruthy()

    pick('where', 'square')
    expect(within(screen.getByTestId('slot-sheet-where')).getByTestId('s-param-square')).toBeTruthy()
  })

  it('writes a parameter through to the draft', () => {
    mount()
    pick('then', 'freeze_piece')
    fireEvent.change(screen.getByTestId('s-param-plies'), { target: { value: '4' } })
    expect((screen.getByTestId('s-param-plies') as HTMLInputElement).value).toBe('4')
  })

  it('edits a granted turning slide through the shared turning-row control', () => {
    mount()
    pick('then', 'grant_movement')
    const sheet = screen.getByTestId('slot-sheet-then')

    fireEvent.click(within(sheet).getByTestId('s-param-pattern-turning_slide'))
    expect(within(sheet).getByTestId('s-param-pattern-turning-row-0-first-n')).toBeTruthy()
    expect(within(sheet).getByTestId('s-param-pattern-turning-row-0-second-e').getAttribute('aria-pressed')).toBe('true')

    fireEvent.click(within(sheet).getByTestId('s-param-pattern-turning-row-0-second-w'))
    fireEvent.click(within(sheet).getByTestId('s-param-pattern-turning-row-0-reach-3'))
    expect(within(sheet).getByTestId('s-param-pattern-turning-row-0-second-w').getAttribute('aria-pressed')).toBe('true')
    expect(within(sheet).getByTestId('s-param-pattern-turning-row-0-reach-3').getAttribute('aria-pressed')).toBe('true')

    const saved = draftData()
    const action = (((saved.effects as Record<string, unknown>[])[0]!.actions as Record<string, unknown>[])[0]!)
    expect(action.pattern).toEqual({ kind: 'turning_slide', vectors: [[0, 1], [-1, 0]], maxDistance: 3 })

    cleanup()
    mount('skillCard', saved)
    const reopened = draftData()
    const reopenedAction = (((reopened.effects as Record<string, unknown>[])[0]!.actions as Record<string, unknown>[])[0]!)
    expect(reopenedAction.pattern).toEqual(action.pattern)
  })

  it('does not expose row deletion or flatten an unsupported turning cap', () => {
    mount('skillCard', {
      ...blankDraft('skillCard'),
      effects: [
        {
          trigger: { kind: 'on_play' },
          actions: [
            {
              kind: 'grant_movement',
              target: { kind: 'mover' },
              pattern: { kind: 'turning_slide', vectors: [[0, 1], [1, 0]], maxDistance: 4 },
            },
          ],
        },
      ],
    } as Record<string, unknown>)
    pick('then', 'grant_movement')
    const sheet = screen.getByTestId('slot-sheet-then')
    expect(within(sheet).getByText(t('ui.editor.turning.unsupported'))).toBeTruthy()
    expect(within(sheet).queryByTestId('s-param-pattern-turning-add')).toBeNull()
    expect(draftData()).toMatchObject({
      effects: [
        {
          actions: [
            {
              pattern: { kind: 'turning_slide', vectors: [[0, 1], [1, 0]], maxDistance: 4 },
            },
          ],
        },
      ],
    })
  })

  it('gives the SECOND action its own parameter controls', () => {
    mount()
    pick('then', 'freeze_piece')
    pick('then2', 'freeze_piece')
    const sheet = screen.getByTestId('slot-sheet-then2')
    expect(within(sheet).getByTestId('s-param-plies2')).toBeTruthy()
    // And the first action's control is a different node, so editing one cannot
    // silently edit the other.
    expect(screen.queryByTestId('s-param-plies')).toBeNull()
  })
})

describe('Phase 2 — the read-back line', () => {
  it('reads as a sentence with no dangling particles when an action takes no target', () => {
    mount()
    pick('then', 'win')
    const text = draftJson()
    expect(text).toContain(t('ui.editor.vocab.action.win'))
    // The four clause shapes exist precisely so this cannot happen: a Korean
    // particle with nothing in front of it.
    expect(text).not.toMatch(/에게\s*「/)
    expect(text).not.toMatch(/\s로\s*「/)
  })

  it('names both targets of a two-target action', () => {
    mount()
    pick('then', 'swap_pieces')
    pick('who', 'chosen_friendly')
    pick('whoB', 'chosen_enemy')
    const text = draftJson()
    expect(text).toContain(t('ui.editor.vocab.target.chosen_friendly'))
    expect(text).toContain(t('ui.editor.vocab.target.chosen_enemy'))
  })

  it('joins two actions rather than showing only the first', () => {
    mount()
    pick('then', 'destroy_piece')
    pick('then2', 'block_capture')
    const text = draftJson()
    expect(text).toContain(t('ui.editor.vocab.action.destroy_piece'))
    expect(text).toContain(t('ui.editor.vocab.action.block_capture'))
  })

  it('resolves every placeholder it is given', () => {
    // A stray `{when}` on screen is the failure mode of key-assembled text, and
    // it looks like a bug in the card rather than in the copy.
    mount('ruleCard')
    pick('when', 'end_of_ply')
    pick('then', 'win')
    expect(draftJson()).not.toMatch(/[{}]/)
  })
})

describe('Phase 2 — a relative role is never labelled as a colour', () => {
  /**
   * Found by the reviewer. Every schema enum this control writes is
   * `mover` / `opponent` — roles resolved per event, not players — and it was
   * labelling them with the board's fixed colour keys (`ui.side.white` = "파란 편").
   * A child picking blue to make blue win authored `side: 'mover'`, and the win went
   * to whichever colour triggered the event: the opposite side, half the time, with
   * both values schema-valid so nothing refused it.
   *
   * Asserted structurally — the label must not BE the colour string — rather than
   * by pinning the new wording, so a future copy edit stays free while the class of
   * mistake stays closed.
   */
  const COLOUR_LABELS = [t('ui.side.white'), t('ui.side.black')]

  it('labels the side options with a role, not a colour', () => {
    mount()
    pick('then', 'win')
    const options = Array.from(
      (screen.getByTestId('s-param-side') as HTMLSelectElement).querySelectorAll('option'),
    )
    const relative = options.filter((o) => o.value === 'mover' || o.value === 'opponent')
    expect(relative).toHaveLength(2)
    for (const option of relative) {
      expect(COLOUR_LABELS, `${option.value} is labelled with a board colour`).not.toContain(option.textContent)
      expect(option.textContent ?? '').not.toBe('')
    }
  })

  it('would catch the regression, so the check is not vacuous', () => {
    // The negative instance: the exact strings that used to be there.
    expect(COLOUR_LABELS).toEqual(['파란 편', '빨간 편'])
  })
})

describe('Phase 2 — an incomplete sentence reads as incomplete, not as broken Korean', () => {
  /**
   * Found by the cross-model reviewer and reproduced before it was believed. Korean
   * marks role with a particle attached to the noun, so an empty slot does not leave
   * a gap — it leaves the particle. A brand-new skill card rendered as
   * `카드를 내면, 일 때 .`: two particles, a full stop, and no words, on the first
   * thing a child sees.
   */
  it('says nothing is chosen yet on a brand-new card', () => {
    mount()
    const text = draftJson()
    expect(text).toBe(t('ui.editor.card.sentence-incomplete'))
    // The specific shape that shipped: a particle with nothing in front of it.
    expect(text).not.toMatch(/,\s*일 때/)
  })

  it('still says nothing is chosen when a trigger is picked but no action is', () => {
    // The partial state, not just the empty one — a rule card with a trigger and no
    // verb rendered `end_of_ply에, 항상일 때 .`
    mount('ruleCard')
    pick('when', 'end_of_ply')
    expect(draftJson()).toBe(t('ui.editor.card.sentence-incomplete'))
  })

  it('reads as a sentence as soon as it HAS a verb', () => {
    // The other side, so the guard cannot be satisfied by never rendering a sentence.
    mount('ruleCard')
    pick('when', 'end_of_ply')
    pick('then', 'win')
    const text = draftJson()
    expect(text).not.toBe(t('ui.editor.card.sentence-incomplete'))
    expect(text).toContain(t('ui.editor.vocab.action.win'))
  })
})

describe('Phase 2 — the bundled cards render through the control', () => {
  it('renders every previously-refusing card without a refusal', () => {
    const source = bundledContentSource as unknown as { ruleCards: Record<string, unknown>[]; skillCards: Record<string, unknown>[] }
    for (const record of [...source.ruleCards, ...source.skillCards]) {
      const kind = String(record.id).startsWith('skill.') ? 'skillCard' : 'ruleCard'
      const { unmount } = mount(kind as 'ruleCard' | 'skillCard', structuredClone(record))
      expect(readSentence(record), String(record.id)).not.toBeNull()
      expect(screen.getByTestId('editor-sentence'), String(record.id)).toBeTruthy()
      expect(screen.getByTestId('sentence-text').textContent, String(record.id)).not.toMatch(/[{}]/)
      unmount()
    }
  })

  it('renders a two-action card with both clauses', () => {
    const source = bundledContentSource as unknown as { skillCards: Record<string, unknown>[] }
    const sacrifice = source.skillCards.find((c) => c.id === 'skill.sacrifice')!
    mount('skillCard', structuredClone(sacrifice))
    expect(screen.getByTestId('slot-then')).toBeTruthy()
    expect(screen.getByTestId('slot-then2')).toBeTruthy()
    expect(sentenceText(t, readSentence(sacrifice)!, 'skillCard')).toContain(t('ui.editor.card.line.and').trim())
  })
})
