// @vitest-environment jsdom
import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { BUNDLED_PRESET_ID, bundledContentSource } from '../../src/content/sets/bundled'
import { loadContentSet } from '../../src/content/load'
import { App } from '../../src/ui/App'
import { MatchHost, resultLabel } from '../../src/ui/MatchHost'
import { makeTranslate } from '../../src/ui/i18n'

/**
 * PLAN Phase 2 — the match lifecycle, and the two defects that made the
 * product's own value proposition unreachable (RESEARCH #1, #2).
 *
 * The seed assertions are the point of the phase. `App` never passed a seed, so
 * `seed = 1` applied forever and every match drew the identical rule card and
 * the identical drafts; AC-004's determinism was intact and simultaneously the
 * only behaviour anyone could observe. Both halves are asserted here through the
 * PRODUCT path (a rendered component), not by calling `createMatch` directly —
 * a determinism test that bypasses the component is exactly what let the defect
 * live behind a green suite.
 *
 * The localisation assertions read RENDERED OUTPUT rather than source literals,
 * because Phase 1's scanner reads JSX text nodes and is structurally blind to an
 * English string that arrives as the runtime value of an expression — which is
 * precisely what `{state.result.reason}`, `{state.sideToMove}` and the preset
 * `{id}` are. Review round 2 recorded that gap; this is where it closes.
 */

const content = (() => {
  const loaded = loadContentSet(bundledContentSource)
  if (!loaded.ok) throw new Error('bundled content must load')
  return loaded.set
})()

/** Machine values that must never reach the player as visible text. */
const MACHINE_WORDS =
  /\b(white|black|draft|result|king_capture|win_action|material_cap|preset\.[a-z0-9-]+|piece\.[a-z]+)\b/

function ruleOf(container: HTMLElement): string {
  return container.querySelector('[data-testid="rule-card"]')?.getAttribute('data-rule') ?? ''
}

function offersOf(container: HTMLElement): string[] {
  return [...container.querySelectorAll('[data-testid^="offer-"]')].map((e) => e.getAttribute('data-card') ?? '')
}

describe('a fixed seed still reproduces a match exactly (AC-004, through the product path)', () => {
  it('draws the same rule card and the same first offers on two independent mounts', () => {
    const a = render(<MatchHost content={content} presetId={BUNDLED_PRESET_ID} newSeed={() => 4242} />)
    const first = { rule: ruleOf(a.container), offers: offersOf(a.container) }
    a.unmount()

    const b = render(<MatchHost content={content} presetId={BUNDLED_PRESET_ID} newSeed={() => 4242} />)
    expect(ruleOf(b.container)).toBe(first.rule)
    expect(offersOf(b.container)).toEqual(first.offers)
    // A vacuous pass would be two empty strings — the fixture has to have drawn.
    expect(first.rule).not.toBe('')
    expect(first.offers).toHaveLength(3)
  })
})

describe('a new match is actually new (RESEARCH #2)', () => {
  it('draws different rule cards across a sample of seeds', () => {
    const seen = new Set<string>()
    for (const seed of [1, 2, 3, 5, 8, 13, 21, 34]) {
      const { container, unmount } = render(
        <MatchHost content={content} presetId={BUNDLED_PRESET_ID} newSeed={() => seed} />,
      )
      seen.add(ruleOf(container))
      unmount()
    }
    // The bundle ships 11 rule cards. One distinct value across eight seeds is
    // the defect this phase exists to remove, so the floor is deliberately > 1.
    expect(seen.size).toBeGreaterThan(1)
  })

  it('defaults to a varying seed when the host is given no generator', () => {
    // The regression is a component that only varies when a test hands it a
    // generator — the product path must vary on its own.
    const seen = new Set<string>()
    for (let i = 0; i < 12; i++) {
      const { container, unmount } = render(<MatchHost content={content} presetId={BUNDLED_PRESET_ID} />)
      seen.add(ruleOf(container))
      unmount()
    }
    expect(seen.size).toBeGreaterThan(1)
  })
})

/**
 * The seed lives in the match settings drawer, not on the tools row.
 *
 * It moved there when the tools row was cut from five wrapping controls to two
 * actions: a ten-digit number is developer output, and this app's players are
 * children. ADR-024's contract is that the seed is REACHABLE and copyable, not
 * that it is permanently on screen — so these tests open the drawer, which is
 * what a player replaying a match does too.
 */
const openSettings = () => fireEvent.click(screen.getByTestId('match-settings'))

describe('the player can start another match', () => {
  // Scoped honestly: this drives the ALWAYS-AVAILABLE new-match control, not the
  // post-result rematch the exit criterion names. Reaching a terminal state
  // needs a played-out line, which `e2e/match-lifecycle.spec.ts` owns.
  it('re-draws when the always-available new-match control is used', () => {
    const seeds = [7, 99]
    let call = 0
    render(<MatchHost content={content} presetId={BUNDLED_PRESET_ID} newSeed={() => seeds[call++ % seeds.length]!} />)

    // Asserted on the SEED, not on the rule card it draws. The card is a
    // downstream sample of the seed and two arbitrary seeds can land on the
    // same one of eleven — the first version of this test used 7 and 99, which
    // both draw `rule.sudden-death`, so it failed against a correct
    // implementation. Whether a different seed produces a different card is a
    // property of the draw, and `draws different rule cards across a sample of
    // seeds` above owns it; what THIS test owns is that the control starts a
    // new match at all.
    openSettings()
    const before = screen.getByTestId('match-seed').textContent
    // A raw DOM .click() does not flush the React state update here; fireEvent
    // wraps it in act, which is what makes the re-draw observable.
    fireEvent.click(screen.getByTestId('new-match'))
    expect(screen.getByTestId('match-seed').textContent).not.toBe(before)
    expect(before).toContain('7')
  })

  it('will not discard a match in progress without asking, and honours the answer', () => {
    // Review round 2 raised this as P0: two children share one phone and the
    // control sits beside the board, so a mis-tap used to destroy the position,
    // both hands and the ply count with no way back — `undo` steps one ply, it
    // cannot restore a discarded match. The fix went in with no test, which is
    // how a guard quietly stops guarding.
    const seeds = [11, 22, 33]
    let call = 0
    const { container } = render(
      <MatchHost content={content} presetId={BUNDLED_PRESET_ID} newSeed={() => seeds[call++ % seeds.length]!} />,
    )
    // Get the match off ply 0 — a match nobody has played has nothing to lose,
    // and that is deliberately the case where no prompt appears.
    for (let i = 0; i < 4; i++) {
      const offer = container.querySelector('[data-testid^="offer-"]')
      if (!offer) break
      fireEvent.click(offer)
    }
    expect(screen.getByTestId('phase').getAttribute('data-phase')).toBe('play')

    openSettings()
    const seedNow = () => screen.getByTestId('match-seed').textContent
    const before = seedNow()

    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
    fireEvent.click(screen.getByTestId('new-match'))
    expect(confirmSpy).toHaveBeenCalled()
    expect(seedNow()).toBe(before) // declined — the match survived

    confirmSpy.mockReturnValue(true)
    fireEvent.click(screen.getByTestId('new-match'))
    expect(seedNow()).not.toBe(before) // accepted — a new match started
    confirmSpy.mockRestore()
  })

  it('shows the seed in play so a match can be replayed or shared (ADR-024)', () => {
    render(<MatchHost content={content} presetId={BUNDLED_PRESET_ID} newSeed={() => 4242} />)
    openSettings()
    expect(screen.getByTestId('match-seed').textContent).toContain('4242')
  })
})

describe('nothing machine-readable reaches the player as text', () => {
  it('keeps the machine value on the attribute and the words on screen localised', () => {
    const { container } = render(<MatchHost content={content} presetId={BUNDLED_PRESET_ID} newSeed={() => 4242} />)
    // The attributes the e2e suite drives must survive — they are the contract
    // that lets the visible text be translated at all.
    expect(container.querySelector('[data-testid="phase"]')?.getAttribute('data-phase')).toBeTruthy()
    expect(container.querySelector('[data-testid="side-to-move"]')?.getAttribute('data-side')).toBeTruthy()
    expect(container.textContent ?? '').not.toMatch(MACHINE_WORDS)
  })

  it.each([
    { kind: 'win', winner: 'white', reason: 'king_capture' },
    { kind: 'win', winner: 'black', reason: 'win_action' },
    { kind: 'draw', reason: 'material_cap' },
  ] as const)('localises the end-of-match banner for %j', (result) => {
    // The previous version of this file asserted MACHINE_WORDS against a match
    // that had never ended, so `{state.result.reason}` — the very leak the
    // docstring above claims to close — was in an unmounted branch and the test
    // passed either way. That is the same blind spot REVIEW recorded one level
    // up, reproduced one level down. The banner is asserted here through the
    // function the component actually renders it with.
    const label = resultLabel(makeTranslate(), result)
    expect(label).not.toMatch(MACHINE_WORDS)
    expect(label).toMatch(/[가-힣]/)
  })

  it('names presets by their translated name, not their id (#17)', () => {
    render(<App />)
    const select = screen.getByTestId('preset-select')
    const labels = [...within(select).getAllByRole('option')].map((o) => o.textContent ?? '')
    expect(labels.length).toBeGreaterThan(0)
    for (const label of labels) expect(label).not.toMatch(/^preset\./)
  })
})
