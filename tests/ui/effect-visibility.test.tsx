// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { loadContentSet } from '@content/load'
import { BUNDLED_PRESET_ID, bundledContentSource } from '@content/sets/bundled'
import { apply, legalActions } from '@engine/engine'
import { createPosition } from '@engine/match'
import { CARD_BANNER_MS, MatchHost } from '../../src/ui/MatchHost'
import { makeTranslate } from '../../src/ui/i18n'

/**
 * What the board says about the effects standing on it.
 *
 * The engine has carried `frozenUntil` and `grants` since v3 and the board drew
 * neither: a piece that could not move looked exactly like one that would not,
 * and the only way to find out was to tap it and be refused. These tests are
 * about the three surfaces ADR-005 adds — the square badge, the legend chip and
 * the peek sheet — plus the turn flow ADR-001 and ADR-003 put around them.
 */

afterEach(cleanup)

const content = (() => {
  const r = loadContentSet(bundledContentSource)
  if (!r.ok) throw new Error('bundled content must load')
  return r.set
})()

/**
 * Clears the opening draft, taking a named card for white where asked.
 *
 * Seed 1 offers white `skill.swap`, `skill.sacrifice` and `skill.freeze`. The
 * freeze is the one worth having here: it is the only shipped card that leaves
 * a mark on a square a player can point at, and picking it by NAME rather than
 * by position keeps the fixture readable when the offer order changes.
 */
function draftTaking(container: HTMLElement, whiteCard: string) {
  const wanted = container.querySelector<HTMLElement>(`[data-testid="offer-${whiteCard}"]`)
  expect(wanted, `seed 1 should offer ${whiteCard} to white`).toBeTruthy()
  fireEvent.click(wanted!)
  for (let i = 0; i < 3; i += 1) {
    const offer = container.querySelector<HTMLElement>('[data-testid^="offer-"]')
    if (!offer) break
    fireEvent.click(offer)
  }
}

/** Plays the named card at the first square the board offers for it. */
function playCardAtFirstTarget(container: HTMLElement, cardId: string) {
  const slot = container.querySelector<HTMLElement>(`.hotbar .slot[data-card="${cardId}"]`)
  expect(slot, `${cardId} should be in the mover's hand`).toBeTruthy()
  fireEvent.click(slot!)
  expect(slot!.getAttribute('data-pending'), `${cardId} should arm`).toBe('true')
  const target = container.querySelector<HTMLElement>('[data-legal="true"]')
  expect(target, 'an armed freeze should highlight the pieces it can hit').toBeTruthy()
  fireEvent.click(target!)
  return target!.getAttribute('data-testid')!.replace('sq-', '')
}

/**
 * White reduced to one king frozen by a non-skill layer, holding an enemy debuff.
 *
 * Built rather than dealt: a card that strands its own owner is exactly what
 * ADR-003 exists for and no opening produces it. Black spends its freeze on the
 * white king and closes its turn; white is then on strike with a card it can
 * play and no piece that can move.
 */
function strandedWhite() {
  const start = createPosition({
    content,
    presetId: BUNDLED_PRESET_ID,
    seed: 3,
    sideToMove: 'white',
    held: { white: ['skill.freeze'], black: [] },
    placements: [
      { square: 'a1', pieceId: 'piece.king', side: 'white' },
      { square: 'f6', pieceId: 'piece.king', side: 'black' },
      { square: 'e6', pieceId: 'piece.rook', side: 'black' },
    ],
  })
  const white = {
    ...start,
    frozenUntil: { a1: { untilPly: start.plyCount + 2, sourceId: 'fixture.rule', layer: 'rule' as const } },
  }
  expect(legalActions(white, content).some((a) => a.kind === 'move'), 'the fixture must really strand white').toBe(false)
  return white
}

function frozenBoard() {
  const rendered = render(<MatchHost content={content} presetId={BUNDLED_PRESET_ID} newSeed={() => 1} />)
  draftTaking(rendered.container, 'skill.freeze')
  const square = playCardAtFirstTarget(rendered.container, 'skill.freeze')
  return { ...rendered, square }
}

describe('a square under an effect says so', () => {
  it('marks the frozen square and counts down the plies left', () => {
    const { container, square } = frozenBoard()

    const cell = container.querySelector<HTMLElement>(`[data-testid="sq-${square}"]`)
    expect(cell, 'the frozen square should still be on the board').toBeTruthy()
    expect(cell!.getAttribute('data-effect')).toBe('frozen')
    // `skill.freeze` is four plies, and none has passed — the card resolved
    // without ending the turn (ADR-001), so the count is the card's full value.
    expect(cell!.getAttribute('data-effect-plies')).toBe('4')
  })

  it('leaves every other square unmarked', () => {
    const { container, square } = frozenBoard()
    // Scoped to the board: the pip and the legend chip carry `data-effect` too,
    // deliberately, and counting those here would make this test about the
    // number of surfaces rather than about the number of marked squares.
    const marked = [...container.querySelectorAll<HTMLElement>('.board .square[data-effect]')].map((e) =>
      e.getAttribute('data-testid'),
    )
    // Exactly one. A badge that appears on squares with nothing on them is the
    // failure mode of deriving the mark from anything other than live state.
    expect(marked).toEqual([`sq-${square}`])
  })
})

describe('the legend names what is live', () => {
  it('carries a chip for the effect, alongside the square types', () => {
    const { container } = frozenBoard()
    const chips = [...container.querySelectorAll<HTMLElement>('[data-testid="effect-chip"]')]
    expect(chips).toHaveLength(1)
    expect(chips[0]!.getAttribute('data-effect')).toBe('frozen')
  })

  it('has no effect chips at all before anything is live', () => {
    const { container } = render(<MatchHost content={content} presetId={BUNDLED_PRESET_ID} newSeed={() => 1} />)
    draftTaking(container, 'skill.freeze')
    // The row must cost nothing on the board a player spends most of the match
    // looking at — a permanently present empty row is vertical space taken from
    // the one screen this layout has (AC-017/AC-018).
    expect(container.querySelectorAll('[data-testid="effect-chip"]')).toHaveLength(0)
  })
})

describe('the player can find out which skill did it', () => {
  it('names the source card when the marked square is inspected', () => {
    const { container, square } = frozenBoard()
    const pip = container.querySelector<HTMLElement>(`[data-testid="sq-${square}"] [data-testid="effect-pip"]`)
    expect(pip, 'the badge should be its own hit area, not the square body').toBeTruthy()
    fireEvent.click(pip!)

    const sheet = screen.getByTestId('peek-sheet')
    // The card's own name as a player reads it — resolved through the same i18n
    // bundle the rest of the screen uses, not the id, which means nothing to
    // anyone, and not the effect's kind, which the badge already said.
    const name = makeTranslate()(content.skillCards.get('skill.freeze')!.nameKey)
    expect(name, 'the fixture needs a real translated name, not a key').not.toContain('.name')
    expect(sheet.textContent).toContain(name)
  })

  it('opens the same sheet from the chip', () => {
    const { container } = frozenBoard()
    fireEvent.click(container.querySelector<HTMLElement>('[data-testid="effect-chip"] button')!)
    expect(screen.getByTestId('peek-sheet')).toBeTruthy()
  })
})

describe('the turn continues after the card', () => {
  it('tells the player the move is still owed', () => {
    const { container } = frozenBoard()
    // The board is still theirs (ADR-001) and the line under it has to say so.
    // Before this phase it read "기물을 눌러 움직이세요" — accurate by accident,
    // and silent about the fact that a card had just been spent.
    expect(container.querySelector('.play')?.getAttribute('data-turn')).toBe('white')
    expect(container.querySelector('.hint-bar')?.textContent).toBe(makeTranslate()('ui.hint.now-move'))
  })

  it('offers no end-turn control while a move is available', () => {
    const { container } = frozenBoard()
    expect(container.querySelectorAll('[data-testid="end-turn"]')).toHaveLength(0)
  })

  it('offers the end-turn control exactly when the card left nothing to move', () => {
    // The positive half, and the reason the negative one above means anything.
    // No opening deals this position, so it is built: white is one frozen king
    // holding a card that moves nothing.
    const { container } = render(
      <MatchHost content={content} presetId={BUNDLED_PRESET_ID} newSeed={() => 1} initialState={strandedWhite()} />,
    )
    fireEvent.click(container.querySelector<HTMLElement>('.hotbar .slot[data-card="skill.freeze"]')!)
    const target = container.querySelector<HTMLElement>('[data-legal="true"]')
    fireEvent.click(target!)

    expect(container.querySelector('.hint-bar')?.textContent).toBe(makeTranslate()('ui.hint.no-moves'))
    const pass = screen.getByTestId('end-turn')
    fireEvent.click(pass)
    // It really ends the turn rather than merely disappearing.
    expect(container.querySelector('.play')?.getAttribute('data-turn')).toBe('black')
  })

  it('takes back only the card when undo is pressed mid-turn', () => {
    const { container } = frozenBoard()
    fireEvent.click(screen.getByTestId('undo'))

    // The card is back in hand, unspent, and the board is still white's.
    expect(container.querySelector('.play')?.getAttribute('data-turn')).toBe('white')
    expect(container.querySelectorAll('[data-effect]')).toHaveLength(0)
    const slot = container.querySelector<HTMLElement>('.hotbar .slot[data-card="skill.freeze"]')
    expect(slot!.getAttribute('data-used')).toBe('false')
  })

  it('takes back the whole turn, never resting on the opponent’s half-turn', () => {
    // The branch that distinguishes contextual undo from pop-one (ADR-007). A
    // turn pushes two states, so one tap of a naive undo lands on the state
    // between white's card and white's move — a board that is nobody's
    // turn-in-progress, shown to black, who never saw it happen.
    const { container } = frozenBoard()
    // Close white's turn: pick any piece, then any square it offers.
    for (const cell of container.querySelectorAll<HTMLElement>('.board .square[data-side="white"]')) {
      fireEvent.click(cell)
      const to = container.querySelector<HTMLElement>('[data-legal="true"]')
      if (!to) continue
      fireEvent.click(to)
      break
    }
    expect(container.querySelector('.play')?.getAttribute('data-turn'), 'white should have completed its turn').toBe(
      'black',
    )

    fireEvent.click(screen.getByTestId('undo'))

    // One tap, one retraction: back to the start of white's turn, with the card
    // unspent and its effect gone — not to the half-turn in the middle.
    expect(container.querySelector('.play')?.getAttribute('data-turn')).toBe('white')
    expect(container.querySelectorAll('[data-effect]')).toHaveLength(0)
    expect(
      container.querySelector<HTMLElement>('.hotbar .slot[data-card="skill.freeze"]')!.getAttribute('data-used'),
    ).toBe('false')
  })

  it('announces the hand-off on the move, and not on the card', async () => {
    // The classification gained a third case (ADR-007): an action that neither
    // passes the phone nor is an undo. Announcing the card would tell a player
    // to hand over a board they are still holding.
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      const { container } = frozenBoard()
      expect(container.querySelectorAll('[data-testid="hand-off"]')).toHaveLength(0)

      for (const cell of container.querySelectorAll<HTMLElement>('[data-side="white"]')) {
        fireEvent.click(cell)
        const to = container.querySelector<HTMLElement>('[data-legal="true"]')
        if (!to) continue
        fireEvent.click(to)
        break
      }

      /*
       * The hand-off is QUEUED behind the card banner now, not dropped
       * (ADR-004 of PLAN-skill-legibility-and-onboarding). This fixture plays a
       * card and then the move it owes, so the banner naming that card is still
       * up at the instant the move lands and the hand-off waits its turn —
       * which is the point: whose-turn-is-it must not be lost to a card play,
       * and it must not be stacked on top of one either.
       *
       * What this test is about is unchanged: the announcement belongs to the
       * MOVE, not to the card. Only when it becomes visible has moved.
       */
      expect(screen.queryByTestId('hand-off'), 'the card outranks it for now').toBeNull()
      await vi.advanceTimersByTimeAsync(CARD_BANNER_MS + 10)
      await waitFor(() => expect(screen.getByTestId('hand-off')).toBeTruthy())
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('a new effect arrives with a flourish, unless the player asked it not to', () => {
  it('marks the square the effect just landed on', () => {
    const { container, square } = frozenBoard()
    expect(container.querySelector(`[data-testid="sq-${square}"]`)?.getAttribute('data-effect-new')).toBe('true')
  })

  it('says nothing extra under prefers-reduced-motion', () => {
    const original = window.matchMedia
    window.matchMedia = ((query: string) =>
      ({ matches: query.includes('prefers-reduced-motion'), media: query, addEventListener() {}, removeEventListener() {} }) as unknown as MediaQueryList) as typeof window.matchMedia
    try {
      const { container, square } = frozenBoard()
      // The badge still appears — the information is not the animation.
      expect(container.querySelector(`[data-testid="sq-${square}"]`)?.getAttribute('data-effect')).toBe('frozen')
      expect(container.querySelector(`[data-testid="sq-${square}"]`)?.getAttribute('data-effect-new')).toBeNull()
    } finally {
      window.matchMedia = original
    }
  })
})
