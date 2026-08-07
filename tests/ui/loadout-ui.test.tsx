// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import React from 'react'
import { type CachedGrade, type GradeCache, keyForRecord, memoryCache } from '@balance/cache'
import type { Calibration } from '@balance/predict'
import type { GradeClient } from '@balance/grade-client'
import { GRADE_SEEDS } from '@balance/measure'
import { type ContentSource, loadContentSet } from '@content/load'
import { BUNDLED_PRESET_ID, bundledContentSource } from '@content/sets/bundled'
import { Lobby } from '../../src/ui/Lobby'
import { RoomDetail } from '../../src/ui/RoomDetail'

/**
 * PLAN Phase 6 — the UI half, and specifically the wiring.
 *
 * The review's standing finding about this feature was that the grade-dependent
 * gate had no caller: `checkLoadoutGrades` existed, was tested, and nothing on
 * the match-start path invoked it. A room could be played with a loadout whose
 * grades were never checked. These tests exist to make that statement false and
 * to keep it false — every one of them drives a real screen rather than the
 * function underneath it.
 */

afterEach(cleanup)

const OWN_CARD = 'skill.probe-own'
/** A piece the shipped grade table cannot know, because the author just made it. */
const OWN_PIECE = 'piece.probe-own'

/** The shipped document plus one card the room does NOT deal, so a side can own it. */
function documentWithOwnCard(): ContentSource {
  const source = structuredClone(bundledContentSource) as ContentSource
  ;(source.skillCards as unknown[]).push({
    id: OWN_CARD,
    nameKey: 'skill.probe-own.name',
    textKey: 'skill.probe-own.text',
    uses: 1,
    effects: [
      { trigger: 'on_play', condition: { kind: 'always' }, actions: [{ kind: 'destroy_piece', target: { kind: 'chosen_enemy' } }] },
    ],
  })
  ;(source.pieces as unknown[]).push({
    id: OWN_PIECE,
    nameKey: 'piece.probe-own.name',
    textKey: 'piece.probe-own.text',
    movement: [{ kind: 'step', vectors: [[0, 1], [1, 0], [-1, 0], [0, -1]] }],
    effects: [],
  })
  return source
}

function withLoadout(pieceId: string, replaces: string): ContentSource {
  const source = documentWithOwnCard()
  const preset = source.presets.find((p) => (p as { id: string }).id === BUNDLED_PRESET_ID) as Record<string, unknown>
  preset.loadout = { white: { pieceId, replaces, skillCardId: OWN_CARD } }
  return source
}

/** A cache pre-loaded with the grades a test wants the screen to read. */
function cacheWith(source: ContentSource, deltas: Record<string, number>): GradeCache {
  const loaded = loadContentSet(source)
  if (!loaded.ok) throw new Error(`fixture must load: ${JSON.stringify(loaded.errors.slice(0, 3))}`)
  const preset = loaded.set.presets.get(BUNDLED_PRESET_ID)!
  const context = {
    presetId: BUNDLED_PRESET_ID,
    referencePieceId: preset.grading!.referencePieceId,
    referenceSkillCardId: preset.grading!.referenceSkillCardId,
    seeds: GRADE_SEEDS,
  }
  const cache = memoryCache()
  for (const [id, delta] of Object.entries(deltas)) {
    const key = keyForRecord(loaded.set, id, context)
    if (key === undefined) throw new Error(`no record ${id} to grade`)
    const grade: CachedGrade = { contentId: id, delta, stderr: 1, n: GRADE_SEEDS, everChanged: true }
    cache.write(key, grade)
  }
  return cache
}

function mountLobby(source: ContentSource) {
  const loaded = loadContentSet(source)
  if (!loaded.ok) throw new Error(`fixture must load: ${JSON.stringify(loaded.errors.slice(0, 3))}`)
  const started: string[] = []
  render(
    React.createElement(Lobby, {
      source,
      content: loaded.set,
      presetId: BUNDLED_PRESET_ID,
      names: { white: '흰', black: '검' },
      onNamesChange: () => {},
      onImport: () => {},
      onStart: () => started.push('started'),
      onBack: () => {},
    }),
  )
  return started
}

describe('PLAN Phase 6 — the match-start path actually consults the grades', () => {
  it('starts normally for a room with no loadout — the common case', () => {
    const started = mountLobby(bundledContentSource)
    expect(screen.queryByTestId('lobby-loadout-blocked')).toBeNull()
    const start = screen.getByTestId('lobby-start') as HTMLButtonElement
    expect(start.disabled).toBe(false)
    fireEvent.click(start)
    expect(started).toEqual(['started'])
  })

  it('refuses to start when the loadout records have never been graded', () => {
    // The absent case, and the one the whole gate exists for: an ungraded record
    // must block the match rather than be scored as harmless.
    const started = mountLobby(withLoadout('piece.archer', 'piece.knight'))
    expect(screen.getByTestId('lobby-loadout-blocked').textContent).toMatch(/세는 중/)
    expect((screen.getByTestId('lobby-start') as HTMLButtonElement).disabled).toBe(true)
    expect(started).toEqual([])
  })
})

describe('PLAN Phase 6 — the room screen offers a loadout and prices it', () => {
  function mountRoom(source: ContentSource, cache: GradeCache) {
    let committed: ContentSource | null = null
    render(
      React.createElement(RoomDetail, {
        source,
        roomId: BUNDLED_PRESET_ID,
        commit: (next: ContentSource) => {
          committed = next
        },
        onBack: () => {},
        onCreateRecord: () => {},
        gradeCache: cache,
      }),
    )
    fireEvent.click(screen.getByTestId('room-step-cards'))
    return () => committed
  }

  it('shows a grade for a record the cache has measured, and the budget it spends', async () => {
    const source = documentWithOwnCard()
    const cache = cacheWith(source, { 'piece.knight': 5, [OWN_CARD]: 1 })
    mountRoom(source, cache)

    fireEvent.change(screen.getByTestId('loadout-piece'), { target: { value: 'piece.knight' } })
    fireEvent.change(screen.getByTestId('loadout-replaces'), { target: { value: 'piece.knight' } })
    fireEvent.change(screen.getByTestId('loadout-skill'), { target: { value: OWN_CARD } })

    await waitFor(() => {
      // knight measures 5 → band 1 at width 6 → cost 6; the card measures 1 → band 0 → cost 0.
      expect(screen.getByTestId('loadout-budget').textContent).toContain('6 / 18')
    })
    expect(screen.queryByTestId('loadout-mismatch')).toBeNull()
  })

  it('names a cross-band replacement before the save, not after it', async () => {
    const source = documentWithOwnCard()
    // The archer measures far above the pawn, so standing in for a pawn is the
    // exact swap ADR-008 exists to refuse.
    const cache = cacheWith(source, { 'piece.archer': 20, 'piece.pawn': 0, [OWN_CARD]: 0 })
    mountRoom(source, cache)

    fireEvent.change(screen.getByTestId('loadout-piece'), { target: { value: 'piece.archer' } })
    fireEvent.change(screen.getByTestId('loadout-replaces'), { target: { value: 'piece.pawn' } })
    fireEvent.change(screen.getByTestId('loadout-skill'), { target: { value: OWN_CARD } })

    await waitFor(() => expect(screen.getByTestId('loadout-mismatch')).toBeTruthy())
  })

  it('says a grade is still being measured rather than showing it as zero', () => {
    // Targets the record the author just made: the bundled ones answer from the
    // shipped table, and a test that could not tell those two apart would pass
    // whether or not the unmeasured case worked.
    const source = documentWithOwnCard()
    mountRoom(source, memoryCache())
    const options = screen.getByTestId('loadout-piece').textContent ?? ''
    expect(options, 'the authored piece should still be measuring').toContain('세는 중')
    expect(options).not.toContain(`${OWN_PIECE} — 세기 0`)
  })

  it('answers instantly for a bundled record, from the shipped table', () => {
    // The reason the table exists: a fresh install must not spend 24,000
    // self-play matches rediscovering a constant before it can say anything.
    const source = documentWithOwnCard()
    mountRoom(source, memoryCache())
    const options = [...screen.getByTestId('loadout-piece').querySelectorAll('option')]
    const queen = options.find((o) => o.getAttribute('value') === 'piece.queen')!
    expect(queen.textContent).toMatch(/세기 \d/)
    expect(queen.textContent).not.toContain('세는 중')
  })

  it('states the limit of what a grade measures', () => {
    const source = documentWithOwnCard()
    mountRoom(source, memoryCache())
    // ADR-006 accepted that grades miss skill-dependent power; the UI has to say
    // so rather than let the word "grade" imply more than was measured.
    expect(screen.getByTestId('loadout-caveat').textContent).toMatch(/아무렇게나|사람이 잘 쓰면/)
  })

  it('never offers a card the room already deals — a shared card cannot be one side’s own', () => {
    const source = documentWithOwnCard()
    mountRoom(source, memoryCache())
    const options = [...screen.getByTestId('loadout-skill').querySelectorAll('option')].map((o) => o.getAttribute('value'))
    expect(options).toContain(OWN_CARD)
    expect(options).not.toContain('skill.volley')
  })

  it('never offers a royal piece — replacing one would move the losing condition', () => {
    const source = documentWithOwnCard()
    mountRoom(source, memoryCache())
    for (const testid of ['loadout-piece', 'loadout-replaces']) {
      const options = [...screen.getByTestId(testid).querySelectorAll('option')].map((o) => o.getAttribute('value'))
      expect(options, testid).not.toContain('piece.king')
    }
  })
})

describe('PLAN Phase 6 — the provisional grade, and the gate in front of it', () => {
  function mountRoom(source: ContentSource, cache: GradeCache, calibration?: Calibration | null) {
    render(
      React.createElement(RoomDetail, {
        source,
        roomId: BUNDLED_PRESET_ID,
        commit: () => {},
        onBack: () => {},
        onCreateRecord: () => {},
        gradeCache: cache,
        ...(calibration === undefined ? {} : { gradeCalibration: calibration }),
      }),
    )
    fireEvent.click(screen.getByTestId('room-step-cards'))
  }

  /** A fit that HAS earned its display, so the path can be exercised. */
  const usableFit: Calibration = {
    // Predicts straight from the mobility feature, which is enough for a display test.
    predictor: { coefficients: [0, 0.05, 0, 0], actionKinds: [], samples: 12 },
    accuracy: 0.75,
    baseline: 0.4,
    usable: true,
  }

  it('shows an estimate, marked as one, when the fit has earned it', () => {
    mountRoom(documentWithOwnCard(), memoryCache(), usableFit)
    const own = [...screen.getByTestId('loadout-piece').querySelectorAll('option')].find(
      (o) => o.getAttribute('value') === OWN_PIECE,
    )!
    expect(own.textContent).toContain('예상')
    expect(own.textContent).not.toContain('세는 중')
  })

  it('shows the wait instead when the fit has not earned it', () => {
    // The production case as of today: the fit does not beat "always answer
    // zero" out of sample, so no estimate is offered at all.
    mountRoom(documentWithOwnCard(), memoryCache(), { ...usableFit, usable: false })
    const own = [...screen.getByTestId('loadout-piece').querySelectorAll('option')].find(
      (o) => o.getAttribute('value') === OWN_PIECE,
    )!
    expect(own.textContent).toContain('세는 중')
    expect(own.textContent).not.toContain('예상')
  })

  it('never charges the budget for an estimate', () => {
    // An estimate may inform a choice; it may not be spent. The budget reads `?`
    // until both halves are really measured, because `checkLoadoutGrades` will
    // refuse an ungraded record however confident the picker looked.
    mountRoom(documentWithOwnCard(), memoryCache(), usableFit)
    fireEvent.change(screen.getByTestId('loadout-piece'), { target: { value: 'piece.knight' } })
    fireEvent.change(screen.getByTestId('loadout-replaces'), { target: { value: 'piece.knight' } })
    fireEvent.change(screen.getByTestId('loadout-skill'), { target: { value: OWN_CARD } })
    expect(screen.getByTestId('loadout-budget').textContent).toContain('?')
  })
})

describe('PLAN Phase 6 — opening a room does not re-measure what already shipped', () => {
  it('queues a job only for the records the author made', async () => {
    // The cost this table exists to remove. Before it, opening the bundled room
    // fired twenty measurements — five pieces and fifteen cards — of which none
    // were new, and the picker read "세는 중…" for the better part of a minute
    // on every fresh install.
    const asked: string[] = []
    const client: GradeClient = {
      measure: (_source, _baseline, contentId) => {
        asked.push(contentId)
        return Promise.resolve({ requestId: 'test', ok: false, reason: 'not measured in this test' })
      },
      dispose: () => {},
    }
    render(
      React.createElement(RoomDetail, {
        source: documentWithOwnCard(),
        roomId: BUNDLED_PRESET_ID,
        commit: () => {},
        onBack: () => {},
        onCreateRecord: () => {},
        gradeClient: client,
        gradeCache: memoryCache(),
      }),
    )
    fireEvent.click(screen.getByTestId('room-step-cards'))
    await waitFor(() => expect(asked.length).toBeGreaterThan(0))

    // Only the authored card is unknown; every bundled record answered from the
    // shipped table without a job.
    expect([...new Set(asked)].sort()).toEqual([OWN_CARD])
  })
})

describe('PLAN Phase 6 — the room that has no card left to own', () => {
  /**
   * The state every other test in this file made unreachable.
   *
   * Each of them adds a card of its own to the fixture first, so the shared pool
   * always had something outside it. The SHIPPED room deals all fifteen cards,
   * and a card the room deals cannot also be one side's own — so a child opening
   * the default room found a picker they could not complete and nothing saying
   * why. Found by running the app, not by the suite.
   */
  it('explains the empty list instead of offering a dropdown that cannot be completed', () => {
    render(
      React.createElement(RoomDetail, {
        // The shipped document, unmodified — no probe card added.
        source: bundledContentSource,
        roomId: BUNDLED_PRESET_ID,
        commit: () => {},
        onBack: () => {},
        onCreateRecord: () => {},
        gradeCache: memoryCache(),
      }),
    )
    fireEvent.click(screen.getByTestId('room-step-cards'))

    const options = [...screen.getByTestId('loadout-skill').querySelectorAll('option')]
    expect(options, 'the shipped room deals every card, so none is ownable').toHaveLength(1)
    expect(screen.getByTestId('loadout-no-cards').textContent).toMatch(/새 스킬 카드를 만들거나/)
  })

  it('drops the explanation once a card is outside the shared pool', () => {
    render(
      React.createElement(RoomDetail, {
        source: documentWithOwnCard(),
        roomId: BUNDLED_PRESET_ID,
        commit: () => {},
        onBack: () => {},
        onCreateRecord: () => {},
        gradeCache: memoryCache(),
      }),
    )
    fireEvent.click(screen.getByTestId('room-step-cards'))
    expect(screen.queryByTestId('loadout-no-cards')).toBeNull()
  })
})
