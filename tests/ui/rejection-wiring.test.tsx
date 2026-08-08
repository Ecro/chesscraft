// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { loadContentSet } from '../../src/content/load'
import { BUNDLED_PRESET_ID, bundledContentSource } from '../../src/content/sets/bundled'
import { MatchHost } from '../../src/ui/MatchHost'
import { ko } from '../../src/i18n/ko'

/**
 * PLAN Phase 4 — a refused MOVE says something, in the player's language.
 *
 * Two defects met here and both were invisible to every existing test.
 *
 * `describeRejection` had exactly two call sites and both were card plays, so reaching for a
 * capture the engine would not give you produced NOTHING: no marker, because the generator
 * never offered the move, and no words, because the tap handler fell through to re-selecting.
 * That silence is the reported bug — "분명히 잡을 수 있는 위치인데 잡는 표시가 안 뜬다".
 *
 * And what it did return was untranslated English prose, printed verbatim into the hint bar.
 * A Korean-speaking child was shown "that card cannot target those squares". The engine now
 * returns a code and the words live in `src/i18n`, which is where every other player-facing
 * string in this app lives.
 *
 * The causes themselves — protected / frozen / blockaded — are pinned in
 * `tests/engine/rejection-reasons.test.ts`, because they need positions `MatchHost` cannot be
 * started at. What this file owns is the wiring and the code→word mapping, which is exactly
 * the pair that was missing.
 */

const loaded = loadContentSet(bundledContentSource)
if (!loaded.ok) throw new Error('bundled content did not load')
const content = loaded.set

function pastDraft(container: HTMLElement) {
  for (let i = 0; i < 4; i += 1) {
    const offer = container.querySelector('[data-testid^="offer-"]')
    if (!offer) break
    fireEvent.click(offer)
  }
}

describe('a refused move explains itself (PLAN Phase 4)', () => {
  it('answers a reach for an enemy piece with a reason, in Korean', () => {
    const { container } = render(<MatchHost content={content} presetId={BUNDLED_PRESET_ID} newSeed={() => 7} />)
    pastDraft(container)

    // The premise: nothing is on screen yet. Without this the assertions below could be
    // reading a rejection left over from the draft.
    expect(screen.queryByTestId('rejection'), 'a rejection was already showing').toBeNull()

    // White's own pawn, then a black piece three ranks away that it cannot reach.
    fireEvent.click(screen.getByTestId('sq-d2'))
    fireEvent.click(screen.getByTestId('sq-d5'))

    const shown = screen.getByTestId('rejection')
    // The machine value, so a spec can assert WHICH refusal without asserting prose — the
    // same split `data-phase` and `data-winner` already use.
    expect(shown.getAttribute('data-reason')).toBe('unreachable')
    // And the words: the mapped Korean string, not the code and not English.
    const text = shown.textContent ?? ''
    expect(text).toContain(ko['ui.match.reject.unreachable'])
    expect(text, 'the raw code leaked to the screen').not.toContain('unreachable')
    expect(text, 'an untranslated key leaked to the screen').not.toContain('ui.match.reject')
  })

  it('stays quiet when the player is only changing their mind', () => {
    // Tapping an empty square, or another of your own pieces, is navigation. Answering that
    // with an error message would turn every second tap into a complaint — the reason the
    // wiring is scoped to a reach for an ENEMY piece rather than to any refused square.
    const { container } = render(<MatchHost content={content} presetId={BUNDLED_PRESET_ID} newSeed={() => 7} />)
    pastDraft(container)

    fireEvent.click(screen.getByTestId('sq-d2'))
    fireEvent.click(screen.getByTestId('sq-c4')) // empty
    expect(screen.queryByTestId('rejection'), 'an empty square produced a complaint').toBeNull()

    fireEvent.click(screen.getByTestId('sq-e2')) // another white pawn
    expect(screen.queryByTestId('rejection'), 'selecting another own piece produced a complaint').toBeNull()
  })

  it('explains a refused DRAG, not only a refused tap', () => {
    /*
     * Round-1 review found this, twice and independently: the first version of the wiring
     * covered `clickSquare` only. `usePressInspect` resolves one pointer sequence into exactly
     * one of inspect / tap / drag, so a player who presses a piece and pulls it onto an enemy
     * never reaches the tap path — and the reported defect, reaching for a capture and getting
     * nothing, survived on the gesture a finger actually uses.
     *
     * Driven with pointer events rather than `fireEvent.click`, because clicking is precisely
     * what cannot exercise this path. The three tests above all click, which is why none of them
     * caught it.
     */
    const { container } = render(<MatchHost content={content} presetId={BUNDLED_PRESET_ID} newSeed={() => 7} />)
    pastDraft(container)

    const from = screen.getByTestId('sq-d2')
    const to = screen.getByTestId('sq-d5')

    fireEvent.pointerDown(from, { pointerId: 1, clientX: 0, clientY: 0 })
    fireEvent.pointerMove(to, { pointerId: 1, clientX: 0, clientY: 90 })
    fireEvent.pointerUp(to, { pointerId: 1, clientX: 0, clientY: 90 })

    const shown = screen.queryByTestId('rejection')
    expect(shown, 'a refused drag said nothing').not.toBeNull()
    expect(shown!.getAttribute('data-reason')).toBe('unreachable')
  })

  it('drops a stale refusal when the player asks what a piece IS instead', () => {
    // Also from round 1. A refusal answers the move just attempted; a press-to-inspect asks a
    // different question, and the old answer sitting in the status line reads as the answer to
    // the new one.
    const { container } = render(<MatchHost content={content} presetId={BUNDLED_PRESET_ID} newSeed={() => 7} />)
    pastDraft(container)

    fireEvent.click(screen.getByTestId('sq-d2'))
    fireEvent.click(screen.getByTestId('sq-d5'))
    expect(screen.queryByTestId('rejection'), 'no refusal to clear — the premise failed').not.toBeNull()

    // Driven with the `i` key rather than a long press. Both routes go through the same
    // `openPeek`, and the keyboard one is deterministic — a press depends on a timer the hook
    // owns, so a test of it measures the timer as much as the clear.
    fireEvent.keyDown(screen.getByTestId('sq-e5'), { key: 'i' })

    expect(screen.queryByTestId('peek-sheet') ?? screen.queryByRole('dialog'), 'no sheet opened — the premise failed').not.toBeNull()
    expect(screen.queryByTestId('rejection'), 'the old refusal outlived the question it answered').toBeNull()
  })

  it('has a word for every reason the engine can return', () => {
    // The engine's union and the bundle are two files that have to agree, and nothing else
    // checks that: a new reason with no key renders as the key itself, which is the kind of
    // defect that ships. Listed literally rather than derived — a type union is erased at
    // runtime, so a derived list would be this same list with extra steps.
    const REASONS = [
      'match-over',
      'draft-first',
      'card-not-held',
      'card-spent',
      'card-already-played',
      'card-bad-targets',
      'card-not-offered',
      'empty-square',
      'not-your-piece',
      'piece-frozen',
      'piece-forbidden',
      'target-protected',
      'unreachable',
      'move-owed',
      'card-owed',
    ]
    const missing = REASONS.filter((r) => !(`ui.match.reject.${r}` in ko))
    expect(missing, 'a rejection reason has no word in the bundle').toEqual([])
  })
})
