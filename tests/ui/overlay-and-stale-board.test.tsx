// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { useState } from 'react'
import type { ContentSource } from '@content/load'
import { loadContentSet } from '@content/load'
import { BUNDLED_PRESET_ID, bundledContentSource } from '@content/sets/bundled'
import { SLICE_PRESET_ID, sliceContentSource } from '@content/sets/slice'
import { Edit } from '../../src/ui/Edit'
import { MatchHost } from '../../src/ui/MatchHost'
import { Sheet } from '../../src/ui/Sheet'
import { TranslateContext, makeTranslate } from '../../src/ui/i18n'

/**
 * The two P1 findings from `REVIEW-chess-craft-pixel-redesign-2026-08-07.md`,
 * pinned so the fixes cannot be dropped by the next rewrite.
 *
 * Both existed because nothing looked. That is the point of this file: a fix
 * with no guard is half a fix, and this repo has a recorded failure
 * (`[fail:render] rewrite-dropped-a-documented-guard`) about exactly what
 * happens to an unguarded invariant when a file is rewritten wholesale.
 */

afterEach(cleanup)

const content = (() => {
  const r = loadContentSet(bundledContentSource)
  if (!r.ok) throw new Error('bundled content must load')
  return r.set
})()

/** The slice set, whose three-move line to a result `e2e/slice.spec.ts` pins. */
const slice = (() => {
  const r = loadContentSet(sliceContentSource)
  if (!r.ok) throw new Error('slice content must load')
  return r.set
})()

/** Clears the opening draft so the board accepts moves (AC-005 gates it). */
function pastDraft(container: HTMLElement) {
  for (let i = 0; i < 4; i++) {
    const offer = container.querySelector('[data-testid^="offer-"]')
    if (!offer) break
    fireEvent.click(offer)
  }
}

describe('a full-screen overlay leaves nothing live underneath (P1 046cbe6a)', () => {
  /*
   * `Result` and the curtain are `position: absolute; inset: 0` inside `.play`.
   * z-index changes paint order — not tab order, not the accessibility tree, and
   * not what a locator matches. Before the fix a keyboard user tabbed through
   * five invisible controls at the result screen, and every board square stayed
   * reachable behind the curtain, whose whole purpose is that the waiting player
   * must not reach the position.
   */

  it('unmounts the tools row behind the hand-off curtain', () => {
    const { container } = render(<MatchHost content={content} presetId={BUNDLED_PRESET_ID} newSeed={() => 7} />)
    pastDraft(container)
    expect(screen.getByTestId('new-match'), 'precondition: the tools row is there mid-match').toBeTruthy()

    fireEvent.click(screen.getByTestId('sq-d2'))
    fireEvent.click(screen.getByTestId('sq-d3'))
    expect(screen.getByTestId('curtain'), 'a completed ply raises the curtain').toBeTruthy()

    // UNMOUNTED, not merely hidden — see the note on the duplicate test id below.
    expect(screen.queryByTestId('new-match')).toBeNull()
    expect(screen.queryByTestId('go-home')).toBeNull()
    expect(screen.queryByTestId('match-settings')).toBeNull()

    // And the position itself is hidden, which is the curtain's entire reason to
    // exist. `hidden` rather than `inert`: the waiting player must not SEE it.
    expect(container.querySelector('.play-cover')?.hasAttribute('hidden')).toBe(true)

    // One tap brings everything back — the cost of the fix is that tap.
    fireEvent.click(screen.getByTestId('curtain'))
    expect(screen.getByTestId('new-match')).toBeTruthy()
    expect(container.querySelector('.play-cover')?.hasAttribute('hidden')).toBe(false)
  })

  it('leaves exactly one home button at the result screen', () => {
    /*
     * The regression this guards is subtle and would not have failed anything:
     * `Result` carries its own home button, so with the tools row merely
     * `hidden` there would be TWO `go-home` nodes in the document. A Playwright
     * strict-mode locator matches both regardless of visibility, and
     * `e2e/nav.ts` wraps its lookup in `.catch(() => false)` — which would
     * swallow the violation and silently report the control as absent.
     *
     * Played to a real result rather than handed a forced `result` prop: the
     * claim is about what the finished screen renders. The line is the
     * deterministic one `e2e/slice.spec.ts` already pins — white walks an archer
     * onto the beacon at c3, which carries it to d4 and ends the match.
     */
    const { container } = render(<MatchHost content={slice} presetId={SLICE_PRESET_ID} newSeed={() => 7} onHome={() => {}} />)
    pastDraft(container)

    const step = (from: string, to: string) => {
      const curtain = container.querySelector<HTMLElement>('[data-testid="curtain"]')
      if (curtain) fireEvent.click(curtain)
      fireEvent.click(screen.getByTestId(`sq-${from}`))
      fireEvent.click(screen.getByTestId(`sq-${to}`))
    }
    step('c1', 'c2')
    step('d6', 'd5')
    step('c2', 'c3')

    expect(screen.getByTestId('result'), 'the fixture never reached a result — the line is wrong, not skippable').toBeTruthy()

    expect(screen.getAllByTestId('go-home')).toHaveLength(1)
    expect(screen.queryByTestId('new-match'), 'the tools row must not survive under Result').toBeNull()
    // The board stays VISIBLE behind the summary — that is why Result is an
    // overlay rather than an early return — but it is inert.
    const cover = container.querySelector('.play-cover')
    expect(cover?.hasAttribute('hidden'), 'the final position must stay readable').toBe(false)
    expect(cover?.hasAttribute('inert'), 'a visible subtree behind a modal must be inert').toBe(true)
    expect(container.querySelector('[data-testid^="sq-"]'), 'the board is still rendered').toBeTruthy()
  })
})

describe('the room builder guards both records it commits (P1 07186e41)', () => {
  /*
   * The redesign made this screen edit TWO content records — the preset and its
   * board — and gave the stale-save guard to one of them. A board changed
   * anywhere else was silently overwritten by this screen's older draft, and the
   * file's own comment claimed "identical hazard, identical guard" while
   * implementing half of it.
   */

  function Host({ initial }: { initial: ContentSource }) {
    const [source, setSource] = useState(initial)
    return (
      <TranslateContext.Provider value={makeTranslate(source.strings)}>
        <Edit source={source} onCommit={setSource} />
      </TranslateContext.Provider>
    )
  }

  it('refuses a save whose board moved underneath it, and says so', () => {
    render(<Host initial={structuredClone(sliceContentSource) as ContentSource} />)

    // Open the room. Its board draft is snapshotted at mount.
    fireEvent.click(screen.getByTestId('room-open-preset.slice'))
    expect(screen.getByTestId('room-detail')).toBeTruthy()

    // Change the SAME board through the library, leaving the preset untouched —
    // this is the case a preset-only snapshot cannot see.
    fireEvent.click(screen.getByTestId('editor-tab-library'))
    fireEvent.change(screen.getByTestId('editor-kind'), { target: { value: 'board' } })
    fireEvent.click(screen.getByTestId('library-open-board.slice'))
    fireEvent.change(screen.getByTestId('editor-name'), { target: { value: '고친 판' } })
    fireEvent.click(screen.getByTestId('editor-save'))
    expect(screen.queryByTestId('editor-errors')).toBeNull()

    // Back to the still-mounted room, which is now holding a stale board.
    fireEvent.click(screen.getByTestId('editor-tab-rooms'))
    fireEvent.click(screen.getByTestId('room-save'))

    const errors = screen.getByTestId('room-errors')
    expect(errors, 'the stale board save must be refused').toBeTruthy()
    expect(within(errors).getByText(/./)).toBeTruthy()
    expect(screen.queryByTestId('room-saved'), 'and must not report success').toBeNull()
  })

  it('does not refuse a NEW room whose seed board moved — it forks, it does not overwrite', () => {
    /*
     * The regression the first version of this guard introduced, now pinned.
     *
     * A new room seeds its board from `boards[0]`, which an existing room
     * already references — so the save FORKS into a fresh record and never
     * touches the original. Checking staleness before that decision refused the
     * save anyway, on the most ordinary path the editor has, with a message
     * about a record the save was not going to write.
     */
    render(<Host initial={structuredClone(sliceContentSource) as ContentSource} />)
    fireEvent.click(screen.getByTestId('room-new'))
    expect(screen.getByTestId('room-detail')).toBeTruthy()

    // Move the seed board underneath the new room, from the library.
    fireEvent.click(screen.getByTestId('editor-tab-library'))
    fireEvent.change(screen.getByTestId('editor-kind'), { target: { value: 'board' } })
    fireEvent.click(screen.getByTestId('library-open-board.slice'))
    fireEvent.change(screen.getByTestId('editor-name'), { target: { value: '옮긴 판' } })
    fireEvent.click(screen.getByTestId('editor-save'))
    expect(screen.queryByTestId('editor-errors')).toBeNull()

    // The new room still saves: its board is a fork, not the record that moved.
    fireEvent.click(screen.getByTestId('editor-tab-rooms'))
    fireEvent.click(screen.getByTestId('room-step-name'))
    fireEvent.change(screen.getByTestId('room-name'), { target: { value: '새 방' } })
    fireEvent.click(screen.getByTestId('room-save'))
    expect(screen.queryByTestId('room-errors'), 'a forking save must not be refused as stale').toBeNull()
    expect(screen.getByTestId('room-saved')).toBeTruthy()
  })

  it('still saves normally when nothing moved', () => {
    // The negative case, so the guard cannot pass by refusing everything — which
    // is the cheapest way to satisfy the test above.
    render(<Host initial={structuredClone(sliceContentSource) as ContentSource} />)
    fireEvent.click(screen.getByTestId('room-open-preset.slice'))
    fireEvent.click(screen.getByTestId('room-save'))
    expect(screen.queryByTestId('room-errors')).toBeNull()
    expect(screen.getByTestId('room-saved')).toBeTruthy()
  })
})

describe('the detail sheet is modal to the keyboard, not only to the mouse (P2 34304a74)', () => {
  it('moves focus in, traps Tab, closes on Escape and restores focus', () => {
    const { container } = render(<MatchHost content={content} presetId={BUNDLED_PRESET_ID} newSeed={() => 7} />)
    pastDraft(container)

    // The legend chip is a real opener a player uses, so focus restoration is
    // asserted against the control that actually opened the sheet.
    const opener = container.querySelector<HTMLElement>('[data-testid="square-legend"] button')
    expect(opener, 'the opening board paints a square — the fixture is broken').toBeTruthy()
    opener!.focus()
    expect(document.activeElement).toBe(opener)
    fireEvent.click(opener!)

    const sheet = screen.getByTestId('peek-sheet').querySelector('[role="dialog"]') as HTMLElement
    expect(sheet).toBeTruthy()
    // Focus lands on the sheet, NOT on its close button — announcing "close"
    // before the definition is the over-eager version of this.
    expect(document.activeElement).toBe(sheet)
    expect(sheet.getAttribute('aria-modal')).toBe('true')

    // Escape closes it, which is the affordance a keyboard user reaches for.
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByTestId('peek-sheet')).toBeNull()
    // And focus comes back to where it was, not to the top of the document.
    expect(document.activeElement).toBe(opener)
  })

  it('wraps Tab at both ends rather than letting it walk out', () => {
    /*
     * Driven against `Sheet` directly, with TWO focusable stops.
     *
     * The first version of this test opened the real peek sheet, which has
     * exactly one focusable child — so `first === last`, and jsdom does not move
     * focus on a Tab keydown anyway. Focus therefore sat on the close button
     * before and after, and `sheet.contains(activeElement)` was true whether the
     * trap existed or not: the test could not fail if the whole handler were
     * deleted. That is this repo's own `[fail:test] assertion-equals-its-own-default`
     * (count 2), reproduced by the fix meant to close an accessibility finding.
     *
     * THREE stops, not two. With two, every position is adjacent to a boundary,
     * so there is no interior Tab to press — and a mutant that hijacks EVERY
     * forward Tab to `first` and every Shift+Tab to `last` passes all of it,
     * because "forward Tab from `first` lands on `first`" is true of both the
     * correct trap and the hijack. A middle stop is the only position that tells
     * a boundary-scoped trap apart from a keystroke-stealing one.
     */
    render(
      <Sheet label="three stops" onClose={() => {}} scrimTestId="trap-fixture">
        <button data-testid="stop-first">first</button>
        <button data-testid="stop-middle">middle</button>
        <button data-testid="stop-last">last</button>
      </Sheet>,
    )
    const first = screen.getByTestId('stop-first')
    const middle = screen.getByTestId('stop-middle')
    const last = screen.getByTestId('stop-last')

    // Forward off the last stop wraps to the first.
    last.focus()
    fireEvent.keyDown(document, { key: 'Tab' })
    expect(document.activeElement, 'Tab past the last stop must wrap to the first').toBe(first)

    // Backward off the first wraps to the last.
    first.focus()
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true })
    expect(document.activeElement, 'Shift+Tab past the first stop must wrap to the last').toBe(last)

    // An INTERIOR Tab is left to the browser in both directions. This is the
    // assertion the two-stop version could not express, and the one that fails
    // for a trap that steals every keystroke rather than only the two ends.
    middle.focus()
    fireEvent.keyDown(document, { key: 'Tab' })
    expect(document.activeElement, 'a forward Tab from the middle must not be hijacked').toBe(middle)
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true })
    expect(document.activeElement, 'a backward Tab from the middle must not be hijacked').toBe(middle)
  })
})

describe('the chrome scan covers the screens this redesign added', () => {
  it('names every new screen in the literal-text file list', () => {
    /*
     * Not a finding in itself — it is why the `VS` literal in `Lobby.tsx`
     * shipped. `PHASE_1_CHROME` in `chrome-i18n.test.tsx` is a hand-maintained
     * list, and five screens added by this change are absent from it, so any
     * English literal in them is invisible to the guard that exists to catch
     * exactly that.
     */
    const src = readFileSync(join(__dirname, 'chrome-i18n.test.tsx'), 'utf8')
    const missing = ['Lobby.tsx', 'Boot.tsx', 'Result.tsx', 'TabBar.tsx', 'MiniBoard.tsx'].filter(
      (file) => !src.includes(`'${file}'`),
    )
    expect(missing, `chrome-i18n's scan list omits: ${missing.join(', ')}`).toEqual([])
  })
})
