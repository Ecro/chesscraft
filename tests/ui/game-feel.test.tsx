// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { loadContentSet } from '../../src/content/load'
import { BUNDLED_PRESET_ID, bundledContentSource } from '../../src/content/sets/bundled'
import { MatchHost, eventFor } from '../../src/ui/MatchHost'
import { SETTINGS_KEY, type Settings, loadSettings, saveSettings } from '../../src/ui/settings'
import { SOUND_EVENTS, type SoundEvent, hapticsSupported, synthFor } from '../../src/ui/sound'

// Spied at the module boundary, so the reachability assertion is "the component
// called this", not "the source file mentions it".
//
// `vi.hoisted` is not decoration: `vi.mock` is lifted above every import in the
// file, so a factory closing over a plain `const` reads it before it is
// initialised and the WHOLE file fails to load — eleven tests reporting a
// harness crash instead of a missing implementation.
const mockPlay = vi.hoisted(() => vi.fn())
vi.mock('../../src/ui/sound', async (orig) => {
  const real = (await orig()) as Record<string, unknown>
  return { ...real, play: mockPlay }
})

/**
 * Events this file does not drive through the component: a capture needs the two
 * sides in contact, and both endings need a played-out line. Named explicitly so
 * the gap is an admission rather than a silent hole — anything NOT listed here
 * must be reached.
 *
 * The endings are not untested, though: `eventFor` is a pure exported function
 * and the describe below asserts every branch of it directly, which is why the
 * exclusion is a routing detail rather than a coverage hole.
 *
 * The list started with `illegal` in it too, on the assumption that provoking a
 * rejection needed a card in hand. Review pointed out both hands are full the
 * moment the draft ends, so clicking the opponent's card is one line away — an
 * exclusion list is only honest if every entry has been re-checked.
 */
const REACHED_BY_OTHER_PATHS: SoundEvent[] = ['capture', 'win', 'draw']

/**
 * PLAN Phase 5 — game feel.
 *
 * Two things here are not about polish at all. The animation is driven by the
 * APPLIED ACTION rather than by diffing board states, because the engine gives
 * pieces no instance identity — `state.board.get(sq)` is keyed by square, so a
 * diff-driven tween animates squares and a piece fades out and in instead of
 * sliding. And undo has to clear it, or the board replays the move that was
 * just taken back.
 *
 * The sound layer is asserted as a pure mapping (event → synthesis parameters)
 * because that is the part that can be tested without an AudioContext; whether
 * a tone is pleasant is not a claim a test can make, and pretending otherwise
 * would be theatre.
 */

const content = (() => {
  const r = loadContentSet(bundledContentSource)
  if (!r.ok) throw new Error('bundled content must load')
  return r.set
})()

function memoryStorage(): Storage {
  const map = new Map<string, string>()
  return {
    get length() {
      return map.size
    },
    clear: () => map.clear(),
    getItem: (k) => map.get(k) ?? null,
    key: (i) => [...map.keys()][i] ?? null,
    removeItem: (k) => void map.delete(k),
    setItem: (k, v) => void map.set(k, v),
  } as Storage
}

/** Clears the opening draft so the board accepts moves. */
function pastDraft(container: HTMLElement) {
  for (let i = 0; i < 4; i++) {
    const offer = container.querySelector('[data-testid^="offer-"]')
    if (!offer) break
    fireEvent.click(offer)
  }
}

describe('the animation follows the action that was applied', () => {
  it('marks the move it just played, from and to', () => {
    const { container } = render(<MatchHost content={content} presetId={BUNDLED_PRESET_ID} newSeed={() => 7} />)
    pastDraft(container)

    // A pawn's opening step: d2 is occupied by white at setup.
    fireEvent.click(screen.getByTestId('sq-d2'))
    fireEvent.click(screen.getByTestId('sq-d3'))

    expect(screen.getByTestId('sq-d2').getAttribute('data-last'), 'from').toBe('from')
    expect(screen.getByTestId('sq-d3').getAttribute('data-last'), 'to').toBe('to')
    // Exactly the two squares of the move — a highlight that marks more than
    // the move is not a last-move highlight.
    const marked = [...container.querySelectorAll('[data-last]')].map((e) => e.getAttribute('data-testid'))
    expect(marked.sort()).toEqual(['sq-d2', 'sq-d3'])
  })

  it('forgets the move when it is taken back', () => {
    // The action outlives the state it produced unless something clears it, and
    // a board that keeps highlighting an undone move is lying about the past.
    const { container } = render(<MatchHost content={content} presetId={BUNDLED_PRESET_ID} newSeed={() => 7} />)
    pastDraft(container)
    fireEvent.click(screen.getByTestId('sq-d2'))
    fireEvent.click(screen.getByTestId('sq-d3'))
    expect(container.querySelectorAll('[data-last]').length).toBe(2)

    fireEvent.click(screen.getByTestId('undo'))
    expect(container.querySelectorAll('[data-last]').length).toBe(0)
  })

  it('forgets it on a new match too', () => {
    const { container } = render(<MatchHost content={content} presetId={BUNDLED_PRESET_ID} newSeed={() => 7} />)
    pastDraft(container)
    fireEvent.click(screen.getByTestId('sq-d2'))
    fireEvent.click(screen.getByTestId('sq-d3'))
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    fireEvent.click(screen.getByTestId('new-match'))
    expect(container.querySelectorAll('[data-last]').length).toBe(0)
    vi.restoreAllMocks()
  })
})

describe('motion is suppressed when the reader asks for it (#30)', () => {
  it('zeroes the duration token rather than each rule', () => {
    const css = readFileSync(join(__dirname, '../../src/ui/styles.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
    const tokens = readFileSync(join(__dirname, '../../src/ui/tokens.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
    // The duration lives in one place so the reduced-motion block is one rule,
    // not a sweep that a future transition can be added outside of.
    expect(tokens).toMatch(/--motion-[a-z-]*duration\s*:/)
    // The BLOCK's BODY, not the block's existence. A media query wrapped round
    // an unrelated tweak satisfied the old assertion while every transition kept
    // its full duration — the same shape as `comment-claims-unbuilt-safeguard`
    // and `distinct-is-not-distinguishable`, both already recorded here.
    const reduceBlock = css.match(/@media\s*\(\s*prefers-reduced-motion\s*:\s*reduce\s*\)[^{]*\{([\s\S]*?)\n\}/)
    expect(reduceBlock, 'no reduced-motion block').not.toBeNull()
    // EVERY declared duration, not one of them. `toMatch` is satisfied by a
    // single hit, so a block zeroing one of several tokens would pass while the
    // rest kept animating — the same one-instance-proves-the-set mistake as
    // `all-positive-fixture-hides-overcounting`, now at count 3.
    const declared = [...tokens.matchAll(/(--motion-[a-z-]*duration)\s*:/g)].map((m) => m[1]!)
    expect(declared.length).toBeGreaterThan(0)
    for (const token of declared) {
      expect(reduceBlock![1], token).toMatch(new RegExp(`${token}\\s*:\\s*0`))
    }
    // Every transition/animation in component CSS goes through the token.
    const timed = [...css.matchAll(/(transition|animation)\s*:[^;]+;/g)].map((m) => m[0])
    expect(timed.length).toBeGreaterThan(0)
    for (const rule of timed) expect(rule, rule).toMatch(/var\(--motion-/)
  })
})

describe('sound is a pure mapping until it reaches the speakers', () => {
  it('gives every declared event synthesis parameters', () => {
    expect(SOUND_EVENTS.length).toBeGreaterThanOrEqual(4)
    for (const event of SOUND_EVENTS) {
      const spec = synthFor(event)
      expect(spec, event).toBeTruthy()
      expect(spec.frequency, event).toBeGreaterThan(0)
      expect(spec.durationMs, event).toBeGreaterThan(0)
    }
  })

  it('plays nothing at all when sound is off, and something when it is on', async () => {
    // `vi.mock` above replaced `play` for every importer in this file, this test
    // included — asserting against the spy would prove nothing about muting, so
    // the real implementation is pulled in explicitly.
    const { play: realPlay } = (await vi.importActual('../../src/ui/sound')) as {
      play: (e: SoundEvent, s: Settings, b: { tone: (e: SoundEvent) => void }) => void
    }
    // The exit criterion's other half, and the classroom risk ADR-023 exists
    // for. The backend is injected so this asserts SILENCE, rather than
    // asserting that a mute flag was read somewhere.
    const calls: SoundEvent[] = []
    const backend = { tone: (e: SoundEvent) => void calls.push(e) }

    for (const event of SOUND_EVENTS) realPlay(event, { sound: false, haptics: false, theme: 'system' }, backend)
    expect(calls, 'muted').toEqual([])

    for (const event of SOUND_EVENTS) realPlay(event, { sound: true, haptics: false, theme: 'system' }, backend)
    expect([...calls].sort()).toEqual([...SOUND_EVENTS].sort())
  })
})

describe('the feedback an action earns', () => {
  const move = { kind: 'move', from: 'd2', to: 'd3' } as const
  const empty = { board: new Map() }
  const occupied = { board: new Map([['d3', {}]]) }

  it('tells a draw from a win', () => {
    // They were the same event until review: `result` is merely truthy for
    // either, so a drawn match sang and buzzed exactly like a victory.
    expect(eventFor(move, empty, { result: { kind: 'win' } })).toBe('win')
    expect(eventFor(move, empty, { result: { kind: 'draw' } })).toBe('draw')
  })

  it('tells a capture from a step, and a draft from both', () => {
    expect(eventFor(move, occupied, { result: null })).toBe('capture')
    expect(eventFor(move, empty, { result: null })).toBe('move')
    expect(eventFor({ kind: 'draft_pick', cardId: 'x' }, empty, { result: null })).toBe('draft')
  })

  it('lets the ending outrank what the move otherwise was', () => {
    // A capture that ends the match is an ending first.
    expect(eventFor(move, occupied, { result: { kind: 'win' } })).toBe('win')
  })
})

describe('every declared sound is actually reached from the board', () => {
  it('fires its event when the matching thing happens', () => {
    // The first version read MatchHost's SOURCE and asked whether each event
    // name appeared in it — which a comment satisfies. Framework-check theatre
    // for a claim about behaviour, and the third recurrence of
    // `declared-but-inert-vocabulary` waiting to happen. This drives real user
    // actions and watches what the component actually calls.
    const { container } = render(<MatchHost content={content} presetId={BUNDLED_PRESET_ID} newSeed={() => 7} />)
    for (let i = 0; i < 4; i++) {
      const offer = container.querySelector('[data-testid^="offer-"]')
      if (!offer) break
      fireEvent.click(offer)
    }
    fireEvent.click(screen.getByTestId('sq-d2'))
    fireEvent.click(screen.getByTestId('sq-d3'))
    fireEvent.click(screen.getByTestId('undo'))
    // White is to move, so poking black's card is refused — which is the one
    // sound whose whole job is to say no.
    const blackCard = container.querySelector('[data-testid^="hand-black-"]')
    if (blackCard) fireEvent.click(blackCard)

    const fired = new Set(mockPlay.mock.calls.map((c) => c[0] as SoundEvent))
    expect(fired.has('draft'), 'draft pick').toBe(true)
    expect(fired.has('move'), 'a move').toBe(true)
    // Anything declared but reached by none of these paths is dead vocabulary.
    const unreachable = SOUND_EVENTS.filter((e) => !REACHED_BY_OTHER_PATHS.includes(e) && !fired.has(e))
    expect(unreachable).toEqual([])
  })
})

describe('the sound and haptics toggle', () => {
  let storage: Storage
  beforeEach(() => {
    storage = memoryStorage()
  })

  it('defaults to sound off and haptics on', () => {
    // A game opened in a classroom must not start making noise; a buzz nobody
    // else hears is a different question.
    const s = loadSettings(storage)
    expect(s.sound).toBe(false)
    expect(s.haptics).toBe(true)
    // 'system' is the absence of a choice — the OS layer decides until someone
    // picks, which is what makes the explicit override meaningful.
    expect(s.theme).toBe('system')
  })

  it('round-trips through storage', () => {
    saveSettings(storage, { sound: true, haptics: false, theme: 'system' })
    expect(loadSettings(storage)).toEqual({ sound: true, haptics: false, theme: 'system' })
    expect(storage.getItem(SETTINGS_KEY)).not.toBeNull()
  })

  it('survives a storage that refuses to co-operate', () => {
    const hostile = {
      getItem: () => {
        throw new Error('denied')
      },
      setItem: () => {
        throw new Error('denied')
      },
    } as unknown as Storage
    expect(() => loadSettings(hostile)).not.toThrow()
    expect(() => saveSettings(hostile, { sound: true, haptics: true, theme: 'system' })).not.toThrow()
  })

  it('reports haptics support from the platform, not from intent (ADR-023)', () => {
    // iOS Safari has no navigator.vibrate. A toggle that claims to buzz there
    // promises what the platform cannot do.
    const original = Object.getOwnPropertyDescriptor(navigator, 'vibrate')
    Object.defineProperty(navigator, 'vibrate', { value: undefined, configurable: true })
    expect(hapticsSupported()).toBe(false)
    Object.defineProperty(navigator, 'vibrate', { value: () => true, configurable: true })
    expect(hapticsSupported()).toBe(true)
    if (original) Object.defineProperty(navigator, 'vibrate', original)
  })
})
