// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { type ContentSet, loadContentSet } from '@content/load'
import { BUNDLED_PRESET_ID, bundledContentSource } from '@content/sets/bundled'
import { COMPLEXITY_BOUND, complexityOf } from '@engine/ai/complexity'
import { type Opponent, Lobby } from '@ui/Lobby'
import { shippedContent } from '../helpers/shipped'

/**
 * AC-011's refusal, at the control that can bypass it.
 *
 * Disabling the radio is the obvious implementation and it is not enough: the
 * import panel lives on this same screen, so a player can choose the computer,
 * paste a room the envelope refuses, and leave `mode` reading `'ai'` while the
 * control that set it has gone quiet. A review found exactly that.
 *
 * The fix derives the mode rather than guarding one handler, so this file
 * asserts the OUTPUT of the start button — what the lobby actually hands over —
 * rather than which control looks disabled. A test on the disabled attribute
 * would have passed against the bug.
 */

const ok = shippedContent()

/** Content the envelope refuses, built by widening a card's target space. */
function overBudget(): ContentSet {
  const source = structuredClone(bundledContentSource) as {
    skillCards: Array<{ id: string; effects: Array<{ actions: unknown[] }> }>
  }
  const card = source.skillCards.find((c) => c.id === 'skill.swap')
  if (!card) throw new Error('fixture drift: the swap card is gone')
  card.effects[0]!.actions.push(structuredClone(card.effects[0]!.actions[0]))
  const loaded = loadContentSet(source)
  if (!loaded.ok) throw new Error(`fixture is invalid: ${JSON.stringify(loaded.errors)}`)
  return loaded.set
}

function renderLobby(content: ContentSet, onStart: (o: Opponent) => void) {
  return render(
    <Lobby
      content={content}
      source={bundledContentSource}
      presetId={BUNDLED_PRESET_ID}
      names={{ white: '', black: '' }}
      onNamesChange={() => {}}
      onImport={() => {}}
      onStart={onStart}
      onBack={() => {}}
    />,
  )
}

describe('the lobby refuses single-player it cannot run', () => {
  it('the two fixtures really do straddle the bound — the premise', () => {
    expect(complexityOf(ok, BUNDLED_PRESET_ID).total).toBeLessThan(COMPLEXITY_BOUND)
    expect(complexityOf(overBudget(), BUNDLED_PRESET_ID).total).toBeGreaterThan(COMPLEXITY_BOUND)
  })

  it('offers the computer, and starts against it, for content inside the envelope', () => {
    const started: Opponent[] = []
    renderLobby(ok, (o) => started.push(o))
    fireEvent.click(screen.getByTestId('mode-ai'))
    fireEvent.click(screen.getByTestId('difficulty-hard'))
    fireEvent.click(screen.getByTestId('lobby-start'))
    expect(started).toEqual([{ kind: 'ai', difficulty: 'hard' }])
  })

  it('names the reason rather than only greying the control', () => {
    renderLobby(overBudget(), () => {})
    const refusal = screen.getByTestId('ai-refused')
    // The machine-readable reason, so a spec can assert which input was at
    // fault without reading translated prose.
    expect(refusal.getAttribute('data-reason')).toBe('card_target_product')
    // The DOM property directly: this repo does not install jest-dom's matchers.
    expect((screen.getByTestId('mode-ai') as HTMLInputElement).disabled).toBe(true)
  })

  it('starts hot-seat even if the AI mode was selected before the content changed', () => {
    // The bypass. The radio is disabled here, but a real player reaches this
    // state by choosing the computer FIRST and importing afterwards, at which
    // point no control is left to clear the choice. The lobby must not hand
    // over an opponent it just said it cannot run.
    const started: Opponent[] = []
    const view = renderLobby(ok, (o) => started.push(o))
    fireEvent.click(screen.getByTestId('mode-ai'))
    view.rerender(
      <Lobby
        content={overBudget()}
        source={bundledContentSource}
        presetId={BUNDLED_PRESET_ID}
        names={{ white: '', black: '' }}
        onNamesChange={() => {}}
        onImport={() => {}}
        onStart={(o) => started.push(o)}
        onBack={() => {}}
      />,
    )
    fireEvent.click(screen.getByTestId('lobby-start'))
    expect(started).toEqual([{ kind: 'human' }])
  })
})
