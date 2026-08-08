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

describe('the result screen leaves nothing live underneath (P1 046cbe6a)', () => {
  /*
   * `Result` is `position: absolute; inset: 0` inside `.play`. z-index changes
   * paint order — not tab order, not the accessibility tree, and not what a
   * locator matches. Before the fix a keyboard user tabbed through five
   * invisible controls at the result screen and could fire the new-match button
   * from a screen that never shows it.
   */

  it('announces a hand-off without covering the board or waiting on a tap', () => {
    /*
     * This used to assert a full-screen curtain that unmounted the tools row and
     * hid the position until tapped. It was removed as too heavy for what it
     * bought — it covered the position two children were mid-argument about and
     * put a mandatory tap between every ply. What is asserted now is the thing
     * the curtain was genuinely good at, minus the cost: the hand-off is SAID,
     * the board stays live, and nothing waits for a dismissal.
     */
    const { container } = render(<MatchHost content={content} presetId={BUNDLED_PRESET_ID} newSeed={() => 7} />)
    pastDraft(container)
    expect(screen.queryByTestId('hand-off'), 'nothing to announce before a ply').toBeNull()

    fireEvent.click(screen.getByTestId('sq-d2'))
    fireEvent.click(screen.getByTestId('sq-d3'))

    const toast = screen.getByTestId('hand-off')
    expect(toast.getAttribute('data-side'), 'it names the side now to move').toBe('black')
    // Announced to assistive tech too — that is the half of the curtain worth
    // keeping, and a colour change alone does not carry it.
    expect(toast.getAttribute('role')).toBe('status')

    // Nothing is blocked: the board is still there, the tools row is still
    // mounted, and no overlay is claiming the screen.
    expect(container.querySelector('.play-cover')?.hasAttribute('hidden')).toBe(false)
    expect(container.querySelector('.play-cover')?.hasAttribute('inert')).toBe(false)
    expect(screen.getByTestId('new-match')).toBeTruthy()
    expect(screen.getByTestId('undo')).toBeTruthy()
    // And the next player can move immediately, with no dismissal in between.
    fireEvent.click(screen.getByTestId('sq-d5'))
    expect(container.querySelector('[data-legal="true"]'), 'the board accepts input straight away').toBeTruthy()
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

describe('a card the player cannot use is never a dead end', () => {
  /*
   * Seed 1 rather than the file's usual 7, and the reason is the bug itself:
   * seed 7 deals `skill.recall`, which at the opening has NO legal play — its
   * destination is an empty square on a back rank that is still full. That is a
   * perfectly good fixture for the refusal case and a useless one for the
   * disarm case, because nothing arms. Seed 1 deals `skill.swap`, which does.
   */
  /*
   * Reported from play: selecting an already-spent card left the match stuck.
   * Two holes met. A spent card stays on screen by design (AC-017 — both hands
   * visible with spent cards marked) but `clickCard` only asked whose turn it
   * was, so the mover's own spent card armed itself; and once armed there was no
   * way out, because every non-matching square tap reset the targets and left it
   * armed. The only exit was a new match.
   */

  /**
   * The first card in the mover's hand that actually arms.
   *
   * Not simply the first held card: at the opening, several bundled cards have
   * no legal play at all — `skill.recall` wants an empty square on a back rank
   * that is still full — and the fix under test is precisely that those are
   * refused rather than armed. A fixture that assumed the first card was
   * playable would be asserting against the bug.
   */
  function armable(container: HTMLElement): HTMLElement | null {
    for (const slot of container.querySelectorAll<HTMLElement>('.hotbar .slot[data-card]')) {
      fireEvent.click(slot)
      if (slot.getAttribute('data-pending') === 'true') return slot
    }
    return null
  }

  /*
   * Reported from play: "that card cannot target those squares" on a card whose
   * whole text is "all my pawns" — where do I click?
   *
   * Nowhere, and that was the bug. `skill.charge` quantifies over your own
   * pawns, so the engine offers it as a play with an EMPTY target list; the
   * same is true of `skill.recruit` and `skill.revive`, which place at your home
   * rank. The only code that committed a card lived inside the square handler,
   * so those cards armed, highlighted nothing, and refused every square the
   * player tried. The refusal message was accurate and useless.
   *
   * Seed 13 deals `skill.charge` as white's first offer, which `pastDraft`
   * picks. Chosen rather than hunted for: a fixture that took whatever card the
   * seed happened to give would test the one-target path most of the time and
   * this one never.
   */
  it('gives a card that asks for no square a way to be used', () => {
    const { container } = render(<MatchHost content={content} presetId={BUNDLED_PRESET_ID} newSeed={() => 13} />)
    pastDraft(container)

    const slot = container.querySelector<HTMLElement>('.hotbar .slot[data-card="skill.charge"]')
    expect(slot, 'seed 13 should deal skill.charge to white').toBeTruthy()
    fireEvent.click(slot!)

    // Armed — the card IS playable — with nothing anywhere to tap. Both halves
    // matter: an unplayable card is refused before arming, so reaching this
    // state at all means the board simply has no question to ask.
    expect(slot!.getAttribute('data-pending')).toBe('true')
    expect(container.querySelectorAll('[data-legal="true"]').length).toBe(0)

    fireEvent.click(screen.getByTestId('use-card'))

    // The card resolved rather than quietly disarming — and since ADR-001 that
    // does NOT hand the board over: the turn continues with the player who
    // spent the card, which is the whole point of the change.
    expect(container.querySelector('.play')?.getAttribute('data-turn')).toBe('white')
    expect(container.querySelector<HTMLElement>('.hotbar .slot[data-card="skill.charge"]')?.getAttribute('data-used')).toBe('true')

    // And it did what it said, immediately: a white pawn now offers a two-square
    // advance on this same turn. The UI fix is worth nothing if the card it
    // unlocked is still inert.
    fireEvent.click(screen.getByTestId('sq-c2'))
    const reach = [...container.querySelectorAll<HTMLElement>('[data-legal="true"]')].map((e) =>
      e.getAttribute('data-testid'),
    )
    expect(reach, 'charge should let a pawn on c2 rush to c4').toContain('sq-c4')
  })

  it('refuses a spent card instead of arming it', () => {
    /*
     * The reported sequence: use a card, play on, and on your next turn the
     * spent card is still in your hand — it stays visible by design — and
     * tapping it armed a card that could never resolve.
     */
    const { container } = render(<MatchHost content={content} presetId={BUNDLED_PRESET_ID} newSeed={() => 1} />)
    pastDraft(container)
    expect(armable(container), 'no card in the opening hand can be played').toBeTruthy()

    // Spend it. A card can want more than one square — `skill.swap` names a
    // friendly and an enemy — so feed it highlighted squares until it resolves.
    // Re-queried each pass: resolving ends the ply and unmounts the tile.
    for (let i = 0; i < 4; i++) {
      const armed = container.querySelector<HTMLElement>('.hotbar .slot[data-pending="true"]')
      if (!armed) break
      const target = container.querySelector<HTMLElement>('[data-legal="true"]')
      expect(target, 'an armed card must highlight somewhere to use it').toBeTruthy()
      fireEvent.click(target!)
    }

    // The card no longer ends the turn (ADR-001), so white owes a move before
    // the board changes hands. Neither loop below can be dropped: without the
    // white one the turn never passes, and the spent-card refusal this test is
    // about is only reachable on white's NEXT turn.
    let whiteMoved = false
    for (const sq of container.querySelectorAll<HTMLElement>('.board .square[data-side="white"]')) {
      fireEvent.click(sq)
      const target = container.querySelector<HTMLElement>('[data-legal="true"]')
      if (!target) continue
      fireEvent.click(target)
      whiteMoved = true
      break
    }
    expect(whiteMoved, 'white had no move to close its turn with — the fixture is broken').toBe(true)

    // Hand the turn back: black moves, and white is on strike again holding a
    // card it has already spent.
    // The FIRST black piece is not necessarily a piece that can move — a back
    // rank boxed in by its own pawns is the normal opening — so try each until
    // one highlights something.
    let moved = false
    for (const sq of container.querySelectorAll<HTMLElement>('.board .square[data-side="black"]')) {
      fireEvent.click(sq)
      const target = container.querySelector<HTMLElement>('[data-legal="true"]')
      if (!target) continue
      fireEvent.click(target)
      moved = true
      break
    }
    expect(moved, 'black had no legal move at all — the fixture is broken').toBe(true)

    const spent = container.querySelector<HTMLElement>('.hotbar .slot[data-used="true"]')
    expect(spent, "the spent card is not in its owner's hand — AC-017 wants it visible").toBeTruthy()
    fireEvent.click(spent!)
    expect(spent!.getAttribute('data-pending'), 'a spent card must not arm').toBe('false')
    expect(screen.getByTestId('rejection'), 'and it must say why').toBeTruthy()
  })

  it('disarms an armed card when it is tapped again', () => {
    const { container } = render(<MatchHost content={content} presetId={BUNDLED_PRESET_ID} newSeed={() => 1} />)
    pastDraft(container)
    const tile = armable(container)
    expect(tile, 'no card in the opening hand can be played — the fixture is broken').toBeTruthy()
    expect(tile!.getAttribute('data-pending'), 'precondition: the card armed').toBe('true')

    // The way out. Without it the only exit from a card that matches nothing is
    // starting a new match.
    fireEvent.click(tile!)
    expect(tile!.getAttribute('data-pending'), 'tapping the armed card again disarms it').toBe('false')
    expect(screen.queryByTestId('rejection'), 'and cancelling is not an error').toBeNull()
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
