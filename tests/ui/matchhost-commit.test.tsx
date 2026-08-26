// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { loadContentSet } from '@content/load'
import { BUNDLED_PRESET_ID, bundledContentSource } from '@content/sets/bundled'
import { apply, legalActions } from '@engine/engine'
import { createMatch, currentState } from '@engine/match'
import type { GameState, SquareId } from '@engine/types'
import { COLLECTION_KEY, loadCollection, newlyReached, tierOf } from '../../src/collection/record'
import { MatchHost } from '../../src/ui/MatchHost'
import { MATCH_INTRO_SEEN_KEY, markSeen } from '../../src/ui/onboarding'

/**
 * Where the collection is written (PLAN Phase 3, ADR-008).
 *
 * One commit, at the moment the match acquires a result. Two properties are
 * load-bearing here and neither is visible from `observe`'s own tests.
 *
 * **A refusing storage must not reach the child** (AC-007). By the time this
 * runs the match is over and the result screen is rendering; a browser that
 * denies storage would otherwise turn the end of a game into a crash. The
 * failure direction is the same one `sound.ts` states for itself — a collection
 * is never worth an exception reaching the board.
 *
 * **A re-render must not commit twice** (PLAN risk R3). React re-renders for
 * reasons that have nothing to do with the match — a settings toggle, a banner
 * timer — and a commit keyed on the presence of a result rather than on the
 * transition to one would run on every single one of them, inflating the count
 * the result screen shows.
 *
 * **One test here PASSES before the implementation exists, and that is on
 * purpose.** `a refusing storage leaves the result screen rendered…` is a
 * NEGATIVE invariant: while nothing writes at all, nothing can throw, so it is
 * vacuously true. It earns its place on two conditions, both met.
 *
 * It goes red the moment the wrong implementation appears — a commit that lets
 * the storage exception escape blanks the render, and `getByTestId` then throws.
 * And a RED positive sibling forces that construct into existence:
 * `writes the finished match to the collection once` cannot pass without a real
 * write, so the branch this test guards cannot stay hypothetical.
 *
 * Measured at authoring time: 2 failed, 1 passed — the one being this test.
 */

afterEach(cleanup)

const content = (() => {
  const loaded = loadContentSet(bundledContentSource)
  if (!loaded.ok) throw new Error('bundled content must load')
  return loaded.set
})()

/** A `Storage` in a Map, counting writes so double-commits are visible. */
/**
 * NOT `skipOnboarding()`. That helper takes no argument and writes to the GLOBAL
 * `localStorage`, while `MatchHost` checks the storage it was HANDED
 * (`MatchHost.tsx:384` — `hasSeen(storage!, MATCH_INTRO_SEEN_KEY)`), so calling
 * it here would suppress nothing and, passed a storage, would not even compile.
 * The intro flag goes into the injected storage directly instead.
 */
function countingStorage(): Storage & { writes: number; map: Map<string, string> } {
  const map = new Map<string, string>()
  const s = {
    map,
    writes: 0,
    get length() {
      return map.size
    },
    clear: () => map.clear(),
    getItem: (k: string) => map.get(k) ?? null,
    key: (i: number) => [...map.keys()][i] ?? null,
    removeItem: (k: string) => void map.delete(k),
    setItem: (k: string, v: string) => {
      if (k === COLLECTION_KEY) s.writes += 1
      map.set(k, v)
    },
  }
  return s
}

/** Reads succeed and return null; every write throws, like a zero-quota browser. */
function refusingStorage(): Storage {
  const base = countingStorage()
  return {
    ...base,
    get length() {
      return base.length
    },
    setItem: () => {
      throw new DOMException('quota', 'QuotaExceededError')
    },
  }
}

/**
 * A terminal position: the opening deal with a win stamped onto it.
 *
 * `initialState` exists for exactly this (see its prop comment) — some states
 * are reachable in play and not reachable from an opening within a test's
 * patience, and a decisive result on ply one is one of them.
 *
 * Used only where the test is about what happens once a result EXISTS. The
 * transition itself has its own fixture below, because a commit keyed on the
 * `initialState` prop rather than on the live state would pass every test that
 * only ever mounts one of these — and would then never fire for a child who
 * actually played their match to the end, which is the whole feature.
 */
function finishedState(seed: number): GameState {
  const state = currentState(createMatch({ content, presetId: BUNDLED_PRESET_ID, seed }))
  return { ...state, result: { kind: 'win', winner: 'white', reason: 'king_capture' } } as GameState
}

/**
 * A position ONE board move away from a decisive result, and that move.
 *
 * Found by playing the engine forward and, at each state, asking whether any
 * legal `move` ends the match. Nothing is fabricated: the position is reachable,
 * the move is legal, and the result is the engine's own.
 *
 * Returns null when the search budget runs out, and the caller asserts on that
 * rather than skipping — a fixture that quietly failed to find its case would
 * make the test vacuous, which is the defect this fixture exists to avoid.
 */
function oneMoveFromResult(seed: number, budget = 200): { before: GameState; from: SquareId; to: SquareId } | null {
  let state = currentState(createMatch({ content, presetId: BUNDLED_PRESET_ID, seed }))
  for (let i = 0; i < budget; i += 1) {
    if (state.result) return null
    const actions = legalActions(state, content)
    for (const action of actions) {
      if (action.kind !== 'move') continue
      if (apply(state, action, content).result) return { before: state, from: action.from, to: action.to }
    }
    const next = actions.find((a) => a.kind === 'move') ?? actions[0]
    if (!next) return null
    state = apply(state, next, content)
  }
  return null
}

describe('the collection commit at match end', () => {
  it('writes the finished match to the collection once', () => {
    const storage = countingStorage()
    markSeen(storage, MATCH_INTRO_SEEN_KEY)
    render(
      <MatchHost content={content} presetId={BUNDLED_PRESET_ID} newSeed={() => 1} storage={storage} initialState={finishedState(1)} />,
    )
    expect(storage.writes, 'exactly one commit').toBe(1)
    const collection = loadCollection(storage)
    // The opening deal has every piece of the bundled board standing on it, so
    // whatever else is or is not recorded, those are met.
    const pieces = new Set([...finishedState(1).board.values()].map((p) => p.pieceId))
    expect(pieces.size, 'the board is not empty').toBeGreaterThan(0)
    for (const id of pieces) expect(tierOf(collection, id), id).not.toBe('unencountered')
  })

  it('commits once when the match reaches its result through play, not only when mounted finished', () => {
    // AC-001's When clause is "the match is played to its end". A commit keyed
    // on the `initialState` prop instead of on the live state passes every test
    // that mounts an already-terminal position — and then never fires for a
    // child who actually finished a game, which is the entire feature.
    const setup = oneMoveFromResult(1)
    expect(setup, 'a position one legal move from a result must be reachable').not.toBeNull()
    const { before, from, to } = setup as NonNullable<typeof setup>
    expect(before.result, 'the fixture must start with the match unfinished').toBeNull()

    const storage = countingStorage()
    markSeen(storage, MATCH_INTRO_SEEN_KEY)
    render(
      <MatchHost content={content} presetId={BUNDLED_PRESET_ID} newSeed={() => 1} storage={storage} initialState={before} />,
    )
    expect(storage.writes, 'nothing is committed while the match is still running').toBe(0)

    fireEvent.click(screen.getByTestId(`sq-${from}`))
    fireEvent.click(screen.getByTestId(`sq-${to}`))

    // The match is over, but the result SCREEN is not up yet: a king capture
    // holds the final board under `CaptureReveal` first (MatchHost.tsx:1861-1871),
    // and `Result` renders only once that clears. The commit must not wait for
    // it — it keys on the result existing, which is true the moment the move
    // lands. Accepting either surface is what makes that distinction explicit
    // rather than accidental.
    const ended = screen.queryByTestId('capture-reveal') ?? screen.queryByTestId('result-screen')
    expect(ended, 'the move must actually end the match').not.toBeNull()
    expect(storage.writes, 'the transition commits exactly once').toBe(1)
  })

  it('a re-render after the result appears does not commit twice', () => {
    // R3. The trigger has to be the TRANSITION to a result, not the presence of
    // one — otherwise every unrelated re-render writes again.
    //
    // Re-rendered through `rerender`, deliberately, and not by clicking a
    // control: `overlayOwnsScreen` is `Boolean(state.result)`, so every control
    // in the tools row is unmounted while the result screen is up. A test that
    // reached for one of those would assert nothing at all.
    const storage = countingStorage()
    markSeen(storage, MATCH_INTRO_SEEN_KEY)
    const view = render(
      <MatchHost content={content} presetId={BUNDLED_PRESET_ID} newSeed={() => 1} storage={storage} initialState={finishedState(1)} />,
    )
    expect(storage.writes).toBe(1)
    view.rerender(
      <MatchHost content={content} presetId={BUNDLED_PRESET_ID} newSeed={() => 1} storage={storage} initialState={finishedState(1)} />,
    )
    view.rerender(
      <MatchHost content={content} presetId={BUNDLED_PRESET_ID} newSeed={() => 1} storage={storage} initialState={finishedState(1)} />,
    )
    expect(screen.queryByTestId('result-screen'), 'still the same finished match').not.toBeNull()
    expect(storage.writes, 'a re-render must not write again').toBe(1)
  })

  it('names how many entries this match added, and shows nothing when it added none', () => {
    // AC-006. The number is the DELTA — what this match newly reached — not the
    // size of the collection, which would read the same on a match that
    // discovered nothing. Absence rather than a zero, because "0 발견" is a
    // consolation prize and the point of the line is that something happened.
    const storage = countingStorage()
    markSeen(storage, MATCH_INTRO_SEEN_KEY)

    const before = loadCollection(storage)
    const first = render(
      <MatchHost content={content} presetId={BUNDLED_PRESET_ID} newSeed={() => 1} storage={storage} initialState={finishedState(1)} />,
    )
    const after = loadCollection(storage)
    const added = newlyReached(before, after)
    expect(added.size, 'the first match of a fresh browser discovers something').toBeGreaterThan(0)

    const badge = screen.getByTestId('result-new')
    // Measured against a delta the test computed from STORAGE, not read off the
    // component — the screen is compared to an independent count.
    expect(badge.getAttribute('data-count')).toBe(String(added.size))
    first.unmount()

    // The same match again, on a storage that already holds all of it: nothing
    // is new, so the element must be absent rather than showing a zero.
    //
    // A fresh mount always commits — `committedFor` is a ref on the component
    // instance, so a new one starts unset — which is what makes this the real
    // no-op case rather than a skipped write.
    render(
      <MatchHost content={content} presetId={BUNDLED_PRESET_ID} newSeed={() => 1} storage={storage} initialState={finishedState(1)} />,
    )
    // Diffed across the SECOND commit — `after` is the snapshot the first match
    // left behind. Comparing a fresh read against another fresh read would be
    // true by construction and would hold even if this write had corrupted the
    // store; this asserts that the second match added nothing on top of the
    // first, which is the premise the absence below actually rests on.
    expect(newlyReached(after, loadCollection(storage)).size, 'nothing left to discover').toBe(0)
    expect(screen.queryByTestId('result-new'), 'a match that added nothing shows no line').toBeNull()
  })

  it('credits the winning HUMAN side, through MatchHost’s own humanSides derivation', () => {
    // The `humanSides` expression in MatchHost is the one place this feature's
    // side-gating comes from live app state rather than a test literal, and
    // `observe`'s own tests cannot reach it — they pass the array in. A
    // one-character bug there (crediting the computer's wins) would otherwise
    // pass the whole suite.
    const setup = oneMoveFromResult(1)
    expect(setup, 'a position one legal move from a result must be reachable').not.toBeNull()
    const { before, from, to } = setup as NonNullable<typeof setup>

    // Hot-seat: no `aiSide`, so both sides are people and the winner promotes.
    const hotseat = countingStorage()
    markSeen(hotseat, MATCH_INTRO_SEEN_KEY)
    const view = render(
      <MatchHost content={content} presetId={BUNDLED_PRESET_ID} newSeed={() => 1} storage={hotseat} initialState={before} />,
    )
    fireEvent.click(screen.getByTestId(`sq-${from}`))
    fireEvent.click(screen.getByTestId(`sq-${to}`))
    const won = [...loadCollection(hotseat).won]
    expect(won.length, 'a person won, so something reaches the won tier').toBeGreaterThan(0)
    view.unmount()

    // The same finished match, but the winning side was the computer. Nothing
    // may promote — a child must never be told they won with the computer's card.
    const winner = (() => {
      const s = countingStorage()
      markSeen(s, MATCH_INTRO_SEEN_KEY)
      const v = render(
        <MatchHost content={content} presetId={BUNDLED_PRESET_ID} newSeed={() => 1} storage={s} initialState={before} aiSide={before.sideToMove} />,
      )
      fireEvent.click(screen.getByTestId(`sq-${from}`))
      fireEvent.click(screen.getByTestId(`sq-${to}`))
      const out = [...loadCollection(s).won]
      v.unmount()
      return out
    })()
    expect(winner.length, 'the computer won, so nothing may promote').toBe(0)
  })

  it('forgets the previous match’s discovery count when a new match starts', () => {
    // Three lenses agreed on this one: `startNew` reset a dozen pieces of
    // per-match state and not this, so the NEXT match's result screen painted the
    // last one's number until a passive effect corrected it.
    const storage = countingStorage()
    markSeen(storage, MATCH_INTRO_SEEN_KEY)
    render(
      <MatchHost content={content} presetId={BUNDLED_PRESET_ID} newSeed={() => 1} storage={storage} initialState={finishedState(1)} />,
    )
    expect(screen.queryByTestId('result-new'), 'the first match discovered something').not.toBeNull()
    fireEvent.click(screen.getByTestId('rematch'))
    expect(screen.queryByTestId('result-screen'), 'a fresh deal has no result').toBeNull()
    expect(screen.queryByTestId('result-new'), 'and no count survives into it').toBeNull()
  })

  it('says nothing about discoveries when the write was refused', () => {
    // `saveCollection` swallows failure by design, so a delta computed from the
    // in-memory fold would announce a collection that never grew. `Result` already
    // documents null as "never written"; this is what makes that true for a
    // DENIED write and not only for an absent storage.
    const storage = refusingStorage()
    render(
      <MatchHost content={content} presetId={BUNDLED_PRESET_ID} newSeed={() => 1} storage={storage} initialState={finishedState(1)} />,
    )
    expect(screen.queryByTestId('result-screen'), 'the match still ends').not.toBeNull()
    expect(screen.queryByTestId('result-new'), 'but nothing was persisted, so nothing is claimed').toBeNull()
  })

  it('a refusing storage leaves the result screen rendered and the rematch control operable', () => {
    // AC-007. The whole point is that nothing here can take the app down.
    const storage = refusingStorage()
    expect(() =>
      render(
        <MatchHost content={content} presetId={BUNDLED_PRESET_ID} newSeed={() => 1} storage={storage} initialState={finishedState(1)} />,
      ),
    ).not.toThrow()
    const result = screen.getByTestId('result-screen')
    expect(result).not.toBeNull()
    // And no storage-layer message text reached the screen.
    expect(result.textContent ?? '').not.toMatch(/storage|quota|QuotaExceeded/i)
    const rematch = screen.getByTestId('rematch')
    expect(() => fireEvent.click(rematch)).not.toThrow()
  })
})
